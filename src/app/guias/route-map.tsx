"use client";

import { useState } from "react";
import { routesFrom, type GuideStep } from "./shared";

export function RouteMap({
  steps,
  current,
  onSelect,
  defaultOpen = false,
  pendingByStep,
  completedSteps = [],
}: {
  steps: GuideStep[];
  current?: number;
  onSelect?: (id: number) => void;
  defaultOpen?: boolean;
  pendingByStep?: Record<number, number>;
  completedSteps?: number[];
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!steps.length) return null;

  const byId = new Map(steps.map((step, i) => [step.id, i]));
  const depth = new Map([[steps[0].id, 0]]);
  const queue = [steps[0].id];
  while (queue.length) {
    const id = queue.shift()!;
    const idx = byId.get(id);
    if (idx === undefined) continue;
    for (const next of routesFrom(steps, idx)) {
      if (byId.has(next.to) && (depth.get(next.to) ?? -1) < depth.get(id)! + 1) {
        depth.set(next.to, depth.get(id)! + 1);
        queue.push(next.to);
      }
    }
  }

  const rows: GuideStep[][] = [];
  for (const step of steps) {
    const d = depth.get(step.id) ?? rows.length;
    (rows[d] ??= []).push(step);
  }
  const cleanRows = rows.filter(Boolean);
  const cols = Math.max(1, ...cleanRows.map((row) => row.length));
  const w = Math.max(460, cols * 220);
  const h = cleanRows.length * 116 + 24;
  const pos = new Map<number, { x: number; y: number }>();
  cleanRows.forEach((row, r) =>
    row.forEach((step, c) =>
      pos.set(step.id, { x: ((c + 1) / (row.length + 1)) * w, y: 18 + r * 116 }),
    ),
  );

  const edges = steps.flatMap((step, i) =>
    routesFrom(steps, i).map((choice, edgeIdx) => ({
      from: step.id,
      to: choice.to,
      label: choice.label,
      custom: Boolean(step.choices?.length),
      offsetX: (edgeIdx - (routesFrom(steps, i).length - 1) / 2) * 14,
    })),
  );

  const doneSet = new Set(completedSteps);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-xl border border-[#d5e4ee] bg-[#fafcfd] px-3.5 py-2.5"
    >
      <summary className="cursor-pointer select-none text-xs font-semibold text-[#006699]">
        {open ? "Ocultar diagrama de flujo de la guía" : `Ver diagrama completo de flujo (${steps.length} pasos)`}
      </summary>
      <div className="mt-3 overflow-x-auto pb-2">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[460px]" role="img" aria-label="Diagrama de rutas de la guía">
          <defs>
            <marker id="guide-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#5b89a6" />
            </marker>
          </defs>
          {edges.map((edge, idx) => {
            const a = pos.get(edge.from);
            const b = pos.get(edge.to);
            if (!a || !b) return null;
            const startX = a.x + edge.offsetX;
            const startY = a.y + 70;
            const endX = b.x + edge.offsetX * 0.4;
            const endY = b.y - 3;
            const spanRows = Math.round((b.y - a.y) / 116);
            let pathD = "";
            let lx = (startX + endX) / 2;
            let ly = (startY + endY) / 2;
            if (spanRows > 1 && Math.abs(startX - endX) < 120) {
              // Curva lateral suave para saltos de múltiples niveles sin cruzar tarjetas intermedias
              const sideOffset = (idx % 2 === 0 ? -1 : 1) * 95;
              const ctrlX = startX + sideOffset;
              pathD = `M ${startX} ${startY} C ${ctrlX} ${startY + 35}, ${ctrlX} ${endY - 35}, ${endX} ${endY}`;
              lx = startX + sideOffset * 0.72;
              ly = (startY + endY) / 2;
            } else {
              const midY = startY + (endY - startY) * 0.52;
              pathD = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
            }

            return (
              <g key={`${edge.from}-${edge.to}-${idx}`}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={edge.custom ? "#006699" : "#9db8c9"}
                  strokeWidth={edge.custom ? "2" : "1.6"}
                  markerEnd="url(#guide-arrow)"
                />
                {edge.custom && (
                  <g transform={`translate(${lx}, ${ly})`}>
                    <rect
                      x={-Math.min(72, edge.label.length * 3.4 + 10)}
                      y={-10}
                      width={Math.min(144, edge.label.length * 6.8 + 20)}
                      height={18}
                      rx={9}
                      fill="#e6f3fa"
                      stroke="#9ac3db"
                    />
                    <text textAnchor="middle" y="3" fill="#004d73" fontSize="9.5" fontWeight="600">
                      {edge.label.length > 22 ? `${edge.label.slice(0, 21)}…` : edge.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {steps.map((step) => {
            const point = pos.get(step.id)!;
            const active = step.id === current;
            const completed = doneSet.has(step.id);
            const pendingCount = pendingByStep?.[step.id] ?? 0;
            return (
              <g
                key={step.id}
                transform={`translate(${point.x - 86}, ${point.y})`}
                onClick={() => onSelect?.(step.id)}
                className={onSelect ? "cursor-pointer" : undefined}
              >
                <rect
                  width="172"
                  height="70"
                  rx="12"
                  fill={active ? "#e6f3fa" : completed ? "#f2faf6" : "#ffffff"}
                  stroke={active ? "#006699" : completed ? "#237a57" : "#b8cedb"}
                  strokeWidth={active ? "2.4" : "1.3"}
                />
                <text x="12" y="21" fill={active ? "#004d73" : "#4b606c"} fontSize="10" fontWeight="700">
                  {`Paso ${step.id}${completed ? " · ✓" : ""}`}
                </text>
                {pendingCount > 0 && (
                  <g transform="translate(148, 15)">
                    <circle r="9" fill="#c97a00" />
                    <text textAnchor="middle" y="3.5" fill="#ffffff" fontSize="9.5" fontWeight="800">
                      {pendingCount}
                    </text>
                  </g>
                )}
                <text x="12" y="42" fill="#173142" fontSize="12" fontWeight="600">
                  {step.title.length > 22 ? `${step.title.slice(0, 21)}…` : step.title}
                </text>
                {step.imageUrl && (
                  <text x="12" y="59" fill="#006699" fontSize="9.5">
                    Con imagen adjunta
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </details>
  );
}
