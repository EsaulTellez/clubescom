"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";

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

function canPublishEvents(user: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  return user.role === "admin" || (
    user.role === "moderador" &&
    (user.area === "comunicacion" || user.area === "clubes_academicos")
  );
}

export async function saveCubicle(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user || user.role !== "profesor") {
    return { error: "Solo un profesor puede registrar su cubículo." };
  }

  const label = text(form, "label");
  const building = text(form, "building");
  const floor = text(form, "floor");
  const x = coord(text(form, "x"));
  const y = coord(text(form, "y"));

  if (label.length < 2 || label.length > 80 || building.length < 2 || building.length > 80) {
    return { error: "Escribe la etiqueta y el edificio (entre 2 y 80 caracteres)." };
  }
  if (floor.length > 20) return { error: "El piso es demasiado largo." };
  if (x === null || y === null) {
    return { error: "X y Y deben ser números entre 0 y 100." };
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const updated = await client.query(
      `update cubicles
       set label = $2, building = $3, floor = $4, x = $5, y = $6
       where professor_id = $1`,
      [user.id, label, building, floor || null, x, y],
    );
    if (!updated.rowCount) {
      await client.query(
        `insert into cubicles (professor_id, label, building, floor, x, y)
         values ($1, $2, $3, $4, $5, $6)`,
        [user.id, label, building, floor || null, x, y],
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
  if (!user || !canPublishEvents(user)) {
    return { error: "Solo el moderador correspondiente o el administrador general puede publicar un evento autorizado." };
  }

  const spaceId = text(form, "space_id");
  const title = text(form, "title");
  const description = text(form, "description");
  const starts = parseWhen(text(form, "starts_at"));
  const endsValue = text(form, "ends_at");
  const ends = endsValue ? parseWhen(endsValue) : null;

  if (!UUID.test(spaceId)) return { error: "Elige un espacio." };
  if (title.length < 3 || title.length > 160) return { error: "El título debe tener entre 3 y 160 caracteres." };
  if (description.length > 2000) return { error: "La descripción no debe superar los 2,000 caracteres." };
  if (!starts || (endsValue && !ends) || (starts && ends && ends <= starts)) {
    return { error: "Revisa la fecha y la hora de fin del evento." };
  }

  const inserted = await pool.query(
    `insert into space_events
       (space_id, title, description, starts_at, ends_at, created_by, approval_status, authorized_by)
     values ($1, $2, $3, $4, $5, $6, 'aprobado', $6)
     returning id`,
    [spaceId, title, description, starts, ends, user.id],
  );
  revalidatePath("/eventos");
  revalidatePath("/mapa");
  return { ok: inserted.rowCount ? "Evento autorizado publicado en el itinerario." : "No se pudo publicar el evento." };
}

export async function deleteSpaceEvent(form: FormData) {
  const user = await getSession();
  const id = text(form, "id");
  if (!user || !canPublishEvents(user) || !UUID.test(id)) return;
  await pool.query("delete from space_events where id = $1", [id]);
  revalidatePath("/eventos");
  revalidatePath("/mapa");
}
