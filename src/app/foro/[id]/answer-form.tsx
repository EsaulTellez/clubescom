"use client";

import { useActionState } from "react";
import { btn, input, label } from "@/lib/ui";
import type { AnswerState } from "../actions";

export function AnswerForm({
  action,
  questionId,
}: {
  action: (state: AnswerState, form: FormData) => Promise<AnswerState>;
  questionId: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="questionId" value={questionId} />
      <label className={label}>
        Tu respuesta
        <textarea
          className={`${input} min-h-28`}
          name="body"
          required
          minLength={10}
          maxLength={5000}
          placeholder="Explica el paso que sí funcionó, con ventanilla, horario o documento."
        />
      </label>
      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      <button className={btn} disabled={pending}>
        {pending ? "Publicando…" : "Publicar respuesta"}
      </button>
    </form>
  );
}
