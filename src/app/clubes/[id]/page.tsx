import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { card } from "@/lib/ui";
import { DecisionButtons, JoinButton } from "../forms";
import { isUuid, kindLabel } from "../format";

export const dynamic = "force-dynamic";

type Club = {
  id: string;
  name: string;
  kind: string;
  description: string;
  schedule: string | null;
  leader_id: string | null;
  advisor_id: string | null;
  active: boolean;
  leader_name: string | null;
  advisor_name: string | null;
};

type Pending = { user_id: string; name: string; boleta: string | null };

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const user = await getSession();
  let club: Club | undefined;
  let membership: string | null = null;
  let pending: Pending[] = [];
  let dbDown = false;

  try {
    const result = await pool.query<Club>(
      `select c.id, c.name, c.kind, c.description, c.schedule, c.leader_id, c.advisor_id, c.active,
              leader.name as leader_name,
              advisor.name as advisor_name
       from clubs c
       left join users leader on leader.id = c.leader_id
       left join users advisor on advisor.id = c.advisor_id
       where c.id = $1`,
      [id],
    );
    club = result.rows[0];
    if (club && user) {
      const mine = await pool.query<{ status: string }>(
        `select status from memberships where club_id = $1 and user_id = $2`,
        [id, user.id],
      );
      membership = mine.rows[0]?.status ?? null;
    }
    if (club && user && (user.id === club.leader_id || user.id === club.advisor_id)) {
      const queue = await pool.query<Pending>(
        `select m.user_id, u.name, u.boleta
         from memberships m
         join users u on u.id = m.user_id
         where m.club_id = $1 and m.status = 'pendiente'
         order by u.name`,
        [id],
      );
      pending = queue.rows;
    }
  } catch {
    dbDown = true;
  }

  if (dbDown) {
    return <p className={card}>No se pudo consultar el club. Revisa que Postgres esté en marcha.</p>;
  }
  if (!club) notFound();

  const manages = Boolean(user && (user.id === club.leader_id || user.id === club.advisor_id));
  const canRequest = Boolean(user && club.active && !manages && membership !== "pendiente" && membership !== "aceptada");

  return (
    <div className="space-y-6">
      <Link href="/clubes" className="text-sm text-[#006699]">
        Clubes
      </Link>
      <article className="overflow-hidden rounded-3xl border border-[#d5e4ee] bg-white shadow-[0_8px_30px_rgba(0,40,60,0.05)]">
        <Cover tone={club.kind} className="h-48 sm:h-60" />
        <div className="space-y-4 px-5 pb-6 sm:px-6">
          <div className="pt-5">
            <p className="text-xs uppercase tracking-wide text-[#006699]">{kindLabel(club.kind)}</p>
            <h1 className="font-serif text-3xl tracking-tight">{club.name}</h1>
          </div>
        {!club.active && <p className="text-sm text-[#8C1D18]">Este club no está activo.</p>}
        <p className="whitespace-pre-wrap text-sm leading-6">{club.description}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[#667085]">Horario</dt>
            <dd>{club.schedule?.trim() || "Sin horario publicado"}</dd>
          </div>
          <div>
            <dt className="text-[#667085]">Responsable</dt>
            <dd>{club.leader_name || "Sin responsable"}</dd>
          </div>
          <div>
            <dt className="text-[#667085]">Asesor</dt>
            <dd>{club.advisor_name || "Sin asesor"}</dd>
          </div>
        </dl>
        </div>
      </article>

      {club.active && (
        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold">Integrantes</h2>
          {!user && (
            <p className="text-sm text-[#667085]">
              <Link href="/entrar" className="font-medium text-[#006699] underline">
                Entra
              </Link>{" "}
              para solicitar ingreso.
            </p>
          )}
          {membership === "pendiente" && <p className="text-sm">Tu solicitud está pendiente de revisión.</p>}
          {membership === "aceptada" && <p className="text-sm">Ya eres integrante de este club.</p>}
          {membership === "rechazada" && (
            <p className="text-sm text-[#667085]">Tu solicitud anterior no fue aceptada. Puedes enviarla de nuevo.</p>
          )}
          {canRequest && <JoinButton clubId={club.id} />}
          {manages && <p className="text-sm text-[#667085]">Acompañas este club como responsable o asesor.</p>}
        </section>
      )}

      {manages && club.active && (
        <section className={`${card} space-y-4`}>
          <div>
            <h2 className="font-semibold">Solicitudes pendientes</h2>
            <p className="mt-1 text-sm text-[#667085]">Acepta o rechaza a quien pidió unirse.</p>
          </div>
          {pending.length === 0 && <p className="text-sm text-[#667085]">No hay solicitudes pendientes.</p>}
          <ul className="space-y-3">
            {pending.map((person) => (
              <li key={person.user_id} className="flex flex-col gap-3 border-t border-[#d5e4ee] pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">
                  {person.name}
                  {person.boleta ? <span className="text-[#667085]"> · {person.boleta}</span> : null}
                </p>
                <DecisionButtons clubId={club.id} userId={person.user_id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
