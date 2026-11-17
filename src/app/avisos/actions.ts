"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GoogleGenAI } from "@google/genai";
import { audit, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canManageAvisos,
  categoryLabel,
  isCategory,
  parseExternalUrl,
  parsePublishAt,
  type FormState,
} from "./shared";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function publisher() {
  const user = await getSession();
  if (!user || !canManageAvisos(user)) return null;
  return user;
}

function buildFallbackSocial(input: { title: string; body: string; category: string }) {
  const label = categoryLabel(input.category);
  const cleanTitle = input.title.trim();
  const cleanBody = input.body.trim().replace(/\s+/g, " ");
  const twitter = `📢 #ESCOM · ${label}: ${cleanTitle}. ${cleanBody}`.slice(0, 275);
  const facebook = `📌 Comunicado ESCOM (${label})\n\n${cleanTitle}\n\n${input.body.trim().slice(0, 500)}\n\n#ESCOM #IPN #ComunidadESCOM`;
  return {
    twitter,
    facebook,
    text: `Twitter / X:\n${twitter}\n\nFacebook:\n${facebook}`,
  };
}

export async function generateSocialCopy(input: {
  title: string;
  body: string;
  category: string;
}): Promise<{ text?: string; twitter?: string; facebook?: string; notice?: string; error?: string }> {
  const user = await publisher();
  if (!user) return { error: "No tienes permiso para generar formatos de avisos." };
  const title = input.title.trim().slice(0, 180);
  const body = input.body.trim().slice(0, 8000);
  if (title.length < 3 || body.length < 1 || !isCategory(input.category)) {
    return { error: "Completa título, cuerpo y categoría antes de generar el formato." };
  }
  const fallback = buildFallbackSocial({ title, body, category: input.category });
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return {
      ...fallback,
      notice: "Plantilla guiada generada localmente (configura GOOGLE_GENERATIVE_AI_API_KEY en .env.local para usar IA generativa).",
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Redacta dos formatos para redes sociales en español de México para la comunidad de ESCOM del IPN. Conserva solo datos presentes; no inventes fecha, lugar, requisitos o enlaces. Devuelve estrictamente un JSON con las llaves "twitter" (máximo 280 caracteres) y "facebook" (entre 120 y 600 caracteres).\nCategoría: ${input.category}\nTítulo: ${title}\nAviso: ${body}`,
      config: { responseMimeType: "application/json" },
    });
    const raw = response.text?.trim() ?? "";
    const parsed = JSON.parse(raw) as { twitter?: string; facebook?: string };
    const twitter = (parsed.twitter ?? fallback.twitter).trim().slice(0, 280);
    const facebook = (parsed.facebook ?? fallback.facebook).trim().slice(0, 800);
    return {
      twitter,
      facebook,
      text: `Twitter / X:\n${twitter}\n\nFacebook:\n${facebook}`,
    };
  } catch {
    return {
      ...fallback,
      notice: "Google GenAI no estuvo disponible; se cargó el borrador guiado editable para Twitter/X y Facebook.",
    };
  }
}

function buildFallbackFromRawText(rawText: string) {
  const normalized = rawText.replace(/\r/g, "").trim();
  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const urlMatch = normalized.match(/https?:\/\/[^\s<>"')\]]+/i);
  const externalUrl = urlMatch ? urlMatch[0].replace(/[.,;!?]+$/, "") : "";

  const lower = normalized.toLowerCase();
  const category: "academico" | "social" | "tramites" =
    /beca|reinscrip|constancia|boleta|tramite|trámite|saes|ventanilla|servicio social|titulaci|imss/.test(lower)
      ? "tramites"
      : /torneo|futbol|fútbol|cultural|cine|club|festival|convivencia|bienvenida|amistoso|deport/.test(lower)
        ? "social"
        : "academico";

  const firstSentence = (lines[0] ?? normalized.split(/[.!?]\s+/)[0] ?? "Comunicado ESCOM")
    .replace(/^(aviso|comunicado|urgente|importante|hola|buen día|buenas tardes)[:\s-]*/i, "")
    .trim();
  const title = (firstSentence || "Comunicado institucional ESCOM").slice(0, 140);
  const body = lines.join("\n\n").slice(0, 7500);
  const featured = /urgente|importante|convocatoria|cierre|último día|beca|reinscrip/i.test(lower);
  const social = buildFallbackSocial({ title, body, category });
  return {
    title,
    body,
    category,
    externalUrl,
    featured,
    ...social,
  };
}

export async function generateAvisoFromRawText(rawTextInput: string): Promise<{
  title?: string;
  body?: string;
  category?: "academico" | "social" | "tramites";
  externalUrl?: string;
  featured?: boolean;
  twitter?: string;
  facebook?: string;
  text?: string;
  notice?: string;
  error?: string;
}> {
  const user = await publisher();
  if (!user) return { error: "No tienes permiso para usar el generador de comunicados." };
  const rawText = rawTextInput.trim().slice(0, 12000);
  if (rawText.length < 15) {
    return { error: "Pega al menos 15 caracteres del mensaje o información recibida." };
  }

  const fallback = buildFallbackFromRawText(rawText);
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return {
      ...fallback,
      notice: "Formato generado localmente para la plataforma y redes sociales. Revisa y publica con un clic.",
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Eres el asistente de Comunicación Social de ESCOM (IPN, México). A partir del siguiente texto informal recibido por correo, WhatsApp u oficio, genera AMBOS formatos sin inventar fechas, horarios, lugares, requisitos ni enlaces que no estén en el texto original.

Devuelve estrictamente un JSON con estas llaves:
- "title": título claro e institucional para nuestra plataforma ESCOM (máx. 140 caracteres)
- "body": redacción clara, ordenada y completa del comunicado para publicar en nuestra plataforma ESCOM (conservando fechas, lugares, requisitos y detalles reales)
- "category": exactamente uno de "academico", "social", "tramites"
- "externalUrl": URL exacta encontrada en el texto (si existe) o ""
- "featured": booleano (true si es urgente, convocatoria clave o de interés masivo)
- "twitter": publicación corta lista para Twitter/X (máx. 280 caracteres con hashtags de ESCOM/IPN)
- "facebook": publicación completa lista para Facebook/Instagram (entre 140 y 700 caracteres)

Texto recibido:
${rawText}`,
      config: { responseMimeType: "application/json" },
    });
    const raw = response.text?.trim() ?? "";
    const parsed = JSON.parse(raw) as {
      title?: string;
      body?: string;
      category?: string;
      externalUrl?: string;
      featured?: boolean;
      twitter?: string;
      facebook?: string;
    };

    const title = (parsed.title ?? fallback.title).trim().slice(0, 180);
    const body = (parsed.body ?? fallback.body).trim().slice(0, 8000);
    const category = isCategory(String(parsed.category ?? ""))
      ? (parsed.category as "academico" | "social" | "tramites")
      : fallback.category;
    const urlCandidate = (parsed.externalUrl ?? fallback.externalUrl).trim();
    const externalUrl = /^https?:\/\//i.test(urlCandidate) ? urlCandidate.slice(0, 500) : "";
    const featured = typeof parsed.featured === "boolean" ? parsed.featured : fallback.featured;
    const twitter = (parsed.twitter ?? fallback.twitter).trim().slice(0, 280);
    const facebook = (parsed.facebook ?? fallback.facebook).trim().slice(0, 800);

    return {
      title,
      body,
      category,
      externalUrl,
      featured,
      twitter,
      facebook,
      text: `Twitter / X:\n${twitter}\n\nFacebook:\n${facebook}`,
      notice: "IA generó el formato para la plataforma y las versiones listas para redes sociales. Revisa y publica con un clic.",
    };
  } catch {
    return {
      ...fallback,
      notice: "Google GenAI no respondió; se estructuró el comunicado y los textos para redes localmente.",
    };
  }
}

