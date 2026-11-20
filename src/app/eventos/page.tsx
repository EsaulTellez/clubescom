import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { officeEventSpace, clubEventVenueArea, canManageSpaceByName, canPublishAnySpaceEvents } from "../espacios/shared";
import { EventBoard } from "./event-board";

export const dynamic = "force-dynamic";

type Space = {
  id: string;
  name: string;
  kind: string;
  building: string | null;
  description: string | null;
};
type RawCarteleraEvent = {
  id: string;
  event_kind: "space" | "club";
  title: string;
  description: string;
  starts_at: Date;
  ends_at: Date | null;
  space_name: string;
  building: string | null;
  speaker: string | null;
  club_id: string | null;
  club_name: string | null;
  image_url: string | null;
  attendees_count: number;
  viewer_attending: boolean;
};

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "America/Mexico_City",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export default async function EspaciosPage() {
  const user = await getSession();
  const viewerId = user?.id ?? null;
  const officeSpace = officeEventSpace(user);
  const canPublishEvents = canPublishAnySpaceEvents(user);
  const [spaces, events, pendingEvents] = await Promise.all([
    pool.query<Space>("select id, name, kind, building, description from spaces order by name"),
    pool.query<RawCarteleraEvent>(
      `
      select * from (
        select
          e.id::text as id,
          'space'::text as event_kind,
          e.title,
          e.description,
          e.starts_at,
          e.ends_at,
          s.name as space_name,
          s.building,
          e.speaker,
          null::text as club_id,
          null::text as club_name,
          e.image_url,
          (select count(*)::int from public.event_attendees ea where ea.event_kind = 'space' and ea.event_id = e.id) as attendees_count,
          exists (
            select 1 from public.event_attendees ea
            where ea.event_kind = 'space' and ea.event_id = e.id and $1::uuid is not null and ea.user_id = $1::uuid
          ) as viewer_attending
        from public.space_events e
        join public.spaces s on s.id = e.space_id
        where e.approval_status = 'aprobado'
          and (e.is_public or ($3 and (s.name = $2 or $4)))
          and ($2::text is null or s.name = $2)
          and e.starts_at >= now() - interval '12 hours'

        union all

        select
          ce.id::text as id,
          'club'::text as event_kind,
          ce.title,
          ce.description,
          ce.starts_at,
          null::timestamptz as ends_at,
          coalesce(nullif(split_part(ce.location, '·', 1), ''), 'Campus ESCOM') as space_name,
          nullif(trim(split_part(ce.location, '·', 2)), '') as building,
          null::text as speaker,
          c.id::text as club_id,
          c.name as club_name,
          ce.image_url,
          (select count(*)::int from public.event_attendees ea where ea.event_kind = 'club' and ea.event_id = ce.id) as attendees_count,
          exists (
            select 1 from public.event_attendees ea
            where ea.event_kind = 'club' and ea.event_id = ce.id and $1::uuid is not null and ea.user_id = $1::uuid
          ) as viewer_attending
        from public.club_events ce
        join public.clubs c on c.id = ce.club_id and c.active = true
        where ce.approval_status = 'aprobado'
          and ($2::text is null or lower(trim(split_part(ce.location, '·', 1))) = lower($2))
          and ce.starts_at >= now() - interval '12 hours'
      ) cartelera
      order by starts_at asc
      `,
      [viewerId, officeSpace ?? null, canPublishEvents, user?.role === "admin"],
    ),
    canPublishEvents
      ? pool.query<RawCarteleraEvent>(`
          select
            e.id::text as id,
            'space'::text as event_kind,
            e.title,
            e.description,
            e.starts_at,
            e.ends_at,
            s.name as space_name,
            s.building,
            e.speaker,
            null::text as club_id,
            null::text as club_name,
            e.image_url,
            0::int as attendees_count,
            false as viewer_attending
          from public.space_events e
          join public.spaces s on s.id = e.space_id
          where e.approval_status = 'pendiente'
          union all
          select ce.id::text, 'club', ce.title, ce.description, ce.starts_at, ce.ends_at,
                 trim(split_part(ce.location, '·', 1)), null, null, ce.club_id::text, c.name,
                 ce.image_url, 0, false
          from public.club_events ce join public.clubs c on c.id = ce.club_id
          where c.active and ce.approval_status = 'pendiente'
            and private.club_event_venue_area(ce.location) is not null
          order by starts_at asc
        `)
      : Promise.resolve({ rows: [] as RawCarteleraEvent[] }),
  ]);

  const publishableSpaces = canPublishEvents
    ? spaces.rows.filter((space) => canManageSpaceByName(user, space.name))
    : spaces.rows;

  const visiblePendingEvents = canPublishEvents
    ? pendingEvents.rows.filter((ev) => canManageSpaceByName(user, ev.space_name))
    : [];

  return (
    <div className="space-y-6">
      <EventBoard
        events={events.rows.map((event) => ({
          id: event.id,
          eventKind: event.event_kind,
          title: event.title,
          description: event.description,
          startsAt: event.starts_at.toISOString(),
          endsAt: event.ends_at?.toISOString() ?? null,
          spaceName: event.space_name.trim(),
          building: event.building,
          speaker: event.speaker,
          clubId: event.club_id,
          clubName: event.club_name,
          imageUrl: event.image_url,
          attendeesCount: event.attendees_count,
          viewerAttending: event.viewer_attending,
          canManageEvent:
            (event.event_kind === "space" || !!clubEventVenueArea(event.space_name)) && canManageSpaceByName(user, event.space_name),
        }))}
        pendingEvents={visiblePendingEvents.map((event) => ({
          id: event.id,
          eventKind: event.event_kind,
          title: event.title,
          description: event.description,
          startsAt: event.starts_at.toISOString(),
          endsAt: event.ends_at?.toISOString() ?? null,
          spaceName: event.space_name.trim(),
          building: event.building,
          speaker: event.speaker,
          clubId: event.club_id,
          clubName: event.club_name,
          imageUrl: event.image_url,
          attendeesCount: 0,
          viewerAttending: false,
        }))}
        spaceNames={(officeSpace ? publishableSpaces : spaces.rows).map((space) => space.name)}
        spaces={publishableSpaces}
        canPublishEvents={canPublishEvents}
        canSubmitForReview={user?.role === "alumno" || user?.role === "profesor"}
        isAuthenticated={Boolean(user)}
        currentMonth={currentMonth()}
      />
    </div>
  );
}
