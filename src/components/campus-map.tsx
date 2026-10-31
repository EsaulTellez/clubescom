"use client";

import { useState } from "react";

type Building = {
  name: string;
  label: string[];
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  roof: string;
  left: string;
  right: string;
};

const buildings: Building[] = [
  { name: "Edificio 2, salones 2XYZ", label: ["EDIFICIO 2", "Salones 2XYZ"], x: 34, y: 3, w: 22, d: 16, h: 37, roof: "#b9a8ff", left: "#7764c9", right: "#5b4da9" },
  { name: "Edificio 4, salones 2XYZ", label: ["EDIFICIO 4", "Salones 2XYZ"], x: 62, y: 3, w: 22, d: 16, h: 32, roof: "#a4dff1", left: "#5fa6c7", right: "#417eaa" },
  { name: "Auditorio", label: ["AUDITORIO"], x: 4, y: 24, w: 15, d: 24, h: 33, roof: "#ffca91", left: "#d88c62", right: "#b96856" },
  { name: "Edificio de Gobierno", label: ["GOBIERNO"], x: 18, y: 22, w: 17, d: 28, h: 46, roof: "#f2acbd", left: "#c96e8f", right: "#a64f73" },
  { name: "Edificio de Laboratorios", label: ["LABORATORIOS"], x: 59, y: 24, w: 24, d: 25, h: 42, roof: "#95dec3", left: "#4fae91", right: "#38836f" },
  { name: "Edificio 5, salones 3XYZ y 4XYZ", label: ["EDIFICIO 5", "Salones 3XYZ · 4XYZ"], x: 84, y: 24, w: 14, d: 25, h: 36, roof: "#f1c57c", left: "#c39048", right: "#9b6c35" },
  { name: "Área de estudio", label: ["ESTUDIO"], x: 3, y: 58, w: 29, d: 15, h: 5, roof: "#bfdf9f", left: "#7fad6c", right: "#648b57" },
  { name: "Edificio 1, salones 1XYZ", label: ["EDIFICIO 1", "Salones 1XYZ"], x: 34, y: 59, w: 23, d: 14, h: 32, roof: "#a9c7ff", left: "#6588cb", right: "#4c69a8" },
  { name: "Edificio 3, salones 1XYZ", label: ["EDIFICIO 3", "Salones 1XYZ"], x: 60, y: 59, w: 23, d: 14, h: 32, roof: "#e3b1f4", left: "#aa72c1", right: "#85529e" },
  { name: "Área deportiva norte", label: ["CANCHAS"], x: 84, y: 57, w: 14, d: 16, h: 5, roof: "#9bdaa9", left: "#5da979", right: "#44895f" },
  { name: "Área deportiva sur", label: ["ÁREA DEPORTIVA"], x: 2, y: 79, w: 26, d: 15, h: 5, roof: "#9bdaa9", left: "#5da979", right: "#44895f" },
  { name: "Barra de café", label: ["BARRA DE CAFÉ"], x: 30, y: 80, w: 8, d: 13, h: 11, roof: "#f4b991", left: "#ce846b", right: "#a96558" },
  { name: "Cafetería", label: ["CAFETERÍA"], x: 81, y: 79, w: 17, d: 15, h: 15, roof: "#f7d59a", left: "#d6a55b", right: "#b07d3e" },
];

