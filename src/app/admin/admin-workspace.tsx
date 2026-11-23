"use client";

import { useMemo, useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { SubmitButton } from "@/components/loading-ui";
import { STAFF_AREA_LABELS, type StaffArea } from "@/lib/areas";
import type { Role } from "@/lib/auth";
import { btn, btnGhost, card, input, label } from "@/lib/ui";
import { resolvePrivacyRequest, updateSystemSettings } from "./actions";
import { UserControls } from "./forms";
import { PrintButton } from "./print-button";
import { RosterImport } from "./roster-import";

export type AdminSummary = {
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

export type AdminPerson = {
  id: string;
  name: string;
  email: string;
  boleta: string | null;
  role: Role;
  area: string | null;
  banned: boolean;
  is_superadmin: boolean;
};

export type AdminPrivacyRequest = {
  id: string;
  user_name: string;
  kind: string;
  detail: string;
  status: string;
  resolution_note: string | null;
  created_label: string;
};

export type AdminAuditLog = {
  id: string;
  when_label: string;
  actor_name: string;
  ip_address: string;
  action_label: string;
  entity: string;
  old_value: string | null;
  new_value: string | null;
  detail: string;
};

export type AdminTab = "resumen" | "usuarios" | "padron" | "arco" | "auditoria" | "configuracion";

const ROLE_LABEL: Record<Role, string> = {
  alumno: "Alumno",
  profesor: "Profesor",
  moderador: "Moderador",
  admin: "Operación / Admin",
};

const ROLE_BADGE: Record<Role, string> = {
  alumno: "border-[#c7d9e3] bg-[#edf5f9] text-[#174c67]",
  profesor: "border-[#c2dcd3] bg-[#ebf7f2] text-[#145542]",
  moderador: "border-[#e4d2a1] bg-[#fcf6e3] text-[#7c560d]",
  admin: "border-[#142c3c] bg-[#142c3c] text-[#fffdf7]",
};

function areaDisplay(area: string | null) {
  if (!area) return null;
  return STAFF_AREA_LABELS[area as StaffArea] ?? area;
}

export function AdminWorkspace({
  initialTab,
  viewerId,
  viewerIsSuperadmin,
  metricsError,
  summary,
  impact,
  impactError,
  qImpact,
  qImpactError,
  people,
  privacyRequests,
  logs,
  filters,
  auditCsvQuery,
  clubThreshold,
  forumCooldown,
}: {
  initialTab: AdminTab;
  viewerId: string;
  viewerIsSuperadmin: boolean;
  metricsError: boolean;
  summary: Partial<AdminSummary>;
  impact: { title: string; area: string; readers: number; views: number }[];
  impactError: boolean;
  qImpact: { area: string; questions: number; unanswered: number }[];
  qImpactError: boolean;
  people: AdminPerson[];
  privacyRequests: AdminPrivacyRequest[];
  logs: AdminAuditLog[];
  filters: { actor?: string; entity?: string; from?: string; to?: string };
  auditCsvQuery: string;
  clubThreshold: number;
  forumCooldown: number;
}) {
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [userQuery, setUserQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "banned">("all");
  const [managedUser, setManagedUser] = useState<AdminPerson | null>(null);
  const [arcoFilter, setArcoFilter] = useState<"all" | "pendiente" | "en_revision" | "resuelta">("all");

  function switchTab(next: AdminTab) {
    setTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  const pendingArcoCount = useMemo(
    () => privacyRequests.filter((r) => r.status === "pendiente" || r.status === "en_revision").length,
    [privacyRequests],
  );

  const filteredPeople = useMemo(() => {
    const q = userQuery.trim().toLocaleLowerCase("es-MX");
    return people.filter((p) => {
      if (roleFilter !== "all" && p.role !== roleFilter) return false;
      if (statusFilter === "active" && p.banned) return false;
      if (statusFilter === "banned" && !p.banned) return false;
      if (!q) return true;
      const haystack = `${p.name} ${p.email} ${p.boleta ?? ""} ${p.area ?? ""} ${areaDisplay(p.area) ?? ""}`.toLocaleLowerCase("es-MX");
      return haystack.includes(q);
    });
  }, [people, userQuery, roleFilter, statusFilter]);

  const filteredArco = useMemo(() => {
    if (arcoFilter === "all") return privacyRequests;
    return privacyRequests.filter((r) => r.status === arcoFilter);
  }, [privacyRequests, arcoFilter]);

  const chartItems = [
    { label: "Usuarios activos", value: Number(summary.users_total ?? 0), color: "#006699" },
    { label: "Preguntas totales", value: Number(summary.questions_total ?? 0), color: "#26734e" },
    { label: "Preguntas respondidas", value: Number(summary.questions_answered ?? 0), color: "#0080a9" },
    { label: "Clubes activos", value: Number(summary.clubs_total ?? 0), color: "#43616e" },
    { label: "Avisos publicados", value: Number(summary.notices_total ?? 0), color: "#c2921e" },
    { label: "Objetos abiertos", value: Number(summary.lost_total ?? 0), color: "#a85737" },
  ];
  const maxChartVal = Math.max(1, ...chartItems.map((i) => i.value));

  const tabs: { id: AdminTab; label: string; count?: number; highlight?: boolean }[] = [
    { id: "resumen", label: "Resumen e impacto" },
    { id: "usuarios", label: "Usuarios y roles", count: people.length },
    { id: "padron", label: "Padrón CSV" },
    { id: "arco", label: "Derechos ARCO", count: pendingArcoCount, highlight: pendingArcoCount > 0 },
    { id: "auditoria", label: "Auditoría", count: logs.length },
    { id: "configuracion", label: "Configuración" },
  ];

  const fmt = (val?: number) => (val === undefined ? "—" : Number(val).toLocaleString("es-MX"));

  return (
    <div className="space-y-6">
      <style>{`@media print { body * { visibility: hidden !important; } .admin-print, .admin-print * { visibility: visible !important; } .admin-print { position: relative; } .admin-print button, .admin-print form, .admin-print a { display: none !important; } }`}</style>

      {/* Cabezal editorial del Panel */}
      <header className="edition-header">
        <div className="edition-rule flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#006699]">
              Administración ESCOM
            </p>
            <h1 className="edition-title mt-1">Panel de operación</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded border border-[#c8d8e0] bg-[#eef6fa] px-2.5 py-1 font-bold text-[#144c69] tabular-nums">
              {fmt(summary.active_today)} activos hoy
            </span>
            <span className="rounded border border-[#d6d2c4] bg-[#f8f5ec] px-2.5 py-1 font-bold text-[#3c5461] tabular-nums">
              {fmt(summary.questions_unanswered_24h)} sin respuesta &gt;24 h
            </span>
            {pendingArcoCount > 0 && (
              <button
                type="button"
                onClick={() => switchTab("arco")}
                className="rounded border border-[#e3c478] bg-[#fdf5dc] px-2.5 py-1 font-extrabold text-[#7d5509] hover:bg-[#faebc0]"
              >
                {pendingArcoCount} ARCO por atender
              </button>
            )}
          </div>
        </div>

        {/* Pestañas del panel */}
        <nav
          role="tablist"
          aria-label="Secciones del panel de administración"
          className="mt-3 flex flex-nowrap items-center gap-1 overflow-x-auto sm:flex-wrap sm:overflow-visible"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => switchTab(item.id)}
              className="catalog-tab shrink-0 whitespace-nowrap"
            >
              <span>{item.label}</span>
              {typeof item.count === "number" && item.count > 0 && (
                <small
                  className={
                    item.highlight
                      ? "rounded bg-[#f9ebc4] px-1.5 py-0.5 font-extrabold text-[#7d5509]"
                      : ""
                  }
                >
                  {item.count}
                </small>
              )}
            </button>
          ))}
        </nav>
      </header>

      {metricsError && (
        <p role="alert" className="rounded-md border border-[#e3b8b4] bg-[#fdf2f1] px-4 py-3 text-sm font-medium text-[#8C1D18]">
          No se pudieron cargar los indicadores. Vuelve a intentarlo en un momento.
        </p>
      )}

      {/* PESTAÑA 1: RESUMEN E IMPACTO */}
      {tab === "resumen" && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Bloque Comunidad */}
            <section className="rounded-md border border-[#d4d8cf] border-t-4 border-t-[#006699] bg-[#fffdf7] p-5">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#005980]">
                Comunidad
              </h2>
              <dl className="mt-4 grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-[11px] font-semibold text-[#5a6e78]">Activos</dt>
                  <dd className="mt-0.5 font-mono text-2xl font-extrabold text-[#142c3c] tabular-nums">{fmt(summary.users_total)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-[#5a6e78]">Hoy</dt>
                  <dd className="mt-0.5 font-mono text-2xl font-extrabold text-[#006699] tabular-nums">{fmt(summary.active_today)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-[#5a6e78]">30 días</dt>
                  <dd className="mt-0.5 font-mono text-2xl font-extrabold text-[#142c3c] tabular-nums">{fmt(summary.active_30_days)}</dd>
                </div>
              </dl>
            </section>

            {/* Bloque Contenido y campus */}
            <section className="rounded-md border border-[#d4d8cf] border-t-4 border-t-[#165b47] bg-[#fffdf7] p-5">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#145542]">
                Campus y vida estudiantil
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                <div>
                  <dt className="text-[11px] font-semibold text-[#5a6e78]">Avisos</dt>
                  <dd className="mt-0.5 font-mono text-2xl font-extrabold text-[#142c3c] tabular-nums">{fmt(summary.notices_total)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-[#5a6e78]">Clubes activos</dt>
                  <dd className="mt-0.5 font-mono text-2xl font-extrabold text-[#165b47] tabular-nums">{fmt(summary.clubs_total)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-[#5a6e78]">Objetos abiertos</dt>
                  <dd className="mt-0.5 font-mono text-2xl font-extrabold text-[#9a4b2c] tabular-nums">{fmt(summary.lost_total)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-[#5a6e78]">Entregas pendientes</dt>
                  <dd className="mt-0.5 font-mono text-2xl font-extrabold text-[#142c3c] tabular-nums">{fmt(summary.handoffs_pending)}</dd>
                </div>
              </dl>
            </section>

            {/* Bloque Foro y dudas */}
            <section className="rounded-md border border-[#d4d8cf] border-t-4 border-t-[#b88917] bg-[#fffdf7] p-5">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#835e0d]">
                Foro y atención
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[11px] font-semibold text-[#5a6e78]">Preguntas totales</dt>
                  <dd className="mt-0.5 font-mono text-2xl font-extrabold text-[#142c3c] tabular-nums">{fmt(summary.questions_total)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-[#5a6e78]">Respondidas</dt>
                  <dd className="mt-0.5 font-mono text-2xl font-extrabold text-[#165b47] tabular-nums">{fmt(summary.questions_answered)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-[#5a6e78]">Sin responder</dt>
                  <dd className="mt-0.5 font-mono text-2xl font-extrabold text-[#8c5e0f] tabular-nums">{fmt(summary.questions_open)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-[#5a6e78]">&gt; 24 horas</dt>
                  <dd className="mt-0.5 font-mono text-2xl font-extrabold text-[#8c2925] tabular-nums">{fmt(summary.questions_unanswered_24h)}</dd>
                </div>
              </dl>
            </section>
          </div>

          <section className={`${card} admin-print space-y-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e2d7] pb-4">
              <h2 className="text-lg font-extrabold text-[#142c3c]">Impacto institucional</h2>
              <div className="flex flex-wrap gap-2">
                <PrintButton />
                <a className={btnGhost} href="/admin/impacto.csv">
                  Exportar CSV
                </a>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {chartItems.map((item) => {
                const pct = Math.max(4, Math.round((item.value / maxChartVal) * 100));
                return (
                  <div key={item.label} className="space-y-1.5 rounded border border-[#e8e5da] bg-[#fbfaf5] px-3.5 py-2.5 text-xs">
                    <div className="flex justify-between font-bold text-[#203c4b]">
                      <span>{item.label}</span>
                      <span className="font-mono tabular-nums">{item.value.toLocaleString("es-MX")}</span>
                    </div>
                    <svg className="h-2.5 w-full overflow-hidden rounded-full bg-[#e6ecef]" role="img" aria-label={`${item.label}: ${item.value}`}>
                      <rect x="0" y="0" width={`${pct}%`} height="100%" fill={item.color} rx="5" />
                    </svg>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-5 border-t border-[#e5e2d7] pt-5 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-extrabold text-[#142c3c]">Uso de guías (≥ 5 lectores)</h3>
                {impactError ? (
                  <p className="mt-2 text-sm text-[#8c2925]">No se pudieron consultar los indicadores.</p>
                ) : impact.length ? (
                  <ul className="mt-2.5 divide-y divide-[#ece9df] text-sm">
                    {impact.map((item, index) => (
                      <li key={`${item.area}-${item.title}-${index}`} className="flex items-baseline justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-[#173142]">{item.title}</p>
                          <p className="text-xs text-[#5d707a]">{item.area}</p>
                        </div>
                        <span className="shrink-0 font-mono text-xs font-bold text-[#005980]">
                          {item.views} vistas · {item.readers} pers.
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[#667085]">Aún no hay guías con al menos 5 lectores distintos.</p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-extrabold text-[#142c3c]">Preguntas por área (≥ 5 autores)</h3>
                {qImpactError ? (
                  <p className="mt-2 text-sm text-[#8c2925]">No se pudieron consultar las preguntas.</p>
                ) : qImpact.length ? (
                  <ul className="mt-2.5 divide-y divide-[#ece9df] text-sm">
                    {qImpact.map((item) => (
                      <li key={item.area} className="flex items-center justify-between gap-3 py-2">
                        <span className="font-bold text-[#173142]">{item.area}</span>
                        <span className="font-mono text-xs text-[#4b626f]">
                          {item.questions} total · <strong className="text-[#8c5e0f]">{item.unanswered} abiertas</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[#667085]">Aún no hay áreas con al menos 5 autores distintos.</p>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* PESTAÑA 2: USUARIOS Y ROLES */}
      {tab === "usuarios" && (
        <section className="space-y-4">
          <div className="grid gap-3 rounded-md border border-[#d6d4c8] bg-[#fffdf7] p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5c727e]">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="9" r="5.5" />
                  <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="search"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Buscar por nombre, boleta, correo o área…"
                aria-label="Buscar usuarios"
                className={`${input} mt-0 pl-9`}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(["all", "alumno", "profesor", "moderador", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`rounded border px-2.5 py-1.5 text-xs font-bold transition ${
                    roleFilter === r
                      ? "border-[#142c3c] bg-[#142c3c] text-white"
                      : "border-[#d4d1c5] bg-[#faf8f0] text-[#35505e] hover:border-[#006699]"
                  }`}
                >
                  {r === "all" ? "Todos" : ROLE_LABEL[r]}
                </button>
              ))}
            </div>

            <select
              aria-label="Filtrar por estado"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "banned")}
              className={`${input} mt-0 w-auto`}
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="banned">Vetados</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-md border border-[#d6d4c8] bg-[#fffdf7]">
            <div className="flex items-center justify-between border-b border-[#e5e2d7] bg-[#faf8f1] px-4 py-2.5 text-xs font-bold text-[#526874]">
              <span>Mostrando {filteredPeople.length} de {people.length} cuentas</span>
              {(userQuery || roleFilter !== "all" || statusFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setUserQuery("");
                    setRoleFilter("all");
                    setStatusFilter("all");
                  }}
                  className="text-[#006699] hover:underline"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {filteredPeople.length === 0 ? (
              <p className="p-6 text-center text-sm text-[#5d707a]">No hay cuentas que coincidan con la búsqueda.</p>
            ) : (
              <table className="w-full min-w-[740px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e2dfd3] text-xs font-extrabold uppercase tracking-wider text-[#5a6e78]">
                    <th className="px-4 py-3">Persona</th>
                    <th className="px-4 py-3">Boleta / ID</th>
                    <th className="px-4 py-3">Rol y área</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ece9df]">
                  {filteredPeople.map((person) => {
                    const isProtected =
                      person.is_superadmin ||
                      person.id === viewerId ||
                      (person.role === "admin" && !viewerIsSuperadmin);
                    return (
                      <tr key={person.id} className="hover:bg-[#f9faf9]">
                        <td className="px-4 py-3">
                          <p className="font-bold text-[#142c3c]">{person.name}</p>
                          <p className="text-xs text-[#5d707a]">{person.email}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-bold text-[#2b4d5e]">
                          {person.boleta ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-extrabold ${ROLE_BADGE[person.role]}`}>
                              {person.is_superadmin ? "Superadmin" : ROLE_LABEL[person.role]}
                            </span>
                            {person.area && (
                              <span className="text-xs font-medium text-[#4e6470]">
                                {areaDisplay(person.area)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              person.banned
                                ? "bg-[#fbe9e7] text-[#8c2925]"
                                : "bg-[#e9f5ee] text-[#175c3c]"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${person.banned ? "bg-[#8c2925]" : "bg-[#175c3c]"}`} />
                            {person.banned ? "Vetado" : "Activo"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isProtected ? (
                            <span className="text-xs font-semibold text-[#7b8b93]">Protegida</span>
                          ) : (
                            <button
                              type="button"
                              aria-haspopup="dialog"
                              onClick={() => setManagedUser(person)}
                              className="rounded border border-[#c3ced3] bg-white px-3 py-1.5 text-xs font-extrabold text-[#154b66] transition hover:border-[#006699] hover:bg-[#eef6fa]"
                            >
                              Gestionar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {managedUser && (
            <FormDialog
              title={managedUser.name}
              kicker="Gestión de cuenta"
              subtitle={`${managedUser.email}${managedUser.boleta ? ` · ${managedUser.boleta}` : ""}`}
              accent={managedUser.banned ? "crimson" : "blue"}
              size="md"
              onClose={() => setManagedUser(null)}
            >
              <UserControls
                key={managedUser.id}
                canAssignRoles={viewerIsSuperadmin}
                canBan={managedUser.role !== "admin" && managedUser.id !== viewerId}
                userId={managedUser.id}
                role={managedUser.role}
                area={managedUser.area}
                banned={managedUser.banned}
              />
            </FormDialog>
          )}
        </section>
      )}

      {/* PESTAÑA 3: PADRÓN CSV */}
      {tab === "padron" && (
        <div className="max-w-3xl">
          <RosterImport />
        </div>
      )}

      {/* PESTAÑA 4: DERECHOS ARCO */}
      {tab === "arco" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", `Todas (${privacyRequests.length})`],
                ["pendiente", `Pendientes (${privacyRequests.filter((r) => r.status === "pendiente").length})`],
                ["en_revision", `En revisión (${privacyRequests.filter((r) => r.status === "en_revision").length})`],
                ["resuelta", `Resueltas (${privacyRequests.filter((r) => r.status === "resuelta").length})`],
              ] as const
            ).map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                onClick={() => setArcoFilter(val)}
                className={`rounded border px-3 py-1.5 text-xs font-extrabold transition ${
                  arcoFilter === val
                    ? "border-[#142c3c] bg-[#142c3c] text-white"
                    : "border-[#d4d1c5] bg-[#fffdf7] text-[#35505e] hover:border-[#006699]"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {filteredArco.length === 0 ? (
            <p className={`${card} text-sm text-[#5d707a]`}>No hay solicitudes ARCO en esta vista.</p>
          ) : (
            <div className="grid gap-4">
              {filteredArco.map((req) => (
                <article key={req.id} className={`${card} space-y-3`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ece9df] pb-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-[#142c3c]">{req.user_name}</strong>
                      <span className="rounded bg-[#eaf4f8] px-2 py-0.5 text-[11px] font-extrabold uppercase text-[#005980]">
                        {req.kind}
                      </span>
                      <span className="text-xs text-[#657780]">{req.created_label}</span>
                    </div>
                    <span
                      className={`rounded px-2.5 py-0.5 text-xs font-extrabold ${
                        req.status === "pendiente"
                          ? "bg-[#fdf3d7] text-[#7c560d]"
                          : req.status === "en_revision"
                            ? "bg-[#eaf4f8] text-[#004d73]"
                            : req.status === "resuelta"
                              ? "bg-[#e8f6ec] text-[#175c3c]"
                              : "bg-[#fbe9e7] text-[#8c2925]"
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-[#384e5a]">{req.detail}</p>
                  {req.resolution_note && (
                    <p className="rounded border border-[#cde0d5] bg-[#f2f9f5] px-3 py-2 text-xs font-semibold text-[#175c3c]">
                      Resolución: {req.resolution_note}
                    </p>
                  )}
                  {(req.status === "pendiente" || req.status === "en_revision") && (
                    <form action={resolvePrivacyRequest} className="flex flex-wrap items-end gap-2 border-t border-[#ece9df] pt-3">
                      <input type="hidden" name="request_id" value={req.id} />
                      <input
                        className={`${input} mt-0 flex-1`}
                        name="resolution_note"
                        placeholder="Respuesta oficial para el titular de los datos"
                        required
                      />
                      {req.status === "pendiente" && (
                        <SubmitButton name="status" value="en_revision" className={btnGhost} pendingText="Actualizando…">
                          En revisión
                        </SubmitButton>
                      )}
                      <SubmitButton name="status" value="resuelta" className={btn} pendingText="Resolviendo…">
                        Resolver
                      </SubmitButton>
                      <SubmitButton name="status" value="rechazada" className={btnGhost} pendingText="Rechazando…">
                        Rechazar
                      </SubmitButton>
                    </form>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* PESTAÑA 5: AUDITORÍA */}
      {tab === "auditoria" && (
        <section className="admin-print space-y-4">
          <form className="grid gap-3 rounded-md border border-[#d6d4c8] bg-[#fffdf7] p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto_auto] lg:items-end" method="get">
            <input type="hidden" name="tab" value="auditoria" />
            <label className={label}>
              Usuario
              <input className={input} name="actor" defaultValue={filters.actor} placeholder="Nombre de actor" />
            </label>
            <label className={label}>
              Entidad
              <input className={input} name="entity" defaultValue={filters.entity} placeholder="clubs, avisos, users…" />
            </label>
            <label className={label}>
              Desde
              <input className={input} type="date" name="from" defaultValue={filters.from} />
            </label>
            <label className={label}>
              Hasta
              <input className={input} type="date" name="to" defaultValue={filters.to} />
            </label>
            <button type="submit" className={btn}>Filtrar</button>
            <a className={btnGhost} href={`/admin/auditoria.csv${auditCsvQuery ? `?${auditCsvQuery}` : ""}`}>
              CSV
            </a>
          </form>

          {logs.length === 0 ? (
            <p className={`${card} text-sm text-[#5d707a]`}>Todavía no hay registros de auditoría para este filtro.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-[#d6d4c8] bg-[#fffdf7]">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e2dfd3] bg-[#faf8f1] text-xs font-extrabold uppercase tracking-wider text-[#5a6e78]">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Actor / IP</th>
                    <th className="px-4 py-3">Acción</th>
                    <th className="px-4 py-3">Cambio</th>
                    <th className="px-4 py-3">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ece9df]">
                  {logs.map((log) => (
                    <tr key={log.id} className="align-top hover:bg-[#f9faf9]">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[#4b626f]">{log.when_label}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#142c3c]">{log.actor_name}</p>
                        <p className="font-mono text-[11px] text-[#6a7d87]">{log.ip_address}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-[#144c69]">{log.action_label}</span>
                        <span className="block font-mono text-[11px] text-[#6a7d87]">{log.entity}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#526170]">
                        {log.old_value || log.new_value ? `${log.old_value ?? "—"} → ${log.new_value ?? "—"}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#3b525f]">{log.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* PESTAÑA 6: CONFIGURACIÓN */}
      {tab === "configuracion" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className={`${card} space-y-4`}>
            <h2 className="text-lg font-extrabold text-[#142c3c]">Parámetros del sistema</h2>
            <form action={updateSystemSettings} className="space-y-4">
              <label className={label}>
                Umbral de votos para propuestas de club
                <input
                  className={input}
                  type="number"
                  name="club_interest_threshold"
                  min={1}
                  max={100}
                  defaultValue={clubThreshold}
                  required
                />
              </label>
              <label className={label}>
                Enfriamiento entre preguntas del foro (minutos)
                <input
                  className={input}
                  type="number"
                  name="forum_cooldown_minutes"
                  min={0}
                  max={120}
                  defaultValue={forumCooldown}
                  required
                />
              </label>
              <SubmitButton className={btn} pendingText="Guardando…">
                Guardar parámetros
              </SubmitButton>
            </form>
          </section>

          <section className={`${card} space-y-3`}>
            <h2 className="text-lg font-extrabold text-[#142c3c]">Respaldo y restauración</h2>
            <div className="space-y-2.5 text-sm text-[#435966]">
              <p>Volcado SQL completo en <code>backups/</code>:</p>
              <pre className="overflow-x-auto rounded border border-[#d6dce0] bg-[#f4f7f8] px-3 py-2 font-mono text-xs text-[#142c3c]">
                bash scripts/backup.sh
              </pre>
              <p>Restaurar respaldo existente:</p>
              <pre className="overflow-x-auto rounded border border-[#d6dce0] bg-[#f4f7f8] px-3 py-2 font-mono text-xs text-[#142c3c]">
                bash scripts/restore.sh &lt;archivo.sql&gt;
              </pre>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
