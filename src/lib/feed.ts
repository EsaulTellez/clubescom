import { pool } from "@/lib/db";
import { demoClubArt, demoNoticeAuthor } from "@/lib/demo-art";

export type FeedMode = "para_ti" | "clubes" | "avisos" | "foro" | "eventos" | "recientes";

export type FeedItem = {
  id: string;
  rawId: string;
  sourceType: "aviso" | "club_post" | "foro" | "evento";
  title: string;
  body: string;
  category: string;
  categoryLabel: string;
  authorName: string;
  avatarLetter: string;
  avatarImage: string | null;
  publishedAtIso: string;
  publishedDateFormatted: string;
  publishedTimeFormatted: string;
  imageUrl: string | null;
  externalUrl?: string | null;
  // Campos reales exclusivos de club_post
  clubId?: string | null;
  clubName?: string | null;
  clubSchedule?: string | null;
  // Campos reales exclusivos de foro
  forumStatus?: string | null;
  votesCount?: number;
  answersCount?: number;
  topAnswerBody?: string | null;
  topAnswerAuthor?: string | null;
  topAnswerOfficial?: boolean;
  // Campos reales exclusivos de evento
  eventKind?: "space" | "club";
  eventLocation?: string | null;
  eventSpeaker?: string | null;
  eventStartsAtFormatted?: string | null;
  eventDayNumber?: string | null;
  eventMonthShort?: string | null;
  eventTimeRange?: string | null;
  attendeesCount?: number;
  viewerAttending?: boolean;
};

export type PopularClubItem = {
  id: string;
  rank: number;
  name: string;
  kindLabel: string;
  logoUrl: string | null;
  membersCount: number;
};

export type TrendingEventItem = {
  id: string;
  eventKind: "space" | "club";
  rank: number;
  title: string;
  dateFormatted: string;
  timeFormatted: string;
  location: string;
  organizer: string;
  imageUrl: string | null;
  attendeesCount: number;
  viewerAttending: boolean;
};

export type FeedBatchResult = {
  items: FeedItem[];
  hasMore: boolean;
  nextOffset: number;
  totalCount: number;
  mode: FeedMode;
};

const CATEGORY_LABELS: Record<string, string> = {
  academico: "Académico",
  social: "Comunidad",
  tramites: "Trámites",
  cultural: "Cultural",
  deportivo: "Deportivo",
  gestion_escolar: "Gestión Escolar",
  becas: "Becas",
  catt: "CATT",
  general: "General",
};

function formatFullDate(value: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(value);
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Mexico_City",
  }).format(value);
}

function formatShortDate(value: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: "America/Mexico_City",
  }).format(value);
}

function formatDayNumber(value: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(value);
}

function formatMonthShort(value: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    month: "short",
    timeZone: "America/Mexico_City",
  })
    .format(value)
    .replace(".", "");
}

type RawFeedRow = {
  item_id: string;
  source_type: "aviso" | "club_post" | "foro" | "evento";
  title: string;
  body: string;
  category: string;
  publish_at: Date;
  image_url: string | null;
  external_url: string | null;
  author_name: string;
  club_id: string | null;
  club_name: string | null;
  club_schedule: string | null;
  club_logo: string | null;
  forum_status: string | null;
  votes_count: number;
  answers_count: number;
  top_answer_body: string | null;
  top_answer_author: string | null;
  top_answer_official: boolean;
  event_kind: "space" | "club" | null;
  event_location: string | null;
  event_speaker: string | null;
  event_starts_at: Date | null;
  event_ends_at: Date | null;
  attendees_count: number;
  viewer_attending: boolean;
  relevance_score: number;
  total_count: number;
};

