"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { pool } from "./db";
import {
  audit,
  createSession,
  destroySession,
  getSession,
  roleFromEmail,
} from "./auth";

export type AuthState = { error?: string; devCode?: string; ok?: string };

function otp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function register(
  _prev: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const boleta = String(form.get("boleta") ?? "").trim();
  const consent = form.get("consent") === "on";
  const role = roleFromEmail(email);

  if (!consent) return { error: "Acepta el aviso de privacidad para continuar." };
  if (!role) return { error: "Solo correos @alumno.ipn.mx o @ipn.mx." };
  if (name.length < 3) return { error: "Escribe tu nombre completo." };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const existing = await pool.query("select id from users where email = $1", [email]);
  if (existing.rowCount) return { error: "Ese correo ya está registrado." };

  const code = otp();
  const hash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into users (email, password_hash, name, boleta, role, email_verified)
       values ($1, $2, $3, $4, $5, false)`,
      [email, hash, name, boleta || null, role],
    );
    await client.query(
      `insert into otps (email, code, purpose, expires_at)
       values ($1, $2, 'registro', now() + interval '15 minutes')`,
      [email, code],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return {
    ok: "Cuenta creada. En local el código se muestra aquí porque no hay servidor de correo.",
    devCode: code,
  };
}

export async function verifyEmail(
  _prev: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const code = String(form.get("code") ?? "").trim();
  const { rows } = await pool.query<{ id: string }>(
    `update otps set consumed = true
     where id = (
       select id from otps
       where email = $1 and code = $2 and purpose = 'registro'
         and consumed = false and expires_at > now()
       order by expires_at desc limit 1
     )
     returning id`,
    [email, code],
  );
  if (!rows[0]) return { error: "Código inválido o expirado." };

  const user = await pool.query<{ id: string }>(
    `update users set email_verified = true where email = $1 returning id`,
    [email],
  );
  if (!user.rows[0]) return { error: "No existe esa cuenta." };
  await createSession(user.rows[0].id);
  await audit(user.rows[0].id, "verificar", "users", user.rows[0].id);
  redirect("/");
}

export async function login(
  _prev: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const { rows } = await pool.query<{
    id: string;
    password_hash: string;
    banned: boolean;
    email_verified: boolean;
  }>(
    "select id, password_hash, banned, email_verified from users where email = $1",
    [email],
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return { error: "Correo o contraseña incorrectos." };
  }
  if (user.banned) return { error: "Esta cuenta está suspendida." };
  if (!user.email_verified) {
    return { error: "Confirma el código que se generó al registrarte." };
  }
  await createSession(user.id);
  await audit(user.id, "login", "users", user.id);
  redirect("/");
}

export async function requestReset(
  _prev: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const { rowCount } = await pool.query(
    "select id from users where email = $1",
    [email],
  );
  if (!rowCount) return { ok: "Si el correo existe, generamos un código." };
  const code = otp();
  await pool.query(
    `insert into otps (email, code, purpose, expires_at)
     values ($1, $2, 'reset', now() + interval '15 minutes')`,
    [email, code],
  );
  return {
    ok: "Código de recuperación listo. En local se muestra aquí.",
    devCode: code,
  };
}

export async function resetPassword(
  _prev: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const code = String(form.get("code") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  const otpRow = await pool.query(
    `update otps set consumed = true
     where id = (
       select id from otps
       where email = $1 and code = $2 and purpose = 'reset'
         and consumed = false and expires_at > now()
       order by expires_at desc limit 1
     ) returning id`,
    [email, code],
  );
  if (!otpRow.rowCount) return { error: "Código inválido o expirado." };
  const hash = await bcrypt.hash(password, 10);
  await pool.query("update users set password_hash = $1 where email = $2", [hash, email]);
  return { ok: "Contraseña actualizada. Ya puedes entrar." };
}

export async function logout() {
  const user = await getSession();
  await destroySession();
  if (user) await audit(user.id, "logout", "users", user.id);
  redirect("/");
}

export async function deleteAccount() {
  const user = await getSession();
  if (!user) redirect("/entrar");
  await audit(user.id, "eliminar_cuenta", "users", user.id);
  await destroySession();
  await pool.query("delete from users where id = $1", [user.id]);
  redirect("/");
}
