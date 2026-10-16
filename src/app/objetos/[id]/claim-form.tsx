"use client";

import { useActionState } from "react";
import { claimItem } from "../actions";
import type { FormState } from "../labels";
import { btn, input, label } from "@/lib/ui";

export function ClaimForm({ id, question }: { id: string; question: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(claimItem, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm font-medium">{question}</p>
      <label className={label}>
        Tu respuesta
        <input className={`${input} mt-1`} name="answer" required autoComplete="off" />
      </label>
      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      {state.code && (
        <div className="rounded-xl bg-[#F6F1EA] px-4 py-5 text-center">
          <p className="text-xs uppercase tracking-wide text-[#5C4A45]">Código de entrega</p>
          <p className="mt-2 text-4xl font-semibold tracking-[0.28em] text-[#6B1D2A] sm:text-5xl">
            {state.code}
          </p>
          <p className="mt-2 text-sm text-[#5C4A45]">Muéstralo a quien publicó el reporte para confirmar la entrega.</p>
        </div>
      )}
      <button className={btn} disabled={pending}>
        {pending ? "Comprobando…" : "Reclamar"}
      </button>
    </form>
  );
}
