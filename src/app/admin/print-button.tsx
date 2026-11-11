"use client";
import { btnGhost } from "@/lib/ui";
export function PrintButton() {
  return <button type="button" className={btnGhost} onClick={() => window.print()}>Imprimir o guardar PDF</button>;
}