export async function getHomeFeedBatch({
  userId,
  isAuthenticated,
  mode = "para_ti",
  offset = 0,
  limit = 5,
}: {
  userId: string | null;
  isAuthenticated: boolean;
  mode?: FeedMode;
  offset?: number;
  limit?: number;
}): Promise<FeedBatchResult> {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.min(12, Math.max(1, Math.floor(limit)));
  const validModes: FeedMode[] = ["para_ti", "clubes", "avisos", "foro", "eventos", "recientes"];
  const safeMode: FeedMode = validModes.includes(mode) ? mode : "para_ti";

  const { rows } = await pool.query<RawFeedRow>(
    `
    with user_clubs as (
      select distinct c.id as club_id, c.kind as club_kind
      from public.clubs c
      left join public.memberships m
        on m.club_id = c.id and m.user_id = $1::uuid and m.status in ('aceptada', 'pendiente')
      where $1::uuid is not null
        and c.active = true
        and (m.user_id is not null or c.leader_id = $1::uuid or c.advisor_id = $1::uuid)
    ),
    user_interests as (
      select distinct club_kind as kind from user_clubs
      union
      select distinct p.kind
      from public.club_interests ci
      join public.club_proposals p on p.id = ci.proposal_id
      where $1::uuid is not null and ci.user_id = $1::uuid
    ),
    unified as (
      -- 1) Publicaciones de clubes
      select
        cp.id::text as item_id,
        'club_post'::text as source_type,
        cp.title,
        cp.body,
        c.kind as category,
        cp.created_at as publish_at,
        cp.image_url,
        null::text as external_url,
        u.name as author_name,
        c.id::text as club_id,
        c.name as club_name,
        c.schedule as club_schedule,
        c.logo_url as club_logo,
        null::text as forum_status,
        0::int as votes_count,
        0::int as answers_count,
        null::text as top_answer_body,
        null::text as top_answer_author,
        false as top_answer_official,
        null::text as event_kind,
        null::text as event_location,
        null::text as event_speaker,
        null::timestamptz as event_starts_at,
        null::timestamptz as event_ends_at,
        0::int as attendees_count,
        false as viewer_attending,
        (
          case when exists (select 1 from user_clubs uc where uc.club_id = c.id) then 50
               when exists (select 1 from user_interests ui where ui.kind = c.kind) then 25
               else 12 end
        ) as affinity_boost
      from public.club_posts cp
      join public.clubs c on c.id = cp.club_id and c.active = true
      join public.users u on u.id = cp.author_id

      union all

      -- 2) Avisos
      select
        a.id::text as item_id,
        'aviso'::text as source_type,
        a.title,
        a.body,
        a.category,
        a.publish_at,
        a.image_url,
        a.external_url,
        u.name as author_name,
        null::text as club_id,
        null::text as club_name,
        null::text as club_schedule,
        null::text as club_logo,
        null::text as forum_status,
        0::int as votes_count,
        0::int as answers_count,
        null::text as top_answer_body,
        null::text as top_answer_author,
        false as top_answer_official,
        null::text as event_kind,
        null::text as event_location,
        null::text as event_speaker,
        null::timestamptz as event_starts_at,
        null::timestamptz as event_ends_at,
        0::int as attendees_count,
        false as viewer_attending,
        (case when a.featured then 30 else 15 end) as affinity_boost
      from public.avisos a
      join public.users u on u.id = a.author_id
      where (a.is_public or $2::boolean)
        and a.publish_at <= now()
        and nullif(btrim(a.image_url), '') is not null

      union all

      -- 3) Preguntas del Foro
      select
        q.id::text as item_id,
        'foro'::text as source_type,
        q.title,
        q.body,
        q.area as category,
        q.created_at as publish_at,
        q.image_url,
        null::text as external_url,
        u.name as author_name,
        null::text as club_id,
        null::text as club_name,
        null::text as club_schedule,
        null::text as club_logo,
        q.status as forum_status,
        (select count(*)::int from public.question_votes qv where qv.question_id = q.id) as votes_count,
        (select count(*)::int from public.answers ans where ans.question_id = q.id) as answers_count,
        top_ans.body as top_answer_body,
        top_ans.author_name as top_answer_author,
        coalesce(top_ans.official, false) as top_answer_official,
        null::text as event_kind,
        null::text as event_location,
        null::text as event_speaker,
        null::timestamptz as event_starts_at,
        null::timestamptz as event_ends_at,
        0::int as attendees_count,
        false as viewer_attending,
        20 as affinity_boost
      from public.questions q
      join public.users u on u.id = q.author_id
      left join lateral (
        select a.body, au.name as author_name, a.official
        from public.answers a
        join public.users au on au.id = a.author_id
        where a.question_id = q.id
        order by a.official desc, a.created_at asc
        limit 1
      ) top_ans on true

      union all

      -- 4a) Eventos en espacios del campus
      select
        se.id::text as item_id,
        'evento'::text as source_type,
        se.title,
        se.description as body,
        s.kind as category,
        se.created_at as publish_at,
        se.image_url,
        null::text as external_url,
        u.name as author_name,
        null::text as club_id,
        null::text as club_name,
        null::text as club_schedule,
        null::text as club_logo,
        null::text as forum_status,
        0::int as votes_count,
        0::int as answers_count,
        null::text as top_answer_body,
        null::text as top_answer_author,
        false as top_answer_official,
        'space'::text as event_kind,
        s.name || coalesce(' · ' || s.building, '') as event_location,
        se.speaker as event_speaker,
        se.starts_at as event_starts_at,
        se.ends_at as event_ends_at,
        (select count(*)::int from public.event_attendees ea where ea.event_kind = 'space' and ea.event_id = se.id) as attendees_count,
        exists (
          select 1 from public.event_attendees ea
          where ea.event_kind = 'space' and ea.event_id = se.id and $1::uuid is not null and ea.user_id = $1::uuid
        ) as viewer_attending,
        28 as affinity_boost
      from public.space_events se
      join public.spaces s on s.id = se.space_id
      join public.users u on u.id = se.created_by
      where se.approval_status = 'aprobado'
        and se.is_public = true
        and se.starts_at >= now() - interval '12 hours'

      union all

      -- 4b) Eventos de clubes
      select
        ce.id::text as item_id,
        'evento'::text as source_type,
        ce.title,
        ce.description as body,
        c.kind as category,
        ce.created_at as publish_at,
        ce.image_url,
        null::text as external_url,
        c.name as author_name,
        c.id::text as club_id,
        c.name as club_name,
        c.schedule as club_schedule,
        c.logo_url as club_logo,
        null::text as forum_status,
        0::int as votes_count,
        0::int as answers_count,
        null::text as top_answer_body,
        null::text as top_answer_author,
        false as top_answer_official,
        'club'::text as event_kind,
        ce.location as event_location,
        null::text as event_speaker,
        ce.starts_at as event_starts_at,
        null::timestamptz as event_ends_at,
        (select count(*)::int from public.event_attendees ea where ea.event_kind = 'club' and ea.event_id = ce.id) as attendees_count,
        exists (
          select 1 from public.event_attendees ea
          where ea.event_kind = 'club' and ea.event_id = ce.id and $1::uuid is not null and ea.user_id = $1::uuid
        ) as viewer_attending,
        (
          case when exists (select 1 from user_clubs uc where uc.club_id = c.id) then 48
               else 24 end
        ) as affinity_boost
      from public.club_events ce
      join public.clubs c on c.id = ce.club_id and c.active = true
      where ce.approval_status = 'aprobado'
        and ce.starts_at >= now() - interval '12 hours'
    ),
    filtered as (
      select
        u.*,
        round(
          u.affinity_boost +
          u.attendees_count * 4 +
          u.votes_count * 3 +
          greatest(0, 120 - extract(epoch from (now() - u.publish_at)) / 900.0)
        )::int as relevance_score
      from unified u
      where (
        ($3::text in ('para_ti', 'recientes'))
        or ($3::text = 'clubes' and u.source_type = 'club_post')
        or ($3::text = 'avisos' and u.source_type = 'aviso')
        or ($3::text = 'foro' and u.source_type = 'foro')
        or ($3::text = 'eventos' and u.source_type = 'evento')
      )
    )
    select
      f.*,
      count(*) over()::int as total_count
    from filtered f
    order by
      case when $3::text = 'recientes' then 0 else f.relevance_score end desc,
      f.publish_at desc,
      f.item_id desc
    limit $4 offset $5
    `,
    [userId, isAuthenticated, safeMode, safeLimit, safeOffset],
  );

  const totalCount = rows[0]?.total_count ?? 0;

  const items: FeedItem[] = rows.map((row) => {
    const pubDate = new Date(row.publish_at);
    const art = row.image_url;

    const authorName =
      row.source_type === "aviso" && demoNoticeAuthor(row.title) !== "Comunidad ESCOM"
        ? demoNoticeAuthor(row.title)
        : row.author_name;

    const clubLogo =
      row.club_name ? (row.club_logo ?? demoClubArt(row.club_name)) : null;

    const startDate = row.event_starts_at ? new Date(row.event_starts_at) : null;
    const endDate = row.event_ends_at ? new Date(row.event_ends_at) : null;

    return {
      id: `${row.source_type}-${row.item_id}`,
      rawId: row.item_id,
      sourceType: row.source_type,
      title: row.title,
      body: row.body,
      category: row.category,
      categoryLabel: CATEGORY_LABELS[row.category] ?? row.category,
      authorName,
      avatarLetter: (row.club_name ?? authorName).replace(/^Club de /i, "").slice(0, 1).toUpperCase() || "E",
      avatarImage: clubLogo,
      publishedAtIso: pubDate.toISOString(),
      publishedDateFormatted: formatFullDate(pubDate),
      publishedTimeFormatted: formatTime(pubDate),
      imageUrl: art,
      externalUrl: row.external_url,
      clubId: row.club_id,
      clubName: row.club_name,
      clubSchedule: row.club_schedule,
      forumStatus: row.forum_status,
      votesCount: row.votes_count,
      answersCount: row.answers_count,
      topAnswerBody: row.top_answer_body,
      topAnswerAuthor: row.top_answer_author,
      topAnswerOfficial: row.top_answer_official,
      eventKind: row.event_kind ?? undefined,
      eventLocation: row.event_location,
      eventSpeaker: row.event_speaker,
      eventStartsAtFormatted: startDate ? formatFullDate(startDate) : null,
      eventDayNumber: startDate ? formatDayNumber(startDate) : null,
      eventMonthShort: startDate ? formatMonthShort(startDate) : null,
      eventTimeRange: startDate
        ? `${formatTime(startDate)}${endDate ? ` – ${formatTime(endDate)}` : ""} hrs`
        : null,
      attendeesCount: row.attendees_count,
      viewerAttending: row.viewer_attending,
    };
  });

  const nextOffset = safeOffset + items.length;
  const hasMore = nextOffset < totalCount;

  return {
    items,
    hasMore,
    nextOffset,
    totalCount,
    mode: safeMode,
  };
}

