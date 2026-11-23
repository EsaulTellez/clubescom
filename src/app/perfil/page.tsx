import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/loading-ui";
import { staffAreaLabel } from "@/lib/areas";
import { deleteAccount, switchOperatingProfile } from "@/lib/auth-actions";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btnGhost, card } from "@/lib/ui";
import { PrivacyRequestForm, ProfileEditForm } from "./forms";

export const dynamic = "force-dynamic";

type PrivacyReq = {
  id: string;
  kind: string;
  detail: string;
  status: string;
  resolution_note: string | null;
  created_at: Date;
};

export default async function PerfilPage() {
  const user = await getSession();
  if (!user) redirect("/entrar");
  const [badges, requests] = await Promise.all([
    pool.query<{ code: string; label: string; awarded_at: Date }>(
      "select code, label, awarded_at from badges where user_id = $1 order by awarded_at desc",
      [user.id],
    ),
    pool.query<PrivacyReq>(
      "select id, kind, detail, status, resolution_note, created_at from privacy_requests where user_id = $1 order by created_at desc limit 20",
      [user.id],
    ),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className={`${card} space-y-3`}>
        <h1 className="text-xl font-semibold">{user.name}</h1>
        <p className="text-sm text-[#667085]">{user.email}</p>
        <p className="text-sm">
          Rol: <strong className="capitalize">{user.isSuperadmin ? "Superadministrador" : user.role}</strong>
          {user.area ? ` · ${staffAreaLabel(user.area)}` : ""}
        </p>
        <p className="text-sm">Boleta / Empleado: {user.boleta ?? "—"}</p>

        {user.canSwitchProfile && (
          <form action={switchOperatingProfile} className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-semibold">Perfil de operación
              <select name="role" defaultValue={user.role} className="rounded border p-2">
                <option value="admin">Administración de módulos</option>
                <option value="alumno">Alumno</option>
                <option value="profesor">Profesor</option>
              </select>
            </label>
            <SubmitButton className={btnGhost} pendingText="Cambiando…">
              Cambiar perfil
            </SubmitButton>
          </form>
        )}
        <div className="space-y-2 pt-2">
          <h2 className="text-sm font-semibold">Insignias obtenidas ({badges.rows.length})</h2>
          {badges.rows.length ? (
            <div className="flex flex-wrap gap-2">
              {badges.rows.map((badge) => (
                <span key={badge.code} className="rounded-full bg-[#e6f3fa] px-3 py-1 text-xs font-semibold text-[#004d73]">
                  ★ {badge.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#667085]">Participa en el foro, guías, clubes u objetos perdidos para desbloquear insignias automáticas.</p>
          )}
        </div>
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="text-lg font-semibold">Editar mi perfil</h2>
        <ProfileEditForm name={user.name} boleta={user.boleta} />
      </section>

      <section className={`${card} space-y-4`}>
        <div>
          <h2 className="text-lg font-semibold">Derechos ARCO y Privacidad</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Ejercer tus derechos de Acceso, Rectificación, Cancelación y Oposición (ARCO), descargar una copia de tus datos o reportar un incidente de privacidad. Consulta el{" "}
            <Link href="/aviso-privacidad" className="text-[#006699] underline">
              aviso de privacidad integral
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a className={btnGhost} href="/api/me/export?format=json">
            Descargar mis datos (JSON)
          </a>
          <a className={btnGhost} href="/api/me/export?format=csv">
            Descargar mis datos (CSV)
          </a>
          <form action={deleteAccount}>
            <SubmitButton className={btnGhost} pendingText="Eliminando cuenta…">
              Eliminar mi cuenta (Cancelación directa)
            </SubmitButton>
          </form>
        </div>

        <div className="border-t border-[#dcd9ce] pt-4">
          <h3 className="mb-2 font-semibold">Solicitud ARCO o reporte de incidente</h3>
          <PrivacyRequestForm />
        </div>

        {requests.rows.length > 0 && (
          <div className="space-y-2 border-t border-[#dcd9ce] pt-4">
            <h3 className="text-sm font-semibold">Mis solicitudes registradas</h3>
            <ul className="space-y-2 text-sm">
              {requests.rows.map((req) => (
                <li key={req.id} className="rounded-lg border border-[#d5e4ee] bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="capitalize">{req.kind}</strong>
                    <span className="rounded-full bg-[#e6f3fa] px-2 py-0.5 text-xs text-[#006699]">{req.status}</span>
                  </div>
                  <p className="mt-1 text-[#52596a]">{req.detail}</p>
                  {req.resolution_note && (
                    <p className="mt-1 text-xs text-[#17634a]">Respuesta: {req.resolution_note}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
