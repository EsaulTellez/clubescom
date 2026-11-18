"use client";

import { officeModules, procedureOffice } from "@/lib/areas";
import { CatalogSearch } from "@/components/catalog-search";
import { FormDialog } from "@/components/form-dialog";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { saveGuideProgress } from "@/app/guias/actions";
import type { GuideFaq, GuideStep } from "@/app/guias/shared";
import { btn, btnGhost, input } from "@/lib/ui";
import {
  markAnswerOfficialById,
  publishAnswerInline,
  publishQuestion,
  toggleQuestionPinById,
  toggleQuestionVote,
  voteForumAnswer,
} from "./actions";
import { QuestionForm } from "./question-form";
import {
  AREAS,
  REQUEST_KINDS,
  areaLabel,
  areaStyle,
  canModerateForumQuestion,
  formatDate,
  formatShortDate,
  requestKindLabel,
  requestKindStyle,
  voteLabel,
} from "./shared";

export type GuideItem = {
  id: string;
  area: string;
  title: string;
  summary: string;
  steps: GuideStep[];
  faqs: GuideFaq[];
  version: number;
  attachmentUrl: string | null;
  attachmentName: string | null;
  createdAtIso: string;
  authorName: string;
  completedSteps: number[];
};

export type ForumAnswerItem = {
  id: string;
  questionId: string;
  authorId: string;
  body: string;
  official: boolean;
  createdAtIso: string;
  authorName: string;
  authorRole: string;
  authorArea: string | null;
  score: number;
  viewerVote: -1 | 0 | 1;
};

export type ForumQuestionItem = {
  id: string;
  authorId: string;
  area: string;
  requestKind: string;
  targetGuideId: string | null;
  targetGuideTitle: string | null;
  title: string;
  body: string;
  imageUrl: string | null;
  isPinned: boolean;
  status: string;
  createdAtIso: string;
  authorName: string;
  votes: number;
  voted: boolean;
  answers: ForumAnswerItem[];
};

export type DirectoryRoom = {
  code: string;
  kind: string;
  name: string;
  description: string;
};

export type ViewerSession = {
  id: string;
  name: string;
  role: string;
  area: string | null;
};

type ViewMode = "todo" | "guias" | "oficiales" | "abiertas";

function roleBadge(role: string, official: boolean, area: string | null) {
  if (official) return "Oficial";
  if (role === "profesor") return "Profesor";
  if (role === "moderador") return area ? areaLabel(area) : "Moderación";
  if (role === "admin") return "Administración";
  return "Alumno";
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function scoreGuideSimilarity(query: string, guide: GuideItem) {
  const tokens = normalizeSearchText(query)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return 0;
  const hay = normalizeSearchText(
    `${guide.title} ${guide.summary} ${guide.steps.map((s) => `${s.title} ${s.body}`).join(" ")}`,
  );
  let hits = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hits += 1;
  }
  return hits / tokens.length;
}

function subscribeGuideStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("escom-guide-progress", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("escom-guide-progress", onStoreChange);
  };
}

