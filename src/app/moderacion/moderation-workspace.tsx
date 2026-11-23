"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { SubmitButton } from "@/components/loading-ui";
import type { DirectoryUserOption } from "@/components/searchable-user-picker";
import { btn, btnGhost, card, input, label } from "@/lib/ui";
import { registerStrike, reviewAppeal } from "./actions";
import { moderationAreaLabel, suspensionLabel } from "./shared";
import { StrikeUserPicker } from "./user-picker";

export type ModerationStrike = {
  id: string;
  user_name: string;
  user_boleta: string | null;
  area: string;
  reason: string;
  source_type: string;
  created_label: string;
  strike_total: number;
};

export type ModerationSuspension = {
  id: string;
  user_name: string;
  user_boleta: string | null;
  area: string;
  strike_count: number;
  duration: string | null;
  starts_at: string;
  starts_label: string;
  ends_at: string | null;
  is_permanent: boolean;
};

export type ModerationAppeal = {
  id: string;
  suspension_id: string;
  body: string;
  status: string;
  created_label: string;
  user_name: string;
  user_boleta: string | null;
  area: string;
  strike_count: number;
  starts_at: string;
  is_permanent: boolean;
  ends_at: string | null;
};

type ModTab = "apelaciones" | "infracciones" | "suspensiones";

const SOURCE_LABELS: Record<string, string> = {
  foro: "Foro",
  guia: "Guía",
  aviso: "Aviso",
  club: "Club",
  objeto: "Objeto perdido",
  otro: "Otro",
};

