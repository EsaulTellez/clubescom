import Link from "next/link";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, btnGhost, card } from "@/lib/ui";
import { isKind, kindLabel, statusLabel, type ItemKind, type ItemStatus } from "./labels";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  kind: ItemKind;
  title: string;
  place: string;
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
    `select id, kind, title, place, status, created_at
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Objetos perdidos y encontrados</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#5C4A45]">
            Reportes abiertos de la comunidad. Si un perdido y un encontrado se parecen, avisamos a las dos personas.
          </p>
        </div>
        {user ? (
          <Link className={btn} href="/objetos/nuevo">
            Reportar objeto
          </Link>
        ) : (
          <Link className={btn} href="/entrar">
            Inicia sesión para reportar
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Link key={filter.href} href={filter.href} className={filter.active ? btn : btnGhost}>
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
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((item) => (
            <li key={item.id}>
              <Link href={`/objetos/${item.id}`} className={`${card} block h-full hover:border-[#6B1D2A]`}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-[#6B1D2A] px-2 py-1 font-medium text-white">
                    {kindLabel[item.kind]}
                  </span>
                  <span className="rounded-full bg-[#F6F1EA] px-2 py-1">{statusLabel[item.status]}</span>
                </div>
                <h2 className="mt-2 font-semibold">{item.title}</h2>
                <p className="mt-1 text-sm text-[#5C4A45]">{item.place}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
