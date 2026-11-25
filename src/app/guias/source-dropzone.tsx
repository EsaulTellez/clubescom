"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Spinner } from "@/components/loading-ui";
import { uploadFileDirectly } from "@/lib/direct-upload";
import { btnGhost } from "@/lib/ui";
import { parseGuideDocumentDraft } from "./actions";
import { MAX_SOURCE_MB, SOURCE_ACCEPT, type GuideStep } from "./shared";

export type ParsedGuideDraft = {
  title: string;
  summary: string;
  steps: GuideStep[];
  faqs: string;
  notice?: string;
  aiUsed?: boolean;
};

export function GuideSourceDropzone({
  area,
  onParsed,
}: {
  area: string;
  onParsed: (draft: ParsedGuideDraft) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [parsing, startParsing] = useTransition();

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleSelect(file: File | undefined) {
    setError("");
    setNotice("");
    if (!file) {
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }
    if (file.size > MAX_SOURCE_MB * 1024 * 1024) {
      setError(`El archivo supera el límite de ${MAX_SOURCE_MB} MB.`);
      return;
    }
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl((prev) => {
        if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return url;
      });
    } else {
      setPreviewUrl((prev) => {
        if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
    }
    runExtract(file);
  }

  function runExtract(targetFile: File | null = selectedFile) {
    if (!targetFile) {
      setError("Arrastra o elige primero un PDF, Word (.docx), imagen o archivo de texto.");
      return;
    }
    setError("");
    setNotice("");
    startParsing(async () => {
      try {
        const form = new FormData();
        form.set("fileName", targetFile.name);
        form.set("area", area || "general");
        if (targetFile.size > 3.5 * 1024 * 1024) {
          const uploaded = await uploadFileDirectly(targetFile, {
            bucket: "guide-source",
            area: area || "general",
          });
          form.set("storagePath", uploaded.path);
        } else {
          form.set("source", targetFile);
        }
        const result = await parseGuideDocumentDraft(form);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.steps) {
          onParsed({
            title: result.title ?? "",
            summary: result.summary ?? "",
            steps: result.steps,
            faqs: result.faqs ?? "",
            notice: result.notice,
            aiUsed: result.aiUsed,
          });
          setNotice(result.notice ?? "Borrador extraído correctamente. Revisa los pasos abajo.");
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo analizar el documento. Intenta con otro formato o captura manual.",
        );
      }
    });
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        handleSelect(e.dataTransfer.files?.[0]);
      }}
      className={`space-y-3 rounded-2xl border-2 border-dashed p-4 transition ${
        dragActive
          ? "border-[#006699] bg-[#e0f2fa]"
          : "border-[#9bc2d6] bg-[#f4f9fc]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#173142]">
            Generar pasos desde el texto y las figuras del archivo
          </p>
          <p className="text-xs text-[#667085]">
            Suelta aquí un PDF digital o escaneado, Word (.docx), archivo de texto o imagen JPG, PNG o WebP (máx. {MAX_SOURCE_MB} MB).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label htmlFor={inputId} className={`${btnGhost} cursor-pointer`}>
            Elegir archivo
          </label>
          {selectedFile && (
            <button type="button" className={btnGhost} onClick={() => runExtract(selectedFile)} disabled={parsing} aria-busy={parsing || undefined}>
              {parsing && <Spinner className="h-3.5 w-3.5" />}
              <span>{parsing ? "Analizando…" : "Re-analizar archivo"}</span>
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={SOURCE_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          handleSelect(e.target.files?.[0]);
          e.currentTarget.value = "";
        }}
      />

      {selectedFile && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#cde0ea] bg-white p-2.5 text-xs">
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Vista previa del archivo fuente"
              className="h-14 w-20 rounded border border-[#d5e4ee] object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[#173142]">{selectedFile.name}</p>
            <p className="text-[#667085]">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB {parsing ? "· Extrayendo pasos e indicaciones..." : ""}
            </p>
          </div>
        </div>
      )}

      {notice && (
        <p role="status" className="rounded-lg border border-[#b7d9c2] bg-[#edf8f1] px-3 py-2 text-xs font-medium text-[#1b5e36]">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-[#e3b7b2] bg-[#fdf2f0] px-3 py-2 text-xs font-semibold text-[#8C1D18]">
          {error}
        </p>
      )}
    </div>
  );
}
