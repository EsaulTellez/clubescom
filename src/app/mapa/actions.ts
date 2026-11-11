"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function saveRoom(_state: { error?: string; ok?: string }, form: FormData): Promise<{ error?: string; ok?: string }> {
  const user = await getSession();
  if (user?.role !== "admin") return { error: "Solo administración puede editar el mapa." };
  const code = String(form.get("code") ?? "");
  const kind = String(form.get("kind") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const professors = [...new Set(form.getAll("professors").map(String))];
  if (!/^[1-4][0-2](0[1-9]|1[0-3])$/.test(code) || (Number(code[0]) >= 3 && Number(code.slice(2)) < 4) || !["salon", "laboratorio", "cubiculo", "otro"].includes(kind) || name.length > 120 || description.length > 2000) return { error: "Revisa los datos del espacio." };
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (professors.length) {
      const valid = await client.query("select id from users where id::text = any($1::text[]) and role = 'profesor' and is_active", [professors]);
      if (valid.rowCount !== professors.length) { await client.query("rollback"); return { error: "Hay profesores no disponibles en la selección." }; }
    }
    await client.query(`insert into map_rooms (code, kind, name, description) values ($1, $2, $3, $4)
      on conflict (code) do update set kind = excluded.kind, name = excluded.name, description = excluded.description`, [code, kind, name, description]);
    await client.query("delete from map_room_professors where room_code = $1", [code]);
    if (professors.length) await client.query("insert into map_room_professors (room_code, professor_id) select $1, id from users where id::text = any($2::text[]) and role = 'profesor' and is_active", [code, professors]);
    await client.query("commit");
  } catch {
    await client.query("rollback");
    return { error: "No se pudieron guardar los cambios. Inténtalo de nuevo." };
  } finally { client.release(); }
  revalidatePath("/mapa");
  return { ok: "Espacio actualizado." };
}
