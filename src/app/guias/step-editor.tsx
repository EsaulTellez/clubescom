"use client";

import { useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { btnGhost, input, label } from "@/lib/ui";
import { RouteMap } from "./route-map";
import { validateSteps } from "./shared";
import type { GuideChoice, GuideStep } from "./shared";

export function StepEditor({ steps, setSteps, version = 0 }: {
  steps: GuideStep[];
  setSteps: Dispatch<SetStateAction<GuideStep[]>>;
  version?: number;
}) {
  const nextId = useRef(0);
  function updateStep(index: number, patch: Partial<GuideStep>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep() {
    if (steps.length >= 30) return;
    nextId.current = Math.max(version * 100, nextId.current, ...steps.map(step => step.id + 1));
    setSteps([...steps, { id: nextId.current++, title: "", body: "" }]);
  }

  function removeStep(index: number) {
    if (steps.length <= 1) return;
    const removed = steps[index].id;
    setSteps(steps.filter(step => step.id !== removed).map(step =>
      step.choices ? { ...step, choices: step.choices.filter(choice => choice.to !== removed) } : step
    ));
  }

  function moveStep(index: number, delta: -1 | 1) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= steps.length) return;
    setSteps((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  }

  const valid = validateSteps(steps);
  return <>
    <input type="hidden" name="steps_json" value={JSON.stringify(steps)} />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Pasos de la guía ({steps.length})</p>
          <button type="button" disabled={steps.length >= 30} onClick={addStep} className={btnGhost}>
            + Agregar paso
          </button>
        </div>
        {"steps" in valid && steps.length > 1 && <RouteMap steps={valid.steps} />}
        {steps.map((step, index) => (
          <fieldset key={step.id} className="space-y-3 rounded-xl border border-[#d5e4ee] p-4">
            <legend className="px-1 text-sm font-bold text-[#006699]">Paso {index + 1}</legend>
            <div className="flex justify-end">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => moveStep(index, -1)}
                  disabled={index === 0}
                  className="rounded border border-[#c6d8da] px-2 py-1 text-xs font-bold disabled:opacity-40"
                >
                  ↑ Subir
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(index, 1)}
                  disabled={index === steps.length - 1}
                  className="rounded border border-[#c6d8da] px-2 py-1 text-xs font-bold disabled:opacity-40"
                >
                  ↓ Bajar
                </button>
                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    className="rounded border border-[#e6b8ae] px-2 py-1 text-xs font-bold text-[#8C1D18]"
                  >
                    Eliminar paso
                  </button>
                )}
              </div>
            </div>
            <label className={label}>
              Título
              <input
                className={input}
                value={step.title}
                onChange={(e) => updateStep(index, { title: e.target.value })}
                required
                maxLength={160}
              />
            </label>
            <label className={label}>
              Descripción
              <textarea
                className={`${input} min-h-24`}
                value={step.body}
                onChange={(e) => updateStep(index, { body: e.target.value })}
                required
                maxLength={2000}
              />
            </label>
            <label className={label}>Al terminar este paso
              <select className={input} value={step.choices === undefined ? "next" : step.choices.length ? "branch" : "end"}
                onChange={event => {
                  const mode = event.target.value;
                  updateStep(index, { choices: mode === "next" ? undefined : mode === "end" ? [] : [{ label: "", to: steps.find(s => s.id !== step.id)!.id }] });
                }}>
                <option value="next">Continuar en orden</option>
                <option value="branch" disabled={steps.length < 2}>Elegir una ruta</option>
                <option value="end">Finalizar la ruta</option>
              </select>
            </label>
            {step.choices && step.choices.length > 0 && <div className="ml-2 space-y-3 border-l-2 border-[#91bdce] pl-4">
              {step.choices.map((choice, i) => {
                const update = (patch: Partial<GuideChoice>) => updateStep(index, { choices: step.choices!.map((c, j) => j === i ? { ...c, ...patch } : c) });
                return <div key={i} className="grid gap-2 sm:grid-cols-2">
                  <label className={label}>Condición {i + 1}<input className={input} required maxLength={140} value={choice.label} placeholder="Si es tu primera solicitud" onChange={e => update({ label: e.target.value })} /></label>
                  <label className={label}>Ir al paso<select className={input} value={choice.to} onChange={e => update({ to: Number(e.target.value) })}>
                    {steps.map((s, j) => s.id !== step.id && <option key={s.id} value={s.id}>{j + 1}. {s.title}</option>)}
                  </select></label>
                  <button type="button" className="justify-self-start text-xs underline" onClick={() => updateStep(index, { choices: step.choices!.filter((_, j) => i !== j) })}>Quitar opción</button>
                </div>;
              })}
              <button type="button" className={btnGhost} onClick={() => updateStep(index, { choices: [...step.choices!, { label: "", to: steps.find(s => s.id !== step.id)!.id }] })}>+ Agregar opción</button>
            </div>}
          </fieldset>
        ))}
      </div>

  </>;
}
