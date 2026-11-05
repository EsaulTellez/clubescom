import { createHash, timingSafeEqual } from "crypto";
import { pool } from "./db";
import { createSupabaseServerClient } from "./supabase/server";

export type Role = "alumno" | "profesor" | "moderador" | "admin";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  boleta: string | null;
  role: Role;
  area: string | null;
};

export function roleFromEmail(email: string): "alumno" | "profesor" | null {
  const value = email.trim().toLowerCase();
  if (value.endsWith("@alumno.ipn.mx")) return "alumno";
  if (value.endsWith("@ipn.mx")) return "profesor";
  return null;
}

export function hashAnswer(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function answersMatch(plain: string, hashed: string) {
  const next = Buffer.from(hashAnswer(plain));
  const previous = Buffer.from(hashed);
  return next.length === previous.length && timingSafeEqual(next, previous);
}

export async function getSession(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") return null;

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUser = authData.user;
  if (authError || !authUser || authUser.id !== userId || !authUser.email) return null;

  const [{ data: profile, error: profileError }, { data: privateRows, error: privateError }, { data: statusRows, error: statusError }, { data: suspensions, error: suspensionError }] =
    await Promise.all([
      supabase
        .from("users")
        .select("id, name, role, area")
        .eq("id", userId)
        .maybeSingle(),
      supabase.rpc("get_my_private_data"),
      supabase.rpc("get_my_account_status"),
      supabase
        .from("moderation_suspensions")
        .select("ends_at, is_permanent")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const account = statusRows?.[0];
  if (profileError || privateError || statusError || suspensionError || !account?.is_active || account.banned || !profile) return null;
  const suspended = (suspensions ?? []).some(
    (suspension) =>
      suspension.is_permanent ||
      (suspension.ends_at !== null && Date.parse(suspension.ends_at) > Date.now()),
  );
  if (suspended) return null;

  if (!isRole(profile.role)) return null;
  return {
    id: profile.id,
    email: authUser.email.toLowerCase(),
    name: profile.name,
    boleta: privateRows?.[0]?.boleta ?? null,
    role: profile.role,
    area: profile.area,
  };
}

export function isRole(value: unknown): value is Role {
  return value === "alumno" || value === "profesor" || value === "moderador" || value === "admin";
}

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId?: string,
  detail?: string,
) {
  await pool.query(
    `insert into audit_logs (actor_id, action, entity, entity_id, detail)
     values ($1, $2, $3, $4, $5)`,
    [actorId, action, entity, entityId ?? null, detail ?? null],
  );
}
