"use client";

import { useActionState } from "react";
import { btn, input, label } from "@/lib/ui";
import type { GuideState } from "../actions";
import { AREAS } from "../shared";

export function GuideForm({
  action,
}: {
  action: (state: GuideState, form: FormData) => Promise<GuideState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-3">
      <label className={label}>
        Área
        <select className={input} name="area" defaultValue="gestion_escolar">
          {AREAS.map((area) => (
            <option key={area.id} value={area.id}>
              {area.label}
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
          minLength={4}
          maxLength={180}
          placeholder="Constancia de estudios"
        />
      </label>
      <label className={label}>
        Resumen
        <textarea
          className={`${input} min-h-20`}
          name="summary"
          required
          minLength={8}
          maxLength={800}
          placeholder="Qué resuelve esta guía y quién la necesita."
        />
      </label>
      <label className={label}>
        Pasos
        <textarea
          className={`${input} min-h-36 font-mono text-xs`}
          name="steps"
          required
          placeholder={"Constancia | Solicítala en Gestión Escolar con boleta vigente.\nPago | Conserva el comprobante para recoger el documento."}
        />
      </label>
      <p className="text-xs text-[#667085]">
        Un paso por línea, con el formato titulo | texto.
      </p>
      <label className={label}>
        Preguntas frecuentes (opcional)
        <textarea
          className={`${input} min-h-24 font-mono text-xs`}
          name="faqs"
          placeholder={"¿Cuál es el horario? | De lunes a viernes, de 10:00 a 14:00."}
        />
      </label>
      <p className="text-xs text-[#667085]">
        Una pregunta por línea, con el formato pregunta | respuesta.
      </p>
      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      <button className={btn} disabled={pending}>
        {pending ? "Publicando…" : "Publicar guía"}
      </button>
    </form>
  );
}
