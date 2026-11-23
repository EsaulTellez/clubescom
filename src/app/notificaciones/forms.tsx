"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/loading-ui";
import { btn, label } from "@/lib/ui";
import { savePrefs } from "./actions";

export function PrefsForm({
  prefs,
}: {
  prefs: {
    email_clubs: boolean;
    email_forum: boolean;
    email_lost: boolean;
    inapp_guides?: boolean;
    inapp_notices?: boolean;
  };
}) {
  const [state, action, pending] = useActionState(savePrefs, {});
  return (
    <form action={action} className="space-y-3">
      <p className={label}>Notificaciones en la plataforma (in-app) que quieres recibir</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="email_clubs" defaultChecked={prefs.email_clubs} className="accent-[#006699]" />
        Clubes (propuestas, citas y membresías)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="email_forum" defaultChecked={prefs.email_forum} className="accent-[#006699]" />
        Foro de trámites (respuestas y actividad)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="email_lost" defaultChecked={prefs.email_lost} className="accent-[#006699]" />
        Objetos perdidos (coincidencias, reclamos y entregas)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="inapp_guides" defaultChecked={prefs.inapp_guides ?? true} className="accent-[#006699]" />
        Guías interactivas (sugerencias y dudas por paso)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="inapp_notices" defaultChecked={prefs.inapp_notices ?? true} className="accent-[#006699]" />
        Avisos institucionales
      </label>
      <p className="text-sm text-[#667085]">
        Al desactivar una categoría dejarás de recibir alertas dentro de la plataforma para ese módulo. Las alertas de sistema o moderación permanecen activas.
      </p>
      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      {state.ok && <p className="text-sm text-[#123044]">{state.ok}</p>}
      <SubmitButton className={btn} pending={pending} pendingText="Guardando…">
        Guardar preferencias
      </SubmitButton>
    </form>
  );
}
