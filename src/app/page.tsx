import Link from "next/link";
import { canManageAvisos, formatAvisoDeadline, nextAvisoMidnight, toDatetimeLocal } from "@/app/avisos/shared";
import { canManageSpaceByName, canPublishAnySpaceEvents } from "@/app/espacios/shared";
import { AttendButton } from "@/components/attend-button";
import { HomeFeed } from "@/components/home-feed";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { StoryCarousel, type StoryCard } from "@/components/story-carousel";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { demoNoticeAuthor } from "@/lib/demo-art";
import {
  getHomeFeedBatch,
  getTrendingLeaderboards,
  type FeedBatchResult,
  type PopularClubItem,
  type TrendingEventItem,
} from "@/lib/feed";
import { card } from "@/lib/ui";

export const dynamic = "force-dynamic";

type ComunicadoHighlight = {
  id: string;
  title: string;
  body: string;
  publish_at: Date;
  image_url: string;
  valid_until: string | null;
  external_url: string | null;
};

function shortWhen(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(value);
}

export default async function HomePage() {
  const user = await getSession();
  const canPublishAviso = canManageAvisos(user);
  const canPublishSpaceEvents = canPublishAnySpaceEvents(user);
  let stories: StoryCard[] = [];
  let initialBatch: FeedBatchResult = {
    items: [],
    hasMore: false,
    nextOffset: 0,
    totalCount: 0,
    mode: "para_ti",
  };
  let popularClubs: PopularClubItem[] = [];
  let trendingEvents: TrendingEventItem[] = [];
  let managedClubs: { id: string; name: string }[] = [];
  let spaces: { id: string; name: string }[] = [];
  let dbDown = false;

  try {
    try {
      await pool.query("select public.trigger_scheduled_avisos()");
    } catch {
      // ignore if migration not yet applied
    }

    const [highlightsRes, feedBatch, leaderboards, clubsRes, spacesRes] = await Promise.all([
      pool.query<ComunicadoHighlight>(
        `select a.id, a.title, a.body, a.publish_at, a.valid_until::text, a.image_url, a.external_url
         from public.aviso_carousel c
         join public.avisos a on a.id = c.id
         where a.is_public or $1::boolean
         order by c.position`,
        [Boolean(user)],
      ),
      getHomeFeedBatch({
        userId: user?.id ?? null,
        isAuthenticated: Boolean(user),
        mode: "para_ti",
        offset: 0,
        limit: 5,
      }),
      getTrendingLeaderboards(user?.id ?? null),
      user
        ? pool.query<{ id: string; name: string }>(
            `select id, name from public.clubs
             where active = true
               and (($2 = 'alumno' and leader_id = $1) or ($2 = 'profesor' and advisor_id = $1))
             order by name`,
            [user.id, user.role],
          )
        : Promise.resolve({ rows: [] as { id: string; name: string }[] }),
      canPublishSpaceEvents
        ? pool.query<{ id: string; name: string }>("select id, name from public.spaces order by name")
        : Promise.resolve({ rows: [] as { id: string; name: string }[] }),
    ]);

    stories = highlightsRes.rows.map((aviso) => ({
      id: aviso.id,
      title: aviso.title,
      summary: aviso.body,
      dateLabel: aviso.valid_until ? formatAvisoDeadline(aviso.valid_until) : shortWhen(aviso.publish_at),
      author: demoNoticeAuthor(aviso.title),
      image: aviso.image_url,
      externalUrl: aviso.external_url,
    }));

    initialBatch = feedBatch;
    popularClubs = leaderboards.popularClubs;
    trendingEvents = leaderboards.trendingEvents;
    managedClubs = clubsRes.rows;
    spaces = spacesRes.rows.filter((space) => canManageSpaceByName(user, space.name));
  } catch {
    dbDown = true;
  }

  return (
    <div className="board-page">
      <RealtimeRefresh
        refreshAt={nextAvisoMidnight()}
        tables={["avisos", "clubs", "club_posts", "club_events", "space_events", "questions", "event_attendees"]}
      />

      {dbDown && (
        <p className={card} role="status">
          No se pudo cargar el inicio. Vuelve a intentarlo en un momento.
        </p>
      )}

      <div className="board-layout">
        <div className="board-main">
          {!dbDown && (
            <section className="board-pinned" aria-labelledby="comunicados-heading">
              <div className="edition-rule mb-4 flex items-baseline justify-between gap-3">
                <h1 id="comunicados-heading" className="edition-title">
                  Comunicados
                </h1>
                <Link href="/avisos" className="shrink-0 text-sm font-semibold text-[#155775] hover:underline">Ver avisos →</Link>
              </div>
              {stories.length > 0 ? (
                <StoryCarousel items={stories} />
              ) : (
                <p className="text-sm text-[#53656c]">Hoy no hay avisos vigentes con cartel.</p>
              )}
            </section>
          )}

          <HomeFeed
            initialBatch={initialBatch}
            isAuthenticated={Boolean(user)}
            publishContext={
              user && (canPublishAviso || canPublishSpaceEvents || managedClubs.length > 0)
                ? {
                    isAuthenticated: true,
                    canPublishAviso,
                    canPublishSpaceEvents,
                    managedClubs,
                    spaces,
                    defaultPublishAt: toDatetimeLocal(new Date()),
                  }
                : undefined
            }
          />
        </div>

        <aside className="board-sidebar grid gap-5 xl:sticky xl:top-32">
          {/* Clubes populares */}
          <section className="board-sidecard board-leaderboard" aria-labelledby="popular-clubs-heading">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="popular-clubs-heading">Clubes populares</h2>
              <Link href="/clubes" className="text-xs font-bold text-[#005a87] hover:underline">
                Ver todos
              </Link>
            </div>

            <ol className="grid gap-2.5">
              {popularClubs.map((club) => (
                <li key={club.id} className="board-leaderboard__item flex items-center gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center text-lg font-semibold tabular-nums text-[#42606a]">
                    {club.rank}
                  </span>

                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-[#d6d8ce] bg-[#f2f1e9] text-xs font-extrabold text-[#1e495e]">
                    {club.logoUrl ? (
                      <img src={club.logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      club.name.replace("Club de ", "").slice(0, 1)
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/clubes/${club.id}`}
                      className="block truncate text-sm font-extrabold text-[#173a4c] hover:text-[#006699] hover:underline"
                    >
                      {club.name}
                    </Link>
                    <p className="truncate text-xs text-[#5e717a]">
                      {club.kindLabel} · {club.membersCount} {club.membersCount === 1 ? "miembro" : "miembros"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Eventos en tendencia */}
          <section
            className="board-sidecard board-leaderboard border-t-4 border-t-[#b88917]"
            aria-labelledby="trending-events-heading"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="trending-events-heading">Eventos en tendencia</h2>
              <Link href="/eventos" className="text-xs font-bold text-[#005a87] hover:underline">
                Ver todos
              </Link>
            </div>

            {trendingEvents.length > 0 ? (
              <ol className="grid gap-2.5">
                {trendingEvents.map((ev) => (
                  <li key={`${ev.eventKind}-${ev.id}`} className="board-leaderboard__item space-y-2">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center text-lg font-semibold tabular-nums text-[#81633a]">
                        {ev.rank}
                      </span>

                      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-[#e3d9b8] bg-[#faf5e4] text-[#8c6812]">
                        {ev.imageUrl ? (
                          <img src={ev.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <rect x="3" y="4" width="14" height="13" rx="2" />
                            <path d="M7 2.5v3M13 2.5v3M3 8h14" strokeLinecap="round" />
                          </svg>
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-extrabold leading-snug text-[#173a4c]">
                          {ev.title}
                        </p>
                        <p className="mt-0.5 break-words text-xs text-[#586d77]">
                          {ev.location} · {ev.dateFormatted}, {ev.timeFormatted}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pl-[4.75rem]">
                      {ev.eventKind === "club" && <span className="truncate text-xs font-semibold text-[#5e717a]">{ev.organizer}</span>}
                      <AttendButton
                        eventKind={ev.eventKind}
                        eventId={ev.id}
                        initialAttending={ev.viewerAttending}
                        initialCount={ev.attendeesCount}
                        isAuthenticated={Boolean(user)}
                        compact
                      />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs leading-relaxed text-[#5e717a]">
                No hay eventos próximos programados en este momento.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
