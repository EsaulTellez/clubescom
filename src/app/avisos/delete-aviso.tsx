"use client";

import { btnGhost } from "@/lib/ui";
import { eliminarAviso } from "./actions";

export function DeleteAviso({ id }: { id: string }) {
  return (
    <form
      action={eliminarAviso}
      onSubmit={(event) => {
        if (!window.confirm("¿Eliminar este aviso? Esta acción no se puede deshacer.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className={btnGhost}>Eliminar</button>
    </form>
  );
}
