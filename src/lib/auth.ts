import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { pool } from "./db";

export type Role = "alumno" | "profesor" | "moderador" | "admin";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  boleta: string | null;
  role: Role;
  area: string | null;
};

const COOKIE = "escom_session";
const EIGHT_HOURS = 60 * 60 * 8;

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
  const prev = Buffer.from(hashed);
  return next.length === prev.length && timingSafeEqual(next, prev);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + EIGHT_HOURS * 1000);
  await pool.query(
    "insert into sessions (token, user_id, expires_at) values ($1, $2, $3)",
    [token, userId, expires],
  );
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await pool.query("delete from sessions where token = $1", [token]);
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const { rows } = await pool.query<SessionUser>(
    `select u.id, u.email, u.name, u.boleta, u.role, u.area
     from sessions s
     join users u on u.id = s.user_id
     where s.token = $1 and s.expires_at > now() and u.banned = false`,
    [token],
  );
  return rows[0] ?? null;
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
