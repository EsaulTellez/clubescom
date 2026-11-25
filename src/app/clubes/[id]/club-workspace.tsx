"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AttendButton } from "@/components/attend-button";
import { FormDialog } from "@/components/form-dialog";
import type { DirectoryUserOption } from "@/components/searchable-user-picker";
import { btn, btnGhost, card, input } from "@/lib/ui";
import {
  ClubEditForm,
  ClubEventForm,
  ClubLogoForm,
  ClubPostForm,
  DecisionButtons,
  DeleteClubEventButton,
  DeleteClubPostButton,
  JoinButton,
  RemoveMemberButton,
} from "../forms";
import { kindLabel } from "../format";
import {
  parseApplicationAnswers,
  type ClubApplicationAnswer,
  type ClubJoinQuestion,
} from "../questions";

export type ClubDetailData = {
  id: string;
  name: string;
  kind: string;
  description: string;
  schedule: string | null;
  logo_url: string | null;
  art_url: string | null;
  external_links: string | null;
  contact_email: string | null;
  contact_info: string | null;
  join_requirements: string | null;
  join_questions: ClubJoinQuestion[];
  leader_id: string | null;
  advisor_id: string | null;
  active: boolean;
  leader_name: string | null;
  advisor_name: string | null;
};

export type ClubContactDirectory = {
  leader_name: string | null;
  leader_email: string | null;
  advisor_name: string | null;
  advisor_email: string | null;
  advisor_room: string | null;
};

export type ClubPendingRow = {
  user_id: string;
  name: string;
  application_note: string | null;
  application_answers: ClubApplicationAnswer[];
};

export type ClubMemberRow = { id: string; name: string; role: string };

export type ClubPostRow = {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  author_name: string;
  created_label: string;
};

export type ClubEventItem = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  starts_label: string;
  day: string;
  month: string;
  approval_status: string;
  image_url: string | null;
  attendees_count: number;
  user_attending: boolean;
};

export type ClubMetricsData = {
  accepted_members: number;
  pending_requests: number;
  rejected_requests: number;
  total_posts: number;
  posts_30d: number;
  approved_events: number;
  pending_events: number;
  total_attendees: number;
  acceptance_rate: number | null;
  avg_attendance: string;
};

export type ClubEventAttendeeGroup = {
  eventId: string;
  title: string;
  startsLabel: string;
  location: string;
  approvalStatus: string;
  attendees: { id: string; name: string; role: string }[];
};

