"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/loading-ui";
import { submitPrivacyRequest, updateOwnProfile, type AuthState } from "@/lib/auth-actions";
import { btn, input, label } from "@/lib/ui";

function Status({ state }: { state: AuthState }) {
  if (state.error) return <p role="alert" className="text-sm text-[#8C1D18]">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-sm font-semibold text-[#17634a]">{state.ok}</p>;
  return null;
}

export function ProfileEditForm({ name, boleta }: { name: string; boleta: string | null }) {
  const [state, action, pending] = useActionState(updateOwnProfile, {});
  return (
    <form action={action} className="space-y-3">
      <label className={label}>
        Nombre completo
        <input className={input} name="name" defaultValue={name} minLength={3} maxLength={120} required />
      </label>
      <label className={label}>
        Boleta o número de empleado
        <input className={input} name="boleta" defaultValue={boleta ?? ""} maxLength={32} placeholder="Ej. 2023630001 o EMP-100" />
      </label>
      <Status state={state} />
      <SubmitButton className={btn} pending={pending} pendingText="Guardando…">
        Guardar perfil
      </SubmitButton>
    </form>
  );
}

export function PrivacyRequestForm() {
  const [state, action, pending] = useActionState(submitPrivacyRequest, {});
  return (
    <form action={action} className="space-y-3">
      <label className={label}>
        Tipo de solicitud
        <select className={input} name="kind" defaultValue="rectificacion" required>
          <option value="rectificacion">Rectificación de datos (Derechos ARCO)</option>
          <option value="oposicion">Oposición al tratamiento (Derechos ARCO)</option>
          <option value="cancelacion">Cancelación / observación antes de baja (Derechos ARCO)</option>
          <option value="incidente">Reportar incidente de privacidad o seguridad</option>
        </select>
      </label>
      <label className={label}>
        Descripción detallada
        <textarea
          className={`${input} min-h-24`}
          name="detail"
          minLength={10}
          maxLength={2000}
          required
          placeholder="Explica qué dato deseas rectificar, a qué tratamiento te opones o el incidente detectado."
        />
      </label>
      <Status state={state} />
      <SubmitButton className={btn} pending={pending} pendingText="Enviando…">
        Enviar solicitud ARCO / incidente
      </SubmitButton>
    </form>
  );
}
