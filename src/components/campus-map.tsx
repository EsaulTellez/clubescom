"use client";

import { useEffect, useRef, useState } from "react";
import "./campus-map.css";
import { RoomEditor } from "@/app/mapa/room-editor";

export type Professor = { id: string; name: string };
export type RoomInfo = { code: string; kind: string; name: string; description: string; professors: Professor[] };

type Rect = { x: number; y: number; w: number; h: number };
type Block = Rect & { id: number; start: number; end: number };
const blocks: Block[] = [
  { id: 1, x: 183, y: 304, w: 88, h: 540, start: 1, end: 13 },
  { id: 2, x: 565, y: 304, w: 88, h: 540, start: 1, end: 13 },
  { id: 3, x: 340, y: 500, w: 68, h: 312, start: 4, end: 7 },
  { id: 4, x: 408, y: 500, w: 68, h: 312, start: 4, end: 7 },
  { id: 3, x: 323, y: 812, w: 85, h: 334, start: 8, end: 13 },
  { id: 4, x: 408, y: 812, w: 85, h: 334, start: 8, end: 13 },
];
const levels = ["Planta baja", "Piso 1", "Piso 2"];
const floorHeight = 26;
const rectStyle = ({ x, y, w, h }: Rect) => ({ left: x, top: y, width: w, height: h });

