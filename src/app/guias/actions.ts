"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, getSession } from "@/lib/auth";
import { pool, type SecureClient } from "@/lib/db";
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

  const inserted = await pool.query<{ id: string }>(
    `insert into guides (author_id, area, title, summary, steps, faqs)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     returning id`,
    [user.id, area, title, summary, JSON.stringify(steps), JSON.stringify(faqs)],
  );
  const id = inserted.rows[0].id;
  await audit(user.id, "guide.create", "guides", id, title);
  revalidatePath("/guias");
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
  if (!isUuid(id) || (decision !== "aceptar" && decision !== "rechazar")) {
    redirect("/guias");
  }

  const reviewed = await withTx(async (client) => {
    const suggestion = await client.query<{
      id: string;
      guide_id: string;
      step_index: number;
      body: string;
      status: string;
    }>(
      `select id, guide_id, step_index, body, status
       from guide_suggestions
       where id = $1
       for update`,
      [id],
    );
    const row = suggestion.rows[0];
    if (!row) return null;
    if (row.status !== "pendiente") {
      return { guideId: row.guide_id, action: null };
    }

    if (decision === "rechazar") {
      await client.query(
        "update guide_suggestions set status = 'rechazada' where id = $1",
        [id],
      );
      return { guideId: row.guide_id, action: "guide.suggestion.reject" as const };
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
    await client.query("update guides set steps = $2::jsonb where id = $1", [
      row.guide_id,
      JSON.stringify(steps),
    ]);
    await client.query(
      "update guide_suggestions set status = 'aceptada' where id = $1",
      [id],
    );
    return { guideId: row.guide_id, action: "guide.suggestion.accept" as const };
  });

  if (!reviewed) redirect("/guias");
  if (reviewed.action) {
    await audit(user.id, reviewed.action, "guide_suggestions", id);
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

export async function trackGuideStep(guideId: string, stepIndex: number) {
  const user = await getSession();
  if (!user || !isUuid(guideId) || !Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex > 29) return;
  const guide = await pool.query<{ steps: unknown }>("select steps from guides where id = $1", [guideId]);
  if (!guide.rows[0] || stepIndex >= asSteps(guide.rows[0].steps).length) return;
  await pool.query(
    "insert into guide_analytics_events (guide_id, user_id, event_type, step_index) values ($1, $2, 'step_complete', $3)",
    [guideId, user.id, stepIndex],
  );
}
