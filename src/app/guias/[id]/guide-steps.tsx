"use client";

import { useMemo, useState } from "react";
import type { GuideStep } from "../shared";

export function GuideSteps({ steps }: { steps: GuideStep[] }) {
  const [done, setDone] = useState<number[]>([]);
  const count = done.length;
  const percent = steps.length ? Math.round((count / steps.length) * 100) : 0;
  const progressLabel = useMemo(() => count === steps.length ? "¡Listo! Ya terminaste esta guía." : `${count} de ${steps.length} pasos listos`, [count, steps.length]);

  if (steps.length === 0) return <p className="rounded-3xl border border-dashed border-[#b7d4e4] bg-white p-6 text-sm text-[#667085]">Esta guía todavía no tiene pasos.</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-gradient-to-r from-[#e6f3fa] to-[#f2f9fc] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#004d73]">Tu ruta</p>
            <p className="mt-1 text-xs text-[#667085]">Marca cada paso mientras avanzas.</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#006699]">{progressLabel}</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-[#006699] transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <ol className="space-y-3">
        {steps.map((step, index) => {
          const checked = done.includes(index);
          return (
            <li key={`${step.title}-${index}`}>
              <article className={`rounded-3xl border p-5 transition duration-200 ${checked ? "border-[#b7d4e4] bg-[#f4fafd]" : "border-white bg-white shadow-[0_10px_30px_rgba(0,64,96,0.07)]"}`}>
                <div className="flex items-start gap-4">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-extrabold transition ${checked ? "bg-[#006699] text-white" : "bg-[#e6f3fa] text-[#006699]"}`}>{checked ? "✓" : String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-lg font-bold tracking-tight ${checked ? "text-[#667085] line-through decoration-[#8cb8cb]" : "text-[#222337]"}`}>{step.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#62697a]">{step.body}</p>
                  </div>
                  <button type="button" aria-pressed={checked} onClick={() => setDone((current) => checked ? current.filter((item) => item !== index) : [...current, index])} className={`hidden shrink-0 rounded-full px-3 py-2 text-xs font-bold transition sm:block ${checked ? "bg-[#006699] text-white" : "bg-[#edf6fa] text-[#006699] hover:bg-[#d5eaf4]"}`}>
                    {checked ? "Hecho" : "Marcar listo"}
                  </button>
                </div>
                <button type="button" aria-pressed={checked} onClick={() => setDone((current) => checked ? current.filter((item) => item !== index) : [...current, index])} className={`mt-4 w-full rounded-full px-3 py-2 text-xs font-bold sm:hidden ${checked ? "bg-[#006699] text-white" : "bg-[#edf6fa] text-[#006699]"}`}>
                  {checked ? "✓ Paso completado" : "Marcar paso como listo"}
                </button>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
