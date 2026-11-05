import Link from "next/link";
import { LoginForm } from "@/components/auth-forms";
import { login } from "@/lib/auth-actions";
import { card } from "@/lib/ui";

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ actualizada?: string }>;
}) {
  const { actualizada } = await searchParams;
  return (
    <div className={`${card} mx-auto max-w-md space-y-4`}>
      <h1 className="text-xl font-semibold">Entrar</h1>
      {actualizada === "1" && <p className="text-sm text-[#1C1416]">Contraseña actualizada. Ya puedes iniciar sesión.</p>}
      <LoginForm action={login} />
      <p className="text-sm">
        <Link href="/recuperar" className="underline">
          Olvidé mi contraseña
        </Link>
        <span className="px-2 text-[#8b969d]">·</span>
        <Link href="/apelaciones" className="font-semibold text-[#006699] underline underline-offset-2">
          Consultar o apelar una suspensión
        </Link>
      </p>
      <details className="rounded-2xl border border-[#c9dbe7] bg-[#f5fafc] p-4 text-sm text-[#344b59]">
        <summary className="cursor-pointer font-bold text-[#004d73]">Cuentas de prueba para recorrer los roles</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-[#667085]">Contraseña compartida: <code className="rounded bg-white px-1.5 py-0.5 font-bold">Escom2026!</code></p>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-[#006699]">Comunidad</p>
            <ul className="mt-1 space-y-1"><li>Alumno: <code>daniel.alumno@alumno.ipn.mx</code></li><li>Segundo alumno: <code>esaul.alumno@alumno.ipn.mx</code></li><li>Profesor: <code>profesor@ipn.mx</code></li></ul>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-[#006699]">Moderación por área</p>
            <ul className="mt-1 space-y-1"><li>Comunicación: <code>comunicacion@ipn.mx</code></li><li>Gestión Escolar: <code>gestion@ipn.mx</code></li><li>Clubes académicos: <code>clubes@ipn.mx</code></li><li>Subdirección Académica / Sala 14: <code>subdireccion@ipn.mx</code></li><li>Becas: <code>becas@ipn.mx</code></li><li>CATT: <code>catt@ipn.mx</code></li><li>Prefectura: <code>prefectura@ipn.mx</code></li><li>Clubes culturales: <code>culturales@ipn.mx</code></li></ul>
          </div>
          <p>Administrador general: <code>admin@ipn.mx</code></p>
        </div>
      </details>
    </div>
  );
}
