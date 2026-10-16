import Link from "next/link";
import { LoginForm } from "@/components/auth-forms";
import { login } from "@/lib/auth-actions";
import { card } from "@/lib/ui";

export default function EntrarPage() {
  return (
    <div className={`${card} mx-auto max-w-md space-y-4`}>
      <h1 className="text-xl font-semibold">Entrar</h1>
      <LoginForm action={login} />
      <p className="text-sm">
        <Link href="/recuperar" className="underline">
          Olvidé mi contraseña
        </Link>
      </p>
      <p className="text-sm text-[#5C4A45]">
        Cuentas de prueba: <code>admin@ipn.mx</code>, <code>daniel.alumno@alumno.ipn.mx</code>. Contraseña <code>Escom2026!</code>
      </p>
    </div>
  );
}