function readGuestGuideProgressSnapshot(guideIds: string[]): string {
  const result: Record<string, number[]> = {};
  for (const id of guideIds) {
    try {
      const raw = window.localStorage.getItem(`escom-guide-progress-${id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          result[id] = parsed.filter((n): n is number => typeof n === "number");
        }
      }
    } catch {
      // ignore storage errors
    }
  }
  return JSON.stringify(result);
}

export function ForoGuiasBoard({
  guides,
  initialQuestions,
  directoryRooms,
  viewer,
  initialArea = "all",
  initialQuery = "",
  initialView = "todo",
  initialDudaId = null,
  initialGuiaId = null,
}: {
  guides: GuideItem[];
  initialQuestions: ForumQuestionItem[];
  directoryRooms: DirectoryRoom[];
  viewer: ViewerSession | null;
  initialArea?: string;
  initialQuery?: string;
  initialView?: ViewMode;
  initialDudaId?: string | null;
  initialGuiaId?: string | null;
}) {
  const [prevInitialArea, setPrevInitialArea] = useState<string>(initialArea);
  const [prevInitialQuery, setPrevInitialQuery] = useState<string>(initialQuery);
  const [prevInitialView, setPrevInitialView] = useState<ViewMode>(initialView);
  const [areaFilter, setAreaFilter] = useState<string>(initialArea);
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [query, setQuery] = useState<string>(initialQuery);

  if (prevInitialArea !== initialArea) {
    setPrevInitialArea(initialArea);
    setAreaFilter(initialArea);
  }
  if (prevInitialQuery !== initialQuery) {
    setPrevInitialQuery(initialQuery);
    setQuery(initialQuery);
  }
  if (prevInitialView !== initialView) {
    setPrevInitialView(initialView);
    setViewMode(initialView);
  }

  const [prevInitialQuestions, setPrevInitialQuestions] = useState<ForumQuestionItem[]>(initialQuestions);
  const [questions, setQuestions] = useState<ForumQuestionItem[]>(initialQuestions);
  if (prevInitialQuestions !== initialQuestions) {
    setPrevInitialQuestions(initialQuestions);
    setQuestions(initialQuestions);
  }

  const [expandedGuides, setExpandedGuides] = useState<Record<string, boolean>>(() =>
    initialGuiaId ? { [initialGuiaId]: true } : {},
  );
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>(() =>
    initialDudaId ? { [initialDudaId]: true } : {},
  );
  const [signedInProgress, setSignedInProgress] = useState<Record<string, number[]>>(() => {
    const map: Record<string, number[]> = {};
    for (const g of guides) map[g.id] = g.completedSteps;
    return map;
  });

  const guideIds = useMemo(() => guides.map((g) => g.id), [guides]);
  const guestProgressRaw = useSyncExternalStore(
    subscribeGuideStorage,
    () => (viewer ? "{}" : readGuestGuideProgressSnapshot(guideIds)),
    () => "{}",
  );
  const guideProgress = useMemo<Record<string, number[]>>(() => {
    if (viewer) return signedInProgress;
    try {
      return JSON.parse(guestProgressRaw) as Record<string, number[]>;
    } catch {
      return {};
    }
  }, [viewer, signedInProgress, guestProgressRaw]);

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});
  const [replyPending, setReplyPending] = useState<Record<string, boolean>>({});
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [lightboxItem, setLightboxItem] = useState<{ src: string; title: string } | null>(null);

  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [prevInitialDudaId, setPrevInitialDudaId] = useState(initialDudaId);
  if (prevInitialDudaId !== initialDudaId) {
    setPrevInitialDudaId(initialDudaId);
    setShowQuestionForm(false);
    if (initialDudaId) setExpandedThreads((prev) => ({ ...prev, [initialDudaId]: true }));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && lightboxItem) {
        setLightboxItem(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxItem]);

  useEffect(() => {
    if (initialDudaId) {
      const el = document.getElementById(`duda-${initialDudaId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else if (initialGuiaId) {
      const el = document.getElementById(`guia-${initialGuiaId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [initialDudaId, initialGuiaId]);

  const office = procedureOffice(viewer);
  const hasDisciplinaryPanel = !officeModules(viewer);
  const canCreateGuide = Boolean(
    viewer &&
      (viewer.role === "admin" ||
        (viewer.role === "moderador" && ["gestion_escolar", "becas", "catt"].includes(viewer.area ?? ""))),
  );
  const cleanQuery = normalizeSearchText(query.trim());

  const { matchingGuidesNoArea, matchingQuestionsNoArea } = useMemo(() => {
    const gMatches = guides.filter((g) => {
      if (!cleanQuery) return true;
      const inSteps = g.steps.some(
        (s) => normalizeSearchText(s.title).includes(cleanQuery) || normalizeSearchText(s.body).includes(cleanQuery),
      );
      const inFaqs = g.faqs.some(
        (f) => normalizeSearchText(f.q).includes(cleanQuery) || normalizeSearchText(f.a).includes(cleanQuery),
      );
      return (
        normalizeSearchText(g.title).includes(cleanQuery) ||
        normalizeSearchText(g.summary).includes(cleanQuery) ||
        normalizeSearchText(areaLabel(g.area)).includes(cleanQuery) ||
        inSteps ||
        inFaqs
      );
    });

    const qMatches = questions.filter((q) => {
      if (kindFilter !== "all" && q.requestKind !== kindFilter) return false;
      const hasOfficial = q.answers.some((a) => a.official);
      if (viewMode === "oficiales" && !hasOfficial) return false;
      if (viewMode === "abiertas" && hasOfficial) return false;
      if (!cleanQuery) return true;
      const inAnswers = q.answers.some(
        (a) =>
          normalizeSearchText(a.body).includes(cleanQuery) ||
          normalizeSearchText(a.authorName).includes(cleanQuery),
      );
      return (
        normalizeSearchText(q.title).includes(cleanQuery) ||
        normalizeSearchText(q.body).includes(cleanQuery) ||
        normalizeSearchText(areaLabel(q.area)).includes(cleanQuery) ||
        normalizeSearchText(requestKindLabel(q.requestKind)).includes(cleanQuery) ||
        inAnswers
      );
    });

    return { matchingGuidesNoArea: gMatches, matchingQuestionsNoArea: qMatches };
  }, [guides, questions, kindFilter, viewMode, cleanQuery]);

  const officialCountAll = useMemo(
    () => questions.filter((q) => q.answers.some((a) => a.official)).length,
    [questions],
  );

  const areaCounts = useMemo(() => {
    const includeGuides = viewMode === "guias" || (viewMode === "todo" && kindFilter === "all");
    const includeQuestions = viewMode !== "guias";
    const map: Record<string, number> = { all: 0 };
    for (const a of AREAS) {
      map[a.id] = 0;
    }
    if (includeGuides) {
      for (const g of matchingGuidesNoArea) {
        map.all += 1;
        map[g.area] = (map[g.area] ?? 0) + 1;
      }
    }
    if (includeQuestions) {
      for (const q of matchingQuestionsNoArea) {
        map.all += 1;
        map[q.area] = (map[q.area] ?? 0) + 1;
      }
    }
    return map;
  }, [matchingGuidesNoArea, matchingQuestionsNoArea, viewMode, kindFilter]);

  const filteredGuides = useMemo(() => {
    if (areaFilter === "all") return matchingGuidesNoArea;
    return matchingGuidesNoArea.filter((g) => g.area === areaFilter);
  }, [matchingGuidesNoArea, areaFilter]);

  const similarGuides = useMemo(() => {
    if (!cleanQuery || filteredGuides.length > 0) return [];
    return guides
      .filter((g) => areaFilter === "all" || g.area === areaFilter)
      .map((g) => ({ guide: g, score: scoreGuideSimilarity(cleanQuery, g) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.guide);
  }, [guides, filteredGuides.length, cleanQuery, areaFilter]);

  const filteredQuestions = useMemo(() => {
    if (areaFilter === "all") return matchingQuestionsNoArea;
    return matchingQuestionsNoArea.filter((q) => q.area === areaFilter);
  }, [matchingQuestionsNoArea, areaFilter]);

  const showGuidesSection =
    viewMode === "guias" ||
    (viewMode === "todo" &&
      kindFilter === "all" &&
      (filteredGuides.length > 0 || Boolean(cleanQuery) || filteredQuestions.length === 0));
  const showForumSection = viewMode === "todo" || viewMode === "oficiales" || viewMode === "abiertas";
  const hasActiveFilters = areaFilter !== (office ?? "all") || kindFilter !== "all" || viewMode !== "todo" || Boolean(cleanQuery);

  function resetAllFilters() {
    setAreaFilter(office ?? "all");
    setKindFilter("all");
    setViewMode("todo");
    setQuery("");
  }

  function toggleGuideOpen(id: string) {
    setExpandedGuides((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleThreadOpen(id: string) {
    setExpandedThreads((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleGuideStep(guideId: string, stepIndex: number) {
    const current = guideProgress[guideId] ?? [];
    const checked = current.includes(stepIndex);
    const next = checked ? current.filter((i) => i !== stepIndex) : [...current, stepIndex];
    if (viewer) {
      setSignedInProgress((prev) => ({ ...prev, [guideId]: next }));
      void saveGuideProgress(guideId, next, checked ? undefined : stepIndex);
    } else {
      try {
        window.localStorage.setItem(`escom-guide-progress-${guideId}`, JSON.stringify(next));
        window.dispatchEvent(new Event("escom-guide-progress"));
      } catch {
        // ignore storage errors
      }
    }
  }

  async function handleQuestionVote(questionId: string) {
    if (!viewer) {
      setActionNotice("Inicia sesión con tu correo institucional para votar dudas.");
      return;
    }
    setActionNotice(null);
    const prevQ = questions.find((q) => q.id === questionId);
    if (!prevQ) return;
    const optimisticVoted = !prevQ.voted;
    const optimisticVotes = prevQ.votes + (optimisticVoted ? 1 : -1);

    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, voted: optimisticVoted, votes: Math.max(0, optimisticVotes) } : q)),
    );

    const res = await toggleQuestionVote(questionId);
    if ("error" in res) {
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, voted: prevQ.voted, votes: prevQ.votes } : q)),
      );
      setActionNotice(res.error);
      return;
    }
    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, voted: res.voted, votes: res.votes } : q)),
    );
  }

  async function handleAnswerVote(questionId: string, answerId: string, direction: 1 | -1) {
    if (!viewer) {
      setActionNotice("Inicia sesión con tu correo institucional para votar respuestas.");
      return;
    }
    setActionNotice(null);
    const targetQ = questions.find((q) => q.id === questionId);
    const targetA = targetQ?.answers.find((a) => a.id === answerId);
    if (!targetA) return;

    const nextVote: -1 | 0 | 1 = targetA.viewerVote === direction ? 0 : direction;
    const delta = nextVote - targetA.viewerVote;

    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              answers: q.answers.map((a) =>
                a.id === answerId ? { ...a, viewerVote: nextVote, score: a.score + delta } : a,
              ),
            }
          : q,
      ),
    );

    const res = await voteForumAnswer(answerId, direction);
    if ("error" in res) {
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId
            ? {
                ...q,
                answers: q.answers.map((a) =>
                  a.id === answerId ? { ...a, viewerVote: targetA.viewerVote, score: targetA.score } : a,
                ),
              }
            : q,
        ),
      );
      setActionNotice(res.error);
      return;
    }

    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              answers: q.answers.map((a) =>
                a.id === answerId ? { ...a, viewerVote: res.viewerVote, score: res.score } : a,
              ),
            }
          : q,
      ),
    );
  }

  async function handlePinToggle(questionId: string) {
    const res = await toggleQuestionPinById(questionId);
    if ("error" in res) {
      setActionNotice(res.error);
      return;
    }
    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, isPinned: res.isPinned } : q)),
    );
  }

  async function handleMarkOfficial(questionId: string, answerId: string) {
    const res = await markAnswerOfficialById(questionId, answerId);
    if ("error" in res) {
      setActionNotice(res.error);
      return;
    }
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              status: "respondida",
              answers: q.answers.map((a) => (a.id === answerId ? { ...a, official: true } : a)),
            }
          : q,
      ),
    );
  }

  async function handleInlineReplySubmit(questionId: string, e: React.FormEvent) {
    e.preventDefault();
    const draft = (replyDrafts[questionId] ?? "").trim();
    if (draft.length < 10) {
      setReplyErrors((prev) => ({
        ...prev,
        [questionId]: "Escribe una respuesta de al menos 10 caracteres.",
      }));
      return;
    }
    setReplyErrors((prev) => ({ ...prev, [questionId]: "" }));
    setReplyPending((prev) => ({ ...prev, [questionId]: true }));

    const res = await publishAnswerInline(questionId, draft);
    setReplyPending((prev) => ({ ...prev, [questionId]: false }));

    if ("error" in res) {
      setReplyErrors((prev) => ({ ...prev, [questionId]: res.error }));
      return;
    }

    setReplyDrafts((prev) => ({ ...prev, [questionId]: "" }));
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              status: res.answer.official ? "respondida" : q.status,
              answers: [...q.answers, res.answer],
            }
          : q,
      ),
    );
  }

  function jumpToQuestion(questionId: string) {
    setShowQuestionForm(false);
    setAreaFilter(office ?? "all");
    setKindFilter("all");
    setViewMode("todo");
    setQuery("");
    setExpandedThreads((prev) => ({ ...prev, [questionId]: true }));
    window.setTimeout(() => {
      document.getElementById(`duda-${questionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  function jumpToNewQuestion(targetArea?: string) {
    if (targetArea && targetArea !== "all") {
      setAreaFilter(targetArea);
    }
    setShowQuestionForm(true);
  }

  return (
    <div className="space-y-7">
      {/* Cabecera tipo Gaceta / Mesa Escolar de Trámites */}
      <section className="edition-header">
        <div>
          <div className="edition-rule flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="edition-title">Foro y Guías</h1>
              <p className="mt-2 text-xs text-[#51616a]">
                {guides.length} {guides.length === 1 ? "guía" : "guías"} · {questions.length} {questions.length === 1 ? "duda" : "dudas"} · {officialCountAll} con respuesta oficial
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => jumpToNewQuestion()}
                className={btn}
              >
                <span aria-hidden="true">+</span>
                <span>Nueva publicación</span>
              </button>
              {canCreateGuide && (
                <Link
                  href="/guias/nueva"
                  className={btnGhost}
                >
                  <span aria-hidden="true">+</span>
                  <span>Nueva guía</span>
                </Link>
              )}
            </div>
          </div>

          {/* Buscador instantáneo unificado */}
          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <CatalogSearch value={query} onChange={setQuery} label="Buscar guías o preguntas" shortcutEnabled={!lightboxItem && !showQuestionForm} />

            {/* Selector de vista */}
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Tipo de contenido">
              {(
                [
                  { id: "todo", label: "Todo" },
                  { id: "guias", label: "Guías" },
                  { id: "oficiales", label: "Con respuesta oficial" },
                  { id: "abiertas", label: "Abiertas" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === tab.id}
                  onClick={() => {
                    setViewMode(tab.id);
                    if (tab.id === "guias") setKindFilter("all");
                  }}
                  className="catalog-tab"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-[#dfdccc] pt-3">
            <label className="min-w-0 flex-auto text-xs font-semibold text-[#405861] sm:flex-none">
              Área
              <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}
                className={`${input} mt-1 block`}>
                {!office && <option value="all">Todas las áreas ({areaCounts.all})</option>}
                {AREAS.filter((area) => !office || area.id === office).map((area) => <option key={area.id} value={area.id}>{area.label} ({areaCounts[area.id] ?? 0})</option>)}
              </select>
            </label>
            {viewMode !== "guias" && (
              <label className="min-w-0 flex-auto text-xs font-semibold text-[#405861] sm:flex-none">
                Tipo de publicación
                <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}
                  className={`${input} mt-1 block`}>
                  <option value="all">Todos los tipos</option>
                  {REQUEST_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
                </select>
              </label>
            )}
            {hasActiveFilters && <button type="button" onClick={resetAllFilters}
              className="min-h-10 text-xs font-semibold text-[#155775] underline underline-offset-4">Limpiar filtros</button>}
          </div>
        </div>
      </section>

      {actionNotice && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#e3cf99] bg-[#fcf5de] px-4 py-3 text-sm font-semibold text-[#6e5008]"
        >
          <span>{actionNotice}</span>
          <div className="flex items-center gap-3">
            {!viewer && (
              <Link href="/entrar" className="font-extrabold text-[#004d73] underline">
                Entrar →
              </Link>
            )}
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="text-xs font-extrabold uppercase tracking-wide text-[#6e5008] underline"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Cuerpo editorial de 2 columnas */}
      <div className="grid items-start gap-7 lg:grid-cols-12">
        <div className="min-w-0 space-y-9 lg:col-span-8">
          {/* SECCIÓN 1: Manuales y Guías Oficiales */}
          {showGuidesSection && (
            <section aria-labelledby="guides-section-heading" className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[#16384a] pb-2">
                <div>
                  <h2
                    id="guides-section-heading"
                    className="text-xl font-extrabold tracking-tight text-[#14374a] sm:text-2xl"
                  >
                    Guías paso a paso
                  </h2>
                </div>
                <span className="rounded border border-[#d6d3c6] bg-[#fffdf7] px-2.5 py-1 text-xs font-extrabold text-[#385360] tabular-nums">
                  {filteredGuides.length} {filteredGuides.length === 1 ? "guía" : "guías"}
                </span>
              </div>

              {filteredGuides.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {filteredGuides.map((guide) => {
                    const st = areaStyle(guide.area);
                    const isOpen = Boolean(expandedGuides[guide.id]);
                    const doneList = guideProgress[guide.id] ?? [];
                    const pct = guide.steps.length
                      ? Math.round((doneList.length / guide.steps.length) * 100)
                      : 0;

                    return (
                      <article
                        id={`guia-${guide.id}`}
                        key={guide.id}
                        className={`flex flex-col overflow-hidden rounded-sm border border-[#d6d3c6] border-t-4 ${st.borderTop} bg-[#fffdf7] shadow-[0_2px_0_rgba(23,49,66,0.04)] transition ${
                          isOpen ? "md:col-span-2" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ded7c3] bg-[#f3eedf] px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${st.badgeBorder} ${st.badgeBg} ${st.badgeText}`}
                            >
                              {areaLabel(guide.area)}
                            </span>
                            <span className="font-mono text-[11px] text-[#58635e]">
                              v{guide.version}
                            </span>
                            {guide.attachmentUrl && (
                              <span className="rounded border border-[#bcd6e3] bg-[#eaf4f8] px-2 py-0.5 text-[11px] font-extrabold text-[#004d73]">
                                PDF
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-bold text-[#5e717a] tabular-nums">
                            {guide.steps.length} {guide.steps.length === 1 ? "paso" : "pasos"}
                            {guide.faqs.length > 0 ? ` · ${guide.faqs.length} FAQ` : ""}
                          </span>
                        </div>

                        <div className="flex flex-1 flex-col p-4 sm:p-5">
                          <h3 className="text-lg font-extrabold leading-snug text-[#14374a] sm:text-xl">
                            {guide.title}
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-[#485d68]">{guide.summary}</p>

                          {doneList.length > 0 && (
                            <div className="mt-3 flex items-center gap-2.5 text-xs font-bold text-[#004d73]">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e6e2d6]">
                                <div
                                  className="h-full rounded-full bg-[#006699] transition-[width] duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="shrink-0 tabular-nums">
                                {doneList.length}/{guide.steps.length}
                              </span>
                            </div>
                          )}

                          {/* Desplegable inline de pasos y FAQ */}
                          {isOpen && (
                            <div className="mt-5 space-y-5 border-t border-[#e4e0d3] pt-5">
                              {guide.attachmentUrl && (
                                <div>
                                  <a
                                    href={guide.attachmentUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    download={guide.attachmentName ?? "formato-tramite.pdf"}
                                    className="inline-flex items-center gap-2 rounded-lg border border-[#006699] bg-[#eaf4f8] px-3 py-2 text-xs font-extrabold text-[#004d73] hover:bg-[#d7eaf3]"
                                  >
                                    Descargar formato PDF ({guide.attachmentName ?? "Documento oficial"})
                                  </a>
                                </div>
                              )}

                              <ol className="space-y-2.5">
                                {guide.steps.map((step, idx) => {
                                  const checked = doneList.includes(idx);
                                  return (
                                    <li
                                      key={`${guide.id}-step-${idx}`}
                                      className={`flex items-start gap-3 rounded-lg border p-3.5 transition ${
                                        checked
                                          ? "border-[#bcd6e3] bg-[#f1f8fb]"
                                          : "border-[#e2dfd3] bg-white"
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        aria-pressed={checked}
                                        onClick={() => toggleGuideStep(guide.id, idx)}
                                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border text-xs font-extrabold transition ${
                                          checked
                                            ? "border-[#006699] bg-[#006699] text-white"
                                            : "border-[#cfd8dc] bg-[#f6f5ef] text-[#173a4c] hover:border-[#006699]"
                                        }`}
                                      >
                                        {checked ? "✓" : String(idx + 1).padStart(2, "0")}
                                      </button>
                                      <div className="min-w-0 flex-1">
                                        <p
                                          className={`text-sm font-extrabold ${
                                            checked ? "text-[#58707c] line-through" : "text-[#14374a]"
                                          }`}
                                        >
                                          {step.title}
                                        </p>
                                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#455a64]">
                                          {step.body}
                                        </p>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ol>

                              {guide.faqs.length > 0 && (
                                <div className="rounded-lg border border-[#e0dccf] bg-[#f8f6ee] p-4">
                                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#47616d]">
                                    Preguntas frecuentes
                                  </p>
                                  <dl className="mt-3 space-y-3">
                                    {guide.faqs.map((faq, faqIdx) => (
                                      <div key={`${faq.q}-${faqIdx}`} className="border-t border-dashed border-[#dcd8c9] pt-2.5 first:border-t-0 first:pt-0">
                                        <dt className="text-sm font-extrabold text-[#16384a]">{faq.q}</dt>
                                        <dd className="mt-1 text-sm leading-relaxed text-[#485d68]">{faq.a}</dd>
                                      </div>
                                    ))}
                                  </dl>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-[#e4e0d3] pt-3.5 text-xs">
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              onClick={() => toggleGuideOpen(guide.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#bcd6e3] bg-[#eaf4f8] px-3 py-1.5 font-extrabold text-[#004d73] transition hover:bg-[#d6eaf3]"
                            >
                              {isOpen ? "Ocultar pasos" : "Leer pasos y FAQ"}
                            </button>
                            <Link
                              href={`/guias/${guide.id}`}
                              className="font-bold text-[#3c5966] hover:text-[#006699] hover:underline"
                            >
                              Expediente completo →
                            </Link>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : cleanQuery ? (
                <div className="rounded-sm border border-[#d6d3c6] bg-[#fffdf7] p-5 sm:p-6">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#006699]">
                    Sin coincidencias exactas en guías para “{query}”
                  </p>
                  {similarGuides.length > 0 ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {similarGuides.map((guide) => (
                        <button
                          key={guide.id}
                          type="button"
                          onClick={() => {
                            setQuery("");
                            setAreaFilter(guide.area);
                            setExpandedGuides((prev) => ({ ...prev, [guide.id]: true }));
                          }}
                          className="rounded-lg border border-[#dcd9ce] bg-white p-3.5 text-left transition hover:border-[#006699] hover:bg-[#f2f8fb]"
                        >
                          <span className="text-[11px] font-extrabold uppercase text-[#004d73]">
                            {areaLabel(guide.area)}
                          </span>
                          <p className="mt-1 text-sm font-extrabold text-[#14374a]">{guide.title}</p>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[#e1ddd0] pt-4">
                    <p className="text-sm font-semibold text-[#455a64]">
                      Si tu trámite no aparece aquí, revisa el foro o publica tu duda.
                    </p>
                    <button
                      type="button"
                      onClick={() => jumpToNewQuestion(areaFilter !== "all" ? areaFilter : "general")}
                      className="rounded-lg bg-[#006699] px-3.5 py-2 text-xs font-extrabold text-white hover:bg-[#004d73]"
                    >
                      Preguntar en {areaFilter !== "all" ? areaLabel(areaFilter) : "Foro"} →
                    </button>
                  </div>
                </div>
              ) : (
                <p className="rounded-sm border border-[#d6d3c6] bg-[#fffdf7] p-5 text-sm text-[#5f6e78]">
                  No hay guías publicadas en esta área todavía.
                </p>
              )}
            </section>
          )}

          {/* SECCIÓN 2: Consultorio y Dudas de la Comunidad (Sin clic en títulos; respuesta oficial de primera mano + historial desplegable estilo Reddit) */}
          {showForumSection && (
            <section aria-labelledby="forum-section-heading" className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[#16384a] pb-2">
                <div>
                  <h2
                    id="forum-section-heading"
                    className="text-xl font-extrabold tracking-tight text-[#14374a] sm:text-2xl"
                  >
                    Dudas y respuestas de la comunidad
                  </h2>
                </div>
                <span className="rounded border border-[#d6d3c6] bg-[#fffdf7] px-2.5 py-1 text-xs font-extrabold text-[#385360] tabular-nums">
                  {filteredQuestions.length} {filteredQuestions.length === 1 ? "duda" : "dudas"}
                </span>
              </div>

              {filteredQuestions.length > 0 ? (
                <div className="space-y-5">
                  {filteredQuestions.map((q) => {
                    const st = areaStyle(q.area);
                    const officialAnswers = q.answers.filter((a) => a.official);
                    const primaryOfficial = officialAnswers[0] ?? null;
                    const threadAnswers = primaryOfficial
                      ? q.answers.filter((a) => a.id !== primaryOfficial.id)
                      : q.answers;
                    const sortedThread = [...threadAnswers].sort(
                      (a, b) => Number(b.official) - Number(a.official) || b.score - a.score || a.createdAtIso.localeCompare(b.createdAtIso),
                    );
                    const isThreadOpen = Boolean(expandedThreads[q.id]);
                    const canModerateQuestion = canModerateForumQuestion(viewer, q.area, q.requestKind);
                    const rkStyle = requestKindStyle(q.requestKind);

                    return (
                      <article
                        id={`duda-${q.id}`}
                        key={q.id}
                        className={`overflow-hidden rounded-sm border border-[#d6d3c6] border-l-4 ${st.borderLeft} bg-[#fffdf7] shadow-[0_2px_0_rgba(23,49,66,0.04)]`}
                      >
                        <div className="p-4 sm:p-6">
                          <div className="flex items-start gap-3.5 sm:gap-4">
                            {/* Voto de interés en la duda */}
                            <div className="flex shrink-0 flex-col items-center">
                              <button
                                type="button"
                                onClick={() => handleQuestionVote(q.id)}
                                aria-pressed={q.voted}
                                aria-label={q.voted ? "Quitar voto de la duda" : "Votar esta duda"}
                                className={`flex min-w-[3.25rem] flex-col items-center justify-center rounded-lg border px-2 py-2 transition ${
                                  q.voted
                                    ? "border-[#004d73] bg-[#006699] text-white"
                                    : "border-[#dfd8c3] bg-[#faf7ec] text-[#35505e] hover:border-[#9eb9c6] hover:bg-[#eef4f6]"
                                }`}
                              >
                                <span className="text-xs leading-none" aria-hidden="true">▲</span>
                                <strong className="mt-1 text-base font-extrabold leading-none tabular-nums">
                                  {q.votes}
                                </strong>
                                <span className="mt-1 text-[10px] font-extrabold uppercase tracking-wider opacity-85">
                                  {q.votes === 1 ? "voto" : "votos"}
                                </span>
                              </button>
                            </div>

                            <div className="min-w-0 flex-1">
                              {/* Meta editorial superior */}
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${st.badgeBorder} ${st.badgeBg} ${st.badgeText}`}
                                  >
                                    {areaLabel(q.area)}
                                  </span>
                                  {q.requestKind !== "pregunta" && (
                                    <span
                                      className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-extrabold ${rkStyle.badge}`}
                                    >
                                      {requestKindLabel(q.requestKind)}
                                    </span>
                                  )}
                                  {primaryOfficial ? (
                                    <span className="inline-flex items-center rounded border border-[#b4d3c6] bg-[#e9f5f0] px-2 py-0.5 text-[11px] font-extrabold text-[#11503d]">
                                      ✓ Respuesta oficial
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded border border-[#e3cf99] bg-[#fcf5de] px-2 py-0.5 text-[11px] font-extrabold text-[#6e5008]">
                                      Sin respuesta oficial
                                    </span>
                                  )}
                                  {q.isPinned && (
                                    <span className="inline-flex items-center rounded border border-[#e9dca5] bg-[#fff7d7] px-2 py-0.5 text-[11px] font-extrabold text-[#755912]">
                                      📌 Fijada
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs text-[#5d707a]">
                                  <span>{q.authorName}</span>
                                  <span aria-hidden="true">·</span>
                                  <time dateTime={q.createdAtIso}>{formatShortDate(q.createdAtIso)}</time>
                                </div>
                              </div>

                              {/* Título SIN enlace clickable */}
                              <h3 className="mt-2.5 text-lg font-extrabold leading-snug text-[#14374a] sm:text-xl">
                                {q.title}
                              </h3>

                              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[#384d57]">
                                {q.body}
                              </p>

                              {q.targetGuideId && (
                                <p className="mt-2 text-xs font-bold text-[#004d73]">
                                  Guía vinculada:{" "}
                                  <Link href={`/guias/${q.targetGuideId}`} className="underline hover:text-[#006699]">
                                    {q.targetGuideTitle ?? "Abrir guía"} →
                                  </Link>
                                </p>
                              )}

                              {q.imageUrl && (
                                <button
                                  type="button"
                                  onClick={() => setLightboxItem({ src: q.imageUrl!, title: q.title })}
                                  className="mt-3 inline-block max-w-sm overflow-hidden rounded-lg border border-[#dcd3bd] bg-[#f6f3e8] p-1 text-left"
                                >
                                  <img
                                    src={q.imageUrl}
                                    alt={q.title}
                                    className="max-h-56 w-auto rounded-sm object-contain"
                                  />
                                </button>
                              )}

                              {/* Acciones de moderación cuando aplican */}
                              {(canModerateQuestion) && (
                                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                                  {canModerateQuestion && (
                                    <button
                                      type="button"
                                      onClick={() => handlePinToggle(q.id)}
                                      className="font-extrabold text-[#385360] underline hover:text-[#004d73]"
                                    >
                                      {q.isPinned ? "Desfijar" : "📌 Fijar"}
                                    </button>
                                  )}
                                  {canModerateQuestion && hasDisciplinaryPanel && viewer?.id !== q.authorId && (
                                    <Link
                                      href={`/moderacion?user_id=${q.authorId}&area=${q.area}&source_type=foro&reason=${encodeURIComponent(`Pregunta en foro: ${q.title}`)}`}
                                      className="font-bold text-[#8a3528] underline"
                                    >
                                      Sancionar en moderación
                                    </Link>
                                  )}
                                </div>
                              )}

                              {/* RESPUESTA OFICIAL DE PRIMERA MANO */}
                              {primaryOfficial && (
                                <div className="mt-4 flex items-start gap-3 rounded-lg border border-[#b9d4e2] border-l-4 border-l-[#006699] bg-[#f2f8fb] p-3.5 sm:p-4">
                                  <div className="flex shrink-0 flex-col items-center rounded-md border border-[#cfe0e8] bg-white px-1.5 py-1 text-xs">
                                    <button
                                      type="button"
                                      onClick={() => handleAnswerVote(q.id, primaryOfficial.id, 1)}
                                      aria-label="Votar respuesta oficial útil"
                                      aria-pressed={primaryOfficial.viewerVote === 1}
                                      className={`rounded px-1.5 py-0.5 font-extrabold transition ${
                                        primaryOfficial.viewerVote === 1
                                          ? "bg-[#006699] text-white"
                                          : "text-[#486573] hover:bg-[#e6f3fa] hover:text-[#004d73]"
                                      }`}
                                    >
                                      ▲
                                    </button>
                                    <span className="my-0.5 font-extrabold text-[#14374a] tabular-nums">
                                      {primaryOfficial.score}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleAnswerVote(q.id, primaryOfficial.id, -1)}
                                      aria-label="Votar en contra de respuesta oficial"
                                      aria-pressed={primaryOfficial.viewerVote === -1}
                                      className={`rounded px-1.5 py-0.5 font-extrabold transition ${
                                        primaryOfficial.viewerVote === -1
                                          ? "bg-[#8C1D18] text-white"
                                          : "text-[#6c7b82] hover:bg-[#fae6e4] hover:text-[#8C1D18]"
                                      }`}
                                    >
                                      ▼
                                    </button>
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded bg-[#006699] px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white">
                                          ✓ Respuesta oficial
                                        </span>
                                        <span className="text-xs font-extrabold text-[#004d73]">
                                          {primaryOfficial.authorName}
                                        </span>
                                      </div>
                                      <time
                                        dateTime={primaryOfficial.createdAtIso}
                                        className="text-[11px] font-semibold text-[#5a727e]"
                                      >
                                        {formatDate(primaryOfficial.createdAtIso)}
                                      </time>
                                    </div>
                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#1d3947]">
                                      {primaryOfficial.body}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Pie de tarjeta con desplegable estilo Reddit */}
                        <div className="border-t border-dashed border-[#e4dfd0] bg-[#faf7ee] px-4 py-2.5 sm:px-6">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#4e636e]">
                              <span className="tabular-nums">
                                {voteLabel(q.votes)} · {q.answers.length}{" "}
                                {q.answers.length === 1 ? "respuesta" : "respuestas"}
                              </span>
                            </div>

                            <button
                              type="button"
                              aria-expanded={isThreadOpen}
                              onClick={() => toggleThreadOpen(q.id)}
                              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-extrabold transition ${
                                isThreadOpen
                                  ? "border-[#15394d] bg-[#15394d] text-white"
                                  : "border-[#d4ceb9] bg-white text-[#173a4c] hover:border-[#006699] hover:bg-[#eef5f8] hover:text-[#004d73]"
                              }`}
                            >
                              <svg
                                viewBox="0 0 20 20"
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.9"
                                aria-hidden="true"
                              >
                                <path d="M16.5 9.8a6 6 0 0 1-6.5 6 7 7 0 0 1-2.8-.6L3.5 16.5l1.2-3.2A5.7 5.7 0 0 1 3.5 9.8a6 6 0 0 1 6.5-6 6 6 0 0 1 6.5 6Z" />
                              </svg>
                              <span>
                                {isThreadOpen
                                  ? "Ocultar historial"
                                  : sortedThread.length > 0
                                    ? `Desplegar historial (${sortedThread.length} ${sortedThread.length === 1 ? "respuesta" : "respuestas"})`
                                    : "Responder en el hilo"}
                              </span>
                            </button>
                          </div>

                          {/* Hilo desplegable estilo Reddit */}
                          {isThreadOpen && (
                            <div className="mt-4 space-y-4 border-t border-[#e5e0d1] pt-4">
                              {sortedThread.length > 0 ? (
                                <div className="space-y-3 border-l-2 border-[#cfc9b4] pl-3 sm:pl-4">
                                  {sortedThread.map((ans) => (
                                    <div
                                      key={ans.id}
                                      className="flex items-start gap-3 rounded-lg border border-[#e2ddd0] bg-white p-3.5"
                                    >
                                      {/* Controles de voto estilo Reddit */}
                                      <div className="flex shrink-0 flex-col items-center rounded-md border border-[#e3dfd2] bg-[#f8f6ee] px-1.5 py-1 text-xs">
                                        <button
                                          type="button"
                                          onClick={() => handleAnswerVote(q.id, ans.id, 1)}
                                          aria-label="Votar respuesta a favor"
                                          aria-pressed={ans.viewerVote === 1}
                                          className={`rounded px-1.5 py-0.5 font-extrabold transition ${
                                            ans.viewerVote === 1
                                              ? "bg-[#006699] text-white"
                                              : "text-[#486573] hover:bg-[#e6f3fa] hover:text-[#004d73]"
                                          }`}
                                        >
                                          ▲
                                        </button>
                                        <span
                                          className={`my-0.5 font-extrabold tabular-nums ${
                                            ans.score > 0
                                              ? "text-[#004d73]"
                                              : ans.score < 0
                                                ? "text-[#8C1D18]"
                                                : "text-[#455a64]"
                                          }`}
                                        >
                                          {ans.score}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleAnswerVote(q.id, ans.id, -1)}
                                          aria-label="Votar respuesta en contra"
                                          aria-pressed={ans.viewerVote === -1}
                                          className={`rounded px-1.5 py-0.5 font-extrabold transition ${
                                            ans.viewerVote === -1
                                              ? "bg-[#8C1D18] text-white"
                                              : "text-[#6c7b82] hover:bg-[#fae6e4] hover:text-[#8C1D18]"
                                          }`}
                                        >
                                          ▼
                                        </button>
                                      </div>

                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="grid h-6 w-6 place-items-center rounded bg-[#e8f2f6] text-[11px] font-extrabold text-[#004d73]">
                                              {ans.authorName.slice(0, 1)}
                                            </span>
                                            <span className="text-xs font-extrabold text-[#16384a]">
                                              {ans.authorName}
                                            </span>
                                            <span
                                              className={`rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                                                ans.official
                                                  ? "bg-[#006699] text-white"
                                                  : ans.authorRole === "profesor"
                                                    ? "bg-[#ebf7f3] text-[#165745]"
                                                    : "bg-[#f3f1e8] text-[#4e616b]"
                                              }`}
                                            >
                                              {roleBadge(ans.authorRole, ans.official, ans.authorArea)}
                                            </span>
                                          </div>
                                          <time
                                            dateTime={ans.createdAtIso}
                                            className="text-[11px] font-semibold text-[#64757e]"
                                          >
                                            {formatDate(ans.createdAtIso)}
                                          </time>
                                        </div>

                                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#2d434e]">
                                          {ans.body}
                                        </p>

                                        {(canModerateQuestion && !ans.official) ||
                                        (canModerateQuestion && hasDisciplinaryPanel && viewer?.id !== ans.authorId) ? (
                                          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
                                            {canModerateQuestion && !ans.official && (
                                              <button
                                                type="button"
                                                onClick={() => handleMarkOfficial(q.id, ans.id)}
                                                className="rounded border border-[#006699] bg-white px-2.5 py-1 font-extrabold text-[#006699] hover:bg-[#e6f3fa]"
                                              >
                                                Marcar como respuesta oficial
                                              </button>
                                            )}
                                            {canModerateQuestion && hasDisciplinaryPanel && viewer?.id !== ans.authorId && (
                                              <Link
                                                href={`/moderacion?user_id=${ans.authorId}&area=${q.area}&source_type=foro&reason=${encodeURIComponent(`Respuesta en «${q.title}»: ${ans.body.slice(0, 120)}`)}`}
                                                className="font-bold text-[#8a3528] underline"
                                              >
                                                Sancionar
                                              </Link>
                                            )}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="border-l-2 border-[#cfc9b4] pl-3 text-sm text-[#586d77]">
                                  Aún no hay respuestas de la comunidad en este hilo.
                                </p>
                              )}

                              {/* Formulario en línea para ayudar a otros alumnos */}
                              {viewer ? (
                                <form
                                  onSubmit={(e) => handleInlineReplySubmit(q.id, e)}
                                  className="space-y-2.5 rounded-lg border border-[#dcd8c9] bg-white p-3.5"
                                >
                                  <label
                                    htmlFor={`reply-${q.id}`}
                                    className="block text-xs font-extrabold uppercase tracking-wide text-[#385360]"
                                  >
                                    Aportar respuesta
                                  </label>
                                  <textarea
                                    id={`reply-${q.id}`}
                                    value={replyDrafts[q.id] ?? ""}
                                    onChange={(e) =>
                                      setReplyDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))
                                    }
                                    minLength={10}
                                    maxLength={5000}
                                    required
                                    placeholder="Comparte qué ventanilla, horario, formato o paso te funcionó."
                                    className={`${input} min-h-20 rounded-lg border-[#d5d2c5] bg-[#fffdf7] text-sm`}
                                  />
                                  {replyErrors[q.id] && (
                                    <p className="text-xs font-bold text-[#8C1D18]">{replyErrors[q.id]}</p>
                                  )}
                                  <div className="flex justify-end">
                                    <button
                                      type="submit"
                                      disabled={Boolean(replyPending[q.id])}
                                      className={`${btn} rounded-lg px-4 py-2 text-xs`}
                                    >
                                      {replyPending[q.id] ? "Publicando…" : "Publicar respuesta"}
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#dcd8c9] bg-white px-4 py-3 text-xs text-[#4e636e]">
                                  <span>Inicia sesión con tu correo institucional para responder o votar.</span>
                                  <Link href="/entrar" className={`${btnGhost} rounded-lg px-3 py-1.5 text-xs`}>
                                    Entrar
                                  </Link>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-sm border border-[#d6d3c6] bg-[#fffdf7] p-6 text-sm text-[#5f6e78]">
                  No encontramos dudas con esos filtros.
                </p>
              )}
            </section>
          )}
        </div>

        {/* Directorio de Ventanillas */}
        <aside className="space-y-5 lg:col-span-4 lg:sticky lg:top-24">
          {directoryRooms.length > 0 && (
            <section
              className="rounded-sm border border-[#d6d3c6] border-t-4 border-t-[#004d73] bg-[#fffdf7] p-5 shadow-[0_2px_0_rgba(23,49,66,0.04)]"
              aria-labelledby="directory-heading"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 id="directory-heading" className="text-lg font-extrabold text-[#14374a]">
                  Ventanillas en ESCOM
                </h2>
                <Link href="/mapa" className="text-xs font-extrabold text-[#005a87] hover:underline">
                  Mapa 3D →
                </Link>
              </div>
              <ul className="mt-3.5 space-y-3">
                {directoryRooms.map((room) => (
                  <li
                    key={room.code}
                    className="rounded-lg border border-[#e2dfd3] bg-white p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-extrabold text-[#14374a]">{room.name}</span>
                      <span className="rounded border border-[#c3d9e4] bg-[#eaf4f8] px-2 py-0.5 text-[11px] font-extrabold text-[#004d73]">
                        {room.code}
                      </span>
                    </div>
                    {room.description && (
                      <p className="mt-1.5 text-xs leading-relaxed text-[#4c616c]">
                        {room.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {showQuestionForm && (
        <FormDialog title="Nueva publicación en el foro" onClose={() => setShowQuestionForm(false)}>
          {viewer ? (
            <QuestionForm
              office={office}
              action={publishQuestion}
              defaultArea={areaFilter !== "all" ? areaFilter : undefined}
              guides={guides.map((g) => ({ id: g.id, title: g.title, area: g.area }))}
              onSelectQuestion={jumpToQuestion}
            />
          ) : (
            <div className="space-y-4 text-sm text-[#4f626c]">
              <p>Entra con tu correo institucional para publicar.</p>
              <Link href="/entrar" className={btn}>Entrar</Link>
            </div>
          )}
        </FormDialog>
      )}

      {/* Visor de imagen adjunta en dudas */}
      {lightboxItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightboxItem.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="relative max-h-[92vh] max-w-4xl overflow-hidden rounded-sm border border-white/15 bg-[#0b1820] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3 text-white">
              <p className="truncate text-sm font-extrabold">{lightboxItem.title}</p>
              <button
                type="button"
                aria-label="Cerrar imagen"
                onClick={() => setLightboxItem(null)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-sm font-bold text-white hover:bg-white/20"
              >
                ✕
              </button>
            </div>
            <div className="flex max-h-[82vh] items-center justify-center overflow-auto p-3">
              <img
                src={lightboxItem.src}
                alt={lightboxItem.title}
                className="max-h-[78vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
