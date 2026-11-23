import type { ItemKind, ItemStatus } from "../labels";

type Step = {
  title: string;
  detail: string;
};

export function ItemStageStepper({
  stage,
  kind,
  status,
}: {
  stage: number;
  kind: ItemKind;
  status: ItemStatus;
}) {
  const steps: Step[] = [
    {
      title: "Reporte",
      detail: kind === "encontrado" ? "Hallazgo publicado" : "Pérdida publicada",
    },
    {
      title: "Coincidencia",
      detail: "Cruce con reportes contrarios",
    },
    {
      title: "Validación",
      detail: kind === "encontrado" ? "Pregunta llave y revisión" : "Aviso de hallazgo",
    },
    {
      title: "Entrega QR",
      detail: "Confirmación presencial",
    },
  ];

  const isDelivered = status === "entregado";
  const isClosed = status === "cerrado";

  return (
    <section
      aria-label="Etapas del reporte"
      className="rounded-sm border border-[#d0cec2] bg-[#fffdf7] px-4 py-4 sm:px-6 sm:py-5"
    >
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#52656e] uppercase">
          Progreso del reporte
        </p>
        {isDelivered ? (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-[#b5dac5] bg-[#eaf7f0] px-2.5 py-0.5 text-xs font-bold text-[#145542]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Entregado
          </span>
        ) : isClosed ? (
          <span className="inline-flex items-center rounded-sm border border-[#cfd5d8] bg-[#f2f4f5] px-2.5 py-0.5 text-xs font-bold text-[#465a64]">
            Cerrado
          </span>
        ) : (
          <span className="font-mono text-xs font-bold text-[#155775]">
            Etapa {Math.min(stage + 1, steps.length)} de {steps.length}
          </span>
        )}
      </div>

      <ol className="relative grid gap-4 md:grid-cols-4 md:gap-0">
        {steps.map((step, index) => {
          const done = isDelivered || (!isClosed && index < stage);
          const current = !isDelivered && !isClosed && index === stage;
          const isLast = index === steps.length - 1;

          return (
            <li
              key={step.title}
              aria-current={current ? "step" : undefined}
              className="relative flex items-start gap-3 md:flex-col md:gap-2.5 md:pr-4"
            >
              {/* Mobile vertical connector */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute top-8 left-[15px] h-[calc(100%-0.5rem)] w-[2px] md:hidden ${
                    done ? "bg-[#155775]" : "bg-[#dcd9ce]"
                  }`}
                />
              )}

              {/* Desktop horizontal connector */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute top-[15px] left-8 hidden h-[2px] w-[calc(100%-2rem)] md:block ${
                    done ? "bg-[#155775]" : "bg-[#dcd9ce]"
                  }`}
                />
              )}

              <span
                className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-xs font-extrabold transition ${
                  isDelivered
                    ? "border-[#145542] bg-[#145542] text-white"
                    : done
                      ? "border-[#155775] bg-[#155775] text-white"
                      : current
                        ? "border-[#155775] bg-[#e6f3fa] text-[#155775] ring-4 ring-[#155775]/15"
                        : isClosed
                          ? "border-[#cfd5d8] bg-[#f2f4f5] text-[#6d7c84]"
                          : "border-[#c7c5b9] bg-[#fffdf7] text-[#6d7c84]"
                }`}
              >
                {done ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.8">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>

              <div className="min-w-0 pt-0.5 md:pt-0">
                <p
                  className={`text-sm leading-tight font-bold ${
                    current
                      ? "text-[#155775]"
                      : done
                        ? "text-[#142c3c]"
                        : "text-[#65757d]"
                  }`}
                >
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-[#5f6e78]">
                  {step.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
