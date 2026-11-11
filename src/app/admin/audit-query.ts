import { pool } from "@/lib/db";

export type AuditFilters = { actor?: string; entity?: string; from?: string; to?: string };
export function readAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (key: string) => typeof params[key] === "string" ? String(params[key]).trim().slice(0, 80) : "";
  const date = (key: string) => {
    const value = one(key);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "";
  };
  return { actor: one("actor"), entity: one("entity"), from: date("from"), to: date("to") };
}
export async function getAuditLogs(f: AuditFilters) {
  return pool.query<{ id: string; action: string; entity: string; entity_id: string | null; detail: string | null; created_at: Date; actor_name: string | null }>(
    `select l.id, l.action, l.entity, l.entity_id, l.detail, l.created_at, u.name as actor_name
     from audit_logs l left join users u on u.id = l.actor_id
     where ($1 = '' or u.name ilike '%' || $1 || '%')
       and ($2 = '' or l.entity ilike '%' || $2 || '%')
       and ($3 = '' or l.created_at >= nullif($3, '')::date)
       and ($4 = '' or l.created_at < nullif($4, '')::date + interval '1 day')
     order by l.created_at desc limit 500`, [f.actor ?? "", f.entity ?? "", f.from ?? "", f.to ?? ""]);
}
