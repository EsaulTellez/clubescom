"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateDraft } from "./document";
import { procedureOffice } from "@/lib/areas";
import { audit, getSession } from "@/lib/auth";
import { pool, type SecureClient } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_SOURCE_MB, validateSteps, asSteps, isArea, isStaff, isUuid, type GuideFaq, type GuideStep } from "./shared";

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

function parseFaqPairs(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const pairs: { left: string; right: string }[] = [];
  for (const line of lines) {
    const index = line.indexOf("|");
    if (index < 0) {
      return {
        error: "Cada pregunta frecuente va en una línea con el formato pregunta | respuesta.",
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

export async function parseGuideDocumentDraft(form: FormData): Promise<{
  title?: string; summary?: string; steps?: GuideStep[]; faqs?: string; notice?: string; error?: string;
}> {
  const user = await getSession();
  if (!user || (user.role !== "admin" && !procedureOffice(user))) return { error: "Solo el personal de trámites puede procesar instructivos." };
  const file = form.get("source_doc");
  if (!(file instanceof File) || !file.size) return { error: "Selecciona una foto o un documento." };
  if (file.size > MAX_SOURCE_MB * 1024 * 1024) return { error: `El archivo supera el límite de ${MAX_SOURCE_MB} MB.` };
  try {
    return await generateDraft(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/^(Usa un PDF|El archivo Word|Divide el PDF|No se distingue|El instructivo excede)/.test(message)) return { error: message };
    return { error: "No se pudo leer el archivo. Comprueba que abre correctamente o prueba con otra foto." };
  }
}

async function uploadGuideAttachment(
  userId: string,
  form: FormData,
): Promise<{ url: string | null; name: string | null } | { error: string }> {
  const file = form.get("attachment");
  if (!(file instanceof File) || file.size === 0) return { url: null, name: null };
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "El formato descargable adjunto debe ser un archivo PDF." };
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
  if (error) return { error: "No se pudo subir el PDF adjunto. Inténtalo de nuevo." };
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
  const faqsRaw = String(form.get("faqs") ?? "");

  if (!isArea(area)) return { error: "Elige un área válida." };
  if (user.role !== "admin" && user.area !== area) return { error: "Solo puedes publicar guías de tu área." };
  if (title.length < 4 || title.length > 180) {
    return { error: "El título debe tener entre 4 y 180 caracteres." };
  }
  if (summary.length < 8 || summary.length > 800) {
    return { error: "Escribe un resumen breve de la guía." };
  }

  const parsed = validateSteps(form.get("steps_json"));
  if ("error" in parsed) return { error: parsed.error };
  const steps = parsed.steps;

  let faqs: GuideFaq[] = [];
  if (faqsRaw.trim()) {
    const faqsParsed = parseFaqPairs(faqsRaw);
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
  revalidatePath("/foro");
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

    const parsed = validateSteps(stepsJson);
    if ("error" in parsed) return { error: parsed.error };
    const steps = parsed.steps;

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
  if (typeof result === "object") return result;
  if (result === "permission") return { error: "No tienes permiso para editar esta guía." };
  if (result === "version") return { error: "La guía cambió mientras la editabas. Recarga para ver la versión actual." };
  if (result === "steps") return { error: "Revisa las preguntas frecuentes." };
  await audit(user.id, "guide.edit", "guides", id, title);
  revalidatePath("/foro");
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
  if (!guide.rows[0] || !steps.some(step => step.id === stepIndex)) {
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
  redirect(`/guias/${guideId}?paso=${stepIndex}&panel=editar#ruta`);
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
      return { guideId: row.guide_id, stepId: row.step_index, authorId: row.user_id, action: null };
    }

    const guide = await client.query<{ steps: unknown; area: string; version: number }>(
      "select area, steps, version from guides where id = $1 for update", [row.guide_id],
    );
    if (!guide.rows[0] || (user.role !== "admin" && user.area !== guide.rows[0].area)) return null;
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
      return { guideId: row.guide_id, stepId: row.step_index, authorId: row.user_id, action: "guide.suggestion.reject" as const };
    }

    const steps = asSteps(guide.rows[0]?.steps);
    const step = steps.find(item => item.id === row.step_index);
    if (!step) return null;

    const revision = String(form.get("revised_body") ?? "").trim();
    const problem = revision.length < 1 || revision.length > 2000 ? "texto" :
      Number(form.get("version")) !== guide.rows[0].version ? "version" : null;
    if (problem) return { guideId: row.guide_id, stepId: row.step_index, problem };
    step.body = revision;
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
      [row.guide_id, user.id, `Sugerencia aceptada en el paso ${steps.indexOf(step) + 1}`],
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
    return { guideId: row.guide_id, stepId: row.step_index, authorId: row.user_id, action: "guide.suggestion.accept" as const };
  });

  if (!reviewed) redirect("/guias");
  if (reviewed.problem) redirect(`/guias/${reviewed.guideId}?paso=${reviewed.stepId}&revision=${reviewed.problem}#ruta`);
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
      p_href: `/guias/${reviewed.guideId}?paso=${reviewed.stepId}#ruta`,
    });
    await audit(user.id, reviewed.action, "guide_suggestions", id, reviewNote || undefined);
  }
  revalidatePath("/foro");
  revalidatePath("/guias");
  revalidatePath(`/guias/${reviewed.guideId}`);
  redirect(`/guias/${reviewed.guideId}?paso=${reviewed.stepId}#ruta`);
}

export async function answerStepQuestion(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const questionId = String(form.get("questionId") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!isUuid(questionId) || body.length < 5 || body.length > 2000) redirect("/guias");
  const question = await pool.query<{ id: string; guide_id: string; step_index: number; area: string; status: string }>(
    `select q.id, q.guide_id, q.step_index, g.area, q.status from guide_step_questions q
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
  redirect(`/guias/${row.guide_id}?paso=${row.step_index}#pregunta-${questionId}`);
}

export async function voteGuideAnswer(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const answerId = String(form.get("answerId") ?? "");
  const helpful = String(form.get("helpful") ?? "true") === "true";
  if (!isUuid(answerId)) redirect("/guias");
  const answer = await pool.query<{ guide_id: string; step_index: number }>(
    `select q.guide_id, q.step_index from guide_step_answers a join guide_step_questions q on q.id = a.question_id where a.id = $1`, [answerId],
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
  redirect(`/guias/${guideId}?paso=${answer.rows[0].step_index}#respuesta-${answerId}`);
}

export async function saveGuideProgress(guideId: string, completedSteps: number[], newlyCompletedStep?: number) {
  const user = await getSession();
  if (!user || !isUuid(guideId)) return;
  const guide = await pool.query<{ steps: unknown }>("select steps from guides where id = $1", [guideId]);
  if (!guide.rowCount) return;
  const ids = new Set(asSteps(guide.rows[0].steps).map(step => step.id));
  const cleanSteps = [...new Set(completedSteps.filter(id => ids.has(id)))];
  await pool.query(
    `insert into guide_progress (user_id, guide_id, completed_steps, updated_at)
     values ($1, $2, $3::jsonb, now())
     on conflict (user_id, guide_id) do update
       set completed_steps = excluded.completed_steps,
           updated_at = now()`,
    [user.id, guideId, JSON.stringify(cleanSteps)],
  );
  if (newlyCompletedStep !== undefined && cleanSteps.includes(newlyCompletedStep)) {
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
  revalidatePath("/foro");
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
