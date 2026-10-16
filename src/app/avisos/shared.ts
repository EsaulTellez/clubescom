import type { SessionUser } from "@/lib/auth";

export const CATEGORIES = ["academico", "social", "tramites"] as const;

export type Category = (typeof CATEGORIES)[number];

export type FormState = { error?: string };

const LABELS: Record<Category, string> = {
  academico: "Académico",
  social: "Social",
  tramites: "Trámites",
};

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function categoryLabel(value: string) {
  return isCategory(value) ? LABELS[value] : value;
}

export function canManageAvisos(user: Pick<SessionUser, "role" | "area"> | null) {
  if (!user) return false;
  return user.role === "admin" || (user.role === "moderador" && user.area === "comunicacion");
}

export function socialTemplate(category: string, title: string, body: string) {
  return `ESCOM | ${category}: ${title.trim()}. ${body.trim().slice(0, 180)}`;
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
