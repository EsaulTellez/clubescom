"use client";
import { useActionState } from "react";
import { saveRoom } from "./actions";
import type { RoomInfo, Professor } from "@/components/campus-map";

export function RoomEditor({ code, room, professors }: { code: string; room?: RoomInfo; professors: Professor[] }) {
  const [state, action, pending] = useActionState(saveRoom, {});
  return <details className="mt-4 border-t border-[#dce5e2] pt-4"><summary className="cursor-pointer text-sm font-bold text-[#006699]">Editar ficha base del espacio</summary>
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="code" value={code} />
      <label className="block text-sm font-bold">Tipo<select name="kind" defaultValue={room?.kind ?? "salon"} className="mt-1 min-h-11 w-full rounded-lg border border-[#bdcece] bg-white px-3 font-normal"><option value="salon">Salón</option><option value="laboratorio">Laboratorio</option><option value="cubiculo">Cubículo</option><option value="oficina">Oficina administrativa</option><option value="servicio">Servicio / Atención</option><option value="biblioteca">Biblioteca</option><option value="auditorio">Auditorio</option><option value="otro">Otro espacio</option></select></label>
      <label className="block text-sm font-bold">Nombre o función<input name="name" maxLength={120} defaultValue={room?.name ?? ""} placeholder="Ej. Laboratorio de redes" className="mt-1 min-h-11 w-full rounded-lg border border-[#bdcece] bg-white px-3 font-normal" /></label>
      <label className="block text-sm font-bold">Qué hay dentro / detalles<textarea name="description" maxLength={2000} rows={3} defaultValue={room?.description ?? ""} placeholder="Equipamiento, horarios, trámites o referencias del espacio" className="mt-1 w-full rounded-lg border border-[#bdcece] bg-white p-3 font-normal" /></label>
      <fieldset><legend className="text-sm font-bold">Profesores confirmados en este espacio</legend><div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-[#dce5e2] bg-white p-2">{professors.length ? professors.map((professor) => <label key={professor.id} className="flex items-center gap-2 rounded p-2 text-sm hover:bg-[#edf5f5]"><input type="checkbox" name="professors" value={professor.id} defaultChecked={room?.professors.some((item) => item.id === professor.id)} />{professor.name}</label>) : <p className="p-2 text-sm text-[#5f6e78]">No hay profesores disponibles.</p>}</div></fieldset>
      {state.error && <p role="alert" className="text-sm text-[#9a3028]">{state.error}</p>}{state.ok && <p role="status" className="text-sm text-[#006699]">{state.ok}</p>}
      <button disabled={pending} className="min-h-10 rounded-lg bg-[#006699] px-4 text-sm font-bold text-white disabled:opacity-50">Guardar ficha</button>
    </form>
  </details>;
}
