import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/loading-ui";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, btnGhost, card, input, label } from "@/lib/ui";
import { deleteGuide, deleteSuggestion, reviewSuggestion } from "../actions";
import {
  areaLabel,
  asFaqs,
  asSteps,
  canEditGuideArea,
  formatDate,
  isUuid,
  statusLabel,
} from "../shared";
import type { StepThread, StepThreadAnswer } from "../guide-route";
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

type RawAnchoredQuestion = {
  id: string;
  step_id: number;
  title: string;
  body: string;
  status: string;
  created_at: Date;
  author_name: string;
};

type RawAnchoredAnswer = {
  id: string;
  question_id: string;
  body: string;
  official: boolean;
  created_at: Date;
  author_name: string;
  author_role: string;
};

export default async function GuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string; paso?: string; panel?: string; revision?: string; sugerida?: string }>;
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

  const [questionRows, answerRows, anchoredQuestionsRes, anchoredAnswersRes, suggestions, versions] =
    await Promise.all([
      pool.query<Omit<StepQuestion, "answers">>(
        `select q.id, q.step_index, q.title, q.body, q.status, q.created_at, u.name as author_name
         from guide_step_questions q join users u on u.id = q.author_id
         where q.guide_id = $1 order by q.created_at desc`,
        [id],
      ),
      pool.query<{ id: string; question_id: string; body: string; official: boolean; author_name: string }>(
        `select a.id, a.question_id, a.body, a.official, u.name as author_name
         from guide_step_answers a join users u on u.id = a.author_id
         join guide_step_questions q on q.id = a.question_id where q.guide_id = $1
         order by a.official desc, a.created_at`,
        [id],
      ),
      pool.query<RawAnchoredQuestion>(
        `select q.id, q.target_step_index as step_id, q.title, q.body, q.status, q.created_at, u.name as author_name
         from questions q
         join users u on u.id = q.author_id
         where q.target_guide_id = $1 and q.target_step_index is not null
         order by q.created_at desc`,
        [id],
      ),
      pool.query<RawAnchoredAnswer>(
        `select a.id, a.question_id, a.body, a.official, a.created_at, u.name as author_name, u.role::text as author_role
         from answers a
         join users u on u.id = a.author_id
         join questions q on q.id = a.question_id
         where q.target_guide_id = $1 and q.target_step_index is not null
         order by a.official desc, a.created_at asc`,
        [id],
      ),
      pool.query<Suggestion>(
        `select s.id, s.user_id, s.step_index, s.body, s.status, s.review_note, s.reviewed_at, s.created_at,
                u.name as author_name, rev.name as reviewer_name
         from guide_suggestions s
         join users u on u.id = s.user_id
         left join users rev on rev.id = s.reviewed_by
         where s.guide_id = $1
         order by s.created_at desc`,
        [id],
      ),
      pool.query<{ version: number; change_note: string | null; created_at: Date; editor: string }>(
        `select v.version, v.change_note, v.created_at, u.name as editor
         from guide_versions v join users u on u.id = v.edited_by
         where v.guide_id = $1 order by v.version desc`,
        [id],
      ),
    ]);

  const historicQuestions: StepQuestion[] = questionRows.rows.map((question) => ({
    ...question,
    answers: answerRows.rows.filter((answer) => answer.question_id === question.id),
  }));

  const answersByQuestion = new Map<string, StepThreadAnswer[]>();
  for (const ans of anchoredAnswersRes.rows) {
    const list = answersByQuestion.get(ans.question_id) ?? [];
    list.push({
      id: ans.id,
      body: ans.body,
      official: ans.official,
      authorName: ans.author_name,
      authorRole: ans.author_role,
      createdLabel: formatDate(ans.created_at),
    });
    answersByQuestion.set(ans.question_id, list);
  }

  const threads: StepThread[] = anchoredQuestionsRes.rows.map((q) => ({
    id: q.id,
    stepId: q.step_id,
    title: q.title,
    body: q.body,
    status: q.status,
    authorName: q.author_name,
    createdLabel: formatDate(q.created_at),
    answers: answersByQuestion.get(q.id) ?? [],
  }));

  const collaborators = Array.from(
    new Set(
      suggestions.rows
        .filter((s) => s.status === "aceptada")
        .map((s) => s.author_name),
    ),
  );

  const steps = asSteps(guide.steps);
  const faqs = asFaqs(guide.faqs);
  const staff = canEditGuideArea(user, guide.area);
  const pendingByStep = Object.fromEntries(
    steps.map((s) => [
      s.id,
      suggestions.rows.filter((item) => item.step_index === s.id && item.status === "pendiente").length,
    ]),
  );
  const suggestionsCountByStep = Object.fromEntries(
    steps.map((s) => [
      s.id,
      suggestions.rows.filter((item) => item.step_index === s.id).length,
    ]),
  );
  const pendingStepLinks = steps.filter((s) => (pendingByStep[s.id] ?? 0) > 0);

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
    <div className="mx-auto max-w-[1380px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/foro" className="text-sm font-bold text-[#006699] hover:underline">
          ← Volver a Foro y Guías
        </Link>
        {staff && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/guias/${guide.id}/editar`} className={btn}>
              Editar guía visualmente
            </Link>
            {(user?.id === guide.author_id || user?.role === "admin") && (
              <form action={deleteGuide}>
                <input type="hidden" name="id" value={guide.id} />
                <SubmitButton className={btnGhost} pendingText="Eliminando…">
                  Eliminar guía
                </SubmitButton>
              </form>
            )}
          </div>
        )}
      </div>

      {/* CABECERA BLUEPRINT DE LA GUÍA */}
      <header className="overflow-hidden rounded-md border border-[#b9ced9] border-t-4 border-t-[#006699] bg-[#fffdf7]">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-[#e6f3fa] px-2.5 py-0.5 font-extrabold uppercase tracking-wider text-[#005580]">
                {areaLabel(guide.area)}
              </span>
              <span className="font-mono font-bold text-[#526a77]">v{guide.version}</span>
              <span className="text-[#667985]">
                · {guide.author_name} · {formatDate(guide.created_at)}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#142c3c] sm:text-3xl">
              {guide.title}
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-[#425967]">{guide.summary}</p>
            {collaborators.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-bold text-[#5a707c]">Aportes integrados:</span>
                {collaborators.map((name) => (
                  <span
                    key={name}
                    className="rounded border border-[#c7dfeb] bg-[#eef7fc] px-2 py-0.5 text-[11px] font-bold text-[#0c5170]"
                  >
                    ✦ {name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {guide.attachment_url && (
            <a
              href={guide.attachment_url}
              target="_blank"
              rel="noreferrer"
              download={guide.attachment_name ?? "formato-tramite.pdf"}
              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-[#006699] bg-[#eef7fc] px-4 py-2.5 text-xs font-extrabold text-[#004d73] transition hover:bg-[#dceff9]"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 3v10m0 0-3.5-3.5M10 13l3.5-3.5M4 16h12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Descargar PDF ({guide.attachment_name ?? "Formato oficial"})</span>
            </a>
          )}
        </div>
      </header>

      {/* ALERTAS Y SUGERENCIAS PENDIENTES */}
      <div id="ruta" className="space-y-4">
        {query.revision === "version" && (
          <p role="alert" className="rounded-md border border-[#e3b8b4] bg-[#fdf2f1] px-4 py-2.5 text-sm font-semibold text-[#8C1D18]">
            La guía cambió. Revisa el texto actualizado antes de aceptar la sugerencia.
          </p>
        )}
        {query.revision === "texto" && (
          <p role="alert" className="rounded-md border border-[#e3b8b4] bg-[#fdf2f1] px-4 py-2.5 text-sm font-semibold text-[#8C1D18]">
            El texto que se publicará debe tener entre 1 y 2000 caracteres.
          </p>
        )}
        {query.sugerida === "1" && (
          <p role="status" className="rounded-md border border-[#b7d9c2] bg-[#edf8f1] px-4 py-2.5 text-sm font-semibold text-[#1b5e36]">
            Tu sugerencia quedó registrada para revisión del área encargada.
          </p>
        )}
        {staff && pendingStepLinks.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#e6d39a] bg-[#fdf7e2] px-4 py-2.5 text-xs text-[#6e5008]">
            <span className="font-extrabold">Cambios sugeridos pendientes:</span>
            {pendingStepLinks.map((s) => (
              <Link
                key={s.id}
                href={`/guias/${guide.id}?paso=${s.id}&panel=editar#mini-foro`}
                className="rounded border border-[#d6b764] bg-white px-2.5 py-0.5 font-bold hover:bg-[#fff9eb]"
              >
                Paso {steps.findIndex((x) => x.id === s.id) + 1} ({pendingByStep[s.id]})
              </Link>
            ))}
          </div>
        )}

        {/* FLUJO VISUAL INTERACTIVO + PASO A PASO + MINI-FORO POR PASO */}
        <GuideSteps
          key={`${guide.id}-${query.paso}-${query.panel}`}
          steps={steps}
          guideId={guide.id}
          area={guide.area}
          initialDone={initialDone}
          signedIn={Boolean(user)}
          initialStep={query.paso === undefined ? undefined : Number(query.paso)}
          initialPanel={query.panel === "editar" ? "editar" : undefined}
          pendingByStep={pendingByStep}
          suggestionsCountByStep={suggestionsCountByStep}
          threads={threads}
          stepExtras={Object.fromEntries(
            steps.map((step) => {
              const related = suggestions.rows.filter((item) => item.step_index === step.id);
              const historic = historicQuestions.filter((q) => q.step_index === step.id);
              return [
                step.id,
                <div key={step.id} className="space-y-3">
                  {historic.length > 0 && <StepQA stepIndex={step.id} questions={historic} signedIn={!!user} />}
                  {related.map((suggestion) => (
                    <div key={suggestion.id} className="rounded-md border border-[#d5e4ee] bg-[#f4f9fc] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-extrabold text-[#143547]">{suggestion.author_name}</span>
                        <span
                          className={
                            suggestion.status === "aceptada"
                              ? "rounded bg-[#165b47] px-2 py-0.5 text-[10px] font-extrabold text-white"
                              : suggestion.status === "rechazada"
                                ? "rounded bg-[#fbe9e7] px-2 py-0.5 text-[10px] font-extrabold text-[#8c2925]"
                                : "rounded border border-[#dfc88e] bg-[#fff8e6] px-2 py-0.5 text-[10px] font-extrabold text-[#755109]"
                          }
                        >
                          {statusLabel(suggestion.status)}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-[#2e4856]">
                        {suggestion.body}
                      </p>
                      <p className="mt-1 text-[11px] text-[#667985]">{formatDate(suggestion.created_at)}</p>
                      {suggestion.review_note && (
                        <p className="mt-1.5 rounded bg-white/80 px-2.5 py-1.5 text-xs text-[#3b5461]">
                          <strong>Revisión{suggestion.reviewer_name ? ` (${suggestion.reviewer_name})` : ""}:</strong> {suggestion.review_note}
                        </p>
                      )}
                      {staff && (
                        <form action={deleteSuggestion} className="mt-2">
                          <input type="hidden" name="id" value={suggestion.id} />
                          <input type="hidden" name="guideId" value={guide.id} />
                          <input type="hidden" name="stepIndex" value={step.id} />
                          <SubmitButton pendingText="Eliminando…" spinnerClassName="h-3 w-3" className="text-[11px] font-bold text-[#8C1D18] hover:underline">
                            Eliminar sugerencia {suggestion.status === "aceptada" ? "(conserva nota)" : ""}
                          </SubmitButton>
                        </form>
                      )}
                      {staff && suggestion.status === "pendiente" && (
                        <form action={reviewSuggestion} className="mt-3 space-y-2 border-t border-[#d5e4ee] pt-2.5">
                          <input type="hidden" name="id" value={suggestion.id} />
                          <input type="hidden" name="version" value={guide.version} />
                          <label className={label}>
                            Texto actualizado del paso
                            <textarea
                              key={guide.version}
                              className={`${input} text-xs`}
                              name="revised_body"
                              required
                              maxLength={2000}
                              rows={3}
                              defaultValue={`${step.body}\n\n${suggestion.body}`}
                            />
                          </label>
                          <label className={label}>
                            Nota para el autor (opcional)
                            <input
                              className={`${input} text-xs`}
                              name="review_note"
                              maxLength={500}
                              placeholder="Motivo de aceptación o rechazo"
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <SubmitButton className={btn} name="decision" value="aceptar" pendingText="Integrando…">
                              Aceptar e integrar
                            </SubmitButton>
                            <SubmitButton className={btnGhost} name="decision" value="rechazar" formNoValidate pendingText="Rechazando…">
                              Rechazar
                            </SubmitButton>
                          </div>
                        </form>
                      )}
                    </div>
                  ))}
                </div>,
              ];
            }),
          )}
        />
      </div>

      {/* PREGUNTAS FRECUENTES + HISTORIAL + ANALÍTICAS */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="space-y-3 lg:col-span-7">
          <h2 className="text-lg font-extrabold text-[#142c3c]">Preguntas frecuentes</h2>
          {faqs.length === 0 ? (
            <p className={`${card} text-sm text-[#5d707a]`}>Esta guía no incluye preguntas frecuentes.</p>
          ) : (
            <div className="space-y-2.5">
              {faqs.map((faq) => (
                <article key={faq.q} className={`${card} space-y-1.5`}>
                  <h3 className="text-sm font-extrabold text-[#142c3c]">{faq.q}</h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#4f6470]">{faq.a}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-5 lg:col-span-5">
          {versions.rows.length > 0 && (
            <section className={`${card} space-y-3`}>
              <h2 className="text-base font-extrabold text-[#142c3c]">Historial de versiones</h2>
              <ul className="divide-y divide-[#ece9df] text-xs text-[#546975]">
                {versions.rows.map((version) => (
                  <li key={version.version} className="py-2 first:pt-0 last:pb-0">
                    <strong className="font-mono text-[#142c3c]">v{version.version}</strong> ·{" "}
                    {version.change_note ?? "Actualización"} · {version.editor} ·{" "}
                    {formatDate(version.created_at)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {staff && (
            <section id="analiticas" className="space-y-4 rounded-md border border-[#b7d4e4] bg-[#f2f8fb] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#006699]">
                    Analíticas de la guía
                  </p>
                  <h2 className="text-base font-extrabold text-[#142c3c]">Avance y abandono</h2>
                </div>
                <div className="flex gap-1 text-[11px]">
                  <Link href={`/guias/${guide.id}#analiticas`} className={`rounded px-2.5 py-1 font-bold ${filterDays === 0 ? "bg-[#006699] text-white" : "bg-white text-[#004d73]"}`}>
                    Todo
                  </Link>
                  <Link href={`/guias/${guide.id}?days=30#analiticas`} className={`rounded px-2.5 py-1 font-bold ${filterDays === 30 ? "bg-[#006699] text-white" : "bg-white text-[#004d73]"}`}>
                    30 d
                  </Link>
                  <Link href={`/guias/${guide.id}?days=7#analiticas`} className={`rounded px-2.5 py-1 font-bold ${filterDays === 7 ? "bg-[#006699] text-white" : "bg-white text-[#004d73]"}`}>
                    7 d
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded border border-[#d6e4ec] bg-white p-3">
                  <p className="text-[11px] text-[#5d707a]">Lecturas</p>
                  <p className="mt-0.5 font-mono text-xl font-extrabold text-[#142c3c]">{totalViews}</p>
                </div>
                <div className="rounded border border-[#d6e4ec] bg-white p-3">
                  <p className="text-[11px] text-[#5d707a]">Personas</p>
                  <p className="mt-0.5 font-mono text-xl font-extrabold text-[#142c3c]">{totalReaders}</p>
                </div>
                <div className="rounded border border-[#d6e4ec] bg-white p-3">
                  <p className="text-[11px] text-[#5d707a]">Completados</p>
                  <p className="mt-0.5 font-mono text-xl font-extrabold text-[#006699]">{totalCompletions}</p>
                </div>
              </div>
              <ul className="space-y-2 rounded border border-[#d6e4ec] bg-white p-3.5 text-xs">
                {stepFunnel.map((item) => (
                  <li key={item.index} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-bold text-[#142c3c]">
                        {item.index + 1}. {item.title}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-[#52636d]">
                        {item.people} · {item.dropoffPct}% aband.
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e6f3fa]">
                      <div
                        className="h-full rounded-full bg-[#006699]"
                        style={{ width: `${Math.max(4, 100 - item.dropoffPct)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
