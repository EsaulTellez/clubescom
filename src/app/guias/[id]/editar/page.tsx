import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { card } from "@/lib/ui";
import { asSteps, isUuid } from "../../shared";
import { EditGuideForm } from "./edit-form";

export const dynamic = "force-dynamic";

export default async function EditGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await getSession();
  if (!user) redirect("/entrar");
  const result = await pool.query<{ id: string; area: string; version: number; title: string; summary: string; steps: unknown }>(
    "select id, area, version, title, summary, steps from guides where id = $1", [id],
  );
  const guide = result.rows[0];
  if (!guide || (user.role !== "admin" && !(user.role === "moderador" && user.area === guide.area))) notFound();
  return <div className="mx-auto max-w-2xl space-y-4">
    <Link href={`/guias/${id}`} className="text-sm text-[#006699] hover:underline">Volver a la guía</Link>
    <section className={`${card} space-y-4`}>
      <h1 className="text-2xl font-semibold">Editar guía</h1>
      <EditGuideForm {...guide} steps={asSteps(guide.steps)} />
    </section>
  </div>;
}
