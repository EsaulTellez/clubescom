"use client";

import { useActionState, useState } from "react";
import { btn, btnGhost, input, label } from "@/lib/ui";
import { editGuide } from "../../actions";
import type { GuideFaq, GuideStep } from "../../shared";

export function EditGuideForm({
  id,
  version,
  title,
  summary,
  steps: initialSteps,
  faqs: initialFaqs = [],
  attachmentName,
}: {
  id: string;
  version: number;
  title: string;
  summary: string;
  steps: GuideStep[];
  faqs?: GuideFaq[];
  attachmentName?: string | null;
}) {
  const [state, action, pending] = useActionState(editGuide, {});
  const [steps, setSteps] = useState<GuideStep[]>(
    initialSteps.length ? initialSteps : [{ title: "", body: "" }],
  );
  const [faqs, setFaqs] = useState<GuideFaq[]>(initialFaqs);

  function updateStep(index: number, patch: Partial<GuideStep>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep() {
    if (steps.length >= 30) return;
    setSteps((prev) => [...prev, { title: "", body: "" }]);
  }

  function removeStep(index: number) {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((_, i) => i !== index));
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

  function updateFaq(index: number, patch: Partial<GuideFaq>) {
    setFaqs((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function addFaq() {
    setFaqs((prev) => [...prev, { q: "", a: "" }]);
  }

  function removeFaq(index: number) {
    setFaqs((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="steps_json" value={JSON.stringify(steps)} />
      <input type="hidden" name="faqs_json" value={JSON.stringify(faqs)} />

      <label className={label}>
        Título
        <input className={input} name="title" defaultValue={title} required minLength={4} maxLength={180} />
      </label>
      <label className={label}>
        Resumen
        <textarea className={`${input} min-h-20`} name="summary" defaultValue={summary} required minLength={8} maxLength={800} />
      </label>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Pasos de la guía ({steps.length})</p>
          <button type="button" onClick={addStep} className={btnGhost}>
            + Agregar paso
          </button>
        </div>
        {steps.map((step, index) => (
          <fieldset key={index} className="space-y-3 rounded-xl border border-[#d5e4ee] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <legend className="px-1 text-sm font-semibold">Paso {index + 1}</legend>
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
          </fieldset>
        ))}
      </div>

      <div className="space-y-3 border-t border-[#d5e4ee] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Preguntas frecuentes ({faqs.length})</p>
          <button type="button" onClick={addFaq} className={btnGhost}>
            + Agregar pregunta frecuente
          </button>
        </div>
        {faqs.map((faq, index) => (
          <div key={index} className="space-y-2 rounded-xl border border-[#d5e4ee] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#006699]">FAQ #{index + 1}</span>
              <button
                type="button"
                onClick={() => removeFaq(index)}
                className="text-xs font-bold text-[#8C1D18]"
              >
                Quitar
              </button>
            </div>
            <label className={label}>
              Pregunta
              <input
                className={input}
                value={faq.q}
                onChange={(e) => updateFaq(index, { q: e.target.value })}
                maxLength={200}
              />
            </label>
            <label className={label}>
              Respuesta
              <textarea
                className={`${input} min-h-16`}
                value={faq.a}
                onChange={(e) => updateFaq(index, { a: e.target.value })}
                maxLength={2000}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="border-t border-[#d5e4ee] pt-4">
        <label className={label}>
          Reemplazar o adjuntar formato PDF descargable del trámite (RF-12 · máx. 10 MB)
          <input className={input} name="attachment" type="file" accept="application/pdf" />
        </label>
        {attachmentName && (
          <p className="mt-1 text-xs text-[#667085]">Adjunto actual: {attachmentName}</p>
        )}
      </div>

      {state.error && <p className="text-sm text-[#8C1D18]" role="alert">{state.error}</p>}
      <button className={btn} disabled={pending}>
        {pending ? "Guardando…" : "Guardar nueva versión de la guía"}
      </button>
    </form>
  );
}
