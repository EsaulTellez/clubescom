import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ReportForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NuevoObjetoPage() {
  const user = await getSession();
  if (!user) redirect("/entrar");

  return (
    <section className="mx-auto max-w-2xl border border-[#cfcbbf] border-t-4 border-t-[#155772] bg-[#fffdf7]">
      <header className="border-b border-[#cfcbbf] bg-[#e8f0ef] px-5 py-5 sm:px-8">
        <Link href="/objetos" className="text-sm font-bold text-[#155772] hover:underline">← Perdidos y encontrados</Link>
        <h1 className="mt-3 font-[Georgia,serif] text-3xl font-bold tracking-tight">Reportar objeto</h1>
      </header>
      <div className="p-5 sm:p-8"><ReportForm /></div>
    </section>
  );
}
