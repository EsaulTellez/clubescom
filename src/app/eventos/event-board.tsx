"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { createClubEvent } from "../clubes/actions";
import { ClubEventForm, DeleteClubEventButton } from "../clubes/forms";
import { AttendButton } from "@/components/attend-button";
import { FormDialog } from "@/components/form-dialog";
import { ImageUploadField } from "@/components/image-upload-field";
import { SubmitButton } from "@/components/loading-ui";
import {
  eventDateKey,
  eventDaySpan,
  eventDaysInMonth,
  eventIntersectsDayRange,
  monthDayBounds,
  MX_TIME_ZONE,
} from "@/lib/event-dates";
import { btn, btnGhost, card, input, label } from "@/lib/ui";
import { deleteSpaceEvent, reviewSpaceEvent } from "../espacios/actions";
import { SpaceEventForm } from "../espacios/forms";

type EventItem = {
  id: string;
  eventKind: "space" | "club";
  spaceId?: string | null;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  spaceName: string;
  location?: string | null;
  building: string | null;
  speaker?: string | null;
  isPublic?: boolean;
  clubId?: string | null;
  clubName?: string | null;
  imageUrl?: string | null;
  attendeesCount: number;
  viewerAttending: boolean;
  canManageEvent?: boolean;
};

type Space = {
  id: string;
  name: string;
  kind: string;
  building: string | null;
  description: string | null;
};

const TZ = MX_TIME_ZONE;

function keyDate(date: Date) {
  return eventDateKey(date);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date(Date.UTC(year, month - 1, 15)));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function moveMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function time(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(new Date(value));
}

const programDate = new Intl.DateTimeFormat("es-MX", {
  weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ,
});

function dateStubParts(iso: string) {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    weekday: "short",
    timeZone: TZ,
  }).formatToParts(date);
  const get = (t: string) => (parts.find((p) => p.type === t)?.value ?? "").replace(".", "").toUpperCase();
  return { day: get("day"), month: get("month"), weekday: get("weekday") };
}

