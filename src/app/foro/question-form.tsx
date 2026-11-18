"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { ImageUploadField } from "@/components/image-upload-field";
import { btn, input, label } from "@/lib/ui";
import { suggestSimilarQuestions, type QuestionState } from "./actions";
import { AREAS, REQUEST_KINDS, isArea, type RequestKind } from "./shared";

export function QuestionForm({
  action,
  defaultArea,
  step,
  office,
  guides = [],
  onSelectQuestion,
}: {
  action: (state: QuestionState, form: FormData) => Promise<QuestionState>;
  defaultArea?: string;
  step?: { guideId: string; id: number };
  office?: string | null;
  guides?: { id: string; title: string; area: string }[];
  onSelectQuestion?: (questionId: string) => void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [requestKind, setRequestKind] = useState<RequestKind>("pregunta");
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [targetGuideId, setTargetGuideId] = useState("");
  const area = office ?? selectedArea ?? (defaultArea && isArea(defaultArea) ? defaultArea : "general");
  const [title, setTitle] = useState("");
  const [similar, setSimilar] = useState<{ id: string; title: string; area: string; similarity: number }[]>([]);
  const [searching, startSearching] = useTransition();

  useEffect(() => {
    if (title.trim().length < 8) return;
    let current = true;
    const timer = window.setTimeout(() => {
      startSearching(async () => {
        const rows = await suggestSimilarQuestions(title, area);
        if (current) setSimilar(rows);
      });
    }, 350);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [title, area]);

  function handleKindChange(nextKind: RequestKind) {
    setRequestKind(nextKind);
    if (nextKind === "nuevo_club") {
      setSelectedArea("clubes");
    } else if (nextKind === "cambio_info") {
      setSelectedArea("infraestructura");
    } else if (nextKind === "actualizar_guia" && !["gestion_escolar", "becas", "catt"].includes(area)) {
      setSelectedArea("gestion_escolar");
    }
  }

  const placeholderByKind: Record<RequestKind, string> = {
    pregunta: "¿Cómo tramito una constancia de estudios?",
    actualizar_guia: "Actualizar paso de vigencia IMSS en guía de reinscripción",
    nuevo_club: "Solicitud para crear un club de ciberseguridad",
    cambio_info: "Actualizar ubicación de cubículo del profesor en Edificio 2",
  };

  const detailPlaceholderByKind: Record<RequestKind, string> = {
    pregunta: "Cuenta en qué punto del trámite te atoras y qué ya intentaste.",
    actualizar_guia: "Indica qué paso o requisito cambió y cuál es la información vigente.",
    nuevo_club: "Describe la idea, tipo de club, actividades previstas y qué apoyo necesitas.",
    cambio_info: "Indica qué dato del sistema cambió (cubículo, horario, ventanilla o espacio) y el dato correcto.",
  };

  return (
    <form action={formAction} className="space-y-3">
      {step ? <>
        <input type="hidden" name="request_kind" value="pregunta" />
        <input type="hidden" name="area" value={defaultArea} />
        <input type="hidden" name="target_guide_id" value={step.guideId} />
        <input type="hidden" name="target_step_index" value={step.id} />
      </> : <>
      <label className={label}>
        Tipo de publicación
        <select
          className={input}
          name="request_kind"
          value={requestKind}
          onChange={(e) => handleKindChange(e.target.value as RequestKind)}
        >
          {REQUEST_KINDS.filter((item) => !office || item.id === "pregunta" || item.id === "actualizar_guia").map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className={label}>
        Área
        <select className={input} name="area" value={area} onChange={(event) => setSelectedArea(event.target.value)}>
          {AREAS.filter((item) => !office || item.id === office).map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      </>}

      {requestKind === "actualizar_guia" && guides.length > 0 && (
        <label className={label}>
          Guía relacionada (opcional)
          <select
            className={input}
            name="target_guide_id"
            value={targetGuideId}
            onChange={(e) => {
              const id = e.target.value;
              setTargetGuideId(id);
              const found = guides.find((g) => g.id === id);
              if (found && isArea(found.area)) {
                setSelectedArea(found.area);
              }
            }}
          >
            <option value="">Selecciona una guía (opcional)</option>
            {guides.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {requestKind === "nuevo_club" && (
        <div className="rounded-lg border border-[#b4dce0] bg-[#e7f5f6] px-3 py-2 text-xs text-[#0b565e]">
          Para abrir la votación de 20 alumnos puedes publicar directo en{" "}
          <Link href="/clubes#proponer-club" className="font-extrabold underline">
            Propuestas de clubes →
          </Link>
        </div>
      )}

      {requestKind === "cambio_info" && (
        <div className="rounded-lg border border-[#e6d39a] bg-[#fdf5df] px-3 py-2 text-xs text-[#6e5008]">
          Si es ubicación de un profesor también puedes votarla o sugerirla en{" "}
          <Link href="/mapa" className="font-extrabold underline">
            Mapa 3D →
          </Link>
        </div>
      )}

      <label className={label}>
        Título
        <input
          className={input}
          name="title"
          value={title}
          onChange={(event) => {
            const value = event.target.value;
            setTitle(value);
            if (value.trim().length < 8) setSimilar([]);
          }}
          required
          minLength={8}
          maxLength={180}
          placeholder={placeholderByKind[requestKind]}
        />
      </label>
      <p className="text-xs text-[#667085]">
        Si ya existe una publicación muy parecida, te la mostramos y no publicamos un duplicado.
      </p>
      {similar.length > 0 && (
        <div className="rounded-lg border border-[#d5e4ee] bg-[#e6f3fa] p-3 text-sm" aria-live="polite">
          <p className="font-semibold">{searching ? "Buscando publicaciones parecidas…" : "Publicaciones parecidas en esta área:"}</p>
          <ul className="mt-2 space-y-1">
            {similar.map((question) => (
              <li key={question.id}>
                <Link
                  className="text-[#006699] underline"
                  href={`/foro?duda=${question.id}#duda-${question.id}`}
                  onClick={() => onSelectQuestion?.(question.id)}
                >
                  {question.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <label className={label}>
        Detalle
        <textarea
          className={`${input} min-h-28`}
          name="body"
          required
          minLength={10}
          maxLength={5000}
          placeholder={detailPlaceholderByKind[requestKind]}
        />
      </label>
      <ImageUploadField name="image" label="Imagen o captura de pantalla (opcional)" compact />
      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      {state.duplicate && (
        <div className="rounded-lg border border-[#d5e4ee] bg-[#e6f3fa] p-3 text-sm">
          <p>Ya existe una publicación parecida. Revísala antes de abrir otra.</p>
          <Link
            href={`/foro?duda=${state.duplicate.id}#duda-${state.duplicate.id}`}
            onClick={() => onSelectQuestion?.(state.duplicate!.id)}
            className="mt-2 inline-block font-medium text-[#006699] underline"
          >
            {state.duplicate.title}
          </Link>
        </div>
      )}
      <button className={btn} disabled={pending}>
        {pending ? "Publicando…" : "Publicar en foro"}
      </button>
    </form>
  );
}