async function uploadNoticeImage(userId: string, form: FormData): Promise<{ url: string | null } | { error: string }> {
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return { url: null };
  if (!IMAGE_TYPES.has(file.type)) return { error: "El cartel debe ser JPG, PNG o WEBP." };
  if (file.size > 10 * 1024 * 1024) return { error: "El cartel debe pesar menos de 10 MB." };

  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const path = `${userId}/notices/${randomBytes(12).toString("hex")}.${ext}`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.storage.from("public-media").upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) return { error: "No se pudo subir el cartel a Supabase Storage." };
  const { data } = supabase.storage.from("public-media").getPublicUrl(path);
  return { url: data.publicUrl };
}

function readAviso(form: FormData) {
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const category = String(form.get("category") ?? "");
  const featured = form.get("featured") === "on";
  const isPublic = form.get("is_public") === "on";
  const publishAt = parsePublishAt(String(form.get("publish_at") ?? ""));
  const externalUrlParsed = parseExternalUrl(String(form.get("external_url") ?? ""));
  const socialTwitter = String(form.get("social_twitter") ?? "").trim().slice(0, 280);
  const socialFacebook = String(form.get("social_facebook") ?? "").trim().slice(0, 1000);
  const socialRaw = String(form.get("social_copy") ?? "").trim().slice(0, 1200);

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
  if ("error" in externalUrlParsed) {
    return { error: externalUrlParsed.error } as const;
  }

  const combinedSocial =
    socialTwitter || socialFacebook
      ? [socialTwitter ? `Twitter / X:\n${socialTwitter}` : "", socialFacebook ? `Facebook:\n${socialFacebook}` : ""]
          .filter(Boolean)
          .join("\n\n")
      : socialRaw;

  return {
    title,
    body,
    category,
    featured,
    isPublic,
    publishAt,
    externalUrl: externalUrlParsed.url,
    socialCopy: combinedSocial || null,
    socialTwitter: socialTwitter || null,
    socialFacebook: socialFacebook || null,
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

  const uploaded = await uploadNoticeImage(user.id, form);
  if ("error" in uploaded) return { error: uploaded.error };

  const { rows } = await pool.query<{ id: string }>(
    `insert into avisos
       (author_id, title, body, category, featured, is_public, publish_at, external_url, social_copy, social_twitter, social_facebook, image_url, published_triggered)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, ($7 <= now()))
     returning id`,
    [
      user.id,
      parsed.title,
      parsed.body,
      parsed.category,
      parsed.featured,
      parsed.isPublic,
      parsed.publishAt,
      parsed.externalUrl,
      parsed.socialCopy,
      parsed.socialTwitter,
      parsed.socialFacebook,
      uploaded.url,
    ],
  );
  const id = rows[0]?.id;
  if (!id) return { error: "No se pudo guardar el aviso." };

  await audit(user.id, "crear", "avisos", id);
  refresh(id);
  if (form.get("stay") === "1") {
    return { ok: true, id };
  }
  redirect(`/avisos/${id}`);
}

export async function actualizarAviso(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await publisher();
  if (!user) return { error: "No tienes permiso para editar avisos." };

  const id = String(form.get("id") ?? "");
  const parsed = readAviso(form);
  if ("error" in parsed) return { error: parsed.error };

  const uploaded = await uploadNoticeImage(user.id, form);
  if ("error" in uploaded) return { error: uploaded.error };

  const { rows } = await pool.query<{ id: string }>(
    `update avisos
     set title = $1, body = $2, category = $3, featured = $4,
         is_public = $5, publish_at = $6, external_url = $7,
         social_copy = $8, social_twitter = $9, social_facebook = $10,
         image_url = coalesce($11, image_url),
         published_triggered = ($6 <= now())
     where id = $12 and (author_id = $13 or $14::boolean)
     returning id`,
    [
      parsed.title,
      parsed.body,
      parsed.category,
      parsed.featured,
      parsed.isPublic,
      parsed.publishAt,
      parsed.externalUrl,
      parsed.socialCopy,
      parsed.socialTwitter,
      parsed.socialFacebook,
      uploaded.url,
      id,
      user.id,
      user.role === "admin",
    ],
  );
  if (!rows[0]) return { error: "Solo puedes editar avisos que publicaste tú o con cuenta de administración." };

  await audit(user.id, "editar", "avisos", id);
  refresh(id);
  if (form.get("stay") === "1") {
    return { ok: true, id };
  }
  redirect(`/avisos/${id}`);
}

export async function eliminarAviso(form: FormData) {
  const user = await publisher();
  if (!user) redirect("/avisos");

  const id = String(form.get("id") ?? "");
  const { rows } = await pool.query<{ id: string }>(
    "delete from avisos where id = $1 and (author_id = $2 or $3::boolean) returning id",
    [id, user.id, user.role === "admin"],
  );
  if (rows[0]) await audit(user.id, "eliminar", "avisos", id);
  refresh(id);
  redirect("/avisos");
}

export async function eliminarAvisoInline(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await publisher();
  if (!user) return { error: "No tienes permiso para eliminar avisos." };

  const id = String(form.get("id") ?? "");
  const { rows } = await pool.query<{ id: string }>(
    "delete from avisos where id = $1 and (author_id = $2 or $3::boolean) returning id",
    [id, user.id, user.role === "admin"],
  );
  if (!rows[0]) return { error: "No se pudo eliminar el aviso." };
  await audit(user.id, "eliminar", "avisos", id);
  refresh(id);
  return { ok: true, id };
}
