import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, btnGhost, card, input, label } from "@/lib/ui";
import { deleteGuide, deleteSuggestion, reviewSuggestion } from "../actions";
import {
  areaLabel,
  asFaqs,
  asSteps,
  formatDate,
  isUuid,
  statusLabel,
} from "../shared";
import type { StepThread } from "../guide-route";
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
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: Date;
  author_name: string;
  author_id: string;
  version: number;
};

type Suggestion = {
  id: string;
  user_id: string;
  step_index: number;
  body: string;
  status: string;
  review_note: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  author_name: string;
  reviewer_name: string | null;
};

export default async function GuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string; paso?: string; panel?: string; revision?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!isUuid(id)) notFound();

  const user = await getSession();
  const guideResult = await pool.query<GuideRow>(
    `select g.id, g.version, g.author_id, g.area, g.title, g.summary, g.steps, g.faqs,
            g.attachment_url, g.attachment_name, g.created_at, u.name as author_name
     from guides g
     join users u on u.id = g.author_id
     where g.id = $1`,
    [id],
  );
  const guide = guideResult.rows[0];
  if (!guide) notFound();

  let initialDone: number[] = [];
  if (user) {
    await pool.query("insert into guide_analytics_events (guide_id, user_id, event_type) values ($1, $2, 'view')", [id, user.id]);
    const prog = await pool.query<{ completed_steps: unknown }>(
      "select completed_steps from guide_progress where user_id = $1 and guide_id = $2",
      [user.id, id],
    );
    const rawDone = prog.rows[0]?.completed_steps;
    if (Array.isArray(rawDone)) {
      initialDone = rawDone.filter((n): n is number => typeof n === "number");
    }
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

  const threads = await pool.query<StepThread>(
    `select id, title, status, target_step_index as "stepId" from questions
     where target_guide_id = $1 and target_step_index is not null order by created_at desc`, [id],
  );
  const suggestions = await pool.query<Suggestion>(
    `select s.id, s.user_id, s.step_index, s.body, s.status, s.review_note, s.reviewed_at, s.created_at,
            u.name as author_name, rev.name as reviewer_name
     from guide_suggestions s
     join users u on u.id = s.user_id
     left join users rev on rev.id = s.reviewed_by
     where s.guide_id = $1
     order by s.created_at asc`,
    [id],
  );
  const versions = await pool.query<{ version: number; change_note: string | null; created_at: Date; editor: string }>(
    `select v.version, v.change_note, v.created_at, u.name as editor
     from guide_versions v join users u on u.id = v.edited_by
     where v.guide_id = $1 order by v.version desc`, [id],
  );

  const collaborators = Array.from(
    new Set(
      suggestions.rows
        .filter((s) => s.status === "aceptada")
        .map((s) => s.author_name),
    ),
  );

  const steps = asSteps(guide.steps);
  const faqs = asFaqs(guide.faqs);
  const staff = user ? (user.role === "admin" || (user.role === "moderador" && user.area === guide.area)) : false;

  const filterDays = query.days === "7" ? 7 : query.days === "30" ? 30 : 0;
  let totalViews = 0;
  let totalReaders = 0;
  let totalCompletions = 0;
  let stepFunnel: { index: number; title: string; completions: number; people: number; dropoffPct: number }[] = [];

  if (staff) {
    const metrics = await pool.query<{ event_type: string; step_index: number | null; total: string; people: string }>(
      `select event_type, step_index, count(*)::text as total, count(distinct user_id)::text as people
       from guide_analytics_events
       where guide_id = $1
         and ($2::int = 0 or occurred_at >= now() - ($2::text || ' days')::interval)
       group by event_type, step_index`,
      [id, filterDays],
    );
    const views = metrics.rows.find((row) => row.event_type === "view" && row.step_index === null);
    const completions = metrics.rows.filter((row) => row.event_type === "step_complete");
    totalViews = Number(views?.total ?? 0);
    totalReaders = Number(views?.people ?? 0);
    totalCompletions = completions.reduce((sum, row) => sum + Number(row.total), 0);

    stepFunnel = steps.map((step, idx) => {
      const row = completions.find((c) => c.step_index === step.id);
      const peopleCount = Number(row?.people ?? 0);
      const totalCount = Number(row?.total ?? 0);
      const dropoff = totalReaders > 0 ? Math.max(0, Math.round(((totalReaders - peopleCount) / totalReaders) * 100)) : 0;
      return {
        index: idx,
        title: step.title,
        completions: totalCount,
        people: peopleCount,
        dropoffPct: dropoff,
      };
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/foro" className="text-sm text-[#006699] hover:underline">
        ← Volver a Foro y Guías
      </Link>

      <header className="board-sidecard space-y-2 border-t-4 border-t-[#006699] p-5 sm:p-6">
        <p className="board-eyebrow">{areaLabel(guide.area)} · Guía de trámite</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#1b4053]">{guide.title}</h1>
        <p className="mt-2 text-sm leading-6">{guide.summary}</p>
        <p className="mt-3 text-xs text-[#667085]">
          {guide.author_name} · {formatDate(guide.created_at)}
        </p>
        {guide.attachment_url && (
          <div className="pt-2">
            <a
              href={guide.attachment_url}
              target="_blank"
              rel="noreferrer"
              download={guide.attachment_name ?? "formato-tramite.pdf"}
              className="inline-flex items-center gap-2 rounded-lg border border-[#006699] bg-[#e6f3fa] px-3 py-2 text-xs font-bold text-[#004d73] hover:bg-[#d2eaf7]"
            >
              Descargar PDF del trámite ({guide.attachment_name ?? "Formato oficial"})
            </a>
          </div>
        )}
      </header>

      {collaborators.length > 0 && (
        <section className="rounded-2xl border border-[#d5e4ee] bg-white p-4">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#006699]">
            Colaboradores de la comunidad (CU-GUA-02-01)
          </p>
          <p className="mt-1 text-xs text-[#667085]">
            Personas cuyas sugerencias de mejora fueron verificadas e integradas en esta guía:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {collaborators.map((name) => (
              <span key={name} className="rounded-full bg-[#e6f3fa] px-3 py-1 text-xs font-bold text-[#004d73]">
                ✦ {name}
              </span>
            ))}
          </div>
        </section>
      )}

      {staff && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/guias/${guide.id}/editar`} className={btnGhost}>
            Editar guía (pasos, orden y FAQ)
          </Link>
          {(user?.id === guide.author_id || user?.role === "admin") && (
            <form action={deleteGuide}>
              <input type="hidden" name="id" value={guide.id} />
              <button className={btnGhost}>Eliminar guía</button>
            </form>
          )}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Pasos del trámite</h2>
        </div>
        <div id="ruta">
        {query.revision === "version" && <p role="alert">La guía cambió. Revisa el texto actualizado antes de aceptar la sugerencia.</p>}
        {query.revision === "texto" && <p role="alert">El texto que se publicará debe tener entre 1 y 2000 caracteres.</p>}
        <GuideSteps key={`${guide.id}-${query.paso}-${query.panel}`} steps={steps} guideId={guide.id} area={guide.area} initialDone={initialDone} signedIn={Boolean(user)}
          initialStep={query.paso === undefined ? undefined : Number(query.paso)} initialPanel={query.panel === "editar" ? "editar" : undefined}
          threads={threads.rows} stepExtras={Object.fromEntries(steps.map(step => {
            const related = suggestions.rows.filter(item => item.step_index === step.id);
            const historic = questions.filter(q => q.step_index === step.id);
            return [step.id, <div key={step.id} className="space-y-3">
                {historic.length > 0 && <StepQA stepIndex={step.id} questions={historic} signedIn={!!user} />}
                {related.length > 0 && <h4 className="text-sm font-bold">Cambios propuestos</h4>}
                {related.map((suggestion) => <div key={suggestion.id} className="rounded-2xl bg-[#edf6fa] p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold">{suggestion.author_name}</span>
                    <span className={suggestion.status === "aceptada" ? "rounded-full bg-[#006699] px-2 py-0.5 text-white" : "rounded-full border border-[#b7d4e4] bg-white px-2 py-0.5"}>{statusLabel(suggestion.status)}</span>
                    <span className="text-[#667085]">{formatDate(suggestion.created_at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{suggestion.body}</p>
                  {suggestion.review_note && (
                    <p className="mt-1 text-xs text-[#526170]">
                      Nota de revisión{suggestion.reviewer_name ? ` (${suggestion.reviewer_name})` : ""}: {suggestion.review_note}
                    </p>
                  )}
                  {staff && <form action={deleteSuggestion} className="mt-2"><input type="hidden" name="id" value={suggestion.id} /><input type="hidden" name="guideId" value={guide.id} /><button className="text-xs font-bold text-[#8C1D18]">Eliminar sugerencia {suggestion.status === "aceptada" ? "(conserva la nota aplicada)" : ""}</button></form>}
                  {staff && suggestion.status === "pendiente" && <form action={reviewSuggestion} className="mt-3 space-y-2 border-t border-[#d5e4ee] pt-2">
                    <input type="hidden" name="id" value={suggestion.id} />
                    <input type="hidden" name="version" value={guide.version} />
                    <label className={label}>Texto del paso que se publicará
                      <textarea key={guide.version} className={input} name="revised_body" required maxLength={2000} rows={4}
                        defaultValue={`${step.body}\n\n${suggestion.body}`} />
                    </label>
                    <label className={label}>
                      Nota o motivo para el alumno (opcional al aceptar, recomendado al rechazar)
                      <input className={input} name="review_note" maxLength={500} placeholder="Motivo de aceptación o rechazo" />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button className={btn} name="decision" value="aceptar">Aceptar e integrar</button>
                      <button className={btnGhost} name="decision" value="rechazar" formNoValidate>Rechazar</button>
                    </div>
                  </form>}
                </div>)}
            </div>];
          }))} />
        </div>
      </section>

      {staff && <section id="analiticas" className="space-y-4 rounded-3xl border border-[#b7d4e4] bg-[#f2f8fb] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#006699]">Panel de analíticas · CU-12</p>
            <h2 className="text-lg font-extrabold text-[#1b4053]">Uso y abandono por paso</h2>
          </div>
          <div className="flex gap-1.5 text-xs">
            <Link href={`/guias/${guide.id}#analiticas`} className={`rounded-full px-3 py-1 font-bold ${filterDays === 0 ? "bg-[#006699] text-white" : "bg-white text-[#004d73]"}`}>Todo el historial</Link>
            <Link href={`/guias/${guide.id}?days=30#analiticas`} className={`rounded-full px-3 py-1 font-bold ${filterDays === 30 ? "bg-[#006699] text-white" : "bg-white text-[#004d73]"}`}>Últimos 30 días</Link>
            <Link href={`/guias/${guide.id}?days=7#analiticas`} className={`rounded-full px-3 py-1 font-bold ${filterDays === 7 ? "bg-[#006699] text-white" : "bg-white text-[#004d73]"}`}>Últimos 7 días</Link>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4"><p className="text-xs text-[#667085]">Lecturas con sesión</p><p className="mt-1 text-2xl font-extrabold">{totalViews}</p></div>
          <div className="rounded-2xl bg-white p-4"><p className="text-xs text-[#667085]">Personas distintas</p><p className="mt-1 text-2xl font-extrabold">{totalReaders}</p></div>
          <div className="rounded-2xl bg-white p-4"><p className="text-xs text-[#667085]">Pasos completados</p><p className="mt-1 text-2xl font-extrabold">{totalCompletions}</p></div>
        </div>
        <div className="space-y-2 rounded-2xl bg-white p-4">
          <p className="text-xs font-extrabold uppercase text-[#004d73]">Embudo de avance y tasa de abandono por paso</p>
          <ul className="space-y-2 text-xs">
            {stepFunnel.map((item) => (
              <li key={item.index} className="space-y-1 border-t border-[#edf2f5] pt-2 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#1b4053]">Paso {item.index + 1}: {item.title}</span>
                  <span className="text-[#52636d]">
                    {item.people} lectores completaron · Abandono estimado: <strong>{item.dropoffPct}%</strong>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#e6f3fa]">
                  <div
                    className="h-full rounded-full bg-[#006699]"
                    style={{ width: `${Math.max(4, 100 - item.dropoffPct)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>}

      {versions.rows.length > 0 && <section className="board-sidecard space-y-3 p-5">
        <h2>Historial de versiones</h2>
        <ul className="space-y-2 text-sm text-[#5f6e78]">
          {versions.rows.map((version) => <li key={version.version}><strong className="text-[#1b4053]">Versión {version.version}</strong> · {version.change_note ?? "Actualización"} · {version.editor} · {formatDate(version.created_at)}</li>)}
        </ul>
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
