"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, getSession } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MODERATION_AREAS } from "./shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function message(error: unknown) {
  if (typeof error === "object" && error && "code" in error && error.code === "23505") {
    return "Ya existe una apelación pendiente para esta suspensión.";
  }
  return "No se pudo completar la acción. Recarga la página e inténtalo de nuevo.";
}

export async function registerStrike(form: FormData) {
  const actor = await getSession();
  if (!actor || (actor.role !== "admin" && actor.role !== "moderador")) redirect("/entrar");

  const userId = String(form.get("user_id") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  const source = String(form.get("source_type") ?? "otro");
  const selectedArea = String(form.get("area") ?? "");
  const area = actor.role === "moderador" ? actor.area : selectedArea;
  const validArea = MODERATION_AREAS.some((item) => item.id === area);
  const validSource = ["foro", "guia", "aviso", "club", "objeto", "otro"].includes(source);
  if (!UUID.test(userId) || userId === actor.id || reason.length < 8 || reason.length > 1000 || !area || !validArea || !validSource) {
    redirect("/moderacion?error=datos");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("register_moderation_strike", {
    p_user_id: userId,
    p_area: area,
    p_reason: reason,
    p_source_type: source,
  });
  if (error) redirect(`/moderacion?error=${encodeURIComponent(message(error))}`);
  const strike = Array.isArray(data) ? data[0] : null;
  if (!strike?.strike_id) redirect("/moderacion?error=persona");
  await audit(actor.id, "registrar_infraccion", "moderation_strikes", strike.strike_id, `Área ${area}; infracción ${strike.strike_total}`);
  revalidatePath("/moderacion");
  revalidatePath("/apelaciones");
  redirect("/moderacion?guardada=1");
}

export async function reviewAppeal(form: FormData) {
  const actor = await getSession();
  if (!actor || actor.role !== "admin") redirect("/entrar");
  const appealId = String(form.get("appeal_id") ?? "");
  const accepted = form.get("decision") === "aceptar";
  const note = String(form.get("review_note") ?? "").trim().slice(0, 1000);
  if (!UUID.test(appealId) || note.length < 5) redirect("/moderacion?error=nota");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_moderation_appeal", {
    p_appeal_id: appealId,
    p_accepted: accepted,
    p_review_note: note,
  });
  if (error) redirect(`/moderacion?error=${encodeURIComponent(error.message)}`);
  await audit(actor.id, accepted ? "aceptar_apelacion" : "rechazar_apelacion", "moderation_appeals", appealId);
  revalidatePath("/moderacion");
  revalidatePath("/apelaciones");
  redirect("/moderacion?resuelta=1");
}
