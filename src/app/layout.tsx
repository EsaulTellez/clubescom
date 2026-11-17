import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import "./globals.css";


export const metadata: Metadata = {
  title: "ESCOM | Vida institucional",
  description: "Avisos, clubes, trámites, objetos perdidos y espacios de la ESCOM.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getSession();
  let unreadCount = 0;
  if (user) {
    try {
      const res = await pool.query<{ count: string }>(
        "select count(*)::text as count from notifications where user_id = $1 and read = false",
        [user.id],
      );
      unreadCount = Number(res.rows[0]?.count ?? 0);
    } catch {
      unreadCount = 0;
    }
  }
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">
        <AppShell user={user} initialUnread={unreadCount}>{children}</AppShell>
      </body>
    </html>
  );
}
