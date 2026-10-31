"use client";

import { useActionState } from "react";
import { btn, btnGhost, input, label } from "@/lib/ui";
import {
  approveProposal,
  claimAdvisor,
  createProposal,
  createClubPost,
  decideMembership,
  markInterest,
  requestMembership,
  simulateThreshold,
} from "./actions";
import type { ClubState } from "./format";

function FieldError({ state }: { state: ClubState }) {
  if (!state.error) return null;
  return <p className="text-sm text-[#8C1D18]">{state.error}</p>;
}

export function ProposalForm() {
  const [state, action, pending] = useActionState(createProposal, {});
  return (
    <form action={action} className="space-y-3">
      <label className={label}>
        Nombre del club
        <input className={input} name="name" required minLength={3} maxLength={120} />
      </label>
      <label className={label}>
        Tipo
        <select className={input} name="kind" required defaultValue="academico">
          <option value="academico">Académico</option>
          <option value="cultural">Cultural</option>
          <option value="deportivo">Deportivo</option>
        </select>
      </label>
      <label className={label}>
        Descripción
        <textarea className={`${input} min-h-28`} name="description" required minLength={10} maxLength={2000} />
      </label>
      <label className={label}>
        Enlace del plan (opcional)
        <input className={input} name="plan_url" type="url" placeholder="https://" />
      </label>
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Publicando…" : "Publicar propuesta"}
      </button>
    </form>
  );
}

export function ActionForm({
  action,
  fields,
  label: text,
  variant = "solid",
}: {
  action: (state: ClubState, form: FormData) => Promise<ClubState>;
  fields: Record<string, string>;
  label: string;
  variant?: "solid" | "ghost";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <FieldError state={state} />
      <button className={variant === "ghost" ? btnGhost : btn} disabled={pending}>
        {text}
      </button>
    </form>
  );
}

export function InterestButton({ proposalId }: { proposalId: string }) {
  return <ActionForm action={markInterest} fields={{ proposal_id: proposalId }} label="Me interesa" />;
}

export function SimulateButton({ proposalId }: { proposalId: string }) {
  return (
    <ActionForm action={simulateThreshold} fields={{ proposal_id: proposalId }} label="Simular 20 interesados" variant="ghost" />
  );
}

export function ApproveButton({ proposalId }: { proposalId: string }) {
  return <ActionForm action={approveProposal} fields={{ proposal_id: proposalId }} label="Registrar club" />;
}

export function JoinButton({ clubId }: { clubId: string }) {
  return <ActionForm action={requestMembership} fields={{ club_id: clubId }} label="Solicitar unirme" />;
}

export function DecisionButtons({ clubId, userId }: { clubId: string; userId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionForm
        action={decideMembership}
        fields={{ club_id: clubId, user_id: userId, status: "aceptada" }}
        label="Aceptar"
      />
      <ActionForm
        action={decideMembership}
        fields={{ club_id: clubId, user_id: userId, status: "rechazada" }}
        label="Rechazar"
        variant="ghost"
      />
    </div>
  );
}

export function AdvisorCodeForm({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState(claimAdvisor, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <label className={label}>
        Código de asesor
        <input
          className={`${input} font-mono uppercase tracking-widest`}
          name="advisor_code"
          required
          minLength={6}
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
        />
      </label>
      <FieldError state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Comprobando…" : "Asumir asesoría"}
      </button>
    </form>
  );
}


export function ClubPostForm({ clubId }: { clubId: string }) {
  const [state, action, pending] = useActionState(createClubPost, {});
  return (
    <form action={action} className="space-y-3 rounded-[24px] border border-[#dce9f1] bg-white p-4 shadow-[0_8px_28px_rgba(0,45,75,0.05)] sm:p-5">
      <input type="hidden" name="club_id" value={clubId} />
      <p className="text-sm font-bold text-[#19435b]">Comparte algo con el club</p>
      <input className={input} name="title" required minLength={4} maxLength={120} placeholder="Título de la publicación" />
      <textarea className={`${input} min-h-24 resize-y`} name="body" required minLength={10} maxLength={3000} placeholder="Una pregunta, idea o actualización…" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldError state={state} />
        <button className={btn} disabled={pending}>{pending ? "Publicando…" : "Publicar"}</button>
      </div>
    </form>
  );
}
