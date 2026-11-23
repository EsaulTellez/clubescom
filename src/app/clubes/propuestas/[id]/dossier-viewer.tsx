"use client";

import { useEffect, useMemo, useState } from "react";
import { ProposalDocumentReviewForm } from "../../forms";
import { btnGhost, input } from "@/lib/ui";

export type DossierDocItem = {
  id: string;
  document_type: string;
  storage_path: string;
  status: string;
  review_note: string | null;
  signedUrl: string | null;
};

export type DossierRosterPerson = {
  user_id: string;
  name: string;
  email: string | null;
  boleta: string | null;
  career: string;
  phone: string;
  is_proposer: boolean;
  docs_received: number;
  docs: DossierDocItem[];
};

const DOCUMENT_LABELS: Record<string, string> = {
  credencial_ipn: "Credencial IPN",
  boleta: "Boleta",
  firma: "Firma",
  vigencia_ims: "Vigencia IMSS",
};

const EXPECTED_TYPES = ["credencial_ipn", "boleta", "vigencia_ims", "firma"] as const;

type FlatDocEntry = {
  person: DossierRosterPerson;
  doc: DossierDocItem;
};

function isPdfPath(path: string): boolean {
  return /\.pdf(\?|$)/i.test(path);
}

export function ProposalDossierViewer({
  proposalId,
  roster,
  canReviewFormal,
}: {
  proposalId: string;
  roster: DossierRosterPerson[];
  canReviewFormal: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"todos" | "completos" | "incompletos" | "correccion">("todos");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const filteredRoster = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roster.filter((person) => {
      const profileReady = person.career.trim().length >= 2 && person.phone.trim().length >= 8;
      const isComplete = profileReady && person.docs_received >= 4;
      const hasCorrection = person.docs.some((d) => d.status === "requiere_correccion");

      if (filter === "completos" && !isComplete) return false;
      if (filter === "incompletos" && isComplete) return false;
      if (filter === "correccion" && !hasCorrection) return false;

      if (!q) return true;
      return (
        person.name.toLowerCase().includes(q) ||
        (person.boleta ?? "").toLowerCase().includes(q) ||
        person.career.toLowerCase().includes(q)
      );
    });
  }, [roster, query, filter]);

  const flatDocs = useMemo<FlatDocEntry[]>(() => {
    const list: FlatDocEntry[] = [];
    for (const person of filteredRoster) {
      for (const doc of person.docs) {
        if (doc.signedUrl) {
          list.push({ person, doc });
        }
      }
    }
    return list;
  }, [filteredRoster]);

  const activeEntry = activeIndex !== null ? flatDocs[activeIndex] ?? null : null;

  useEffect(() => {
    if (activeIndex === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActiveIndex(null);
      } else if (e.key === "ArrowRight") {
        setActiveIndex((prev) => (prev !== null && prev < flatDocs.length - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowLeft") {
        setActiveIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, flatDocs.length]);

  function openDocById(docId: string) {
    const idx = flatDocs.findIndex((entry) => entry.doc.id === docId);
    if (idx >= 0) setActiveIndex(idx);
  }

  const completeCount = roster.filter(
    (p) => p.career.trim().length >= 2 && p.phone.trim().length >= 8 && p.docs_received >= 4,
  ).length;
  const correctionCount = roster.filter((p) =>
    p.docs.some((d) => d.status === "requiere_correccion"),
  ).length;

  return (
    <div className="space-y-3 border-t border-[#d5e4ee] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-[#14374a]">
          Padrón de integrantes y documentos ({completeCount}/{roster.length} completos)
        </h3>
        {canReviewFormal && flatDocs.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveIndex(0)}
            className="rounded-lg border border-[#006699] bg-[#eef7fb] px-3 py-1.5 text-xs font-extrabold text-[#004d73] hover:bg-[#dceef7]"
          >
            Abrir visor rápido ({flatDocs.length} archivos)
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, boleta o carrera…"
          className={`${input} max-w-xs text-xs`}
        />
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "todos", label: `Todos (${roster.length})` },
              { id: "completos", label: `Completos (${completeCount})` },
              { id: "incompletos", label: `Incompletos (${roster.length - completeCount})` },
              { id: "correccion", label: `Con corrección (${correctionCount})` },
            ] as const
          ).map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
                filter === chip.id
                  ? "bg-[#1b4053] text-white"
                  : "border border-[#cddbe2] bg-white text-[#355667] hover:bg-[#eef5f8]"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filteredRoster.length === 0 ? (
          <p className="text-xs text-[#596f7b]">No hay integrantes que coincidan con este filtro.</p>
        ) : (
          filteredRoster.map((person) => {
            const profileReady = person.career.trim().length >= 2 && person.phone.trim().length >= 8;
            const docMap = new Map(person.docs.map((d) => [d.document_type, d]));
            return (
              <article key={person.user_id} className="rounded-xl border border-[#d5e4ee] bg-white p-3.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-[#14374a]">
                      {person.name} {person.is_proposer ? "· Presidente" : ""}
                    </p>
                    <p className="text-xs text-[#596f7b]">
                      {person.boleta ? `Boleta ${person.boleta}` : "Sin boleta"}
                      {person.career ? ` · ${person.career}` : " · Carrera pendiente"}
                      {person.phone ? ` · Tel. ${person.phone}` : " · Teléfono pendiente"}
                      {person.email ? ` · ${person.email}` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                      profileReady && person.docs_received >= 4
                        ? "bg-[#eaf7f0] text-[#17634a]"
                        : "bg-[#f8f3e4] text-[#7a5612]"
                    }`}
                  >
                    {person.docs_received}/4 docs {profileReady ? "· Datos ✓" : "· Faltan datos"}
                  </span>
                </div>

                <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {EXPECTED_TYPES.map((typeKey) => {
                    const doc = docMap.get(typeKey);
                    if (!doc) {
                      return (
                        <div
                          key={typeKey}
                          className="rounded-lg border border-dashed border-[#d7e2e8] bg-[#fafcfd] p-2 text-xs text-[#6c7e88]"
                        >
                          <p className="font-bold">{DOCUMENT_LABELS[typeKey]}</p>
                          <p className="mt-0.5 text-[11px]">Faltante</p>
                        </div>
                      );
                    }
                    const needsFix = doc.status === "requiere_correccion";
                    return (
                      <div
                        key={doc.id}
                        className={`rounded-lg border p-2.5 text-xs ${
                          needsFix
                            ? "border-[#e6b7b2] bg-[#fff5f4]"
                            : "border-[#d8e6ee] bg-[#f8fbfd]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-bold text-[#19435b]">
                            {DOCUMENT_LABELS[doc.document_type] ?? doc.document_type}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                              needsFix
                                ? "bg-[#fce4e1] text-[#8C1D18]"
                                : "bg-[#e6f5ed] text-[#17634a]"
                            }`}
                          >
                            {needsFix ? "Corregir" : "Recibido"}
                          </span>
                        </div>
                        {doc.review_note && (
                          <p className="mt-1 line-clamp-2 text-[11px] text-[#8C1D18]">{doc.review_note}</p>
                        )}
                        {doc.signedUrl && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openDocById(doc.id)}
                              className="rounded bg-[#006699] px-2 py-1 text-[11px] font-bold text-white hover:bg-[#004f77]"
                            >
                              Previsualizar
                            </button>
                            <a
                              href={doc.signedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-bold text-[#005580] underline"
                            >
                              Pestaña ↗
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Visor modal con navegación secuencial y dictamen individual por documento */}
      {activeEntry && activeIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visor de documento de integrante"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-xs sm:p-5"
          onClick={() => setActiveIndex(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#cfdbe2] bg-[#fffefa] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e4ecee] bg-[#f4f9fb] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-wide text-[#005580]">
                  {DOCUMENT_LABELS[activeEntry.doc.document_type] ?? activeEntry.doc.document_type} · Archivo{" "}
                  {activeIndex + 1} de {flatDocs.length}
                </p>
                <p className="truncate text-sm font-extrabold text-[#14374a]">
                  {activeEntry.person.name}{" "}
                  {activeEntry.person.boleta ? `· Boleta ${activeEntry.person.boleta}` : ""}{" "}
                  {activeEntry.person.career ? `· ${activeEntry.person.career}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={activeIndex <= 0}
                  onClick={() => setActiveIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
                  className={`${btnGhost} px-2.5 py-1 text-xs disabled:opacity-40`}
                >
                  ← Anterior
                </button>
                <button
                  type="button"
                  disabled={activeIndex >= flatDocs.length - 1}
                  onClick={() => setActiveIndex((i) => (i !== null && i < flatDocs.length - 1 ? i + 1 : i))}
                  className={`${btnGhost} px-2.5 py-1 text-xs disabled:opacity-40`}
                >
                  Siguiente →
                </button>
                <button
                  type="button"
                  aria-label="Cerrar visor"
                  onClick={() => setActiveIndex(null)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-[#cbd9e0] bg-white text-sm font-bold text-[#35505e] hover:bg-[#eaf3f7]"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="grid flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_20rem]">
              <div className="flex min-h-[55vh] flex-col items-center justify-center overflow-hidden rounded-xl border border-[#d6e3ea] bg-[#eef3f6]">
                {activeEntry.doc.signedUrl && isPdfPath(activeEntry.doc.storage_path) ? (
                  <iframe
                    src={activeEntry.doc.signedUrl}
                    title={`Documento ${activeEntry.doc.document_type} de ${activeEntry.person.name}`}
                    className="h-[62vh] w-full bg-white"
                  />
                ) : activeEntry.doc.signedUrl ? (
                  <img
                    src={activeEntry.doc.signedUrl}
                    alt={`Documento ${activeEntry.doc.document_type} de ${activeEntry.person.name}`}
                    className="max-h-[62vh] w-auto object-contain"
                  />
                ) : (
                  <p className="p-6 text-sm text-[#596f7b]">No se pudo generar la vista previa.</p>
                )}
              </div>

              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-[#dce8ef] bg-[#f8fbfd] p-3">
                  <p className="font-extrabold text-[#14374a]">{activeEntry.person.name}</p>
                  <p className="mt-1 text-[#4c6470]">
                    Boleta: <strong>{activeEntry.person.boleta || "Sin registrar"}</strong>
                  </p>
                  <p className="text-[#4c6470]">
                    Carrera: <strong>{activeEntry.person.career || "Pendiente"}</strong>
                  </p>
                  <p className="text-[#4c6470]">
                    Tel.: <strong>{activeEntry.person.phone || "Pendiente"}</strong>
                  </p>
                  {activeEntry.person.email && (
                    <p className="break-all text-[#4c6470]">
                      Correo: <strong>{activeEntry.person.email}</strong>
                    </p>
                  )}
                  <p className="mt-2">
                    Estado actual:{" "}
                    <strong className={activeEntry.doc.status === "requiere_correccion" ? "text-[#8C1D18]" : "text-[#17634a]"}>
                      {activeEntry.doc.status === "requiere_correccion" ? "Requiere corrección" : "Recibido"}
                    </strong>
                  </p>
                  {activeEntry.doc.review_note && (
                    <p className="mt-1 rounded bg-[#fff2f0] p-2 text-[#8C1D18]">
                      Observación previa: {activeEntry.doc.review_note}
                    </p>
                  )}
                  {activeEntry.doc.signedUrl && (
                    <a
                      href={activeEntry.doc.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block font-bold text-[#006699] underline"
                    >
                      Descargar / abrir en pestaña ↗
                    </a>
                  )}
                </div>

                {canReviewFormal && (
                  <div className="rounded-xl border border-[#dce8ef] bg-white p-3">
                    <p className="font-extrabold text-[#14374a]">Dictamen individual</p>
                    <p className="mt-0.5 text-[11px] text-[#596f7b]">
                      Si solicitas corrección, se notificará directamente a {activeEntry.person.name}.
                    </p>
                    <ProposalDocumentReviewForm
                      key={activeEntry.doc.id}
                      proposalId={proposalId}
                      documentId={activeEntry.doc.id}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
