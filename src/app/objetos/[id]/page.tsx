import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ReportNotice } from "../report-notice";
import { FlowRail } from "@/components/flow-rail";
import { SubmitButton } from "@/components/loading-ui";
import { getSession } from "@/lib/auth";
import { formatMxDateTime } from "@/lib/datetime";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { btn, btnGhost, card, input, label } from "@/lib/ui";
import { closeItem, confirmDelivery, renewHandoff, reviewClaim, updateMeetingNote } from "../actions";
import { kindLabel, type ItemKind, type ItemStatus } from "../labels";
import { ClaimForm } from "./claim-form";
import { QrDeliveryVerifyForm } from "./qr-scanner";

export const dynamic = "force-dynamic";

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
        <h1 className="text-xl font-semibold">No encontramos ese reporte</h1>
        <p className="text-sm text-[#667085]">Puede que el enlace esté mal o que el reporte ya no exista.</p>
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
      : claims.some((c) => ["respuesta_correcta", "en_revision", "aprobada"].includes(c.status)) || Boolean(myClaim)
        ? 2
        : matches.length > 0
          ? 1
          : 0;

  const isFinder = Boolean(user && handoff?.finder_id === user.id);
  const isRecipient = Boolean(user && handoff?.recipient_id === user.id);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://clubescom.vercel.app";
  const qrValue = handoff ? `${baseUrl}/objetos/${id}?code=${handoff.token}` : "";

  return (
    <article className="board-page mx-auto max-w-6xl">
      <Link href="/objetos" className="inline-flex items-center gap-2 font-bold text-[#004d73] hover:underline">← Perdidos y encontrados</Link>

      {query.revisado && <p role="status" className="rounded-xl border border-[#bed8c1] bg-[#edf6ee] p-3 text-sm font-semibold text-[#28452d]">
        {query.revisado === "aprobado"
          ? "Solicitud aprobada. El código QR y los datos de contacto ya están disponibles."
          : query.revisado === "rechazado"
            ? "Se notificó la decisión al solicitante."
            : query.revisado === "renovado"
              ? "Código QR renovado por 24 horas adicionales."
              : query.revisado === "nota"
                ? "Punto de entrega actualizado y notificado."
                : "La entrega quedó confirmada."}
      </p>}
      {query.error === "codigo" && <p role="alert" className="rounded-xl bg-[#fff0ec] p-3 text-sm text-[#8C1D18]">El código no coincide o ya expiró.</p>}
      {query.error === "revision" && <p role="alert" className="rounded-xl bg-[#fff0ec] p-3 text-sm text-[#8C1D18]">No pudimos guardar la revisión. Puede que el reclamo ya se haya revisado.</p>}
      {query.error === "renovar" && <p role="alert" className="rounded-xl bg-[#fff0ec] p-3 text-sm text-[#8C1D18]">No se pudo renovar el código QR en este momento.</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.8fr)]">
        <section className="space-y-4">
          <ReportNotice item={item} detail owner={owner} />
          {matches.length > 0 && (
            <div className="space-y-2 rounded-xl border border-[#b7d4e4] bg-[#eaf5fa] p-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-[#006699]">
                Posibles coincidencias en reportes contrarios ({matches.length})
              </p>
              <ul className="space-y-1.5 text-sm">
                {matches.map((m) => (
                  <li key={m.id}>
                    <Link href={`/objetos/${m.id}`} className="font-bold text-[#004d73] underline">
                      {kindLabel[m.kind]}: {m.title}
                    </Link>{" "}
                    <span className="text-xs text-[#4b6775]">· {m.place}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <section aria-label="Estado del reporte" className={`${card} p-4 sm:p-5`}>
            <FlowRail current={item.status === "cerrado" ? 0 : stage} steps={[
              { title: "Reporte", detail: "Hallazgo o pérdida publicada." },
              { title: "Coincidencia", detail: "Se vinculan reportes contrarios." },
              { title: "Validación", detail: "Pregunta llave o aviso de hallazgo." },
              { title: "Entrega QR", detail: "Quien resguarda confirma el QR del dueño." },
            ]} />
          </section>
        </section>

        <aside className="space-y-4">
          {item.status === "entregado" && <div className="rounded-xl border border-[#b7d4e4] bg-[#eaf5fa] p-5 font-semibold text-[#004d73]">Este objeto ya se marcó como entregado.</div>}
          {item.status === "cerrado" && <div className={`${card} p-5 text-sm text-[#667085]`}>Este reporte fue cerrado.</div>}

          {owner && item.status === "abierto" && (
            <section className={`${card} space-y-4 p-5 sm:p-6`}>
              <div>
                <p className="board-eyebrow">{item.kind === "encontrado" ? "Revisión del hallazgo" : "Avisos recibidos"}</p>
                <h2 className="text-xl font-extrabold">
                  {item.kind === "encontrado" ? "Reclamos recibidos" : "Personas que reportaron encontrarlo"}
                </h2>
              </div>
              {claimsWithEvidence.length === 0 ? (
                <p className="text-sm leading-6 text-[#667085]">
                  {item.kind === "encontrado"
                    ? "Todavía no hay reclamos para evaluar."
                    : "Aún nadie ha reportado haber encontrado este objeto."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {claimsWithEvidence.map((claim) => {
                    const pct = claim.answer_score !== null ? Math.round(Number(claim.answer_score) * 100) : null;
                    const canReview = ["respuesta_correcta", "en_revision", "pendiente"].includes(claim.status);
                    return (
                      <li key={claim.id} className="space-y-2 border-t border-dashed border-[#dcd9ce] pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-bold text-[#14374a]">{claim.claimant_name}</p>
                          {pct !== null && item.kind === "encontrado" && (
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                                pct >= 72
                                  ? "bg-[#eaf7f0] text-[#17634a]"
                                  : "bg-[#fff6e0] text-[#7a5410]"
                              }`}
                            >
                              {pct}% coincidencia
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#667085]">
                          {claim.status === "respuesta_correcta"
                            ? "Coincidencia alta · pendiente de tu decisión"
                            : claim.status === "en_revision"
                              ? item.kind === "perdido"
                                ? "Aviso recibido · pendiente de aprobar para generar QR"
                                : "Coincidencia parcial · decide si corresponde al dueño real"
                              : claim.status === "aprobada"
                                ? "Aprobado · esperando entrega por QR"
                                : claim.status === "rechazada"
                                  ? "Rechazado"
                                  : claim.status}
                        </p>
                        {claim.answer_text && item.kind === "encontrado" && (
                          <p className="rounded-lg border border-[#dce8ef] bg-[#f8fbfd] px-3 py-2 text-xs text-[#19435b]">
                            <strong>Respuesta dada:</strong> {claim.answer_text}
                          </p>
                        )}
                        {claim.claimant_note && (
                          <p className="text-sm text-[#2d4856]">
                            <strong>Detalle:</strong> {claim.claimant_note}
                          </p>
                        )}
                        {claim.evidenceUrl && (
                          <p className="text-xs">
                            <a href={claim.evidenceUrl} target="_blank" rel="noreferrer" className="font-bold text-[#006699] underline">
                              Ver foto o comprobante adjunto →
                            </a>
                          </p>
                        )}
                        {canReview && (
                          <form action={reviewClaim} className="mt-2 space-y-2">
                            <input type="hidden" name="claim_id" value={claim.id} />
                            <input type="hidden" name="item_id" value={item.id} />
                            <label className={label}>
                              Nota para la persona (opcional)
                              <textarea className={`${input} mt-1 min-h-16`} name="review_note" maxLength={500} />
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <SubmitButton className={btn} name="approve" value="true" pendingText="Aprobando…">
                                {item.kind === "perdido" ? "Es mi objeto · generar QR" : "Aceptar como dueño"}
                              </SubmitButton>
                              <SubmitButton className={btnGhost} name="approve" value="false" pendingText="Rechazando…">
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
              <form action={closeItem} className="border-t border-dashed border-[#dcd9ce] pt-3">
                <input type="hidden" name="id" value={item.id} />
                <SubmitButton className={`${btnGhost} w-full`} pendingText="Cerrando…">
                  Cerrar reporte
                </SubmitButton>
              </form>
            </section>
          )}

          {!owner && item.status === "abierto" && !isRecipient && !isFinder && (
            <section className={`${card} space-y-3 p-5 sm:p-6`}>
              <h2 className="text-xl font-extrabold">
                {item.kind === "encontrado" ? "Reclamar este objeto" : "¿Lo encontraste?"}
              </h2>
              {!user ? (
                <p className="text-sm leading-6 text-[#667085]">
                  <Link href="/entrar" className="font-bold text-[#006699] underline">Inicia sesión</Link>{" "}
                  {item.kind === "encontrado" ? "para responder la pregunta llave." : "para avisar que encontraste este objeto."}
                </p>
              ) : myClaim ? (
                <div className="space-y-2 rounded-xl border border-[#cfe2ec] bg-[#f4f9fc] p-4 text-sm">
                  <p className="font-bold text-[#14374a]">
                    {myClaim.status === "aprobada"
                      ? "Solicitud aprobada"
                      : myClaim.status === "rechazada"
                        ? "Solicitud rechazada"
                        : "Tu solicitud está en revisión"}
                  </p>
                  {myClaim.answer_score !== null && item.kind === "encontrado" && (
                    <p className="text-xs text-[#4b6775]">
                      Coincidencia registrada: {Math.round(Number(myClaim.answer_score) * 100)}%
                    </p>
                  )}
                  {myClaim.review_note && (
                    <p className="text-xs text-[#355260]">Nota de revisión: {myClaim.review_note}</p>
                  )}
                </div>
              ) : item.kind === "encontrado" ? (
                item.security_question ? (
                  <ClaimForm id={item.id} question={item.security_question} mode="encontrado" />
                ) : (
                  <p className="text-sm text-[#667085]">Este reporte no tiene pregunta de seguridad.</p>
                )
              ) : (
                <ClaimForm
                  id={item.id}
                  question="Si encontraste este objeto en ESCOM, describe dónde lo tienes para coordinar la entrega con su dueño."
                  mode="perdido"
                />
              )}
            </section>
          )}

          {isRecipient && handoff && item.status === "abierto" && (
            <section className={`${card} space-y-3 p-5 sm:p-6`}>
              <div className="rounded-xl border border-[#b7d4e4] bg-[#eaf5fa] p-4 text-center">
                <p className="text-xs font-extrabold uppercase tracking-wide text-[#004d73]">
                  Tu código QR temporal para recibir el objeto
                </p>
                <p className="mt-2 font-mono text-3xl font-extrabold tracking-[.2em] text-[#006699]">{handoff.token}</p>
                <div className="mx-auto mt-4 grid w-fit place-items-center rounded-lg bg-white p-3">
                  <QRCodeSVG value={qrValue} size={176} title="Código QR temporal de entrega" />
                </div>
                <p className="mt-2 text-xs leading-5 text-[#526170]">
                  {handoff.is_expired ? (
                    <span className="font-bold text-[#8C1D18]">Este código expiró. Renuévalo antes de la entrega.</span>
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

          {contact && (
            <section className={`${card} space-y-3 p-5 sm:p-6`}>
              <p className="board-eyebrow">Contacto para acordar la entrega</p>
              <h2 className="text-lg font-extrabold text-[#173142]">Coordina lugar y horario en ESCOM</h2>
              <dl className="space-y-2 rounded-xl border border-[#b7d4e4] bg-[#eaf5fa] p-3 text-sm">
                <div>
                  <dt className="text-xs font-bold uppercase text-[#526170]">Quien entrega / resguarda</dt>
                  <dd className="font-semibold text-[#173142]">{contact.finder_name} · <a href={`mailto:${contact.finder_email}`} className="text-[#006699] underline">{contact.finder_email}</a></dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-[#526170]">Dueño / receptor</dt>
                  <dd className="font-semibold text-[#173142]">{contact.recipient_name} · <a href={`mailto:${contact.recipient_email}`} className="text-[#006699] underline">{contact.recipient_email}</a></dd>
                </div>
              </dl>
              {contact.meeting_note && <p className="rounded-lg border border-[#dcd9ce] bg-[#fffdf7] p-3 text-sm"><strong>Acuerdo actual:</strong> {contact.meeting_note}</p>}
              {item.status === "abierto" && (
                <form action={updateMeetingNote} className="space-y-2 border-t border-dashed border-[#dcd9ce] pt-3">
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="handoff_id" value={contact.handoff_id} />
                  <label className={label}>
                    Proponer o actualizar lugar y hora en la escuela
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

          {isFinder && handoff && item.status === "abierto" && (
            <section className={`${card} p-5`}>
              <p className="board-eyebrow">Confirmar entrega presencial</p>
              <h2 className="text-lg font-extrabold">Escanea o ingresa el código del dueño</h2>
              <p className="mt-2 text-sm leading-6 text-[#667085]">
                Escanea el código QR del receptor con tu cámara, sube una captura o escribe los 12 caracteres al entregar el objeto.
              </p>
              {handoff.is_expired && (
                <p className="mt-2 text-xs font-bold text-[#8C1D18]">
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
                <form action={renewHandoff} className="mt-2">
                  <input type="hidden" name="item_id" value={item.id} />
                  <SubmitButton className={`${btnGhost} w-full`} pendingText="Renovando QR…">
                    Renovar código QR (+24h)
                  </SubmitButton>
                </form>
              )}
            </section>
          )}

          {isAdmin && item.status === "abierto" && (
            <section className={`${card} space-y-2 p-5`}>
              <p className="board-eyebrow">Administración</p>
              <h2 className="text-sm font-extrabold">Cerrar reporte falso o spam</h2>
              <form action={closeItem} className="space-y-2">
                <input type="hidden" name="id" value={item.id} />
                <label className={label}>
                  Motivo de cierre administrativo
                  <input className={input} name="reason" required minLength={5} maxLength={300} placeholder="Reporte duplicado, falso o inapropiado" />
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
