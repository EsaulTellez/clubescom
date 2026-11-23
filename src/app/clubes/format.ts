import type { SessionUser } from "@/lib/auth";

export type ClubState = { error?: string; success?: string };

export const KINDS = ["academico", "cultural", "deportivo"] as const;
export type ClubKind = (typeof KINDS)[number];

const KIND_LABEL: Record<string, string> = {
  academico: "Académico",
  cultural: "Cultural",
  deportivo: "Deportivo",
};

const STATUS_LABEL: Record<string, string> = {
  abierta: "En votación",
  en_documentacion: "Documentación y coordinador",
  en_validacion: "Expediente listo",
  cita_pendiente: "Solicitud formal · Cita pendiente",
  cita_confirmada: "Cita confirmada",
  incompleta: "Requiere corrección",
  en_seguimiento: "En seguimiento",
  con_asesor: "Con coordinador",
  registrado: "Club registrado",
  pendiente: "Pendiente",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
};

export function kindLabel(kind: string) {
  return KIND_LABEL[kind] ?? kind;
}

export function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function interestLabel(count: number) {
  return count === 1 ? "1 interesado" : `${count} interesados`;
}

type ClubActor = Pick<SessionUser, "role" | "area"> & {
  delegatedClubKinds?: ("cultural" | "deportivo")[];
};

export function isSseisTitular(user: ClubActor | null | undefined): boolean {
  if (!user) return false;
  return user.role === "admin" || (user.role === "moderador" && user.area === "sseis");
}

export function isSseisDelegated(user: ClubActor | null | undefined): boolean {
  return Boolean(user?.delegatedClubKinds && user.delegatedClubKinds.length > 0);
}

export function canModerateClubKind(
  user: ClubActor | null | undefined,
  kind: string,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (kind === "academico") {
    return (
      user.role === "moderador" &&
      (user.area === "subdireccion_academica" || user.area === "clubes_academicos")
    );
  }
  if (kind === "cultural" || kind === "deportivo") {
    return (
      (user.role === "moderador" && (user.area === "sseis" || user.area === "clubes_culturales")) ||
      Boolean(user.delegatedClubKinds?.includes(kind))
    );
  }
  return false;
}

export function canManageAnyClubs(
  user: ClubActor | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (isSseisDelegated(user)) return true;
  if (user.role !== "moderador") return false;
  return ["subdireccion_academica", "clubes_academicos", "clubes_culturales", "sseis"].includes(
    user.area ?? "",
  );
}

export function allowedClubKinds(
  user: ClubActor | null | undefined,
): ClubKind[] {
  if (!user) return [];
  if (user.role === "admin") return [...KINDS];
  const out = new Set<ClubKind>();
  if (user.role === "moderador") {
    if (user.area === "subdireccion_academica" || user.area === "clubes_academicos") {
      out.add("academico");
    }
    if (user.area === "sseis" || user.area === "clubes_culturales") {
      out.add("cultural");
      out.add("deportivo");
    }
  }
  for (const kind of user.delegatedClubKinds ?? []) {
    out.add(kind);
  }
  return Array.from(out);
}

export function clubOfficeLabel(kind: string): string {
  return kind === "academico"
    ? "Subdirección Académica"
    : "SSEIS · Clubes Culturales y Deportivos";
}

export function clubAreaBadgeLabel(user: ClubActor | null | undefined, kind: string): string | null {
  if (!user || !canModerateClubKind(user, kind)) return null;
  if (user.role === "admin") return "Administración";
  if (kind === "academico") return "Subdirección Académica";
  if (user.area === "sseis") return "SSEIS";
  if (isSseisDelegated(user)) return "Coordinación SSEIS (Designada)";
  return "Clubes Culturales y Deportivos";
}
