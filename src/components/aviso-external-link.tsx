"use client";

import { useEffect } from "react";
import { linkDomain } from "@/app/avisos/shared";

export async function trackAvisoInteraction(
  avisoId: string,
  kind: "view" | "click",
): Promise<{ viewsCount: number | null; linkClicksCount: number | null } | null> {
  try {
    const res = await fetch("/api/avisos/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avisoId, kind }),
      keepalive: true,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      viewsCount?: number | null;
      linkClicksCount?: number | null;
    };
    if (!data.ok) return null;
    return {
      viewsCount: data.viewsCount ?? null,
      linkClicksCount: data.linkClicksCount ?? null,
    };
  } catch {
    // No interrumpir la navegación si falla el registro analítico.
    return null;
  }
}

export function AvisoExternalLink({
  avisoId,
  url,
  label = "Más información",
  compact = false,
  onClickTracked,
}: {
  avisoId: string;
  url: string;
  label?: string;
  compact?: boolean;
  onClickTracked?: (counts?: { viewsCount: number | null; linkClicksCount: number | null } | null) => void;
}) {
  const domain = linkDomain(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.stopPropagation();
        void trackAvisoInteraction(avisoId, "click").then((counts) => {
          onClickTracked?.(counts);
        });
      }}
      className={
        compact
          ? "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#b9d4e3] bg-[#eaf4f8] px-2.5 py-1 text-xs font-extrabold text-[#004d73] transition hover:border-[#006699] hover:bg-[#d8ebf3]"
          : "inline-flex items-center gap-2 rounded-xl border border-[#004d73] bg-[#006699] px-4 py-2 text-xs font-extrabold text-white shadow-xs transition hover:bg-[#004d73]"
      }
    >
      <svg
        viewBox="0 0 20 20"
        className="h-3.5 w-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M11 4h5v5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 4 8.5 11.5" strokeLinecap="round" />
        <path d="M14 11.5V15a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 3 15V7.5A1.5 1.5 0 0 1 4.5 6H8" strokeLinecap="round" />
      </svg>
      <span className="truncate">{label}</span>
      {!compact && domain && (
        <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white/90">
          {domain}
        </span>
      )}
    </a>
  );
}

export function AvisoViewTracker({ avisoId }: { avisoId: string }) {
  useEffect(() => {
    trackAvisoInteraction(avisoId, "view");
  }, [avisoId]);

  return null;
}
