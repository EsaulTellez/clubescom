"use server";

import { revalidatePath } from "next/cache";
import { audit, getSession, type Role } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FormState = { error?: string; ok?: string };

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
  if (!UUID.test(id) || (banned !== "true" && banned !== "false")) {
    return { error: "No se pudo actualizar el veto." };
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
  await audit(
    actor.id,
    next ? "vetar" : "habilitar",
    "users",
    id,
    `${row.name}: ${next ? "vetado" : "habilitado"}`,
  );
  revalidatePath("/admin");
  return { ok: next ? "Usuario vetado." : "Veto retirado." };
}

export async function setRole(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await adminUser();
  if (!actor) return { error: "Solo una cuenta de administración puede cambiar roles." };

  const id = String(form.get("user_id") ?? "");
  const role = String(form.get("role") ?? "");
  const area = String(form.get("area") ?? "").trim();
  if (!UUID.test(id) || !isRole(role)) return { error: "Elige un rol válido." };
  if (role === "moderador" && (area.length < 2 || area.length > 80)) {
    return { error: "Indica el área del moderador (entre 2 y 80 caracteres)." };
  }

  const nextArea = role === "moderador" ? area : null;
  const current = await pool.query<{ name: string; role: Role; area: string | null }>(
    "select name, role, area from users where id = $1",
    [id],
  );
  const row = current.rows[0];
  if (!row) return { error: "Usuario no encontrado." };
  if (row.role === role && (row.area ?? null) === nextArea) return { ok: "Sin cambios." };

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
