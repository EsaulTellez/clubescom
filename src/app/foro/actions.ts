"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asSteps } from "../guias/shared";
import { KINDS, type ClubKind } from "../clubes/format";
import { procedureOffice } from "@/lib/areas";
import { audit, getSession } from "@/lib/auth";
import { pool, type SecureClient } from "@/lib/db";
import { resolveUploadedPublicImage } from "@/lib/resolve-upload";
import { isArea, isRequestKind, isUuid, canModerateForumQuestion } from "./shared";

export type QuestionState = {
  error?: string;
  duplicate?: { id: string; title: string };
};

export type AnswerState = {
  error?: string;
  ok?: boolean;
  id?: string;
};

export type InlineAnswerItem = {
  id: string;
  questionId: string;
  authorId: string;
  body: string;
  official: boolean;
  createdAtIso: string;
  authorName: string;
  authorRole: string;
  authorArea: string | null;
  score: number;
  viewerVote: -1 | 0 | 1;
};

export async function suggestSimilarQuestions(titleRaw: string, areaRaw: string) {
  const title = titleRaw.trim().slice(0, 180);
  if (title.length < 8 || !isArea(areaRaw)) return [];
  const result = await pool.query<{ id: string; title: string; area: string; status: string; similarity: number }>(
    `select id, title, area, status, extensions.similarity(title, $1)::float8 as similarity
     from questions
     where (area = $2 and extensions.similarity(title, $1) >= 0.32)
        or extensions.similarity(title, $1) >= 0.55
     order by (status = 'respondida') desc, (area = $2) desc, similarity desc, created_at desc
     limit 4`,
    [title, areaRaw],
  );
  return result.rows;
}

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

