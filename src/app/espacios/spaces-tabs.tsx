"use client";
import { useMemo, useState } from "react";
import { CampusMap } from "@/components/campus-map";
import { card } from "@/lib/ui";
import { BookingForm, CubicleForm } from "./forms";

type EventItem={id:string;title:string;startsAt:string;endsAt:string;spaceName:string;building:string|null};
type Cubicle={id:string;label:string;building:string;floor:string|null;professor_name:string|null;x:number;y:number;professor_id:string|null};
type Space={id:string;name:string;kind:string;building:string|null;description:string|null};
const TZ="America/Mexico_City";
function keyDate(date:Date){const parts=new Intl.DateTimeFormat("en-CA",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:TZ}).formatToParts(date);const p=(k:string)=>parts.find(x=>x.type===k)?.value??"";return p("year")+"-"+p("month")+"-"+p("day")}
function monthLabel(value:string){const [y,m]=value.split("-").map(Number);return new Intl.DateTimeFormat("es-MX",{month:"long",year:"numeric",timeZone:TZ}).format(new Date(Date.UTC(y,m-1,15)))}
function moveMonth(value:string,delta:number){const [y,m]=value.split("-").map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")}
function time(value:string){return new Intl.DateTimeFormat("es-MX",{hour:"numeric",minute:"2-digit",timeZone:TZ}).format(new Date(value))}
function longDate(value:string){return new Intl.DateTimeFormat("es-MX",{weekday:"long",day:"numeric",month:"long",timeZone:TZ}).format(new Date(value+"T12:00:00-06:00"))}

export function SpacesTabs({events,spaces,cubicles,ownCubicle,canEditCubicle,canManage,currentMonth}:{events:EventItem[];spaces:Space[];cubicles:Cubicle[];ownCubicle:Cubicle|null;canEditCubicle:boolean;canManage:boolean;currentMonth:string}){
 const [tab,setTab]=useState<"events"|"map">("events"),[month,setMonth]=useState(currentMonth),[selected,setSelected]=useState<string|null>(null);
 const inMonth=useMemo(()=>events.filter(e=>keyDate(new Date(e.startsAt)).slice(0,7)===month),[events,month]);
 const byDay=useMemo(()=>{const map=new Map<string,EventItem[]>();inMonth.forEach(e=>{const k=keyDate(new Date(e.startsAt));map.set(k,[...(map.get(k)||[]),e])});return map},[inMonth]);
 const [year,mo]=month.split("-").map(Number), blanks=(new Date(year,mo-1,1).getDay()+6)%7, days=new Date(year,mo,0).getDate();
 const cells:Array<number|null>=[...Array(blanks).fill(null),...Array.from({length:days},(_,i)=>i+1)];while(cells.length%7)cells.push(null);
 const selectedEvents=selected?(byDay.get(selected)||[]):inMonth;const today=keyDate(new Date());
 return <div className="space-y-5">
  <div role="tablist" aria-label="Vistas de espacios" className="inline-flex rounded-full border border-[#d9eaf2] bg-white/90 p-1 shadow-sm">
   <button id="events-tab" role="tab" aria-controls="events-panel" aria-selected={tab==="events"} onClick={()=>setTab("events")} className={"rounded-full px-5 py-2.5 text-sm font-bold "+(tab==="events"?"bg-[#006699] text-white":"text-[#607080] hover:bg-[#eef7fb]")}>Eventos</button>
   <button id="map-tab" role="tab" aria-controls="map-panel" aria-selected={tab==="map"} onClick={()=>setTab("map")} className={"rounded-full px-5 py-2.5 text-sm font-bold "+(tab==="map"?"bg-[#006699] text-white":"text-[#607080] hover:bg-[#eef7fb]")}>Mapa 3D</button>
  </div>
  {tab==="events"?<section id="events-panel" role="tabpanel" aria-labelledby="events-tab" className="space-y-6">
   <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
    <section className={card+" space-y-5"} aria-label={"Calendario de "+monthLabel(month)}>
     <div className="flex items-center justify-between"><button aria-label="Mes anterior" onClick={()=>{setMonth(moveMonth(month,-1));setSelected(null)}} className="grid h-10 w-10 place-items-center rounded-full border text-[#006699] hover:bg-[#edf8fc]">‹</button><div className="text-center"><h2 className="text-xl font-extrabold capitalize">{monthLabel(month)}</h2><p className="text-xs text-[#71808b]">{inMonth.length} eventos públicos</p></div><button aria-label="Mes siguiente" onClick={()=>{setMonth(moveMonth(month,1));setSelected(null)}} className="grid h-10 w-10 place-items-center rounded-full border text-[#006699] hover:bg-[#edf8fc]">›</button></div>
     <div className="grid grid-cols-7 gap-1.5 sm:gap-2">{["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(w=><div key={w} className="py-2 text-center text-[10px] font-extrabold uppercase text-[#8896a0]">{w}</div>)}{cells.map((day,i)=>{if(!day)return <span key={"b"+i} aria-hidden="true" className="min-h-12"/>;const k=month+"-"+String(day).padStart(2,"0"),count=(byDay.get(k)||[]).length,active=selected===k;return <button key={k} aria-pressed={active} aria-label={day+" "+monthLabel(month)+(count?", "+count+" eventos":"")} onClick={()=>setSelected(active?null:k)} className={"flex min-h-12 flex-col items-center justify-center rounded-2xl border text-sm font-semibold "+(active?"border-[#006699] bg-[#006699] text-white":k===today?"border-[#8dc7df] bg-[#edf8fc] text-[#006699]":"border-transparent bg-[#f7f9fb] hover:border-[#cce5f0] hover:bg-[#edf8fc]")}>{day}{count>0&&<span className={active?"text-white":"text-[#0495c8]"} aria-hidden="true">{count>2?"•••":"•"}</span>}</button>})}</div>
     <div className="flex justify-between border-t pt-3 text-xs"><span className="text-[#71808b]">Los puntos azules marcan eventos</span><button onClick={()=>{setMonth(currentMonth);setSelected(null)}} className="font-bold text-[#006699]">Mes actual</button></div>
    </section>
    <section className="space-y-3" aria-live="polite"><div className="px-1"><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0083b3]">Cartelera</p><h2 className="mt-1 text-xl font-extrabold">{selected?longDate(selected):"Este mes"}</h2></div>{selected&&<button onClick={()=>setSelected(null)} className="text-xs font-bold text-[#006699]">Ver todo el mes</button>}{selectedEvents.length?selectedEvents.map(e=><article key={e.id} className="relative overflow-hidden rounded-3xl border border-white bg-white/90 p-4 shadow-[0_8px_28px_rgba(22,75,98,.08)]"><span className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-[#0096c7] to-[#006699]"/><div className="pl-2"><p className="text-xs font-bold text-[#006699]">{time(e.startsAt)} · {e.spaceName}</p><h3 className="mt-2 font-extrabold">{e.title}</h3><p className="mt-1 text-sm text-[#71808b]">{e.building||"Campus ESCOM"}</p><p className="mt-3 inline-flex rounded-full bg-[#edf8fc] px-3 py-1 text-xs font-bold text-[#006699]">Termina {time(e.endsAt)}</p></div></article>):<div className={card+" border-dashed text-center"}><span className="text-3xl">🗓️</span><h3 className="mt-3 font-bold">Todavía no hay eventos</h3><p className="mt-1 text-sm text-[#71808b]">Prueba otro mes o vuelve más tarde.</p></div>}</section>
   </div>
   {spaces.length>0&&<section><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0083b3]">Lugares</p><h2 className="mt-1 text-xl font-extrabold">Espacios del campus</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{spaces.map(s=><article key={s.id} className={card+" space-y-2"}><h3 className="font-bold">{s.name}</h3><p className="text-xs font-bold uppercase text-[#0083b3]">{s.kind}{s.building?" · "+s.building:""}</p>{s.description&&<p className="text-sm text-[#71808b]">{s.description}</p>}</article>)}</div></section>}
   {canManage&&spaces.length>0&&<section className={card+" max-w-2xl space-y-3"}><h2 className="text-lg font-extrabold">Publicar un evento</h2><BookingForm spaces={spaces.map(s=>({id:s.id,name:s.name}))}/></section>}
  </section>:<section id="map-panel" role="tabpanel" aria-labelledby="map-tab" className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]">
   <section className={card+" space-y-4"}><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0083b3]">Campus</p><h2 className="mt-1 text-xl font-extrabold">Explora el mapa</h2></div><CampusMap/>{cubicles.length?<section><h3 className="mb-3 font-bold">Cubículos registrados</h3><ul className="grid gap-2 sm:grid-cols-2">{cubicles.map(c=><li key={c.id} className="rounded-2xl border bg-white/80 p-3 text-sm"><span className="font-semibold">{c.label}{c.professor_name?" · "+c.professor_name:""}</span><span className="mt-1 block text-xs text-[#71808b]">{c.building}{c.floor?" · piso "+c.floor:""}</span></li>)}</ul></section>:<p className="rounded-2xl bg-[#f7f9fb] p-4 text-sm text-[#71808b]">Todavía no hay cubículos registrados.</p>}</section>
   {canEditCubicle&&<section className={card+" space-y-3"}><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#0083b3]">Perfil docente</p><h2 className="mt-1 text-lg font-extrabold">Mi cubículo</h2></div><p className="text-sm text-[#71808b]">Comparte tu ubicación para que la comunidad pueda encontrarte.</p><CubicleForm cubicle={ownCubicle}/></section>}
  </section>}
 </div>
}
