"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/loading-ui";
import { ImageUploadField } from "@/components/image-upload-field";
import { createItem } from "../actions";
import type { FormState } from "../labels";
import { btn, input, label } from "@/lib/ui";

export function ReportForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createItem, {});
  const [kind, setKind] = useState<"perdido" | "encontrado">("perdido");

  return (
    <form action={action} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className={label}>Tipo de reporte</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-sm border border-[#cfcbbf] p-3 text-sm font-bold has-checked:border-[#155772] has-checked:bg-[#e8f0ef]">
            <input
              type="radio"
              name="kind"
              value="perdido"
              required
              checked={kind === "perdido"}
              onChange={() => setKind("perdido")}
            />
            Perdí algo
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-sm border border-[#cfcbbf] p-3 text-sm font-bold has-checked:border-[#155772] has-checked:bg-[#e8f0ef]">
            <input
              type="radio"
              name="kind"
              value="encontrado"
              checked={kind === "encontrado"}
              onChange={() => setKind("encontrado")}
            />
            Encontré algo
          </label>
        </div>
      </fieldset>
      <label className={label}>
        Título
        <input
          className={`${input} mt-1`}
          name="title"
          required
          minLength={3}
          maxLength={120}
          placeholder={kind === "encontrado" ? "Ej. Credencial, calculadora o mochila encontrada" : "Ej. Termo azul perdido en edificio 2"}
        />
      </label>
      <label className={label}>
        Descripción (evita revelar detalles privados si lo encontraste)
        <textarea className={`${input} mt-1 min-h-28`} name="description" required minLength={10} maxLength={2000} />
      </label>
      <label className={label}>
        Lugar
        <input className={`${input} mt-1`} name="place" required minLength={2} maxLength={160} placeholder="Edificio, salón o zona" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageUploadField name="photo" label="Foto 1 (opcional · JPG, PNG o WEBP)" compact />
        <ImageUploadField name="photo_2" label="Foto 2 (opcional · segundo ángulo)" compact />
      </div>

      {kind === "encontrado" && (
        <div className="space-y-3 rounded-xl border border-[#cde0ea] bg-[#f4f9fc] p-4">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#005580]">
            Pregunta llave para validar al dueño real
          </p>
          <label className={label}>
            Pregunta secreta que solo el dueño pueda responder
            <input
              className={`${input} mt-1`}
              name="security_question"
              required
              minLength={5}
              maxLength={200}
              placeholder="Ej. ¿Qué nombre, calcomanía o llavero trae?"
            />
          </label>
          <label className={label}>
            Respuesta clave esperada
            <input
              className={`${input} mt-1`}
              name="security_answer"
              required
              minLength={2}
              maxLength={120}
              autoComplete="off"
              placeholder="Ej. Casio fx-991 o llavero de gato"
            />
            <span className="mt-1 block text-xs font-normal text-[#4b626e]">
              Se evalúa coincidencia aproximada (palabras clave, sin acentos ni mayúsculas) y tú decides si el reclamo coincide con el dueño real.
            </span>
          </label>
        </div>
      )}

      {state.error && <p role="alert" className="text-sm text-[#8C1D18]">{state.error}</p>}
      <SubmitButton className={btn} pending={pending} pendingText="Publicando…">
        Publicar reporte
      </SubmitButton>
    </form>
  );
}
