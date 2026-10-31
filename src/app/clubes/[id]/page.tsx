import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, card } from "@/lib/ui";
import { demoClubArt } from "@/lib/demo-art";
import { DecisionButtons, JoinButton, ClubPostForm } from "../forms";
import { isUuid, kindLabel } from "../format";

export const dynamic = "force-dynamic";

type Club = {
  id: string;
  name: string;
  kind: string;
  description: string;
  schedule: string | null;
  leader_id: string | null;
  advisor_id: string | null;
  active: boolean;
  leader_name: string | null;
  advisor_name: string | null;
};
type Pending = { user_id: string; name: string; boleta: string | null };
type Member = { id: string; name: string; role: string };
type Post = { id: string; title: string; body: string; author_name: string; created_at: Date };
type Event = { id: string; title: string; description: string; location: string; starts_at: Date };

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
function dateParts(value: Date) {
  const date = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", timeZone: "America/Mexico_City" }).formatToParts(value);
  return { day: date.find((part) => part.type === "day")?.value ?? "--", month: date.find((part) => part.type === "month")?.value ?? "" };
}
function formatWhen(value: Date) {
  return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(value);
}

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const user = await getSession();
  let club: Club | undefined;
  let membership: string | null = null;
  let pending: Pending[] = [];
  let members: Member[] = [];
  let posts: Post[] = [];
  let events: Event[] = [];
  let dbDown = false;

  try {
    const result = await pool.query<Club>(
      `select c.id, c.name, c.kind, c.description, c.schedule, c.leader_id, c.advisor_id, c.active,
              leader.name as leader_name,
              advisor.name as advisor_name
       from clubs c
       left join users leader on leader.id = c.leader_id
       left join users advisor on advisor.id = c.advisor_id
       where c.id = $1`,
      [id],
    );
    club = result.rows[0];
    if (club) {
      const [roster, feed, upcoming] = await Promise.all([
        pool.query<Member>(
          `select distinct u.id, u.name,
                  case when u.id = c.leader_id then 'Responsable'
                       when u.id = c.advisor_id then 'Asesor'
                       else 'Integrante' end as role
           from clubs c
           join users u on u.id = c.leader_id or u.id = c.advisor_id or exists (
             select 1 from memberships m where m.club_id = c.id and m.user_id = u.id and m.status = 'aceptada'
           )
           where c.id = $1
           order by role, u.name`,
          [id],
        ),
        pool.query<Post>(
          `select p.id, p.title, p.body, p.created_at, u.name as author_name
           from club_posts p join users u on u.id = p.author_id
           where p.club_id = $1 order by p.created_at desc limit 20`,
          [id],
        ),
        pool.query<Event>(
          `select id, title, description, location, starts_at
           from club_events where club_id = $1 and starts_at >= now()
           order by starts_at asc limit 5`,
          [id],
        ),
      ]);
      members = roster.rows;
      posts = feed.rows;
      events = upcoming.rows;

      if (user) {
        const mine = await pool.query<{ status: string }>(
          `select status from memberships where club_id = $1 and user_id = $2`,
          [id, user.id],
        );
        membership = mine.rows[0]?.status ?? null;
      }
      if (user && (user.id === club.leader_id || user.id === club.advisor_id)) {
        const queue = await pool.query<Pending>(
          `select m.user_id, u.name, u.boleta
           from memberships m join users u on u.id = m.user_id
           where m.club_id = $1 and m.status = 'pendiente' order by u.name`,
          [id],
        );
        pending = queue.rows;
      }
    }
  } catch {
    dbDown = true;
  }

  if (dbDown) return <p className={card}>No se pudo consultar el club. Revisa que Postgres esté en marcha.</p>;
  if (!club) notFound();

  const manages = Boolean(user && (user.id === club.leader_id || user.id === club.advisor_id));
  const canRequest = Boolean(user && club.active && !manages && membership !== "pendiente" && membership !== "aceptada");
  const canPost = Boolean(user && club.active && (manages || membership === "aceptada"));
  const logo = demoClubArt(club.name);

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <Link href="/clubes" className="inline-flex items-center gap-2 text-sm font-semibold text-[#006699] hover:underline">← Comunidades</Link>

      <header className="overflow-hidden rounded-[32px] border border-white bg-white shadow-[0_12px_36px_rgba(14,54,78,0.09)]">
        <div className="relative h-28 overflow-hidden bg-gradient-to-br from-[#004d73] via-[#0079a5] to-[#87d5df] sm:h-36">
          <div className="absolute -right-8 -top-24 h-72 w-72 rounded-full border-[34px] border-white/15" />
          <div className="absolute bottom-[-86px] left-[38%] h-48 w-48 rounded-full bg-[#b7e8ed]/40 blur-[1px]" />
          <span className="absolute bottom-4 right-5 rounded-full border border-white/35 bg-white/15 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-white backdrop-blur">{kindLabel(club.kind)}</span>
        </div>
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between sm:px-7">
          <div className="flex min-w-0 items-end gap-4">
            {logo ? (
              <img src={logo} alt={`Logo de ${club.name}`} className="-mt-12 h-[92px] w-[92px] shrink-0 rounded-[26px] border-[5px] border-white bg-white object-contain p-1 shadow-[0_8px_22px_rgba(10,48,70,0.16)] sm:-mt-14 sm:h-[112px] sm:w-[112px]" />
            ) : (
              <span className="-mt-12 grid h-[92px] w-[92px] shrink-0 place-items-center rounded-[26px] border-[5px] border-white bg-gradient-to-br from-[#d8f1f5] to-[#8bcfdf] text-4xl font-black text-[#005c83] shadow-[0_8px_22px_rgba(10,48,70,0.16)] sm:-mt-14 sm:h-[112px] sm:w-[112px]">{club.name.replace("Club de ", "").slice(0, 1)}</span>
            )}
            <div className="min-w-0 pb-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#0079a5]">Comunidad ESCOM</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-[#15384e] sm:text-3xl">{club.name}</h1>
              <p className="mt-1 text-xs text-[#6a7f8d]">{members.length} {members.length === 1 ? "integrante" : "integrantes"} <span className="mx-1">·</span> {posts.length} publicaciones</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:pb-1">
            {canRequest && <JoinButton clubId={club.id} />}
            {!user && club.active && <Link href="/entrar" className={btn}>Iniciar sesión para unirme</Link>}
            {membership === "pendiente" && <span className="rounded-full bg-[#fff4d8] px-4 py-2 text-sm font-semibold text-[#8d6720]">Solicitud pendiente</span>}
            {membership === "aceptada" && <span className="rounded-full bg-[#e4f5ed] px-4 py-2 text-sm font-semibold text-[#26734e]">✓ Ya eres integrante</span>}
            {manages && <span className="rounded-full bg-[#e9f4f8] px-4 py-2 text-sm font-semibold text-[#006699]">Equipo del club</span>}
          </div>
        </div>
        <nav className="flex gap-6 overflow-x-auto border-t border-[#edf2f5] px-5 text-sm font-bold text-[#657787] sm:px-7" aria-label="Secciones del club">
          <a href="#publicaciones" className="border-b-[3px] border-[#0079a5] py-3 text-[#006699]">Publicaciones</a>
          <a href="#eventos" className="py-3 hover:text-[#006699]">Eventos</a>
          <a href="#integrantes" className="py-3 hover:text-[#006699]">Integrantes</a>
          <a href="#acerca" className="py-3 hover:text-[#006699]">Acerca de</a>
        </nav>
      </header>

      {!club.active && <p className="rounded-2xl bg-[#fff0ed] p-4 text-sm font-semibold text-[#a14334]">Este club no está activo.</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <main id="publicaciones" className="min-w-0 space-y-4">
          {canPost ? <ClubPostForm clubId={club.id} /> : user ? (
            <div className="rounded-[24px] border border-[#e4edf2] bg-white p-4 text-sm text-[#667985] shadow-[0_8px_28px_rgba(0,45,75,0.04)]">
              Únete al club para compartir publicaciones en su comunidad.
            </div>
          ) : null}

          <div className="flex items-end justify-between gap-3 px-1 pt-1">
            <div><h2 className="text-xl font-extrabold tracking-tight text-[#19384c]">Feed del club</h2><p className="mt-1 text-xs text-[#778a96]">Ideas, preguntas y novedades de integrantes.</p></div>
            <span className="rounded-full bg-[#e8f4f8] px-3 py-1 text-xs font-bold text-[#006699]">{posts.length} publicaciones</span>
          </div>
          {posts.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-[#cbdde6] bg-white/80 p-8 text-center">
              <span className="text-3xl">💬</span><h3 className="mt-2 font-bold text-[#19384c]">Todavía no hay publicaciones</h3>
              <p className="mt-1 text-sm text-[#71818d]">Sé la primera persona en iniciar la conversación.</p>
            </div>
          ) : posts.map((post) => (
            <article key={post.id} className="rounded-[26px] border border-white bg-white p-5 shadow-[0_8px_28px_rgba(14,54,78,0.06)] transition hover:border-[#c7e1eb] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#c9eaf1] to-[#e6f4f6] text-xs font-black text-[#006699]">{initials(post.author_name)}</span>
                <div className="min-w-0"><p className="truncate text-sm font-bold text-[#244459]">{post.author_name}</p><p className="text-xs text-[#84919a]">Integrante · {formatWhen(post.created_at)}</p></div>
                <span className="ml-auto rounded-full bg-[#f0f7fa] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#55778b]">{kindLabel(club.kind)}</span>
              </div>
              <h3 className="mt-4 text-lg font-extrabold tracking-tight text-[#19384c]">{post.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#536977]">{post.body}</p>
              <div className="mt-4 flex items-center gap-4 border-t border-[#edf2f5] pt-3 text-xs font-semibold text-[#71818d]">
                <span className="inline-flex items-center gap-1.5">✦ Comunidad</span><a href="#publicaciones" className="hover:text-[#006699]">Comentar en persona</a>
              </div>
            </article>
          ))}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section id="eventos" className="rounded-[26px] border border-white bg-white p-5 shadow-[0_8px_28px_rgba(14,54,78,0.06)]">
            <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-extrabold text-[#19384c]">Próximos eventos</h2><span className="text-xl">📅</span></div>
            {events.length ? <ul className="mt-4 space-y-4">
              {events.map((event) => {
                const date = dateParts(event.starts_at);
                return <li key={event.id} className="flex gap-3 border-t border-[#edf2f5] pt-4">
                  <div className="grid h-12 w-12 shrink-0 content-center justify-items-center rounded-2xl bg-[#e9f5f8] text-[#006699]"><span className="text-lg font-black leading-none">{date.day}</span><span className="mt-1 text-[9px] font-extrabold uppercase">{date.month}</span></div>
                  <div className="min-w-0"><h3 className="text-sm font-extrabold leading-snug text-[#264a60]">{event.title}</h3><p className="mt-1 text-[11px] text-[#697e8a]">{formatWhen(event.starts_at)}</p><p className="mt-1 text-[11px] font-semibold text-[#0080a9]">⌖ {event.location}</p><p className="mt-1 text-xs leading-5 text-[#758792]">{event.description}</p></div>
                </li>;
              })}
            </ul> : <p className="mt-3 text-sm text-[#778a96]">Pronto se anunciarán nuevas actividades.</p>}
            <Link href="/espacios" className="mt-4 inline-flex text-xs font-bold text-[#006699] hover:underline">Ver espacios y eventos →</Link>
          </section>

          <section id="integrantes" className="rounded-[26px] border border-white bg-white p-5 shadow-[0_8px_28px_rgba(14,54,78,0.06)]">
            <div className="flex items-center justify-between"><h2 className="font-extrabold text-[#19384c]">Integrantes</h2><span className="rounded-full bg-[#eef5f7] px-2.5 py-1 text-xs font-bold text-[#567486]">{members.length}</span></div>
            {members.length ? <ul className="mt-4 space-y-3">
              {members.slice(0, 8).map((member) => <li key={member.id} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e7f3f7] text-[10px] font-extrabold text-[#006699]">{initials(member.name)}</span>
                <span className="min-w-0"><span className="block truncate text-xs font-bold text-[#355366]">{member.name}</span><span className="block text-[10px] text-[#81909a]">{member.role}</span></span>
              </li>)}
            </ul> : <p className="mt-3 text-sm text-[#778a96]">Sé la primera persona en unirte.</p>}
            {members.length > 8 && <p className="mt-3 text-xs font-semibold text-[#71818d]">y {members.length - 8} personas más</p>}
          </section>

          <section id="acerca" className="rounded-[26px] border border-white bg-white p-5 shadow-[0_8px_28px_rgba(14,54,78,0.06)]">
            <h2 className="font-extrabold text-[#19384c]">Acerca de</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#667985]">{club.description}</p>
            <dl className="mt-4 space-y-3 border-t border-[#edf2f5] pt-4 text-xs">
              <div><dt className="font-bold text-[#778a96]">Horario</dt><dd className="mt-1 font-semibold text-[#355366]">{club.schedule?.trim() || "Por anunciar"}</dd></div>
              <div><dt className="font-bold text-[#778a96]">Responsable</dt><dd className="mt-1 font-semibold text-[#355366]">{club.leader_name || "Por asignar"}</dd></div>
              <div><dt className="font-bold text-[#778a96]">Asesor</dt><dd className="mt-1 font-semibold text-[#355366]">{club.advisor_name || "Por asignar"}</dd></div>
            </dl>
          </section>

          {canRequest && <section className="rounded-[26px] border border-[#cfe4ec] bg-[#f2fafc] p-5"><h2 className="font-bold text-[#264a60]">¿Te late este club?</h2><p className="mt-1 text-xs leading-5 text-[#667985]">Manda tu solicitud y el equipo del club la revisará.</p><div className="mt-3"><JoinButton clubId={club.id} /></div></section>}
          {!user && <section className="rounded-[26px] border border-[#cfe4ec] bg-[#f2fafc] p-5"><h2 className="font-bold text-[#264a60]">¿Te late este club?</h2><p className="mt-1 text-xs leading-5 text-[#667985]">Inicia sesión para solicitar ingreso y participar en el feed.</p><Link href="/entrar" className="mt-3 inline-flex rounded-full bg-[#006699] px-4 py-2 text-xs font-bold text-white">Iniciar sesión</Link></section>}
        </aside>
      </div>

      {manages && club.active && <section className={`${card} space-y-4`}>
        <div><h2 className="font-extrabold text-[#19384c]">Solicitudes por revisar</h2><p className="mt-1 text-sm text-[#71818d]">Acepta o rechaza a quien pidió integrarse.</p></div>
        {pending.length === 0 ? <p className="text-sm text-[#667085]">No hay solicitudes pendientes.</p> : <ul className="space-y-3">
          {pending.map((person) => <li key={person.user_id} className="flex flex-col gap-3 border-t border-[#e6eef2] pt-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold">{person.name}{person.boleta ? <span className="text-[#667085]"> · {person.boleta}</span> : null}</p><DecisionButtons clubId={club.id} userId={person.user_id} /></li>)}
        </ul>}
      </section>}
    </div>
  );
}
