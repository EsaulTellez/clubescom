import Link from "next/link";
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
  searchParams: Promise<{ area?: string | string[] }>;
}) {
  const areaParam = firstParam((await searchParams).area);
  const area = areaParam && isArea(areaParam) ? areaParam : null;
  const user = await getSession();

  let guides: GuideRow[] = [];
  let dbDown = false;
  try {
    const result = await pool.query<GuideRow>(
      `select id, area, title, summary
       from guides
       where ($1::text is null or area = $1)
       order by created_at desc`,
      [area],
    );
    guides = result.rows;
  } catch {
    dbDown = true;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Guías</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#667085]">
            Pasos para trámites de la escuela. Si un paso está incompleto, puedes sugerir una mejora.
          </p>
        </div>
        {user && isStaff(user.role) && (
          <Link href="/guias/nueva" className={btn}>
            Nueva guía
          </Link>
        )}
      </header>

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

      {dbDown && (
        <p className={card}>No se pudieron leer las guías. Revisa que Postgres esté en marcha.</p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {guides.map((guide) => (
          <article key={guide.id} className={card}>
            <p className="text-xs uppercase tracking-wide text-[#006699]">
              {areaLabel(guide.area)}
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              <Link href={`/guias/${guide.id}`} className="hover:underline">
                {guide.title}
              </Link>
            </h2>
            <p className="mt-2 text-sm text-[#667085]">{guide.summary}</p>
          </article>
        ))}
      </div>

      {!dbDown && guides.length === 0 && (
        <p className={card}>
          {area
            ? `Todavía no hay guías en ${areaLabel(area)}.`
            : "Todavía no hay guías publicadas."}
        </p>
      )}
    </div>
  );
}
