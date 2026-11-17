"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GoogleGenAI } from "@google/genai";
import { audit, getSession } from "@/lib/auth";
import { pool, type SecureClient } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { asSteps, isArea, isStaff, isUuid, type GuideFaq, type GuideStep } from "./shared";

export type GuideState = { error?: string };
export type SuggestState = { error?: string };

async function withTx<T>(fn: (client: SecureClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* la transacción ya estaba cerrada */
    }
    throw error;
  } finally {
    client.release();
  }
}

function parsePairs(raw: string, kind: "pasos" | "preguntas") {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const pairs: { left: string; right: string }[] = [];
  for (const line of lines) {
    const index = line.indexOf("|");
    if (index < 0) {
      return {
        error:
          kind === "pasos"
            ? "Cada paso va en una línea con el formato titulo | texto."
            : "Cada pregunta frecuente va en una línea con el formato pregunta | respuesta.",
      };
    }
    const left = line.slice(0, index).trim();
    const right = line.slice(index + 1).trim();
    if (!left || !right) {
      return { error: "Completa ambos lados del separador | en cada línea." };
    }
    pairs.push({ left, right });
  }
  return { pairs };
}

function heuristicParseSourceText(text: string): {
  title: string;
  summary: string;
  steps: string;
  faqs: string;
} {
  const paragraphs = text
    .replace(/\r/g, "")
    .split(/\n{2,}|\n(?=\d+[\.\)]|-|\*)/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 6);

  const first = paragraphs[0] ?? "Trámite ESCOM";
  const title = first.slice(0, 80);
  const summary = (paragraphs[1] ?? first).slice(0, 300);
  const stepLines: string[] = [];
  const faqLines: string[] = [];

  for (const p of paragraphs.slice(1, 15)) {
    if (p.includes("?")) {
      const [qPart, ...rest] = p.split("?");
      const q = `${qPart.trim()}?`;
      const a = rest.join("?").trim() || "Consulta los detalles en ventanilla del área.";
      faqLines.push(`${q.slice(0, 140)} | ${a.slice(0, 400)}`);
    } else {
      const clean = p.replace(/^(\d+[\.\)]|-|\*)\s*/, "");
      const colonIdx = clean.indexOf(":");
      if (colonIdx > 2 && colonIdx < 60) {
        stepLines.push(`${clean.slice(0, colonIdx).trim()} | ${clean.slice(colonIdx + 1).trim()}`);
      } else {
        stepLines.push(`Paso ${stepLines.length + 1} | ${clean.slice(0, 400)}`);
      }
    }
  }

  if (stepLines.length === 0) {
    stepLines.push(`Revisa los requisitos | ${summary}`);
  }

  return {
    title,
    summary,
    steps: stepLines.slice(0, 12).join("\n"),
    faqs: faqLines.slice(0, 6).join("\n"),
  };
}

