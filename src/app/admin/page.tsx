import type { Role } from "@/lib/auth";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { card } from "@/lib/ui";
import {
  AdminWorkspace,
  type AdminPerson,
  type AdminSummary,
  type AdminTab,
} from "./admin-workspace";
import { getAuditLogs, readAuditFilters } from "./audit-query";

export const dynamic = "force-dynamic";

type Impact = { title: string; area: string; readers: number; views: number };

type RawPerson = {
  id: string;
  name: string;
  email: string;
  boleta?: string | null;
  role: Role;
  area: string | null;
  banned: boolean;
  is_superadmin: boolean;
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

const ACTION_LABEL: Record<string, string> = {
  vetar: "Vetar usuario",
  habilitar: "Quitar veto",
  cambiar_rol: "Cambiar rol",
  login: "Inicio de sesión",
  logout: "Cierre de sesión",
  verificar: "Verificar correo",
  eliminar_cuenta: "Eliminar cuenta",
  crear: "Crear",
  editar: "Editar",
  eliminar: "Eliminar",
  publicar: "Publicar",
  revisar_aviso: "Revisar aviso",
  confirmar_entrega: "Confirmar entrega QR",
  renovar_qr_entrega: "Renovar código QR",
  reclamar_objeto: "Reclamo de objeto",
  aprobar_reclamo: "Aprobar reclamo",
  rechazar_reclamo: "Rechazar reclamo",
  registrar_infraccion: "Registrar infracción",
  aceptar_apelacion: "Aceptar apelación",
  rechazar_apelacion: "Rechazar apelación",
  enviar_registro_formal_club: "Registro formal de club",
  confirmar_cita_club: "Confirmar junta de club",
  confirmar_asesoria_directa: "Confirmar coordinación profesor",
  registrar_directamente: "Registro directo de club",
  designar_responsable_sseis: "Designar responsable SSEIS",
  revocar_responsable_sseis: "Revocar responsable SSEIS",
  guardar_datos_integrante_club: "Datos de integrante club",
  asignar_cubiculo_mapa: "Confirmar cubículo en mapa",
  editar_espacio_mapa: "Editar ficha de mapa",
  configurar_parametros: "Configurar parámetros",
  importar_padron: "Importar padrón",
  solicitud_arco: "Solicitud ARCO",
  arco_en_revision: "ARCO en revisión",
  arco_resuelta: "ARCO resuelta",
  arco_rechazada: "ARCO rechazada",
};

const VALID_TABS = new Set<AdminTab>([
  "resumen",
  "usuarios",
  "padron",
  "arco",
  "auditoria",
  "configuracion",
]);

function formatWhen(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(value);
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSession();
  if (!user || user.role !== "admin") {
    return (
      <section className={`${card} max-w-lg space-y-2`}>
        <h1 className="text-xl font-semibold">Panel</h1>
        <p className="text-sm text-[#667085]">No tienes permiso para ver esta sección.</p>
      </section>
    );
  }

  const rawParams = await searchParams;
  const filters = readAuditFilters(rawParams);
  const tabRaw = typeof rawParams.tab === "string" ? rawParams.tab : "";
  const hasAuditFilter = Boolean(filters.actor || filters.entity || filters.from || filters.to);
  const initialTab: AdminTab = VALID_TABS.has(tabRaw as AdminTab)
    ? (tabRaw as AdminTab)
    : hasAuditFilter
      ? "auditoria"
      : "resumen";

  const supabase = await createSupabaseServerClient();
  const [metricsResult, logs, peopleResult, boletasRes, impactResult, questionImpact, settingsRes, privacyRes] =
    await Promise.all([
      supabase.rpc("admin_dashboard_metrics"),
      getAuditLogs(filters),
      supabase.rpc("admin_list_user_profiles"),
      pool
        .query<{ user_id: string; boleta: string | null }>(
          "select user_id::text, boleta from private.user_private",
        )
        .catch(() => ({ rows: [] as { user_id: string; boleta: string | null }[] })),
      supabase.rpc("admin_guide_impact"),
      supabase.rpc("admin_question_impact"),
      pool.query<{ key: string; value_int: number }>("select key, value_int from system_settings"),
      pool.query<PrivacyRequestRow>(
        `select pr.id, u.name as user_name, pr.kind, pr.detail, pr.status, pr.resolution_note, pr.created_at
         from privacy_requests pr join users u on u.id = pr.user_id
         order by (pr.status = 'pendiente') desc, pr.created_at desc limit 50`,
      ),
    ]);

  const boletaMap = new Map(boletasRes.rows.map((r) => [r.user_id, r.boleta]));
  const people: AdminPerson[] = ((peopleResult.data ?? []) as RawPerson[]).map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    boleta: p.boleta ?? boletaMap.get(p.id) ?? null,
    role: p.role,
    area: p.area,
    banned: p.banned,
    is_superadmin: p.is_superadmin,
  }));

  const summary = (metricsResult.data?.[0] ?? {}) as Partial<AdminSummary>;
  const impact = (impactResult.data ?? []) as Impact[];
  const qImpact = (questionImpact.data ?? []) as { area: string; questions: number; unanswered: number }[];
  const settingsMap = new Map(settingsRes.rows.map((r) => [r.key, r.value_int]));
  const clubThreshold = settingsMap.get("club_interest_threshold") ?? 20;
  const forumCooldown = settingsMap.get("forum_cooldown_minutes") ?? 20;
  const auditCsvQuery = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  return (
    <AdminWorkspace
      initialTab={initialTab}
      viewerId={user.id}
      viewerIsSuperadmin={user.isSuperadmin}
      metricsError={Boolean(metricsResult.error)}
      summary={summary}
      impact={impact}
      impactError={Boolean(impactResult.error)}
      qImpact={qImpact}
      qImpactError={Boolean(questionImpact.error)}
      people={people}
      privacyRequests={privacyRes.rows.map((r) => ({
        id: r.id,
        user_name: r.user_name,
        kind: r.kind,
        detail: r.detail,
        status: r.status,
        resolution_note: r.resolution_note,
        created_label: formatWhen(r.created_at),
      }))}
      logs={logs.rows.map((log) => ({
        id: log.id,
        when_label: formatWhen(log.created_at),
        actor_name: log.actor_name ?? "Sistema",
        ip_address: log.ip_address ?? "127.0.0.1",
        action_label: ACTION_LABEL[log.action] ?? log.action,
        entity: log.entity,
        old_value: log.old_value,
        new_value: log.new_value,
        detail: log.detail ?? log.entity_id ?? "—",
      }))}
      filters={filters}
      auditCsvQuery={auditCsvQuery}
      clubThreshold={clubThreshold}
      forumCooldown={forumCooldown}
    />
  );
}
