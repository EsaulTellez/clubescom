export const MODERATION_AREAS = [
  { id: "comunicacion", label: "Comunicación" },
  { id: "gestion_escolar", label: "Gestión escolar" },
  { id: "clubes_academicos", label: "Clubes académicos" },
  { id: "clubes_culturales", label: "Clubes culturales" },
  { id: "becas", label: "Becas" },
  { id: "catt", label: "CATT" },
  { id: "prefectura", label: "Prefectura" },
  { id: "subdireccion_academica", label: "Subdirección Académica" },
  { id: "general", label: "General" },
] as const;

export function moderationAreaLabel(value: string) {
  return MODERATION_AREAS.find((area) => area.id === value)?.label ?? value;
}

export function suspensionLabel(suspension: {
  is_permanent: boolean;
  starts_at: Date | string;
  ends_at: Date | string | null;
}) {
  if (suspension.is_permanent) return "Permanente";
  if (suspension.ends_at && new Date(suspension.ends_at).getTime() <= Date.now()) return "Concluida";
  return `Hasta ${new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" }).format(new Date(suspension.ends_at ?? suspension.starts_at))}`;
}
