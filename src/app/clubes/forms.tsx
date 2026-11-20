"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { ImageUploadField } from "@/components/image-upload-field";
import { formatMxDateTime, toMxLocalInputValue } from "@/lib/datetime";
import { uploadFileDirectly } from "@/lib/direct-upload";
import { btn, btnGhost, input, label } from "@/lib/ui";
import {
  advisorRespondAppointment,
  approveProposal,
  claimInactiveProposal,
  completeClubAppointment,
  confirmAdvisorByTeacher,
  createClubDirectly,
  createClubEvent,
  createClubPost,
  createProposal,
  decideClubAppointment,
  decideMembership,
  deleteClubEvent,
  deleteClubPost,
  issueAdvisorCode,
  markInterest,
  removeMember,
  requestClubAppointment,
  requestMembership,
  reviewClubEvent,
  reviewProposalDocument,
  reviewProposalStatus,
  saveParticipantProfile,
  sendAdvisorCodeToEmail,
  submitFormalClubRequest,
  updateClubDetails,
  updateProposalDetails,
  uploadProposalDocument,
  verifyAdvisorCode,
  withdrawInterest,
} from "./actions";
import { kindLabel, type ClubKind, type ClubState } from "./format";
import {
  MAX_CLUB_JOIN_QUESTIONS,
  parseJoinQuestions,
  type ClubJoinQuestion,
  type ClubJoinQuestionType,
} from "./questions";
import { findSimilarClubsOrProposals, type CatalogEntry } from "./similarity";

