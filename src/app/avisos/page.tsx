import Link from "next/link";
import { Cover } from "@/components/cover";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, btnGhost, card, input } from "@/lib/ui";
import {
  CATEGORIES,
  canManageAvisos,
  categoryLabel,
  formatWhen,
  isCategory,
  likePattern,
} from "./shared";

export const dynamic = "force-dynamic";

type AvisoCard = {
  id: string;
  title: string;
  body: string;
  category: string;
  featured: boolean;
  publish_at: Date;
};

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value ?? "").trim();
}

export default async function AvisosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; categoria?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = one(params.q);
  const categoria = one(params.categoria);
  const category = isCategory(categoria) ? categoria : "";
  const user = await getSession();

  const { rows } = await pool.query<AvisoCard>(
    `select id, title, body, category, featured, publish_at
     from avisos
     where is_public
       and publish_at <= now()
       and ($1::text is null or title ilike $1 escape '!' or body ilike $1 escape '!')
       and ($2::text is null or category = $2)
     order by publish_at desc`,
    [q ? likePattern(q) : null, category || null],
  );

  const featured = rows.filter((aviso) => aviso.featured);
  const filtering = Boolean(q || category);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[#006699]">Comunicación</p>
          <h1 className="font-serif text-4xl tracking-tight">Avisos</h1>
        </div>
        {canManageAvisos(user) && (
          <Link href="/avisos/nuevo" className={btn}>
            Nuevo aviso
          </Link>
        )}
      </div>

      <form method="get" className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-center">
        <input
          className={input}
          name="q"
          defaultValue={q}
          placeholder="Buscar por título o contenido"
          aria-label="Buscar avisos"
        />
        <select className={input} name="categoria" defaultValue={category} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {categoryLabel(item)}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button className={btn}>Buscar</button>
          {filtering && (
            <Link href="/avisos" className={btnGhost}>
              Limpiar
            </Link>
          )}
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Destacados</h2>
        {featured.length === 0 ? (
          <p className="text-sm text-[#5C4A45]">
            {filtering
              ? "Ningún aviso destacado coincide con esta búsqueda."
              : "Todavía no hay avisos destacados."}
          </p>
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory">
            {featured.map((aviso) => (
              <Link key={aviso.id} href={`/avisos/${aviso.id}`} className="w-[min(100%,18rem)] shrink-0 snap-start">
                <Cover
                  tone={aviso.category}
                  kicker={categoryLabel(aviso.category)}
                  title={aviso.title}
                  className="h-52 rounded-2xl"
                />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cronología</h2>
        {rows.length === 0 ? (
          <p className={card}>
            {filtering
              ? "No hay avisos que coincidan con esta búsqueda."
              : "Todavía no hay avisos publicados."}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((aviso) => (
              <Link
                key={aviso.id}
                href={`/avisos/${aviso.id}`}
                className={`${card} hover:border-[#6B1D2A]`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-[#6B1D2A]">
                    {categoryLabel(aviso.category)}
                  </p>
                  {aviso.featured && (
                    <span className="rounded-full bg-[#F6F1EA] px-2 py-0.5 text-xs text-[#6B1D2A]">
                      Destacado
                    </span>
                  )}
                </div>
                <h3 className="mt-1 font-semibold">{aviso.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm text-[#5C4A45]">{aviso.body}</p>
                <p className="mt-3 text-xs text-[#5C4A45]">{formatWhen(aviso.publish_at)}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
