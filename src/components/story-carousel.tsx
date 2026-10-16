"use client";

import Link from "next/link";
import { useRef } from "react";
import { Cover } from "./cover";

export type StoryCard = {
  href: string;
  title: string;
  kicker: string;
  tone: string;
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
            className="w-[17.5rem] shrink-0 snap-start"
          >
            <Cover
              tone={item.tone}
              kicker={item.kicker}
              title={item.title}
              className="h-52 rounded-2xl shadow-[0_12px_30px_rgba(17,24,39,0.12)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(17,24,39,0.16)]"
            />
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
