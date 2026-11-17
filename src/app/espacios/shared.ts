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
  if (user.area === "subdireccion_academica") return clean === "sala 14";
  if (user.area === "becas") return clean === "auditorio";
  return user.area === "clubes_academicos" || user.area === "clubes_culturales";
}
