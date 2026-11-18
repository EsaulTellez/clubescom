"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AttendButton } from "@/components/attend-button";
import { AvisoExternalLink } from "@/components/aviso-external-link";
import { QuickPublishModal, type QuickPublishContext } from "@/components/quick-publish-modal";
import type { FeedBatchResult, FeedItem, FeedMode } from "@/lib/feed";

const FILTERS: { mode: FeedMode; label: string }[] = [
  { mode: "para_ti", label: "Todo" },
  { mode: "clubes", label: "Clubes" },
  { mode: "eventos", label: "Eventos" },
  { mode: "foro", label: "Foro" },
  { mode: "avisos", label: "Avisos" },
  { mode: "recientes", label: "Recientes" },
];

export function HomeFeed({
  initialBatch,
  isAuthenticated,
  publishContext,
}: {
  initialBatch: FeedBatchResult;
  isAuthenticated: boolean;
  publishContext?: QuickPublishContext;
}) {
  const [mode, setMode] = useState<FeedMode>(initialBatch.mode);
  const [loadedItems, setLoadedItems] = useState<FeedItem[]>(initialBatch.items);
  const [realtimeItems, setRealtimeItems] = useState<FeedItem[] | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(initialBatch.hasMore);
  const [nextOffset, setNextOffset] = useState<number>(initialBatch.nextOffset);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [switchingMode, setSwitchingMode] = useState<boolean>(false);
  const [lightboxItem, setLightboxItem] = useState<{ src: string; title: string } | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => {
    if (realtimeItems !== null) return realtimeItems;
    if (mode !== initialBatch.mode) return loadedItems;
    if (loadedItems.length <= 5) return initialBatch.items;
    const incomingIds = new Set(initialBatch.items.map((item) => item.id));
    const rest = loadedItems.filter((item) => !incomingIds.has(item.id));
    return [...initialBatch.items, ...rest];
  }, [initialBatch, loadedItems, mode, realtimeItems]);

  useEffect(() => {
    async function refreshActiveMode() {
      if (switchingMode) return;
      const fetchLimit = Math.min(12, Math.max(5, items.length));
      const res = await fetch(
        `/api/feed?mode=${encodeURIComponent(mode)}&offset=0&limit=${fetchLimit}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data: FeedBatchResult = await res.json();
      setRealtimeItems((prev) => {
        const base = prev ?? items;
        if (base.length <= fetchLimit) return data.items;
        const incomingIds = new Set(data.items.map((item) => item.id));
        const rest = base.filter((item) => !incomingIds.has(item.id));
        return [...data.items, ...rest];
      });
      if (items.length <= fetchLimit) {
        setHasMore(data.hasMore);
        setNextOffset(data.nextOffset);
      }
    }
    const handler = () => {
      void refreshActiveMode();
    };
    window.addEventListener("escom:realtime-update", handler);
    return () => window.removeEventListener("escom:realtime-update", handler);
  }, [mode, items, switchingMode]);

  useEffect(() => {
    if (!lightboxItem) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxItem(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxItem]);

  const loadNextBatch = useCallback(async () => {
    if (loadingMore || switchingMode || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/feed?mode=${encodeURIComponent(mode)}&offset=${nextOffset}&limit=5`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data: FeedBatchResult = await res.json();
      setRealtimeItems(null);
      setLoadedItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        const fresh = data.items.filter((i) => !seen.has(i.id));
        return [...prev, ...fresh];
      });
      setHasMore(data.hasMore);
      setNextOffset(data.nextOffset);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, mode, nextOffset, switchingMode]);

  async function handleModeChange(nextMode: FeedMode) {
    if (nextMode === mode || switchingMode) return;
    setMode(nextMode);
    setRealtimeItems(null);
    setSwitchingMode(true);
    try {
      const res = await fetch(
        `/api/feed?mode=${encodeURIComponent(nextMode)}&offset=0&limit=5`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data: FeedBatchResult = await res.json();
      setLoadedItems(data.items);
      setHasMore(data.hasMore);
      setNextOffset(data.nextOffset);
    } finally {
      setSwitchingMode(false);
    }
  }

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadNextBatch();
        }
      },
      { rootMargin: "320px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadNextBatch]);

  return (
    <section className="mx-auto w-full max-w-[44rem] space-y-6" aria-label="Feed de la comunidad">
      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-[#c1c5bc]">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filtrar publicaciones">
          {FILTERS.map((f) => (
            <button
              key={f.mode}
              type="button"
              role="tab"
              aria-selected={mode === f.mode}
              onClick={() => handleModeChange(f.mode)}
              className="catalog-tab"
            >
              {f.label}
            </button>
          ))}
        </div>

        {publishContext && <QuickPublishModal context={publishContext} />}
      </div>

      {switchingMode ? (
        <div className="grid gap-6" aria-live="polite" aria-busy="true">
          {[0, 1].map((skeletonIdx) => (
            <div
              key={skeletonIdx}
              className="animate-pulse space-y-3 rounded-lg border border-[#dcd9ce] bg-[#fffdf7] p-6"
            >
              <div className="h-4 w-1/3 rounded bg-[#e6e4da]" />
              <div className="h-6 w-2/3 rounded bg-[#dfddd2]" />
              <div className="h-44 w-full rounded bg-[#eceae1]" />
            </div>
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="grid gap-6">
          {items.map((item) => {
            if (item.sourceType === "club_post") {
              return (
                <article
                  key={item.id}
                  className="group overflow-hidden rounded-sm border border-[#c9d6cf] border-l-4 border-l-[#165b47] bg-[#fffdf7] shadow-[0_2px_0_rgba(22,91,71,0.06)] transition hover:border-[#8eb8a7]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#d8e3dd] bg-[#f7faf8] px-5 py-3 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md border border-[#bfd4ca] bg-white text-sm font-extrabold text-[#14523f]">
                        {item.avatarImage ? (
                          <img src={item.avatarImage} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span>{item.avatarLetter}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        {item.clubId ? (
                          <Link
                            href={`/clubes/${item.clubId}`}
                            className="block break-words text-[15px] font-extrabold text-[#113a2e] hover:text-[#165b47] hover:underline"
                          >
                            {item.clubName ?? "Club ESCOM"}
                          </Link>
                        ) : (
                          <p className="break-words text-[15px] font-extrabold text-[#113a2e]">
                            {item.clubName ?? "Club ESCOM"}
                          </p>
                        )}
                        <p className="text-xs text-[#546e66]">
                          <time dateTime={item.publishedAtIso}>
                            {item.publishedDateFormatted}, {item.publishedTimeFormatted}
                          </time>
                        </p>
                      </div>
                    </div>
                    <div className="flex max-w-full flex-wrap items-center gap-1.5">
                      <span className="inline-flex max-w-full items-center rounded border border-[#b4d3c6] bg-[#e9f5f0] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#11503d] break-words whitespace-normal">
                        {item.categoryLabel}
                      </span>
                      {item.clubSchedule && (
                        <span className="inline-flex max-w-full items-center rounded border border-[#d6dedb] bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#49635b] break-words whitespace-normal">
                          {item.clubSchedule}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-5 sm:p-6">
                    <h3 className="text-lg font-extrabold tracking-tight text-[#133547] sm:text-xl">
                      {item.title}
                    </h3>
                    <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[#384d57]">
                      {item.body}
                    </p>

                    {item.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setLightboxItem({ src: item.imageUrl!, title: item.title })}
                        className="mt-4 block w-full overflow-hidden rounded-md border border-[#d8d5c9] bg-[#f5f3ea] p-1.5 text-left"
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="max-h-[25rem] w-full rounded-sm object-contain"
                        />
                      </button>
                    )}
                  </div>

                  {item.clubId && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#dce7e1] bg-[#f8fbf9] px-5 py-2.5 text-xs font-bold text-[#165b47] sm:px-6">
                      <Link href={`/clubes/${item.clubId}`} className="shrink-0 hover:underline">
                        Ir al club →
                      </Link>
                    </div>
                  )}
                </article>
              );
            }

            if (item.sourceType === "evento") {
              return (
                <article
                  key={item.id}
                  className="group overflow-hidden rounded-sm border border-[#c6d4dc] border-t-4 border-t-[#005a87] bg-[#fffdf7] shadow-[0_2px_0_rgba(7,68,99,0.06)] transition hover:border-[#86b1c8]"
                >
                  {item.imageUrl ? (
                    <div className="relative border-b border-[#d6dfe4] bg-[#f3f1e8]">
                      <button
                        type="button"
                        onClick={() => setLightboxItem({ src: item.imageUrl!, title: item.title })}
                        className="block h-52 w-full overflow-hidden text-left sm:h-60"
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      </button>
                      <span className="pointer-events-none absolute top-3 left-3 rounded border border-[#004d73] bg-[#004d73] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white">
                        Eventos ESCOM
                      </span>
                    </div>
                  ) : null}

                  <div className="border-b border-[#d4dce0] bg-[#f7f5ec] px-5 py-3 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs font-bold">
                        {!item.imageUrl && (
                          <span className="inline-flex max-w-full items-center rounded border border-[#004d73] bg-[#004d73] px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white">
                            Eventos
                          </span>
                        )}
                        {item.eventStartsAtFormatted && (
                          <span className="inline-flex max-w-full items-center gap-1.5 py-1 text-[#004d73] break-words whitespace-normal">
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                              <rect x="2" y="3" width="12" height="11" rx="1.8" />
                              <path d="M5 1.5v2.5M11 1.5v2.5M2 6.5h12" strokeLinecap="round" />
                            </svg>
                            <span className="min-w-0 break-words">
                              {item.eventStartsAtFormatted}
                              {item.eventTimeRange ? ` · ${item.eventTimeRange}` : ""}
                            </span>
                          </span>
                        )}
                        {item.eventLocation && (
                          <span className="inline-flex max-w-full items-start gap-1.5 py-1 text-[#3d525e] break-words whitespace-normal">
                            <span className="shrink-0" aria-hidden="true">⌖</span>
                            <span className="min-w-0 break-words">{item.eventLocation}</span>
                          </span>
                        )}
                        {item.eventSpeaker && (
                          <span className="inline-flex max-w-full items-start gap-1 py-1 text-[#2c4452] break-words whitespace-normal">
                            <span className="min-w-0 break-words">Ponente: {item.eventSpeaker}</span>
                          </span>
                        )}
                      </div>

                      {item.eventKind && (
                        <div className="shrink-0">
                          <AttendButton
                            eventKind={item.eventKind}
                            eventId={item.rawId}
                            initialAttending={Boolean(item.viewerAttending)}
                            initialCount={item.attendeesCount ?? 0}
                            isAuthenticated={isAuthenticated}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-5 sm:p-6">
                    <h3 className="text-lg font-extrabold tracking-tight text-[#133547] sm:text-xl">
                      {item.title}
                    </h3>
                    {item.body && (
                      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[#3a4f5a]">
                        {item.body}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#dce5ea] bg-[#f8fafb] px-5 py-2.5 text-xs font-bold text-[#005a87] sm:px-6">
                    {item.clubName && <span className="text-[#586d77]">{item.clubName}</span>}
                    <Link href="/eventos" className="ml-auto shrink-0 hover:underline">
                      Ver en eventos →
                    </Link>
                  </div>
                </article>
              );
            }

            if (item.sourceType === "foro") {
              return (
                <article
                  key={item.id}
                  className="group overflow-hidden rounded-sm border border-[#ddd4be] border-l-4 border-l-[#b88917] bg-[#fffdf7] shadow-[0_2px_0_rgba(110,80,8,0.05)] transition hover:border-[#cbb88d]"
                >
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex shrink-0 flex-col items-center justify-center rounded-md border border-[#dfd3b2] bg-[#faf5e4] px-3 py-2 text-[#6e5008]">
                        <strong className="text-lg font-extrabold leading-none">{item.votesCount ?? 0}</strong>
                        <span className="mt-1 text-[10px] font-extrabold uppercase tracking-wider">votos</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex max-w-full flex-wrap items-center gap-1.5">
                            <span className="inline-flex max-w-full items-center rounded border border-[#e2cf98] bg-[#fcf5de] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#6e5008] break-words whitespace-normal">
                              Foro · {item.categoryLabel}
                            </span>
                            {item.forumStatus === "respondida" && (
                              <span className="inline-flex items-center rounded border border-[#bdd9cf] bg-[#ebf5f1] px-2.5 py-0.5 text-[11px] font-extrabold text-[#195444]">
                                ✓ Respondida
                              </span>
                            )}
                          </div>
                          <time dateTime={item.publishedAtIso} className="text-xs font-medium text-[#64757e]">
                            {item.publishedDateFormatted}, {item.publishedTimeFormatted}
                          </time>
                        </div>

                        <h3 className="mt-2.5 text-lg font-extrabold tracking-tight text-[#153749] sm:text-xl">
                          <Link href={`/foro?duda=${item.rawId}#duda-${item.rawId}`} className="hover:text-[#006699] hover:underline">
                            {item.title}
                          </Link>
                        </h3>
                        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[#3d505a]">
                          {item.body}
                        </p>

                        {item.imageUrl && (
                          <button
                            type="button"
                            onClick={() => setLightboxItem({ src: item.imageUrl!, title: item.title })}
                            className="mt-3.5 inline-block max-w-sm overflow-hidden rounded-md border border-[#dcd3bd] bg-[#f6f3e8] p-1 text-left"
                          >
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="max-h-56 w-auto rounded-sm object-contain"
                            />
                          </button>
                        )}

                        {item.topAnswerBody && (
                          <div className="mt-4 rounded-md border border-[#d6e2e6] border-l-[3px] border-l-[#006699] bg-[#f4f8fa] p-3.5">
                            <div className="text-xs font-extrabold text-[#004d73]">
                              {item.topAnswerOfficial ? "✓ Respuesta oficial" : "Respuesta destacada"}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#2c4654]">
                              {item.topAnswerBody}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e7dfc9] bg-[#fbf8ef] px-5 py-2.5 text-xs font-bold text-[#6e5008] sm:px-6">
                    <span>
                      {item.answersCount ?? 0} {item.answersCount === 1 ? "respuesta" : "respuestas"}
                    </span>
                    <Link href={`/foro?duda=${item.rawId}#duda-${item.rawId}`} className="shrink-0 hover:underline">
                      Participar en el hilo →
                    </Link>
                  </div>
                </article>
              );
            }

            // sourceType === "aviso" — Estilo Gaceta / Boletín Escolar
            return (
              <article
                key={item.id}
                className="group overflow-hidden rounded-sm border border-[#d6d3c6] border-t-[3px] border-t-[#004d73] bg-[#fffdf7] shadow-[0_2px_0_rgba(0,77,115,0.05)] transition hover:border-[#8bb7cf]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e4e0d3] bg-[#f7f5ec] px-5 py-2.5 sm:px-6">
                  <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#004d73]">
                    Gaceta ESCOM · {item.categoryLabel}
                  </span>
                  <time dateTime={item.publishedAtIso} className="text-xs font-semibold text-[#5b6f7a]">
                    {item.publishedDateFormatted}
                  </time>
                </div>

                <div className="p-5 sm:p-6">
                  <div className={item.imageUrl ? "flex flex-col gap-5 sm:flex-row sm:items-start" : ""}>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-extrabold tracking-tight text-[#133649] sm:text-[22px]">
                        <Link href={`/avisos/${item.rawId}`} className="hover:text-[#006699] hover:underline">
                          {item.title}
                        </Link>
                      </h3>
                      <p className="mt-2.5 whitespace-pre-wrap text-[15px] leading-relaxed text-[#3a4f5a]">
                        {item.body}
                      </p>
                    </div>

                    {item.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setLightboxItem({ src: item.imageUrl!, title: item.title })}
                        className="group/img relative w-full shrink-0 overflow-hidden rounded-md border border-[#cfccc0] bg-[#f4f1e6] p-1 text-left sm:w-44 md:w-48"
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="max-h-72 w-full rounded-xs object-contain sm:aspect-[4/5] sm:max-h-none sm:object-cover"
                        />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#dfdccc] bg-[#faf8f1] px-5 py-2.5 text-xs font-bold text-[#005a87] sm:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[#5b6f7a]">Comunicado oficial</span>
                    {item.externalUrl && (
                      <AvisoExternalLink avisoId={item.rawId} url={item.externalUrl} compact />
                    )}
                  </div>
                  <Link href={`/avisos/${item.rawId}`} className="shrink-0 hover:underline">
                    Abrir comunicado →
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-sm border border-[#dcd9ce] bg-[#fffdf7] p-6 text-center text-sm text-[#5f6e78]">
          No hay publicaciones en esta categoría.
        </p>
      )}

      {/* Centinela silencioso para cargar más al deslizar */}
      <div ref={sentinelRef} className="pt-1" aria-live="polite">
        {loadingMore && (
          <div className="animate-pulse space-y-3 rounded-sm border border-[#dcd9ce] bg-[#fffefa] p-6">
            <div className="h-4 w-1/3 rounded bg-[#e6e4da]" />
            <div className="h-6 w-2/3 rounded bg-[#dfddd2]" />
            <div className="h-14 w-full rounded bg-[#eceae1]" />
          </div>
        )}
      </div>

      {/* Visor de imagen al hacer clic */}
      {lightboxItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightboxItem.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="relative max-h-[92vh] max-w-4xl overflow-hidden rounded-sm border border-white/15 bg-[#0b1820] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3 text-white">
              <p className="truncate text-sm font-extrabold">{lightboxItem.title}</p>
              <button
                type="button"
                aria-label="Cerrar imagen"
                onClick={() => setLightboxItem(null)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-sm font-bold text-white hover:bg-white/20"
              >
                ✕
              </button>
            </div>
            <div className="flex max-h-[82vh] items-center justify-center overflow-auto p-3">
              <img
                src={lightboxItem.src}
                alt={lightboxItem.title}
                className="max-h-[78vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
