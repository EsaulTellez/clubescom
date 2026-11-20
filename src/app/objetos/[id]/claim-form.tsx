"use client";

import { useActionState, useState } from "react";
import { uploadFileDirectly } from "@/lib/direct-upload";
import { btn, input, label } from "@/lib/ui";
import { claimItem } from "../actions";
import type { FormState } from "../labels";

const EVIDENCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

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
  const [uploadedPath, setUploadedPath] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setUploadError("");
    setUploadedPath("");
    setFileName("");
    if (!file) return;
    if (!EVIDENCE_TYPES.has(file.type)) {
      setUploadError("Usa JPG, PNG, WEBP o PDF.");
      e.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("El archivo supera los 10 MB.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const res = await uploadFileDirectly(file, {
        bucket: "lost-evidence",
        contextId: id,
      });
      setUploadedPath(res.path);
      setFileName(file.name);
      e.target.value = "";
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir la evidencia.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      {uploadedPath && <input type="hidden" name="evidence_uploaded_path" value={uploadedPath} />}

      {mode === "encontrado" ? (
        <>
          <p className="text-sm font-medium text-[#173142]">{question}</p>
          <label className={label}>
            Tu respuesta llave
            <input
              className={`${input} mt-1`}
              name="answer"
              required
              minLength={2}
              maxLength={120}
              autoComplete="off"
              placeholder="Ej. detalle específico o color exacto"
            />
          </label>
          <label className={label}>
            Detalle adicional para quien encontró el objeto (opcional)
            <textarea
              className={`${input} mt-1 min-h-20`}
              name="note"
              maxLength={500}
              placeholder="Describe alguna seña particular que confirme que es tuyo"
            />
          </label>
        </>
      ) : (
        <>
          <input type="hidden" name="answer" value="encontrado" />
          <p className="text-sm font-medium text-[#173142]">{question}</p>
          <label className={label}>
            ¿Dónde y cómo lo encontraste?
            <textarea
              className={`${input} mt-1 min-h-24`}
              name="note"
              required
              minLength={6}
              maxLength={500}
              placeholder="Indica en qué edificio lo hallaste y tu disponibilidad para entregarlo en el campus"
            />
          </label>
        </>
      )}

      <label className={label}>
        Foto o comprobante {mode === "perdido" ? "del hallazgo (opcional)" : "de propiedad (opcional · JPG, PNG, WEBP o PDF)"}
        <input
          className={`${input} mt-1`}
          name={uploadedPath ? undefined : "evidence"}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={onFileChange}
          disabled={uploading}
        />
        <span className="mt-1 block text-xs font-normal text-[#667085]">
          Se resguarda de forma privada; solo quien publicó el reporte podrá verlo.
        </span>
      </label>
      {uploading && <p className="text-xs font-semibold text-[#006699]">Subiendo evidencia privada…</p>}
      {fileName && <p className="text-xs font-semibold text-[#17634a]">Evidencia lista: {fileName}</p>}
      {uploadError && <p className="text-xs text-[#8C1D18]">{uploadError}</p>}
      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      {state.ok && <p className="rounded-xl bg-[#e8f2e8] p-3 text-sm text-[#28452d]">{state.ok}</p>}
      <button className={btn} disabled={pending || uploading}>
        {pending
          ? "Enviando…"
          : mode === "perdido"
            ? "Avisar que lo encontré"
            : "Enviar reclamo"}
      </button>
    </form>
  );
}
