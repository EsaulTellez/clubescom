"use client";

import { useActionState } from "react";
import type { AuthState } from "@/lib/auth-actions";
import { btn, input, label } from "@/lib/ui";

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
}: {
  action: (state: AuthState, form: FormData) => Promise<AuthState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
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
      <p className="text-xs text-[#667085]">La verificación llega por correo. En la demo local puedes abrir Mailpit.</p>
      <button className={btn} disabled={pending}>
        {pending ? "Creando…" : "Crear cuenta"}
      </button>
    </form>
  );
}

export function VerifyForm({
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
        Código de 6 dígitos
        <input className={input} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
      </label>
      <Note state={state} />
      <button className={btn} disabled={pending}>
        Confirmar
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