export async function parseGuideDocumentDraft(form: FormData): Promise<{
  title?: string;
  summary?: string;
  steps?: string;
  faqs?: string;
  notice?: string;
  error?: string;
}> {
  const user = await getSession();
  if (!user || !isStaff(user.role)) {
    return { error: "Solo moderación y administración pueden procesar documentos." };
  }
  const file = form.get("source_doc");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona un archivo TXT, PDF o DOCX para extraer el borrador." };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { error: "El documento debe pesar menos de 15 MB." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const nameLower = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || nameLower.endsWith(".pdf");
  const isTxt = file.type.startsWith("text/") || nameLower.endsWith(".txt") || nameLower.endsWith(".md");
  const isDocx =
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    nameLower.endsWith(".docx") ||
    nameLower.endsWith(".doc");

  if (!isPdf && !isTxt && !isDocx) {
    return { error: "Formato no compatible. Usa PDF, DOCX o TXT." };
  }

  let extractedText = "";
  if (isTxt) {
    extractedText = buffer.toString("utf-8");
  } else {
    extractedText = buffer
      .toString("utf-8")
      .replace(/[^\x20-\x7EÁÉÍÓÚáéíóúÑñ¿¡\n\r]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (isPdf) {
        parts.push({
          inlineData: {
            mimeType: "application/pdf",
            data: buffer.toString("base64"),
          },
        });
      } else {
        parts.push({ text: extractedText.slice(0, 20000) });
      }
      parts.push({
        text: `Extrae una guía interactiva de trámite para alumnos de ESCOM IPN en español de México a partir del documento proporcionado. Devuelve estrictamente un JSON con:
"title": título breve del trámite,
"summary": resumen de 1 a 2 oraciones,
"steps": arreglo de objetos {"title": "...", "body": "..."},
"faqs": arreglo de objetos {"q": "...", "a": "..."}`,
      });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: parts,
        config: { responseMimeType: "application/json" },
      });
      const parsed = JSON.parse(response.text?.trim() ?? "{}") as {
        title?: string;
        summary?: string;
        steps?: { title?: string; body?: string }[];
        faqs?: { q?: string; a?: string }[];
      };
      const stepsStr = (parsed.steps ?? [])
        .filter((s) => s.title && s.body)
        .map((s) => `${s.title!.replace(/\|/g, "-").trim()} | ${s.body!.replace(/\s+/g, " ").trim()}`)
        .join("\n");
      const faqsStr = (parsed.faqs ?? [])
        .filter((f) => f.q && f.a)
        .map((f) => `${f.q!.replace(/\|/g, "-").trim()} | ${f.a!.replace(/\s+/g, " ").trim()}`)
        .join("\n");
      if (stepsStr) {
        return {
          title: parsed.title?.trim() || file.name.replace(/\.[^.]+$/, ""),
          summary: parsed.summary?.trim() || "Borrador generado a partir del documento.",
          steps: stepsStr,
          faqs: faqsStr,
          notice: "Borrador extraído con Google GenAI. Revisa y edita los pasos antes de publicar.",
        };
      }
    } catch {
      // Fallback to local extraction below
    }
  }

  const fallback = heuristicParseSourceText(extractedText || file.name.replace(/\.[^.]+$/, ""));
  return {
    ...fallback,
    title: fallback.title || file.name.replace(/\.[^.]+$/, ""),
    notice:
      "Borrador estructurado generado localmente a partir del archivo. Revisa y ajusta los pasos antes de publicar.",
  };
}

async function uploadGuideAttachment(
  userId: string,
  form: FormData,
): Promise<{ url: string | null; name: string | null } | { error: string }> {
  const file = form.get("attachment");
  if (!(file instanceof File) || file.size === 0) return { url: null, name: null };
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "El formato descargable adjunto (RF-12) debe ser un archivo PDF." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "El PDF adjunto debe pesar 10 MB o menos." };
  }
  const path = `${userId}/guides/${randomBytes(10).toString("hex")}.pdf`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.storage.from("public-media").upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) return { error: "No se pudo subir el PDF adjunto a Supabase Storage." };
  const { data } = supabase.storage.from("public-media").getPublicUrl(path);
  return { url: data.publicUrl, name: file.name.slice(0, 120) };
}

