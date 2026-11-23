"use client";

import { useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/loading-ui";
import { saveRoom } from "./actions";
import type { RoomInfo, Professor } from "@/components/campus-map";

export function RoomEditor({
  code,
  room,
  professors,
}: {
  code: string;
  room?: RoomInfo;
  professors: Professor[];
}) {
  const [state, action, pending] = useActionState(saveRoom, {});
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => room?.professors.map((p) => p.id) ?? [],
  );

  const visibleProfessors = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase("es-MX");
    if (!q) return professors;
    return professors.filter((p) =>
      `${p.name} ${p.boleta ?? ""} ${p.email ?? ""}`.toLocaleLowerCase("es-MX").includes(q),
    );
  }, [professors, filter]);

  function toggleProf(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  return (
    <details className="mt-4 border-t border-[#dce5e2] pt-4">
      <summary className="cursor-pointer text-sm font-bold text-[#006699]">
        Editar ficha base del espacio
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="code" value={code} />
        {selectedIds.map((id) => (
          <input key={id} type="hidden" name="professors" value={id} />
        ))}
        <label className="block text-sm font-bold">
          Tipo
          <select
            name="kind"
            defaultValue={room?.kind ?? "salon"}
            className="mt-1 min-h-11 w-full rounded-lg border border-[#bdcece] bg-white px-3 font-normal"
          >
            <option value="salon">Salón</option>
            <option value="laboratorio">Laboratorio</option>
            <option value="cubiculo">Cubículo</option>
            <option value="oficina">Oficina administrativa</option>
            <option value="servicio">Servicio / Atención</option>
            <option value="biblioteca">Biblioteca</option>
            <option value="auditorio">Auditorio</option>
            <option value="otro">Otro espacio</option>
          </select>
        </label>
        <label className="block text-sm font-bold">
          Nombre o función
          <input
            name="name"
            maxLength={120}
            defaultValue={room?.name ?? ""}
            placeholder="Ej. Laboratorio de redes"
            className="mt-1 min-h-11 w-full rounded-lg border border-[#bdcece] bg-white px-3 font-normal"
          />
        </label>
        <label className="block text-sm font-bold">
          Qué hay dentro / detalles
          <textarea
            name="description"
            maxLength={2000}
            rows={3}
            defaultValue={room?.description ?? ""}
            placeholder="Equipamiento, horarios, trámites o referencias del espacio"
            className="mt-1 w-full rounded-lg border border-[#bdcece] bg-white p-3 font-normal"
          />
        </label>
        <fieldset>
          <legend className="text-sm font-bold">
            Profesores confirmados ({selectedIds.length})
          </legend>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar profesor por nombre o no. empleado…"
            className="mt-1.5 min-h-9 w-full rounded-md border border-[#bdcece] bg-white px-3 text-xs font-normal"
          />
          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-[#dce5e2] bg-white p-2">
            {visibleProfessors.length ? (
              visibleProfessors.map((professor) => {
                const checked = selectedIds.includes(professor.id);
                return (
                  <label
                    key={professor.id}
                    className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-[#edf5f5]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProf(professor.id)}
                    />
                    <span className="truncate">{professor.name}</span>
                    {professor.boleta && (
                      <span className="ml-auto font-mono text-[11px] text-[#5c717c]">
                        {professor.boleta}
                      </span>
                    )}
                  </label>
                );
              })
            ) : (
              <p className="p-2 text-xs text-[#5f6e78]">No hay coincidencias.</p>
            )}
          </div>
        </fieldset>
        {state.error && (
          <p role="alert" className="text-sm text-[#9a3028]">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="text-sm text-[#006699]">
            {state.ok}
          </p>
        )}
        <SubmitButton
          pending={pending}
          pendingText="Guardando…"
          className="min-h-10 rounded-lg bg-[#006699] px-4 text-sm font-bold text-white"
        >
          Guardar ficha
        </SubmitButton>
      </form>
    </details>
  );
}
