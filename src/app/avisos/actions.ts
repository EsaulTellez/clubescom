"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  canManageAvisos,
  isCategory,
  parsePublishAt,
  type FormState,
} from "./shared";

async function publisher() {
  const user = await getSession();
  if (!user || !canManageAvisos(user)) return null;
  return user;
}

function readAviso(form: FormData) {
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const category = String(form.get("category") ?? "");
  const featured = form.get("featured") === "on";
  const isPublic = form.get("is_public") === "on";
  const publishAt = parsePublishAt(String(form.get("publish_at") ?? ""));
  const socialRaw = String(form.get("social_copy") ?? "").trim();

  if (title.length < 3 || title.length > 180) {
    return { error: "El título debe tener entre 3 y 180 caracteres." } as const;
  }
  if (!body || body.length > 8000) {
    return { error: "Escribe el cuerpo del aviso (máximo 8000 caracteres)." } as const;
  }
  if (!isCategory(category)) {
    return { error: "Elige una categoría: académico, social o trámites." } as const;
  }
  if (!publishAt) {
    return { error: "Indica una fecha de publicación válida." } as const;
  }
  if (socialRaw.length > 600) {
    return { error: "El formato para redes es demasiado largo." } as const;
  }

  return {
    title,
    body,
    category,
    featured,
    isPublic,
    publishAt,
    socialCopy: socialRaw || null,
  } as const;
}

function refresh(id?: string) {
  revalidatePath("/");
  revalidatePath("/avisos");
  revalidatePath("/avisos/nuevo");
  if (id) revalidatePath(`/avisos/${id}`);
}

export async function crearAviso(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await publisher();
  if (!user) return { error: "No tienes permiso para publicar avisos." };

  const parsed = readAviso(form);
  if ("error" in parsed) return { error: parsed.error };

  const { rows } = await pool.query<{ id: string }>(
    `insert into avisos
       (author_id, title, body, category, featured, is_public, publish_at, social_copy)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      user.id,
      parsed.title,
      parsed.body,
      parsed.category,
      parsed.featured,
      parsed.isPublic,
      parsed.publishAt,
      parsed.socialCopy,
    ],
  );
  const id = rows[0]?.id;
  if (!id) return { error: "No se pudo guardar el aviso." };

  await audit(user.id, "crear", "avisos", id);
  refresh(id);
  redirect(`/avisos/${id}`);
}

export async function actualizarAviso(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await publisher();
  if (!user) return { error: "No tienes permiso para editar avisos." };

  const id = String(form.get("id") ?? "");
  const parsed = readAviso(form);
  if ("error" in parsed) return { error: parsed.error };

  const { rows } = await pool.query<{ id: string }>(
    `update avisos
     set title = $1, body = $2, category = $3, featured = $4,
         is_public = $5, publish_at = $6, social_copy = $7
     where id = $8 and author_id = $9
     returning id`,
    [
      parsed.title,
      parsed.body,
      parsed.category,
      parsed.featured,
      parsed.isPublic,
      parsed.publishAt,
      parsed.socialCopy,
      id,
      user.id,
    ],
  );
  if (!rows[0]) return { error: "Solo puedes editar avisos que publicaste tú." };

  await audit(user.id, "editar", "avisos", id);
  refresh(id);
  redirect(`/avisos/${id}`);
}

export async function eliminarAviso(form: FormData) {
  const user = await publisher();
  if (!user) redirect("/avisos");

  const id = String(form.get("id") ?? "");
  const { rows } = await pool.query<{ id: string }>(
    "delete from avisos where id = $1 and author_id = $2 returning id",
    [id, user.id],
  );
  if (rows[0]) await audit(user.id, "eliminar", "avisos", id);
  refresh(id);
  redirect("/avisos");
}
