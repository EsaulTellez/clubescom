import Link from "next/link";
import { ReportNotice } from "./report-notice";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isKind, type ItemKind, type ItemStatus } from "./labels";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  kind: ItemKind;
  title: string;
  place: string;
  description: string;
  photo_url: string | null;
  photo_url_2: string | null;
  status: ItemStatus;
  created_at: string;
};

export default async function ObjetosPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string | string[]; tab?: string | string[] }>;
}) {
  const query = await searchParams;
  const raw = Array.isArray(query.kind) ? query.kind[0] : query.kind;
  const tabRaw = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const kind = raw && isKind(raw) ? raw : null;
  const user = await getSession();
  const isHistory = Boolean(user) && tabRaw === "historial";

  const { rows } =
    isHistory && user
      ? await pool.query<Row>(
          `select distinct li.id, li.kind, li.title, li.description, li.place, li.photo_url, li.photo_url_2, li.status, li.created_at
           from lost_items li
           left join lost_item_claims c on c.lost_item_id = li.id
           where (li.reporter_id = $1 or c.claimant_id = $1)
             and ($2::text is null or li.kind = $2)
           order by li.created_at desc`,
          [user.id, kind],
        )
      : await pool.query<Row>(
          `select id, kind, title, description, place, photo_url, photo_url_2, status, created_at
           from lost_items
           where status = 'abierto' and ($1::text is null or kind = $1)
           order by created_at desc`,
          [kind],
        );

  const filters = [
    { href: "/objetos", label: "Todos", active: !isHistory && !kind },
    { href: "/objetos?kind=perdido", label: "Perdidos", active: !isHistory && kind === "perdido" },
    { href: "/objetos?kind=encontrado", label: "Encontrados", active: !isHistory && kind === "encontrado" },
    ...(user
      ? [
          {
            href: "/objetos?tab=historial",
            label: "Mi historial",
            active: isHistory,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <header className="border-y border-[#b8c1bd] bg-[#fffdf7] px-4 pt-6 sm:px-7 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5">
          <h1 className="font-[Georgia,serif] text-4xl leading-tight font-bold tracking-tight text-[#193c4a] sm:text-5xl">
            Perdidos <span className="font-normal italic">y encontrados</span>
          </h1>
          <Link className="rounded-sm bg-[#155775] px-4 py-3 text-sm font-bold text-white hover:bg-[#123e54]" href={user ? "/objetos/nuevo" : "/entrar"}>
            {user ? "+ Reportar objeto" : "Inicia sesión para reportar"}
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 border-t border-[#d6d6ca]">
          <nav aria-label="Filtrar reportes" className="flex flex-wrap gap-x-4 sm:gap-x-6">
            {filters.map((filter) => (
              <Link key={filter.href} href={filter.href} aria-current={filter.active ? "page" : undefined}
                className={`border-b-[3px] py-3 text-sm font-bold ${filter.active ? "border-[#155775] text-[#155775]" : "border-transparent text-[#56666b] hover:text-[#155775]"}`}>
                {filter.label}
              </Link>
            ))}
          </nav>
          <p className="py-2 text-xs tabular-nums text-[#56666b]">{rows.length} {rows.length === 1 ? "reporte" : "reportes"}{!isHistory && (rows.length === 1 ? " abierto" : " abiertos")}</p>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="border border-dashed border-[#c5c4b8] bg-[#fffdf7] px-5 py-10 text-center text-[#4f6269]">
          {isHistory ? "Todavía no tienes reportes ni reclamos en tu historial." : kind ? "No hay reportes abiertos de este tipo." : "Todavía no hay reportes abiertos."}
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,28rem),1fr))] gap-5">
          {rows.map((item) => (
            <li key={item.id} className="min-w-0">
              <Link href={`/objetos/${item.id}`} className="block h-full">
                <ReportNotice item={item} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
