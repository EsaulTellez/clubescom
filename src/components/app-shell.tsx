"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NavPendingBar, SubmitButton } from "@/components/loading-ui";
import { officeModules } from "@/lib/areas";
import { logout } from "@/lib/auth-actions";
import type { SessionUser } from "@/lib/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const links: { href: string; label: string; mobileLabel?: string; icon: string }[] = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/avisos", label: "Avisos", icon: "notices" },
  { href: "/clubes", label: "Clubes", icon: "people" },
  { href: "/eventos", label: "Eventos", icon: "calendar" },
  { href: "/mapa", label: "Mapa", icon: "map" },
  { href: "/foro", label: "Foro y Guías", mobileLabel: "Foro", icon: "book" },
  { href: "/objetos", label: "Objetos", icon: "bag" },
];

function Icon({ name }: { name: string }) {
  const common = { viewBox: "0 0 24 24", className: "h-[18px] w-[18px] shrink-0", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="m3.5 10 8.5-7 8.5 7"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/></>,
    notices: <><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M7 8h10M7 12h3v4H7zm7 0h3m-3 4h3"/></>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-3.4 2.3-5.2 5.5-5.2s5.1 1.8 5.5 5.2"/><path d="M15.5 5.4a3 3 0 0 1 0 5.7M17 14.8c2.1.6 3.3 2.3 3.5 5.2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/><circle cx="15" cy="9" r="1.5"/></>,
    chat: <><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.8 8.8 0 0 1-3.5-.7L4 20l1.5-4A7.1 7.1 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z"/><path d="M4 6v16m4-14h8m-8 4h7"/></>,
    bag: <><path d="M4 8h16l-1 12H5L4 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2m-7 4v1m8-1v1"/></>,
  };
  return <svg {...common} aria-hidden="true">{paths[name]}</svg>;
}

function NavItems({ pathname, modules, mobile = false }: { pathname: string; modules: readonly string[] | null; mobile?: boolean }) {
  return (
    <nav aria-label={mobile ? "Navegación principal móvil" : "Navegación principal"} className={mobile ? "flex w-full items-stretch gap-0.5" : "mx-auto flex w-full max-w-[1780px] items-center gap-1 overflow-x-auto px-4 sm:px-6 lg:px-10"}>
      {links.filter((link) => !modules || modules.includes(link.href)).map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/"
            : link.href === "/foro"
              ? pathname.startsWith("/foro") || pathname.startsWith("/guias")
              : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            title={link.label}
            className={`${mobile ? "min-h-12 min-w-0 flex-1 flex-col gap-0.5 px-0.5 py-1.5" : "min-h-11 shrink-0 gap-2 px-3 py-2"} flex items-center justify-center border-b-2 text-[#50636d] transition-colors hover:bg-[#e9efef] hover:text-[#004d73] ${active ? "border-[#155775] font-bold text-[#004d73]" : "border-transparent font-semibold"}`}
          >
            <Icon name={link.icon}/>
            <span className={mobile ? "max-w-full truncate text-center text-[10px] font-bold leading-tight" : "text-sm"}>
              {mobile && link.mobileLabel ? link.mobileLabel : link.label}
            </span>
            <NavPendingBar />
          </Link>
        );
      })}
    </nav>
  );
}

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const IDLE_WARN_MS = 28 * 60 * 1000;

