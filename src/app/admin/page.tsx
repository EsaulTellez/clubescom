import { PageIntro } from "@/components/page-intro";
import type { Role } from "@/lib/auth";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, btnGhost, card, input, label } from "@/lib/ui";
import { resolvePrivacyRequest, updateSystemSettings } from "./actions";
import { UserControls } from "./forms";
import { RosterImport } from "./roster-import";
import { getAuditLogs, readAuditFilters } from "./audit-query";
import { PrintButton } from "./print-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Counts = {
  users_total: number;
  notices_total: number;
  clubs_total: number;
  lost_total: number;
  questions_total: number;
  active_30_days: number;
  active_today: number;
  questions_open: number;
  questions_unanswered_24h: number;
  questions_answered: number;
  handoffs_pending: number;
};
type Impact = { title: string; area: string; readers: number; views: number };

type Person = {
  id: string;
  name: string;
  email: string;
  role: Role;
  area: string | null;
  banned: boolean;
};

type PrivacyRequestRow = {
  id: string;
  user_name: string;
  kind: string;
  detail: string;
  status: string;
  resolution_note: string | null;
  created_at: Date;
};

const ROLE_LABEL: Record<Role, string> = {
  alumno: "Alumno",
  profesor: "Profesor",
  moderador: "Moderador",
  admin: "Administrador",
};

const ACTION_LABEL: Record<string, string> = {
  vetar: "Vetar",
  habilitar: "Quitar veto",
  cambiar_rol: "Cambiar rol",
  login: "Entrar",
  logout: "Salir",
  verificar: "Verificar correo",
  eliminar_cuenta: "Eliminar cuenta",
  crear: "Crear",
  editar: "Editar",
  eliminar: "Eliminar",
  confirmar_entrega: "Confirmar entrega",
};

