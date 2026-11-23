"use client";

import { useState } from "react";
import { uploadFileDirectly } from "@/lib/direct-upload";
import { btnGhost, input } from "@/lib/ui";
import { GuideFlowchart } from "./guide-flowchart";
import { routesFrom, validateSteps, type GuideStep } from "./shared";

type FlowMode = "next" | "branch" | "end";

function detectFlowMode(step: GuideStep): FlowMode {
  if (step.choices === undefined) return "next";
  if (step.choices.length === 0) return "end";
  return "branch";
}

export function StepEditor({
  steps,
  setSteps,
  version = 0,
}: {
  steps: GuideStep[];
  setSteps: (steps: GuideStep[]) => void;
  version?: number;
}) {
  const [selectedId, setSelectedId] = useState<number>(() => steps[0]?.id ?? 1);
  const [uploadingStepId, setUploadingStepId] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string>("");

  const valid = validateSteps(steps);
  const nextId = Math.max(0, ...steps.map((step) => step.id)) + 1;

  const activeIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === selectedId),
  );
  const activeStep = steps[activeIndex] ?? steps[0];

  const decisionCount = steps.filter((_, idx) => routesFrom(steps, idx).length > 1).length;

  const update = (id: number, patch: Partial<GuideStep>) =>
    setSteps(steps.map((step) => (step.id === id ? { ...step, ...patch } : step)));

  const addStep = () => {
    const newId = nextId;
    const prevLast = steps[steps.length - 1];
    const updated =
      prevLast && prevLast.choices !== undefined && prevLast.choices.length === 0
        ? steps.map((s, idx) => (idx === steps.length - 1 ? { ...s, choices: undefined } : s))
        : steps;
    setSteps([
      ...updated,
      {
        id: newId,
        title: `Paso ${updated.length + 1}`,
        body: "Describe qué debe hacer el estudiante en este paso.",
      },
    ]);
    setSelectedId(newId);
  };

  /** Crea un nuevo paso y lo conecta directamente como una nueva opción de rama desde `sourceId` */
  const createBranchTargetStep = (sourceId: number) => {
    const newId = nextId;
    const sourceStep = steps.find((s) => s.id === sourceId);
    if (!sourceStep) return;

    const existingChoices = sourceStep.choices ?? [];
    const branchNumber = existingChoices.length + 1;
    const newChoice = { label: `Opción ${String.fromCharCode(64 + branchNumber)}`, to: newId };

    // Si algún destino hermano anterior estaba al final de la lista con flujo lineal implícito (`choices === undefined`),
    // cerramos su rama con `choices: []` para que no caiga accidentalmente al nuevo paso de otra rama.
    const lastStep = steps[steps.length - 1];
    const siblingTargetIds = new Set(existingChoices.map((c) => c.to));

    const updatedSteps = steps.map((step) => {
      if (step.id === sourceId) {
        return { ...step, choices: [...existingChoices, newChoice] };
      }
      if (
        lastStep &&
        step.id === lastStep.id &&
        step.id !== sourceId &&
        step.choices === undefined &&
        siblingTargetIds.has(step.id)
      ) {
        return { ...step, choices: [] };
      }
      return step;
    });

    setSteps([
      ...updatedSteps,
      {
        id: newId,
        title: `Ruta ${newChoice.label}`,
        body: "Describe las instrucciones para esta opción.",
        choices: [],
      },
    ]);
    setSelectedId(sourceId);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) return;
    const removed = steps[index];
    const fallbackTarget = removed.choices?.[0]?.to ?? steps[index + 1]?.id;
    const remaining = steps
      .filter((step) => step.id !== removed.id)
      .map((step) => {
        if (!step.choices) return step;
        const patched = step.choices
          .map((c) => (c.to === removed.id ? (fallbackTarget ? { ...c, to: fallbackTarget } : null) : c))
          .filter((c): c is { label: string; to: number } => Boolean(c));
        return { ...step, choices: patched };
      });
    setSteps(remaining);
    const nextSel = remaining[Math.max(0, index - 1)]?.id ?? remaining[0]?.id ?? 1;
    setSelectedId(nextSel);
  };

  const moveStep = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const copy = [...steps];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    setSteps(copy);
  };

  function setFlowMode(step: GuideStep, idx: number, nextMode: FlowMode) {
    if (nextMode === "next") {
      update(step.id, { choices: undefined });
      return;
    }
    if (nextMode === "end") {
      update(step.id, { choices: [] });
      return;
    }
    // Branch mode
    const existing = step.choices && step.choices.length > 0 ? step.choices : null;
    if (existing) return;
    const candidateA = steps[idx + 1]?.id ?? steps.find((s) => s.id !== step.id)?.id;
    const candidateB = steps[idx + 2]?.id;
    if (candidateA && candidateB) {
      // Cerrar paso intermedio si quedaba en flujo lineal implícito hacia candidateB
      const patched = steps.map((s) => {
        if (s.id === step.id) {
          return {
            ...s,
            choices: [
              { label: "Opción A", to: candidateA },
              { label: "Opción B", to: candidateB },
            ],
          };
        }
        if (s.id === candidateA && s.choices === undefined) {
          return { ...s, choices: [] };
        }
        return s;
      });
      setSteps(patched);
    } else if (candidateA) {
      // Crear automáticamente un segundo paso para la Opción B para que la ramificación sea real de inmediato
      const newBranchId = nextId;
      const patched = steps.map((s) => {
        if (s.id === step.id) {
          return {
            ...s,
            choices: [
              { label: "Opción A", to: candidateA },
              { label: "Opción B", to: newBranchId },
            ],
          };
        }
        if (s.id === candidateA && s.choices === undefined) {
          return { ...s, choices: [] };
        }
        return s;
      });
      setSteps([
        ...patched,
        {
          id: newBranchId,
          title: "Ruta Opción B",
          body: "Describe qué hacer cuando se elige la Opción B.",
          choices: [],
        },
      ]);
    } else {
      // Es el único paso: crear dos pasos hijos para ramificar
      const idA = nextId;
      const idB = nextId + 1;
      setSteps([
        ...steps.map((s) =>
          s.id === step.id
            ? {
                ...s,
                choices: [
                  { label: "Opción A", to: idA },
                  { label: "Opción B", to: idB },
                ],
              }
            : s,
        ),
        { id: idA, title: "Ruta Opción A", body: "Instrucciones para la primera opción.", choices: [] },
        { id: idB, title: "Ruta Opción B", body: "Instrucciones para la segunda opción.", choices: [] },
      ]);
    }
  }

  async function handleStepImage(stepId: number, file: File | undefined) {
    setUploadError("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setUploadError("Para pasos usa imágenes JPG, PNG o WEBP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("La imagen del paso supera los 10 MB.");
      return;
    }
    setUploadingStepId(stepId);
    try {
      const uploaded = await uploadFileDirectly(file, { bucket: "public-media" });
      if (uploaded.publicUrl) {
        update(stepId, { imageUrl: uploaded.publicUrl });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir la imagen del paso.");
    } finally {
      setUploadingStepId(null);
    }
  }

  if (!activeStep) return null;
  const activeMode = detectFlowMode(activeStep);
  const otherSteps = steps.filter((s) => s.id !== activeStep.id);

  return (
    <div key={version} className="space-y-4">
      {/* Barra superior del constructor visual */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#cddbe2] bg-[#f4f8fa] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="text-sm font-extrabold text-[#142c3c]">
            Constructor visual de pasos ({steps.length})
          </p>
          {"error" in valid ? (
            <span role="alert" className="rounded bg-[#fbe6e4] px-2.5 py-0.5 text-xs font-extrabold text-[#8c2925]">
              ⚠ {valid.error}
            </span>
          ) : (
            <span className="rounded bg-[#e4f4ec] px-2.5 py-0.5 text-xs font-extrabold text-[#14593e]">
              ✓ Flujo válido · {decisionCount} {decisionCount === 1 ? "decisión" : "decisiones"}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={addStep}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#006699] px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-[#004d73]"
        >
          <span>+</span>
          <span>Nuevo paso</span>
        </button>
      </div>

      {uploadError && (
        <p role="alert" className="rounded-md border border-[#e3b8b4] bg-[#fdf2f1] px-3.5 py-2 text-xs font-semibold text-[#8C1D18]">
          {uploadError}
        </p>
      )}

      {/* ESPACIO DIVIDIDO EN VIVO: IZQUIERDA EDITOR DEL PASO / DERECHA DIAGRAMA INTERACTIVO */}
      <div className="grid items-start gap-5 xl:grid-cols-12">
        {/* PANEL IZQUIERDO: SELECTOR DE PASOS + INSPECTOR DEL PASO SELECCIONADO */}
        <div className="space-y-4 xl:col-span-6">
          {/* Riel compacto de pasos */}
          <div className="flex flex-wrap gap-1.5 rounded-md border border-[#d6dfe4] bg-[#fffdf7] p-2.5">
            {steps.map((s, idx) => {
              const isSelected = s.id === activeStep.id;
              const routes = routesFrom(steps, idx);
              const isBranch = routes.length > 1;
              const isEnd = routes.length === 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`inline-flex max-w-[200px] items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-bold transition ${
                    isSelected
                      ? "border-[#006699] bg-[#006699] text-white shadow-xs"
                      : "border-[#d4dde2] bg-[#f8fafb] text-[#274657] hover:border-[#006699]"
                  }`}
                >
                  <span className="font-mono text-[11px] font-black">{idx + 1}.</span>
                  <span className="truncate">{s.title || "Sin título"}</span>
                  {isBranch && <span title="Decisión" aria-hidden="true">⑂</span>}
                  {isEnd && idx > 0 && <span title="Fin de ruta" aria-hidden="true">■</span>}
                </button>
              );
            })}
          </div>

          {/* Tarjeta de edición del paso activo */}
          <div className="space-y-4 rounded-md border border-[#b9ced9] border-t-4 border-t-[#006699] bg-[#fffdf7] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5ecee] pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded bg-[#006699] px-2.5 py-0.5 font-mono text-xs font-black text-white">
                  PASO {activeIndex + 1}
                </span>
                {activeIndex === 0 && (
                  <span className="rounded bg-[#165b47] px-2 py-0.5 text-[10px] font-extrabold uppercase text-white">
                    Inicio del flujo
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="rounded border border-[#cbd7de] bg-white px-2.5 py-1 text-xs font-bold text-[#2b4d5e] hover:bg-[#eef5f8] disabled:opacity-40"
                  disabled={activeIndex === 0}
                  onClick={() => moveStep(activeIndex, -1)}
                >
                  ↑ Subir
                </button>
                <button
                  type="button"
                  className="rounded border border-[#cbd7de] bg-white px-2.5 py-1 text-xs font-bold text-[#2b4d5e] hover:bg-[#eef5f8] disabled:opacity-40"
                  disabled={activeIndex === steps.length - 1}
                  onClick={() => moveStep(activeIndex, 1)}
                >
                  ↓ Bajar
                </button>
                {steps.length > 1 && (
                  <button
                    type="button"
                    className="rounded border border-[#e3bdb9] bg-white px-2.5 py-1 text-xs font-bold text-[#8c2925] hover:bg-[#fdf2f1]"
                    onClick={() => removeStep(activeIndex)}
                  >
                    Eliminar paso
                  </button>
                )}
              </div>
            </div>

            <label className="block text-xs font-extrabold uppercase tracking-wider text-[#355261]">
              Título del paso
              <input
                className={`${input} mt-1 font-semibold`}
                required
                minLength={2}
                maxLength={160}
                value={activeStep.title}
                placeholder="Ej. Registrar solicitud en SIBEC"
                onChange={(event) => update(activeStep.id, { title: event.target.value })}
              />
            </label>

            <label className="block text-xs font-extrabold uppercase tracking-wider text-[#355261]">
              Instrucciones detalladas
              <textarea
                className={`${input} mt-1 min-h-28`}
                required
                minLength={4}
                maxLength={2000}
                value={activeStep.body}
                placeholder="Describe requisitos, ventanilla, formatos, enlaces o fechas límite."
                onChange={(event) => update(activeStep.id, { body: event.target.value })}
              />
            </label>

            {/* Imagen opcional del paso */}
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-[#c7dce7] bg-[#f6fafc] p-3 text-xs">
              {activeStep.imageUrl ? (
                <>
                  <img
                    src={activeStep.imageUrl}
                    alt=""
                    className="h-12 w-16 rounded border border-[#d5e4ee] object-cover"
                  />
                  <span className="flex-1 truncate font-semibold text-[#183b4e]">
                    Imagen adjunta al paso
                  </span>
                  <button
                    type="button"
                    className="font-bold text-[#8c1d18] hover:underline"
                    onClick={() => update(activeStep.id, { imageUrl: undefined })}
                  >
                    Quitar
                  </button>
                </>
              ) : (
                <label className="flex w-full cursor-pointer items-center justify-between gap-2 text-[#274b5b]">
                  <span>
                    {uploadingStepId === activeStep.id
                      ? "Subiendo imagen…"
                      : "Imagen ilustrativa opcional (JPG, PNG o WEBP)"}
                  </span>
                  <span className="rounded bg-[#e6f3fa] px-2.5 py-1 font-extrabold text-[#005a87]">
                    {uploadingStepId === activeStep.id ? "…" : "Adjuntar"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      void handleStepImage(activeStep.id, e.target.files?.[0]);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
            </div>

            {/* CONEXIÓN Y RAMIFICACIÓN VISUAL */}
            <div className="space-y-3 border-t border-[#e5ecee] pt-4">
              <p className="text-xs font-extrabold uppercase tracking-wider text-[#355261]">
                ¿Qué sigue después de este paso?
              </p>

              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    { id: "next", title: "Paso siguiente", desc: "Avanza linealmente" },
                    { id: "branch", title: "⑂ Ramificar / Conectar", desc: "Opciones o salto" },
                    { id: "end", title: "■ Fin de ruta", desc: "Termina este camino" },
                  ] as const
                ).map((modeOpt) => {
                  const active = activeMode === modeOpt.id;
                  return (
                    <button
                      key={modeOpt.id}
                      type="button"
                      onClick={() => setFlowMode(activeStep, activeIndex, modeOpt.id)}
                      className={`rounded-md border p-2.5 text-left transition ${
                        active
                          ? "border-[#006699] bg-[#eef7fc] ring-2 ring-[#006699]/20"
                          : "border-[#d4dde2] bg-white hover:border-[#8eb8ca]"
                      }`}
                    >
                      <span className="block text-xs font-extrabold text-[#142c3c]">{modeOpt.title}</span>
                      <span className="block text-[11px] text-[#58707d]">{modeOpt.desc}</span>
                    </button>
                  );
                })}
              </div>

              {activeMode === "next" && (
                <p className="rounded border border-[#dce6ec] bg-[#f7fafc] px-3 py-2 text-xs text-[#435e6c]">
                  {steps[activeIndex + 1]
                    ? `Conectado automáticamente con Paso ${activeIndex + 2}: «${steps[activeIndex + 1].title}».`
                    : "Último paso de la lista (fin automático si no hay otro después)."}
                </p>
              )}

              {activeMode === "end" && (
                <p className="rounded border border-[#cde3d7] bg-[#f1faf5] px-3 py-2 text-xs font-semibold text-[#165b47]">
                  Esta rama concluye aquí. Los demás pasos no se mezclarán con este camino.
                </p>
              )}

              {activeMode === "branch" && (
                <div className="space-y-2.5 rounded-md border border-[#e3d1a4] bg-[#fffcf3] p-3.5">
                  <div className="space-y-2">
                    {(activeStep.choices ?? []).map((choice, cIdx) => (
                      <div
                        key={cIdx}
                        className="grid gap-2 rounded border border-[#ece0be] bg-white p-2.5 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
                      >
                        <input
                          className={`${input} mt-0 text-xs`}
                          required
                          minLength={2}
                          maxLength={140}
                          value={choice.label}
                          placeholder="Texto del botón (ej. Primera vez)"
                          aria-label={`Etiqueta opción ${cIdx + 1}`}
                          onChange={(e) => {
                            const nextChoices = (activeStep.choices ?? []).map((c, idx) =>
                              idx === cIdx ? { ...c, label: e.target.value } : c,
                            );
                            update(activeStep.id, { choices: nextChoices });
                          }}
                        />
                        <div className="flex items-center gap-1">
                          <select
                            className={`${input} mt-0 text-xs`}
                            value={choice.to}
                            aria-label={`Paso destino opción ${cIdx + 1}`}
                            onChange={(e) => {
                              const nextChoices = (activeStep.choices ?? []).map((c, idx) =>
                                idx === cIdx ? { ...c, to: Number(e.target.value) } : c,
                              );
                              update(activeStep.id, { choices: nextChoices });
                            }}
                          >
                            {otherSteps.map((target) => {
                              const tIdx = steps.findIndex((x) => x.id === target.id);
                              return (
                                <option key={target.id} value={target.id}>
                                  Paso {tIdx + 1}: {target.title}
                                </option>
                              );
                            })}
                          </select>
                          <button
                            type="button"
                            title="Editar paso destino"
                            onClick={() => setSelectedId(choice.to)}
                            className="shrink-0 rounded border border-[#c7d9e3] bg-[#eef7fb] px-2 py-2 text-xs font-extrabold text-[#005580] hover:bg-[#dceff8]"
                          >
                            →
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const nextChoices = (activeStep.choices ?? []).filter((_, idx) => idx !== cIdx);
                            update(activeStep.id, { choices: nextChoices });
                          }}
                          className="rounded border border-[#e3bdb9] px-2 py-1.5 text-xs font-bold text-[#8c2925] hover:bg-[#fdf2f1]"
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => createBranchTargetStep(activeStep.id)}
                      className="inline-flex items-center gap-1 rounded bg-[#142c3c] px-3 py-1.5 text-xs font-extrabold text-white hover:bg-[#006699]"
                    >
                      + Crear nuevo paso para rama
                    </button>
                    {otherSteps.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const defaultTo =
                            otherSteps.find((s) => !(activeStep.choices ?? []).some((c) => c.to === s.id))?.id ??
                            otherSteps[0].id;
                          update(activeStep.id, {
                            choices: [
                              ...(activeStep.choices ?? []),
                              { label: "Conectar con paso", to: defaultTo },
                            ],
                          });
                        }}
                        className={btnGhost}
                      >
                        + Enlazar a paso existente
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PANEL DERECHO: DIAGRAMA INTERACTIVO EN TIEMPO REAL */}
        <div className="space-y-2 xl:col-span-6 xl:sticky xl:top-28">
          <GuideFlowchart
            steps={steps}
            currentStepId={activeStep.id}
            onSelect={(id) => setSelectedId(id)}
            mode="editor"
          />
          <p className="text-right text-[11px] font-medium text-[#5c727e]">
            Haz clic en cualquier nodo del diagrama para editar ese paso.
          </p>
        </div>
      </div>
    </div>
  );
}
