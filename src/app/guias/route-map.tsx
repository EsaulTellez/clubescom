import { routesFrom, type GuideStep } from "./shared";

export function RouteMap({ steps, current, onSelect }: {
  steps: GuideStep[]; current?: number; onSelect?: (id: number) => void;
}) {
  const depths = new Map([[steps[0].id, 0]]);
  const edges = steps.flatMap((step, index) => routesFrom(steps, index).map(choice => ({ from: step.id, ...choice })));
  // A shared destination appears once, below its deepest predecessor.
  for (let pass = 0; pass < steps.length; pass++) {
    let changed = false;
    for (const edge of edges) {
      const depth = depths.get(edge.from);
      if (depth !== undefined && (depths.get(edge.to) ?? -1) <= depth) {
        depths.set(edge.to, depth + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const levels: GuideStep[][] = [];
  for (const step of steps) (levels[depths.get(step.id) ?? 0] ??= []).push(step);
  const width = Math.max(...levels.map(row => row.length)) * 170;
  const positions = new Map(levels.flatMap((row, depth) => row.map((step, i) =>
    [step.id, { x: (width - row.length * 170) / 2 + i * 170 + 85, y: depth * 100 }] as const)));
  return <details className="min-w-0 rounded-lg border border-[#ccdce3] bg-[#f7fafb]">
    <summary className="cursor-pointer px-4 py-2.5 text-sm font-bold text-[#005880]">Mapa de pasos</summary>
    <div className="max-h-96 overflow-auto border-t border-[#d8e4e9] p-2" tabIndex={0} aria-label="Mapa de la guía">
      <div className="relative mx-auto" style={{ width, height: levels.length * 100 - 28 }}>
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
          {edges.map((edge, i) => {
            const a = positions.get(edge.from)!, b = positions.get(edge.to)!;
            const mid = b.y - 15;
            return <path key={i} d={`M ${a.x} ${a.y + 68} V ${mid} H ${b.x} V ${b.y} m -3 -5 l 3 5 l 3 -5`} fill="none" stroke="#729aaa" strokeWidth={2} />;
          })}
        </svg>
        {steps.map((step, i) => {
          const pos = positions.get(step.id)!;
          const incoming = edges.filter(e => e.to === step.id);
          const condition = incoming.length === 1 && incoming[0].label !== "Continuar" ? incoming[0].label : undefined;
          const content = <><span className="block truncate text-[10px] font-extrabold uppercase tracking-wide">Paso {i + 1}{condition && ` · ${condition}`}</span><strong className="line-clamp-2 text-xs leading-4">{step.title}</strong></>;
          const props = {
            style: { left: pos.x - 78, top: pos.y, width: 156, height: 68 },
            title: [condition, step.title].filter(Boolean).join(" · "),
            className: `absolute flex flex-col justify-center rounded-md border px-2.5 text-left ${current === step.id ? "border-[#006699] bg-[#006699] text-white" : "border-[#a6c2cf] bg-white text-[#173d50]"}`,
          };
          return onSelect ? <button type="button" key={step.id} {...props} aria-current={current === step.id ? "step" : undefined} onClick={() => onSelect(step.id)}>{content}</button>
            : <div key={step.id} {...props}>{content}</div>;
        })}
      </div>
    </div>
  </details>;
}
