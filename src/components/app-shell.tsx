"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  const common = { viewBox: "0 0 24 24", className: "h-5 w-5", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
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

function NavItems({ pathname, onNavigate, mobile = false }: { pathname: string; onNavigate?: () => void; mobile?: boolean }) {
  return <nav aria-label="Secciones" className={mobile ? "flex w-full items-center justify-around gap-1" : "flex flex-col gap-2"}>
    {links.map((link) => {
      const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
      return <Link key={link.href} href={link.href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={link.label}
        className={`${mobile ? "min-w-0 flex-1 flex-col gap-1 px-1 py-2" : "group relative h-12 w-12 justify-center"} flex items-center rounded-2xl text-sm transition duration-200 ${active ? "bg-[#006699] text-white shadow-[0_8px_20px_rgba(0,102,153,0.3)]" : "text-[#656b7c] hover:bg-white hover:text-[#004d73] hover:shadow-[0_5px_18px_rgba(27,31,56,0.09)]"}`}>
        <Icon name={link.icon}/>
        <span className={mobile ? "text-[10px] font-medium" : "pointer-events-none absolute left-[calc(100%+14px)] z-50 whitespace-nowrap rounded-xl bg-[#202235] px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100"}>{link.label}</span>
      </Link>;
    })}
  </nav>;
}

export function AppShell({ user, children }: { user: SessionUser | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const [dockVisible, setDockVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openDock() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setDockVisible(true);
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setDockVisible(false), 450);
  }
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  function closeAfterNavigation() {
    setPinned(false);
    setDockVisible(false);
  }

  return (
    <div className="min-h-screen text-[#222337]">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/75 px-4 backdrop-blur-2xl sm:px-7">
        <div className="mx-auto flex h-[66px] max-w-[1480px] items-center gap-4">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="ESCOM, inicio">
            <img src="/brand/escudo-escom.png" alt="ESCOM IPN" className="h-7 w-auto sm:h-8" />
            <span className="hidden text-xs font-semibold tracking-wide text-[#777c8d] sm:inline">COMUNIDAD</span>
          </Link>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {user ? <>
              <Link href="/notificaciones" aria-label="Notificaciones" title="Notificaciones" className="grid h-10 w-10 place-items-center rounded-2xl text-[#62677a] transition hover:bg-[#e6f3fa] hover:text-[#004d73]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
              </Link>
              {(user.role === "admin" || user.role === "moderador") && <Link href="/admin" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-[#62677a] hover:bg-[#e6f3fa] hover:text-[#004d73] sm:inline">Panel</Link>}
              <Link href="/perfil" className="flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 shadow-[0_2px_12px_rgba(25,28,52,0.07)]">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#006699] to-[#40a7d1] text-xs font-bold text-white">{user.name.slice(0, 1)}</span>
                <span className="hidden max-w-28 truncate text-sm font-semibold sm:block">{user.name.split(" ")[0]}</span>
              </Link>
              <form action={logout}><button className="rounded-full px-2 py-2 text-xs font-semibold text-[#828698] hover:text-[#004d73] sm:px-3 sm:text-sm">Salir</button></form>
            </> : <>
              <Link href="/entrar" className="rounded-full px-3 py-2 text-sm font-semibold text-[#62677a] hover:text-[#004d73]">Entrar</Link>
              <Link href="/registro" className="rounded-full bg-[#006699] px-4 py-2 text-sm font-semibold text-white shadow-[0_5px_16px_rgba(0,102,153,0.25)] transition hover:-translate-y-0.5 hover:bg-[#005580]">Crear cuenta</Link>
            </>}
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-66px)] max-w-[1480px] px-4 pb-28 pt-6 sm:px-7 sm:pt-8 lg:pb-12 lg:pl-24 lg:pr-10">{children}</main>

      <div className="fixed inset-y-0 left-0 z-40 hidden w-5 lg:block" onPointerEnter={openDock} onPointerLeave={scheduleClose}>
        <button type="button" aria-label="Abrir menú de navegación" aria-expanded={dockVisible || pinned} onFocus={openDock} onClick={() => { setPinned(true); openDock(); }}
          className="absolute left-0 top-1/2 grid h-16 w-5 -translate-y-1/2 place-items-center rounded-r-xl border border-l-0 border-white/80 bg-white/85 text-[#006699] shadow-[0_5px_22px_rgba(0,64,96,0.15)] backdrop-blur-xl transition hover:w-7 focus-visible:w-7">
          <svg viewBox="0 0 16 24" className="h-5 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 5 6 7-6 7"/></svg>
        </button>
      </div>
      <aside onPointerEnter={openDock} onPointerLeave={() => { if (!pinned) scheduleClose(); }} onFocus={openDock} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) scheduleClose(); }}
        aria-label="Dock de navegación" className={`fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 rounded-[28px] border border-white/75 bg-white/80 p-2 shadow-[0_18px_60px_rgba(0,64,96,0.18)] backdrop-blur-2xl transition-all duration-300 lg:block ${dockVisible || pinned ? "translate-x-0 opacity-100" : "-translate-x-[calc(100%+24px)] opacity-0 pointer-events-none"}`}>
        <button type="button" aria-label={pinned ? "Desfijar dock" : "Fijar dock"} title={pinned ? "Desfijar dock" : "Fijar dock"} onClick={() => setPinned(!pinned)} className="mx-auto mb-2 grid h-7 w-7 place-items-center rounded-full text-[#9a9cad] hover:bg-[#e6f3fa] hover:text-[#004d73]">
          <span className={`h-2 w-2 rounded-full ${pinned ? "bg-[#006699]" : "bg-[#d8d5e7]"}`} />
        </button>
        <NavItems pathname={pathname} onNavigate={closeAfterNavigation} />
      </aside>

      <div className="fixed inset-x-2 bottom-2 z-40 rounded-[26px] border border-white/75 bg-white/85 p-1.5 shadow-[0_12px_45px_rgba(0,64,96,0.2)] backdrop-blur-2xl lg:hidden">
        <NavItems pathname={pathname} mobile />
      </div>
    </div>
  );
}
