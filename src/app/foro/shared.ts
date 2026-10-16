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

export function voteLabel(count: number) {
  return count === 1 ? "1 voto" : `${count} votos`;
}

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
