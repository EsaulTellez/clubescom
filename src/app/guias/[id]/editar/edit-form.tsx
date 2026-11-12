"use client";

import { useActionState } from "react";
import { btn, input, label } from "@/lib/ui";
import { editGuide } from "../../actions";
import type { GuideStep } from "../../shared";

export function EditGuideForm({ id, version, title, summary, steps }: {
  id: string; version: number; title: string; summary: string; steps: GuideStep[];
}) {
  const [state, action, pending] = useActionState(editGuide, {});
  return <form action={action} className="space-y-4">
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="version" value={version} />
    <label className={label}>Título
      <input className={input} name="title" defaultValue={title} required minLength={4} maxLength={180} />
    </label>
    <label className={label}>Resumen
      <textarea className={`${input} min-h-20`} name="summary" defaultValue={summary} required minLength={8} maxLength={800} />
    </label>
    <p className="text-sm text-[#667085]">Edita el contenido de cada paso sin cambiar su orden para conservar sus preguntas y sugerencias.</p>
    {steps.map((step, index) => <fieldset key={index} className="space-y-3 rounded-xl border border-[#d5e4ee] p-4">
      <legend className="px-1 text-sm font-semibold">Paso {index + 1}</legend>
      <label className={label}>Título
        <input className={input} name={`step_title_${index}`} defaultValue={step.title} required maxLength={160} />
      </label>
      <label className={label}>Descripción
        <textarea className={`${input} min-h-28`} name={`step_body_${index}`} defaultValue={step.body} required maxLength={2000} />
      </label>
    </fieldset>)}
    {state.error && <p className="text-sm text-[#8C1D18]" role="alert">{state.error}</p>}
    <button className={btn} disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</button>
  </form>;
}
