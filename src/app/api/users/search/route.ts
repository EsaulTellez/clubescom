import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DirectoryUser = {
  id: string;
  name: string;
  role: string;
  area: string | null;
  boleta: string | null;
  email: string | null;
};

const ALLOWED_ROLES = new Set(["alumno", "profesor", "moderador", "admin"]);

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim().slice(0, 120);
  const rawRoles = (searchParams.get("roles") ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => ALLOWED_ROLES.has(r));
  const limitRaw = Number(searchParams.get("limit") ?? 25);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 40) : 25;

  const isPrivileged =
    user.role === "admin" ||
    user.role === "moderador" ||
    user.delegatedClubKinds.length > 0;

  const effectiveRoles = isPrivileged
    ? rawRoles.length > 0
      ? rawRoles
      : ["alumno", "profesor", "moderador"]
    : ["profesor"];

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("search_directory_users", {
      p_query: query,
      p_roles: effectiveRoles,
      p_limit: limit,
    });
    if (!error && Array.isArray(data)) {
      return NextResponse.json({
        users: data.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          role: String(row.role),
          area: row.area ? String(row.area) : null,
          boleta: row.boleta ? String(row.boleta) : null,
          email: row.email ? String(row.email) : null,
        })),
      });
    }
  } catch {
    // Fallback to direct SQL query below if RPC migration is not applied yet.
  }

  try {
    const pattern = `%${query}%`;
    const result = await pool.query<DirectoryUser>(
      `select
         u.id::text as id,
         u.name,
         u.role,
         u.area,
         case when $4::boolean or u.role = 'profesor' then p.boleta else null end as boleta,
         p.email
       from public.users u
       left join private.user_private p on p.user_id = u.id
       where u.is_active = true
         and u.role = any($1::text[])
         and (
           $2 = ''
           or u.name ilike $3
           or coalesce(p.boleta, '') ilike $3
           or coalesce(p.email, '') ilike $3
         )
       order by
         case when $2 <> '' and lower(coalesce(p.boleta, '')) = lower($2) then 0 else 1 end,
         case when $2 <> '' and lower(u.name) like lower($2) || '%' then 0 else 1 end,
         u.name asc
       limit $5`,
      [effectiveRoles, query, pattern, isPrivileged, limit],
    );
    return NextResponse.json({ users: result.rows });
  } catch {
    return NextResponse.json({ users: [] });
  }
}
