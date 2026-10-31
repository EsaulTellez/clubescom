import Link from "next/link";
import { Cover } from "@/components/cover";
import { PageIntro } from "@/components/page-intro";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, card } from "@/lib/ui";
import { isKind, kindLabel, statusLabel, type ItemKind, type ItemStatus } from "./labels";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  kind: ItemKind;
  title: string;
  place: string;
  photo_url: string | null;
  status: ItemStatus;
  created_at: string;
};

export default async function ObjetosPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  const query = await searchParams;
  const raw = Array.isArray(query.kind) ? query.kind[0] : query.kind;
  const kind = raw && isKind(raw) ? raw : null;
  const user = await getSession();
  const { rows } = await pool.query<Row>(
    `select id, kind, title, place, photo_url, status, created_at
     from lost_items
     where status = 'abierto' and ($1::text is null or kind = $1)
     order by created_at desc`,
    [kind],
  );

  const filters = [
    { href: "/objetos", label: "Todos", active: !kind },
    { href: "/objetos?kind=perdido", label: "Perdidos", active: kind === "perdido" },
    { href: "/objetos?kind=encontrado", label: "Encontrados", active: kind === "encontrado" },
  ];

  const lostCount = rows.filter((item) => item.kind === "perdido").length;
  const foundCount = rows.filter((item) => item.kind === "encontrado").length;

  return (
    <div className="space-y-7">
      <PageIntro
        kicker="Comunidad"
        title="Perdidos y encontrados"
        text="Una mano entre politécnicos: publica un hallazgo, reconoce algo tuyo y coordina la entrega con cuidado."
        action={
          <Link className={btn} href={user ? "/objetos/nuevo" : "/entrar"}>
            {user ? "Reportar objeto" : "Inicia sesión para reportar"}
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de reportes">
        <div className="rounded-3xl border border-white bg-white/85 p-4 shadow-[0_8px_24px_rgba(0,64,96,0.06)]"><p className="text-2xl font-extrabold text-[#006699]">{rows.length}</p><p className="mt-1 text-xs font-semibold text-[#667085]">Reportes abiertos</p></div>
        <div className="rounded-3xl border border-white bg-white/85 p-4 shadow-[0_8px_24px_rgba(0,64,96,0.06)]"><p className="text-2xl font-extrabold text-[#006699]">{lostCount}</p><p className="mt-1 text-xs font-semibold text-[#667085]">Cosas por encontrar</p></div>
        <div className="rounded-3xl border border-white bg-white/85 p-4 shadow-[0_8px_24px_rgba(0,64,96,0.06)]"><p className="text-2xl font-extrabold text-[#006699]">{foundCount}</p><p className="mt-1 text-xs font-semibold text-[#667085]">Hallazgos publicados</p></div>
      </section>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Link key={filter.href} href={filter.href} aria-current={filter.active ? "page" : undefined} className={`${filter.active ? "bg-[#006699] text-white shadow-[0_6px_18px_rgba(0,102,153,0.18)]" : "border border-[#dceaf1] bg-white/85 text-[#526170] hover:border-[#9fc9dc] hover:text-[#004d73]"} inline-flex items-center rounded-full px-4 py-2 text-sm font-bold transition`}>
            {filter.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className={card}>
          {kind
            ? "No hay reportes abiertos de este tipo."
            : "Todavía no hay reportes abiertos. Sé la primera persona en publicar uno."}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((item) => (
            <li key={item.id}>
              <Link href={`/objetos/${item.id}`} className="group block h-full overflow-hidden rounded-[28px] border border-white bg-white/90 shadow-[0_10px_34px_rgba(0,64,96,0.07)] transition duration-200 hover:-translate-y-1 hover:border-[#b7d4e4] hover:shadow-[0_18px_44px_rgba(0,64,96,0.13)]">
                <div className="relative">
                  <Cover tone={item.kind} image={item.photo_url} className="h-52" />
                  <span className={`absolute left-3 top-3 rounded-full px-3 py-1.5 text-xs font-extrabold shadow-sm ${item.kind === "perdido" ? "bg-white text-[#9b4c2f]" : "bg-white text-[#006699]"}`}>{kindLabel[item.kind]}</span>
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-extrabold leading-snug tracking-tight text-[#222337] group-hover:text-[#006699]">{item.title}</h2>
                    <span className="shrink-0 rounded-full bg-[#e6f3fa] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#006699]">{statusLabel[item.status]}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[#667085]">
                    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-[#006699]" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M16 8.5c0 4.8-6 9-6 9s-6-4.2-6-9a6 6 0 1 1 12 0Z"/><circle cx="10" cy="8.5" r="2"/></svg>
                    <span className="truncate">{item.place}</span>
                  </div>
                  <p className="border-t border-[#edf2f5] pt-3 text-xs font-medium text-[#9095a4]">Publicado {new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" }).format(new Date(item.created_at))}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
