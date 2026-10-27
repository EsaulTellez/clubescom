import Link from "next/link";
import { Cover } from "@/components/cover";
import { PageIntro } from "@/components/page-intro";
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
      <PageIntro
        kicker="Comunidad"
        title="Objetos"
        text="Reportes abiertos de la comunidad. Si un perdido y un encontrado se parecen, avisamos a las dos personas."
        action={
          <Link className={btn} href={user ? "/objetos/nuevo" : "/entrar"}>
            {user ? "Reportar objeto" : "Inicia sesión para reportar"}
          </Link>
        }
      />

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
              <Link href={`/objetos/${item.id}`} className={`${card} block h-full overflow-hidden p-0 hover:border-[#006699]`}>
                <Cover tone={item.kind} kicker={kindLabel[item.kind]} title={item.title} className="h-32" />
                <div className="p-4">
                  <span className="rounded-full bg-[#e6f3fa] px-2 py-1 text-xs text-[#006699]">{statusLabel[item.status]}</span>
                  <p className="mt-2 text-sm text-[#667085]">{item.place}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
