import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, btnGhost, card } from "@/lib/ui";
import { reviewSuggestion, suggestImprovement } from "../actions";
import {
  areaLabel,
  asFaqs,
  asSteps,
  formatDate,
  isStaff,
  isUuid,
  statusLabel,
} from "../shared";
import { SuggestForm } from "./suggest-form";
import { GuideSteps } from "./guide-steps";

export const dynamic = "force-dynamic";

type GuideRow = {
  id: string;
  area: string;
  title: string;
  summary: string;
  steps: unknown;
  faqs: unknown;
  created_at: Date;
  author_name: string;
};

type Suggestion = {
  id: string;
  step_index: number;
  body: string;
  status: string;
  created_at: Date;
  author_name: string;
};

export default async function GuidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const user = await getSession();
  const guideResult = await pool.query<GuideRow>(
    `select g.id, g.area, g.title, g.summary, g.steps, g.faqs, g.created_at, u.name as author_name
     from guides g
     join users u on u.id = g.author_id
     where g.id = $1`,
    [id],
  );
  const guide = guideResult.rows[0];
  if (!guide) notFound();

  const suggestions = await pool.query<Suggestion>(
    `select s.id, s.step_index, s.body, s.status, s.created_at, u.name as author_name
     from guide_suggestions s
     join users u on u.id = s.user_id
     where s.guide_id = $1
     order by s.created_at asc`,
    [id],
  );

  const steps = asSteps(guide.steps);
  const faqs = asFaqs(guide.faqs);
  const staff = user ? isStaff(user.role) : false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/guias" className="text-sm text-[#006699] hover:underline">
        Volver a guías
      </Link>

      <header className={`${card} overflow-hidden p-0`}>
        <Cover tone={guide.area} kicker={areaLabel(guide.area)} title={guide.title} className="h-44" />
        <div className="space-y-2 p-5">
        <h1 className="font-serif text-3xl tracking-tight">{guide.title}</h1>
        <p className="mt-2 text-sm leading-6">{guide.summary}</p>
        <p className="mt-3 text-xs text-[#667085]">
          {guide.author_name} · {formatDate(guide.created_at)}
        </p>
        </div>
      </header>

      <section className="space-y-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#006699]">En corto</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Sigue la guía a tu ritmo</h2>
        </div>
        <GuideSteps steps={steps} />
      </section>

      {steps.length > 0 && <section className="space-y-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#006699]">Comunidad</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Sugerencias por paso</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {steps.map((step, index) => {
            const related = suggestions.rows.filter((item) => item.step_index === index);
            return <article key={`${step.title}-${index}`} className="rounded-3xl border border-white bg-white/85 p-5 shadow-[0_8px_28px_rgba(0,64,96,0.06)]">
              <p className="text-xs font-bold uppercase tracking-wide text-[#006699]">Paso {index + 1}</p>
              <h3 className="mt-1 font-bold">{step.title}</h3>
              <div className="mt-4 space-y-3">
                {related.length === 0 && <p className="text-sm text-[#667085]">Aún no hay sugerencias para este paso.</p>}
                {related.map((suggestion) => <div key={suggestion.id} className="rounded-2xl bg-[#edf6fa] p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold">{suggestion.author_name}</span>
                    <span className={suggestion.status === "aceptada" ? "rounded-full bg-[#006699] px-2 py-0.5 text-white" : "rounded-full border border-[#b7d4e4] bg-white px-2 py-0.5"}>{statusLabel(suggestion.status)}</span>
                    <span className="text-[#667085]">{formatDate(suggestion.created_at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{suggestion.body}</p>
                  {staff && suggestion.status === "pendiente" && <form action={reviewSuggestion} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={suggestion.id} />
                    <button className={btn} name="decision" value="aceptar">Aceptar</button>
                    <button className={btnGhost} name="decision" value="rechazar">Rechazar</button>
                  </form>}
                </div>)}
                {user ? <SuggestForm action={suggestImprovement} guideId={guide.id} stepIndex={index} /> : <p className="text-sm text-[#667085]"><Link href="/entrar" className="font-semibold text-[#006699] underline">Inicia sesión</Link> para sugerir una mejora.</p>}
              </div>
            </article>;
          })}
        </div>
      </section>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Preguntas frecuentes</h2>
        {faqs.length === 0 && (
          <p className={card}>Esta guía no incluye preguntas frecuentes.</p>
        )}
        {faqs.map((faq) => (
          <article key={faq.q} className={card}>
            <h3 className="font-medium">{faq.q}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#667085]">{faq.a}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
