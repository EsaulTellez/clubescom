import Link from "next/link";
import { ResetForm, ResetRequestForm } from "@/components/auth-forms";
import { requestReset, resetPassword } from "@/lib/auth-actions";
import { card } from "@/lib/ui";

export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ cambiar?: string; error?: string; invitacion?: string }>;
}) {
  const { cambiar, error, invitacion } = await searchParams;
  return (
    <section className={`${card} mx-auto max-w-md space-y-4`}>
      {error && (
        <p role="alert" className="rounded-lg border border-[#e6b8ae] bg-[#fff4f1] p-3 text-sm text-[#8C1D18]">
          {error === "enlace_invalido"
            ? "El enlace no es válido, ya fue utilizado o expiró. Solicita uno nuevo."
            : "Ocurrió un problema al validar tu recuperación."}
        </p>
      )}
      {cambiar === "1" ? (
        <>
          <h1 className="text-xl font-semibold">
            {invitacion === "1" ? "Elige tu contraseña inicial" : "Nueva contraseña"}
          </h1>
          <ResetForm action={resetPassword} />
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">Recuperar acceso</h1>
          <p className="text-sm text-[#667085]">Te enviaremos un enlace seguro a tu correo institucional para elegir una contraseña nueva.</p>
          <ResetRequestForm action={requestReset} />
        </>
      )}
      <p className="border-t border-[#e5e9ec] pt-3 text-sm">
        <Link href="/entrar" className="font-semibold text-[#006699] underline underline-offset-2">
          ← Volver a iniciar sesión
        </Link>
      </p>
    </section>
  );
}