export async function publishGuide(
  _prev: GuideState,
  form: FormData,
): Promise<GuideState> {
  const user = await getSession();
  if (!user) return { error: "Entra para publicar una guía." };
  if (!isStaff(user.role)) {
    return { error: "Solo moderación y administración pueden publicar guías." };
  }

  const area = String(form.get("area") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const summary = String(form.get("summary") ?? "").trim();
  const stepsRaw = String(form.get("steps") ?? "");
  const faqsRaw = String(form.get("faqs") ?? "");

  if (!isArea(area)) return { error: "Elige un área válida." };
  if (user.role !== "admin" && user.area !== area) return { error: "Solo puedes publicar guías de tu área." };
  if (title.length < 4 || title.length > 180) {
    return { error: "El título debe tener entre 4 y 180 caracteres." };
  }
  if (summary.length < 8 || summary.length > 800) {
    return { error: "Escribe un resumen breve de la guía." };
  }

  const stepsParsed = parsePairs(stepsRaw, "pasos");
  if ("error" in stepsParsed) return { error: stepsParsed.error };
  if (!stepsParsed.pairs.length) return { error: "Agrega al menos un paso." };
  const pairs = stepsParsed.pairs;
  if (pairs.length > 30) return { error: "Una guía puede tener hasta 30 pasos." };

  const steps: GuideStep[] = pairs.map((pair) => ({
    title: pair.left.slice(0, 160),
    body: pair.right.slice(0, 2000),
  }));

  let faqs: GuideFaq[] = [];
  if (faqsRaw.trim()) {
    const faqsParsed = parsePairs(faqsRaw, "preguntas");
    if ("error" in faqsParsed) return { error: faqsParsed.error };
    const faqPairs = faqsParsed.pairs;
    faqs = faqPairs.map((pair) => ({
      q: pair.left.slice(0, 200),
      a: pair.right.slice(0, 2000),
    }));
  }

  const uploaded = await uploadGuideAttachment(user.id, form);
  if ("error" in uploaded) return { error: uploaded.error };

  const id = await withTx(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `insert into guides (author_id, area, title, summary, steps, faqs, attachment_url, attachment_name)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8) returning id`,
      [user.id, area, title, summary, JSON.stringify(steps), JSON.stringify(faqs), uploaded.url, uploaded.name],
    );
    const guideId = inserted.rows[0].id;
    await client.query(
      `insert into guide_versions (guide_id, version, edited_by, title, summary, steps, faqs, change_note)
       select id, version, $2, title, summary, steps, faqs, 'Publicación inicial' from guides where id = $1`,
      [guideId, user.id],
    );
    return guideId;
  });
  await audit(user.id, "guide.create", "guides", id, title);
  revalidatePath("/guias");
  redirect(`/guias/${id}`);
}

export async function editGuide(_prev: GuideState, form: FormData): Promise<GuideState> {
  const user = await getSession();
  const id = String(form.get("id") ?? "");
  const expectedVersion = Number(form.get("version"));
  const title = String(form.get("title") ?? "").trim();
  const summary = String(form.get("summary") ?? "").trim();
  const stepsJson = String(form.get("steps_json") ?? "");
  const faqsJson = String(form.get("faqs_json") ?? "");

  if (!user || !isStaff(user.role) || !isUuid(id)) return { error: "No tienes permiso para editar esta guía." };
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return { error: "Recarga la guía antes de editarla." };
  if (title.length < 4 || title.length > 180 || summary.length < 8 || summary.length > 800) return { error: "Revisa la longitud del título y del resumen." };

  const uploaded = await uploadGuideAttachment(user.id, form);
  if ("error" in uploaded) return { error: uploaded.error };

  const result = await withTx(async (client) => {
    const found = await client.query<{ area: string; version: number; steps: unknown; faqs: unknown }>(
      "select area, version, steps, faqs from guides where id = $1 for update", [id],
    );
    const guide = found.rows[0];
    if (!guide || (user.role !== "admin" && user.area !== guide.area)) return "permission";
    if (guide.version !== expectedVersion) return "version";

    let steps: GuideStep[] = [];
    if (stepsJson) {
      try {
        const parsed = JSON.parse(stepsJson) as { title?: string; body?: string }[];
        if (Array.isArray(parsed)) {
          steps = parsed.map((s) => ({
            title: String(s.title ?? "").trim(),
            body: String(s.body ?? "").trim(),
          }));
        }
      } catch {
        return "steps";
      }
    } else {
      steps = asSteps(guide.steps).map((_, index) => ({
        title: String(form.get(`step_title_${index}`) ?? "").trim(),
        body: String(form.get(`step_body_${index}`) ?? "").trim(),
      }));
    }

    if (!steps.length || steps.length > 30 || steps.some((step) => !step.title || step.title.length > 160 || !step.body || step.body.length > 2000)) {
      return "steps";
    }

    let faqs: GuideFaq[] = [];
    if (faqsJson) {
      try {
        const parsedFaqs = JSON.parse(faqsJson) as { q?: string; a?: string }[];
        if (Array.isArray(parsedFaqs)) {
          faqs = parsedFaqs
            .map((f) => ({ q: String(f.q ?? "").trim(), a: String(f.a ?? "").trim() }))
            .filter((f) => f.q && f.a);
        }
      } catch {
        return "steps";
      }
    }

    await client.query(
      `insert into guide_versions (guide_id, version, edited_by, title, summary, steps, faqs, change_note)
       select id, version, $2, title, summary, steps, faqs, 'Versión anterior' from guides where id = $1
       on conflict (guide_id, version) do nothing`, [id, user.id],
    );
    await client.query(
      `update guides
          set title = $2,
              summary = $3,
              steps = $4::jsonb,
              faqs = $5::jsonb,
              attachment_url = coalesce($6, attachment_url),
              attachment_name = coalesce($7, attachment_name),
              version = version + 1,
              updated_at = now()
        where id = $1`,
      [id, title, summary, JSON.stringify(steps), JSON.stringify(faqs), uploaded.url, uploaded.name],
    );
    await client.query(
      `insert into guide_versions (guide_id, version, edited_by, title, summary, steps, faqs, change_note)
       select id, version, $2, title, summary, steps, faqs, 'Edición de guía' from guides where id = $1`, [id, user.id],
    );
    return "ok";
  });
  if (result === "permission") return { error: "No tienes permiso para editar esta guía." };
  if (result === "version") return { error: "La guía cambió mientras la editabas. Recarga para ver la versión actual." };
  if (result === "steps") return { error: "Completa el título y el texto de cada paso dentro de los límites indicados." };
  await audit(user.id, "guide.edit", "guides", id, title);
  revalidatePath("/guias");
  revalidatePath(`/guias/${id}`);
  redirect(`/guias/${id}`);
}

