"use client";

import { useActionState, useState } from "react";
import { ImageUploadField } from "@/components/image-upload-field";
import { btn, input, label } from "@/lib/ui";
import { addSpaceEvent, saveCubicle } from "./actions";

type FormState = { error?: string; ok?: string };

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-[#8C1D18]">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-[#123044]">{state.ok}</p>;
  return null;
}

const VALID_ROOMS = [1, 2, 3, 4].flatMap((b) =>
  [0, 1, 2].flatMap((lvl) =>
    Array.from({ length: b < 3 ? 13 : 10 }, (_, i) => `${b}${lvl}${String(i + (b < 3 ? 1 : 4)).padStart(2, "0")}`),
  ),
);

export function CubicleForm({
  cubicle,
}: {
  cubicle: {
    label: string;
    building: string;
    floor: string | null;
    room_code?: string | null;
    x: number;
    y: number;
  } | null;
}) {
  const [state, action, pending] = useActionState(saveCubicle, {});
  return (
    <form action={action} className="space-y-3">
      <label className={label}>
        Espacio en el mapa 3D (opcional)
        <select className={input} name="room_code" defaultValue={cubicle?.room_code ?? ""}>
          <option value="">Sin vincular a un salón/cubículo del mapa</option>
          {VALID_ROOMS.map((code) => (
            <option key={code} value={code}>
              Espacio {code} (Edificio {code[0]} · {code[1] === "0" ? "Planta baja" : `Piso ${code[1]}`})
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Etiqueta
        <input className={input} name="label" required defaultValue={cubicle?.label ?? ""} maxLength={80} placeholder="Ej. Cubículo 12" />
      </label>
      <label className={label}>
        Edificio
        <input className={input} name="building" required defaultValue={cubicle?.building ?? ""} maxLength={80} placeholder="Ej. Edificio 2" />
      </label>
      <label className={label}>
        Piso
        <input className={input} name="floor" defaultValue={cubicle?.floor ?? ""} maxLength={20} placeholder="Ej. 1" />
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
  const [selectedSpaceId, setSelectedSpaceId] = useState(spaces.length === 1 ? spaces[0].id : "");
  const selectedSpace = spaces.find((s) => s.id === selectedSpaceId);
  const requiresSpeaker = Boolean(selectedSpace && /auditorio|sala\s*14/i.test(selectedSpace.name));

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="is_public_field" value="1" />
      <label className={label}>
        Espacio
        <select
          className={input}
          name="space_id"
          required
          value={selectedSpaceId}
          onChange={(e) => setSelectedSpaceId(e.target.value)}
        >
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
        {requiresSpeaker ? "Ponente (obligatorio)" : "Ponente (opcional)"}
        <input
          className={input}
          name="speaker"
          required={requiresSpeaker}
          maxLength={160}
          placeholder="Nombre de la persona ponente o expositora"
        />
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
      <label className="flex items-start gap-2.5 rounded-lg border border-[#d6d3c6] bg-[#faf8f0] px-3 py-2 text-sm text-[#2c4452]">
        <input type="checkbox" name="is_public" defaultChecked className="mt-1" />
        <span>
          <strong className="block font-bold">Abierto al público</strong>
          <span className="text-xs text-[#5d6f79]">Si se desmarca, no se mostrará en la cartelera ni en el feed público.</span>
        </span>
      </label>
      <ImageUploadField name="image" label="Cartel o imagen del evento (opcional · JPG, PNG o WEBP)" />
      <p className="text-sm text-[#667085]">Publica solo actividades que ya fueron autorizadas fuera de la plataforma. Este registro no reserva ni autoriza el espacio.</p>
      <Feedback state={state} />
      <button className={btn} disabled={pending}>
        Publicar evento autorizado
      </button>
    </form>
  );
}
