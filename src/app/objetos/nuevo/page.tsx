import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { card } from "@/lib/ui";
import { ReportForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NuevoObjetoPage() {
  const user = await getSession();
  if (!user) redirect("/entrar");

  return (
    <section className={`${card} mx-auto max-w-xl`}>
      <p className="text-sm text-[#667085]">
        <Link href="/objetos" className="underline">
          Objetos
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">Reportar objeto</h1>
      <p className="mt-2 mb-4 text-sm text-[#667085]">
        Publica lo que perdiste o encontraste. Si hay un reporte parecido del otro tipo, avisamos a las dos personas.
      </p>
      <ReportForm />
    </section>
  );
}
