"use server";

import { randomBytes } from "crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { answersMatch, audit, getSession, hashAnswer } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isKind, type FormState } from "./labels";

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function claimCode() {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return code;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function savePhoto(form: FormData): Promise<{ url: string | null } | { error: string }> {
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { url: null };
  const ext = PHOTO_TYPES[file.type];
  if (!ext) return { error: "La foto debe ser JPG, PNG, WEBP o GIF." };
  if (file.size > 900_000) return { error: "La foto debe pesar menos de 900 KB." };
  const filename = `${randomBytes(16).toString("hex")}${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return { url: `/uploads/${filename}` };
}

export async function createItem(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para reportar un objeto." };

  const kind = String(form.get("kind") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const place = String(form.get("place") ?? "").trim();
  const question = String(form.get("security_question") ?? "").trim();
  const answer = String(form.get("security_answer") ?? "").trim();

  if (!isKind(kind)) return { error: "Elige si lo perdiste o lo encontraste." };
  if (title.length < 3) return { error: "Escribe un título de al menos 3 caracteres." };
  if (description.length < 10) return { error: "Describe el objeto con al menos 10 caracteres." };
  if (place.length < 2) return { error: "Indica el lugar." };
  if (question.length < 5) return { error: "Escribe una pregunta de seguridad." };
  if (answer.length < 2) return { error: "Escribe la respuesta de seguridad." };

  const photo = await savePhoto(form);
  if ("error" in photo) return { error: photo.error };

  const client = await pool.connect();
  let id = "";
  try {
    await client.query("begin");
    const inserted = await client.query<{ id: string }>(
      `insert into lost_items
        (reporter_id, kind, title, description, place, photo_url, status, security_question, security_answer_hash)
       values ($1, $2, $3, $4, $5, $6, 'abierto', $7, $8)
       returning id`,
      [user.id, kind, title, description, place, photo.url, question, hashAnswer(answer)],
    );
    id = inserted.rows[0]!.id;

    await client.query("select set_config('pg_trgm.similarity_threshold','0.2', true)");
    const match = await client.query<{
      id: string;
      reporter_id: string;
      title: string;
      score: number;
    }>(
      `select id, reporter_id, title, similarity(title, $1) + similarity(description, $2) as score
       from lost_items
       where id <> $3 and kind <> $4 and status = 'abierto'
         and (title % $1 or description % $2)
       order by score desc
       limit 1`,
      [title, description, id, kind],
    );
    const hit = match.rows[0];
    if (hit && Number(hit.score) >= 0.35) {
      await client.query("update lost_items set matched_id = $1 where id = $2", [hit.id, id]);
      await client.query("update lost_items set matched_id = $1 where id = $2", [id, hit.id]);
      await client.query(
        `insert into notifications (user_id, title, body, href) values
          ($1, 'Posible coincidencia', $2, $3),
          ($4, 'Posible coincidencia', $5, $6)`,
        [
          user.id,
          `Hay un reporte abierto que se parece al tuyo: ${hit.title}.`,
          `/objetos/${hit.id}`,
          hit.reporter_id,
          `Hay un reporte abierto que se parece al tuyo: ${title}.`,
          `/objetos/${id}`,
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  revalidatePath("/objetos");
  redirect(`/objetos/${id}`);
}

export async function claimItem(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para reclamar este objeto." };

  const id = String(form.get("id") ?? "");
  const answer = String(form.get("answer") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "No encontramos el reporte." };
  const { rows } = await pool.query<{
    reporter_id: string;
    status: string;
    security_answer_hash: string | null;
    claim_code: string | null;
  }>(
    `select reporter_id, status, security_answer_hash, claim_code
     from lost_items where id = $1`,
    [id],
  );
  const item = rows[0];
  if (!item) return { error: "No encontramos el reporte." };
  if (item.reporter_id === user.id) return { error: "No puedes reclamar tu propio reporte." };
  if (item.status !== "abierto") return { error: "Este reporte ya no está abierto." };
  if (!item.security_answer_hash || !answersMatch(answer, item.security_answer_hash)) {
    return { error: "La respuesta no coincide." };
  }
  if (item.claim_code) return { code: item.claim_code };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = claimCode();
    try {
      const saved = await pool.query<{ claim_code: string }>(
        `update lost_items set claim_code = $1
         where id = $2 and claim_code is null
         returning claim_code`,
        [code, id],
      );
      if (saved.rows[0]) {
        revalidatePath(`/objetos/${id}`);
        return { code: saved.rows[0].claim_code };
      }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      continue;
    }
    const current = await pool.query<{ claim_code: string | null }>(
      "select claim_code from lost_items where id = $1",
      [id],
    );
    if (current.rows[0]?.claim_code) return { code: current.rows[0].claim_code };
  }
  return { error: "No pudimos generar el código. Intenta de nuevo." };
}

export async function confirmDelivery(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const id = String(form.get("id") ?? "");
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const updated = await pool.query(
    `update lost_items set status = 'entregado'
     where id = $1 and reporter_id = $2 and status = 'abierto' and claim_code = $3`,
    [id, user.id, code],
  );
  if (!updated.rowCount) redirect(`/objetos/${id}?error=codigo`);
  await audit(user.id, "confirmar_entrega", "lost_items", id, "Estado cambiado a entregado");
  revalidatePath("/objetos");
  revalidatePath(`/objetos/${id}`);
  redirect(`/objetos/${id}`);
}

export async function closeItem(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const id = String(form.get("id") ?? "");
  await pool.query(
    `update lost_items set status = 'cerrado'
     where id = $1 and reporter_id = $2 and status = 'abierto'`,
    [id, user.id],
  );
  revalidatePath("/objetos");
  revalidatePath(`/objetos/${id}`);
  redirect(`/objetos/${id}`);
}
