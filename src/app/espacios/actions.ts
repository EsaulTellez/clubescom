"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { uploadPublicImage } from "@/lib/storage";
import { canManageSpaceByName } from "./shared";

type FormState = { error?: string; ok?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function coord(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) return null;
  return number;
}

function parseWhen(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00-06:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function saveCubicle(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user || user.role !== "profesor") {
    return { error: "Solo un profesor puede registrar su cubículo." };
  }

  const label = text(form, "label");
  const building = text(form, "building");
  const floor = text(form, "floor");
  const roomCodeRaw = text(form, "room_code");
  const x = coord(text(form, "x"));
  const y = coord(text(form, "y"));

  if (label.length < 2 || label.length > 80 || building.length < 2 || building.length > 80) {
    return { error: "Escribe la etiqueta y el edificio (entre 2 y 80 caracteres)." };
  }
  if (floor.length > 20) return { error: "El piso es demasiado largo." };
  if (
    roomCodeRaw &&
    !/^G[0-1][0-9]{2}$/.test(roomCodeRaw) &&
    (!/^[1-4][0-2](0[1-9]|1[0-3])$/.test(roomCodeRaw) ||
      (Number(roomCodeRaw[0]) >= 3 && Number(roomCodeRaw.slice(2)) < 4))
  ) {
    return { error: "El código de espacio en el mapa no es válido." };
  }
  const roomCode = roomCodeRaw || null;
  if (x === null || y === null) {
    return { error: "X y Y deben ser números entre 0 y 100." };
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const updated = await client.query(
      `update cubicles
       set label = $2, building = $3, floor = $4, x = $5, y = $6, room_code = $7
       where professor_id = $1`,
      [user.id, label, building, floor || null, x, y, roomCode],
    );
    if (!updated.rowCount) {
      await client.query(
        `insert into cubicles (professor_id, label, building, floor, x, y, room_code)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [user.id, label, building, floor || null, x, y, roomCode],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "23505") return { error: "Ese cubículo ya está registrado para otra persona." };
    throw error;
  } finally {
    client.release();
  }

  revalidatePath("/eventos");
  revalidatePath("/mapa");
  return { ok: "Cubículo guardado." };
}

export async function addSpaceEvent(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user) {
    return { error: "Inicia sesión para registrar o solicitar un evento en el itinerario." };
  }

  const spaceId = text(form, "space_id");
  const title = text(form, "title");
  const description = text(form, "description");
  const speaker = text(form, "speaker");
  const isPublic = form.has("is_public_field") ? form.get("is_public") === "on" : true;
  const starts = parseWhen(text(form, "starts_at"));
  const endsValue = text(form, "ends_at");
  const ends = endsValue ? parseWhen(endsValue) : null;

  if (!UUID.test(spaceId)) return { error: "Elige un espacio." };
  if (title.length < 3 || title.length > 160) return { error: "El título debe tener entre 3 y 160 caracteres." };
  if (description.length > 2000) return { error: "La descripción no debe superar los 2,000 caracteres." };
  if (speaker.length > 160) return { error: "El nombre del ponente es demasiado largo." };
  if (!starts || (endsValue && !ends) || (starts && ends && ends <= starts)) {
    return { error: "Revisa la fecha y la hora de fin del evento." };
  }

  const spaceRow = await pool.query<{ name: string }>("select name from spaces where id = $1", [spaceId]);
  if (!spaceRow.rowCount) return { error: "El espacio seleccionado no existe." };
  const spaceName = spaceRow.rows[0].name;
  if (/auditorio|sala\s*14/i.test(spaceName) && speaker.length < 2) {
    return { error: "Para eventos en Auditorio o Sala 14 indica el nombre del ponente." };
  }

  const uploaded = await uploadPublicImage(user.id, "space-events", form.get("image"));
  if ("error" in uploaded) return { error: uploaded.error };

  const isStaffPublisher = canManageSpaceByName(user, spaceName);
  const status = isStaffPublisher ? "aprobado" : "pendiente";
  const authorizedBy = isStaffPublisher ? user.id : null;

  const inserted = await pool.query(
    `insert into space_events
       (space_id, title, description, speaker, is_public, starts_at, ends_at, created_by, approval_status, authorized_by, image_url)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning id`,
    [spaceId, title, description, speaker || null, isPublic, starts, ends, user.id, status, authorizedBy, uploaded.url],
  );
  revalidatePath("/");
  revalidatePath("/eventos");
  revalidatePath("/mapa");
  return {
    ok: inserted.rowCount
      ? isStaffPublisher
        ? "Evento autorizado publicado en el itinerario."
        : "Solicitud enviada a revisión institucional; aparecerá en la cartelera cuando sea aprobada."
      : "No se pudo registrar el evento.",
  };
}

export async function reviewSpaceEvent(form: FormData) {
  const user = await getSession();
  const id = text(form, "id");
  const decision = text(form, "decision");
  if (!user || !UUID.test(id) || !["aprobado", "rechazado"].includes(decision)) return;
  const ev = await pool.query<{ space_name: string }>(
    `select s.name as space_name from space_events e join spaces s on s.id = e.space_id where e.id = $1`,
    [id],
  );
  const spaceName = ev.rows[0]?.space_name;
  if (!spaceName || !canManageSpaceByName(user, spaceName)) return;
  await pool.query(
    `update space_events
        set approval_status = $1,
            authorized_by = case when $1 = 'aprobado' then $2::uuid else null end
      where id = $3`,
    [decision, user.id, id],
  );
  revalidatePath("/");
  revalidatePath("/eventos");
  revalidatePath("/mapa");
}

export async function deleteSpaceEvent(form: FormData) {
  const user = await getSession();
  const id = text(form, "id");
  if (!user || !UUID.test(id)) return;
  const ev = await pool.query<{ space_name: string }>(
    `select s.name as space_name from space_events e join spaces s on s.id = e.space_id where e.id = $1`,
    [id],
  );
  const spaceName = ev.rows[0]?.space_name;
  if (!spaceName || !canManageSpaceByName(user, spaceName)) return;
  await pool.query("delete from space_events where id = $1", [id]);
  revalidatePath("/");
  revalidatePath("/eventos");
  revalidatePath("/mapa");
}
