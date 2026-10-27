import { redirect } from "next/navigation";
import { deleteAccount } from "@/lib/auth-actions";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btnGhost, card } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const badges = await pool.query<{ label: string }>(
    "select label from badges where user_id = $1 order by awarded_at desc",
    [user.id],
  );
  const exportUrl = `/api/me/export`;

  return (
    <section className={`${card} max-w-xl space-y-3`}>
      <h1 className="text-xl font-semibold">{user.name}</h1>
      <p className="text-sm text-[#667085]">{user.email}</p>
      <p className="text-sm">Rol: {user.role}{user.area ? ` · ${user.area}` : ""}</p>
      <p className="text-sm">Boleta: {user.boleta ?? "—"}</p>
      <div className="flex flex-wrap gap-2">
        {badges.rows.map((badge) => (
          <span key={badge.label} className="rounded-full bg-[#e6f3fa] px-3 py-1 text-xs">
            {badge.label}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <a className={btnGhost} href={exportUrl}>
          Descargar mis datos
        </a>
        <form action={deleteAccount}>
          <button className={btnGhost}>Eliminar cuenta</button>
        </form>
      </div>
    </section>
  );
}
