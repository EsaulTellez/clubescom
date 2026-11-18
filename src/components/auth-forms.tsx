"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import type { AuthState } from "@/lib/auth-actions";
import { btn, btnGhost, input, label } from "@/lib/ui";

function Note({ state }: { state: AuthState }) {
  return (
    <>
      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      {state.ok && <p className="text-sm text-[#1C1416]">{state.ok}</p>}
    </>
  );
}

export function RegisterForm({
  action,
  resendAction,
}: {
  action: (state: AuthState, form: FormData) => Promise<AuthState>;
  resendAction?: (state: AuthState, form: FormData) => Promise<AuthState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [resendState, resendFormAction, resendPending] = useActionState(
    resendAction ?? (async () => ({})),
    {},
  );
  const [editing, setEditing] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!editing && state.ok && state.email) {
    return (
      <div className="space-y-4">
        <div className="rounded-sm border border-[#c3d9cf] bg-[#eff7f2] p-4 text-sm text-[#173142]">
          <p className="font-bold text-[#14593e]">Revisa tu correo institucional</p>
          <p className="mt-1">
            Enviamos un enlace de confirmación a <strong>{state.email}</strong>. Ábrelo para activar tu cuenta e ingresar automáticamente al sistema.
          </p>
        </div>
        {resendAction && (
          <form
            action={(fd) => {
              setCooldown(60);
              resendFormAction(fd);
            }}
            className="space-y-2"
          >
            <input type="hidden" name="email" value={state.email} />
            <Note state={resendState} />
            <button
              className={btnGhost}
              disabled={resendPending || cooldown > 0}
            >
              {cooldown > 0
                ? `Reenviar enlace (${cooldown} s)`
                : resendPending
                  ? "Reenviando…"
                  : "Reenviar enlace de confirmación"}
            </button>
          </form>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-[#dcd9ce] pt-3 text-sm">
          <Link href="/entrar" className={btn}>
            Ir a iniciar sesión
          </Link>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-semibold text-[#155775] underline underline-offset-2"
          >
            Usar otro correo
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={() => setEditing(false)}
      className="space-y-3"
    >
      <label className={label}>
        Nombre
        <input className={input} name="name" required />
      </label>
      <label className={label}>
        Correo institucional
        <input className={input} name="email" type="email" autoComplete="email" required placeholder="boleta@alumno.ipn.mx" />
      </label>
      <label className={label}>
        Boleta o número de empleado
        <input className={input} name="boleta" />
      </label>
      <label className={label}>
        Contraseña
        <input className={input} name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input name="consent" type="checkbox" className="mt-1" required />
        Acepto el aviso de privacidad y el uso de mi boleta y correo solo para autenticación y comunicación académica.
      </label>
      <Note state={state} />
      <p className="text-xs text-[#667085]">Te enviaremos un enlace de confirmación a tu correo institucional.</p>
      <button className={btn} disabled={pending}>
        {pending ? "Creando…" : "Crear cuenta"}
      </button>
    </form>
  );
}

export function LoginForm({
  action,
}: {
  action: (state: AuthState, form: FormData) => Promise<AuthState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <label className={label}>
        Correo
        <input className={input} name="email" type="email" autoComplete="email" required />
      </label>
      <label className={label}>
        Contraseña
        <input className={input} name="password" type="password" autoComplete="current-password" required />
      </label>
      <Note state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

export function ResetRequestForm({
  action,
}: {
  action: (state: AuthState, form: FormData) => Promise<AuthState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <label className={label}>
        Correo
        <input className={input} name="email" type="email" required />
      </label>
      <Note state={state} />
      <button className={btn} disabled={pending}>
        Enviar enlace
      </button>
    </form>
  );
}

export function ResetForm({
  action,
}: {
  action: (state: AuthState, form: FormData) => Promise<AuthState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <label className={label}>
        Nueva contraseña
        <input className={input} name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label className={label}>
        Confirma la contraseña
        <input className={input} name="passwordConfirm" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <Note state={state} />
      <button className={btn} disabled={pending}>
        Guardar
      </button>
    </form>
  );
}
