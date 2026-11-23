import { CampusMap, type RoomInfo, type Professor, type RoomSuggestion } from "@/components/campus-map";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

type RawSuggestionRow = {
  id: string;
  room_code: string;
  professor_id: string | null;
  professor_name: string;
  suggested_by: string;
  suggested_by_name: string;
  schedule_text: string;
  subjects_text: string;
  note: string;
  upvotes: number;
  downvotes: number;
  my_vote: number;
};

export default async function MapaPage() {
  const user = await getSession();
  const [rooms, assignments, suggestionsRaw, allProfessors, cubicles, mine] = await Promise.all([
    pool.query<{ code: string; kind: string; name: string; description: string }>(
      "select code, kind, name, description from map_rooms",
    ),
    pool.query<{ room_code: string; id: string; name: string }>(
      "select room_code, id, name from map_room_people order by name",
    ),
    pool
      .query<RawSuggestionRow>(
        `select s.id,
                s.room_code,
                s.professor_id::text as professor_id,
                coalesce(up.name, s.professor_name_input, 'Profesor') as professor_name,
                s.suggested_by,
                us.name as suggested_by_name,
                coalesce(s.schedule_text, '') as schedule_text,
                coalesce(s.subjects_text, '') as subjects_text,
                s.note,
                coalesce(sum(case when v.vote = 1 then 1 else 0 end), 0)::int as upvotes,
                coalesce(sum(case when v.vote = -1 then 1 else 0 end), 0)::int as downvotes,
                coalesce(max(case when v.user_id = $1::uuid then v.vote else 0 end), 0)::int as my_vote
           from map_room_suggestions s
           left join users up on up.id = s.professor_id
           join users us on us.id = s.suggested_by
           left join map_room_suggestion_votes v on v.suggestion_id = s.id
          group by s.id, up.name, us.name
          order by (coalesce(sum(case when v.vote = 1 then 1 else 0 end), 0) - coalesce(sum(case when v.vote = -1 then 1 else 0 end), 0)) desc,
                   s.created_at desc`,
        [user?.id ?? null],
      )
      .catch(() =>
        pool.query<RawSuggestionRow>(
          `select s.id,
                  s.room_code,
                  s.professor_id::text as professor_id,
                  up.name as professor_name,
                  s.suggested_by,
                  us.name as suggested_by_name,
                  ''::text as schedule_text,
                  ''::text as subjects_text,
                  s.note,
                  coalesce(sum(case when v.vote = 1 then 1 else 0 end), 0)::int as upvotes,
                  coalesce(sum(case when v.vote = -1 then 1 else 0 end), 0)::int as downvotes,
                  coalesce(max(case when v.user_id = $1::uuid then v.vote else 0 end), 0)::int as my_vote
             from map_room_suggestions s
             join users up on up.id = s.professor_id
             join users us on us.id = s.suggested_by
             left join map_room_suggestion_votes v on v.suggestion_id = s.id
            group by s.id, up.name, us.name
            order by (coalesce(sum(case when v.vote = 1 then 1 else 0 end), 0) - coalesce(sum(case when v.vote = -1 then 1 else 0 end), 0)) desc,
                     s.created_at desc`,
          [user?.id ?? null],
        ),
      ),
    user
      ? pool.query<Professor>(
          `select u.id::text as id, u.name, p.boleta, p.email
             from public.users u
             left join private.user_private p on p.user_id = u.id
            where u.role = 'profesor' and u.is_active
            order by u.name`,
        )
      : pool.query<Professor>("select id::text as id, name from public.users where role = 'profesor' order by name"),
    pool.query<{
      id: string;
      professor_id: string | null;
      label: string;
      building: string;
      floor: string | null;
      room_code: string | null;
      professor_name: string | null;
    }>(
      "select c.id, c.professor_id, c.label, c.building, c.floor, c.room_code, u.name as professor_name from cubicles c left join users u on u.id = c.professor_id order by u.name",
    ),
    user?.role === "profesor"
      ? pool.query<{
          label: string;
          building: string;
          floor: string | null;
          room_code: string | null;
          x: number;
          y: number;
        }>("select label, building, floor, room_code, x::float8, y::float8 from cubicles where professor_id = $1 limit 1", [
          user.id,
        ])
      : Promise.resolve({ rows: [] }),
  ]);

  const roomMap = new Map<string, RoomInfo>(
    rooms.rows.map((room) => [room.code, { ...room, professors: [], suggestions: [] }]),
  );

  for (const item of assignments.rows) {
    if (!roomMap.has(item.room_code)) {
      roomMap.set(item.room_code, {
        code: item.room_code,
        kind: "cubiculo",
        name: `Cubículo ${item.room_code}`,
        description: "",
        professors: [],
        suggestions: [],
      });
    }
    const entry = roomMap.get(item.room_code)!;
    if (!entry.professors.some((p) => p.id === item.id)) {
      entry.professors.push({ id: item.id, name: item.name });
    }
  }

  for (const sug of suggestionsRaw.rows) {
    if (!roomMap.has(sug.room_code)) {
      roomMap.set(sug.room_code, {
        code: sug.room_code,
        kind: "salon",
        name: `Espacio ${sug.room_code}`,
        description: "",
        professors: [],
        suggestions: [],
      });
    }
    const entry = roomMap.get(sug.room_code)!;
    entry.suggestions.push(sug as RoomSuggestion);
  }

  const roomInfo: RoomInfo[] = Array.from(roomMap.values());
  const professorDirectories = allProfessors.rows.map((prof) => {
    const cub = cubicles.rows.find((c) => c.professor_id === prof.id);
    const assignedRoom = assignments.rows.find((a) => a.id === prof.id);
    const topSuggestion = suggestionsRaw.rows.find(
      (s) => s.professor_id === prof.id && s.upvotes - s.downvotes >= 0,
    );
    const isConfirmed = Boolean(cub || assignedRoom);
    const status = isConfirmed ? ("confirmado" as const) : topSuggestion ? ("sugerido" as const) : ("sin_ubicacion" as const);
    return {
      id: prof.id,
      name: prof.name,
      room_code: cub?.room_code ?? assignedRoom?.room_code ?? topSuggestion?.room_code ?? null,
      status,
      schedule_text: topSuggestion?.schedule_text || null,
      subjects_text: topSuggestion?.subjects_text || null,
      location: cub
        ? `${cub.label} · ${cub.building}${cub.floor ? ` · piso ${cub.floor}` : ""}`
        : assignedRoom
          ? `Confirmado en ${assignedRoom.room_code}`
          : topSuggestion
            ? `Sugerido en ${topSuggestion.room_code} (${topSuggestion.upvotes} a favor · ${topSuggestion.downvotes} en contra)`
            : null,
    };
  });

  const canManageRooms =
    user?.role === "admin" || (user?.role === "moderador" && user.area === "prefectura");

  return (
    <CampusMap
      roomInfo={roomInfo}
      professors={allProfessors.rows}
      professorDirectories={professorDirectories}
      canEdit={canManageRooms}
      myCubicle={mine.rows[0] ?? null}
      viewer={user ? { id: user.id, name: user.name, role: user.role } : null}
    />
  );
}
