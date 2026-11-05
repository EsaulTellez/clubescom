"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function RealtimeRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  const tableKey = tables.join(",");

  useEffect(() => {
    if (!tableKey) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`page-refresh:${tableKey}`);
    for (const table of tableKey.split(",")) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => router.refresh(),
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, tableKey]);

  return null;
}
