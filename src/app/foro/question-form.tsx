"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { btn, input, label } from "@/lib/ui";
import { suggestSimilarQuestions, type QuestionState } from "./actions";
import { AREAS, isArea } from "./shared";

export function QuestionForm({
  action,
  defaultArea,
}: {
  action: (state: QuestionState, form: FormData) => Promise<QuestionState>;
  defaultArea?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const initialArea = defaultArea && isArea(defaultArea) ? defaultArea : "general";
  const [area, setArea] = useState<string>(initialArea);
  const [title, setTitle] = useState("");
  const [similar, setSimilar] = useState<{ id: string; title: string; area: string; similarity: number }[]>([]);
  const [searching, startSearching] = useTransition();

  useEffect(() => {
    if (title.trim().length < 8) return;
    let current = true;
    const timer = window.setTimeout(() => {
      startSearching(async () => {
        const rows = await suggestSimilarQuestions(title, area);
        if (current) setSimilar(rows);
      });
    }, 350);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [title, area]);

  return (
    <form action={formAction} className="space-y-3">
      <label className={label}>
        Área
        <select className={input} name="area" value={area} onChange={(event) => setArea(event.target.value)}>
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
          value={title}
          onChange={(event) => {
            const value = event.target.value;
            setTitle(value);
            if (value.trim().length < 8) setSimilar([]);
          }}
          required
          minLength={8}
          maxLength={180}
          placeholder="¿Cómo tramito una constancia de estudios?"
        />
      </label>
      <p className="text-xs text-[#667085]">
        Si ya existe una pregunta muy parecida, te la mostramos y no publicamos un duplicado.
      </p>
      {similar.length > 0 && (
        <div className="rounded-lg border border-[#d5e4ee] bg-[#e6f3fa] p-3 text-sm" aria-live="polite">
          <p className="font-semibold">{searching ? "Buscando preguntas parecidas…" : "Preguntas parecidas en esta área:"}</p>
          <ul className="mt-2 space-y-1">
            {similar.map((question) => (
              <li key={question.id}>
                <Link className="text-[#006699] underline" href={`/foro/${question.id}`}>{question.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
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
