import { getSession } from "@/lib/auth";
import { getAuditLogs, readAuditFilters } from "../audit-query";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user || user.role !== "admin") return new Response("No autorizado", { status: 403 });
  const url = new URL(request.url);
  const logs = await getAuditLogs(readAuditFilters(Object.fromEntries(url.searchParams.entries())));
  const cell = (value: unknown) => {
    let text = String(value ?? "").replace(/[\r\n]+/g, " ");
    if (/^[\s]*[=+@\-\t]/.test(text)) text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [["fecha_utc", "usuario", "accion", "entidad", "id_entidad", "detalle"], ...logs.rows.map((l) => [l.created_at.toISOString(), l.actor_name, l.action, l.entity, l.entity_id, l.detail])];
  return new Response("\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="auditoria-escom.csv"', "Cache-Control": "no-store" } });
}
