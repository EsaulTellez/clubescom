"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { ImageUploadField } from "@/components/image-upload-field";
import { btn, btnGhost, input, label } from "@/lib/ui";
import {
  approveProposal,
  claimInactiveProposal,
  completeClubAppointment,
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
} from "./actions";
import { kindLabel, type ClubKind, type ClubState } from "./format";
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

export function FormalClubRequestForm({
  proposalId,
  objectives,
  schedulePlan,
  activitiesDetail,
  requestedSpaces,
  communityImpact,
  targetOfficeLabel,
}: {
  proposalId: string;
  objectives: string;
  schedulePlan: string;
  activitiesDetail: string;
  requestedSpaces: string;
  communityImpact: string;
  targetOfficeLabel: string;
}) {
  const [state, action, pending] = useActionState(submitFormalClubRequest, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <label className={label}>
        Objetivos del club
        <textarea
          className={`${input} min-h-20`}
          name="objectives"
          defaultValue={objectives}
          required
          minLength={5}
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
        />
      </label>
      <label className={label}>
        Detalle de actividades por ejecutar
        <textarea
          className={`${input} min-h-20`}
          name="activities_detail"
          defaultValue={activitiesDetail}
          maxLength={2000}
        />
      </label>
      <label className={label}>
        Espacios y tiempos solicitados en ESCOM
        <input
          className={input}
          name="requested_spaces"
          defaultValue={requestedSpaces}
          required
          minLength={3}
          maxLength={600}
          placeholder="Ej. Salón 2104 · Martes y jueves de 15:00 a 17:00 hrs"
        />
      </label>
      <label className={label}>
        Impacto comunitario
        <textarea
          className={`${input} min-h-16`}
          name="community_impact"
          defaultValue={communityImpact}
          maxLength={2000}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Opción 1 de fecha y hora para cita
          <input className={input} type="datetime-local" name="slot1" required />
        </label>
        <label className={label}>
          Opción 2 de fecha y hora (opcional)
          <input className={input} type="datetime-local" name="slot2" />
        </label>
      </div>
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
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

export function JoinButton({ clubId, joinRequirements }: { clubId: string; joinRequirements?: string | null }) {
  const [state, action, pending] = useActionState(requestMembership, {});
  if (!joinRequirements?.trim()) {
    return <ActionForm action={requestMembership} fields={{ club_id: clubId }} label="Solicitar unirme" />;
  }
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="club_id" value={clubId} />
      <p className="text-xs font-semibold text-[#264a60]">Requisitos de ingreso: {joinRequirements}</p>
      <textarea
        className={`${input} min-h-16 text-xs`}
        name="application_note"
        required
        minLength={3}
        maxLength={600}
        placeholder="Escribe tu respuesta a los requisitos de ingreso"
      />
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Enviando…" : "Solicitar unirme"}
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

export function ProposalDocumentForm({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState(uploadProposalDocument, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <label className={label}>
        Documento
        <select className={input} name="document_type" required defaultValue="credencial_ipn">
          <option value="credencial_ipn">Credencial IPN</option>
          <option value="boleta">Boleta</option>
          <option value="firma">Firma</option>
          <option value="vigencia_ims">Vigencia de derechos IMSS</option>
        </select>
      </label>
      <label className={label}>
        Archivo PDF, JPG o PNG (máximo 10 MB)
        <input className={input} name="document" type="file" accept="application/pdf,image/jpeg,image/png" required />
      </label>
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Subiendo…" : "Subir documento privado"}
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
}: {
  proposalId: string;
  appointmentId: string;
  defaultPlace?: string;
}) {
  const [state, action, pending] = useActionState(decideClubAppointment, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <label className={label}>
        Fecha y hora confirmada (para proponente y profesor coordinador)
        <input className={input} type="datetime-local" name="scheduled_at" required />
      </label>
      <label className={label}>
        Lugar o indicaciones de la cita
        <input
          className={input}
          name="subdireccion_notes"
          defaultValue={defaultPlace ?? "Sala 14 · Edificio 1"}
          maxLength={400}
        />
      </label>
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Guardando…" : "Confirmar cita"}
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
    contact_email: string | null;
    contact_info: string | null;
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
        Requisitos personalizados de ingreso (opcional)
        <textarea
          className={`${input} min-h-16`}
          name="join_requirements"
          defaultValue={club.join_requirements ?? ""}
          maxLength={500}
          placeholder="Ej. Indica tu semestre, por qué te interesa unirte y tu disponibilidad de horario."
        />
      </label>
      <label className={label}>
        Logo del club (opcional · JPG, PNG o WEBP)
        <input className={input} name="logo" type="file" accept="image/jpeg,image/png,image/webp" />
      </label>
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
  return (
    <form action={action} className="space-y-3 border-t border-[#edf2f5] pt-4">
      <input type="hidden" name="club_id" value={clubId} />
      <p className="text-xs font-extrabold uppercase tracking-wide text-[#006699]">Proponer evento del club</p>
      <label className={label}>
        Título
        <input className={input} name="title" required minLength={3} maxLength={140} />
      </label>
      <label className={label}>
        Fecha y hora
        <input className={input} name="starts_at" type="datetime-local" required />
      </label>
      <label className={label}>
        Lugar
        <input className={input} name="location" list="club-event-venues" required minLength={2} maxLength={140} placeholder="Salón, explanada o laboratorio" />
        <datalist id="club-event-venues"><option value="Auditorio" /><option value="Sala 14" /></datalist>
      </label>
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
