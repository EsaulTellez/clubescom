"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { SubmitButton } from "@/components/loading-ui";
import { uploadFileDirectly } from "@/lib/direct-upload";
import { btn, input } from "@/lib/ui";
import { claimItem } from "../actions";
import type { FormState } from "../labels";

const EVIDENCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ClaimForm({
  id,
  question,
  mode = "encontrado",
}: {
  id: string;
  question: string;
  mode?: "encontrado" | "perdido";
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(claimItem, {});
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [noteLength, setNoteLength] = useState(0);
  const [uploadedPath, setUploadedPath] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function clearEvidence() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setUploadedPath("");
    setFileName("");
    setFileSize(null);
    setIsPdf(false);
    setUploadError("");
  }

  async function processFile(file: File | undefined) {
    setUploadError("");
    setUploadedPath("");
    setFileName("");
    setFileSize(null);
    setIsPdf(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    if (!file) return;
    if (!EVIDENCE_TYPES.has(file.type)) {
      setUploadError("Formato no compatible. Usa JPG, PNG, WEBP o PDF.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("El archivo supera los 10 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setFileName(file.name);
    setFileSize(file.size);
    if (file.type === "application/pdf") {
      setIsPdf(true);
    } else {
      setPreviewUrl(URL.createObjectURL(file));
    }

    setUploading(true);
    try {
      const res = await uploadFileDirectly(file, {
        bucket: "lost-evidence",
        contextId: id,
      });
      setUploadedPath(res.path);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir la evidencia.");
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    void processFile(e.target.files?.[0]);
  }

  function onDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && fileInputRef.current && typeof DataTransfer !== "undefined") {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInputRef.current.files = dt.files;
      } catch {
        // Fallback if browser blocks assigning files
      }
    }
    void processFile(file);
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={id} />
      {uploadedPath && <input type="hidden" name="evidence_uploaded_path" value={uploadedPath} />}

      {mode === "encontrado" ? (
        <>
          <div className="rounded-sm border border-[#bfd5e2] border-l-4 border-l-[#155775] bg-[#f4f9fc] p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-[#155775] text-white">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.1">
                  <circle cx="8.5" cy="15.5" r="4" />
                  <path d="M11.5 12.5 20 4m-3 0h3v3m-4 1 2 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold tracking-[0.12em] text-[#155775] uppercase">
                  Pregunta llave
                </p>
                <p className="mt-1 text-[15px] leading-snug font-bold text-[#142c3c]">
                  {question}
                </p>
              </div>
            </div>

            <div>
              <label htmlFor={`answer-${id}`} className="mb-1.5 block text-xs font-bold text-[#304958]">
                Tu respuesta <span className="text-[#8f2d1f]">*</span>
              </label>
              <input
                id={`answer-${id}`}
                className={input}
                name="answer"
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
                placeholder="Escribe el dato exacto que confirma que es tuyo"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`note-${id}`} className="text-sm font-semibold text-[#304958]">
                Detalles adicionales
              </label>
              <span className="rounded-sm bg-[#efede4] px-2 py-0.5 text-[11px] font-bold text-[#5a6b73]">
                Opcional
              </span>
            </div>
            <textarea
              id={`note-${id}`}
              className={`${input} min-h-24 resize-y`}
              name="note"
              maxLength={500}
              onChange={(e) => setNoteLength(e.target.value.length)}
              placeholder="Marca, calcomanías, funda, contenido o cualquier seña particular"
            />
            <p className="text-right font-mono text-[11px] text-[#6d7c84]">{noteLength}/500</p>
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="answer" value="encontrado" />
          <div className="rounded-sm border border-[#e3cec4] border-l-4 border-l-[#8f2d1f] bg-[#fdf6f2] p-4">
            <p className="text-sm leading-relaxed font-medium text-[#3b2620]">{question}</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`note-${id}`} className="block text-sm font-semibold text-[#304958]">
              ¿Dónde y cómo lo encontraste? <span className="text-[#8f2d1f]">*</span>
            </label>
            <textarea
              id={`note-${id}`}
              className={`${input} min-h-28 resize-y`}
              name="note"
              required
              minLength={6}
              maxLength={500}
              onChange={(e) => setNoteLength(e.target.value.length)}
              placeholder="Indica en qué edificio o salón lo hallaste y en qué horario puedes entregarlo en ESCOM"
            />
            <p className="text-right font-mono text-[11px] text-[#6d7c84]">{noteLength}/500</p>
          </div>
        </>
      )}

      {/* Custom drag-and-drop evidence uploader */}
      <div
        className="space-y-2"
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDrop={onDrop}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-[#304958]">
            {mode === "perdido" ? "Foto del hallazgo" : "Foto o comprobante"}
          </span>
          <span className="rounded-sm bg-[#efede4] px-2 py-0.5 text-[11px] font-bold text-[#5a6b73]">
            Opcional
          </span>
        </div>

        <input
          ref={fileInputRef}
          id={fileInputId}
          name={uploadedPath ? undefined : "evidence"}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={onFileChange}
          disabled={uploading}
          className="sr-only"
        />

        {fileName ? (
          <div className="overflow-hidden rounded-sm border border-[#bfd5e2] bg-[#f7fbfd]">
            {previewUrl && !isPdf && (
              <div className="flex max-h-44 items-center justify-center overflow-hidden border-b border-[#d5e4ee] bg-[#142c3c]">
                <img
                  src={previewUrl}
                  alt="Vista previa de evidencia"
                  className="max-h-44 w-auto object-contain"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-[#e2f0f7] text-[#155775]">
                  {isPdf ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                      <path d="M14 2v6h6M8 13h8M8 17h5" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <circle cx="8.5" cy="9.5" r="1.5" />
                      <path d="m21 15-4.5-4.5a1.5 1.5 0 0 0-2.1 0L6 19" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-[#142c3c]">{fileName}</p>
                  <p className="text-[11px] font-semibold">
                    {uploading ? (
                      <span className="text-[#155775]">Subiendo archivo privado…</span>
                    ) : uploadedPath ? (
                      <span className="text-[#145542]">
                        Lista para enviar{fileSize ? ` · ${formatBytes(fileSize)}` : ""}
                      </span>
                    ) : (
                      <span className="text-[#5f6e78]">
                        {fileSize ? formatBytes(fileSize) : "Archivo seleccionado"}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <label
                  htmlFor={fileInputId}
                  className="cursor-pointer rounded-sm border border-[#b7c1c0] bg-white px-2.5 py-1 text-xs font-bold text-[#155775] hover:bg-[#edf5f9]"
                >
                  Cambiar
                </label>
                <button
                  type="button"
                  onClick={clearEvidence}
                  disabled={uploading}
                  className="rounded-sm border border-[#e3c6c2] bg-white px-2.5 py-1 text-xs font-bold text-[#8f2d1f] hover:bg-[#fdf2f0] disabled:opacity-50"
                >
                  Quitar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <label
            htmlFor={fileInputId}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed px-4 py-5 text-center transition ${
              dragActive
                ? "border-[#155775] bg-[#e6f3fa]"
                : "border-[#c4c8c3] bg-[#faf9f4] hover:border-[#155775] hover:bg-[#f2f8fb]"
            }`}
          >
            <span className="grid h-10 w-10 place-items-center rounded-sm bg-[#e6f0f5] text-[#155775]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M12 16V4m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-bold text-[#142c3c]">
                {dragActive ? "Suelta el archivo aquí" : "Sube una foto o PDF"}
              </p>
              <p className="mt-0.5 text-xs text-[#5f6e78]">
                Arrastra o haz clic · JPG, PNG, WEBP o PDF (máx. 10 MB)
              </p>
            </div>
          </label>
        )}

        <p className="flex items-center gap-1.5 text-xs text-[#5f6e78]">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-[#52656e]" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Privado: solo quien publicó el reporte podrá verlo.
        </p>
      </div>

      {uploadError && (
        <p role="alert" className="rounded-sm border border-[#e5c1bc] bg-[#fff0ec] px-3 py-2 text-xs font-semibold text-[#8C1D18]">
          {uploadError}
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-sm border border-[#e5c1bc] bg-[#fff0ec] px-3 py-2.5 text-sm font-medium text-[#8C1D18]">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-sm border border-[#b7d8be] bg-[#edf6ee] px-3 py-2.5 text-sm font-semibold text-[#1f5133]">
          {state.ok}
        </p>
      )}

      <SubmitButton className={`${btn} w-full py-2.5`} pending={pending} disabled={uploading} pendingText="Enviando…">
        {mode === "perdido" ? "Avisar que lo encontré" : "Enviar reclamo"}
      </SubmitButton>
    </form>
  );
}
