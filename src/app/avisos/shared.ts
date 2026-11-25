import type { SessionUser } from "@/lib/auth";

export const CATEGORIES = ["academico", "social", "tramites"] as const;

export type Category = (typeof CATEGORIES)[number];

export const SOURCE_AREAS = [
  "general",
  "direccion",
  "subdireccion_academica",
  "sseis",
  "subdireccion_administrativa",
  "sepi",
  "celex",
  "ctce",
] as const;

export type SourceArea = (typeof SOURCE_AREAS)[number];

export type FormState = { error?: string; ok?: boolean; id?: string };

const LABELS: Record<Category, string> = {
  academico: "Académico",
  social: "Social",
  tramites: "Trámites",
};

const SOURCE_AREA_LABELS: Record<SourceArea, string> = {
  general: "Comunidad ESCOM",
  direccion: "Dirección",
  subdireccion_academica: "Subdirección Académica",
  sseis: "Subdirección de Servicios Educativos e Integración Social",
  subdireccion_administrativa: "Subdirección Administrativa",
  sepi: "Sección de Estudios de Posgrado e Investigación",
  celex: "CELEX",
  ctce: "CTCE",
};

const SOURCE_AREA_SHORT_LABELS: Record<SourceArea, string> = {
  general: "Comunidad ESCOM",
  direccion: "Dirección",
  subdireccion_academica: "Subdirección Académica",
  sseis: "SSEIS · Servicios Educativos",
  subdireccion_administrativa: "Subdirección Administrativa",
  sepi: "SEPI · Posgrado",
  celex: "CELEX",
  ctce: "CTCE",
};

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function categoryLabel(value: string) {
  return isCategory(value) ? LABELS[value] : value;
}

export function isSourceArea(value: string): value is SourceArea {
  return (SOURCE_AREAS as readonly string[]).includes(value);
}

export function sourceAreaLabel(value?: string | null) {
  if (!value) return SOURCE_AREA_LABELS.general;
  return isSourceArea(value) ? SOURCE_AREA_LABELS[value] : value;
}

export function sourceAreaShortLabel(value?: string | null) {
  if (!value) return SOURCE_AREA_SHORT_LABELS.general;
  return isSourceArea(value) ? SOURCE_AREA_SHORT_LABELS[value] : value;
}

export function canManageAvisos(user: Pick<SessionUser, "role" | "area"> | null) {
  if (!user) return false;
  return user.role === "admin" || (user.role === "moderador" && user.area === "comunicacion");
}

export function parseExternalUrl(raw: string): { url: string | null } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { url: null };
  if (trimmed.length > 500) {
    return { error: "El enlace externo no puede exceder los 500 caracteres." };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { error: "El enlace externo debe iniciar con http:// o https://." };
    }
    return { url: parsed.toString() };
  } catch {
    return { error: "Escribe una URL válida (por ejemplo https://www.escom.ipn.mx/...)." };
  }
}

export function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function socialTemplate(category: string, title: string, body: string) {
  return `ESCOM | ${category}: ${title.trim()}. ${body.trim().slice(0, 180)}`;
}

export function formatAvisoDeadline(value: string) {
  return "Hasta el " + new Intl.DateTimeFormat("es-MX", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(value + "T00:00:00Z"));
}

export function formatWhen(value: Date | string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}

export function toDatetimeLocal(value: Date | string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function nextAvisoMidnight() {
  const today = toDatetimeLocal(new Date()).slice(0, 10);
  return Date.parse(today + "T24:00:00-06:00");
}

export function parsePublishAt(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00-06:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function likePattern(value: string) {
  const escaped = value.replace(/[!%_]/g, (char) => `!${char}`);
  return `%${escaped}%`;
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
