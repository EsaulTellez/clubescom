import Link from "next/link";
import { getAppealIdentity } from "./auth";
import { submitAppeal } from "./actions";
import { pool } from "@/lib/db";
import { card, input } from "@/lib/ui";
import { moderationAreaLabel, suspensionLabel } from "@/app/moderacion/shared";

export const dynamic = "force-dynamic";

type Suspension = {
  id: string;
  area: string;
  strike_count: number;
  starts_at: Date;
  ends_at: Date | null;
  is_permanent: boolean;
  appeal_id: string | null;
  appeal_status: string | null;
  review_note: string | null;
};

export default async function ApelacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; enviada?: string }>;
}) {
  const identity = await getAppealIdentity();
  const params = await searchParams;
  if (!identity) {
    return <section className={`${card} mx-auto max-w-xl space-y-3`}><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#006699]">Convivencia ESCOM</p><h1 className="text-3xl font-extrabold">Apelaciones</h1><p className="text-sm leading-6 text-[#526974]">Inicia sesión con la cuenta a la que se aplicó la suspensión para consultar el motivo o enviar una apelación.</p><Link href="/entrar" className="inline-flex min-h-10 items-center rounded-md bg-[#006699] px-4 py-2 text-sm font-bold text-white">Entrar</Link></section>;
  }

  const { rows } = await pool.query<Suspension>(
    `select s.id, s.area, s.strike_count, s.starts_at, s.ends_at, s.is_permanent,
            a.id as appeal_id, a.status as appeal_status, a.review_note
       from moderation_suspensions s
       left join moderation_appeals a on a.suspension_id = s.id
      where s.user_id = $1
      order by s.starts_at desc`, [identity.id],
  );
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="border-b-2 border-[#d4ddd9] pb-4">
        <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#006699]">Convivencia ESCOM · Revisión personal</p>
        <h1 className="mt-1 font-serif text-4xl font-extrabold tracking-[-.04em] text-[#173142]">Mis apelaciones</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#526974]">Hola, {identity.name}. Aquí puedes consultar tus suspensiones y explicar por qué solicitas una revisión. La decisión la toma administración general.</p>
      </header>
      {params.enviada && <p role="status" className="rounded-md border border-[#a7cfb3] bg-[#eff8f1] px-4 py-3 text-sm font-semibold text-[#235b35]">Recibimos tu apelación. La decisión aparecerá en esta página.</p>}
      {params.error && <p role="alert" className="rounded-md border border-[#e6b8ae] bg-[#fff4f1] px-4 py-3 text-sm font-semibold text-[#8a3528]">{params.error === "datos" ? "Escribe una explicación de entre 20 y 3000 caracteres." : params.error === "pendiente" ? "Ya tienes una apelación pendiente para esa suspensión." : "No se pudo guardar la apelación. Recarga la página e inténtalo de nuevo."}</p>}
      {rows.length === 0 ? <section className={`${card} space-y-2`}><h2 className="font-extrabold">Sin suspensiones registradas</h2><p className="text-sm text-[#5d7079]">Si crees que falta una resolución, contacta a administración general desde la escuela.</p></section> : rows.map((suspension) => (
        <article key={suspension.id} className={`${card} space-y-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-extrabold uppercase tracking-[.13em] text-[#006699]">{moderationAreaLabel(suspension.area)}</p><h2 className="mt-1 text-xl font-extrabold">Suspensión por {suspension.strike_count} infracciones</h2></div>
            <span className="rounded border border-[#dfb2aa] bg-[#fff0ed] px-2.5 py-1 text-xs font-extrabold text-[#8a3528]">{suspensionLabel(suspension)}</span>
          </div>
          {suspension.appeal_id ? <div className="border-l-4 border-[#b3cbd3] pl-3"><p className="text-sm font-bold">Estado de la apelación: {suspension.appeal_status}</p>{suspension.review_note && <p className="mt-1 text-sm leading-6 text-[#526974]">Respuesta de administración: {suspension.review_note}</p>}</div> : <form action={submitAppeal} className="grid gap-3 border-t border-[#e2e7e8] pt-4"><input type="hidden" name="suspension_id" value={suspension.id} /><label className="grid gap-1.5 text-sm font-bold">Motivo de la apelación<textarea required minLength={20} maxLength={3000} rows={5} name="body" className={`${input} resize-y`} placeholder="Explica qué ocurrió, qué parte quieres que revisemos y cualquier contexto útil." /></label><button className="min-h-11 w-fit rounded-md bg-[#006699] px-4 py-2 text-sm font-extrabold text-white hover:bg-[#004d73]">Enviar apelación</button></form>}
        </article>
      ))}
      <p><Link href="/" className="text-sm font-bold text-[#006699] underline underline-offset-2">Volver al tablero</Link></p>
    </div>
  );
}
