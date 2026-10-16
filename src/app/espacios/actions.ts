"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";

type FormState = { error?: string; ok?: string };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [user.id]);
    const updated = await client.query<{ id: string }>(
      `update cubicles
       set label = $2, building = $3, floor = $4, x = $5, y = $6
       where professor_id = $1
       returning id`,
      [user.id, label, building, floor || null, x, y],
    );
    if (!updated.rowCount) {
      await client.query(
        `insert into cubicles (professor_id, label, building, floor, x, y)
         values ($1, $2, $3, $4, $5, $6)`,
        [user.id, label, building, floor || null, x, y],
      );
    } else if (updated.rows.length > 1) {
      await client.query(
        `delete from cubicles where professor_id = $1 and id <> $2`,
        [user.id, updated.rows[0].id],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  revalidatePath("/espacios");
  return { ok: "Cubículo guardado." };
}

export async function addBooking(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "moderador")) {
    return { error: "Solo administración o moderación puede registrar reservas." };
  }

  const spaceId = text(form, "space_id");
  const title = text(form, "title");
  const starts = parseWhen(text(form, "starts_at"));
  const ends = parseWhen(text(form, "ends_at"));
  const isPublic = form.get("is_public") === "on";

  if (!UUID.test(spaceId)) return { error: "Elige un espacio." };
  if (title.length < 3 || title.length > 160) {
    return { error: "El título debe tener entre 3 y 160 caracteres." };
  }
  if (!starts || !ends || ends <= starts) {
    return { error: "La hora de fin debe ser posterior al inicio." };
  }

  const space = await pool.query("select id from spaces where id = $1", [spaceId]);
  if (!space.rowCount) return { error: "Ese espacio no existe." };

  await pool.query(
    `insert into bookings (space_id, title, starts_at, ends_at, is_public, created_by)
     values ($1, $2, $3, $4, $5, $6)`,
    [spaceId, title, starts, ends, isPublic, user.id],
  );
  revalidatePath("/espacios");
  return { ok: isPublic ? "Reserva pública agregada al itinerario." : "Reserva guardada. No aparece en el itinerario porque no es pública." };
}
