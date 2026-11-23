import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { SubmitButton } from "@/components/loading-ui";
import { getSession } from "@/lib/auth";
import { formatMxDateTime } from "@/lib/datetime";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { btn, btnGhost, card, input, label } from "@/lib/ui";
import { closeItem, confirmDelivery, renewHandoff, reviewClaim, updateMeetingNote } from "../actions";
import { kindLabel, statusLabel, type ItemKind, type ItemStatus } from "../labels";
import { ClaimForm } from "./claim-form";
import { ItemPhotoGallery } from "./item-photo-gallery";
import { ItemStageStepper } from "./item-stage-stepper";
import { QrDeliveryVerifyForm } from "./qr-scanner";

export const dynamic = "force-dynamic";

const reportDate = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

type Item = {
  id: string;
  reporter_id: string;
  kind: ItemKind;
  title: string;
  description: string;
  place: string;
  photo_url: string | null;
  photo_url_2: string | null;
  status: ItemStatus;
  security_question: string | null;
  matched_id: string | null;
  created_at: string;
};
type ClaimReviewRow = {
  id: string;
  claimant_id: string;
  claimant_name: string;
  status: string;
  claimant_note: string | null;
  evidence_path: string | null;
  created_at: string;
  answer_text: string | null;
  answer_score: number | null;
};
type MyClaimRow = {
  id: string;
  status: string;
  claimant_note: string | null;
  review_note: string | null;
  answer_score: number | null;
  created_at: string;
};
type HandoffRow = {
  handoff_id: string;
  token: string;
  expires_at: string;
  is_expired: boolean;
  finder_id: string;
  recipient_id: string;
};
type HandoffContact = {
  handoff_id: string;
  finder_id: string;
  finder_name: string;
  finder_email: string;
  recipient_id: string;
  recipient_name: string;
  recipient_email: string;
  meeting_note: string | null;
  status: string;
  expires_at: string;
};

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function ObjetoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; revisado?: string; code?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const user = await getSession();
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const { rows } = validId
    ? await pool.query<Item>(
        `select id, reporter_id, kind, title, description, place, photo_url, photo_url_2, status,
                security_question, matched_id, created_at
         from lost_items where id = $1`,
        [id],
      )
    : { rows: [] };
  const item = rows[0];
  if (!item) {
    return (
      <section className={`${card} mx-auto max-w-xl space-y-3`}>
        <h1 className="text-xl font-bold text-[#142c3c]">No encontramos ese reporte</h1>
        <p className="text-sm text-[#5f6e78]">Puede que el enlace esté mal o que el reporte ya no exista.</p>
        <Link className={btnGhost} href="/objetos">Volver a objetos</Link>
      </section>
    );
  }

  const owner = user?.id === item.reporter_id;
  const isAdmin = user?.role === "admin";
  const supabase = user ? await createSupabaseServerClient() : null;

  const [matchesRes, claimsRpcRes, myClaimRpcRes, handoffRpcRes, contactRpcRes] = await Promise.all([
    pool.query<{ id: string; title: string; kind: ItemKind; place: string }>(
      `select distinct li.id, li.title, li.kind, li.place
         from lost_items li
        where li.status = 'abierto'
          and (
            li.id = $1::uuid
            or exists (
              select 1 from lost_item_matches m
               where (m.item_a_id = $2::uuid and m.item_b_id = li.id)
                  or (m.item_b_id = $2::uuid and m.item_a_id = li.id)
            )
          )
        limit 6`,
      [item.matched_id, id],
    ),
    supabase && (owner || isAdmin)
      ? supabase.rpc("get_lost_item_claims_for_review", { p_item_id: id })
      : Promise.resolve({ data: null, error: null }),
    supabase && !owner
      ? supabase.rpc("get_my_lost_item_claim", { p_item_id: id })
      : Promise.resolve({ data: null, error: null }),
    supabase
      ? supabase.rpc("get_my_lost_item_handoff", { p_item_id: id })
      : Promise.resolve({ data: null, error: null }),
    supabase
      ? supabase.rpc("get_lost_item_handoff_contact", { p_item_id: id })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const matches = matchesRes.rows;
  const claims = (!claimsRpcRes.error && Array.isArray(claimsRpcRes.data)
    ? (claimsRpcRes.data as ClaimReviewRow[])
    : []);
  const myClaim = (!myClaimRpcRes.error && Array.isArray(myClaimRpcRes.data)
    ? (myClaimRpcRes.data[0] as MyClaimRow | undefined)
    : undefined);
  const handoff = (!handoffRpcRes.error && Array.isArray(handoffRpcRes.data)
    ? (handoffRpcRes.data[0] as HandoffRow | undefined)
    : undefined);
  const contact = (!contactRpcRes.error && Array.isArray(contactRpcRes.data)
    ? (contactRpcRes.data[0] as HandoffContact | undefined)
    : undefined) ?? null;

  const claimsWithEvidence = await Promise.all(
    claims.map(async (claim) => {
      if (!supabase || !claim.evidence_path) return { ...claim, evidenceUrl: null };
      const { data } = await supabase.storage.from("lost-evidence").createSignedUrl(claim.evidence_path, 600);
      return { ...claim, evidenceUrl: data?.signedUrl ?? null };
    }),
  );

  const stage =
    item.status === "entregado"
      ? 3
      : Boolean(handoff) || claims.some((c) => c.status === "aprobada") || myClaim?.status === "aprobada"
        ? 3
        : claims.some((c) => ["respuesta_correcta", "en_revision", "pendiente"].includes(c.status)) || Boolean(myClaim)
          ? 2
          : matches.length > 0
            ? 1
            : 0;

  const isFinder = Boolean(user && handoff?.finder_id === user.id);
  const isRecipient = Boolean(user && handoff?.recipient_id === user.id);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://clubescom.vercel.app";
  const qrValue = handoff ? `${baseUrl}/objetos/${id}?code=${handoff.token}` : "";

  const photos = [item.photo_url, item.photo_url_2].filter((p): p is string => Boolean(p));
  const createdDate = new Date(item.created_at);
  const isLost = item.kind === "perdido";
  const isOpen = item.status === "abierto";

  const bannerBg = !isOpen
    ? "bg-[#465a64]"
    : isLost
      ? "bg-[#8f2d1f]"
      : "bg-[#145542]";
  const cardBorder = !isOpen
    ? "border-[#cfd5d8]"
    : isLost
      ? "border-[#dec2b6]"
      : "border-[#c1d4cc]";
  const stampText = isOpen
    ? isLost
      ? "SE BUSCA · PERDIDO"
      : "EN RESGUARDO · ENCONTRADO"
    : `${kindLabel[item.kind]} · ${statusLabel[item.status]}`;

  return (
    <article className="mx-auto max-w-7xl space-y-5">
      {/* Top breadcrumb bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/objetos"
          className="inline-flex items-center gap-2 text-sm font-bold text-[#155775] hover:underline"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Perdidos y encontrados
        </Link>
        {owner && (
          <span className="rounded-sm border border-[#bfd5e2] bg-[#eaf5fa] px-2.5 py-1 text-xs font-bold text-[#155775]">
            Tu reporte
          </span>
        )}
      </div>

      {/* Status & error alerts */}
      {query.revisado && (
        <p
          role="status"
          className="rounded-sm border border-[#b7d8be] bg-[#edf6ee] px-4 py-3 text-sm font-semibold text-[#1f5133]"
        >
          {query.revisado === "aprobado"
            ? "Solicitud aprobada. El código QR y los datos de contacto ya están disponibles."
            : query.revisado === "rechazado"
              ? "Se notificó la decisión al solicitante."
              : query.revisado === "renovado"
                ? "Código QR renovado por 24 horas adicionales."
                : query.revisado === "nota"
                  ? "Punto de entrega actualizado y notificado."
                  : "La entrega quedó confirmada."}
        </p>
      )}
      {query.error === "codigo" && (
        <p role="alert" className="rounded-sm border border-[#e5c1bc] bg-[#fff0ec] px-4 py-3 text-sm font-medium text-[#8C1D18]">
          El código no coincide o ya expiró.
        </p>
      )}
      {query.error === "revision" && (
        <p role="alert" className="rounded-sm border border-[#e5c1bc] bg-[#fff0ec] px-4 py-3 text-sm font-medium text-[#8C1D18]">
          No pudimos guardar la revisión. Puede que el reclamo ya se haya revisado.
        </p>
      )}
      {query.error === "renovar" && (
        <p role="alert" className="rounded-sm border border-[#e5c1bc] bg-[#fff0ec] px-4 py-3 text-sm font-medium text-[#8C1D18]">
          No se pudo renovar el código QR en este momento.
        </p>
      )}

      {/* Full-width stages stepper */}
      <ItemStageStepper stage={stage} kind={item.kind} status={item.status} />

      {/* Main two-column workspace */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.95fr)]">
        {/* Left column: item dossier & matches */}
        <div className="min-w-0 space-y-5">
          <section className={`overflow-hidden rounded-sm border-2 ${cardBorder} bg-[#fffdf7] shadow-[0_3px_0_rgba(20,44,60,0.06)]`}>
            <header className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[#fffdf7] ${bannerBg}`}>
              <span className="text-xs font-black tracking-[0.14em] uppercase">{stampText}</span>
              <time dateTime={createdDate.toISOString()} className="font-mono text-xs font-semibold opacity-95">
                {reportDate.format(createdDate)}
              </time>
            </header>

            <div className="space-y-6 p-5 sm:p-7">
              {/* Title and key facts */}
              <div className="space-y-3">
                <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-[#142c3c] sm:text-3xl">
                  {item.title}
                </h1>
                <div className="flex flex-wrap items-center gap-2.5 text-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-sm border border-[#dcd9ce] bg-[#f7f5ee] px-3 py-1.5 font-semibold text-[#173142]">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className={`h-4 w-4 shrink-0 ${isLost ? "text-[#8f2d1f]" : "text-[#145542]"}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
                      <circle cx="12" cy="10" r="2.4" />
                    </svg>
                    {item.place}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-sm border border-[#dcd9ce] bg-[#f7f5ee] px-3 py-1.5 text-xs font-semibold text-[#4d6069]">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                      <path d="M16 3v4M8 3v4M3 10h18" strokeLinecap="round" />
                    </svg>
                    {formatMxDateTime(item.created_at)}
                  </span>
                </div>
              </div>

              {/* Interactive photo gallery (only if photos exist) */}
              {photos.length > 0 && <ItemPhotoGallery title={item.title} photos={photos} />}

              {/* Description */}
              <div className="border-t border-dashed border-[#dcd9ce] pt-5">
                <h2 className="text-[11px] font-extrabold tracking-[0.14em] text-[#52656e] uppercase">
                  Descripción
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[#29404b]">
                  {item.description}
                </p>
              </div>
            </div>
          </section>

          {/* Matches */}
          {matches.length > 0 && (
            <section className="rounded-sm border border-[#b7d4e4] bg-[#f1f8fc] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-extrabold tracking-[0.12em] text-[#155775] uppercase">
                  Posibles coincidencias ({matches.length})
                </h2>
              </div>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {matches.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/objetos/${m.id}`}
                      className="flex h-full flex-col justify-between gap-2 rounded-sm border border-[#c5dce8] bg-[#fffdf7] p-3.5 transition hover:border-[#155775]"
                    >
                      <div className="space-y-1">
                        <span
                          className={`inline-block rounded-sm px-2 py-0.5 text-[10px] font-extrabold tracking-wider uppercase ${
                            m.kind === "perdido"
                              ? "bg-[#fdf2ec] text-[#8f2d1f]"
                              : "bg-[#edf7f3] text-[#145542]"
                          }`}
                        >
                          {kindLabel[m.kind]}
                        </span>
                        <p className="font-bold text-[#142c3c]">{m.title}</p>
                      </div>
                      <p className="flex items-center justify-between gap-2 text-xs text-[#52656e]">
                        <span className="truncate">{m.place}</span>
                        <span className="shrink-0 font-bold text-[#155775]">Ver →</span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Right column: sticky action & workflow panel */}
        <aside className="space-y-4 lg:sticky lg:top-28">
          {item.status === "entregado" && (
            <div className="rounded-sm border border-[#b5dac5] bg-[#eaf7f0] p-5">
              <p className="text-sm font-bold text-[#145542]">Este objeto ya se marcó como entregado.</p>
            </div>
          )}
          {item.status === "cerrado" && (
            <div className={`${card} p-5 text-sm font-medium text-[#52656e]`}>
              Este reporte fue cerrado.
            </div>
          )}

          {/* Owner: claims review */}
          {owner && isOpen && (
            <section className={`${card} space-y-5 p-5 sm:p-6`}>
              <div className="flex items-start justify-between gap-3 border-b border-[#e4e2d8] pb-3.5">
                <div>
                  <p className="text-[11px] font-extrabold tracking-[0.12em] text-[#52656e] uppercase">
                    {item.kind === "encontrado" ? "Revisión del hallazgo" : "Avisos recibidos"}
                  </p>
                  <h2 className="mt-0.5 text-xl font-extrabold text-[#142c3c]">
                    {item.kind === "encontrado" ? "Reclamos recibidos" : "Personas que reportaron encontrarlo"}
                  </h2>
                </div>
                <span className="rounded-sm bg-[#efede4] px-2.5 py-1 font-mono text-xs font-bold text-[#142c3c]">
                  {claimsWithEvidence.length}
                </span>
              </div>

              {claimsWithEvidence.length === 0 ? (
                <p className="rounded-sm border border-dashed border-[#d0cec2] bg-[#faf9f4] px-4 py-6 text-center text-sm text-[#5f6e78]">
                  {item.kind === "encontrado"
                    ? "Todavía no hay reclamos para evaluar."
                    : "Aún nadie ha reportado haber encontrado este objeto."}
                </p>
              ) : (
                <ul className="space-y-4">
                  {claimsWithEvidence.map((claim) => {
                    const pct = claim.answer_score !== null ? Math.round(Number(claim.answer_score) * 100) : null;
                    const canReview = ["respuesta_correcta", "en_revision", "pendiente"].includes(claim.status);
                    return (
                      <li
                        key={claim.id}
                        className="space-y-3 rounded-sm border border-[#dcd9ce] bg-[#faf9f4] p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-[#155775] text-xs font-extrabold text-white">
                              {getInitials(claim.claimant_name)}
                            </span>
                            <div>
                              <p className="text-sm font-bold text-[#142c3c]">{claim.claimant_name}</p>
                              <p className="text-[11px] text-[#5f6e78]">
                                {claim.status === "respuesta_correcta"
                                  ? "Coincidencia alta · pendiente de tu decisión"
                                  : claim.status === "en_revision"
                                    ? item.kind === "perdido"
                                      ? "Aviso recibido · pendiente de aprobar"
                                      : "Coincidencia parcial · decide si corresponde"
                                    : claim.status === "aprobada"
                                      ? "Aprobado · esperando entrega por QR"
                                      : claim.status === "rechazada"
                                        ? "Rechazado"
                                        : claim.status}
                              </p>
                            </div>
                          </div>
                          {pct !== null && item.kind === "encontrado" && (
                            <span
                              className={`rounded-sm px-2.5 py-1 font-mono text-xs font-extrabold ${
                                pct >= 72
                                  ? "border border-[#b5dac5] bg-[#eaf7f0] text-[#145542]"
                                  : "border border-[#ebd5a7] bg-[#fff6e0] text-[#7a5410]"
                              }`}
                            >
                              {pct}%
                            </span>
                          )}
                        </div>

                        {claim.answer_text && item.kind === "encontrado" && (
                          <div className="rounded-sm border border-[#bfd5e2] bg-[#f4f9fc] px-3 py-2.5">
                            <p className="text-[11px] font-extrabold tracking-wide text-[#155775] uppercase">
                              Respuesta a la pregunta llave
                            </p>
                            <p className="mt-0.5 text-sm font-semibold text-[#142c3c]">{claim.answer_text}</p>
                          </div>
                        )}

                        {claim.claimant_note && (
                          <div className="text-sm text-[#2d4856]">
                            <span className="text-xs font-bold text-[#52656e] uppercase">Detalle: </span>
                            <span className="whitespace-pre-wrap">{claim.claimant_note}</span>
                          </div>
                        )}

                        {claim.evidenceUrl && (
                          <a
                            href={claim.evidenceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-sm border border-[#bfd5e2] bg-white px-3 py-1.5 text-xs font-bold text-[#155775] hover:bg-[#edf5f9]"
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Ver foto o comprobante adjunto
                          </a>
                        )}

                        {canReview && (
                          <form action={reviewClaim} className="space-y-2.5 border-t border-dashed border-[#dcd9ce] pt-3">
                            <input type="hidden" name="claim_id" value={claim.id} />
                            <input type="hidden" name="item_id" value={item.id} />
                            <label className={label}>
                              Nota para la persona (opcional)
                              <textarea
                                className={`${input} mt-1 min-h-16`}
                                name="review_note"
                                maxLength={500}
                                placeholder="Ej. Nos vemos frente a Biblioteca a la 1:00 pm"
                              />
                            </label>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <SubmitButton className={`${btn} w-full`} name="approve" value="true" pendingText="Aprobando…">
                                {item.kind === "perdido" ? "Es mi objeto · QR" : "Aceptar como dueño"}
                              </SubmitButton>
                              <SubmitButton className={`${btnGhost} w-full`} name="approve" value="false" pendingText="Rechazando…">
                                Rechazar
                              </SubmitButton>
                            </div>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <form action={closeItem} className="border-t border-dashed border-[#dcd9ce] pt-4">
                <input type="hidden" name="id" value={item.id} />
                <SubmitButton className={`${btnGhost} w-full`} pendingText="Cerrando…">
                  Cerrar reporte
                </SubmitButton>
              </form>
            </section>
          )}

          {/* Non-owner: claim or report found */}
          {!owner && isOpen && !isRecipient && !isFinder && (
            <section className="overflow-hidden rounded-sm border border-[#d0cec2] bg-[#fffdf7] shadow-[0_3px_0_rgba(20,44,60,0.05)]">
              <div
                className={`border-b border-[#e4e2d8] px-5 py-4 sm:px-6 ${
                  item.kind === "encontrado" ? "border-t-4 border-t-[#145542]" : "border-t-4 border-t-[#8f2d1f]"
                }`}
              >
                <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#52656e] uppercase">
                  {item.kind === "encontrado" ? "Validación de propiedad" : "Aviso de hallazgo"}
                </p>
                <h2 className="mt-0.5 text-xl font-extrabold text-[#142c3c]">
                  {item.kind === "encontrado" ? "Reclamar este objeto" : "¿Lo encontraste?"}
                </h2>
              </div>

              <div className="p-5 sm:p-6">
                {!user ? (
                  <div className="space-y-3">
                    <p className="text-sm leading-6 text-[#5f6e78]">
                      Inicia sesión con tu cuenta institucional para{" "}
                      {item.kind === "encontrado"
                        ? "responder la pregunta llave y solicitar la entrega."
                        : "avisar al dueño que tienes su objeto."}
                    </p>
                    <Link href="/entrar" className={`${btn} w-full`}>
                      Iniciar sesión
                    </Link>
                  </div>
                ) : myClaim ? (
                  <div className="space-y-3 rounded-sm border border-[#bfd5e2] bg-[#f4f9fc] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-[#142c3c]">
                        {myClaim.status === "aprobada"
                          ? "Solicitud aprobada"
                          : myClaim.status === "rechazada"
                            ? "Solicitud rechazada"
                            : "Solicitud en revisión"}
                      </p>
                      {myClaim.answer_score !== null && item.kind === "encontrado" && (
                        <span className="rounded-sm border border-[#bfd5e2] bg-white px-2 py-0.5 font-mono text-xs font-bold text-[#155775]">
                          {Math.round(Number(myClaim.answer_score) * 100)}% coincidencia
                        </span>
                      )}
                    </div>
                    {myClaim.claimant_note && (
                      <p className="text-xs leading-5 text-[#455a64]">
                        <strong>Tu mensaje:</strong> {myClaim.claimant_note}
                      </p>
                    )}
                    {myClaim.review_note && (
                      <p className="rounded-sm border border-[#dcd9ce] bg-[#fffdf7] px-3 py-2 text-xs text-[#29404b]">
                        <strong>Nota de revisión:</strong> {myClaim.review_note}
                      </p>
                    )}
                  </div>
                ) : item.kind === "encontrado" ? (
                  item.security_question ? (
                    <ClaimForm id={item.id} question={item.security_question} mode="encontrado" />
                  ) : (
                    <p className="text-sm text-[#5f6e78]">Este reporte no tiene pregunta de seguridad.</p>
                  )
                ) : (
                  <ClaimForm
                    id={item.id}
                    question="Si encontraste este objeto en ESCOM, indica dónde lo tienes para coordinar la entrega con su dueño."
                    mode="perdido"
                  />
                )}
              </div>
            </section>
          )}

          {/* Recipient: QR delivery pass */}
          {isRecipient && handoff && isOpen && (
            <section className={`${card} space-y-4 p-5 sm:p-6`}>
              <div className="rounded-sm border border-[#b7d4e4] bg-[#edf6fb] p-5 text-center">
                <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#155775] uppercase">
                  Código QR temporal de entrega
                </p>
                <p className="mt-2 font-mono text-2xl font-extrabold tracking-[0.2em] text-[#142c3c] sm:text-3xl">
                  {handoff.token}
                </p>
                <div className="mx-auto mt-4 grid w-fit place-items-center rounded-sm border border-[#d5e4ee] bg-white p-3.5 shadow-xs">
                  <QRCodeSVG value={qrValue} size={176} title="Código QR temporal de entrega" />
                </div>
                <p className="mt-3 text-xs leading-5 text-[#4d6069]">
                  {handoff.is_expired ? (
                    <span className="font-bold text-[#8C1D18]">
                      Este código expiró. Renuévalo antes de la entrega.
                    </span>
                  ) : (
                    <>Válido hasta: {formatMxDateTime(handoff.expires_at)} (CDMX). Muéstralo solo al recibir tu objeto.</>
                  )}
                </p>
              </div>
              <form action={renewHandoff}>
                <input type="hidden" name="item_id" value={item.id} />
                <SubmitButton className={`${btnGhost} w-full`} pendingText="Renovando QR…">
                  Renovar código QR (+24h)
                </SubmitButton>
              </form>
            </section>
          )}

          {/* Contact & meeting coordination */}
          {contact && (
            <section className={`${card} space-y-4 p-5 sm:p-6`}>
              <div>
                <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#52656e] uppercase">
                  Coordinación de entrega
                </p>
                <h2 className="mt-0.5 text-lg font-extrabold text-[#142c3c]">Acuerda lugar y horario en ESCOM</h2>
              </div>

              <dl className="divide-y divide-[#d5e4ee] rounded-sm border border-[#bfd5e2] bg-[#f4f9fc] text-sm">
                <div className="p-3">
                  <dt className="text-[11px] font-extrabold tracking-wide text-[#52656e] uppercase">
                    Quien entrega / resguarda
                  </dt>
                  <dd className="mt-0.5 font-semibold text-[#142c3c]">
                    {contact.finder_name} ·{" "}
                    <a href={`mailto:${contact.finder_email}`} className="text-[#155775] underline">
                      {contact.finder_email}
                    </a>
                  </dd>
                </div>
                <div className="p-3">
                  <dt className="text-[11px] font-extrabold tracking-wide text-[#52656e] uppercase">
                    Dueño / receptor
                  </dt>
                  <dd className="mt-0.5 font-semibold text-[#142c3c]">
                    {contact.recipient_name} ·{" "}
                    <a href={`mailto:${contact.recipient_email}`} className="text-[#155775] underline">
                      {contact.recipient_email}
                    </a>
                  </dd>
                </div>
              </dl>

              {contact.meeting_note && (
                <div className="rounded-sm border border-[#dcd9ce] border-l-4 border-l-[#155775] bg-[#faf9f4] p-3 text-sm text-[#142c3c]">
                  <p className="text-[11px] font-extrabold tracking-wide text-[#52656e] uppercase">Acuerdo actual</p>
                  <p className="mt-1">{contact.meeting_note}</p>
                </div>
              )}

              {isOpen && (
                <form action={updateMeetingNote} className="space-y-2.5 border-t border-dashed border-[#dcd9ce] pt-4">
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="handoff_id" value={contact.handoff_id} />
                  <label className={label}>
                    Proponer o actualizar lugar y hora
                    <textarea
                      className={`${input} mt-1 min-h-16`}
                      name="meeting_note"
                      maxLength={500}
                      defaultValue={contact.meeting_note ?? ""}
                      placeholder="Ej. Hoy a las 14:30 en las mesas frente a Biblioteca (Edificio de Gobierno)"
                    />
                  </label>
                  <SubmitButton className={`${btnGhost} w-full`} pendingText="Guardando…">
                    Guardar nota de encuentro
                  </SubmitButton>
                </form>
              )}
            </section>
          )}

          {/* Finder: QR scanner & code verification */}
          {isFinder && handoff && isOpen && (
            <section className={`${card} p-5 sm:p-6`}>
              <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#52656e] uppercase">
                Confirmar entrega presencial
              </p>
              <h2 className="mt-0.5 text-lg font-extrabold text-[#142c3c]">
                Escanea o ingresa el código del dueño
              </h2>
              <p className="mt-1.5 text-sm leading-5 text-[#5f6e78]">
                Escanea el QR del receptor con tu cámara, sube una captura o escribe los 12 caracteres al entregar el objeto.
              </p>
              {handoff.is_expired && (
                <p className="mt-2.5 rounded-sm border border-[#e5c1bc] bg-[#fff0ec] px-3 py-2 text-xs font-bold text-[#8C1D18]">
                  El código temporal expiró. Pide al receptor renovarlo o presiona renovar abajo.
                </p>
              )}
              <QrDeliveryVerifyForm
                itemId={item.id}
                handoffId={handoff.handoff_id}
                initialCode={query.code ?? ""}
                action={confirmDelivery}
              />
              {handoff.is_expired && (
                <form action={renewHandoff} className="mt-2.5">
                  <input type="hidden" name="item_id" value={item.id} />
                  <SubmitButton className={`${btnGhost} w-full`} pendingText="Renovando QR…">
                    Renovar código QR (+24h)
                  </SubmitButton>
                </form>
              )}
            </section>
          )}

          {/* Admin: close spam/fake */}
          {isAdmin && isOpen && (
            <section className={`${card} space-y-3 p-5`}>
              <div>
                <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#52656e] uppercase">Administración</p>
                <h2 className="mt-0.5 text-sm font-extrabold text-[#142c3c]">Cerrar reporte falso o spam</h2>
              </div>
              <form action={closeItem} className="space-y-2.5">
                <input type="hidden" name="id" value={item.id} />
                <label className={label}>
                  Motivo de cierre administrativo
                  <input
                    className={`${input} mt-1`}
                    name="reason"
                    required
                    minLength={5}
                    maxLength={300}
                    placeholder="Reporte duplicado, falso o inapropiado"
                  />
                </label>
                <SubmitButton className={`${btnGhost} w-full`} pendingText="Cerrando reporte…">
                  Cerrar reporte como falso/spam
                </SubmitButton>
              </form>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
