import Link from "next/link";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { card } from "@/lib/ui";
import { demoClubArt } from "@/lib/demo-art";
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

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-[#18384c]">Encuentra tu comunidad</h2>
            <p className="mt-1 text-sm text-[#657787]">Personas, ideas y actividades para hacer ESCOM más tuya.</p>
          </div>
          <span className="rounded-full bg-[#e8f4f8] px-3 py-1.5 text-xs font-bold text-[#006699]">{clubs.length} clubes activos</span>
        </div>
        {clubs.length === 0 && !dbDown && (
          <p className="rounded-3xl border border-dashed border-[#cddfe8] bg-white/80 p-8 text-center text-sm text-[#667085]">Todavía no hay clubes activos.</p>
        )}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {clubs.map((club) => (
            <Link key={club.id} href={`/clubes/${club.id}`} className="group overflow-hidden rounded-[28px] border border-white/90 bg-white/90 shadow-[0_10px_34px_rgba(18,49,68,0.08)] transition duration-300 hover:-translate-y-1 hover:border-[#b5dce9] hover:shadow-[0_18px_40px_rgba(0,73,105,0.13)]">
              <div className="relative h-28 overflow-hidden bg-gradient-to-br from-[#006699] via-[#158bb2] to-[#b5e9ed]">
                <span className="absolute -right-5 -top-12 h-40 w-40 rounded-full border-[20px] border-white/15" />
                <span className="absolute -bottom-11 left-[40%] h-28 w-28 rounded-full bg-[#b4dbe9]/45 blur-sm" />
                <span className="absolute bottom-3 left-4 rounded-full border border-white/30 bg-white/20 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white backdrop-blur">{kindLabel(club.kind)}</span>
              </div>
              <div className="px-5 pb-5">
                <div className="-mt-9 flex items-end justify-between gap-2">
                  {demoClubArt(club.name) ? (
                    <img src={demoClubArt(club.name)!} alt={`Logo de ${club.name}`} className="h-[76px] w-[76px] rounded-[24px] border-4 border-white bg-white object-contain p-1 shadow-[0_6px_18px_rgba(24,54,74,0.16)]" />
                  ) : (
                    <span className="grid h-[76px] w-[76px] place-items-center rounded-[24px] border-4 border-white bg-gradient-to-br from-[#e7f5fa] to-[#c8e9f2] text-3xl font-extrabold text-[#006699] shadow-[0_6px_18px_rgba(24,54,74,0.16)]">{club.name.replace("Club de ", "").slice(0, 1)}</span>
                  )}
                  <span className="mb-1 rounded-full bg-[#f0f7fa] px-3 py-1.5 text-[11px] font-bold text-[#547082]">Comunidad ESCOM</span>
                </div>
                <h3 className="mt-3 text-xl font-extrabold tracking-tight text-[#19384c] group-hover:text-[#006699]">{club.name}</h3>
                <p className="mt-2 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-[#657787]">{club.description}</p>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#edf2f5] pt-3 text-xs">
                  <span className="min-w-0 truncate font-semibold text-[#547082]">{club.schedule?.trim() || "Horario por anunciar"}</span>
                  <span className="shrink-0 font-bold text-[#006699] transition group-hover:translate-x-1">Entrar al club →</span>
                </div>
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