function FieldError({ state }: { state: ClubState }) {
  return (
    <>
      {state.error && (
        <p className="text-sm text-[#8C1D18]" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm font-semibold text-[#17634a]" role="status">
          {state.success}
        </p>
      )}
    </>
  );
}

function JoinQuestionnaireBuilder({ initial = [] }: { initial?: ClubJoinQuestion[] }) {
  const [questions, setQuestions] = useState<ClubJoinQuestion[]>(initial);

  function addQuestion() {
    if (questions.length >= MAX_CLUB_JOIN_QUESTIONS) return;
    setQuestions((prev) => [
      ...prev,
      {
        id: `q_${Date.now().toString(36)}_${prev.length + 1}`,
        prompt: "",
        type: "text",
        required: true,
        options: ["Sí tengo experiencia", "Estoy empezando"],
      },
    ]);
  }

  function updateAt(index: number, patch: Partial<ClubJoinQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function removeAt(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  const serialized = useMemo(
    () =>
      JSON.stringify(
        questions
          .filter((q) => q.prompt.trim().length > 0)
          .map((q) => ({
            id: q.id,
            prompt: q.prompt.trim(),
            type: q.type,
            required: q.required,
            options:
              q.type === "choice"
                ? (q.options ?? []).map((o) => o.trim()).filter(Boolean)
                : undefined,
          })),
      ),
    [questions],
  );

  return (
    <div className="space-y-3 rounded-xl border border-[#d6e4ed] bg-[#f8fbfd] p-3.5">
      <input type="hidden" name="join_questions_json" value={serialized} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#005580]">
            Primer filtro de ingreso (cuestionario estructurado)
          </p>
          <p className="text-xs text-[#516875]">
            Quien solicite unirse deberá responder estas preguntas antes de que revises su solicitud.
          </p>
        </div>
        <button
          type="button"
          onClick={addQuestion}
          disabled={questions.length >= MAX_CLUB_JOIN_QUESTIONS}
          className="rounded-lg border border-[#006699] bg-white px-3 py-1.5 text-xs font-extrabold text-[#005580] hover:bg-[#eaf4f8] disabled:opacity-50"
        >
          + Agregar pregunta ({questions.length}/{MAX_CLUB_JOIN_QUESTIONS})
        </button>
      </div>

      {questions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#c7dbe6] bg-white px-3 py-2 text-xs text-[#647b87]">
          Sin preguntas estructuradas. Puedes agregar preguntas de respuesta abierta, opción múltiple o Sí/No.
        </p>
      ) : (
        <div className="space-y-2.5">
          {questions.map((q, idx) => (
            <div key={q.id} className="space-y-2 rounded-lg border border-[#d5e3eb] bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#19435b]">Pregunta {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="text-xs font-bold text-[#8C1D18] hover:underline"
                >
                  Quitar
                </button>
              </div>
              <input
                className={input}
                value={q.prompt}
                onChange={(e) => updateAt(idx, { prompt: e.target.value })}
                maxLength={200}
                placeholder="Ej. ¿En qué semestre cursas y qué horario tienes libre?"
              />
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                <select
                  className={input}
                  value={q.type}
                  onChange={(e) =>
                    updateAt(idx, {
                      type: e.target.value as ClubJoinQuestionType,
                      options:
                        e.target.value === "choice" && (!q.options || q.options.length < 2)
                          ? ["Opción 1", "Opción 2"]
                          : q.options,
                    })
                  }
                >
                  <option value="text">Respuesta abierta</option>
                  <option value="choice">Opción múltiple</option>
                  <option value="boolean">Sí / No</option>
                </select>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#294859]">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateAt(idx, { required: e.target.checked })}
                  />
                  Obligatoria
                </label>
              </div>
              {q.type === "choice" && (
                <label className="block text-[11px] font-semibold text-[#47606e]">
                  Opciones separadas por coma (mínimo 2, máx. 6)
                  <input
                    className={`${input} mt-1`}
                    value={(q.options ?? []).join(", ")}
                    onChange={(e) =>
                      updateAt(idx, {
                        options: e.target.value.split(",").map((s) => s.trim()),
                      })
                    }
                    placeholder="Básico, Intermedio, Avanzado"
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DirectClubForm({
  students,
  professors,
  allowedKinds,
}: {
  students: { id: string; name: string }[];
  professors: { id: string; name: string }[];
  allowedKinds: ClubKind[];
}) {
  const [state, action, pending] = useActionState(createClubDirectly, {});
  const kinds = allowedKinds.length > 0 ? allowedKinds : (["academico"] as ClubKind[]);
  return (
    <form action={action} className="space-y-3">
      <label className={label}>
        Nombre del club
        <input className={input} name="name" required minLength={3} maxLength={120} />
      </label>
      <label className={label}>
        Tipo
        <select className={input} name="kind" defaultValue={kinds[0]}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {kindLabel(k)}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Descripción
        <textarea className={`${input} min-h-24`} name="description" required minLength={10} maxLength={2000} />
      </label>
      <label className={label}>
        Horario y sede (opcional)
        <input className={input} name="schedule" maxLength={160} placeholder="Ej. Martes y jueves · 16:00 · Salón 2104" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Correo de contacto del club (opcional)
          <input className={input} name="contact_email" type="email" maxLength={160} placeholder="club@ipn.mx" />
        </label>
        <label className={label}>
          Medio de contacto / cubículo (opcional)
          <input className={input} name="contact_info" maxLength={400} placeholder="Discord, Telegram o cubículo" />
        </label>
      </div>
      <label className={label}>
        Alumno moderador / presidente
        <select className={input} name="leader_id" required defaultValue="">
          <option value="" disabled>
            Selecciona un alumno
          </option>
          {students.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Profesor coordinador
        <select className={input} name="advisor_id" required defaultValue="">
          <option value="" disabled>
            Selecciona un profesor
          </option>
          {professors.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <ImageUploadField name="logo" label="Logo del club (opcional · JPG, PNG o WEBP)" compact />
      <label className={label}>
        Indicaciones o enlace de filtro externo (opcional)
        <input className={input} name="join_requirements" maxLength={500} placeholder="Ej. Traer laptop o llenar formulario complementario" />
      </label>
      <JoinQuestionnaireBuilder initial={[]} />
      <FieldError state={state} />
      <button className={btn} disabled={pending || !students.length || !professors.length}>
        {pending ? "Registrando…" : "Registrar club"}
      </button>
      {(!students.length || !professors.length) && (
        <p className="text-sm text-[#667085]">Se necesita al menos una cuenta activa de alumno y una de profesor.</p>
      )}
    </form>
  );
}

export function ProposalForm({ catalog = [] }: { catalog?: CatalogEntry[] }) {
  const [state, action, pending] = useActionState(createProposal, {});
  const [name, setName] = useState("");
  const [objectives, setObjectives] = useState("");
  const [confirmDifferent, setConfirmDifferent] = useState(false);

  const matches = useMemo(
    () => findSimilarClubsOrProposals(name, objectives, catalog),
    [name, objectives, catalog],
  );
  const hasBlocking = matches.some((m) => m.isBlocking);
  const hasWarning = matches.length > 0 && !hasBlocking;

  return (
    <form action={action} className="space-y-3.5">
      <label className={label}>
        Nombre del club
        <input
          className={input}
          name="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setConfirmDifferent(false);
          }}
          required
          minLength={3}
          maxLength={120}
          placeholder="Ej. Club de Ciberseguridad ESCOM"
        />
      </label>
      <label className={label}>
        Tipo
        <select className={input} name="kind" required defaultValue="academico">
          <option value="academico">Académico</option>
          <option value="cultural">Cultural</option>
          <option value="deportivo">Deportivo</option>
        </select>
      </label>
      <label className={label}>
        Objetivo del club
        <textarea
          className={`${input} min-h-28`}
          name="objectives"
          value={objectives}
          onChange={(e) => {
            setObjectives(e.target.value);
            setConfirmDifferent(false);
          }}
          required
          minLength={10}
          maxLength={2000}
          placeholder="Describe qué busca lograr el club en ESCOM"
        />
      </label>

      {matches.length > 0 && (
        <div
          role="status"
          className={`space-y-2 rounded-xl border p-3.5 text-xs ${
            hasBlocking
              ? "border-[#e2b4b0] bg-[#fff3f2] text-[#7a231c]"
              : "border-[#e6cfa0] bg-[#fffaf0] text-[#6d4b12]"
          }`}
        >
          <p className="font-extrabold uppercase tracking-wide">
            {hasBlocking
              ? "Ya existe un club o propuesta muy similar"
              : "Posibles coincidencias encontradas"}
          </p>
          <ul className="space-y-1.5">
            {matches.map((match) => (
              <li key={`${match.type}-${match.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 bg-white px-2.5 py-2">
                <div className="min-w-0">
                  <p className="font-bold text-[#173a4c]">{match.name}</p>
                  <p className="text-[11px] text-[#5c717d]">
                    {match.statusLabel} · {match.reason}
                    {typeof match.interests === "number" ? ` · ${match.interests}/20 votos` : ""}
                  </p>
                </div>
                <Link
                  href={match.type === "club" ? `/clubes/${match.id}` : `/clubes/propuestas/${match.id}`}
                  className="shrink-0 font-extrabold text-[#006699] hover:underline"
                >
                  {match.type === "club" ? "Ver club →" : "Ver propuesta →"}
                </Link>
              </li>
            ))}
          </ul>
          {hasWarning && (
            <label className="mt-1 flex items-start gap-2 font-semibold text-[#5a3d0c]">
              <input
                type="checkbox"
                name="force_similar"
                value="1"
                checked={confirmDifferent}
                onChange={(e) => setConfirmDifferent(e.target.checked)}
                className="mt-0.5"
              />
              <span>Confirmo que esta iniciativa tiene un enfoque distinto a las anteriores.</span>
            </label>
          )}
        </div>
      )}

      <FieldError state={state} />
      <button
        className={btn}
        disabled={pending || hasBlocking || (hasWarning && !confirmDifferent)}
      >
        {pending ? "Publicando propuesta…" : "Publicar propuesta"}
      </button>
    </form>
  );
}

const SPACE_PRESETS = [
  "Salones Edificio 1 o 2",
  "Laboratorios de Cómputo",
  "Sala 14",
  "Auditorio",
  "Explanada / Domo",
  "Canchas deportivas",
];

export function UpdateProposalActivitiesForm({
  proposalId,
  objectives,
  schedulePlan,
  activitiesDetail,
  requestedSpaces,
  communityImpact,
  planUrl,
}: {
  proposalId: string;
  objectives: string;
  schedulePlan: string;
  activitiesDetail: string;
  requestedSpaces: string;
  communityImpact: string;
  planUrl?: string | null;
}) {
  const [state, action, pending] = useActionState(updateProposalDetails, {});
  const [spaces, setSpaces] = useState(requestedSpaces);

  function appendPreset(preset: string) {
    setSpaces((prev) => {
      const clean = prev.trim();
      if (!clean) return preset;
      if (clean.toLowerCase().includes(preset.toLowerCase())) return clean;
      return `${clean}, ${preset}`;
    });
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <label className={label}>
        Objetivos del club
        <textarea className={`${input} min-h-20`} name="objectives" defaultValue={objectives} required minLength={5} maxLength={2000} />
      </label>
      <label className={label}>
        Cronograma de actividades a realizar en el año
        <textarea
          className={`${input} min-h-24`}
          name="schedule_plan"
          defaultValue={schedulePlan}
          required
          minLength={10}
          maxLength={2000}
          placeholder="Ej. Mes 1-2: sesiones introductorias semanales; Mes 3-5: talleres prácticos y concurso interno..."
        />
      </label>
      <label className={label}>
        Detalle de actividades por ejecutar
        <textarea
          className={`${input} min-h-20`}
          name="activities_detail"
          defaultValue={activitiesDetail}
          maxLength={2000}
          placeholder="Descripción de talleres, asesorías, entrenamientos o eventos previstos"
        />
      </label>
      <div className="space-y-1.5">
        <label className={label}>
          Espacios y tiempos solicitados en ESCOM
          <input
            className={input}
            name="requested_spaces"
            value={spaces}
            onChange={(e) => setSpaces(e.target.value)}
            required
            minLength={3}
            maxLength={600}
            placeholder="Ej. Salón 2104 o Laboratorio 3 · Martes y jueves de 15:00 a 17:00 hrs"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SPACE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => appendPreset(preset)}
              className="rounded-full border border-[#c7dbe6] bg-[#f4f9fc] px-2.5 py-1 text-[11px] font-bold text-[#005580] hover:bg-[#e5f2f9]"
            >
              + {preset}
            </button>
          ))}
        </div>
      </div>
      <label className={label}>
        Impacto académico, cultural o deportivo en la comunidad
        <textarea className={`${input} min-h-16`} name="community_impact" defaultValue={communityImpact} maxLength={2000} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Plan de trabajo en PDF (opcional, máx. 10 MB)
          <input className={input} name="plan_file" type="file" accept="application/pdf" />
        </label>
        <label className={label}>
          Enlace externo del proyecto (opcional)
          <input className={input} name="plan_url" type="url" defaultValue={planUrl ?? ""} placeholder="https://" />
        </label>
      </div>
      <FieldError state={state} />
      <button className={btnGhost} disabled={pending}>
        {pending ? "Guardando…" : "Guardar proyecto ejecutivo"}
      </button>
    </form>
  );
}

export function ParticipantProfileForm({
  proposalId,
  career,
  phone,
}: {
  proposalId: string;
  career: string;
  phone: string;
}) {
  const [state, action, pending] = useActionState(saveParticipantProfile, {});
  return (
    <form action={action} className="grid gap-3 rounded-xl border border-[#d5e4ee] bg-[#f8fbfd] p-3.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <label className={label}>
        Carrera (para la lista oficial)
        <input
          className={input}
          name="career"
          defaultValue={career}
          required
          minLength={2}
          maxLength={120}
          placeholder="Ej. ISC, IIA o LCD"
        />
      </label>
      <label className={label}>
        Teléfono de contacto
        <input
          className={input}
          name="phone"
          defaultValue={phone}
          required
          minLength={8}
          maxLength={40}
          placeholder="55 1234 5678"
        />
      </label>
      <button className={btnGhost} disabled={pending}>
        {pending ? "Guardando…" : "Guardar datos"}
      </button>
      {(state.error || state.success) && (
        <div className="sm:col-span-3">
          <FieldError state={state} />
        </div>
      )}
    </form>
  );
}

export function ActionForm({
  action,
  fields,
  label: text,
  variant = "solid",
}: {
  action: (state: ClubState, form: FormData) => Promise<ClubState>;
  fields: Record<string, string>;
  label: string;
  variant?: "solid" | "ghost";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <FieldError state={state} />
      <button className={variant === "ghost" ? btnGhost : btn} disabled={pending}>
        {text}
      </button>
    </form>
  );
}

export function InterestButton({ proposalId }: { proposalId: string }) {
  return <ActionForm action={markInterest} fields={{ proposal_id: proposalId }} label="Me interesa" />;
}

export function WithdrawInterestButton({ proposalId }: { proposalId: string }) {
  return (
    <ActionForm
      action={withdrawInterest}
      fields={{ proposal_id: proposalId }}
      label="Retirar mi respaldo"
      variant="ghost"
    />
  );
}

export function ClaimInactiveProposalButton({
  proposalId,
  proposalName = "esta propuesta",
  compact = false,
}: {
  proposalId: string;
  proposalName?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [state, action, pending] = useActionState(claimInactiveProposal, {});

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          compact
            ? "inline-flex items-center rounded-lg border border-[#006699] bg-[#eef6fa] px-3 py-1.5 text-xs font-extrabold text-[#004d73] transition hover:bg-[#dceef7]"
            : btnGhost
        }
      >
        Tomar el mando y continuar registro
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`claim-title-${proposalId}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#cfdbe2] bg-[#fffefa] shadow-2xl"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="flex items-center justify-between border-b border-[#e4ecee] bg-[#f4f9fb] px-5 py-4">
              <h3 id={`claim-title-${proposalId}`} className="text-lg font-extrabold text-[#14374a]">
                Tomar el mando del club
              </h3>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#cbd9e0] bg-white text-sm font-bold text-[#35505e] hover:bg-[#eaf3f7]"
              >
                ✕
              </button>
            </div>
            <form action={action} className="space-y-4 p-5">
              <input type="hidden" name="proposal_id" value={proposalId} />
              <p className="text-sm leading-relaxed text-[#2d4856]">
                Al asumir el seguimiento de <strong>{proposalName}</strong> te convertirás en el{" "}
                <strong>alumno moderador (presidente) del club</strong> conforme al procedimiento oficial de ESCOM:
              </p>
              <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-[#475f6b]">
                <li>Completar el cronograma anual, detalle de actividades y espacios solicitados.</li>
                <li>Coordinar al profesor o PAAE coordinador (@ipn.mx) y enviar el registro formal.</li>
                <li>Asistir a la cita institucional y administrar las solicitudes, publicaciones y eventos del club una vez registrado.</li>
              </ul>
              <label className="flex items-start gap-2.5 rounded-xl border border-[#d6e4eb] bg-[#f7fbfe] p-3 text-xs font-semibold text-[#173a4c]">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Acepto fungir como alumno moderador de este club y completar su registro.</span>
              </label>
              <FieldError state={state} />
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
                  Cancelar
                </button>
                <button type="submit" className={btn} disabled={pending || !accepted}>
                  {pending ? "Asumiendo mando…" : "Aceptar y continuar registro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export function SendAdvisorEmailCodeForm({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState(sendAdvisorCodeToEmail, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <label className={label}>
        Correo institucional del profesor coordinador (@ipn.mx)
        <input
          className={input}
          type="email"
          name="advisor_email"
          required
          placeholder="profesor@ipn.mx"
          autoComplete="email"
        />
      </label>
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Enviando código…" : "Enviar código al correo del profesor"}
      </button>
    </form>
  );
}

export function IssueAdvisorCodeForm({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState(issueAdvisorCode, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <label className={label}>
        Código de seis caracteres para compartir con quien propone
        <input
          className={`${input} font-mono uppercase tracking-widest`}
          name="advisor_code"
          required
          minLength={6}
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
          pattern="[A-Za-z0-9]{6}"
        />
      </label>
      <FieldError state={state} />
      <button className={btnGhost} disabled={pending}>
        {pending ? "Emitiendo…" : "Generar código manualmente"}
      </button>
    </form>
  );
}

export function VerifyAdvisorCodeForm({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState(verifyAdvisorCode, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <label className={label}>
        Código que recibió el profesor en su correo institucional
        <input
          className={`${input} font-mono uppercase tracking-widest`}
          name="advisor_code"
          required
          minLength={6}
          maxLength={6}
          pattern="[A-Za-z0-9]{6}"
          autoComplete="off"
          placeholder="ABC123"
        />
      </label>
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Validando…" : "Confirmar que el profesor aceptó"}
      </button>
    </form>
  );
}

export function AdvisorConfirmForm({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState(confirmAdvisorByTeacher, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Confirmando…" : "Confirmar que coordinaré este club"}
      </button>
    </form>
  );
}

export function AdvisorMeetingResponseForm({
  proposalId,
  existingNote,
}: {
  proposalId: string;
  existingNote?: string | null;
}) {
  const [state, action, pending] = useActionState(advisorRespondAppointment, {});
  const [note, setNote] = useState(existingNote ?? "");
  return (
    <form action={action} className="space-y-3 rounded-xl border border-[#cfe2ec] bg-white p-3.5">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <label className={label}>
        Disponibilidad o comentario del profesor coordinador (opcional al confirmar; obligatorio si solicitas ajuste)
        <input
          className={input}
          name="advisor_note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={400}
          placeholder="Ej. Confirmo asistencia, o propongo miércoles 13:00 h"
        />
      </label>
      <FieldError state={state} />
      <div className="flex flex-wrap gap-2">
        <button className={btn} name="confirm" value="1" disabled={pending}>
          {pending ? "Guardando…" : "Confirmar asistencia a la reunión"}
        </button>
        <button className={btnGhost} name="confirm" value="0" disabled={pending || note.trim().length < 4}>
          Sugerir otro horario
        </button>
      </div>
    </form>
  );
}

export function FormalClubRequestForm({
  proposalId,
  objectives,
  schedulePlan,
  activitiesDetail,
  requestedSpaces,
  communityImpact,
  planUrl,
  hasPlanFile,
  targetOfficeLabel,
}: {
  proposalId: string;
  objectives: string;
  schedulePlan: string;
  activitiesDetail: string;
  requestedSpaces: string;
  communityImpact: string;
  planUrl?: string | null;
  hasPlanFile?: boolean;
  targetOfficeLabel: string;
}) {
  const [state, action, pending] = useActionState(submitFormalClubRequest, {});
  const [spaces, setSpaces] = useState(requestedSpaces);
  const [uploadedPlanPath, setUploadedPlanPath] = useState("");
  const [planUploading, setPlanUploading] = useState(false);
  const [planUploadError, setPlanUploadError] = useState("");
  const [planFileName, setPlanFileName] = useState("");

  function appendPreset(preset: string) {
    setSpaces((prev) => {
      const clean = prev.trim();
      if (!clean) return preset;
      if (clean.toLowerCase().includes(preset.toLowerCase())) return clean;
      return `${clean}, ${preset}`;
    });
  }

  async function onPlanFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPlanUploadError("");
    setUploadedPlanPath("");
    setPlanFileName("");
    if (!file) return;
    if (file.type !== "application/pdf") {
      setPlanUploadError("El plan de trabajo debe ser un archivo PDF.");
      e.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPlanUploadError("El PDF excede 10 MB.");
      e.target.value = "";
      return;
    }
    setPlanUploading(true);
    try {
      const res = await uploadFileDirectly(file, {
        bucket: "club-documents",
        contextId: proposalId,
      });
      setUploadedPlanPath(res.path);
      setPlanFileName(file.name);
      e.target.value = "";
    } catch (err) {
      setPlanUploadError(err instanceof Error ? err.message : "No se pudo preparar el PDF.");
    } finally {
      setPlanUploading(false);
    }
  }

  return (
    <form action={action} className="space-y-3.5">
      <input type="hidden" name="proposal_id" value={proposalId} />
      {uploadedPlanPath && <input type="hidden" name="plan_file_uploaded_path" value={uploadedPlanPath} />}
      <label className={label}>
        Objetivos del club (mín. 10 caracteres)
        <textarea
          className={`${input} min-h-20`}
          name="objectives"
          defaultValue={objectives}
          required
          minLength={10}
          maxLength={2000}
        />
      </label>
      <label className={label}>
        Cronograma de actividades durante el año (obligatorio para {targetOfficeLabel})
        <textarea
          className={`${input} min-h-24`}
          name="schedule_plan"
          defaultValue={schedulePlan}
          required
          minLength={10}
          maxLength={2000}
          placeholder="Ej. Febrero–marzo: inducción y talleres semanales; abril–mayo: proyecto integrador y muestra en ESCOM..."
        />
      </label>
      <label className={label}>
        Detalle de actividades por ejecutar (talleres, asesorías, eventos)
        <textarea
          className={`${input} min-h-20`}
          name="activities_detail"
          defaultValue={activitiesDetail}
          required
          minLength={10}
          maxLength={2000}
          placeholder="Describe las dinámicas, sesiones y metas concretas de cada actividad"
        />
      </label>
      <div className="space-y-1.5">
        <label className={label}>
          Espacios y tiempos solicitados en ESCOM
          <input
            className={input}
            name="requested_spaces"
            value={spaces}
            onChange={(e) => setSpaces(e.target.value)}
            required
            minLength={3}
            maxLength={600}
            placeholder="Ej. Salón 2104 · Martes y jueves de 15:00 a 17:00 hrs"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SPACE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => appendPreset(preset)}
              className="rounded-full border border-[#c7dbe6] bg-[#f4f9fc] px-2.5 py-1 text-[11px] font-bold text-[#005580] hover:bg-[#e5f2f9]"
            >
              + {preset}
            </button>
          ))}
        </div>
      </div>
      <label className={label}>
        Contribución y beneficios a la comunidad ESCOM
        <textarea
          className={`${input} min-h-20`}
          name="community_impact"
          defaultValue={communityImpact}
          required
          minLength={10}
          maxLength={2000}
          placeholder="Explica cómo aporta el club a estudiantes y a la comunidad politécnica"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Plan de trabajo o reglamento en PDF {hasPlanFile ? "(ya hay uno cargado; sube otro para reemplazar)" : "(opcional, máx. 10 MB)"}
          <input
            className={input}
            name={uploadedPlanPath ? undefined : "plan_file"}
            type="file"
            accept="application/pdf"
            onChange={onPlanFileChange}
            disabled={planUploading}
          />
          {planUploading && <span className="mt-1 block text-xs text-[#006699]">Subiendo PDF…</span>}
          {planFileName && (
            <span className="mt-1 block text-xs font-semibold text-[#17634a]">
              PDF listo: {planFileName}
            </span>
          )}
          {planUploadError && <span className="mt-1 block text-xs text-[#8C1D18]">{planUploadError}</span>}
        </label>
        <label className={label}>
          Enlace externo del proyecto (opcional)
          <input className={input} name="plan_url" type="url" defaultValue={planUrl ?? ""} placeholder="https://" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Opción 1 de fecha y hora para junta conjunta (CDMX)
          <input className={input} type="datetime-local" name="slot1" required />
        </label>
        <label className={label}>
          Opción 2 de fecha y hora (opcional)
          <input className={input} type="datetime-local" name="slot2" />
        </label>
      </div>
      <FieldError state={state} />
      <button className={btn} disabled={pending || planUploading}>
        {pending ? "Enviando registro formal…" : `Enviar registro formal a ${targetOfficeLabel}`}
      </button>
    </form>
  );
}

export function ProposalStaffDecisionForm({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState(reviewProposalStatus, {});
  return (
    <form action={action} className="space-y-3 border-t border-[#d5e4ee] pt-4">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <label className={label}>
        Observaciones o motivo de la resolución
        <textarea
          className={`${input} mt-1 min-h-20`}
          name="observations"
          required
          minLength={5}
          maxLength={1000}
          placeholder="Indica qué falta corregir o el motivo del rechazo"
        />
      </label>
      <FieldError state={state} />
      <div className="flex flex-wrap gap-2">
        <button className={btnGhost} name="decision" value="incompleta" disabled={pending}>
          Marcar incompleta (con observaciones)
        </button>
        <button className={btnGhost} name="decision" value="rechazada" disabled={pending}>
          Rechazar propuesta
        </button>
        <button className={btnGhost} name="decision" value="en_documentacion" disabled={pending}>
          Reabrir a documentación
        </button>
      </div>
    </form>
  );
}

export function ApproveButton({ proposalId }: { proposalId: string }) {
  return <ActionForm action={approveProposal} fields={{ proposal_id: proposalId }} label="Aprobar y registrar club" />;
}

export function JoinButton({
  clubId,
  joinRequirements,
  joinQuestions = [],
}: {
  clubId: string;
  joinRequirements?: string | null;
  joinQuestions?: ClubJoinQuestion[];
}) {
  const [state, action, pending] = useActionState(requestMembership, {});
  const questions = parseJoinQuestions(joinQuestions);
  const hasNotesReq = Boolean(joinRequirements?.trim());

  if (questions.length === 0 && !hasNotesReq) {
    return <ActionForm action={requestMembership} fields={{ club_id: clubId }} label="Solicitar unirme" />;
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="club_id" value={clubId} />
      {hasNotesReq && (
        <div className="rounded-xl border border-[#cfe2ec] bg-[#f4f9fc] p-3 text-xs leading-relaxed text-[#21465c]">
          <p className="font-extrabold uppercase tracking-wide text-[#005580]">Indicaciones del club</p>
          <p className="mt-1 whitespace-pre-line">{joinRequirements}</p>
        </div>
      )}

      {questions.map((q, idx) => (
        <div key={q.id} className="space-y-1.5 rounded-xl border border-[#e0e8ed] bg-white p-3">
          <p className="text-xs font-bold text-[#173a4c]">
            {idx + 1}. {q.prompt}{" "}
            {q.required && <span className="text-[#8C1D18]" aria-hidden="true">*</span>}
          </p>
          {q.type === "text" && (
            <textarea
              className={`${input} min-h-16 text-xs`}
              name={`answer_${q.id}`}
              required={q.required}
              maxLength={600}
              placeholder="Escribe tu respuesta…"
            />
          )}
          {q.type === "choice" && q.options && (
            <div className="space-y-1.5 pt-1">
              {q.options.map((opt) => (
                <label
                  key={opt}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#e3ecee] px-2.5 py-1.5 text-xs text-[#234254] hover:bg-[#f4f9fc]"
                >
                  <input type="radio" name={`answer_${q.id}`} value={opt} required={q.required} />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          )}
          {q.type === "boolean" && (
            <div className="flex flex-wrap gap-3 pt-1">
              {(["Sí", "No"] as const).map((opt) => (
                <label
                  key={opt}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#e3ecee] px-3 py-1.5 text-xs font-semibold text-[#234254] hover:bg-[#f4f9fc]"
                >
                  <input type="radio" name={`answer_${q.id}`} value={opt} required={q.required} />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      {(hasNotesReq || questions.length > 0) && (
        <label className={label}>
          {questions.length === 0 ? "Respuesta a los requisitos de ingreso" : "Comentarios adicionales (opcional)"}
          <textarea
            className={`${input} min-h-16 text-xs`}
            name="application_note"
            required={questions.length === 0 && hasNotesReq}
            minLength={questions.length === 0 && hasNotesReq ? 3 : undefined}
            maxLength={600}
            placeholder={
              questions.length === 0
                ? "Escribe tu respuesta a los requisitos de ingreso"
                : "Algo más que quieras comentar al responsable del club"
            }
          />
        </label>
      )}
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Enviando solicitud…" : "Enviar solicitud al club"}
      </button>
    </form>
  );
}

export function DecisionButtons({ clubId, userId }: { clubId: string; userId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionForm
        action={decideMembership}
        fields={{ club_id: clubId, user_id: userId, status: "aceptada" }}
        label="Aceptar"
      />
      <ActionForm
        action={decideMembership}
        fields={{ club_id: clubId, user_id: userId, status: "rechazada" }}
        label="Rechazar"
        variant="ghost"
      />
    </div>
  );
}

export function RemoveMemberButton({ clubId, userId }: { clubId: string; userId: string }) {
  return (
    <ActionForm
      action={removeMember}
      fields={{ club_id: clubId, user_id: userId }}
      label="Retirar"
      variant="ghost"
    />
  );
}

const DOC_TYPE_OPTIONS = [
  { value: "credencial_ipn", label: "Credencial IPN" },
  { value: "boleta", label: "Boleta / Tira de materias" },
  { value: "firma", label: "Firma" },
  { value: "vigencia_ims", label: "Vigencia de derechos IMSS" },
] as const;

export function ProposalDocumentForm({
  proposalId,
  existingDocs = [],
}: {
  proposalId: string;
  existingDocs?: { id: string; document_type: string; status: string; review_note?: string | null }[];
}) {
  const [state, action, pending] = useActionState(uploadProposalDocument, {});
  const docMap = new Map(existingDocs.map((d) => [d.document_type, d]));
  const firstMissing =
    DOC_TYPE_OPTIONS.find((opt) => {
      const d = docMap.get(opt.value);
      return !d || d.status === "requiere_correccion";
    })?.value ?? "credencial_ipn";

  const [docType, setDocType] = useState<string>(firstMissing);
  const [uploadedPath, setUploadedPath] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setUploadErr("");
    setUploadedPath("");
    setFileName("");
    if (!file) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setUploadErr("Usa PDF, JPG o PNG.");
      e.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadErr("El archivo supera los 10 MB.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const res = await uploadFileDirectly(file, {
        bucket: "club-documents",
        contextId: proposalId,
      });
      setUploadedPath(res.path);
      setFileName(file.name);
      e.target.value = "";
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "No se pudo subir el archivo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      {uploadedPath && <input type="hidden" name="document_uploaded_path" value={uploadedPath} />}

      <div className="grid gap-2 sm:grid-cols-2">
        {DOC_TYPE_OPTIONS.map((opt) => {
          const cur = docMap.get(opt.value);
          const selected = docType === opt.value;
          const badge = !cur
            ? "Pendiente"
            : cur.status === "requiere_correccion"
              ? "Corregir"
              : "Recibido";
          const badgeClass = !cur
            ? "bg-[#f3f4ef] text-[#596b75]"
            : cur.status === "requiere_correccion"
              ? "bg-[#fff1ef] text-[#8C1D18]"
              : "bg-[#eaf7f0] text-[#17634a]";
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setDocType(opt.value);
                setUploadedPath("");
                setFileName("");
                setUploadErr("");
              }}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                selected
                  ? "border-[#006699] bg-[#eef7fb] ring-1 ring-[#006699]"
                  : "border-[#d8e3ea] bg-white hover:bg-[#f6fafc]"
              }`}
            >
              <span className="font-bold text-[#14374a]">{opt.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${badgeClass}`}>
                {badge}
              </span>
            </button>
          );
        })}
      </div>

      <input type="hidden" name="document_type" value={docType} />
      {docMap.get(docType)?.review_note && (
        <p className="rounded-lg border border-[#ebc2be] bg-[#fff5f4] px-3 py-2 text-xs text-[#8C1D18]">
          Observación sobre este documento: {docMap.get(docType)?.review_note}
        </p>
      )}
      <label className={label}>
        Archivo PDF, JPG o PNG para{" "}
        <strong className="text-[#005580]">
          {DOC_TYPE_OPTIONS.find((d) => d.value === docType)?.label}
        </strong>{" "}
        (máximo 10 MB)
        <input
          className={input}
          name={uploadedPath ? undefined : "document"}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          required={!uploadedPath}
          onChange={onFileChange}
          disabled={uploading}
        />
      </label>
      {uploading && <p className="text-xs font-semibold text-[#006699]">Cargando documento al almacenamiento privado…</p>}
      {fileName && <p className="text-xs font-semibold text-[#17634a]">Archivo listo: {fileName}</p>}
      {uploadErr && <p className="text-xs text-[#8C1D18]">{uploadErr}</p>}
      <FieldError state={state} />
      <button className={btn} disabled={pending || uploading}>
        {pending
          ? "Registrando…"
          : docMap.has(docType)
            ? "Reemplazar documento"
            : "Subir documento privado"}
      </button>
    </form>
  );
}

export function ProposalDocumentReviewForm({ proposalId, documentId }: { proposalId: string; documentId: string }) {
  const [state, action, pending] = useActionState(reviewProposalDocument, {});
  return (
    <form action={action} className="mt-3 space-y-2 border-t border-[#d5e4ee] pt-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <input type="hidden" name="document_id" value={documentId} />
      <label className={label}>
        Observación (si requiere corrección)
        <input className={input} name="review_note" maxLength={500} />
      </label>
      <FieldError state={state} />
      <div className="flex flex-wrap gap-2">
        <button className={btn} name="status" value="recibido" disabled={pending}>
          Marcar correcto
        </button>
        <button className={btnGhost} name="status" value="requiere_correccion" disabled={pending}>
          Solicitar corrección
        </button>
      </div>
    </form>
  );
}

export function AppointmentRequestForm({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState(requestClubAppointment, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <label className={label}>
        Opción de fecha y hora
        <input className={input} type="datetime-local" name="slot1" required />
      </label>
      <label className={label}>
        Otra opción (opcional)
        <input className={input} type="datetime-local" name="slot2" />
      </label>
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Enviando…" : "Solicitar cita"}
      </button>
    </form>
  );
}

export function AppointmentReviewForm({
  proposalId,
  appointmentId,
  defaultPlace,
  proposedSlots = [],
  currentScheduledAt,
  currentMode,
  currentLocation,
}: {
  proposalId: string;
  appointmentId: string;
  defaultPlace?: string;
  proposedSlots?: string[];
  currentScheduledAt?: string | null;
  currentMode?: string | null;
  currentLocation?: string | null;
}) {
  const [state, action, pending] = useActionState(decideClubAppointment, {});
  const [mode, setMode] = useState<"presencial" | "en_linea">(
    currentMode === "en_linea" ? "en_linea" : "presencial",
  );
  const [location, setLocation] = useState(
    currentLocation || defaultPlace || "Subdirección Académica / Sala 14 · Edificio 1",
  );
  const [scheduledLocal, setScheduledLocal] = useState(
    currentScheduledAt
      ? toMxLocalInputValue(currentScheduledAt)
      : proposedSlots[0]
        ? toMxLocalInputValue(proposedSlots[0])
        : "",
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <input type="hidden" name="appointment_id" value={appointmentId} />

      {proposedSlots.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-[#2b4d61]">
            Horarios propuestos por el estudiante (clic para elegir):
          </p>
          <div className="flex flex-wrap gap-2">
            {proposedSlots.map((slot, idx) => {
              const localVal = toMxLocalInputValue(slot);
              const isSelected = scheduledLocal === localVal;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setScheduledLocal(localVal)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                    isSelected
                      ? "border-[#006699] bg-[#006699] text-white"
                      : "border-[#c4d8e2] bg-white text-[#14374a] hover:bg-[#edf6fa]"
                  }`}
                >
                  Opción {idx + 1}: {formatMxDateTime(slot)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Fecha y hora de la junta conjunta (CDMX)
          <input
            className={input}
            type="datetime-local"
            name="scheduled_at"
            required
            value={scheduledLocal}
            onChange={(e) => setScheduledLocal(e.target.value)}
          />
        </label>
        <label className={label}>
          Modalidad de la reunión
          <select
            className={input}
            name="meeting_mode"
            value={mode}
            onChange={(e) => {
              const next = e.target.value === "en_linea" ? "en_linea" : "presencial";
              setMode(next);
              if (next === "en_linea" && !/^https?:\/\//i.test(location)) {
                setLocation("");
              } else if (next === "presencial" && !location) {
                setLocation(defaultPlace || "Subdirección Académica / Sala 14 · Edificio 1");
              }
            }}
          >
            <option value="presencial">Presencial en ESCOM</option>
            <option value="en_linea">En línea (videollamada)</option>
          </select>
        </label>
      </div>

      <label className={label}>
        {mode === "en_linea" ? "Enlace de la videollamada (Meet / Zoom / Teams)" : "Lugar exacto en ESCOM"}
        <input
          className={input}
          name="meeting_location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={300}
          placeholder={
            mode === "en_linea"
              ? "https://meet.google.com/..."
              : defaultPlace ?? "Subdirección Académica / Sala 14 · Edificio 1"
          }
        />
      </label>

      <label className={label}>
        Indicaciones adicionales para alumno y profesor (opcional)
        <input
          className={input}
          name="subdireccion_notes"
          maxLength={400}
          placeholder="Ej. Presentar plan de trabajo e identificaciones IPN vigentes"
        />
      </label>
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending
          ? "Guardando y notificando…"
          : currentScheduledAt
            ? "Reprogramar y notificar a alumno y profesor"
            : "Confirmar junta y notificar a ambos"}
      </button>
    </form>
  );
}

export function CompleteAppointmentButton({ proposalId, appointmentId }: { proposalId: string; appointmentId: string }) {
  const [state, action, pending] = useActionState(completeClubAppointment, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <FieldError state={state} />
      <button className={btnGhost} disabled={pending}>
        {pending ? "Guardando…" : "Marcar cita completada"}
      </button>
    </form>
  );
}

export function ClubPostForm({ clubId }: { clubId: string }) {
  const [state, action, pending] = useActionState(createClubPost, {});
  return (
    <form action={action} className="space-y-3.5 rounded-[24px] border border-[#dce9f1] bg-white p-4 shadow-[0_8px_28px_rgba(0,45,75,0.05)] sm:p-5">
      <input type="hidden" name="club_id" value={clubId} />
      <p className="text-sm font-bold text-[#19435b]">Comparte algo con el club</p>
      <input className={input} name="title" required minLength={4} maxLength={120} placeholder="Título de la publicación" />
      <textarea
        className={`${input} min-h-24 resize-y`}
        name="body"
        required
        minLength={10}
        maxLength={3000}
        placeholder="Una pregunta, idea o actualización…"
      />
      <ImageUploadField name="image" label="Imagen de la publicación (opcional · JPG, PNG o WEBP)" compact />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldError state={state} />
        <button className={btn} disabled={pending}>
          {pending ? "Publicando…" : "Publicar"}
        </button>
      </div>
    </form>
  );
}

export function DeleteClubPostButton({ clubId, postId }: { clubId: string; postId: string }) {
  return (
    <ActionForm
      action={deleteClubPost}
      fields={{ club_id: clubId, post_id: postId }}
      label="Eliminar publicación"
      variant="ghost"
    />
  );
}

export function ClubEditForm({
  club,
  isStaff,
  students,
  professors,
}: {
  club: {
    id: string;
    description: string;
    schedule: string | null;
    external_links: string | null;
    join_requirements: string | null;
    join_questions?: unknown;
    contact_email: string | null;
    contact_info: string | null;
    logo_url?: string | null;
    leader_id: string | null;
    advisor_id: string | null;
    active: boolean;
  };
  isStaff: boolean;
  students: { id: string; name: string }[];
  professors: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(updateClubDetails, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="club_id" value={club.id} />
      <label className={label}>
        Descripción
        <textarea className={`${input} min-h-24`} name="description" defaultValue={club.description} required minLength={10} maxLength={2000} />
      </label>
      <label className={label}>
        Horario y sede
        <input className={input} name="schedule" defaultValue={club.schedule ?? ""} maxLength={160} placeholder="Ej. Martes y jueves · 16:00 · Salón 2104" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Correo de contacto del club
          <input className={input} name="contact_email" type="email" defaultValue={club.contact_email ?? ""} maxLength={160} placeholder="club@ipn.mx" />
        </label>
        <label className={label}>
          Canal de contacto (Discord, cubículo, horario)
          <input className={input} name="contact_info" defaultValue={club.contact_info ?? ""} maxLength={400} placeholder="Ej. Discord oficial / Cubículo 2112" />
        </label>
      </div>
      <label className={label}>
        Enlaces externos (redes, repositorio o grupo)
        <input className={input} name="external_links" defaultValue={club.external_links ?? ""} maxLength={300} placeholder="https://..." />
      </label>
      <label className={label}>
        Indicaciones o enlace de filtro externo (opcional)
        <textarea
          className={`${input} min-h-16`}
          name="join_requirements"
          defaultValue={club.join_requirements ?? ""}
          maxLength={500}
          placeholder="Ej. Indica semestre o disponibilidad, o enlace a formulario complementario."
        />
      </label>
      <JoinQuestionnaireBuilder initial={parseJoinQuestions(club.join_questions)} />
      <ImageUploadField
        name="logo"
        label="Logo del club (opcional · JPG, PNG o WEBP)"
        initialImageUrl={club.logo_url ?? null}
        compact
      />
      {isStaff && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Cambiar alumno moderador / presidente
              <select className={input} name="leader_id" defaultValue={club.leader_id ?? ""}>
                <option value="">Conservar actual</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Cambiar profesor coordinador
              <select className={input} name="advisor_id" defaultValue={club.advisor_id ?? ""}>
                <option value="">Conservar actual</option>
                {professors.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#19384c]">
            <input type="hidden" name="active_field" value="1" />
            <input type="checkbox" name="active" defaultChecked={club.active} />
            Club activo en el directorio público
          </label>
        </>
      )}
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios del club"}
      </button>
    </form>
  );
}

export function ClubEventForm({ clubId }: { clubId: string }) {
  const [state, action, pending] = useActionState(createClubEvent, {});
  const [venuePreset, setVenuePreset] = useState("Auditorio");
  return (
    <form action={action} className="space-y-3 border-t border-[#edf2f5] pt-4">
      <input type="hidden" name="club_id" value={clubId} />
      <p className="text-xs font-extrabold uppercase tracking-wide text-[#006699]">Proponer evento del club</p>
      <label className={label}>
        Título
        <input className={input} name="title" required minLength={3} maxLength={140} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Inicio (CDMX)
          <input className={input} name="starts_at" type="datetime-local" required />
        </label>
        <label className={label}>
          Fin (opcional)
          <input className={input} name="ends_at" type="datetime-local" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Sede
          <select
            className={input}
            value={venuePreset}
            onChange={(e) => setVenuePreset(e.target.value)}
          >
            <option value="Auditorio">Auditorio</option>
            <option value="Sala 14">Sala 14</option>
            <option value="El domo">El domo</option>
            <option value="Canchas">Canchas</option>
            <option value="Explanada">Explanada</option>
            <option value="Otro">Otro espacio autorizado</option>
          </select>
        </label>
        {venuePreset === "Otro" ? (
          <label className={label}>
            Especifica el espacio
            <input
              className={input}
              name="location"
              required
              minLength={2}
              maxLength={140}
              placeholder="Ej. Laboratorio 2103"
            />
          </label>
        ) : (
          <input type="hidden" name="location" value={venuePreset} />
        )}
      </div>
      <label className={label}>
        Descripción
        <textarea className={`${input} min-h-16`} name="description" maxLength={500} />
      </label>
      <ImageUploadField name="image" label="Cartel o imagen del evento (opcional)" compact />
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Enviando…" : "Publicar / enviar evento"}
      </button>
    </form>
  );
}

export function ClubEventReviewButtons({ clubId, eventId }: { clubId: string; eventId: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <ActionForm action={reviewClubEvent} fields={{ club_id: clubId, event_id: eventId, decision: "aprobado" }} label="Aprobar evento" />
      <ActionForm action={reviewClubEvent} fields={{ club_id: clubId, event_id: eventId, decision: "rechazado" }} label="Rechazar" variant="ghost" />
    </div>
  );
}

export function DeleteClubEventButton({ clubId, eventId }: { clubId: string; eventId: string }) {
  return (
    <ActionForm
      action={deleteClubEvent}
      fields={{ club_id: clubId, event_id: eventId }}
      label="Eliminar evento"
      variant="ghost"
    />
  );
}
