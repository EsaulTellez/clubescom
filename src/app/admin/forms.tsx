"use client";

import { useActionState } from "react";
import { STAFF_AREAS, STAFF_AREA_LABELS } from "@/lib/areas";
import type { Role } from "@/lib/auth";
import { btn, btnGhost, input, label } from "@/lib/ui";
import { setBanned, setRole } from "./actions";

type FormState = { error?: string; ok?: string };

const ROLES: { value: Role; label: string }[] = [
  { value: "alumno", label: "Alumno" },
  { value: "profesor", label: "Profesor" },
  { value: "moderador", label: "Moderador" },
  { value: "admin", label: "Administrador" },
];

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-[#8C1D18]">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-[#123044]">{state.ok}</p>;
  return null;
}

export function UserControls({
  canAssignRoles,
  canBan = true,
  userId,
  role,
  area,
  banned,
}: {
  canAssignRoles: boolean;
  canBan?: boolean;
  userId: string;
  role: Role;
  area: string | null;
  banned: boolean;
}) {
  const [banState, banAction, banPending] = useActionState(setBanned, {});
  const [roleState, roleAction, rolePending] = useActionState(setRole, {});

  return (
    <div className="space-y-3">
      {canBan && (
        <form action={banAction} className="space-y-2 border-b border-[#dcd9ce] pb-3">
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="banned" value={banned ? "false" : "true"} />
          <label className={label}>
            Motivo {banned ? "para retirar veto" : "de baneo"} (obligatorio)
            <input
              className={input}
              name="reason"
              required
              minLength={10}
              maxLength={500}
              placeholder="Mínimo 10 caracteres para auditoría"
            />
          </label>
          <button className={btnGhost} disabled={banPending}>
            {banned ? "Quitar veto" : "Vetar y cerrar sesión"}
          </button>
          <Feedback state={banState} />
        </form>
      )}
      {canAssignRoles && <form action={roleAction} className="space-y-2">
        <input type="hidden" name="user_id" value={userId} />
        <label className={label}>
          Rol
          <select className={input} name="role" defaultValue={role}>
            {ROLES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Área
          <select className={input} name="area" defaultValue={area ?? ""}>
            <option value="">Sin área (solo obligatorio para moderador)</option>
            {STAFF_AREAS.map((slug) => (
              <option key={slug} value={slug}>
                {STAFF_AREA_LABELS[slug]} ({slug})
              </option>
            ))}
          </select>
        </label>
        <Feedback state={roleState} />
        <button className={btn} disabled={rolePending}>
          Guardar rol
        </button>
      </form>}
    </div>
  );
}
