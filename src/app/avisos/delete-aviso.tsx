"use client";

import { useActionState } from "react";
import { btnGhost } from "@/lib/ui";
import { eliminarAviso, eliminarAvisoInline } from "./actions";

export function DeleteAviso({
  id,
  onDeleted,
}: {
  id: string;
  onDeleted?: () => void;
}) {
  const [state, inlineAction, pending] = useActionState(
    async (prev: { error?: string; ok?: boolean; id?: string }, formData: FormData) => {
      const res = await eliminarAvisoInline(prev, formData);
      if (res.ok && onDeleted) {
        onDeleted();
      }
      return res;
    },
    {},
  );

  if (onDeleted) {
    return (
      <form
        action={inlineAction}
        onSubmit={(event) => {
          if (!window.confirm("¿Eliminar este comunicado? Esta acción no se puede deshacer.")) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button className={btnGhost} disabled={pending}>
          {pending ? "Eliminando…" : "Eliminar"}
        </button>
        {state.error && (
          <p className="mt-1 text-xs text-[#8C1D18]" role="alert">
            {state.error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form
      action={eliminarAviso}
      onSubmit={(event) => {
        if (!window.confirm("¿Eliminar este comunicado? Esta acción no se puede deshacer.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className={btnGhost}>Eliminar</button>
    </form>
  );
}
