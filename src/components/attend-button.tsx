"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AttendButton({
  eventKind,
  eventId,
  initialAttending,
  initialCount,
  isAuthenticated,
  compact = false,
}: {
  eventKind: "space" | "club";
  eventId: string;
  initialAttending: boolean;
  initialCount: number;
  isAuthenticated: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [attending, setAttending] = useState(initialAttending);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!isAuthenticated) {
      router.push("/entrar");
      return;
    }
    if (busy) return;
    setBusy(true);
    const nextAttending = !attending;
    setAttending(nextAttending);
    setCount((c) => Math.max(0, c + (nextAttending ? 1 : -1)));

    try {
      const res = await fetch("/api/events/attend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKind, eventId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { attending: boolean; attendeesCount: number };
        setAttending(data.attending);
        setCount(data.attendeesCount);
        router.refresh();
      } else {
        setAttending(!nextAttending);
        setCount(initialCount);
      }
    } catch {
      setAttending(!nextAttending);
      setCount(initialCount);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={
        compact
          ? `inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-extrabold transition ${
              attending
                ? "border-[#004d73] bg-[#006699] text-white"
                : "border-[#c7d6de] bg-white text-[#173c4f] hover:border-[#006699] hover:bg-[#eaf4f8]"
            }`
          : `inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-xs font-extrabold transition ${
              attending
                ? "border-[#004d73] bg-[#006699] text-white shadow-xs"
                : "border-[#b8ced9] bg-white text-[#004d73] hover:border-[#006699] hover:bg-[#eaf4f8]"
            }`
      }
    >
      <span>{attending ? "✓ Asistiré" : "Asistiré"}</span>
      <span
        className={`rounded px-1.5 py-0.5 text-[11px] leading-none ${
          attending ? "bg-white/20 text-white" : "bg-[#edf3f5] text-[#284d5e]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
