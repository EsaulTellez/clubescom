"use client";

import Link from "next/link";
import { useRef } from "react";
import { Cover } from "./cover";

export type StoryCard = {
  href: string;
  title: string;
  kicker: string;
  tone: string;
  image?: string | null;
};

export function StoryCarousel({ items }: { items: StoryCard[] }) {
  const scroller = useRef<HTMLDivElement>(null);

  function move(direction: number) {
    scroller.current?.scrollBy({ left: direction * 280, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={scroller}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <Link
            key={item.href + item.title}
            href={item.href}
            className="w-48 shrink-0 snap-start sm:w-56"
          >
            {item.image ? (
              <div className="group relative grid h-56 place-items-center overflow-hidden rounded-[26px] border border-white/80 bg-white p-2 shadow-[0_12px_30px_rgba(40,38,80,0.12)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(40,38,80,0.18)]">
                <img src={item.image} alt={`Cartel: ${item.title}`} className="h-full w-full rounded-[19px] object-contain" />
                <span className="absolute bottom-3 left-3 rounded-full bg-[#202235]/85 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur">{item.kicker}</span>
              </div>
            ) : (
              <Cover
                tone={item.tone}
                kicker={item.kicker}
                title={item.title}
                className="h-56 rounded-[26px] shadow-[0_12px_30px_rgba(40,38,80,0.12)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(40,38,80,0.18)]"
              />
            )}
          </Link>
        ))}
      </div>
      <button
        type="button"
        aria-label="Siguiente"
        onClick={() => move(1)}
        className="absolute -right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-[#e6e8ee] bg-white text-[#17191e] shadow-md sm:grid"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 4l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