type ClubTab =
  | "publicaciones"
  | "eventos"
  | "integrantes"
  | "acerca"
  | "solicitudes"
  | "metricas"
  | "configuracion";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function ClubWorkspace({
  club,
  contactDirectory,
  membership,
  isAuthenticated,
  isAreaStaff,
  areaBadgeLabel,
  manages,
  canViewFeed,
  canModerate,
  canRequest,
  canPost,
  canCreateEvent,
  canEditClub,
  members,
  posts,
  events,
  pendingRequests,
  metrics,
  eventAttendeeGroups,
  students,
  professors,
}: {
  club: ClubDetailData;
  contactDirectory: ClubContactDirectory | null;
  membership: string | null;
  isAuthenticated: boolean;
  isAreaStaff: boolean;
  areaBadgeLabel: string | null;
  manages: boolean;
  canViewFeed: boolean;
  canModerate: boolean;
  canRequest: boolean;
  canPost: boolean;
  canCreateEvent: boolean;
  canEditClub: boolean;
  members: ClubMemberRow[];
  posts: ClubPostRow[];
  events: ClubEventItem[];
  pendingRequests: ClubPendingRow[];
  metrics: ClubMetricsData | null;
  eventAttendeeGroups: ClubEventAttendeeGroup[];
  students: DirectoryUserOption[];
  professors: DirectoryUserOption[];
}) {
  const [activeTab, setActiveTab] = useState<ClubTab>("publicaciones");
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ClubEventItem | null>(null);
  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);

  const hasJoinFilter = club.join_questions.length > 0 || Boolean(club.join_requirements?.trim());

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLocaleLowerCase("es-MX");
    if (!q) return members;
    return members.filter((m) =>
      `${m.name} ${m.role}`.toLocaleLowerCase("es-MX").includes(q),
    );
  }, [members, memberSearch]);

  const tabs: { id: ClubTab; label: string; badge?: number; alert?: boolean }[] = [
    { id: "publicaciones", label: "Publicaciones", badge: posts.length },
    {
      id: "eventos",
      label: "Eventos",
      badge: events.length,
    },
    { id: "integrantes", label: "Integrantes", badge: members.length },
    { id: "acerca", label: "Acerca y contacto" },
    ...(canModerate && club.active
      ? [{ id: "solicitudes" as const, label: "Solicitudes", badge: pendingRequests.length, alert: pendingRequests.length > 0 }]
      : []),
    ...(canModerate && metrics ? [{ id: "metricas" as const, label: "Métricas" }] : []),
    ...(canEditClub ? [{ id: "configuracion" as const, label: "Configuración" }] : []),
  ];

  return (
    <div className="mx-auto max-w-[1240px] space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/clubes" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#006699] hover:underline">
          ← Directorio de clubes
        </Link>
        {!club.active && (
          <span className="rounded border border-[#e3b8b4] bg-[#fdf2f1] px-3 py-1 text-xs font-extrabold text-[#8c2925]">
            Club inactivo
          </span>
        )}
      </div>

      {/* CABECERA FIJA (STICKY) CON IDENTIDAD DEL CLUB, ACCIONES Y PESTAÑAS */}
      <header className="sticky top-[66px] z-20 overflow-hidden rounded-md border border-[#c1ccc3] border-t-4 border-t-[#165b47] bg-[#fffdf7]/95 shadow-[0_6px_20px_rgba(20,44,60,0.08)] backdrop-blur-sm lg:top-[110px]">
        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-3.5">
            {/* Logo del club + acción directa para cambiarlo */}
            <div className="relative shrink-0">
              {club.art_url ? (
                <img
                  src={club.art_url}
                  alt={`Logo de ${club.name}`}
                  className="h-14 w-14 rounded-md border border-[#d6ddd7] bg-[#f1efe5] object-contain sm:h-16 sm:w-16"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="grid h-14 w-14 place-items-center rounded-md border border-[#d6ddd7] bg-[#e6ede6] text-2xl font-extrabold text-[#21483f] sm:h-16 sm:w-16"
                >
                  {club.name.replace("Club de ", "").slice(0, 1)}
                </span>
              )}
              {canEditClub && (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label="Cambiar logo del club"
                  title="Cambiar logo"
                  onClick={() => setLogoDialogOpen(true)}
                  className="absolute -bottom-1.5 -right-1.5 grid h-7 w-7 place-items-center rounded-full border border-[#b9ccc3] bg-white text-[#165b47] shadow-xs transition hover:border-[#165b47] hover:bg-[#165b47] hover:text-white"
                >
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h1.6l1-1.5h4.8l1 1.5H15a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 15 16H5a1.5 1.5 0 0 1-1.5-1.5v-7Z" strokeLinejoin="round" />
                    <circle cx="10" cy="11" r="2.5" />
                  </svg>
                </button>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#1f624e]">
                  {kindLabel(club.kind)}
                </span>
                {manages && (
                  <span className="rounded bg-[#e6f4f0] px-2 py-0.5 text-[11px] font-bold text-[#145542]">
                    Moderador del club
                  </span>
                )}
                {!manages && areaBadgeLabel && (
                  <span className="rounded bg-[#eaf3f8] px-2 py-0.5 text-[11px] font-bold text-[#144c69]">
                    {areaBadgeLabel}
                  </span>
                )}
              </div>
              <h1 className="truncate text-xl font-extrabold tracking-tight text-[#142c3c] sm:text-2xl">
                {club.name}
              </h1>
              <p className="text-xs font-medium text-[#52656b]">
                {members.length} {members.length === 1 ? "integrante" : "integrantes"} · {posts.length} {posts.length === 1 ? "publicación" : "publicaciones"} · {events.length} {events.length === 1 ? "evento próximo" : "eventos próximos"}
              </p>
            </div>
          </div>

          {/* Botones de acción en el cabezal fijo */}
          <div className="flex flex-wrap items-center gap-2">
            {canPost && (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setPostDialogOpen(true)}
                className={btn}
              >
                + Nueva publicación
              </button>
            )}
            {canCreateEvent && (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setEventDialogOpen(true)}
                className={btnGhost}
              >
                + Nuevo evento
              </button>
            )}
            {canRequest && !hasJoinFilter && <JoinButton clubId={club.id} />}
            {canRequest && hasJoinFilter && (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setJoinDialogOpen(true)}
                className={btn}
              >
                Solicitar ingreso
              </button>
            )}
            {!isAuthenticated && club.active && (
              <Link href="/entrar" className={btn}>
                Iniciar sesión para unirme
              </Link>
            )}
            {membership === "pendiente" && (
              <span className="rounded border border-[#e3c987] bg-[#fff5d8] px-3 py-1.5 text-xs font-extrabold text-[#7d5509]">
                Solicitud pendiente
              </span>
            )}
            {membership === "aceptada" && !manages && (
              <span className="rounded border border-[#b8dccb] bg-[#e6f5ed] px-3 py-1.5 text-xs font-extrabold text-[#165b47]">
                ✓ Integrante
              </span>
            )}
          </div>
        </div>

        {/* Barra de pestañas fija */}
        <nav
          role="tablist"
          aria-label="Secciones del club"
          className="flex flex-nowrap items-center gap-1 overflow-x-auto border-t border-[#e5e8e3] bg-[#faf9f3] px-4 sm:px-6"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeTab === item.id}
              onClick={() => setActiveTab(item.id)}
              className="catalog-tab shrink-0 whitespace-nowrap"
            >
              <span>{item.label}</span>
              {typeof item.badge === "number" && (
                <small
                  className={
                    item.alert
                      ? "rounded bg-[#faecc3] px-1.5 py-0.5 font-extrabold text-[#7d5509]"
                      : ""
                  }
                >
                  {item.badge}
                </small>
              )}
            </button>
          ))}
        </nav>
      </header>

      {membership === "rechazada" && canRequest && (
        <p className="rounded-md border border-[#e6bfb9] bg-[#fdf3f2] px-4 py-2.5 text-xs font-semibold text-[#8c2925]">
          Tu solicitud anterior no fue aceptada; puedes volver a postularte cuando gustes.
        </p>
      )}

      {/* PESTAÑA: PUBLICACIONES */}
      {activeTab === "publicaciones" && (
        <section className="space-y-4">
          {!canViewFeed ? (
            <div className={`${card} py-10 text-center`}>
              <h2 className="text-lg font-extrabold text-[#142c3c]">Publicaciones internas para integrantes</h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-[#5d707a]">
                Únete al club para consultar anuncios, material de sesiones y actividades internas.
              </p>
              {canRequest && (
                <div className="mt-4 flex justify-center">
                  {hasJoinFilter ? (
                    <button type="button" onClick={() => setJoinDialogOpen(true)} className={btn}>
                      Responder filtro y unirme
                    </button>
                  ) : (
                    <JoinButton clubId={club.id} />
                  )}
                </div>
              )}
            </div>
          ) : posts.length === 0 ? (
            <div className={`${card} border-dashed py-10 text-center`}>
              <h2 className="text-base font-extrabold text-[#142c3c]">Todavía no hay publicaciones</h2>
              <p className="mt-1 text-sm text-[#5d707a]">Las novedades y avisos del club aparecerán aquí.</p>
              {canPost && (
                <button type="button" onClick={() => setPostDialogOpen(true)} className={`${btn} mt-4`}>
                  + Crear primera publicación
                </button>
              )}
            </div>
          ) : (
            <div className="mx-auto grid max-w-3xl gap-4">
              {posts.map((post) => (
                <article
                  key={post.id}
                  className="overflow-hidden rounded-xl border border-[#d6e2dd] bg-white shadow-[0_2px_10px_rgba(22,91,71,0.05)] transition hover:border-[#a7c8bc]"
                >
                  <div className="flex items-center gap-3 border-b border-[#eef3f1] px-5 py-3.5">
                    {club.art_url ? (
                      <img src={club.art_url} alt="" className="h-9 w-9 shrink-0 rounded-full border border-[#d5e0db] bg-[#f4f2ea] object-cover" />
                    ) : (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e3f3ed] text-xs font-black text-[#145542]">
                        {initials(post.author_name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-[#153545]">{post.author_name}</p>
                      <p className="text-xs text-[#647882]">{post.created_label}</p>
                    </div>
                    {canModerate && <DeleteClubPostButton clubId={club.id} postId={post.id} />}
                  </div>
                  <div className="space-y-3 p-5">
                    <h2 className="text-lg font-extrabold tracking-tight text-[#142c3c]">{post.title}</h2>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#3b525f]">{post.body}</p>
                    {post.image_url && (
                      <button
                        type="button"
                        onClick={() => setLightbox({ src: post.image_url!, title: post.title })}
                        className="block w-full cursor-zoom-in overflow-hidden rounded-lg border border-[#d7e2e7] bg-[#0f1f29]"
                      >
                        <img src={post.image_url} alt={post.title} className="max-h-[26rem] w-full object-contain" />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* PESTAÑA: EVENTOS */}
      {activeTab === "eventos" && (
        <section className="space-y-5">
          {events.length === 0 ? (
            <div className={`${card} border-dashed py-10 text-center`}>
              <h2 className="text-base font-extrabold text-[#142c3c]">No hay eventos próximos publicados</h2>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {canCreateEvent && (
                  <button type="button" onClick={() => setEventDialogOpen(true)} className={btn}>
                    + Publicar evento
                  </button>
                )}
                <Link href="/eventos" className={btnGhost}>
                  Ver cartelera general
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {events.map((event) => (
                <article
                  key={event.id}
                  className="flex flex-col overflow-hidden rounded-md border-2 border-[#1b3647] bg-[#fffdf7] shadow-[3px_3px_0_rgba(23,49,66,0.09)]"
                >
                  <div className="flex items-center justify-between gap-2 bg-[#142c3c] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wider text-[#f5f1e4]">
                    <span className="truncate">⌖ {event.location}</span>
                    <span className="shrink-0 font-mono text-[#e3b341]">{event.starts_label}</span>
                  </div>
                  {event.image_url && (
                    <button
                      type="button"
                      onClick={() => setLightbox({ src: event.image_url!, title: event.title })}
                      className="cursor-zoom-in bg-[#10202b]"
                    >
                      <img src={event.image_url} alt={event.title} className="h-44 w-full object-contain" />
                    </button>
                  )}
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex w-12 shrink-0 flex-col items-center rounded border-2 border-[#142c3c] bg-[#f7f2e3] py-1.5 text-center leading-none">
                        <span className="text-[9px] font-extrabold uppercase text-[#8c5e0f]">{event.month}</span>
                        <span className="mt-0.5 font-mono text-xl font-black text-[#142c3c]">{event.day}</span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-serif text-lg font-bold leading-snug text-[#142c3c]">{event.title}</h3>
                        {event.description && (
                          <p className="mt-1.5 text-xs leading-relaxed text-[#4b5f6a]">{event.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-auto pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-dashed border-[#cbc3ae] pt-3">
                        <AttendButton
                          eventKind="club"
                          eventId={event.id}
                          initialAttending={event.user_attending}
                          initialCount={event.attendees_count}
                          isAuthenticated={isAuthenticated}
                          compact
                        />
                        {canModerate && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingEvent(event)}
                              className={btnGhost}
                            >
                              Editar
                            </button>
                            <DeleteClubEventButton clubId={club.id} eventId={event.id} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* PESTAÑA: INTEGRANTES */}
      {activeTab === "integrantes" && (
        <section className={`${card} space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-[#142c3c]">
              Integrantes ({members.length})
            </h2>
            {members.length > 6 && (
              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Buscar integrante…"
                aria-label="Buscar integrante del club"
                className={`${input} mt-0 max-w-xs`}
              />
            )}
          </div>
          {filteredMembers.length === 0 ? (
            <p className="text-sm text-[#5d707a]">No se encontraron integrantes.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMembers.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-[#e1e6e4] bg-[#fbfaf6] px-3.5 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e4f2ee] text-xs font-extrabold text-[#145542]">
                      {initials(member.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#142c3c]">{member.name}</p>
                      <p className="text-xs font-medium text-[#5c717c]">{member.role}</p>
                    </div>
                  </div>
                  {canModerate && member.id !== club.leader_id && member.id !== club.advisor_id && (
                    <RemoveMemberButton clubId={club.id} userId={member.id} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* PESTAÑA: ACERCA Y CONTACTO */}
      {activeTab === "acerca" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className={`${card} space-y-4 lg:col-span-2`}>
            <h2 className="text-lg font-extrabold text-[#142c3c]">Descripción del club</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#3d5360]">{club.description}</p>
            {club.join_requirements && (
              <div className="rounded-md border border-[#d6e4ec] bg-[#f4f9fc] p-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#005980]">
                  Requisitos / indicaciones de ingreso
                </h3>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-[#2a4554]">{club.join_requirements}</p>
              </div>
            )}
          </section>

          <section className={`${card} space-y-4`}>
            <h2 className="text-base font-extrabold text-[#142c3c]">Ficha e información de contacto</h2>
            <dl className="space-y-3 text-xs">
              <div>
                <dt className="font-bold uppercase tracking-wider text-[#6a7d87]">Horario y sede</dt>
                <dd className="mt-1 text-sm font-semibold text-[#1c3b4c]">{club.schedule?.trim() || "Por anunciar"}</dd>
              </div>
              <div>
                <dt className="font-bold uppercase tracking-wider text-[#6a7d87]">Alumno moderador</dt>
                <dd className="mt-1 text-sm font-semibold text-[#1c3b4c]">{club.leader_name || "Por asignar"}</dd>
              </div>
              <div>
                <dt className="font-bold uppercase tracking-wider text-[#6a7d87]">Profesor coordinador</dt>
                <dd className="mt-1 text-sm font-semibold text-[#1c3b4c]">{club.advisor_name || "Por asignar"}</dd>
              </div>
              {club.contact_email && (
                <div>
                  <dt className="font-bold uppercase tracking-wider text-[#6a7d87]">Correo del club</dt>
                  <dd className="mt-1 break-all font-semibold text-[#006699]">{club.contact_email}</dd>
                </div>
              )}
              {club.contact_info && (
                <div>
                  <dt className="font-bold uppercase tracking-wider text-[#6a7d87]">Canal / lugar</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm text-[#2c4756]">{club.contact_info}</dd>
                </div>
              )}
              {club.external_links && (
                <div>
                  <dt className="font-bold uppercase tracking-wider text-[#6a7d87]">Enlaces externos</dt>
                  <dd className="mt-1 break-all font-semibold text-[#006699]">{club.external_links}</dd>
                </div>
              )}
              {contactDirectory && (
                <div className="rounded-md border border-[#cfe0ea] bg-[#f4f9fc] p-3">
                  <dt className="font-extrabold uppercase tracking-wider text-[#004d73]">
                    Contacto institucional de titulares
                  </dt>
                  <dd className="mt-2 space-y-1 text-[#213e4f]">
                    {contactDirectory.leader_email && (
                      <p><strong>Alumno:</strong> {contactDirectory.leader_email}</p>
                    )}
                    {contactDirectory.advisor_email && (
                      <p><strong>Profesor:</strong> {contactDirectory.advisor_email}</p>
                    )}
                    {contactDirectory.advisor_room && (
                      <p><strong>Cubículo:</strong> {contactDirectory.advisor_room}</p>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      )}

      {/* PESTAÑA: SOLICITUDES DE INGRESO */}
      {activeTab === "solicitudes" && canModerate && club.active && (
        <section className={`${card} space-y-4`}>
          <h2 className="text-lg font-extrabold text-[#142c3c]">
            Solicitudes de ingreso ({pendingRequests.length})
          </h2>
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-[#5d707a]">No hay solicitudes pendientes por revisar.</p>
          ) : (
            <ul className="divide-y divide-[#e6ecea]">
              {pendingRequests.map((person) => {
                const answers = parseApplicationAnswers(person.application_answers);
                return (
                  <li
                    key={person.user_id}
                    className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm font-extrabold text-[#142c3c]">{person.name}</p>
                      {answers.length > 0 && (
                        <dl className="space-y-1.5 rounded-md border border-[#d9e7ef] bg-[#f8fbfd] p-3 text-xs">
                          {answers.map((a) => (
                            <div key={a.questionId}>
                              <dt className="font-bold text-[#355366]">{a.prompt}</dt>
                              <dd className="whitespace-pre-wrap text-[#1d3948]">{a.answer}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {person.application_note && (
                        <p className="text-xs text-[#526170]">
                          <strong>Nota adicional:</strong> {person.application_note}
                        </p>
                      )}
                    </div>
                    <DecisionButtons clubId={club.id} userId={person.user_id} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* PESTAÑA: MÉTRICAS */}
      {activeTab === "metricas" && canModerate && metrics && (
        <section className={`${card} space-y-5`}>
          <h2 className="text-lg font-extrabold text-[#142c3c]">Métricas y asistencia a eventos</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-[#dce8ef] bg-[#f7fbfe] p-3.5">
              <p className="text-[11px] font-bold uppercase text-[#5c7280]">Integrantes totales</p>
              <p className="mt-1 font-mono text-2xl font-extrabold text-[#15394d]">{members.length}</p>
              <p className="text-xs text-[#5c7280]">{metrics.accepted_members} membresías aceptadas</p>
            </div>
            <div className="rounded-md border border-[#dce8ef] bg-[#f7fbfe] p-3.5">
              <p className="text-[11px] font-bold uppercase text-[#5c7280]">Solicitudes</p>
              <p className="mt-1 font-mono text-2xl font-extrabold text-[#15394d]">{metrics.pending_requests} pend.</p>
              <p className="text-xs text-[#5c7280]">
                {metrics.acceptance_rate !== null
                  ? `${metrics.acceptance_rate}% aceptación (${metrics.rejected_requests} rech.)`
                  : `${metrics.rejected_requests} rechazadas`}
              </p>
            </div>
            <div className="rounded-md border border-[#dce8ef] bg-[#f7fbfe] p-3.5">
              <p className="text-[11px] font-bold uppercase text-[#5c7280]">Publicaciones</p>
              <p className="mt-1 font-mono text-2xl font-extrabold text-[#15394d]">{metrics.total_posts}</p>
              <p className="text-xs text-[#5c7280]">{metrics.posts_30d} en últimos 30 días</p>
            </div>
            <div className="rounded-md border border-[#dce8ef] bg-[#f7fbfe] p-3.5">
              <p className="text-[11px] font-bold uppercase text-[#5c7280]">Registros Asistiré</p>
              <p className="mt-1 font-mono text-2xl font-extrabold text-[#006699]">{metrics.total_attendees}</p>
              <p className="text-xs text-[#5c7280]">
                {metrics.approved_events} publicados · prom. {metrics.avg_attendance}
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t border-[#e5edf2] pt-4">
            <h3 className="text-sm font-extrabold text-[#142c3c]">Asistencia por evento</h3>
            {eventAttendeeGroups.length === 0 ? (
              <p className="text-sm text-[#667085]">Este club aún no tiene eventos registrados.</p>
            ) : (
              <div className="space-y-3">
                {eventAttendeeGroups.map((group) => (
                  <article key={group.eventId} className="rounded-md border border-[#dce8ef] bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[#142c3c]">{group.title}</p>
                        <p className="text-xs text-[#697e8a]">
                          {group.startsLabel} · {group.location}
                          {group.approvalStatus !== "aprobado" ? ` · ${group.approvalStatus}` : ""}
                        </p>
                      </div>
                      <span className="rounded bg-[#e6f3fa] px-2.5 py-1 text-xs font-extrabold text-[#004d73]">
                        {group.attendees.length} {group.attendees.length === 1 ? "asistente" : "asistentes"}
                      </span>
                    </div>
                    {group.attendees.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {group.attendees.map((att) => (
                          <li key={att.id} className="rounded border border-[#d6e4eb] bg-[#f7fbfe] px-2.5 py-1 text-xs text-[#264a60]">
                            {att.name} ({att.role})
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* PESTAÑA: CONFIGURACIÓN */}
      {activeTab === "configuracion" && canEditClub && (
        <section className={`${card} max-w-3xl space-y-4`}>
          <h2 className="text-lg font-extrabold text-[#142c3c]">Configuración del club</h2>
          <ClubEditForm
            club={club}
            isStaff={isAreaStaff}
            students={students}
            professors={professors}
          />
        </section>
      )}

      {/* DIÁLOGO: NUEVA PUBLICACIÓN */}
      {postDialogOpen && canPost && (
        <FormDialog
          title="Nueva publicación"
          kicker={club.name}
          accent="teal"
          size="lg"
          onClose={() => setPostDialogOpen(false)}
        >
          <ClubPostForm
            clubId={club.id}
            onSuccess={() => setPostDialogOpen(false)}
            onCancel={() => setPostDialogOpen(false)}
          />
        </FormDialog>
      )}

      {/* DIÁLOGO: NUEVO EVENTO */}
      {eventDialogOpen && canCreateEvent && (
        <FormDialog
          title="Publicar evento del club"
          kicker={club.name}
          accent="amber"
          size="lg"
          onClose={() => setEventDialogOpen(false)}
        >
          <ClubEventForm
            clubId={club.id}
            onSuccess={() => setEventDialogOpen(false)}
            onCancel={() => setEventDialogOpen(false)}
          />
        </FormDialog>
      )}

      {/* DIÁLOGO: EDITAR EVENTO */}
      {editingEvent && canModerate && (
        <FormDialog
          title="Editar evento del club"
          kicker={club.name}
          accent="amber"
          size="lg"
          onClose={() => setEditingEvent(null)}
        >
          <ClubEventForm
            clubId={club.id}
            initialEvent={{
              id: editingEvent.id,
              title: editingEvent.title,
              description: editingEvent.description,
              location: editingEvent.location,
              startsAt: editingEvent.starts_at,
              endsAt: editingEvent.ends_at,
            }}
            onSuccess={() => setEditingEvent(null)}
            onCancel={() => setEditingEvent(null)}
          />
        </FormDialog>
      )}

      {/* DIÁLOGO: CAMBIAR LOGO */}
      {logoDialogOpen && canEditClub && (
        <FormDialog
          title="Cambiar logo del club"
          kicker={club.name}
          accent="teal"
          size="md"
          onClose={() => setLogoDialogOpen(false)}
        >
          <ClubLogoForm
            clubId={club.id}
            currentLogoUrl={club.logo_url}
            onSuccess={() => setLogoDialogOpen(false)}
            onCancel={() => setLogoDialogOpen(false)}
          />
        </FormDialog>
      )}

      {/* DIÁLOGO: SOLICITUD CON FILTRO DE INGRESO */}
      {joinDialogOpen && canRequest && (
        <FormDialog
          title={`Solicitar ingreso a ${club.name}`}
          kicker="Primer filtro del club"
          accent="teal"
          size="lg"
          onClose={() => setJoinDialogOpen(false)}
        >
          <JoinButton
            clubId={club.id}
            joinRequirements={club.join_requirements}
            joinQuestions={club.join_questions}
          />
        </FormDialog>
      )}

      {/* LIGHTBOX */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.title}
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-4xl overflow-hidden rounded-md border border-[#1b3647] bg-[#fffdf7] p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between gap-4 px-1">
              <p className="truncate text-sm font-extrabold text-[#142c3c]">{lightbox.title}</p>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="rounded border border-[#cfc8b6] px-2.5 py-1 text-xs font-extrabold text-[#142c3c]"
              >
                Cerrar ✕
              </button>
            </div>
            <img src={lightbox.src} alt={lightbox.title} className="max-h-[80vh] w-full rounded bg-[#0b1922] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
