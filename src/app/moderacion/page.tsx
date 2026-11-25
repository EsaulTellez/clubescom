import type { DirectoryUserOption } from "@/components/searchable-user-picker";
import { redirect } from "next/navigation";
import { officeModules } from "@/lib/areas";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { MODERATION_AREAS, UUID } from "./shared";
import { ModerationWorkspace } from "./moderation-workspace";

export const dynamic = "force-dynamic";

type Search = Promise<{
  error?: string;
  guardada?: string;
  resuelta?: string;
  user_id?: string;
  area?: string;
  source_type?: string;
  reason?: string;
}>;
type Strike = {
  id: string;
  user_name: string;
  user_boleta: string | null;
  area: string;
  reason: string;
  source_type: string;
  created_at: Date;
  strike_total: number;
};
type Suspension = {
  id: string;
  user_name: string;
  user_boleta: string | null;
  area: string;
  strike_count: number;
  starts_at: Date;
  ends_at: Date | null;
  is_permanent: boolean;
};
type Appeal = {
  id: string;
  suspension_id: string;
  body: string;
  status: string;
  created_at: Date;
  user_name: string;
  user_boleta: string | null;
  area: string;
  strike_count: number;
  starts_at: Date;
  is_permanent: boolean;
  ends_at: Date | null;
};

function when(value: Date | string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}

export default async function ModeracionPage({ searchParams }: { searchParams: Search }) {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "moderador")) redirect("/entrar");
  const modules = officeModules(user);
  if (modules) redirect(modules[0]);

  const isAreaMod = user.role === "moderador";
  const areaScope = isAreaMod ? user.area : null;

  const params = await searchParams;
  const targetRoles = isAreaMod ? ["alumno", "profesor"] : ["alumno", "profesor", "moderador"];
  const [peopleResult, strikesResult, suspensionsResult, appealsResult] = await Promise.all([
    params.user_id && UUID.test(params.user_id)
      ? pool.query<DirectoryUserOption>(
          `select id, name, role from public.users
            where id = $1 and is_active and role::text = any($2::text[]) and id <> $3`,
          [params.user_id, targetRoles, user.id],
        )
      : pool.query<DirectoryUserOption>(
          `select id, name, role, area, boleta, email
             from public.search_directory_users('', $1::text[], 50)
            where id <> $2`,
          [targetRoles, user.id],
        ),
    pool.query<Strike>(
      `select s.id, u.name as user_name, private.moderation_user_boleta(u.id) as user_boleta, s.area, s.reason, s.source_type, s.created_at,
              (select count(*)::int from moderation_strikes all_s where all_s.user_id = s.user_id) as strike_total
         from moderation_strikes s
         join users u on u.id = s.user_id
        where ($1::text is null or s.area = $1::text)
        order by s.created_at desc limit 100`,
      [areaScope],
    ),
    pool.query<Suspension>(
      `select s.id, u.name as user_name, private.moderation_user_boleta(u.id) as user_boleta, s.area, s.strike_count,
              s.starts_at, s.ends_at, s.is_permanent
         from moderation_suspensions s
         join users u on u.id = s.user_id
        where ($1::text is null or s.area = $1::text)
        order by s.starts_at desc limit 100`,
      [areaScope],
    ),
    pool.query<Appeal>(
      `select a.id, a.suspension_id, a.body, a.status, a.created_at,
              u.name as user_name, private.moderation_user_boleta(u.id) as user_boleta, s.area, s.strike_count, s.starts_at, s.is_permanent, s.ends_at
         from moderation_appeals a
         join moderation_suspensions s on s.id = a.suspension_id
         join users u on u.id = a.user_id
        where ($1::text is null or s.area = $1::text)
        order by (a.status = 'pendiente') desc, a.created_at desc limit 100`,
      [areaScope],
    ),
  ]);

  const areaChoices =
    user.role === "moderador"
      ? MODERATION_AREAS.filter((area) => area.id === user.area)
      : MODERATION_AREAS;

  const errorText = params.error
    ? params.error === "datos"
      ? "Revisa el motivo, la persona y el área seleccionada."
      : params.error === "persona"
        ? "No encontramos esa cuenta o no puede recibir una infracción."
        : params.error === "nota"
          ? "Explica la decisión con al menos cinco caracteres."
          : params.error
    : undefined;

  return (
    <ModerationWorkspace
      isAdmin={user.role === "admin"}
      viewerArea={user.role === "moderador" ? user.area : null}
      areaChoices={areaChoices}
      people={peopleResult.rows}
      strikes={strikesResult.rows.map((s) => ({
        id: s.id,
        user_name: s.user_name,
        user_boleta: s.user_boleta,
        area: s.area,
        reason: s.reason,
        source_type: s.source_type,
        created_label: when(s.created_at),
        strike_total: s.strike_total,
      }))}
      suspensions={suspensionsResult.rows.map((s) => ({
        id: s.id,
        user_name: s.user_name,
        user_boleta: s.user_boleta,
        area: s.area,
        strike_count: s.strike_count,
        starts_at: s.starts_at.toISOString(),
        starts_label: when(s.starts_at),
        ends_at: s.ends_at?.toISOString() ?? null,
        is_permanent: s.is_permanent,
      }))}
      appeals={appealsResult.rows.map((a) => ({
        id: a.id,
        suspension_id: a.suspension_id,
        body: a.body,
        status: a.status,
        created_label: when(a.created_at),
        user_name: a.user_name,
        user_boleta: a.user_boleta,
        area: a.area,
        strike_count: a.strike_count,
        starts_at: a.starts_at.toISOString(),
        is_permanent: a.is_permanent,
        ends_at: a.ends_at?.toISOString() ?? null,
      }))}
      prefill={{
        userId: params.user_id ?? "",
        area: params.area ?? "",
        sourceType: params.source_type ?? "foro",
        reason: params.reason ?? "",
      }}
      feedback={{
        saved: Boolean(params.guardada),
        resolved: Boolean(params.resuelta),
        error: errorText,
      }}
    />
  );
}
