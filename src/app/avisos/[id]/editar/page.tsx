import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { card } from "@/lib/ui";
import { actualizarAviso } from "../../actions";
import { AvisoForm } from "../../aviso-form";
import { DeleteAviso } from "../../delete-aviso";
import { canManageAvisos, isCategory, isSourceArea, toDatetimeLocal, UUID_RE } from "../../shared";

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
  valid_until: string | null;
  external_url: string | null;
  social_copy: string | null;
  social_twitter: string | null;
  social_facebook: string | null;
  social_instagram: string | null;
  image_url: string | null;
};

export default async function EditarAvisoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const user = await getSession();
  if (!user || !canManageAvisos(user)) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Link href="/avisos" className="text-sm text-[#006699] hover:underline">
          Volver a avisos
        </Link>
        <p className={card}>No tienes permiso para editar avisos.</p>
      </div>
    );
  }

  const { rows } = await pool.query<Aviso>(
    `select id, author_id, title, body, category, source_area, featured, is_public, publish_at, valid_until::text, external_url, social_copy, social_twitter, social_facebook, social_instagram, image_url
     from avisos where id = $1`,
    [id],
  );
  const aviso = rows[0];
  if (!aviso) notFound();
  if ((aviso.author_id !== user.id && user.role !== "admin") || !isCategory(aviso.category)) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Link href={`/avisos/${id}`} className="text-sm text-[#006699] hover:underline">
          Volver al aviso
        </Link>
        <p className={card}>Solo puedes editar avisos que publicaste tú o con cuenta de administración.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/avisos/${aviso.id}`} className="text-sm text-[#006699] hover:underline">
        Volver al aviso
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Editar aviso</h1>
      <section className={card}>
        <AvisoForm
          action={actualizarAviso}
          submitLabel="Guardar cambios"
          initial={{
            id: aviso.id,
            title: aviso.title,
            body: aviso.body,
            category: aviso.category,
            sourceArea: aviso.source_area && isSourceArea(aviso.source_area) ? aviso.source_area : "general",
            featured: aviso.featured,
            isPublic: aviso.is_public,
            publishAt: toDatetimeLocal(aviso.publish_at),
            validUntil: aviso.valid_until,
            externalUrl: aviso.external_url ?? "",
            socialCopy: aviso.social_copy ?? "",
            socialTwitter: aviso.social_twitter ?? "",
            socialFacebook: aviso.social_facebook ?? "",
            socialInstagram: aviso.social_instagram ?? "",
            imageUrl: aviso.image_url,
          }}
        />
      </section>
      <DeleteAviso id={aviso.id} />
    </div>
  );
}
