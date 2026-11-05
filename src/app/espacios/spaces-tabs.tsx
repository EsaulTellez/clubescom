"use client";

import { useMemo, useState } from "react";
import { CampusMap } from "@/components/campus-map";
import { card } from "@/lib/ui";
import { CubicleForm, SpaceEventForm } from "./forms";

type EventItem = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  spaceName: string;
  building: string | null;
};
type Cubicle = {
  id: string;
  label: string;
  building: string;
  floor: string | null;
  professor_name: string | null;
  x: number;
  y: number;
  professor_id: string | null;
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

export function SpacesTabs({
  events,
  spaces,
  cubicles,
  ownCubicle,
  canEditCubicle,
  canPublishEvents,
  currentMonth,
}: {
  events: EventItem[];
  spaces: Space[];
  cubicles: Cubicle[];
  ownCubicle: Cubicle | null;
  canEditCubicle: boolean;
  canPublishEvents: boolean;
  currentMonth: string;
}) {
  const [tab, setTab] = useState<"events" | "map">("events");
  const [month, setMonth] = useState(currentMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const inMonth = useMemo(() => events.filter((event) => keyDate(new Date(event.startsAt)).slice(0, 7) === month), [events, month]);
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
  const normalizedQuery = query.trim().toLocaleLowerCase("es-MX");
  const filteredCubicles = cubicles.filter((cubicle) =>
    `${cubicle.professor_name ?? ""} ${cubicle.label} ${cubicle.building} ${cubicle.floor ?? ""}`
      .toLocaleLowerCase("es-MX")
      .includes(normalizedQuery),
  );

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Vistas de espacios" className="inline-flex rounded-md border border-[#dcd9ce] bg-[#fffdf7] p-1">
        <button id="events-tab" role="tab" aria-controls="events-panel" aria-selected={tab === "events"} onClick={() => setTab("events")} className={`min-h-10 rounded px-4 py-2 text-sm font-bold ${tab === "events" ? "bg-[#006699] text-white" : "text-[#50636d] hover:bg-[#e9efef]"}`}>Eventos</button>
        <button id="map-tab" role="tab" aria-controls="map-panel" aria-selected={tab === "map"} onClick={() => setTab("map")} className={`min-h-10 rounded px-4 py-2 text-sm font-bold ${tab === "map" ? "bg-[#006699] text-white" : "text-[#50636d] hover:bg-[#e9efef]"}`}>Mapa y personas</button>
      </div>

      {tab === "events" ? (
        <section id="events-panel" role="tabpanel" aria-labelledby="events-tab" className="space-y-6">
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
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
                <article key={event.id} className={`${card} space-y-2 border-l-4 border-l-[#006699]`}>
                  <p className="text-xs font-bold text-[#004d73]">{time(event.startsAt)} · {event.spaceName}</p>
                  <h3 className="font-extrabold">{event.title}</h3>
                  {event.description && <p className="text-sm leading-6 text-[#5f6e78]">{event.description}</p>}
                  <p className="text-sm text-[#5f6e78]">{event.building ?? "Campus ESCOM"}{event.endsAt ? ` · Termina ${time(event.endsAt)}` : ""}</p>
                </article>
              )) : <div className={`${card} border-dashed text-center`}><span className="text-3xl" aria-hidden="true">🗓️</span><h3 className="mt-3 font-bold">Todavía no hay eventos</h3><p className="mt-1 text-sm text-[#5f6e78]">Prueba otro mes o vuelve más tarde.</p></div>}
            </section>
          </div>

          {spaces.length > 0 && <section><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#004d73]">Orientación</p><h2 className="mt-1 text-xl font-extrabold">Espacios del campus</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{spaces.map((space) => <article key={space.id} className={`${card} space-y-2`}><h3 className="font-bold">{space.name}</h3><p className="text-xs font-bold uppercase text-[#004d73]">{space.kind}{space.building ? ` · ${space.building}` : ""}</p>{space.description && <p className="text-sm text-[#5f6e78]">{space.description}</p>}</article>)}</div></section>}

          {canPublishEvents && spaces.length > 0 && <section className={`${card} max-w-2xl space-y-3`}><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#004d73]">Personal autorizado</p><h2 className="text-lg font-extrabold">Publicar evento en el itinerario</h2><SpaceEventForm spaces={spaces.map((space) => ({ id: space.id, name: space.name }))} /></section>}
        </section>
      ) : (
        <section id="map-panel" role="tabpanel" aria-labelledby="map-tab" className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]">
          <section className={`${card} space-y-4`}>
            <div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#004d73]">ESCOM</p><h2 className="mt-1 text-xl font-extrabold">Mapa de referencia</h2></div>
            <CampusMap />
          </section>
          <div className="space-y-5">
            {canEditCubicle && <section className={`${card} space-y-3`}><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#004d73]">Perfil docente</p><h2 className="mt-1 text-lg font-extrabold">Mi cubículo</h2></div><p className="text-sm text-[#5f6e78]">Comparte tu ubicación para que la comunidad pueda encontrarte. X e Y son referencias para el plano ilustrativo; están sujetas al plano real.</p><CubicleForm cubicle={ownCubicle} /></section>}
            <section className={`${card} space-y-3`}>
              <div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#004d73]">Directorio</p><h2 className="text-lg font-extrabold">Localiza personal académico</h2></div>
              <label className="block text-sm font-semibold text-[#173142]">Buscar profesor o ubicación<input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 min-h-11 w-full rounded border border-[#dcd9ce] bg-white px-3 text-sm font-normal" placeholder="Nombre, edificio o cubículo" /></label>
              {filteredCubicles.length ? <ul className="space-y-2" aria-live="polite">{filteredCubicles.map((cubicle) => <li key={cubicle.id} className="rounded border border-[#e9e6dc] bg-[#fffdf7] p-3"><p className="font-bold">{cubicle.professor_name ?? "Profesor"}</p><p className="mt-1 text-sm text-[#5f6e78]">{cubicle.label} · {cubicle.building}{cubicle.floor ? ` · piso ${cubicle.floor}` : ""}</p></li>)}</ul> : <p className="rounded border border-dashed border-[#dcd9ce] p-3 text-sm text-[#5f6e78]">{normalizedQuery ? "No encontramos una ubicación con esos datos." : "Ubicación no disponible. El personal puede registrar su cubículo."}</p>}
            </section>
          </div>
        </section>
      )}
    </div>
  );
}
