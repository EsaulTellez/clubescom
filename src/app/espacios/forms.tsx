"use client";

import { useActionState } from "react";
import { btn, input, label } from "@/lib/ui";
import { addSpaceEvent, saveCubicle } from "./actions";

type FormState = { error?: string; ok?: string };

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-[#8C1D18]">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-[#123044]">{state.ok}</p>;
  return null;
}

export function CubicleForm({
  cubicle,
}: {
  cubicle: {
    label: string;
    building: string;
    floor: string | null;
    x: number;
    y: number;
  } | null;
}) {
  const [state, action, pending] = useActionState(saveCubicle, {});
  return (
    <form action={action} className="space-y-3">
      <label className={label}>
        Etiqueta
        <input className={input} name="label" required defaultValue={cubicle?.label ?? ""} maxLength={80} />
      </label>
      <label className={label}>
        Edificio
        <input className={input} name="building" required defaultValue={cubicle?.building ?? ""} maxLength={80} />
      </label>
      <label className={label}>
        Piso
        <input className={input} name="floor" defaultValue={cubicle?.floor ?? ""} maxLength={20} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          X (0 a 100)
          <input className={input} name="x" type="number" min={0} max={100} step="0.1" required defaultValue={cubicle?.x ?? 20} />
        </label>
        <label className={label}>
          Y (0 a 100)
          <input className={input} name="y" type="number" min={0} max={100} step="0.1" required defaultValue={cubicle?.y ?? 20} />
        </label>
      </div>
      <Feedback state={state} />
      <button className={btn} disabled={pending}>
        {cubicle ? "Actualizar mi cubículo" : "Crear mi cubículo"}
      </button>
    </form>
  );
}

export function SpaceEventForm({
  spaces,
}: {
  spaces: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(addSpaceEvent, {});
  return (
    <form action={action} className="space-y-3">
      <label className={label}>
        Espacio
        <select className={input} name="space_id" required defaultValue="">
          <option value="" disabled>
            Elige un espacio
          </option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Título
        <input className={input} name="title" required maxLength={160} placeholder="Actividad autorizada por ESCOM" />
      </label>
      <label className={label}>
        Descripción
        <textarea className={input} name="description" rows={3} maxLength={2000} placeholder="Detalles que la comunidad necesita conocer" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Inicio
          <input className={input} name="starts_at" type="datetime-local" required />
        </label>
        <label className={label}>
          Fin
          <input className={input} name="ends_at" type="datetime-local" />
        </label>
      </div>
      <p className="text-sm text-[#667085]">Publica solo actividades que ya fueron autorizadas fuera de la plataforma. Este registro no reserva ni autoriza el espacio.</p>
      <Feedback state={state} />
      <button className={btn} disabled={pending}>
        Publicar evento autorizado
      </button>
    </form>
  );
}
