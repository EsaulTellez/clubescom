import Link from "next/link";
import { getSession } from "@/lib/auth";
import { btnGhost, card } from "@/lib/ui";
import { publishGuide } from "../actions";
import { AREAS, isStaff } from "../shared";
import { GuideForm } from "./guide-form";

export const dynamic = "force-dynamic";

export default async function NuevaGuiaPage() {
  const user = await getSession();
  const areas = user?.role === "admin" ? AREAS : AREAS.filter((area) => area.id === user?.area);
  const allowed = user ? isStaff(user.role) && areas.length > 0 : false;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/guias" className="text-sm text-[#006699] hover:underline">
        Volver a guías
      </Link>
      <section className={`${card} space-y-3`}>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva guía</h1>
        {allowed ? (
          <>
            <p className="text-sm text-[#667085]">
              Escribe los pasos en orden. Cada línea es un paso: el título, una barra vertical y el texto.
            </p>
            <GuideForm action={publishGuide} areas={areas} />
          </>
        ) : (
          <div className="space-y-3 text-sm text-[#667085]">
            <p>
              {user
                ? "Tu cuenta no tiene un área habilitada para publicar guías."
                : "Entra con una cuenta de moderación o administración para publicar una guía."}
            </p>
            {!user && (
              <Link href="/entrar" className={btnGhost}>
                Entrar
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
