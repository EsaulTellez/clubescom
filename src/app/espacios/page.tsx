import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { card } from "@/lib/ui";
import { BookingForm, CubicleForm } from "./forms";

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
  space_id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
};

function formatWhen(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(value);
}

function kindLabel(kind: string) {
  if (kind === "auditorio") return "Auditorio";
  if (kind === "sala") return "Sala";
  return kind;
}

function cubicleCaption(cubicle: Cubicle) {
  return cubicle.professor_name ? `${cubicle.label} · ${cubicle.professor_name}` : cubicle.label;
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
    pool.query<Space>(
      `select id, name, kind, building, description from spaces order by name`,
    ),
    pool.query<Booking>(
      `select id, space_id, title, starts_at, ends_at
       from bookings
       where is_public
       order by starts_at`,
    ),
    user?.role === "profesor"
      ? pool.query<Cubicle>(
          `select id, professor_id, label, building, floor, x::float8 as x, y::float8 as y, null as professor_name
           from cubicles
           where professor_id = $1
           order by id
           limit 1`,
          [user.id],
        )
      : Promise.resolve({ rows: [] as Cubicle[] }),
  ]);

  const bySpace = new Map<string, Booking[]>();
  for (const booking of bookings.rows) {
    const list = bySpace.get(booking.space_id) ?? [];
    list.push(booking);
    bySpace.set(booking.space_id, list);
  }
  const own = mine.rows[0] ?? null;
  const staff = user?.role === "admin" || user?.role === "moderador";

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.16em] text-[#6B1D2A]">ESCOM</p>
        <h1 className="text-2xl font-semibold tracking-tight">Espacios</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#5C4A45]">
          Mapa de cubículos e itinerario público de los espacios del campus.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className={`${card} space-y-4`}>
          <h2 className="font-semibold">Mapa del campus</h2>
          <svg viewBox="0 0 100 100" className="h-auto w-full rounded-lg bg-[#F6F1EA]" role="img" aria-label="Mapa del campus con cubículos">
            <rect x="1.5" y="1.5" width="97" height="97" rx="2" fill="#F6F1EA" stroke="#6B1D2A" strokeWidth="0.8" />
            <text x="6" y="8" fontSize="3.2" fill="#6B1D2A">
              Campus ESCOM
            </text>
            {cubicles.rows.map((cubicle) => {
              const caption = cubicleCaption(cubicle);
              const anchorEnd = cubicle.x > 68;
              return (
                <g key={cubicle.id}>
                  <title>{caption}</title>
                  <circle cx={cubicle.x} cy={cubicle.y} r="2.2" fill="#6B1D2A" />
                  <text
                    x={anchorEnd ? cubicle.x - 3 : cubicle.x + 3}
                    y={cubicle.y + 1}
                    textAnchor={anchorEnd ? "end" : "start"}
                    fontSize="2.7"
                    fill="#1C1416"
                    stroke="#F6F1EA"
                    strokeWidth="0.45"
                    style={{ paintOrder: "stroke" }}
                  >
                    {caption}
                  </text>
                </g>
              );
            })}
          </svg>
          {cubicles.rows.length === 0 ? (
            <p className="text-sm text-[#5C4A45]">Todavía no hay cubículos en el mapa.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {cubicles.rows.map((cubicle) => (
                <li key={cubicle.id} className="text-sm">
                  <span className="font-medium">{cubicle.label}</span>
                  {cubicle.professor_name ? ` · ${cubicle.professor_name}` : ""}
                  <span className="block text-[#5C4A45]">
                    {cubicle.building}
                    {cubicle.floor ? ` · piso ${cubicle.floor}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {user?.role === "profesor" && (
          <section className={`${card} space-y-3`}>
            <h2 className="font-semibold">Mi cubículo</h2>
            <p className="text-sm text-[#5C4A45]">
              Cada profesor tiene un cubículo. Si ya existe, estos datos lo actualizan.
            </p>
            <CubicleForm cubicle={own} />
          </section>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Itinerario</h2>
        {spaces.rows.length === 0 ? (
          <p className={card}>Todavía no hay espacios registrados.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {spaces.rows.map((space) => {
              const items = bySpace.get(space.id) ?? [];
              return (
                <article key={space.id} className={`${card} space-y-2`}>
                  <h3 className="font-semibold">{space.name}</h3>
                  <p className="text-xs uppercase tracking-wide text-[#6B1D2A]">
                    {kindLabel(space.kind)}
                    {space.building ? ` · ${space.building}` : ""}
                  </p>
                  {space.description && <p className="text-sm text-[#5C4A45]">{space.description}</p>}
                  {items.length === 0 ? (
                    <p className="text-sm text-[#5C4A45]">Sin reservas públicas.</p>
                  ) : (
                    <ul className="space-y-2">
                      {items.map((booking) => (
                        <li key={booking.id} className="text-sm">
                          <p className="font-medium">{booking.title}</p>
                          <p className="text-[#5C4A45]">
                            {formatWhen(booking.starts_at)} – {formatWhen(booking.ends_at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {staff && spaces.rows.length > 0 && (
        <section className={`${card} max-w-xl space-y-3`}>
          <h2 className="font-semibold">Nueva reserva</h2>
          <BookingForm spaces={spaces.rows.map((space) => ({ id: space.id, name: space.name }))} />
        </section>
      )}
    </div>
  );
}
