"use client";

import { useEffect, useRef, useState } from "react";
import { AvisoExternalLink, trackAvisoInteraction } from "@/components/aviso-external-link";

export type StoryCard = {
  id: string;
  title: string;
  summary: string;
  dateLabel: string;
  author: string;
  image: string;
  externalUrl?: string | null;
};

export function StoryCarousel({ items }: { items: StoryCard[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(items.length > 1);
  const [selected, setSelected] = useState<StoryCard | null>(null);

  function updateScrollState() {
    const el = scroller.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 12);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 12);
  }

  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [items.length]);

  useEffect(() => {
    if (!selected) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  function move(direction: number) {
    scroller.current?.scrollBy({ left: direction * 340, behavior: "smooth" });
  }

  if (items.length === 0) return null;

  return (
    <>
      <div className="relative">
        <div
          ref={scroller}
          onScroll={updateScrollState}
          className="flex snap-x snap-mandatory items-stretch gap-3.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSelected(item);
                trackAvisoInteraction(item.id, "view");
              }}
              className="group flex w-56 shrink-0 snap-start flex-col overflow-hidden rounded-sm border border-[#d6d3c6] bg-[#10212b] text-left sm:w-64"
            >
              <div className="relative h-52 w-full overflow-hidden bg-[#0c1a23]">
                <img
                  src={item.image}
                  alt={item.title}
                  onLoad={updateScrollState}
                  className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <div className="flex flex-1 flex-col justify-between border-t border-white/10 bg-[#12232e] p-3.5 text-white">
                <div>
                  <p className="text-[11px] font-semibold text-[#9fc5d8]">{item.dateLabel}</p>
                  <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-white">
                    {item.title}
                  </h3>
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-white/75">
                  {item.summary}
                </p>
              </div>
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-label="Anterior"
          disabled={!canScrollLeft}
          onClick={() => move(-1)}
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
          onClick={() => move(1)}
          className="board-carousel-nav board-carousel-nav--right"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7.5 4.5L13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="comunicado-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-sm border border-[#dcd9ce] bg-[#fffdf7] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#e7e4d9] px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-[#16384b]">{selected.author}</p>
                <p className="text-xs text-[#647780]">{selected.dateLabel}</p>
              </div>
              <button
                type="button"
                aria-label="Cerrar comunicado"
                onClick={() => setSelected(null)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#d6d9d0] bg-white text-sm font-bold text-[#35505e] hover:bg-[#eef3f5]"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-4">
              <div className="flex justify-center overflow-hidden rounded-sm bg-[#111b22]">
                <img
                  src={selected.image}
                  alt={selected.title}
                  className="max-h-[56vh] w-auto object-contain"
                />
              </div>
              <h2 id="comunicado-modal-title" className="text-xl font-extrabold text-[#15394d]">
                {selected.title}
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#3f525c]">
                {selected.summary}
              </p>
              {selected.externalUrl && (
                <div className="pt-1">
                  <AvisoExternalLink avisoId={selected.id} url={selected.externalUrl} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
