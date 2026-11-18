"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { isStaffArea } from "@/lib/areas";
import { audit, getSession, type Role } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FormState = { error?: string; ok?: string };

export type RosterImportState = {
  error?: string;
  created?: number;
  rows?: { row: number; email: string; status: "creada" | "error"; detail: string }[];
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ROLES: Role[] = ["alumno", "profesor", "moderador", "admin"];

function isRole(value: string): value is Role {
  return (ROLES as string[]).includes(value);
}

async function adminUser() {
  const user = await getSession();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function setBanned(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await adminUser();
  if (!actor) return { error: "Solo una cuenta de administración puede vetar." };

  const id = String(form.get("user_id") ?? "");
  const banned = String(form.get("banned") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!UUID.test(id) || (banned !== "true" && banned !== "false")) {
    return { error: "No se pudo actualizar el veto." };
  }
  if (reason.length < 10 || reason.length > 500) {
    return { error: "Escribe un motivo obligatorio de entre 10 y 500 caracteres." };
  }
  const next = banned === "true";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_set_user_banned", {
    p_user_id: id,
    p_banned: next,
  });
  if (error) return { error: error.message.includes("Solo administración") ? error.message : "No se pudo actualizar el veto." };
  const row = data?.[0];
  if (!row) return { error: "Usuario no encontrado." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (url && secret) {
    try {
      const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
      await admin.auth.admin.updateUserById(id, {
        ban_duration: next ? "87600h" : "none",
      });
    } catch {
      // Best-effort revocation in Supabase Auth alongside DB ban flag
    }
  }

  await audit(
    actor.id,
    next ? "vetar" : "habilitar",
    "users",
    id,
    `${row.name}: ${next ? "vetado" : "habilitado"} · Motivo: ${reason}`,
  );
  revalidatePath("/admin");
  return { ok: next ? "Usuario vetado y sesión revocada." : "Veto retirado." };
}

export async function setRole(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await adminUser();
  if (!actor?.isSuperadmin) return { error: "Solo superadministración puede cambiar roles." };

  const id = String(form.get("user_id") ?? "");
  const role = String(form.get("role") ?? "");
  const area = String(form.get("area") ?? "").trim().toLowerCase();
  if (!UUID.test(id) || !isRole(role)) return { error: "Elige un rol válido." };
  if (role === "moderador" && !isStaffArea(area)) {
    return { error: "Selecciona un área institucional válida para el moderador." };
  }

  const nextArea = role === "moderador" ? area : null;
  const current = await pool.query<{ name: string; role: Role; area: string | null; can_switch_profile: boolean }>(
    "select name, role, area, can_switch_profile from users where id = $1",
    [id],
  );
  const row = current.rows[0];
  if (!row) return { error: "Usuario no encontrado." };
  if (!row.can_switch_profile && row.role === role && (row.area ?? null) === nextArea) return { ok: "Sin cambios." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_user_role", {
    p_user_id: id,
    p_role: role,
    p_area: nextArea,
  });
  if (error) return { error: error.message.includes("Solo administración") ? error.message : "No se pudo actualizar el rol." };
  await audit(
    actor.id,
    "cambiar_rol",
    "users",
    id,
    `${row.name}: ${row.role} → ${role}${nextArea ? ` · ${nextArea}` : ""}`,
  );
  revalidatePath("/admin");
  return { ok: "Rol actualizado." };
}

type RosterRow = { row: number; name: string; email: string };

const EMAIL = /^[^\s@,;]+@(?:alumno\.)?ipn\.mx$/i;
const MAX_IMPORT_ROWS = 200;

