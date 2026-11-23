"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/loading-ui";

export function AutoRedirect({
  to = "/",
  delayMs = 2500,
}: {
  to?: string;
  delayMs?: number;
}) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(Math.max(1, Math.ceil(delayMs / 1000)));

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    const timeout = setTimeout(() => {
      router.replace(to);
      router.refresh();
    }, delayMs);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [delayMs, router, to]);

  return (
    <p role="status" className="inline-flex items-center gap-2 text-xs font-medium text-[#526974]">
      <Spinner className="h-3.5 w-3.5 text-[#155775]" />
      <span>
        {seconds > 0
          ? `Entrando a la plataforma en ${seconds} s…`
          : "Entrando a la plataforma…"}
      </span>
    </p>
  );
}