export async function suggestImprovement(
  _prev: SuggestState,
  form: FormData,
): Promise<SuggestState> {
  const user = await getSession();
  if (!user) return { error: "Entra para sugerir una mejora." };

  const guideId = String(form.get("guideId") ?? "");
  const stepIndex = Number(form.get("stepIndex"));
  const body = String(form.get("body") ?? "").trim();

  if (!isUuid(guideId)) return { error: "No encontramos esa guía." };
  if (!Number.isInteger(stepIndex) || stepIndex < 0) {
    return { error: "Elige un paso válido." };
  }
  if (body.length < 10 || body.length > 2000) {
    return { error: "Describe la mejora con al menos 10 caracteres." };
  }

  const guide = await pool.query<{ steps: unknown }>(
    "select steps from guides where id = $1",
    [guideId],
  );
  const steps = asSteps(guide.rows[0]?.steps);
  if (!guide.rows[0] || stepIndex >= steps.length) {
    return { error: "Ese paso ya no está en la guía." };
  }

  const inserted = await pool.query<{ id: string }>(
    `insert into guide_suggestions (guide_id, user_id, step_index, body, status)
     values ($1, $2, $3, $4, 'pendiente')
     returning id`,
    [guideId, user.id, stepIndex, body],
  );
  await audit(user.id, "guide.suggest", "guide_suggestions", inserted.rows[0].id, body);
  revalidatePath(`/guias/${guideId}`);
  redirect(`/guias/${guideId}`);
}

