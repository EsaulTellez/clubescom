import Link from "next/link";
import { Cover } from "@/components/cover";
import { PageIntro } from "@/components/page-intro";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, btnGhost, card } from "@/lib/ui";
import { AREAS, areaLabel, firstParam, isArea, isStaff } from "./shared";

export const dynamic = "force-dynamic";

type GuideRow = {
  id: string;
  area: string;
  title: string;
  summary: string;
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
      `select id, area, title, summary
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
        `select id, area, title, summary
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

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link href="/guias" className={area ? btnGhost : btn}>
          Todas
        </Link>
        {AREAS.map((item) => (
          <Link
            key={item.id}
            href={`/guias?area=${item.id}`}
            className={area === item.id ? btn : btnGhost}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <form action="/guias" method="get" className={`${card} flex flex-col gap-3 sm:flex-row`}>
        {area && <input type="hidden" name="area" value={area} />}
        <label htmlFor="guide-search" className="sr-only">Buscar una guía</label>
        <input
          id="guide-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="¿Qué trámite necesitas resolver?"
          className="min-w-0 flex-1 rounded-2xl border border-[#e6e8ee] bg-[#f8fafc] px-4 py-3 text-sm outline-none transition focus:border-[#006699] focus:ring-4 focus:ring-[#006699]/10"
        />
        <button className={btn}>Buscar guías</button>
      </form>

      {dbDown && (
        <p className={card}>No se pudieron leer las guías. Revisa que Postgres esté en marcha.</p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {guides.map((guide) => (
          <article key={guide.id} className={`${card} overflow-hidden p-0`}>
            <Link href={`/guias/${guide.id}`}>
              <Cover tone={guide.area} kicker={areaLabel(guide.area)} title={guide.title} className="h-36" />
            </Link>
            <div className="p-4">
              <h2 className="font-serif text-2xl">
                <Link href={`/guias/${guide.id}`}>{guide.title}</Link>
              </h2>
              <p className="mt-2 text-sm text-[#667085]">{guide.summary}</p>
            </div>
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
        <section className="rounded-3xl border border-[#e6e9ef] bg-white p-6 shadow-[0_6px_24px_rgba(22,34,51,0.04)] sm:p-8">
          <p className="text-sm font-semibold text-[#006699]">No encontramos una coincidencia exacta</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">¿Quizá buscabas una de estas?</h2>
          {suggestions.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((guide) => (
                <Link key={guide.id} href={`/guias/${guide.id}`} className="rounded-2xl border border-[#e6e9ef] p-4 transition hover:border-[#006699] hover:bg-[#fafaff]">
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
