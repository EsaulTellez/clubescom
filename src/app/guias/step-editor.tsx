"use client";

import { useState } from "react";
import { uploadFileDirectly } from "@/lib/direct-upload";
import { btnGhost, input } from "@/lib/ui";
import { RouteMap } from "./route-map";
import { validateSteps, type GuideStep } from "./shared";

export function StepEditor({
  steps,
  setSteps,
  version = 0,
}: {
  steps: GuideStep[];
  setSteps: (steps: GuideStep[]) => void;
  version?: number;
}) {
  const [uploadingStepId, setUploadingStepId] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string>("");
  const valid = validateSteps(steps);
  const nextId = Math.max(0, ...steps.map((step) => step.id)) + 1;
  const labels = new Map(steps.map((step, idx) => [step.id, `${idx + 1}. ${step.title || "Sin título"}`]));

  const update = (id: number, patch: Partial<GuideStep>) =>
    setSteps(steps.map((step) => (step.id === id ? { ...step, ...patch } : step)));

  const addStep = () => {
    const newId = nextId;
    const prevLast = steps[steps.length - 1];
    const updated = prevLast && prevLast.choices !== undefined && prevLast.choices.length === 0
      ? steps.map((s, idx) =>
          idx === steps.length - 1 ? { ...s, choices: undefined } : s,
        )
      : steps;
    setSteps([
      ...updated,
      { id: newId, title: `Paso ${updated.length + 1}`, body: "Describe qué debe hacer el estudiante en este paso." },
    ]);
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
  };

  const moveStep = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const copy = [...steps];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    setSteps(copy);
  };

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

  return (
    <div key={version} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Pasos y rutas de decisión ({steps.length})</p>
          <p className="text-xs text-[#667085]">
            El primer paso es el punto de entrada. Usa decisiones cuando el trámite cambia según la situación del alumno.
          </p>
        </div>
        <button type="button" className={btnGhost} onClick={addStep}>
          + Añadir paso
        </button>
      </div>

      {"error" in valid ? (
        <div role="alert" className="rounded-lg border border-[#e3b7b2] bg-[#fdf2f0] px-3.5 py-2.5 text-xs font-semibold text-[#8C1D18]">
          Revisa la estructura del flujo: {valid.error}
        </div>
      ) : (
        <RouteMap steps={valid.steps} defaultOpen />
      )}

      {uploadError && (
        <p role="alert" className="text-xs font-semibold text-[#8C1D18]">
          {uploadError}
        </p>
      )}

      <div className="space-y-3">
        {steps.map((step, index) => {
          const targets = steps.filter((_, j) => j > index);
          const fallbackNext = targets[0]?.id ?? steps.find((s) => s.id !== step.id)?.id;
          return (
            <div key={step.id} className="space-y-2.5 rounded-2xl border border-[#d5e4ee] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#006699]">
                  Paso #{index + 1}{index === 0 ? " (Inicio)" : ""}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={btnGhost} disabled={index === 0} onClick={() => moveStep(index, -1)}>
                    ↑ Subir
                  </button>
                  <button type="button" className={btnGhost} disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)}>
                    ↓ Bajar
                  </button>
                  {steps.length > 1 && (
                    <button type="button" className={btnGhost} onClick={() => removeStep(index)}>
                      Quitar
                    </button>
                  )}
                </div>
              </div>

              <label className="block text-xs font-medium text-[#304958]">
                Título del paso
                <input
                  className={`${input} mt-1`}
                  required
                  minLength={2}
                  maxLength={160}
                  value={step.title}
                  placeholder="Ej. Registrar solicitud en SIBEC"
                  onChange={(event) => update(step.id, { title: event.target.value })}
                />
              </label>

              <label className="block text-xs font-medium text-[#304958]">
                Instrucciones detalladas
                <textarea
                  className={`${input} mt-1 min-h-20`}
                  required
                  minLength={4}
                  maxLength={2000}
                  value={step.body}
                  placeholder="Describe documentos, enlaces, ventanilla o fechas límite."
                  onChange={(event) => update(step.id, { body: event.target.value })}
                />
              </label>

              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-[#c7dce7] bg-[#f8fbfd] p-2.5 text-xs">
                {step.imageUrl ? (
                  <>
                    <img src={step.imageUrl} alt="" className="h-12 w-16 rounded object-cover border border-[#d5e4ee]" />
                    <span className="flex-1 truncate font-medium text-[#183b4e]">Imagen del paso adjunta</span>
                    <button
                      type="button"
                      className="font-bold text-[#8c1d18] underline"
                      onClick={() => update(step.id, { imageUrl: undefined })}
                    >
                      Quitar imagen
                    </button>
                  </>
                ) : (
                  <label className="flex w-full cursor-pointer items-center justify-between gap-2 text-[#274b5b]">
                    <span>{uploadingStepId === step.id ? "Subiendo imagen…" : "Imagen ilustrativa opcional para este paso (JPG/PNG/WEBP)"}</span>
                    <span className="rounded bg-[#eaf4f8] px-2.5 py-1 font-bold text-[#005a87]">
                      {uploadingStepId === step.id ? "…" : "Adjuntar"}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        void handleStepImage(step.id, e.target.files?.[0]);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                )}
              </div>

              <div className="space-y-2 border-t border-[#eef4f8] pt-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#667085]">
                    {step.choices === undefined
                      ? index === steps.length - 1
                        ? "Último paso (cierre del recorrido)."
                        : "Continúa automáticamente al paso siguiente."
                      : step.choices.length === 0
                        ? "Cierre de esta rama (fin del trámite en este camino)."
                        : "Pregunta o caso con opciones hacia distintos pasos:"}
                  </span>
                  {step.choices === undefined ? (
                    <div className="flex flex-wrap gap-1.5">
                      {targets.length > 0 && (
                        <button
                          type="button"
                          className={btnGhost}
                          onClick={() =>
                            update(step.id, {
                              choices: [{ label: "Opción A", to: targets[0].id }],
                            })
                          }
                        >
                          Ramificar opciones
                        </button>
                      )}
                      {index < steps.length - 1 && (
                        <button type="button" className={btnGhost} onClick={() => update(step.id, { choices: [] })}>
                          Terminar aquí esta rama
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {fallbackNext && (
                        <button
                          type="button"
                          className={btnGhost}
                          onClick={() =>
                            update(step.id, {
                              choices: [...(step.choices ?? []), { label: "Otra opción", to: fallbackNext }],
                            })
                          }
                        >
                          + Añadir opción
                        </button>
                      )}
                      <button type="button" className={btnGhost} onClick={() => update(step.id, { choices: undefined })}>
                        Volver a flujo lineal
                      </button>
                    </div>
                  )}
                </div>

                {step.choices?.map((choice, cIdx) => (
                  <div key={cIdx} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input
                      className={input}
                      required
                      minLength={2}
                      maxLength={140}
                      value={choice.label}
                      placeholder="Etiqueta del caso (ej. Primera vez)"
                      onChange={(event) => {
                        const nextChoices = step.choices!.map((item, k) =>
                          k === cIdx ? { ...item, label: event.target.value } : item,
                        );
                        update(step.id, { choices: nextChoices });
                      }}
                    />
                    <select
                      className={input}
                      value={choice.to}
                      onChange={(event) => {
                        const nextChoices = step.choices!.map((item, k) =>
                          k === cIdx ? { ...item, to: Number(event.target.value) } : item,
                        );
                        update(step.id, { choices: nextChoices });
                      }}
                    >
                      {(targets.length ? targets : steps.filter((s) => s.id !== step.id)).map((other) => (
                        <option key={other.id} value={other.id}>
                          {labels.get(other.id)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() =>
                        update(step.id, {
                          choices: step.choices!.filter((_, k) => k !== cIdx),
                        })
                      }
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
