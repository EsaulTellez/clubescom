"use client";

import { useEffect, useState } from "react";

export function ItemPhotoGallery({
  title,
  photos,
}: {
  title: string;
  photos: string[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const safeIndex = activeIndex < photos.length ? activeIndex : 0;
  const currentPhoto = photos[safeIndex];

  useEffect(() => {
    if (!lightboxOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxOpen(false);
      if (photos.length > 1 && e.key === "ArrowRight") {
        setActiveIndex((prev) => (prev + 1) % photos.length);
      }
      if (photos.length > 1 && e.key === "ArrowLeft") {
        setActiveIndex((prev) => (prev - 1 + photos.length) % photos.length);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen, photos.length]);

  if (photos.length === 0 || !currentPhoto) return null;

  return (
    <div className="space-y-2.5">
      <div className="group relative overflow-hidden rounded-sm border border-[#dcd9ce] bg-[#f2efe6]">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="relative block w-full cursor-zoom-in focus-visible:outline-offset-[-3px]"
          aria-label={`Ampliar imagen ${safeIndex + 1} de ${photos.length}`}
        >
          <img
            src={currentPhoto}
            alt={`${title}, imagen ${safeIndex + 1}`}
            className="mx-auto max-h-[26rem] w-full object-contain transition-transform duration-200 group-hover:scale-[1.01]"
          />
          <span className="pointer-events-none absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-sm border border-[#142c3c]/20 bg-[#fffdf7]/95 px-2.5 py-1 text-xs font-bold text-[#142c3c] shadow-sm">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5M11 8v6M8 11h6" strokeLinecap="round" />
            </svg>
            Ampliar
          </span>
        </button>

        {photos.length > 1 && (
          <span className="pointer-events-none absolute top-3 left-3 rounded-sm bg-[#142c3c]/85 px-2 py-0.5 font-mono text-[11px] font-bold text-[#fffdf7]">
            {safeIndex + 1} / {photos.length}
          </span>
        )}
      </div>

      {photos.length > 1 && (
        <div className="flex items-center gap-2.5">
          {photos.map((photo, idx) => {
            const selected = idx === safeIndex;
            return (
              <button
                key={photo}
                type="button"
                onClick={() => setActiveIndex(idx)}
                aria-label={`Ver imagen ${idx + 1}`}
                aria-pressed={selected}
                className={`relative h-16 w-20 overflow-hidden rounded-sm border-2 bg-[#f2efe6] transition ${
                  selected
                    ? "border-[#155775] ring-2 ring-[#155775]/20"
                    : "border-[#d0cec2] opacity-75 hover:opacity-100"
                }`}
              >
                <img
                  src={photo}
                  alt={`${title}, miniatura ${idx + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Imagen ampliada de ${title}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1f29]/85 p-4 backdrop-blur-[2px]"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative flex max-h-[90vh] max-w-5xl flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex w-full items-center justify-between gap-4 text-white">
              <p className="truncate text-sm font-bold">
                {title} {photos.length > 1 ? `(${safeIndex + 1}/${photos.length})` : ""}
              </p>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-white/25 bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/20"
              >
                Cerrar (Esc)
              </button>
            </div>
            <img
              src={currentPhoto}
              alt={`${title}, imagen ${safeIndex + 1}`}
              className="max-h-[80vh] w-auto max-w-full rounded-sm border border-white/15 bg-[#10222d] object-contain shadow-2xl"
            />
            {photos.length > 1 && (
              <div className="flex items-center gap-2">
                {photos.map((photo, idx) => (
                  <button
                    key={photo}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    className={`rounded-sm px-3 py-1.5 text-xs font-bold transition ${
                      idx === safeIndex
                        ? "bg-white text-[#142c3c]"
                        : "border border-white/25 bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    Foto {idx + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
