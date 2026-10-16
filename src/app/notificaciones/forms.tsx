"use client";

import { useActionState } from "react";
import { btn, label } from "@/lib/ui";
import { savePrefs } from "./actions";

type FormState = { error?: string; ok?: string };

export function PrefsForm({
  prefs,
}: {
  prefs: { email_clubs: boolean; email_forum: boolean; email_lost: boolean };
}) {
  const [state, action, pending] = useActionState(savePrefs, {});
  return (
    <form action={action} className="space-y-3">
      <p className={label}>Avisos que quieres recibir</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="email_clubs" defaultChecked={prefs.email_clubs} className="accent-[#6B1D2A]" />
        Clubes
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="email_forum" defaultChecked={prefs.email_forum} className="accent-[#6B1D2A]" />
        Foro
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="email_lost" defaultChecked={prefs.email_lost} className="accent-[#6B1D2A]" />
        Objetos perdidos
      </label>
      <p className="text-sm text-[#5C4A45]">
        Estas preferencias se guardan en este entorno local. No se envía ningún correo real.
      </p>
      {state.error && <p className="text-sm text-[#8C1D18]">{state.error}</p>}
      {state.ok && <p className="text-sm text-[#1C1416]">{state.ok}</p>}
      <button className={btn} disabled={pending}>
        Guardar preferencias
      </button>
    </form>
  );
}
