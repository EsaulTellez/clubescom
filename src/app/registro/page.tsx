import Link from "next/link";
import { RegisterForm, VerifyForm } from "@/components/auth-forms";
import { register, verifyEmail } from "@/lib/auth-actions";
import { card } from "@/lib/ui";

export default function RegistroPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
      <section className={card}>
        <h1 className="mb-3 text-xl font-semibold">Registro</h1>
        <RegisterForm action={register} />
        <p className="mt-3 text-sm">
          <Link href="/aviso-privacidad" className="underline">
            Leer aviso de privacidad
          </Link>
        </p>
      </section>
      <section className={card}>
        <h2 className="mb-3 text-xl font-semibold">Confirmar código</h2>
        <VerifyForm action={verifyEmail} />
      </section>
    </div>
  );
}
