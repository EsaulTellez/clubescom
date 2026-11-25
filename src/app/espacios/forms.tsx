"use client";

import { buildingRoomGroups } from "@/lib/campus-rooms";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/loading-ui";
import { ImageUploadField } from "@/components/image-upload-field";
import { btn, input, label } from "@/lib/ui";
import { addSpaceEvent, saveCubicle } from "./actions";

type FormState = { error?: string; ok?: string };

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-[#8C1D18]">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-[#123044]">{state.ok}</p>;
  return null;
}

const GOBIERNO_ROOM_OPTIONS = [
  { code: "G000", label: "G000 · Edificio de Gobierno · Planta baja (Escaleras / BBVA)" },
  { code: "G001", label: "G001 · Edificio de Gobierno · Planta baja (Biblioteca)" },
  { code: "G002", label: "G002 · Edificio de Gobierno · Planta baja (Gestión Escolar)" },
  { code: "G003", label: "G003 · Edificio de Gobierno · Planta baja (Pasillo Auditorio)" },
  { code: "G004", label: "G004 · Edificio de Gobierno · Planta baja (Mesas y sillas)" },
  { code: "G005", label: "G005 · Edificio de Gobierno · Planta baja (Enfermería / Dentista / Psicólogo)" },
  { code: "G006", label: "G006 · Edificio de Gobierno · Planta baja (Auditorio)" },
  { code: "G101", label: "G101 · Edificio de Gobierno · Piso 1 (Subdirección Académica / Sala 14)" },
  { code: "G102", label: "G102 · Edificio de Gobierno · Piso 1 (Dirección y Consejo)" },
  { code: "G103", label: "G103 · Edificio de Gobierno · Piso 1 (Becas / SSEIS / CATT)" },
  { code: "G104", label: "G104 · Edificio de Gobierno · Piso 1 (Subdirección Administrativa)" },
];

export function CubicleForm({
  cubicle,
  onSuccess,
}: {
  cubicle: {
    label: string;
    building: string;
    floor: string | null;
    room_code?: string | null;
    x: number;
    y: number;
  } | null;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState(cubicle?.room_code ?? "");
  const [labelText, setLabelText] = useState(cubicle?.label ?? "");
  const [building, setBuilding] = useState(cubicle?.building ?? "");
  const [floor, setFloor] = useState(cubicle?.floor ?? "");

  const [state, action, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const res = await saveCubicle(prev, formData);
      if (res.ok) {
        router.refresh();
        onSuccess?.();
      }
      return res;
    },
    {},
  );

  function handleRoomChange(nextCode: string) {
    setRoomCode(nextCode);
    if (!nextCode) return;
    setBuilding(nextCode.startsWith("G") ? "Edificio de Gobierno" : `Edificio ${nextCode[0]}`);
    setFloor(nextCode[1] === "0" ? "Planta baja" : `Piso ${nextCode[1]}`);
    if (!labelText.trim() || /^Cubículo\s+[G1-4]\d{3}$/i.test(labelText.trim())) {
      setLabelText(`Cubículo ${nextCode}`);
    }
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="x" value={String(cubicle?.x ?? 50)} />
      <input type="hidden" name="y" value={String(cubicle?.y ?? 50)} />
      <label className={label}>
        Cubículo o salón en el mapa 3D
        <select
          className={input}
          name="room_code"
          required
          value={roomCode}
          onChange={(e) => handleRoomChange(e.target.value)}
        >
          <option value="" disabled>
            Selecciona tu cubículo o salón…
          </option>
          <optgroup label="Edificio de Gobierno">
            {GOBIERNO_ROOM_OPTIONS.map((room) => (
              <option key={room.code} value={room.code}>
                {room.label}
              </option>
            ))}
          </optgroup>
          {buildingRoomGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.rooms.map((room) => (
                <option key={room.code} value={room.code}>
                  {room.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className={label}>
        Etiqueta o referencia
        <input
          className={input}
          name="label"
          required
          value={labelText}
          onChange={(e) => setLabelText(e.target.value)}
          maxLength={80}
          placeholder="Ej. Cubículo 2105 · Academia de Redes"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Edificio
          <input
            className={input}
            name="building"
            required
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
            maxLength={80}
            placeholder="Ej. Edificio 2"
          />
        </label>
        <label className={label}>
          Piso
          <input
            className={input}
            name="floor"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            maxLength={20}
            placeholder="Ej. Piso 1"
          />
        </label>
      </div>
      <Feedback state={state} />
      <SubmitButton className={btn} pending={pending} pendingText="Guardando…">
        {cubicle?.room_code ? "Actualizar mi cubículo" : "Confirmar mi cubículo"}
      </SubmitButton>
    </form>
  );
}

export function SpaceEventForm({
  spaces,
  isDirectPublisher = true,
  onSuccess,
}: {
  spaces: { id: string; name: string }[];
  isDirectPublisher?: boolean;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const res = await addSpaceEvent(prev, formData);
      if (res.ok) {
        router.refresh();
        onSuccess?.();
      }
      return res;
    },
    {},
  );
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
      <SubmitButton className={btn} pending={pending} pendingText="Guardando…">
        {isDirectPublisher ? "Publicar evento autorizado" : "Enviar evento a revisión"}
      </SubmitButton>
    </form>
  );
}