function iso(x: number, y: number, z = 0) {
  return [450 + (x - y) * 4, 76 + (x + y) * 1.55 - z] as const;
}
function points(coords: readonly (readonly [number, number])[]) {
  return coords.map(([x, y]) => `${x},${y}`).join(" ");
}
function BuildingBlock({ building }: { building: Building }) {
  const b = building;
  const a = iso(b.x, b.y, b.h);
  const c = iso(b.x + b.w, b.y, b.h);
  const d = iso(b.x + b.w, b.y + b.d, b.h);
  const e = iso(b.x, b.y + b.d, b.h);
  const c0 = iso(b.x + b.w, b.y);
  const d0 = iso(b.x + b.w, b.y + b.d);
  const e0 = iso(b.x, b.y + b.d);
  const center: readonly [number, number] = [
    (a[0] + c[0] + d[0] + e[0]) / 4,
    (a[1] + c[1] + d[1] + e[1]) / 4,
  ];
  const lineHeight = b.label.length > 1 ? 12 : 14;
  const labelTop = center[1] - ((b.label.length - 1) * lineHeight) / 2 + 2;
  return (
    <g className="campus-building">
      <title>{b.name}</title>
      <polygon points={points([c, d, d0, c0])} fill={b.right} />
      <polygon points={points([e, d, d0, e0])} fill={b.left} />
      <polygon className="campus-roof" points={points([a, c, d, e])} fill={b.roof} stroke="rgba(255,255,255,.88)" strokeWidth="1.5" />
      <path d={`M ${a[0] + 8} ${a[1] + 7} L ${c[0] - 8} ${c[1] + 7}`} stroke="rgba(255,255,255,.58)" strokeWidth="3" strokeLinecap="round" />
      {b.label.map((line, i) => (
        <text key={line} x={center[0]} y={labelTop + i * lineHeight} textAnchor="middle" className={i === 0 ? "fill-[#29263e] text-[10px] font-extrabold tracking-[.08em]" : "fill-[#514c67] text-[8px] font-semibold"}>
          {line}
        </text>
      ))}
      <path d={`M ${e[0] + 8} ${e[1] + 13} l 8 -3 m 3 2 l 8 -3 m 3 2 l 8 -3`} stroke="rgba(255,255,255,.65)" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

export function CampusMap() {
  const [view, setView] = useState<"isometric" | "plan">("isometric");
  const campus = [[450, 76], [850, 231], [490, 369], [90, 214]] as const;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-1 rounded-full bg-[#f0eff7] p-1" role="group" aria-label="Vista del mapa">
        <button type="button" aria-pressed={view === "isometric"} onClick={() => setView("isometric")} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${view === "isometric" ? "bg-white text-[#5141e5] shadow-sm" : "text-[#74788a] hover:text-[#5141e5]"}`}>Vista 3D</button>
        <button type="button" aria-pressed={view === "plan"} onClick={() => setView("plan")} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${view === "plan" ? "bg-white text-[#5141e5] shadow-sm" : "text-[#74788a] hover:text-[#5141e5]"}`}>Croquis</button>
      </div>
      {view === "isometric" ? (
        <div className="overflow-hidden rounded-[28px] border border-white bg-gradient-to-br from-[#f0efff] via-[#f6f5ff] to-[#e2f5f5] p-2 shadow-inner sm:p-4">
          <svg viewBox="20 35 860 390" role="img" aria-label="Vista isométrica ilustrativa del campus ESCOM, con edificios, explanada, auditorio, áreas deportivas, cafetería y laboratorios" className="h-auto w-full overflow-visible">
            <defs>
              <linearGradient id="campus-ground" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f9f7ff"/><stop offset="1" stopColor="#dff3ed"/></linearGradient>
              <filter id="campus-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#524d81" floodOpacity=".18"/></filter>
              <pattern id="campus-grid" width="24" height="24" patternTransform="matrix(.93 .36 -.93 .36 0 0)" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#b7cfc7" strokeOpacity=".28" strokeWidth="1"/></pattern>
            </defs>
            <g filter="url(#campus-shadow)">
              <polygon points={points(campus)} fill="url(#campus-ground)" stroke="#fff" strokeWidth="8" strokeLinejoin="round" />
              <polygon points={points(campus)} fill="url(#campus-grid)" />
            </g>
            <path d={`M ${iso(19, 51).join(" ")} Q ${iso(41, 53).join(" ")} ${iso(57, 50).join(" ")} T ${iso(84, 50).join(" ")}`} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" opacity=".82" />
            <path d={`M ${iso(47, 18).join(" ")} Q ${iso(47, 41).join(" ")} ${iso(48, 58).join(" ")}`} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity=".76" />
            <polygon points={points([iso(37, 31), iso(58, 31), iso(58, 52), iso(37, 52)])} fill="#fff3ce" stroke="#fff" strokeWidth="2" opacity=".9" />
            <text x={iso(47, 42)[0]} y={iso(47, 42)[1]} textAnchor="middle" className="fill-[#917a46] text-[10px] font-extrabold tracking-[.18em]">EXPLANADA</text>
            <g opacity=".65" fill="#80bf9b">
              {[ [8,53],[13,55],[28,54],[55,54],[88,53],[94,53],[8,74],[14,75],[76,75],[97,74],[45,83],[53,82] ].map(([x,y]) => {
                const [cx, cy] = iso(x, y);
                return <g key={`${x}-${y}`}><circle cx={cx} cy={cy - 5} r="5"/><rect x={cx - 1.5} y={cy - 5} width="3" height="9" rx="1" fill="#ad8d71"/></g>;
              })}
            </g>
            {buildings.map((building) => <BuildingBlock key={building.name} building={building} />)}
            <g transform="translate(700 55)"><circle r="20" fill="#ffffff" fillOpacity=".72"/><path d="M0-10 6 3 0 0-6 3 0-10ZM0 0v12" fill="#6d5dfc" stroke="#6d5dfc" strokeWidth="2" strokeLinejoin="round"/><text y="30" textAnchor="middle" className="fill-[#77738c] text-[8px] font-bold">N</text></g>
          </svg>
        </div>
      ) : (
        <figure className="overflow-hidden rounded-[28px] border border-white bg-white shadow-[0_12px_35px_rgba(40,38,80,0.09)]">
          <img src="/demo/croquis-campus.webp" alt="Croquis general de ESCOM con edificios, explanada, auditorio, laboratorios, cafetería y áreas deportivas." className="h-auto w-full" />
          <figcaption className="border-t border-[#f0eff7] px-4 py-2.5 text-xs text-[#777c8d]">Plano de referencia compartido por la comunidad ESCOM.</figcaption>
        </figure>
      )}
      <p className="px-1 text-xs leading-5 text-[#777c8d]">Vista isométrica ilustrativa, reconstruida a partir del croquis. Para ubicar un salón, confirma edificio y nivel en el plano de referencia.</p>
      <figure className="group overflow-hidden rounded-[26px] border border-white/90 bg-white/85 shadow-[0_10px_34px_rgba(40,38,80,0.07)]">
        <img src="/demo/explanada-escom.webp" alt="Explanada principal de la Escuela Superior de Cómputo." className="h-48 w-full object-cover transition duration-500 group-hover:scale-[1.02] sm:h-64" />
        <figcaption className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="text-sm font-bold text-[#36374b]">Así se ve la explanada</span>
          <a href="https://www.escom.ipn.mx/nuevoingreso26_2/" target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#6d5dfc] hover:underline">Foto del sitio oficial ESCOM ↗</a>
        </figcaption>
      </figure>
    </div>
  );
}
