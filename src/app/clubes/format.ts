export type ClubState = { error?: string };

export const KINDS = ["academico", "cultural", "deportivo"] as const;
export type ClubKind = (typeof KINDS)[number];

const KIND_LABEL: Record<string, string> = {
  academico: "Académico",
  cultural: "Cultural",
  deportivo: "Deportivo",
};

const STATUS_LABEL: Record<string, string> = {
  abierta: "Abierta",
  en_seguimiento: "En seguimiento",
  con_asesor: "Con asesor",
  registrado: "Registrado",
  pendiente: "Pendiente",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
};

export function kindLabel(kind: string) {
  return KIND_LABEL[kind] ?? kind;
}

export function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function interestLabel(count: number) {
  return count === 1 ? "1 interesado" : `${count} interesados`;
}
