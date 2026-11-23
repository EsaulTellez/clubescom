"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/loading-ui";
import { uploadFileDirectly } from "@/lib/direct-upload";
import { btn, btnGhost, input, label } from "@/lib/ui";
import { editGuide, type GuideState } from "../../actions";
import { serializeFaqs, type GuideFaq, type GuideStep } from "../../shared";
import { GuideSourceDropzone } from "../../source-dropzone";
import { StepEditor } from "../../step-editor";

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

export function EditGuideForm({
  id,
  area = "general",
  version,
  title: initialTitle,
  summary: initialSummary,
  steps: initialSteps,
  faqs: initialFaqs,
  attachmentName: initialAttachmentName,
}: {
  id: string;
  area?: string;
  version: number;
  title: string;
  summary: string;
  steps: GuideStep[];
  faqs: GuideFaq[];
  attachmentName: string | null;
}) {
  const [state, action, pending] = useActionState<GuideState, FormData>(editGuide, {});
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [steps, setSteps] = useState(initialSteps);
  const [faqItems, setFaqItems] = useState(initialFaqs);
  const [editorVersion, setEditorVersion] = useState(0);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentName, setAttachmentName] = useState(initialAttachmentName ?? "");
  const [removeAttachment, setRemoveAttachment] = useState(false);
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
        setRemoveAttachment(false);
      }
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "No se pudo subir el PDF adjunto.");
    } finally {
      setUploadingPdf(false);
    }
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <p className="text-xs font-medium text-[#006699]">Versión actual v{version}</p>

      <GuideSourceDropzone
        area={area}
        onParsed={(draft) => {
          if (draft.title) setTitle(draft.title);
          if (draft.summary) setSummary(draft.summary);
          if (draft.faqs) setFaqItems(parseFaqLines(draft.faqs));
          if (draft.steps.length) setSteps(draft.steps);
          setEditorVersion((v) => v + 1);
        }}
      />

      <label className={label}>
        Título
        <input
          className={input}
          name="title"
          required
          minLength={4}
          maxLength={180}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <label className={label}>
        Resumen
        <textarea
          className={`${input} min-h-20`}
          name="summary"
          required
          minLength={8}
          maxLength={800}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </label>

      <input type="hidden" name="steps_json" value={JSON.stringify(steps)} />
      <StepEditor steps={steps} setSteps={setSteps} version={editorVersion} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-[#173142]">Preguntas frecuentes ({faqItems.length})</span>
          <button
            type="button"
            className={btnGhost}
            onClick={() => setFaqItems((items) => [...items, { q: "", a: "" }])}
          >
            + Añadir pregunta
          </button>
        </div>
        <input type="hidden" name="faqs" value={serializeFaqs(faqItems)} />
        <input
          type="hidden"
          name="faqs_json"
          value={JSON.stringify(faqItems.filter((f) => f.q.trim() && f.a.trim()))}
        />
        {faqItems.map((item, idx) => (
          <div key={idx} className="space-y-2 rounded-2xl border border-[#d5e4ee] bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#006699]">FAQ #{idx + 1}</span>
              <button
                type="button"
                className={btnGhost}
                onClick={() => setFaqItems((items) => items.filter((_, i) => i !== idx))}
              >
                Quitar
              </button>
            </div>
            <input
              className={input}
              maxLength={240}
              value={item.q}
              onChange={(event) =>
                setFaqItems((items) => items.map((faq, i) => (i === idx ? { ...faq, q: event.target.value } : faq)))
              }
              placeholder="Pregunta"
            />
            <textarea
              className={`${input} min-h-16`}
              maxLength={500}
              value={item.a}
              onChange={(event) =>
                setFaqItems((items) => items.map((faq, i) => (i === idx ? { ...faq, a: event.target.value } : faq)))
              }
              placeholder="Respuesta"
            />
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-[#d5e4ee] bg-[#fafcfd] p-3.5 text-sm">
        <p className="font-semibold text-[#173142]">
          Documento descargable (PDF, máx. 10 MB){attachmentName && !removeAttachment ? ` · Actual: ${attachmentName}` : ""}
        </p>
        <input type="hidden" name="attachment_uploaded_url" value={attachmentUrl} />
        <input type="hidden" name="attachment_uploaded_name" value={attachmentName} />
        <input type="hidden" name="remove_attachment" value={removeAttachment ? "1" : "0"} />
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => void handlePdfUpload(e.target.files?.[0])}
          className="block w-full text-xs text-[#667085]"
        />
        {(attachmentName || attachmentUrl) && (
          <label className="flex items-center gap-2 text-xs text-[#8c1d18]">
            <input
              type="checkbox"
              checked={removeAttachment}
              onChange={(e) => {
                setRemoveAttachment(e.target.checked);
                if (e.target.checked) setAttachmentUrl("");
              }}
            />
            Retirar PDF adjunto al guardar
          </label>
        )}
        {uploadingPdf && <p className="text-xs text-[#006699]">Subiendo PDF nuevo...</p>}
        {pdfError && <p className="text-xs text-[#8C1D18]">{pdfError}</p>}
      </div>

      <label className={label}>
        Nota de cambios (para historial de versiones)
        <input
          className={input}
          name="note"
          maxLength={240}
          placeholder="Ej. Actualización de fechas de entrega CATT"
        />
      </label>

      {state.error && <p role="alert" className="text-sm text-[#8C1D18]">{state.error}</p>}
      <SubmitButton className={btn} pending={pending} disabled={uploadingPdf} pendingText="Guardando…">
        Guardar versión
      </SubmitButton>
    </form>
  );
}
