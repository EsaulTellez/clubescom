"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth-actions";
import type { SessionUser } from "@/lib/auth";

const links = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/avisos", label: "Avisos", icon: "sparkles" },
  { href: "/clubes", label: "Clubes", icon: "people" },
  { href: "/espacios", label: "Espacios", icon: "map" },
  { href: "/foro", label: "Foro", icon: "chat" },
  { href: "/guias", label: "Guías", icon: "book" },
  { href: "/objetos", label: "Objetos", icon: "bag" },
];

function Icon({ name }: { name: string }) {
  const common = { viewBox: "0 0 24 24", className: "h-[18px] w-[18px] shrink-0", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="m3.5 10 8.5-7 8.5 7"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/></>,
    sparkles: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/><path d="m5 14 .6 1.4L7 16l-1.4.6L5 18l-.6-1.4L3 16l1.4-.6L5 14Z"/></>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-3.4 2.3-5.2 5.5-5.2s5.1 1.8 5.5 5.2"/><path d="M15.5 5.4a3 3 0 0 1 0 5.7M17 14.8c2.1.6 3.3 2.3 3.5 5.2"/></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/><circle cx="15" cy="9" r="1.5"/></>,
    chat: <><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.8 8.8 0 0 1-3.5-.7L4 20l1.5-4A7.1 7.1 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z"/><path d="M4 6v16m4-14h8m-8 4h7"/></>,
    bag: <><path d="M4 8h16l-1 12H5L4 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2m-7 4v1m8-1v1"/></>,
  };
  return <svg {...common} aria-hidden="true">{paths[name]}</svg>;
}

function NavItems({ pathname, mobile = false }: { pathname: string; mobile?: boolean }) {
  return (
    <nav aria-label={mobile ? "Navegación principal móvil" : "Navegación principal"} className={mobile ? "flex w-full items-stretch justify-between gap-1" : "mx-auto flex w-full max-w-[1480px] items-center gap-1 overflow-x-auto px-4 sm:px-7"}>
      {links.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            title={link.label}
            className={`${mobile ? "min-h-12 min-w-[3.3rem] flex-1 flex-col gap-1 px-1 py-1.5" : "min-h-11 shrink-0 gap-2 px-3 py-2"} flex items-center justify-center rounded-md text-[#50636d] transition-colors hover:bg-[#e9efef] hover:text-[#004d73] ${active ? "bg-[#e5eff1] font-extrabold text-[#004d73]" : "font-semibold"}`}
          >
            <Icon name={link.icon}/>
            <span className={mobile ? "text-[11px] font-bold leading-none" : "text-sm"}>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ user, children }: { user: SessionUser | null; children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen text-[#173142]">
      <header className="sticky top-0 z-30 border-b border-[#dcd9ce] bg-[#fffdf7]">
        <div className="mx-auto flex h-[62px] max-w-[1480px] items-center gap-4 px-4 sm:px-7">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="ESCOM, inicio">
            <img src="/brand/escudo-escom.png" alt="ESCOM IPN" className="h-7 w-auto sm:h-8" />
            <span className="hidden border-l border-[#d8d5ca] pl-2.5 text-[.68rem] font-extrabold tracking-[.14em] text-[#43616e] sm:inline">COMUNIDAD</span>
          </Link>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
            {user ? <>
              <Link href="/notificaciones" aria-label="Notificaciones" title="Notificaciones" className="grid h-10 w-10 place-items-center rounded-md text-[#526974] transition hover:bg-[#e9efef] hover:text-[#004d73]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
              </Link>
              {(user.role === "admin" || user.role === "moderador") && <Link href="/admin" className="hidden rounded-md px-3 py-2 text-sm font-bold text-[#526974] hover:bg-[#e9efef] hover:text-[#004d73] sm:inline">Panel</Link>}
              {(user.role === "admin" || user.role === "moderador") && <Link href="/moderacion" className="hidden rounded-md px-3 py-2 text-sm font-bold text-[#526974] hover:bg-[#e9efef] hover:text-[#004d73] sm:inline">Moderación</Link>}
              <Link href="/perfil" className="flex min-h-10 items-center gap-2 rounded-md border border-[#e3e0d6] bg-white px-2">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-[#e5eff1] text-xs font-extrabold text-[#004d73]">{user.name.slice(0, 1)}</span>
                <span className="hidden max-w-28 truncate text-sm font-bold sm:block">{user.name.split(" ")[0]}</span>
              </Link>
              <form action={logout}><button className="min-h-10 rounded-md px-2 text-xs font-bold text-[#687780] hover:bg-[#e9efef] hover:text-[#004d73] sm:px-3 sm:text-sm">Salir</button></form>
            </> : <>
              <Link href="/entrar" className="min-h-10 rounded-md px-3 py-2 text-sm font-bold text-[#526974] hover:bg-[#e9efef] hover:text-[#004d73]">Entrar</Link>
              <Link href="/registro" className="min-h-10 rounded-md border border-[#004d73] bg-[#006699] px-3 py-2 text-sm font-bold text-white transition hover:bg-[#004d73]">Crear cuenta</Link>
            </>}
          </div>
        </div>
        <div className="hidden border-t border-[#e9e6dc] lg:block">
          <NavItems pathname={pathname} />
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-106px)] max-w-[1480px] px-4 pb-28 pt-6 sm:px-7 sm:pt-8 lg:pb-12">{children}</main>

      <div className="fixed inset-x-2 bottom-2 z-40 rounded-xl border border-[#dcd9ce] bg-[#fffdf7] p-1 shadow-[0_8px_24px_rgba(23,49,66,.13)] lg:hidden">
        <NavItems pathname={pathname} mobile />
      </div>
    </div>
  );
}
