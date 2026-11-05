import Link from "next/link";
import { answerStepQuestion, askStepQuestion, voteGuideAnswer } from "../actions";
import { btn, btnGhost, card, input, label } from "@/lib/ui";

export type StepQuestion = {
  id: string;
  step_index: number;
  title: string;
  body: string;
  status: string;
  created_at: Date;
  author_name: string;
  answers: { id: string; body: string; official: boolean; author_name: string }[];
};

export function StepQA({ guideId, stepIndex, questions, signedIn }: {
  guideId: string;
  stepIndex: number;
  questions: StepQuestion[];
  signedIn: boolean;
}) {
  const related = questions.filter((question) => question.step_index === stepIndex);
  return <div className="mt-4 border-t border-[#dceaf0] pt-4">
    <div className="flex items-center justify-between gap-3">
      <h4 className="text-sm font-extrabold text-[#15374a]">Dudas de este paso</h4>
      <span className="rounded-full bg-[#eaf4f8] px-2.5 py-1 text-xs font-bold text-[#006699]">{related.length} {related.length === 1 ? "pregunta" : "preguntas"}</span>
    </div>
    <div className="mt-3 space-y-3">
      {related.map((question) => <article id={`pregunta-${question.id}`} key={question.id} className="rounded-2xl border border-[#dceaf0] bg-[#f8fbfc] p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-[#263d4a]">{question.author_name}</span>
          <span className={`rounded-full px-2 py-0.5 font-bold ${question.status === "respondida" ? "bg-[#dff1e5] text-[#225b35]" : "bg-[#fff0ce] text-[#704d00]"}`}>{question.status === "respondida" ? "Respondida" : "Sin responder"}</span>
        </div>
        <h5 className="mt-2 font-bold">{question.title}</h5>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#596c76]">{question.body}</p>
        <div className="mt-3 space-y-2">
          {question.answers.map((answer) => <div id={`respuesta-${answer.id}`} key={answer.id} className="rounded-xl bg-white p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold">{answer.author_name}</span>
              {answer.official && <span className="rounded-full bg-[#006699] px-2 py-0.5 font-bold text-white">Respuesta oficial</span>}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{answer.body}</p>
            {signedIn && <div className="mt-2 flex gap-2">
              <form action={voteGuideAnswer}><input type="hidden" name="answerId" value={answer.id} /><input type="hidden" name="helpful" value="true" /><button className="text-xs font-bold text-[#006699] underline">Me sirvió</button></form>
              <form action={voteGuideAnswer}><input type="hidden" name="answerId" value={answer.id} /><input type="hidden" name="helpful" value="false" /><button className="text-xs font-semibold text-[#596c76] underline">No me sirvió</button></form>
            </div>}
          </div>)}
        </div>
        {signedIn && question.status !== "cerrada" ? <form action={answerStepQuestion} className="mt-3 space-y-2">
          <input type="hidden" name="questionId" value={question.id} />
          <label className={label}>Responder<textarea className={`${input} mt-1 min-h-20`} name="body" required minLength={5} maxLength={2000} placeholder="Comparte una respuesta clara para esta duda." /></label>
          <button className={btnGhost}>Publicar respuesta</button>
        </form> : null}
      </article>)}
    </div>
    {signedIn ? <form action={askStepQuestion} className={`${card} mt-3 space-y-3 border-dashed p-4`}>
      <input type="hidden" name="guideId" value={guideId} /><input type="hidden" name="stepIndex" value={stepIndex} />
      <p className="text-sm font-extrabold text-[#15374a]">¿Te quedó una duda?</p>
      <label className={label}>Pregunta<input className={`${input} mt-1`} name="title" required minLength={5} maxLength={160} placeholder="¿Qué parte del paso quieres aclarar?" /></label>
      <label className={label}>Contexto<textarea className={`${input} mt-1 min-h-20`} name="body" required minLength={10} maxLength={1600} placeholder="Explica qué intentaste y dónde te atoraste." /></label>
      <button className={btn}>Preguntar sobre este paso</button>
    </form> : <p className="mt-3 text-sm text-[#596c76]"><Link className="font-bold text-[#006699] underline" href="/entrar">Inicia sesión</Link> para preguntar o responder.</p>}
  </div>;
}
