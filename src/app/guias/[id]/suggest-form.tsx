"use client";

import { useActionState } from "react";
import { btn, input, label } from "@/lib/ui";
import type { SuggestState } from "../actions";

export function SuggestForm({
  action,
  guideId,
  stepIndex,
}: {
  action: (state: SuggestState, form: FormData) => Promise<SuggestState>;
  guideId: string;
  stepIndex: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="guideId" value={guideId} />
      <input type="hidden" name="stepIndex" value={stepIndex} />
      <label className={label}>
        Sugerir una mejora
        <textarea
          className={`${input} min-h-20`}
          name="body"
          required
          minLength={10}
          maxLength={2000}
          placeholder="Qué dato falta o qué cambió en este paso."
        />
      </label>
      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      <button className={btn} disabled={pending}>
        {pending ? "Enviando…" : "Enviar sugerencia"}
      </button>
    </form>
  );
}
