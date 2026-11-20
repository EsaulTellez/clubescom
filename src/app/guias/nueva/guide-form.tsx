"use client";

import { useActionState, useState } from "react";
import { uploadFileDirectly } from "@/lib/direct-upload";
import { btn, btnGhost, input, label } from "@/lib/ui";
import type { GuideState } from "../actions";
import { serializeFaqs, type GuideFaq, type GuideStep } from "../shared";
import { GuideSourceDropzone } from "../source-dropzone";
import { StepEditor } from "../step-editor";

function parseFaqLines(raw: string): GuideFaq[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf("|");
      return idx > 0
        ? { q: line.slice(0, idx).trim(), a: line.slice(idx + 1).trim() }
        : { q: line, a: "" };
    })
    .filter((item) => item.q.length > 0 && item.a.length > 0);
}

export function GuideForm({
  action,
  areas,
}: {
  action: (state: GuideState, form: FormData) => Promise<GuideState>;
  areas: readonly { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [area, setArea] = useState(areas[0]?.id ?? "general");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [faqItems, setFaqItems] = useState<GuideFaq[]>([]);
  const [steps, setSteps] = useState<GuideStep[]>([
    {
      id: 1,
      title: "Primer paso del trámite",
      body: "Explica qué documentos o requisitos necesita reunir el estudiante antes de iniciar.",
    },
  ]);
  const [version, setVersion] = useState(0);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");

  async function handlePdfUpload(file: File | undefined) {
    setPdfError("");
    if (!file) return;
    if (file.type !== "application/pdf") {
      setPdfError("El documento descargable oficial debe estar en formato PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPdfError("El PDF adjunto supera el límite de 10 MB.");
      return;
    }
    setUploadingPdf(true);
    try {
      const uploaded = await uploadFileDirectly(file, { bucket: "public-media" });
      if (uploaded.publicUrl) {
        setAttachmentUrl(uploaded.publicUrl);
        setAttachmentName(file.name);
      }
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "No se pudo subir el PDF adjunto.");
    } finally {
      setUploadingPdf(false);
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      <GuideSourceDropzone
        area={area}
        onParsed={(draft) => {
          if (draft.title) setTitle(draft.title);
          if (draft.summary) setSummary(draft.summary);
          if (draft.faqs) setFaqItems(parseFaqLines(draft.faqs));
          if (draft.steps.length) setSteps(draft.steps);
          setVersion((v) => v + 1);
        }}
      />

      <label className={label}>
        Área responsable
        <select
          className={input}
          name="area"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        >
          {areas.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className={label}>
        Título de la guía
        <input
          className={input}
          name="title"
          required
          minLength={4}
          maxLength={180}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. Registro de Protocolo ante la CATT"
        />
      </label>

      <label className={label}>
        Resumen para el estudiante
        <textarea
          className={`${input} min-h-20`}
          name="summary"
          required
          minLength={8}
          maxLength={800}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Qué trámite cubre esta guía, a quién va dirigida y qué obtiene al completarla."
        />
      </label>

      <input type="hidden" name="steps_json" value={JSON.stringify(steps)} />
      <StepEditor steps={steps} setSteps={setSteps} version={version} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-[#173142]">Preguntas frecuentes ({faqItems.length})</span>
          <button
            type="button"
            className={btnGhost}
            onClick={() => setFaqItems((list) => [...list, { q: "", a: "" }])}
          >
            + Añadir pregunta frecuente
          </button>
        </div>
        <input type="hidden" name="faqs" value={serializeFaqs(faqItems)} />
        {faqItems.map((item, idx) => (
          <div key={idx} className="space-y-2 rounded-2xl border border-[#d5e4ee] bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#006699]">FAQ #{idx + 1}</span>
              <button
                type="button"
                className={btnGhost}
                onClick={() => setFaqItems((list) => list.filter((_, j) => j !== idx))}
              >
                Quitar
              </button>
            </div>
            <input
              className={input}
              maxLength={240}
              value={item.q}
              onChange={(e) =>
                setFaqItems((list) => list.map((f, j) => (j === idx ? { ...f, q: e.target.value } : f)))
              }
              placeholder="Ej. ¿Puedo entregar el formato sin firma digital?"
            />
            <textarea
              className={`${input} min-h-16`}
              maxLength={500}
              value={item.a}
              onChange={(e) =>
                setFaqItems((list) => list.map((f, j) => (j === idx ? { ...f, a: e.target.value } : f)))
              }
              placeholder="Respuesta clara para el alumno."
            />
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-[#d5e4ee] bg-[#fafcfd] p-3.5 text-sm">
        <p className="font-semibold text-[#173142]">Documento o formato descargable en PDF (opcional, máx. 10 MB)</p>
        <input type="hidden" name="attachment_uploaded_url" value={attachmentUrl} />
        <input type="hidden" name="attachment_uploaded_name" value={attachmentName} />
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => void handlePdfUpload(e.target.files?.[0])}
            className="block flex-1 text-xs text-[#667085]"
          />
          {attachmentUrl && (
            <button
              type="button"
              className="text-xs font-bold text-[#8c1d18] underline"
              onClick={() => {
                setAttachmentUrl("");
                setAttachmentName("");
              }}
            >
              Quitar PDF ({attachmentName})
            </button>
          )}
        </div>
        {uploadingPdf && <p className="text-xs text-[#006699]">Subiendo PDF oficial...</p>}
        {pdfError && <p className="text-xs text-[#8C1D18]">{pdfError}</p>}
      </div>

      {state.error && <p role="alert" className="text-sm font-medium text-[#8C1D18]">{state.error}</p>}
      <button className={btn} disabled={pending || uploadingPdf}>
        {pending ? "Publicando…" : "Publicar guía"}
      </button>
    </form>
  );
}
