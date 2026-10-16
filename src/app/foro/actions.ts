"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import { audit, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isArea, isUuid } from "./shared";

export type QuestionState = {
  error?: string;
  duplicate?: { id: string; title: string };
};

export type AnswerState = { error?: string };

async function withTx<T>(fn: (client: PoolClient) => Promise<T>) {
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
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();

  if (!isArea(area)) return { error: "Elige un área válida." };
  if (title.length < 8 || title.length > 180) {
    return { error: "El título debe tener entre 8 y 180 caracteres." };
  }
  if (body.length < 10 || body.length > 5000) {
    return { error: "Explica la duda con un poco más de detalle." };
  }

  const outcome = await withTx(async (client) => {
    await client.query(
      "select set_config('pg_trgm.similarity_threshold', '0.2', true)",
    );
    const similar = await client.query<{ id: string; title: string }>(
      `select id, title
       from questions
       where title % $1 and similarity(title, $1) > 0.6
       order by similarity(title, $1) desc
       limit 1`,
      [title],
    );
    const duplicate = similar.rows[0];
    if (duplicate) return { duplicate };

    const inserted = await client.query<{ id: string }>(
      `insert into questions (author_id, area, title, body)
       values ($1, $2, $3, $4)
       returning id`,
      [user.id, area, title, body],
    );
    return { id: inserted.rows[0].id };
  });

  if ("duplicate" in outcome) return { duplicate: outcome.duplicate };

  await audit(user.id, "question.create", "questions", outcome.id, title);
  revalidatePath("/foro");
  redirect(`/foro/${outcome.id}`);
}

export async function publishAnswer(
  _prev: AnswerState,
  form: FormData,
): Promise<AnswerState> {
  const user = await getSession();
  if (!user) return { error: "Entra para responder." };

  const questionId = String(form.get("questionId") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!isUuid(questionId)) return { error: "No encontramos esa pregunta." };
  if (body.length < 10 || body.length > 5000) {
    return { error: "Escribe una respuesta de al menos 10 caracteres." };
  }

  const official = user.role === "moderador" || user.role === "admin";
  const saved = await withTx(async (client) => {
    const question = await client.query<{
      id: string;
      author_id: string;
      title: string;
    }>("select id, author_id, title from questions where id = $1", [questionId]);
    const row = question.rows[0];
    if (!row) return null;

    await client.query(
      `insert into answers (question_id, author_id, body, official)
       values ($1, $2, $3, $4)`,
      [questionId, user.id, body, official],
    );

    if (row.author_id !== user.id) {
      await client.query(
        `insert into notifications (user_id, title, body, href)
         values ($1, 'Nueva respuesta', $2, $3)`,
        [
          row.author_id,
          `Hay una nueva respuesta en «${row.title}».`,
          `/foro/${questionId}`,
        ],
      );
    }
    return row.title;
  });

  if (!saved) return { error: "No encontramos esa pregunta." };

  await audit(user.id, "answer.create", "answers", questionId, saved);
  revalidatePath(`/foro/${questionId}`);
  revalidatePath("/foro");
  redirect(`/foro/${questionId}`);
}

export async function toggleVote(form: FormData) {
  const user = await getSession();
  if (!user) redirect("/entrar");

  const questionId = String(form.get("questionId") ?? "");
  if (!isUuid(questionId)) redirect("/foro");

  const found = await pool.query("select id from questions where id = $1", [
    questionId,
  ]);
  if (!found.rowCount) redirect("/foro");

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
  await audit(
    user.id,
    voted ? "question.vote" : "question.unvote",
    "question_votes",
    questionId,
  );
  revalidatePath("/foro");
  revalidatePath(`/foro/${questionId}`);
}
