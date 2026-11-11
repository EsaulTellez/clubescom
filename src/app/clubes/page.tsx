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
              p.interested_count as interests
       from club_proposals p
       join users u on u.id = p.proposer_id
       where p.status <> 'registrado'
       order by p.created_at desc`,
    );
    clubs = clubResult.rows;
    proposals = proposalResult.rows;
  } catch {
    dbDown = true;
  }

  const canPropose = user?.role === "alumno" || user?.role === "profesor";

  return (
    <div className="board-page">

      {dbDown && (
        <p className={card} role="status">
          No se pudo conectar con los datos locales. Inicia los servicios del proyecto y vuelve a cargar.
        </p>
      )}

      <div className="board-layout board-layout--clubs">
        <div className="board-main">
          <section id="clubes-activos" className="scroll-mt-28" aria-labelledby="clubs-heading">
            <div className="board-section-heading">
              <div>
                <p className="board-eyebrow">Conoce y participa</p>
                <h2 id="clubs-heading">Clubes activos</h2>
                <p>Comunidades con actividades y horarios dentro de ESCOM.</p>
              </div>
              <span className="board-label">{clubs.length} {clubs.length === 1 ? "club" : "clubes"}</span>
            </div>

            {clubs.length === 0 && !dbDown && (
              <p className={`${card} text-sm text-[#5f6e78]`}>Todavía no hay clubes activos.</p>
            )}

            <div className="board-club-grid">
              {clubs.map((club) => {
                const art = demoClubArt(club.name);
                return (
                  <Link key={club.id} href={`/clubes/${club.id}`} className="board-club-card">
                    <div className="board-club-card__top">
                      <span className="board-label">{kindLabel(club.kind)}</span>
                      <span className="text-[.68rem] font-bold uppercase tracking-[.1em] text-[#78868a]">ESCOM · Club</span>
                    </div>
                    <div className="board-club-card__identity">
                      {art ? (
                        <img src={art} alt={`Logo de ${club.name}`} className="board-club-card__logo" />
                      ) : (
                        <span className="board-club-card__logo grid place-items-center text-xl font-extrabold text-[#24546a]" aria-hidden="true">{club.name.replace("Club de ", "").slice(0, 1)}</span>
                      )}
                      <h3>{club.name}</h3>
                    </div>
                    <p className="board-club-card__description line-clamp-3">{club.description}</p>
                    <div className="board-club-card__footer">
                      <span className="min-w-0 truncate">{club.schedule?.trim() || "Horario por anunciar"}</span>
                      <span className="shrink-0 font-extrabold text-[#004d73]">Abrir →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <section id="propuestas" className="scroll-mt-28" aria-labelledby="proposals-heading">
            <div className="board-section-heading">
              <div>
                <p className="board-eyebrow">Ideas que están creciendo</p>
                <h2 id="proposals-heading">Propuestas de la comunidad</h2>
                <p>Sigue el interés y los pasos para formar un club reconocido.</p>
              </div>
            </div>

            {proposals.length === 0 && !dbDown && (
              <p className={`${card} text-sm text-[#5f6e78]`}>Nadie ha publicado una propuesta todavía.</p>
            )}

            <div className="board-proposal-grid">
              {proposals.map((proposal) => {
                const progress = Math.min(100, Math.round((Number(proposal.interests) / 20) * 100));
                return (
                  <Link key={proposal.id} href={`/clubes/propuestas/${proposal.id}`} className="board-proposal-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="board-label">{kindLabel(proposal.kind)}</span>
                      <span className="board-label board-label--pinned">{statusLabel(proposal.status)}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-extrabold tracking-tight text-[#1b4053]">{proposal.name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#586b75]">{proposal.description}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-[#45616e]">
                      <span>{interestLabel(proposal.interests)}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="board-progress mt-2" role="progressbar" aria-label={`Interés para ${proposal.name}`} aria-valuemin={0} aria-valuemax={20} aria-valuenow={Math.min(Number(proposal.interests), 20)}>
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-3 text-xs text-[#697981]">La propone {proposal.proposer_name} · Meta: 20 interesados</p>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="board-sidebar grid gap-3">
          <section id="proponer-club" className="board-propose board-form-anchor scroll-mt-28">
            <p className="board-eyebrow">El tablero también es tuyo</p>
            <h2>Propón una comunidad</h2>
            {canPropose && (
              <>
                <p className="mt-2 text-sm leading-6 text-[#5f6e78]">
                  Comparte el nombre y la idea. Si reúne 20 interesados, el equipo podrá avanzar con asesoría y registro.
                </p>
                <div className="mt-4"><ProposalForm /></div>
              </>
            )}
            {!user && (
              <div className="mt-2 space-y-3 text-sm leading-6 text-[#5f6e78]">
                <p>Entra con tu correo institucional para proponer un club o mostrar interés.</p>
                <Link href="/entrar" className="board-shortcut">Entrar a ESCOM →</Link>
              </div>
            )}
            {user && !canPropose && (
              <p className="mt-2 text-sm leading-6 text-[#5f6e78]">Tu rol puede revisar propuestas; para crear una se necesita una cuenta de alumno o profesor.</p>
            )}
          </section>
          <section className="board-sidecard">
            <p className="board-eyebrow">Para tenerlo en cuenta</p>
            <h2>Una idea se vuelve club con la comunidad</h2>
            <p className="mt-2 text-sm leading-6 text-[#5f6e78]">Las propuestas pasan por interés, asesoría académica y validación institucional.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
