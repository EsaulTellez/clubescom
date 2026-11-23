"use client";

import { CatalogSearch } from "@/components/catalog-search";
import { FormDialog } from "@/components/form-dialog";
import type { DirectoryUserOption } from "@/components/searchable-user-picker";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMxDateTime } from "@/lib/datetime";
import { btn, btnGhost, card } from "@/lib/ui";
import {
  ClaimInactiveProposalButton,
  DirectClubForm,
  ProposalForm,
  RevokeSseisDelegateButton,
  SseisDelegateForm,
} from "./forms";
import { interestLabel, kindLabel, statusLabel, type ClubKind } from "./format";
import { normalizeClubText, type CatalogEntry } from "./similarity";

export type ClubDirectoryItem = {
  id: string;
  name: string;
  kind: string;
  description: string;
  schedule: string | null;
  logo_url: string | null;
  art_url: string | null;
  active: boolean;
};

export type ProposalDirectoryItem = {
  id: string;
  name: string;
  kind: string;
  description: string;
  objectives: string;
  status: string;
  proposer_id: string;
  proposer_name: string;
  interests: number;
  threshold: number;
  participants_count: number;
  participants_complete_docs: number;
  advisor_confirmed: boolean;
  advisor_name: string | null;
  has_executive_details: boolean;
  formal_submitted_at: string | null;
  last_proposer_activity_at: string;
  inactivity_days: number;
  inactive_for_claim: boolean;
  viewer_interested: boolean;
  viewer_is_advisor?: boolean;
  appointment_status?: string | null;
  scheduled_at?: string | null;
  meeting_mode?: string | null;
  meeting_location?: string | null;
  advisor_confirmed_appointment?: boolean;
  schedule_plan: string | null;
};

export type ClubKpiRow = {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  members_count: number;
  pending_requests: number;
  posts_count: number;
  approved_events: number;
  pending_events: number;
  attendees_count: number;
};

export type PendingMembershipRow = {
  club_id: string;
  user_id: string;
  club_name: string;
  user_name: string;
  user_role: string;
};

export type SseisDelegateRow = {
  user_id: string;
  name: string;
  role: string;
  boleta: string | null;
  email: string | null;
  note: string | null;
};

type MainTab = "clubes" | "propuestas" | "panel";
type ProposalStageFilter = "todas" | "votacion" | "documentos" | "listo_envio" | "revision";

function getProposalStage(p: ProposalDirectoryItem): {
  key: Exclude<ProposalStageFilter, "todas">;
  badge: string;
  tone: string;
} {
  if (p.formal_submitted_at || ["cita_pendiente", "cita_confirmada", "incompleta"].includes(p.status)) {
    return {
      key: "revision",
      badge: statusLabel(p.status),
      tone: "border-[#b7d6e6] bg-[#e9f4fa] text-[#004d73]",
    };
  }
  if (p.interests < p.threshold && p.status === "abierta") {
    return {
      key: "votacion",
      badge: `En votación · ${p.interests}/${p.threshold}`,
      tone: "border-[#d8d5c7] bg-[#f7f4e9] text-[#5e4d18]",
    };
  }
  const allDocsComplete =
    p.participants_count > 0 && p.participants_complete_docs >= p.participants_count;
  if (allDocsComplete) {
    return {
      key: "listo_envio",
      badge: "Documentos completos · Falta enviar registro",
      tone: "border-[#b9decb] bg-[#ebf7f1] text-[#14593e]",
    };
  }
  return {
    key: "documentos",
    badge: `Meta alcanzada · Llenando documentos (${p.participants_complete_docs}/${p.participants_count})`,
    tone: "border-[#e6d09c] bg-[#fff7e2] text-[#785109]",
  };
}

