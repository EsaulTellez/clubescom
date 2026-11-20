"use server";

import { revalidatePath } from "next/cache";
import { audit, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_KINDS = ["salon", "laboratorio", "cubiculo", "oficina", "servicio", "biblioteca", "auditorio", "otro"];

function canManageMapRooms(user: Awaited<ReturnType<typeof getSession>>) {
  return Boolean(
    user && (user.role === "admin" || (user.role === "moderador" && user.area === "prefectura")),
  );
}

function isValidRoomCode(code: string) {
  if (/^G[0-1]0[0-9]$/.test(code)) return true;
  if (!/^[1-4][0-2](0[1-9]|1[0-3])$/.test(code)) return false;
  if (Number(code[0]) >= 3 && Number(code.slice(2)) < 4) return false;
  return true;
}

export async function saveRoom(
  _state: { error?: string; ok?: string },
  form: FormData,
): Promise<{ error?: string; ok?: string }> {
  const user = await getSession();
  if (!canManageMapRooms(user) || !user) {
    return { error: "Solo administración o Prefectura puede editar la ficha base del espacio." };
  }
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const kind = String(form.get("kind") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const professors = [...new Set(form.getAll("professors").map(String))];

  if (!isValidRoomCode(code) || !VALID_KINDS.includes(kind) || name.length > 120 || description.length > 2000) {
    return { error: "Revisa los datos del espacio." };
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    if (professors.length) {
      const valid = await client.query(
        "select id from users where id::text = any($1::text[]) and role = 'profesor' and is_active",
        [professors],
      );
      if (valid.rowCount !== professors.length) {
        await client.query("rollback");
        return { error: "Hay profesores no disponibles en la selección." };
      }
    }
    await client.query(
      `insert into map_rooms (code, kind, name, description)
       values ($1, $2, $3, $4)
       on conflict (code) do update
         set kind = excluded.kind,
             name = excluded.name,
             description = excluded.description`,
      [code, kind, name, description],
    );
    await client.query("delete from map_room_professors where room_code = $1", [code]);
    if (professors.length) {
      await client.query(
        `insert into map_room_professors (room_code, professor_id)
         select $1, id from users where id::text = any($2::text[]) and role = 'profesor' and is_active`,
        [code, professors],
      );
      await client.query(
        `delete from map_room_suggestions
          where room_code = $1 and professor_id::text = any($2::text[])`,
        [code, professors],
      );
    }
    await client.query("commit");
  } catch {
    await client.query("rollback");
    return { error: "No se pudieron guardar los cambios. Inténtalo de nuevo." };
  } finally {
    client.release();
  }
  await audit(user.id, "editar_espacio_mapa", "map_rooms", code, name || kind);
  revalidatePath("/mapa");
  return { ok: "Espacio actualizado." };
}

export async function assignSelfToRoom(
  _state: { error?: string; ok?: string },
  form: FormData,
): Promise<{ error?: string; ok?: string }> {
  const user = await getSession();
  if (!user || user.role !== "profesor") {
    return { error: "Solo un profesor puede asignarse directamente como confirmado." };
  }

  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const mode = String(form.get("mode") ?? "assign").trim();
  const customLabel = String(form.get("label") ?? "").trim().slice(0, 80);

  if (!isValidRoomCode(code)) {
    return { error: "El código del espacio no es válido." };
  }

  if (mode === "remove") {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "delete from map_room_professors where room_code = $1 and professor_id = $2",
        [code, user.id],
      );
      await client.query(
        "update cubicles set room_code = null where professor_id = $1 and room_code = $2",
        [user.id, code],
      );
      await client.query("commit");
    } catch {
      await client.query("rollback");
      return { error: "No se pudo retirar tu asignación." };
    } finally {
      client.release();
    }
    await audit(user.id, "retirar_cubiculo_mapa", "map_rooms", code);
    revalidatePath("/mapa");
    return { ok: "Te retiraste de este espacio." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_my_map_room", {
    p_code: code,
    p_label: customLabel,
  });
  if (error) {
    return { error: error.message || "No se pudo guardar tu asignación." };
  }

  // Limpiar sugerencias pendientes del mismo profesor en ese espacio
  await pool.query(
    "delete from map_room_suggestions where room_code = $1 and professor_id = $2",
    [code, user.id],
  );

  await audit(user.id, "asignar_cubiculo_mapa", "map_rooms", code, customLabel || code);
  revalidatePath("/mapa");
  return { ok: "Ubicación confirmada correctamente." };
}

