import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, card, input } from "@/lib/ui";
import { AREAS, areaLabel, firstParam, isArea, isStaff } from "./shared";

export const dynamic = "force-dynamic";

type GuideRow = {
  id: string;
  area: string;
  title: string;
  summary: string;
  step_count: number;
  version: number;
};

export default async function GuiasPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string | string[]; q?: string | string[] }>;
}) {
  const params = await searchParams;
  const areaParam = firstParam(params.area);
  const area = areaParam && isArea(areaParam) ? areaParam : null;
  const query = (firstParam(params.q) ?? "").trim().slice(0, 120);
  const user = await getSession();

  let guides: GuideRow[] = [];
  let suggestions: GuideRow[] = [];
  let dbDown = false;
  try {
    const result = await pool.query<GuideRow>(
      `select id, area, title, summary, jsonb_array_length(steps) as step_count, version
       from guides
       where ($1::text is null or area = $1)
         and ($2::text is null or title ilike $2 escape '!' or summary ilike $2 escape '!')
       order by case when $2::text is null then 0 else greatest(similarity(title, $3), similarity(summary, $3)) end desc,
                created_at desc`,
      [area, query ? `%${query.replace(/[!%_]/g, "!$&")}%` : null, query],
    );
    guides = result.rows;

    if (query && guides.length === 0) {
      const nearby = await pool.query<GuideRow>(
        `select id, area, title, summary, jsonb_array_length(steps) as step_count, version
         from guides
         where ($1::text is null or area = $1)
           and greatest(similarity(title, $2), similarity(summary, $2)) >= 0.08
         order by greatest(similarity(title, $2), similarity(summary, $2)) desc, created_at desc
         limit 3`,
        [area, query],
      );
      suggestions = nearby.rows;
    }
  } catch {
    dbDown = true;
  }

  const forumArea = area ?? "general";
  const resetHref = area ? `/guias?area=${area}` : "/guias";

  return (
    <div className="space-y-6">
      <PageIntro
        kicker="Trámites"
        title="Guías"
        text="Pasos para trámites de la escuela. Si un paso está incompleto, puedes sugerir una mejora."
        action={
          user && isStaff(user.role) ? (
            <Link href="/guias/nueva" className={btn}>
              Nueva guía
            </Link>
          ) : undefined
        }
      />

      <nav aria-label="Filtrar guías por área" className="board-tag-row">
        <Link href="/guias" aria-current={!area ? "page" : undefined}>
          Todas
        </Link>
        {AREAS.map((item) => (
          <Link
            key={item.id}
            href={`/guias?area=${item.id}`}
            aria-current={area === item.id ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <form action="/guias" method="get" className="board-sidecard flex flex-col gap-3 p-4 sm:flex-row">
        {area && <input type="hidden" name="area" value={area} />}
        <label htmlFor="guide-search" className="sr-only">Buscar una guía</label>
        <input
          id="guide-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="¿Qué trámite necesitas resolver?"
          className={`${input} min-w-0 flex-1`}
        />
        <button className={btn}>Buscar guías</button>
      </form>

      {dbDown && (
        <p className={card}>No se pudieron leer las guías. Revisa que Postgres esté en marcha.</p>
      )}

      <div className="board-section-heading"><div><p className="board-eyebrow">Orientación escolar</p><h2>Catálogo de guías</h2></div><span className="board-label">{guides.length} {guides.length === 1 ? "guía" : "guías"}</span></div>
      <div className="grid gap-3 md:grid-cols-2">
        {guides.map((guide) => (
          <article key={guide.id} className="board-sidecard flex flex-col border-t-4 border-t-[#006699] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="board-label">{areaLabel(guide.area)}</span><span className="text-xs font-bold text-[#647780]">Versión {guide.version}</span></div>
            <h2 className="mt-4 text-xl font-extrabold text-[#1b4053]"><Link href={`/guias/${guide.id}`} className="hover:text-[#006699]">{guide.title}</Link></h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-[#5f6e78]">{guide.summary}</p>
            <div className="mt-5 flex items-center justify-between border-t border-[#e9e6dc] pt-3 text-xs font-bold text-[#5f6e78]"><span>{guide.step_count} {guide.step_count === 1 ? "paso" : "pasos"}</span><Link href={`/guias/${guide.id}`} className="text-[#006699]">Consultar guía →</Link></div>
          </article>
        ))}
      </div>

      {query && guides.length > 0 && (
        <p className="text-sm text-[#72788a]">
          {guides.length === 1 ? "Encontramos una guía" : `Encontramos ${guides.length} guías`} para “{query}”.
          <Link href={resetHref} className="ml-2 font-semibold text-[#006699] hover:underline">Limpiar búsqueda</Link>
        </p>
      )}

      {!dbDown && query && guides.length === 0 && (
        <section className="board-sidecard p-6 sm:p-8">
          <p className="text-sm font-semibold text-[#006699]">No encontramos una coincidencia exacta</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">¿Quizá buscabas una de estas?</h2>
          {suggestions.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((guide) => (
                <Link key={guide.id} href={`/guias/${guide.id}`} className="rounded-md border border-[#dcd9ce] p-4 transition hover:border-[#006699] hover:bg-[#edf5f5]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#006699]">{areaLabel(guide.area)}</p>
                  <h3 className="mt-1 font-bold">{guide.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-[#72788a]">{guide.summary}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#72788a]">Todavía no hay guías parecidas en esta área.</p>
          )}
          <div className="mt-5 rounded-2xl bg-[#f6f7fb] p-4">
            <p className="font-semibold">¿Sigues con la duda?</p>
            <p className="mt-1 text-sm text-[#72788a]">Déjala en el foro y la comunidad podrá orientarte.</p>
            <Link href={`/foro?area=${forumArea}`} className="mt-3 inline-flex rounded-full bg-[#006699] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#004d73]">
              Preguntar en {areaLabel(forumArea)}
            </Link>
          </div>
        </section>
      )}

      {!dbDown && !query && guides.length === 0 && (
        <p className={card}>{area ? `Todavía no hay guías en ${areaLabel(area)}.` : "Todavía no hay guías publicadas."}</p>
      )}
    </div>
  );
}
