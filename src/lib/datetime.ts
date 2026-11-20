const MX_TZ = "America/Mexico_City";

/**
 * Parses a datetime-local string or ISO timestamp, interpreting offset-less
 * wall-clock strings as Mexico City time (UTC-06:00).
 */
export function parseMxLocalDate(raw: string | null | undefined): Date | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)
    ? `${s}-06:00`
    : s;
  const d = new Date(normalized);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function formatMxDateTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: MX_TZ,
    ...options,
  }).format(d);
}

export function toMxLocalInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MX_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}
