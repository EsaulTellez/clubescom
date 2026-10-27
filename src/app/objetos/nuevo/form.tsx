"use client";

import { useActionState } from "react";
import { createItem } from "../actions";
import type { FormState } from "../labels";
import { btn, input, label } from "@/lib/ui";

export function ReportForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createItem, {});
  return (
    <form action={action} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className={label}>Tipo</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="kind" value="perdido" required defaultChecked />
            Perdí algo
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="kind" value="encontrado" />
            Encontré algo
          </label>
        </div>
      </fieldset>
      <label className={label}>
        Título
        <input className={`${input} mt-1`} name="title" required minLength={3} maxLength={120} />
      </label>
      <label className={label}>
        Descripción
        <textarea className={`${input} mt-1 min-h-28`} name="description" required minLength={10} maxLength={2000} />
      </label>
      <label className={label}>
        Lugar
        <input className={`${input} mt-1`} name="place" required minLength={2} maxLength={160} placeholder="Edificio, salón o zona" />
      </label>
      <label className={label}>
        Foto (opcional, máx. 900 KB)
        <input className={`${input} mt-1`} name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" />
      </label>
      <label className={label}>
        Pregunta de seguridad
        <input className={`${input} mt-1`} name="security_question" required minLength={5} maxLength={200} placeholder="¿De qué color es la funda?" />
      </label>
      <label className={label}>
        Respuesta
        <input className={`${input} mt-1`} name="security_answer" required minLength={2} maxLength={120} autoComplete="off" />
        <span className="mt-1 block text-xs font-normal text-[#667085]">
          Solo guardamos un hash. Quien reclame el objeto tiene que responder esta pregunta.
        </span>
      </label>
      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      <button className={btn} disabled={pending}>
        {pending ? "Publicando…" : "Publicar reporte"}
      </button>
    </form>
  );
}
