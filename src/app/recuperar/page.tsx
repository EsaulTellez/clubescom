import { ResetForm, ResetRequestForm } from "@/components/auth-forms";
import { requestReset, resetPassword } from "@/lib/auth-actions";
import { card } from "@/lib/ui";

export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ cambiar?: string; error?: string }>;
}) {
  const { cambiar, error } = await searchParams;
  return (
    <section className={`${card} mx-auto max-w-md`}>
      {cambiar === "1" ? (
        <>
          <h1 className="mb-3 text-xl font-semibold">Nueva contraseña</h1>
          {error && <p className="mb-3 text-sm text-[#8C1D18]">El enlace no es válido o ya expiró. Solicita uno nuevo.</p>}
          <ResetForm action={resetPassword} />
        </>
      ) : (
        <>
          <h1 className="mb-3 text-xl font-semibold">Recuperar acceso</h1>
          <p className="mb-3 text-sm text-[#667085]">Te enviaremos un enlace para elegir una contraseña nueva.</p>
          <ResetRequestForm action={requestReset} />
        </>
      )}
    </section>
  );
}
