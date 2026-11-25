import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { FlowRail } from "@/components/flow-rail";
import { getSession } from "@/lib/auth";
import { formatMxDateTime } from "@/lib/datetime";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { card } from "@/lib/ui";
import {
  AdvisorConfirmForm,
  AdvisorMeetingResponseForm,
  AppointmentReviewForm,
  ApproveButton,
  ClaimInactiveProposalButton,
  CompleteAppointmentButton,
  FormalClubRequestForm,
  InterestButton,
  IssueAdvisorCodeForm,
  ParticipantProfileForm,
  ParticipantSlotAvailabilityForm,
  ProposalDocumentForm,
  ProposalStaffDecisionForm,
  SendAdvisorEmailCodeForm,
  StaffProposeSlotsForm,
  VerifyAdvisorCodeForm,
  WithdrawInterestButton,
} from "../../forms";
import { canModerateClubKind, clubOfficeLabel, interestLabel, isUuid, kindLabel, safeHttpUrl, statusLabel } from "../../format";
import { ProposalDossierViewer, type DossierRosterPerson } from "./dossier-viewer";

import { getProposalContacts } from "../../proposal-contacts";

export const dynamic = "force-dynamic";

type Proposal = {
  id: string;
  proposer_id: string;
  name: string;
  kind: string;
  description: string;
  objectives: string;
  schedule_plan: string;
  activities_detail: string;
  requested_spaces: string;
  community_impact: string;
  plan_url: string | null;
  plan_file_path: string | null;
  review_observations: string | null;
  last_proposer_activity_at: Date;
  formal_submitted_at: Date | null;
  status: string;
  advisor_id: string | null;
  pending_advisor_id: string | null;
  advisor_confirmed_at: Date | null;
  pending_advisor_name: string | null;
  proposer_name: string;
  advisor_name: string | null;
  interests: number;
  club_id: string | null;
};
type ProposalDoc = {
  id: string;
  user_id: string;
  name: string;
  document_type: string;
  storage_path: string;
  status: string;
  review_note: string | null;
  reviewed_at: Date | null;
};
type Appointment = {
  id: string;
  status: string;
  requested_slots: string[];
  staff_proposed_slots: string[];
  proposer_available_slots: string[];
  advisor_available_slots: string[];
  proposer_note: string | null;
  scheduled_at: Date | null;
  subdireccion_notes: string | null;
  meeting_mode: string;
  meeting_location: string | null;
  advisor_confirmed_at: Date | null;
  advisor_note: string | null;
};
type RosterRow = {
  user_id: string;
  name: string;
  email: string | null;
  boleta: string | null;
  career: string;
  phone: string;
  is_proposer: boolean;
  docs_received: number;
  docs_json: {
    id: string;
    document_type: string;
    storage_path: string;
    status: string;
    review_note: string | null;
  }[];
};

