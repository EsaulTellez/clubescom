"use client";

import { useActionState } from "react";
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
  sendAdvisorCodeToEmail,
  submitFormalClubRequest,
  updateClubDetails,
  updateProposalDetails,
  uploadProposalDocument,
  verifyAdvisorCode,
} from "./actions";
import { kindLabel, type ClubKind, type ClubState } from "./format";

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
        Descripción general
        <textarea className={`${input} min-h-20`} name="description" required minLength={10} maxLength={2000} />
      </label>
      <label className={label}>
        Objetivos del club
        <textarea
          className={`${input} min-h-20`}
          name="objectives"
          required
          minLength={5}
          maxLength={2000}
          placeholder="Metas formativas, académicas, culturales o deportivas"
        />
      </label>
      <label className={label}>
        Actividades a realizar y cronograma propuesto
        <textarea
          className={`${input} min-h-24`}
          name="schedule_plan"
          required
          minLength={10}
          maxLength={2000}
          placeholder="Talleres semanales, sesiones prácticas, torneos, concursos o eventos previstos por mes"
        />
      </label>
      <label className={label}>
        Impacto esperado en la comunidad ESCOM
        <textarea
          className={`${input} min-h-20`}
          name="community_impact"
          maxLength={2000}
          placeholder="Beneficio para estudiantes y participación institucional"
        />
      </label>
      <label className={label}>
        Archivo del plan de trabajo en PDF (opcional, máx. 10 MB)
        <input className={input} name="plan_file" type="file" accept="application/pdf" />
      </label>
      <label className={label}>
        Enlace externo del plan (opcional)
        <input className={input} name="plan_url" type="url" placeholder="https://" />
      </label>
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Publicando…" : "Publicar propuesta"}
      </button>
    </form>
  );
}

export function UpdateProposalActivitiesForm({
  proposalId,
  objectives,
  schedulePlan,
  communityImpact,
}: {
  proposalId: string;
  objectives: string;
  schedulePlan: string;
  communityImpact: string;
}) {
  const [state, action, pending] = useActionState(updateProposalDetails, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <label className={label}>
        Objetivos del club
        <textarea className={`${input} min-h-20`} name="objectives" defaultValue={objectives} required minLength={5} maxLength={2000} />
      </label>
      <label className={label}>
        Actividades a realizar y cronograma
        <textarea className={`${input} min-h-24`} name="schedule_plan" defaultValue={schedulePlan} required minLength={10} maxLength={2000} />
      </label>
      <label className={label}>
        Impacto en la comunidad
        <textarea className={`${input} min-h-16`} name="community_impact" defaultValue={communityImpact} maxLength={2000} />
      </label>
      <FieldError state={state} />
      <button className={btnGhost} disabled={pending}>
        {pending ? "Guardando…" : "Guardar actividades de la propuesta"}
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

export function ClaimInactiveProposalButton({ proposalId }: { proposalId: string }) {
  return (
    <ActionForm
      action={claimInactiveProposal}
      fields={{ proposal_id: proposalId }}
      label="Tomar iniciativa de la propuesta"
      variant="ghost"
    />
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
  communityImpact,
  targetOfficeLabel,
}: {
  proposalId: string;
  objectives: string;
  schedulePlan: string;
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
        Actividades a realizar (obligatorio para revisión de {targetOfficeLabel})
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
        <input className={input} name="location" required minLength={2} maxLength={140} placeholder="Salón, explanada o laboratorio" />
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