export function ModerationWorkspace({
  isAdmin,
  viewerArea,
  areaChoices,
  people,
  strikes,
  suspensions,
  appeals,
  prefill,
  feedback,
}: {
  isAdmin: boolean;
  viewerArea: string | null;
  areaChoices: readonly { readonly id: string; readonly label: string }[];
  people: DirectoryUserOption[];
  strikes: ModerationStrike[];
  suspensions: ModerationSuspension[];
  appeals: ModerationAppeal[];
  prefill: {
    userId: string;
    area: string;
    sourceType: string;
    reason: string;
  };
  feedback: {
    saved?: boolean;
    resolved?: boolean;
    error?: string;
  };
}) {
  const pendingAppeals = useMemo(
    () => appeals.filter((a) => a.status === "pendiente"),
    [appeals],
  );
  const [tab, setTab] = useState<ModTab>(
    pendingAppeals.length > 0 ? "apelaciones" : "infracciones",
  );
  const [showStrikeDialog, setShowStrikeDialog] = useState(Boolean(prefill.userId || prefill.reason));
  const [search, setSearch] = useState("");
  const [appealFilter, setAppealFilter] = useState<"all" | "pendiente" | "aceptada" | "rechazada">("all");

  const filteredAppeals = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("es-MX");
    return appeals.filter((a) => {
      if (appealFilter !== "all" && a.status !== appealFilter) return false;
      if (!q) return true;
      return `${a.user_name} ${a.user_boleta ?? ""} ${a.body} ${moderationAreaLabel(a.area)}`
        .toLocaleLowerCase("es-MX")
        .includes(q);
    });
  }, [appeals, appealFilter, search]);

  const filteredStrikes = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("es-MX");
    if (!q) return strikes;
    return strikes.filter((s) =>
      `${s.user_name} ${s.user_boleta ?? ""} ${s.reason} ${moderationAreaLabel(s.area)} ${s.source_type}`
        .toLocaleLowerCase("es-MX")
        .includes(q),
    );
  }, [strikes, search]);

  const filteredSuspensions = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("es-MX");
    if (!q) return suspensions;
    return suspensions.filter((s) =>
      `${s.user_name} ${s.user_boleta ?? ""} ${moderationAreaLabel(s.area)}`
        .toLocaleLowerCase("es-MX")
        .includes(q),
    );
  }, [suspensions, search]);

  return (
    <div className="space-y-6">
      {/* Cabezal */}
      <header className="edition-header">
        <div className="edition-rule flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#8c2925]">
              Convivencia ESCOM · {viewerArea ? moderationAreaLabel(viewerArea) : "Administración"}
            </p>
            <h1 className="edition-title mt-1">Moderación</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/apelaciones" className={btnGhost}>
              Vista de apelaciones
            </Link>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setShowStrikeDialog(true)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#8c2925] px-4 py-2 text-sm font-extrabold text-white transition hover:bg-[#6e1e1b]"
            >
              <span aria-hidden="true">+</span>
              <span>Registrar infracción</span>
            </button>
          </div>
        </div>

        {/* Resumen + Pestañas */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <nav role="tablist" aria-label="Secciones de moderación" className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "apelaciones"}
              onClick={() => setTab("apelaciones")}
              className="catalog-tab"
            >
              <span>Apelaciones</span>
              <small
                className={
                  pendingAppeals.length > 0
                    ? "rounded bg-[#f9ebc4] px-1.5 py-0.5 font-extrabold text-[#7d5509]"
                    : ""
                }
              >
                {pendingAppeals.length > 0 ? `${pendingAppeals.length} pend.` : appeals.length}
              </small>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "infracciones"}
              onClick={() => setTab("infracciones")}
              className="catalog-tab"
            >
              <span>Infracciones</span>
              <small>{strikes.length}</small>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "suspensiones"}
              onClick={() => setTab("suspensiones")}
              className="catalog-tab"
            >
              <span>Suspensiones</span>
              <small>{suspensions.length}</small>
            </button>
          </nav>

          <p className="rounded border border-[#dcd7c8] bg-[#f8f5ec] px-3 py-1 font-mono text-[11px] font-bold text-[#49616e]">
            Escala: 3→1 mes · 6→3 meses · 9→6 meses · 12+→Permanente
          </p>
        </div>
      </header>

      {feedback.saved && (
        <p role="status" className="rounded-md border border-[#a7cfb3] bg-[#eff8f1] px-4 py-3 text-sm font-semibold text-[#235b35]">
          La infracción quedó registrada. Si completó un bloque de tres, la suspensión ya está activa.
        </p>
      )}
      {feedback.resolved && (
        <p role="status" className="rounded-md border border-[#a7cfb3] bg-[#eff8f1] px-4 py-3 text-sm font-semibold text-[#235b35]">
          La apelación quedó resuelta y se notificó a la persona.
        </p>
      )}
      {feedback.error && (
        <p role="alert" className="rounded-md border border-[#e6b8ae] bg-[#fff4f1] px-4 py-3 text-sm font-semibold text-[#8a3528]">
          {feedback.error}
        </p>
      )}

      {/* Barra de búsqueda y filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5c727e]">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por nombre, boleta, motivo o área…"
            aria-label="Filtrar registros de moderación"
            className={`${input} mt-0 pl-9`}
          />
        </div>

        {tab === "apelaciones" && (
          <div className="flex flex-wrap gap-1.5">
            {(["all", "pendiente", "aceptada", "rechazada"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setAppealFilter(status)}
                className={`rounded border px-2.5 py-1.5 text-xs font-extrabold capitalize transition ${
                  appealFilter === status
                    ? "border-[#142c3c] bg-[#142c3c] text-white"
                    : "border-[#d4d1c5] bg-[#fffdf7] text-[#35505e] hover:border-[#006699]"
                }`}
              >
                {status === "all" ? "Todas" : status}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* PESTAÑA: APELACIONES */}
      {tab === "apelaciones" && (
        <section className="space-y-3">
          {filteredAppeals.length === 0 ? (
            <p className={`${card} text-sm text-[#5d7079]`}>No hay apelaciones en esta vista.</p>
          ) : (
            <div className="grid gap-4">
              {filteredAppeals.map((appeal) => (
                <article
                  key={appeal.id}
                  className={`rounded-md border border-[#d6d4c8] border-l-4 bg-[#fffdf7] p-5 space-y-3 ${
                    appeal.status === "pendiente"
                      ? "border-l-[#b88917]"
                      : appeal.status === "aceptada"
                        ? "border-l-[#1d7143]"
                        : "border-l-[#8c2925]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-extrabold text-[#142c3c]">{appeal.user_name}</h2>
                      {appeal.user_boleta && (
                        <span className="rounded bg-[#edf3f6] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#144c69]">
                          {appeal.user_boleta}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-[#5a6f7a]">
                        · {moderationAreaLabel(appeal.area)}
                      </span>
                    </div>
                    <span
                      className={`rounded px-2.5 py-0.5 text-xs font-extrabold uppercase ${
                        appeal.status === "pendiente"
                          ? "bg-[#fff3d7] text-[#775718]"
                          : appeal.status === "aceptada"
                            ? "bg-[#e8f6ec] text-[#1d6338]"
                            : "bg-[#fbeae7] text-[#8a3528]"
                      }`}
                    >
                      {appeal.status}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-[#344e5e]">{appeal.body}</p>
                  <p className="text-xs font-medium text-[#60727c]">
                    Suspensión por {appeal.strike_count} infracciones · {suspensionLabel(appeal)} · apelada {appeal.created_label}
                  </p>
                  {isAdmin && appeal.status === "pendiente" && (
                    <form
                      action={reviewAppeal}
                      className="grid gap-3 border-t border-[#e5e2d7] pt-3.5 sm:grid-cols-[1fr_auto_auto] sm:items-end"
                    >
                      <input type="hidden" name="appeal_id" value={appeal.id} />
                      <label className={label}>
                        Resolución y motivo
                        <textarea
                          required
                          minLength={5}
                          maxLength={1000}
                          name="review_note"
                          rows={2}
                          className={`${input} resize-y`}
                          placeholder="Explica la decisión; se mostrará a la persona."
                        />
                      </label>
                      <SubmitButton
                        name="decision"
                        value="aceptar"
                        pendingText="Aceptando…"
                        className="min-h-10 rounded-md bg-[#1d7143] px-4 py-2 text-sm font-bold text-white hover:bg-[#155634]"
                      >
                        Aceptar y levantar
                      </SubmitButton>
                      <SubmitButton
                        name="decision"
                        value="rechazar"
                        pendingText="Rechazando…"
                        className="min-h-10 rounded-md border border-[#b97063] px-4 py-2 text-sm font-bold text-[#8a3528] hover:bg-[#fff4f1]"
                      >
                        Rechazar
                      </SubmitButton>
                    </form>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* PESTAÑA: INFRACCIONES */}
      {tab === "infracciones" && (
        <section className="space-y-3">
          {filteredStrikes.length === 0 ? (
            <p className={`${card} text-sm text-[#5d7079]`}>Todavía no hay infracciones en esta vista.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredStrikes.map((strike) => (
                <article
                  key={strike.id}
                  className="flex flex-col justify-between gap-2.5 rounded-md border border-[#d6d4c8] bg-[#fffdf7] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <strong className="text-[#142c3c]">{strike.user_name}</strong>
                        {strike.user_boleta && (
                          <span className="rounded bg-[#edf3f6] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#144c69]">
                            {strike.user_boleta}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs font-semibold text-[#566b77]">
                        {moderationAreaLabel(strike.area)} · {SOURCE_LABELS[strike.source_type] ?? strike.source_type}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs font-extrabold ${
                        strike.strike_total >= 9
                          ? "bg-[#fbe9e7] text-[#8c2925]"
                          : strike.strike_total >= 3
                            ? "bg-[#fdf3d7] text-[#7c560d]"
                            : "bg-[#eaf4f8] text-[#004d73]"
                      }`}
                    >
                      Infracción #{strike.strike_total}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-[#344e5e]">{strike.reason}</p>
                  <p className="text-[11px] font-medium text-[#697c85]">{strike.created_label}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* PESTAÑA: SUSPENSIONES */}
      {tab === "suspensiones" && (
        <section className="space-y-3">
          {filteredSuspensions.length === 0 ? (
            <p className={`${card} text-sm text-[#5d7079]`}>Todavía no hay suspensiones en esta vista.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredSuspensions.map((suspension) => (
                <article
                  key={suspension.id}
                  className="rounded-md border border-[#d6d4c8] border-l-4 border-l-[#8c2925] bg-[#fffdf7] p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <strong className="text-[#142c3c]">{suspension.user_name}</strong>
                      {suspension.user_boleta && (
                        <span className="rounded bg-[#edf3f6] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#144c69]">
                          {suspension.user_boleta}
                        </span>
                      )}
                    </div>
                    <span className="rounded bg-[#fbe9e7] px-2 py-0.5 text-xs font-extrabold text-[#8c2925]">
                      {suspensionLabel(suspension)}
                    </span>
                  </div>
                  <p className="text-sm text-[#344e5e]">
                    {suspension.strike_count} infracciones acumuladas · {moderationAreaLabel(suspension.area)}
                  </p>
                  <p className="text-xs text-[#657780]">Inició {suspension.starts_label}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* DIÁLOGO PARA REGISTRAR INFRACCIÓN */}
      {showStrikeDialog && (
        <FormDialog
          title="Registrar infracción"
          kicker="Convivencia ESCOM"
          accent="crimson"
          size="lg"
          onClose={() => setShowStrikeDialog(false)}
        >
          <form action={registerStrike} className="space-y-4">
            <StrikeUserPicker
              people={people}
              defaultUserId={prefill.userId}
              allowModerators={isAdmin}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>
                Área del contenido
                <select
                  required
                  name="area"
                  defaultValue={viewerArea ?? prefill.area ?? areaChoices[0]?.id}
                  className={input}
                  disabled={!isAdmin}
                >
                  {areaChoices.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.label}
                    </option>
                  ))}
                </select>
                {!isAdmin && <input type="hidden" name="area" value={viewerArea ?? ""} />}
              </label>

              <label className={label}>
                Tipo de contenido
                <select name="source_type" className={input} defaultValue={prefill.sourceType || "foro"}>
                  <option value="foro">Foro</option>
                  <option value="guia">Guía</option>
                  <option value="aviso">Aviso</option>
                  <option value="club">Club</option>
                  <option value="objeto">Objeto perdido</option>
                  <option value="otro">Otro</option>
                </select>
              </label>
            </div>

            <label className={label}>
              Motivo y contexto
              <textarea
                required
                minLength={8}
                maxLength={1000}
                name="reason"
                rows={4}
                defaultValue={prefill.reason}
                className={`${input} resize-y`}
                placeholder="Describe qué ocurrió y por qué corresponde registrar una infracción."
              />
            </label>

            <p className="rounded border border-[#e6dcd4] bg-[#faf6f3] px-3 py-2 text-xs text-[#5d4b45]">
              Escala acumulada: 3 infracciones → 1 mes · 6 → 3 meses · 9 → 6 meses · 12+ → permanente.
            </p>

            <div className="flex justify-end gap-2 border-t border-[#e5e1d4] pt-4">
              <button type="button" onClick={() => setShowStrikeDialog(false)} className={btnGhost}>
                Cancelar
              </button>
              <SubmitButton
                pendingText="Registrando…"
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#8c2925] px-4 py-2 text-sm font-extrabold text-white hover:bg-[#6e1e1b]"
              >
                Confirmar infracción
              </SubmitButton>
            </div>
          </form>
        </FormDialog>
      )}
    </div>
  );
}
