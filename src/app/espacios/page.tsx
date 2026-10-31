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
type Booking = {
  id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
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
  const [cubicles, spaces, bookings, mine] = await Promise.all([
    pool.query<Cubicle>(
      `select c.id, c.professor_id, c.label, c.building, c.floor,
              c.x::float8 as x, c.y::float8 as y, u.name as professor_name
       from cubicles c
       left join users u on u.id = c.professor_id
       order by c.building, c.label`,
    ),
    pool.query<Space>("select id, name, kind, building, description from spaces order by name"),
    pool.query<Booking>(
      `select b.id, b.title, b.starts_at, b.ends_at, s.name as space_name, s.building
       from bookings b join spaces s on s.id = b.space_id
       where b.is_public
       order by b.starts_at`,
    ),
    user?.role === "profesor"
      ? pool.query<Cubicle>(
          `select id, professor_id, label, building, floor,
                  x::float8 as x, y::float8 as y, null as professor_name
           from cubicles where professor_id = $1 order by id limit 1`,
          [user.id],
        )
      : Promise.resolve({ rows: [] as Cubicle[] }),
  ]);

  const own = mine.rows[0] ?? null;
  const canManage = user?.role === "admin" || user?.role === "moderador";

  return (
    <div className="space-y-6">
      <PageIntro
        kicker="Campus"
        title="Espacios"
        text="Descubre qué eventos vienen y explora el campus desde el mapa 3D."
      />
      <SpacesTabs
        events={bookings.rows.map((event) => ({
          id: event.id,
          title: event.title,
          startsAt: event.starts_at.toISOString(),
          endsAt: event.ends_at.toISOString(),
          spaceName: event.space_name,
          building: event.building,
        }))}
        spaces={spaces.rows}
        cubicles={cubicles.rows}
        ownCubicle={own}
        canEditCubicle={user?.role === "profesor"}
        canManage={canManage}
        currentMonth={currentMonth()}
      />
    </div>
  );
}
