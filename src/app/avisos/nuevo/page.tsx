import Link from "next/link";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btn, card } from "@/lib/ui";
import { crearAviso } from "../actions";
import { AvisoForm } from "../aviso-form";
import { DeleteAviso } from "../delete-aviso";
import { canManageAvisos, categoryLabel, formatWhen, toDatetimeLocal } from "../shared";

export const dynamic = "force-dynamic";

type Historial = {
  id: string;
  title: string;
  category: string;
  featured: boolean;
  is_public: boolean;
  publish_at: Date;
};

export default async function NuevoAvisoPage() {
  const user = await getSession();
  const allowed = canManageAvisos(user);

  let historial: Historial[] = [];
  if (allowed && user) {
    const result = await pool.query<Historial>(
      `select id, title, category, featured, is_public, publish_at
       from avisos
       where author_id = $1
       order by created_at desc`,
      [user.id],
    );
    historial = result.rows;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href="/avisos" className="text-sm text-[#006699] hover:underline">
          Volver a avisos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo aviso</h1>
        <p className="mt-1 text-sm text-[#667085]">
          Publican administración y moderación de comunicación.
        </p>
      </div>

      {!user && (
        <div className={`${card} space-y-3`}>
          <p>Entra con tu cuenta para publicar avisos.</p>
          <Link href="/entrar" className={btn}>
            Entrar
          </Link>
        </div>
      )}

      {user && !allowed && (
        <p className={card}>
          Tu rol no puede crear avisos. Esta acción está reservada a administración y a moderación
          del área de comunicación.
        </p>
      )}

      {allowed && (
        <section className={card}>
          <AvisoForm
            action={crearAviso}
            submitLabel="Publicar aviso"
            initial={{
              title: "",
              body: "",
              category: "academico",
              featured: false,
              isPublic: true,
              publishAt: toDatetimeLocal(new Date()),
              socialCopy: "",
            }}
          />
        </section>
      )}

      {allowed && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Tu historial</h2>
          {historial.length === 0 ? (
            <p className={card}>Todavía no has publicado avisos.</p>
          ) : (
            <ul className="space-y-3">
              {historial.map((aviso) => (
                <li key={aviso.id} className={`${card} space-y-2`}>
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-[#006699]">
                    <span>{categoryLabel(aviso.category)}</span>
                    {aviso.featured && <span>· Destacado</span>}
                    {!aviso.is_public && <span>· Oculto</span>}
                  </div>
                  <h3 className="font-semibold">{aviso.title}</h3>
                  <p className="text-sm text-[#667085]">{formatWhen(aviso.publish_at)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/avisos/${aviso.id}`} className="text-sm text-[#006699] hover:underline">
                      Ver
                    </Link>
                    <Link
                      href={`/avisos/${aviso.id}/editar`}
                      className="text-sm text-[#006699] hover:underline"
                    >
                      Editar
                    </Link>
                    <DeleteAviso id={aviso.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
