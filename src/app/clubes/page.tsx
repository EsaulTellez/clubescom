import Link from "next/link";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { card } from "@/lib/ui";
import { demoClubArt } from "@/lib/demo-art";
import { DirectClubForm, ProposalForm } from "./forms";
import {
  allowedClubKinds,
  canManageAnyClubs,
  interestLabel,
  kindLabel,
  statusLabel,
} from "./format";

export const dynamic = "force-dynamic";

type ClubRow = {
  id: string;
  name: string;
  kind: string;
  description: string;
  schedule: string | null;
  logo_url: string | null;
  active: boolean;
};

type ProposalRow = {
  id: string;
  name: string;
  kind: string;
  description: string;
  status: string;
  proposer_name: string;
  interests: number;
  formal_submitted_at: string | null;
  advisor_name: string | null;
  schedule_plan: string | null;
};

type ClubKpiRow = {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  members_count: number;
  pending_requests: number;
  posts_count: number;
  approved_events: number;
  pending_events: number;
  attendees_count: number;
};

type PendingMembershipRow = {
  club_id: string;
  user_id: string;
  club_name: string;
  user_name: string;
  user_role: string;
};

export default async function ClubesPage() {
  const user = await getSession();
  const allowedKinds = allowedClubKinds(user);
  const canCreate = allowedKinds.length > 0;
  const isAreaStaff = canManageAnyClubs(user);
  const isSubdireccion =
    user?.role === "moderador" && (user.area === "subdireccion_academica" || user.area === "clubes_academicos");
  const isCulturales = user?.role === "moderador" && user.area === "clubes_culturales";

  let clubs: ClubRow[] = [];
  let proposals: ProposalRow[] = [];
  let formalRequests: ProposalRow[] = [];
  let clubKpis: ClubKpiRow[] = [];
  let pendingMemberships: PendingMembershipRow[] = [];
  const proposalStageCounts = { en_documentacion: 0, en_validacion: 0, cita_pendiente: 0, registrado: 0 };
  let sala14EventsCount = 0;
  let people: { id: string; name: string; role: string }[] = [];
  let dbDown = false;

  try {
    const clubResult = await pool.query<ClubRow>(
      `select id, name, kind, description, schedule, logo_url, active
       from clubs
       where active = true or ($1 and kind = any($2::text[]))
       order by active desc, name asc`,
      [isAreaStaff, allowedKinds.length > 0 ? allowedKinds : ["academico"]],
    );
    const proposalResult = await pool.query<ProposalRow>(
      `select p.id, p.name, p.kind, p.description, p.status,
              u.name as proposer_name,
              p.interested_count as interests,
              p.formal_submitted_at,
              adv.name as advisor_name,
              p.schedule_plan
       from club_proposals p
       join users u on u.id = p.proposer_id
       left join users adv on adv.id = p.advisor_id
       where p.status <> 'registrado'
       order by p.created_at desc`,
    );
    clubs = clubResult.rows;
    proposals = proposalResult.rows;

    if (canCreate) {
      const [peopleResult, formalResult, kpiResult, stageResult, pendingReqResult] = await Promise.all([
        pool.query<{ id: string; name: string; role: string }>(
          "select id, name, role from users where is_active and role in ('alumno', 'profesor') order by name",
        ),
        pool.query<ProposalRow>(
          `select p.id, p.name, p.kind, p.description, p.status,
                  u.name as proposer_name,
                  p.interested_count as interests,
                  p.formal_submitted_at,
                  adv.name as advisor_name,
                  p.schedule_plan
           from club_proposals p
           join users u on u.id = p.proposer_id
           left join users adv on adv.id = p.advisor_id
           where p.formal_submitted_at is not null
             and p.status <> 'registrado'
             and p.kind = any($1::text[])
           order by p.formal_submitted_at desc`,
          [allowedKinds],
        ),
        pool.query<ClubKpiRow>(
          `select c.id,
                  c.name,
                  c.kind,
                  c.active,
                  coalesce((select count(*) from memberships m where m.club_id = c.id and m.status = 'aceptada'), 0)::int as members_count,
                  coalesce((select count(*) from memberships m where m.club_id = c.id and m.status = 'pendiente'), 0)::int as pending_requests,
                  coalesce((select count(*) from club_posts cp where cp.club_id = c.id), 0)::int as posts_count,
                  coalesce((select count(*) from club_events ce where ce.club_id = c.id and ce.approval_status = 'aprobado'), 0)::int as approved_events,
                  coalesce((select count(*) from club_events ce where ce.club_id = c.id and ce.approval_status = 'pendiente'), 0)::int as pending_events,
                  coalesce((
                    select count(*)
                    from event_attendees ea
                    join club_events ce on ce.id = ea.event_id
                    where ea.event_kind = 'club' and ce.club_id = c.id
                  ), 0)::int as attendees_count
           from clubs c
           where c.kind = any($1::text[])
           order by c.active desc, members_count desc, c.name asc`,
          [allowedKinds],
        ),
        pool.query<{ status: string; total: number }>(
          `select status::text as status, count(*)::int as total
           from club_proposals
           where kind = any($1::text[])
           group by status`,
          [allowedKinds],
        ),
        pool.query<PendingMembershipRow>(
          `select c.id as club_id, m.user_id, c.name as club_name, u.name as user_name, u.role::text as user_role
           from memberships m
           join clubs c on c.id = m.club_id
           join users u on u.id = m.user_id
           where m.status = 'pendiente' and c.kind = any($1::text[])
           order by m.created_at desc
           limit 12`,
          [allowedKinds],
        ),
      ]);

      people = peopleResult.rows;
      formalRequests = formalResult.rows;
      clubKpis = kpiResult.rows;
      pendingMemberships = pendingReqResult.rows;
      for (const row of stageResult.rows) {
        if (row.status in proposalStageCounts) {
          proposalStageCounts[row.status as keyof typeof proposalStageCounts] = Number(row.total);
        }
      }

      if (isSubdireccion) {
        const sala14 = await pool.query<{ total: number }>(
          `select count(*)::int as total
           from space_events se
           join spaces s on s.id = se.space_id
           where lower(trim(s.name)) = 'sala 14'`,
        );
        sala14EventsCount = Number(sala14.rows[0]?.total ?? 0);
      }
    }
  } catch {
    dbDown = true;
  }

  const canPropose = user?.role === "alumno" || user?.role === "profesor";
  const kpiTitle = isSubdireccion
    ? "KPIs de Clubes Académicos"
    : isCulturales
      ? "KPIs de Clubes Culturales y Deportivos"
      : "KPIs de Clubes ESCOM";
  const totalActiveClubs = clubKpis.filter((c) => c.active).length;
  const totalMembers = clubKpis.reduce((acc, c) => acc + c.members_count, 0);
  const totalPendingRequests = clubKpis.reduce((acc, c) => acc + c.pending_requests, 0);
  const totalApprovedEvents = clubKpis.reduce((acc, c) => acc + c.approved_events, 0);
  const totalAttendees = clubKpis.reduce((acc, c) => acc + c.attendees_count, 0);
  const totalPosts = clubKpis.reduce((acc, c) => acc + c.posts_count, 0);

  return (
    <div className="board-page">

      {dbDown && (
        <p className={card} role="status">
          No se pudo conectar con los datos locales. Inicia los servicios del proyecto y vuelve a cargar.
        </p>
      )}

      <div className="board-layout board-layout--clubs">
        <div className="board-main">
          {isAreaStaff && !dbDown && (
            <section id="kpis-clubes" className="scroll-mt-28 space-y-4 rounded-[12px] border border-[#cde0ea] bg-[#fffdf7] p-5 shadow-xs" aria-labelledby="kpi-heading">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e5edf2] pb-3">
                <div>
                  <p className="board-eyebrow">Tablero exclusivo de área</p>
                  <h2 id="kpi-heading" className="text-xl font-extrabold text-[#15394d]">{kpiTitle}</h2>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="board-label">{formalRequests.length} solicitudes formales</span>
                  <span className="board-label">{totalPendingRequests} ingresos pendientes</span>
                  {isSubdireccion && (
                    <Link href="/espacios" className="board-label hover:bg-[#e5f1f7]">
                      {sala14EventsCount} en Sala 14 →
                    </Link>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-[10px] border border-[#dce8ef] bg-[#f7fbfe] p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#5c7280]">Clubes activos</p>
                  <p className="mt-1 text-2xl font-extrabold text-[#15394d]">{totalActiveClubs}</p>
                </div>
                <div className="rounded-[10px] border border-[#dce8ef] bg-[#f7fbfe] p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#5c7280]">Miembros</p>
                  <p className="mt-1 text-2xl font-extrabold text-[#15394d]">{totalMembers}</p>
                </div>
                <div className="rounded-[10px] border border-[#dce8ef] bg-[#f7fbfe] p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#5c7280]">Solicitudes ingreso</p>
                  <p className="mt-1 text-2xl font-extrabold text-[#004d73]">{totalPendingRequests}</p>
                </div>
                <div className="rounded-[10px] border border-[#dce8ef] bg-[#f7fbfe] p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#5c7280]">Publicaciones</p>
                  <p className="mt-1 text-2xl font-extrabold text-[#15394d]">{totalPosts}</p>
                </div>
                <div className="rounded-[10px] border border-[#dce8ef] bg-[#f7fbfe] p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#5c7280]">Eventos aprobados</p>
                  <p className="mt-1 text-2xl font-extrabold text-[#15394d]">{totalApprovedEvents}</p>
                </div>
                <div className="rounded-[10px] border border-[#dce8ef] bg-[#f7fbfe] p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#5c7280]">Registros Asistiré</p>
                  <p className="mt-1 text-2xl font-extrabold text-[#006699]">{totalAttendees}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-[#45616e]">
                <span className="rounded-full bg-[#eef5f9] px-3 py-1 font-semibold">Propuestas en documentación: {proposalStageCounts.en_documentacion}</span>
                <span className="rounded-full bg-[#eef5f9] px-3 py-1 font-semibold">En validación: {proposalStageCounts.en_validacion}</span>
                <span className="rounded-full bg-[#eef5f9] px-3 py-1 font-semibold">Cita pendiente: {proposalStageCounts.cita_pendiente}</span>
                <span className="rounded-full bg-[#eef5f9] px-3 py-1 font-semibold">Registradas: {proposalStageCounts.registrado}</span>
              </div>

              {clubKpis.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#e5edf2] text-[11px] font-bold uppercase tracking-[.05em] text-[#5c7280]">
                        <th className="py-2 pr-3">Club</th>
                        <th className="py-2 pr-3">Tipo</th>
                        <th className="py-2 pr-3">Estado</th>
                        <th className="py-2 pr-3">Miembros</th>
                        <th className="py-2 pr-3">Ingreso pend.</th>
                        <th className="py-2 pr-3">Publicaciones</th>
                        <th className="py-2 pr-3">Eventos</th>
                        <th className="py-2">Asistiré</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef3f6] text-[#1f3b4d]">
                      {clubKpis.map((row) => (
                        <tr key={row.id}>
                          <td className="py-2 pr-3 font-bold">
                            <Link href={`/clubes/${row.id}`} className="text-[#004d73] hover:underline">{row.name}</Link>
                          </td>
                          <td className="py-2 pr-3">{kindLabel(row.kind)}</td>
                          <td className="py-2 pr-3">{row.active ? "Activo" : "Inactivo"}</td>
                          <td className="py-2 pr-3 font-semibold">{row.members_count}</td>
                          <td className="py-2 pr-3 font-semibold">{row.pending_requests}</td>
                          <td className="py-2 pr-3">{row.posts_count}</td>
                          <td className="py-2 pr-3">{row.approved_events}{row.pending_events > 0 ? ` (+${row.pending_events} pend.)` : ""}</td>
                          <td className="py-2 font-bold text-[#006699]">{row.attendees_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {pendingMemberships.length > 0 && (
                <div className="border-t border-[#e5edf2] pt-3">
                  <p className="text-xs font-extrabold uppercase tracking-[.06em] text-[#355464]">Solicitudes de ingreso pendientes en tus clubes</p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {pendingMemberships.map((req) => (
                      <li key={`${req.club_id}-${req.user_id}`} className="flex items-center justify-between gap-2 rounded-[8px] border border-[#dce8ef] bg-white px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-[#15394d]">{req.user_name}</p>
                          <p className="truncate text-[#5c7280]">{req.club_name} · {req.user_role}</p>
                        </div>
                        <Link href={`/clubes/${req.club_id}`} className="shrink-0 font-bold text-[#004d73] hover:underline">
                          Revisar →
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {isAreaStaff && !dbDown && (
            <section id="solicitudes-formales" className="scroll-mt-28 space-y-3 rounded-[12px] border border-[#cde0ea] bg-[#fffdf7] p-5 shadow-xs" aria-labelledby="formal-requests-heading">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="board-eyebrow">20+ votos · Documentos completos · Profesor confirmado · Registro enviado</p>
                  <h2 id="formal-requests-heading" className="text-lg font-extrabold text-[#15394d]">Solicitudes formales de nuevos clubes</h2>
                </div>
                <span className="board-label">{formalRequests.length} pendientes</span>
              </div>

              {formalRequests.length === 0 ? (
                <p className="text-sm text-[#5f6e78]">
                  Aún no hay solicitudes formales enviadas en tu ámbito. Llegan aquí cuando la propuesta reúne 20 votos, todos los participantes suben sus 4 documentos, el profesor coordinador confirma con su código y el alumno envía el registro formal.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {formalRequests.map((req) => (
                    <Link key={req.id} href={`/clubes/propuestas/${req.id}`} className="board-proposal-card">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="board-label">{kindLabel(req.kind)}</span>
                        <span className="board-label board-label--pinned">{statusLabel(req.status)}</span>
                      </div>
                      <h3 className="mt-2 text-base font-extrabold text-[#1b4053]">{req.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-[#45616e]">
                        <strong>Actividades:</strong> {req.schedule_plan || "Sin especificar"}
                      </p>
                      <p className="mt-2 text-xs text-[#5c7280]">
                        Alumno: {req.proposer_name} · Prof. coordinador: {req.advisor_name || "Confirmado"} · {interestLabel(req.interests)}
                      </p>
                      <p className="mt-2 text-xs font-extrabold text-[#004d73]">Revisar expediente y coordinar cita →</p>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          <section id="clubes-activos" className="scroll-mt-28" aria-labelledby="clubs-heading">
            <div className="board-section-heading">
              <div>
                <p className="board-eyebrow">Conoce y participa</p>
                <h2 id="clubs-heading">Clubes activos</h2>
                <p>Comunidades con actividades y horarios dentro de ESCOM.</p>
              </div>
              <span className="board-label">{clubs.filter((c) => c.active).length} {clubs.filter((c) => c.active).length === 1 ? "club" : "clubes"}</span>
            </div>

            {clubs.length === 0 && !dbDown && (
              <p className={`${card} text-sm text-[#5f6e78]`}>Todavía no hay clubes activos.</p>
            )}

            <div className="board-club-grid">
              {clubs.map((club) => {
                const art = club.logo_url ?? demoClubArt(club.name);
                return (
                  <Link key={club.id} href={`/clubes/${club.id}`} className="board-club-card">
                    <div className="board-club-card__top">
                      <span className="board-label">{kindLabel(club.kind)}</span>
                      <span className="text-[.68rem] font-bold uppercase tracking-[.1em] text-[#78868a]">
                        {club.active ? "ESCOM · Club" : "Inactivo"}
                      </span>
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
          {canCreate && <section className="board-sidecard space-y-3">
            <p className="board-eyebrow">
              {isSubdireccion ? "Subdirección Académica" : isCulturales ? "Clubes Culturales y Deportivos" : "Área de clubes"}
            </p>
            <h2>{isSubdireccion ? "Registrar club académico" : "Registrar club directamente"}</h2>
            <p className="text-sm text-[#5f6e78]">Registra un club reconocido y asigna a sus responsables, sin pasar por votación.</p>
            <DirectClubForm
              students={people.filter((p) => p.role === "alumno")}
              professors={people.filter((p) => p.role === "profesor")}
              allowedKinds={allowedKinds}
            />
          </section>}
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
