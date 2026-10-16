"use client";

import Link from "next/link";
import { useActionState } from "react";
import { btn, input, label } from "@/lib/ui";
import type { QuestionState } from "./actions";
import { AREAS, isArea } from "./shared";

export function QuestionForm({
  action,
  defaultArea,
}: {
  action: (state: QuestionState, form: FormData) => Promise<QuestionState>;
  defaultArea?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const area = defaultArea && isArea(defaultArea) ? defaultArea : "general";

  return (
    <form action={formAction} className="space-y-3">
      <label className={label}>
        Área
        <select className={input} name="area" defaultValue={area}>
          {AREAS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Título
        <input
          className={input}
          name="title"
          required
          minLength={8}
          maxLength={180}
          placeholder="¿Cómo tramito una constancia de estudios?"
        />
      </label>
      <p className="text-xs text-[#667085]">
        Si ya existe una pregunta muy parecida, te la mostramos y no publicamos un duplicado.
      </p>
      <label className={label}>
        Detalle
        <textarea
          className={`${input} min-h-28`}
          name="body"
          required
          minLength={10}
          maxLength={5000}
          placeholder="Cuenta en qué punto del trámite te atoras y qué ya intentaste."
        />
      </label>
      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      {state.duplicate && (
        <div className="rounded-lg border border-[#d5e4ee] bg-[#e6f3fa] p-3 text-sm">
          <p>Ya existe una pregunta parecida. Revísala antes de abrir otra.</p>
          <Link
            href={`/foro/${state.duplicate.id}`}
            className="mt-2 inline-block font-medium text-[#006699] underline"
          >
            {state.duplicate.title}
          </Link>
        </div>
      )}
      <button className={btn} disabled={pending}>
        {pending ? "Publicando…" : "Publicar pregunta"}
      </button>
    </form>
  );
}
