import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btnGhost, card } from "@/lib/ui";
import { DeleteAviso } from "../delete-aviso";
import { canManageAvisos, categoryLabel, formatWhen, UUID_RE } from "../shared";

export const dynamic = "force-dynamic";

type Aviso = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  category: string;
  featured: boolean;
  is_public: boolean;
  publish_at: Date;
  social_copy: string | null;
  created_at: Date;
};

export default async function AvisoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [user, result] = await Promise.all([
    getSession(),
    pool.query<Aviso>(
      `select id, author_id, title, body, category, featured, is_public, publish_at, social_copy, created_at
       from avisos where id = $1`,
      [id],
    ),
  ]);
  const aviso = result.rows[0];
  if (!aviso) notFound();

  const owner = user?.id === aviso.author_id;
  const published = aviso.is_public && aviso.publish_at.getTime() <= Date.now();
  if (!published && !owner) notFound();
  const manage = owner && canManageAvisos(user);

  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <Link href="/avisos" className="text-sm text-[#006699]">
        Volver a avisos
      </Link>
      <Cover tone={aviso.category} kicker={categoryLabel(aviso.category)} title={aviso.title} className="h-56 rounded-3xl sm:h-72" />
      <div className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-[#006699]">
          <span>{categoryLabel(aviso.category)}</span>
          {aviso.featured && <span>· Destacado</span>}
          {!aviso.is_public && <span>· Oculto del feed</span>}
          {aviso.publish_at.getTime() > Date.now() && <span>· Programado</span>}
        </div>
        <h1 className="font-serif text-4xl tracking-tight">{aviso.title}</h1>
        <p className="text-sm text-[#667085]">
          Publicado {formatWhen(aviso.publish_at)}
          {aviso.created_at.getTime() !== aviso.publish_at.getTime()
            ? ` · Creado ${formatWhen(aviso.created_at)}`
            : ""}
        </p>
        <p className="whitespace-pre-wrap text-sm leading-6">{aviso.body}</p>
        {manage && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Link href={`/avisos/${aviso.id}/editar`} className={btnGhost}>
              Editar
            </Link>
            <DeleteAviso id={aviso.id} />
          </div>
        )}
      </div>
      {aviso.social_copy && (
        <section className={card}>
          <h2 className="text-sm font-medium">Formato para redes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[#667085]">{aviso.social_copy}</p>
        </section>
      )}
    </article>
  );
}
