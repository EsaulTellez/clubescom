import Link from "next/link";
import { logout } from "@/lib/auth-actions";
import type { SessionUser } from "@/lib/auth";

const links = [
  ["Avisos", "/avisos"],
  ["Clubes", "/clubes"],
  ["Objetos", "/objetos"],
  ["Foro", "/foro"],
  ["Guías", "/guias"],
  ["Espacios", "/espacios"],
];

export function SiteHeader({ user }: { user: SessionUser | null }) {
  return (
    <header className="border-b border-[#E4D9CC] bg-[#6B1D2A] text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          ESCOM
          <span className="ml-2 hidden text-sm font-normal text-[#F3D7C4] sm:inline">
            Vida institucional
          </span>
        </Link>
        <nav className="hidden items-center gap-4 text-sm md:flex">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="hover:text-[#F3D7C4]">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <Link href="/notificaciones" className="hover:text-[#F3D7C4]">
                Avisos míos
              </Link>
              <Link href="/perfil" className="hover:text-[#F3D7C4]">
                {user.name.split(" ")[0]}
              </Link>
              {(user.role === "admin" || user.role === "moderador") && (
                <Link href="/admin" className="hover:text-[#F3D7C4]">
                  Panel
                </Link>
              )}
              <form action={logout}>
                <button className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20">
                  Salir
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/entrar" className="hover:text-[#F3D7C4]">
                Entrar
              </Link>
              <Link href="/registro" className="rounded-lg bg-white px-3 py-1.5 text-[#6B1D2A]">
                Registro
              </Link>
            </>
          )}
        </div>
      </div>
      <nav className="flex gap-3 overflow-x-auto px-4 pb-3 text-sm md:hidden">
        {links.map(([label, href]) => (
          <Link key={href} href={href} className="whitespace-nowrap hover:text-[#F3D7C4]">
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
