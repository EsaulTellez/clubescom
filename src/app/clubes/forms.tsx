"use client";

import { useActionState } from "react";
import { btn, btnGhost, input, label } from "@/lib/ui";
import {
  approveProposal,
  completeClubAppointment,
  createProposal,
  createClubPost,
  decideClubAppointment,
  decideMembership,
  issueAdvisorCode,
  markInterest,
  requestMembership,
  requestClubAppointment,
  reviewProposalDocument,
  uploadProposalDocument,
  verifyAdvisorCode,
} from "./actions";
import type { ClubState } from "./format";

function FieldError({ state }: { state: ClubState }) {
  return <>
    {state.error && <p className="text-sm text-[#8C1D18]" role="alert">{state.error}</p>}
    {state.success && <p className="text-sm font-semibold text-[#17634a]" role="status">{state.success}</p>}
  </>;
}

export function ProposalForm() {
  const [state, action, pending] = useActionState(createProposal, {});
  return (
    <form action={action} className="space-y-3">
      <label className={label}>
        Nombre del club
        <input className={input} name="name" required minLength={3} maxLength={120} />
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
        Descripción
        <textarea className={`${input} min-h-28`} name="description" required minLength={10} maxLength={2000} />
      </label>
      <label className={label}>
        Enlace del plan (opcional)
        <input className={input} name="plan_url" type="url" placeholder="https://" />
      </label>
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Publicando…" : "Publicar propuesta"}
      </button>
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

export function ApproveButton({ proposalId }: { proposalId: string }) {
  return <ActionForm action={approveProposal} fields={{ proposal_id: proposalId }} label="Registrar club" />;
}

export function JoinButton({ clubId }: { clubId: string }) {
  return <ActionForm action={requestMembership} fields={{ club_id: clubId }} label="Solicitar unirme" />;
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
      <button className={btn} disabled={pending}>
        {pending ? "Emitiendo…" : "Emitir código de asesoría"}
      </button>
    </form>
  );
}

export function VerifyAdvisorCodeForm({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState(verifyAdvisorCode, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="proposal_id" value={proposalId} />
    <label className={label}>Código que compartió el profesor
      <input className={`${input} font-mono uppercase tracking-widest`} name="advisor_code" required minLength={6} maxLength={6} pattern="[A-Za-z0-9]{6}" autoComplete="off" />
    </label>
    <FieldError state={state} />
    <button className={btn} disabled={pending}>{pending ? "Validando…" : "Confirmar asesoría"}</button>
  </form>;
}

export function ProposalDocumentForm({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState(uploadProposalDocument, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="proposal_id" value={proposalId} />
    <label className={label}>Documento
      <select className={input} name="document_type" required defaultValue="credencial_ipn">
        <option value="credencial_ipn">Credencial IPN</option>
        <option value="boleta">Boleta</option>
        <option value="firma">Firma</option>
        <option value="vigencia_ims">Vigencia de derechos IMSS</option>
      </select>
    </label>
    <label className={label}>Archivo PDF, JPG o PNG (máximo 10 MB)
      <input className={input} name="document" type="file" accept="application/pdf,image/jpeg,image/png" required />
    </label>
    <FieldError state={state} />
    <button className={btn} disabled={pending}>{pending ? "Subiendo…" : "Subir documento privado"}</button>
  </form>;
}

export function ProposalDocumentReviewForm({ proposalId, documentId }: { proposalId: string; documentId: string }) {
  const [state, action, pending] = useActionState(reviewProposalDocument, {});
  return <form action={action} className="mt-3 space-y-2 border-t border-[#d5e4ee] pt-3">
    <input type="hidden" name="proposal_id" value={proposalId} />
    <input type="hidden" name="document_id" value={documentId} />
    <label className={label}>Observación (si requiere corrección)
      <input className={input} name="review_note" maxLength={500} />
    </label>
    <FieldError state={state} />
    <div className="flex flex-wrap gap-2">
      <button className={btn} name="status" value="recibido" disabled={pending}>Marcar correcto</button>
      <button className={btnGhost} name="status" value="requiere_correccion" disabled={pending}>Solicitar corrección</button>
    </div>
  </form>;
}

export function AppointmentRequestForm({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState(requestClubAppointment, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="proposal_id" value={proposalId} />
    <label className={label}>Opción de fecha y hora
      <input className={input} type="datetime-local" name="slot1" required />
    </label>
    <label className={label}>Otra opción (opcional)
      <input className={input} type="datetime-local" name="slot2" />
    </label>
    <FieldError state={state} />
    <button className={btn} disabled={pending}>{pending ? "Enviando…" : "Solicitar cita en Sala 14"}</button>
  </form>;
}

export function AppointmentReviewForm({ proposalId, appointmentId }: { proposalId: string; appointmentId: string }) {
  const [state, action, pending] = useActionState(decideClubAppointment, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="proposal_id" value={proposalId} />
    <input type="hidden" name="appointment_id" value={appointmentId} />
    <label className={label}>Fecha confirmada
      <input className={input} type="datetime-local" name="scheduled_at" required />
    </label>
    <FieldError state={state} />
    <button className={btn} disabled={pending}>{pending ? "Guardando…" : "Confirmar cita"}</button>
  </form>;
}

export function CompleteAppointmentButton({ proposalId, appointmentId }: { proposalId: string; appointmentId: string }) {
  const [state, action, pending] = useActionState(completeClubAppointment, {});
  return <form action={action} className="space-y-2">
    <input type="hidden" name="proposal_id" value={proposalId} />
    <input type="hidden" name="appointment_id" value={appointmentId} />
    <FieldError state={state} />
    <button className={btnGhost} disabled={pending}>{pending ? "Guardando…" : "Marcar cita completada"}</button>
  </form>;
}


export function ClubPostForm({ clubId }: { clubId: string }) {
  const [state, action, pending] = useActionState(createClubPost, {});
  return (
    <form action={action} className="space-y-3 rounded-[24px] border border-[#dce9f1] bg-white p-4 shadow-[0_8px_28px_rgba(0,45,75,0.05)] sm:p-5">
      <input type="hidden" name="club_id" value={clubId} />
      <p className="text-sm font-bold text-[#19435b]">Comparte algo con el club</p>
      <input className={input} name="title" required minLength={4} maxLength={120} placeholder="Título de la publicación" />
      <textarea className={`${input} min-h-24 resize-y`} name="body" required minLength={10} maxLength={3000} placeholder="Una pregunta, idea o actualización…" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldError state={state} />
        <button className={btn} disabled={pending}>{pending ? "Publicando…" : "Publicar"}</button>
      </div>
    </form>
  );
}