export async function reviewSuggestion(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  if (!isStaff(user.role)) redirect("/guias");

  const id = String(form.get("id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const reviewNote = String(form.get("review_note") ?? "").trim().slice(0, 500);
  if (!isUuid(id) || (decision !== "aceptar" && decision !== "rechazar")) {
    redirect("/guias");
  }

  const reviewed = await withTx(async (client) => {
    const suggestion = await client.query<{
      id: string;
      guide_id: string;
      user_id: string;
      step_index: number;
      body: string;
      status: string;
    }>(
      `select id, guide_id, user_id, step_index, body, status
       from guide_suggestions
       where id = $1
       for update`,
      [id],
    );
    const row = suggestion.rows[0];
    if (!row) return null;
    if (row.status !== "pendiente") {
      return { guideId: row.guide_id, authorId: row.user_id, action: null };
    }

    if (decision === "rechazar") {
      await client.query(
        `update guide_suggestions
            set status = 'rechazada',
                reviewed_by = $2,
                reviewed_at = now(),
                review_note = $3
          where id = $1`,
        [id, user.id, reviewNote || "No fue posible aplicar la sugerencia en esta versión."],
      );
      return { guideId: row.guide_id, authorId: row.user_id, action: "guide.suggestion.reject" as const };
    }

    const guide = await client.query<{ steps: unknown }>(
      "select steps from guides where id = $1 for update",
      [row.guide_id],
    );
    const steps = asSteps(guide.rows[0]?.steps);
    const step = steps[row.step_index];
    if (!step) return null;

    const note = `Nota: ${row.body.trim()}`;
    step.body = step.body.trim() ? `${step.body.trim()}\n\n${note}` : note;
    await client.query(
      `insert into guide_versions (guide_id, version, edited_by, title, summary, steps, faqs, change_note)
       select id, version, $2, title, summary, steps, faqs, 'Versión anterior' from guides where id = $1
       on conflict (guide_id, version) do nothing`,
      [row.guide_id, user.id],
    );
    await client.query("update guides set steps = $2::jsonb, version = version + 1, updated_at = now() where id = $1", [
      row.guide_id,
      JSON.stringify(steps),
    ]);
    await client.query(
      `insert into guide_versions (guide_id, version, edited_by, title, summary, steps, faqs, change_note)
       select id, version, $2, title, summary, steps, faqs, $3 from guides where id = $1`,
      [row.guide_id, user.id, `Sugerencia aceptada en el paso ${row.step_index + 1}`],
    );
    await client.query(
      `update guide_suggestions
          set status = 'aceptada',
              reviewed_by = $2,
              reviewed_at = now(),
              review_note = $3
        where id = $1`,
      [id, user.id, reviewNote || null],
    );
    return { guideId: row.guide_id, authorId: row.user_id, action: "guide.suggestion.accept" as const };
  });

  if (!reviewed) redirect("/guias");
  if (reviewed.action) {
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("notify_user_event", {
      p_user_id: reviewed.authorId,
      p_category: "guias",
      p_title: reviewed.action === "guide.suggestion.accept" ? "Tu sugerencia fue aceptada" : "Tu sugerencia fue revisada",
      p_body:
        reviewed.action === "guide.suggestion.accept"
          ? reviewNote || "Se incorporó tu aporte en la guía y apareces como colaborador."
          : reviewNote || "El área revisó tu sugerencia y dejó una nota.",
      p_href: `/guias/${reviewed.guideId}`,
    });
    await audit(user.id, reviewed.action, "guide_suggestions", id, reviewNote || undefined);
  }
  revalidatePath("/guias");
  revalidatePath(`/guias/${reviewed.guideId}`);
  redirect(`/guias/${reviewed.guideId}`);
}

export async function askStepQuestion(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const guideId = String(form.get("guideId") ?? "");
  const stepIndex = Number(form.get("stepIndex"));
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (!isUuid(guideId) || !Number.isInteger(stepIndex) || stepIndex < 0 || title.length < 5 || title.length > 160 || body.length < 10 || body.length > 1600) {
    redirect(isUuid(guideId) ? `/guias/${guideId}?error=pregunta` : "/guias");
  }
  const guide = await pool.query<{ steps: unknown }>("select steps from guides where id = $1", [guideId]);
  if (!guide.rows[0] || stepIndex >= asSteps(guide.rows[0].steps).length) redirect("/guias");
  const result = await pool.query<{ id: string }>(
    `insert into guide_step_questions (guide_id, step_index, author_id, title, body)
     values ($1, $2, $3, $4, $5) returning id`,
    [guideId, stepIndex, user.id, title, body],
  );
  await audit(user.id, "guide.question.create", "guide_step_questions", result.rows[0].id, title);
  revalidatePath(`/guias/${guideId}`);
  redirect(`/guias/${guideId}#paso-${stepIndex + 1}`);
}

export async function answerStepQuestion(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const questionId = String(form.get("questionId") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!isUuid(questionId) || body.length < 5 || body.length > 2000) redirect("/guias");
  const question = await pool.query<{ id: string; guide_id: string; area: string; status: string }>(
    `select q.id, q.guide_id, g.area, q.status from guide_step_questions q
     join guides g on g.id = q.guide_id where q.id = $1`, [questionId],
  );
  const row = question.rows[0];
  if (!row || row.status === "cerrada") redirect("/guias");
  const official = user.role === "admin" || (user.role === "moderador" && user.area === row.area);
  const inserted = await pool.query<{ id: string }>(
    `insert into guide_step_answers (question_id, author_id, body, official) values ($1, $2, $3, $4) returning id`,
    [questionId, user.id, body, official],
  );
  if (official) await pool.query("update guide_step_questions set status = 'respondida', updated_at = now() where id = $1", [questionId]);
  await audit(user.id, "guide.question.answer", "guide_step_answers", inserted.rows[0].id, official ? "respuesta oficial" : "respuesta comunitaria");
  revalidatePath(`/guias/${row.guide_id}`);
  redirect(`/guias/${row.guide_id}#pregunta-${questionId}`);
}

export async function voteGuideAnswer(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const answerId = String(form.get("answerId") ?? "");
  const helpful = String(form.get("helpful") ?? "true") === "true";
  if (!isUuid(answerId)) redirect("/guias");
  const answer = await pool.query<{ guide_id: string }>(
    `select q.guide_id from guide_step_answers a join guide_step_questions q on q.id = a.question_id where a.id = $1`, [answerId],
  );
  const guideId = answer.rows[0]?.guide_id;
  if (!guideId) redirect("/guias");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from guide_step_answer_votes where answer_id = $1 and user_id = $2", [answerId, user.id]);
    await client.query("insert into guide_step_answer_votes (answer_id, user_id, helpful) values ($1, $2, $3)", [answerId, user.id, helpful]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  revalidatePath(`/guias/${guideId}`);
  redirect(`/guias/${guideId}#respuesta-${answerId}`);
}

export async function saveGuideProgress(guideId: string, completedSteps: number[], newlyCompletedStep?: number) {
  const user = await getSession();
  if (!user || !isUuid(guideId)) return;
  const cleanSteps = [...new Set(completedSteps.filter((n) => Number.isInteger(n) && n >= 0 && n < 30))].sort((a, b) => a - b);
  await pool.query(
    `insert into guide_progress (user_id, guide_id, completed_steps, updated_at)
     values ($1, $2, $3::jsonb, now())
     on conflict (user_id, guide_id) do update
       set completed_steps = excluded.completed_steps,
           updated_at = now()`,
    [user.id, guideId, JSON.stringify(cleanSteps)],
  );
  if (newlyCompletedStep !== undefined && Number.isInteger(newlyCompletedStep) && newlyCompletedStep >= 0 && newlyCompletedStep < 30) {
    await pool.query(
      "insert into guide_analytics_events (guide_id, user_id, event_type, step_index) values ($1, $2, 'step_complete', $3)",
      [guideId, user.id, newlyCompletedStep],
    );
  }
}

export async function trackGuideStep(guideId: string, stepIndex: number) {
  await saveGuideProgress(guideId, [stepIndex], stepIndex);
}

export async function deleteGuide(form: FormData) {
  const user = await getSession();
  const id = String(form.get("id") ?? "");
  if (!user || !isUuid(id)) redirect("/guias");
  const result = await pool.query("delete from guides where id = $1 and (author_id = $2 or $3::boolean) returning id", [
    id,
    user.id,
    user.role === "admin",
  ]);
  if (result.rowCount) await audit(user.id, "guide.delete", "guides", id);
  revalidatePath("/guias");
  redirect("/guias");
}

export async function deleteSuggestion(form: FormData) {
  const user = await getSession();
  const id = String(form.get("id") ?? "");
  const guideId = String(form.get("guideId") ?? "");
  if (!user || !isUuid(id) || !isUuid(guideId)) redirect("/guias");
  const result = await pool.query("delete from guide_suggestions where id = $1 and guide_id = $2 returning id", [id, guideId]);
  if (result.rowCount) await audit(user.id, "guide.suggestion.delete", "guide_suggestions", id);
  revalidatePath(`/guias/${guideId}`);
  redirect(`/guias/${guideId}`);
}
