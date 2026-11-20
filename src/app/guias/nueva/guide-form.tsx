"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { btn, btnGhost, input, label } from "@/lib/ui";
import { parseGuideDocumentDraft, type GuideState } from "../actions";
import { StepEditor } from "../step-editor";
import { AREAS, MAX_SOURCE_MB, SOURCE_ACCEPT, type GuideStep } from "../shared";

export function GuideForm({
  action,
  areas,
}: {
  areas: readonly (typeof AREAS)[number][];
  action: (state: GuideState, form: FormData) => Promise<GuideState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [steps, setSteps] = useState<GuideStep[]>([{ id: 0, title: "", body: "" }]);
  const [faqs, setFaqs] = useState("");
  const [parseNotice, setParseNotice] = useState("");
  const [parseError, setParseError] = useState("");
  const [parsing, startParsing] = useTransition();
  const sourceFileRef = useRef<HTMLInputElement | null>(null);

  function handleExtractDraft() {
    setParseError("");
    setParseNotice("");
    const file = sourceFileRef.current?.files?.[0];
    if (!file) {
      setParseError("Selecciona primero una foto o un documento.");
      return;
    }
    if (file.size > MAX_SOURCE_MB * 1024 * 1024) { setParseError(`El archivo supera el límite de ${MAX_SOURCE_MB} MB.`); return; }
    const fd = new FormData();
    fd.set("source_doc", file);
    startParsing(async () => {
      try {
        const result = await parseGuideDocumentDraft(fd);
        if (result.error) setParseError(result.error);
        if (result.notice) setParseNotice(result.notice);
        if (result.title) setTitle(result.title);
        if (result.summary) setSummary(result.summary);
        if (result.steps) setSteps(result.steps);
        if (result.faqs !== undefined) setFaqs(result.faqs);
      } catch { setParseError("Se interrumpió la lectura del archivo. Vuelve a intentarlo."); }
    });
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2 rounded-xl border border-[#d5e4ee] bg-[#f8fbfd] p-4">
        <p className={label}>Generar guía desde un instructivo</p>
        <p className="text-xs text-[#667085]">
          Foto JPG, PNG o WebP, PDF, Word (.docx) o texto. Hasta {MAX_SOURCE_MB} MB.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={sourceFileRef}
            type="file"
            accept={SOURCE_ACCEPT} aria-label="Foto o documento del trámite" disabled={parsing}
            className={`${input} max-w-md`}
          />
          <button type="button" onClick={handleExtractDraft} disabled={parsing} className={btnGhost}>
            {parsing ? "Extrayendo borrador…" : "Generar borrador"}
          </button>
        </div>
        {parseError && <p role="alert" className="text-xs text-[#8C1D18]">{parseError}</p>}
        {parseNotice && <p role="status" className="text-xs font-semibold text-[#004d73]">{parseNotice}</p>}
      </div>

      <label className={label}>
        Área
        <select className={input} name="area" defaultValue={areas[0]?.id}>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.label}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Título
        <input
          className={input}
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={4}
          maxLength={180}
          placeholder="Constancia de estudios"
        />
      </label>
      <label className={label}>
        Resumen
        <textarea
          className={`${input} min-h-20`}
          name="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          required
          minLength={8}
          maxLength={800}
          placeholder="Qué resuelve esta guía y quién la necesita."
        />
      </label>
      <StepEditor steps={steps} setSteps={setSteps} />
      <label className={label}>
        Preguntas frecuentes (opcional)
        <textarea
          className={`${input} min-h-24 font-mono text-xs`}
          name="faqs"
          value={faqs}
          onChange={(e) => setFaqs(e.target.value)}
          placeholder={"¿Cuál es el horario? | De lunes a viernes, de 10:00 a 14:00."}
        />
      </label>
      <p className="text-xs text-[#667085]">
        Una pregunta por línea, con el formato pregunta | respuesta.
      </p>

      <label className={label}>
        Formato o documento PDF descargable del trámite (opcional · máx. 10 MB)
        <input className={input} name="attachment" type="file" accept="application/pdf" />
      </label>

      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      <button className={btn} disabled={pending || parsing}>
        {pending ? "Publicando…" : "Publicar guía"}
      </button>
    </form>
  );
}