function Box({ rect, bottom = 0, height, color, roof = color, className = "" }: { rect: Rect; bottom?: number; height: number; color: string; roof?: string; className?: string }) {
  return <div className={`model-box ${className}`} style={{ ...rectStyle(rect), transform: `translateZ(${bottom}px)` }}>
    <div className="model-face model-top" style={{ background: roof, transform: `translateZ(${height}px)` }} />
    <div className="model-face model-front" style={{ height, background: color, transform: "rotateX(90deg)" }} />
    <div className="model-face model-back" style={{ height, background: color, top: rect.h, transform: "rotateX(90deg)" }} />
    <div className="model-face model-left" style={{ width: height, background: color, transform: "rotateY(-90deg)" }} />
    <div className="model-face model-right" style={{ width: height, background: color, left: rect.w, transform: "rotateY(-90deg)" }} />
  </div>;
}
function Ground({ rect, className, children }: { rect: Rect; className: string; children?: React.ReactNode }) {
  return <div className={`model-ground ${className}`} style={rectStyle(rect)}>{children}</div>;
}
function Trees() {
  const trees = [[145,180],[110,260],[130,410],[110,520],[145,620],[125,760],[110,860],[135,1110],[160,1190],[700,180],[730,260],[690,370],[685,470],[690,580],[700,700],[715,820],[745,110],[825,115],[900,110],[955,200],[955,380],[955,570],[955,730],[950,940],[945,1120],[800,1120],[75,1170],[250,80],[350,70],[450,75],[545,70],[650,70]];
  return <>{trees.map(([x, y], i) => <div key={i} className="model-tree" style={{ left: x, top: y, transform: `translateZ(${6 + (i % 3) * 2}px)` }} />)}</>;
}
function Palapas({ x, y, rows }: { x: number; y: number; rows: number }) {
  return <>{Array.from({ length: rows * 3 }, (_, i) => <Box key={i} rect={{ x: x + (i % 3) * 22, y: y + Math.floor(i / 3) * 25, w: 14, h: 14 }} bottom={11} height={4} color="#afb8b2" roof="#e8e8df" className="palapa" />)}</>;
}
function CampusScene({ level, selected, onSelect }: { level: number | null; selected: string; onSelect: (id: string) => void }) {
  return <>
    <Ground rect={{ x: 0, y: 0, w: 1000, h: 1300 }} className="model-base" />
    <Ground rect={{ x: 755, y: 130, w: 210, h: 760 }} className="parking"><div className="parking-island island-a" /><div className="parking-island island-b" /><div className="parking-island island-c" /><div className="parking-island island-d" /></Ground>
    <Ground rect={{ x: 750, y: 930, w: 215, h: 310 }} className="parking-south" />
    {Array.from({ length: 34 }, (_, i) => <div key={i} className="model-car" style={{ left: 765 + (i % 5) * 39, top: 150 + Math.floor(i / 5) * 101 + (i % 2) * 14, background: ["#e9ece9", "#b5bcc0", "#536671", "#aa625c"][i % 4] }} />)}
    <Ground rect={{ x: 275, y: 340, w: 290, h: 165 }} className="plaza" />
    <Ground rect={{ x: 165, y: 105, w: 94, h: 155 }} className="paving" />
    <Ground rect={{ x: 570, y: 955, w: 98, h: 170 }} className="paving" />
    <Ground rect={{ x: 205, y: 945, w: 105, h: 190 }} className="court"><div className="court-lines" /></Ground>
    {/* Canchas al poniente de Gobierno, además de la cancha junto al bloque sur. */}
    <Ground rect={{ x: 25, y: 50, w: 120, h: 120 }} className="north-courts"><div className="north-court"><span /></div><div className="north-court"><span /></div></Ground>
    <Ground rect={{ x: 26, y: 178, w: 120, h: 48 }} className="exercise-area" />
    <Ground rect={{ x: 22, y: 232, w: 154, h: 11 }} className="orange-path" />
    <Ground rect={{ x: 155, y: 1210, w: 545, h: 28 }} className="walkway" />
    <Ground rect={{ x: 660, y: 125, w: 55, h: 1090 }} className="walkway" />
    <Trees />
    {/* Volúmenes independientes en el lado de las áreas verdes. */}
    <Box rect={{ x: 45, y: 1010, w: 82, h: 76 }} height={23} color="#ede7da" roof="#bd625e" className="cafeteria-block" />
    <Box rect={{ x: 92, y: 252, w: 52, h: 38 }} height={17} color="#e5dacc" roof="#bc7263" />
    {[0, 1, 2].map((i) => <Box key={`exercise-bar-${i}`} rect={{ x: 43 + i * 32, y: 190, w: 22, h: 3 }} bottom={12} height={3} color="#849790" roof="#d3dfd8" />)}
    {[43, 65, 75, 97, 107, 129].map((x) => <Box key={`exercise-post-${x}`} rect={{ x, y: 190, w: 3, h: 3 }} height={15} color="#899c94" roof="#dbe4de" />)}
    <Palapas x={177} y={125} rows={5} /><Palapas x={582} y={974} rows={5} />
    {/* Auditorio y los cuatro lados de Gobierno dejan el patio abierto. */}
    <Box rect={{ x: 360, y: 115, w: 120, h: 60 }} height={38} color="#e6e6dd" roof="#eeede4" className="auditorium-block" />
    {[{ x: 295, y: 175, w: 250, h: 65 }, { x: 295, y: 315, w: 250, h: 42 }, { x: 295, y: 240, w: 75, h: 75 }, { x: 470, y: 240, w: 75, h: 75 }].map((rect, i) => <Box key={`gov-${i}`} rect={rect} height={52} color="#f1f1e9" roof="#e3e2d9" className="government-block" />)}
    <Ground rect={{ x: 370, y: 240, w: 100, h: 75 }} className="courtyard"><span /></Ground>
    {/* Galería exterior con vacío real entre la fachada y el barandal. */}
    {[26, 52].map((height) => <Box key={`gov-gallery-floor-${height}`} rect={{ x: 295, y: 357, w: 250, h: 14 }} bottom={height - 3} height={3} color="#cfd4cb" roof="#f2f3eb" />)}
    {[26].map((height) => <Box key={`gov-gallery-rail-${height}`} rect={{ x: 295, y: 368, w: 250, h: 3 }} bottom={height} height={8} color="#e2e5dd" roof="#f3f4ee" />)}
    {[295, 345, 395, 445, 495, 542].map((x) => <Box key={`gov-gallery-column-${x}`} rect={{ x, y: 368, w: 3, h: 3 }} height={52} color="#d2d8d0" roof="#f4f5ed" />)}
    {/* Pretiles alrededor de la azotea y del patio; dejan el hueco abierto. */}
    {[{ x: 295, y: 175, w: 250, h: 4 }, { x: 295, y: 353, w: 250, h: 4 }, { x: 295, y: 179, w: 4, h: 174 }, { x: 541, y: 179, w: 4, h: 174 }, { x: 370, y: 236, w: 100, h: 4 }, { x: 370, y: 315, w: 100, h: 4 }, { x: 366, y: 240, w: 4, h: 75 }, { x: 470, y: 240, w: 4, h: 75 }].map((rect, i) => <Box key={`parapet-${i}`} rect={rect} bottom={52} height={5} color="#d1d2ca" roof="#f8f8f1" />)}
    {[{ x: 317, y: 196, w: 18, h: 11 }, { x: 502, y: 202, w: 17, h: 12 }, { x: 322, y: 325, w: 15, h: 10 }, { x: 497, y: 325, w: 15, h: 10 }].map((rect, i) => <Box key={`roof-unit-${i}`} rect={rect} bottom={52} height={5} color="#a9b3b0" roof="#e7e9e0" />)}
    {/* Acceso al auditorio y escalinata de la fachada norte. */}
    {[0, 1, 2].map((step) => <Box key={`auditorium-step-${step}`} rect={{ x: 376 - step * 4, y: 158 + step * 5, w: 88 + step * 8, h: 5 }} height={3 + (2 - step) * 2} color="#c5c9c2" roof="#e6e7dd" />)}
    {/* Escaleras y plataformas de los extremos. */}
    <Box rect={{ x: 315, y: 1128, w: 185, h: 28 }} height={8} color="#aeb4ae" roof="#d9d9ce" />
    {blocks.map((block) => {
      const visibleFloors = level === null ? 3 : level + 1;
      const corridorWidth = 14;
      const corridorOnRight = block.id === 1 || block.id === 4;
      const corridorX = corridorOnRight ? block.x + block.w - corridorWidth : block.x;
      const core = { ...block, x: block.x + (corridorOnRight ? 0 : corridorWidth), w: block.w - corridorWidth };
      return <div key={`${block.id}-${block.start}`} className="model-group">
        {Array.from({ length: visibleFloors }, (_, floor) => <div key={floor} className="model-group">
          <Box rect={core} bottom={floor * floorHeight} height={floorHeight} color="#e8e9e1" roof={level !== null && floor === level ? "#e9e5d7" : "#b9756c"} className="school-block" />
          <Box rect={{ x: corridorX, y: block.y, w: corridorWidth, h: block.h }} bottom={floor * floorHeight} height={3} color="#c6ccc5" roof="#e6e8df" />
          <Box rect={{ x: corridorOnRight ? corridorX + corridorWidth - 3 : corridorX, y: block.y, w: 3, h: block.h }} bottom={floor * floorHeight + 3} height={8} color="#d9ded6" roof="#f3f4ed" />
          {Array.from({ length: Math.ceil(block.h / 80) + 1 }, (_, i) => <Box key={i} rect={{ x: corridorOnRight ? corridorX + corridorWidth - 3 : corridorX, y: Math.min(block.y + i * 80, block.y + block.h - 3), w: 3, h: 3 }} bottom={floor * floorHeight + 3} height={floorHeight - 3} color="#d5d9d1" roof="#f3f4ed" />)}
          {floor === visibleFloors - 1 && level === null && <Box rect={{ x: corridorX, y: block.y, w: corridorWidth, h: block.h }} bottom={(floor + 1) * floorHeight - 3} height={3} color="#d3d7cf" roof="#b9756c" />}
        </div>)}
        {level !== null && Array.from({ length: block.end - block.start + 1 }, (_, i) => {
          const code = `${block.id}${level}${String(block.start + i).padStart(2, "0")}`;
          const h = block.h / (block.end - block.start + 1);
          return <button key={code} type="button" aria-label={`Salón ${code}`} aria-pressed={code === selected} title={`Salón ${code}`} onClick={() => onSelect(code)} className={`room-tile ${code === selected ? "selected" : ""}`} style={{ left: core.x + 3, top: block.y + i * h + 3, width: core.w - 6, height: h - 6, transform: `translateZ(${visibleFloors * floorHeight + 1}px)` }}><span>{String(block.start + i).padStart(2, "0")}</span></button>;
        })}
      </div>;
    })}
    {/* Alas en los extremos del bloque central, visibles en la foto. */}
    {[{ x: 303, y: 812, w: 20, h: 55 }, { x: 493, y: 812, w: 20, h: 55 }, { x: 303, y: 1095, w: 20, h: 51 }, { x: 493, y: 1095, w: 20, h: 51 }].map((rect, i) => <Box key={`wing-${i}`} rect={rect} height={(level === null ? 3 : level + 1) * floorHeight} color="#d2d3cc" roof="#b9756c" />)}
    {(level === null ? [1, 2] : level > 0 ? [level] : []).flatMap((floor) => [545, 780].flatMap((y) => [{ x: 271, y, w: 69, h: 23 }, { x: 476, y, w: 89, h: 23 }].map((rect, i) => <Box key={`${floor}-${y}-${i}`} rect={rect} bottom={floor * floorHeight - 3} height={7} color="#a4b0af" roof="#d7ddd6" />)))}
    {level === null && <Ground rect={{ x: 359, y: 672, w: 100, h: 90 }} className="solar" />}
    <div className="model-label landmark-label" style={{ left: 49, top: 1033, transform: "translateZ(25px)" }}>CAFETERÍA</div>
    <div className="model-label landmark-label" style={{ left: 93, top: 264, transform: "translateZ(19px)" }}>CAFÉ</div>
    <div className="model-label landmark-label" style={{ left: 53, top: 175, transform: "translateZ(3px)" }}>BARRAS</div>
    <div className="model-label landmark-label" style={{ left: 50, top: 42, transform: "translateZ(3px)" }}>CANCHAS</div>
    <div className="model-label" style={{ left: 390, top: 95, transform: "translateZ(50px)" }}>AUDITORIO</div>
    <div className="model-label" style={{ left: 377, top: 188, transform: "translateZ(55px)" }}>GOBIERNO</div>
    <div className="model-label" style={{ left: 368, top: 385, transform: "translateZ(3px)" }}>EXPLANADA</div>
  </>;
}

