import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { FlowRail } from "@/components/flow-rail";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { card } from "@/lib/ui";
import {
  AppointmentRequestForm,
  AppointmentReviewForm,
  ApproveButton,
  CompleteAppointmentButton,
  InterestButton,
  IssueAdvisorCodeForm,
  ProposalDocumentForm,
  ProposalDocumentReviewForm,
  VerifyAdvisorCodeForm,
} from "../../forms";
import { interestLabel, isUuid, kindLabel, safeHttpUrl, statusLabel } from "../../format";

export const dynamic = "force-dynamic";

type Proposal = {
  id: string;
  proposer_id: string;
  name: string;
  kind: string;
  description: string;
  plan_url: string | null;
  status: string;
  advisor_id: string | null;
  advisor_confirmed_at: Date | null;
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
const DOCUMENT_LABELS: Record<string, string> = {
  credencial_ipn: "Credencial IPN",
  boleta: "Boleta",
  firma: "Firma",
  vigencia_ims: "Vigencia de derechos IMSS",
};

function canReviewForClubs(user: Awaited<ReturnType<typeof getSession>>) {
  return Boolean(user && (user.role === "admin" || (user.role === "moderador" && user.area === "clubes_academicos")));
}
function canReviewForSubdireccion(user: Awaited<ReturnType<typeof getSession>>) {
  return Boolean(user && (user.role === "admin" || (user.role === "moderador" && user.area === "subdireccion_academica")));
}

export default async function PropuestaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await getSession();
  let proposal: Proposal | undefined;
  let interested = false;
  let documents: ProposalDoc[] = [];
  let appointments: Appointment[] = [];
  let dbDown = false;

  try {
    const result = await pool.query<Proposal>(
      `select p.id, p.proposer_id, p.name, p.kind, p.description, p.plan_url, p.status,
              p.advisor_id, p.advisor_confirmed_at, proposer.name as proposer_name,
              advisor.name as advisor_name, count(i.user_id)::int as interests, c.id as club_id
       from club_proposals p
       join users proposer on proposer.id = p.proposer_id
       left join users advisor on advisor.id = p.advisor_id
       left join club_interests i on i.proposal_id = p.id
       left join clubs c on c.proposal_id = p.id
       where p.id = $1
       group by p.id, proposer.name, advisor.name, c.id`,
      [id],
    );
    proposal = result.rows[0];
    if (proposal && user) {
      const mine = await pool.query(`select 1 from club_interests where proposal_id = $1 and user_id = $2`, [id, user.id]);
      interested = Boolean(mine.rowCount);
      if (interested || user.id === proposal.proposer_id || canReviewForSubdireccion(user) || canReviewForClubs(user)) {
        const docResult = await pool.query<ProposalDoc>(
          `select d.id, d.user_id, u.name, d.document_type, d.storage_path, d.status, d.review_note, d.reviewed_at
           from club_proposal_documents d join users u on u.id = d.user_id
           where d.proposal_id = $1 order by u.name, d.document_type`, [id],
        );
        documents = docResult.rows;
        const appointmentResult = await pool.query<Appointment>(
          `select id, status, requested_slots, scheduled_at, subdireccion_notes
           from club_appointments where proposal_id = $1 order by created_at desc`, [id],
        );
        appointments = appointmentResult.rows;
      }
    }
  } catch {
    dbDown = true;
  }

  if (dbDown) return <p className={card}>No se pudo consultar esta propuesta. Revisa el estado local de Supabase.</p>;
  if (!proposal) notFound();

  const plan = safeHttpUrl(proposal.plan_url);
  const proposer = user?.id === proposal.proposer_id;
  const clubReviewer = canReviewForClubs(user);
  const subdireccion = canReviewForSubdireccion(user);
  const canAdvise = user?.role === "profesor" && proposal.status === "en_documentacion";
  const canVerify = proposer && proposal.status === "en_documentacion";
  const stage = ["abierta", "en_documentacion", "en_validacion", "cita_pendiente", "cita_confirmada", "registrado"].indexOf(proposal.status);
  const docByUserAndType = new Set(documents.map((doc) => `${doc.user_id}:${doc.document_type}`));
  const requiredDocs = ["credencial_ipn", "boleta", "firma", "vigencia_ims"];
  const ownDocs = documents.filter((doc) => doc.user_id === user?.id);
  const ownDocsComplete = requiredDocs.every((type) => docByUserAndType.has(`${user?.id}:${type}`));
  const latestAppointment = appointments[0];
  const supabase = user && documents.length ? await createSupabaseServerClient() : null;
  const signedDocs = await Promise.all(documents.map(async (doc) => {
    if (!supabase) return { ...doc, signedUrl: null };
    const { data } = await supabase.storage.from("club-documents").createSignedUrl(doc.storage_path, 600);
    return { ...doc, signedUrl: data?.signedUrl ?? null };
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/clubes" className="text-sm font-semibold text-[#006699] hover:underline">← Comunidades</Link>
      <Cover tone={proposal.kind} kicker={kindLabel(proposal.kind)} title={proposal.name} className="h-44 rounded-3xl sm:h-56" />
      <FlowRail current={stage < 0 ? 0 : stage} steps={[
        { title: "Propuesta", detail: "Interés de la comunidad." },
        { title: "Documentos", detail: "20 personas cargan los cuatro documentos." },
        { title: "Asesor", detail: "El profesor emite un código y la propuesta lo confirma." },
        { title: "Sala 14", detail: "Subdirección revisa documentos y fija la cita." },
        { title: "Registro", detail: "Tras la cita, clubes puede registrar el grupo." },
      ]} />

      <article className={`${card} space-y-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-wide text-[#006699]">{kindLabel(proposal.kind)}</p>
          <span className="rounded-full bg-[#e6f3fa] px-2 py-0.5 text-xs text-[#006699]">{statusLabel(proposal.status)}</span>
        </div>
        <h1 className="font-serif text-4xl tracking-tight">{proposal.name}</h1>
        <p className="whitespace-pre-wrap text-sm leading-6">{proposal.description}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-[#667085]">Propone</dt><dd>{proposal.proposer_name}</dd></div>
          <div><dt className="text-[#667085]">Interés</dt><dd>{interestLabel(proposal.interests)} / 20</dd></div>
          {proposal.advisor_name && <div><dt className="text-[#667085]">Profesor asesor</dt><dd>{proposal.advisor_name}</dd></div>}
          {plan && <div><dt className="text-[#667085]">Plan</dt><dd><a href={plan} className="break-all text-[#006699] underline" target="_blank" rel="noreferrer">{plan}</a></dd></div>}
        </dl>
        {proposal.club_id && <Link href={`/clubes/${proposal.club_id}`} className="inline-block text-sm font-medium text-[#006699] underline">Ver el club registrado</Link>}
      </article>

      <section className={`${card} space-y-4`}>
        <h2 className="font-semibold">Participar</h2>
        {!user && <p className="text-sm text-[#667085]"><Link href="/entrar" className="font-medium text-[#006699] underline">Entra</Link> para marcar interés, subir tus documentos o confirmar asesoría.</p>}
        {user && proposal.status === "abierta" && !interested && user.id !== proposal.proposer_id && <InterestButton proposalId={proposal.id} />}
        {interested && <p className="text-sm">Tu interés está registrado. El avance se calcula con votos reales y únicos.</p>}
        {proposal.interests >= 20 && proposal.status !== "abierta" && <p className="text-sm text-[#17634a]">La meta de 20 personas se alcanzó. Cada persona interesada continúa con su expediente.</p>}
        {canAdvise && <div className="space-y-2 border-t border-[#d5e4ee] pt-4"><h3 className="font-semibold">Profesor: confirma tu participación</h3><p className="text-sm text-[#667085]">Emite un código de seis caracteres y compártelo con quien propone. El código vence en 15 minutos.</p><IssueAdvisorCodeForm proposalId={proposal.id} /></div>}
        {canVerify && <div className="space-y-2 border-t border-[#d5e4ee] pt-4"><h3 className="font-semibold">Confirma al profesor asesor</h3><VerifyAdvisorCodeForm proposalId={proposal.id} /></div>}
        {user && interested && ["en_documentacion", "en_validacion", "cita_pendiente"].includes(proposal.status) && <div className="space-y-3 border-t border-[#d5e4ee] pt-4"><h3 className="font-semibold">Tu expediente (4 documentos)</h3><p className="text-sm text-[#667085]">Se guardan de forma privada en Supabase Storage. Subirlos no sustituye su revisión por Subdirección Académica.</p><ul className="grid gap-2 text-sm sm:grid-cols-2">{requiredDocs.map((type) => <li key={type} className="rounded-xl border border-[#d5e4ee] bg-white p-3">{DOCUMENT_LABELS[type]} · {ownDocs.some((doc) => doc.document_type === type) ? "recibido" : "pendiente"}</li>)}</ul><ProposalDocumentForm proposalId={proposal.id} /></div>}
        {proposer && proposal.status === "en_validacion" && ownDocsComplete && <div className="space-y-2 border-t border-[#d5e4ee] pt-4"><h3 className="font-semibold">Solicitar cita con Sala 14</h3><AppointmentRequestForm proposalId={proposal.id} /></div>}
        {subdireccion && signedDocs.length > 0 && <div className="space-y-3 border-t border-[#d5e4ee] pt-4"><h3 className="font-semibold">Expedientes para revisar</h3>{signedDocs.map((doc) => <article key={doc.id} className="rounded-xl border border-[#d5e4ee] bg-white p-3 text-sm"><p className="font-semibold">{doc.name} · {DOCUMENT_LABELS[doc.document_type] ?? doc.document_type}</p><p className="text-xs text-[#667085]">Estado: {doc.status}{doc.review_note ? ` · ${doc.review_note}` : ""}</p>{doc.signedUrl && <a className="mt-2 inline-block text-[#006699] underline" href={doc.signedUrl} target="_blank" rel="noreferrer">Abrir documento privado</a>}<ProposalDocumentReviewForm proposalId={proposal.id} documentId={doc.id} /></article>)}</div>}
      </section>

      {appointments.length > 0 && <section className={`${card} space-y-4`}><h2 className="font-semibold">Cita con Subdirección Académica / Sala 14</h2>{appointments.map((appointment) => <article key={appointment.id} className="space-y-3 rounded-xl border border-[#d5e4ee] bg-white p-4"><p className="text-sm"><strong>Estado:</strong> {statusLabel(appointment.status)}</p><p className="text-sm"><strong>Opciones:</strong> {appointment.requested_slots.map((slot) => new Date(slot).toLocaleString("es-MX")).join(" · ") || "sin opciones"}</p>{appointment.scheduled_at && <p className="text-sm"><strong>Confirmada:</strong> {new Date(appointment.scheduled_at).toLocaleString("es-MX")}</p>}{subdireccion && appointment.status === "pendiente" && <AppointmentReviewForm proposalId={proposal.id} appointmentId={appointment.id} />}{subdireccion && appointment.status === "confirmada" && <CompleteAppointmentButton proposalId={proposal.id} appointmentId={appointment.id} />}</article>)}</section>}

      {clubReviewer && proposal.status === "cita_confirmada" && latestAppointment?.status === "completada" && <section className={`${card} space-y-3`}><h2 className="font-semibold">Revisión de clubes académicos</h2><p className="text-sm text-[#667085]">Subdirección completó la cita. Puedes registrar el club y asignar la administración al alumno proponente dentro del club.</p><ApproveButton proposalId={proposal.id} /></section>}
      {clubReviewer && proposal.status !== "registrado" && proposal.interests >= 20 && proposal.status !== "cita_confirmada" && <p className={`${card} text-sm text-[#667085]`}>El registro institucional se habilita después de completar la cita con Subdirección Académica.</p>}
      {proposal.status === "registrado" && proposal.club_id && <p className={`${card} text-sm text-[#17634a]`}>Club registrado y disponible en el directorio.</p>}
    </div>
  );
}