function EventCard({ event, featured = false, isAuthenticated, canDelete, onEdit, openPoster }: {
  event: EventItem;
  featured?: boolean;
  isAuthenticated: boolean;
  canDelete: boolean;
  onEdit: (event: EventItem) => void;
  openPoster: (poster: { src: string; title: string }) => void;
}) {
  const { imageUrl, startsAt, endsAt } = event;
  const Heading = featured ? "h2" : "h3";
  const span = eventDaySpan(startsAt, endsAt);
  const otherDay = Boolean(endsAt && span.endDay > span.startDay);
  const stub = dateStubParts(startsAt);

  return (
    <article
      className={`group flex min-w-0 flex-col overflow-hidden rounded-md border-2 border-[#1b3647] bg-[#fffdf7] shadow-[4px_4px_0_rgba(23,49,66,0.1)] transition hover:shadow-[6px_6px_0_rgba(23,49,66,0.14)] ${
        featured && imageUrl ? "lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]" : ""
      }`}
    >
      {imageUrl && (
        <button
          type="button"
          aria-label={`Ampliar cartel de ${event.title}`}
          onClick={() => openPoster({ src: imageUrl, title: event.title })}
          className="relative grid w-full cursor-zoom-in place-items-center overflow-hidden bg-[#12222d] focus-visible:z-10 focus-visible:outline-offset-[-4px]"
        >
          <img
            src={imageUrl}
            alt=""
            loading={featured ? "eager" : "lazy"}
            className="aspect-[1.85] max-h-[26rem] w-full object-contain transition duration-300 group-hover:scale-[1.01]"
          />
          <span className="pointer-events-none absolute left-3 top-3 flex flex-col items-center rounded border border-[#e3b341]/70 bg-[#142c3c]/95 px-2.5 py-1.5 text-center leading-none text-[#fffdf7] shadow-md">
            <span className="text-[9px] font-extrabold tracking-[0.14em] text-[#e3b341]">{stub.month}</span>
            <span className="mt-0.5 font-mono text-xl font-black tabular-nums">{stub.day}</span>
          </span>
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Tira marquesina de sede y horario */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1b3647] bg-[#142c3c] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#f5f1e4]">
          <span className="flex items-center gap-2 truncate">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#e3b341]" aria-hidden="true" />
            <span className="truncate">{event.spaceName}</span>
            {event.building && <span className="font-semibold text-[#a7c2d1]">· {event.building}</span>}
          </span>
          <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-[#e3b341]">
            {time(startsAt)}
            {endsAt && <> – {otherDay && programDate.format(new Date(endsAt)) + ", "}{time(endsAt)}</>} h
          </span>
        </div>

        <div className={`flex min-w-0 flex-1 flex-col ${featured ? "p-5 sm:p-6" : "p-5"}`}>
          <div className="flex items-start gap-3.5">
            {!imageUrl && (
              <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded border-2 border-[#142c3c] bg-[#f7f2e3] py-2 text-center leading-none">
                <span className="text-[9px] font-extrabold tracking-[0.14em] text-[#8c5e0f]">{stub.month}</span>
                <span className="mt-1 font-mono text-2xl font-black tabular-nums text-[#142c3c]">{stub.day}</span>
                <span className="mt-0.5 text-[9px] font-bold text-[#526773]">{stub.weekday}</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#8a4526]">
                <time dateTime={startsAt}>{programDate.format(new Date(startsAt))}</time>
                {otherDay && endsAt && (
                  <>
                    {" – "}
                    <time dateTime={endsAt}>{programDate.format(new Date(endsAt))}</time>
                  </>
                )}
              </p>
              <Heading
                className={`mt-1 text-balance font-serif font-bold leading-[1.1] tracking-tight text-[#142c3c] [overflow-wrap:anywhere] ${
                  featured ? "text-[1.75rem] xl:text-[1.95rem]" : "text-[1.45rem]"
                }`}
              >
                {event.title}
              </Heading>
            </div>
          </div>

          {event.description && (
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-[#465963]">{event.description}</p>
          )}

          {(event.speaker || event.clubName) && (
            <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 border-l-2 border-[#e3b341] pl-3 text-xs font-semibold text-[#35505e]">
              {event.speaker && <span>Ponente: <strong className="text-[#142c3c]">{event.speaker}</strong></span>}
              {event.clubName && (
                <span>
                  Organiza:{" "}
                  {event.clubId ? (
                    <Link href={`/clubes/${event.clubId}`} className="font-extrabold text-[#005980] underline decoration-[#96b6c4] underline-offset-2">
                      {event.clubName}
                    </Link>
                  ) : (
                    <strong className="text-[#142c3c]">{event.clubName}</strong>
                  )}
                </span>
              )}
            </div>
          )}

          {/* Talón perforado inferior de boleto */}
          <div className="relative mt-auto pt-5">
            <div className="relative flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-[#c7bfa9] pt-3.5">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-7 -top-2.5 h-4 w-4 rounded-full border border-[#1b3647] bg-[#f4f3ed]"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-7 -top-2.5 h-4 w-4 rounded-full border border-[#1b3647] bg-[#f4f3ed]"
              />
              <AttendButton
                eventKind={event.eventKind}
                eventId={event.id}
                initialAttending={event.viewerAttending}
                initialCount={event.attendeesCount}
                isAuthenticated={isAuthenticated}
              />
              {canDelete && (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onEdit(event)}
                    className="text-xs font-bold text-[#005980] hover:underline"
                  >
                    Editar
                  </button>
                  {event.clubId && <DeleteClubEventButton clubId={event.clubId} eventId={event.id} />}
                  {event.eventKind === "space" && (
                    <form action={deleteSpaceEvent}>
                      <input type="hidden" name="id" value={event.id} />
                      <SubmitButton
                        pendingText="Cancelando…"
                        spinnerClassName="h-3 w-3"
                        className="text-xs font-bold text-[#8c2925] hover:underline"
                      >
                        Cancelar evento
                      </SubmitButton>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function ClubEventBoardForm({
  clubs,
  onSuccess,
  onCancel,
}: {
  clubs: { id: string; name: string }[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [venuePreset, setVenuePreset] = useState("Auditorio");
  const [state, action, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof createClubEvent>>, formData: FormData) => {
      const res = await createClubEvent(prev, formData);
      if (res.success) {
        router.refresh();
        onSuccess();
      }
      return res;
    },
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {clubs.length === 1 ? (
        <>
          <input type="hidden" name="club_id" value={clubs[0].id} />
          <div className="rounded-md border border-[#cde1d9] bg-[#f2f9f6] px-3.5 py-2 text-xs font-bold text-[#145542]">
            Club organizador: {clubs[0].name}
          </div>
        </>
      ) : (
        <label className={label}>
          Club organizador
          <select className={input} name="club_id" required defaultValue={clubs[0]?.id ?? ""}>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={label}>
        Título del evento
        <input className={input} name="title" required minLength={3} maxLength={140} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Inicio (CDMX)
          <input className={input} name="starts_at" type="datetime-local" required />
        </label>
        <label className={label}>
          Fin (opcional)
          <input className={input} name="ends_at" type="datetime-local" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Sede
          <select className={input} value={venuePreset} onChange={(e) => setVenuePreset(e.target.value)}>
            <option value="Auditorio">Auditorio</option>
            <option value="Sala 14">Sala 14</option>
            <option value="El domo">El domo</option>
            <option value="Canchas">Canchas</option>
            <option value="Explanada">Explanada</option>
            <option value="Otro">Otro espacio autorizado</option>
          </select>
        </label>
        {venuePreset === "Otro" ? (
          <label className={label}>
            Especifica el espacio
            <input className={input} name="location" required minLength={2} maxLength={140} placeholder="Ej. Laboratorio 2103" />
          </label>
        ) : (
          <input type="hidden" name="location" value={venuePreset} />
        )}
      </div>
      <label className={label}>
        Descripción
        <textarea className={`${input} min-h-24`} name="description" maxLength={500} />
      </label>
      <ImageUploadField name="image" label="Cartel del evento (opcional · JPG, PNG o WEBP)" compact />
      {state.error && <p className="text-sm text-[#8C1D18]" role="alert">{state.error}</p>}
      <div className="flex justify-end gap-2 border-t border-[#e5e1d4] pt-4">
        <button type="button" onClick={onCancel} className={btnGhost}>Cancelar</button>
        <SubmitButton className={btn} pending={pending} pendingText="Publicando…">
          Publicar evento
        </SubmitButton>
      </div>
    </form>
  );
}

function longDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(new Date(`${value}T12:00:00-06:00`));
}

export function EventBoard({
  events,
  pendingEvents = [],
  spaces,
  spaceNames,
  managedClubs = [],
  canPublishEvents,
  isAuthenticated = false,
  currentMonth,
}: {
  events: EventItem[];
  pendingEvents?: EventItem[];
  spaces: Space[];
  spaceNames: string[];
  managedClubs?: { id: string; name: string }[];
  canPublishEvents: boolean;
  isAuthenticated?: boolean;
  currentMonth: string;
}) {
  const [month, setMonth] = useState(currentMonth);
  const [spaceFilter, setSpaceFilter] = useState("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [next7DaysOnly, setNext7DaysOnly] = useState(false);
  const [showPublishForm, setShowPublishForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [publishMode, setPublishMode] = useState<"space" | "club">(
    canPublishEvents && spaces.length > 0 ? "space" : "club",
  );
  const [lightboxItem, setLightboxItem] = useState<{ src: string; title: string } | null>(null);
  const canCreateSpace = canPublishEvents && spaces.length > 0;
  const canCreateClubEvent = managedClubs.length > 0;
  const canCreateAnyEvent = canCreateSpace || canCreateClubEvent;

  useEffect(() => {
    if (!lightboxItem) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxItem(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxItem]);

  const next7DaysEvents = useMemo(() => {
    const startDay = keyDate(new Date());
    const endDate = new Date(`${startDay}T23:59:59-06:00`);
    endDate.setDate(endDate.getDate() + 7);
    const endDay = keyDate(endDate);
    return events.filter(
      (event) =>
        eventIntersectsDayRange(event.startsAt, event.endsAt, startDay, endDay) &&
        (spaceFilter === "all" || event.spaceName === spaceFilter),
    );
  }, [events, spaceFilter]);

  const { monthStart, monthEnd, days } = useMemo(() => monthDayBounds(month), [month]);

  const inMonth = useMemo(
    () =>
      events.filter(
        (event) =>
          eventIntersectsDayRange(event.startsAt, event.endsAt, monthStart, monthEnd) &&
          (spaceFilter === "all" || event.spaceName === spaceFilter),
      ),
    [events, monthStart, monthEnd, spaceFilter],
  );

  const byDay = useMemo(() => {
    const result = new Map<string, EventItem[]>();
    inMonth.forEach((event) => {
      for (const day of eventDaysInMonth(event.startsAt, event.endsAt, month)) {
        result.set(day, [...(result.get(day) ?? []), event]);
      }
    });
    return result;
  }, [inMonth, month]);

  const spaceTabs = useMemo(() => {
    return [
      { name: "Todos los espacios", value: "all", count: events.length },
      ...spaceNames.map((name) => ({
        name,
        value: name,
        count: events.filter((e) => e.spaceName === name).length,
      })),
    ];
  }, [events, spaceNames]);

  const [year, monthNumber] = month.split("-").map(Number);
  const blanks = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const cells: Array<number | null> = [
    ...Array(blanks).fill(null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const selectedEvents = next7DaysOnly
    ? next7DaysEvents
    : selectedDay
      ? byDay.get(selectedDay) ?? []
      : inMonth;

  const today = keyDate(new Date());
  const featuredEvent = selectedEvents[0] ?? null;
  const billboardEvents = selectedEvents.length > 1 ? selectedEvents.slice(1) : [];

  return (
    <div className="space-y-6">
      {/* CABEZAL DE CARTELERA ESTILO CINE UNIVERSITARIO / GACETA ESCOLAR */}
      <header className="overflow-hidden rounded-lg border-2 border-[#173142] bg-[#fffdf7] shadow-[4px_4px_0_rgba(23,49,66,0.12)]">
        {/* Tira superior estilo marquesina */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#173142] bg-[#142c3c] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#f5f1e4] sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#e3b341]" aria-hidden="true" />
            <span>ESCOM · IPN</span>
            <span className="text-[#69899c]" aria-hidden="true">|</span>
            <span>{monthLabel(month)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-pressed={next7DaysOnly}
              onClick={() => {
                setNext7DaysOnly((v) => !v);
                setSelectedDay(null);
              }}
              className={`rounded border px-2.5 py-0.5 text-[11px] font-extrabold tracking-wider transition ${
                next7DaysOnly
                  ? "border-[#e3b341] bg-[#e3b341] text-[#122836]"
                  : "border-[#3c6075] bg-[#1d3b4f] text-[#e7f0f5] hover:border-[#7da6be]"
              }`}
            >
              Próximos 7 días ({next7DaysEvents.length})
            </button>
            {canCreateAnyEvent && (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => {
                  setPublishMode(canCreateSpace ? "space" : "club");
                  setShowPublishForm(true);
                }}
                className="rounded border border-[#6ca3c1] bg-[#006699] px-2.5 py-0.5 text-[11px] font-extrabold tracking-wider text-white transition hover:bg-[#005580]"
              >
                + Publicar evento
              </button>
            )}
          </div>
        </div>

        {/* Título de Marquesina + Selector de Salas / Espacios */}
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-dashed border-[#cfc9b8] pb-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="font-serif text-3xl font-bold uppercase tracking-[-0.03em] text-[#132c3d] sm:text-4xl">
                Eventos ESCOM
              </h1>
              <span className="rounded border border-[#c7c0ae] bg-[#f4efe1] px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider text-[#3a5260]">
                {selectedDay
                  ? longDate(selectedDay)
                  : next7DaysOnly
                    ? "Próximos 7 días"
                    : `${inMonth.length} ${inMonth.length === 1 ? "evento" : "eventos"} en el mes`}
              </span>
            </div>

            {(selectedDay || next7DaysOnly || spaceFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDay(null);
                  setNext7DaysOnly(false);
                  setSpaceFilter("all");
                }}
                className="text-xs font-extrabold text-[#006699] underline decoration-dotted underline-offset-4 hover:text-[#004d73]"
              >
                Ver todos los eventos del mes
              </button>
            )}
          </div>

          <nav
            aria-label="Filtrar eventos por espacio"
            className="mt-3.5 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
          >
            {spaceTabs.map((item) => {
              const active = spaceFilter === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSpaceFilter(item.value);
                    setSelectedDay(null);
                  }}
                  className={`inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded border px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wide transition ${
                    active
                      ? "border-[#142c3c] bg-[#142c3c] text-[#fffdf7] shadow-[2px_2px_0_#006699]"
                      : "border-[#cfc8b6] bg-[#faf7ef] text-[#284454] hover:border-[#142c3c] hover:bg-[#f1ede0]"
                  }`}
                >
                  <span>{item.name}</span>
                  {item.count > 0 && (
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] tabular-nums ${
                        active
                          ? "bg-[#006699] text-white"
                          : "bg-[#e7e2d3] text-[#455c68]"
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* DIÁLOGO DE PUBLICACIÓN */}
      {showPublishForm && canCreateAnyEvent && (
        <FormDialog
          title={publishMode === "space" && canCreateSpace ? "Publicar evento autorizado" : "Publicar evento de club"}
          kicker="Cartelera ESCOM"
          accent={publishMode === "space" && canCreateSpace ? "amber" : "teal"}
          onClose={() => setShowPublishForm(false)}
          serifTitle
        >
          <div className="space-y-4">
            {canCreateSpace && canCreateClubEvent && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPublishMode("space")}
                  className={`rounded-md px-3 py-1.5 text-xs font-extrabold ${
                    publishMode === "space"
                      ? "bg-[#142c3c] text-white"
                      : "bg-[#f3f2ea] text-[#455c68]"
                  }`}
                >
                  Espacio del campus
                </button>
                <button
                  type="button"
                  onClick={() => setPublishMode("club")}
                  className={`rounded-md px-3 py-1.5 text-xs font-extrabold ${
                    publishMode === "club"
                      ? "bg-[#165b47] text-white"
                      : "bg-[#f3f2ea] text-[#455c68]"
                  }`}
                >
                  Evento de mi club
                </button>
              </div>
            )}

            {publishMode === "space" && canCreateSpace ? (
              <SpaceEventForm
                spaces={spaces.map((space) => ({ id: space.id, name: space.name }))}
                isDirectPublisher
                onSuccess={() => setShowPublishForm(false)}
              />
            ) : (
              <ClubEventBoardForm
                clubs={managedClubs}
                onSuccess={() => setShowPublishForm(false)}
                onCancel={() => setShowPublishForm(false)}
              />
            )}
          </div>
        </FormDialog>
      )}

      {/* DIÁLOGO DE EDICIÓN */}
      {editingEvent && (
        <FormDialog
          title={editingEvent.eventKind === "space" ? "Editar evento" : "Editar evento de club"}
          kicker="Cartelera ESCOM"
          accent={editingEvent.eventKind === "space" ? "amber" : "teal"}
          onClose={() => setEditingEvent(null)}
          serifTitle
        >
          {editingEvent.eventKind === "space" && editingEvent.spaceId ? (
            <SpaceEventForm
              spaces={spaces.map((space) => ({ id: space.id, name: space.name }))}
              initialEvent={{
                id: editingEvent.id,
                spaceId: editingEvent.spaceId,
                title: editingEvent.title,
                description: editingEvent.description,
                speaker: editingEvent.speaker,
                startsAt: editingEvent.startsAt,
                endsAt: editingEvent.endsAt,
                isPublic: editingEvent.isPublic,
              }}
              onSuccess={() => setEditingEvent(null)}
              onCancel={() => setEditingEvent(null)}
            />
          ) : editingEvent.clubId ? (
            <ClubEventForm
              clubId={editingEvent.clubId}
              initialEvent={{
                id: editingEvent.id,
                title: editingEvent.title,
                description: editingEvent.description,
                location: editingEvent.location ?? editingEvent.spaceName,
                startsAt: editingEvent.startsAt,
                endsAt: editingEvent.endsAt,
              }}
              onSuccess={() => setEditingEvent(null)}
              onCancel={() => setEditingEvent(null)}
            />
          ) : null}
        </FormDialog>
      )}

      {/* CUERPO PRINCIPAL: CARTELERA PROTAGONISTA + ALMANAQUE COMPACTO */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        {/* ESCENARIO DE CARTELERA */}
        <section className="min-w-0 space-y-6" aria-live="polite">
          {featuredEvent ? (
            <>
              <EventCard
                key={`${featuredEvent.eventKind}-${featuredEvent.id}`}
                event={featuredEvent}
                featured
                isAuthenticated={isAuthenticated}
                canDelete={featuredEvent.canManageEvent ?? (canPublishEvents && featuredEvent.eventKind === "space")}
                onEdit={setEditingEvent}
                openPoster={setLightboxItem}
              />
              {billboardEvents.length > 0 && (
                <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
                  {billboardEvents.map((event) => (
                    <EventCard
                      key={`${event.eventKind}-${event.id}`}
                      event={event}
                      isAuthenticated={isAuthenticated}
                      canDelete={event.canManageEvent ?? (canPublishEvents && event.eventKind === "space")}
                      onEdit={setEditingEvent}
                      openPoster={setLightboxItem}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className={`${card} border-2 border-dashed border-[#c7c0ae] py-12 text-center`}>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="mx-auto h-8 w-8 text-[#006699]"
              >
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M7 3v4m10-4v4M3 10h18" />
              </svg>
              <h3 className="mt-3 font-serif text-lg font-extrabold text-[#173142]">
                Todavía no hay eventos en esta selección
              </h3>
              <p className="mt-1 text-sm text-[#5f6e78]">Prueba otra fecha, espacio o mes.</p>
            </div>
          )}
        </section>

        {/* COLUMNA SECUNDARIA: ALMANAQUE MENSUAL COMPACTO */}
        <aside className="space-y-4">
          <section
            className="rounded-lg border border-[#cfc8b6] bg-[#fffdf7] p-4 shadow-[2px_2px_0_rgba(23,49,66,0.06)]"
            aria-label={`Calendario de ${monthLabel(month)}`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-dashed border-[#d8d2c3] pb-3">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => {
                  setMonth(moveMonth(month, -1));
                  setSelectedDay(null);
                }}
                className="grid h-8 w-8 place-items-center rounded border border-[#cfc8b6] bg-[#faf7ef] text-sm font-bold text-[#173142] hover:border-[#006699] hover:text-[#006699]"
              >
                ‹
              </button>
              <div className="text-center">
                <h2 className="font-serif text-sm font-extrabold text-[#142c3c]">
                  {monthLabel(month)}
                </h2>
                <p className="text-[11px] font-bold text-[#5f6e78]">
                  {inMonth.length} {inMonth.length === 1 ? "evento" : "eventos"}
                </p>
              </div>
              <button
                type="button"
                aria-label="Mes siguiente"
                onClick={() => {
                  setMonth(moveMonth(month, 1));
                  setSelectedDay(null);
                }}
                className="grid h-8 w-8 place-items-center rounded border border-[#cfc8b6] bg-[#faf7ef] text-sm font-bold text-[#173142] hover:border-[#006699] hover:text-[#006699]"
              >
                ›
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1">
              {["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map((weekday) => (
                <div
                  key={weekday}
                  className="py-1 text-center text-[10px] font-extrabold uppercase text-[#667782]"
                >
                  {weekday}
                </div>
              ))}
              {cells.map((day, index) => {
                if (!day) return <span key={`blank-${index}`} aria-hidden="true" className="h-8" />;
                const date = `${month}-${String(day).padStart(2, "0")}`;
                const count = (byDay.get(date) ?? []).length;
                const active = selectedDay === date;
                return (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${day} ${monthLabel(month)}${count ? `, ${count} eventos` : ""}`}
                    onClick={() => {
                      setNext7DaysOnly(false);
                      setSelectedDay(active ? null : date);
                    }}
                    className={`relative flex h-8 flex-col items-center justify-center rounded border text-xs font-bold tabular-nums transition ${
                      active
                        ? "border-[#142c3c] bg-[#142c3c] text-white"
                        : count > 0
                          ? "border-[#9bc5dc] bg-[#eaf4f8] text-[#004d73] hover:border-[#006699]"
                          : date === today
                            ? "border-[#c7c0ae] bg-[#f4efe1] text-[#173142]"
                            : "border-transparent text-[#3d5463] hover:bg-[#f4f1e6]"
                    }`}
                  >
                    <span>{day}</span>
                    {count > 0 && (
                      <span
                        className={`h-1 w-1 rounded-full ${
                          active ? "bg-[#e3b341]" : "bg-[#006699]"
                        }`}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[#e9e4d6] pt-2.5 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setMonth(currentMonth);
                  setSelectedDay(null);
                  setNext7DaysOnly(false);
                }}
                className="font-extrabold text-[#006699] hover:underline"
              >
                Mes actual
              </button>
              {selectedDay && (
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
                  className="font-bold text-[#5f6e78] hover:text-[#173142]"
                >
                  Quitar filtro de día
                </button>
              )}
            </div>
          </section>

          {/* Solicitudes pendientes por revisar (moderación/admin) */}
          {canPublishEvents && pendingEvents.length > 0 && (
            <section className="rounded-lg border border-[#d9c596] bg-[#fffdf7] p-4 space-y-3">
              <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#8d6720]">
                Por autorizar ({pendingEvents.length})
              </p>
              <ul className="space-y-3">
                {pendingEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="space-y-2 border-t border-[#e6dec8] pt-3 first:border-0 first:pt-0"
                  >
                    <div className="text-xs">
                      <p className="font-extrabold text-[#173142]">
                        {ev.title}{" "}
                        <span className="font-normal text-[#5f6e78]">· {ev.spaceName}</span>
                      </p>
                      <p className="text-[11px] text-[#5f6e78]">
                        {new Date(ev.startsAt).toLocaleString("es-MX", { timeZone: TZ })}
                        {ev.endsAt ? ` – ${new Date(ev.endsAt).toLocaleString("es-MX", { timeZone: TZ })}` : ""}
                      </p>
                      {ev.description && (
                        <p className="mt-1 text-[11px] text-[#536974]">{ev.description}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={reviewSpaceEvent} className="flex flex-wrap gap-1.5">
                        <input type="hidden" name="id" value={ev.id} />
                        <SubmitButton name="decision" value="aprobado" className={btn} pendingText="Aprobando…">
                          Aprobar y publicar
                        </SubmitButton>
                        <SubmitButton name="decision" value="rechazado" className={btnGhost} pendingText="Rechazando…">
                          Rechazar
                        </SubmitButton>
                      </form>
                      <button
                        type="button"
                        onClick={() => setEditingEvent(ev)}
                        className="text-xs font-bold text-[#005980] hover:underline"
                      >
                        Editar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {/* VISOR LIGHTBOX DE CARTEL */}
      {lightboxItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightboxItem.title}
          onClick={() => setLightboxItem(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-4xl overflow-hidden rounded-lg border-2 border-[#173142] bg-[#fffdf7] p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between gap-4 px-1">
              <p className="truncate font-serif text-sm font-black text-[#173142]">
                {lightboxItem.title}
              </p>
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="rounded border border-[#cfc8b6] px-2.5 py-1 text-xs font-extrabold text-[#173142] hover:bg-[#f4efe1]"
              >
                Cerrar ✕
              </button>
            </div>
            <img
              src={lightboxItem.src}
              alt={lightboxItem.title}
              className="max-h-[80vh] w-full rounded object-contain bg-[#0b1922]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
