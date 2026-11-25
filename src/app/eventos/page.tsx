import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { canModerateClubKind } from "../clubes/format";
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
  space_id: string | null;
  title: string;
  description: string;
  starts_at: Date;
  ends_at: Date | null;
  space_name: string;
  location: string | null;
  building: string | null;
  speaker: string | null;
  is_public: boolean;
  club_id: string | null;
  club_name: string | null;
  club_kind: string | null;
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
  const [spaces, events, pendingEvents, managedClubsRes] = await Promise.all([
    pool.query<Space>("select id, name, kind, building, description from spaces order by name"),
    pool.query<RawCarteleraEvent>(
      `
      select * from (
        select
          e.id::text as id,
          'space'::text as event_kind,
          e.space_id::text as space_id,
          e.title,
          e.description,
          e.starts_at,
          e.ends_at,
          s.name as space_name,
          null::text as location,
          s.building,
          e.speaker,
          e.is_public,
          null::text as club_id,
          null::text as club_name,
          null::text as club_kind,
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
          and (e.starts_at >= now() - interval '12 hours' or (e.ends_at is not null and e.ends_at >= now()))

        union all

        select
          ce.id::text as id,
          'club'::text as event_kind,
          null::text as space_id,
          ce.title,
          ce.description,
          ce.starts_at,
          ce.ends_at,
          coalesce(nullif(split_part(ce.location, '·', 1), ''), 'Campus ESCOM') as space_name,
          ce.location,
          nullif(trim(split_part(ce.location, '·', 2)), '') as building,
          null::text as speaker,
          true as is_public,
          c.id::text as club_id,
          c.name as club_name,
          c.kind as club_kind,
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
          and (ce.starts_at >= now() - interval '12 hours' or (ce.ends_at is not null and ce.ends_at >= now()))
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
            e.space_id::text as space_id,
            e.title,
            e.description,
            e.starts_at,
            e.ends_at,
            s.name as space_name,
            null::text as location,
            s.building,
            e.speaker,
            e.is_public,
            null::text as club_id,
            null::text as club_name,
            null::text as club_kind,
            e.image_url,
            0::int as attendees_count,
            false as viewer_attending
          from public.space_events e
          join public.spaces s on s.id = e.space_id
          where e.approval_status = 'pendiente'
          order by starts_at asc
        `)
      : Promise.resolve({ rows: [] as RawCarteleraEvent[] }),
    user && (user.role === "alumno" || user.role === "profesor")
      ? pool.query<{ id: string; name: string }>(
          `select id, name from public.clubs
           where active = true
             and (($2 = 'alumno' and leader_id = $1) or ($2 = 'profesor' and advisor_id = $1))
           order by name`,
          [user.id, user.role],
        )
      : Promise.resolve({ rows: [] as { id: string; name: string }[] }),
  ]);

  const publishableSpaces = canPublishEvents
    ? spaces.rows.filter((space) => canManageSpaceByName(user, space.name))
    : [];

  const visiblePendingEvents = canPublishEvents
    ? pendingEvents.rows.filter((ev) => canManageSpaceByName(user, ev.space_name))
    : [];

  const managedClubIds = new Set(managedClubsRes.rows.map((club) => club.id));
  const canManageCarteleraEvent = (event: RawCarteleraEvent) => {
    if (event.event_kind === "space") {
      return canManageSpaceByName(user, event.space_name);
    }
    if (event.club_id && managedClubIds.has(event.club_id)) return true;
    const venueArea = clubEventVenueArea(event.location ?? event.space_name);
    if (venueArea) return canManageSpaceByName(user, event.space_name);
    return Boolean(event.club_kind && canModerateClubKind(user, event.club_kind));
  };

  return (
    <div className="space-y-6">
      <EventBoard
        events={events.rows.map((event) => ({
          id: event.id,
          eventKind: event.event_kind,
          spaceId: event.space_id,
          title: event.title,
          description: event.description,
          startsAt: event.starts_at.toISOString(),
          endsAt: event.ends_at?.toISOString() ?? null,
          spaceName: event.space_name.trim(),
          location: event.location,
          building: event.building,
          speaker: event.speaker,
          isPublic: event.is_public,
          clubId: event.club_id,
          clubName: event.club_name,
          imageUrl: event.image_url,
          attendeesCount: event.attendees_count,
          viewerAttending: event.viewer_attending,
          canManageEvent: canManageCarteleraEvent(event),
        }))}
        pendingEvents={visiblePendingEvents.map((event) => ({
          id: event.id,
          eventKind: event.event_kind,
          spaceId: event.space_id,
          title: event.title,
          description: event.description,
          startsAt: event.starts_at.toISOString(),
          endsAt: event.ends_at?.toISOString() ?? null,
          spaceName: event.space_name.trim(),
          location: event.location,
          building: event.building,
          speaker: event.speaker,
          isPublic: event.is_public,
          clubId: event.club_id,
          clubName: event.club_name,
          imageUrl: event.image_url,
          attendeesCount: 0,
          viewerAttending: false,
        }))}
        spaceNames={(officeSpace ? publishableSpaces : spaces.rows).map((space) => space.name)}
        spaces={publishableSpaces}
        managedClubs={managedClubsRes.rows}
        canPublishEvents={canPublishEvents}
        isAuthenticated={Boolean(user)}
        currentMonth={currentMonth()}
      />
    </div>
  );
}
