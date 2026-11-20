import Link from "next/link";
import { ResendLinkForm } from "@/components/auth-forms";
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
        <h1 className="text-xl font-semibold text-[#173142]">
          {isRecovery
            ? "Confirma tu solicitud de recuperación"
            : isInvite
              ? "Activa tu invitación a ESCOM"
              : "Confirma tu correo institucional"}
        </h1>
        <p className="text-sm text-[#304958]">
          {isRecovery
            ? "Presiona el botón de abajo para verificar tu enlace y elegir tu nueva contraseña."
            : "Presiona el botón para completar la verificación de tu cuenta. Este paso protege el enlace ante escáneres automáticos de correo."}
        </p>
        <form action={confirmEmailTokenAction} className="space-y-3">
          <input type="hidden" name="token_hash" value={token_hash} />
          <input type="hidden" name="type" value={type} />
          <button className={btn}>
            {isRecovery ? "Continuar a nueva contraseña" : "Confirmar y activar cuenta"}
          </button>
        </form>
      </section>
    );
  }

  if (user) {
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
              ¡Te autenticaste de forma exitosa!
            </h1>
            <p className="text-sm text-[#526974]">{user.email}</p>
          </div>
        </div>
        <p className="text-sm text-[#304958]">
          Tu cuenta de <strong>{user.name}</strong> quedó confirmada y ya iniciaste sesión en la plataforma.
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
