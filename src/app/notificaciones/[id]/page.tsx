import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Target = { href: string | null };

export default async function OpenNotificationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/entrar");

  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { rows } = await pool.query<Target>(
    "select href from notifications where id = $1 and user_id = $2 limit 1",
    [id, user.id],
  );
  const notice = rows[0];
  if (!notice) notFound();

  await pool.query("update notifications set read = true where id = $1 and user_id = $2 and read = false", [id, user.id]);
  if (notice.href?.startsWith("/") && !notice.href.startsWith("//")) redirect(notice.href);
  redirect("/notificaciones");
}
