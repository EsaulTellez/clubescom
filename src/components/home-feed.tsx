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

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    async function refreshActiveMode() {
      if (switchingMode) return;
      const currentItems = itemsRef.current;
      const fetchLimit = Math.min(12, Math.max(5, currentItems.length));
      const res = await fetch(
        `/api/feed?mode=${encodeURIComponent(mode)}&offset=0&limit=${fetchLimit}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data: FeedBatchResult = await res.json();
      setRealtimeItems((prev) => {
        const base = prev ?? currentItems;
        if (base.length <= fetchLimit) return data.items;
        const incomingIds = new Set(data.items.map((item) => item.id));
        const rest = base.filter((item) => !incomingIds.has(item.id));
        return [...data.items, ...rest];
      });
      if (currentItems.length <= fetchLimit) {
        setHasMore(data.hasMore);
        setNextOffset(data.nextOffset);
      }
    }
    const handler = () => {
      void refreshActiveMode();
    };
    window.addEventListener("escom:realtime-update", handler);
    return () => window.removeEventListener("escom:realtime-update", handler);
  }, [mode, switchingMode]);

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
      setRealtimeItems((prev) => {
        if (!prev) return null;
        const seen = new Set(prev.map((i) => i.id));
        const fresh = data.items.filter((i) => !seen.has(i.id));
        return [...prev, ...fresh];
      });
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
                  className="group overflow-hidden rounded-2xl border border-[#d1e0d9] bg-white shadow-[0_2px_12px_rgba(22,91,71,0.06)] transition hover:border-[#94bfb0]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 pt-4 pb-3 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#b7d6c9] bg-[#eef7f3] text-sm font-extrabold text-[#14523f]">
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
                        <p className="text-xs text-[#5d766e]">
                          <span>{item.categoryLabel}</span>
                          <span aria-hidden="true"> · </span>
                          <time dateTime={item.publishedAtIso}>
                            {item.publishedDateFormatted}, {item.publishedTimeFormatted}
                          </time>
                        </p>
                      </div>
                    </div>
                    {item.clubSchedule && (
                      <span className="inline-flex max-w-full items-center rounded-full border border-[#d5e3dd] bg-[#f4faf7] px-3 py-1 text-[11px] font-bold text-[#2b5749] break-words whitespace-normal">
                        {item.clubSchedule}
                      </span>
                    )}
                  </div>

                  <div className="px-5 pb-5 sm:px-6">
                    <h3 className="text-lg font-extrabold tracking-tight text-[#14332a] sm:text-xl">
                      {item.title}
                    </h3>
                    <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[#384d57]">
                      {item.body}
                    </p>

                    {item.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setLightboxItem({ src: item.imageUrl!, title: item.title })}
                        className="mt-4 block w-full cursor-zoom-in overflow-hidden rounded-xl border border-[#dce6e1] bg-[#0f1f26] text-left"
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="max-h-[25rem] w-full object-contain"
                        />
                      </button>
                    )}
                  </div>

                  {item.clubId && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e5efea] bg-[#f7fbf9] px-5 py-2.5 text-xs font-extrabold text-[#165b47] sm:px-6">
                      <span>Comunidad de clubes</span>
                      <Link href={`/clubes/${item.clubId}`} className="shrink-0 hover:underline">
                        Entrar al club →
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
                  className="group overflow-hidden rounded-md border-2 border-[#1b3647] bg-[#fffdf7] shadow-[4px_4px_0_rgba(23,49,66,0.1)] transition hover:shadow-[6px_6px_0_rgba(23,49,66,0.14)]"
                >
                  {/* Marquesina superior oscura del evento */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-[#142c3c] px-5 py-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#f5f1e4] sm:px-6">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#e3b341]" aria-hidden="true" />
                      <span>{item.eventLocation ?? "Cartelera ESCOM"}</span>
                    </span>
                    {item.eventStartsAtFormatted && (
                      <span className="font-mono text-[#e3b341]">
                        {item.eventStartsAtFormatted}
                        {item.eventTimeRange ? ` · ${item.eventTimeRange}` : ""}
                      </span>
                    )}
                  </div>

                  {item.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setLightboxItem({ src: item.imageUrl!, title: item.title })}
                      className="block max-h-72 w-full cursor-zoom-in overflow-hidden border-b border-[#1b3647] bg-[#10202b] text-left"
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="max-h-72 w-full object-contain"
                      />
                    </button>
                  )}

                  <div className="p-5 sm:p-6">
                    <h3 className="font-serif text-2xl font-bold leading-tight tracking-tight text-[#142c3c]">
                      {item.title}
                    </h3>
                    {item.body && (
                      <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-[#425864]">
                        {item.body}
                      </p>
                    )}
                    {(item.eventSpeaker || item.clubName) && (
                      <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 border-l-2 border-[#e3b341] pl-3 text-xs font-semibold text-[#35505e]">
                        {item.eventSpeaker && <span>Ponente: <strong className="text-[#142c3c]">{item.eventSpeaker}</strong></span>}
                        {item.clubName && <span>Organiza: <strong className="text-[#142c3c]">{item.clubName}</strong></span>}
                      </div>
                    )}
                  </div>

                  {/* Talón perforado inferior */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-[#c7bfa9] bg-[#faf7ee] px-5 py-3 sm:px-6">
                    {item.eventKind ? (
                      <AttendButton
                        eventKind={item.eventKind}
                        eventId={item.rawId}
                        initialAttending={Boolean(item.viewerAttending)}
                        initialCount={item.attendeesCount ?? 0}
                        isAuthenticated={isAuthenticated}
                      />
                    ) : (
                      <span />
                    )}
                    <Link href="/eventos" className="text-xs font-extrabold text-[#142c3c] hover:text-[#006699] hover:underline">
                      Ver cartelera completa →
                    </Link>
                  </div>
                </article>
              );
            }

            if (item.sourceType === "foro") {
              return (
                <article
                  key={item.id}
                  className="group overflow-hidden rounded-md border border-[#d6d2c3] bg-white shadow-[0_2px_6px_rgba(20,44,60,0.04)] transition hover:border-[#b9b092]"
                >
                  <div className="grid sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                    {/* Riel lateral de votos */}
                    <div className="flex items-center justify-between border-b border-[#e8e3d4] bg-[#f8f5ea] px-4 py-2.5 text-[#6e5008] sm:flex-col sm:justify-start sm:border-b-0 sm:border-r sm:px-2 sm:py-5">
                      <div className="flex items-baseline gap-1.5 sm:flex-col sm:items-center sm:gap-0">
                        <span className="text-xs" aria-hidden="true">▲</span>
                        <strong className="font-mono text-lg font-black leading-none tabular-nums">{item.votesCount ?? 0}</strong>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider sm:mt-1">votos</span>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-[#5d6e76] sm:mt-3">
                        {item.answersCount ?? 0} resp.
                      </span>
                    </div>

                    <div className="min-w-0 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-[#fcf5de] px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#6e5008]">
                            Foro · {item.categoryLabel}
                          </span>
                          {item.forumStatus === "respondida" ? (
                            <span className="rounded bg-[#e8f6ef] px-2 py-0.5 text-[11px] font-extrabold text-[#14593e]">
                              ✓ Respondida
                            </span>
                          ) : (
                            <span className="rounded bg-[#f2f4f5] px-2 py-0.5 text-[11px] font-bold text-[#546873]">
                              Abierta
                            </span>
                          )}
                        </div>
                        <time dateTime={item.publishedAtIso} className="text-xs text-[#64757e]">
                          {item.publishedDateFormatted}
                        </time>
                      </div>

                      <h3 className="mt-2.5 text-lg font-extrabold tracking-tight text-[#142c3c]">
                        <Link href={`/foro?duda=${item.rawId}#duda-${item.rawId}`} className="hover:text-[#006699] hover:underline">
                          {item.title}
                        </Link>
                      </h3>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[#3d505a]">
                        {item.body}
                      </p>

                      {item.imageUrl && (
                        <button
                          type="button"
                          onClick={() => setLightboxItem({ src: item.imageUrl!, title: item.title })}
                          className="mt-3 inline-block max-w-sm cursor-zoom-in overflow-hidden rounded border border-[#dcd3bd] bg-[#f6f3e8] p-1 text-left"
                        >
                          <img src={item.imageUrl} alt={item.title} className="max-h-52 w-auto object-contain" />
                        </button>
                      )}

                      {item.topAnswerBody && (
                        <div className="mt-3.5 rounded border border-[#c8dce7] border-l-4 border-l-[#006699] bg-[#f2f8fb] p-3">
                          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#004d73]">
                            {item.topAnswerOfficial ? "✓ Respuesta oficial" : "Respuesta destacada"}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[#294352]">
                            {item.topAnswerBody}
                          </p>
                        </div>
                      )}

                      <div className="mt-3.5 flex justify-end">
                        <Link href={`/foro?duda=${item.rawId}#duda-${item.rawId}`} className="text-xs font-extrabold text-[#006699] hover:underline">
                          Participar en el hilo →
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            }

            // sourceType === "aviso" — Despacho Editorial / Gaceta Oficial
            return (
              <article
                key={item.id}
                className="group overflow-hidden rounded-none border border-[#c7c2b4] border-y-2 border-y-[#14374a] bg-[#fffdf7] transition hover:border-[#006699]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-double border-[#bdb7a7] bg-[#f5f2e6] px-5 py-2.5 sm:px-6">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#004d73]">
                    Gaceta Oficial ESCOM · {item.categoryLabel}
                  </span>
                  <time dateTime={item.publishedAtIso} className="font-mono text-xs font-bold text-[#4a606c]">
                    {item.publishedDateFormatted}
                  </time>
                </div>

                <div className="p-5 sm:p-6">
                  <div className={item.imageUrl ? "flex flex-col gap-5 sm:flex-row sm:items-start" : ""}>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-extrabold leading-snug tracking-tight text-[#112e3f] sm:text-[23px]">
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
                        className="group/img relative w-full shrink-0 cursor-zoom-in overflow-hidden border border-[#cfccc0] bg-[#f4f1e6] p-1 text-left sm:w-44 md:w-48"
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="max-h-72 w-full object-contain sm:aspect-[4/5] sm:max-h-none sm:object-cover"
                        />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e0dccf] bg-[#faf7ee] px-5 py-2.5 text-xs font-bold text-[#005a87] sm:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-[#5b6f7a]">Comunicado</span>
                    {item.externalUrl && (
                      <AvisoExternalLink avisoId={item.rawId} url={item.externalUrl} compact />
                    )}
                  </div>
                  <Link href={`/avisos/${item.rawId}`} className="shrink-0 hover:underline">
                    Leer despacho completo →
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
