"use client";

import { useActionState } from "react";
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
  userId,
  role,
  area,
  banned,
}: {
  userId: string;
  role: Role;
  area: string | null;
  banned: boolean;
}) {
  const [banState, banAction, banPending] = useActionState(setBanned, {});
  const [roleState, roleAction, rolePending] = useActionState(setRole, {});

  return (
    <div className="space-y-3">
      <form action={banAction}>
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="banned" value={banned ? "false" : "true"} />
        <button className={btnGhost} disabled={banPending}>
          {banned ? "Quitar veto" : "Vetar"}
        </button>
        <Feedback state={banState} />
      </form>
      <form action={roleAction} className="space-y-2">
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
          <input
            className={input}
            name="area"
            defaultValue={area ?? ""}
            maxLength={80}
            placeholder="Obligatoria si el rol es moderador"
          />
        </label>
        <Feedback state={roleState} />
        <button className={btn} disabled={rolePending}>
          Guardar rol
        </button>
      </form>
    </div>
  );
}
