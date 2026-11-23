import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { demoClubArt } from "@/lib/demo-art";
import type { DirectoryUserOption } from "@/components/searchable-user-picker";
import { card } from "@/lib/ui";
import {
  ClubesExplorer,
  type ClubDirectoryItem,
  type ClubKpiRow,
  type PendingMembershipRow,
  type ProposalDirectoryItem,
  type SseisDelegateRow,
} from "./clubs-explorer";
import {
  allowedClubKinds,
  canManageAnyClubs,
  isSseisDelegated,
  isSseisTitular,
} from "./format";

export const dynamic = "force-dynamic";

type RawClubRow = {
  id: string;
  name: string;
  kind: string;
  description: string;
  schedule: string | null;
  logo_url: string | null;
  active: boolean;
};

type RawProposalRow = {
  id: string;
  name: string;
  kind: string;
  description: string;
  objectives: string;
  status: string;
  proposer_id: string;
  proposer_name: string;
  interests: number;
  advisor_confirmed: boolean;
  advisor_name: string | null;
  schedule_plan: string | null;
  requested_spaces: string | null;
  formal_submitted_at: Date | null;
  last_proposer_activity_at: Date;
  viewer_interested: boolean;
};

export default async function ClubesPage() {
  const user = await getSession();
  const allowedKinds = allowedClubKinds(user);
  const canCreateDirect = allowedKinds.length > 0;
  const isAreaStaff = canManageAnyClubs(user);
  const sseisTitular = isSseisTitular(user);
  const sseisDelegated = isSseisDelegated(user);
  const isAcademicOnly =
    user?.role === "moderador" &&
    (user.area === "subdireccion_academica" || user.area === "clubes_academicos");
  const isCulturalOrSseis =
    (user?.role === "moderador" &&
      (user.area === "clubes_culturales" || user.area === "sseis")) ||
    sseisDelegated;
  const isSubdireccion = isAcademicOnly;
  const isCulturales = isCulturalOrSseis;

  let clubs: ClubDirectoryItem[] = [];
  let proposals: ProposalDirectoryItem[] = [];
  let formalRequests: ProposalDirectoryItem[] = [];
  let clubKpis: ClubKpiRow[] = [];
  let pendingMemberships: PendingMembershipRow[] = [];
  const proposalStageCounts = { en_documentacion: 0, en_validacion: 0, cita_pendiente: 0, registrado: 0 };
  let sala14EventsCount = 0;
  let people: DirectoryUserOption[] = [];
  let sseisDelegates: SseisDelegateRow[] = [];
  let threshold = 20;
  let inactivityDays = 5;
  let dbDown = false;

  const staffKinds = allowedKinds.length > 0 ? allowedKinds : ["academico", "cultural", "deportivo"];

  try {
    const [clubResult, proposalResult, progressResult, settingsResult] = await Promise.all([
      pool.query<RawClubRow>(
        `select id, name, kind, description, schedule, logo_url, active
         from clubs
         where (active = true or ($1 and kind = any($2::text[])))
           and (not $1 or kind = any($2::text[]))
         order by active desc, name asc`,
        [isAreaStaff, staffKinds],
      ),
      pool.query<
        RawProposalRow & {
          viewer_is_advisor: boolean;
          appointment_status: string | null;
          scheduled_at: Date | null;
          meeting_mode: string | null;
          meeting_location: string | null;
          advisor_confirmed_at_appt: Date | null;
        }
      >(
        `select p.id, p.name, p.kind, p.description, p.objectives, p.status,
                p.proposer_id, u.name as proposer_name,
                p.interested_count as interests,
                (p.advisor_id is not null and p.advisor_confirmed_at is not null) as advisor_confirmed,
                adv.name as advisor_name,
                p.schedule_plan,
                p.requested_spaces,
                p.formal_submitted_at,
                p.last_proposer_activity_at,
                exists (
                  select 1 from club_interests ci
                  where ci.proposal_id = p.id and $1::uuid is not null and ci.user_id = $1::uuid
                ) as viewer_interested,
                ($1::uuid is not null and (p.advisor_id = $1::uuid or p.pending_advisor_id = $1::uuid)) as viewer_is_advisor,
                appt.status as appointment_status,
                appt.scheduled_at,
                appt.meeting_mode,
                appt.meeting_location,
                appt.advisor_confirmed_at as advisor_confirmed_at_appt
         from club_proposals p
         join users u on u.id = p.proposer_id
         left join users adv on adv.id = p.advisor_id
         left join lateral (
           select a.status, a.scheduled_at, a.meeting_mode, a.meeting_location, a.advisor_confirmed_at
             from club_appointments a
            where a.proposal_id = p.id and a.status <> 'cancelada'
            order by a.created_at desc
            limit 1
         ) appt on true
         where (not $2 or p.kind = any($3::text[]))
         order by p.formal_submitted_at desc nulls last, p.created_at desc`,
        [user?.id ?? null, isAreaStaff, staffKinds],
      ),
      pool.query<{ proposal_id: string; participants_count: number; participants_complete_docs: number }>(
        "select proposal_id, participants_count, participants_complete_docs from public.get_club_proposal_progress_summary()",
      ),
      pool.query<{ key: string; value_int: number }>(
        "select key, value_int from system_settings where key in ('club_interest_threshold', 'club_claim_inactivity_days')",
      ),
    ]);

    for (const row of settingsResult.rows) {
      const parsed = Number(row.value_int);
      if (Number.isFinite(parsed) && parsed > 0) {
        if (row.key === "club_interest_threshold") threshold = parsed;
        if (row.key === "club_claim_inactivity_days") inactivityDays = parsed;
      }
    }

    const progressMap = new Map(
      progressResult.rows.map((r) => [
        r.proposal_id,
        {
          participants_count: Number(r.participants_count),
          participants_complete_docs: Number(r.participants_complete_docs),
        },
      ]),
    );

    clubs = clubResult.rows.map((c) => ({
      ...c,
      art_url: c.logo_url ?? demoClubArt(c.name),
    }));

    const allMappedProposals = proposalResult.rows.map((p) => {
      const counts = progressMap.get(p.id) ?? { participants_count: 1, participants_complete_docs: 0 };
      const hasExec =
        Boolean(p.schedule_plan && p.schedule_plan.trim().length >= 10) &&
        Boolean(p.requested_spaces && p.requested_spaces.trim().length >= 3);
      const inactiveForClaim =
        !p.formal_submitted_at &&
        !["registrado", "rechazada"].includes(p.status) &&
        Date.now() - new Date(p.last_proposer_activity_at).getTime() >
          inactivityDays * 24 * 60 * 60 * 1000;
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        description: p.description,
        objectives: p.objectives,
        status: p.status,
        proposer_id: p.proposer_id,
        proposer_name: p.proposer_name,
        interests: Number(p.interests),
        threshold,
        participants_count: counts.participants_count,
        participants_complete_docs: counts.participants_complete_docs,
        advisor_confirmed: p.advisor_confirmed,
        advisor_name: p.advisor_name,
        has_executive_details: hasExec,
        formal_submitted_at: p.formal_submitted_at ? new Date(p.formal_submitted_at).toISOString() : null,
        last_proposer_activity_at: new Date(p.last_proposer_activity_at).toISOString(),
        inactivity_days: inactivityDays,
        inactive_for_claim: inactiveForClaim,
        viewer_interested: p.viewer_interested,
        viewer_is_advisor: p.viewer_is_advisor,
        appointment_status: p.appointment_status,
        scheduled_at: p.scheduled_at ? new Date(p.scheduled_at).toISOString() : null,
        meeting_mode: p.meeting_mode,
        meeting_location: p.meeting_location,
        advisor_confirmed_appointment: Boolean(p.advisor_confirmed_at_appt),
        schedule_plan: p.schedule_plan,
      };
    });

    proposals = allMappedProposals.filter((p) => p.status !== "registrado" && p.status !== "rechazada");

    if (canCreateDirect) {
      const [peopleResult, kpiResult, stageResult, pendingReqResult, delegatesResult] = await Promise.all([
        pool.query<DirectoryUserOption>(
          `select u.id::text as id, u.name, u.role::text as role, u.area, p.boleta, p.email
           from public.users u
           left join private.user_private p on p.user_id = u.id
           where u.is_active and u.role in ('alumno', 'profesor', 'moderador')
           order by u.name
           limit 120`,
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
        sseisTitular
          ? pool
              .query<SseisDelegateRow>(
                `select d.user_id::text as user_id,
                        u.name,
                        u.role::text as role,
                        p.boleta,
                        p.email,
                        d.note
                 from public.club_area_delegates d
                 join public.users u on u.id = d.user_id
                 left join private.user_private p on p.user_id = u.id
                 where d.active = true and d.scope = 'cultural_deportivo'
                 order by u.name`,
              )
              .catch(() => ({ rows: [] as SseisDelegateRow[] }))
          : Promise.resolve({ rows: [] as SseisDelegateRow[] }),
      ]);

      people = peopleResult.rows;
      clubKpis = kpiResult.rows;
      pendingMemberships = pendingReqResult.rows;
      sseisDelegates = delegatesResult.rows;
      formalRequests = allMappedProposals.filter(
        (p) =>
          (p.formal_submitted_at !== null || ["cita_pendiente", "cita_confirmada", "incompleta"].includes(p.status)) &&
          allowedKinds.includes(p.kind as never),
      );
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

  return (
    <div className="board-page">
      {dbDown && (
        <p className={card} role="status">
          No se pudieron cargar los datos. Vuelve a intentarlo en un momento.
        </p>
      )}

      <ClubesExplorer
        clubs={clubs}
        proposals={proposals}
        formalRequests={formalRequests}
        clubKpis={clubKpis}
        pendingMemberships={pendingMemberships}
        proposalStageCounts={proposalStageCounts}
        sala14EventsCount={sala14EventsCount}
        people={people}
        sseisDelegates={sseisDelegates}
        allowedKinds={allowedKinds}
        isAreaStaff={isAreaStaff}
        isSubdireccion={isSubdireccion}
        isCulturales={isCulturales}
        isSseisTitular={sseisTitular}
        isSseisDelegated={sseisDelegated}
        canCreateDirect={canCreateDirect}
        viewer={user ? { id: user.id, name: user.name, role: user.role } : null}
        dbDown={dbDown}
      />
    </div>
  );
}