export function AppShell({
  user,
  initialUnread = 0,
  children,
}: {
  user: SessionUser | null;
  initialUnread?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const modules = officeModules(user);
  const router = useRouter();
  const [realtimeUnread, setRealtimeUnread] = useState<number | null>(null);
  const [idleWarning, setIdleWarning] = useState(false);
  const unread = pathname === "/notificaciones" ? 0 : (realtimeUnread ?? initialUnread);

  useEffect(() => {
    if (!user) return;
    let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      return;
    }
    const refreshCount = async () => {
      if (!supabase) return;
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      if (typeof count === "number") setRealtimeUnread(count);
    };
    const channel = supabase
      .channel(`header-notifs-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          void refreshCount();
          router.refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    let warnTimer: ReturnType<typeof setTimeout>;
    let logoutTimer: ReturnType<typeof setTimeout>;

    const resetTimers = () => {
      setIdleWarning(false);
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      warnTimer = setTimeout(() => setIdleWarning(true), IDLE_WARN_MS);
      logoutTimer = setTimeout(async () => {
        try {
          const supabase = createSupabaseBrowserClient();
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        router.push("/entrar?inactividad=1");
        router.refresh();
      }, IDLE_LIMIT_MS);
    };

    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const ev of events) window.addEventListener(ev, resetTimers, { passive: true });
    resetTimers();

    return () => {
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      for (const ev of events) window.removeEventListener(ev, resetTimers);
    };
  }, [user, router]);

  return (
    <div className="min-h-screen text-[#173142]">
      {idleWarning && (
        <div role="alert" className="bg-[#f4e7b5] px-4 py-2 text-center text-xs font-bold text-[#58491e]">
          Tu sesión se cerrará en menos de 2 minutos por inactividad. Mueve el cursor o presiona una tecla para continuar.
        </div>
      )}
      <header className="sticky top-0 z-30 border-t-[3px] border-t-[#173e50] border-b border-[#c4c8bf] bg-[#fffdf7]">
        <div className="mx-auto flex h-[62px] max-w-[1780px] items-center gap-4 px-4 sm:px-6 lg:px-10">
          <Link href={modules?.[0] ?? "/"} className="flex shrink-0 items-center gap-2.5" aria-label="ESCOM, inicio">
            <img src="/brand/escudo-escom.png" alt="ESCOM IPN" className="h-7 w-auto sm:h-8" />
            <span className="border-l border-[#d8d5ca] pl-2.5 text-base font-bold tracking-tight text-[#244753] sm:text-xl">Comunidad</span>
            <NavPendingBar />
          </Link>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
            {user ? <>
              <Link href="/notificaciones" aria-label={unread > 0 ? `Notificaciones (${unread} sin leer)` : "Notificaciones"} title="Notificaciones" className="relative grid h-10 w-10 place-items-center rounded-md text-[#526974] transition hover:bg-[#e9efef] hover:text-[#004d73]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
                {unread > 0 && (
                  <span className="absolute right-1 top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#006699] px-1 text-[10px] font-extrabold leading-none text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
                <NavPendingBar />
              </Link>
              {user.role === "admin" && <Link href="/admin" className="rounded-md px-2 py-2 text-sm font-bold text-[#526974] hover:bg-[#e9efef] hover:text-[#004d73]">Panel<NavPendingBar /></Link>}
              {(user.role === "admin" || (user.role === "moderador" && !modules)) && <Link href="/moderacion" className="hidden rounded-md px-3 py-2 text-sm font-bold text-[#526974] hover:bg-[#e9efef] hover:text-[#004d73] sm:inline">Moderación<NavPendingBar /></Link>}
              <Link href="/perfil" className="flex min-h-10 items-center gap-2 rounded-md border border-[#e3e0d6] bg-white px-2">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-[#e5eff1] text-xs font-extrabold text-[#004d73]">{user.name.slice(0, 1)}</span>
                <span className="hidden max-w-28 truncate text-sm font-bold sm:block">{user.name.split(" ")[0]}</span>
                <NavPendingBar />
              </Link>
              <form action={logout}>
                <SubmitButton
                  pendingText="Saliendo…"
                  spinnerClassName="h-3.5 w-3.5"
                  className="min-h-10 rounded-md px-2 text-xs font-bold text-[#687780] hover:bg-[#e9efef] hover:text-[#004d73] sm:px-3 sm:text-sm"
                >
                  Salir
                </SubmitButton>
              </form>
            </> : <>
              <Link href="/entrar" className="min-h-10 rounded-md px-3 py-2 text-sm font-bold text-[#526974] hover:bg-[#e9efef] hover:text-[#004d73]">Entrar<NavPendingBar /></Link>
              <Link href="/registro" className="min-h-10 rounded-sm border border-[#164b62] bg-[#155775] px-3 py-2 text-sm font-bold text-white transition hover:bg-[#004d73]">Crear cuenta<NavPendingBar /></Link>
            </>}
          </div>
        </div>
        <div className="hidden border-t border-[#e9e6dc] lg:block">
          <NavItems modules={modules} pathname={pathname} />
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-106px)] max-w-[1780px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-10 lg:pb-12">{children}</main>

      <div className="fixed inset-x-2 bottom-2 z-40 rounded-sm border border-[#dcd9ce] bg-[#fffdf7] p-1 shadow-[0_8px_24px_rgba(23,49,66,.13)] lg:hidden">
        <NavItems modules={modules} pathname={pathname} mobile />
      </div>
    </div>
  );
}
