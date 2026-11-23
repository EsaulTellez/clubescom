import { createHash, timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import { pool } from "./db";
import { createSupabaseServerClient } from "./supabase/server";

export type Role = "alumno" | "profesor" | "moderador" | "admin";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  boleta: string | null;
  role: Role;
  isSuperadmin: boolean;
  canSwitchProfile: boolean;
  area: string | null;
  delegatedClubKinds: ("cultural" | "deportivo")[];
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

  const [
    { data: profile, error: profileError },
    { data: privateRows, error: privateError },
    { data: statusRows, error: statusError },
    { data: suspensions, error: suspensionError },
    delegatedRes,
  ] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, role, area, is_superadmin, can_switch_profile")
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
    Promise.resolve(supabase.rpc("get_my_delegated_club_kinds")).catch(() => ({ data: null, error: null })),
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
  const rawDelegated = !delegatedRes.error && Array.isArray(delegatedRes.data) ? delegatedRes.data : [];
  const delegatedClubKinds = rawDelegated.filter(
    (k): k is "cultural" | "deportivo" => k === "cultural" || k === "deportivo",
  );
  return {
    id: profile.id,
    email: authUser.email.toLowerCase(),
    name: profile.name,
    boleta: privateRows?.[0]?.boleta ?? null,
    role: profile.role,
    canSwitchProfile: profile.can_switch_profile === true,
    isSuperadmin: profile.is_superadmin === true,
    area: profile.area,
    delegatedClubKinds,
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
  extra?: { oldValue?: string | null; newValue?: string | null },
) {
  let ipAddress = "127.0.0.1";
  try {
    const hdrs = await headers();
    ipAddress =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      hdrs.get("x-real-ip")?.trim() ||
      "127.0.0.1";
  } catch {
    ipAddress = "127.0.0.1";
  }

  let oldVal = extra?.oldValue ?? null;
  let newVal = extra?.newValue ?? null;
  if (!oldVal && !newVal && detail && detail.includes("→")) {
    const [left, right] = detail.split("→").map((s) => s.trim());
    oldVal = left || null;
    newVal = right || null;
  }

  await pool.query(
    `insert into audit_logs (actor_id, action, entity, entity_id, detail, old_value, new_value, ip_address)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [actorId, action, entity, entityId ?? null, detail ?? null, oldVal, newVal, ipAddress],
  );
}
