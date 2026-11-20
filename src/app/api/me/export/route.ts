import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const format = request.nextUrl.searchParams.get("format")?.toLowerCase() ?? "json";

  const [
    badges,
    prefs,
    questions,
    answers,
    clubs,
    clubProposals,
    participantProfiles,
    lostItems,
    claims,
    privacyRequests,
  ] = await Promise.all([
    pool.query("select code, label, awarded_at from badges where user_id = $1 order by awarded_at desc", [user.id]),
    pool.query("select * from notification_prefs where user_id = $1", [user.id]),
    pool.query("select id, area, title, status, created_at from questions where author_id = $1 order by created_at desc", [user.id]),
    pool.query("select id, question_id, official, created_at from answers where author_id = $1 order by created_at desc", [user.id]),
    pool.query("select c.name, m.status, m.application_answers, m.created_at from memberships m join clubs c on c.id = m.club_id where m.user_id = $1", [user.id]),
    pool.query("select id, name, kind, status, created_at from club_proposals where proposer_id = $1 order by created_at desc", [user.id]),
    pool.query("select cp.proposal_id, p.name as proposal_name, cp.career, cp.phone, cp.updated_at from club_participant_profiles cp join club_proposals p on p.id = cp.proposal_id where cp.user_id = $1", [user.id]),
    pool.query("select id, kind, title, place, status, created_at from lost_items where reporter_id = $1 order by created_at desc", [user.id]),
    pool.query("select id, lost_item_id, status, created_at from lost_item_claims where claimant_id = $1 order by created_at desc", [user.id]),
    pool.query("select id, kind, detail, status, resolution_note, created_at from privacy_requests where user_id = $1 order by created_at desc", [user.id]),
  ]);

  if (format === "csv") {
    const lines: string[] = [
      ["categoria", "id_o_codigo", "titulo_o_etiqueta", "estado_o_detalle", "fecha"].map(csvEscape).join(","),
      ["perfil", user.id, user.name, `${user.email} | rol:${user.role} | boleta:${user.boleta ?? ""}`, ""].map(csvEscape).join(","),
      ...badges.rows.map((b) => ["insignia", b.code, b.label, "otorgada", b.awarded_at].map(csvEscape).join(",")),
      ...questions.rows.map((q) => ["pregunta_foro", q.id, q.title, `${q.area} (${q.status})`, q.created_at].map(csvEscape).join(",")),
      ...answers.rows.map((a) => ["respuesta_foro", a.id, a.question_id, a.official ? "oficial" : "comunitaria", a.created_at].map(csvEscape).join(",")),
      ...clubs.rows.map((c) => ["membresia_club", "", c.name, c.status, c.created_at].map(csvEscape).join(",")),
      ...clubProposals.rows.map((p) => ["propuesta_club", p.id, p.name, `${p.kind} (${p.status})`, p.created_at].map(csvEscape).join(",")),
      ...participantProfiles.rows.map((pp) => ["perfil_club", pp.proposal_id, pp.proposal_name, `${pp.career} · ${pp.phone}`, pp.updated_at].map(csvEscape).join(",")),
      ...lostItems.rows.map((i) => ["objeto_reportado", i.id, i.title, `${i.kind} (${i.status})`, i.created_at].map(csvEscape).join(",")),
      ...claims.rows.map((c) => ["reclamo_objeto", c.id, c.lost_item_id, c.status, c.created_at].map(csvEscape).join(",")),
      ...privacyRequests.rows.map((r) => ["solicitud_arco", r.id, r.kind, `${r.status}: ${r.detail}`, r.created_at].map(csvEscape).join(",")),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="datos-personales-${user.id.slice(0, 8)}.csv"`,
      },
    });
  }

  return NextResponse.json(
    {
      user,
      badges: badges.rows,
      prefs: prefs.rows[0] ?? null,
      questions: questions.rows,
      answers: answers.rows,
      memberships: clubs.rows,
      club_proposals: clubProposals.rows,
      club_participant_profiles: participantProfiles.rows,
      lost_items: lostItems.rows,
      lost_item_claims: claims.rows,
      privacy_requests: privacyRequests.rows,
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="datos-personales-${user.id.slice(0, 8)}.json"`,
      },
    },
  );
}
