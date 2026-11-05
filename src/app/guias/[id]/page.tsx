import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, btnGhost, card } from "@/lib/ui";
import { reviewSuggestion, suggestImprovement } from "../actions";
import {
  areaLabel,
  asFaqs,
  asSteps,
  formatDate,
  isUuid,
  statusLabel,
} from "../shared";
import { SuggestForm } from "./suggest-form";
import { GuideSteps } from "./guide-steps";
import { StepQA, type StepQuestion } from "./step-qa";

export const dynamic = "force-dynamic";

type GuideRow = {
  id: string;
  area: string;
  title: string;
  summary: string;
  steps: unknown;
  faqs: unknown;
  created_at: Date;
  author_name: string;
};

type Suggestion = {
  id: string;
  step_index: number;
  body: string;
  status: string;
  created_at: Date;
  author_name: string;
};

export default async function GuidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const user = await getSession();
  const guideResult = await pool.query<GuideRow>(
    `select g.id, g.area, g.title, g.summary, g.steps, g.faqs, g.created_at, u.name as author_name
     from guides g
     join users u on u.id = g.author_id
     where g.id = $1`,
    [id],
  );
  const guide = guideResult.rows[0];
  if (!guide) notFound();

  if (user) {
    await pool.query("insert into guide_analytics_events (guide_id, user_id, event_type) values ($1, $2, 'view')", [id, user.id]);
  }

  const questionRows = await pool.query<Omit<StepQuestion, "answers">>(
    `select q.id, q.step_index, q.title, q.body, q.status, q.created_at, u.name as author_name
     from guide_step_questions q join users u on u.id = q.author_id
     where q.guide_id = $1 order by q.created_at desc`, [id],
  );
  const answerRows = await pool.query<{ id: string; question_id: string; body: string; official: boolean; author_name: string }>(
    `select a.id, a.question_id, a.body, a.official, u.name as author_name
     from guide_step_answers a join users u on u.id = a.author_id
     join guide_step_questions q on q.id = a.question_id where q.guide_id = $1
     order by a.official desc, a.created_at`, [id],
  );
  const questions: StepQuestion[] = questionRows.rows.map((question) => ({
    ...question,
    answers: answerRows.rows.filter((answer) => answer.question_id === question.id),
  }));

  const suggestions = await pool.query<Suggestion>(
    `select s.id, s.step_index, s.body, s.status, s.created_at, u.name as author_name
     from guide_suggestions s
     join users u on u.id = s.user_id
     where s.guide_id = $1
     order by s.created_at asc`,
    [id],
  );

  const steps = asSteps(guide.steps);
  const faqs = asFaqs(guide.faqs);
  const staff = user ? (user.role === "admin" || (user.role === "moderador" && user.area === guide.area)) : false;
  let guideMetrics: { views: number; readers: number; completions: number; stepIndex: number; stepReaders: number }[] = [];
  if (staff) {
    const metrics = await pool.query<{ event_type: string; step_index: number | null; total: string; people: string }>(
      `select event_type, step_index, count(*)::text as total, count(distinct user_id)::text as people
       from guide_analytics_events where guide_id = $1 group by event_type, step_index`, [id],
    );
    const views = metrics.rows.find((row) => row.event_type === "view" && row.step_index === null);
    const completions = metrics.rows.filter((row) => row.event_type === "step_complete");
    guideMetrics = [{
      views: Number(views?.total ?? 0), readers: Number(views?.people ?? 0),
      completions: completions.reduce((sum, row) => sum + Number(row.total), 0),
      stepIndex: -1, stepReaders: 0,
    }, ...completions.filter((row) => Number(row.people) >= 5).map((row) => ({
      views: 0, readers: 0, completions: Number(row.total), stepIndex: Number(row.step_index), stepReaders: Number(row.people),
    }))];
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/guias" className="text-sm text-[#006699] hover:underline">
        Volver a guías
      </Link>

      <header className={`${card} overflow-hidden p-0`}>
        <Cover tone={guide.area} kicker={areaLabel(guide.area)} title={guide.title} className="h-44" />
        <div className="space-y-2 p-5">
        <h1 className="font-serif text-3xl tracking-tight">{guide.title}</h1>
        <p className="mt-2 text-sm leading-6">{guide.summary}</p>
        <p className="mt-3 text-xs text-[#667085]">
          {guide.author_name} · {formatDate(guide.created_at)}
        </p>
        </div>
      </header>

      <section className="space-y-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#006699]">En corto</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Sigue la guía a tu ritmo</h2>
        </div>
        <GuideSteps steps={steps} guideId={guide.id} />
      </section>

      {steps.length > 0 && <section className="space-y-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#006699]">Comunidad</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Sugerencias por paso</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {steps.map((step, index) => {
            const related = suggestions.rows.filter((item) => item.step_index === index);
            return <article key={`${step.title}-${index}`} className="rounded-3xl border border-white bg-white/85 p-5 shadow-[0_8px_28px_rgba(0,64,96,0.06)]">
              <p className="text-xs font-bold uppercase tracking-wide text-[#006699]">Paso {index + 1}</p>
                <h3 className="mt-1 font-bold">{step.title}</h3>
                <StepQA guideId={guide.id} stepIndex={index} questions={questions} signedIn={!!user} />
              <div className="mt-4 space-y-3">
                {related.length === 0 && <p className="text-sm text-[#667085]">Aún no hay sugerencias para este paso.</p>}
                {related.map((suggestion) => <div key={suggestion.id} className="rounded-2xl bg-[#edf6fa] p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold">{suggestion.author_name}</span>
                    <span className={suggestion.status === "aceptada" ? "rounded-full bg-[#006699] px-2 py-0.5 text-white" : "rounded-full border border-[#b7d4e4] bg-white px-2 py-0.5"}>{statusLabel(suggestion.status)}</span>
                    <span className="text-[#667085]">{formatDate(suggestion.created_at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{suggestion.body}</p>
                  {staff && suggestion.status === "pendiente" && <form action={reviewSuggestion} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={suggestion.id} />
                    <button className={btn} name="decision" value="aceptar">Aceptar</button>
                    <button className={btnGhost} name="decision" value="rechazar">Rechazar</button>
                  </form>}
                </div>)}
                {user ? <SuggestForm action={suggestImprovement} guideId={guide.id} stepIndex={index} /> : <p className="text-sm text-[#667085]"><Link href="/entrar" className="font-semibold text-[#006699] underline">Inicia sesión</Link> para sugerir una mejora.</p>}
              </div>
            </article>;
          })}
        </div>
      </section>}

      {staff && <section className="rounded-3xl border border-[#b7d4e4] bg-[#f2f8fb] p-5">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#006699]">Uso de la guía · vista de área</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4"><p className="text-xs text-[#667085]">Lecturas con sesión</p><p className="mt-1 text-2xl font-extrabold">{guideMetrics[0]?.views ?? 0}</p></div>
          <div className="rounded-2xl bg-white p-4"><p className="text-xs text-[#667085]">Personas distintas</p><p className="mt-1 text-2xl font-extrabold">{guideMetrics[0]?.readers ?? 0}</p></div>
          <div className="rounded-2xl bg-white p-4"><p className="text-xs text-[#667085]">Pasos marcados</p><p className="mt-1 text-2xl font-extrabold">{guideMetrics[0]?.completions ?? 0}</p></div>
        </div>
        {guideMetrics.slice(1).length > 0 && <p className="mt-3 text-sm text-[#52636d]">Pasos con 5 o más personas: {guideMetrics.slice(1).map((metric) => `${metric.stepIndex + 1} (${metric.stepReaders})`).join(" · ")}</p>}
      </section>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Preguntas frecuentes</h2>
        {faqs.length === 0 && (
          <p className={card}>Esta guía no incluye preguntas frecuentes.</p>
        )}
        {faqs.map((faq) => (
          <article key={faq.q} className={card}>
            <h3 className="font-medium">{faq.q}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#667085]">{faq.a}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
