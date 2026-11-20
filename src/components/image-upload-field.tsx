"use client";

import { useEffect, useId, useRef, useState } from "react";
import { uploadFileDirectly, type SignedUploadBucket } from "@/lib/direct-upload";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function ImageUploadField({
  name = "image",
  label = "Imagen (JPG, PNG o WEBP · máx. 10 MB)",
  initialImageUrl = null,
  required = false,
  compact = false,
  directBucket = "public-media",
  directContextId,
  onUploadedChange,
}: {
  name?: string;
  label?: string;
  initialImageUrl?: string | null;
  required?: boolean;
  compact?: boolean;
  directBucket?: Extract<SignedUploadBucket, "public-media" | "lost-evidence">;
  directContextId?: string;
  onUploadedChange?: (status: { busy: boolean; value: string | null }) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [uploadedValue, setUploadedValue] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const activePreviewUrl = previewUrl ?? initialImageUrl;

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function processFile(file: File | undefined) {
    setUploadError("");
    if (!file) {
      setPreviewUrl(null);
      setFileName("");
      setUploadedValue("");
      onUploadedChange?.({ busy: false, value: null });
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setUploadError("Formato no compatible. Usa una imagen JPG, PNG o WEBP.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("La imagen supera los 10 MB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return objectUrl;
    });
    setFileName(file.name);

    const canDirectUpload =
      directBucket === "public-media" ||
      (directBucket === "lost-evidence" && Boolean(directContextId));

    if (!canDirectUpload) return;

    setUploading(true);
    onUploadedChange?.({ busy: true, value: null });
    try {
      const result = await uploadFileDirectly(file, {
        bucket: directBucket,
        contextId: directContextId,
      });
      const val = directBucket === "public-media" ? (result.publicUrl ?? "") : result.path;
      setUploadedValue(val);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      onUploadedChange?.({ busy: false, value: val || null });
    } catch (err) {
      if (file.size > 4 * 1024 * 1024) {
        setUploadError(
          err instanceof Error
            ? err.message
            : "El archivo supera 4 MB y falló la subida directa. Intenta de nuevo.",
        );
        if (inputRef.current) inputRef.current.value = "";
      }
      setUploadedValue("");
      onUploadedChange?.({ busy: false, value: null });
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    void processFile(event.target.files?.[0]);
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file && inputRef.current && typeof DataTransfer !== "undefined") {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        inputRef.current.files = dt.files;
      } catch {
        // Fallback if browser blocks assigning files
      }
    }
    void processFile(file);
  }

  function handleClear() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setPreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setFileName("");
    setUploadedValue("");
    setUploadError("");
    onUploadedChange?.({ busy: false, value: null });
  }

  return (
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
      onDrop={handleDrop}
    >
      <span className="block text-sm font-medium text-[#123044]">{label}</span>

      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required={required && !uploadedValue}
        onChange={handleFileChange}
        className="sr-only"
      />
      {directBucket === "public-media" ? (
        <input type="hidden" name={`${name}_uploaded`} value={uploadedValue} />
      ) : (
        <input type="hidden" name={`${name}_uploaded_path`} value={uploadedValue} />
      )}

      {activePreviewUrl ? (
        <div className="overflow-hidden rounded-xl border border-[#c7dbe6] bg-[#f7fbfd]">
          <div className={`relative flex items-center justify-center bg-[#0f212c] ${compact ? "max-h-44" : "max-h-64"} overflow-hidden`}>
            <img
              src={activePreviewUrl}
              alt="Vista previa de imagen"
              className={`${compact ? "max-h-44" : "max-h-64"} w-auto object-contain`}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs">
            <span className="truncate font-semibold text-[#183b4e]">
              {fileName || "Imagen actual"}
              {uploading ? " · Subiendo..." : uploadedValue ? " · Lista" : ""}
            </span>
            <div className="flex items-center gap-2">
              <label
                htmlFor={inputId}
                className="cursor-pointer rounded-lg border border-[#b9d4e3] bg-white px-2.5 py-1 font-bold text-[#005a87] hover:bg-[#eaf4f8]"
              >
                Cambiar imagen
              </label>
              {fileName && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-lg border border-[#e3c6c2] bg-white px-2.5 py-1 font-bold text-[#8c1d18] hover:bg-[#fdf2f0]"
                >
                  Quitar
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed ${
            dragActive
              ? "border-[#006699] bg-[#e2f2fa] ring-2 ring-[#006699]/25"
              : "border-[#9ec3d6] bg-[#f5fafc] hover:border-[#006699] hover:bg-[#ebf5fa]"
          } ${compact ? "px-3.5 py-2.5" : "px-4 py-3.5"} transition`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e0f0f7] text-[#005a87]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <rect x="3" y="4" width="18" height="16" rx="2.5" />
                <circle cx="8.5" cy="9.5" r="1.6" />
                <path d="M21 15.5l-4.6-4.6a1.5 1.5 0 00-2.1 0L6 19.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#153a4d]">
                {dragActive ? "Suelta la imagen aquí" : "Arrastra o elige una imagen"}
              </p>
              <p className="truncate text-xs text-[#59707c]">JPG, PNG o WEBP · hasta 10 MB</p>
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-[#006699] px-3 py-1.5 text-xs font-extrabold text-white">
            Elegir archivo
          </span>
        </label>
      )}
      {uploadError && (
        <p role="alert" className="text-xs font-semibold text-[#8c1d18]">
          {uploadError}
        </p>
      )}
    </div>
  );
}
