import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { canManageAnyClubs } from "@/app/clubes/format";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const DOC_TYPES: Record<string, string> = {
  ...IMAGE_TYPES,
  "application/pdf": "pdf",
};
const GUIDE_SOURCE_EXT = new Set(["pdf", "docx", "txt", "md", "png", "jpg", "jpeg", "webp"]);

type SignRequest = {
  bucket?: string;
  contentType?: string;
  size?: number;
  fileName?: string;
  contextId?: string;
  area?: string;
};

function sanitizeExt(fileName: string, contentType: string): string | null {
  const ct = contentType.toLowerCase();
  if (ct === "image/jpeg") return "jpg";
  if (ct === "image/png") return "png";
  if (ct === "image/webp") return "webp";
  if (ct === "application/pdf") return "pdf";
  if (ct.includes("wordprocessingml")) return "docx";
  if (ct === "text/plain") return "txt";
  if (ct === "text/markdown") return "md";
  const m = /\.([a-z0-9]{2,5})$/i.exec(fileName.trim());
  if (m && GUIDE_SOURCE_EXT.has(m[1].toLowerCase())) return m[1].toLowerCase();
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Inicia sesión para subir archivos." }, { status: 401 });
    }

    const body = (await request.json()) as SignRequest;
    const bucket = body.bucket ?? "";
    const contentType = (body.contentType ?? "").trim().toLowerCase();
    const size = Number(body.size ?? 0);
    const fileName = (body.fileName ?? "archivo").trim();

    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: "Archivo vacío o inválido." }, { status: 400 });
    }

    let path = "";
    if (bucket === "public-media") {
      if (size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "El archivo supera los 10 MB." }, { status: 400 });
      }
      const ext = DOC_TYPES[contentType];
      if (!ext) {
        return NextResponse.json({ error: "Usa JPG, PNG, WEBP o PDF." }, { status: 400 });
      }
      path = `${user.id}/${randomUUID()}.${ext}`;
    } else if (bucket === "club-documents") {
      if (size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "El documento supera los 10 MB." }, { status: 400 });
      }
      const contextId = (body.contextId ?? "").trim();
      const ext = contentType === "image/webp" ? null : DOC_TYPES[contentType];
      if (!ext) {
        return NextResponse.json({ error: "Para clubes usa PDF, JPG o PNG." }, { status: 400 });
      }
      if (contextId === "direct") {
        if (!canManageAnyClubs(user)) {
          return NextResponse.json({ error: "Solo el área de clubes puede subir expedientes de alta directa." }, { status: 403 });
        }
        path = `direct/${user.id}/${randomUUID()}.${ext}`;
      } else {
        if (!UUID_RE.test(contextId)) {
          return NextResponse.json({ error: "Propuesta inválida." }, { status: 400 });
        }
        const allowed = await pool.query<{ ok: boolean }>(
          `select exists (
             select 1 from public.club_proposals p
              where p.id = $1
                and p.status in ('en_documentacion', 'en_validacion', 'cita_pendiente', 'incompleta')
                and (p.proposer_id = $2 or exists (
                  select 1 from public.club_interests i where i.proposal_id = p.id and i.user_id = $2
                ))
           ) as ok`,
          [contextId, user.id],
        );
        if (!allowed.rows[0]?.ok) {
          return NextResponse.json({ error: "No participas en esta propuesta o ya cerró carga." }, { status: 403 });
        }
        path = `${contextId}/${user.id}/${randomUUID()}.${ext}`;
      }
    } else if (bucket === "lost-evidence") {
      if (size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "La evidencia supera los 10 MB." }, { status: 400 });
      }
      const itemId = (body.contextId ?? "").trim();
      if (!UUID_RE.test(itemId)) {
        return NextResponse.json({ error: "Reporte inválido." }, { status: 400 });
      }
      const ext = DOC_TYPES[contentType];
      if (!ext) {
        return NextResponse.json({ error: "Usa PDF, JPG, PNG o WEBP." }, { status: 400 });
      }
      const openItem = await pool.query<{ ok: boolean }>(
        `select exists (select 1 from public.lost_items where id = $1 and status = 'abierto') as ok`,
        [itemId],
      );
      if (!openItem.rows[0]?.ok) {
        return NextResponse.json({ error: "El reporte ya no admite comprobantes." }, { status: 403 });
      }
      path = `${itemId}/${user.id}/${randomUUID()}.${ext}`;
    } else if (bucket === "guide-source") {
      if (user.role !== "admin" && user.role !== "moderador") {
        return NextResponse.json({ error: "Solo personal autorizado puede subir fuentes de guías." }, { status: 403 });
      }
      if (size > 20 * 1024 * 1024) {
        return NextResponse.json({ error: "El archivo supera los 20 MB." }, { status: 400 });
      }
      const ext = sanitizeExt(fileName, contentType);
      if (!ext || !GUIDE_SOURCE_EXT.has(ext)) {
        return NextResponse.json({ error: "Formato no compatible. Usa imagen, PDF, Word (.docx) o texto." }, { status: 400 });
      }
      const safeArea = (user.role === "moderador" && user.area) || (body.area ?? "general").replace(/[^a-z0-9_-]/gi, "") || "general";
      path = `${safeArea}/${user.id}/${randomUUID()}.${ext}`;
    } else {
      return NextResponse.json({ error: "Contenedor no válido." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json({ error: "No se pudo preparar la carga del archivo." }, { status: 500 });
    }

    const publicUrl =
      bucket === "public-media"
        ? admin.storage.from(bucket).getPublicUrl(path).data.publicUrl
        : null;

    return NextResponse.json({
      bucket,
      path: data.path,
      token: data.token,
      publicUrl,
    });
  } catch {
    return NextResponse.json({ error: "No se pudo preparar la carga directa." }, { status: 500 });
  }
}
