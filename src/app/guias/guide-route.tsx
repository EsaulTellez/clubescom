"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { QuestionForm } from "../foro/question-form";
import { publishQuestion } from "../foro/actions";
import { SuggestForm } from "./[id]/suggest-form";
import { suggestImprovement } from "./actions";
import { RouteMap } from "./route-map";
import { pathToStep, routesFrom, type GuideStep } from "./shared";

export type StepThread = { id: string; stepId: number; title: string; status: string };
type Panel = "preguntar" | "editar";

export function GuideRoute({ steps, guideId, area, signedIn, done, toggle, threads, stepExtras, initialStep, initialPanel }: {
  steps: GuideStep[]; guideId: string; area: string; signedIn: boolean; done: number[];
  toggle: (id: number) => void; threads: StepThread[]; stepExtras?: Record<number, ReactNode>;
  initialStep?: number; initialPanel?: Panel;
}) {
  const [path, setPath] = useState(() => pathToStep(steps, initialStep));
  const [panel, setPanel] = useState<Panel | undefined>(initialPanel);
  const heading = useRef<HTMLHeadingElement>(null);
  const index = Math.max(0, steps.findIndex(s => s.id === path.at(-1)));
  const step = steps[index];
  if (!step) return <p>Esta guía todavía no tiene pasos.</p>;
  const choices = routesFrom(steps, index);
  const checked = done.includes(step.id);
  const related = threads.filter(t => t.stepId === step.id);
  function navigate(nextPath: number[]) {
    setPath(nextPath);
    setPanel(undefined);
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }
  function showPanel(next: Panel) { setPanel(panel === next ? undefined : next); }
  const control = "rounded-md border border-[#bad0db] bg-white px-3 py-2 text-sm font-bold text-[#005880] hover:bg-[#eff6f9]";
  return <div className="space-y-3">
    {steps.length > 1 && <RouteMap steps={steps} current={step.id} onSelect={id => navigate(pathToStep(steps, id))} />}
    {path.length > 1 && <nav aria-label="Ruta recorrida" className="flex flex-wrap items-center gap-1 text-xs text-[#466271]">
      {path.map((id, i) => {
        const node = steps.find(s => s.id === id);
        if (!node) return null;
        return <span key={id}>{i > 0 && <span aria-hidden="true"> › </span>}{i === path.length - 1 ? <strong aria-current="step">{node.title}</strong> :
          <button type="button" className="p-1 underline" onClick={() => navigate(path.slice(0, i + 1))}>{node.title}</button>}</span>;
      })}
    </nav>}
    <article className="overflow-hidden rounded-xl border border-[#b7cdd6] border-t-4 border-t-[#006699] bg-white">
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-extrabold uppercase tracking-widest text-[#006699]">Paso {index + 1}</span>
          <button type="button" className={control} aria-pressed={checked} onClick={() => toggle(step.id)}>{checked ? "✓ Completado" : "Marcar como listo"}</button>
        </div>
        <h3 ref={heading} tabIndex={-1} className="text-xl font-extrabold text-[#15374a]">{step.title}</h3>
        {step.body !== step.title && <p className="whitespace-pre-wrap text-sm leading-6 text-[#425967]">{step.body}</p>}
        {choices.length ? <div className="space-y-2 pt-2">
          {choices.length > 1 && <p className="text-sm font-bold">¿Qué opción corresponde a tu caso?</p>}
          <div className="ml-2 grid gap-2 border-l-2 border-[#8eb8ca] pl-4">
            {choices.map((choice, i) => {
              const target = steps.find(s => s.id === choice.to);
              return target && <button type="button" key={i} onClick={() => navigate([...path, target.id])} className="relative flex items-center justify-between gap-2 rounded-md border border-[#a9c7d5] bg-[#eff7fa] px-3 py-2 text-left text-sm text-[#004d73] before:absolute before:-left-[18px] before:w-4 before:border-t-2 before:border-[#8eb8ca] hover:bg-[#dfedf4]">
                <span><strong>{choice.label}</strong>{choice.label !== target.title && <span className="block text-xs">{target.title}</span>}</span><span aria-hidden="true">→</span>
              </button>;
            })}
          </div>
        </div> : <p className="border-l-2 border-[#428266] pl-3 text-sm font-bold text-[#285c48]">{path.every(id => done.includes(id)) ? "✓ Ruta completada" : "Fin de esta ruta"}</p>}
        {path.length > 1 && <button type="button" className="text-sm font-bold text-[#006699] underline" onClick={() => navigate(path.slice(0, -1))}>← Paso anterior</button>}
      </div>
      <div key={step.id} className="space-y-3 border-t border-[#d3dfe4] bg-[#fafaf6] p-4 sm:p-5">
        {related.length > 0 && <div>
          <h4 className="text-sm font-bold">Dudas del foro en este paso</h4>
          <ul className="divide-y divide-[#dce4e6]">{related.map(t => <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <Link className="font-semibold text-[#006699] underline" href={`/foro?duda=${t.id}#duda-${t.id}`}>{t.title}</Link>
            <span className="text-xs">{t.status === "respondida" ? "Respondida" : "Sin responder"}</span>
          </li>)}</ul>
        </div>}
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-expanded={panel === "preguntar"} className={control} onClick={() => showPanel("preguntar")}>Preguntar en el foro</button>
          <button type="button" aria-expanded={panel === "editar"} className={control} onClick={() => showPanel("editar")}>Proponer un cambio</button>
        </div>
        {panel && (signedIn ? panel === "preguntar"
          ? <QuestionForm action={publishQuestion} defaultArea={area} step={{ guideId, id: step.id }} />
          : <SuggestForm action={suggestImprovement} guideId={guideId} stepIndex={step.id} />
          : <Link href="/entrar" className="text-sm font-bold text-[#006699] underline">Inicia sesión para participar</Link>)}
        {stepExtras?.[step.id]}
      </div>
    </article>
  </div>;
}
