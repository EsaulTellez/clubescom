import { ResetForm, ResetRequestForm } from "@/components/auth-forms";
import { requestReset, resetPassword } from "@/lib/auth-actions";
import { card } from "@/lib/ui";

export default function RecuperarPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
      <section className={card}>
        <h1 className="mb-3 text-xl font-semibold">Recuperar acceso</h1>
        <ResetRequestForm action={requestReset} />
      </section>
      <section className={card}>
        <h2 className="mb-3 text-xl font-semibold">Nueva contraseña</h2>
        <ResetForm action={resetPassword} />
      </section>
    </div>
  );
}