export async function publishQuestion(
  _prev: QuestionState,
  form: FormData,
): Promise<QuestionState> {
  const user = await getSession();
  if (!user) return { error: "Entra con tu correo institucional para publicar." };

  const area = String(form.get("area") ?? "");
  const requestKindRaw = String(form.get("request_kind") ?? "pregunta");
  const requestKind = isRequestKind(requestKindRaw) ? requestKindRaw : "pregunta";
  const targetGuideRaw = String(form.get("target_guide_id") ?? "").trim();
  const rawStep = form.get("target_step_index");
  const stepId = rawStep === null ? null : Number(rawStep);
  const targetGuideId = isUuid(targetGuideRaw) ? targetGuideRaw : null;
  if (rawStep !== null && (!targetGuideId || requestKind !== "pregunta" || !/^\d+$/.test(String(rawStep)) || !Number.isSafeInteger(stepId))) return { error: "El paso seleccionado no es válido." };
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const clubKindRaw = String(form.get("club_kind") ?? "academico").trim();
  const clubKind: ClubKind = KINDS.includes(clubKindRaw as ClubKind) ? (clubKindRaw as ClubKind) : "academico";

  const office = procedureOffice(user);
  if (office && (office !== area || !["pregunta", "actualizar_guia"].includes(requestKind))) {
    return { error: "Elige un trámite de tu área." };
  }
  if (!isArea(area)) return { error: "Elige un área válida." };
  if (title.length < 8 || title.length > 180) {
    return { error: "El título debe tener entre 8 y 180 caracteres." };
  }
  if (body.length < 10 || body.length > 5000) {
    return { error: "Explica la duda o solicitud con un poco más de detalle." };
  }

  const uploaded = await resolveUploadedPublicImage(form, "image", user.id, "forum");
  if ("error" in uploaded) return { error: uploaded.error };

  const outcome = await withTx(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1::text, 0))", [user.id]);
    let effectiveArea = area;
    if (targetGuideId) {
      const guide = await client.query<{ area: string; steps: unknown }>("select area, steps from guides where id = $1", [targetGuideId]);
      const foundGuide = guide.rows[0];
      if (!foundGuide || (stepId !== null && !asSteps(foundGuide.steps).some((s) => s.id === stepId))) {
        return { error: "La guía o el paso cambiaron. Vuelve a abrir la guía." };
      }
      if (requestKind === "actualizar_guia" && isArea(foundGuide.area)) {
        effectiveArea = foundGuide.area;
      } else if (foundGuide.area !== area) {
        return { error: "La guía pertenece a un área distinta." };
      }
    }
    const settingRes = await client.query<{ value_int: number }>(
      "select value_int from system_settings where key = 'forum_cooldown_minutes'",
    );
    const cooldownMinutes = settingRes.rows[0]?.value_int ?? 20;
    const cooldown = await client.query<{ seconds: number }>(
      `select ceil(extract(epoch from (max(created_at) + ($2::text || ' minutes')::interval - now())))::int as seconds
       from questions where author_id = $1
       having max(created_at) > now() - ($2::text || ' minutes')::interval`,
      [user.id, cooldownMinutes],
    );
    if (cooldown.rows[0]) return { cooldownSeconds: cooldown.rows[0].seconds };

    await client.query(
      "select set_config('pg_trgm.similarity_threshold', '0.2', true)",
    );
    const similar = await client.query<{ id: string; title: string }>(
      `select id, title
       from questions
       where title % $1 and extensions.similarity(title, $1) > 0.6
         and ($2::integer is null or (target_guide_id = $3 and target_step_index = $2))
       order by extensions.similarity(title, $1) desc
       limit 1`,
      [title, stepId, targetGuideId],
    );
    const duplicate = similar.rows[0];
    if (duplicate) return { duplicate };

    let clubProposalId: string | null = null;
    if (requestKind === "nuevo_club" && user.role === "alumno") {
      const proposalName = title.slice(0, 120);
      const proposalObj = body.slice(0, 2000);
      const createdProp = await client.query<{ id: string }>(
        `insert into club_proposals (proposer_id, name, kind, description, objectives, last_proposer_activity_at)
         values ($1, $2, $3, $4, $5, now())
         returning id`,
        [user.id, proposalName, clubKind, proposalObj, proposalObj],
      );
      clubProposalId = createdProp.rows[0]?.id ?? null;
    }

    const inserted = await client.query<{ id: string }>(
      `insert into questions (author_id, area, title, body, image_url, request_kind, target_guide_id, target_step_index, club_proposal_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [user.id, effectiveArea, title, body, uploaded.url, requestKind, targetGuideId, stepId, clubProposalId],
    );
    return { id: inserted.rows[0].id, clubProposalId };
  });

  if ("error" in outcome) return { error: outcome.error };
  if ("cooldownSeconds" in outcome && outcome.cooldownSeconds !== undefined) {
    const minutes = Math.max(1, Math.ceil(outcome.cooldownSeconds / 60));
    return { error: `Espera ${minutes} minuto${minutes === 1 ? "" : "s"} antes de publicar otra pregunta.` };
  }
  if ("duplicate" in outcome) return { duplicate: outcome.duplicate };

  await audit(user.id, "question.create", "questions", outcome.id, title);
  revalidatePath("/");
  revalidatePath("/foro");
  if (targetGuideId) {
    revalidatePath(`/guias/${targetGuideId}`);
  }
  if (outcome.clubProposalId) {
    revalidatePath("/clubes");
    revalidatePath(`/clubes/propuestas/${outcome.clubProposalId}`);
  }
  if (String(form.get("stay_in_guide") ?? "") === "1" && targetGuideId && stepId !== null) {
    redirect(`/guias/${targetGuideId}?paso=${stepId}#mini-foro`);
  }
  redirect(`/foro?duda=${outcome.id}#duda-${outcome.id}`);
}

export async function publishAnswerInline(
  questionId: string,
  bodyRaw: string,
): Promise<{ ok: true; id: string; answer: InlineAnswerItem } | { error: string }> {
  const user = await getSession();
  if (!user) return { error: "Entra con tu correo institucional para responder." };

  const body = bodyRaw.trim();
  if (!isUuid(questionId)) return { error: "No encontramos esa pregunta." };
  if (body.length < 10 || body.length > 5000) {
    return { error: "Escribe una respuesta de al menos 10 caracteres." };
  }

  const saved = await withTx(async (client) => {
    const question = await client.query<{
      id: string;
      author_id: string;
      title: string;
      area: string;
      request_kind: string;
      status: string;
    }>("select id, author_id, title, area, request_kind, status from questions where id = $1", [questionId]);
    const row = question.rows[0];
    if (!row) return null;
    if (row.status === "cerrada") return { closed: true as const };
    const official = canModerateForumQuestion(user, row.area, row.request_kind);

    const inserted = await client.query<{ id: string; created_at: Date }>(
      `insert into answers (question_id, author_id, body, official)
       values ($1, $2, $3, $4)
       returning id, created_at`,
      [questionId, user.id, body, official],
    );
    const ans = inserted.rows[0];
    return {
      title: row.title,
      id: ans.id,
      official,
      createdAtIso: new Date(ans.created_at).toISOString(),
    };
  });

  if (!saved) return { error: "No encontramos esa pregunta." };
  if ("closed" in saved) return { error: "Esta publicación está cerrada y ya no admite más respuestas." };

  await audit(user.id, "answer.create", "answers", questionId, saved.title);
  revalidatePath("/foro");
  revalidatePath("/");

  return {
    ok: true,
    id: saved.id,
    answer: {
      id: saved.id,
      questionId,
      authorId: user.id,
      body,
      official: saved.official,
      createdAtIso: saved.createdAtIso,
      authorName: user.name,
      authorRole: user.role,
      authorArea: user.area,
      score: 0,
      viewerVote: 0,
    },
  };
}

