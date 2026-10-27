import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, btnGhost, card } from "@/lib/ui";
import { publishAnswer, toggleVote } from "../actions";
import { areaLabel, formatDate, isUuid, voteLabel } from "../shared";
import { AnswerForm } from "./answer-form";

export const dynamic = "force-dynamic";

type Question = {
  id: string;
  area: string;
  title: string;
  body: string;
  created_at: Date;
  author_name: string;
  votes: number;
  voted: boolean;
};

type Answer = {
  id: string;
  body: string;
  official: boolean;
  created_at: Date;
  author_name: string;
};

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const user = await getSession();
  const questionResult = await pool.query<Question>(
    `select q.id, q.area, q.title, q.body, q.created_at, u.name as author_name,
            (select count(*)::int from question_votes v where v.question_id = q.id) as votes,
            exists(
              select 1 from question_votes v
              where v.question_id = q.id and v.user_id = $2::uuid
            ) as voted
     from questions q
     join users u on u.id = q.author_id
     where q.id = $1`,
    [id, user?.id ?? null],
  );
  const question = questionResult.rows[0];
  if (!question) notFound();

  const answers = await pool.query<Answer>(
    `select a.id, a.body, a.official, a.created_at, u.name as author_name
     from answers a
     join users u on u.id = a.author_id
     where a.question_id = $1
     order by a.created_at asc`,
    [id],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/foro" className="text-sm text-[#006699] hover:underline">
        Volver al foro
      </Link>

      <article className={card}>
        <p className="text-xs uppercase tracking-wide text-[#006699]">
          {areaLabel(question.area)}
        </p>
        <h1 className="mt-1 font-serif text-4xl tracking-tight">{question.title}</h1>
        <p className="mt-1 text-sm text-[#667085]">
          {question.author_name} · {formatDate(question.created_at)}
        </p>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{question.body}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#d5e4ee] pt-4">
          <p className="text-sm font-medium">{voteLabel(Number(question.votes))}</p>
          {user ? (
            <form action={toggleVote}>
              <input type="hidden" name="questionId" value={question.id} />
              <button className={question.voted ? btn : btnGhost}>
                {question.voted ? "Quitar voto" : "Votar"}
              </button>
            </form>
          ) : (
            <Link href="/entrar" className={btnGhost}>
              Entra para votar
            </Link>
          )}
        </div>
      </article>

      <section className="space-y-3" id="respuestas">
        <h2 className="text-lg font-semibold">
          Respuestas ({answers.rowCount ?? 0})
        </h2>
        {answers.rows.length === 0 && (
          <p className={card}>
            Todavía no hay respuestas. Si ya hiciste este trámite, cuenta cómo te fue.
          </p>
        )}
        {answers.rows.map((answer) => (
          <article
            key={answer.id}
            className={`${card} ${answer.official ? "bg-[#e6f3fa]" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#006699] text-sm font-semibold text-white">
                {answer.author_name.slice(0, 1)}
              </span>
              <p className="text-sm font-medium">{answer.author_name}</p>
              {answer.official && (
                <span className="rounded-full bg-[#006699] px-2 py-0.5 text-xs font-medium text-white">
                  Respuesta oficial
                </span>
              )}
              <p className="text-xs text-[#667085]">{formatDate(answer.created_at)}</p>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{answer.body}</p>
          </article>
        ))}
      </section>

      <section className={card}>
        <h2 className="font-semibold">Responder</h2>
        {user ? (
          <div className="mt-3">
            <AnswerForm action={publishAnswer} questionId={question.id} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#667085]">
            <Link href="/entrar" className="font-medium text-[#006699] underline">
              Entra
            </Link>{" "}
            para publicar una respuesta.
          </p>
        )}
      </section>
    </div>
  );
}
