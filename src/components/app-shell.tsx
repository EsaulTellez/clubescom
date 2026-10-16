"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/auth-actions";
import type { SessionUser } from "@/lib/auth";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/avisos", label: "Avisos" },
  { href: "/clubes", label: "Clubes" },
  { href: "/espacios", label: "Espacios" },
  { href: "/foro", label: "Foro" },
  { href: "/guias", label: "Guías" },
  { href: "/objetos", label: "Objetos" },
];

function Icon({ name }: { name: string }) {
  const common = { viewBox: "0 0 24 24", className: "h-[18px] w-[18px]", fill: "none", stroke: "currentColor", strokeWidth: 1.7 };
  if (name === "Inicio") {
    return (
      <svg {...common}>
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (name === "Avisos") {
    return (
      <svg {...common}>
        <path d="M5 5h14v11H8l-3 3z" />
      </svg>
    );
  }
  if (name === "Clubes") {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="3" />
        <circle cx="16" cy="10" r="2.4" />
        <path d="M4 19c.6-2.6 2.6-4 5-4s4.4 1.4 5 4M14 15.2c1.2-.4 2.5-.2 3.6.8.6.6 1 1.4 1.2 2.2" />
      </svg>
    );
  }
  if (name === "Espacios") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3.5v3M16 3.5v3M4 10h16" />
      </svg>
    );
  }
  if (name === "Foro") {
    return (
      <svg {...common}>
        <path d="M6 17.5 4 20V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v8A1.5 1.5 0 0 1 18.5 16H8z" />
      </svg>
    );
  }
  if (name === "Guías") {
    return (
      <svg {...common}>
        <path d="M6 4.5h9.5A2.5 2.5 0 0 1 18 7v12.5H8.2A2.2 2.2 0 0 0 6 21.7z" />
        <path d="M6 4.5A2.2 2.2 0 0 0 3.8 6.7V19" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 8h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M8 8V6.5A2.5 2.5 0 0 1 10.5 4h3A2.5 2.5 0 0 1 16 6.5V8" />
    </svg>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Secciones">
      {links.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              active ? "bg-[#e6f3fa] font-medium text-[#006699]" : "text-[#3c4250] hover:bg-[#f4f8fb]"
            }`}
          >
            <Icon name={link.label} />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f3f5f8] text-[#17191e]">
      <div className="mx-auto flex min-h-screen max-w-[1440px]">
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-[#d5e4ee] bg-white px-4 py-5 lg:flex">
          <Link href="/" className="mb-6 block px-2">
            <img
              src="/brand/escudo-escom.png"
              alt="ESCOM, Instituto Politécnico Nacional"
              className="h-auto w-[168px]"
            />
          </Link>
          <NavLinks pathname={pathname} />
          <Link href="/aviso-privacidad" className="mt-4 px-3 py-2 text-sm text-[#667085] hover:text-[#17191e]">
            Ayuda y privacidad
          </Link>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[#e6e8ee] bg-white/90 px-4 backdrop-blur lg:px-8">
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-xl border border-[#e6e8ee] lg:hidden"
              aria-label="Abrir menú"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M4 7h16M4 12h16M4 17h12" />
              </svg>
            </button>
            <Link href="/" className="lg:hidden">
              <img src="/brand/escudo-escom.png" alt="ESCOM" className="h-10 w-auto" />
            </Link>
            <div className="ml-auto flex items-center gap-3 text-sm">
              {user ? (
                <>
                  <Link href="/notificaciones" className="hidden text-[#3c4250] hover:text-[#006699] sm:inline">
                    Avisos
                  </Link>
                  {(user.role === "admin" || user.role === "moderador") && (
                    <Link href="/admin" className="hidden text-[#3c4250] hover:text-[#006699] sm:inline">
                      Panel
                    </Link>
                  )}
                  <Link href="/perfil" className="font-medium hover:text-[#006699]">
                    {user.name.split(" ")[0]}
                  </Link>
                  <form action={logout}>
                    <button className="text-[#667085] hover:text-[#17191e]">Salir</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/registro" className="text-[#667085] hover:text-[#17191e]">
                    Registro
                  </Link>
                  <Link href="/entrar" className="font-medium text-[#006699]">
                    Iniciar sesión
                  </Link>
                </>
              )}
            </div>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button className="absolute inset-0 bg-[#111827]/40" aria-label="Cerrar menú" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-[260px] flex-col bg-white px-4 py-6 shadow-xl">
            <img src="/brand/escudo-escom.png" alt="ESCOM" className="mb-6 h-auto w-40 px-2" />
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
