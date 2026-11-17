export const AREAS = [
  { id: "gestion_escolar", label: "Gestión Escolar" },
  { id: "becas", label: "Becas" },
  { id: "catt", label: "CATT" },
  { id: "clubes", label: "Clubes" },
  { id: "infraestructura", label: "Cubículos y Espacios" },
  { id: "general", label: "General" },
] as const;

export type AreaId = (typeof AREAS)[number]["id"];

export const REQUEST_KINDS = [
  { id: "pregunta", label: "Pregunta o duda" },
  { id: "actualizar_guia", label: "Actualizar trámite o guía" },
  { id: "nuevo_club", label: "Solicitar nuevo club" },
  { id: "cambio_info", label: "Cambio de información / cubículo" },
] as const;

export type RequestKind = (typeof REQUEST_KINDS)[number]["id"];

export const REQUEST_KIND_STYLES: Record<
  RequestKind,
  { badge: string; shortLabel: string }
> = {
  pregunta: {
    badge: "border-[#d8d5c9] bg-[#f5f3ea] text-[#3d525d]",
    shortLabel: "Pregunta",
  },
  actualizar_guia: {
    badge: "border-[#bcd6e3] bg-[#eaf4f8] text-[#004d73]",
    shortLabel: "Actualizar guía",
  },
  nuevo_club: {
    badge: "border-[#bde0d4] bg-[#ebf7f3] text-[#165745]",
    shortLabel: "Nuevo club",
  },
  cambio_info: {
    badge: "border-[#e6d39a] bg-[#fdf5df] text-[#6e5008]",
    shortLabel: "Cambio de info",
  },
};

export const AREA_STYLES: Record<
  AreaId,
  {
    accentHex: string;
    borderTop: string;
    borderLeft: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    pillActive: string;
    officeCode: string;
  }
> = {
  gestion_escolar: {
    accentHex: "#006699",
    borderTop: "border-t-[#006699]",
    borderLeft: "border-l-[#006699]",
    badgeBg: "bg-[#eaf4f8]",
    badgeText: "text-[#004d73]",
    badgeBorder: "border-[#bcd6e3]",
    pillActive: "border-[#004d73] bg-[#006699] text-white",
    officeCode: "G002",
  },
  becas: {
    accentHex: "#b88917",
    borderTop: "border-t-[#b88917]",
    borderLeft: "border-l-[#b88917]",
    badgeBg: "bg-[#fdf5df]",
    badgeText: "text-[#6e5008]",
    badgeBorder: "border-[#e6d39a]",
    pillActive: "border-[#8d6710] bg-[#b88917] text-white",
    officeCode: "G103",
  },
  catt: {
    accentHex: "#1b6b55",
    borderTop: "border-t-[#1b6b55]",
    borderLeft: "border-l-[#1b6b55]",
    badgeBg: "bg-[#ebf7f3]",
    badgeText: "text-[#165745]",
    badgeBorder: "border-[#bde0d4]",
    pillActive: "border-[#145240] bg-[#1b6b55] text-white",
    officeCode: "G103",
  },
  clubes: {
    accentHex: "#0b6a73",
    borderTop: "border-t-[#0b6a73]",
    borderLeft: "border-l-[#0b6a73]",
    badgeBg: "bg-[#e7f5f6]",
    badgeText: "text-[#0b565e]",
    badgeBorder: "border-[#b4dce0]",
    pillActive: "border-[#094e55] bg-[#0b6a73] text-white",
    officeCode: "G101",
  },
  infraestructura: {
    accentHex: "#745230",
    borderTop: "border-t-[#745230]",
    borderLeft: "border-l-[#745230]",
    badgeBg: "bg-[#f6f0e8]",
    badgeText: "text-[#5a3e22]",
    badgeBorder: "border-[#decbb6]",
    pillActive: "border-[#5a3e22] bg-[#745230] text-white",
    officeCode: "G001",
  },
  general: {
    accentHex: "#5b4832",
    borderTop: "border-t-[#6b5335]",
    borderLeft: "border-l-[#6b5335]",
    badgeBg: "bg-[#f5f1e8]",
    badgeText: "text-[#4e3b24]",
    badgeBorder: "border-[#d8ccb8]",
    pillActive: "border-[#4e3b24] bg-[#6b5335] text-white",
    officeCode: "G101",
  },
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isArea(value: string): value is AreaId {
  return AREAS.some((area) => area.id === value);
}

export function areaLabel(value: string) {
  return AREAS.find((area) => area.id === value)?.label ?? value;
}

export function isRequestKind(value: string): value is RequestKind {
  return REQUEST_KINDS.some((kind) => kind.id === value);
}

export function requestKindLabel(value: string) {
  return REQUEST_KIND_STYLES[value as RequestKind]?.shortLabel ?? "Pregunta";
}

export function requestKindStyle(value: string) {
  return REQUEST_KIND_STYLES[value as RequestKind] ?? REQUEST_KIND_STYLES.pregunta;
}

export function canModerateForumQuestion(
  user: { role: string; area?: string | null } | null | undefined,
  area: string,
  requestKind: string,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "moderador") return false;
  if (user.area === area) return true;
  if (
    (area === "clubes" || requestKind === "nuevo_club") &&
    ["subdireccion_academica", "clubes_academicos", "clubes_culturales"].includes(user.area ?? "")
  ) {
    return true;
  }
  if (
    (area === "infraestructura" || requestKind === "cambio_info") &&
    ["prefectura", "subdireccion_academica"].includes(user.area ?? "")
  ) {
    return true;
  }
  return false;
}

export function areaStyle(value: string) {
  return isArea(value) ? AREA_STYLES[value] : AREA_STYLES.general;
}

export function isUuid(value: string) {
  return UUID.test(value);
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}

export function formatShortDate(value: Date | string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}

export function voteLabel(count: number) {
  return count === 1 ? "1 voto" : `${count} votos`;
}

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