export async function publishAnswer(
  _prev: AnswerState,
  form: FormData,
): Promise<AnswerState> {
  const questionId = String(form.get("questionId") ?? "");
  const body = String(form.get("body") ?? "");
  const res = await publishAnswerInline(questionId, body);
  if ("error" in res) return { error: res.error };
  return { ok: true, id: res.id };
}

export async function toggleQuestionVote(
  questionId: string,
): Promise<{ ok: true; votes: number; voted: boolean } | { error: string }> {
  const user = await getSession();
  if (!user) return { error: "Entra con tu correo institucional para votar." };
  if (!isUuid(questionId)) return { error: "Pregunta inválida." };

  const found = await pool.query<{ id: string; club_proposal_id: string | null }>(
    "select id, club_proposal_id from questions where id = $1",
    [questionId],
  );
  const questionRow = found.rows[0];
  if (!questionRow) return { error: "No encontramos esa pregunta." };

  const result = await pool.query<{ voted: boolean }>(
    `with deleted as (
       delete from question_votes
       where question_id = $1 and user_id = $2
       returning question_id
     ),
     inserted as (
       insert into question_votes (question_id, user_id)
       select $1::uuid, $2::uuid
       where not exists (select 1 from deleted)
       returning question_id
     )
     select exists(select 1 from inserted) as voted`,
    [questionId, user.id],
  );

  const voted = result.rows[0]?.voted ?? false;

  // Si la publicación está vinculada a una propuesta de club y el usuario es alumno, sincronizar voto en club_interests
  if (questionRow.club_proposal_id && user.role === "alumno") {
    try {
      if (voted) {
        await pool.query(
          `insert into club_interests (proposal_id, user_id)
           select p.id, $2::uuid
             from club_proposals p
            where p.id = $1
              and p.status = 'abierta'
              and p.proposer_id <> $2::uuid
           on conflict do nothing`,
          [questionRow.club_proposal_id, user.id],
        );
      } else {
        await pool.query(
          `delete from club_interests ci
            using club_proposals p
           where ci.proposal_id = $1
             and ci.user_id = $2
             and p.id = ci.proposal_id
             and p.status in ('abierta', 'en_documentacion', 'en_validacion', 'incompleta')`,
          [questionRow.club_proposal_id, user.id],
        );
      }
      revalidatePath("/clubes");
      revalidatePath(`/clubes/propuestas/${questionRow.club_proposal_id}`);
    } catch {
      /* Si la propuesta ya avanzó o cerró votación, el voto del foro se conserva sin error */
    }
  }

  const countRes = await pool.query<{ votes: number }>(
    "select count(*)::int as votes from question_votes where question_id = $1",
    [questionId],
  );

  const votes = countRes.rows[0]?.votes ?? 0;
  await audit(
    user.id,
    voted ? "question.vote" : "question.unvote",
    "question_votes",
    questionId,
  );
  revalidatePath("/foro");
  revalidatePath("/");
  return { ok: true, votes, voted };
}

export async function toggleVote(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");

  const questionId = String(form.get("questionId") ?? "");
  if (!isUuid(questionId)) redirect("/foro");
  await toggleQuestionVote(questionId);
}

