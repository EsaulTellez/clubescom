"use client";

import { useActionState } from "react";
import type { AuthState } from "@/lib/auth-actions";
import { btn, input, label } from "@/lib/ui";

function Note({ state }: { state: AuthState }) {
  return (
    <>
      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      {state.ok && <p className="text-sm text-[#1C1416]">{state.ok}</p>}
      {state.devCode && (
        <p className="rounded-lg bg-[#F6F1EA] px-3 py-2 text-sm">
          Código local: <strong>{state.devCode}</strong>
        </p>
      )}
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
        <input className={input} name="email" type="email" required placeholder="boleta@alumno.ipn.mx" />
      </label>
      <label className={label}>
        Boleta o número de empleado
        <input className={input} name="boleta" />
      </label>
      <label className={label}>
        Contraseña
        <input className={input} name="password" type="password" minLength={8} required />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input name="consent" type="checkbox" className="mt-1" required />
        Acepto el aviso de privacidad y el uso de mi boleta y correo solo para autenticación y comunicación académica.
      </label>
      <Note state={state} />
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
        <input className={input} name="email" type="email" required />
      </label>
      <label className={label}>
        Código de 6 dígitos
        <input className={input} name="code" inputMode="numeric" required />
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
        <input className={input} name="email" type="email" required />
      </label>
      <label className={label}>
        Contraseña
        <input className={input} name="password" type="password" required />
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
        Generar código
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
        Correo
        <input className={input} name="email" type="email" required />
      </label>
      <label className={label}>
        Código
        <input className={input} name="code" required />
      </label>
      <label className={label}>
        Nueva contraseña
        <input className={input} name="password" type="password" minLength={8} required />
      </label>
      <Note state={state} />
      <button className={btn} disabled={pending}>
        Guardar
      </button>
    </form>
  );
}
