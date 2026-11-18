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

export type GuideChoice = { label: string; to: number };
export type GuideStep = { id: number; title: string; body: string; choices?: GuideChoice[] };
export const MAX_SOURCE_MB = 4;
export const SOURCE_ACCEPT = ".pdf,.docx,.txt,.md,image/jpeg,image/png,image/webp";

export function routesFrom(steps: GuideStep[], index: number): GuideChoice[] {
  const next = steps[index + 1];
  return steps[index].choices ?? (next ? [{ label: "Continuar", to: next.id }] : []);
}

export function pathToStep(steps: GuideStep[], target?: number) {
  if (!steps.length) return [];
  const paths = [[steps[0].id]];
  const visited = new Set<number>();
  for (const path of paths) {
    const id = path[path.length - 1];
    if (id === target) return path;
    if (visited.has(id)) continue;
    visited.add(id);
    const index = steps.findIndex(step => step.id === id);
    if (index >= 0) for (const choice of routesFrom(steps, index)) paths.push([...path, choice.to]);
  }
  return [steps[0].id];
}

export function validateSteps(value: unknown): { steps: GuideStep[] } | { error: string } {
  const data = parseJson(value);
  if (!Array.isArray(data) || !data.length || data.length > 30) return { error: "Incluye entre 1 y 30 pasos." };
  const ids = new Set<number>();
  const steps: GuideStep[] = [];
  for (const item of data) {
    const row = asRecord(item);
    const id = row?.id;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0 || id >= 2147483647 || ids.has(id)) return { error: "Cada paso necesita un identificador único." };
    ids.add(id);
    if (typeof row?.title !== "string" || !row.title.trim() || row.title.length > 160 || typeof row.body !== "string" || !row.body.trim() || row.body.length > 2000) return { error: "Completa el título (hasta 160 caracteres) y las indicaciones (hasta 2000) de cada paso." };
    const step: GuideStep = { id, title: row.title.trim(), body: row.body.trim() };
    if (row.choices !== undefined) {
      if (!Array.isArray(row.choices) || row.choices.length > 30) return { error: "Revisa las salidas del paso." };
      step.choices = [];
      for (const choice of row.choices) {
        if (typeof choice?.label !== "string" || !choice.label.trim() || choice.label.length > 140 || typeof choice.to !== "number") return { error: "Cada opción necesita una condición y un paso de destino." };
        step.choices.push({ label: choice.label.trim(), to: choice.to });
      }
    }
    steps.push(step);
  }
  const reached = new Set<number>();
  const visiting = new Set<number>();
  function walk(id: number): boolean {
    if (visiting.has(id) || !ids.has(id)) return false;
    if (reached.has(id)) return true;
    const index = steps.findIndex(step => step.id === id);
    visiting.add(id);
    if (!routesFrom(steps, index).every(choice => walk(choice.to))) return false;
    visiting.delete(id);
    reached.add(id);
    return true;
  }
  if (!walk(steps[0].id)) return { error: "Revisa las rutas. Hay un destino inexistente o un recorrido que regresa a un paso anterior y forma un ciclo." };
  if (reached.size !== steps.length) return { error: "Hay pasos sin conexión. Enlázalos desde la ruta que empieza en el primer paso." };
  return { steps };
}
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
  return data.map((item, index) => {
    const row = asRecord(item);
    return {
      id: typeof row?.id === "number" ? row.id : index,
      ...(Array.isArray(row?.choices) && { choices: row.choices }),
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
