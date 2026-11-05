import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/auth";
import "./globals.css";


export const metadata: Metadata = {
  title: "ESCOM | Vida institucional",
  description: "Avisos, clubes, trámites, objetos perdidos y espacios de la ESCOM.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getSession();
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
