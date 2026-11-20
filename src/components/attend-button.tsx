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
  const [override, setOverride] = useState<{
    baseAttending: boolean;
    baseCount: number;
    attending: boolean;
    count: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const activeOverride =
    override &&
    override.baseAttending === initialAttending &&
    override.baseCount === initialCount
      ? override
      : null;

  const attending = activeOverride?.attending ?? initialAttending;
  const count = activeOverride?.count ?? initialCount;

  async function toggle() {
    if (!isAuthenticated) {
      router.push("/entrar");
      return;
    }
    if (busy) return;
    setBusy(true);
    const prevAttending = attending;
    const prevCount = count;
    const nextAttending = !prevAttending;
    const nextCount = Math.max(0, prevCount + (nextAttending ? 1 : -1));
    setOverride({
      baseAttending: initialAttending,
      baseCount: initialCount,
      attending: nextAttending,
      count: nextCount,
    });

    try {
      const res = await fetch("/api/events/attend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKind, eventId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { attending: boolean; attendeesCount: number };
        setOverride({
          baseAttending: initialAttending,
          baseCount: initialCount,
          attending: data.attending,
          count: data.attendeesCount,
        });
        router.refresh();
      } else {
        setOverride({
          baseAttending: initialAttending,
          baseCount: initialCount,
          attending: prevAttending,
          count: prevCount,
        });
      }
    } catch {
      setOverride({
        baseAttending: initialAttending,
        baseCount: initialCount,
        attending: prevAttending,
        count: prevCount,
      });
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
