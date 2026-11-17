import { NextRequest, NextResponse } from "next/server";
import { UUID_RE } from "@/app/avisos/shared";
import { pool } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { avisoId?: string; kind?: string };
    const avisoId = (body.avisoId ?? "").trim();
    const kind = body.kind === "click" ? "click" : body.kind === "view" ? "view" : null;

    if (!UUID_RE.test(avisoId) || !kind) {
      return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
    }

    const { rows } = await pool.query<{ views_count: number; link_clicks_count: number }>(
      "select views_count, link_clicks_count from public.record_aviso_interaction($1::uuid, $2)",
      [avisoId, kind],
    );

    const row = rows[0];
    return NextResponse.json({
      ok: Boolean(row),
      viewsCount: row?.views_count ?? null,
      linkClicksCount: row?.link_clicks_count ?? null,
    });
  } catch {
    return NextResponse.json({ error: "No se pudo registrar la interacción." }, { status: 500 });
  }
}
