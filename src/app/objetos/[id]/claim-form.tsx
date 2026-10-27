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
        <div className="rounded-xl bg-[#e6f3fa] px-4 py-5 text-center">
          <p className="text-xs uppercase tracking-wide text-[#667085]">Código de entrega</p>
          <p className="mt-2 text-4xl font-semibold tracking-[0.28em] text-[#006699] sm:text-5xl">
            {state.code}
          </p>
          <p className="mt-2 text-sm text-[#667085]">Muéstralo a quien publicó el reporte para confirmar la entrega.</p>
        </div>
      )}
      <button className={btn} disabled={pending}>
        {pending ? "Comprobando…" : "Reclamar"}
      </button>
    </form>
  );
}
