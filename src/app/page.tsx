import Link from "next/link";
import { Cover } from "@/components/cover";
import { StoryCarousel, type StoryCard } from "@/components/story-carousel";
import { pool } from "@/lib/db";
import { card } from "@/lib/ui";
import { demoClubArt, demoNoticeArt, demoNoticeAuthor } from "@/lib/demo-art";

export const dynamic = "force-dynamic";

type Aviso = {
  id: string;
  title: string;
  body: string;
  category: string;
  publish_at: Date;
  featured: boolean;
};

type Club = {
  id: string;
  name: string;
  kind: string;
};

const categoryLabel: Record<string, string> = {
  academico: "Académico",
  social: "Comunidad",
  tramites: "Trámites",
};

function when(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    timeZone: "America/Mexico_City",
  }).format(value);
}

export default async function HomePage() {
  let avisos: Aviso[] = [];
  let clubs: Club[] = [];
  let dbDown = false;
  try {
    const news = await pool.query<Aviso>(
      `select id, title, body, category, publish_at, featured from avisos
       where is_public and publish_at <= now()
       order by publish_at desc
       limit 12`,
    );
    const popular = await pool.query<Club>(
      `select id, name, kind from clubs where active = true order by name asc limit 4`,
    );
    avisos = news.rows;
    clubs = popular.rows;
  } catch {
    dbDown = true;
  }

  const stories: StoryCard[] = [...avisos]
    .sort((a, b) => Number(Boolean(demoNoticeArt(b.title))) - Number(Boolean(demoNoticeArt(a.title))) || b.publish_at.getTime() - a.publish_at.getTime())
    .slice(0, 4)
    .map((aviso) => ({
    href: `/avisos/${aviso.id}`,
    title: aviso.title,
    kicker: categoryLabel[aviso.category] ?? aviso.category,
    tone: aviso.category,
    image: demoNoticeArt(aviso.title),
  }));

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-6">
        {dbDown && (
          <p className={card}>
            Postgres no responde. Levanta el contenedor con <code>docker compose up -d</code> y corre <code>npm run db:seed</code>.
          </p>
        )}

        <section aria-label="Carrusel de eventos y avisos">
          <h2 className="sr-only">Eventos y avisos</h2>
          <StoryCarousel items={stories} />
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-2xl font-bold tracking-tight">Lo más reciente</h2>
            <Link href="/avisos" className="text-sm text-[#667085] hover:text-[#006699]">
              Ver avisos
            </Link>
          </div>
          {avisos.length ? (
            <div className="space-y-4">
              {avisos.map((aviso) => (
                <article key={aviso.id} className="overflow-hidden rounded-3xl border border-[#e6e9ef] bg-white shadow-[0_6px_24px_rgba(22,34,51,0.04)]">
                  <div className="flex items-center gap-3 p-5 pb-0 sm:px-6 sm:pt-6">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e6f3fa] text-sm font-bold text-[#006699]">E</div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{demoNoticeAuthor(aviso.title)}</p>
                      <p className="text-xs text-[#72788a]">{categoryLabel[aviso.category] ?? aviso.category} <span className="mx-1">·</span>{when(aviso.publish_at)}</p>
                    </div>
                    {aviso.featured && <span className="rounded-full bg-[#eef0ff] px-3 py-1 text-xs font-semibold text-[#5542c5]">Destacado</span>}
                  </div>
                  <div className="px-5 pb-4 pt-4 sm:px-6">
                    <h3 className="text-xl font-bold leading-snug tracking-tight"><Link href={`/avisos/${aviso.id}`} className="hover:text-[#006699]">{aviso.title}</Link></h3>
                    <p className="mt-2 whitespace-pre-line text-[15px] leading-7 text-[#4b5261]">{aviso.body}</p>
                  </div>
                  <Link href={`/avisos/${aviso.id}`} className="block px-5 pb-5 sm:px-6 sm:pb-6" aria-label={`Abrir aviso: ${aviso.title}`}>
                    {demoNoticeArt(aviso.title) ? (
                      <img src={demoNoticeArt(aviso.title)!} alt={`Cartel: ${aviso.title}`} className="max-h-[34rem] w-full rounded-2xl bg-[#f4f3f0] object-contain" />
                    ) : (
                      <Cover tone={aviso.category} kicker={categoryLabel[aviso.category] ?? aviso.category} title={aviso.title} className="h-56 rounded-2xl sm:h-72" />
                    )}
                  </Link>
                  <div className="mx-5 border-t border-[#eef0f4] py-3 sm:mx-6">
                    <Link href={`/avisos/${aviso.id}`} className="block rounded-xl py-2 text-center text-sm font-semibold text-[#72788a] transition hover:bg-[#f5f6fa] hover:text-[#006699]">💬 Ver publicación</Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            !dbDown && <p className="rounded-3xl border border-dashed border-[#d9deea] bg-white p-8 text-center text-sm text-[#72788a]">Todavía no hay avisos. Cuando publiquen algo, aparecerá aquí 👀</p>
          )}
        </section>
      </div>

      <aside className={`${card} rounded-3xl border-[#e6e9ef] shadow-[0_6px_24px_rgba(22,34,51,0.04)] xl:sticky xl:top-24`}>
        <h2 className="text-lg font-bold tracking-tight">Clubes que te pueden gustar</h2>
        <p className="mt-1 text-sm text-[#72788a]">Encuentra a tu gente.</p>
        <ul className="mt-4 space-y-4">
          {clubs.map((club) => (
            <li key={club.id}>
              <Link href={`/clubes/${club.id}`} className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#e6f3fa] text-sm font-semibold text-[#006699]">
                  {demoClubArt(club.name) ? <img src={demoClubArt(club.name)!} alt="" className="h-full w-full object-cover" /> : club.name.replace("Club de ", "").slice(0, 1)}
                </span>
                <span>
                  <span className="block text-sm font-medium">{club.name}</span>
                  <span className="block text-xs capitalize text-[#667085]">{club.kind}</span>
                </span>
              </Link>
            </li>
          ))}
          {clubs.length === 0 && !dbDown && (
            <li className="text-sm text-[#667085]">Cuando haya clubes registrados, aparecen aquí.</li>
          )}
        </ul>
        <Link href="/clubes" className="mt-5 inline-block text-sm text-[#006699]">
          Ver más
        </Link>
      </aside>
    </div>
  );
}
