"use client";

import { useEffect, useRef } from "react";

export function CatalogSearch({ value, onChange, label, shortcutEnabled = true }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  shortcutEnabled?: boolean;
}) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!shortcutEnabled) return;
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        field.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [shortcutEnabled]);

  return (
    <div className="catalog-search">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="8.7" cy="8.7" r="5.5" /><path d="m13 13 4 4" strokeLinecap="round" />
      </svg>
      <input ref={field} type="search" aria-label={label} placeholder={label} value={value}
        onChange={(event) => onChange(event.target.value)} />
      {value ? (
        <button type="button" aria-label="Limpiar búsqueda" onClick={() => { onChange(""); field.current?.focus(); }}>×</button>
      ) : (
        <kbd aria-hidden="true" title="Control o Comando + K">⌘ / Ctrl K</kbd>
      )}
    </div>
  );
}
