import Link from "next/link";
import { RealtimeRefresh } from "@/components/realtime-refresh";
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
  has_official: boolean;
  answer_count: number;
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
              (select count(*)::int from answers a where a.question_id = q.id) as answer_count,
              exists (select 1 from answers a where a.question_id = q.id and a.official) as has_official,
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
    <div className="board-page">
      <RealtimeRefresh tables={["questions", "answers", "question_votes"]} />

      <div className="board-feed__bar">
        <strong>Elige el pizarrón por tema</strong>
        <span className="hidden text-xs text-[#647780] sm:inline">Ordenadas por votos y fecha</span>
      </div>

      <nav className="board-tag-row" aria-label="Filtrar preguntas por área">
        <Link href="/foro" aria-current={!area ? "page" : undefined} className={!area ? btn : btnGhost}>Todas</Link>
        {AREAS.map((item) => (
          <Link
            key={item.id}
            href={`/foro?area=${item.id}`}
            aria-current={area === item.id ? "page" : undefined}
            className={area === item.id ? btn : btnGhost}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {dbDown && (
        <p className={card} role="status">No se pudo conectar con los datos locales. Inicia los servicios del proyecto y vuelve a cargar.</p>
      )}

      <div className="board-forum-layout">
        <section id="preguntas" className="scroll-mt-28" aria-labelledby="questions-heading">
          <div className="board-section-heading">
            <div>
              <p className="board-eyebrow">Pizarrón de la comunidad</p>
              <h2 id="questions-heading">Dudas compartidas</h2>
              <p>Vota por lo que también necesitas saber.</p>
            </div>
            <span className="board-label">{questions.length} {questions.length === 1 ? "pregunta" : "preguntas"}</span>
          </div>

          <div className="board-forum-list">
            {questions.map((question) => (
              <article key={question.id} className="board-discussion">
                <div className="board-vote" aria-label={`${question.votes} votos`}>
                  <strong>{question.votes}</strong>
                  <span>votos</span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2"><span className="board-label">{areaLabel(question.area)}</span><span className="board-label">{question.has_official ? "Respuesta oficial" : "Sin respuesta oficial"}</span></div>
                  <h2><Link href={`/foro/${question.id}`}>{question.title}</Link></h2>
                  <p className="board-discussion__meta">Publicó {question.author_name} · {formatDate(question.created_at)}</p>
                  <div className="board-discussion__footer">
                    <p className="m-0 text-xs font-bold text-[#47616d]">{voteLabel(Number(question.votes))} · {question.answer_count} {question.answer_count === 1 ? "respuesta" : "respuestas"}</p>
                    {user && (
                      <form action={toggleVote}>
                        <input type="hidden" name="questionId" value={question.id} />
                        <button className={question.voted ? btn : btnGhost} aria-pressed={question.voted}>
                          {question.voted ? "Quitar voto" : "Votar"}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </article>
            ))}
            {!dbDown && questions.length === 0 && (
              <p className={`${card} text-sm text-[#5f6e78]`}>
                {area ? `Todavía no hay preguntas en ${areaLabel(area)}.` : "Todavía no hay preguntas. Puedes iniciar la conversación."}
              </p>
            )}
          </div>
        </section>

        <aside id="new-question" className="board-sidecard board-form-anchor scroll-mt-28">
          <p className="board-eyebrow">Abre la conversación</p>
          <h2>Nueva pregunta</h2>
          {user ? (
            <div className="mt-3"><QuestionForm action={publishQuestion} defaultArea={area ?? undefined} /></div>
          ) : (
            <div className="mt-2 space-y-3 text-sm leading-6 text-[#5f6e78]">
              <p>Entra con tu correo institucional para preguntar, responder y votar.</p>
              <Link href="/entrar" className={btn}>Entrar</Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
