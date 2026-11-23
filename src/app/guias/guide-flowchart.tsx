"use client";

import { useMemo, useState } from "react";
import { routesFrom, type GuideStep } from "./shared";

type PositionedNode = {
  step: GuideStep;
  stepIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
  isStart: boolean;
  isDecision: boolean;
  isTerminal: boolean;
  isOrphan: boolean;
};

type EdgeLayout = {
  key: string;
  fromId: number | "start";
  toId: number | "end";
  label: string;
  showLabel: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midX: number;
  midY: number;
  isBackEdge: boolean;
  isTerminatorEdge?: boolean;
};

type TerminatorNode = {
  kind: "start" | "end";
  x: number;
  y: number;
  w: number;
  h: number;
};

const TERM_W = 132;
const TERM_H = 38;
const TERM_GAP = 42;
const COL_GAP = 56;
const ROW_GAP = 64;
const PAD_X = 40;
const PAD_Y = 28;

function computeFlowLayout(steps: GuideStep[], isEditor: boolean) {
  const nodeW = isEditor ? 248 : 308;
  const nodeH = isEditor ? 92 : 104;

  if (!steps.length) {
    return {
      nodes: [] as PositionedNode[],
      edges: [] as EdgeLayout[],
      startNode: null as TerminatorNode | null,
      endNode: null as TerminatorNode | null,
      width: 520,
      height: 220,
      decisionCount: 0,
      orphanIds: new Set<number>(),
    };
  }

  const byId = new Map(steps.map((s, idx) => [s.id, { step: s, idx }]));
  const startId = steps[0].id;

  // Reachability + longest-path layering (cycle-safe)
  const depth = new Map<number, number>([[startId, 0]]);
  const queue: number[] = [startId];
  let safety = 0;
  while (queue.length && safety < steps.length * steps.length + 30) {
    safety += 1;
    const id = queue.shift()!;
    const entry = byId.get(id);
    if (!entry) continue;
    const currentDepth = depth.get(id) ?? 0;
    const routes = routesFrom(steps, entry.idx);
    for (const choice of routes) {
      if (!byId.has(choice.to)) continue;
      if (choice.to === id) continue;
      const nextDepth = Math.min(currentDepth + 1, steps.length + 2);
      const prevDepth = depth.get(choice.to);
      if (prevDepth === undefined || (nextDepth > prevDepth && nextDepth <= steps.length)) {
        depth.set(choice.to, nextDepth);
        queue.push(choice.to);
      }
    }
  }

  const orphanIds = new Set<number>();
  let maxDepth = 0;
  for (const d of depth.values()) {
    if (d > maxDepth) maxDepth = d;
  }
  for (const step of steps) {
    if (!depth.has(step.id)) {
      orphanIds.add(step.id);
      depth.set(step.id, maxDepth + 1);
    }
  }

  // Group into vertical layers (top-to-bottom)
  const layerMap = new Map<number, number[]>();
  for (const step of steps) {
    const l = depth.get(step.id) ?? 0;
    const arr = layerMap.get(l) ?? [];
    arr.push(step.id);
    layerMap.set(l, arr);
  }
  const layerKeys = Array.from(layerMap.keys()).sort((a, b) => a - b);

  // Order each layer by parent barycenter to minimize crossings
  const incomingParents = new Map<number, number[]>();
  for (let i = 0; i < steps.length; i += 1) {
    for (const c of routesFrom(steps, i)) {
      if (!byId.has(c.to)) continue;
      const list = incomingParents.get(c.to) ?? [];
      list.push(steps[i].id);
      incomingParents.set(c.to, list);
    }
  }

  const orderIndex = new Map<number, number>();
  for (const lk of layerKeys) {
    const ids = layerMap.get(lk)!;
    if (lk > 0) {
      ids.sort((a, b) => {
        const pa = incomingParents.get(a) ?? [];
        const pb = incomingParents.get(b) ?? [];
        const avgA = pa.length
          ? pa.reduce((sum, p) => sum + (orderIndex.get(p) ?? 0), 0) / pa.length
          : 999;
        const avgB = pb.length
          ? pb.reduce((sum, p) => sum + (orderIndex.get(p) ?? 0), 0) / pb.length
          : 999;
        if (avgA !== avgB) return avgA - avgB;
        return (byId.get(a)?.idx ?? 0) - (byId.get(b)?.idx ?? 0);
      });
    }
    ids.forEach((id, pos) => orderIndex.set(id, pos));
  }

  const maxRowCols = Math.max(1, ...layerKeys.map((k) => layerMap.get(k)!.length));
  const contentWidth = maxRowCols * nodeW + (maxRowCols - 1) * COL_GAP;
  const width = Math.max(isEditor ? 440 : 520, contentWidth + PAD_X * 2);

  const startNode: TerminatorNode = {
    kind: "start",
    x: (width - TERM_W) / 2,
    y: PAD_Y,
    w: TERM_W,
    h: TERM_H,
  };

  const firstLayerY = startNode.y + startNode.h + TERM_GAP;
  const nodePos = new Map<number, PositionedNode>();
  const nodes: PositionedNode[] = [];
  let decisionCount = 0;

  layerKeys.forEach((lk, rowIdx) => {
    const ids = layerMap.get(lk)!;
    const rowWidth = ids.length * nodeW + (ids.length - 1) * COL_GAP;
    const startX = (width - rowWidth) / 2;
    const y = firstLayerY + rowIdx * (nodeH + ROW_GAP);

    ids.forEach((id, colIdx) => {
      const entry = byId.get(id)!;
      const routes = routesFrom(steps, entry.idx);
      const isDecision = routes.length > 1;
      if (isDecision) decisionCount += 1;
      const node: PositionedNode = {
        step: entry.step,
        stepIndex: entry.idx,
        x: startX + colIdx * (nodeW + COL_GAP),
        y,
        w: nodeW,
        h: nodeH,
        layer: rowIdx,
        isStart: entry.idx === 0,
        isDecision,
        isTerminal: routes.length === 0,
        isOrphan: orphanIds.has(id),
      };
      nodePos.set(id, node);
      nodes.push(node);
    });
  });

  const terminalNodes = nodes.filter((n) => n.isTerminal && !n.isOrphan);
  const lastNodeBottom = nodes.reduce((max, n) => Math.max(max, n.y + n.h), firstLayerY);
  const endNode: TerminatorNode | null =
    terminalNodes.length > 0
      ? {
          kind: "end",
          x: (width - TERM_W) / 2,
          y: lastNodeBottom + TERM_GAP,
          w: TERM_W,
          h: TERM_H,
        }
      : null;

  const height = (endNode ? endNode.y + endNode.h : lastNodeBottom) + PAD_Y;

  const edges: EdgeLayout[] = [];

  // INICIO -> Primer paso
  const firstStepNode = nodePos.get(startId);
  if (firstStepNode) {
    edges.push({
      key: `start-${startId}`,
      fromId: "start",
      toId: startId,
      label: "",
      showLabel: false,
      x1: startNode.x + startNode.w / 2,
      y1: startNode.y + startNode.h,
      x2: firstStepNode.x + firstStepNode.w / 2,
      y2: firstStepNode.y,
      midX: (startNode.x + startNode.w / 2 + firstStepNode.x + firstStepNode.w / 2) / 2,
      midY: (startNode.y + startNode.h + firstStepNode.y) / 2,
      isBackEdge: false,
      isTerminatorEdge: true,
    });
  }

  // Conexiones entre pasos
  for (let i = 0; i < steps.length; i += 1) {
    const from = nodePos.get(steps[i].id);
    if (!from) continue;
    const routes = routesFrom(steps, i);
    const total = routes.length;
    routes.forEach((choice, rIdx) => {
      const to = nodePos.get(choice.to);
      if (!to) return;
      const spread = total > 1 ? ((rIdx + 0.5) / total - 0.5) * (from.w * 0.52) : 0;
      const x1 = from.x + from.w / 2 + spread;
      const y1 = from.y + from.h;
      const x2 = to.x + to.w / 2;
      const y2 = to.y;
      const isBackEdge = to.layer <= from.layer;
      const showLabel = total > 1 || (Boolean(steps[i].choices?.length) && choice.label !== "Siguiente paso");
      const midX = isBackEdge ? Math.max(x1, x2) + 84 : (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      edges.push({
        key: `${from.step.id}-${to.step.id}-${rIdx}`,
        fromId: from.step.id,
        toId: to.step.id,
        label: choice.label,
        showLabel,
        x1,
        y1,
        x2,
        y2,
        midX,
        midY,
        isBackEdge,
      });
    });
  }

  // Pasos terminales -> FIN
  if (endNode) {
    terminalNodes.forEach((tn, tIdx) => {
      const spread =
        terminalNodes.length > 1
          ? ((tIdx + 0.5) / terminalNodes.length - 0.5) * (endNode.w * 0.55)
          : 0;
      const x1 = tn.x + tn.w / 2;
      const y1 = tn.y + tn.h;
      const x2 = endNode.x + endNode.w / 2 + spread;
      const y2 = endNode.y;
      edges.push({
        key: `${tn.step.id}-end`,
        fromId: tn.step.id,
        toId: "end",
        label: "",
        showLabel: false,
        x1,
        y1,
        x2,
        y2,
        midX: (x1 + x2) / 2,
        midY: (y1 + y2) / 2,
        isBackEdge: false,
        isTerminatorEdge: true,
      });
    });
  }

  return { nodes, edges, startNode, endNode, width, height, decisionCount, orphanIds };
}

export function GuideFlowchart({
  steps,
  currentStepId,
  activePath = [],
  completedSteps = [],
  doubtsByStep = {},
  pendingByStep = {},
  onSelect,
  mode = "viewer",
  compact = false,
}: {
  steps: GuideStep[];
  currentStepId?: number;
  activePath?: number[];
  completedSteps?: number[];
  doubtsByStep?: Record<number, number>;
  pendingByStep?: Record<number, number>;
  onSelect?: (stepId: number) => void;
  mode?: "viewer" | "editor";
  compact?: boolean;
}) {
  const [zoom, setZoom] = useState(compact ? 0.9 : 1);
  const isEditor = mode === "editor";
  const layout = useMemo(() => computeFlowLayout(steps, isEditor), [steps, isEditor]);

  const activeEdgeSet = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < activePath.length - 1; i += 1) {
      set.add(`${activePath[i]}->${activePath[i + 1]}`);
    }
    return set;
  }, [activePath]);

  const activeNodeSet = useMemo(() => new Set(activePath), [activePath]);
  const doneSet = useMemo(() => new Set(completedSteps), [completedSteps]);

  if (!steps.length) {
    return (
      <div className="blueprint-grid rounded-md border border-[#c6d6de] p-8 text-center text-sm text-[#546975]">
        Añade el primer paso para visualizar el diagrama de flujo.
      </div>
    );
  }

  const scaledW = Math.round(layout.width * zoom);
  const scaledH = Math.round(layout.height * zoom);

  return (
    <section className="overflow-hidden rounded-md border border-[#b9ced9] bg-[#fffdf7] shadow-[0_3px_14px_rgba(20,44,60,0.06)]">
      {/* Barra superior del diagrama */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d4e1e8] bg-[#eef5f8] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-extrabold uppercase tracking-[0.12em] text-[#0c5170]">
            {isEditor ? "Diagrama en vivo" : "Diagrama de flujo"}
          </span>
          <span className="font-mono text-[11px] font-bold text-[#4a6472]">
            {steps.length} {steps.length === 1 ? "paso" : "pasos"}
            {layout.decisionCount > 0 &&
              ` · ${layout.decisionCount} ${layout.decisionCount === 1 ? "decisión" : "decisiones"}`}
          </span>
          <div className="hidden items-center gap-3 text-[11px] font-semibold text-[#546b77] sm:flex">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-4 rounded-full bg-[#165b47]" /> Inicio / Fin
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rotate-45 border border-[#b88917] bg-[#fff3cc]" /> Decisión
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-3.5 rounded-xs border border-[#006699] bg-[#eef7fc]" /> Proceso
            </span>
            {layout.orphanIds.size > 0 && (
              <span className="inline-flex items-center gap-1 font-bold text-[#9a2e26]">
                <span className="h-2 w-2 rounded-full bg-[#9a2e26]" /> {layout.orphanIds.size} sin conectar
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Zoom del diagrama">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(2))))}
            aria-label="Alejar diagrama"
            className="grid h-7 w-7 place-items-center rounded border border-[#c0d3dd] bg-white text-xs font-extrabold text-[#164b66] hover:bg-[#e5f1f6]"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="Restablecer zoom"
            className="h-7 rounded border border-[#c0d3dd] bg-white px-2 font-mono text-[11px] font-bold text-[#2b4d5e] hover:bg-[#e5f1f6]"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.25, Number((z + 0.1).toFixed(2))))}
            aria-label="Acercar diagrama"
            className="grid h-7 w-7 place-items-center rounded border border-[#c0d3dd] bg-white text-xs font-extrabold text-[#164b66] hover:bg-[#e5f1f6]"
          >
            +
          </button>
        </div>
      </div>

      {/* Lienzo vertical blueprint */}
      <div
        className={`blueprint-grid overflow-x-auto ${
          compact ? "max-h-[480px] overflow-y-auto" : isEditor ? "max-h-[620px] overflow-y-auto" : "overflow-y-visible"
        }`}
      >
        <div className="relative mx-auto" style={{ width: scaledW, height: scaledH }}>
          <div
            className="relative origin-top-left"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${zoom})`,
            }}
          >
            {/* Capa SVG de flechas y conectores verticales */}
            <svg
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="fc-arrow-default"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6.5"
                  markerHeight="6.5"
                  orient="auto-start-reverse"
                >
                  <path d="M 1 1.5 L 8.5 5 L 1 8.5 z" fill="#5e7f91" />
                </marker>
                <marker
                  id="fc-arrow-active"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 1 1.5 L 8.5 5 L 1 8.5 z" fill="#006699" />
                </marker>
                <marker
                  id="fc-arrow-branch"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6.5"
                  markerHeight="6.5"
                  orient="auto-start-reverse"
                >
                  <path d="M 1 1.5 L 8.5 5 L 1 8.5 z" fill="#b38216" />
                </marker>
                <marker
                  id="fc-arrow-term"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6.5"
                  markerHeight="6.5"
                  orient="auto-start-reverse"
                >
                  <path d="M 1 1.5 L 8.5 5 L 1 8.5 z" fill="#165b47" />
                </marker>
                <marker
                  id="fc-arrow-back"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6.5"
                  markerHeight="6.5"
                  orient="auto-start-reverse"
                >
                  <path d="M 1 1.5 L 8.5 5 L 1 8.5 z" fill="#b0332b" />
                </marker>
              </defs>

              {layout.edges.map((edge) => {
                const isActive =
                  typeof edge.fromId === "number" &&
                  typeof edge.toId === "number" &&
                  activeEdgeSet.has(`${edge.fromId}->${edge.toId}`);

                const isVerticalStraight = !edge.isBackEdge && Math.abs(edge.x1 - edge.x2) < 2;
                const dy = Math.max(24, Math.abs(edge.y2 - edge.y1) * 0.5);
                const d = edge.isBackEdge
                  ? `M ${edge.x1} ${edge.y1} C ${edge.x1 + 96} ${edge.y1 + 28}, ${edge.x2 + 96} ${edge.y2 - 28}, ${edge.x2} ${edge.y2 - 4}`
                  : isVerticalStraight
                    ? `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2 - 4}`
                    : `M ${edge.x1} ${edge.y1} C ${edge.x1} ${edge.y1 + dy}, ${edge.x2} ${edge.y2 - dy}, ${edge.x2} ${edge.y2 - 4}`;

                const stroke = edge.isBackEdge
                  ? "#b0332b"
                  : edge.isTerminatorEdge
                    ? "#165b47"
                    : isActive
                      ? "#006699"
                      : edge.showLabel
                        ? "#b38216"
                        : "#5e7f91";

                const marker = edge.isBackEdge
                  ? "url(#fc-arrow-back)"
                  : edge.isTerminatorEdge
                    ? "url(#fc-arrow-term)"
                    : isActive
                      ? "url(#fc-arrow-active)"
                      : edge.showLabel
                        ? "url(#fc-arrow-branch)"
                        : "url(#fc-arrow-default)";

                return (
                  <path
                    key={edge.key}
                    d={d}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={isActive ? 2.75 : 2}
                    strokeDasharray={edge.isBackEdge ? "5 4" : undefined}
                    markerEnd={marker}
                  />
                );
              })}
            </svg>

            {/* Terminador INICIO (cápsula PSeInt) */}
            {layout.startNode && (
              <div
                style={{
                  left: layout.startNode.x,
                  top: layout.startNode.y,
                  width: layout.startNode.w,
                  height: layout.startNode.h,
                }}
                className="absolute z-10 grid place-items-center rounded-full border-2 border-[#165b47] bg-[#e9f6f0] font-mono text-[11px] font-black uppercase tracking-[0.18em] text-[#145542] shadow-xs"
              >
                Inicio
              </div>
            )}

            {/* Etiquetas flotantes sobre ramificaciones de decisión */}
            {layout.edges
              .filter((edge) => edge.showLabel && edge.label.trim())
              .map((edge) => {
                const isActive =
                  typeof edge.fromId === "number" &&
                  typeof edge.toId === "number" &&
                  activeEdgeSet.has(`${edge.fromId}->${edge.toId}`);
                return (
                  <span
                    key={`lbl-${edge.key}`}
                    style={{
                      left: edge.midX,
                      top: edge.midY,
                      transform: "translate(-50%, -50%)",
                    }}
                    className={`pointer-events-none absolute z-10 max-w-[185px] truncate rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold shadow-xs ${
                      isActive
                        ? "border-[#006699] bg-[#006699] text-white"
                        : "border-[#dfc78b] bg-[#fff9e8] text-[#755109]"
                    }`}
                    title={edge.label}
                  >
                    {edge.label}
                  </span>
                );
              })}

            {/* Bloques interactivos del diagrama de flujo */}
            {layout.nodes.map((node) => {
              const isCurrent = currentStepId === node.step.id;
              const isDone = doneSet.has(node.step.id);
              const isInPath = activeNodeSet.has(node.step.id);
              const doubts = doubtsByStep[node.step.id] ?? 0;
              const pending = pendingByStep[node.step.id] ?? 0;

              let cardClasses =
                "border-[#8fb3c4] bg-white hover:border-[#006699] hover:bg-[#f7fbfe] hover:shadow-md";
              if (node.isOrphan) {
                cardClasses =
                  "border-2 border-dashed border-[#c75b54] bg-[#fff6f5] hover:border-[#9a2e26]";
              } else if (isCurrent) {
                cardClasses =
                  "border-2 border-[#006699] bg-[#edf7fc] ring-4 ring-[#006699]/15 shadow-md";
              } else if (isDone) {
                cardClasses = "border-2 border-[#165b47] bg-[#f1faf5] hover:shadow-md";
              } else if (node.isDecision) {
                cardClasses =
                  "border-2 border-[#c9961f] bg-[#fffbeb] hover:border-[#9c6d12] hover:shadow-md";
              } else if (isInPath) {
                cardClasses = "border-[#5694b3] bg-[#f4fafd] hover:border-[#006699]";
              }

              const showExcerpt =
                !isEditor &&
                node.step.body &&
                node.step.body.trim() !== node.step.title.trim();

              return (
                <button
                  key={node.step.id}
                  type="button"
                  onClick={() => onSelect?.(node.step.id)}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: node.w,
                    height: node.h,
                  }}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`group absolute z-20 flex flex-col justify-between border px-3.5 py-2.5 text-left transition ${
                    node.isDecision ? "rounded-xl" : "rounded-md"
                  } ${cardClasses}`}
                >
                  {/* Indicador lateral estilo bloque PSeInt */}
                  {!node.isDecision && !node.isOrphan && (
                    <span
                      aria-hidden="true"
                      className={`absolute inset-y-0 left-0 w-1.5 rounded-l-[5px] ${
                        isCurrent
                          ? "bg-[#006699]"
                          : isDone
                            ? "bg-[#165b47]"
                            : "bg-[#6c9db4] group-hover:bg-[#006699]"
                      }`}
                    />
                  )}

                  <div className="flex items-center justify-between gap-1.5 pl-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`grid h-5 min-w-5 place-items-center rounded px-1 font-mono text-[11px] font-black ${
                          isCurrent
                            ? "bg-[#006699] text-white"
                            : isDone
                              ? "bg-[#165b47] text-white"
                              : node.isDecision
                                ? "bg-[#c9961f] text-white"
                                : node.isOrphan
                                  ? "bg-[#a33128] text-white"
                                  : "bg-[#e3eff5] text-[#14435a]"
                        }`}
                      >
                        {isDone ? "✓" : node.stepIndex + 1}
                      </span>
                      {node.isDecision && (
                        <span className="rounded bg-[#f9e7b8] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-[#785106]">
                          ⑂ Decisión
                        </span>
                      )}
                      {node.isOrphan && (
                        <span className="rounded bg-[#fbe4e2] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-[#9a2e26]">
                          Sin enlace
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {doubts > 0 && (
                        <span
                          title={`${doubts} duda(s) en este paso`}
                          className="rounded bg-[#e6f3fa] px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-[#005580]"
                        >
                          💬 {doubts}
                        </span>
                      )}
                      {pending > 0 && (
                        <span
                          title={`${pending} cambio(s) sugerido(s)`}
                          className="rounded bg-[#fdf1d0] px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-[#7d5509]"
                        >
                          ✎ {pending}
                        </span>
                      )}
                      {!isEditor && doubts === 0 && pending === 0 && (
                        <span className="text-[10px] font-bold text-[#5a7988] opacity-75 transition group-hover:text-[#006699] group-hover:opacity-100">
                          Abrir →
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pl-1">
                    <p
                      className={`${
                        showExcerpt ? "line-clamp-1" : "line-clamp-2"
                      } text-[13px] font-extrabold leading-snug text-[#142c3c]`}
                    >
                      {node.step.title || `Paso ${node.stepIndex + 1}`}
                    </p>
                    {showExcerpt && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-[#516875]">
                        {node.step.body}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Terminador FIN (cápsula PSeInt) */}
            {layout.endNode && (
              <div
                style={{
                  left: layout.endNode.x,
                  top: layout.endNode.y,
                  width: layout.endNode.w,
                  height: layout.endNode.h,
                }}
                className="absolute z-10 grid place-items-center rounded-full border-2 border-[#165b47] bg-[#e9f6f0] font-mono text-[11px] font-black uppercase tracking-[0.18em] text-[#145542] shadow-xs"
              >
                Fin
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Mini tira visual de flujo para las tarjetas blueprint del catálogo de guías */
export function MiniFlowStrip({ steps }: { steps: GuideStep[] }) {
  if (!steps.length) return null;
  const visible = steps.slice(0, 4);
  const hasMore = steps.length > 4;
  return (
    <div className="flex flex-wrap items-center gap-1 rounded border border-[#d6e3ea] bg-[#f5fafc] px-2.5 py-1.5 text-[11px]">
      {visible.map((step, i) => {
        const routes = routesFrom(steps, i);
        const isBranch = routes.length > 1;
        return (
          <span key={step.id} className="inline-flex items-center gap-1">
            {i > 0 && (
              <span className="font-mono text-[#7c9aa8]" aria-hidden="true">
                →
              </span>
            )}
            <span
              className={`inline-flex max-w-[130px] items-center gap-1 truncate rounded px-1.5 py-0.5 font-semibold ${
                isBranch
                  ? "border border-[#e3cc92] bg-[#fff8e6] text-[#785106]"
                  : "border border-[#d1e1ea] bg-white text-[#1e4356]"
              }`}
              title={step.title}
            >
              <span className="font-mono text-[10px] font-extrabold text-[#006699]">{i + 1}</span>
              <span className="truncate">{step.title}</span>
              {isBranch && <span aria-hidden="true">⑂</span>}
            </span>
          </span>
        );
      })}
      {hasMore && (
        <span className="font-mono text-[10px] font-bold text-[#5a7685]">
          +{steps.length - 4} más
        </span>
      )}
    </div>
  );
}
