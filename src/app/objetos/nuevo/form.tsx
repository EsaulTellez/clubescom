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
        <div className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-sm border border-[#cfcbbf] p-3 text-sm font-bold has-checked:border-[#155772] has-checked:bg-[#e8f0ef]">
            <input type="radio" name="kind" value="perdido" required defaultChecked />
            Perdí algo
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-sm border border-[#cfcbbf] p-3 text-sm font-bold has-checked:border-[#155772] has-checked:bg-[#e8f0ef]">
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
        Foto 1 (opcional, JPG, PNG o WEBP · máx. 5 MB)
        <input className={`${input} mt-1`} name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
      </label>
      <label className={label}>
        Foto 2 (opcional · segundo ángulo o detalle)
        <input className={`${input} mt-1`} name="photo_2" type="file" accept="image/jpeg,image/png,image/webp" />
      </label>
      <label className={label}>
        Pregunta de seguridad (obligatoria si encontraste el objeto)
        <input className={`${input} mt-1`} name="security_question" minLength={5} maxLength={200} placeholder="¿De qué color es la funda?" />
      </label>
      <label className={label}>
        Respuesta (obligatoria si encontraste el objeto)
        <input className={`${input} mt-1`} name="security_answer" minLength={2} maxLength={120} autoComplete="off" />
        <span className="mt-1 block text-xs font-normal text-[#667085]">
          La respuesta es privada. Se usa para verificar el reclamo.
        </span>
      </label>
      {state.error && <p role="alert" className="text-sm text-[#8C1D18]">{state.error}</p>}
      <button className={btn} disabled={pending}>
        {pending ? "Publicando…" : "Publicar reporte"}
      </button>
    </form>
  );
}
