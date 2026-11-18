"use client";

import { CatalogSearch } from "@/components/catalog-search";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AvisoExternalLink, trackAvisoInteraction } from "@/components/aviso-external-link";
import { btn } from "@/lib/ui";
import { actualizarAviso, crearAviso } from "./actions";
import { AvisoForm } from "./aviso-form";
import { DeleteAviso } from "./delete-aviso";
import { categoryLabel, linkDomain, type Category } from "./shared";

export type ComunicadoItem = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  category: Category;
  featured: boolean;
  isPublic: boolean;
  isScheduled: boolean;
  imageUrl: string | null;
  externalUrl: string | null;
  viewsCount: number;
  linkClicksCount: number;
  publishAtIso: string;
  publishAtLocal: string;
  publishDateFormatted: string;
  publishTimeFormatted: string;
  socialTwitter: string | null;
  socialFacebook: string | null;
  socialCopy: string | null;
  canEditOrDelete: boolean;
};

export type KpiRecentActivity = {
  views7d: number;
  clicks7d: number;
};

type FormModalState =
  | { mode: "create" }
  | { mode: "edit"; item: ComunicadoItem }
  | null;

const CATEGORY_STYLES: Record<
  Category,
  {
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    topBorder: string;
    icon: React.ReactNode;
  }
> = {
  tramites: {
    badgeBg: "bg-[#fdf5df]",
    badgeText: "text-[#6e5008]",
    badgeBorder: "border-[#e6d39a]",
    topBorder: "border-t-[#b88917]",
    icon: (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M5 3.5h7l3.5 3.5v9.5a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
        <path d="M12 3.5V7h3.5M7.5 10.5h5M7.5 13.5h3.5" strokeLinecap="round" />
      </svg>
    ),
  },
  academico: {
    badgeBg: "bg-[#eaf4f8]",
    badgeText: "text-[#004d73]",
    badgeBorder: "border-[#bcd6e3]",
    topBorder: "border-t-[#006699]",
    icon: (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="m2.5 7.5 7.5-3.5 7.5 3.5-7.5 3.5-7.5-3.5Z" strokeLinejoin="round" />
        <path d="M5.5 9.2v4.3c0 1.2 2 2.3 4.5 2.3s4.5-1.1 4.5-2.3V9.2" strokeLinecap="round" />
      </svg>
    ),
  },
  social: {
    badgeBg: "bg-[#ebf7f3]",
    badgeText: "text-[#165745]",
    badgeBorder: "border-[#bde0d4]",
    topBorder: "border-t-[#1b6b55]",
    icon: (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9">
        <circle cx="7.5" cy="7" r="2.3" />
        <circle cx="13" cy="7.5" r="1.9" />
        <path d="M3.2 15.8c.4-2.4 2-3.8 4.3-3.8s3.9 1.4 4.3 3.8M11.8 15.8c.3-1.8 1.4-2.9 3.2-2.9 1.3 0 2.3.7 2.8 2.1" strokeLinecap="round" />
      </svg>
    ),
  },
};