export default async function PropuestaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await getSession();
  let proposal: Proposal | undefined;
  let interested = false;
  let documents: ProposalDoc[] = [];
  let appointments: Appointment[] = [];
  let roster: RosterRow[] = [];
  let myProfile: { career: string; phone: string } = { career: "", phone: "" };
  let advisorContactEmail: string | null = null;
  let proposerContactEmail: string | null = null;
  let summaryParticipantsCount = 1;
  let summaryCompleteDocsCount = 0;
  let summaryProposerComplete = false;
  let threshold = 20;
  let inactivityDays = 5;
  let dbDown = false;

  try {
    const [result, settingsResult, progressResult] = await Promise.all([
      pool.query<Proposal>(
        `select p.id, p.proposer_id, p.name, p.kind, p.description,
                p.objectives, p.schedule_plan, p.activities_detail, p.requested_spaces, p.community_impact,
                p.plan_url, p.plan_file_path, p.review_observations, p.last_proposer_activity_at,
                p.formal_submitted_at, p.status, p.advisor_id, p.pending_advisor_id, p.advisor_confirmed_at,
                pending_adv.name as pending_advisor_name,
                proposer.name as proposer_name,
                advisor.name as advisor_name, p.interested_count as interests, c.id as club_id
         from club_proposals p
         join users proposer on proposer.id = p.proposer_id
         left join users advisor on advisor.id = p.advisor_id
         left join users pending_adv on pending_adv.id = p.pending_advisor_id
         left join clubs c on c.proposal_id = p.id
         where p.id = $1`,
        [id],
      ),
      pool.query<{ key: string; value_int: number }>(
        `select key, value_int from system_settings where key in ('club_interest_threshold', 'club_claim_inactivity_days')`,
      ),
      pool.query<{ proposal_id: string; participants_count: number; participants_complete_docs: number; proposer_complete: boolean }>(
        `select proposal_id, participants_count, participants_complete_docs, proposer_complete
         from public.get_club_proposal_progress_summary()
         where proposal_id = $1`,
        [id],
      ),
    ]);

    if (progressResult.rows[0]) {
      summaryParticipantsCount = Number(progressResult.rows[0].participants_count);
      summaryCompleteDocsCount = Number(progressResult.rows[0].participants_complete_docs);
      summaryProposerComplete = Boolean(progressResult.rows[0].proposer_complete);
    }

    for (const row of settingsResult.rows) {
      const parsed = Number(row.value_int);
      if (Number.isFinite(parsed) && parsed > 0) {
        if (row.key === "club_interest_threshold") threshold = parsed;
        if (row.key === "club_claim_inactivity_days") inactivityDays = parsed;
      }
    }

    proposal = result.rows[0];
    if (proposal && user) {
      const mine = await pool.query(`select 1 from club_interests where proposal_id = $1 and user_id = $2`, [id, user.id]);
      interested = Boolean(mine.rowCount);
      const canReview = canModerateClubKind(user, proposal.kind);
      const isAdvisorOrInvited =
        user.id === proposal.advisor_id || user.id === proposal.pending_advisor_id;
      if (interested || user.id === proposal.proposer_id || isAdvisorOrInvited || canReview) {
        const supabase = await createSupabaseServerClient();
        const [docResult, appointmentResult, profileResult, rosterRpc] = await Promise.all([
          pool.query<ProposalDoc>(
            `select d.id, d.user_id, u.name, d.document_type, d.storage_path, d.status, d.review_note, d.reviewed_at
             from club_proposal_documents d join users u on u.id = d.user_id
             where d.proposal_id = $1 order by u.name, d.document_type`,
            [id],
          ),
          pool.query<Appointment>(
            `select id, status,
                    coalesce(requested_slots, '[]'::jsonb) as requested_slots,
                    coalesce(staff_proposed_slots, '[]'::jsonb) as staff_proposed_slots,
                    coalesce(proposer_available_slots, '[]'::jsonb) as proposer_available_slots,
                    coalesce(advisor_available_slots, '[]'::jsonb) as advisor_available_slots,
                    proposer_note,
                    scheduled_at, subdireccion_notes,
                    coalesce(meeting_mode, 'presencial') as meeting_mode,
                    meeting_location, advisor_confirmed_at, advisor_note
             from club_appointments where proposal_id = $1 order by created_at desc`,
            [id],
          ),
          pool.query<{ career: string; phone: string }>(
            `select career, phone from club_participant_profiles where proposal_id = $1 and user_id = $2 limit 1`,
            [id, user.id],
          ),
          supabase.rpc("get_proposal_roster_for_review", { p_proposal_id: id }),
        ]);
        documents = docResult.rows;
        appointments = appointmentResult.rows;
        if (profileResult.rows[0]) myProfile = profileResult.rows[0];
        if (!rosterRpc.error && Array.isArray(rosterRpc.data)) {
          roster = rosterRpc.data as RosterRow[];
        }
        if (canReview || user.id === proposal.proposer_id || isAdvisorOrInvited) {
          const contacts = await getProposalContacts(id);
          proposerContactEmail = contacts.find((person) => person.id === proposal?.proposer_id)?.email ?? null;
          advisorContactEmail = contacts.find((person) => person.id === proposal?.advisor_id)?.email ?? null;
        }
      }
    }
  } catch {
    dbDown = true;
  }

  if (dbDown) return <p className={card}>No se pudo consultar esta propuesta. Vuelve a intentarlo en un momento.</p>;
  if (!proposal) notFound();

  const plan = safeHttpUrl(proposal.plan_url);
  const proposer = user?.id === proposal.proposer_id;
  const isAssignedAdvisor = Boolean(user && proposal.advisor_id === user.id);
  const isInvitedAdvisor = Boolean(user && proposal.pending_advisor_id === user.id);
  const areaReviewer = canModerateClubKind(user, proposal.kind);
  const formalSubmitted = Boolean(proposal.formal_submitted_at);
  const canReviewFormal = areaReviewer && formalSubmitted;
  const targetOfficeLabel = clubOfficeLabel(proposal.kind);
  const defaultAppointmentPlace =
    proposal.kind === "academico"
      ? "Subdirección Académica / Sala 14 · Edificio 1"
      : "SSEIS · Coordinación de Clubes Culturales y Deportivos";

  const thresholdReached = Number(proposal.interests) >= threshold;
  const advisorConfirmed = Boolean(proposal.advisor_id && proposal.advisor_confirmed_at);

  const canSendAdvisorEmail =
    proposer && !advisorConfirmed && thresholdReached && ["en_documentacion", "en_validacion", "incompleta"].includes(proposal.status);
  const canAdvise =
    user?.role === "profesor" && !advisorConfirmed && thresholdReached && ["en_documentacion", "en_validacion", "incompleta"].includes(proposal.status);
  const canVerify =
    proposer && !advisorConfirmed && thresholdReached && ["en_documentacion", "en_validacion", "incompleta"].includes(proposal.status);

  const stage = ["abierta", "en_documentacion", "en_validacion", "cita_pendiente", "cita_confirmada", "registrado"].indexOf(proposal.status);
  const ownDocs = documents.filter((doc) => doc.user_id === user?.id);
  const totalParticipants = Math.max(roster.length, summaryParticipantsCount);
  const participantsWithCompleteDocs = summaryCompleteDocsCount;
  const allParticipantsDocsComplete =
    summaryProposerComplete && participantsWithCompleteDocs >= threshold;
  const readyForFormalSubmit =
    thresholdReached && advisorConfirmed && allParticipantsDocsComplete;

  const latestAppointment = appointments[0];
  const supabase = user && ((canReviewFormal && documents.length > 0) || proposal.plan_file_path) ? await createSupabaseServerClient() : null;
  const signedDocs = canReviewFormal
    ? await Promise.all(
        documents.map(async (doc) => {
          if (!supabase) return { ...doc, signedUrl: null };
          const { data } = await supabase.storage.from("club-documents").createSignedUrl(doc.storage_path, 600);
          return { ...doc, signedUrl: data?.signedUrl ?? null };
        }),
      )
    : [];
  const signedDocMap = new Map(signedDocs.map((d) => [d.id, d.signedUrl]));
  let signedPlanFileUrl: string | null = null;
  if (supabase && proposal.plan_file_path && (proposer || isAssignedAdvisor || areaReviewer)) {
    const { data } = await supabase.storage.from("club-documents").createSignedUrl(proposal.plan_file_path, 600);
    signedPlanFileUrl = data?.signedUrl ?? null;
  }

  const inactiveForClaim =
    proposal.last_proposer_activity_at &&
    Date.now() - new Date(proposal.last_proposer_activity_at).getTime() > inactivityDays * 24 * 60 * 60 * 1000;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/clubes" className="text-sm font-semibold text-[#006699] hover:underline">← Comunidades</Link>
      <Cover tone={proposal.kind} kicker={kindLabel(proposal.kind)} className="h-40 rounded-3xl sm:h-48" />
      <FlowRail current={stage < 0 ? 0 : stage} steps={[
        { title: "Propuesta", detail: `Meta de ${threshold} alumnos.` },
        { title: "Expedientes", detail: "Cada votante sube sus 4 docs y datos." },
        { title: "Profesor", detail: "Confirmación @ipn.mx en plataforma." },
        { title: "Solicitud y cita", detail: `${targetOfficeLabel} coordina junta.` },
        { title: "Registro", detail: `${targetOfficeLabel} da de alta el club.` },
      ]} />

      {proposal.review_observations && (
        <div role="alert" className="rounded-2xl border border-[#e3c28d] bg-[#fff8eb] p-4 text-sm text-[#6b4c1b]">
          <strong>Observaciones de revisión ({statusLabel(proposal.status)}):</strong> {proposal.review_observations}
        </div>
      )}

      <article className={`${card} space-y-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-wide text-[#006699]">{kindLabel(proposal.kind)}</p>
          <span className="rounded-full bg-[#e6f3fa] px-2 py-0.5 text-xs text-[#006699]">{statusLabel(proposal.status)}</span>
          {formalSubmitted && (
            <span className="rounded-full bg-[#e6f7ef] px-2 py-0.5 text-xs font-semibold text-[#17634a]">Registro formal enviado</span>
          )}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{proposal.name}</h1>
        <p className="whitespace-pre-wrap text-sm leading-6">{proposal.description}</p>

        {(proposal.objectives || proposal.schedule_plan || proposal.activities_detail || proposal.requested_spaces || proposal.community_impact) && (
          <div className="grid gap-3 border-t border-[#d5e4ee] pt-3 text-sm sm:grid-cols-2">
            {proposal.objectives && (
              <div>
                <h2 className="text-xs font-extrabold uppercase text-[#006699]">Objetivo</h2>
                <p className="mt-1 whitespace-pre-wrap text-[#52596a]">{proposal.objectives}</p>
              </div>
            )}
            {proposal.requested_spaces && (
              <div>
                <h2 className="text-xs font-extrabold uppercase text-[#006699]">Espacios y tiempos solicitados</h2>
                <p className="mt-1 whitespace-pre-wrap text-[#52596a]">{proposal.requested_spaces}</p>
              </div>
            )}
            {proposal.schedule_plan && (
              <div>
                <h2 className="text-xs font-extrabold uppercase text-[#006699]">Cronograma de actividades</h2>
                <p className="mt-1 whitespace-pre-wrap text-[#52596a]">{proposal.schedule_plan}</p>
              </div>
            )}
            {proposal.activities_detail && (
              <div>
                <h2 className="text-xs font-extrabold uppercase text-[#006699]">Detalle de actividades</h2>
                <p className="mt-1 whitespace-pre-wrap text-[#52596a]">{proposal.activities_detail}</p>
              </div>
            )}
            {proposal.community_impact && (
              <div className="sm:col-span-2">
                <h2 className="text-xs font-extrabold uppercase text-[#006699]">Contribución a la comunidad</h2>
                <p className="mt-1 whitespace-pre-wrap text-[#52596a]">{proposal.community_impact}</p>
              </div>
            )}
          </div>
        )}

        <dl className="grid gap-3 border-t border-[#e5edf2] pt-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[#667085]">Responsable estudiantil</dt>
            <dd className="font-medium">
              {proposal.proposer_name}
              {proposerContactEmail && (
                <span className="block text-xs text-[#4b6775]">{proposerContactEmail}</span>
              )}
            </dd>
          </div>
          <div><dt className="text-[#667085]">Respaldo estudiantil</dt><dd className="font-medium">{interestLabel(proposal.interests)} / {threshold}</dd></div>
          <div>
            <dt className="text-[#667085]">Expedientes completos (público)</dt>
            <dd className="font-medium">
              {participantsWithCompleteDocs} de {totalParticipants} participantes (mín. {threshold})
            </dd>
          </div>
          <div>
            <dt className="text-[#667085]">Área encargada del registro</dt>
            <dd className="font-medium">{targetOfficeLabel}</dd>
          </div>
          {proposal.advisor_name && (
            <div>
              <dt className="text-[#667085]">Profesor coordinador confirmado</dt>
              <dd className="font-medium">
                {proposal.advisor_name}
                {advisorContactEmail && (
                  <span className="block text-xs text-[#4b6775]">{advisorContactEmail}</span>
                )}
              </dd>
            </div>
          )}
          {!proposal.advisor_name && proposal.pending_advisor_name && (
            <div><dt className="text-[#667085]">Profesor invitado (pendiente de aceptar)</dt><dd>{proposal.pending_advisor_name}</dd></div>
          )}
          {plan && <div><dt className="text-[#667085]">Enlace del plan</dt><dd><a href={plan} className="break-all text-[#006699] underline" target="_blank" rel="noreferrer">{plan}</a></dd></div>}
          {signedPlanFileUrl && <div><dt className="text-[#667085]">Archivo del plan de trabajo</dt><dd><a href={signedPlanFileUrl} className="font-semibold text-[#006699] underline" target="_blank" rel="noreferrer">Descargar PDF del proyecto ejecutivo</a></dd></div>}
        </dl>
        {proposal.club_id && <Link href={`/clubes/${proposal.club_id}`} className="inline-block text-sm font-medium text-[#006699] underline">Ver el club registrado →</Link>}
      </article>

      <section className={`${card} space-y-4`}>
        <h2 className="font-semibold">Participar y avanzar etapa</h2>
        {!user && <p className="text-sm text-[#667085]"><Link href="/entrar" className="font-medium text-[#006699] underline">Entra</Link> con tu cuenta institucional para respaldar la iniciativa, subir tus documentos o confirmar coordinación.</p>}
        {user && user.role === "alumno" && proposal.status === "abierta" && !interested && user.id !== proposal.proposer_id && <InterestButton proposalId={proposal.id} />}
        {user && user.role === "alumno" && interested && !proposer && ["abierta", "en_documentacion", "en_validacion", "incompleta"].includes(proposal.status) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#cde3ee] bg-[#f4f9fc] p-3">
            <p className="text-sm text-[#19435b]">Tu respaldo estudiantil está registrado ({proposal.interests}/{threshold}).</p>
            <WithdrawInterestButton proposalId={proposal.id} />
          </div>
        )}
        {user && user.role === "alumno" && interested && !proposer && !formalSubmitted && inactiveForClaim && thresholdReached && !["registrado", "rechazada"].includes(proposal.status) && (
          <div className="rounded-xl border border-[#bcd6e4] bg-[#f4f9fc] p-4">
            <p className="mb-3 text-xs leading-relaxed text-[#355260]">
              El responsable actual lleva más de {inactivityDays} días sin enviar el registro. Puedes tomar el mando como <strong>alumno moderador</strong> para completar el proyecto ejecutivo y enviar el registro sin perder los votos ni documentos reunidos.
            </p>
            <ClaimInactiveProposalButton proposalId={proposal.id} proposalName={proposal.name} />
          </div>
        )}
        {thresholdReached && proposal.status !== "abierta" && (
          <p className="text-sm text-[#17634a]">
            Meta de {threshold} alumnos alcanzada. Cada votante y quien propone completan su carrera, teléfono y 4 documentos; una vez confirmados junto con el profesor coordinador, el alumno proponente llena el registro formal con su cronograma.
          </p>
        )}

        {canSendAdvisorEmail && (
          <div className="space-y-2 border-t border-[#d5e4ee] pt-4">
            <h3 className="font-semibold">1. Invitar profesor coordinador (@ipn.mx)</h3>
            <p className="text-sm text-[#667085]">
              Ingresa el correo institucional @ipn.mx del profesor coordinador. Recibirá notificación en plataforma (y por correo cuando esté activo); podrá aceptar con un clic aquí mismo o darte el código de 6 caracteres.
            </p>
            <SendAdvisorEmailCodeForm proposalId={proposal.id} />
          </div>
        )}

        {isInvitedAdvisor && !advisorConfirmed && thresholdReached && (
          <div className="space-y-3 rounded-xl border border-[#b4d6e8] bg-[#eef7fc] p-4">
            <h3 className="font-semibold text-[#14374a]">Te invitaron como profesor coordinador</h3>
            <p className="text-sm text-[#355260]">
              Al aceptar quedarás vinculado oficialmente a la propuesta y podrás coordinar la reunión conjunta con {targetOfficeLabel}.
            </p>
            <AdvisorConfirmForm proposalId={proposal.id} />
          </div>
        )}

        {canAdvise && (
          <div className="space-y-2 border-t border-[#d5e4ee] pt-4">
            <h3 className="font-semibold">Profesor: generar código manualmente (opcional)</h3>
            <p className="text-sm text-[#667085]">Si lo prefieres, emite un código de seis caracteres para que el alumno responsable lo ingrese.</p>
            <IssueAdvisorCodeForm proposalId={proposal.id} />
          </div>
        )}

        {canVerify && (
          <div className="space-y-2 border-t border-[#d5e4ee] pt-4">
            <h3 className="font-semibold">¿Tu profesor te compartió un código de 6 caracteres?</h3>
            <VerifyAdvisorCodeForm proposalId={proposal.id} />
          </div>
        )}

        {user && (interested || proposer) && ["en_documentacion", "en_validacion", "cita_pendiente", "incompleta"].includes(proposal.status) && (
          <div className="space-y-3 border-t border-[#d5e4ee] pt-4">
            <h3 className="font-semibold">2. Tu expediente individual (datos y 4 documentos)</h3>
            <p className="text-sm text-[#667085]">
              Expedientes completos del grupo: <strong>{participantsWithCompleteDocs} de {totalParticipants}</strong> participantes. Completa tu carrera, teléfono y los cuatro archivos.
            </p>
            <ParticipantProfileForm
              proposalId={proposal.id}
              career={myProfile.career}
              phone={myProfile.phone}
            />
            <ProposalDocumentForm proposalId={proposal.id} existingDocs={ownDocs} />
          </div>
        )}

        {proposer && (!formalSubmitted || proposal.status === "incompleta") && ["en_documentacion", "en_validacion", "incompleta"].includes(proposal.status) && (
          <div id="registro-formal" className="scroll-mt-32 space-y-3 border-t border-[#d5e4ee] pt-4">
            <h3 className="font-semibold">3. Registro formal, cronograma de actividades y propuesta de junta</h3>
            <ul className="grid gap-1.5 rounded-xl border border-[#d6e4ed] bg-[#f8fbfd] p-3 text-xs text-[#314b59] sm:grid-cols-3">
              <li>{thresholdReached ? "✓" : "○"} Meta de votos: {proposal.interests} / {threshold}</li>
              <li>{allParticipantsDocsComplete ? "✓" : "○"} Expedientes completos: {participantsWithCompleteDocs} / {totalParticipants}</li>
              <li>{advisorConfirmed ? "✓" : "○"} Profesor coordinador: {advisorConfirmed ? proposal.advisor_name : "Pendiente"}</li>
            </ul>
            {readyForFormalSubmit ? (
              <FormalClubRequestForm
                proposalId={proposal.id}
                objectives={proposal.objectives}
                schedulePlan={proposal.schedule_plan}
                activitiesDetail={proposal.activities_detail}
                requestedSpaces={proposal.requested_spaces}
                communityImpact={proposal.community_impact}
                planUrl={proposal.plan_url}
                hasPlanFile={Boolean(proposal.plan_file_path)}
                targetOfficeLabel={targetOfficeLabel}
              />
            ) : (
              <p className="text-sm text-[#667085]">
                En cuanto los participantes completen sus datos y documentos y el profesor coordinador acepte la asesoría, aquí se desbloqueará el formulario único con cronograma anual, espacios solicitados y fechas para la junta con {targetOfficeLabel}.
              </p>
            )}
          </div>
        )}

        {areaReviewer && !formalSubmitted && proposal.status !== "registrado" && (
          <p className="border-t border-[#d5e4ee] pt-4 text-sm text-[#667085]">
            Esta propuesta aún está en etapa comunitaria y no ha enviado su registro formal a {targetOfficeLabel}. Solo cuando reúna votos, expedientes completos, profesor coordinador y envío formal pasará a tu bandeja de revisión y citas.
          </p>
        )}

        {roster.length > 0 && (proposer || isAssignedAdvisor || areaReviewer) && (
          <ProposalDossierViewer
            proposalId={proposal.id}
            canReviewFormal={canReviewFormal}
            roster={roster.map<DossierRosterPerson>((person) => ({
              user_id: person.user_id,
              name: person.name,
              email: person.email,
              boleta: person.boleta,
              career: person.career,
              phone: person.phone,
              is_proposer: person.is_proposer,
              docs_received: person.docs_received,
              docs: (person.docs_json ?? []).map((doc) => ({
                ...doc,
                signedUrl: signedDocMap.get(doc.id) ?? null,
              })),
            }))}
          />
        )}
      </section>

      {(formalSubmitted || appointments.length > 0) && (proposer || interested || isAssignedAdvisor || areaReviewer) && (
        <section className={`${card} space-y-4`}>
          <h2 className="font-semibold">Junta conjunta con {targetOfficeLabel}</h2>
          <p className="text-xs text-[#667085]">
            Convoca al alumno presidente ({proposal.proposer_name}) y al profesor coordinador ({proposal.advisor_name ?? "confirmado"}). {targetOfficeLabel} propone fechas disponibles y entre ambos eligen los horarios en que pueden asistir para acordar la cita.
          </p>

          {canReviewFormal && (!latestAppointment || latestAppointment.status === "pendiente") && (
            <StaffProposeSlotsForm
              proposalId={proposal.id}
              defaultPlace={defaultAppointmentPlace}
              existingSlots={latestAppointment?.staff_proposed_slots ?? []}
              existingMode={latestAppointment?.meeting_mode}
              existingLocation={latestAppointment?.meeting_location}
            />
          )}

          {appointments.map((appointment) => {
            const staffSlots = Array.isArray(appointment.staff_proposed_slots) ? appointment.staff_proposed_slots : [];
            const studentSlots = Array.isArray(appointment.proposer_available_slots) ? appointment.proposer_available_slots : [];
            const advisorSlots = Array.isArray(appointment.advisor_available_slots) ? appointment.advisor_available_slots : [];
            const advisorSet = new Set(advisorSlots);
            const matchingSlots = staffSlots.filter((s) => studentSlots.includes(s) && advisorSet.has(s));

            return (
              <article key={appointment.id} className="space-y-3 rounded-xl border border-[#d5e4ee] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm"><strong>Estado:</strong> {statusLabel(appointment.status)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {studentSlots.length > 0 && (
                      <span className="rounded-full bg-[#e9f4fa] px-2.5 py-0.5 text-xs font-bold text-[#005580]">
                        Alumno marcó {studentSlots.length} horario{studentSlots.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {advisorSlots.length > 0 && (
                      <span className="rounded-full bg-[#eaf7f0] px-2.5 py-0.5 text-xs font-bold text-[#17634a]">
                        Profesor marcó {advisorSlots.length} horario{advisorSlots.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {matchingSlots.length > 0 && appointment.status === "pendiente" && (
                      <span className="rounded-full bg-[#d8f3e4] px-2.5 py-0.5 text-xs font-extrabold text-[#14593e]">
                        ✓ {matchingSlots.length} coincidencia{matchingSlots.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>

                {staffSlots.length > 0 && (
                  <div className="space-y-1 text-xs text-[#3a5563]">
                    <p className="font-bold text-[#14374a]">Horarios propuestos por {targetOfficeLabel} (CDMX):</p>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {staffSlots.map((slot) => {
                        const sOk = studentSlots.includes(slot);
                        const aOk = advisorSet.has(slot);
                        return (
                          <li
                            key={slot}
                            className={`rounded-lg border px-2.5 py-1.5 ${
                              sOk && aOk
                                ? "border-[#9ad4b6] bg-[#eef9f3] font-bold text-[#14593e]"
                                : "border-[#dce7ee] bg-[#fafcfd]"
                            }`}
                          >
                            <span>{formatMxDateTime(slot)}</span>
                            <span className="ml-1.5 text-[11px] font-semibold">
                              {sOk && aOk
                                ? "· Coinciden ambos ✓"
                                : sOk
                                  ? "· Alumno ✓"
                                  : aOk
                                    ? "· Profesor ✓"
                                    : "· Sin respuesta aún"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {appointment.requested_slots.length > 0 && staffSlots.length === 0 && (
                  <p className="text-sm">
                    <strong>Preferencias iniciales del alumno (CDMX):</strong>{" "}
                    {appointment.requested_slots.map((slot) => formatMxDateTime(slot)).join(" · ")}
                  </p>
                )}

                {appointment.scheduled_at && (
                  <div className="space-y-1 rounded-lg border border-[#cbe2ee] bg-[#f4f9fc] p-3 text-sm">
                    <p>
                      <strong>Fecha y hora acordada (CDMX):</strong> {formatMxDateTime(appointment.scheduled_at)}
                    </p>
                    <p>
                      <strong>Modalidad:</strong> {appointment.meeting_mode === "en_linea" ? "En línea" : "Presencial"}
                    </p>
                    {appointment.meeting_location && (
                      <p>
                        <strong>{appointment.meeting_mode === "en_linea" ? "Enlace:" : "Lugar:"}</strong>{" "}
                        {/^https?:\/\//i.test(appointment.meeting_location) ? (
                          <a href={appointment.meeting_location} target="_blank" rel="noreferrer" className="text-[#006699] underline break-all">
                            {appointment.meeting_location}
                          </a>
                        ) : (
                          appointment.meeting_location
                        )}
                      </p>
                    )}
                  </div>
                )}
                {appointment.subdireccion_notes && (
                  <p className="text-sm text-[#45616e]"><strong>Indicaciones:</strong> {appointment.subdireccion_notes}</p>
                )}
                {appointment.proposer_note && (
                  <p className="text-sm text-[#2c4f63]"><strong>Nota del alumno presidente:</strong> {appointment.proposer_note}</p>
                )}
                {appointment.advisor_note && (
                  <p className="text-sm text-[#2c4f63]"><strong>Nota del profesor coordinador:</strong> {appointment.advisor_note}</p>
                )}

                {appointment.status === "pendiente" && staffSlots.length > 0 && proposer && (
                  <ParticipantSlotAvailabilityForm
                    proposalId={proposal.id}
                    roleLabel="Alumno presidente"
                    staffSlots={staffSlots}
                    mySelectedSlots={studentSlots}
                    otherPartySelectedSlots={advisorSlots}
                    otherPartyLabel="el profesor coordinador"
                    existingNote={appointment.proposer_note}
                  />
                )}

                {appointment.status === "pendiente" && staffSlots.length > 0 && isAssignedAdvisor && (
                  <ParticipantSlotAvailabilityForm
                    proposalId={proposal.id}
                    roleLabel="Profesor coordinador"
                    staffSlots={staffSlots}
                    mySelectedSlots={advisorSlots}
                    otherPartySelectedSlots={studentSlots}
                    otherPartyLabel="el alumno presidente"
                    existingNote={appointment.advisor_note}
                  />
                )}

                {isAssignedAdvisor && appointment.status === "confirmada" && (
                  <AdvisorMeetingResponseForm proposalId={proposal.id} existingNote={appointment.advisor_note} />
                )}

                {canReviewFormal && appointment.status === "pendiente" && (
                  <div className="border-t border-[#e3edf2] pt-3">
                    <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[#005580]">
                      Confirmar fecha definitiva de la junta
                    </p>
                    <AppointmentReviewForm
                      proposalId={proposal.id}
                      appointmentId={appointment.id}
                      defaultPlace={defaultAppointmentPlace}
                      proposedSlots={staffSlots.length > 0 ? staffSlots : appointment.requested_slots}
                      matchingSlots={matchingSlots}
                      currentMode={appointment.meeting_mode}
                      currentLocation={appointment.meeting_location}
                    />
                  </div>
                )}

                {canReviewFormal && appointment.status === "confirmada" && (
                  <div className="space-y-3">
                    <CompleteAppointmentButton proposalId={proposal.id} appointmentId={appointment.id} />
                    <details className="rounded-lg border border-[#d6e4ed] bg-[#fafcfd] p-3">
                      <summary className="cursor-pointer text-xs font-bold text-[#005580]">
                        Reprogramar fecha, modalidad o lugar de esta reunión
                      </summary>
                      <div className="mt-3">
                        <AppointmentReviewForm
                          proposalId={proposal.id}
                          appointmentId={appointment.id}
                          defaultPlace={defaultAppointmentPlace}
                          proposedSlots={staffSlots.length > 0 ? staffSlots : appointment.requested_slots}
                          matchingSlots={matchingSlots}
                          currentScheduledAt={appointment.scheduled_at?.toISOString() ?? null}
                          currentMode={appointment.meeting_mode}
                          currentLocation={appointment.meeting_location}
                        />
                      </div>
                    </details>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {canReviewFormal && proposal.status === "cita_confirmada" && latestAppointment?.status === "completada" && (
        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold">Alta institucional del club</h2>
          <p className="text-sm text-[#667085]">
            La junta conjunta con el alumno responsable y el profesor coordinador fue completada. Ya puedes aprobar y activar el club en el directorio de {targetOfficeLabel}.
          </p>
          <ApproveButton proposalId={proposal.id} />
        </section>
      )}

      {canReviewFormal && proposal.status !== "registrado" && (
        <section className={`${card} space-y-2`}>
          <h2 className="font-semibold">Dictamen sobre la solicitud ({targetOfficeLabel})</h2>
          <p className="text-sm text-[#667085]">
            Puedes marcar la solicitud como incompleta con observaciones para que el equipo subsane, o rechazarla con motivo.
          </p>
          <ProposalStaffDecisionForm proposalId={proposal.id} />
        </section>
      )}

      {proposal.status === "registrado" && proposal.club_id && (
        <p className={`${card} text-sm text-[#17634a]`}>Club registrado y disponible en el directorio.</p>
      )}
    </div>
  );
}
