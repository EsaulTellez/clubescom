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
    <div className="board-page">
      <header className="board-masthead">
        <div>
          <p className="board-eyebrow">Comunidad ESCOM · tablero abierto</p>
          <h1>Lo que pasa en la escuela, en un solo lugar.</h1>
          <p className="board-masthead__text">
            Avisos de la comunidad, actividades y espacios para encontrar a tu gente.
          </p>
        </div>
        <nav className="board-shortcuts" aria-label="Atajos del tablero">
          <Link href="/avisos" className="board-shortcut">📌 Avisos</Link>
          <Link href="/clubes" className="board-shortcut">✳ Clubes</Link>
          <Link href="/foro" className="board-shortcut">💬 Foro</Link>
        </nav>
      </header>

      {dbDown && (
        <p className={card} role="status">
          No se pudo conectar con los datos locales. Inicia los servicios del proyecto y vuelve a cargar.
        </p>
      )}

      <div className="board-layout">
        <div className="board-main">
          <section className="board-pinned" aria-label="Avisos institucionales fijados">
            <div className="board-section-heading">
              <div>
                <span className="board-pinned__label"><span aria-hidden="true">📌</span> En el pizarrón</span>
                <h2 className="mt-2">Comunicados y eventos</h2>
              </div>
              <Link href="/avisos" className="board-text-link">Ver todos los avisos →</Link>
            </div>
            <div aria-label="Avisos destacados">
              <h3 className="sr-only">Avisos destacados</h3>
              <StoryCarousel items={stories} />
            </div>
          </section>

          <section className="board-feed" aria-labelledby="recent-heading">
            <div className="board-feed__bar">
              <strong>Actualizaciones de ESCOM</strong>
              <Link href="/avisos" className="board-text-link">Explorar archivo</Link>
            </div>
            <div className="board-section-heading">
              <div>
                <p className="board-eyebrow">Lo último</p>
                <h2 id="recent-heading">Recién publicado</h2>
              </div>
            </div>

            {avisos.length ? (
              <div className="grid gap-3">
                {avisos.map((aviso) => {
                  const art = demoNoticeArt(aviso.title);
                  return (
                    <article key={aviso.id} className="board-notice">
                      <div className="board-notice__meta">
                        <div className="board-notice__avatar" aria-hidden="true">E</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-extrabold text-[#234657]">{demoNoticeAuthor(aviso.title)}</p>
                          <p className="mt-0.5 text-xs text-[#647780]">
                            {categoryLabel[aviso.category] ?? aviso.category}<span className="mx-1.5" aria-hidden="true">·</span>{when(aviso.publish_at)}
                          </p>
                        </div>
                        <span className={`board-label ${aviso.featured ? "board-label--pinned" : ""}`}>
                          {aviso.featured ? "📌 Fijado" : categoryLabel[aviso.category] ?? aviso.category}
                        </span>
                      </div>
                      <div className="board-notice__body">
                        <h3><Link href={`/avisos/${aviso.id}`} className="hover:text-[#006699]">{aviso.title}</Link></h3>
                        <p>{aviso.body}</p>
                      </div>
                      <Link href={`/avisos/${aviso.id}`} className="block" aria-label={`Abrir aviso: ${aviso.title}`}>
                        {art ? (
                          <img src={art} alt={`Cartel: ${aviso.title}`} className="board-notice__image" />
                        ) : (
                          <div className="px-[1.1rem] pb-4 pt-2">
                            <Cover tone={aviso.category} kicker={categoryLabel[aviso.category] ?? aviso.category} title={aviso.title} className="h-44 rounded-lg sm:h-56" />
                          </div>
                        )}
                      </Link>
                      <Link href={`/avisos/${aviso.id}`} className="board-notice__action">💬 Abrir publicación</Link>
                    </article>
                  );
                })}
              </div>
            ) : (
              !dbDown && <p className={`${card} text-center text-sm text-[#5f6e78]`}>Todavía no hay avisos. Cuando publiquen algo, aparecerá aquí.</p>
            )}
          </section>
        </div>

        <aside className="board-sidebar grid gap-3 xl:sticky xl:top-24">
          <section className="board-sidecard">
            <p className="board-eyebrow">Gente que hace comunidad</p>
            <h2>Clubes en el tablero</h2>
            <p className="mt-1 text-sm leading-6 text-[#5f6e78]">Actividades, ideas y equipos para encontrar a tu gente.</p>
            <hr className="board-sidecard__rule" />
            <ul className="board-club-list">
              {clubs.map((club) => (
                <li key={club.id}>
                  <Link href={`/clubes/${club.id}`}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-[#d8d9cf] bg-[#f2f1e9] text-sm font-extrabold text-[#24546a]">
                      {demoClubArt(club.name) ? <img src={demoClubArt(club.name)!} alt="" className="h-full w-full object-cover" /> : club.name.replace("Club de ", "").slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-sm">{club.name}</strong>
                      <span className="mt-0.5 block text-xs capitalize text-[#647780]">{club.kind}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {clubs.length === 0 && !dbDown && <li className="text-sm text-[#5f6e78]">Cuando haya clubes registrados, aparecerán aquí.</li>}
            </ul>
            <Link href="/clubes" className="mt-4 inline-flex min-h-10 items-center font-bold text-[#004d73] hover:underline">Explorar clubes →</Link>
          </section>

          <section className="board-sidecard border-t-4 border-t-[#d4b64f]">
            <p className="board-eyebrow">¿Traes una idea?</p>
            <h2>Propón el siguiente club</h2>
            <p className="mt-2 text-sm leading-6 text-[#5f6e78]">Cuéntale a la comunidad qué te gustaría armar en ESCOM.</p>
            <Link href="/clubes#proponer-club" className="mt-3 inline-flex min-h-10 items-center font-bold text-[#004d73] hover:underline">Ver cómo proponer →</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
