import Link from "next/link";
import { Cover } from "@/components/cover";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { card } from "@/lib/ui";
import { ProposalForm } from "./forms";
import { interestLabel, kindLabel, statusLabel } from "./format";

export const dynamic = "force-dynamic";

type ClubRow = {
  id: string;
  name: string;
  kind: string;
  description: string;
  schedule: string | null;
};

type ProposalRow = {
  id: string;
  name: string;
  kind: string;
  description: string;
  status: string;
  proposer_name: string;
  interests: number;
};

export default async function ClubesPage() {
  const user = await getSession();
  let clubs: ClubRow[] = [];
  let proposals: ProposalRow[] = [];
  let dbDown = false;

  try {
    const clubResult = await pool.query<ClubRow>(
      `select id, name, kind, description, schedule
       from clubs
       where active = true
       order by name asc`,
    );
    const proposalResult = await pool.query<ProposalRow>(
      `select p.id, p.name, p.kind, p.description, p.status,
              u.name as proposer_name,
              count(i.user_id)::int as interests
       from club_proposals p
       join users u on u.id = p.proposer_id
       left join club_interests i on i.proposal_id = p.id
       where p.status <> 'registrado'
       group by p.id, u.name
       order by p.created_at desc`,
    );
    clubs = clubResult.rows;
    proposals = proposalResult.rows;
  } catch {
    dbDown = true;
  }

  const canPropose = user?.role === "alumno" || user?.role === "profesor";

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="text-sm text-[#006699]">Vida estudiantil</p>
        <h1 className="font-serif text-4xl tracking-tight">Clubes</h1>
        <p className="max-w-2xl text-[#667085]">
          Directorio de clubes activos y propuestas que buscan interesados, asesor y registro.
        </p>
      </header>

      {dbDown && (
        <p className={card}>
          Postgres no responde. Levanta el contenedor con <code>docker compose up -d</code> y corre <code>npm run db:seed</code>.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Clubes activos</h2>
        {clubs.length === 0 && !dbDown && (
          <p className="text-sm text-[#667085]">Todavía no hay clubes activos.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {clubs.map((club) => (
            <Link key={club.id} href={`/clubes/${club.id}`} className={`${card} overflow-hidden p-0 hover:border-[#006699]`}>
              <Cover tone={club.kind} className="h-32" />
              <div className="p-4">
                <p className="text-xs uppercase tracking-wide text-[#006699]">{kindLabel(club.kind)}</p>
                <h3 className="mt-1 font-serif text-xl">{club.name}</h3>
                <p className="mt-2 line-clamp-3 text-sm text-[#667085]">{club.description}</p>
                <p className="mt-3 text-sm">{club.schedule?.trim() || "Sin horario publicado"}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Propuestas</h2>
        {proposals.length === 0 && !dbDown && (
          <p className="text-sm text-[#667085]">Nadie ha publicado una propuesta.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {proposals.map((proposal) => (
            <Link key={proposal.id} href={`/clubes/propuestas/${proposal.id}`} className={`${card} hover:border-[#006699]`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs uppercase tracking-wide text-[#006699]">{kindLabel(proposal.kind)}</p>
                <span className="rounded-full bg-[#e6f3fa] px-2 py-0.5 text-xs text-[#006699]">
                  {statusLabel(proposal.status)}
                </span>
              </div>
              <h3 className="mt-1 font-semibold">{proposal.name}</h3>
              <p className="mt-2 line-clamp-3 text-sm text-[#667085]">{proposal.description}</p>
              <p className="mt-3 text-sm">
                {interestLabel(proposal.interests)} · Propone {proposal.proposer_name}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className={`${card} space-y-4`}>
        <h2 className="text-lg font-semibold">Proponer un club</h2>
        {canPropose && (
          <>
            <p className="text-sm text-[#667085]">
              La propuesta queda abierta hasta reunir 20 interesados. Después un profesor ingresa el código de asesor.
            </p>
            <ProposalForm />
          </>
        )}
        {!user && (
          <p className="text-sm text-[#667085]">
            <Link href="/entrar" className="font-medium text-[#006699] underline">
              Entra
            </Link>{" "}
            con tu correo de alumno o profesor para publicar una propuesta o marcar interés.
          </p>
        )}
        {user && !canPropose && (
          <p className="text-sm text-[#667085]">
            Tu rol puede revisar propuestas, pero solo un alumno o un profesor puede crear una.
          </p>
        )}
      </section>
    </div>
  );
}
