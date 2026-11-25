import { notFound } from "next/navigation";
import type { DirectoryUserOption } from "@/components/searchable-user-picker";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { demoClubArt } from "@/lib/demo-art";
import { card } from "@/lib/ui";
import { clubEventVenueArea } from "../../espacios/shared";
import {
  allowedClubKinds,
  canManageAnyClubs,
  canModerateClubKind,
  clubAreaBadgeLabel,
  isUuid,
} from "../format";
import {
  parseJoinQuestions,
  type ClubApplicationAnswer,
  type ClubJoinQuestion,
} from "../questions";
import {
  ClubWorkspace,
  type ClubContactDirectory,
  type ClubEventAttendeeGroup,
  type ClubMemberRow,
  type ClubMetricsData,
  type ClubPendingRow,
} from "./club-workspace";

export const dynamic = "force-dynamic";

type RawClub = {
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
  join_questions: ClubJoinQuestion[];
  leader_id: string | null;
  advisor_id: string | null;
  active: boolean;
  leader_name: string | null;
  advisor_name: string | null;
};

type RawPost = {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  author_name: string;
  created_at: Date;
};

type RawEventRow = {
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

type RawMetricsSummary = {
  accepted_members: number;
  pending_requests: number;
  rejected_requests: number;
  total_posts: number;
  posts_30d: number;
  approved_events: number;
  pending_events: number;
  total_attendees: number;
};

type RawEventAttendeeDetail = {
  event_id: string;
  title: string;
  starts_at: Date;
  location: string;
  approval_status: string;
  attendee_id: string | null;
  attendee_name: string | null;
  attendee_role: string | null;
};

function dateParts(value: Date) {
  const date = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Mexico_City",
  }).formatToParts(value);
  return {
    day: date.find((part) => part.type === "day")?.value ?? "--",
    month: (date.find((part) => part.type === "month")?.value ?? "").replace(".", ""),
  };
}

