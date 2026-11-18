"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { officeModules } from "./areas";
import { audit, getSession, roleFromEmail } from "./auth";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";

export type AuthState = { error?: string; ok?: string; email?: string };

function emailFrom(form: FormData) {
  return String(form.get("email") ?? "").trim().toLowerCase();
}

async function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  try {
    const hdrs = await headers();
    const host = hdrs.get("x-forwarded-host") || hdrs.get("host");
    if (host) {
      const proto =
        hdrs.get("x-forwarded-proto") ||
        (host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // ignore
  }
  return "http://127.0.0.1:3001";
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
  const siteUrl = await getSiteUrl();
  const emailRedirectTo = new URL("/auth/callback?next=/auth/confirmado", siteUrl).toString();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, boleta: boleta || null },
      emailRedirectTo,
    },
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

  if (data.session) {
    await audit(data.user.id, "verificar", "users", data.user.id);
    redirect("/auth/confirmado");
  }

  return {
    ok: "Te enviamos un enlace de confirmación a tu correo institucional. Ábrelo para activar tu cuenta e ingresar al sistema.",
    email,
  };
}

export async function resendConfirmation(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = emailFrom(form);
  if (!roleFromEmail(email)) {
    return { error: "Usa un correo institucional válido.", email };
  }

  const supabase = await createSupabaseServerClient();
  const siteUrl = await getSiteUrl();
  const emailRedirectTo = new URL("/auth/callback?next=/auth/confirmado", siteUrl).toString();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo },
  });
  if (error) {
    return {
      error: "No pudimos reenviar el enlace. Espera un minuto y vuelve a intentarlo.",
      email,
    };
  }
  return {
    ok: "Reenviamos el enlace de confirmación a tu correo.",
    email,
  };
}

export async function updateOwnProfile(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para editar tu perfil." };
  const name = String(form.get("name") ?? "").trim();
  const boleta = String(form.get("boleta") ?? "").trim();
  if (name.length < 3 || name.length > 120) return { error: "El nombre debe tener entre 3 y 120 caracteres." };
  if (boleta && (boleta.length < 4 || boleta.length > 32 || !/^[A-Za-z0-9-]+$/.test(boleta))) {
    return { error: "La boleta o número de empleado debe tener entre 4 y 32 caracteres alfanuméricos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_my_profile", {
    p_name: name,
    p_boleta: boleta || null,
  });
  if (error) return { error: "No se pudo actualizar el perfil." };

  await audit(user.id, "editar_perfil", "users", user.id, `${user.name} → ${name}`);
  return { ok: "Perfil actualizado." };
}

export async function submitPrivacyRequest(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const user = await getSession();
  if (!user) return { error: "Inicia sesión para enviar una solicitud ARCO o reporte de privacidad." };
  const kind = String(form.get("kind") ?? "").trim();
  const detail = String(form.get("detail") ?? "").trim();
  if (!["rectificacion", "oposicion", "cancelacion", "incidente"].includes(kind)) {
    return { error: "Selecciona un tipo de solicitud válido." };
  }
  if (detail.length < 10 || detail.length > 2000) {
    return { error: "Describe tu solicitud con entre 10 y 2000 caracteres." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("privacy_requests")
    .insert({ user_id: user.id, kind, detail });
  if (error) return { error: "No se pudo registrar la solicitud." };

  await audit(user.id, "solicitud_arco", "privacy_requests", user.id, kind);
  return { ok: "Solicitud registrada. El Oficial de Privacidad y Administración la revisarán." };
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
  redirect(user.isSuperadmin ? "/admin" : officeModules(user)?.[0] ?? "/");
}

export async function requestReset(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = emailFrom(form);
  if (!roleFromEmail(email)) return { error: "Usa un correo institucional válido." };

  const supabase = await createSupabaseServerClient();
  const siteUrl = await getSiteUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("/auth/callback?next=/recuperar?cambiar=1", siteUrl).toString(),
  });
  if (error) return { error: "No pudimos enviar el enlace. Inténtalo de nuevo en un momento." };

  return {
    ok: "Si la cuenta existe, enviamos un enlace de recuperación.",
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

  const { data: objects, error: listError } = await supabase.rpc("my_account_storage_objects");
  if (listError) throw new Error("No se pudieron identificar tus archivos. Inténtalo de nuevo.");
  const admin = createSupabaseAdminClient();
  const grouped = new Map<string, string[]>();
  for (const object of (objects ?? []) as { bucket_id: string; object_name: string }[]) {
    grouped.set(object.bucket_id, [...(grouped.get(object.bucket_id) ?? []), object.object_name]);
  }
  for (const [bucket, paths] of grouped) {
    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error: storageError } = await admin.storage.from(bucket).remove(paths.slice(offset, offset + 100));
      if (storageError) throw new Error("No se pudieron eliminar todos tus archivos. Inténtalo de nuevo.");
    }
  }
  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    throw new Error("No se pudo eliminar la cuenta. Inténtalo de nuevo.");
  }

  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}

export async function switchOperatingProfile(form: FormData) {
  const user = await getSession();
  const role = String(form.get("role") ?? "");
  if (!user?.canSwitchProfile || !["alumno", "profesor", "admin"].includes(role)) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("switch_operating_profile", { p_role: role });
  if (error) throw new Error("No se pudo cambiar el perfil de operación.");
  await audit(user.id, "cambiar_perfil_operativo", "users", user.id, `${user.role} → ${role}`);
  redirect("/perfil");
}
