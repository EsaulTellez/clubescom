export const AREAS = [
  { id: "gestion_escolar", label: "Gestión escolar" },
  { id: "becas", label: "Becas" },
  { id: "catt", label: "CATT" },
  { id: "clubes", label: "Clubes" },
  { id: "infraestructura", label: "Cubículos y Espacios" },
  { id: "general", label: "General" },
] as const;

export type AreaId = (typeof AREAS)[number]["id"];

export function isArea(value: string): value is AreaId {
  return AREAS.some((area) => area.id === value);
}

export function areaLabel(value: string) {
  return AREAS.find((area) => area.id === value)?.label ?? value;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeZone: "America/Mexico_City",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function isStaff(role: string) {
  return role === "moderador" || role === "admin";
}

export function editableGuideAreas(
  user: { role?: string | null; area?: string | null } | null,
): readonly (typeof AREAS)[number][] {
  if (!user || !isStaff(user.role ?? "")) return [];
  if (user.role === "admin") return AREAS;
  const area = user.area ?? "";
  if (area === "gestion_escolar" || area === "becas" || area === "catt") {
    return AREAS.filter((item) => item.id === area);
  }
  if (area === "clubes_academicos" || area === "clubes_culturales" || area === "sseis" || area === "subdireccion_academica") {
    return AREAS.filter((item) => item.id === "clubes");
  }
  if (area === "prefectura") {
    return AREAS.filter((item) => item.id === "infraestructura");
  }
  if (area === "comunicacion") {
    return AREAS.filter((item) => item.id === "general");
  }
  return [];
}

export function canEditGuideArea(
  user: { role?: string | null; area?: string | null } | null,
  guideArea: string,
): boolean {
  return editableGuideAreas(user).some((item) => item.id === guideArea);
}

export type GuideChoice = { label: string; to: number };
export type GuideStep = {
  id: number;
  title: string;
  body: string;
  choices?: GuideChoice[];
  imageUrl?: string;
};

export const MAX_SOURCE_MB = 15;
export const SOURCE_ACCEPT = ".pdf,.docx,.txt,.md,image/jpeg,image/png,image/webp";

export function routesFrom(steps: GuideStep[], index: number): GuideChoice[] {
  const step = steps[index];
  if (step.choices) return step.choices;
  return steps[index + 1] ? [{ label: "Siguiente paso", to: steps[index + 1].id }] : [];
}

export function pathToStep(steps: GuideStep[], target?: number) {
  const byId = new Map(steps.map((step, index) => [step.id, index]));
  const start = steps[0]?.id;
  if (!start) return [];
  if (target === undefined || target === start || !byId.has(target)) return [start];
  const queue = [[start]];
  const seen = new Set([start]);
  while (queue.length) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    for (const next of routesFrom(steps, byId.get(current)!)) {
      if (next.to === target) return [...path, target];
      if (byId.has(next.to) && !seen.has(next.to)) {
        seen.add(next.to);
        queue.push([...path, next.to]);
      }
    }
  }
  return [start];
}

function normalizeStepImageUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const val = raw.trim();
  if (!val) return undefined;
  if (val.startsWith("/") && !val.startsWith("//")) return val;
  try {
    const u = new URL(val);
    if (u.protocol === "http:" || u.protocol === "https:") return val;
  } catch {
    // invalid url
  }
  return undefined;
}

