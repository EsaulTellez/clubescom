"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, getSession, hashAnswer } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isKind, type FormState } from "./labels";

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeHandoffCode() {
  const bytes = randomBytes(12);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function sha256(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function savePhoto(userId: string, form: FormData): Promise<{ url: string | null } | { error: string }> {
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { url: null };
  if (!PHOTO_TYPES.has(file.type)) return { error: "La foto debe ser JPG, PNG o WEBP." };
  if (file.size > 5_000_000) return { error: "La foto debe pesar menos de 5 MB." };

  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const path = `${userId}/lost/${randomBytes(16).toString("hex")}.${extension}`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.storage.from("public-media").upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) return { error: "No se pudo subir la foto a Supabase Storage." };
  const { data } = supabase.storage.from("public-media").getPublicUrl(path);
  return { url: data.publicUrl };
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
  if (title.length < 3 || title.length > 120) return { error: "El título debe tener entre 3 y 120 caracteres." };
  if (description.length < 10 || description.length > 2000) return { error: "Describe el objeto con entre 10 y 2000 caracteres." };
  if (place.length < 2 || place.length > 160) return { error: "Indica un lugar de 2 a 160 caracteres." };
  if (kind === "encontrado" && (question.length < 5 || answer.length < 2)) {
    return { error: "Para un objeto encontrado, agrega una pregunta y su respuesta privada." };
  }

  const photo = await savePhoto(user.id, form);
  if ("error" in photo) return { error: photo.error };

  const supabase = await createSupabaseServerClient();
  const { data: id, error } = await supabase.rpc("create_lost_item", {
    p_kind: kind,
    p_title: title,
    p_description: description,
    p_place: place,
    p_photo_url: photo.url,
    p_security_question: question,
    p_answer_hash: answer ? hashAnswer(answer) : "",
  });
  if (error || !id) return { error: "No se pudo guardar el reporte. Revisa los datos e intenta otra vez." };

  await audit(user.id, "crear", "lost_items", id, `Reporte ${kind}: ${title}`);
  revalidatePath("/objetos");
  redirect(`/objetos/${id}`);
}

export async function claimItem(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para reclamar este objeto." };

  const id = String(form.get("id") ?? "");
  const answer = String(form.get("answer") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  if (!isUuid(id)) return { error: "No encontramos el reporte." };
  if (answer.length < 2 || answer.length > 120) return { error: "Escribe la respuesta de seguridad." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_lost_item_claim", {
    p_item_id: id,
    p_answer_hash: hashAnswer(answer),
    p_note: note || null,
  });
  if (error?.code === "23505") return { error: "Ya enviaste un reclamo para este reporte." };
  if (error) return { error: "No se pudo enviar el reclamo. Comprueba que el reporte siga abierto." };
  if (!data?.[0]?.claim_id) return { error: "La respuesta de seguridad no coincide." };

  revalidatePath(`/objetos/${id}`);
  return { ok: "Respuesta correcta. Quien publicó el hallazgo revisará el reclamo." };
}

export async function reviewClaim(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const claimId = String(form.get("claim_id") ?? "");
  const itemId = String(form.get("item_id") ?? "");
  const approve = form.get("approve") === "true";
  const reviewNote = String(form.get("review_note") ?? "").trim();
  if (!isUuid(claimId) || !isUuid(itemId)) redirect("/objetos");

  const code = approve ? makeHandoffCode() : "";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_lost_item_claim", {
    p_claim_id: claimId,
    p_approve: approve,
    p_review_note: reviewNote || null,
    p_token: code,
    p_token_hash: code ? sha256(code) : "",
  });
  if (error) redirect(`/objetos/${itemId}?error=revision`);

  await audit(user.id, approve ? "aprobar_reclamo" : "rechazar_reclamo", "lost_item_claims", claimId);
  revalidatePath(`/objetos/${itemId}`);
  revalidatePath("/notificaciones");
  redirect(`/objetos/${itemId}?${approve ? "revisado=aprobado" : "revisado=rechazado"}`);
}

export async function confirmDelivery(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const itemId = String(form.get("id") ?? "");
  const handoffId = String(form.get("handoff_id") ?? "");
  const code = String(form.get("code") ?? "").trim();
  if (!isUuid(itemId) || !isUuid(handoffId)) redirect("/objetos");

  const supabase = await createSupabaseServerClient();
  const { data: completed, error } = await supabase.rpc("complete_lost_item_handoff", {
    p_handoff_id: handoffId,
    p_token_hash: sha256(code),
  });
  if (error || !completed) redirect(`/objetos/${itemId}?error=codigo`);

  await audit(user.id, "confirmar_entrega", "lost_items", itemId, "Código de entrega confirmado");
  revalidatePath("/objetos");
  revalidatePath(`/objetos/${itemId}`);
  revalidatePath("/notificaciones");
  redirect(`/objetos/${itemId}?revisado=entregado`);
}

export async function closeItem(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) redirect("/objetos");
  const updated = await pool.query(
    `update lost_items set status = 'cerrado'
     where id = $1 and reporter_id = $2 and status = 'abierto'`,
    [id, user.id],
  );
  if (updated.rowCount) await audit(user.id, "cerrar", "lost_items", id);
  revalidatePath("/objetos");
  revalidatePath(`/objetos/${id}`);
  redirect(`/objetos/${id}`);
}
