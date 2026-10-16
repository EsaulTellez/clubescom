import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { card } from "@/lib/ui";
import { AdvisorCodeForm, ApproveButton, InterestButton, SimulateButton } from "../../forms";
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
  advisor_code: string | null;
  proposer_name: string;
  advisor_name: string | null;
  interests: number;
  club_id: string | null;
};

export default async function PropuestaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const user = await getSession();
  let proposal: Proposal | undefined;
  let interested = false;
  let dbDown = false;

  try {
    const result = await pool.query<Proposal>(
      `select p.id, p.proposer_id, p.name, p.kind, p.description, p.plan_url, p.status,
              p.advisor_id, p.advisor_code,
              proposer.name as proposer_name,
              advisor.name as advisor_name,
              count(i.user_id)::int as interests,
              c.id as club_id
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
      const mine = await pool.query(
        `select 1 from club_interests where proposal_id = $1 and user_id = $2`,
        [id, user.id],
      );
      interested = Boolean(mine.rowCount);
    }
  } catch {
    dbDown = true;
  }

  if (dbDown) {
    return <p className={card}>No se pudo consultar la propuesta. Revisa que Postgres esté en marcha.</p>;
  }
  if (!proposal) notFound();

  const plan = safeHttpUrl(proposal.plan_url);
  const seesCode = Boolean(user && proposal.advisor_code && (user.id === proposal.proposer_id || user.role === "admin"));
  const canSimulate = Boolean(user && proposal.status === "abierta" && (user.id === proposal.proposer_id || user.role === "admin"));
  const canAdvise = user?.role === "profesor" && proposal.status === "en_seguimiento";
  const canApprove =
    proposal.status === "con_asesor" &&
    Boolean(proposal.advisor_id) &&
    Boolean(user && (user.role === "admin" || (user.role === "moderador" && user.area === "clubes_academicos")));

  return (
    <div className="space-y-6">
      <Link href="/clubes" className="text-sm text-[#006699] underline">
        Clubes
      </Link>
      <article className={`${card} space-y-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-wide text-[#006699]">{kindLabel(proposal.kind)}</p>
          <span className="rounded-full bg-[#e6f3fa] px-2 py-0.5 text-xs text-[#006699]">{statusLabel(proposal.status)}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{proposal.name}</h1>
        <p className="whitespace-pre-wrap text-sm leading-6">{proposal.description}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[#667085]">Propone</dt>
            <dd>{proposal.proposer_name}</dd>
          </div>
          <div>
            <dt className="text-[#667085]">Interés</dt>
            <dd>{interestLabel(proposal.interests)}</dd>
          </div>
          {proposal.advisor_name && (
            <div>
              <dt className="text-[#667085]">Asesor</dt>
              <dd>{proposal.advisor_name}</dd>
            </div>
          )}
          {plan && (
            <div>
              <dt className="text-[#667085]">Plan</dt>
              <dd>
                <a href={plan} className="break-all text-[#006699] underline" target="_blank" rel="noreferrer">
                  {plan}
                </a>
              </dd>
            </div>
          )}
        </dl>
        {proposal.club_id && (
          <Link href={`/clubes/${proposal.club_id}`} className="inline-block text-sm font-medium text-[#006699] underline">
            Ver el club registrado
          </Link>
        )}
      </article>

      {seesCode && (
        <section className={`${card} space-y-2`}>
          <h2 className="font-semibold">Código para el asesor</h2>
          <p className="font-mono text-lg tracking-[0.3em] text-[#006699]">{proposal.advisor_code}</p>
          <p className="text-sm text-[#667085]">Compártelo con un profesor. Solo esa persona puede asumirse como asesor.</p>
        </section>
      )}

      <section className={`${card} space-y-4`}>
        <h2 className="font-semibold">Participar</h2>
        {!user && (
          <p className="text-sm text-[#667085]">
            <Link href="/entrar" className="font-medium text-[#006699] underline">
              Entra
            </Link>{" "}
            para marcar interés o, si eres profesor, ingresar el código de asesor.
          </p>
        )}
        {user && proposal.status === "abierta" && !interested && <InterestButton proposalId={proposal.id} />}
        {user && interested && <p className="text-sm">Ya marcaste interés en esta propuesta.</p>}
        {canSimulate && (
          <div className="space-y-2 border-t border-[#d5e4ee] pt-4">
            <p className="text-sm text-[#667085]">
              Demostración local: pasa la propuesta a seguimiento y genera el código, sin crear cuentas de interesados.
            </p>
            <SimulateButton proposalId={proposal.id} />
          </div>
        )}
        {canAdvise && (
          <div className="space-y-2 border-t border-[#d5e4ee] pt-4">
            <p className="text-sm text-[#667085]">Si quien propone te compartió el código, ingrésalo para quedar como asesor.</p>
            <AdvisorCodeForm proposalId={proposal.id} />
          </div>
        )}
        {canApprove && (
          <div className="space-y-2 border-t border-[#d5e4ee] pt-4">
            <p className="text-sm text-[#667085]">
              La propuesta ya tiene asesor. Al registrarla se crea el club y quien propuso queda como responsable.
            </p>
            <ApproveButton proposalId={proposal.id} />
          </div>
        )}
        {user && proposal.status === "con_asesor" && !canApprove && (
          <p className="text-sm text-[#667085]">Falta que moderación de clubes académicos registre el club.</p>
        )}
      </section>
    </div>
  );
}
