import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { FlowRail } from "@/components/flow-rail";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { card } from "@/lib/ui";
import {
  AppointmentReviewForm,
  ApproveButton,
  ClaimInactiveProposalButton,
  CompleteAppointmentButton,
  FormalClubRequestForm,
  InterestButton,
  IssueAdvisorCodeForm,
  ParticipantProfileForm,
  ProposalDocumentForm,
  ProposalDocumentReviewForm,
  ProposalStaffDecisionForm,
  SendAdvisorEmailCodeForm,
  UpdateProposalActivitiesForm,
  VerifyAdvisorCodeForm,
} from "../../forms";
import { canModerateClubKind, interestLabel, isUuid, kindLabel, safeHttpUrl, statusLabel } from "../../format";

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
  scheduled_at: Date | null;
  subdireccion_notes: string | null;
};
type ParticipantRow = {
  user_id: string;
  name: string;
};
const DOCUMENT_LABELS: Record<string, string> = {
  credencial_ipn: "Credencial IPN",
  boleta: "Boleta",
  firma: "Firma",
  vigencia_ims: "Vigencia de derechos IMSS",
};

export default async function PropuestaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await getSession();
  let proposal: Proposal | undefined;
  let interested = false;
  let documents: ProposalDoc[] = [];
  let appointments: Appointment[] = [];
  let participants: ParticipantRow[] = [];
  let myProfile: { career: string; phone: string } = { career: "", phone: "" };
  let summaryParticipantsCount = 1;
  let summaryCompleteDocsCount = 0;
  let threshold = 20;
  let inactivityDays = 5;
  let dbDown = false;

  try {
    const [result, settingsResult, progressResult] = await Promise.all([
      pool.query<Proposal>(
        `select p.id, p.proposer_id, p.name, p.kind, p.description,
                p.objectives, p.schedule_plan, p.activities_detail, p.requested_spaces, p.community_impact,
                p.plan_url, p.plan_file_path, p.review_observations, p.last_proposer_activity_at,
                p.formal_submitted_at, p.status, p.advisor_id, p.advisor_confirmed_at,
                pending_adv.name as pending_advisor_name,
                proposer.name as proposer_name,
                advisor.name as advisor_name, p.interested_count as interests, c.id as club_id
         from club_proposals p
         join users proposer on proposer.id = p.proposer_id
         left join users advisor on advisor.id = p.advisor_id
         left join users pending_adv on pending_adv.id = p.pending_advisor_id
         left join clubs c on c.proposal_id = p.id
         where p.id = $1 and (not $2 or p.kind = 'academico')`,
        [id, user?.role === "moderador" && user.area === "subdireccion_academica"],
      ),
      pool.query<{ key: string; value_int: number }>(
        `select key, value_int from system_settings where key in ('club_interest_threshold', 'club_claim_inactivity_days')`,
      ),
      pool.query<{ proposal_id: string; participants_count: number; participants_complete_docs: number }>(
        `select proposal_id, participants_count, participants_complete_docs
         from public.get_club_proposal_progress_summary()
         where proposal_id = $1`,
        [id],
      ),
    ]);

    if (progressResult.rows[0]) {
      summaryParticipantsCount = Number(progressResult.rows[0].participants_count);
      summaryCompleteDocsCount = Number(progressResult.rows[0].participants_complete_docs);
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
      if (interested || user.id === proposal.proposer_id || canReview) {
        const [docResult, appointmentResult, voterResult, profileResult] = await Promise.all([
          pool.query<ProposalDoc>(
            `select d.id, d.user_id, u.name, d.document_type, d.storage_path, d.status, d.review_note, d.reviewed_at
             from club_proposal_documents d join users u on u.id = d.user_id
             where d.proposal_id = $1 order by u.name, d.document_type`,
            [id],
          ),
          pool.query<Appointment>(
            `select id, status, requested_slots, scheduled_at, subdireccion_notes
             from club_appointments where proposal_id = $1 order by created_at desc`,
            [id],
          ),
          pool.query<ParticipantRow>(
            `select ci.user_id, u.name
             from club_interests ci
             join users u on u.id = ci.user_id
             where ci.proposal_id = $1
             order by ci.created_at asc`,
            [id],
          ),
          pool.query<{ career: string; phone: string }>(
            `select career, phone from club_participant_profiles where proposal_id = $1 and user_id = $2 limit 1`,
            [id, user.id],
          ),
        ]);
        documents = docResult.rows;
        appointments = appointmentResult.rows;
        if (profileResult.rows[0]) myProfile = profileResult.rows[0];
        const map = new Map<string, string>();
        map.set(proposal.proposer_id, proposal.proposer_name);
        for (const v of voterResult.rows) map.set(v.user_id, v.name);
        participants = Array.from(map.entries()).map(([user_id, name]) => ({ user_id, name }));
      }
    }
  } catch {
    dbDown = true;
  }

  if (dbDown) return <p className={card}>No se pudo consultar esta propuesta. Vuelve a intentarlo en un momento.</p>;
  if (!proposal) notFound();

  const plan = safeHttpUrl(proposal.plan_url);
  const proposer = user?.id === proposal.proposer_id;
  const areaReviewer = canModerateClubKind(user, proposal.kind);
  const formalSubmitted = Boolean(proposal.formal_submitted_at);
  const canReviewFormal = areaReviewer && formalSubmitted;
  const targetOfficeLabel =
    proposal.kind === "academico" ? "Subdirección Académica" : "Clubes Culturales y Deportivos";
  const defaultAppointmentPlace =
    proposal.kind === "academico"
      ? "Sala 14 (Subdirección Académica)"
      : "Coordinación de Clubes Culturales y Deportivos";

  const thresholdReached = Number(proposal.interests) >= threshold;
  const advisorConfirmed = Boolean(proposal.advisor_id && proposal.advisor_confirmed_at);
  const hasSchedule = Boolean(proposal.schedule_plan && proposal.schedule_plan.trim().length >= 10);
  const hasSpaces = Boolean(proposal.requested_spaces && proposal.requested_spaces.trim().length >= 3);
  const hasActivities = hasSchedule && hasSpaces;

  const canSendAdvisorEmail =
    proposer && !advisorConfirmed && thresholdReached && ["en_documentacion", "incompleta"].includes(proposal.status);
  const canAdvise =
    user?.role === "profesor" && !advisorConfirmed && thresholdReached && ["en_documentacion", "incompleta"].includes(proposal.status);
  const canVerify =
    proposer && !advisorConfirmed && thresholdReached && ["en_documentacion", "incompleta"].includes(proposal.status);

  const stage = ["abierta", "en_documentacion", "en_validacion", "cita_pendiente", "cita_confirmada", "registrado"].indexOf(proposal.status);
  const requiredDocs = ["credencial_ipn", "boleta", "firma", "vigencia_ims"];
  const ownDocs = documents.filter((doc) => doc.user_id === user?.id);
  const totalParticipants = Math.max(participants.length, summaryParticipantsCount);
  const participantsWithCompleteDocs = summaryCompleteDocsCount;
  const allParticipantsDocsComplete =
    totalParticipants >= 1 && participantsWithCompleteDocs >= totalParticipants;
  const readyForFormalSubmit =
    thresholdReached && advisorConfirmed && hasActivities && allParticipantsDocsComplete;

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
  let signedPlanFileUrl: string | null = null;
  if (supabase && proposal.plan_file_path && (proposer || areaReviewer)) {
    const { data } = await supabase.storage.from("club-documents").createSignedUrl(proposal.plan_file_path, 600);
    signedPlanFileUrl = data?.signedUrl ?? null;
  }

  const inactiveForClaim =
    proposal.last_proposer_activity_at &&
    Date.now() - new Date(proposal.last_proposer_activity_at).getTime() > inactivityDays * 24 * 60 * 60 * 1000;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/clubes" className="text-sm font-semibold text-[#006699] hover:underline">← Comunidades</Link>
      <Cover tone={proposal.kind} kicker={kindLabel(proposal.kind)} title={proposal.name} className="h-44 rounded-3xl sm:h-56" />
      <FlowRail current={stage < 0 ? 0 : stage} steps={[
        { title: "Propuesta", detail: `Meta de ${threshold} interesados.` },
        { title: "Expedientes", detail: "Todos los votantes cargan sus 4 documentos." },
        { title: "Profesor", detail: "Código enviado a su correo @ipn.mx." },
        { title: "Solicitud y cita", detail: `${targetOfficeLabel} revisa y cita.` },
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
        <h1 className="text-4xl tracking-tight">{proposal.name}</h1>
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
                <h2 className="text-xs font-extrabold uppercase text-[#006699]">Impacto en la comunidad</h2>
                <p className="mt-1 whitespace-pre-wrap text-[#52596a]">{proposal.community_impact}</p>
              </div>
            )}
          </div>
        )}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-[#667085]">Responsable estudiantil</dt><dd>{proposal.proposer_name}</dd></div>
          <div><dt className="text-[#667085]">Interés</dt><dd>{interestLabel(proposal.interests)} / {threshold}</dd></div>
          {proposal.advisor_name && <div><dt className="text-[#667085]">Profesor coordinador</dt><dd>{proposal.advisor_name}</dd></div>}
          {!proposal.advisor_name && proposal.pending_advisor_name && <div><dt className="text-[#667085]">Profesor con código pendiente</dt><dd>{proposal.pending_advisor_name}</dd></div>}
          {plan && <div><dt className="text-[#667085]">Enlace del plan</dt><dd><a href={plan} className="break-all text-[#006699] underline" target="_blank" rel="noreferrer">{plan}</a></dd></div>}
          {signedPlanFileUrl && <div><dt className="text-[#667085]">Archivo del plan de trabajo</dt><dd><a href={signedPlanFileUrl} className="font-semibold text-[#006699] underline" target="_blank" rel="noreferrer">Descargar PDF del plan de trabajo</a></dd></div>}
        </dl>
        {proposal.club_id && <Link href={`/clubes/${proposal.club_id}`} className="inline-block text-sm font-medium text-[#006699] underline">Ver el club registrado</Link>}
      </article>

      <section className={`${card} space-y-4`}>
        <h2 className="font-semibold">Participar</h2>
        {!user && <p className="text-sm text-[#667085]"><Link href="/entrar" className="font-medium text-[#006699] underline">Entra</Link> para marcar interés, subir tus documentos o confirmar asesoría.</p>}
        {user && proposal.status === "abierta" && !interested && user.id !== proposal.proposer_id && <InterestButton proposalId={proposal.id} />}
        {interested && <p className="text-sm">Tu interés está registrado. El avance se calcula con votos reales y únicos.</p>}
        {user && user.role === "alumno" && interested && !proposer && !formalSubmitted && inactiveForClaim && !["registrado", "rechazada"].includes(proposal.status) && (
          <div className="rounded-xl border border-[#bcd6e4] bg-[#f4f9fc] p-4">
            <p className="mb-3 text-xs leading-relaxed text-[#355260]">
              El responsable actual lleva más de {inactivityDays} días sin enviar el registro. Puedes tomar el mando como <strong>alumno moderador</strong> para completar el proyecto ejecutivo y enviar el registro sin perder los votos ni documentos reunidos.
            </p>
            <ClaimInactiveProposalButton proposalId={proposal.id} proposalName={proposal.name} />
          </div>
        )}
        {thresholdReached && proposal.status !== "abierta" && (
          <p className="text-sm text-[#17634a]">
            La meta de {threshold} personas se alcanzó. Quien propone y cada votante pueden continuar llenando sus cuatro documentos y confirmar al profesor coordinador.
          </p>
        )}

        {proposer && (!formalSubmitted || proposal.status === "incompleta") && !["registrado", "rechazada"].includes(proposal.status) && (
          <div className="space-y-3 border-t border-[#d5e4ee] pt-4">
            <h3 className="font-semibold">Proyecto ejecutivo del club (campos restantes para registro)</h3>
            <UpdateProposalActivitiesForm
              proposalId={proposal.id}
              objectives={proposal.objectives}
              schedulePlan={proposal.schedule_plan}
              activitiesDetail={proposal.activities_detail}
              requestedSpaces={proposal.requested_spaces}
              communityImpact={proposal.community_impact}
              planUrl={proposal.plan_url}
            />
          </div>
        )}

        {canSendAdvisorEmail && (
          <div className="space-y-2 border-t border-[#d5e4ee] pt-4">
            <h3 className="font-semibold">Enviar código al profesor coordinador (@ipn.mx)</h3>
            <p className="text-sm text-[#667085]">
              Ingresa el correo institucional del profesor coordinador. Se le enviará un código de 6 caracteres para que te lo proporcione y confirmes su aceptación.
            </p>
            <SendAdvisorEmailCodeForm proposalId={proposal.id} />
          </div>
        )}

        {canAdvise && (
          <div className="space-y-2 border-t border-[#d5e4ee] pt-4">
            <h3 className="font-semibold">Profesor: generar código directamente</h3>
            <p className="text-sm text-[#667085]">Emite un código de seis caracteres y compártelo con el alumno responsable para confirmar tu coordinación.</p>
            <IssueAdvisorCodeForm proposalId={proposal.id} />
          </div>
        )}

        {canVerify && (
          <div className="space-y-2 border-t border-[#d5e4ee] pt-4">
            <h3 className="font-semibold">Confirmar código del profesor coordinador</h3>
            <VerifyAdvisorCodeForm proposalId={proposal.id} />
          </div>
        )}

        {user && (interested || proposer) && ["en_documentacion", "en_validacion", "cita_pendiente", "incompleta"].includes(proposal.status) && (
          <div className="space-y-3 border-t border-[#d5e4ee] pt-4">
            <h3 className="font-semibold">Tu expediente individual (procedimiento ESCOM)</h3>
            <p className="text-sm text-[#667085]">
              Expedientes completos del grupo: <strong>{participantsWithCompleteDocs} de {totalParticipants}</strong> participantes. Cada alumno sube sus propios 4 documentos y sus datos de contacto.
            </p>
            <ParticipantProfileForm
              proposalId={proposal.id}
              career={myProfile.career}
              phone={myProfile.phone}
            />
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {requiredDocs.map((type) => {
                const mineDoc = ownDocs.find((doc) => doc.document_type === type);
                return (
                  <li key={type} className="rounded-xl border border-[#d5e4ee] bg-white p-3">
                    {DOCUMENT_LABELS[type]} · {mineDoc ? mineDoc.status : "pendiente"}
                    {mineDoc?.review_note ? ` (${mineDoc.review_note})` : ""}
                  </li>
                );
              })}
            </ul>
            <ProposalDocumentForm proposalId={proposal.id} />
          </div>
        )}

        {proposer && (!formalSubmitted || proposal.status === "incompleta") && ["en_documentacion", "en_validacion", "incompleta"].includes(proposal.status) && (
          <div className="space-y-3 border-t border-[#d5e4ee] pt-4">
            <h3 className="font-semibold">Enviar registro formal de nuevo club a {targetOfficeLabel}</h3>
            <ul className="grid gap-1 text-xs text-[#45616e] sm:grid-cols-2">
              <li>{thresholdReached ? "✓" : "○"} Meta de votos: {proposal.interests} / {threshold}</li>
              <li>{allParticipantsDocsComplete ? "✓" : "○"} Documentos de participantes: {participantsWithCompleteDocs} / {totalParticipants}</li>
              <li>{advisorConfirmed ? "✓" : "○"} Profesor coordinador confirmado: {advisorConfirmed ? proposal.advisor_name : "Pendiente"}</li>
              <li>{hasActivities ? "✓" : "○"} Cronograma y espacios solicitados definidos</li>
            </ul>
            {readyForFormalSubmit ? (
              <FormalClubRequestForm
                proposalId={proposal.id}
                objectives={proposal.objectives}
                schedulePlan={proposal.schedule_plan}
                activitiesDetail={proposal.activities_detail}
                requestedSpaces={proposal.requested_spaces}
                communityImpact={proposal.community_impact}
                targetOfficeLabel={targetOfficeLabel}
              />
            ) : (
              <p className="text-sm text-[#667085]">
                Cuando todos los requisitos anteriores estén completos, podrás enviar aquí la solicitud formal y proponer horarios para la cita con el profesor coordinador y {targetOfficeLabel}.
              </p>
            )}
          </div>
        )}

        {areaReviewer && !formalSubmitted && proposal.status !== "registrado" && (
          <p className="border-t border-[#d5e4ee] pt-4 text-sm text-[#667085]">
            Esta propuesta aún está en etapa comunitaria y no ha enviado su registro formal a {targetOfficeLabel}. Solo cuando reúna los 20 votos, expedientes completos, profesor coordinador y envío formal aparecerá en tu bandeja para revisión y cita.
          </p>
        )}

        {canReviewFormal && signedDocs.length > 0 && (
          <div className="space-y-3 border-t border-[#d5e4ee] pt-4">
            <h3 className="font-semibold">Expedientes enviados para revisión</h3>
            {signedDocs.map((doc) => (
              <article key={doc.id} className="rounded-xl border border-[#d5e4ee] bg-white p-3 text-sm">
                <p className="font-semibold">{doc.name} · {DOCUMENT_LABELS[doc.document_type] ?? doc.document_type}</p>
                <p className="text-xs text-[#667085]">Estado: {doc.status}{doc.review_note ? ` · ${doc.review_note}` : ""}</p>
                {doc.signedUrl && (
                  <a className="mt-2 inline-block text-[#006699] underline" href={doc.signedUrl} target="_blank" rel="noreferrer">
                    Abrir documento privado
                  </a>
                )}
                <ProposalDocumentReviewForm proposalId={proposal.id} documentId={doc.id} />
              </article>
            ))}
          </div>
        )}
      </section>

      {appointments.length > 0 && (formalSubmitted || proposer || interested) && (
        <section className={`${card} space-y-4`}>
          <h2 className="font-semibold">Cita con {targetOfficeLabel}</h2>
          <p className="text-xs text-[#667085]">
            Participan el alumno responsable ({proposal.proposer_name}) y el profesor coordinador ({proposal.advisor_name ?? "confirmado"}).
          </p>
          {appointments.map((appointment) => (
            <article key={appointment.id} className="space-y-3 rounded-xl border border-[#d5e4ee] bg-white p-4">
              <p className="text-sm"><strong>Estado:</strong> {statusLabel(appointment.status)}</p>
              <p className="text-sm">
                <strong>Opciones propuestas:</strong>{" "}
                {appointment.requested_slots.map((slot) => new Date(slot).toLocaleString("es-MX")).join(" · ") || "sin opciones"}
              </p>
              {appointment.scheduled_at && (
                <p className="text-sm"><strong>Confirmada:</strong> {new Date(appointment.scheduled_at).toLocaleString("es-MX")}</p>
              )}
              {appointment.subdireccion_notes && (
                <p className="text-sm text-[#45616e]"><strong>Indicaciones:</strong> {appointment.subdireccion_notes}</p>
              )}
              {canReviewFormal && appointment.status === "pendiente" && (
                <AppointmentReviewForm
                  proposalId={proposal.id}
                  appointmentId={appointment.id}
                  defaultPlace={defaultAppointmentPlace}
                />
              )}
              {canReviewFormal && appointment.status === "confirmada" && (
                <CompleteAppointmentButton proposalId={proposal.id} appointmentId={appointment.id} />
              )}
            </article>
          ))}
        </section>
      )}

      {canReviewFormal && proposal.status === "cita_confirmada" && latestAppointment?.status === "completada" && (
        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold">Alta institucional del club</h2>
          <p className="text-sm text-[#667085]">
            La cita con el estudiante responsable y el profesor coordinador fue completada. Ya puedes registrar el club en el directorio de {targetOfficeLabel}.
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
