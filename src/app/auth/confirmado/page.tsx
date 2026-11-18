import Link from "next/link";
import { getSession } from "@/lib/auth";
import { btn, btnGhost, card } from "@/lib/ui";
import { AutoRedirect } from "./auto-redirect";

export const dynamic = "force-dynamic";

export default async function AuthConfirmadoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, user] = await Promise.all([searchParams, getSession()]);

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
        El enlace de confirmación ya expiró, ya fue utilizado o no es válido. Si ya confirmaste tu cuenta, puedes iniciar sesión directamente; si no, vuelve a intentarlo desde registro.
      </p>
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
