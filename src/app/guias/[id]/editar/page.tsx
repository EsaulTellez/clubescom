import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { card } from "@/lib/ui";
import { asFaqs, asSteps, canEditGuideArea, isUuid } from "../../shared";
import { EditGuideForm } from "./edit-form";

export const dynamic = "force-dynamic";

export default async function EditGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await getSession();
  if (!user) redirect("/entrar");
  const result = await pool.query<{
    id: string;
    area: string;
    version: number;
    title: string;
    summary: string;
    steps: unknown;
    faqs: unknown;
    attachment_name: string | null;
  }>(
    "select id, area, version, title, summary, steps, faqs, attachment_name from guides where id = $1",
    [id],
  );
  const guide = result.rows[0];
  if (!guide || !canEditGuideArea(user, guide.area)) notFound();
  return (
    <div className="mx-auto max-w-[1640px] space-y-4">
      <Link href={`/guias/${id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#006699] hover:underline">
        ← Volver a la guía
      </Link>
      <section className={`${card} space-y-5`}>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#142c3c]">Editor visual de guía</h1>
        <EditGuideForm
          id={guide.id}
          area={guide.area}
          version={guide.version}
          title={guide.title}
          summary={guide.summary}
          steps={asSteps(guide.steps)}
          faqs={asFaqs(guide.faqs)}
          attachmentName={guide.attachment_name}
        />
      </section>
    </div>
  );
}
