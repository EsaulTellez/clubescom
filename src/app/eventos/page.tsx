import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { EventBoard } from "./event-board";

export const dynamic = "force-dynamic";

type Space = {
  id: string;
  name: string;
  kind: string;
  building: string | null;
  description: string | null;
};
type SpaceEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: Date;
  ends_at: Date | null;
  space_name: string;
  building: string | null;
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
  const [spaces, events] = await Promise.all([
    pool.query<Space>("select id, name, kind, building, description from spaces order by name"),
    pool.query<SpaceEvent>(`select e.id, e.title, e.description, e.starts_at, e.ends_at, s.name as space_name, s.building
      from space_events e join spaces s on s.id = e.space_id
      where e.approval_status = 'aprobado' and e.starts_at >= now() order by e.starts_at`),
  ]);

  const canPublishEvents = user?.role === "admin" || (
    user?.role === "moderador" &&
    (user.area === "comunicacion" || user.area === "clubes_academicos")
  );

  return (
    <div className="space-y-6">
      <EventBoard
        events={events.rows.map((event) => ({
          id: event.id,
          title: event.title,
          description: event.description,
          startsAt: event.starts_at.toISOString(),
          endsAt: event.ends_at?.toISOString() ?? null,
          spaceName: event.space_name,
          building: event.building,
        }))}
        spaces={spaces.rows}
        canPublishEvents={Boolean(canPublishEvents)}
        currentMonth={currentMonth()}
      />
    </div>
  );
}
