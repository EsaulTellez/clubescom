import type { SessionUser } from "@/lib/auth";

export function canPublishAnySpaceEvents(
  user: Pick<SessionUser, "role" | "area"> | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "moderador") return false;
  return ["subdireccion_academica", "becas", "clubes_academicos", "clubes_culturales"].includes(
    user.area ?? "",
  );
}

export function canManageSpaceByName(
  user: Pick<SessionUser, "role" | "area"> | null | undefined,
  spaceName: string,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "moderador") return false;
  const clean = spaceName.trim().toLowerCase();
  if (clean === "sala 14") return user.area === "subdireccion_academica";
  if (clean === "auditorio") return user.area === "becas";
  return user.area === "clubes_academicos" || user.area === "clubes_culturales";
}

export function officeEventSpace(user: Pick<SessionUser, "role" | "area"> | null) {
  if (user?.role !== "moderador") return null;
  if (user.area === "becas") return "Auditorio";
  if (user.area === "subdireccion_academica") return "Sala 14";
  return null;
}

export function clubEventVenueArea(location: string) {
  const venue = location.split("·", 1)[0].trim().toLowerCase();
  if (venue === "auditorio") return "becas";
  if (venue === "sala 14") return "subdireccion_academica";
  return null;
}
