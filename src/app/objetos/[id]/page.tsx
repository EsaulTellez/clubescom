import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Cover } from "@/components/cover";
import { FlowRail } from "@/components/flow-rail";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { btn, btnGhost, card, input, label } from "@/lib/ui";
import { closeItem, confirmDelivery, reviewClaim, updateMeetingNote } from "../actions";
import { kindLabel, statusLabel, type ItemKind, type ItemStatus } from "../labels";
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
type Claim = {
  id: string;
  handoff_id: string | null;
  claimant_id: string;
  claimant_name: string;
  status: string;
  claimant_note: string | null;
  evidence_path: string | null;
  created_at: string;
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
  searchParams: Promise<{ error?: string; revisado?: string }>;
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
  const [match, claims, handoffs, contactRows] = await Promise.all([
    item.matched_id
      ? pool.query<{ id: string; title: string; kind: ItemKind }>("select id, title, kind from lost_items where id = $1", [item.matched_id]).then((result) => result.rows[0])
      : Promise.resolve(undefined),
    owner || isAdmin
      ? pool.query<Claim>(
          `select c.id, h.id as handoff_id, c.claimant_id, u.name as claimant_name, c.status, c.claimant_note, c.evidence_path, c.created_at
           from lost_item_claims c join users u on u.id = c.claimant_id
           left join lost_item_handoffs h on h.claim_id = c.id
           where c.lost_item_id = $1 order by c.created_at desc`,
          [id],
        ).then((result) => result.rows)
      : Promise.resolve([] as Claim[]),
    user && !owner && item.kind === "encontrado"
      ? createSupabaseServerClient().then((client) => client.rpc("get_my_lost_item_handoff", { p_item_id: id }))
          .then(({ data, error }) => error ? [] : (data ?? []))
      : Promise.resolve([] as { handoff_id: string; token: string; expires_at: string }[]),
    user && item.kind === "encontrado"
      ? createSupabaseServerClient().then((client) => client.rpc("get_lost_item_handoff_contact", { p_item_id: id }))
          .then(({ data, error }) => error ? [] : ((data ?? []) as HandoffContact[]))
      : Promise.resolve([] as HandoffContact[]),
  ]);
  const contact = contactRows[0] ?? null;

  const supabase = (owner || isAdmin) && claims.some((c) => c.evidence_path) ? await createSupabaseServerClient() : null;
  const claimsWithEvidence = await Promise.all(
    claims.map(async (claim) => {
      if (!supabase || !claim.evidence_path) return { ...claim, evidenceUrl: null };
      const { data } = await supabase.storage.from("lost-evidence").createSignedUrl(claim.evidence_path, 600);
      return { ...claim, evidenceUrl: data?.signedUrl ?? null };
    }),
  );

  const when = new Date(item.created_at).toLocaleDateString("es-MX", { dateStyle: "medium" });
  const stage = item.status === "entregado" ? 3 : claims.some((claim) => claim.status === "respuesta_correcta" || claim.status === "aprobada") ? 2 : match ? 1 : 0;

  return (
    <article className="board-page mx-auto max-w-6xl">
      <Link href="/objetos" className="inline-flex items-center gap-2 font-bold text-[#004d73] hover:underline">← Perdidos y encontrados</Link>

      <section aria-label="Estado del reporte" className={`${card} p-4 sm:p-5`}>
        <FlowRail current={item.status === "cerrado" ? 0 : stage} steps={[
          { title: "Reporte", detail: "Hallazgo o pérdida publicada." },
          { title: "Coincidencia", detail: "Se comparan reportes contrarios al 80 %." },
          { title: "Reclamo", detail: "La persona responde la pregunta de seguridad." },
          { title: "Entrega", detail: "Quien encontró confirma el código o QR del reclamante." },
        ]} />
      </section>

      {query.revisado && <p role="status" className="rounded-xl border border-[#bed8c1] bg-[#edf6ee] p-3 text-sm font-semibold text-[#28452d]">
        {query.revisado === "aprobado" ? "Reclamo aprobado. El código privado y los datos de contacto ya están disponibles." : query.revisado === "rechazado" ? "Se notificó la decisión a quien reclamó." : query.revisado === "nota" ? "Punto de entrega actualizado y notificado." : "La entrega quedó confirmada."}
      </p>}
      {query.error === "codigo" && <p role="alert" className="rounded-xl bg-[#fff0ec] p-3 text-sm text-[#8C1D18]">El código no coincide o ya venció.</p>}
      {query.error === "revision" && <p role="alert" className="rounded-xl bg-[#fff0ec] p-3 text-sm text-[#8C1D18]">No pudimos guardar la revisión. Puede que el reclamo ya se haya revisado.</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.8fr)]">
        <section className="space-y-4">
          <div className={`${card} overflow-hidden p-0`}>
            <Cover tone={item.kind} image={item.photo_url} className="h-64 sm:h-[22rem]" />
            {item.photo_url_2 && (
              <div className="border-t border-[#dcd9ce] bg-[#f4f3f0] p-3">
                <p className="mb-2 text-xs font-bold uppercase text-[#667085]">Segunda foto adjunta</p>
                <img src={item.photo_url_2} alt={`Segunda foto de ${item.title}`} className="max-h-64 w-full rounded-lg object-contain" />
              </div>
            )}
            <header className="space-y-4 p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-md px-3 py-1.5 font-extrabold text-white ${item.kind === "perdido" ? "bg-[#a85737]" : "bg-[#006699]"}`}>{kindLabel[item.kind]}</span>
                <span className="rounded-md bg-[#e5eff1] px-3 py-1.5 font-bold text-[#004d73]">{statusLabel[item.status]}</span>
                <span className="text-[#667085]">{when}</span>
                {owner && <span className="rounded-md bg-[#f4e7b5] px-3 py-1.5 font-bold text-[#58491e]">Tu reporte</span>}
              </div>
              <div>
                <h1 className="font-serif text-3xl font-extrabold tracking-tight text-[#173142] sm:text-4xl">{item.title}</h1>
                <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-[#52596a]">{item.description}</p>
              </div>
              <div className="flex items-center gap-3 border-y border-dashed border-[#dcd9ce] py-3">
                <span aria-hidden="true" className="text-lg text-[#006699]">⌖</span>
                <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#667085]">Lugar del reporte</p><p className="mt-0.5 font-bold text-[#173142]">{item.place}</p></div>
              </div>
              {match && <div className="rounded-xl border border-[#b7d4e4] bg-[#eaf5fa] p-4">
                <p className="text-xs font-extrabold uppercase tracking-wide text-[#006699]">Posible coincidencia · {kindLabel[match.kind]}</p>
                <Link href={`/objetos/${match.id}`} className="mt-1 inline-block font-bold text-[#004d73] underline">{match.title}</Link>
              </div>}
            </header>
          </div>
        </section>

        <aside className="space-y-4">
          {item.status === "entregado" && <div className="rounded-xl border border-[#b7d4e4] bg-[#eaf5fa] p-5 font-semibold text-[#004d73]">Este objeto ya se marcó como entregado.</div>}
          {item.status === "cerrado" && <div className={`${card} p-5 text-sm text-[#667085]`}>Este reporte fue cerrado.</div>}

          {owner && item.kind === "encontrado" && item.status === "abierto" && <section className={`${card} space-y-4 p-5 sm:p-6`}>
            <div><p className="board-eyebrow">Revisión del hallazgo</p><h2 className="text-xl font-extrabold">Reclamos</h2></div>
            {claimsWithEvidence.length === 0 ? <p className="text-sm leading-6 text-[#667085]">Todavía no hay reclamos. La respuesta de seguridad se mantiene privada.</p> : <ul className="space-y-3">
              {claimsWithEvidence.map((claim) => <li key={claim.id} className="border-t border-dashed border-[#dcd9ce] pt-3">
                <p className="font-bold">{claim.claimant_name}</p>
                <p className="text-xs text-[#667085]">{claim.status === "respuesta_correcta" ? "Respuesta validada · pendiente de tu revisión" : claim.status === "aprobada" ? "Aprobado · esperando entrega" : claim.status === "rechazada" ? "Rechazado" : claim.status}</p>
                {claim.claimant_note && <p className="mt-2 text-sm">{claim.claimant_note}</p>}
                {claim.evidenceUrl && (
                  <p className="mt-2 text-xs">
                    <a href={claim.evidenceUrl} target="_blank" rel="noreferrer" className="font-bold text-[#006699] underline">
                      Ver foto o comprobante adjunto por el reclamante →
                    </a>
                  </p>
                )}
                {claim.status === "respuesta_correcta" && <form action={reviewClaim} className="mt-3 space-y-2">
                  <input type="hidden" name="claim_id" value={claim.id} />
                  <input type="hidden" name="item_id" value={item.id} />
                  <label className={label}>Nota para la persona (opcional)<textarea className={`${input} mt-1 min-h-16`} name="review_note" maxLength={500} /></label>
                  <div className="flex flex-wrap gap-2">
                    <button className={btn} name="approve" value="true">Aprobar reclamo</button>
                    <button className={btnGhost} name="approve" value="false">Rechazar</button>
                  </div>
                </form>}
              </li>)}
            </ul>}
            <form action={closeItem} className="border-t border-dashed border-[#dcd9ce] pt-3">
              <input type="hidden" name="id" value={item.id} />
              <button className={`${btnGhost} w-full`}>Cerrar reporte</button>
            </form>
          </section>}

          {!owner && item.status === "abierto" && item.kind === "encontrado" && <section className={`${card} space-y-3 p-5 sm:p-6`}>
            <p className="board-eyebrow">¿Lo reconoces?</p><h2 className="text-xl font-extrabold">Ayuda a que vuelva a casa</h2>
            {user && handoffs[0] ? <div className="rounded-xl border border-[#b7d4e4] bg-[#eaf5fa] p-4 text-center">
              <p className="text-xs font-extrabold uppercase tracking-wide text-[#004d73]">Código de entrega para presentar</p>
              <p className="mt-2 font-mono text-3xl font-extrabold tracking-[.2em] text-[#006699]">{handoffs[0].token}</p>
              <div className="mx-auto mt-4 grid w-fit place-items-center rounded-lg bg-white p-3">
                <QRCodeSVG value={handoffs[0].token} size={176} title="Código QR temporal de entrega" />
              </div>
              <p className="mt-2 text-xs leading-5 text-[#526170]">Muestra el código o el QR a quien resguarda el objeto. Vence en 24 horas.</p>
            </div> : user && item.security_question ? <ClaimForm id={item.id} question={item.security_question} /> : !user ? <p className="text-sm leading-6 text-[#667085]"><Link href="/entrar" className="font-bold text-[#006699] underline">Inicia sesión</Link> para responder la pregunta y reclamar.</p> : <p className="text-sm text-[#667085]">Este reporte no tiene pregunta de seguridad.</p>}
          </section>}

          {owner && item.kind === "perdido" && item.status === "abierto" && <section className={`${card} p-5`}>
            <p className="board-eyebrow">Tu reporte</p><h2 className="text-lg font-extrabold">Cuando alguien encuentre el objeto</h2>
            <p className="mt-2 text-sm leading-6 text-[#667085]">La plataforma te avisará si aparece un reporte de hallazgo parecido.</p>
            <form action={closeItem} className="mt-4 border-t border-dashed border-[#dcd9ce] pt-3">
              <input type="hidden" name="id" value={item.id} /><button className={`${btnGhost} w-full`}>Cerrar reporte</button>
            </form>
          </section>}

          {contact && <section className={`${card} space-y-3 p-5 sm:p-6`}>
            <p className="board-eyebrow">Contacto para acordar la entrega</p>
            <h2 className="text-lg font-extrabold text-[#173142]">Coordina lugar y horario en ESCOM</h2>
            <dl className="space-y-2 rounded-xl border border-[#b7d4e4] bg-[#eaf5fa] p-3 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase text-[#526170]">Quien resguarda el objeto</dt>
                <dd className="font-semibold text-[#173142]">{contact.finder_name} · <a href={`mailto:${contact.finder_email}`} className="text-[#006699] underline">{contact.finder_email}</a></dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-[#526170]">Quien reclama</dt>
                <dd className="font-semibold text-[#173142]">{contact.recipient_name} · <a href={`mailto:${contact.recipient_email}`} className="text-[#006699] underline">{contact.recipient_email}</a></dd>
              </div>
            </dl>
            {contact.meeting_note && <p className="rounded-lg border border-[#dcd9ce] bg-[#fffdf7] p-3 text-sm"><strong>Acuerdo actual:</strong> {contact.meeting_note}</p>}
            {item.status === "abierto" && <form action={updateMeetingNote} className="space-y-2 border-t border-dashed border-[#dcd9ce] pt-3">
              <input type="hidden" name="item_id" value={item.id} />
              <input type="hidden" name="handoff_id" value={contact.handoff_id} />
              <label className={label}>Proponer o actualizar lugar y hora en la escuela<textarea className={`${input} mt-1 min-h-16`} name="meeting_note" maxLength={500} defaultValue={contact.meeting_note ?? ""} placeholder="Ej. Hoy a las 14:30 frente a Prefectura (Edificio de Gobierno)" /></label>
              <button className={`${btnGhost} w-full`}>Guardar nota de encuentro</button>
            </form>}
          </section>}

          {owner && item.kind === "encontrado" && claims.some((claim) => claim.status === "aprobada") && <section className={`${card} p-5`}>
            <p className="board-eyebrow">Entrega</p><h2 className="text-lg font-extrabold">Verifica a quien recibe</h2>
            <p className="mt-2 text-sm leading-6 text-[#667085]">Escanea el código QR con la cámara o pide a la persona que reclama el código temporal de 12 caracteres.</p>
            {claims.filter((claim) => claim.status === "aprobada").map((claim) => (
              <QrDeliveryVerifyForm key={claim.id} itemId={item.id} handoffId={claim.handoff_id ?? ""} action={confirmDelivery} />
            ))}
          </section>}

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
                <button className={`${btnGhost} w-full`}>Cerrar reporte como falso/spam</button>
              </form>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