export function ComunicadosExplorer({
  comunicados: initialComunicados,
  canCreate,
  showKpis = false,
  recentActivity = { views7d: 0, clicks7d: 0 },
  defaultPublishAt,
  initialQuery = "",
  initialCategory = "",
  initialSelectedId = "",
}: {
  comunicados: ComunicadoItem[];
  canCreate: boolean;
  showKpis?: boolean;
  recentActivity?: KpiRecentActivity;
  defaultPublishAt: string;
  initialQuery?: string;
  initialCategory?: string;
  initialSelectedId?: string;
}) {
  const router = useRouter();
  const [liveCounts, setLiveCounts] = useState<
    Record<string, { viewsCount: number; linkClicksCount: number }>
  >({});
  const [extra7d, setExtra7d] = useState<{ views: number; clicks: number }>({
    views: 0,
    clicks: 0,
  });

  const items = useMemo(
    () =>
      initialComunicados.map((item) => {
        const override = liveCounts[item.id];
        if (!override) return item;
        return {
          ...item,
          viewsCount: Math.max(item.viewsCount, override.viewsCount),
          linkClicksCount: Math.max(item.linkClicksCount, override.linkClicksCount),
        };
      }),
    [initialComunicados, liveCounts],
  );

  const activity7d = useMemo(
    () => ({
      views7d: recentActivity.views7d + extra7d.views,
      clicks7d: recentActivity.clicks7d + extra7d.clicks,
    }),
    [recentActivity, extra7d],
  );

  const [query, setQuery] = useState(initialQuery);
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">(
    initialCategory === "academico" || initialCategory === "social" || initialCategory === "tramites"
      ? initialCategory
      : "all",
  );
  const [onlyWithPoster, setOnlyWithPoster] = useState(false);
  const [onlyWithLink, setOnlyWithLink] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (initialSelectedId && initialComunicados.some((item) => item.id === initialSelectedId)) {
      return initialSelectedId;
    }
    return null;
  });
  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [kpiExpanded, setKpiExpanded] = useState(true);
  const [kpiLinksOnly, setKpiLinksOnly] = useState(false);
  const [kpiShowAll, setKpiShowAll] = useState(false);

  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const lastTrackedViewRef = useRef<string | null>(null);

  const applyServerCounts = useCallback(
    (
      id: string,
      kind: "view" | "click",
      counts?: { viewsCount: number | null; linkClicksCount: number | null } | null,
    ) => {
      if (
        counts &&
        typeof counts.viewsCount === "number" &&
        typeof counts.linkClicksCount === "number"
      ) {
        const nextViews = counts.viewsCount;
        const nextClicks = counts.linkClicksCount;
        setLiveCounts((prev) => ({
          ...prev,
          [id]: { viewsCount: nextViews, linkClicksCount: nextClicks },
        }));
      }
      setExtra7d((prev) => ({
        views: prev.views + (kind === "view" ? 1 : 0),
        clicks: prev.clicks + (kind === "click" ? 1 : 0),
      }));
    },
    [],
  );

  const openComunicado = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (lastTrackedViewRef.current !== id) {
        lastTrackedViewRef.current = id;
        void trackAvisoInteraction(id, "view").then((counts) => {
          applyServerCounts(id, "view", counts);
        });
      }
    },
    [applyServerCounts],
  );

  useEffect(() => {
    if (!selectedId) {
      lastTrackedViewRef.current = null;
    }
  }, [selectedId]);

  const counts = useMemo(() => {
    const map: Record<Category | "all", number> = {
      all: items.length,
      tramites: 0,
      academico: 0,
      social: 0,
    };
    for (const item of items) {
      map[item.category] = (map[item.category] ?? 0) + 1;
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const cleanQ = query.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (onlyWithPoster && !item.imageUrl) return false;
      if (onlyWithLink && !item.externalUrl) return false;
      if (!cleanQ) return true;
      return (
        item.title.toLowerCase().includes(cleanQ) ||
        item.body.toLowerCase().includes(cleanQ) ||
        item.authorName.toLowerCase().includes(cleanQ) ||
        categoryLabel(item.category).toLowerCase().includes(cleanQ) ||
        (item.externalUrl?.toLowerCase().includes(cleanQ) ?? false)
      );
    });
  }, [items, categoryFilter, onlyWithPoster, onlyWithLink, query]);

  const featuredItems = useMemo(
    () => items.filter((item) => item.featured && !item.isScheduled),
    [items],
  );

  const posterCount = useMemo(
    () => items.filter((item) => Boolean(item.imageUrl)).length,
    [items],
  );

  const linkCount = useMemo(
    () => items.filter((item) => Boolean(item.externalUrl)).length,
    [items],
  );

  const kpiStats = useMemo(() => {
    const publishedCount = items.filter((i) => !i.isScheduled).length;
    const scheduledCount = items.filter((i) => i.isScheduled).length;
    const withLinkCount = items.filter((i) => Boolean(i.externalUrl)).length;
    const featuredCount = items.filter((i) => i.featured).length;
    const totalViews = items.reduce((sum, i) => sum + i.viewsCount, 0);
    const totalClicks = items.reduce((sum, i) => sum + i.linkClicksCount, 0);
    const viewsOnLinked = items
      .filter((i) => Boolean(i.externalUrl))
      .reduce((sum, i) => sum + i.viewsCount, 0);
    const clicksOnLinked = items
      .filter((i) => Boolean(i.externalUrl))
      .reduce((sum, i) => sum + i.linkClicksCount, 0);
    const ctrPct =
      viewsOnLinked > 0 ? Math.min(100, (clicksOnLinked / viewsOnLinked) * 100) : null;
    return {
      publishedCount,
      scheduledCount,
      withLinkCount,
      featuredCount,
      totalViews,
      totalClicks,
      viewsOnLinked,
      clicksOnLinked,
      ctrPct,
    };
  }, [items]);

  const kpiRankedItems = useMemo(() => {
    const base = kpiLinksOnly ? items.filter((i) => Boolean(i.externalUrl)) : items;
    return [...base].sort((a, b) => {
      if (b.linkClicksCount !== a.linkClicksCount) {
        return b.linkClicksCount - a.linkClicksCount;
      }
      if (b.viewsCount !== a.viewsCount) {
        return b.viewsCount - a.viewsCount;
      }
      return b.publishAtIso.localeCompare(a.publishAtIso);
    });
  }, [items, kpiLinksOnly]);

  const maxKpiClicks = useMemo(
    () => Math.max(1, ...kpiRankedItems.map((i) => i.linkClicksCount)),
    [kpiRankedItems],
  );

  const selectedIndex = useMemo(
    () => (selectedId ? filtered.findIndex((item) => item.id === selectedId) : -1),
    [filtered, selectedId],
  );

  const selectedItem = useMemo(
    () => (selectedId ? items.find((item) => item.id === selectedId) ?? null : null),
    [items, selectedId],
  );

  const relatedItems = useMemo(() => {
    if (!selectedItem) return [];
    return items
      .filter((item) => item.id !== selectedItem.id && item.category === selectedItem.category)
      .slice(0, 3);
  }, [items, selectedItem]);

  const isFiltering = Boolean(
    query.trim() || categoryFilter !== "all" || onlyWithPoster || onlyWithLink,
  );

  function updateCarouselState() {
    const el = carouselRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 12);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 12);
  }

  useEffect(() => {
    updateCarouselState();
    window.addEventListener("resize", updateCarouselState);
    return () => window.removeEventListener("resize", updateCarouselState);
  }, [featuredItems.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (formModal) {
        if (event.key === "Escape") {
          setFormModal(null);
        }
        return;
      }
      if (!selectedItem) return;
      if (event.key === "Escape") {
        setSelectedId(null);
      } else if (event.key === "ArrowRight" && selectedIndex >= 0 && selectedIndex < filtered.length - 1) {
        openComunicado(filtered[selectedIndex + 1].id);
      } else if (event.key === "ArrowLeft" && selectedIndex > 0) {
        openComunicado(filtered[selectedIndex - 1].id);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [formModal, selectedItem, selectedIndex, filtered, openComunicado]);

  function scrollCarousel(dir: number) {
    carouselRef.current?.scrollBy({ left: dir * 360, behavior: "smooth" });
  }

  function clearFilters() {
    setQuery("");
    setCategoryFilter("all");
    setOnlyWithPoster(false);
    setOnlyWithLink(false);
  }

  const visibleKpiRows = kpiShowAll ? kpiRankedItems : kpiRankedItems.slice(0, 6);

  return (
    <div className="board-page">
      {/* Cabecera y barra de búsqueda interactiva */}
      <section className="edition-header">
        <div className="edition-rule flex flex-wrap items-end justify-between gap-4">
          <h1 className="edition-title">Comunicados</h1>

          {canCreate && (
            <button
              type="button"
              onClick={() => setFormModal({ mode: "create" })}
              className={btn}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M10 4v12M4 10h12" strokeLinecap="round" />
              </svg>
              Publicar comunicado
            </button>
          )}
        </div>

        {/* Buscador diseñado con filtros integrados */}
        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <CatalogSearch value={query} onChange={setQuery} label="Buscar comunicados" shortcutEnabled={!formModal && !selectedItem} />

          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filtrar por categoría">
            <button
              type="button"
              role="tab"
              aria-selected={categoryFilter === "all"}
              onClick={() => setCategoryFilter("all")}
              className="catalog-tab"
            >
              <span>Todos</span>
              <small>{counts.all}</small>
            </button>

            {(["tramites", "academico", "social"] as const).map((cat) => {
              const st = CATEGORY_STYLES[cat];
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategoryFilter(active ? "all" : cat)}
                  className="catalog-tab"
                >
                  {st.icon}
                  <span>{categoryLabel(cat)}</span>
                  <small>{counts[cat]}</small>
                </button>
              );
            })}

            <button
              type="button"
              aria-pressed={onlyWithPoster}
              onClick={() => setOnlyWithPoster((v) => !v)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-sm border px-3 py-2 text-xs font-extrabold transition duration-150 ${
                onlyWithPoster
                  ? "border-[#004d73] bg-[#e6f3fa] text-[#004d73]"
                  : "border-[#d4d7ce] bg-white text-[#4b6470] hover:border-[#9eb9c6] hover:bg-[#f2f7f9]"
              }`}
            >
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                <circle cx="7" cy="8" r="1.3" />
                <path d="m4.5 14 4-3.5 3 2.5 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Con cartel ({posterCount})
            </button>

            {linkCount > 0 && (
              <button
                type="button"
                aria-pressed={onlyWithLink}
                onClick={() => setOnlyWithLink((v) => !v)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-sm border px-3 py-2 text-xs font-extrabold transition duration-150 ${
                  onlyWithLink
                    ? "border-[#004d73] bg-[#e6f3fa] text-[#004d73]"
                    : "border-[#d4d7ce] bg-white text-[#4b6470] hover:border-[#9eb9c6] hover:bg-[#f2f7f9]"
                }`}
              >
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M11 4h5v5M16 4 9 11" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M14 11.5V15a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 3 15V7.5A1.5 1.5 0 0 1 4.5 6H8" strokeLinecap="round" />
                </svg>
                Con enlace ({linkCount})
              </button>
            )}

            {isFiltering && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-10 items-center gap-1 rounded-sm border border-[#d6c5c2] bg-[#fdf5f4] px-3 py-2 text-xs font-extrabold text-[#8C1D18] transition hover:bg-[#fae6e4]"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      </section>

      {/* KPIs exclusivos del rol Comunicación */}
      {showKpis && (
        <section
          aria-labelledby="comunicacion-kpis-heading"
          className="rounded-sm border border-[#c9d7de] border-t-4 border-t-[#15394d] bg-[#fffdf7] p-5 shadow-xs sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#bcd4e0] bg-[#e9f3f8] text-[#004d73]">
                <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M3.5 16.5h13M5.5 13.5v-4M10 13.5v-8M14.5 13.5v-5.5" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <h2 id="comunicacion-kpis-heading" className="text-base font-extrabold tracking-tight text-[#14374a] sm:text-lg">
                  KPIs de Comunicación
                </h2>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!kpiExpanded && (
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#385360]">
                  <span className="rounded-md border border-[#d9e2e7] bg-white px-2.5 py-1">
                    {kpiStats.totalViews} aperturas
                  </span>
                  <span className="rounded-md border border-[#d9e2e7] bg-white px-2.5 py-1">
                    {kpiStats.totalClicks} clics en enlaces
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setKpiExpanded((v) => !v)}
                className="rounded-lg border border-[#cdd6da] bg-white px-3 py-1.5 text-xs font-extrabold text-[#16384a] transition hover:border-[#006699] hover:bg-[#eef5f9]"
              >
                {kpiExpanded ? "Ocultar KPIs" : "Ver KPIs"}
              </button>
            </div>
          </div>

          {kpiExpanded && (
            <div className="mt-4 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-sm border border-[#dcd9ce] bg-white p-4">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#556a74]">
                    Comunicados activos
                  </p>
                  <p className="mt-1.5 text-2xl font-extrabold text-[#14374a]">
                    {kpiStats.publishedCount}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
                    <span className="rounded bg-[#eef4f7] px-2 py-0.5 text-[#004d73]">
                      {kpiStats.withLinkCount} con enlace
                    </span>
                    {kpiStats.featuredCount > 0 && (
                      <span className="rounded bg-[#fdf5df] px-2 py-0.5 text-[#6e5008]">
                        {kpiStats.featuredCount} destacados
                      </span>
                    )}
                    {kpiStats.scheduledCount > 0 && (
                      <span className="rounded bg-[#f2f1e8] px-2 py-0.5 text-[#4a5c66]">
                        {kpiStats.scheduledCount} programados
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-sm border border-[#dcd9ce] bg-white p-4">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#556a74]">
                    Aperturas totales
                  </p>
                  <p className="mt-1.5 text-2xl font-extrabold text-[#004d73]">
                    {kpiStats.totalViews}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-[#556a74]">
                    {activity7d.views7d} en los últimos 7 días
                  </p>
                </div>

                <div className="rounded-sm border border-[#dcd9ce] bg-white p-4">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#556a74]">
                    Clics en enlaces
                  </p>
                  <p className="mt-1.5 text-2xl font-extrabold text-[#1b6b55]">
                    {kpiStats.totalClicks}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-[#556a74]">
                    {activity7d.clicks7d} en los últimos 7 días
                  </p>
                </div>

                <div className="rounded-sm border border-[#dcd9ce] bg-white p-4">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#556a74]">
                    Tasa de clics (CTR)
                  </p>
                  <p className="mt-1.5 text-2xl font-extrabold text-[#8d6710]">
                    {kpiStats.ctrPct !== null ? `${kpiStats.ctrPct.toFixed(1)} %` : "—"}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-[#556a74]">
                    {kpiStats.clicksOnLinked} clics / {kpiStats.viewsOnLinked} aperturas con enlace
                  </p>
                </div>
              </div>

              {kpiRankedItems.length > 0 && (
                <div className="overflow-hidden rounded-sm border border-[#dcd9ce] bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eae7dc] bg-[#faf8f0] px-4 py-2.5">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-[#385360]">
                      Desglose por comunicado
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setKpiLinksOnly((v) => !v)}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-extrabold transition ${
                          kpiLinksOnly
                            ? "border-[#004d73] bg-[#006699] text-white"
                            : "border-[#d4d7ce] bg-white text-[#385360] hover:border-[#006699]"
                        }`}
                      >
                        {kpiLinksOnly ? "Solo con enlace ✓" : "Solo con enlace"}
                      </button>
                      {kpiRankedItems.length > 6 && (
                        <button
                          type="button"
                          onClick={() => setKpiShowAll((v) => !v)}
                          className="rounded-md border border-[#d4d7ce] bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#385360] hover:border-[#006699]"
                        >
                          {kpiShowAll ? "Ver top 6" : `Ver todos (${kpiRankedItems.length})`}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#eae7dc] text-[11px] font-extrabold uppercase tracking-wide text-[#5d717b]">
                          <th className="px-4 py-2.5">Comunicado</th>
                          <th className="px-3 py-2.5">Enlace</th>
                          <th className="px-3 py-2.5 text-right">Aperturas</th>
                          <th className="px-3 py-2.5 text-right">Clics</th>
                          <th className="px-3 py-2.5 text-right">CTR</th>
                          <th className="px-4 py-2.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f0ede3]">
                        {visibleKpiRows.map((item) => {
                          const st = CATEGORY_STYLES[item.category];
                          const ctr =
                            item.externalUrl && item.viewsCount > 0
                              ? `${Math.min(100, (item.linkClicksCount / item.viewsCount) * 100).toFixed(1)} %`
                              : "—";
                          const barWidth =
                            item.linkClicksCount > 0
                              ? Math.max(8, Math.round((item.linkClicksCount / maxKpiClicks) * 100))
                              : 0;

                          return (
                            <tr key={item.id} className="hover:bg-[#faf9f4]">
                              <td className="max-w-xs px-4 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => openComunicado(item.id)}
                                  className="line-clamp-1 text-left font-extrabold text-[#15394d] hover:text-[#006699] hover:underline"
                                >
                                  {item.title}
                                </button>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded border ${st.badgeBorder} ${st.badgeBg} px-1.5 py-0.5 text-[10px] font-extrabold ${st.badgeText}`}
                                  >
                                    {categoryLabel(item.category)}
                                  </span>
                                  {item.isScheduled && (
                                    <span className="rounded border border-[#d6d3c6] bg-[#f4f3ed] px-1.5 py-0.5 text-[10px] font-bold text-[#4e626d]">
                                      Programado · {item.publishDateFormatted}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                {item.externalUrl ? (
                                  <a
                                    href={item.externalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => {
                                      void trackAvisoInteraction(item.id, "click").then((counts) => {
                                        applyServerCounts(item.id, "click", counts);
                                      });
                                    }}
                                    className="inline-flex items-center gap-1 font-bold text-[#006699] hover:underline"
                                  >
                                    <span className="max-w-[11rem] truncate">{linkDomain(item.externalUrl)}</span>
                                    <span aria-hidden="true">↗</span>
                                  </a>
                                ) : (
                                  <span className="text-[#8a99a1]">Sin enlace</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold text-[#16384a]">
                                {item.viewsCount}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="inline-flex flex-col items-end gap-1">
                                  <span className="font-extrabold text-[#1b6b55]">
                                    {item.linkClicksCount}
                                  </span>
                                  {barWidth > 0 && (
                                    <span className="block h-1.5 w-16 overflow-hidden rounded-full bg-[#e6efe9]">
                                      <span
                                        className="block h-full rounded-full bg-[#1b6b55]"
                                        style={{ width: `${barWidth}%` }}
                                      />
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold text-[#6e5008]">
                                {ctr}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {item.canEditOrDelete && (
                                  <button
                                    type="button"
                                    onClick={() => setFormModal({ mode: "edit", item })}
                                    className="rounded-md border border-[#d6d9d0] bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#16384a] transition hover:border-[#006699] hover:text-[#006699]"
                                  >
                                    Editar
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Vitrina de comunicados destacados (cuando no se está filtrando por texto) */}
      {!query.trim() && featuredItems.length > 0 && (
        <section className="min-w-0" aria-labelledby="destacados-heading">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="destacados-heading" className="text-lg font-extrabold tracking-tight text-[#15394d] sm:text-xl">
              Destacados
            </h2>
            <span className="font-mono text-xs text-[#53656c]">{featuredItems.length}</span>
          </div>

          <div className="relative">
            <div
              ref={carouselRef}
              onScroll={updateCarouselState}
              className="flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto pb-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {featuredItems.map((item) => (
                <button key={item.id} type="button" onClick={() => openComunicado(item.id)}
                  className="group flex w-[min(84%,23rem)] shrink-0 snap-start flex-col border-t-2 border-[#264b58] bg-[#fffdf7] text-left sm:w-[calc((100%-2rem)/3)]">
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt="" onLoad={updateCarouselState}
                      className="aspect-[2/1] w-full bg-[#eeece3] object-contain" />
                  )}
                  <div className="w-full p-4">
                    <p className="flex flex-wrap justify-between gap-2 text-xs text-[#53656c]">
                      <span className={`font-semibold ${CATEGORY_STYLES[item.category].badgeText}`}>{categoryLabel(item.category)}</span>
                      <time dateTime={item.publishAtIso}>{item.publishDateFormatted}</time>
                    </p>
                    <h3 className="mt-2 text-xl leading-tight font-bold text-[#213d49] group-hover:underline decoration-1 underline-offset-4 sm:text-2xl">{item.title}</h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[#4c6068]">{item.body}</p>
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              aria-label="Anterior"
              disabled={!canScrollLeft}
              onClick={() => scrollCarousel(-1)}
              className="board-carousel-nav board-carousel-nav--left"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12.5 4.5L7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button
              type="button"
              aria-label="Siguiente"
              disabled={!canScrollRight}
              onClick={() => scrollCarousel(1)}
              className="board-carousel-nav board-carousel-nav--right"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7.5 4.5L13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </section>
      )}

      {/* Mural de Comunicados a ancho completo (sin asides de trámites/guías) */}
      <div>
        {filtered.length === 0 ? (
          <div className="aviso-animate-in rounded-sm border border-[#dcd9ce] bg-[#fffdf7] p-8 text-center shadow-xs">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-sm bg-[#eaf3f6] text-[#006699]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="7" />
                <path d="m16.2 16.2 4.3 4.3" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="mt-3 text-lg font-extrabold text-[#16384a]">
              No encontramos comunicados con ese criterio
            </h2>
            {isFiltering && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-sm border border-[#c5d6de] bg-white px-4 py-2 text-xs font-extrabold text-[#16384a] transition hover:bg-[#eef4f6]"
                >
                  Ver todos los comunicados
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item, idx) => {
              const st = CATEGORY_STYLES[item.category];
              const isHeroSpan = idx === 0 && filtered.length >= 3 && !isFiltering;

              return (
                <article
                  key={item.id}
                  style={{ animationDelay: `${Math.min(idx * 45, 270)}ms` }}
                  className={`aviso-animate-in group flex flex-col justify-between overflow-hidden rounded-sm border border-[#d7d5c8] border-t-[3px] ${st.topBorder} bg-[#fffefa] transition-colors hover:border-[#7b98a3] ${
                    isHeroSpan ? "md:col-span-2" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openComunicado(item.id)}
                    className={`flex flex-1 flex-col text-left focus:outline-none ${
                      isHeroSpan && item.imageUrl ? "lg:flex-row lg:items-stretch" : ""
                    }`}
                  >
                    {item.imageUrl && (
                      <div
                        className={`relative overflow-hidden bg-[#13232e] ${
                          isHeroSpan
                            ? "max-h-80 w-full lg:max-h-none lg:w-5/12 lg:shrink-0"
                            : "h-56 w-full"
                        }`}
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
                        />
                      </div>
                    )}

                    <div className="flex flex-1 flex-col justify-between p-5 sm:p-6">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-md border ${st.badgeBorder} ${st.badgeBg} px-2.5 py-0.5 text-xs font-extrabold ${st.badgeText}`}
                            >
                              {st.icon}
                              {categoryLabel(item.category)}
                            </span>
                            {!item.isPublic && (
                              <span className="rounded-md border border-[#e6d39a] bg-[#fdf6df] px-2.5 py-0.5 text-xs font-extrabold text-[#6e5008]">
                                Comunidad ESCOM
                              </span>
                            )}
                            {item.isScheduled && (
                              <span className="rounded-md border border-[#cdd5d9] bg-[#eef3f5] px-2.5 py-0.5 text-xs font-extrabold text-[#385360]">
                                Programado
                              </span>
                            )}
                          </div>

                          <time
                            dateTime={item.publishAtIso}
                            className="text-xs font-semibold text-[#5d717b]"
                          >
                            {item.publishDateFormatted} · {item.publishTimeFormatted}
                          </time>
                        </div>

                        <h3
                          className={`mt-3 font-extrabold leading-snug text-[#15394d] transition group-hover:text-[#006699] ${
                            isHeroSpan ? "text-2xl sm:text-3xl" : "text-xl"
                          }`}
                        >
                          {item.title}
                        </h3>

                        <p
                          className={`mt-2.5 whitespace-pre-line text-sm leading-relaxed text-[#425660] ${
                            isHeroSpan ? "line-clamp-4 sm:text-[15px]" : "line-clamp-3"
                          }`}
                        >
                          {item.body}
                        </p>
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-[#eae7dc] pt-3.5 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[#c5d6de] bg-[#e9f2f5] text-[11px] font-extrabold text-[#004d73]">
                            {item.authorName.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="truncate font-bold text-[#35505e]">
                            {item.authorName}
                          </span>
                        </div>

                        <span className="inline-flex shrink-0 items-center gap-1 font-extrabold text-[#006699] transition group-hover:translate-x-0.5">
                          Ver comunicado
                          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </button>

                  {(item.externalUrl || item.canEditOrDelete) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-[#eae7dc] bg-[#faf8f0] px-5 py-2.5">
                      <div>
                        {item.externalUrl && (
                          <AvisoExternalLink
                            avisoId={item.id}
                            url={item.externalUrl}
                            compact
                            onClickTracked={(counts) => applyServerCounts(item.id, "click", counts)}
                          />
                        )}
                      </div>

                      {item.canEditOrDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFormModal({ mode: "edit", item });
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#d6d9d0] bg-white px-2.5 py-1 text-xs font-extrabold text-[#16384a] transition hover:border-[#006699] hover:text-[#006699]"
                        >
                          Editar
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Ventana flotante / Popup del Comunicado */}
      {selectedItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="comunicado-popup-title"
          className="aviso-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-xs sm:p-5"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="aviso-modal-panel relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-sm border border-[#dcd9ce] bg-[#fffdf7] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Barra superior del modal */}
            <div className="flex items-center justify-between gap-3 border-b border-[#e7e4d9] bg-[#faf8f0] px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#c5d6de] bg-[#e9f2f5] text-sm font-extrabold text-[#004d73]">
                  {selectedItem.authorName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-[#16384b]">
                    {selectedItem.authorName}
                  </p>
                  <p className="text-xs text-[#5d717b]">
                    {selectedItem.publishDateFormatted} · {selectedItem.publishTimeFormatted}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {selectedIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => openComunicado(filtered[selectedIndex - 1].id)}
                    aria-label="Comunicado anterior"
                    title="Comunicado anterior (←)"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6d9d0] bg-white text-[#35505e] transition hover:border-[#006699] hover:bg-[#eef3f5]"
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
                {selectedIndex >= 0 && selectedIndex < filtered.length - 1 && (
                  <button
                    type="button"
                    onClick={() => openComunicado(filtered[selectedIndex + 1].id)}
                    aria-label="Siguiente comunicado"
                    title="Siguiente comunicado (→)"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6d9d0] bg-white text-[#35505e] transition hover:border-[#006699] hover:bg-[#eef3f5]"
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Cerrar comunicado"
                  onClick={() => setSelectedId(null)}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6d9d0] bg-white text-sm font-extrabold text-[#35505e] transition hover:border-[#8C1D18] hover:bg-[#fdf3f2] hover:text-[#8C1D18]"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Contenido del comunicado */}
            <div className="space-y-6 overflow-y-auto p-5 sm:p-7">
              {selectedItem.imageUrl && (
                <div className="flex justify-center overflow-hidden rounded-sm border border-[#dcd9ce] bg-[#111b22]">
                  <img
                    src={selectedItem.imageUrl}
                    alt={selectedItem.title}
                    className="max-h-[58vh] w-auto object-contain"
                  />
                </div>
              )}

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border ${CATEGORY_STYLES[selectedItem.category].badgeBorder} ${CATEGORY_STYLES[selectedItem.category].badgeBg} px-2.5 py-1 text-xs font-extrabold ${CATEGORY_STYLES[selectedItem.category].badgeText}`}
                  >
                    {CATEGORY_STYLES[selectedItem.category].icon}
                    {categoryLabel(selectedItem.category)}
                  </span>
                  {!selectedItem.isPublic && (
                    <span className="rounded-md border border-[#e6d39a] bg-[#fdf6df] px-2.5 py-1 text-xs font-extrabold text-[#6e5008]">
                      Solo comunidad autenticada
                    </span>
                  )}
                  {selectedItem.isScheduled && (
                    <span className="rounded-md border border-[#cdd5d9] bg-[#eef3f5] px-2.5 py-1 text-xs font-extrabold text-[#385360]">
                      Programado
                    </span>
                  )}
                </div>

                <h2
                  id="comunicado-popup-title"
                  className="text-2xl font-extrabold leading-tight text-[#14374a] sm:text-3xl"
                >
                  {selectedItem.title}
                </h2>

                <div className="whitespace-pre-wrap text-[15px] leading-7 text-[#2f4550]">
                  {selectedItem.body}
                </div>

                {selectedItem.externalUrl && (
                  <div className="pt-1">
                    <AvisoExternalLink
                      avisoId={selectedItem.id}
                      url={selectedItem.externalUrl}
                      onClickTracked={(counts) =>
                        applyServerCounts(selectedItem.id, "click", counts)
                      }
                    />
                  </div>
                )}
              </div>

              {/* Formatos de difusión en redes (si existen en el registro) */}
              {(selectedItem.socialTwitter || selectedItem.socialFacebook || selectedItem.socialCopy) && (
                <div className="space-y-3 rounded-sm border border-[#d6e2e8] bg-[#f4f9fb] p-4">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#004d73]">
                    Síntesis para difusión
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedItem.socialTwitter && (
                      <div className="rounded-lg border border-[#dce7ec] bg-white p-3">
                        <p className="text-[11px] font-extrabold uppercase text-[#006699]">Twitter / X</p>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[#425660]">
                          {selectedItem.socialTwitter}
                        </p>
                      </div>
                    )}
                    {selectedItem.socialFacebook && (
                      <div className="rounded-lg border border-[#dce7ec] bg-white p-3">
                        <p className="text-[11px] font-extrabold uppercase text-[#006699]">Facebook</p>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[#425660]">
                          {selectedItem.socialFacebook}
                        </p>
                      </div>
                    )}
                  </div>
                  {!selectedItem.socialTwitter && !selectedItem.socialFacebook && selectedItem.socialCopy && (
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-[#425660]">
                      {selectedItem.socialCopy}
                    </p>
                  )}
                </div>
              )}

              {/* Otros comunicados relacionados de la misma categoría */}
              {relatedItems.length > 0 && (
                <div className="border-t border-[#e7e4d9] pt-5">
                  <p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[#586d77]">
                    Más en {categoryLabel(selectedItem.category)}
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    {relatedItems.map((rel) => (
                      <button
                        key={rel.id}
                        type="button"
                        onClick={() => openComunicado(rel.id)}
                        className="rounded-sm border border-[#e2e0d4] bg-white p-3 text-left transition hover:border-[#006699] hover:bg-[#f5fafc]"
                      >
                        <p className="text-[11px] font-semibold text-[#5d717b]">
                          {rel.publishDateFormatted}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs font-extrabold text-[#16384a]">
                          {rel.title}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Barra inferior de acciones para Comunicación */}
              {selectedItem.canEditOrDelete && (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e7e4d9] pt-4">
                  <button
                    type="button"
                    onClick={() => setFormModal({ mode: "edit", item: selectedItem })}
                    className="inline-flex items-center rounded-sm border border-[#d6d9d0] bg-white px-3.5 py-2 text-xs font-bold text-[#385360] transition hover:border-[#006699] hover:text-[#004d73]"
                  >
                    Editar
                  </button>
                  <DeleteAviso
                    id={selectedItem.id}
                    onDeleted={() => {
                      setSelectedId(null);
                      router.refresh();
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ventana flotante / Popup para Publicar o Editar comunicado */}
      {formModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="aviso-form-modal-title"
          className="aviso-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-xs sm:p-5"
          onClick={() => setFormModal(null)}
        >
          <div
            className="aviso-modal-panel relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-sm border border-[#dcd9ce] bg-[#fffdf7] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#e7e4d9] bg-[#faf8f0] px-5 py-3.5">
              <h2 id="aviso-form-modal-title" className="text-base font-extrabold text-[#14374a] sm:text-lg">
                {formModal.mode === "create" ? "Publicar comunicado" : "Editar comunicado"}
              </h2>
              <button
                type="button"
                aria-label="Cerrar formulario"
                onClick={() => setFormModal(null)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6d9d0] bg-white text-sm font-extrabold text-[#35505e] transition hover:border-[#8C1D18] hover:bg-[#fdf3f2] hover:text-[#8C1D18]"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto p-5 sm:p-6">
              {formModal.mode === "create" ? (
                <AvisoForm
                  key="create-aviso"
                  action={crearAviso}
                  submitLabel="Publicar comunicado"
                  stayOnPage
                  onCancel={() => setFormModal(null)}
                  onSuccess={() => {
                    setFormModal(null);
                    router.refresh();
                  }}
                  initial={{
                    title: "",
                    body: "",
                    category: "academico",
                    featured: false,
                    isPublic: true,
                    publishAt: defaultPublishAt,
                    externalUrl: "",
                    socialCopy: "",
                    socialTwitter: "",
                    socialFacebook: "",
                  }}
                />
              ) : (
                <AvisoForm
                  key={`edit-aviso-${formModal.item.id}`}
                  action={actualizarAviso}
                  submitLabel="Guardar cambios"
                  stayOnPage
                  onCancel={() => setFormModal(null)}
                  onSuccess={() => {
                    setFormModal(null);
                    router.refresh();
                  }}
                  initial={{
                    id: formModal.item.id,
                    title: formModal.item.title,
                    body: formModal.item.body,
                    category: formModal.item.category,
                    featured: formModal.item.featured,
                    isPublic: formModal.item.isPublic,
                    publishAt: formModal.item.publishAtLocal,
                    externalUrl: formModal.item.externalUrl ?? "",
                    socialCopy: formModal.item.socialCopy ?? "",
                    socialTwitter: formModal.item.socialTwitter ?? "",
                    socialFacebook: formModal.item.socialFacebook ?? "",
                    imageUrl: formModal.item.imageUrl,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
