"use client";

import { useState } from "react";

export function CopyTextButton({
  text,
  label = "Copiar",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={
        className ||
        "rounded-md border border-[#c7d6de] bg-white px-2.5 py-1 text-[11px] font-bold text-[#004d73] transition hover:border-[#006699] hover:bg-[#eaf4f8]"
      }
    >
      {copied ? "✓ Copiado" : label}
    </button>
  );
}
