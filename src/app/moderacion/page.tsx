import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { card, input } from "@/lib/ui";
import { reviewAppeal, registerStrike } from "./actions";
import { MODERATION_AREAS, moderationAreaLabel, suspensionLabel } from "./shared";

export const dynamic = "force-dynamic";

type Search = Promise<{ error?: string; guardada?: string; resuelta?: string }>;
type Person = { id: string; name: string; role: string; area: string | null };
type Strike = { id: string; user_name: string; area: string; reason: string; source_type: string; created_at: Date; strike_total: number };
type Suspension = { id: string; user_name: string; area: string; strike_count: number; duration: string | null; starts_at: Date; ends_at: Date | null; is_permanent: boolean };
type Appeal = { id: string; suspension_id: string; body: string; status: string; created_at: Date; user_name: string; area: string; strike_count: number; starts_at: Date; is_permanent: boolean; ends_at: Date | null };

function when(value: Date | string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(value));
}

export default async function ModeracionPage({ searchParams }: { searchParams: Search }) {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "moderador")) redirect("/entrar");

  const [peopleResult, strikesResult, suspensionsResult, appealsResult] = await Promise.all([
    pool.query<Person>(
      `select id, name, role, area from users
        where is_active and role <> 'admin' and id <> $1
        order by name limit 500`, [user.id],
    ),
    pool.query<Strike>(
      `select s.id, u.name as user_name, s.area, s.reason, s.source_type, s.created_at,
              (select count(*)::int from moderation_strikes all_s where all_s.user_id = s.user_id) as strike_total
         from moderation_strikes s join users u on u.id = s.user_id
        order by s.created_at desc limit 100`,
    ),
    pool.query<Suspension>(
      `select s.id, u.name as user_name, s.area, s.strike_count, s.duration,
              s.starts_at, s.ends_at, s.is_permanent
         from moderation_suspensions s join users u on u.id = s.user_id
        order by s.starts_at desc limit 100`,
    ),
    pool.query<Appeal>(
      `select a.id, a.suspension_id, a.body, a.status, a.created_at,
              u.name as user_name, s.area, s.strike_count, s.starts_at, s.is_permanent, s.ends_at
         from moderation_appeals a
         join moderation_suspensions s on s.id = a.suspension_id
         join users u on u.id = a.user_id
        order by (a.status = 'pendiente') desc, a.created_at desc limit 100`,
    ),
  ]);
  const params = await searchParams;
  const areaChoices = user.role === "moderador"
    ? MODERATION_AREAS.filter((area) => area.id === user.area)
    : MODERATION_AREAS;

  return (
    <div className="space-y-8">
      <header className="border-b-2 border-[#d4ddd9] pb-4">
        <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#006699]">Convivencia ESCOM · Personal institucional</p>
        <h1 className="mt-1 font-serif text-4xl font-extrabold tracking-[-.04em] text-[#173142]">Moderación</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#526974]">Registra infracciones con motivo y revisa el historial dentro de tu área. Cada tres infracciones confirmadas activa el siguiente nivel de suspensión.</p>
      </header>

      {params.guardada && <p role="status" className="rounded-md border border-[#a7cfb3] bg-[#eff8f1] px-4 py-3 text-sm font-semibold text-[#235b35]">La infracción quedó registrada. Si completó un bloque de tres, la suspensión ya está activa.</p>}
      {params.resuelta && <p role="status" className="rounded-md border border-[#a7cfb3] bg-[#eff8f1] px-4 py-3 text-sm font-semibold text-[#235b35]">La apelación quedó resuelta y se notificó a la persona.</p>}
      {params.error && <p role="alert" className="rounded-md border border-[#e6b8ae] bg-[#fff4f1] px-4 py-3 text-sm font-semibold text-[#8a3528]">{params.error === "datos" ? "Revisa el motivo, la persona y el área seleccionada." : params.error === "persona" ? "No encontramos esa cuenta o no puede recibir una infracción." : params.error === "nota" ? "Explica la decisión con al menos cinco caracteres." : params.error}</p>}

      <section className={`${card} space-y-4`}>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#006699]">Registro de incidencia</p>
          <h2 className="mt-1 text-xl font-extrabold text-[#173142]">Nueva infracción</h2>
        </div>
        <form action={registerStrike} className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-bold">Cuenta involucrada
            <select required name="user_id" defaultValue="" className={input}>
              <option value="" disabled>Selecciona una persona</option>
              {peopleResult.rows.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}{person.area ? ` · ${person.area}` : ""}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-bold">Área del contenido
            <select required name="area" defaultValue={user.area ?? areaChoices[0]?.id} className={input} disabled={user.role === "moderador"}>
              {areaChoices.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
            </select>
            {user.role === "moderador" && <input type="hidden" name="area" value={user.area ?? ""} />}
          </label>
          <label className="grid gap-1.5 text-sm font-bold">Tipo de contenido
            <select name="source_type" className={input} defaultValue="foro">
              <option value="foro">Foro</option><option value="guia">Guía</option><option value="aviso">Aviso</option><option value="club">Club</option><option value="objeto">Objeto perdido</option><option value="otro">Otro</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-bold md:col-span-2">Motivo y contexto
            <textarea required minLength={8} maxLength={1000} name="reason" rows={4} className={`${input} resize-y`} placeholder="Describe qué ocurrió y por qué corresponde registrar una infracción." />
          </label>
          <p className="text-xs leading-5 text-[#5d7079] md:col-span-2">Escalera vigente: 3 infracciones → 1 mes; 6 → 3 meses; 9 → 6 meses; 12 o más → permanente. El conteo es acumulado durante la vida de la cuenta, como quedó definido para la demo.</p>
          <button className="min-h-11 w-fit rounded-md bg-[#006699] px-4 py-2 text-sm font-extrabold text-white hover:bg-[#004d73]">Registrar infracción</button>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#006699]">Registro institucional</p><h2 className="mt-1 text-2xl font-extrabold">Apelaciones</h2></div>{user.role === "admin" && <span className="rounded border border-[#b9ccd3] bg-[#eef4f4] px-2.5 py-1 text-xs font-bold text-[#28536a]">Resolución exclusiva de administración</span>}</div>
        {appealsResult.rows.length === 0 && <p className={`${card} text-sm text-[#5d7079]`}>No hay apelaciones visibles para tu cuenta o área.</p>}
        <div className="grid gap-3">
          {appealsResult.rows.map((appeal) => (
            <article key={appeal.id} className={`${card} space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-extrabold">{appeal.user_name} <span className="font-medium text-[#657780]">· {moderationAreaLabel(appeal.area)}</span></h3>
                <span className={`rounded px-2.5 py-1 text-xs font-extrabold ${appeal.status === "pendiente" ? "bg-[#fff3d7] text-[#775718]" : appeal.status === "aceptada" ? "bg-[#e8f6ec] text-[#28633d]" : "bg-[#fbeae7] text-[#8a3528]"}`}>{appeal.status}</span>
              </div>
              <p className="text-sm leading-6 text-[#344e5e]">{appeal.body}</p>
              <p className="text-xs text-[#657780]">Suspensión de {appeal.strike_count} infracciones · {suspensionLabel(appeal)} · apelada {when(appeal.created_at)}</p>
              {user.role === "admin" && appeal.status === "pendiente" && (
                <form action={reviewAppeal} className="grid gap-3 border-t border-[#e2e7e8] pt-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <input type="hidden" name="appeal_id" value={appeal.id} />
                  <label className="grid gap-1.5 text-sm font-bold">Resolución y motivo
                    <textarea required minLength={5} maxLength={1000} name="review_note" rows={2} className={`${input} resize-y`} placeholder="Explica la decisión; se mostrará a la persona." />
                  </label>
                  <button name="decision" value="aceptar" className="min-h-10 rounded-md bg-[#1d7143] px-4 py-2 text-sm font-bold text-white hover:bg-[#155634]">Aceptar y levantar</button>
                  <button name="decision" value="rechazar" className="min-h-10 rounded-md border border-[#b97063] px-4 py-2 text-sm font-bold text-[#8a3528] hover:bg-[#fff4f1]">Rechazar</button>
                </form>
              )}
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-3">
          <div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#006699]">Actividad reciente</p><h2 className="mt-1 text-2xl font-extrabold">Infracciones</h2></div>
          {strikesResult.rows.length === 0 ? <p className={`${card} text-sm text-[#5d7079]`}>Todavía no hay infracciones en esta vista.</p> : strikesResult.rows.map((strike) => <article key={strike.id} className={`${card} space-y-1.5`}><div className="flex flex-wrap justify-between gap-2"><strong>{strike.user_name}</strong><span className="text-xs font-bold text-[#496371]">{moderationAreaLabel(strike.area)} · #{strike.strike_total}</span></div><p className="text-sm leading-6 text-[#344e5e]">{strike.reason}</p><p className="text-xs text-[#657780]">{strike.source_type} · {when(strike.created_at)}</p></article>)}
        </section>
        <section className="space-y-3">
          <div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#006699]">Historial</p><h2 className="mt-1 text-2xl font-extrabold">Suspensiones</h2></div>
          {suspensionsResult.rows.length === 0 ? <p className={`${card} text-sm text-[#5d7079]`}>Todavía no hay suspensiones en esta vista.</p> : suspensionsResult.rows.map((suspension) => <article key={suspension.id} className={`${card} space-y-1.5`}><div className="flex flex-wrap justify-between gap-2"><strong>{suspension.user_name}</strong><span className="text-xs font-extrabold text-[#8a3528]">{suspensionLabel(suspension)}</span></div><p className="text-sm text-[#344e5e]">{suspension.strike_count} infracciones acumuladas · {moderationAreaLabel(suspension.area)}</p><p className="text-xs text-[#657780]">Inició {when(suspension.starts_at)}</p></article>)}
        </section>
      </div>
      <p className="text-sm text-[#5d7079]">Las apelaciones pueden presentarse incluso durante una suspensión desde <Link href="/apelaciones" className="font-bold text-[#006699] underline underline-offset-2">esta página</Link>. Solo administración general puede resolverlas.</p>
    </div>
  );
}
