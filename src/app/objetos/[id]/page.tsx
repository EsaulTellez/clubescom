import Link from "next/link";
import { Cover } from "@/components/cover";
import { FlowRail } from "@/components/flow-rail";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, btnGhost, card, input, label } from "@/lib/ui";
import { closeItem, confirmDelivery } from "../actions";
import { kindLabel, statusLabel, type ItemKind, type ItemStatus } from "../labels";
import { ClaimForm } from "./claim-form";

export const dynamic = "force-dynamic";

type Item = {
  id: string;
  reporter_id: string;
  kind: ItemKind;
  title: string;
  description: string;
  place: string;
  photo_url: string | null;
  status: ItemStatus;
  security_question: string | null;
  claim_code: string | null;
  matched_id: string | null;
  created_at: string;
};

export default async function ObjetoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const user = await getSession();
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const { rows } = validId
    ? await pool.query<Item>(
        `select id, reporter_id, kind, title, description, place, photo_url, status,
                security_question, claim_code, matched_id, created_at
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
        <Link className={btnGhost} href="/objetos">
          Volver a objetos
        </Link>
      </section>
    );
  }

  const match = item.matched_id
    ? (
        await pool.query<{ id: string; title: string; kind: ItemKind }>(
          "select id, title, kind from lost_items where id = $1",
          [item.matched_id],
        )
      ).rows[0]
    : undefined;
  const owner = user?.id === item.reporter_id;
  const when = new Date(item.created_at).toLocaleDateString("es-MX", { dateStyle: "medium" });

  const stage =
    item.status === "entregado" ? 3 : item.claim_code ? 2 : match ? 1 : 0;

  return (
    <article className="mx-auto max-w-6xl space-y-6">
      <Link href="/objetos" className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-[#006699] shadow-sm hover:bg-[#e6f3fa]">
        <span aria-hidden="true">←</span> Perdidos y encontrados
      </Link>

      <section aria-label="Estado del reporte" className="rounded-[28px] border border-white bg-white/80 p-4 shadow-[0_8px_28px_rgba(0,64,96,0.06)] sm:p-5">
        <FlowRail
          current={item.status === "cerrado" ? 0 : stage}
          steps={[
            { title: "Reporte", detail: "Se publica el hallazgo o la pérdida." },
            { title: "Coincidencia", detail: "Buscamos reportes parecidos." },
            { title: "Reclamo", detail: "La persona responde la pregunta." },
            { title: "Entrega", detail: "Se confirma con el código." },
          ]}
        />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.8fr)]">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-[30px] border border-white bg-white shadow-[0_12px_35px_rgba(0,64,96,0.1)]">
            <Cover tone={item.kind} image={item.photo_url} className="h-64 sm:h-[22rem]" />
            <header className="space-y-4 p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-3 py-1.5 font-extrabold text-white ${item.kind === "perdido" ? "bg-[#a85737]" : "bg-[#006699]"}`}>{kindLabel[item.kind]}</span>
                <span className="rounded-full bg-[#e6f3fa] px-3 py-1.5 font-bold text-[#006699]">{statusLabel[item.status]}</span>
                <span className="text-[#667085]">{when}</span>
                {owner && <span className="rounded-full bg-[#f2f4f6] px-3 py-1.5 font-bold text-[#62697a]">Tu reporte</span>}
              </div>
              <div>
                <h1 className="font-serif text-3xl font-extrabold tracking-tight text-[#222337] sm:text-4xl">{item.title}</h1>
                <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-[#52596a]">{item.description}</p>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-[#f3f8fb] p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-[#006699] shadow-sm">
                  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M16 8.5c0 4.8-6 9-6 9s-6-4.2-6-9a6 6 0 1 1 12 0Z"/><circle cx="10" cy="8.5" r="2"/></svg>
                </span>
                <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#8a91a1]">Lugar del reporte</p><p className="mt-0.5 font-bold text-[#353a4b]">{item.place}</p></div>
              </div>
              {match && <div className="rounded-2xl border border-[#b7d4e4] bg-[#eaf5fa] p-4">
                <p className="text-xs font-extrabold uppercase tracking-wide text-[#006699]">Posible coincidencia · {kindLabel[match.kind]}</p>
                <Link href={`/objetos/${match.id}`} className="mt-1 inline-block font-bold text-[#004d73] underline">{match.title}</Link>
              </div>}
            </header>
          </div>
        </section>

        <aside className="space-y-4">
          {item.status === "entregado" && <div className="rounded-3xl border border-[#b7d4e4] bg-[#eaf5fa] p-5 font-semibold text-[#004d73]">Este objeto ya se marcó como entregado.</div>}
          {item.status === "cerrado" && <div className="rounded-3xl border border-[#e9e7f2] bg-white p-5 text-sm text-[#667085]">Quien lo reportó cerró este aviso.</div>}

          {owner && item.status === "abierto" && <section className="rounded-[28px] border border-white bg-white p-5 shadow-[0_10px_30px_rgba(0,64,96,0.07)] sm:p-6">
            <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-[#006699]">Tu reporte</p>
            <h2 className="mt-1 text-xl font-extrabold">Entrega segura</h2>
            {item.claim_code ? <>
              <div className="mt-4 rounded-2xl bg-[#e6f3fa] px-4 py-5 text-center">
                <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#667085]">Código de entrega</p>
                <p className="mt-2 text-4xl font-extrabold tracking-[0.24em] text-[#006699] sm:text-5xl">{item.claim_code}</p>
              </div>
              <form action={confirmDelivery} className="mt-4 space-y-3">
                <input type="hidden" name="id" value={item.id} />
                <label className={label}>Confirma cuando ya lo entregaste
                  <input className={`${input} mt-2 uppercase tracking-widest`} name="code" required minLength={8} maxLength={8} placeholder="Código de 8 caracteres" autoComplete="off" />
                </label>
                {query.error === "codigo" && <p className="text-sm text-[#8C1D18]">El código no coincide.</p>}
                <button className={`${btn} w-full`}>Confirmar entrega</button>
              </form>
            </> : <p className="mt-3 text-sm leading-6 text-[#667085]">Cuando alguien responda la pregunta de seguridad, aquí aparecerá el código para confirmar la entrega.</p>}
            <form action={closeItem} className="mt-4 border-t border-[#edf2f5] pt-4">
              <input type="hidden" name="id" value={item.id} />
              <button className={`${btnGhost} w-full`}>Cerrar reporte</button>
            </form>
          </section>}

          {!owner && item.status === "abierto" && <section className="rounded-[28px] border border-white bg-white p-5 shadow-[0_10px_30px_rgba(0,64,96,0.07)] sm:p-6">
            <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-[#006699]">¿Lo reconoces?</p>
            <h2 className="mt-1 text-xl font-extrabold">Ayuda a que vuelva a casa</h2>
            {user && item.security_question ? <div className="mt-4"><ClaimForm id={item.id} question={item.security_question} /></div> : user ? <p className="mt-3 text-sm text-[#667085]">Este reporte no tiene pregunta de seguridad.</p> : <p className="mt-3 text-sm leading-6 text-[#667085]"><Link href="/entrar" className="font-bold text-[#006699] underline">Inicia sesión</Link> para responder la pregunta de seguridad y reclamar el objeto.</p>}
          </section>}
        </aside>
      </div>
    </article>
  );
}
