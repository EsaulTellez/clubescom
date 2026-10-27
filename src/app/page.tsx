import Link from "next/link";
import { Cover } from "@/components/cover";
import { StoryCarousel, type StoryCard } from "@/components/story-carousel";
import { pool } from "@/lib/db";
import { card } from "@/lib/ui";

export const dynamic = "force-dynamic";

type Aviso = {
  id: string;
  title: string;
  body: string;
  category: string;
  publish_at: Date;
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
      `select id, title, body, category, publish_at from avisos
       where is_public and publish_at <= now()
       order by featured desc, publish_at desc
       limit 6`,
    );
    const popular = await pool.query<Club>(
      `select id, name, kind from clubs where active = true order by name asc limit 4`,
    );
    avisos = news.rows;
    clubs = popular.rows;
  } catch {
    dbDown = true;
  }

  let paths = { propuesta: "/clubes", pregunta: "/foro", guia: "/guias", objeto: "/objetos" };
  try {
    const [propuesta, pregunta, guia, objeto] = await Promise.all([
      pool.query<{ id: string }>("select id from club_proposals order by created_at desc limit 1"),
      pool.query<{ id: string }>("select id from questions order by created_at desc limit 1"),
      pool.query<{ id: string }>("select id from guides order by created_at desc limit 1"),
      pool.query<{ id: string }>("select id from lost_items order by created_at desc limit 1"),
    ]);
    if (propuesta.rows[0]) paths.propuesta = `/clubes/propuestas/${propuesta.rows[0].id}`;
    if (pregunta.rows[0]) paths.pregunta = `/foro/${pregunta.rows[0].id}`;
    if (guia.rows[0]) paths.guia = `/guias/${guia.rows[0].id}`;
    if (objeto.rows[0]) paths.objeto = `/objetos/${objeto.rows[0].id}`;
  } catch {
    dbDown = true;
  }

  const stories: StoryCard[] = avisos.slice(0, 4).map((aviso) => ({
    href: `/avisos/${aviso.id}`,
    title: aviso.title,
    kicker: categoryLabel[aviso.category] ?? aviso.category,
    tone: aviso.category,
  }));
  const featured = avisos[0];

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-10">
        {dbDown && (
          <p className={card}>
            Postgres no responde. Levanta el contenedor con <code>docker compose up -d</code> y corre <code>npm run db:seed</code>.
          </p>
        )}

        <section className="rounded-3xl bg-[#006699] p-5 text-white sm:p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-white/70">Entra al trámite</p>
          <h2 className="mt-1 font-serif text-3xl">No te quedes en la portada</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              [paths.propuesta, "Propuesta de club", "Cuatro pasos hasta el registro."],
              [paths.pregunta, "Duda con respuesta oficial", "Gestión Escolar ya contestó."],
              [paths.guia, "Guía de reinscripción", "Pasos numerados, no un párrafo."],
              [paths.objeto, "Objeto reportado", "Del aviso a la entrega."],
            ].map(([href, title, text]) => (
              <Link key={href} href={href} className="rounded-2xl bg-white/10 p-4 hover:bg-white/20">
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-sm text-white/80">{text}</p>
              </Link>
            ))}
          </div>
        </section>

        <StoryCarousel items={stories} />

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="font-serif text-3xl tracking-tight">Destacados</h2>
            <Link href="/avisos" className="text-sm text-[#667085] hover:text-[#006699]">
              Ver avisos
            </Link>
          </div>
          {featured ? (
            <article>
              <p className="text-sm text-[#667085]">
                <Link href="/avisos" className="text-[#006699]">
                  {categoryLabel[featured.category] ?? featured.category}
                </Link>
                <span className="mx-2">·</span>
                {when(featured.publish_at)}
              </p>
              <h3 className="mt-2 max-w-3xl font-serif text-4xl leading-[1.1] tracking-tight">
                <Link href={`/avisos/${featured.id}`}>{featured.title}</Link>
              </h3>
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#3c4250]">{featured.body}</p>
              <Link href={`/avisos/${featured.id}`} className="mt-5 block" aria-label={featured.title}>
                <Cover
                  tone={featured.category}
                  kicker={categoryLabel[featured.category] ?? featured.category}
                  title={featured.title}
                  className="h-72 rounded-3xl sm:h-[28rem]"
                />
              </Link>
            </article>
          ) : (
            !dbDown && <p className="text-sm text-[#667085]">Todavía no hay avisos publicados.</p>
          )}
        </section>
      </div>

      <aside className={`${card} xl:sticky xl:top-24`}>
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#667085]">Clubes populares</h2>
        <ul className="mt-4 space-y-4">
          {clubs.map((club) => (
            <li key={club.id}>
              <Link href={`/clubes/${club.id}`} className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#e6f3fa] text-sm font-semibold text-[#006699]">
                  {club.name.replace("Club de ", "").slice(0, 1)}
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
