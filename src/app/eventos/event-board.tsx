"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AttendButton } from "@/components/attend-button";
import { btn, btnGhost, card } from "@/lib/ui";
import { deleteSpaceEvent, reviewSpaceEvent } from "../espacios/actions";
import { SpaceEventForm } from "../espacios/forms";

type EventItem = {
  id: string;
  eventKind: "space" | "club";
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  spaceName: string;
  building: string | null;
  speaker?: string | null;
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

const TZ = "America/Mexico_City";

function keyDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  }).formatToParts(date);
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date(Date.UTC(year, month - 1, 15)));
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

function EventCard({ event, featured = false, isAuthenticated, canDelete, openPoster }: {
  event: EventItem;
  featured?: boolean;
  isAuthenticated: boolean;
  canDelete: boolean;
  openPoster: (poster: { src: string; title: string }) => void;
}) {
  const { imageUrl, startsAt, endsAt } = event;
  const Heading = featured ? "h2" : "h3";
  const otherDay = endsAt && keyDate(new Date(startsAt)) !== keyDate(new Date(endsAt));

  return (
    <article className={`flex min-w-0 flex-col overflow-hidden rounded-sm border border-[#c9c5b8] bg-[#fffdf7] ${featured && imageUrl ? "lg:grid lg:grid-cols-2" : ""}`}>
      {imageUrl && (
        <button
          type="button"
          aria-label={`Ampliar cartel de ${event.title}`}
          onClick={() => openPoster({ src: imageUrl, title: event.title })}
          className="relative grid w-full cursor-zoom-in place-items-center bg-[#172733] focus-visible:z-10 focus-visible:outline-offset-[-4px]"
        >
          <img src={imageUrl} alt="" loading={featured ? "eager" : "lazy"}
            className="aspect-[1.9] max-h-[26rem] w-full object-contain" />
        </button>
      )}
      <div className={`flex min-w-0 flex-1 flex-col ${featured ? "p-5 sm:p-7" : "p-5"}`}>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[#d9d5c8] pb-3 text-xs font-semibold">
          <time dateTime={startsAt} className="font-mono uppercase tracking-wide text-[#7d3c2b]">{programDate.format(new Date(startsAt))}</time>
          <span className="tabular-nums">{time(startsAt)}{endsAt && <> – {otherDay && programDate.format(new Date(endsAt)) + ", "}{time(endsAt)}</>} h</span>
        </p>
        <Heading className={`mt-4 text-balance font-[Georgia,serif] leading-[1.08] font-bold tracking-tight text-[#182f3a] [overflow-wrap:anywhere] ${featured ? "text-[1.85rem] xl:text-[2rem]" : "text-[1.65rem]"}`}>{event.title}</Heading>
        <p className="mt-2 text-sm font-bold text-[#294955]">{event.spaceName}{event.building && <span className="font-normal"> · {event.building}</span>}</p>
        {event.description && <p className="mt-3 max-w-prose text-sm leading-relaxed text-[#4d5b60]">{event.description}</p>}
        {(event.speaker || event.clubName) && (
          <div className="mt-3 space-y-1 text-sm text-[#43545c]">
            {event.speaker && <p>Con {event.speaker}</p>}
            {event.clubName && <p>Organiza {event.clubId
              ? <Link href={`/clubes/${event.clubId}`} className="text-[#005980] underline decoration-[#96b6c4] underline-offset-2">{event.clubName}</Link>
              : event.clubName}</p>}
          </div>
        )}
        <div className="mt-auto pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[#bdb7a8] pt-3">
            <AttendButton eventKind={event.eventKind} eventId={event.id} initialAttending={event.viewerAttending} initialCount={event.attendeesCount} isAuthenticated={isAuthenticated} />
            {canDelete && (
              <form action={deleteSpaceEvent}>
                <input type="hidden" name="id" value={event.id} />
                <button className="text-xs font-bold text-[#8c2925] hover:underline">Eliminar evento</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </article>
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
  canPublishEvents,
  canSubmitForReview = false,
  isAuthenticated = false,
  currentMonth,
}: {
  events: EventItem[];
  pendingEvents?: EventItem[];
  spaces: Space[];
  canPublishEvents: boolean;
  canSubmitForReview?: boolean;
  isAuthenticated?: boolean;
  currentMonth: string;
}) {
  const [month, setMonth] = useState(currentMonth);
  const [spaceFilter, setSpaceFilter] = useState("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [next7DaysOnly, setNext7DaysOnly] = useState(false);
  const [showPublishForm, setShowPublishForm] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<{ src: string; title: string } | null>(null);

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
    return events.filter((event) => {
      const day = keyDate(new Date(event.startsAt));
      return day >= startDay && day <= endDay && (spaceFilter === "all" || event.spaceName === spaceFilter);
    });
  }, [events, spaceFilter]);

  const inMonth = useMemo(
    () =>
      events.filter(
        (event) =>
          keyDate(new Date(event.startsAt)).slice(0, 7) === month &&
          (spaceFilter === "all" || event.spaceName === spaceFilter),
      ),
    [events, month, spaceFilter],
  );

  const byDay = useMemo(() => {
    const result = new Map<string, EventItem[]>();
    inMonth.forEach((event) => {
      const day = keyDate(new Date(event.startsAt));
      result.set(day, [...(result.get(day) ?? []), event]);
    });
    return result;
  }, [inMonth]);

  const spaceTabs = useMemo(() => {
    const coreSpaces = ["Auditorio", "Sala 14", "El domo", "Canchas de fútbol", "Canchas de voleibol"];
    const extraSpaces = spaces
      .map((s) => s.name)
      .filter((name) => !coreSpaces.includes(name));
    const allNames = [...coreSpaces, ...extraSpaces];
    return [
      { name: "Cartelera general", value: "all", count: events.length },
      ...allNames.map((name) => ({
        name,
        value: name,
        count: events.filter((e) => e.spaceName === name).length,
      })),
    ];
  }, [events, spaces]);

  const [year, monthNumber] = month.split("-").map(Number);
  const blanks = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const days = new Date(year, monthNumber, 0).getDate();
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
            <span className="capitalize">{monthLabel(month)}</span>
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
            {(canPublishEvents || canSubmitForReview) && spaces.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPublishForm((v) => !v)}
                className="rounded border border-[#6ca3c1] bg-[#006699] px-2.5 py-0.5 text-[11px] font-extrabold tracking-wider text-white transition hover:bg-[#005580]"
              >
                {showPublishForm ? "Cerrar formulario" : "+ Publicar evento"}
              </button>
            )}
          </div>
        </div>

        {/* Título de Marquesina + Selector de Salas / Espacios */}
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-dashed border-[#cfc9b8] pb-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="font-[Georgia,serif] text-3xl font-bold uppercase tracking-[-0.03em] text-[#132c3d] sm:text-4xl">
                Cartelera ESCOM
              </h1>
              <span className="rounded border border-[#c7c0ae] bg-[#f4efe1] px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider text-[#3a5260]">
                {selectedDay
                  ? longDate(selectedDay)
                  : next7DaysOnly
                    ? "Próximos 7 días"
                    : `${inMonth.length} funciones en el mes`}
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
                Ver toda la cartelera del mes
              </button>
            )}
          </div>

          <nav
            aria-label="Filtrar cartelera por espacio"
            className="mt-3.5 flex flex-wrap items-center gap-2"
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
                  className={`inline-flex min-h-9 items-center gap-2 rounded border px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wide transition ${
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

      {/* FORMULARIO COLAPSABLE DE PUBLICACIÓN / REVISIÓN */}
      {showPublishForm && (canPublishEvents || canSubmitForReview) && spaces.length > 0 && (
        <section className={`${card} max-w-2xl space-y-3 border-2 border-[#173142]`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-[#142c3c]">
              {canPublishEvents
                ? "Publicar evento autorizado en el itinerario"
                : "Enviar evento ya autorizado a revisión para el itinerario"}
            </h2>
            <button
              type="button"
              onClick={() => setShowPublishForm(false)}
              className="text-xs font-bold text-[#5f6e78] hover:text-[#173142]"
            >
              Cerrar ✕
            </button>
          </div>
          <SpaceEventForm spaces={spaces.map((space) => ({ id: space.id, name: space.name }))} />
        </section>
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
                <h2 className="text-sm font-extrabold capitalize text-[#142c3c]">
                  {monthLabel(month)}
                </h2>
                <p className="text-[11px] font-bold text-[#5f6e78]">
                  {inMonth.length} {inMonth.length === 1 ? "función" : "funciones"}
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
                        {new Date(ev.startsAt).toLocaleString("es-MX")}
                      </p>
                      {ev.description && (
                        <p className="mt-1 text-[11px] text-[#536974]">{ev.description}</p>
                      )}
                    </div>
                    <form action={reviewSpaceEvent} className="flex flex-wrap gap-1.5">
                      <input type="hidden" name="id" value={ev.id} />
                      <button name="decision" value="aprobado" className={btn}>
                        Aprobar y publicar
                      </button>
                      <button name="decision" value="rechazado" className={btnGhost}>
                        Rechazar
                      </button>
                    </form>
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