function formatWhen(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(value);
}

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const user = await getSession();
  const isAreaScoped =
    canManageAnyClubs(user) && user?.role !== "admin" && allowedClubKinds(user).length < 3;
  const scopedKinds = allowedClubKinds(user);

  let club: RawClub | undefined;
  let membership: string | null = null;
  let contactDirectory: ClubContactDirectory | null = null;
  let pending: ClubPendingRow[] = [];
  let members: ClubMemberRow[] = [];
  let posts: RawPost[] = [];
  let events: RawEventRow[] = [];
  let pendingEvents: RawEventRow[] = [];
  let metricsRaw: RawMetricsSummary | null = null;
  let eventAttendeeGroups: ClubEventAttendeeGroup[] = [];
  let directoryPeople: DirectoryUserOption[] = [];
  let dbDown = false;

  try {
    const result = await pool.query<RawClub>(
      `select c.id, c.name, c.kind, c.description, c.schedule, c.logo_url,
              c.external_links, c.contact_email, c.contact_info, c.join_requirements, c.join_questions,
              c.leader_id, c.advisor_id, c.active,
              leader.name as leader_name,
              advisor.name as advisor_name
       from clubs c
       left join users leader on leader.id = c.leader_id
       left join users advisor on advisor.id = c.advisor_id
       where c.id = $1 and (not $2 or c.kind = any($3::text[]))`,
      [id, isAreaScoped, scopedKinds.length > 0 ? scopedKinds : ["academico", "cultural", "deportivo"]],
    );
    club = result.rows[0];
    if (club) {
      const isAreaStaff = canModerateClubKind(user, club.kind);
      const managesClub = Boolean(
        user &&
          ((user.role === "alumno" && user.id === club.leader_id) ||
            (user.role === "profesor" && user.id === club.advisor_id)),
      );
      const canModerate = Boolean(user && (managesClub || isAreaStaff));

      const membershipRes = user
        ? await pool.query<{ status: string }>(
            `select status from memberships where club_id = $1 and user_id = $2`,
            [id, user.id],
          )
        : { rows: [] as { status: string }[] };
      membership = membershipRes.rows[0]?.status ?? null;
      const isMemberEarly = managesClub || membership === "aceptada";
      const canViewFeedEarly = isMemberEarly || isAreaStaff;

      const [roster, feed, upcoming, pendingEvs, peopleRes] = await Promise.all([
        pool.query<ClubMemberRow>(
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
        canViewFeedEarly
          ? pool.query<RawPost>(
              `select p.id, p.title, p.body, p.image_url, p.created_at, u.name as author_name
               from club_posts p join users u on u.id = p.author_id
               where p.club_id = $1 order by p.created_at desc limit 30`,
              [id],
            )
          : Promise.resolve({ rows: [] as RawPost[] }),
        pool.query<RawEventRow>(
          `select ce.id, ce.title, ce.description, ce.location, ce.starts_at, ce.approval_status, ce.image_url,
                  coalesce(count(ea.user_id), 0)::int as attendees_count,
                  coalesce(bool_or(ea.user_id = $2::uuid), false) as user_attending
           from club_events ce
           left join event_attendees ea on ea.event_kind = 'club' and ea.event_id = ce.id
           where ce.club_id = $1 and ce.starts_at >= now() and ce.approval_status = 'aprobado'
           group by ce.id
           order by ce.starts_at asc limit 12`,
          [id, user?.id ?? null],
        ),
        isAreaStaff || user?.role === "moderador"
          ? pool.query<RawEventRow>(
              `select ce.id, ce.title, ce.description, ce.location, ce.starts_at, ce.approval_status, ce.image_url,
                      0::int as attendees_count, false as user_attending
               from club_events ce where ce.club_id = $1 and ce.approval_status = 'pendiente'
               order by ce.starts_at asc`,
              [id],
            )
          : Promise.resolve({ rows: [] as RawEventRow[] }),
        isAreaStaff
          ? pool.query<DirectoryUserOption>(
              `select id, name, role from public.users where id = any($1::uuid[])`,
              [[club.leader_id, club.advisor_id]],
            )
          : Promise.resolve({ rows: [] as DirectoryUserOption[] }),
      ]);

      members = roster.rows;
      posts = feed.rows;
      events = upcoming.rows;
      pendingEvents = pendingEvs.rows.filter((ev) => {
        const venueArea = clubEventVenueArea(ev.location);
        if (venueArea) return user?.role === "admin" || (user?.role === "moderador" && user.area === venueArea);
        return isAreaStaff;
      });
      directoryPeople = peopleRes.rows;

      const isMember = managesClub || membership === "aceptada";
      if (user && (isMember || isAreaStaff)) {
        const contactRes = await pool.query<ClubContactDirectory>(
          `select leader_name, leader_email, advisor_name, advisor_email, advisor_room
           from public.get_club_contact_directory($1)`,
          [id],
        );
        contactDirectory = contactRes.rows[0] ?? null;
      }

      if (canModerate) {
        const [queueRes, metricsRes, eventAttendeesRes] = await Promise.all([
          pool.query<{
            user_id: string;
            name: string;
            application_note: string | null;
            application_answers: ClubApplicationAnswer[];
          }>(
            `select m.user_id, u.name, m.application_note, coalesce(m.application_answers, '[]'::jsonb) as application_answers
             from memberships m join users u on u.id = m.user_id
             where m.club_id = $1 and m.status = 'pendiente' order by u.name`,
            [id],
          ),
          pool.query<RawMetricsSummary>(
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
          pool.query<RawEventAttendeeDetail>(
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
        metricsRaw = metricsRes.rows[0] ?? null;

        const grouped = new Map<string, ClubEventAttendeeGroup>();
        for (const row of eventAttendeesRes.rows) {
          let entry = grouped.get(row.event_id);
          if (!entry) {
            entry = {
              eventId: row.event_id,
              title: row.title,
              startsLabel: formatWhen(row.starts_at),
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

  if (dbDown) return <p className={card}>No se pudo consultar el club. Vuelve a intentarlo en un momento.</p>;
  if (!club) notFound();

  const isAreaStaff = canModerateClubKind(user, club.kind);
  const manages = Boolean(
    user &&
      ((user.role === "alumno" && user.id === club.leader_id) ||
        (user.role === "profesor" && user.id === club.advisor_id)),
  );
  const isMember = manages || membership === "aceptada";
  const canViewFeed = isMember || isAreaStaff;
  const canModerate = Boolean(user && (manages || isAreaStaff));
  const joinQuestions = parseJoinQuestions(club.join_questions);
  const canRequest = Boolean(
    user &&
      user.role === "alumno" &&
      club.active &&
      !manages &&
      !isAreaStaff &&
      membership !== "pendiente" &&
      membership !== "aceptada",
  );
  const canPost = Boolean(user && club.active && manages);
  const canCreateEvent = Boolean(user && club.active && manages);
  const canEditClub = canModerate;

  const decidedTotal = (metricsRaw?.accepted_members ?? 0) + (metricsRaw?.rejected_requests ?? 0);
  const metrics: ClubMetricsData | null = metricsRaw
    ? {
        ...metricsRaw,
        acceptance_rate: decidedTotal > 0 ? Math.round((metricsRaw.accepted_members / decidedTotal) * 100) : null,
        avg_attendance:
          metricsRaw.approved_events > 0
            ? (metricsRaw.total_attendees / metricsRaw.approved_events).toFixed(1)
            : "0",
      }
    : null;

  const mapEvent = (ev: RawEventRow) => {
    const dp = dateParts(ev.starts_at);
    return {
      id: ev.id,
      title: ev.title,
      description: ev.description,
      location: ev.location,
      starts_label: formatWhen(ev.starts_at),
      day: dp.day,
      month: dp.month,
      approval_status: ev.approval_status,
      image_url: ev.image_url,
      attendees_count: ev.attendees_count,
      user_attending: ev.user_attending,
    };
  };

  return (
    <ClubWorkspace
      club={{
        ...club,
        art_url: club.logo_url ?? demoClubArt(club.name),
        join_questions: joinQuestions,
      }}
      contactDirectory={contactDirectory}
      membership={membership}
      isAuthenticated={Boolean(user)}
      isAreaStaff={isAreaStaff}
      areaBadgeLabel={isAreaStaff ? clubAreaBadgeLabel(user, club.kind) : null}
      manages={manages}
      canViewFeed={canViewFeed}
      canModerate={canModerate}
      canRequest={canRequest}
      canPost={canPost}
      canCreateEvent={canCreateEvent}
      canEditClub={canEditClub}
      members={members}
      posts={posts.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        image_url: p.image_url,
        author_name: p.author_name,
        created_label: formatWhen(p.created_at),
      }))}
      events={events.map(mapEvent)}
      pendingEvents={pendingEvents.map(mapEvent)}
      pendingRequests={pending}
      metrics={metrics}
      eventAttendeeGroups={eventAttendeeGroups}
      students={directoryPeople.filter((p) => p.role === "alumno")}
      professors={directoryPeople.filter((p) => p.role === "profesor")}
    />
  );
}
