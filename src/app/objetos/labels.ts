export const kindLabel = {
  perdido: "Perdido",
  encontrado: "Encontrado",
} as const;

export const statusLabel = {
  abierto: "Abierto",
  entregado: "Entregado",
  cerrado: "Cerrado",
} as const;

export type ItemKind = keyof typeof kindLabel;
export type ItemStatus = keyof typeof statusLabel;

export type FormState = {
  error?: string;
  code?: string;
};

export function isKind(value: string): value is ItemKind {
  return value === "perdido" || value === "encontrado";
}