export function ClubesExplorer({
  clubs,
  proposals,
  formalRequests,
  clubKpis,
  pendingMemberships,
  proposalStageCounts,
  sala14EventsCount,
  people,
  sseisDelegates = [],
  allowedKinds,
  isAreaStaff,
  isSubdireccion,
  isCulturales,
  isSseisTitular = false,
  isSseisDelegated = false,
  canCreateDirect,
  viewer,
  dbDown,
}: {
  clubs: ClubDirectoryItem[];
  proposals: ProposalDirectoryItem[];
  formalRequests: ProposalDirectoryItem[];
  clubKpis: ClubKpiRow[];
  pendingMemberships: PendingMembershipRow[];
  proposalStageCounts: { en_documentacion: number; en_validacion: number; cita_pendiente: number; registrado: number };
  sala14EventsCount: number;
  people: DirectoryUserOption[];
  sseisDelegates?: SseisDelegateRow[];
  allowedKinds: ClubKind[];
  isAreaStaff: boolean;
  isSubdireccion: boolean;
  isCulturales: boolean;
  isSseisTitular?: boolean;
  isSseisDelegated?: boolean;
  canCreateDirect: boolean;
  viewer: { id: string; name: string; role: string } | null;
  dbDown: boolean;
}) {
  const [activeTab, setActiveTab] = useState<MainTab>(isAreaStaff ? "panel" : "clubes");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("todos");
  const [stageFilter, setStageFilter] = useState<ProposalStageFilter>("todas");
  const [formalFilter, setFormalFilter] = useState<"activas" | "cita_pendiente" | "cita_confirmada" | "incompleta" | "historial">("activas");
  const [newClubModalOpen, setNewClubModalOpen] = useState(false);
  const [directClubModalOpen, setDirectClubModalOpen] = useState(false);
  const [delegateModalOpen, setDelegateModalOpen] = useState(false);

  const canPropose = viewer?.role === "alumno";
  const pendingFormalCount = formalRequests.filter(
    (r) => !["registrado", "rechazada"].includes(r.status),
  ).length;
  const advisorProposals = useMemo(
    () => proposals.filter((p) => p.viewer_is_advisor),
    [proposals],
  );
  const visibleKindChips = useMemo(() => {
    const base = isAreaStaff && allowedKinds.length > 0 ? allowedKinds : (["academico", "cultural", "deportivo"] as ClubKind[]);
    if (base.length <= 1) return [];
    return [
      { id: "todos", label: "Todos" },
      ...base.map((k) => ({ id: k, label: kindLabel(k) })),
    ];
  }, [isAreaStaff, allowedKinds]);

  const filteredFormalRequests = useMemo(() => {
    return formalRequests.filter((r) => {
      if (formalFilter === "activas") return !["registrado", "rechazada"].includes(r.status);
      if (formalFilter === "historial") return ["registrado", "rechazada"].includes(r.status);
      return r.status === formalFilter;
    });
  }, [formalRequests, formalFilter]);

  const catalog: CatalogEntry[] = useMemo(
    () => [
      ...clubs
        .filter((c) => c.active)
        .map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          text: c.description,
          type: "club" as const,
          statusLabel: `Club activo · ${kindLabel(c.kind)}`,
        })),
      ...proposals.map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        text: `${p.objectives} ${p.description}`,
        type: "propuesta" as const,
        statusLabel: statusLabel(p.status),
        interests: p.interests,
      })),
    ],
    [clubs, proposals],
  );

  const normalizedQuery = normalizeClubText(query);

  const filteredClubs = useMemo(() => {
    return clubs.filter((c) => {
      if (kindFilter !== "todos" && c.kind !== kindFilter) return false;
      if (!normalizedQuery) return true;
      const haystack = normalizeClubText(`${c.name} ${c.kind} ${c.description} ${c.schedule ?? ""}`);
      return haystack.includes(normalizedQuery);
    });
  }, [clubs, kindFilter, normalizedQuery]);

  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      if (kindFilter !== "todos" && p.kind !== kindFilter) return false;
      const stage = getProposalStage(p);
      if (stageFilter !== "todas" && stage.key !== stageFilter) return false;
      if (!normalizedQuery) return true;
      const haystack = normalizeClubText(`${p.name} ${p.kind} ${p.objectives} ${p.description} ${p.proposer_name}`);
      return haystack.includes(normalizedQuery);
    });
  }, [proposals, kindFilter, stageFilter, normalizedQuery]);

  const kpiTitle = isSubdireccion
    ? "KPIs de Clubes Académicos"
    : isCulturales
      ? "KPIs de Clubes Culturales y Deportivos"
      : "KPIs de Clubes ESCOM";
  const totalActiveClubs = clubKpis.filter((c) => c.active).length;
  const totalMembers = clubKpis.reduce((acc, c) => acc + c.members_count, 0);
  const totalPendingRequests = clubKpis.reduce((acc, c) => acc + c.pending_requests, 0);
  const totalApprovedEvents = clubKpis.reduce((acc, c) => acc + c.approved_events, 0);
  const totalAttendees = clubKpis.reduce((acc, c) => acc + c.attendees_count, 0);
  const totalPosts = clubKpis.reduce((acc, c) => acc + c.posts_count, 0);

  return (
    <div className="space-y-5">
      {/* Barra superior: búsqueda, pestañas y botón de Nuevo Club */}
      <header className="overflow-hidden rounded-sm border border-[#bcc9c1] bg-[#fffdf7]">
        <h1 className="edition-title bg-[#21483f] px-5 py-5 text-[#fffbee] sm:px-7">Directorio de clubes</h1>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Vistas de clubes">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "clubes"}
              onClick={() => setActiveTab("clubes")}
              className="catalog-tab"
            >
              Clubes activos ({filteredClubs.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "propuestas"}
              onClick={() => setActiveTab("propuestas")}
              className="catalog-tab"
            >
              Propuestas ({filteredProposals.length})
            </button>
            {isAreaStaff && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "panel"}
                onClick={() => setActiveTab("panel")}
                className="catalog-tab"
              >
                Panel del área ({pendingFormalCount})
              </button>
            )}
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
            <div className="min-w-[min(100%,15rem)] flex-1 sm:max-w-sm">
              <CatalogSearch value={query} onChange={setQuery} label="Buscar clubes o propuestas" shortcutEnabled={!newClubModalOpen && !directClubModalOpen} />
            </div>

            {canPropose ? (
              <button
                type="button"
                onClick={() => setNewClubModalOpen(true)}
                className={btn}
              >
                + Nuevo club
              </button>
            ) : canCreateDirect ? (
              <button
                type="button"
                onClick={() => setDirectClubModalOpen(true)}
                className={btn}
              >
                + Registrar club
              </button>
            ) : !viewer ? (
              <Link href="/entrar" className={btn}>
                + Nuevo club
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {/* Filtros secundarios por tipo y etapa */}
      {activeTab !== "panel" && (visibleKindChips.length > 0 || activeTab === "propuestas") && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {visibleKindChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {visibleKindChips.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={kindFilter === item.id}
                  onClick={() => setKindFilter(item.id)}
                  className={`min-h-9 rounded-sm px-3 py-1 text-xs font-bold transition ${
                    kindFilter === item.id
                      ? "bg-[#1b4053] text-white"
                      : "border border-[#d2dbdf] bg-white text-[#415b69] hover:bg-[#f2f7f9]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {activeTab === "propuestas" && (
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "todas", label: "Todas" },
                { id: "votacion", label: "En votación" },
                { id: "documentos", label: "Llenando documentos" },
                { id: "listo_envio", label: "Falta enviar registro" },
                { id: "revision", label: "En revisión / cita" },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  aria-pressed={stageFilter === st.id}
                  onClick={() => setStageFilter(st.id as ProposalStageFilter)}
                  className={`min-h-9 rounded-sm px-3 py-1 text-xs font-bold transition ${
                    stageFilter === st.id
                      ? "bg-[#006699] text-white"
                      : "border border-[#cddbe2] bg-[#f7fafc] text-[#355667] hover:bg-[#e9f2f7]"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pestaña 1: Clubes activos */}
      {activeTab === "clubes" && (
        <section aria-label="Clubes activos">
          {filteredClubs.length === 0 && !dbDown ? (
            <div className={`${card} text-center text-sm text-[#5f6e78]`}>
              <p>
                {query
                  ? `No encontramos clubes que coincidan con «${query}».`
                  : "Todavía no hay clubes activos en esta categoría."}
              </p>
              {canPropose && (
                <button
                  type="button"
                  onClick={() => setNewClubModalOpen(true)}
                  className={`${btnGhost} mt-3`}
                >
                  Proponer nuevo club
                </button>
              )}
            </div>
          ) : (
            <div className="board-club-grid">
              {filteredClubs.map((club) => (
                <Link key={club.id} href={`/clubes/${club.id}`} className="board-club-card" data-kind={club.kind}>
                  <div className="board-club-card__top">
                    <span>{kindLabel(club.kind)}</span>
                    {!club.active && <span>Inactivo</span>}
                  </div>
                  <div className="board-club-card__identity">
                    {club.art_url ? (
                      <img src={club.art_url} alt={`Logo de ${club.name}`} className="board-club-card__logo" />
                    ) : (
                      <span
                        className="board-club-card__logo grid place-items-center text-xl font-extrabold text-[#24546a]"
                        aria-hidden="true"
                      >
                        {club.name.replace("Club de ", "").slice(0, 1)}
                      </span>
                    )}
                    <h2>{club.name}</h2>
                  </div>
                  <p className="board-club-card__description line-clamp-3">{club.description}</p>
                  <div className="board-club-card__footer">
                    <span className="min-w-0 truncate">{club.schedule?.trim() || "Horario por anunciar"}</span>
                    <span className="shrink-0 font-extrabold text-[#004d73]">Ver club →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Pestaña 2: Propuestas de la comunidad */}
      {activeTab === "propuestas" && (
        <section aria-label="Propuestas de clubes" className="space-y-4">
          {viewer?.role === "profesor" && advisorProposals.length > 0 && (
            <div className="rounded-xl border border-[#bcd8e7] bg-[#eef7fb] p-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-[#005580]">
                Propuestas con tu participación como profesor coordinador ({advisorProposals.length})
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {advisorProposals.map((p) => (
                  <Link
                    key={p.id}
                    href={`/clubes/propuestas/${p.id}`}
                    className="rounded-lg border border-[#b4d2e2] bg-white px-3 py-2 text-xs font-bold text-[#14374a] hover:bg-[#f6fafc]"
                  >
                    {p.name} · <span className="text-[#006699]">{statusLabel(p.status)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {filteredProposals.length === 0 && !dbDown ? (
            <div className={`${card} text-center text-sm text-[#5f6e78]`}>
              <p>
                {query
                  ? `No hay propuestas que coincidan con «${query}».`
                  : "No hay propuestas en esta etapa todavía."}
              </p>
            </div>
          ) : (
            <div className="board-proposal-grid">
              {filteredProposals.map((proposal) => {
                const stage = getProposalStage(proposal);
                const voteProgress = Math.min(100, Math.round((proposal.interests / proposal.threshold) * 100));
                const docProgress =
                  proposal.participants_count > 0
                    ? Math.min(100, Math.round((proposal.participants_complete_docs / proposal.participants_count) * 100))
                    : 0;
                const showDocBar = stage.key === "documentos" || stage.key === "listo_envio";
                const canTakeOver =
                  Boolean(
                    viewer &&
                      viewer.role === "alumno" &&
                      viewer.id !== proposal.proposer_id &&
                      proposal.viewer_interested &&
                      proposal.inactive_for_claim,
                  );

                return (
                  <article key={proposal.id} className="board-proposal-card flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="board-label">{kindLabel(proposal.kind)}</span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${stage.tone}`}>
                          {stage.badge}
                        </span>
                      </div>

                      <Link href={`/clubes/propuestas/${proposal.id}`} className="mt-3 block group">
                        <h3 className="text-lg font-extrabold tracking-tight text-[#1b4053] group-hover:text-[#006699] group-hover:underline">
                          {proposal.name}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#586b75]">
                          {proposal.objectives || proposal.description}
                        </p>
                      </Link>

                      <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-[#45616e]">
                        <span>
                          {showDocBar
                            ? `Expedientes: ${proposal.participants_complete_docs} / ${proposal.participants_count} alumnos`
                            : `${interestLabel(proposal.interests)} · Meta ${proposal.threshold}`}
                        </span>
                        <span>{showDocBar ? `${docProgress}%` : `${voteProgress}%`}</span>
                      </div>
                      <div
                        className="board-progress mt-2"
                        role="progressbar"
                        aria-label={`Avance de ${proposal.name}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={showDocBar ? docProgress : voteProgress}
                      >
                        <span style={{ width: `${showDocBar ? docProgress : voteProgress}%` }} />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#61747e]">
                        <span>Responsable: {proposal.proposer_name}</span>
                        <span>·</span>
                        <span>
                          Coordinador:{" "}
                          <strong className={proposal.advisor_confirmed ? "text-[#14593e]" : "text-[#7a5a18]"}>
                            {proposal.advisor_confirmed ? (proposal.advisor_name ?? "Confirmado") : "Pendiente"}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eae7dc] pt-3">
                      {canTakeOver ? (
                        <ClaimInactiveProposalButton
                          proposalId={proposal.id}
                          proposalName={proposal.name}
                          compact
                        />
                      ) : (
                        <span className="text-[11px] font-semibold text-[#6b7b84]">
                          {stage.key === "votacion"
                            ? "Abierta a votos"
                            : stage.key === "documentos"
                              ? "Cada votante sube sus 4 documentos"
                              : stage.key === "listo_envio"
                                ? "Pendiente de envío del responsable"
                                : "En revisión institucional"}
                        </span>
                      )}
                      <Link
                        href={`/clubes/propuestas/${proposal.id}`}
                        className="shrink-0 text-xs font-extrabold text-[#004d73] hover:underline"
                      >
                        Ver propuesta →
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Pestaña 3 (solo staff de área): Solicitudes formales prioritarias, SSEIS y KPIs */}
      {isAreaStaff && activeTab === "panel" && !dbDown && (
        <div className="space-y-5">
          {isSseisTitular && (
            <section className="space-y-4 rounded-md border border-[#bcd6d0] border-t-4 border-t-[#165b47] bg-[#fffdf7] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e4ece9] pb-3">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#145542]">
                    SSEIS · Servicios Educativos e Integración Social
                  </p>
                  <h2 className="mt-0.5 text-lg font-extrabold text-[#142c3c]">
                    Responsable designada(o) de Clubes Culturales y Deportivos
                  </h2>
                </div>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setDelegateModalOpen(true)}
                  className={btn}
                >
                  + Designar responsable
                </button>
              </div>
              {sseisDelegates.length === 0 ? (
                <p className="text-sm text-[#546975]">
                  Aún no hay una profesora o responsable delegada. Puedes designar a quien llevará el seguimiento de apertura y operación de clubes culturales y deportivos.
                </p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {sseisDelegates.map((del) => (
                    <li
                      key={del.user_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#d6e4df] bg-[#f7fbf9] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <strong className="text-sm text-[#142c3c]">{del.name}</strong>
                          {del.boleta && (
                            <span className="rounded bg-[#dcebe6] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#145542]">
                              {del.boleta}
                            </span>
                          )}
                        </div>
                        {del.email && <p className="text-xs text-[#546975]">{del.email}</p>}
                        {del.note && <p className="mt-1 text-xs text-[#3b5760]">{del.note}</p>}
                      </div>
                      <RevokeSseisDelegateButton userId={del.user_id} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="space-y-4 rounded-[12px] border border-[#cde0ea] bg-[#fffdf7] p-5 shadow-xs" aria-labelledby="formal-requests-heading">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5edf2] pb-3">
              <div>
                <p className="board-eyebrow">
                  {isSubdireccion
                    ? "Subdirección Académica · Clubes Académicos"
                    : isSseisDelegated
                      ? "Designación SSEIS · Clubes Culturales y Deportivos"
                      : isCulturales
                        ? "SSEIS · Clubes Culturales y Deportivos"
                        : "Bandeja de registro formal"}
                </p>
                <h2 id="formal-requests-heading" className="text-lg font-extrabold text-[#15394d]">
                  Solicitudes formales de nuevos clubes
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="board-label">{pendingFormalCount} activas</span>
                {canCreateDirect && (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setDirectClubModalOpen(true)}
                    className={btn}
                  >
                    + Registrar club
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "activas", label: "Por atender" },
                  { id: "cita_pendiente", label: "Cita pendiente" },
                  { id: "cita_confirmada", label: "Cita confirmada" },
                  { id: "incompleta", label: "Incompletas" },
                  { id: "historial", label: "Historial (reg./rech.)" },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFormalFilter(chip.id)}
                  className={`rounded-sm px-3 py-1.5 text-xs font-bold transition ${
                    formalFilter === chip.id
                      ? "bg-[#006699] text-white"
                      : "border border-[#cddbe2] bg-white text-[#355667] hover:bg-[#e9f2f7]"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {filteredFormalRequests.length === 0 ? (
              <p className="text-sm text-[#5f6e78]">No hay solicitudes formales en este filtro.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredFormalRequests.map((req) => (
                  <Link key={req.id} href={`/clubes/propuestas/${req.id}`} className="board-proposal-card flex flex-col justify-between gap-2">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="board-label">{kindLabel(req.kind)}</span>
                        <span className="board-label board-label--pinned">{statusLabel(req.status)}</span>
                      </div>
                      <h3 className="text-base font-extrabold text-[#1b4053]">{req.name}</h3>
                      <p className="line-clamp-2 text-xs text-[#45616e]">
                        <strong>Cronograma:</strong> {req.schedule_plan || "Sin especificar"}
                      </p>
                      <p className="text-xs text-[#5c7280]">
                        Alumno: <strong>{req.proposer_name}</strong> · Prof. coordinador:{" "}
                        <strong>{req.advisor_name || "Confirmado"}</strong> · {req.participants_complete_docs}/{req.participants_count} expedientes · {interestLabel(req.interests)}
                      </p>
                      {req.scheduled_at && (
                        <p className="rounded-lg border border-[#cbe2ee] bg-[#f4f9fc] px-2.5 py-1.5 text-xs text-[#19435b]">
                          Junta {req.meeting_mode === "en_linea" ? "en línea" : "presencial"}: {formatMxDateTime(req.scheduled_at)}
                          {req.advisor_confirmed_appointment ? " · Prof. confirmó ✓" : " · Pendiente conf. profesor"}
                        </p>
                      )}
                    </div>
                    <p className="pt-1 text-xs font-extrabold text-[#004d73]">
                      Abrir expediente y coordinar junta con ambos →
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-[12px] border border-[#cde0ea] bg-[#fffdf7] p-5 shadow-xs" aria-labelledby="kpi-heading">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e5edf2] pb-3">
              <div>
                <p className="board-eyebrow">Tablero exclusivo de área</p>
                <h2 id="kpi-heading" className="text-xl font-extrabold text-[#15394d]">{kpiTitle}</h2>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="board-label">{pendingFormalCount} solicitudes activas</span>
                <span className="board-label">{totalPendingRequests} ingresos pendientes</span>
                {isSubdireccion && (
                  <Link href="/eventos" className="board-label hover:bg-[#e5f1f7]">
                    {sala14EventsCount} en Sala 14 →
                  </Link>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-[10px] border border-[#dce8ef] bg-[#f7fbfe] p-3">
                <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#5c7280]">Clubes activos</p>
                <p className="mt-1 text-2xl font-extrabold text-[#15394d]">{totalActiveClubs}</p>
              </div>
              <div className="rounded-[10px] border border-[#dce8ef] bg-[#f7fbfe] p-3">
                <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#5c7280]">Miembros</p>
                <p className="mt-1 text-2xl font-extrabold text-[#15394d]">{totalMembers}</p>
              </div>
              <div className="rounded-[10px] border border-[#dce8ef] bg-[#f7fbfe] p-3">
                <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#5c7280]">Solicitudes ingreso</p>
                <p className="mt-1 text-2xl font-extrabold text-[#004d73]">{totalPendingRequests}</p>
              </div>
              <div className="rounded-[10px] border border-[#dce8ef] bg-[#f7fbfe] p-3">
                <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#5c7280]">Publicaciones</p>
                <p className="mt-1 text-2xl font-extrabold text-[#15394d]">{totalPosts}</p>
              </div>
              <div className="rounded-[10px] border border-[#dce8ef] bg-[#f7fbfe] p-3">
                <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#5c7280]">Eventos aprobados</p>
                <p className="mt-1 text-2xl font-extrabold text-[#15394d]">{totalApprovedEvents}</p>
              </div>
              <div className="rounded-[10px] border border-[#dce8ef] bg-[#f7fbfe] p-3">
                <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#5c7280]">Registros Asistiré</p>
                <p className="mt-1 text-2xl font-extrabold text-[#006699]">{totalAttendees}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-[#45616e]">
              <span className="rounded-full bg-[#eef5f9] px-3 py-1 font-semibold">En documentación: {proposalStageCounts.en_documentacion}</span>
              <span className="rounded-full bg-[#eef5f9] px-3 py-1 font-semibold">En validación: {proposalStageCounts.en_validacion}</span>
              <span className="rounded-full bg-[#eef5f9] px-3 py-1 font-semibold">Cita pendiente: {proposalStageCounts.cita_pendiente}</span>
              <span className="rounded-full bg-[#eef5f9] px-3 py-1 font-semibold">Registradas: {proposalStageCounts.registrado}</span>
            </div>

            {clubKpis.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#e5edf2] text-[11px] font-bold uppercase tracking-[.05em] text-[#5c7280]">
                      <th className="py-2 pr-3">Club</th>
                      <th className="py-2 pr-3">Tipo</th>
                      <th className="py-2 pr-3">Estado</th>
                      <th className="py-2 pr-3">Miembros</th>
                      <th className="py-2 pr-3">Ingreso pend.</th>
                      <th className="py-2 pr-3">Publicaciones</th>
                      <th className="py-2 pr-3">Eventos</th>
                      <th className="py-2">Asistiré</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef3f6] text-[#1f3b4d]">
                    {clubKpis.map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 pr-3 font-bold">
                          <Link href={`/clubes/${row.id}`} className="text-[#004d73] hover:underline">{row.name}</Link>
                        </td>
                        <td className="py-2 pr-3">{kindLabel(row.kind)}</td>
                        <td className="py-2 pr-3">{row.active ? "Activo" : "Inactivo"}</td>
                        <td className="py-2 pr-3 font-semibold">{row.members_count}</td>
                        <td className="py-2 pr-3 font-semibold">{row.pending_requests}</td>
                        <td className="py-2 pr-3">{row.posts_count}</td>
                        <td className="py-2 pr-3">{row.approved_events}{row.pending_events > 0 ? ` (+${row.pending_events} pend.)` : ""}</td>
                        <td className="py-2 font-bold text-[#006699]">{row.attendees_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pendingMemberships.length > 0 && (
              <div className="border-t border-[#e5edf2] pt-3">
                <p className="text-xs font-extrabold uppercase tracking-[.06em] text-[#355464]">Solicitudes de ingreso pendientes</p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {pendingMemberships.map((req) => (
                    <li key={`${req.club_id}-${req.user_id}`} className="flex items-center justify-between gap-2 rounded-[8px] border border-[#dce8ef] bg-white px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-[#15394d]">{req.user_name}</p>
                        <p className="truncate text-[#5c7280]">{req.club_name} · {req.user_role}</p>
                      </div>
                      <Link href={`/clubes/${req.club_id}`} className="shrink-0 font-bold text-[#004d73] hover:underline">
                        Revisar →
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Diálogo 1: Proponer nuevo club */}
      {newClubModalOpen && (
        <FormDialog
          title="Proponer nuevo club"
          kicker="Comunidad ESCOM"
          accent="teal"
          size="lg"
          onClose={() => setNewClubModalOpen(false)}
        >
          <ProposalForm catalog={catalog} />
        </FormDialog>
      )}

      {/* Diálogo 2 (solo staff): Registro directo de club */}
      {directClubModalOpen && canCreateDirect && (
        <FormDialog
          title={isSubdireccion ? "Registrar club académico" : isCulturales ? "Registrar club cultural o deportivo" : "Registrar club directamente"}
          kicker={isSubdireccion ? "Subdirección Académica" : isCulturales ? "SSEIS · Clubes" : "Dirección de clubes"}
          accent="teal"
          size="xl"
          onClose={() => setDirectClubModalOpen(false)}
        >
          <DirectClubForm
            students={people.filter((p) => p.role === "alumno")}
            professors={people.filter((p) => p.role === "profesor")}
            allowedKinds={allowedKinds}
          />
        </FormDialog>
      )}

      {/* Diálogo 3 (solo SSEIS titular / Admin): Designar responsable de clubes culturales y deportivos */}
      {delegateModalOpen && isSseisTitular && (
        <FormDialog
          title="Designar responsable de clubes"
          kicker="SSEIS · Clubes Culturales y Deportivos"
          accent="teal"
          size="md"
          onClose={() => setDelegateModalOpen(false)}
        >
          <SseisDelegateForm
            candidates={people.filter((p) => p.role === "profesor" || p.role === "moderador")}
            onSuccess={() => setDelegateModalOpen(false)}
            onCancel={() => setDelegateModalOpen(false)}
          />
        </FormDialog>
      )}
    </div>
  );
}
