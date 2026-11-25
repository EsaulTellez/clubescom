import type { EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && ALLOWED_OTP_TYPES.has(value as EmailOtpType);
}

export async function GET(request: NextRequest) {
  const siteUrl = process.env.SITE_URL || request.url;
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const authError = request.nextUrl.searchParams.get("error");
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  const failureRedirect = (reason: "enlace_invalido" | "otro_navegador") => {
    if (next.startsWith("/recuperar") || type === "recovery") {
      return NextResponse.redirect(new URL("/recuperar?error=enlace_invalido", siteUrl));
    }
    return NextResponse.redirect(new URL(`/auth/confirmado?error=${reason}`, siteUrl));
  };

  if (authError) {
    return failureRedirect("enlace_invalido");
  }

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = next === "/" && type === "recovery" ? "/recuperar?cambiar=1" : next;
      if (data.user && (destination === "/auth/confirmado" || type === "signup" || type === "invite")) {
        try {
          await audit(data.user.id, "verificar", "users", data.user.id);
        } catch {
          // Do not block sign-in if audit logging fails.
        }
      }
      return NextResponse.redirect(new URL(destination, siteUrl));
    }
    if (/pkce|code verifier/i.test(error.message)) {
      return failureRedirect("otro_navegador");
    }
    return failureRedirect("enlace_invalido");
  }

  if (tokenHash && isEmailOtpType(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      const destination =
        next !== "/"
          ? next
          : type === "recovery"
            ? "/recuperar?cambiar=1"
            : type === "invite"
              ? "/recuperar?cambiar=1&invitacion=1"
              : type === "signup" || type === "email"
                ? "/auth/confirmado"
                : "/";
      if (data.user && destination === "/auth/confirmado") {
        try {
          await audit(data.user.id, "verificar", "users", data.user.id);
        } catch {
          // Do not block sign-in if audit logging fails.
        }
      }
      return NextResponse.redirect(new URL(destination, siteUrl));
    }
    return failureRedirect("enlace_invalido");
  }

  const { data: userData } = await supabase.auth.getUser();
  if (userData.user && next === "/auth/confirmado") {
    return NextResponse.redirect(new URL("/auth/confirmado", siteUrl));
  }

  return failureRedirect("enlace_invalido");
}
