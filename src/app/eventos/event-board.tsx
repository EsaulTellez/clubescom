"use client";

import { useMemo, useState } from "react";
import { card } from "@/lib/ui";
import { deleteSpaceEvent } from "../espacios/actions";
import { SpaceEventForm } from "../espacios/forms";

type EventItem = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  spaceName: string;
  building: string | null;
};
type Space = { id: string; name: string; kind: string; building: string | null; description: string | null };
const TZ = "America/Mexico_City";

function keyDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ }).formatToParts(date);
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: TZ }).format(new Date(Date.UTC(year, month - 1, 15)));
}
function moveMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
function time(value: string) {
  return new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(value));
}
function longDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(`${value}T12:00:00-06:00`));
}

export function EventBoard({
  events,
  spaces,
  canPublishEvents,
  currentMonth,
}: {
  events: EventItem[];
  spaces: Space[];
  canPublishEvents: boolean;
  currentMonth: string;
}) {
  const [month, setMonth] = useState(currentMonth);
  const [spaceFilter, setSpaceFilter] = useState("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const inMonth = useMemo(() => events.filter((event) => keyDate(new Date(event.startsAt)).slice(0, 7) === month && (spaceFilter === "all" || event.spaceName === spaceFilter)), [events, month, spaceFilter]);
  const byDay = useMemo(() => {
    const result = new Map<string, EventItem[]>();
    inMonth.forEach((event) => {
      const day = keyDate(new Date(event.startsAt));
      result.set(day, [...(result.get(day) ?? []), event]);
    });
    return result;
  }, [inMonth]);
  const [year, monthNumber] = month.split("-").map(Number);
  const blanks = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const days = new Date(year, monthNumber, 0).getDate();
  const cells: Array<number | null> = [...Array(blanks).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const selectedEvents = selectedDay ? byDay.get(selectedDay) ?? [] : inMonth;
  const today = keyDate(new Date());

  return (
    <div className="space-y-5">
      <section className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="board-eyebrow">Agenda del campus</p><h2 className="mt-1 text-2xl font-extrabold text-[#1b4053]">Cartelera de eventos</h2><p className="mt-1 text-sm text-[#5f6e78]">Actividades autorizadas, organizadas por espacio y fecha.</p></div><span className="board-label">{inMonth.length} en este mes</span></div>
            <nav aria-label="Filtrar cartelera por espacio" className="flex flex-wrap gap-2">
              {[{ name: "Cartelera general", value: "all" }, ...["Auditorio", "Sala 14", "El domo", "Canchas de fútbol", "Canchas de voleibol"].map((name) => ({ name, value: name })), ...spaces.filter((space) => !["Auditorio", "Sala 14", "El domo", "Canchas de fútbol", "Canchas de voleibol"].includes(space.name)).map((space) => ({ name: space.name, value: space.name }))].map((item) => <button key={item.value} type="button" aria-pressed={spaceFilter === item.value} onClick={() => { setSpaceFilter(item.value); setSelectedDay(null); }} className={`min-h-10 rounded-md border px-4 py-2 text-sm font-bold transition ${spaceFilter === item.value ? "border-[#006699] bg-[#006699] text-white" : "border-[#d7dedb] bg-[#fffdf7] text-[#365767] hover:border-[#006699]"}`}>{item.name}</button>)}
            </nav>
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(18rem,.75fr)_minmax(0,1.25fr)]">
            <section className={`${card} space-y-5`} aria-label={`Calendario de ${monthLabel(month)}`}>
              <div className="flex items-center justify-between gap-3">
                <button aria-label="Mes anterior" onClick={() => { setMonth(moveMonth(month, -1)); setSelectedDay(null); }} className="grid h-10 w-10 place-items-center rounded border border-[#dcd9ce] text-[#006699] hover:bg-[#edf5f5]">‹</button>
                <div className="text-center"><h2 className="text-xl font-extrabold capitalize">{monthLabel(month)}</h2><p className="text-xs text-[#5f6e78]">{inMonth.length} eventos autorizados</p></div>
                <button aria-label="Mes siguiente" onClick={() => { setMonth(moveMonth(month, 1)); setSelectedDay(null); }} className="grid h-10 w-10 place-items-center rounded border border-[#dcd9ce] text-[#006699] hover:bg-[#edf5f5]">›</button>
              </div>
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((weekday) => <div key={weekday} className="py-2 text-center text-[10px] font-extrabold uppercase text-[#5f6e78]">{weekday}</div>)}
                {cells.map((day, index) => {
                  if (!day) return <span key={`blank-${index}`} aria-hidden="true" className="min-h-12" />;
                  const date = `${month}-${String(day).padStart(2, "0")}`;
                  const count = (byDay.get(date) ?? []).length;
                  const active = selectedDay === date;
                  return <button key={date} aria-pressed={active} aria-label={`${day} ${monthLabel(month)}${count ? `, ${count} eventos` : ""}`} onClick={() => setSelectedDay(active ? null : date)} className={`flex min-h-12 flex-col items-center justify-center rounded border text-sm font-semibold ${active ? "border-[#004d73] bg-[#006699] text-white" : date === today ? "border-[#8dc7df] bg-[#edf5f5] text-[#004d73]" : "border-transparent bg-[#f4f3ed] text-[#173142] hover:border-[#c4dce3] hover:bg-[#edf5f5]"}`}>
                    {day}{count > 0 && <span className={active ? "text-white" : "text-[#006699]"} aria-hidden="true">{count > 2 ? "•••" : "•"}</span>}
                  </button>;
                })}
              </div>
              <div className="flex justify-between border-t border-[#e9e6dc] pt-3 text-xs"><span className="text-[#5f6e78]">Los puntos azules marcan eventos</span><button onClick={() => { setMonth(currentMonth); setSelectedDay(null); }} className="font-bold text-[#006699]">Mes actual</button></div>
            </section>

            <section className="space-y-3" aria-live="polite">
              <div className="px-1"><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#004d73]">Cartelera autorizada</p><h2 className="mt-1 text-xl font-extrabold">{selectedDay ? longDate(selectedDay) : "Este mes"}</h2></div>
              {selectedDay && <button onClick={() => setSelectedDay(null)} className="text-xs font-bold text-[#006699]">Ver todo el mes</button>}
              {selectedEvents.length ? selectedEvents.map((event) => (
                <article key={event.id} className="event-poster">
                  <div className="event-poster__date" aria-label={new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(event.startsAt))}>
                    <span>{new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: TZ }).format(new Date(event.startsAt)).replace(".", "")}</span>
                    <strong>{new Intl.DateTimeFormat("es-MX", { day: "2-digit", timeZone: TZ }).format(new Date(event.startsAt))}</strong>
                    <span>{new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: TZ }).format(new Date(event.startsAt)).replace(".", "")}</span>
                  </div>
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="board-label">{event.spaceName}</span><span className="text-xs font-bold text-[#536e79]">{time(event.startsAt)} h</span></div>
                    <h3 className="font-extrabold">{event.title}</h3>
                    {event.description && <p className="mt-2 text-sm leading-6 text-[#536974]">{event.description}</p>}
                    <div className="event-poster__footer"><span>{event.building ?? "Campus ESCOM"}</span>{event.endsAt && <span>Termina {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(event.endsAt))}</span>}</div>
                    {canPublishEvents && <form action={deleteSpaceEvent}><input type="hidden" name="id" value={event.id} /><button className="mt-3 text-xs font-bold text-[#8C1D18]">Eliminar evento</button></form>}
                  </div>
                </article>
              )) : <div className={`${card} border-dashed text-center`}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="mx-auto h-8 w-8 text-[#006699]"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></svg><h3 className="mt-3 font-bold">Todavía no hay eventos</h3><p className="mt-1 text-sm text-[#5f6e78]">Prueba otro mes o vuelve más tarde.</p></div>}
            </section>
          </div>

          {canPublishEvents && spaces.length > 0 && <section className={`${card} max-w-2xl space-y-3`}><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#004d73]">Personal autorizado</p><h2 className="text-lg font-extrabold">Publicar evento en el itinerario</h2><SpaceEventForm spaces={spaces.map((space) => ({ id: space.id, name: space.name }))} /></section>}
      </section>
    </div>
  );
}
