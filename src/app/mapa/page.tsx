import { CampusMap, type RoomInfo, type Professor } from "@/components/campus-map";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { CubicleForm } from "../espacios/forms";

export const dynamic = "force-dynamic";
export default async function MapaPage() {
  const user = await getSession();
  const [rooms, assignments, professors, cubicles, mine] = await Promise.all([
    pool.query<{ code: string; kind: string; name: string; description: string }>("select code, kind, name, description from map_rooms"),
    pool.query<{ room_code: string; id: string; name: string }>("select a.room_code, u.id, u.name from map_room_professors a join users u on u.id = a.professor_id order by u.name"),
    user?.role === "admin" ? pool.query<Professor>("select id, name from users where role = 'profesor' and is_active order by name") : Promise.resolve({ rows: [] as Professor[] }),
    pool.query<{ id: string; label: string; building: string; floor: string | null; professor_name: string | null }>("select c.id, c.label, c.building, c.floor, u.name as professor_name from cubicles c left join users u on u.id = c.professor_id order by u.name"),
    user?.role === "profesor" ? pool.query<{ label: string; building: string; floor: string | null; x: number; y: number }>("select label, building, floor, x::float8, y::float8 from cubicles where professor_id = $1 limit 1", [user.id]) : Promise.resolve({ rows: [] }),
  ]);
  const roomInfo: RoomInfo[] = rooms.rows.map((room) => ({ ...room, professors: assignments.rows.filter((item) => item.room_code === room.code).map(({ id, name }) => ({ id, name })) }));
  return <div className="space-y-5"><h1 className="sr-only">Mapa y personas de ESCOM</h1>
    <CampusMap roomInfo={roomInfo} professors={professors.rows} canEdit={user?.role === "admin"} />
    <section className="board-sidecard p-5"><h2 className="text-lg font-extrabold text-[#1b4053]">Directorio de cubículos registrados</h2><p className="mt-1 text-sm text-[#5f6e78]">Ubicaciones compartidas por profesores. Las fichas del mapa se administran por separado.</p>
      {cubicles.rows.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{cubicles.rows.map((item) => <li key={item.id} className="rounded border border-[#dce5e2] p-3 text-sm"><strong>{item.professor_name ?? "Profesor"}</strong><p className="mt-1 text-[#5f6e78]">{item.label} · {item.building}{item.floor ? ` · piso ${item.floor}` : ""}</p></li>)}</ul> : <p className="mt-3 text-sm text-[#5f6e78]">Aún no hay ubicaciones registradas.</p>}
    </section>
    {user?.role === "profesor" && <details className="board-sidecard p-5"><summary className="cursor-pointer font-bold">Actualizar mi cubículo</summary><div className="mt-4 max-w-xl"><CubicleForm cubicle={mine.rows[0] ?? null} /></div></details>}
  </div>;
}
