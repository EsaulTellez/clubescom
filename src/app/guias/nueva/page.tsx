import Link from "next/link";
import { getSession } from "@/lib/auth";
import { btnGhost, card } from "@/lib/ui";
import { publishGuide } from "../actions";
import { editableGuideAreas, isStaff } from "../shared";
import { GuideForm } from "./guide-form";

export const dynamic = "force-dynamic";

export default async function NuevaGuiaPage() {
  const user = await getSession();
  const areas = editableGuideAreas(user);
  const allowed = user ? isStaff(user.role) && areas.length > 0 : false;

  return (
    <div className="mx-auto max-w-[1640px] space-y-4">
      <Link href="/foro" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#006699] hover:underline">
        ← Volver a Foro y Guías
      </Link>
      <section className={`${card} space-y-4`}>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#142c3c]">Nueva guía interactiva</h1>
        {allowed ? (
          <GuideForm action={publishGuide} areas={areas} />
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
