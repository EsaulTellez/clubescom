"use server";

import { redirect } from "next/navigation";
import { audit, getSession, roleFromEmail } from "./auth";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";

export type AuthState = { error?: string; ok?: string };

function emailFrom(form: FormData) {
  return String(form.get("email") ?? "").trim().toLowerCase();
}

export async function register(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = emailFrom(form);
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const boleta = String(form.get("boleta") ?? "").trim();
  const consent = form.get("consent") === "on";

  if (!consent) return { error: "Acepta el aviso de privacidad para continuar." };
  if (!roleFromEmail(email)) return { error: "Usa un correo @alumno.ipn.mx o @ipn.mx." };
  if (name.length < 3) return { error: "Escribe tu nombre completo." };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, boleta: boleta || null } },
  });

  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      return { error: "No pudimos crear la cuenta. Revisa el correo o intenta iniciar sesión." };
    }
    return { error: "No se pudo iniciar el registro. Revisa los datos e inténtalo de nuevo." };
  }
  if (!data.user || data.user.identities?.length === 0) {
    return { error: "No pudimos crear la cuenta. Revisa el correo o intenta iniciar sesión." };
  }

  return {
    ok: "Te enviamos un código de seis dígitos. Revísalo en tu correo; en el demo local aparece en Mailpit.",
  };
}

export async function verifyEmail(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = emailFrom(form);
  const token = String(form.get("code") ?? "").trim();
  if (!roleFromEmail(email)) return { error: "Usa un correo institucional válido." };
  if (!/^\d{6}$/.test(token)) return { error: "Escribe el código de seis dígitos." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user) return { error: "El código no es válido o ya expiró. Solicita uno nuevo." };

  await audit(data.user.id, "verificar", "users", data.user.id);
  redirect("/");
}

export async function login(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = emailFrom(form);
  const password = String(form.get("password") ?? "");
  if (!roleFromEmail(email)) return { error: "Usa un correo institucional válido." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "Correo o contraseña incorrectos, o correo sin verificar." };

  const user = await getSession();
  if (!user) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Esta cuenta está suspendida o todavía no está verificada." };
  }

  await audit(user.id, "login", "users", user.id);
  redirect("/");
}

export async function requestReset(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = emailFrom(form);
  if (!roleFromEmail(email)) return { error: "Usa un correo institucional válido." };

  const supabase = await createSupabaseServerClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3001";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("/auth/callback?next=/recuperar?cambiar=1", siteUrl).toString(),
  });
  if (error) return { error: "No pudimos enviar el enlace. Inténtalo de nuevo en un momento." };

  return {
    ok: "Si la cuenta existe, enviamos un enlace de recuperación. En el demo local revisa Mailpit.",
  };
}

export async function resetPassword(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  const passwordConfirm = String(form.get("passwordConfirm") ?? "");
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password !== passwordConfirm) return { error: "Las contraseñas no coinciden." };

  const supabase = await createSupabaseServerClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) return { error: "Abre primero el enlace de recuperación que enviamos a tu correo." };

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) return { error: "No pudimos actualizar la contraseña. Solicita otro enlace." };

  await supabase.auth.signOut({ scope: "global" });
  redirect("/entrar?actualizada=1");
}

export async function logout() {
  const user = await getSession();
  if (user) await audit(user.id, "logout", "users", user.id);
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}

export async function deleteAccount() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/entrar");

  const admin = createSupabaseAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    throw new Error("No se pudo eliminar la cuenta. Inténtalo de nuevo.");
  }

  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
