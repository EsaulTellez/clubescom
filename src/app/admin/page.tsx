import type { Role } from "@/lib/auth";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { card } from "@/lib/ui";
import { UserControls } from "./forms";

export const dynamic = "force-dynamic";

type Counts = {
  users: number;
  avisos: number;
  clubs: number;
  lost_items: number;
  questions: number;
};

type Person = {
  id: string;
  name: string;
  email: string;
  role: Role;
  area: string | null;
  banned: boolean;
};

type Log = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  detail: string | null;
  created_at: Date;
  actor_name: string | null;
};

const ROLE_LABEL: Record<Role, string> = {
  alumno: "Alumno",
  profesor: "Profesor",
  moderador: "Moderador",
  admin: "Administrador",
};

const ACTION_LABEL: Record<string, string> = {
  vetar: "Vetar",
  habilitar: "Quitar veto",
  cambiar_rol: "Cambiar rol",
  login: "Entrar",
  logout: "Salir",
  verificar: "Verificar correo",
  eliminar_cuenta: "Eliminar cuenta",
  crear: "Crear",
  editar: "Editar",
  eliminar: "Eliminar",
  confirmar_entrega: "Confirmar entrega",
};

function formatWhen(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(value);
}

export default async function AdminPage() {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "moderador")) {
    return (
      <section className={`${card} max-w-lg space-y-2`}>
        <h1 className="text-xl font-semibold">Panel</h1>
        <p className="text-sm text-[#5C4A45]">No tienes permiso para ver esta sección.</p>
      </section>
    );
  }

  const [counts, logs, people] = await Promise.all([
    pool.query<Counts>(
      `select
         (select count(*)::int from users) as users,
         (select count(*)::int from avisos) as avisos,
         (select count(*)::int from clubs) as clubs,
         (select count(*)::int from lost_items) as lost_items,
         (select count(*)::int from questions) as questions`,
    ),
    pool.query<Log>(
      `select l.id, l.action, l.entity, l.entity_id, l.detail, l.created_at, u.name as actor_name
       from audit_logs l
       left join users u on u.id = l.actor_id
       order by l.created_at desc
       limit 50`,
    ),
    user.role === "admin"
      ? pool.query<Person>(
          `select id, name, email, role, area, banned
           from users
           order by name`,
        )
      : Promise.resolve({ rows: [] as Person[] }),
  ]);

  const summary = counts.rows[0];
  const stats = [
    ["Usuarios", summary?.users ?? 0],
    ["Avisos", summary?.avisos ?? 0],
    ["Clubes", summary?.clubs ?? 0],
    ["Objetos perdidos", summary?.lost_items ?? 0],
    ["Preguntas", summary?.questions ?? 0],
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.16em] text-[#6B1D2A]">ESCOM</p>
        <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
        <p className="mt-1 text-sm text-[#5C4A45]">Resumen de la plataforma.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map(([label, value]) => (
          <article key={label} className={card}>
            <p className="text-sm text-[#5C4A45]">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-[#6B1D2A]">
              {value.toLocaleString("es-MX")}
            </p>
          </article>
        ))}
      </section>

      {user.role === "admin" && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Usuarios</h2>
          {people.rows.length === 0 ? (
            <p className={card}>No hay usuarios.</p>
          ) : (
            <div className={`${card} overflow-x-auto`}>
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E4D9CC] text-[#5C4A45]">
                    <th className="py-2 pr-3 font-medium">Persona</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {people.rows.map((person) => (
                    <tr key={person.id} className="border-b border-[#E4D9CC] align-top last:border-0">
                      <td className="py-3 pr-3">
                        <p className="font-medium">{person.name}</p>
                        <p className="text-[#5C4A45]">{person.email}</p>
                        <p className="text-[#5C4A45]">
                          {ROLE_LABEL[person.role]}
                          {person.area ? ` · ${person.area}` : ""}
                        </p>
                      </td>
                      <td className="py-3 pr-3">{person.banned ? "Vetado" : "Activo"}</td>
                      <td className="py-3">
                        <UserControls
                          userId={person.id}
                          role={person.role}
                          area={person.area}
                          banned={person.banned}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Auditoría</h2>
        <p className="text-sm text-[#5C4A45]">Últimos 50 movimientos.</p>
        {logs.rows.length === 0 ? (
          <p className={card}>Todavía no hay registros de auditoría.</p>
        ) : (
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#E4D9CC] text-[#5C4A45]">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Quién</th>
                  <th className="py-2 pr-3 font-medium">Acción</th>
                  <th className="py-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logs.rows.map((log) => (
                  <tr key={log.id} className="border-b border-[#E4D9CC] align-top last:border-0">
                    <td className="py-3 pr-3 whitespace-nowrap">{formatWhen(log.created_at)}</td>
                    <td className="py-3 pr-3">{log.actor_name ?? "Sistema"}</td>
                    <td className="py-3 pr-3">
                      {ACTION_LABEL[log.action] ?? log.action}
                      <span className="block text-[#5C4A45]">{log.entity}</span>
                    </td>
                    <td className="py-3">{log.detail ?? log.entity_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
