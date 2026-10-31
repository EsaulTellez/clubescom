import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { btnGhost, card } from "@/lib/ui";
import { markAllRead, markRead } from "./actions";
import { PrefsForm } from "./forms";

export const dynamic = "force-dynamic";

type Notice = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  created_at: Date;
};

type Prefs = {
  email_clubs: boolean;
  email_forum: boolean;
  email_lost: boolean;
};

function formatWhen(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(value);
}

export default async function NotificacionesPage() {
  const user = await getSession();
  if (!user) redirect("/entrar");

  const [notices, prefs] = await Promise.all([
    pool.query<Notice>(
      `select id, title, body, href, read, created_at
       from notifications
       where user_id = $1
       order by created_at desc`,
      [user.id],
    ),
    pool.query<Prefs>(
      `select email_clubs, email_forum, email_lost
       from notification_prefs
       where user_id = $1`,
      [user.id],
    ),
  ]);

  const unread = notices.rows.filter((notice) => !notice.read).length;
  const preference = prefs.rows[0] ?? {
    email_clubs: true,
    email_forum: true,
    email_lost: true,
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageIntro
          kicker="Tu cuenta"
          title="Notificaciones"
          text={unread === 0 ? "No tienes avisos sin leer." : `${unread} sin leer.`}
        />
        {unread > 0 && (
          <form action={markAllRead}>
            <button className={btnGhost}>Marcar todas como leídas</button>
          </form>
        )}
      </div>

      {notices.rows.length === 0 ? (
        <p className={card}>Todavía no tienes notificaciones.</p>
      ) : (
        <ul className="space-y-3">
          {notices.rows.map((notice) => (
            <li
              key={notice.id}
              className={`${card} space-y-2 ${notice.read ? "" : "border-l-4 border-l-[#006699]"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-semibold">{notice.title}</h2>
                <time className="text-xs text-[#667085]" dateTime={notice.created_at.toISOString()}>
                  {formatWhen(notice.created_at)}
                </time>
              </div>
              <p className="text-sm text-[#667085]">{notice.body}</p>
              <div className="flex flex-wrap items-center gap-2">
                {notice.href && (
                  <Link href={`/notificaciones/${notice.id}`} className="text-sm font-semibold text-[#006699] hover:underline">
                    Ver
                  </Link>
                )}
                {notice.read ? (
                  <span className="text-sm text-[#667085]">Leída</span>
                ) : (
                  <form action={markRead}>
                    <input type="hidden" name="id" value={notice.id} />
                    <button className={btnGhost}>Marcar como leída</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className={`${card} max-w-xl space-y-3`}>
        <h2 className="font-semibold">Preferencias</h2>
        <PrefsForm prefs={preference} />
      </section>
    </div>
  );
}
