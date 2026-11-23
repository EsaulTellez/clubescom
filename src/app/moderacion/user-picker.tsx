"use client";

import { SearchableUserPicker, type DirectoryUserOption } from "@/components/searchable-user-picker";

export function StrikeUserPicker({
  people,
  defaultUserId = "",
  allowModerators = false,
}: {
  people: DirectoryUserOption[];
  defaultUserId?: string;
  allowModerators?: boolean;
}) {
  const defaultUser = defaultUserId ? people.find((p) => p.id === defaultUserId) ?? null : null;

  return (
    <SearchableUserPicker
      name="user_id"
      label="Cuenta involucrada (buscar por boleta, nombre o correo)"
      roles={allowModerators ? ["alumno", "profesor", "moderador"] : ["alumno", "profesor"]}
      initialUsers={people}
      defaultUser={defaultUser}
      defaultValue={defaultUserId}
      required
      placeholder="Escribe boleta, número de empleado, nombre o correo…"
    />
  );
}
