import { redirect } from "next/navigation";
import { firstParam } from "./shared";

export const dynamic = "force-dynamic";

export default async function GuiasPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string | string[]; q?: string | string[] }>;
}) {
  const params = await searchParams;
  const area = firstParam(params.area)?.trim();
  const q = firstParam(params.q)?.trim();

  const next = new URLSearchParams();
  if (area) next.set("area", area);
  if (q) next.set("q", q);
  const qs = next.toString();

  redirect(qs ? `/foro?${qs}` : "/foro");
}
