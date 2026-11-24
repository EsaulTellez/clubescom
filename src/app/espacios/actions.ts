"use server";

import { revalidatePath } from "next/cache";
import { audit, getSession } from "@/lib/auth";
import { parseMxLocalDate } from "@/lib/datetime";
import { pool } from "@/lib/db";
import { resolveUploadedPublicImage } from "@/lib/resolve-upload";
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

export async function saveCubicle(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user || user.role !== "profesor") {
    return { error: "Solo un profesor puede registrar su cubículo." };
  }

  const roomCodeRaw = text(form, "room_code").toUpperCase();
  if (
    roomCodeRaw &&
    !/^G[01]0[0-9]$/.test(roomCodeRaw) &&
    (!/^[1-4][0-2](0[1-9]|1[0-3])$/.test(roomCodeRaw) ||
      (Number(roomCodeRaw[0]) >= 3 && Number(roomCodeRaw.slice(2)) < 4))
  ) {
    return { error: "El código de espacio en el mapa no es válido." };
  }
  const roomCode = roomCodeRaw || null;

  const derivedBuilding = roomCode
    ? roomCode.startsWith("G")
      ? "Edificio de Gobierno"
      : `Edificio ${roomCode[0]}`
    : "";
  const derivedFloor = roomCode
    ? roomCode[1] === "0"
      ? "Planta baja"
      : `Piso ${roomCode[1]}`
    : "";

  const label = text(form, "label") || (roomCode ? `Cubículo ${roomCode}` : "");
  const building = text(form, "building") || derivedBuilding;
  const floor = text(form, "floor") || derivedFloor;
  const xRaw = text(form, "x");
  const yRaw = text(form, "y");
  const x = xRaw ? coord(xRaw) : 50;
  const y = yRaw ? coord(yRaw) : 50;

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
    if (roomCode) {
      // Usa la RPC SECURITY DEFINER para crear/vincular map_rooms y map_room_professors sin violar RLS
      await client.query("select public.assign_my_map_room($1, $2)", [roomCode, label]);
      await client.query(
        `update cubicles
            set label = $2, building = $3, floor = $4, x = $5, y = $6, room_code = $7
          where professor_id = $1`,
        [user.id, label, building, floor || null, x, y, roomCode],
      );
      await client.query(
        "delete from map_room_suggestions where room_code = $1 and professor_id = $2",
        [roomCode, user.id],
      );
    } else {
      const updated = await client.query(
        `update cubicles
            set label = $2, building = $3, floor = $4, x = $5, y = $6, room_code = null
          where professor_id = $1`,
        [user.id, label, building, floor || null, x, y],
      );
      if (!updated.rowCount) {
        await client.query(
          `insert into cubicles (professor_id, label, building, floor, x, y, room_code)
           values ($1, $2, $3, $4, $5, $6, null)`,
          [user.id, label, building, floor || null, x, y],
        );
      }
      await client.query(`delete from map_room_professors where professor_id = $1`, [user.id]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "23505") return { error: "Ese cubículo ya está registrado para otra persona." };
    return { error: "No se pudo guardar tu cubículo. Inténtalo de nuevo." };
  } finally {
    client.release();
  }

  await audit(user.id, "guardar_cubiculo", "cubicles", user.id, roomCode ?? label);
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
  const starts = parseMxLocalDate(text(form, "starts_at"));
  const endsValue = text(form, "ends_at");
  const ends = endsValue ? parseMxLocalDate(endsValue) : null;

  if (!UUID.test(spaceId)) return { error: "Elige un espacio." };
  if (title.length < 3 || title.length > 160) return { error: "El título debe tener entre 3 y 160 caracteres." };
  if (description.length > 2000) return { error: "La descripción no debe superar los 2,000 caracteres." };
  if (speaker.length > 160) return { error: "El nombre del ponente es demasiado largo." };
  if (!starts || (endsValue && !ends) || (starts && ends && ends <= starts)) {
    return { error: "Revisa la fecha de inicio y asegúrate de que el fin sea posterior al inicio." };
  }

  const spaceRow = await pool.query<{ name: string }>("select name from spaces where id = $1", [spaceId]);
  if (!spaceRow.rowCount) return { error: "El espacio seleccionado no existe." };
  const spaceName = spaceRow.rows[0].name;
  if (/auditorio|sala\s*14/i.test(spaceName) && speaker.length < 2) {
    return { error: "Para eventos en Auditorio o Sala 14 indica el nombre del ponente." };
  }

  const isStaffPublisher = canManageSpaceByName(user, spaceName);
  if (!isStaffPublisher) {
    return {
      error: "Solo Becas (Auditorio), Subdirección Académica (Sala 14) o moderadores de un club (desde eventos de club) pueden registrar eventos.",
    };
  }

  const overlap = await pool.query<{ conflict_title: string | null }>(
    `select public.check_space_event_overlap($1::uuid, $2::timestamptz, $3::timestamptz, null) as conflict_title`,
    [spaceId, starts.toISOString(), ends ? ends.toISOString() : null],
  );
  const conflict = overlap.rows[0]?.conflict_title;
  if (conflict) {
    return {
      error: `${spaceName} ya tiene programado «${conflict}» en ese horario. Elige otra hora o espacio.`,
    };
  }

  const uploaded = await resolveUploadedPublicImage(form, "image", user.id, "space-events");
  if ("error" in uploaded) return { error: uploaded.error };

  const status = isStaffPublisher ? "aprobado" : "pendiente";
  const authorizedBy = isStaffPublisher ? user.id : null;

  const inserted = await pool.query<{ id: string }>(
    `insert into space_events
       (space_id, title, description, speaker, is_public, starts_at, ends_at, created_by, approval_status, authorized_by, image_url)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning id`,
    [spaceId, title, description, speaker || null, isPublic, starts, ends, user.id, status, authorizedBy, uploaded.url],
  );
  if (inserted.rows[0]?.id) {
    await audit(user.id, "crear_evento_espacio", "space_events", inserted.rows[0].id, `${spaceName}: ${title}`);
  }
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
  const ev = await pool.query<{
    space_id: string;
    space_name: string;
    starts_at: Date;
    ends_at: Date | null;
  }>(
    `select e.space_id, s.name as space_name, e.starts_at, e.ends_at
       from space_events e join spaces s on s.id = e.space_id where e.id = $1`,
    [id],
  );
  const row = ev.rows[0];
  if (!row || !canManageSpaceByName(user, row.space_name)) return;

  if (decision === "aprobado") {
    const overlap = await pool.query<{ conflict_title: string | null }>(
      `select public.check_space_event_overlap($1::uuid, $2::timestamptz, $3::timestamptz, $4::uuid) as conflict_title`,
      [row.space_id, row.starts_at.toISOString(), row.ends_at ? row.ends_at.toISOString() : null, id],
    );
    if (overlap.rows[0]?.conflict_title) {
      return;
    }
  }

  await pool.query(
    `update space_events
        set approval_status = $1,
            authorized_by = case when $1 = 'aprobado' then $2::uuid else null end
      where id = $3`,
    [decision, user.id, id],
  );
  await audit(user.id, `evento_espacio_${decision}`, "space_events", id, row.space_name);
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
