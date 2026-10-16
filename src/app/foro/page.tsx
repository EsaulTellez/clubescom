import Link from "next/link";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, btnGhost, card } from "@/lib/ui";
import { publishQuestion, toggleVote } from "./actions";
import { QuestionForm } from "./question-form";
import { AREAS, areaLabel, firstParam, formatDate, isArea, voteLabel } from "./shared";

export const dynamic = "force-dynamic";

type QuestionRow = {
  id: string;
  area: string;
  title: string;
  created_at: Date;
  author_name: string;
  votes: number;
  voted: boolean;
};

export default async function ForoPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string | string[] }>;
}) {
  const areaParam = firstParam((await searchParams).area);
  const area = areaParam && isArea(areaParam) ? areaParam : null;
  const user = await getSession();

  let questions: QuestionRow[] = [];
  let dbDown = false;
  try {
    const result = await pool.query<QuestionRow>(
      `select q.id, q.area, q.title, q.created_at, u.name as author_name,
              count(v.user_id)::int as votes,
              coalesce(bool_or(v.user_id = $2::uuid), false) as voted
       from questions q
       join users u on u.id = q.author_id
       left join question_votes v on v.question_id = q.id
       where ($1::text is null or q.area = $1)
       group by q.id, u.name
       order by count(v.user_id) desc, q.created_at desc`,
      [area, user?.id ?? null],
    );
    questions = result.rows;
  } catch {
    dbDown = true;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Foro</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#667085]">
          Dudas de gestión escolar, becas, el CATT y temas generales. Las más votadas aparecen primero.
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link href="/foro" className={area ? btnGhost : btn}>
          Todas
        </Link>
        {AREAS.map((item) => (
          <Link
            key={item.id}
            href={`/foro?area=${item.id}`}
            className={area === item.id ? btn : btnGhost}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {dbDown && (
        <p className={card}>
          No se pudo leer el foro. Revisa que Postgres esté en marcha.
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          {questions.map((question) => (
            <article key={question.id} className={card}>
              <p className="text-xs uppercase tracking-wide text-[#006699]">
                {areaLabel(question.area)}
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                <Link href={`/foro/${question.id}`} className="hover:underline">
                  {question.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-[#667085]">
                {question.author_name} · {formatDate(question.created_at)}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium">{voteLabel(Number(question.votes))}</p>
                {user && (
                  <form action={toggleVote}>
                    <input type="hidden" name="questionId" value={question.id} />
                    <button className={question.voted ? btn : btnGhost}>
                      {question.voted ? "Quitar voto" : "Votar"}
                    </button>
                  </form>
                )}
              </div>
            </article>
          ))}
          {!dbDown && questions.length === 0 && (
            <p className={card}>
              {area
                ? `Todavía no hay preguntas en ${areaLabel(area)}.`
                : "Todavía no hay preguntas. Publica la primera duda de la comunidad."}
            </p>
          )}
        </div>

        <aside className={card}>
          <h2 className="font-semibold">Nueva pregunta</h2>
          {user ? (
            <div className="mt-3">
              <QuestionForm action={publishQuestion} defaultArea={area ?? undefined} />
            </div>
          ) : (
            <div className="mt-2 space-y-3 text-sm text-[#667085]">
              <p>Entra con tu correo institucional para preguntar, responder y votar.</p>
              <Link href="/entrar" className={btn}>
                Entrar
              </Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