export async function importRoster(_prev: RosterImportState, form: FormData): Promise<RosterImportState> {
  const actor = await getSession();
  if (!actor || actor.role !== "admin") return { error: "Solo administración general puede importar cuentas." };

  const raw = String(form.get("rows") ?? "");
  if (raw.length > 120_000) return { error: "El archivo excede el tamaño permitido para la importación." };
  let rows: RosterRow[];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_IMPORT_ROWS) {
      return { error: `Incluye de 1 a ${MAX_IMPORT_ROWS} filas válidas.` };
    }
    rows = parsed.map((value, index) => {
      if (!value || typeof value !== "object") throw new Error("Fila inválida.");
      const item = value as Record<string, unknown>;
      if (typeof item.name !== "string" || typeof item.email !== "string") throw new Error("Fila inválida.");
      const name = item.name.trim().replace(/\s+/g, " ");
      const email = item.email.trim().toLowerCase();
      if (name.length < 2 || name.length > 120 || /[<>\u0000-\u001f]/.test(name)) throw new Error(`Nombre inválido en la fila ${index + 1}.`);
      if (!EMAIL.test(email)) throw new Error(`Correo institucional inválido en la fila ${index + 1}.`);
      return { row: Number.isInteger(item.row) ? Number(item.row) : index + 2, name, email };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo leer la vista previa." };
  }

  const seen = new Set<string>();
  const repeated = rows.find((row) => seen.has(row.email) || !seen.add(row.email));
  if (repeated) return { error: `El correo ${repeated.email} aparece más de una vez. Corrige el CSV antes de confirmar.` };

  const supabase = await createSupabaseServerClient();
  const { data: people, error: peopleError } = await supabase.rpc("admin_list_user_profiles");
  if (peopleError) return { error: "No se pudo consultar el directorio para detectar cuentas existentes." };
  const existingPeople = (people ?? []) as { email: string }[];
  const existing = new Set(existingPeople.map((person) => String(person.email).toLowerCase()));
  const duplicates = rows.filter((row) => existing.has(row.email));
  if (duplicates.length) {
    return {
      error: "El CSV contiene correos que ya tienen cuenta. Descarga el archivo de errores, retíralos y vuelve a previsualizar.",
      rows: duplicates.map((row) => ({ row: row.row, email: row.email, status: "error", detail: "La cuenta ya existe; la importación crea cuentas nuevas." })),
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return { error: "Falta la clave privada local de Supabase para crear invitaciones." };
  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const redirectTo = new URL("/auth/callback", process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3001").toString();
  const resultRows: NonNullable<RosterImportState["rows"]> = [];
  let created = 0;
  for (const row of rows) {
    const { error } = await admin.auth.admin.inviteUserByEmail(row.email, {
      data: { name: row.name },
      redirectTo,
    });
    if (error) {
      resultRows.push({ row: row.row, email: row.email, status: "error", detail: "Supabase no pudo crear la invitación. Confirma que el correo no se haya creado parcialmente y vuelve a intentar." });
      continue;
    }
    created += 1;
    resultRows.push({ row: row.row, email: row.email, status: "creada", detail: "Invitación enviada; la cuenta se activa al verificar su correo." });
  }
  await audit(actor.id, "importar_padron", "auth.users", undefined, `${created} invitaciones creadas de ${rows.length} filas`);
  revalidatePath("/admin");
  return { created, rows: resultRows };
}

export async function updateSystemSettings(form: FormData) {
  const actor = await adminUser();
  if (!actor) return;
  const threshold = Number.parseInt(String(form.get("club_interest_threshold") ?? "20"), 10);
  const cooldown = Number.parseInt(String(form.get("forum_cooldown_minutes") ?? "20"), 10);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) return;
  if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 120) return;

  await pool.query(
    `insert into system_settings (key, value_int, label, updated_at)
     values
       ('club_interest_threshold', $1, 'Umbral de interesados para promover una propuesta de club', now()),
       ('forum_cooldown_minutes', $2, 'Minutos de enfriamiento entre preguntas del foro por usuario', now())
     on conflict (key) do update set value_int = excluded.value_int, updated_at = now()`,
    [threshold, cooldown],
  );
  await audit(actor.id, "configurar_parametros", "system_settings", undefined, `umbral=${threshold}, cooldown=${cooldown}m`);
  revalidatePath("/admin");
}

export async function resolvePrivacyRequest(form: FormData) {
  const actor = await adminUser();
  if (!actor) return;
  const id = String(form.get("request_id") ?? "");
  const status = String(form.get("status") ?? "");
  const note = String(form.get("resolution_note") ?? "").trim().slice(0, 1000);
  if (!UUID.test(id) || !["resuelta", "rechazada"].includes(status)) return;

  const updated = await pool.query<{ user_id: string }>(
    `update privacy_requests
        set status = $1,
            resolution_note = $2,
            resolved_by = $3,
            resolved_at = now()
      where id = $4 returning user_id`,
    [status, note || null, actor.id, id],
  );
  if (updated.rows[0]?.user_id) {
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("notify_user_event", {
      p_user_id: updated.rows[0].user_id,
      p_category: "sistema",
      p_title: `Solicitud ARCO ${status}`,
      p_body: note || "Tu solicitud de privacidad fue atendida por Administración.",
      p_href: "/perfil",
    });
  }
  await audit(actor.id, `arco_${status}`, "privacy_requests", id, note || undefined);
  revalidatePath("/admin");
}
