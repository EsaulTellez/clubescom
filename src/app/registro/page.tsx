import Link from "next/link";
import { RegisterForm } from "@/components/auth-forms";
import { register, resendConfirmation } from "@/lib/auth-actions";
import { card } from "@/lib/ui";

export default function RegistroPage() {
  return (
    <section className={`${card} mx-auto max-w-md space-y-4`}>
      <h1 className="text-xl font-semibold">Crear cuenta</h1>
      <RegisterForm action={register} resendAction={resendConfirmation} />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Link href="/aviso-privacidad" className="underline">
          Leer aviso de privacidad
        </Link>
        <span className="text-[#8b969d]">·</span>
        <Link href="/entrar" className="font-semibold text-[#006699] underline underline-offset-2">
          ¿Ya tienes cuenta? Entrar
        </Link>
        <span className="text-[#8b969d]">·</span>
        <Link href="/recuperar" className="underline">
          Olvidé mi contraseña
        </Link>
      </p>
    </section>
  );
}
