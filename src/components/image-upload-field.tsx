"use client";

import { useEffect, useId, useRef, useState } from "react";

export function ImageUploadField({
  name = "image",
  label = "Imagen (JPG, PNG o WEBP · máx. 10 MB)",
  initialImageUrl = null,
  required = false,
  compact = false,
}: {
  name?: string;
  label?: string;
  initialImageUrl?: string | null;
  required?: boolean;
  compact?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const activePreviewUrl = previewUrl ?? initialImageUrl;

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPreviewUrl(null);
      setFileName("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return objectUrl;
    });
    setFileName(file.name);
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
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-[#123044]">{label}</span>

      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required={required}
        onChange={handleFileChange}
        className="sr-only"
      />

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
          className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-[#9ec3d6] bg-[#f5fafc] ${compact ? "px-3.5 py-2.5" : "px-4 py-3.5"} transition hover:border-[#006699] hover:bg-[#ebf5fa]`}
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
              <p className="truncate text-sm font-bold text-[#153a4d]">Subir imagen desde tu dispositivo</p>
              <p className="truncate text-xs text-[#59707c]">JPG, PNG o WEBP · hasta 10 MB</p>
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-[#006699] px-3 py-1.5 text-xs font-extrabold text-white">
            Elegir archivo
          </span>
        </label>
      )}
    </div>
  );
}
