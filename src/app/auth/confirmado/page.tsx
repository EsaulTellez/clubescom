import Link from "next/link";
import { ConfirmTokenForm, ResendLinkForm } from "@/components/auth-forms";
import { getSession } from "@/lib/auth";
import { confirmEmailTokenAction, resendConfirmation } from "@/lib/auth-actions";
import { btn, btnGhost, card } from "@/lib/ui";
import { AutoRedirect } from "./auto-redirect";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export default async function AuthConfirmadoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token_hash?: string; type?: string }>;
}) {
  const [{ error, token_hash, type }, user] = await Promise.all([searchParams, getSession()]);

  if (token_hash && type && ALLOWED_TYPES.has(type)) {
    const isRecovery = type === "recovery";
    const isInvite = type === "invite";
    return (
      <section className={`${card} mx-auto max-w-md space-y-4`}>
        <h1 className="border-t-4 border-[#155775] pt-4 text-2xl font-bold text-[#173142]">
          {isRecovery
            ? "Confirma tu solicitud de recuperación"
            : isInvite
              ? "Activa tu invitación a ESCOM"
              : "Confirma tu correo institucional"}
        </h1>
        <p className="text-sm text-[#304958]">
          {isRecovery
            ? "Confirma la solicitud para elegir una contraseña nueva."
            : isInvite
              ? "Acepta la invitación para elegir tu contraseña."
              : "Activa tu cuenta para entrar a la plataforma con tu correo institucional."}
        </p>
        <ConfirmTokenForm
          action={confirmEmailTokenAction}
          tokenHash={token_hash}
          type={type}
          isRecovery={isRecovery}
          isInvite={isInvite}
        />
      </section>
    );
  }

  if (user && !error) {
    return (
      <section className={`${card} mx-auto max-w-md space-y-4`}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-sm border border-[#b9d9c8] bg-[#eaf5ef] text-lg font-bold text-[#14593e]"
          >
            ✓
          </span>
          <div>
            <h1 className="text-xl font-semibold text-[#173142]">
              Correo verificado
            </h1>
            <p className="text-sm text-[#526974]">{user.email}</p>
          </div>
        </div>
        <p className="text-sm text-[#304958]">
          Ya iniciaste sesión, <strong>{user.name}</strong>.
        </p>
        <AutoRedirect to="/" delayMs={2500} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/" className={btn}>
            Ir al inicio
          </Link>
        </div>
      </section>
    );
  }

  if (error === "otro_navegador") {
    return (
      <section className={`${card} mx-auto max-w-md space-y-4`}>
        <h1 className="text-xl font-semibold text-[#173142]">Correo confirmado</h1>
        <p className="text-sm text-[#304958]">
          Abriste el enlace desde un navegador o dispositivo distinto al que usaste para crear tu cuenta. Inicia sesión con tu correo institucional y contraseña para entrar al sistema.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/entrar" className={btn}>
            Iniciar sesión
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={`${card} mx-auto max-w-md space-y-4`}>
      <h1 className="text-xl font-semibold text-[#8C1D18]">No pudimos validar el enlace</h1>
      <p className="text-sm text-[#304958]">
        El enlace de confirmación ya expiró, ya fue utilizado o no es válido. Si ya confirmaste tu cuenta, inicia sesión; de lo contrario, reenvía un nuevo enlace aquí mismo.
      </p>
      <ResendLinkForm action={resendConfirmation} />
      <div className="flex flex-wrap gap-2">
        <Link href="/entrar" className={btn}>
          Iniciar sesión
        </Link>
        <Link href="/registro" className={btnGhost}>
          Volver a registro
        </Link>
      </div>
    </section>
  );
}
