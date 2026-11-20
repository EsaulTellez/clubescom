import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Inicia sesión para confirmar asistencia." }, { status: 401 });
    }

    const body = (await request.json()) as { eventKind?: string; eventId?: string };
    const eventKind = body.eventKind === "club" ? "club" : body.eventKind === "space" ? "space" : null;
    const eventId = (body.eventId ?? "").trim();

    if (!eventKind || !UUID_RE.test(eventId)) {
      return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
    }

    const validEvent =
      eventKind === "club"
        ? await pool.query<{ ok: boolean }>(
            `select exists (select 1 from public.club_events where id = $1::uuid and approval_status = 'aprobado') as ok`,
            [eventId],
          )
        : await pool.query<{ ok: boolean }>(
            `select exists (select 1 from public.space_events where id = $1::uuid and approval_status = 'aprobado' and is_public = true) as ok`,
            [eventId],
          );

    if (!validEvent.rows[0]?.ok) {
      return NextResponse.json({ error: "El evento no está disponible para confirmar asistencia." }, { status: 404 });
    }

    const existing = await pool.query(
      `select 1 from public.event_attendees where event_kind = $1 and event_id = $2::uuid and user_id = $3::uuid`,
      [eventKind, eventId, user.id],
    );

    let attending = false;
    if (existing.rowCount && existing.rowCount > 0) {
      await pool.query(
        `delete from public.event_attendees where event_kind = $1 and event_id = $2::uuid and user_id = $3::uuid`,
        [eventKind, eventId, user.id],
      );
      attending = false;
    } else {
      await pool.query(
        `insert into public.event_attendees (event_kind, event_id, user_id)
         values ($1, $2::uuid, $3::uuid)
         on conflict do nothing`,
        [eventKind, eventId, user.id],
      );
      attending = true;
    }

    const countRes = await pool.query<{ cnt: number }>(
      `select count(*)::int as cnt from public.event_attendees where event_kind = $1 and event_id = $2::uuid`,
      [eventKind, eventId],
    );

    return NextResponse.json({
      attending,
      attendeesCount: countRes.rows[0]?.cnt ?? 0,
    });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar la asistencia." }, { status: 500 });
  }
}