export async function voteForumAnswer(
  answerId: string,
  direction: 1 | -1,
): Promise<{ ok: true; score: number; viewerVote: -1 | 0 | 1 } | { error: string }> {
  const user = await getSession();
  if (!user) return { error: "Entra con tu correo institucional para votar." };
  if (!isUuid(answerId) || (direction !== 1 && direction !== -1)) {
    return { error: "Solicitud de voto inválida." };
  }

  const outcome = await withTx(async (client) => {
    const ansRes = await client.query<{ id: string }>(
      "select id from answers where id = $1",
      [answerId],
    );
    if (!ansRes.rowCount) return null;

    const existing = await client.query<{ vote: number }>(
      "select vote from answer_votes where answer_id = $1 and user_id = $2",
      [answerId, user.id],
    );
    const prevVote = existing.rows[0]?.vote ?? 0;

    let viewerVote: -1 | 0 | 1 = direction;
    if (prevVote === direction) {
      await client.query(
        "delete from answer_votes where answer_id = $1 and user_id = $2",
        [answerId, user.id],
      );
      viewerVote = 0;
    } else {
      await client.query(
        `insert into answer_votes (answer_id, user_id, vote)
         values ($1, $2, $3)
         on conflict (answer_id, user_id) do update set vote = excluded.vote`,
        [answerId, user.id, direction],
      );
    }

    const scoreRes = await client.query<{ score: number }>(
      "select coalesce(sum(vote), 0)::int as score from answer_votes where answer_id = $1",
      [answerId],
    );
    return { score: scoreRes.rows[0]?.score ?? 0, viewerVote };
  });

  if (!outcome) return { error: "No encontramos esa respuesta." };

  await audit(
    user.id,
    outcome.viewerVote === 0 ? "answer.unvote" : "answer.vote",
    "answer_votes",
    answerId,
    String(outcome.viewerVote),
  );
  revalidatePath("/foro");
  return { ok: true, score: outcome.score, viewerVote: outcome.viewerVote };
}

export async function toggleQuestionPinById(
  questionId: string,
): Promise<{ ok: true; isPinned: boolean } | { error: string }> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para moderar." };
  if (!isUuid(questionId)) return { error: "Pregunta inválida." };

  const qRes = await pool.query<{ area: string; request_kind: string; is_pinned: boolean }>(
    "select area, request_kind, is_pinned from questions where id = $1",
    [questionId],
  );
  const q = qRes.rows[0];
  if (!q) return { error: "Pregunta no encontrada." };
  if (!canModerateForumQuestion(user, q.area, q.request_kind)) {
    return { error: "Sin permisos para moderar esta área." };
  }

  const next = !q.is_pinned;
  await pool.query("update questions set is_pinned = $1, updated_at = now() where id = $2", [
    next,
    questionId,
  ]);
  await audit(user.id, next ? "fijar_pregunta" : "desfijar_pregunta", "questions", questionId);
  revalidatePath("/foro");
  revalidatePath("/");
  return { ok: true, isPinned: next };
}

export async function toggleQuestionPin(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const questionId = String(form.get("questionId") ?? "");
  if (!isUuid(questionId)) redirect("/foro");
  await toggleQuestionPinById(questionId);
  redirect(`/foro?duda=${questionId}#duda-${questionId}`);
}

export async function markAnswerOfficialById(
  questionId: string,
  answerId: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para oficializar respuestas." };
  if (!isUuid(questionId) || !isUuid(answerId)) return { error: "Datos inválidos." };

  const qRes = await pool.query<{ area: string; request_kind: string }>(
    "select area, request_kind from questions where id = $1",
    [questionId],
  );
  const q = qRes.rows[0];
  if (!q) return { error: "Pregunta no encontrada." };
  if (!canModerateForumQuestion(user, q.area, q.request_kind)) {
    return { error: "Sin permisos para oficializar en esta área." };
  }

  await pool.query(
    "update answers set official = true where id = $1 and question_id = $2",
    [answerId, questionId],
  );
  await audit(user.id, "oficializar_respuesta", "answers", answerId, questionId);
  revalidatePath("/foro");
  revalidatePath("/");
  return { ok: true };
}

export async function markAnswerOfficial(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const questionId = String(form.get("questionId") ?? "");
  const answerId = String(form.get("answerId") ?? "");
  if (!isUuid(questionId) || !isUuid(answerId)) redirect("/foro");
  await markAnswerOfficialById(questionId, answerId);
  redirect(`/foro?duda=${questionId}#duda-${questionId}`);
}
