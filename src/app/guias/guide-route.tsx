"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { FormDialog } from "@/components/form-dialog";
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
type DisplayMode = "diagrama" | "recorrido";

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
            isAnswered ? "bg-[#e5f5ed] text-[#14593e]" : "bg-[#fef4db] text-[#7c560d]"
          }`}
        >
          {isAnswered ? "✓ Respondida" : "Abierta"}
        </span>
      </div>

      {thread.body && (
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-[#425864]">{thread.body}</p>
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
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-[#2e4856]">{ans.body}</p>
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

function StepMiniForum({
  step,
  stepNumber,
  guideId,
  area,
  signedIn,
  compact,
  relatedThreads,
  stepSuggestionsCount,
  stepExtra,
  forumTab,
  onTabChange,
  composerOpen,
  onComposerChange,
}: {
  step: GuideStep;
  stepNumber: number;
  guideId: string;
  area: string;
  signedIn: boolean;
  compact: boolean;
  relatedThreads: StepThread[];
  stepSuggestionsCount: number;
  stepExtra?: ReactNode;
  forumTab: MiniForumTab;
  onTabChange: (tab: MiniForumTab) => void;
  composerOpen: "preguntar" | "editar" | null;
  onComposerChange: (next: "preguntar" | "editar" | null) => void;
}) {
  return (
    <div id="mini-foro" className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dde5ea] pb-3">
        <div
          className="inline-flex rounded-md border border-[#cdd8de] bg-[#f4f6f7] p-0.5 text-xs font-extrabold"
          role="tablist"
          aria-label="Participación en este paso"
        >
          <button
            type="button"
            role="tab"
            aria-selected={forumTab === "dudas"}
            onClick={() => {
              onTabChange("dudas");
              onComposerChange(null);
            }}
            className={`rounded px-3 py-1.5 transition ${
              forumTab === "dudas"
                ? "bg-[#142c3c] text-white"
                : "text-[#425d6b] hover:text-[#142c3c]"
            }`}
          >
            Dudas del paso ({relatedThreads.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={forumTab === "cambios"}
            onClick={() => {
              onTabChange("cambios");
              onComposerChange(null);
            }}
            className={`rounded px-3 py-1.5 transition ${
              forumTab === "cambios"
                ? "bg-[#142c3c] text-white"
                : "text-[#425d6b] hover:text-[#142c3c]"
            }`}
          >
            Pedir cambio ({stepSuggestionsCount})
          </button>
        </div>

        {forumTab === "dudas" ? (
          signedIn ? (
            <button
              type="button"
              onClick={() =>
                onComposerChange(composerOpen === "preguntar" ? null : "preguntar")
              }
              className={composerOpen === "preguntar" ? btnGhost : btn}
            >
              {composerOpen === "preguntar" ? "Cerrar formulario" : "+ Preguntar en este paso"}
            </button>
          ) : (
            <Link href="/entrar" className={btn}>
              Entra para preguntar
            </Link>
          )
        ) : signedIn ? (
          <button
            type="button"
            onClick={() => onComposerChange(composerOpen === "editar" ? null : "editar")}
            className={composerOpen === "editar" ? btnGhost : btn}
          >
            {composerOpen === "editar" ? "Cerrar sugerencia" : "+ Proponer cambio"}
          </button>
        ) : (
          <Link href="/entrar" className={btn}>
            Entra para proponer cambio
          </Link>
        )}
      </div>

      {forumTab === "dudas" ? (
        <div className="space-y-3">
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
            <p className="rounded-md border border-dashed border-[#cfdbe0] bg-[#fafbfa] px-4 py-5 text-center text-xs text-[#5d707a]">
              Aún no hay preguntas en el Paso {stepNumber}.
            </p>
          ) : (
            <div className="space-y-2.5">
              {relatedThreads.map((thread) => (
                <MiniForumThreadCard key={thread.id} thread={thread} signedIn={signedIn} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {composerOpen === "editar" && signedIn && (
            <div className="rounded-md border border-[#e3d2a4] bg-[#fffcf2] p-3.5">
              <SuggestForm action={suggestImprovement} guideId={guideId} stepIndex={step.id} />
            </div>
          )}

          {stepExtra ? (
            stepExtra
          ) : (
            <p className="rounded-md border border-dashed border-[#d8d3c4] bg-[#faf9f4] px-4 py-5 text-center text-xs text-[#5d707a]">
              Sin cambios propuestos en el Paso {stepNumber}.
            </p>
          )}
        </div>
      )}
    </div>
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
  const [displayMode, setDisplayMode] = useState<DisplayMode>("diagrama");
  const [stepDialogOpen, setStepDialogOpen] = useState(
    Boolean(initialStep !== undefined || initialPanel !== undefined),
  );
  const [guidedForumOpen, setGuidedForumOpen] = useState(
    Boolean(initialPanel !== undefined),
  );
  const [forumTab, setForumTab] = useState<MiniForumTab>(
    initialPanel === "editar" ? "cambios" : "dudas",
  );
  const [composerOpen, setComposerOpen] = useState<"preguntar" | "editar" | null>(
    initialPanel ?? null,
  );
  const heading = useRef<HTMLHeadingElement>(null);

  const hasBranches = useMemo(
    () => steps.some((_, i) => routesFrom(steps, i).length > 1),
    [steps],
  );

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

  const completionPct = steps.length ? Math.round((done.length / steps.length) * 100) : 0;

  function navigateToPath(nextPath: number[], focusHeading = false) {
    setPath(nextPath);
    setComposerOpen(null);
    if (focusHeading) {
      requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    }
  }

  function openStepFromDiagram(stepId: number, tab?: MiniForumTab) {
    setPath(pathToStep(steps, stepId));
    if (tab) {
      setForumTab(tab);
    } else {
      const hasDudas = (doubtsByStep[stepId] ?? 0) > 0;
      const hasPending = (pendingByStep[stepId] ?? 0) > 0;
      setForumTab(!hasDudas && hasPending ? "cambios" : "dudas");
    }
    setComposerOpen(null);
    setStepDialogOpen(true);
  }

  function handleGuidedTabToggle(tab: MiniForumTab) {
    if (guidedForumOpen && forumTab === tab) {
      setGuidedForumOpen(false);
      setComposerOpen(null);
      return;
    }
    setForumTab(tab);
    setComposerOpen(null);
    setGuidedForumOpen(true);
  }

  const prevStepPath =
    path.length > 1
      ? path.slice(0, -1)
      : !hasBranches && index > 0
        ? pathToStep(steps, steps[index - 1].id)
        : null;

  const singleNextTarget =
    choices.length === 1 ? steps.find((s) => s.id === choices[0].to) ?? null : null;
  const singleNextIdx =
    singleNextTarget ? steps.findIndex((s) => s.id === singleNextTarget.id) : -1;

  return (
    <div className="space-y-4">
      {/* BARRA SUPERIOR: SELECTOR DE VISTA + PROGRESO */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-md border border-[#c6d5de] bg-[#eff4f7] p-0.5 text-xs font-extrabold"
          role="tablist"
          aria-label="Modo de visualización de la guía"
        >
          <button
            type="button"
            role="tab"
            aria-selected={displayMode === "diagrama"}
            onClick={() => setDisplayMode("diagrama")}
            className={`inline-flex items-center gap-1.5 rounded px-3.5 py-2 transition ${
              displayMode === "diagrama"
                ? "bg-[#142c3c] text-white shadow-xs"
                : "text-[#3d5968] hover:text-[#142c3c]"
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="4.5" y="1.5" width="7" height="3.5" rx="1.5" />
              <rect x="3" y="7" width="10" height="3.5" rx="1" />
              <path d="M8 5v2m0 3.5v2.5" strokeLinecap="round" />
              <rect x="4.5" y="12.5" width="7" height="2" rx="1" />
            </svg>
            <span>Diagrama visual</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={displayMode === "recorrido"}
            onClick={() => {
              setDisplayMode("recorrido");
              setStepDialogOpen(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded px-3.5 py-2 transition ${
              displayMode === "recorrido"
                ? "bg-[#142c3c] text-white shadow-xs"
                : "text-[#3d5968] hover:text-[#142c3c]"
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 4h10M3 8h7M3 12h10" strokeLinecap="round" />
            </svg>
            <span>Recorrido guiado</span>
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-[#e3eaee] sm:block">
            <div
              className="h-full rounded-full bg-[#165b47] transition-[width] duration-300"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <span className="font-mono text-xs font-bold text-[#4a6573] tabular-nums">
            {done.length}/{steps.length} completados
          </span>
        </div>
      </div>

      {/* ACCESOS DIRECTOS A PASOS CON DUDAS O CAMBIOS */}
      {activeActivitySteps.length > 0 && !compact && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#d6e2e8] bg-[#f6fafc] px-4 py-2 text-xs">
          <span className="font-extrabold text-[#2a4b5c]">Actividad en pasos:</span>
          {activeActivitySteps.map((s) => {
            const idx = steps.findIndex((st) => st.id === s.id);
            const dCount = doubtsByStep[s.id] ?? 0;
            const pCount = pendingByStep[s.id] ?? 0;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (displayMode === "diagrama") {
                    openStepFromDiagram(s.id, dCount === 0 && pCount > 0 ? "cambios" : "dudas");
                  } else {
                    navigateToPath(pathToStep(steps, s.id), true);
                    setForumTab(dCount === 0 && pCount > 0 ? "cambios" : "dudas");
                    setGuidedForumOpen(true);
                  }
                }}
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-bold transition ${
                  s.id === step.id && (stepDialogOpen || displayMode === "recorrido")
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

      {/* VISTA 1: DIAGRAMA VERTICAL INTERACTIVO (AL HACER CLIC ABRE EL PASO Y SU MINI-FORO) */}
      {displayMode === "diagrama" ? (
        <>
          <GuideFlowchart
            steps={steps}
            currentStepId={stepDialogOpen ? step.id : undefined}
            activePath={stepDialogOpen ? path : []}
            completedSteps={done}
            doubtsByStep={doubtsByStep}
            pendingByStep={pendingByStep}
            onSelect={(id) => openStepFromDiagram(id)}
            compact={compact}
          />

          {stepDialogOpen && (
            <FormDialog
              key={`dialog-step-${step.id}`}
              kicker={
                choices.length > 1
                  ? `Punto de decisión · Paso ${index + 1} de ${steps.length}`
                  : `Paso ${index + 1} de ${steps.length}`
              }
              title={step.title || `Paso ${index + 1}`}
              accent={choices.length > 1 ? "amber" : checked ? "teal" : "blue"}
              size="xl"
              onClose={() => {
                setStepDialogOpen(false);
                setComposerOpen(null);
              }}
            >
              <div className="space-y-5">
                {/* DETALLE DEL PASO */}
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggle(step.id)}
                      className={`rounded-md border px-3.5 py-1.5 text-xs font-extrabold transition ${
                        checked
                          ? "border-[#165b47] bg-[#165b47] text-white"
                          : "border-[#b4ccd8] bg-white text-[#0c5170] hover:bg-[#edf6fa]"
                      }`}
                    >
                      {checked ? "✓ Paso completado" : "Marcar como completado"}
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      {prevStepPath && (
                        <button
                          type="button"
                          onClick={() => {
                            setPath(prevStepPath);
                            setComposerOpen(null);
                          }}
                          className="rounded border border-[#cdd8de] bg-white px-2.5 py-1 text-xs font-bold text-[#3c5766] hover:border-[#006699] hover:text-[#006699]"
                        >
                          ← Anterior
                        </button>
                      )}
                      {singleNextTarget && (
                        <button
                          type="button"
                          onClick={() => {
                            setPath([...path, singleNextTarget.id]);
                            setComposerOpen(null);
                          }}
                          className="rounded border border-[#a9c7d5] bg-[#eef7fb] px-2.5 py-1 text-xs font-extrabold text-[#004d73] hover:border-[#006699] hover:bg-[#dfeff7]"
                        >
                          Siguiente: Paso {singleNextIdx + 1} →
                        </button>
                      )}
                    </div>
                  </div>

                  {step.body && step.body.trim() !== step.title.trim() && (
                    <p className="whitespace-pre-wrap text-sm leading-7 text-[#2f4957]">
                      {step.body}
                    </p>
                  )}

                  {step.imageUrl && (
                    <img
                      src={step.imageUrl}
                      alt={`Referencia visual: ${step.title}`}
                      className="max-h-72 w-auto rounded-md border border-[#d5e4ee] bg-[#fafcfd] object-contain"
                    />
                  )}

                  {choices.length > 1 && (
                    <div className="space-y-2 rounded-md border border-[#e3d2a4] bg-[#fffcf2] p-3.5">
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#785106]">
                        Opciones desde este paso
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {choices.map((choice, ci) => {
                          const target = steps.find((s) => s.id === choice.to);
                          const targetIdx = steps.findIndex((s) => s.id === choice.to);
                          if (!target) return null;
                          return (
                            <button
                              key={ci}
                              type="button"
                              onClick={() => {
                                setPath([...path, target.id]);
                                setComposerOpen(null);
                              }}
                              className="flex items-center justify-between gap-2 rounded border border-[#dfc88e] bg-white px-3 py-2 text-left text-xs font-bold text-[#142c3c] hover:border-[#b38216] hover:bg-[#fef6dc]"
                            >
                              <span className="min-w-0 truncate">
                                {choice.label} · Paso {targetIdx + 1}
                              </span>
                              <span aria-hidden="true">→</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* MINI-FORO DEL PASO */}
                <div className="border-t border-[#d8e2e8] pt-4">
                  <StepMiniForum
                    step={step}
                    stepNumber={index + 1}
                    guideId={guideId}
                    area={area}
                    signedIn={signedIn}
                    compact={compact}
                    relatedThreads={relatedThreads}
                    stepSuggestionsCount={stepSuggestionsCount}
                    stepExtra={stepExtras?.[step.id]}
                    forumTab={forumTab}
                    onTabChange={setForumTab}
                    composerOpen={composerOpen}
                    onComposerChange={setComposerOpen}
                  />
                </div>
              </div>
            </FormDialog>
          )}
        </>
      ) : (
        /* VISTA 2: RECORRIDO GUIADO PASO A PASO */
        <div className="space-y-4">
          {/* STEPPER / BARRA DE PASOS */}
          {!hasBranches ? (
            <nav
              aria-label="Pasos del trámite"
              className="overflow-x-auto rounded-md border border-[#d4dfe5] bg-[#f7fafb] p-3"
            >
              <ol className="flex min-w-max items-center gap-1.5">
                {steps.map((s, idx) => {
                  const isCurrent = s.id === step.id;
                  const isDone = done.includes(s.id);
                  const hasActivity = (doubtsByStep[s.id] ?? 0) > 0 || (pendingByStep[s.id] ?? 0) > 0;
                  return (
                    <li key={s.id} className="flex items-center gap-1.5">
                      {idx > 0 && (
                        <span
                          aria-hidden="true"
                          className={`h-0.5 w-5 rounded-full ${
                            idx <= index ? "bg-[#006699]" : "bg-[#cdd9e0]"
                          }`}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => navigateToPath(pathToStep(steps, s.id), true)}
                        aria-current={isCurrent ? "step" : undefined}
                        className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-bold transition ${
                          isCurrent
                            ? "border-[#006699] bg-[#006699] text-white shadow-xs"
                            : isDone
                              ? "border-[#9bcab6] bg-[#ebf7f1] text-[#145542] hover:border-[#165b47]"
                              : "border-[#cfdce3] bg-white text-[#2a4757] hover:border-[#006699]"
                        }`}
                      >
                        <span
                          className={`grid h-5 w-5 place-items-center rounded font-mono text-[11px] font-black ${
                            isCurrent
                              ? "bg-white/20 text-white"
                              : isDone
                                ? "bg-[#165b47] text-white"
                                : "bg-[#e7f0f5] text-[#14435a]"
                          }`}
                        >
                          {isDone ? "✓" : idx + 1}
                        </span>
                        <span className="max-w-[160px] truncate">{s.title}</span>
                        {hasActivity && (
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isCurrent ? "bg-[#ffe28a]" : "bg-[#006699]"
                            }`}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          ) : (
            path.length > 1 && (
              <nav
                aria-label="Ruta recorrida"
                className="flex flex-wrap items-center gap-1.5 rounded-md border border-[#d4dfe5] bg-[#f7fafb] px-3.5 py-2.5 text-xs text-[#466271]"
              >
                {path.map((id, i) => {
                  const node = steps.find((s) => s.id === id);
                  const nodeIdx = steps.findIndex((s) => s.id === id);
                  if (!node) return null;
                  return (
                    <span key={`${id}-${i}`} className="inline-flex items-center gap-1.5">
                      {i > 0 && (
                        <span aria-hidden="true" className="text-[#8ba2ae]">
                          →
                        </span>
                      )}
                      {i === path.length - 1 ? (
                        <strong aria-current="step" className="text-[#142c3c]">
                          {nodeIdx + 1}. {node.title}
                        </strong>
                      ) : (
                        <button
                          type="button"
                          className="font-semibold text-[#006699] hover:underline"
                          onClick={() => navigateToPath(path.slice(0, i + 1), true)}
                        >
                          {nodeIdx + 1}. {node.title}
                        </button>
                      )}
                    </span>
                  );
                })}
              </nav>
            )
          )}

          {/* TARJETA PRINCIPAL DEL PASO ACTUAL */}
          <article className="overflow-hidden rounded-md border border-[#b7cdd6] border-t-4 border-t-[#006699] bg-[#fffdf7] shadow-[0_3px_12px_rgba(20,44,60,0.05)]">
            <div className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-[#006699] px-2.5 py-1 font-mono text-xs font-black text-white">
                    PASO {index + 1} DE {steps.length}
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
                  className={`rounded-md border px-3.5 py-1.5 text-xs font-extrabold transition ${
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

              {step.body && step.body.trim() !== step.title.trim() && (
                <p className="whitespace-pre-wrap text-sm leading-7 text-[#374f5c]">{step.body}</p>
              )}

              {step.imageUrl && (
                <img
                  src={step.imageUrl}
                  alt={`Referencia visual: ${step.title}`}
                  className="max-h-80 w-auto rounded-md border border-[#d5e4ee] bg-[#fafcfd] object-contain"
                />
              )}

              {/* CONTROLES DE NAVEGACIÓN ENTRE PASOS */}
              <div className="space-y-3 border-t border-[#e5ecee] pt-4">
                {choices.length > 1 ? (
                  <div className="space-y-2.5">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-[#785106]">
                      Elige la opción que aplica a tu caso
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {choices.map((choice, i) => {
                        const target = steps.find((s) => s.id === choice.to);
                        const targetIdx = steps.findIndex((s) => s.id === choice.to);
                        if (!target) return null;
                        return (
                          <button
                            type="button"
                            key={i}
                            onClick={() => navigateToPath([...path, target.id], true)}
                            className="group flex items-center justify-between gap-3 rounded-md border border-[#dfc88e] bg-[#fffaf0] px-4 py-3 text-left text-[#142c3c] transition hover:border-[#b38216] hover:bg-[#fef3d6]"
                          >
                            <div className="min-w-0">
                              <span className="block text-sm font-extrabold">{choice.label}</span>
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
                        );
                      })}
                    </div>
                    {prevStepPath && (
                      <button
                        type="button"
                        className="text-xs font-extrabold text-[#006699] hover:underline"
                        onClick={() => navigateToPath(prevStepPath, true)}
                      >
                        ← Regresar al paso anterior
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      {prevStepPath ? (
                        <button
                          type="button"
                          onClick={() => navigateToPath(prevStepPath, true)}
                          className={btnGhost}
                        >
                          ← Paso anterior
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-[#607582]">
                          Inicio del trámite
                        </span>
                      )}
                    </div>

                    {singleNextTarget ? (
                      <button
                        type="button"
                        onClick={() => navigateToPath([...path, singleNextTarget.id], true)}
                        className="group inline-flex items-center gap-2 rounded-md bg-[#006699] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#004d73]"
                      >
                        <span>
                          Siguiente: Paso {singleNextIdx + 1}
                          {singleNextTarget.title ? ` · ${singleNextTarget.title}` : ""}
                        </span>
                        <span
                          aria-hidden="true"
                          className="transition group-hover:translate-x-0.5"
                        >
                          →
                        </span>
                      </button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="rounded-md border border-[#b7dccb] bg-[#eef8f3] px-3.5 py-2 text-xs font-extrabold text-[#165b47]">
                          {path.every((id) => done.includes(id))
                            ? "✓ Completaste todos los pasos"
                            : "Último paso del trámite"}
                        </span>
                        {steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => navigateToPath([steps[0].id], true)}
                            className={btnGhost}
                          >
                            Volver al Paso 1
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* BARRA DEL MINI-FORO DEL PASO ACTUAL */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#d8e3e9] bg-[#f3f8fa] px-5 py-3">
              <span className="text-xs font-extrabold text-[#2b4c5e]">
                Mini-foro · Paso {index + 1}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-expanded={guidedForumOpen && forumTab === "dudas"}
                  onClick={() => handleGuidedTabToggle("dudas")}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-extrabold transition ${
                    guidedForumOpen && forumTab === "dudas"
                      ? "border-[#142c3c] bg-[#142c3c] text-white"
                      : "border-[#c2d4de] bg-white text-[#143a4d] hover:border-[#006699]"
                  }`}
                >
                  <span>💬 Dudas ({relatedThreads.length})</span>
                </button>
                <button
                  type="button"
                  aria-expanded={guidedForumOpen && forumTab === "cambios"}
                  onClick={() => handleGuidedTabToggle("cambios")}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-extrabold transition ${
                    guidedForumOpen && forumTab === "cambios"
                      ? "border-[#142c3c] bg-[#142c3c] text-white"
                      : "border-[#c2d4de] bg-white text-[#143a4d] hover:border-[#006699]"
                  }`}
                >
                  <span>✎ Pedir cambio ({stepSuggestionsCount})</span>
                </button>
              </div>
            </div>

            {guidedForumOpen && (
              <div className="border-t border-[#d8e3e9] bg-[#fffdf7] p-5">
                <StepMiniForum
                  step={step}
                  stepNumber={index + 1}
                  guideId={guideId}
                  area={area}
                  signedIn={signedIn}
                  compact={compact}
                  relatedThreads={relatedThreads}
                  stepSuggestionsCount={stepSuggestionsCount}
                  stepExtra={stepExtras?.[step.id]}
                  forumTab={forumTab}
                  onTabChange={setForumTab}
                  composerOpen={composerOpen}
                  onComposerChange={setComposerOpen}
                />
              </div>
            )}
          </article>
        </div>
      )}
    </div>
  );
}
