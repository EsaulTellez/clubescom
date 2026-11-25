"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function RealtimeRefresh({ tables, refreshAt }: { tables: string[]; refreshAt?: number }) {
  const router = useRouter();
  const tableKey = tables.join(",");

  useEffect(() => {
    if (refreshAt === undefined) return;
    const timer = window.setTimeout(() => router.refresh(), Math.max(0, refreshAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [router, refreshAt]);

  useEffect(() => {
    if (!tableKey) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`page-refresh:${tableKey}`);
    for (const table of tableKey.split(",")) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          window.dispatchEvent(new CustomEvent("escom:realtime-update", { detail: { table } }));
          router.refresh();
        },
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, tableKey]);

  return null;
}