function formatWhen(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(value);
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSession();
  if (!user || user.role !== "admin") {
    return (
      <section className={`${card} max-w-lg space-y-2`}>
        <h1 className="text-xl font-semibold">Panel</h1>
        <p className="text-sm text-[#667085]">No tienes permiso para ver esta sección.</p>
      </section>
    );
  }

  const supabase = await createSupabaseServerClient();
  const filters = readAuditFilters(await searchParams);
  const [metricsResult, logs, peopleResult, impactResult, questionImpact, settingsRes, privacyRes] = await Promise.all([
    supabase.rpc("admin_dashboard_metrics"),
    getAuditLogs(filters),
    supabase.rpc("admin_list_user_profiles"),
    supabase.rpc("admin_guide_impact"),
    supabase.rpc("admin_question_impact"),
    pool.query<{ key: string; value_int: number }>("select key, value_int from system_settings"),
    pool.query<PrivacyRequestRow>(
      `select pr.id, u.name as user_name, pr.kind, pr.detail, pr.status, pr.resolution_note, pr.created_at
       from privacy_requests pr join users u on u.id = pr.user_id
       order by (pr.status = 'pendiente') desc, pr.created_at desc limit 50`,
    ),
  ]);
  const people = { rows: (peopleResult.data ?? []) as Person[] };
  const summary = (metricsResult.data?.[0] ?? {}) as Partial<Counts>;
  const impact = (impactResult.data ?? []) as Impact[];
  const qImpact = (questionImpact.data ?? []) as { area: string; questions: number; unanswered: number }[];
  const settingsMap = new Map(settingsRes.rows.map((r) => [r.key, r.value_int]));
  const clubThreshold = settingsMap.get("club_interest_threshold") ?? 20;
  const forumCooldown = settingsMap.get("forum_cooldown_minutes") ?? 20;

  const stats = [
    ["Usuarios activos", summary.users_total],
    ["Activos hoy", summary.active_today],
    ["Activos (30 días)", summary.active_30_days],
    ["Avisos", summary.notices_total],
    ["Clubes activos", summary.clubs_total],
    ["Objetos abiertos", summary.lost_total],
    ["Preguntas totales", summary.questions_total],
    ["Preguntas sin responder", summary.questions_open],
    ["Sin respuesta > 24 h", summary.questions_unanswered_24h],
    ["Preguntas respondidas", summary.questions_answered],
    ["Entregas pendientes", summary.handoffs_pending],
  ] as const;

  const chartItems = [
    { label: "Usuarios activos", value: Number(summary.users_total ?? 0), color: "#006699" },
    { label: "Preguntas totales", value: Number(summary.questions_total ?? 0), color: "#26734e" },
    { label: "Preguntas respondidas", value: Number(summary.questions_answered ?? 0), color: "#0080a9" },
    { label: "Clubes activos", value: Number(summary.clubs_total ?? 0), color: "#43616e" },
    { label: "Avisos publicados", value: Number(summary.notices_total ?? 0), color: "#d4b64f" },
    { label: "Objetos abiertos", value: Number(summary.lost_total ?? 0), color: "#a85737" },
  ];
  const maxChartVal = Math.max(1, ...chartItems.map((i) => i.value));

  const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();

  return (
    <div className="space-y-8">
      <style>{`@media print { body * { visibility: hidden !important; } .admin-print, .admin-print * { visibility: visible !important; } .admin-print { position: relative; } .admin-print button, .admin-print form, .admin-print a { display: none !important; } }`}</style>
      <PageIntro kicker="Administración" title="Panel" text="Cuentas, indicadores, respaldo, solicitudes ARCO y auditoría." />

      {metricsResult.error && <p role="alert" className="text-sm text-[#8C1D18]">No se pudieron cargar los indicadores. Comprueba que las migraciones estén aplicadas.</p>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([labelText, value]) => (
          <article key={labelText} className={card}>
            <p className="text-sm text-[#667085]">{labelText}</p>
            <p className="mt-1 text-2xl font-semibold text-[#006699]">
              {value === undefined ? "—" : Number(value).toLocaleString("es-MX")}
            </p>
          </article>
        ))}
      </section>

      <section className={`${card} admin-print space-y-4`}>
        <div>
          <h2 className="text-lg font-semibold">Gráfica visual de impacto institucional (CU-35)</h2>
          <p className="text-sm text-[#667085]">Comparativa visual de actividad en la plataforma para reportes y seguimiento académico.</p>
        </div>
        <div className="space-y-2.5">
          {chartItems.map((item) => {
            const pct = Math.max(4, Math.round((item.value / maxChartVal) * 100));
            return (
              <div key={item.label} className="space-y-1 text-xs">
                <div className="flex justify-between font-semibold">
                  <span>{item.label}</span>
                  <span>{item.value}</span>
                </div>
                <svg className="h-3 w-full overflow-hidden rounded-full bg-[#e9eff2]" role="img" aria-label={`${item.label}: ${item.value}`}>
                  <rect x="0" y="0" width={`${pct}%`} height="100%" fill={item.color} rx="6" />
                </svg>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 border-t border-[#d5e4ee] pt-4 sm:grid-cols-2">
          <div>
            <h3 className="font-semibold">Uso de guías (≥ 5 lectores)</h3>
            {impactResult.error ? <p className="text-sm">No se pudieron consultar los indicadores.</p> : impact.length ? <ul className="mt-2 space-y-2 text-sm">{impact.map((item, index) => <li key={`${item.area}-${item.title}-${index}`}><strong>{item.title}</strong> · {item.area} · {item.views} vistas de {item.readers} personas</li>)}</ul> : <p className="mt-1 text-sm text-[#667085]">Aún no hay guías con al menos 5 lectores distintos.</p>}
          </div>
          <div>
            <h3 className="font-semibold">Preguntas por área (≥ 5 autores)</h3>
            {questionImpact.error ? <p className="text-sm">No se pudieron consultar las preguntas.</p> : qImpact.length ? <ul className="mt-2 space-y-1 text-sm">{qImpact.map((item) => <li key={item.area}>{item.area} · {item.questions} preguntas · {item.unanswered} sin responder</li>)}</ul> : <p className="mt-1 text-sm text-[#667085]">Aún no hay áreas con al menos 5 autores distintos.</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <PrintButton />
          <a className="rounded border px-3 py-2 text-sm text-[#006699]" href="/admin/impacto.csv">Descargar reporte CSV</a>
        </div>
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="text-lg font-semibold">Parámetros configurables de negocio</h2>
        <form action={updateSystemSettings} className="grid gap-4 sm:grid-cols-3 sm:items-end">
          <label className={label}>
            Umbral de interesados para propuestas de club
            <input className={input} type="number" name="club_interest_threshold" min={1} max={100} defaultValue={clubThreshold} required />
          </label>
          <label className={label}>
            Enfriamiento entre preguntas del foro (minutos)
            <input className={input} type="number" name="forum_cooldown_minutes" min={0} max={120} defaultValue={forumCooldown} required />
          </label>
          <button className={btn}>Guardar parámetros</button>
        </form>
      </section>

      {privacyRes.rows.length > 0 && (
        <section className={`${card} space-y-3`}>
          <h2 className="text-lg font-semibold">Solicitudes de Derechos ARCO e incidentes de privacidad</h2>
          <ul className="space-y-3 text-sm">
            {privacyRes.rows.map((req) => (
              <li key={req.id} className="rounded-xl border border-[#d5e4ee] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{req.user_name} · <span className="uppercase text-[#006699]">{req.kind}</span></strong>
                  <span className="rounded-full bg-[#e6f3fa] px-2.5 py-0.5 text-xs text-[#004d73]">{req.status}</span>
                </div>
                <p className="mt-1 text-[#52596a]">{req.detail}</p>
                {req.resolution_note && <p className="mt-1 text-xs text-[#17634a]">Resolución: {req.resolution_note}</p>}
                {req.status === "pendiente" && (
                  <form action={resolvePrivacyRequest} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="request_id" value={req.id} />
                    <input className={`${input} flex-1`} name="resolution_note" placeholder="Respuesta para el titular de los datos" required />
                    <button name="status" value="resuelta" className={btn}>Marcar resuelta</button>
                    <button name="status" value="rechazada" className={btnGhost}>Rechazar</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Usuarios</h2>
        {people.rows.length === 0 ? (
          <p className={card}>No hay usuarios.</p>
        ) : (
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#d5e4ee] text-[#667085]">
                  <th className="py-2 pr-3 font-medium">Persona</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {people.rows.map((person) => (
                  <tr key={person.id} className="border-b border-[#d5e4ee] align-top last:border-0">
                    <td className="py-3 pr-3">
                      <p className="font-medium">{person.name}</p>
                      <p className="text-[#667085]">{person.email}</p>
                      <p className="text-[#667085]">
                        {ROLE_LABEL[person.role]}
                        {person.area ? ` · ${person.area}` : ""}
                      </p>
                    </td>
                    <td className="py-3 pr-3">{person.banned ? "Vetado" : "Activo"}</td>
                    <td className="py-3">
                      <UserControls
                        userId={person.id}
                        role={person.role}
                        area={person.area}
                        banned={person.banned}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RosterImport />

      <section className={`${card} space-y-2`}>
        <h2 className="text-lg font-semibold">Respaldo y restauración local (RNF-11)</h2>
        <p className="text-sm text-[#667085]">
          Ejecuta en terminal <code>bash scripts/backup.sh</code> para generar un volcado SQL completo de esquemas y datos en <code>backups/</code>, y <code>bash scripts/restore.sh &lt;archivo.sql&gt;</code> para restaurarlo.
        </p>
      </section>

      <section className="admin-print space-y-3">
        <h2 className="text-lg font-semibold">Auditoría (CU-34)</h2>
        <p className="text-sm text-[#667085]">Hasta 500 movimientos con registro de actor, IP, valor anterior/nuevo y fecha.</p>
        <form className="flex flex-wrap gap-2" method="get">
          <input className="rounded border p-2 text-sm" name="actor" defaultValue={filters.actor} placeholder="Nombre de usuario" aria-label="Nombre de usuario" />
          <input className="rounded border p-2 text-sm" name="entity" defaultValue={filters.entity} placeholder="Entidad" aria-label="Entidad" />
          <label className="text-sm">Desde <input className="rounded border p-2" type="date" name="from" defaultValue={filters.from} /></label>
          <label className="text-sm">Hasta <input className="rounded border p-2" type="date" name="to" defaultValue={filters.to} /></label>
          <button className="rounded bg-[#006699] px-3 py-2 text-sm text-white">Filtrar</button>
          <a className="rounded border px-3 py-2 text-sm text-[#006699]" href={`/admin/auditoria.csv${query ? `?${query}` : ""}`}>Descargar CSV</a>
        </form>
        {logs.rows.length === 0 ? (
          <p className={card}>Todavía no hay registros de auditoría.</p>
        ) : (
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#d5e4ee] text-[#667085]">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Quién / IP</th>
                  <th className="py-2 pr-3 font-medium">Acción</th>
                  <th className="py-2 pr-3 font-medium">Anterior → Nuevo</th>
                  <th className="py-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logs.rows.map((log) => (
                  <tr key={log.id} className="border-b border-[#d5e4ee] align-top last:border-0">
                    <td className="py-3 pr-3 whitespace-nowrap">{formatWhen(log.created_at)}</td>
                    <td className="py-3 pr-3">
                      {log.actor_name ?? "Sistema"}
                      <span className="block font-mono text-xs text-[#667085]">{log.ip_address ?? "127.0.0.1"}</span>
                    </td>
                    <td className="py-3 pr-3">
                      {ACTION_LABEL[log.action] ?? log.action}
                      <span className="block text-[#667085]">{log.entity}</span>
                    </td>
                    <td className="py-3 pr-3 text-xs text-[#526170]">
                      {log.old_value || log.new_value ? `${log.old_value ?? "—"} → ${log.new_value ?? "—"}` : "—"}
                    </td>
                    <td className="py-3">{log.detail ?? log.entity_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
