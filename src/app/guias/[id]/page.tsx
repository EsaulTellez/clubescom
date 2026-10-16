import Link from "next/link";
import { notFound } from "next/navigation";
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

      <header className={card}>
        <p className="text-xs uppercase tracking-wide text-[#006699]">
          {areaLabel(guide.area)}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{guide.title}</h1>
        <p className="mt-2 text-sm leading-6">{guide.summary}</p>
        <p className="mt-3 text-xs text-[#667085]">
          {guide.author_name} · {formatDate(guide.created_at)}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pasos</h2>
        {steps.length === 0 && (
          <p className={card}>Esta guía todavía no tiene pasos.</p>
        )}
        <ol className="space-y-3">
          {steps.map((step, index) => {
            const related = suggestions.rows.filter((item) => item.step_index === index);
            return (
              <li key={`${step.title}-${index}`} className={card}>
                <p className="text-xs font-medium uppercase tracking-wide text-[#006699]">
                  Paso {index + 1}
                </p>
                <h3 className="mt-1 font-semibold">{step.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{step.body}</p>

                <div className="mt-4 space-y-3 border-t border-[#d5e4ee] pt-4">
                  <h4 className="text-sm font-medium">Sugerencias</h4>
                  {related.length === 0 && (
                    <p className="text-sm text-[#667085]">Nadie ha sugerido cambios en este paso.</p>
                  )}
                  {related.map((suggestion) => (
                    <div key={suggestion.id} className="rounded-lg bg-[#e6f3fa] p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium">{suggestion.author_name}</span>
                        <span
                          className={
                            suggestion.status === "aceptada"
                              ? "rounded-full bg-[#006699] px-2 py-0.5 text-white"
                              : "rounded-full border border-[#d5e4ee] bg-white px-2 py-0.5"
                          }
                        >
                          {statusLabel(suggestion.status)}
                        </span>
                        <span className="text-[#667085]">{formatDate(suggestion.created_at)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{suggestion.body}</p>
                      {staff && suggestion.status === "pendiente" && (
                        <form action={reviewSuggestion} className="mt-3 flex flex-wrap gap-2">
                          <input type="hidden" name="id" value={suggestion.id} />
                          <button className={btn} name="decision" value="aceptar">
                            Aceptar
                          </button>
                          <button className={btnGhost} name="decision" value="rechazar">
                            Rechazar
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                  {user ? (
                    <SuggestForm
                      action={suggestImprovement}
                      guideId={guide.id}
                      stepIndex={index}
                    />
                  ) : (
                    <p className="text-sm text-[#667085]">
                      <Link href="/entrar" className="font-medium text-[#006699] underline">
                        Entra
                      </Link>{" "}
                      para sugerir una mejora de este paso.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

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
