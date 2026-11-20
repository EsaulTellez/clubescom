"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, getSession, hashAnswer } from "@/lib/auth";
import { pool } from "@/lib/db";
import { resolvePreuploadedPrivatePath, resolveUploadedPublicImage } from "@/lib/resolve-upload";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isKind, type FormState } from "./labels";

const EVIDENCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
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

export async function createItem(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para reportar un objeto." };

  const kind = String(form.get("kind") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const place = String(form.get("place") ?? "").trim();
  const question = kind === "encontrado" ? String(form.get("security_question") ?? "").trim() : "";
  const answer = kind === "encontrado" ? String(form.get("security_answer") ?? "").trim() : "";

  if (!isKind(kind)) return { error: "Elige si lo perdiste o lo encontraste." };
  if (title.length < 3 || title.length > 120) return { error: "El título debe tener entre 3 y 120 caracteres." };
  if (description.length < 10 || description.length > 2000) return { error: "Describe el objeto con entre 10 y 2000 caracteres." };
  if (place.length < 2 || place.length > 160) return { error: "Indica un lugar de 2 a 160 caracteres." };
  if (kind === "encontrado" && (question.length < 5 || answer.length < 2)) {
    return { error: "Para un objeto encontrado, agrega una pregunta llave y su respuesta clave." };
  }

  const photo1 = await resolveUploadedPublicImage(form, "photo", user.id, "lost");
  if ("error" in photo1) return { error: photo1.error };
  const photo2 = await resolveUploadedPublicImage(form, "photo_2", user.id, "lost");
  if ("error" in photo2) return { error: photo2.error };

  const supabase = await createSupabaseServerClient();
  const { data: id, error } = await supabase.rpc("create_lost_item", {
    p_kind: kind,
    p_title: title,
    p_description: description,
    p_place: place,
    p_photo_url: photo1.url,
    p_security_question: question,
    p_answer_hash: answer ? hashAnswer(answer) : "",
    p_photo_url_2: photo2.url,
    p_security_answer_plain: answer || null,
  });
  if (error || !id) return { error: "No se pudo guardar el reporte. Revisa los datos e intenta otra vez." };

  await audit(user.id, "crear", "lost_items", id, `Reporte ${kind}: ${title}`);
  revalidatePath("/objetos");
  redirect(`/objetos/${id}`);
}

export async function claimItem(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para enviar tu solicitud." };

  const id = String(form.get("id") ?? "");
  const answer = String(form.get("answer") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  const evidenceFile = form.get("evidence");
  if (!isUuid(id)) return { error: "No encontramos el reporte." };
  if (answer.length < 2 || answer.length > 120) return { error: "Escribe la respuesta de seguridad." };

  const supabase = await createSupabaseServerClient();
  let evidencePath = resolvePreuploadedPrivatePath(form, "evidence", `${id}/${user.id}/`);
  if (!evidencePath && evidenceFile instanceof File && evidenceFile.size > 0) {
    if (!EVIDENCE_TYPES.has(evidenceFile.type) || evidenceFile.size > 10 * 1024 * 1024) {
      return { error: "El comprobante opcional debe ser JPG, PNG, WEBP o PDF de menos de 10 MB." };
    }
    const ext =
      evidenceFile.type === "application/pdf"
        ? "pdf"
        : evidenceFile.type === "image/jpeg"
          ? "jpg"
          : evidenceFile.type === "image/png"
            ? "png"
            : "webp";
    const path = `${id}/${user.id}/evidence-${randomBytes(8).toString("hex")}.${ext}`;
    const uploaded = await supabase.storage.from("lost-evidence").upload(path, evidenceFile, {
      contentType: evidenceFile.type,
      upsert: false,
    });
    if (uploaded.error) return { error: "No se pudo subir el comprobante. Inténtalo de nuevo." };
    evidencePath = path;
  }

  const { data, error } = await supabase.rpc("submit_lost_item_claim", {
    p_item_id: id,
    p_answer_text: answer,
    p_note: note || null,
    p_evidence_path: evidencePath,
    p_answer_hash: hashAnswer(answer),
  });

  const row = Array.isArray(data)
    ? (data[0] as { claim_id: string | null; status: string; score: number } | undefined)
    : undefined;

  if (error || !row?.claim_id) {
    if (evidencePath) await supabase.storage.from("lost-evidence").remove([evidencePath]);
  }
  if (error?.code === "23505" || (error?.message && /ya enviaste/i.test(error.message))) {
    return { error: "Ya enviaste un reclamo o aviso para este reporte." };
  }
  if (error) {
    return { error: error.message || "No se pudo enviar la solicitud. Comprueba que el reporte siga abierto." };
  }
  if (row?.status === "limite") {
    return { error: "Agotaste los cinco intentos permitidos para este reporte." };
  }
  if (!row?.claim_id) {
    const pct = Math.round(Number(row?.score ?? 0) * 100);
    return {
      error: `La respuesta tuvo baja coincidencia (${pct}%). Agrega detalles clave exactos o adjunta una foto comprobante para que quien encontró el objeto pueda evaluarlo.`,
    };
  }

  await audit(user.id, "reclamar_objeto", "lost_item_claims", row.claim_id, `${id} (${row.status})`);
  revalidatePath(`/objetos/${id}`);
  revalidatePath("/notificaciones");

  const pct = Math.round(Number(row.score ?? 1) * 100);
  if (row.status === "en_revision" && answer === "encontrado") {
    return { ok: "Aviso enviado. El dueño revisará tu mensaje y podrá aprobar la entrega por QR." };
  }
  return {
    ok:
      row.status === "respuesta_correcta"
        ? `¡Coincidencia alta (${pct}%)! Quien resguarda el objeto revisará tu respuesta y comprobante para habilitar el QR.`
        : `Tu respuesta (${pct}% de coincidencia) se envió a revisión manual. Quien publicó el hallazgo decidirá si corresponde al dueño real.`,
  };
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

export async function updateMeetingNote(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const itemId = String(form.get("item_id") ?? "");
  const handoffId = String(form.get("handoff_id") ?? "");
  const note = String(form.get("meeting_note") ?? "").trim().slice(0, 500);
  if (!isUuid(itemId) || !isUuid(handoffId)) redirect("/objetos");

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("update_lost_item_meeting_note", {
    p_handoff_id: handoffId,
    p_note: note,
  });

  await audit(user.id, "acordar_entrega", "lost_item_handoffs", handoffId, note || "Sin nota");
  revalidatePath(`/objetos/${itemId}`);
  revalidatePath("/notificaciones");
  redirect(`/objetos/${itemId}?revisado=nota`);
}

export async function renewHandoff(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const itemId = String(form.get("item_id") ?? "");
  if (!isUuid(itemId)) redirect("/objetos");

  const code = makeHandoffCode();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("renew_lost_item_handoff", {
    p_item_id: itemId,
    p_token: code,
    p_token_hash: sha256(code),
  });
  if (error) redirect(`/objetos/${itemId}?error=renovar`);

  await audit(user.id, "renovar_qr_entrega", "lost_items", itemId);
  revalidatePath(`/objetos/${itemId}`);
  revalidatePath("/notificaciones");
  redirect(`/objetos/${itemId}?revisado=renovado`);
}

export async function closeItem(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const id = String(form.get("id") ?? "");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (!isUuid(id)) redirect("/objetos");
  const isAdmin = user.role === "admin";
  const updated = await pool.query(
    `update lost_items set status = 'cerrado'
     where id = $1 and (reporter_id = $2 or $3::boolean) and status = 'abierto'`,
    [id, user.id, isAdmin],
  );
  if (updated.rowCount) {
    await audit(user.id, isAdmin && reason ? "cerrar_spam_falso" : "cerrar", "lost_items", id, reason || undefined);
  }
  revalidatePath("/objetos");
  revalidatePath(`/objetos/${id}`);
  redirect(`/objetos/${id}`);
}