export async function getTrendingLeaderboards(userId: string | null): Promise<{
  popularClubs: PopularClubItem[];
  trendingEvents: TrendingEventItem[];
}> {
  const [clubsRes, eventsRes] = await Promise.all([
    pool.query<{
      id: string;
      name: string;
      kind: string;
      logo_url: string | null;
      members_count: number;
    }>(`
      select
        c.id,
        c.name,
        c.kind,
        c.logo_url,
        coalesce(mc.members_count, 0)::int as members_count
      from public.clubs c
      left join public.get_public_club_member_counts() mc on mc.club_id = c.id
      where c.active = true
      order by members_count desc, c.name asc
      limit 5
    `),
    pool.query<{
      id: string;
      event_kind: "space" | "club";
      title: string;
      starts_at: Date;
      location: string;
      organizer: string;
      image_url: string | null;
      attendees_count: number;
      viewer_attending: boolean;
    }>(
      `
      with combined_events as (
        select
          se.id::text as id,
          'space'::text as event_kind,
          se.title,
          se.starts_at,
          s.name || coalesce(' · ' || s.building, '') as location,
          s.name as organizer,
          se.image_url,
          (select count(*)::int from public.event_attendees ea where ea.event_kind = 'space' and ea.event_id = se.id) as attendees_count,
          exists (
            select 1 from public.event_attendees ea
            where ea.event_kind = 'space' and ea.event_id = se.id and $1::uuid is not null and ea.user_id = $1::uuid
          ) as viewer_attending
        from public.space_events se
        join public.spaces s on s.id = se.space_id
        where se.approval_status = 'aprobado'
          and se.is_public = true
          and se.starts_at >= now() - interval '6 hours'

        union all

        select
          ce.id::text as id,
          'club'::text as event_kind,
          ce.title,
          ce.starts_at,
          ce.location,
          c.name as organizer,
          coalesce(ce.image_url, c.logo_url) as image_url,
          (select count(*)::int from public.event_attendees ea where ea.event_kind = 'club' and ea.event_id = ce.id) as attendees_count,
          exists (
            select 1 from public.event_attendees ea
            where ea.event_kind = 'club' and ea.event_id = ce.id and $1::uuid is not null and ea.user_id = $1::uuid
          ) as viewer_attending
        from public.club_events ce
        join public.clubs c on c.id = ce.club_id
        where ce.approval_status = 'aprobado'
          and c.active = true
          and ce.starts_at >= now() - interval '6 hours'
      )
      select *
      from combined_events
      order by attendees_count desc, starts_at asc
      limit 5
      `,
      [userId],
    ),
  ]);

  const popularClubs: PopularClubItem[] = clubsRes.rows.map((row, idx) => ({
    id: row.id,
    rank: idx + 1,
    name: row.name,
    kindLabel: CATEGORY_LABELS[row.kind] ?? row.kind,
    logoUrl: row.logo_url ?? demoClubArt(row.name),
    membersCount: row.members_count,
  }));

  const trendingEvents: TrendingEventItem[] = eventsRes.rows.map((row, idx) => {
    const startDate = new Date(row.starts_at);
    return {
      id: row.id,
      eventKind: row.event_kind,
      rank: idx + 1,
      title: row.title,
      dateFormatted: formatShortDate(startDate),
      timeFormatted: `${formatTime(startDate)} hrs`,
      location: row.location,
      organizer: row.organizer,
      imageUrl: row.image_url ?? (row.event_kind === "club" ? demoClubArt(row.organizer) : null),
      attendeesCount: row.attendees_count,
      viewerAttending: row.viewer_attending,
    };
  });

  return { popularClubs, trendingEvents };
}
