import { PageIntro } from "@/components/page-intro";
import type { Role } from "@/lib/auth";
import { getSession } from "@/lib/auth";
import { card } from "@/lib/ui";
import { UserControls } from "./forms";
import { RosterImport } from "./roster-import";
import { getAuditLogs, readAuditFilters } from "./audit-query";
import { PrintButton } from "./print-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Counts = { users_total: number; notices_total: number; clubs_total: number; lost_total: number; questions_total: number; active_30_days: number; questions_open: number; questions_answered: number; handoffs_pending: number };
type Impact = { title: string; area: string; readers: number; views: number };

type Person = {
  id: string;
  name: string;
  email: string;
  role: Role;
  area: string | null;
  banned: boolean;
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

  const supabase = user.role === "admin" ? await createSupabaseServerClient() : null;
  const filters = readAuditFilters(await searchParams);
  const [metricsResult, logs, peopleResult, impactResult, questionImpact] = await Promise.all([
    supabase!.rpc("admin_dashboard_metrics"), getAuditLogs(filters),
    supabase!.rpc("admin_list_user_profiles"), supabase!.rpc("admin_guide_impact"), supabase!.rpc("admin_question_impact"),
  ]);
  const people = { rows: (peopleResult.data ?? []) as Person[] };
  const summary = (metricsResult.data?.[0] ?? {}) as Partial<Counts>;
  const impact = (impactResult.data ?? []) as Impact[];
  const stats = [
    ["Usuarios activos", summary.users_total], ["Avisos", summary.notices_total],
    ["Clubes activos", summary.clubs_total], ["Objetos abiertos", summary.lost_total],
    ["Preguntas", summary.questions_total], ["Personas con actividad registrada (30 días)", summary.active_30_days],
    ["Preguntas sin responder", summary.questions_open], ["Preguntas respondidas", summary.questions_answered],
    ["Entregas pendientes", summary.handoffs_pending],
  ] as const;
  const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();

  return (
    <div className="space-y-8">
      <style>{`@media print { body * { visibility: hidden !important; } .admin-print, .admin-print * { visibility: visible !important; } .admin-print { position: relative; } .admin-print button, .admin-print form, .admin-print a { display: none !important; } }`}</style>
      <PageIntro kicker="Administración" title="Panel" text="Cuentas, contenido y el registro de lo que hace el personal." />

      {metricsResult.error && <p role="alert" className="text-sm text-[#8C1D18]">No se pudieron cargar los indicadores. Comprueba que las migraciones estén aplicadas.</p>}
      {user.role === "admin" && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map(([label, value]) => (
            <article key={label} className={card}>
              <p className="text-sm text-[#667085]">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-[#006699]">
                {value === undefined ? "—" : Number(value).toLocaleString("es-MX")}
              </p>
            </article>
          ))}
        </section>
      )}

      {user.role === "admin" && (
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
      )}

      <section className={`${card} admin-print space-y-3`}>
        <h2 className="text-lg font-semibold">Uso de guías</h2>
        <p className="text-sm text-[#667085]">Vistas de cuentas identificadas. Solo se muestran guías con al menos cinco lectores distintos.</p>
        {impactResult.error ? <p>No se pudieron consultar los indicadores.</p> : impact.length ? <ul className="space-y-2 text-sm">{impact.map((item, index) => <li key={`${item.area}-${item.title}-${index}`}><strong>{item.title}</strong> · {item.area} · {item.views} vistas de {item.readers} personas</li>)}</ul> : <p className="text-sm">Aún no hay datos suficientes.</p>}
        <h3 className="font-semibold">Preguntas por área</h3>
        <p className="text-sm text-[#667085]">Se muestran áreas con al menos cinco autores distintos.</p>
        {questionImpact.error ? <p>No se pudieron consultar las preguntas.</p> : questionImpact.data?.length ? <ul className="space-y-1 text-sm">{questionImpact.data.map((item: {area: string; questions: number; unanswered: number}) => <li key={item.area}>{item.area} · {item.questions} preguntas · {item.unanswered} sin responder</li>)}</ul> : <p className="text-sm">Aún no hay datos suficientes.</p>}
        <div className="flex flex-wrap gap-2"><PrintButton /><a className="rounded border px-3 py-2 text-sm text-[#006699]" href="/admin/impacto.csv">Descargar reporte CSV</a></div>
      </section>
      {user.role === "admin" && <RosterImport />}

      <section className="admin-print space-y-3">
        <h2 className="text-lg font-semibold">Auditoría</h2>
        <p className="text-sm text-[#667085]">Hasta 500 movimientos, ordenados del más reciente al más antiguo.</p>
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
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#d5e4ee] text-[#667085]">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Quién</th>
                  <th className="py-2 pr-3 font-medium">Acción</th>
                  <th className="py-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logs.rows.map((log) => (
                  <tr key={log.id} className="border-b border-[#d5e4ee] align-top last:border-0">
                    <td className="py-3 pr-3 whitespace-nowrap">{formatWhen(log.created_at)}</td>
                    <td className="py-3 pr-3">{log.actor_name ?? "Sistema"}</td>
                    <td className="py-3 pr-3">
                      {ACTION_LABEL[log.action] ?? log.action}
                      <span className="block text-[#667085]">{log.entity}</span>
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
