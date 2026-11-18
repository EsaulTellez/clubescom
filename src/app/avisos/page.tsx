import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { demoNoticeArt, demoNoticeAuthor } from "@/lib/demo-art";
import { card } from "@/lib/ui";
import {
  ComunicadosExplorer,
  type ComunicadoItem,
  type KpiRecentActivity,
} from "./comunicados-explorer";
import { canManageAvisos, isCategory, toDatetimeLocal, type Category } from "./shared";

export const dynamic = "force-dynamic";

type AvisoRow = {
  id: string;
  author_id: string;
  author_name: string;
  title: string;
  body: string;
  category: string;
  featured: boolean;
  is_public: boolean;
  image_url: string | null;
  external_url: string | null;
  views_count: number;
  link_clicks_count: number;
  publish_at: Date;
  social_twitter: string | null;
  social_facebook: string | null;
  social_copy: string | null;
};

type InteractionStatsRow = {
  views_7d: number;
  clicks_7d: number;
};

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value ?? "").trim();
}

function formatShortDate(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(value);
}

function formatShortTime(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Mexico_City",
  }).format(value);
}

export default async function AvisosPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    categoria?: string | string[];
    aviso?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const q = one(params.q);
  const categoria = one(params.categoria);
  const selectedIdParam = one(params.aviso);
  const category = isCategory(categoria) ? categoria : "";
  const user = await getSession();
  const canCreate = canManageAvisos(user);
  const isComunicacionRole = Boolean(
    user && (user.role === "admin" || (user.role === "moderador" && user.area === "comunicacion")),
  );

  let comunicados: ComunicadoItem[] = [];
  let recentActivity: KpiRecentActivity = { views7d: 0, clicks7d: 0 };
  let dbDown = false;

  try {
    try {
      await pool.query("select public.trigger_scheduled_avisos()");
    } catch {
      // ignore if migration not yet applied
    }

    const [avisosRes, interactionStatsRes] = await Promise.all([
      pool.query<AvisoRow>(
        `select a.id,
                a.author_id,
                u.name as author_name,
                a.title,
                a.body,
                a.category,
                a.featured,
                a.is_public,
                a.image_url,
                a.external_url,
                a.views_count,
                a.link_clicks_count,
                a.publish_at,
                a.social_twitter,
                a.social_facebook,
                a.social_copy
         from public.avisos a
         join public.users u on u.id = a.author_id
         where ((a.is_public or $1::boolean) and a.publish_at <= now())
            or $2::boolean
         order by a.publish_at desc`,
        [Boolean(user), canCreate],
      ),
      isComunicacionRole
        ? pool.query<InteractionStatsRow>(
            `select
               count(*) filter (where kind = 'view' and created_at >= now() - interval '7 days')::int as views_7d,
               count(*) filter (where kind = 'click' and created_at >= now() - interval '7 days')::int as clicks_7d
             from public.aviso_interactions`,
          )
        : Promise.resolve({ rows: [] as InteractionStatsRow[] }),
    ]);

    const nowMs = Date.now();
    comunicados = avisosRes.rows.map((row) => {
      const pubDate = new Date(row.publish_at);
      const art = row.image_url ?? demoNoticeArt(row.title);
      const demoAuthor = demoNoticeAuthor(row.title);
      const authorName =
        demoAuthor !== "Comunidad ESCOM" ? demoAuthor : row.author_name;
      const safeCat: Category = isCategory(row.category)
        ? row.category
        : "academico";
      const canEditOrDelete = Boolean(
        canCreate && (user?.role === "admin" || user?.id === row.author_id),
      );

      return {
        id: row.id,
        authorId: row.author_id,
        authorName,
        title: row.title,
        body: row.body,
        category: safeCat,
        featured: row.featured,
        isPublic: row.is_public,
        isScheduled: pubDate.getTime() > nowMs,
        imageUrl: art,
        externalUrl: row.external_url,
        viewsCount: row.views_count,
        linkClicksCount: row.link_clicks_count,
        publishAtIso: pubDate.toISOString(),
        publishAtLocal: toDatetimeLocal(pubDate),
        publishDateFormatted: formatShortDate(pubDate),
        publishTimeFormatted: `${formatShortTime(pubDate)} hrs`,
        socialTwitter: row.social_twitter,
        socialFacebook: row.social_facebook,
        socialCopy: row.social_copy,
        canEditOrDelete,
      };
    });

    const statsRow = interactionStatsRes.rows[0];
    if (statsRow) {
      recentActivity = {
        views7d: statsRow.views_7d ?? 0,
        clicks7d: statsRow.clicks_7d ?? 0,
      };
    }
  } catch {
    dbDown = true;
  }

  return (
    <div className="space-y-6">
      <RealtimeRefresh tables={["avisos"]} />

      {dbDown && (
        <p className={card} role="status">
          No se pudieron cargar los datos. Vuelve a intentarlo en un momento.
        </p>
      )}

      <ComunicadosExplorer
        comunicados={comunicados}
        canCreate={canCreate}
        showKpis={isComunicacionRole}
        recentActivity={recentActivity}
        defaultPublishAt={toDatetimeLocal(new Date())}
        initialQuery={q}
        initialCategory={category}
        initialSelectedId={selectedIdParam}
      />
    </div>
  );
}
