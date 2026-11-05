import { PageIntro } from "@/components/page-intro";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { SpacesTabs } from "./spaces-tabs";

export const dynamic = "force-dynamic";

type Cubicle = {
  id: string;
  professor_id: string | null;
  label: string;
  building: string;
  floor: string | null;
  x: number;
  y: number;
  professor_name: string | null;
};
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
  const [cubicles, spaces, events, mine] = await Promise.all([
    pool.query<Cubicle>(
      `select c.id, c.professor_id, c.label, c.building, c.floor,
              c.x::float8 as x, c.y::float8 as y, u.name as professor_name
       from cubicles c
       left join users u on u.id = c.professor_id
       order by c.building, c.floor nulls first, c.label`,
    ),
    pool.query<Space>("select id, name, kind, building, description from spaces order by name"),
    pool.query<SpaceEvent>(
      `select e.id, e.title, e.description, e.starts_at, e.ends_at,
              s.name as space_name, s.building
       from space_events e
       join spaces s on s.id = e.space_id
       where e.approval_status = 'aprobado' and e.starts_at >= now()
       order by e.starts_at
       limit 100`,
    ),
    user?.role === "profesor"
      ? pool.query<Cubicle>(
          `select id, professor_id, label, building, floor,
                  x::float8 as x, y::float8 as y, null as professor_name
           from cubicles where professor_id = $1 limit 1`,
          [user.id],
        )
      : Promise.resolve({ rows: [] as Cubicle[] }),
  ]);

  const canPublishEvents = user?.role === "admin" || (
    user?.role === "moderador" &&
    (user.area === "comunicacion" || user.area === "clubes_academicos")
  );

  return (
    <div className="space-y-6">
      <PageIntro
        kicker="Campus · orientación y cartelera"
        title="Encuentra personas y actividades"
        text="Consulta cubículos docentes, explora el mapa y revisa eventos que ya cuentan con autorización."
      />
      <SpacesTabs
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
        cubicles={cubicles.rows}
        ownCubicle={mine.rows[0] ?? null}
        canEditCubicle={user?.role === "profesor"}
        canPublishEvents={Boolean(canPublishEvents)}
        currentMonth={currentMonth()}
      />
    </div>
  );
}
