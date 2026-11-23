"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { Spinner } from "@/components/loading-ui";
import { publishAnswerInline, publishQuestion, type InlineAnswerItem } from "../foro/actions";
import { QuestionForm } from "../foro/question-form";
import { btn, btnGhost, input } from "@/lib/ui";
import { SuggestForm } from "./[id]/suggest-form";
import { suggestImprovement } from "./actions";
import { GuideFlowchart } from "./guide-flowchart";
import { pathToStep, routesFrom, type GuideStep } from "./shared";

export type StepThreadAnswer = {
  id: string;
  body: string;
  official: boolean;
  authorName: string;
  authorRole?: string;
  createdLabel: string;
};

export type StepThread = {
  id: string;
  stepId: number;
  title: string;
  status: string;
  body?: string;
  authorName?: string;
  createdLabel?: string;
  answers?: StepThreadAnswer[];
};

type MiniForumTab = "dudas" | "cambios";

function MiniForumThreadCard({
  thread,
  signedIn,
}: {
  thread: StepThread;
  signedIn: boolean;
}) {
  const [answers, setAnswers] = useState<StepThreadAnswer[]>(thread.answers ?? []);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState("");
  const [sending, startSending] = useTransition();

  function submitReply(e: React.FormEvent) {
    e.preventDefault();
    setReplyError("");
    startSending(async () => {
      const res = await publishAnswerInline(thread.id, replyBody);
      if ("error" in res) {
        setReplyError(res.error);
        return;
      }
      const created: InlineAnswerItem = res.answer;
      setAnswers((prev) => [
        ...prev,
        {
          id: created.id,
          body: created.body,
          official: created.official,
          authorName: created.authorName,
          authorRole: created.authorRole,
          createdLabel: "Ahora",
        },
      ]);
      setReplyBody("");
      setReplyOpen(false);
    });
  }

  const isAnswered = thread.status === "respondida" || answers.some((a) => a.official);

  return (
    <article className="space-y-2.5 rounded-md border border-[#d6e0e5] bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/foro?duda=${thread.id}#duda-${thread.id}`}
            className="text-sm font-extrabold leading-snug text-[#14374a] hover:text-[#006699] hover:underline"
          >
            {thread.title}
          </Link>
          {(thread.authorName || thread.createdLabel) && (
            <p className="mt-0.5 text-[11px] font-medium text-[#60737e]">
              {thread.authorName}
              {thread.createdLabel ? ` · ${thread.createdLabel}` : ""}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
            isAnswered
              ? "bg-[#e5f5ed] text-[#14593e]"
              : "bg-[#fef4db] text-[#7c560d]"
          }`}
        >
          {isAnswered ? "✓ Respondida" : "Abierta"}
        </span>
      </div>

      {thread.body && (
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-[#425864]">
          {thread.body}
        </p>
      )}

      {answers.length > 0 && (
        <ul className="space-y-2 border-l-2 border-[#cbe0ec] pl-3">
          {answers.map((ans) => (
            <li
              key={ans.id}
              className={`rounded p-2.5 text-xs ${
                ans.official
                  ? "border border-[#b5d6e6] bg-[#edf6fb]"
                  : "border border-[#e6ecee] bg-[#f9fbfc]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <strong className="text-[#14374a]">{ans.authorName}</strong>
                {ans.official && (
                  <span className="rounded bg-[#006699] px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white">
                    Oficial
                  </span>
                )}
                <span className="text-[10px] text-[#667984]">{ans.createdLabel}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-[#2e4856]">
                {ans.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef2f4] pt-2 text-xs">
        <div className="flex items-center gap-3">
          {signedIn ? (
            <button
              type="button"
              onClick={() => setReplyOpen((v) => !v)}
              className="font-extrabold text-[#006699] hover:underline"
            >
              {replyOpen ? "Cancelar respuesta" : "Responder aquí"}
            </button>
          ) : (
            <Link href="/entrar" className="font-bold text-[#006699] hover:underline">
              Entra para responder
            </Link>
          )}
        </div>
        <Link
          href={`/foro?duda=${thread.id}#duda-${thread.id}`}
          className="font-semibold text-[#556d79] hover:text-[#006699] hover:underline"
        >
          Ver en foro →
        </Link>
      </div>

      {replyOpen && signedIn && (
        <form onSubmit={submitReply} className="space-y-2 pt-1">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            required
            minLength={10}
            maxLength={5000}
            rows={2}
            placeholder="Escribe una respuesta útil para este paso (mín. 10 caracteres)…"
            className={`${input} mt-0 text-xs`}
          />
          {replyError && (
            <p className="text-xs font-semibold text-[#8c2925]" role="alert">
              {replyError}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded bg-[#006699] px-3 py-1.5 text-xs font-extrabold text-white hover:bg-[#004d73] disabled:opacity-60"
            >
              {sending && <Spinner className="h-3 w-3" />}
              <span>{sending ? "Enviando…" : "Publicar respuesta"}</span>
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

export function GuideRoute({
  steps,
  guideId,
  area,
  signedIn,
  done,
  toggle,
  threads,
  stepExtras,
  initialStep,
  initialPanel,
  pendingByStep = {},
  suggestionsCountByStep = {},
  compact = false,
}: {
  steps: GuideStep[];
  guideId: string;
  area: string;
  signedIn: boolean;
  done: number[];
  toggle: (id: number) => void;
  threads: StepThread[];
  stepExtras?: Record<number, ReactNode>;
  initialStep?: number;
  initialPanel?: "preguntar" | "editar";
  pendingByStep?: Record<number, number>;
  suggestionsCountByStep?: Record<number, number>;
  compact?: boolean;
}) {
  const [path, setPath] = useState(() => pathToStep(steps, initialStep));
  const [viewMode, setViewMode] = useState<"paso" | "lista">("paso");
  const [forumTab, setForumTab] = useState<MiniForumTab>(
    initialPanel === "editar" ? "cambios" : "dudas",
  );
  const [composerOpen, setComposerOpen] = useState<"preguntar" | "editar" | null>(
    initialPanel ?? null,
  );
  const heading = useRef<HTMLHeadingElement>(null);

  const index = Math.max(0, steps.findIndex((s) => s.id === path.at(-1)));
  const step = steps[index];
  if (!step) return <p className="text-sm text-[#5f6e78]">Esta guía todavía no tiene pasos.</p>;

  const choices = routesFrom(steps, index);
  const checked = done.includes(step.id);
  const relatedThreads = threads.filter((t) => t.stepId === step.id);
  const stepSuggestionsCount = suggestionsCountByStep[step.id] ?? pendingByStep[step.id] ?? 0;

  const doubtsByStep = Object.fromEntries(
    steps.map((s) => [s.id, threads.filter((t) => t.stepId === s.id).length]),
  );
  const activeActivitySteps = steps.filter(
    (s) => (doubtsByStep[s.id] ?? 0) > 0 || (pendingByStep[s.id] ?? 0) > 0,
  );

  function navigate(nextPath: number[]) {
    setPath(nextPath);
    setViewMode("paso");
    setComposerOpen(null);
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }

  return (
    <div className="space-y-5">
      {/* 1. DIAGRAMA DE FLUJO INTERACTIVO (PROTAGONISTA) */}
      <GuideFlowchart
        steps={steps}
        currentStepId={step.id}
        activePath={path}
        completedSteps={done}
        doubtsByStep={doubtsByStep}
        pendingByStep={pendingByStep}
        onSelect={(id) => navigate(pathToStep(steps, id))}
        compact={compact}
      />

      {/* Tira rápida de pasos con dudas o sugerencias activas */}
      {activeActivitySteps.length > 0 && !compact && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#d6e2e8] bg-[#f6fafc] px-4 py-2.5 text-xs">
          <span className="font-extrabold text-[#2a4b5c]">Actividad en pasos:</span>
          {activeActivitySteps.map((s) => {
            const idx = steps.findIndex((st) => st.id === s.id);
            const dCount = doubtsByStep[s.id] ?? 0;
            const pCount = pendingByStep[s.id] ?? 0;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => navigate(pathToStep(steps, s.id))}
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-bold transition ${
                  s.id === step.id
                    ? "border-[#006699] bg-[#006699] text-white"
                    : "border-[#c7d9e3] bg-white text-[#19445b] hover:border-[#006699]"
                }`}
              >
                <span>Paso {idx + 1}</span>
                {dCount > 0 && <span className="font-mono text-[10px]">💬 {dCount}</span>}
                {pCount > 0 && <span className="font-mono text-[10px]">✎ {pCount}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* 2. PASO A PASO + MINI-FORO ANCLADO AL PASO */}
      <div className={compact ? "space-y-4" : "grid items-start gap-5 lg:grid-cols-12"}>
        {/* COLUMNA IZQUIERDA: PASO A PASO */}
        <div className={compact ? "space-y-3" : "space-y-4 lg:col-span-7"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-md border border-[#cdd8de] bg-[#f4f6f7] p-0.5 text-xs font-extrabold">
              <button
                type="button"
                onClick={() => setViewMode("paso")}
                className={`rounded px-3 py-1.5 transition ${
                  viewMode === "paso" ? "bg-[#142c3c] text-white" : "text-[#425d6b] hover:text-[#142c3c]"
                }`}
              >
                Recorrido guiado
              </button>
              <button
                type="button"
                onClick={() => setViewMode("lista")}
                className={`rounded px-3 py-1.5 transition ${
                  viewMode === "lista" ? "bg-[#142c3c] text-white" : "text-[#425d6b] hover:text-[#142c3c]"
                }`}
              >
                Todos los pasos ({steps.length})
              </button>
            </div>
            <span className="font-mono text-xs font-bold text-[#4a6573]">
              {done.length}/{steps.length} completados
            </span>
          </div>

          {viewMode === "lista" ? (
            <ol className="space-y-3">
              {steps.map((s, idx) => {
                const sDone = done.includes(s.id);
                const sRoutes = routesFrom(steps, idx);
                const sDoubts = doubtsByStep[s.id] ?? 0;
                return (
                  <li
                    key={s.id}
                    className={`rounded-md border p-4 transition ${
                      s.id === step.id
                        ? "border-[#006699] bg-[#f2f9fc]"
                        : "border-[#d4dce0] bg-[#fffdf7]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`grid h-6 min-w-6 place-items-center rounded px-1.5 font-mono text-xs font-black ${
                            sDone ? "bg-[#165b47] text-white" : "bg-[#e6f1f6] text-[#0c5170]"
                          }`}
                        >
                          {sDone ? "✓" : idx + 1}
                        </span>
                        <h3 className="text-base font-extrabold text-[#142c3c]">{s.title}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {sDoubts > 0 && (
                          <span className="rounded bg-[#e6f3fa] px-2 py-0.5 font-mono text-[11px] font-bold text-[#005580]">
                            💬 {sDoubts}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => navigate(pathToStep(steps, s.id))}
                          className="text-xs font-extrabold text-[#006699] hover:underline"
                        >
                          Abrir paso y foro →
                        </button>
                      </div>
                    </div>
                    {s.body !== s.title && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#425967]">
                        {s.body}
                      </p>
                    )}
                    {sRoutes.length > 1 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
                        {sRoutes.map((c, ci) => (
                          <button
                            key={ci}
                            type="button"
                            onClick={() => navigate(pathToStep(steps, c.to))}
                            className="rounded border border-[#dfc88e] bg-[#fff9e8] px-2.5 py-1 font-bold text-[#755109] hover:bg-[#faecc3]"
                          >
                            ⑂ {c.label} →
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="space-y-3">
              {path.length > 1 && (
                <nav
                  aria-label="Ruta recorrida"
                  className="flex flex-wrap items-center gap-1 rounded border border-[#dce4e8] bg-[#fafbf9] px-3 py-2 text-xs text-[#466271]"
                >
                  {path.map((id, i) => {
                    const node = steps.find((s) => s.id === id);
                    if (!node) return null;
                    return (
                      <span key={id} className="inline-flex items-center gap-1">
                        {i > 0 && <span aria-hidden="true" className="text-[#8ba2ae]">›</span>}
                        {i === path.length - 1 ? (
                          <strong aria-current="step" className="text-[#142c3c]">
                            {node.title}
                          </strong>
                        ) : (
                          <button
                            type="button"
                            className="font-semibold text-[#006699] hover:underline"
                            onClick={() => navigate(path.slice(0, i + 1))}
                          >
                            {node.title}
                          </button>
                        )}
                      </span>
                    );
                  })}
                </nav>
              )}

              <article className="overflow-hidden rounded-md border border-[#b7cdd6] border-t-4 border-t-[#006699] bg-[#fffdf7] shadow-[0_3px_12px_rgba(20,44,60,0.05)]">
                <div className="space-y-4 p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#006699] px-2.5 py-1 font-mono text-xs font-black text-white">
                        PASO {index + 1}
                      </span>
                      {choices.length > 1 && (
                        <span className="rounded bg-[#fdf1d0] px-2 py-1 text-[11px] font-extrabold text-[#785106]">
                          ⑂ Punto de decisión
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggle(step.id)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-extrabold transition ${
                        checked
                          ? "border-[#165b47] bg-[#165b47] text-white"
                          : "border-[#b4ccd8] bg-white text-[#0c5170] hover:bg-[#edf6fa]"
                      }`}
                    >
                      {checked ? "✓ Completado" : "Marcar como completado"}
                    </button>
                  </div>

                  <h3
                    ref={heading}
                    tabIndex={-1}
                    className="text-xl font-extrabold tracking-tight text-[#142c3c] sm:text-2xl"
                  >
                    {step.title}
                  </h3>

                  {step.body !== step.title && (
                    <p className="whitespace-pre-wrap text-sm leading-7 text-[#374f5c]">
                      {step.body}
                    </p>
                  )}

                  {step.imageUrl && (
                    <img
                      src={step.imageUrl}
                      alt={`Referencia visual: ${step.title}`}
                      className="max-h-80 w-auto rounded-md border border-[#d5e4ee] bg-[#fafcfd] object-contain"
                    />
                  )}

                  {/* Siguiente paso o decisiones */}
                  <div className="border-t border-[#e5ecee] pt-4">
                    {choices.length ? (
                      <div className="space-y-2.5">
                        {choices.length > 1 && (
                          <p className="text-xs font-extrabold uppercase tracking-wider text-[#785106]">
                            Elige la opción que aplica a tu caso
                          </p>
                        )}
                        <div className="grid gap-2">
                          {choices.map((choice, i) => {
                            const target = steps.find((s) => s.id === choice.to);
                            const targetIdx = steps.findIndex((s) => s.id === choice.to);
                            return (
                              target && (
                                <button
                                  type="button"
                                  key={i}
                                  onClick={() => navigate([...path, target.id])}
                                  className={`group flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-left transition ${
                                    choices.length > 1
                                      ? "border-[#dfc88e] bg-[#fffaf0] text-[#142c3c] hover:border-[#b38216] hover:bg-[#fef3d6]"
                                      : "border-[#a9c7d5] bg-[#eef7fb] text-[#004d73] hover:border-[#006699] hover:bg-[#dfeff7]"
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <span className="block text-sm font-extrabold">
                                      {choice.label}
                                    </span>
                                    {choice.label !== target.title && (
                                      <span className="mt-0.5 block text-xs text-[#4f6774]">
                                        Paso {targetIdx + 1}: {target.title}
                                      </span>
                                    )}
                                  </div>
                                  <span
                                    aria-hidden="true"
                                    className="shrink-0 font-bold transition group-hover:translate-x-0.5"
                                  >
                                    →
                                  </span>
                                </button>
                              )
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-md border border-[#b7dccb] bg-[#eef8f3] px-4 py-3 text-sm font-extrabold text-[#165b47]">
                        {path.every((id) => done.includes(id))
                          ? "✓ Completaste todos los pasos de esta ruta"
                          : "Fin de esta ruta del trámite"}
                      </div>
                    )}

                    {path.length > 1 && (
                      <button
                        type="button"
                        className="mt-3 text-xs font-extrabold text-[#006699] hover:underline"
                        onClick={() => navigate(path.slice(0, -1))}
                      >
                        ← Regresar al paso anterior
                      </button>
                    )}
                  </div>
                </div>
              </article>
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: MINI-FORO ANCLADO AL PASO SELECCIONADO */}
        <aside
          id="mini-foro"
          key={`mini-foro-${step.id}`}
          className={`overflow-hidden rounded-md border border-[#c5d4dc] bg-[#fffdf7] ${
            compact ? "" : "lg:col-span-5 lg:sticky lg:top-28"
          }`}
        >
          <div className="border-b border-[#d9e4ea] bg-[#f1f7fa] px-4 py-3.5">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#0c5170]">
              Mini-foro anclado · Paso {index + 1}
            </p>
            <h4 className="mt-0.5 truncate text-sm font-extrabold text-[#142c3c]">
              {step.title}
            </h4>

            {/* Sub-pestañas del mini-foro */}
            <div className="mt-3 flex gap-1" role="tablist" aria-label="Participación en este paso">
              <button
                type="button"
                role="tab"
                aria-selected={forumTab === "dudas"}
                onClick={() => {
                  setForumTab("dudas");
                  setComposerOpen(null);
                }}
                className={`rounded px-3 py-1.5 text-xs font-extrabold transition ${
                  forumTab === "dudas"
                    ? "bg-[#142c3c] text-white"
                    : "bg-white/80 text-[#3e5866] hover:bg-white"
                }`}
              >
                Dudas del paso ({relatedThreads.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={forumTab === "cambios"}
                onClick={() => {
                  setForumTab("cambios");
                  setComposerOpen(null);
                }}
                className={`rounded px-3 py-1.5 text-xs font-extrabold transition ${
                  forumTab === "cambios"
                    ? "bg-[#142c3c] text-white"
                    : "bg-white/80 text-[#3e5866] hover:bg-white"
                }`}
              >
                Cambios ({stepSuggestionsCount})
              </button>
            </div>
          </div>

          <div className="space-y-3.5 p-4">
            {forumTab === "dudas" ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  {signedIn ? (
                    <button
                      type="button"
                      onClick={() =>
                        setComposerOpen((c) => (c === "preguntar" ? null : "preguntar"))
                      }
                      className={composerOpen === "preguntar" ? btnGhost : btn}
                    >
                      {composerOpen === "preguntar"
                        ? "Cerrar formulario"
                        : "+ Preguntar sobre este paso"}
                    </button>
                  ) : (
                    <Link href="/entrar" className={btn}>
                      Entra para preguntar en este paso
                    </Link>
                  )}
                </div>

                {composerOpen === "preguntar" && signedIn && (
                  <div className="rounded-md border border-[#bcd6e3] bg-[#f7fbfd] p-3.5">
                    <QuestionForm
                      action={publishQuestion}
                      defaultArea={area}
                      step={{ guideId, id: step.id }}
                      stayInGuide={!compact}
                    />
                  </div>
                )}

                {relatedThreads.length === 0 ? (
                  <p className="rounded border border-dashed border-[#cfdbe0] bg-[#fafbfa] px-3.5 py-5 text-center text-xs text-[#5d707a]">
                    Aún no hay preguntas ancladas al Paso {index + 1}. Si algo no queda claro, publícala aquí y también aparecerá en el Foro.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {relatedThreads.map((thread) => (
                      <MiniForumThreadCard
                        key={thread.id}
                        thread={thread}
                        signedIn={signedIn}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  {signedIn ? (
                    <button
                      type="button"
                      onClick={() =>
                        setComposerOpen((c) => (c === "editar" ? null : "editar"))
                      }
                      className={composerOpen === "editar" ? btnGhost : btn}
                    >
                      {composerOpen === "editar"
                        ? "Cerrar sugerencia"
                        : "+ Proponer cambio en este paso"}
                    </button>
                  ) : (
                    <Link href="/entrar" className={btn}>
                      Entra para proponer un cambio
                    </Link>
                  )}
                </div>

                {composerOpen === "editar" && signedIn && (
                  <div className="rounded-md border border-[#e3d2a4] bg-[#fffcf2] p-3.5">
                    <SuggestForm
                      action={suggestImprovement}
                      guideId={guideId}
                      stepIndex={step.id}
                    />
                  </div>
                )}

                {stepExtras?.[step.id] ? (
                  stepExtras[step.id]
                ) : (
                  <p className="rounded border border-dashed border-[#d8d3c4] bg-[#faf9f4] px-3.5 py-5 text-center text-xs text-[#5d707a]">
                    Sin cambios propuestos para este paso.
                  </p>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
