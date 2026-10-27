import Image from "next/image";
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
    <article className="mx-auto max-w-3xl space-y-4">
      <Link href="/objetos" className="text-sm text-[#006699]">
        Objetos
      </Link>
      {item.photo_url ? (
        <div className="relative aspect-[16/7] w-full overflow-hidden rounded-3xl">
          <Image src={item.photo_url} alt={item.title} fill className="object-cover" sizes="48rem" />
        </div>
      ) : (
        <Cover tone={item.kind} kicker={kindLabel[item.kind]} title={item.title} className="h-44 rounded-3xl sm:h-56" />
      )}
      <FlowRail
        current={item.status === "cerrado" ? 0 : stage}
        steps={[
          { title: "Reporte", detail: "Alguien publica perdido o encontrado." },
          { title: "Coincidencia", detail: "Si el texto se parece, avisamos a los dos." },
          { title: "Reclamo", detail: "La otra persona responde la pregunta." },
          { title: "Entrega", detail: "El código confirma que ya se devolvió." },
        ]}
      />
      <header className={card}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-[#006699] px-2 py-1 font-medium text-white">
            {kindLabel[item.kind]}
          </span>
          <span className="rounded-full bg-[#e6f3fa] px-2 py-1">{statusLabel[item.status]}</span>
          <span className="text-[#667085]">{when}</span>
          {owner && <span className="text-[#006699]">Tu reporte</span>}
        </div>
        <h1 className="mt-3 font-serif text-4xl tracking-tight">{item.title}</h1>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{item.description}</p>
        <p className="mt-3 text-sm text-[#667085]">Lugar: {item.place}</p>
        {match && (
          <p className="mt-3 text-sm">
            Posible coincidencia ({kindLabel[match.kind]}):{" "}
            <Link href={`/objetos/${match.id}`} className="font-medium text-[#006699] underline">
              {match.title}
            </Link>
          </p>
        )}
      </header>

      {item.status === "entregado" && (
        <p className={card}>Este objeto ya se marcó como entregado.</p>
      )}
      {item.status === "cerrado" && (
        <p className={card}>Quien lo reportó cerró este aviso.</p>
      )}

      {owner && item.status === "abierto" && (
        <section className={`${card} space-y-4`}>
          <h2 className="font-semibold">Entrega</h2>
          {item.claim_code ? (
            <>
              <div className="rounded-xl bg-[#e6f3fa] px-4 py-5 text-center">
                <p className="text-xs uppercase tracking-wide text-[#667085]">Código de entrega</p>
                <p className="mt-2 text-4xl font-semibold tracking-[0.28em] text-[#006699] sm:text-5xl">
                  {item.claim_code}
                </p>
              </div>
              <form action={confirmDelivery} className="space-y-3">
                <input type="hidden" name="id" value={item.id} />
                <label className={label}>
                  Confirmar entrega
                  <input
                    className={`${input} mt-1 uppercase tracking-widest`}
                    name="code"
                    required
                    minLength={8}
                    maxLength={8}
                    placeholder="Código de 8 caracteres"
                    autoComplete="off"
                  />
                </label>
                {query.error === "codigo" && (
                  <p className="text-sm text-[#8C1D18]">El código no coincide.</p>
                )}
                <button className={btn}>Confirmar entrega</button>
              </form>
            </>
          ) : (
            <p className="text-sm text-[#667085]">
              Cuando alguien responda la pregunta de seguridad, aquí aparecerá el código para confirmar la entrega.
            </p>
          )}
          <form action={closeItem}>
            <input type="hidden" name="id" value={item.id} />
            <button className={btnGhost}>Cerrar reporte</button>
          </form>
        </section>
      )}

      {!owner && item.status === "abierto" && (
        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold">Reclamar</h2>
          {user && item.security_question ? (
            <ClaimForm id={item.id} question={item.security_question} />
          ) : user ? (
            <p className="text-sm text-[#667085]">Este reporte no tiene pregunta de seguridad.</p>
          ) : (
            <p className="text-sm text-[#667085]">
              <Link href="/entrar" className="font-medium text-[#006699] underline">
                Inicia sesión
              </Link>{" "}
              para responder la pregunta de seguridad y reclamar el objeto.
            </p>
          )}
        </section>
      )}
    </article>
  );
}
