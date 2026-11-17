import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getHomeFeedBatch, type FeedMode } from "@/lib/feed";

export const dynamic = "force-dynamic";

const VALID_MODES: FeedMode[] = ["para_ti", "clubes", "avisos", "foro", "eventos", "recientes"];

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    const { searchParams } = request.nextUrl;
    const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10) || 0;
    const limit = Number.parseInt(searchParams.get("limit") ?? "5", 10) || 5;
    const rawMode = (searchParams.get("mode") ?? "para_ti") as FeedMode;
    const mode: FeedMode = VALID_MODES.includes(rawMode) ? rawMode : "para_ti";

    const batch = await getHomeFeedBatch({
      userId: user?.id ?? null,
      isAuthenticated: Boolean(user),
      mode,
      offset,
      limit,
    });

    return NextResponse.json(batch);
  } catch {
    return NextResponse.json(
      { error: "No se pudo cargar el lote de publicaciones." },
      { status: 500 },
    );
  }
}
