"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Spinner, SubmitButton } from "@/components/loading-ui";
import type { AuthState } from "@/lib/auth-actions";
import { btn, btnGhost, input, label } from "@/lib/ui";

function Note({ state }: { state: AuthState }) {
  return (
    <>
      {state.error && <p className="text-sm text-[#8C1D18]" role="alert">{state.error}</p>}
      {state.ok && <p className="text-sm text-[#14593e]" role="status">{state.ok}</p>}
    </>
  );
}

function PasswordInput({
  name,
  autoComplete,
  minLength,
  required,
}: {
  name: string;
  autoComplete: string;
  minLength?: number;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative mt-1">
      <input
        className={`${input} pr-20`}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={72}
        required={required}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-bold text-[#006699] hover:bg-[#eaf4f8]"
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}

export function ConfirmTokenForm({
  action,
  tokenHash,
  type,
  isRecovery,
  isInvite,
}: {
  action: (form: FormData) => Promise<void>;
  tokenHash: string;
  type: string;
  isRecovery: boolean;
  isInvite: boolean;
}) {
  const lockedRef = useRef(false);
  const [locked, setLocked] = useState(false);

  const buttonLabel = isRecovery
    ? "Continuar a nueva contraseña"
    : isInvite
      ? "Confirmar invitación"
      : "Confirmar y activar cuenta";

  const pendingLabel = isRecovery
    ? "Verificando enlace…"
    : isInvite
      ? "Activando invitación…"
      : "Confirmando cuenta…";

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (lockedRef.current) {
          event.preventDefault();
          return;
        }
        lockedRef.current = true;
        setLocked(true);
      }}
      className="space-y-3"
    >
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <SubmitButton
        className={btn}
        pending={locked}
        pendingText={pendingLabel}
      >
        {buttonLabel}
      </SubmitButton>
      {locked && (
        <p role="status" aria-live="polite" className="text-xs font-medium text-[#526974]">
          Procesando tu solicitud, espera un momento…
        </p>
      )}
    </form>
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
            <SubmitButton
              className={btnGhost}
              pending={resendPending}
              disabled={cooldown > 0}
              pendingText="Reenviando…"
            >
              {cooldown > 0
                ? `Reenviar enlace (${cooldown} s)`
                : "Reenviar enlace de confirmación"}
            </SubmitButton>
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
        <input className={input} name="email" type="email" autoComplete="email" required placeholder="usuario@alumno.ipn.mx o nombre@ipn.mx" />
      </label>
      <label className={label}>
        Boleta o número de empleado (opcional al inicio)
        <input className={input} name="boleta" maxLength={32} placeholder="Ej. 2023630001 o número de empleado" />
      </label>
      <label className={label}>
        Contraseña (mínimo 8 caracteres)
        <PasswordInput name="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input name="consent" type="checkbox" className="mt-1" required />
        Acepto el aviso de privacidad y el uso de mi boleta y correo solo para autenticación y comunicación académica.
      </label>
      <Note state={state} />
      {state.alreadyExists && state.email && resendAction && (
        <div className="space-y-2 rounded-lg border border-[#d6e4ed] bg-[#f6fafc] p-3 text-xs">
          <p className="font-semibold text-[#19435b]">¿Ya intentaste registrarte antes?</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={resendPending || cooldown > 0}
              aria-busy={resendPending || undefined}
              onClick={() => {
                const fd = new FormData();
                fd.set("email", state.email!);
                setCooldown(60);
                resendFormAction(fd);
              }}
              className={btnGhost}
            >
              {resendPending && <Spinner />}
              <span>
                {resendPending
                  ? "Reenviando…"
                  : cooldown > 0
                    ? `Reenviar enlace (${cooldown} s)`
                    : "Reenviar enlace de activación"}
              </span>
            </button>
            <Link href="/entrar" className="font-bold text-[#006699] underline">
              Ir a iniciar sesión →
            </Link>
          </div>
          <Note state={resendState} />
        </div>
      )}
      <p className="text-xs text-[#667085]">Te enviaremos un enlace de confirmación a tu correo institucional.</p>
      <SubmitButton className={btn} pending={pending} pendingText="Creando cuenta…">
        Crear cuenta
      </SubmitButton>
    </form>
  );
}

export function ResendLinkForm({
  action,
  defaultEmail = "",
}: {
  action: (state: AuthState, form: FormData) => Promise<AuthState>;
  defaultEmail?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  return (
    <form
      action={(fd) => {
        setCooldown(60);
        formAction(fd);
      }}
      className="space-y-3 rounded-lg border border-[#d6e4ed] bg-[#f8fbfd] p-4"
    >
      <label className={label}>
        Reenviar enlace de confirmación a tu correo institucional
        <input
          className={`${input} mt-1`}
          name="email"
          type="email"
          required
          defaultValue={defaultEmail}
          placeholder="usuario@alumno.ipn.mx o nombre@ipn.mx"
        />
      </label>
      <Note state={state} />
      <SubmitButton
        className={btnGhost}
        pending={pending}
        disabled={cooldown > 0}
        pendingText="Reenviando…"
      >
        {cooldown > 0 ? `Espera ${cooldown} s` : "Reenviar enlace de activación"}
      </SubmitButton>
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
        Correo institucional
        <input className={input} name="email" type="email" autoComplete="email" required placeholder="usuario@alumno.ipn.mx o nombre@ipn.mx" />
      </label>
      <label className={label}>
        Contraseña
        <PasswordInput name="password" autoComplete="current-password" required />
      </label>
      <Note state={state} />
      <SubmitButton className={btn} pending={pending} pendingText="Entrando…">
        Entrar
      </SubmitButton>
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
        Correo institucional
        <input className={input} name="email" type="email" required placeholder="usuario@alumno.ipn.mx o nombre@ipn.mx" />
      </label>
      <Note state={state} />
      <SubmitButton className={btn} pending={pending} pendingText="Enviando enlace…">
        Enviar enlace
      </SubmitButton>
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
        Nueva contraseña (mínimo 8 caracteres)
        <PasswordInput name="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label className={label}>
        Confirma la contraseña
        <PasswordInput name="passwordConfirm" autoComplete="new-password" minLength={8} required />
      </label>
      <Note state={state} />
      <SubmitButton className={btn} pending={pending} pendingText="Guardando contraseña…">
        Guardar contraseña
      </SubmitButton>
    </form>
  );
}