export function validateSteps(value: unknown): { steps: GuideStep[] } | { error: string } {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      return { error: "El formato de los pasos no es válido." };
    }
  }
  if (!Array.isArray(list) || !list.length || list.length > 30) {
    return { error: "La guía debe incluir entre 1 y 30 pasos." };
  }
  const steps: GuideStep[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i] as Record<string, unknown>;
    const title = String(row?.title ?? "").trim();
    const body = String(row?.body ?? "").trim();
    if (title.length < 2 || title.length > 160 || body.length < 4 || body.length > 2000) {
      return { error: `Revisa el título (2–160) y texto (4–2000) del paso ${i + 1}.` };
    }
    const id = Number.isInteger(row?.id) && Number(row.id) > 0 ? Number(row.id) : i + 1;
    let choices: GuideChoice[] | undefined;
    if (row?.choices !== undefined) {
      if (!Array.isArray(row.choices)) return { error: "Las opciones del paso deben ser una lista." };
      choices = row.choices.map((item) => ({
        label: String((item as Record<string, unknown>)?.label ?? "").trim(),
        to: Number((item as Record<string, unknown>)?.to),
      }));
      if (choices.some((choice) => choice.label.length < 2 || choice.label.length > 140 || !Number.isInteger(choice.to))) {
        return { error: `Revisa las opciones del paso ${i + 1}.` };
      }
    }
    const imageUrl = normalizeStepImageUrl(row?.imageUrl);
    const step: GuideStep = { id, title, body };
    if (choices) step.choices = choices;
    if (imageUrl) step.imageUrl = imageUrl;
    steps.push(step);
  }
  const ids = new Set(steps.map((step) => step.id));
  if (ids.size !== steps.length) return { error: "Cada paso debe tener un identificador distinto." };
  if (steps.some((step, i) => routesFrom(steps, i).some((choice) => !ids.has(choice.to)))) {
    return { error: "Un botón de decisión apunta a un paso que no existe." };
  }
  const byId = new Map(steps.map((step, i) => [step.id, i]));
  const state = new Map<number, 1 | 2>();
  const dfs = (id: number): boolean => {
    state.set(id, 1);
    for (const choice of routesFrom(steps, byId.get(id)!)) {
      const next = state.get(choice.to);
      if (next === 1 || (!next && dfs(choice.to))) return true;
    }
    state.set(id, 2);
    return false;
  };
  if (dfs(steps[0].id)) return { error: "La ruta vuelve sobre sí misma y no tiene fin." };
  if (state.size !== steps.length) return { error: "Hay pasos sin conexión desde el inicio de la guía." };
  return { steps };
}

export type GuideFaq = { q: string; a: string };

export function serializeFaqs(faqs: GuideFaq[]): string {
  return faqs
    .map((f) => ({ q: f.q.replace(/[|\n\r]+/g, " ").trim(), a: f.a.replace(/[\n\r]+/g, " ").trim() }))
    .filter((f) => f.q.length >= 4 && f.a.length >= 2)
    .map((f) => `${f.q} | ${f.a}`)
    .join("\n");
}

export function asSteps(value: unknown): GuideStep[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const rawItems = parsed.filter(
    (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
  );
  const usedIds = new Set<number>();

  return rawItems.map((item, idx) => {
    const rawId = Number(item.id);
    let id = Number.isInteger(rawId) && rawId > 0 && !usedIds.has(rawId) ? rawId : idx + 1;
    while (usedIds.has(id)) {
      id += 1;
    }
    usedIds.add(id);

    const title = typeof item.title === "string" ? item.title : "";
    const body = typeof item.body === "string" ? item.body : "";
    const step: GuideStep = { id, title, body };

    if (Array.isArray(item.choices)) {
      step.choices = item.choices
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
        .map((c) => ({
          label: typeof c.label === "string" ? c.label : "",
          to: Number(c.to),
        }))
        .filter((c) => Number.isInteger(c.to) && c.to > 0);
    }

    const imageUrl = normalizeStepImageUrl(item.imageUrl);
    if (imageUrl) step.imageUrl = imageUrl;

    return step;
  });
}

export function asFaqs(value: unknown): GuideFaq[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (item): item is GuideFaq =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as GuideFaq).q === "string" &&
      typeof (item as GuideFaq).a === "string",
  );
}

export function statusLabel(status: string) {
  if (status === "aceptada") return "Aplicada en la guía";
  if (status === "rechazada") return "Descartada";
  return "Pendiente de revisión";
}