export function CampusMap({ roomInfo, professors, canEdit }: { roomInfo: RoomInfo[]; professors: Professor[]; canEdit: boolean }) {
  const [level, setLevel] = useState<number | null>(null);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [angle, setAngle] = useState(-25);
  const [tilt, setTilt] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(800);
  const [view, setView] = useState<"model" | "plan">("model");
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; angle: number; tilt: number } | null>(null);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    const wheel = (event: WheelEvent) => { event.preventDefault(); setZoom((value) => Math.max(.7, Math.min(1.6, value - event.deltaY * .001))); };
    observer.observe(node);
    node.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); node.removeEventListener("wheel", wheel); };
  }, [view]);
  const rooms = [1, 2, 3, 4].flatMap((b) => Array.from({ length: b < 3 ? 13 : 10 }, (_, i) => `${b}${level ?? 0}${String(i + (b < 3 ? 1 : 4)).padStart(2, "0")}`));
  const selectedRoom = roomInfo.find((room) => room.code === selected);
  const normalized = query.trim().toLocaleLowerCase("es-MX");
  const matches = normalized ? roomInfo.filter((room) => `${room.code} ${room.name} ${room.professors.map((p) => p.name).join(" ")}`.toLocaleLowerCase("es-MX").includes(normalized)) : [];
  const kindLabel: Record<string, string> = { salon: "Salón", laboratorio: "Laboratorio", cubiculo: "Cubículo", otro: "Espacio" };
  return <div className="space-y-3">
    {view === "model" ? <div ref={viewport} className="model-viewport" tabIndex={0} role="region" aria-label="Mapa 3D: flechas para girar e inclinar, más y menos para acercar o alejar" onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "ArrowLeft") setAngle((value) => value - 10);
      else if (event.key === "ArrowRight") setAngle((value) => value + 10);
      else if (event.key === "ArrowUp") setTilt((value) => Math.min(70, value + 5));
      else if (event.key === "ArrowDown") setTilt((value) => Math.max(5, value - 5));
      else if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(1.6, value + .1));
      else if (event.key === "-") setZoom((value) => Math.max(.7, value - .1));
      else return;
      event.preventDefault();
    }} onPointerDown={(event) => { if ((event.target as Element).closest("button")) return; drag.current = { x: event.clientX, y: event.clientY, angle, tilt }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!drag.current) return; setAngle(drag.current.angle + (event.clientX - drag.current.x) * .4); setTilt(Math.max(5, Math.min(70, drag.current.tilt - (event.clientY - drag.current.y) * .25))); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="model-world" style={{ transform: `translate(-50%, -50%) scale(${Math.min(width / 1450, .72) * zoom}) rotateX(${tilt}deg) rotateZ(${angle}deg)` }}><CampusScene level={level} selected={selected} onSelect={setSelected} /></div>
      <div className="model-north" aria-label="Dirección del norte">N <span style={{ display: "inline-block", transform: `rotate(${Math.atan2(Math.sin(angle * Math.PI / 180), Math.cos(angle * Math.PI / 180) * Math.cos(tilt * Math.PI / 180)) * 180 / Math.PI}deg)` }}>↑</span></div>
    </div> : <figure className="overflow-hidden rounded-xl border bg-white"><img src="/demo/croquis-campus.webp" alt="Croquis anterior del campus ESCOM" className="h-auto w-full" /><figcaption className="p-3 text-xs text-[#5f6e78]">Croquis anterior, con identificaciones que pueden diferir del modelo.</figcaption></figure>}
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-[#50636d]">Arrastra para girar · rueda o botones para acercar · usa las flechas del teclado</p><div className="flex gap-1 rounded bg-[#e9f0f2] p-1"><button type="button" onClick={() => setView("model")} aria-pressed={view === "model"} className="rounded px-3 py-2 text-xs font-bold aria-pressed:bg-white">Modelo 3D</button><button type="button" onClick={() => setView("plan")} aria-pressed={view === "plan"} className="rounded px-3 py-2 text-xs font-bold aria-pressed:bg-white">Croquis anterior</button></div></div>
    {view === "model" && <div className="space-y-4 rounded-xl border border-[#d4e2e4] bg-white p-4">
      <div role="group" aria-label="Controles de la vista" className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Alejar mapa" onClick={() => setZoom((value) => Math.max(.7, value - .1))} disabled={zoom <= .7} className="min-h-11 min-w-11 rounded border border-[#c6d8da] text-lg font-bold text-[#006699] disabled:opacity-40">−</button>
        <button type="button" aria-label="Acercar mapa" onClick={() => setZoom((value) => Math.min(1.6, value + .1))} disabled={zoom >= 1.6} className="min-h-11 min-w-11 rounded border border-[#c6d8da] text-lg font-bold text-[#006699] disabled:opacity-40">+</button>
        <button type="button" onClick={() => { setAngle(-25); setTilt(50); setZoom(1); }} className="min-h-11 rounded px-3 text-sm font-bold text-[#006699] hover:bg-[#eef3f4]">Centrar vista</button>
      </div>
      <div role="group" aria-label="Pisos del mapa" className="flex flex-wrap gap-2">{[{ label: "Vista completa", value: null }, ...levels.map((label, value) => ({ label, value }))].map((item) => <button key={item.label} type="button" aria-pressed={level === item.value} onClick={() => { setLevel(item.value); setSelected(""); }} className={`min-h-10 rounded px-3 text-sm font-bold ${level === item.value ? "bg-[#006699] text-white" : "bg-[#eef3f4] text-[#355360]"}`}>{item.label}</button>)}</div>
      {level !== null && <div className="flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 text-sm font-bold">Buscar salón<select value={selected} onChange={(e) => setSelected(e.target.value)} className="mt-1 block min-h-11 w-full rounded border border-[#bfcdd0] bg-white px-3 font-normal"><option value="">Selecciona un salón</option>{rooms.map((code) => <option key={code}>{code}</option>)}</select></label><p className="min-w-48 flex-1 text-sm" aria-live="polite">{selected ? `Espacio ${selected} · Edificio ${selected[0]} · ${levels[level]}` : "Selecciona un espacio en el modelo o en la lista."}</p></div>}
    </div>}
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <section className="board-sidecard p-4"><h2 className="text-lg font-extrabold text-[#1b4053]">Buscar personas o espacios</h2><label className="mt-3 block text-sm font-bold">Nombre o número<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Profesor, laboratorio o salón" className="mt-1 min-h-11 w-full rounded border border-[#bdcece] bg-white px-3 font-normal" /></label>
        {normalized && (matches.length ? <ul className="mt-2 space-y-1">{matches.map((room) => <li key={room.code}><button type="button" onClick={() => { setView("model"); setLevel(Number(room.code[1])); setSelected(room.code); }} className="w-full rounded border border-[#dce5e2] p-3 text-left text-sm hover:bg-[#edf5f5]"><strong>{room.name || `${kindLabel[room.kind] ?? "Espacio"} ${room.code}`}</strong><span className="block text-[#5f6e78]">{room.code} · {room.professors.map((p) => p.name).join(", ") || "Sin profesores registrados"}</span></button></li>)}</ul> : <p className="mt-3 text-sm text-[#5f6e78]">No encontramos coincidencias en las fichas del mapa.</p>)}
      </section>
      <section className="board-sidecard p-4" aria-live="polite">{selected ? <><p className="board-eyebrow">Edificio {selected[0]} · {levels[Number(selected[1])]}</p><h2 className="mt-1 text-xl font-extrabold text-[#1b4053]">{selectedRoom?.name || `${selectedRoom ? kindLabel[selectedRoom.kind] : "Espacio"} ${selected}`}</h2><p className="mt-1 text-sm font-bold text-[#006699]">{selectedRoom ? kindLabel[selectedRoom.kind] : "Tipo sin registrar"} · {selected}</p><p className="mt-3 text-sm leading-6 text-[#5f6e78]">{selectedRoom?.description || "Aún no se ha registrado información sobre este espacio."}</p><h3 className="mt-4 text-sm font-extrabold">Profesores relacionados</h3>{selectedRoom?.professors.length ? <ul className="mt-2 space-y-1 text-sm text-[#365767]">{selectedRoom.professors.map((p) => <li key={p.id}>{p.name}</li>)}</ul> : <p className="mt-1 text-sm text-[#5f6e78]">No hay profesores registrados en esta ficha.</p>}{canEdit && <RoomEditor key={selected} code={selected} room={selectedRoom} professors={professors} />}</> : <><h2 className="text-lg font-extrabold text-[#1b4053]">Explora un espacio</h2><p className="mt-2 text-sm leading-6 text-[#5f6e78]">Elige un piso y selecciona un espacio en el mapa para consultar su ficha y profesores.</p></>}</section>
    </div>
    <p className="text-xs leading-5 text-[#5f6e78]">Modelo orientativo trazado a partir de las fotos compartidas. Las alturas, detalles y divisiones de salones son aproximados y se pueden afinar con más referencias.</p>
  </div>;
}
