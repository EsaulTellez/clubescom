import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendButton } from "@/components/attend-button";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, card } from "@/lib/ui";
import { demoClubArt } from "@/lib/demo-art";
import {
  ClubEditForm,
  ClubEventForm,
  ClubEventReviewButtons,
  ClubPostForm,
  DecisionButtons,
  DeleteClubEventButton,
  DeleteClubPostButton,
  JoinButton,
  RemoveMemberButton,
} from "../forms";
import { canModerateClubKind, isUuid, kindLabel } from "../format";

export const dynamic = "force-dynamic";

type Club = {
  id: string;
  name: string;
  kind: string;
  description: string;
  schedule: string | null;
  logo_url: string | null;
  external_links: string | null;
  contact_email: string | null;
  contact_info: string | null;
  join_requirements: string | null;
  leader_id: string | null;
  advisor_id: string | null;
  active: boolean;
  leader_name: string | null;
  advisor_name: string | null;
};
type ContactDirectory = {
  leader_name: string | null;
  leader_email: string | null;
  advisor_name: string | null;
  advisor_email: string | null;
  advisor_room: string | null;
};
type Pending = { user_id: string; name: string; application_note: string | null };
type Member = { id: string; name: string; role: string };
type Post = { id: string; title: string; body: string; image_url: string | null; author_name: string; created_at: Date };
type EventRow = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: Date;
  approval_status: string;
  image_url: string | null;
  attendees_count: number;
  user_attending: boolean;
};
type ClubMetricsSummary = {
  accepted_members: number;
  pending_requests: number;
  rejected_requests: number;
  total_posts: number;
  posts_30d: number;
  approved_events: number;
  pending_events: number;
  total_attendees: number;
};
type EventAttendeeDetail = {
  event_id: string;
  title: string;
  starts_at: Date;
  location: string;
  approval_status: string;
  attendee_id: string | null;
  attendee_name: string | null;
  attendee_role: string | null;
};

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
  let contactDirectory: ContactDirectory | null = null;
  let pending: Pending[] = [];
  let members: Member[] = [];
  let posts: Post[] = [];
  let events: EventRow[] = [];
  let pendingEvents: EventRow[] = [];
  let metrics: ClubMetricsSummary | null = null;
  let eventAttendeeGroups: Array<{
    eventId: string;
    title: string;
    startsAt: Date;
    location: string;
    approvalStatus: string;
    attendees: { id: string; name: string; role: string }[];
  }> = [];
  let directoryPeople: { id: string; name: string; role: string }[] = [];
  let dbDown = false;

  try {
    const result = await pool.query<Club>(
      `select c.id, c.name, c.kind, c.description, c.schedule, c.logo_url,
              c.external_links, c.contact_email, c.contact_info, c.join_requirements,
              c.leader_id, c.advisor_id, c.active,
              leader.name as leader_name,
              advisor.name as advisor_name
       from clubs c
       left join users leader on leader.id = c.leader_id
       left join users advisor on advisor.id = c.advisor_id
       where c.id = $1 and (not $2 or c.kind = 'academico')`,
      [id, user?.role === "moderador" && user.area === "subdireccion_academica"],
    );
    club = result.rows[0];
    if (club) {
      const isAreaStaff = canModerateClubKind(user, club.kind);
      const managesClub = Boolean(
        user && (user.id === club.leader_id || user.id === club.advisor_id),
      );
      const canModerate = Boolean(user && (managesClub || isAreaStaff));

      const [roster, feed, upcoming, pendingEvs, peopleRes, membershipRes] = await Promise.all([
        pool.query<Member>(
          `select distinct u.id, u.name,
                  case when u.id = c.leader_id then 'Responsable'
                       when u.id = c.advisor_id then 'Profesor coordinador'
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
          `select p.id, p.title, p.body, p.image_url, p.created_at, u.name as author_name
           from club_posts p join users u on u.id = p.author_id
           where p.club_id = $1 order by p.created_at desc limit 20`,
          [id],
        ),
        pool.query<EventRow>(
          `select ce.id, ce.title, ce.description, ce.location, ce.starts_at, ce.approval_status, ce.image_url,
                  coalesce(count(ea.user_id), 0)::int as attendees_count,
                  coalesce(bool_or(ea.user_id = $2::uuid), false) as user_attending
           from club_events ce
           left join event_attendees ea on ea.event_kind = 'club' and ea.event_id = ce.id
           where ce.club_id = $1 and ce.starts_at >= now() and ce.approval_status = 'aprobado'
           group by ce.id
           order by ce.starts_at asc limit 8`,
          [id, user?.id ?? null],
        ),
        isAreaStaff
          ? pool.query<EventRow>(
              `select ce.id, ce.title, ce.description, ce.location, ce.starts_at, ce.approval_status, ce.image_url,
                      0::int as attendees_count, false as user_attending
               from club_events ce where ce.club_id = $1 and ce.approval_status = 'pendiente'
                 and private.can_review_club_event(ce.club_id, ce.location)
               order by ce.starts_at asc`,
              [id],
            )
          : Promise.resolve({ rows: [] as EventRow[] }),
        isAreaStaff
          ? pool.query<{ id: string; name: string; role: string }>(
              "select id, name, role from users where is_active and role in ('alumno', 'profesor') order by name",
            )
          : Promise.resolve({ rows: [] as { id: string; name: string; role: string }[] }),
        user
          ? pool.query<{ status: string }>(
              `select status from memberships where club_id = $1 and user_id = $2`,
              [id, user.id],
            )
          : Promise.resolve({ rows: [] as { status: string }[] }),
      ]);

      members = roster.rows;
      posts = feed.rows;
      events = upcoming.rows;
      pendingEvents = pendingEvs.rows;
      directoryPeople = peopleRes.rows;
      membership = membershipRes.rows[0]?.status ?? null;

      const isMember = managesClub || membership === "aceptada";
      if (user && (isMember || isAreaStaff)) {
        const contactRes = await pool.query<ContactDirectory>(
          `select leader_name, leader_email, advisor_name, advisor_email, advisor_room
           from public.get_club_contact_directory($1)`,
          [id],
        );
        contactDirectory = contactRes.rows[0] ?? null;
      }

      if (canModerate) {
        const [queueRes, metricsRes, eventAttendeesRes] = await Promise.all([
          pool.query<Pending>(
            `select m.user_id, u.name, m.application_note
             from memberships m join users u on u.id = m.user_id
             where m.club_id = $1 and m.status = 'pendiente' order by u.name`,
            [id],
          ),
          pool.query<ClubMetricsSummary>(
            `select
               coalesce((select count(*) from memberships where club_id = $1 and status = 'aceptada'), 0)::int as accepted_members,
               coalesce((select count(*) from memberships where club_id = $1 and status = 'pendiente'), 0)::int as pending_requests,
               coalesce((select count(*) from memberships where club_id = $1 and status = 'rechazada'), 0)::int as rejected_requests,
               coalesce((select count(*) from club_posts where club_id = $1), 0)::int as total_posts,
               coalesce((select count(*) from club_posts where club_id = $1 and created_at >= now() - interval '30 days'), 0)::int as posts_30d,
               coalesce((select count(*) from club_events where club_id = $1 and approval_status = 'aprobado'), 0)::int as approved_events,
               coalesce((select count(*) from club_events where club_id = $1 and approval_status = 'pendiente'), 0)::int as pending_events,
               coalesce((
                 select count(*) from event_attendees ea
                 join club_events ce on ce.id = ea.event_id
                 where ea.event_kind = 'club' and ce.club_id = $1
               ), 0)::int as total_attendees`,
            [id],
          ),
          pool.query<EventAttendeeDetail>(
            `select ce.id as event_id, ce.title, ce.starts_at, ce.location, ce.approval_status,
                    u.id as attendee_id, u.name as attendee_name, u.role::text as attendee_role
             from club_events ce
             left join event_attendees ea on ea.event_kind = 'club' and ea.event_id = ce.id
             left join users u on u.id = ea.user_id
             where ce.club_id = $1
             order by ce.starts_at desc, u.name asc`,
            [id],
          ),
        ]);
        pending = queueRes.rows;
        metrics = metricsRes.rows[0] ?? null;

        const grouped = new Map<
          string,
          {
            eventId: string;
            title: string;
            startsAt: Date;
            location: string;
            approvalStatus: string;
            attendees: { id: string; name: string; role: string }[];
          }
        >();
        for (const row of eventAttendeesRes.rows) {
          let entry = grouped.get(row.event_id);
          if (!entry) {
            entry = {
              eventId: row.event_id,
              title: row.title,
              startsAt: row.starts_at,
              location: row.location,
              approvalStatus: row.approval_status,
              attendees: [],
            };
            grouped.set(row.event_id, entry);
          }
          if (row.attendee_id && row.attendee_name) {
            entry.attendees.push({
              id: row.attendee_id,
              name: row.attendee_name,
              role: row.attendee_role ?? "alumno",
            });
          }
        }
        eventAttendeeGroups = Array.from(grouped.values()).slice(0, 10);
      }
    }
  } catch {
    dbDown = true;
  }

  if (dbDown) return <p className={card}>No se pudo consultar el club. Revisa que Postgres esté en marcha.</p>;
  if (!club) notFound();

  const isAreaStaff = canModerateClubKind(user, club.kind);
  const manages = Boolean(user && (user.id === club.leader_id || user.id === club.advisor_id));
  const isMember = manages || membership === "aceptada";
  const canViewFeed = isMember || isAreaStaff;
  const canModerate = Boolean(user && (manages || isAreaStaff));
  const canRequest = Boolean(user && club.active && !manages && !isAreaStaff && membership !== "pendiente" && membership !== "aceptada");
  const canPost = Boolean(user && club.active && canModerate);
  const canEditClub = canModerate;
  const logo = club.logo_url ?? demoClubArt(club.name);
  const decidedTotal = (metrics?.accepted_members ?? 0) + (metrics?.rejected_requests ?? 0);
  const acceptanceRate = decidedTotal > 0 ? Math.round(((metrics?.accepted_members ?? 0) / decidedTotal) * 100) : null;
  const avgAttendance =
    metrics && metrics.approved_events > 0
      ? (metrics.total_attendees / metrics.approved_events).toFixed(1)
      : "0";

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <Link href="/clubes" className="inline-flex items-center gap-2 text-sm font-semibold text-[#006699] hover:underline">← Directorio de clubes</Link>

      <header className="overflow-hidden rounded-sm border border-[#c1ccc3] border-t-4 border-t-[#21483f] bg-[#fffdf7]">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex min-w-0 items-center gap-4">
            {logo ? (
              <img src={logo} alt="" className="h-16 w-16 shrink-0 bg-[#f1efe5] object-contain sm:h-24 sm:w-24" />
            ) : (
              <span aria-hidden="true" className="grid h-16 w-16 shrink-0 place-items-center bg-[#e6ede6] text-3xl text-[#21483f]">{club.name.replace("Club de ", "").slice(0, 1)}</span>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#3d6959]">{kindLabel(club.kind)}</p>
              <h1 className="edition-title my-1 [overflow-wrap:anywhere]">{club.name}</h1>
              <p className="text-xs text-[#52656b]">{members.length} {members.length === 1 ? "integrante" : "integrantes"} · {posts.length} publicaciones</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:pb-1">
            {canRequest && !club.join_requirements?.trim() && <JoinButton clubId={club.id} />}
            {!user && club.active && <Link href="/entrar" className={btn}>Iniciar sesión para unirme</Link>}
            {membership === "pendiente" && <span className="rounded-full bg-[#fff4d8] px-4 py-2 text-sm font-semibold text-[#8d6720]">Solicitud pendiente</span>}
            {membership === "aceptada" && <span className="rounded-full bg-[#e4f5ed] px-4 py-2 text-sm font-semibold text-[#26734e]">✓ Ya eres integrante</span>}
            {manages && <span className="rounded-full bg-[#e9f4f8] px-4 py-2 text-sm font-semibold text-[#006699]">Moderador del club</span>}
            {isAreaStaff && !manages && <span className="rounded-full bg-[#e9f4f8] px-4 py-2 text-sm font-semibold text-[#006699]">Control de área</span>}
          </div>
        </div>
        <nav className="flex gap-6 overflow-x-auto border-t border-[#edf2f5] px-5 text-sm font-bold text-[#657787] sm:px-7" aria-label="Secciones del club">
          <a href="#publicaciones" className="border-b-[3px] border-[#0079a5] py-3 text-[#006699]">Publicaciones</a>
          <a href="#eventos" className="py-3 hover:text-[#006699]">Eventos</a>
          <a href="#integrantes" className="py-3 hover:text-[#006699]">Integrantes</a>
          <a href="#acerca" className="py-3 hover:text-[#006699]">Acerca y contacto</a>
          {canModerate && <a href="#solicitudes" className="py-3 hover:text-[#006699]">Solicitudes ({pending.length})</a>}
          {canModerate && <a href="#metricas" className="py-3 hover:text-[#006699]">Métricas</a>}
          {canEditClub && <a href="#gestion" className="py-3 hover:text-[#006699]">Gestión</a>}
        </nav>
      </header>

      {!club.active && <p className="rounded-2xl bg-[#fff0ed] p-4 text-sm font-semibold text-[#a14334]">Este club no está activo.</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main id="publicaciones" className="min-w-0 space-y-4">
          {canPost ? <ClubPostForm clubId={club.id} /> : user && canViewFeed ? (
            <div className="rounded-sm border border-[#e4edf2] bg-white p-4 text-sm text-[#667985]">
              Las publicaciones las comparten el alumno moderador, el profesor coordinador y la coordinación del área.
            </div>
          ) : null}

          <div className="flex items-end justify-between gap-3 px-1 pt-1">
            <div><h2 className="text-xl font-extrabold tracking-tight text-[#19384c]">Publicaciones del club</h2></div>
            <span className="rounded-full bg-[#e8f4f8] px-3 py-1 text-xs font-bold text-[#006699]">{posts.length} publicaciones</span>
          </div>
          {!canViewFeed ? (
            <div className="rounded-sm border border-[#cbdde6] bg-white p-8 text-center">

              <h3 className="mt-2 font-bold text-[#19384c]">Publicaciones privadas para integrantes</h3>
              <p className="mt-1 text-sm text-[#71818d]">
                Las publicaciones internas del club solo son visibles para integrantes aceptados, moderadores del club y área encargada. Solicita unirte para acceder al feed de la comunidad.
              </p>
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-sm border border-dashed border-[#cbdde6] bg-white/80 p-8 text-center">
              <h3 className="mt-2 font-bold text-[#19384c]">Todavía no hay publicaciones</h3>
              <p className="mt-1 text-sm text-[#71818d]">Las novedades del club aparecerán aquí.</p>
            </div>
          ) : posts.map((post) => (
            <article key={post.id} className="overflow-hidden rounded-sm border border-[#dce8ef] border-t-4 border-t-[#165b47] bg-white p-5  transition hover:border-[#b0d4e6] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#c9eaf1] to-[#e6f4f6] text-xs font-black text-[#006699]">{initials(post.author_name)}</span>
                <div className="min-w-0"><p className="truncate text-sm font-bold text-[#244459]">{post.author_name}</p><p className="text-xs text-[#84919a]">Equipo · {formatWhen(post.created_at)}</p></div>
                <span className="ml-auto rounded-full bg-[#e3f3ed] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#11503d]">{kindLabel(club.kind)}</span>
                {canModerate && <DeleteClubPostButton clubId={club.id} postId={post.id} />}
              </div>
              <h3 className="mt-4 text-lg font-extrabold tracking-tight text-[#19384c] sm:text-xl">{post.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#536977]">{post.body}</p>
              {post.image_url && (
                <div className="mt-4 overflow-hidden rounded-xl border border-[#d6e4eb] bg-[#0e222b]">
                  <img src={post.image_url} alt={post.title} className="max-h-96 w-full object-cover" />
                </div>
              )}
            </article>
          ))}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section id="eventos" className="rounded-sm border border-white bg-white p-5">
            <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-extrabold text-[#19384c]">Próximos eventos</h2></div>
            {events.length ? <ul className="mt-4 space-y-4">
              {events.map((event) => {
                const date = dateParts(event.starts_at);
                return <li key={event.id} className="space-y-2.5 border-t border-[#edf2f5] pt-4">
                  {event.image_url && (
                    <div className="overflow-hidden rounded-xl border border-[#dce8ef] bg-[#0e222b]">
                      <img src={event.image_url} alt={event.title} className="h-32 w-full object-cover" />
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="grid h-12 w-12 shrink-0 content-center justify-items-center rounded-2xl bg-[#e9f5f8] text-[#006699]"><span className="text-lg font-black leading-none">{date.day}</span><span className="mt-1 text-[9px] font-extrabold uppercase">{date.month}</span></div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-extrabold leading-snug text-[#264a60]">{event.title}</h3>
                      <p className="mt-1 text-[11px] text-[#697e8a]">{formatWhen(event.starts_at)}</p>
                      <p className="mt-1 text-[11px] font-semibold text-[#0080a9]">⌖ {event.location}</p>
                      <p className="mt-1 text-xs leading-5 text-[#758792]">{event.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <AttendButton
                          eventKind="club"
                          eventId={event.id}
                          initialAttending={event.user_attending}
                          initialCount={event.attendees_count}
                          isAuthenticated={Boolean(user)}
                          compact
                        />
                        {canModerate && <DeleteClubEventButton clubId={club.id} eventId={event.id} />}
                      </div>
                    </div>
                  </div>
                </li>;
              })}
            </ul> : <p className="mt-3 text-sm text-[#778a96]">Pronto se anunciarán nuevas actividades.</p>}

            {isAreaStaff && pendingEvents.length > 0 && (
              <div className="mt-4 space-y-3 border-t border-[#edf2f5] pt-4">
                <p className="text-xs font-extrabold uppercase tracking-wide text-[#8d6720]">Eventos pendientes de aprobar</p>
                {pendingEvents.map((ev) => (
                  <div key={ev.id} className="space-y-2 rounded-xl border border-[#e6eef2] p-3 text-xs">
                    {ev.image_url && (
                      <img src={ev.image_url} alt={ev.title} className="mb-2 h-28 w-full rounded-lg object-cover" />
                    )}
                    <p className="font-bold text-[#19384c]">{ev.title}</p>
                    <p className="text-[#697e8a]">{formatWhen(ev.starts_at)} · {ev.location}</p>
                    {ev.description && <p className="mt-1 text-[#526170]">{ev.description}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <ClubEventReviewButtons clubId={club.id} eventId={ev.id} />
                      <DeleteClubEventButton clubId={club.id} eventId={ev.id} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {canEditClub && club.active && <div className="mt-4"><ClubEventForm clubId={club.id} /></div>}

            <Link href="/eventos" className="mt-4 inline-flex text-xs font-bold text-[#006699] hover:underline">Ver itinerario de espacios y eventos →</Link>
          </section>

          <section id="integrantes" className="rounded-sm border border-white bg-white p-5">
            <div className="flex items-center justify-between"><h2 className="font-extrabold text-[#19384c]">Integrantes</h2><span className="rounded-full bg-[#eef5f7] px-2.5 py-1 text-xs font-bold text-[#567486]">{members.length}</span></div>
            {members.length ? <ul className="mt-4 space-y-3">
              {(canModerate ? members : members.slice(0, 8)).map((member) => <li key={member.id} className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e7f3f7] text-[10px] font-extrabold text-[#006699]">{initials(member.name)}</span>
                  <span className="min-w-0"><span className="block truncate text-xs font-bold text-[#355366]">{member.name}</span><span className="block text-[10px] text-[#81909a]">{member.role}</span></span>
                </div>
                {canModerate && member.id !== club.leader_id && member.id !== club.advisor_id && (
                  <RemoveMemberButton clubId={club.id} userId={member.id} />
                )}
              </li>)}
            </ul> : <p className="mt-3 text-sm text-[#778a96]">Sé la primera persona en unirte.</p>}
            {!canModerate && members.length > 8 && <p className="mt-3 text-xs font-semibold text-[#71818d]">y {members.length - 8} personas más</p>}
          </section>

          <section id="acerca" className="rounded-sm border border-white bg-white p-5">
            <h2 className="font-extrabold text-[#19384c]">Acerca y contacto</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#667985]">{club.description}</p>
            <dl className="mt-4 space-y-3 border-t border-[#edf2f5] pt-4 text-xs">
              <div><dt className="font-bold text-[#778a96]">Horario</dt><dd className="mt-1 font-semibold text-[#355366]">{club.schedule?.trim() || "Por anunciar"}</dd></div>
              <div><dt className="font-bold text-[#778a96]">Alumno moderador</dt><dd className="mt-1 font-semibold text-[#355366]">{club.leader_name || "Por asignar"}</dd></div>
              <div><dt className="font-bold text-[#778a96]">Profesor coordinador</dt><dd className="mt-1 font-semibold text-[#355366]">{club.advisor_name || "Por asignar"}</dd></div>
              {club.contact_email && (
                <div><dt className="font-bold text-[#778a96]">Correo de contacto</dt><dd className="mt-1 break-all font-semibold text-[#006699]">{club.contact_email}</dd></div>
              )}
              {club.contact_info && (
                <div><dt className="font-bold text-[#778a96]">Contacto / sede</dt><dd className="mt-1 whitespace-pre-wrap text-[#355366]">{club.contact_info}</dd></div>
              )}
              {contactDirectory && (
                <div className="rounded-xl border border-[#dce8ef] bg-[#f7fbfe] p-3">
                  <dt className="font-bold uppercase tracking-[.05em] text-[#004d73]">Contacto institucional de moderadores</dt>
                  <dd className="mt-2 space-y-1.5 text-[#264a60]">
                    {contactDirectory.leader_email && (
                      <p><strong>Alumno ({contactDirectory.leader_name}):</strong> {contactDirectory.leader_email}</p>
                    )}
                    {contactDirectory.advisor_email && (
                      <p><strong>Profesor ({contactDirectory.advisor_name}):</strong> {contactDirectory.advisor_email}</p>
                    )}
                    {contactDirectory.advisor_room && (
                      <p><strong>Cubículo / lugar:</strong> {contactDirectory.advisor_room}</p>
                    )}
                  </dd>
                </div>
              )}
              {club.external_links && (
                <div><dt className="font-bold text-[#778a96]">Enlaces externos</dt><dd className="mt-1 break-all font-semibold text-[#006699]">{club.external_links}</dd></div>
              )}
              {club.join_requirements && (
                <div><dt className="font-bold text-[#778a96]">Requisitos de ingreso</dt><dd className="mt-1 whitespace-pre-wrap text-[#355366]">{club.join_requirements}</dd></div>
              )}
            </dl>
          </section>

          {canRequest && <section className="rounded-sm border border-[#cfe4ec] bg-[#f2fafc] p-5"><h2 className="font-bold text-[#264a60]">¿Te late este club?</h2><p className="mt-1 text-xs leading-5 text-[#667985]">Manda tu solicitud y el equipo del club la revisará.</p><div className="mt-3"><JoinButton clubId={club.id} joinRequirements={club.join_requirements} /></div></section>}
          {!user && <section className="rounded-sm border border-[#cfe4ec] bg-[#f2fafc] p-5"><h2 className="font-bold text-[#264a60]">¿Te late este club?</h2><p className="mt-1 text-xs leading-5 text-[#667985]">Inicia sesión para solicitar ingreso.</p><Link href="/entrar" className="mt-3 inline-flex rounded-full bg-[#006699] px-4 py-2 text-xs font-bold text-white">Iniciar sesión</Link></section>}
        </aside>
      </div>

      {canModerate && club.active && <section id="solicitudes" className={`${card} space-y-4`}>
        <div><h2 className="font-extrabold text-[#19384c]">Solicitudes de ingreso por revisar</h2><p className="mt-1 text-sm text-[#71818d]">Acepta o rechaza a quienes pidieron integrarse al club.</p></div>
        {pending.length === 0 ? <p className="text-sm text-[#667085]">No hay solicitudes pendientes.</p> : <ul className="space-y-3">
          {pending.map((person) => <li key={person.user_id} className="flex flex-col gap-3 border-t border-[#e6eef2] pt-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">{person.name}</p>{person.application_note && <p className="mt-1 text-xs text-[#526170]">Respuesta a requisitos: {person.application_note}</p>}</div><DecisionButtons clubId={club.id} userId={person.user_id} /></li>)}
        </ul>}
      </section>}

      {canModerate && metrics && (
        <section id="metricas" className={`${card} space-y-5`}>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.08em] text-[#006699]">Panel exclusivo para moderadores del club</p>
            <h2 className="mt-1 text-xl font-extrabold text-[#19384c]">Métricas e inscritos a eventos</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[#dce8ef] bg-[#f7fbfe] p-3">
              <p className="text-[11px] font-bold uppercase text-[#5c7280]">Integrantes totales</p>
              <p className="mt-1 text-2xl font-extrabold text-[#15394d]">{members.length}</p>
              <p className="text-xs text-[#5c7280]">{metrics.accepted_members} membresías aceptadas</p>
            </div>
            <div className="rounded-xl border border-[#dce8ef] bg-[#f7fbfe] p-3">
              <p className="text-[11px] font-bold uppercase text-[#5c7280]">Solicitudes</p>
              <p className="mt-1 text-2xl font-extrabold text-[#15394d]">{metrics.pending_requests} pend.</p>
              <p className="text-xs text-[#5c7280]">
                {acceptanceRate !== null ? `${acceptanceRate}% aceptación (${metrics.rejected_requests} rech.)` : `${metrics.rejected_requests} rechazadas`}
              </p>
            </div>
            <div className="rounded-xl border border-[#dce8ef] bg-[#f7fbfe] p-3">
              <p className="text-[11px] font-bold uppercase text-[#5c7280]">Publicaciones</p>
              <p className="mt-1 text-2xl font-extrabold text-[#15394d]">{metrics.total_posts}</p>
              <p className="text-xs text-[#5c7280]">{metrics.posts_30d} en últimos 30 días</p>
            </div>
            <div className="rounded-xl border border-[#dce8ef] bg-[#f7fbfe] p-3">
              <p className="text-[11px] font-bold uppercase text-[#5c7280]">Clicks Asistiré en eventos</p>
              <p className="mt-1 text-2xl font-extrabold text-[#006699]">{metrics.total_attendees}</p>
              <p className="text-xs text-[#5c7280]">{metrics.approved_events} eventos aprobados · prom. {avgAttendance}</p>
            </div>
          </div>

          <div className="space-y-3 border-t border-[#e5edf2] pt-4">
            <h3 className="text-sm font-extrabold text-[#19384c]">Asistencia registrada por evento (Asistiré)</h3>
            {eventAttendeeGroups.length === 0 ? (
              <p className="text-sm text-[#667085]">Este club aún no tiene eventos registrados.</p>
            ) : (
              <div className="space-y-3">
                {eventAttendeeGroups.map((group) => (
                  <article key={group.eventId} className="rounded-xl border border-[#dce8ef] bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[#19384c]">{group.title}</p>
                        <p className="text-xs text-[#697e8a]">
                          {formatWhen(group.startsAt)} · {group.location} · estado: {group.approvalStatus}
                        </p>
                      </div>
                      <span className="rounded-full bg-[#e6f3fa] px-3 py-1 text-xs font-extrabold text-[#004d73]">
                        {group.attendees.length} {group.attendees.length === 1 ? "asistente" : "asistentes"}
                      </span>
                    </div>
                    {group.attendees.length > 0 ? (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {group.attendees.map((att) => (
                          <li key={att.id} className="rounded-full border border-[#d6e4eb] bg-[#f7fbfe] px-2.5 py-1 text-xs text-[#264a60]">
                            {att.name} ({att.role})
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-[#758792]">Nadie ha marcado Asistiré todavía.</p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {canEditClub && (
        <section id="gestion" className={`${card} space-y-4`}>
          <div>
            <h2 className="font-extrabold text-[#19384c]">Configuración, contacto y edición del club</h2>
            <p className="mt-1 text-sm text-[#71818d]">
              Actualiza descripción, logo, horario, información de contacto, enlaces, estado activo y requisitos de ingreso{isAreaStaff ? " o asigna alumno moderador / profesor coordinador" : ""}.
            </p>
          </div>
          <ClubEditForm
            club={club}
            isStaff={isAreaStaff}
            students={directoryPeople.filter((p) => p.role === "alumno")}
            professors={directoryPeople.filter((p) => p.role === "profesor")}
          />
        </section>
      )}
    </div>
  );
}