export async function suggestProfessorInRoom(
  _state: { error?: string; ok?: string },
  form: FormData,
): Promise<{ error?: string; ok?: string }> {
  const user = await getSession();
  if (!user) {
    return { error: "Inicia sesión para sugerir la ubicación de un profesor." };
  }

  const code = String(form.get("code") ?? "").trim();
  const professorId = String(form.get("professor_id") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();

  if (!isValidRoomCode(code)) {
    return { error: "Selecciona un espacio válido en el mapa." };
  }
  if (!UUID_RE.test(professorId)) {
    return { error: "Selecciona a un profesor de la lista." };
  }
  if (note.length > 240) {
    return { error: "La nota no puede exceder 240 caracteres." };
  }

  // Si quien guarda es el propio profesor, se guarda directamente como verdad oficial
  if (user.role === "profesor" && user.id === professorId) {
    const fd = new FormData();
    fd.set("code", code);
    fd.set("mode", "assign");
    fd.set("label", note);
    return assignSelfToRoom({}, fd);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const profCheck = await client.query(
      "select id from users where id = $1 and role = 'profesor' and is_active",
      [professorId],
    );
    if (!profCheck.rowCount) {
      await client.query("rollback");
      return { error: "El profesor seleccionado no está disponible." };
    }

    const alreadyOfficial = await client.query(
      "select 1 from map_room_people where room_code = $1 and id = $2 limit 1",
      [code, professorId],
    );
    if (alreadyOfficial.rowCount) {
      await client.query("rollback");
      return { error: "Este profesor ya está confirmado oficialmente en este espacio." };
    }

    const existingSuggestion = await client.query<{ id: string; suggested_by: string }>(
      "select id, suggested_by from map_room_suggestions where room_code = $1 and professor_id = $2 limit 1",
      [code, professorId],
    );

    let suggestionId = existingSuggestion.rows[0]?.id;
    if (!suggestionId) {
      const inserted = await client.query<{ id: string }>(
        `insert into map_room_suggestions (room_code, professor_id, suggested_by, note)
         values ($1, $2, $3, $4)
         returning id`,
        [code, professorId, user.id, note],
      );
      suggestionId = inserted.rows[0].id;
    } else if (existingSuggestion.rows[0].suggested_by === user.id && note !== "") {
      await client.query(
        "update map_room_suggestions set note = $1 where id = $2",
        [note, suggestionId],
      );
    }

    await client.query(
      `insert into map_room_suggestion_votes (suggestion_id, user_id, vote)
       values ($1, $2, 1)
       on conflict (suggestion_id, user_id) do update set vote = 1`,
      [suggestionId, user.id],
    );

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    console.error("Error registrando sugerencia en mapa:", err);
    return { error: "No se pudo registrar la sugerencia. Verifica tu sesión y el espacio seleccionado." };
  } finally {
    client.release();
  }

  revalidatePath("/mapa");
  return { ok: "Sugerencia publicada para votación de la comunidad." };
}

export async function voteRoomSuggestion(formData: FormData) {
  const user = await getSession();
  if (!user) return;

  const suggestionId = String(formData.get("suggestion_id") ?? "").trim();
  const voteValue = Number(formData.get("vote"));
  if (!UUID_RE.test(suggestionId) || (voteValue !== 1 && voteValue !== -1)) return;

  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query<{ vote: number }>(
      "select vote from map_room_suggestion_votes where suggestion_id = $1 and user_id = $2",
      [suggestionId, user.id],
    );
    if (existing.rowCount && existing.rows[0].vote === voteValue) {
      await client.query(
        "delete from map_room_suggestion_votes where suggestion_id = $1 and user_id = $2",
        [suggestionId, user.id],
      );
    } else {
      await client.query(
        `insert into map_room_suggestion_votes (suggestion_id, user_id, vote)
         values ($1, $2, $3)
         on conflict (suggestion_id, user_id) do update set vote = excluded.vote`,
        [suggestionId, user.id, voteValue],
      );
    }
    await client.query("commit");
  } catch {
    await client.query("rollback");
  } finally {
    client.release();
  }

  revalidatePath("/mapa");
}

export async function resolveRoomSuggestion(formData: FormData) {
  const user = await getSession();
  if (!user) return;

  const suggestionId = String(formData.get("suggestion_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  if (!UUID_RE.test(suggestionId) || !["confirm", "dismiss"].includes(decision)) return;

  const client = await pool.connect();
  try {
    await client.query("begin");
    const row = await client.query<{ room_code: string; professor_id: string; suggested_by: string }>(
      "select room_code, professor_id, suggested_by from map_room_suggestions where id = $1",
      [suggestionId],
    );
    if (!row.rowCount) {
      await client.query("rollback");
      return;
    }
    const sug = row.rows[0];
    const isTargetProfessor = user.role === "profesor" && user.id === sug.professor_id;
    const isStaff = canManageMapRooms(user);
    const isAuthor = user.id === sug.suggested_by;

    if (decision === "confirm" && (isTargetProfessor || isStaff)) {
      await client.query(
        `insert into map_rooms (code, kind, name, description)
         values ($1, 'cubiculo', $2, '')
         on conflict (code) do nothing`,
        [sug.room_code, `Cubículo ${sug.room_code}`],
      );
      await client.query(
        `delete from map_room_professors where professor_id = $1 and room_code <> $2`,
        [sug.professor_id, sug.room_code],
      );
      await client.query(
        `insert into map_room_professors (room_code, professor_id)
         values ($1, $2)
         on conflict (room_code, professor_id) do nothing`,
        [sug.room_code, sug.professor_id],
      );
      const buildingLabel = sug.room_code.startsWith("G")
        ? "Edificio de Gobierno"
        : `Edificio ${sug.room_code[0]}`;
      const floorLabel = sug.room_code[1] === "0" ? "Planta baja" : `Piso ${sug.room_code[1]}`;
      await client.query(
        `update cubicles set room_code = $2, building = $3, floor = $4
          where professor_id = $1`,
        [sug.professor_id, sug.room_code, buildingLabel, floorLabel],
      );
      await client.query("delete from map_room_suggestions where id = $1", [suggestionId]);
      await audit(user.id, "confirmar_sugerencia_mapa", "map_room_suggestions", suggestionId, sug.room_code);
    } else if (decision === "dismiss" && (isTargetProfessor || isStaff || isAuthor)) {
      await client.query("delete from map_room_suggestions where id = $1", [suggestionId]);
      await audit(user.id, "descartar_sugerencia_mapa", "map_room_suggestions", suggestionId, sug.room_code);
    }
    await client.query("commit");
  } catch {
    await client.query("rollback");
  } finally {
    client.release();
  }

  revalidatePath("/mapa");
}
