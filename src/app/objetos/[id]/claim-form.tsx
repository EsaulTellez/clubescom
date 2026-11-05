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
      <label className={label}>
        Detalle para quien publicó el hallazgo (opcional)
        <textarea className={`${input} mt-1 min-h-20`} name="note" maxLength={500} />
      </label>
      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      {state.ok && <p className="rounded-xl bg-[#e8f2e8] p-3 text-sm text-[#28452d]">{state.ok}</p>}
      <button className={btn} disabled={pending}>
        {pending ? "Comprobando…" : "Reclamar"}
      </button>
    </form>
  );
}
