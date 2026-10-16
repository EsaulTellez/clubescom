export const AREAS = [
  { id: "gestion_escolar", label: "Gestión escolar" },
  { id: "becas", label: "Becas" },
  { id: "catt", label: "CATT" },
  { id: "general", label: "General" },
] as const;

export type AreaId = (typeof AREAS)[number]["id"];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isArea(value: string): value is AreaId {
  return AREAS.some((area) => area.id === value);
}

export function areaLabel(value: string) {
  return AREAS.find((area) => area.id === value)?.label ?? value;
}

export function isUuid(value: string) {
  return UUID.test(value);
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function isStaff(role: string) {
  return role === "moderador" || role === "admin";
}

export type GuideStep = { title: string; body: string };
export type GuideFaq = { q: string; a: string };

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseJson(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function asSteps(value: unknown): GuideStep[] {
  const data = parseJson(value);
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    const row = asRecord(item);
    return {
      title: typeof row?.title === "string" ? row.title : "Paso",
      body: typeof row?.body === "string" ? row.body : "",
    };
  });
}

export function asFaqs(value: unknown): GuideFaq[] {
  const data = parseJson(value);
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    const row = asRecord(item);
    if (typeof row?.q !== "string" || typeof row.a !== "string") return [];
    return [{ q: row.q, a: row.a }];
  });
}

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
};

export function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}
