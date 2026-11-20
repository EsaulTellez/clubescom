import Link from "next/link";
import { notFound } from "next/navigation";
import { AvisoExternalLink, AvisoViewTracker } from "@/components/aviso-external-link";
import { demoNoticeArt } from "@/lib/demo-art";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btnGhost, card } from "@/lib/ui";
import { DeleteAviso } from "../delete-aviso";
import { canManageAvisos, categoryLabel, formatWhen, sourceAreaLabel, UUID_RE } from "../shared";

export const dynamic = "force-dynamic";

type Aviso = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  category: string;
  source_area: string | null;
  featured: boolean;
  is_public: boolean;
  publish_at: Date;
  is_published: boolean;
  is_scheduled: boolean;
  external_url: string | null;
  social_copy: string | null;
  social_twitter: string | null;
  social_facebook: string | null;
  social_instagram: string | null;
  image_url: string | null;
  created_at: Date;
};

export default async function AvisoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [user, result] = await Promise.all([
    getSession(),
    pool.query<Aviso>(
      `select id, author_id, title, body, category, source_area, featured, is_public, publish_at, external_url, social_copy, social_twitter, social_facebook, social_instagram, image_url, created_at,
              (publish_at <= now()) as is_published,
              (publish_at > now()) as is_scheduled
       from avisos where id = $1`,
      [id],
    ),
  ]);
  const aviso = result.rows[0];
  if (!aviso) notFound();

  const owner = user?.id === aviso.author_id;
  const manage = canManageAvisos(user) && (owner || user?.role === "admin");
  const visible = (aviso.is_published && (aviso.is_public || Boolean(user))) || owner || manage;
  if (!visible) notFound();
  const art = aviso.image_url ?? demoNoticeArt(aviso.title);

  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <AvisoViewTracker avisoId={aviso.id} />
      <Link href="/avisos" className="text-sm text-[#006699]">
        Volver a avisos
      </Link>
      {art && (
        <img src={art} alt={`Cartel: ${aviso.title}`} className="mx-auto max-h-[44rem] w-full rounded-md bg-[#f4f3f0] object-contain" />
      )}
      <div className="board-sidecard space-y-3 border-t-4 border-t-[#006699] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-[#006699]">
          <span>{categoryLabel(aviso.category)}</span>
          {aviso.source_area && aviso.source_area !== "general" && (
            <span>· {sourceAreaLabel(aviso.source_area)}</span>
          )}
          {aviso.featured && <span>· Destacado</span>}
          {!aviso.is_public && <span>· Solo comunidad (con sesión)</span>}
          {aviso.is_scheduled && <span>· Programado</span>}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#1b4053] sm:text-4xl">{aviso.title}</h1>
        <p className="text-sm text-[#667085]">
          Publicado {formatWhen(aviso.publish_at)}
          {aviso.created_at.getTime() !== aviso.publish_at.getTime()
            ? ` · Creado ${formatWhen(aviso.created_at)}`
            : ""}
        </p>
        <p className="whitespace-pre-wrap text-sm leading-6">{aviso.body}</p>
        {aviso.external_url && (
          <div className="pt-1">
            <AvisoExternalLink avisoId={aviso.id} url={aviso.external_url} />
          </div>
        )}
        {manage && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Link href={`/avisos/${aviso.id}/editar`} className={btnGhost}>
              Editar
            </Link>
            <DeleteAviso id={aviso.id} />
          </div>
        )}
      </div>
      {(aviso.social_twitter || aviso.social_facebook || aviso.social_instagram || aviso.social_copy) && (
        <section className={`${card} space-y-3`}>
          <h2 className="text-sm font-semibold">Formatos para redes sociales</h2>
          {aviso.social_twitter && (
            <div>
              <p className="text-xs font-bold uppercase text-[#006699]">Twitter / X</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[#667085]">{aviso.social_twitter}</p>
            </div>
          )}
          {aviso.social_facebook && (
            <div>
              <p className="text-xs font-bold uppercase text-[#006699]">Facebook</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[#667085]">{aviso.social_facebook}</p>
            </div>
          )}
          {aviso.social_instagram && (
            <div>
              <p className="text-xs font-bold uppercase text-[#006699]">Instagram</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[#667085]">{aviso.social_instagram}</p>
            </div>
          )}
          {!aviso.social_twitter && !aviso.social_facebook && !aviso.social_instagram && aviso.social_copy && (
            <p className="whitespace-pre-wrap text-sm text-[#667085]">{aviso.social_copy}</p>
          )}
        </section>
      )}
    </article>
  );
}
