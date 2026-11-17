export const STAFF_AREAS = [
  "gestion_escolar",
  "becas",
  "catt",
  "comunicacion",
  "clubes_academicos",
  "clubes_culturales",
  "prefectura",
  "subdireccion_academica",
] as const;

export type StaffArea = (typeof STAFF_AREAS)[number];

export const STAFF_AREA_LABELS: Record<StaffArea, string> = {
  gestion_escolar: "Gestión Escolar",
  becas: "Becas",
  catt: "CATT (Trabajo Terminal)",
  comunicacion: "Comunicación Social",
  clubes_academicos: "Clubes Académicos",
  clubes_culturales: "Clubes Culturales y Deportivos",
  prefectura: "Prefectura",
  subdireccion_academica: "Subdirección Académica (Sala 14)",
};

export function isStaffArea(value: string): value is StaffArea {
  return (STAFF_AREAS as readonly string[]).includes(value);
}

export function staffAreaLabel(value: string | null | undefined): string {
  if (!value) return "Sin área";
  return isStaffArea(value) ? STAFF_AREA_LABELS[value] : value;
}
