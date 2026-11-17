"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import "./campus-map.css";
import { RoomEditor } from "@/app/mapa/room-editor";
import {
  assignSelfToRoom,
  resolveRoomSuggestion,
  suggestProfessorInRoom,
  voteRoomSuggestion,
} from "@/app/mapa/actions";

export type Professor = { id: string; name: string };
export type ProfessorDirectoryItem = {
  id: string;
  name: string;
  room_code: string | null;
  location: string | null;
};
export type RoomSuggestion = {
  id: string;
  room_code: string;
  professor_id: string;
  professor_name: string;
  suggested_by: string;
  suggested_by_name: string;
  note: string;
  upvotes: number;
  downvotes: number;
  my_vote: number;
};
export type RoomInfo = {
  code: string;
  kind: string;
  name: string;
  description: string;
  professors: Professor[];
  suggestions: RoomSuggestion[];
};
export type CurrentViewer = {
  id: string;
  name: string;
  role: "alumno" | "profesor" | "moderador" | "admin";
} | null;

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

export const GOBIERNO_SPACES: Array<{
  code: string;
  floor: number;
  shortLabel: string;
  coordLabel: string;
  rects: Rect[];
}> = [
  {
    code: "G000",
    floor: 0,
    shortLabel: "CAJERO BBVA · ESCALERAS",
    coordLabel: "Entrada sur · Centro en eje X",
    rects: [{ x: 384, y: 315, w: 72, h: 40 }],
  },
  {
    code: "G005",
    floor: 0,
    shortLabel: "ENFERMERÍA · DENTISTA · PSICÓLOGO",
    coordLabel: "Ala poniente · Entre Gestión y Biblioteca",
    rects: [{ x: 299, y: 241, w: 70, h: 50 }],
  },
  {
    code: "G002",
    floor: 0,
    shortLabel: "GESTIÓN ESCOLAR",
    coordLabel: "Ala norte · Esquina poniente",
    rects: [{ x: 299, y: 179, w: 70, h: 61 }],
  },
  {
    code: "G003",
    floor: 0,
    shortLabel: "PASILLO · PUERTAS AUDITORIO",
    coordLabel: "Ala norte · Centro (acceso Auditorio)",
    rects: [{ x: 371, y: 175, w: 98, h: 64 }],
  },
  {
    code: "G004",
    floor: 0,
    shortLabel: "MESAS Y SILLAS · ENTRADA BIB/AUD",
    coordLabel: "Ala norte/oriente · Entrada Bib. y Aud.",
    rects: [{ x: 470, y: 179, w: 71, h: 109 }],
  },
  {
    code: "G001",
    floor: 0,
    shortLabel: "BIBLIOTECA ESCOM",
    coordLabel: "Ala sur · Flanqueando escaleras y BBVA",
    rects: [
      { x: 299, y: 292, w: 83, h: 61 },
      { x: 458, y: 289, w: 83, h: 64 },
    ],
  },
  {
    code: "G006",
    floor: 0,
    shortLabel: "AUDITORIO",
    coordLabel: "Acceso norte por puertas centrales",
    rects: [{ x: 363, y: 118, w: 114, h: 54 }],
  },
  {
    code: "G101",
    floor: 1,
    shortLabel: "SUBDIRECCIÓN ACADÉMICA · SALA 14",
    coordLabel: "Piso 1 · Ala poniente",
    rects: [{ x: 298, y: 240, w: 72, h: 75 }],
  },
  {
    code: "G102",
    floor: 1,
    shortLabel: "DIRECCIÓN Y CONSEJO",
    coordLabel: "Piso 1 · Ala norte",
    rects: [{ x: 298, y: 178, w: 244, h: 60 }],
  },
  {
    code: "G103",
    floor: 1,
    shortLabel: "BECAS · SERVICIOS EDUCATIVOS · CATT",
    coordLabel: "Piso 1 · Ala oriente",
    rects: [{ x: 470, y: 240, w: 72, h: 75 }],
  },
  {
    code: "G104",
    floor: 1,
    shortLabel: "SUBDIRECCIÓN ADMINISTRATIVA",
    coordLabel: "Piso 1 · Ala sur (salida escaleras)",
    rects: [{ x: 298, y: 317, w: 244, h: 37 }],
  },
];

const rectStyle = ({ x, y, w, h }: Rect) => ({ left: x, top: y, width: w, height: h });

function Box({
  rect,
  bottom = 0,
  height,
  color,
  roof = color,
  className = "",
  topContent,
}: {
  rect: Rect;
  bottom?: number;
  height: number;
  color: string;
  roof?: string;
  className?: string;
  topContent?: React.ReactNode;
}) {
  return (
    <div className={`model-box ${className}`} style={{ ...rectStyle(rect), transform: `translateZ(${bottom}px)` }}>
      <div className="model-face model-top" style={{ background: roof, transform: `translateZ(${height}px)` }}>
        {topContent}
      </div>
      <div className="model-face model-front" style={{ height, background: color, transform: "rotateX(90deg)" }} />
      <div className="model-face model-back" style={{ height, background: color, top: rect.h, transform: "rotateX(90deg)" }} />
      <div className="model-face model-left" style={{ width: height, background: color, transform: "rotateY(-90deg)" }} />
      <div className="model-face model-right" style={{ width: height, background: color, left: rect.w, transform: "rotateY(-90deg)" }} />
    </div>
  );
}

function Ground({ rect, className, children }: { rect: Rect; className: string; children?: React.ReactNode }) {
  return (
    <div className={`model-ground ${className}`} style={rectStyle(rect)}>
      {children}
    </div>
  );
}

function Trees() {
  const trees: Array<[number, number, number]> = [
    [145, 180, 1.05], [110, 260, 0.95], [130, 410, 1.1], [110, 520, 1.0], [145, 620, 1.15],
    [125, 760, 0.92], [110, 860, 1.08], [135, 1110, 1.0], [160, 1190, 1.12],
    [700, 180, 1.06], [730, 260, 0.95], [690, 370, 1.1], [685, 470, 1.0], [690, 580, 1.14],
    [700, 700, 0.96], [715, 820, 1.05], [745, 110, 1.0], [825, 115, 1.1], [900, 110, 0.95],
    [955, 200, 1.08], [955, 380, 1.0], [955, 570, 1.12], [955, 730, 0.96], [950, 940, 1.05],
    [945, 1120, 1.1], [800, 1120, 0.98], [75, 1170, 1.08], [250, 80, 1.04], [330, 70, 1.12],
    [500, 75, 1.06], [575, 70, 0.96], [650, 70, 1.1],
    [290, 420, 0.92], [535, 420, 0.92], [295, 920, 1.04], [520, 920, 1.02],
  ];
  const palettes = [
    { low: "#366942", mid: "#4c8755", top: "#72b073" },
    { low: "#2f5e3d", mid: "#437a50", top: "#639e6b" },
    { low: "#3f6d3a", mid: "#588c4e", top: "#7eb86d" },
  ];
  return (
    <>
      {trees.map(([x, y, scale], i) => {
        const pal = palettes[i % palettes.length];
        const trunkH = Math.round(12 * scale);
        return (
          <div key={i} className="model-tree-3d" style={{ left: x, top: y }}>
            <div className="tree-shadow" />
            {/* Tronco 3D real */}
            <Box
              rect={{ x: 14, y: 14, w: 6, h: 6 }}
              bottom={0}
              height={trunkH}
              color="#6b4c35"
              roof="#593e2b"
            />
            {/* Planos verticales cruzados para dar volumen 3D real al inclinar la cámara */}
            <div
              className="tree-plane-x"
              style={{
                background: `radial-gradient(circle at 50% 35%, ${pal.top}, ${pal.low} 80%)`,
              }}
            />
            <div
              className="tree-plane-y"
              style={{
                background: `radial-gradient(circle at 50% 35%, ${pal.top}, ${pal.low} 80%)`,
              }}
            />
            {/* Capas horizontales escalonadas de copa 3D */}
            <div
              className="tree-canopy-layer"
              style={{
                left: 1,
                top: 1,
                width: 32 * scale,
                height: 32 * scale,
                background: `radial-gradient(circle at 35% 30%, ${pal.mid}, ${pal.low} 80%)`,
                transform: `translateZ(${trunkH}px)`,
              }}
            />
            <div
              className="tree-canopy-layer"
              style={{
                left: 5,
                top: 5,
                width: 24 * scale,
                height: 24 * scale,
                background: `radial-gradient(circle at 35% 30%, ${pal.top}, ${pal.mid} 82%)`,
                transform: `translateZ(${trunkH + 7}px)`,
              }}
            />
            <div
              className="tree-canopy-layer"
              style={{
                left: 9,
                top: 9,
                width: 15 * scale,
                height: 15 * scale,
                background: `radial-gradient(circle at 40% 35%, #9bd18b, ${pal.top} 85%)`,
                transform: `translateZ(${trunkH + 13}px)`,
              }}
            />
          </div>
        );
      })}
    </>
  );
}

function Palapas({ x, y, rows }: { x: number; y: number; rows: number }) {
  return (
    <>
      {Array.from({ length: rows * 3 }, (_, i) => {
        const px = x + (i % 3) * 22;
        const py = y + Math.floor(i / 3) * 25;
        return (
          <div key={i} className="model-group">
            <Box rect={{ x: px + 5, y: py + 5, w: 4, h: 4 }} bottom={0} height={11} color="#7c634c" roof="#6b5440" />
            <Box rect={{ x: px + 3, y: py + 3, w: 8, h: 8 }} bottom={4} height={2} color="#c7baa5" roof="#dfd5c3" />
            <Box rect={{ x: px, y: py, w: 14, h: 14 }} bottom={11} height={4} color="#9fa9a3" roof="#e6e6dc" className="palapa" />
          </div>
        );
      })}
    </>
  );
}

function Cars3D() {
  const colors = [
    { body: "#e2e6e8", roof: "#f4f6f7" },
    { body: "#35536b", roof: "#4c6e88" },
    { body: "#9c443e", roof: "#b85852" },
    { body: "#5d686e", roof: "#7b878e" },
    { body: "#d5c7a3", roof: "#e6dac0" },
  ];
  return (
    <>
      {Array.from({ length: 34 }, (_, i) => {
        const cx = 765 + (i % 5) * 39;
        const cy = 150 + Math.floor(i / 5) * 101 + (i % 2) * 14;
        const c = colors[i % colors.length];
        return (
          <div key={i} className="model-group">
            <Box rect={{ x: cx, y: cy, w: 12, h: 22 }} bottom={1} height={4} color={c.body} roof={c.roof} />
            <Box rect={{ x: cx + 1.5, y: cy + 5, w: 9, h: 11 }} bottom={5} height={3} color="#334155" roof={c.roof} />
          </div>
        );
      })}
    </>
  );
}

function GobiernoBuilding3D({
  level,
  selected,
  onSelect,
  infoMap,
}: {
  level: number | null;
  selected: string;
  onSelect: (code: string, targetLevel?: number) => void;
  infoMap: Map<string, RoomInfo>;
}) {
  // Si el usuario elige Planta Baja (level === 0), cortamos el edificio de Gobierno a 1 piso (26px)
  // conservando el patio central abierto (370..470, 240..315) y representando cada espacio en 3D:
  // - Sur-centro (eje X centrado, abajo en eje Y): Escaleras en medio círculo + Cajero BBVA en mini, entre Biblioteca
  // - Poniente: Gestión Escolar (norte) y Enfermería / Dentista / Psicólogo (centro-izquierda)
  // - Norte-centro: Pasillo y Puertas dobles del Auditorio
  // - Norte-oriente: Mesas y sillas en el vestíbulo de entrada a Biblioteca y Auditorio
  if (level === 0) {
    const h = floorHeight;
    const pbSpaces = GOBIERNO_SPACES.filter((s) => s.floor === 0);
    return (
      <div className="model-group">
        {/* Pisos de las 4 alas de Planta Baja dejando el cuadro central (patio) abierto */}
        <Box rect={{ x: 295, y: 175, w: 250, h: 65 }} bottom={0} height={3} color="#d6d8cf" roof="#eeefe7" />
        <Box rect={{ x: 295, y: 240, w: 75, h: 75 }} bottom={0} height={3} color="#d6d8cf" roof="#eeefe7" />
        <Box rect={{ x: 470, y: 240, w: 75, h: 75 }} bottom={0} height={3} color="#d6d8cf" roof="#eeefe7" />
        <Box rect={{ x: 295, y: 315, w: 250, h: 42 }} bottom={0} height={3} color="#d6d8cf" roof="#eeefe7" />
        <Box rect={{ x: 360, y: 115, w: 120, h: 60 }} bottom={0} height={3} color="#cfd2c9" roof="#e5e6dd" />

        {/* Cuadro central abierto donde no hay edificio (patio interior) */}
        <Ground rect={{ x: 370, y: 240, w: 100, h: 75 }} className="courtyard">
          <span />
        </Ground>
        {/* Pretil bajo y pilares alrededor del patio abierto */}
        <Box rect={{ x: 370, y: 240, w: 100, h: 3 }} bottom={0} height={5} color="#cfd4cc" roof="#e7e9e0" />
        <Box rect={{ x: 370, y: 312, w: 100, h: 3 }} bottom={0} height={5} color="#cfd4cc" roof="#e7e9e0" />
        <Box rect={{ x: 370, y: 243, w: 3, h: 69 }} bottom={0} height={5} color="#cfd4cc" roof="#e7e9e0" />
        <Box rect={{ x: 467, y: 243, w: 3, h: 69 }} bottom={0} height={5} color="#cfd4cc" roof="#e7e9e0" />
        {[
          [370, 240],
          [418, 240],
          [467, 240],
          [370, 276],
          [467, 276],
          [370, 312],
          [418, 312],
          [467, 312],
        ].map(([px, py], i) => (
          <Box key={`patio-col-${i}`} rect={{ x: px, y: py, w: 3, h: 3 }} bottom={5} height={h - 6} color="#dfe3da" roof="#f2f3ec" />
        ))}

        {/* Muros perimetrales de Planta Baja con acceso sur (entrada) y acceso norte (puertas Auditorio) */}
        <Box rect={{ x: 295, y: 175, w: 91, h: 4 }} bottom={3} height={h - 3} color="#dcded5" roof="#b9756c" />
        <Box rect={{ x: 454, y: 175, w: 91, h: 4 }} bottom={3} height={h - 3} color="#dcded5" roof="#b9756c" />
        <Box rect={{ x: 295, y: 353, w: 91, h: 4 }} bottom={3} height={h - 3} color="#dcded5" roof="#b9756c" />
        <Box rect={{ x: 454, y: 353, w: 91, h: 4 }} bottom={3} height={h - 3} color="#dcded5" roof="#b9756c" />
        <Box rect={{ x: 295, y: 179, w: 4, h: 174 }} bottom={3} height={h - 3} color="#dcded5" roof="#b9756c" />
        <Box rect={{ x: 541, y: 179, w: 4, h: 174 }} bottom={3} height={h - 3} color="#dcded5" roof="#b9756c" />

        {/* Divisiones interiores de las áreas de Planta Baja */}
        <Box rect={{ x: 299, y: 239, w: 71, h: 3 }} bottom={3} height={h - 6} color="#cfd4cc" roof="#9aa8a0" />
        <Box rect={{ x: 299, y: 290, w: 71, h: 3 }} bottom={3} height={h - 6} color="#cfd4cc" roof="#9aa8a0" />
        <Box rect={{ x: 367, y: 179, w: 3, h: 44 }} bottom={3} height={h - 6} color="#cfd4cc" roof="#9aa8a0" />
        <Box rect={{ x: 470, y: 287, w: 71, h: 3 }} bottom={3} height={h - 6} color="#cfd4cc" roof="#9aa8a0" />

        {/* GESTIÓN ESCOLAR (G002): Ventanillas de atención, mostrador y sillas */}
        <Box rect={{ x: 306, y: 193, w: 54, h: 7 }} bottom={3} height={9} color="#bca586" roof="#e5d9c3" />
        <Box rect={{ x: 308, y: 195, w: 50, h: 2 }} bottom={12} height={5} color="#9fd3e6" roof="#d7f0f9" />
        {[313, 330, 347].map((cx) => (
          <Box key={`ges-chair-${cx}`} rect={{ x: cx, y: 207, w: 6, h: 6 }} bottom={3} height={4} color="#2f5b70" roof="#487d96" />
        ))}

        {/* ENFERMERÍA, DENTISTA Y PSICÓLOGO (G005): 3 consultorios diferenciados */}
        <Box rect={{ x: 322, y: 242, w: 2, h: 34 }} bottom={3} height={14} color="#e2c6c6" roof="#c98a8a" />
        <Box rect={{ x: 345, y: 242, w: 2, h: 34 }} bottom={3} height={14} color="#e2c6c6" roof="#c98a8a" />
        {/* Camilla de Enfermería */}
        <Box rect={{ x: 304, y: 248, w: 12, h: 22 }} bottom={3} height={5} color="#cbd5e1" roof="#f8fafc" />
        <Box rect={{ x: 305, y: 256, w: 10, h: 12 }} bottom={8} height={2} color="#dc2626" roof="#ef4444" />
        {/* Sillón dental */}
        <Box rect={{ x: 328, y: 248, w: 10, h: 18 }} bottom={3} height={6} color="#0284c7" roof="#38bdf8" />
        <Box rect={{ x: 339, y: 252, w: 4, h: 6 }} bottom={3} height={8} color="#94a3b8" roof="#e2e8f0" />
        {/* Escritorio y sillas de Psicólogo */}
        <Box rect={{ x: 350, y: 252, w: 14, h: 8 }} bottom={3} height={6} color="#9c7a54" roof="#cfb28b" />
        <Box rect={{ x: 354, y: 263, w: 6, h: 6 }} bottom={3} height={4} color="#475569" roof="#64748b" />

        {/* PASILLO Y PUERTAS DEL AUDITORIO (G003): Portal y puertas dobles en 3D */}
        <Box rect={{ x: 386, y: 173, w: 68, h: 5 }} bottom={3} height={22} color="#4a3529" roof="#6e503f" />
        {/* Dos pares de puertas dobles de madera con cristal y jaladeras */}
        {[390, 403, 425, 438].map((dx) => (
          <div key={`aud-door-${dx}`} className="model-group">
            <Box rect={{ x: dx, y: 174, w: 12, h: 3 }} bottom={3} height={19} color="#6d3f2b" roof="#8a553d" />
            <Box rect={{ x: dx + 3, y: 174, w: 6, h: 3 }} bottom={11} height={8} color="#7dd3fc" roof="#bae6fd" />
          </div>
        ))}
        {/* Alfombra de acceso al Auditorio */}
        <Box rect={{ x: 407, y: 164, w: 26, h: 36 }} bottom={3} height={1} color="#7f1d2d" roof="#9f2b3d" />

        {/* MESAS Y SILLAS (G004): Mesas con patas y sillas alrededor en 3D */}
        {[
          [483, 193],
          [515, 193],
          [483, 224],
          [515, 224],
          [499, 255],
        ].map(([mx, my], idx) => (
          <div key={`mesa-set-${idx}`} className="model-group">
            {/* Base y tablero de mesa */}
            <Box rect={{ x: mx + 6, y: my + 4, w: 4, h: 4 }} bottom={3} height={4} color="#52525b" roof="#71717a" />
            <Box rect={{ x: mx, y: my, w: 16, h: 12 }} bottom={7} height={2} color="#9e7b50" roof="#dfc69f" />
            {/* Sillas alrededor de cada mesa */}
            <Box rect={{ x: mx + 2, y: my - 5, w: 5, h: 4 }} bottom={3} height={3} color="#365363" roof="#52798f" />
            <Box rect={{ x: mx + 9, y: my - 5, w: 5, h: 4 }} bottom={3} height={3} color="#365363" roof="#52798f" />
            <Box rect={{ x: mx + 2, y: my + 13, w: 5, h: 4 }} bottom={3} height={3} color="#365363" roof="#52798f" />
            <Box rect={{ x: mx + 9, y: my + 13, w: 5, h: 4 }} bottom={3} height={3} color="#365363" roof="#52798f" />
          </div>
        ))}

        {/* SUR-CENTRO (centrado en eje X, abajo empezando en eje Y, entre Biblioteca): */}
        {/* Cajero BBVA en mini 3D */}
        <Box
          rect={{ x: 388, y: 325, w: 17, h: 17 }}
          bottom={3}
          height={17}
          color="#004481"
          roof="#0a5ca8"
          className="bbva-mini-cap"
          topContent={<span>BBVA</span>}
        />
        <Box rect={{ x: 391, y: 339, w: 11, h: 3 }} bottom={11} height={6} color="#38bdf8" roof="#bae6fd" />
        <Box rect={{ x: 391, y: 342, w: 11, h: 3 }} bottom={7} height={2} color="#cbd5e1" roof="#f1f5f9" />

        {/* Escaleras en medio círculo (subes -> descanso curvo a la derecha -> subes al Piso 1) */}
        <Box rect={{ x: 410, y: 344, w: 14, h: 8 }} bottom={3} height={5} color="#b8beb6" roof="#e2e5dc" />
        <Box rect={{ x: 410, y: 336, w: 14, h: 8 }} bottom={3} height={9} color="#b0b7af" roof="#e2e5dc" />
        <Box rect={{ x: 410, y: 328, w: 14, h: 8 }} bottom={3} height={13} color="#a7afa6" roof="#e2e5dc" />
        <Box rect={{ x: 410, y: 318, w: 40, h: 10 }} bottom={3} height={16} color="#9ea69d" roof="#d8ddd2" className="stair-landing-round" />
        <Box rect={{ x: 436, y: 328, w: 14, h: 8 }} bottom={3} height={19} color="#99a198" roof="#e2e5dc" />
        <Box rect={{ x: 436, y: 336, w: 14, h: 8 }} bottom={3} height={22} color="#919a90" roof="#e8ebe2" />
        <Box rect={{ x: 436, y: 344, w: 14, h: 8 }} bottom={3} height={25} color="#8a9389" roof="#f2f4ec" />
        <Box rect={{ x: 428, y: 328, w: 3, h: 24 }} bottom={3} height={16} color="#64748b" roof="#cbd5e1" />

        {/* BIBLIOTECA ESCOM (G001): Estanterías y mesas flanqueando escaleras y BBVA */}
        {[306, 323, 340, 466, 483].map((bx) => (
          <div key={`shelf-${bx}`} className="model-group">
            <Box rect={{ x: bx, y: 299, w: 9, h: 42 }} bottom={3} height={15} color="#7c6248" roof="#a6896b" />
            <Box rect={{ x: bx + 1, y: 302, w: 7, h: 36 }} bottom={12} height={2} color="#3b82f6" roof="#b45309" />
          </div>
        ))}
        <Box rect={{ x: 358, y: 310, w: 16, h: 26 }} bottom={3} height={6} color="#8c7355" roof="#cbb596" />
        <Box rect={{ x: 504, y: 299, w: 26, h: 16 }} bottom={3} height={6} color="#8c7355" roof="#cbb596" />
        <Box rect={{ x: 504, y: 325, w: 26, h: 16 }} bottom={3} height={6} color="#8c7355" roof="#cbb596" />

        {/* AUDITORIO (G006): Muros, escenario y filas de butacas en 3D */}
        <Box rect={{ x: 360, y: 115, w: 4, h: 60 }} bottom={3} height={h} color="#d8dad2" roof="#b9756c" />
        <Box rect={{ x: 476, y: 115, w: 4, h: 60 }} bottom={3} height={h} color="#d8dad2" roof="#b9756c" />
        <Box rect={{ x: 360, y: 115, w: 120, h: 4 }} bottom={3} height={h} color="#d8dad2" roof="#b9756c" />
        <Box rect={{ x: 378, y: 121, w: 84, h: 14 }} bottom={3} height={7} color="#7a5648" roof="#a87c68" />
        <Box rect={{ x: 416, y: 127, w: 8, h: 6 }} bottom={10} height={5} color="#5c4033" roof="#8c624d" />
        {[141, 149, 157].map((sy, rIdx) => (
          <div key={`aud-row-${rIdx}`} className="model-group">
            <Box rect={{ x: 376, y: sy, w: 34, h: 5 }} bottom={3 + (2 - rIdx) * 1.5} height={5} color="#7f1d2d" roof="#9f2b3d" />
            <Box rect={{ x: 430, y: sy, w: 34, h: 5 }} bottom={3 + (2 - rIdx) * 1.5} height={5} color="#7f1d2d" roof="#9f2b3d" />
          </div>
        ))}

        {/* Zonas clicables transparentes (sin textos flotantes encima del 3D) */}
        {pbSpaces.map((sp) => {
          const info = infoMap.get(sp.code);
          const tooltip = `${info?.name || sp.shortLabel} · ${sp.coordLabel}`;
          return sp.rects.map((rect, idx) => (
            <button
              key={`${sp.code}-${idx}`}
              type="button"
              aria-label={tooltip}
              aria-pressed={selected === sp.code}
              title={tooltip}
              onClick={() => onSelect(sp.code)}
              className={`gov-hitbox ${selected === sp.code ? "selected" : ""}`}
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
                transform: `translateZ(${h - 2}px)`,
              }}
            />
          ));
        })}
      </div>
    );
  }

  // Cuando se selecciona Piso 1 (level === 1), mostramos las oficinas superiores sin textos flotantes y con patio central abierto
  if (level === 1) {
    const p1Spaces = GOBIERNO_SPACES.filter((s) => s.floor === 1);
    const totalH = 2 * floorHeight;
    return (
      <div className="model-group">
        <Box rect={{ x: 360, y: 115, w: 120, h: 60 }} height={38} color="#e6e6dd" roof="#eeede4" className="auditorium-block" />
        {[
          { x: 295, y: 175, w: 250, h: 65 },
          { x: 295, y: 315, w: 250, h: 42 },
          { x: 295, y: 240, w: 75, h: 75 },
          { x: 470, y: 240, w: 75, h: 75 },
        ].map((rect, i) => (
          <Box key={`gov-p1-${i}`} rect={rect} height={floorHeight + 3} color="#e9ebe3" roof="#eeefe7" className="government-block" />
        ))}
        {/* Muros cortados del Piso 1 alrededor del patio abierto */}
        <Box rect={{ x: 295, y: 175, w: 250, h: 4 }} bottom={floorHeight + 3} height={floorHeight - 3} color="#dcded5" roof="#b9756c" />
        <Box rect={{ x: 295, y: 353, w: 250, h: 4 }} bottom={floorHeight + 3} height={floorHeight - 3} color="#dcded5" roof="#b9756c" />
        <Box rect={{ x: 295, y: 179, w: 4, h: 174 }} bottom={floorHeight + 3} height={floorHeight - 3} color="#dcded5" roof="#b9756c" />
        <Box rect={{ x: 541, y: 179, w: 4, h: 174 }} bottom={floorHeight + 3} height={floorHeight - 3} color="#dcded5" roof="#b9756c" />
        {/* Mobiliario 3D de oficinas del Piso 1 */}
        <Box rect={{ x: 386, y: 196, w: 68, h: 22 }} bottom={floorHeight + 3} height={7} color="#8c624d" roof="#b88b6e" />
        <Box rect={{ x: 316, y: 258, w: 36, h: 36 }} bottom={floorHeight + 3} height={6} color="#9e7b50" roof="#dfc69f" />
        <Box rect={{ x: 486, y: 256, w: 42, h: 12 }} bottom={floorHeight + 3} height={8} color="#9e7b50" roof="#dfc69f" />
        <Box rect={{ x: 486, y: 282, w: 42, h: 12 }} bottom={floorHeight + 3} height={8} color="#9e7b50" roof="#dfc69f" />
        <Box rect={{ x: 410, y: 326, w: 40, h: 18 }} bottom={floorHeight + 3} height={5} color="#b8beb6" roof="#e2e5dc" />
        <Ground rect={{ x: 370, y: 240, w: 100, h: 75 }} className="courtyard">
          <span />
        </Ground>
        {p1Spaces.map((sp) => {
          const info = infoMap.get(sp.code);
          const tooltip = `${info?.name || sp.shortLabel} · ${sp.coordLabel}`;
          return sp.rects.map((rect, idx) => (
            <button
              key={`${sp.code}-${idx}`}
              type="button"
              aria-label={tooltip}
              aria-pressed={selected === sp.code}
              title={tooltip}
              onClick={() => onSelect(sp.code)}
              className={`gov-hitbox ${selected === sp.code ? "selected" : ""}`}
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
                transform: `translateZ(${totalH - 2}px)`,
              }}
            />
          ));
        })}
      </div>
    );
  }

  // Vista completa (level === null) o Piso 2: maqueta completa de Gobierno sin textos flotantes
  return (
    <div className="model-group">
      <Box rect={{ x: 360, y: 115, w: 120, h: 60 }} height={38} color="#e6e6dd" roof="#eeede4" className="auditorium-block" />
      {[
        { x: 295, y: 175, w: 250, h: 65 },
        { x: 295, y: 315, w: 250, h: 42 },
        { x: 295, y: 240, w: 75, h: 75 },
        { x: 470, y: 240, w: 75, h: 75 },
      ].map((rect, i) => (
        <Box key={`gov-${i}`} rect={rect} height={52} color="#f1f1e9" roof="#e3e2d9" className="government-block" />
      ))}
      <Ground rect={{ x: 370, y: 240, w: 100, h: 75 }} className="courtyard">
        <span />
      </Ground>
      {[26, 52].map((height) => (
        <Box key={`gov-gallery-floor-${height}`} rect={{ x: 295, y: 357, w: 250, h: 14 }} bottom={height - 3} height={3} color="#cfd4cb" roof="#f2f3eb" />
      ))}
      {[26].map((height) => (
        <Box key={`gov-gallery-rail-${height}`} rect={{ x: 295, y: 368, w: 250, h: 3 }} bottom={height} height={8} color="#e2e5dd" roof="#f3f4ee" />
      ))}
      {[295, 345, 395, 445, 495, 542].map((x) => (
        <Box key={`gov-gallery-column-${x}`} rect={{ x, y: 368, w: 3, h: 3 }} height={52} color="#d2d8d0" roof="#f4f5ed" />
      ))}
      {[
        { x: 295, y: 175, w: 250, h: 4 },
        { x: 295, y: 353, w: 250, h: 4 },
        { x: 295, y: 179, w: 4, h: 174 },
        { x: 541, y: 179, w: 4, h: 174 },
        { x: 370, y: 236, w: 100, h: 4 },
        { x: 370, y: 315, w: 100, h: 4 },
        { x: 366, y: 240, w: 4, h: 75 },
        { x: 470, y: 240, w: 4, h: 75 },
      ].map((rect, i) => (
        <Box key={`parapet-${i}`} rect={rect} bottom={52} height={5} color="#d1d2ca" roof="#f8f8f1" />
      ))}
      {[
        { x: 317, y: 196, w: 18, h: 11 },
        { x: 502, y: 202, w: 17, h: 12 },
        { x: 322, y: 325, w: 15, h: 10 },
        { x: 497, y: 325, w: 15, h: 10 },
      ].map((rect, i) => (
        <Box key={`roof-unit-${i}`} rect={rect} bottom={52} height={5} color="#a9b3b0" roof="#e7e9e0" />
      ))}
      {[0, 1, 2].map((step) => (
        <Box
          key={`auditorium-step-${step}`}
          rect={{ x: 376 - step * 4, y: 158 + step * 5, w: 88 + step * 8, h: 5 }}
          height={3 + (2 - step) * 2}
          color="#c5c9c2"
          roof="#e6e7dd"
        />
      ))}
      {/* Áreas clicables discretas sobre Auditorio y Gobierno (sin etiquetas flotantes) */}
      <button
        type="button"
        aria-label="Auditorio ESCOM (clic para ver Planta Baja)"
        title="Auditorio ESCOM (clic para ver Planta Baja)"
        onClick={() => onSelect("G006", 0)}
        className={`gov-hitbox ${selected === "G006" ? "selected" : ""}`}
        style={{ left: 362, top: 117, width: 116, height: 56, transform: "translateZ(39px)" }}
      />
      <button
        type="button"
        aria-label="Edificio de Gobierno (clic para explorar Planta Baja)"
        title="Edificio de Gobierno (clic para explorar Planta Baja)"
        onClick={() => onSelect("G000", 0)}
        className="gov-hitbox"
        style={{ left: 297, top: 177, width: 246, height: 178, transform: "translateZ(53px)" }}
      />
    </div>
  );
}

function CampusScene({
  level,
  selected,
  onSelect,
  roomInfo,
}: {
  level: number | null;
  selected: string;
  onSelect: (id: string, targetLevel?: number) => void;
  roomInfo: RoomInfo[];
}) {
  const infoMap = new Map(roomInfo.map((r) => [r.code, r]));
  return (
    <>
      <Ground rect={{ x: 0, y: 0, w: 1000, h: 1300 }} className="model-base" />
      <Ground rect={{ x: 755, y: 130, w: 210, h: 760 }} className="parking">
        <div className="parking-island island-a" />
        <div className="parking-island island-b" />
        <div className="parking-island island-c" />
        <div className="parking-island island-d" />
      </Ground>
      <Ground rect={{ x: 750, y: 930, w: 215, h: 310 }} className="parking-south" />
      <Cars3D />
      <Ground rect={{ x: 275, y: 340, w: 290, h: 165 }} className="plaza" />
      <Ground rect={{ x: 165, y: 105, w: 94, h: 155 }} className="paving" />
      <Ground rect={{ x: 570, y: 955, w: 98, h: 170 }} className="paving" />
      <Ground rect={{ x: 205, y: 945, w: 105, h: 190 }} className="court">
        <div className="court-lines" />
      </Ground>
      <Ground rect={{ x: 25, y: 50, w: 120, h: 120 }} className="north-courts">
        <div className="north-court">
          <span />
        </div>
        <div className="north-court">
          <span />
        </div>
      </Ground>
      <Ground rect={{ x: 26, y: 178, w: 120, h: 48 }} className="exercise-area" />
      <Ground rect={{ x: 22, y: 232, w: 154, h: 11 }} className="orange-path" />
      <Ground rect={{ x: 155, y: 1210, w: 545, h: 28 }} className="walkway" />
      <Ground rect={{ x: 660, y: 125, w: 55, h: 1090 }} className="walkway" />
      <Trees />
      <Box rect={{ x: 45, y: 1010, w: 82, h: 76 }} height={23} color="#ede7da" roof="#bd625e" className="cafeteria-block" />
      <Box rect={{ x: 92, y: 252, w: 52, h: 38 }} height={17} color="#e5dacc" roof="#bc7263" />
      {[0, 1, 2].map((i) => (
        <Box key={`exercise-bar-${i}`} rect={{ x: 43 + i * 32, y: 190, w: 22, h: 3 }} bottom={12} height={3} color="#849790" roof="#d3dfd8" />
      ))}
      {[43, 65, 75, 97, 107, 129].map((x) => (
        <Box key={`exercise-post-${x}`} rect={{ x, y: 190, w: 3, h: 3 }} height={15} color="#899c94" roof="#dbe4de" />
      ))}
      <Palapas x={177} y={125} rows={5} />
      <Palapas x={582} y={974} rows={5} />

      {/* Edificio de Gobierno y Auditorio con distribución interior por capa */}
      <GobiernoBuilding3D level={level} selected={selected} onSelect={onSelect} infoMap={infoMap} />

      <Box rect={{ x: 315, y: 1128, w: 185, h: 28 }} height={8} color="#aeb4ae" roof="#d9d9ce" />
      {blocks.map((block) => {
        const visibleFloors = level === null ? 3 : level + 1;
        const corridorWidth = 14;
        const corridorOnRight = block.id === 1 || block.id === 4;
        const corridorX = corridorOnRight ? block.x + block.w - corridorWidth : block.x;
        const core = { ...block, x: block.x + (corridorOnRight ? 0 : corridorWidth), w: block.w - corridorWidth };
        return (
          <div key={`${block.id}-${block.start}`} className="model-group">
            {Array.from({ length: visibleFloors }, (_, floor) => (
              <div key={floor} className="model-group">
                <Box
                  rect={core}
                  bottom={floor * floorHeight}
                  height={floorHeight}
                  color="#e8e9e1"
                  roof={level !== null && floor === level ? "#e9e5d7" : "#b9756c"}
                  className="school-block"
                />
                <Box rect={{ x: corridorX, y: block.y, w: corridorWidth, h: block.h }} bottom={floor * floorHeight} height={3} color="#c6ccc5" roof="#e6e8df" />
                <Box
                  rect={{ x: corridorOnRight ? corridorX + corridorWidth - 3 : corridorX, y: block.y, w: 3, h: block.h }}
                  bottom={floor * floorHeight + 3}
                  height={8}
                  color="#d9ded6"
                  roof="#f3f4ed"
                />
                {Array.from({ length: Math.ceil(block.h / 80) + 1 }, (_, i) => (
                  <Box
                    key={i}
                    rect={{
                      x: corridorOnRight ? corridorX + corridorWidth - 3 : corridorX,
                      y: Math.min(block.y + i * 80, block.y + block.h - 3),
                      w: 3,
                      h: 3,
                    }}
                    bottom={floor * floorHeight + 3}
                    height={floorHeight - 3}
                    color="#d5d9d1"
                    roof="#f3f4ed"
                  />
                ))}
                {floor === visibleFloors - 1 && level === null && (
                  <Box
                    rect={{ x: corridorX, y: block.y, w: corridorWidth, h: block.h }}
                    bottom={(floor + 1) * floorHeight - 3}
                    height={3}
                    color="#d3d7cf"
                    roof="#b9756c"
                  />
                )}
              </div>
            ))}
            {level !== null &&
              Array.from({ length: block.end - block.start + 1 }, (_, i) => {
                const code = `${block.id}${level}${String(block.start + i).padStart(2, "0")}`;
                const h = block.h / (block.end - block.start + 1);
                const info = infoMap.get(code);
                const hasOfficial = (info?.professors.length ?? 0) > 0;
                const hasSuggestion = (info?.suggestions.length ?? 0) > 0;
                const profNames = info?.professors.map((p) => p.name).join(", ");
                const tooltipText = `${info?.name || `Espacio ${code}`}${profNames ? ` · ${profNames}` : ""}`;
                return (
                  <button
                    key={code}
                    type="button"
                    aria-label={tooltipText}
                    aria-pressed={code === selected}
                    title={tooltipText}
                    onClick={() => onSelect(code)}
                    className={`room-tile ${hasOfficial ? "has-official" : hasSuggestion ? "has-suggestion" : ""} ${code === selected ? "selected" : ""}`}
                    style={{
                      left: core.x + 3,
                      top: block.y + i * h + 2,
                      width: core.w - 6,
                      height: h - 4,
                      transform: `translateZ(${visibleFloors * floorHeight + 1}px)`,
                    }}
                  >
                    <span>{code}</span>
                  </button>
                );
              })}
          </div>
        );
      })}
      {[
        { x: 303, y: 812, w: 20, h: 55 },
        { x: 493, y: 812, w: 20, h: 55 },
        { x: 303, y: 1095, w: 20, h: 51 },
        { x: 493, y: 1095, w: 20, h: 51 },
      ].map((rect, i) => (
        <Box key={`wing-${i}`} rect={rect} height={(level === null ? 3 : level + 1) * floorHeight} color="#d2d3cc" roof="#b9756c" />
      ))}
      {(level === null ? [1, 2] : level > 0 ? [level] : []).flatMap((floor) =>
        [545, 780].flatMap((y) =>
          [
            { x: 271, y, w: 69, h: 23 },
            { x: 476, y, w: 89, h: 23 },
          ].map((rect, i) => <Box key={`${floor}-${y}-${i}`} rect={rect} bottom={floor * floorHeight - 3} height={7} color="#a4b0af" roof="#d7ddd6" />),
        ),
      )}
      {level === null && <Ground rect={{ x: 359, y: 672, w: 100, h: 90 }} className="solar" />}
      <div className="model-label landmark-label" style={{ left: 49, top: 1033, transform: "translateZ(25px)" }}>
        CAFETERÍA
      </div>
      <div className="model-label landmark-label" style={{ left: 93, top: 264, transform: "translateZ(19px)" }}>
        CAFÉ
      </div>
      <div className="model-label landmark-label" style={{ left: 53, top: 175, transform: "translateZ(3px)" }}>
        BARRAS
      </div>
      <div className="model-label landmark-label" style={{ left: 50, top: 42, transform: "translateZ(3px)" }}>
        CANCHAS
      </div>
      {(level === null || level === 2) && (
        <>
          <div className="model-label" style={{ left: 382, top: 92, transform: "translateZ(46px)" }}>
            AUDITORIO
          </div>
          <div className="model-label" style={{ left: 374, top: 162, transform: "translateZ(58px)" }}>
            GOBIERNO
          </div>
        </>
      )}
      <div className="model-label" style={{ left: 368, top: 385, transform: "translateZ(3px)" }}>
        EXPLANADA
      </div>
      <div className="model-label landmark-label" style={{ left: 205, top: 288, transform: "translateZ(82px)" }}>
        EDIF. 1
      </div>
      <div className="model-label landmark-label" style={{ left: 585, top: 288, transform: "translateZ(82px)" }}>
        EDIF. 2
      </div>
      <div className="model-label landmark-label" style={{ left: 342, top: 484, transform: "translateZ(82px)" }}>
        EDIF. 3
      </div>
      <div className="model-label landmark-label" style={{ left: 418, top: 484, transform: "translateZ(82px)" }}>
        EDIF. 4
      </div>
    </>
  );
}

function ProfessorSelfAssignBox({
  code,
  isAssignedHere,
  defaultLabel,
}: {
  code: string;
  isAssignedHere: boolean;
  defaultLabel: string;
}) {
  const [state, action, pending] = useActionState(assignSelfToRoom, {});
  return (
    <form action={action} className="mt-3 rounded-xl border border-[#b7dfd5] bg-[#f2fbf8] p-3.5">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="mode" value={isAssignedHere ? "remove" : "assign"} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-extrabold uppercase tracking-wider text-[#0b5c46]">
          {isAssignedHere ? "Estás confirmado en este espacio" : "Asignación directa de profesor (Verdad oficial)"}
        </span>
        {isAssignedHere ? (
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-[#c85a53] bg-white px-3 py-1.5 text-xs font-bold text-[#9a3028] hover:bg-[#fff5f5] disabled:opacity-50"
          >
            Retirarme de aquí
          </button>
        ) : null}
      </div>
      {!isAssignedHere && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            name="label"
            defaultValue={defaultLabel}
            maxLength={80}
            placeholder="Etiqueta opcional (ej. Cubículo 12 · Redes)"
            className="min-h-10 flex-1 rounded-lg border border-[#9fd0c4] bg-white px-3 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="min-h-10 rounded-lg bg-[#0d7a5f] px-4 text-xs font-extrabold text-white shadow-sm hover:bg-[#09634c] disabled:opacity-50"
          >
            Confirmar que estoy aquí
          </button>
        </div>
      )}
      {state.error && <p className="mt-2 text-xs font-semibold text-[#9a3028]">{state.error}</p>}
      {state.ok && <p className="mt-2 text-xs font-semibold text-[#0b5c46]">{state.ok}</p>}
    </form>
  );
}

function StudentSuggestionForm({
  code,
  professors,
  viewer,
}: {
  code: string;
  professors: Professor[];
  viewer: CurrentViewer;
}) {
  const [state, action, pending] = useActionState(suggestProfessorInRoom, {});
  if (!viewer) return null;
  return (
    <form action={action} className="mt-3 space-y-2.5 rounded-xl border border-[#dce5e2] bg-[#f8fbfb] p-3.5">
      <input type="hidden" name="code" value={code} />
      <p className="text-xs font-extrabold uppercase tracking-wider text-[#355360]">
        {viewer.role === "profesor" ? "Registrar profesor en este espacio" : "Sugerir qué profesor está aquí (sujeto a votación)"}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          name="professor_id"
          required
          defaultValue={viewer.role === "profesor" ? viewer.id : ""}
          className="min-h-10 w-full rounded-lg border border-[#bdcece] bg-white px-3 text-sm"
        >
          <option value="" disabled>
            Selecciona profesor
          </option>
          {professors.map((prof) => (
            <option key={prof.id} value={prof.id}>
              {prof.name}
            </option>
          ))}
        </select>
        <input
          name="note"
          maxLength={240}
          placeholder="Horario, materia o referencia (opcional)"
          className="min-h-10 w-full rounded-lg border border-[#bdcece] bg-white px-3 text-sm"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        {state.error ? (
          <p className="text-xs font-semibold text-[#9a3028]">{state.error}</p>
        ) : state.ok ? (
          <p className="text-xs font-semibold text-[#006699]">{state.ok}</p>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending}
          className="min-h-9 rounded-lg bg-[#006699] px-3.5 text-xs font-extrabold text-white hover:bg-[#00527a] disabled:opacity-50"
        >
          {viewer.role === "profesor" ? "Guardar ubicación" : "Publicar sugerencia"}
        </button>
      </div>
    </form>
  );
}

export function CampusMap({
  roomInfo,
  professors,
  professorDirectories = [],
  canEdit,
  viewer = null,
}: {
  roomInfo: RoomInfo[];
  professors: Professor[];
  professorDirectories?: ProfessorDirectoryItem[];
  canEdit: boolean;
  viewer?: CurrentViewer;
}) {
  const [level, setLevel] = useState<number | null>(0);
  const [selected, setSelected] = useState("G000");
  const [query, setQuery] = useState("");
  const [angle, setAngle] = useState(-22);
  const [tilt, setTilt] = useState(48);
  const [zoom, setZoom] = useState(1.15);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(120);
  const [isDragging, setIsDragging] = useState(false);
  const [width, setWidth] = useState(720);
  const [view, setView] = useState<"model" | "plan">("model");
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; angle: number; tilt: number } | null>(null);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((value) => Math.max(0.65, Math.min(2.1, value - event.deltaY * 0.0012)));
    };
    observer.observe(node);
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      node.removeEventListener("wheel", wheel);
    };
  }, [view]);

  const handleSelectSpace = (code: string, targetLevel?: number) => {
    setView("model");
    if (typeof targetLevel === "number") {
      setLevel(targetLevel);
    } else if (code.startsWith("G")) {
      const govFloor = Number(code[1]);
      if (level !== govFloor) setLevel(govFloor);
    } else if (/^[1-4][0-2]/.test(code)) {
      const roomFloor = Number(code[1]);
      if (level !== roomFloor) setLevel(roomFloor);
    }
    setSelected(code);
    if (code.startsWith("G")) {
      setPanX(0);
      setPanY(155);
      setZoom((z) => Math.max(z, 1.22));
    }
  };

  const focusGobiernoPB = () => {
    setView("model");
    setLevel(0);
    setSelected("G000");
    setAngle(-12);
    setTilt(46);
    setZoom(1.38);
    setPanX(0);
    setPanY(185);
  };

  const resetFullCampus = () => {
    setAngle(-25);
    setTilt(50);
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };

  const govMeta = GOBIERNO_SPACES.find((g) => g.code === selected);
  const selectedRoom = roomInfo.find((room) => room.code === selected);
  const normalized = query.trim().toLocaleLowerCase("es-MX");
  const matches = normalized
    ? roomInfo.filter((room) =>
        `${room.code} ${room.name} ${room.description} ${room.professors.map((p) => p.name).join(" ")} ${room.suggestions.map((s) => s.professor_name).join(" ")}`
          .toLocaleLowerCase("es-MX")
          .includes(normalized),
      )
    : [];
  const professorMatches = normalized
    ? professorDirectories.filter((prof) => `${prof.name} ${prof.location ?? ""}`.toLocaleLowerCase("es-MX").includes(normalized))
    : [];

  const kindLabel: Record<string, string> = {
    salon: "Salón",
    laboratorio: "Laboratorio",
    cubiculo: "Cubículo",
    oficina: "Oficina administrativa",
    servicio: "Servicio / Atención",
    biblioteca: "Biblioteca",
    auditorio: "Auditorio",
    otro: "Espacio",
  };

  const buildingBadge = selected.startsWith("G")
    ? `Edificio de Gobierno · ${selected[1] === "0" ? "Planta baja" : `Piso ${selected[1]}`}`
    : selected
      ? `Edificio ${selected[0]} · ${levels[Number(selected[1])] ?? "Planta baja"}`
      : "Campus ESCOM";

  const isViewerAssignedHere =
    viewer?.role === "profesor" && Boolean(selectedRoom?.professors.some((p) => p.id === viewer.id));

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      {/* COLUMNA IZQUIERDA (MÁS CORTA EN ESCRITORIO): MAPA 3D CON CONTROLES FLOTANTES DENTRO */}
      <div className="lg:col-span-7">
        {view === "model" ? (
          <div
            ref={viewport}
            className="model-viewport"
            tabIndex={0}
            role="region"
            aria-label="Mapa 3D interactivo de ESCOM"
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "ArrowLeft") setAngle((value) => value - 10);
              else if (event.key === "ArrowRight") setAngle((value) => value + 10);
              else if (event.key === "ArrowUp") setTilt((value) => Math.min(72, value + 5));
              else if (event.key === "ArrowDown") setTilt((value) => Math.max(8, value - 5));
              else if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(2.1, value + 0.12));
              else if (event.key === "-") setZoom((value) => Math.max(0.65, value - 0.12));
              else return;
              event.preventDefault();
            }}
            onPointerDown={(event) => {
              if ((event.target as Element).closest("button, [data-hud]")) return;
              drag.current = { x: event.clientX, y: event.clientY, angle, tilt };
              setIsDragging(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              setAngle(drag.current.angle + (event.clientX - drag.current.x) * 0.4);
              setTilt(Math.max(8, Math.min(72, drag.current.tilt - (event.clientY - drag.current.y) * 0.25)));
            }}
            onPointerUp={() => {
              drag.current = null;
              setIsDragging(false);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setIsDragging(false);
            }}
          >
            <div
              className={`model-world ${isDragging ? "is-dragging" : ""}`}
              style={{
                transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${Math.min(width / 1280, 0.72) * zoom}) rotateX(${tilt}deg) rotateZ(${angle}deg)`,
              }}
            >
              <CampusScene level={level} selected={selected} onSelect={handleSelectSpace} roomInfo={roomInfo} />
            </div>

            {/* HUD SUPERIOR IZQUIERDO: Selector de capas / niveles directamente dentro del mapa */}
            <div
              data-hud="true"
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto absolute left-3 top-3 z-30 flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/80 bg-white/90 p-1.5 shadow-lg backdrop-blur-md"
              role="group"
              aria-label="Capas y niveles del mapa"
            >
              {[
                { label: "Todo 3D", value: null },
                { label: "Planta baja", value: 0 },
                { label: "Piso 1", value: 1 },
                { label: "Piso 2", value: 2 },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  aria-pressed={level === item.value}
                  onClick={() => setLevel(item.value)}
                  className={`min-h-9 rounded-xl px-3 text-xs font-extrabold transition ${
                    level === item.value
                      ? "bg-[#006699] text-white shadow-sm"
                      : "text-[#254552] hover:bg-[#e5f1f4]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={focusGobiernoPB}
                className="min-h-9 rounded-xl border border-[#b9dce8] bg-[#eef8fc] px-3 text-xs font-extrabold text-[#005885] hover:bg-[#d9eff8]"
              >
                Gobierno PB
              </button>
            </div>

            {/* HUD SUPERIOR DERECHO: Brújula interactiva y cambio a Croquis */}
            <div
              data-hud="true"
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto absolute right-3 top-3 z-30 flex items-center gap-1.5"
            >
              <button
                type="button"
                onClick={() => setAngle(0)}
                title="Alinear al Norte"
                aria-label="Dirección del norte (clic para orientar al norte)"
                className="flex min-h-10 items-center gap-1.5 rounded-xl border border-white/80 bg-white/90 px-3 text-xs font-extrabold text-[#1d4252] shadow-lg backdrop-blur-md hover:bg-white"
              >
                <span>N</span>
                <span
                  style={{
                    display: "inline-block",
                    transform: `rotate(${
                      (Math.atan2(
                        Math.sin((angle * Math.PI) / 180),
                        Math.cos((angle * Math.PI) / 180) * Math.cos((tilt * Math.PI) / 180),
                      ) *
                        180) /
                      Math.PI
                    }deg)`,
                  }}
                >
                  ↑
                </span>
              </button>
              <button
                type="button"
                onClick={() => setView("plan")}
                className="min-h-10 rounded-xl border border-white/80 bg-white/90 px-3 text-xs font-extrabold text-[#254552] shadow-lg backdrop-blur-md hover:bg-white"
              >
                Croquis 2D
              </button>
            </div>

            {/* HUD INFERIOR IZQUIERDO: Joystick / Cruceta táctil para girar, inclinar y desplazar dentro del mapa */}
            <div
              data-hud="true"
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto absolute bottom-3 left-3 z-30 flex items-center gap-2 rounded-2xl border border-white/80 bg-white/90 p-2 shadow-lg backdrop-blur-md"
              role="group"
              aria-label="Controles de cámara en el mapa"
            >
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  aria-label="Girar a la izquierda"
                  title="Girar a la izquierda"
                  onClick={() => setAngle((a) => a - 18)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef4f6] text-xs font-black text-[#1d4252] hover:bg-[#d8e8ed] active:scale-95"
                >
                  ↺
                </button>
                <button
                  type="button"
                  aria-label="Inclinar arriba"
                  title="Ver más desde arriba"
                  onClick={() => setTilt((t) => Math.max(8, t - 8))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef4f6] text-xs font-black text-[#1d4252] hover:bg-[#d8e8ed] active:scale-95"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label="Girar a la derecha"
                  title="Girar a la derecha"
                  onClick={() => setAngle((a) => a + 18)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef4f6] text-xs font-black text-[#1d4252] hover:bg-[#d8e8ed] active:scale-95"
                >
                  ↻
                </button>
                <button
                  type="button"
                  aria-label="Mover cámara a la izquierda"
                  title="Mover vista a la izquierda"
                  onClick={() => setPanX((x) => x + 65)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef4f6] text-xs font-black text-[#1d4252] hover:bg-[#d8e8ed] active:scale-95"
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label="Centrar todo el campus"
                  title="Centrar vista general"
                  onClick={resetFullCampus}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#006699] text-xs font-black text-white hover:bg-[#00527a] active:scale-95"
                >
                  ⌖
                </button>
                <button
                  type="button"
                  aria-label="Mover cámara a la derecha"
                  title="Mover vista a la derecha"
                  onClick={() => setPanX((x) => x - 65)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef4f6] text-xs font-black text-[#1d4252] hover:bg-[#d8e8ed] active:scale-95"
                >
                  →
                </button>
                <button
                  type="button"
                  aria-label="Subir hacia Gobierno"
                  title="Desplazar hacia el Norte (Gobierno)"
                  onClick={() => setPanY((y) => y + 65)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef4f6] text-[10px] font-black text-[#1d4252] hover:bg-[#d8e8ed] active:scale-95"
                >
                  N↑
                </button>
                <button
                  type="button"
                  aria-label="Inclinar abajo"
                  title="Inclinar perspectiva 3D"
                  onClick={() => setTilt((t) => Math.min(72, t + 8))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef4f6] text-xs font-black text-[#1d4252] hover:bg-[#d8e8ed] active:scale-95"
                >
                  ▼
                </button>
                <button
                  type="button"
                  aria-label="Bajar hacia aulas"
                  title="Desplazar hacia el Sur (Aulas)"
                  onClick={() => setPanY((y) => y - 65)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef4f6] text-[10px] font-black text-[#1d4252] hover:bg-[#d8e8ed] active:scale-95"
                >
                  S↓
                </button>
              </div>
            </div>

            {/* HUD INFERIOR DERECHO: Controles de Zoom directos en el mapa */}
            <div
              data-hud="true"
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto absolute bottom-3 right-3 z-30 flex flex-col items-center gap-1 rounded-2xl border border-white/80 bg-white/90 p-1.5 shadow-lg backdrop-blur-md"
              role="group"
              aria-label="Zoom del mapa"
            >
              <button
                type="button"
                aria-label="Acercar mapa"
                onClick={() => setZoom((value) => Math.min(2.1, value + 0.15))}
                disabled={zoom >= 2.1}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef4f6] text-lg font-black text-[#006699] hover:bg-[#d8e8ed] active:scale-95 disabled:opacity-40"
              >
                +
              </button>
              <span className="px-1 text-[11px] font-extrabold text-[#355360]">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                aria-label="Alejar mapa"
                onClick={() => setZoom((value) => Math.max(0.65, value - 0.15))}
                disabled={zoom <= 0.65}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef4f6] text-lg font-black text-[#006699] hover:bg-[#d8e8ed] active:scale-95 disabled:opacity-40"
              >
                −
              </button>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-[#bfd2d0] bg-white">
            <img src="/demo/croquis-campus.webp" alt="Croquis del campus ESCOM" className="h-auto w-full" />
            <button
              type="button"
              onClick={() => setView("model")}
              className="absolute right-3 top-3 rounded-xl bg-[#006699] px-4 py-2 text-xs font-extrabold text-white shadow-lg"
            >
              Volver al Mapa 3D
            </button>
          </div>
        )}

        {/* Accesos directos a las zonas de Edificio de Gobierno debajo del mapa */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {GOBIERNO_SPACES.filter((s) => s.floor === (level === 1 ? 1 : 0)).map((sp) => (
            <button
              key={sp.code}
              type="button"
              onClick={() => handleSelectSpace(sp.code, sp.floor)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                selected === sp.code
                  ? "border-[#995c00] bg-[#ffcf52] text-[#1b2a30] shadow-sm"
                  : "border-[#cfe0e2] bg-white text-[#234452] hover:bg-[#eef6f8]"
              }`}
            >
              {sp.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* COLUMNA DERECHA PARALELA: BUSCADOR + FICHA DEL CUBÍCULO / ESPACIO + ASIGNACIÓN Y VOTACIÓN */}
      <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-20">
        {/* Buscador rápido */}
        <section className="board-sidecard p-4">
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cubículo, salón, profesor, BBVA, biblioteca, enfermería..."
              aria-label="Buscar espacio o profesor"
              className="min-h-11 w-full rounded-xl border border-[#bdcece] bg-white px-3.5 text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="min-h-11 rounded-xl border border-[#d5e1e3] px-3 text-xs font-bold text-[#526771] hover:bg-[#eef4f5]"
              >
                Limpiar
              </button>
            )}
          </div>
          {normalized && (
            <div className="mt-3 max-h-60 space-y-1.5 overflow-y-auto pr-1">
              {professorMatches.map((prof) => (
                <div key={prof.id}>
                  {prof.room_code ? (
                    <button
                      type="button"
                      onClick={() => handleSelectSpace(prof.room_code!)}
                      className="w-full rounded-xl border border-[#dce5e2] bg-white p-2.5 text-left text-sm hover:bg-[#edf5f5]"
                    >
                      <strong className="text-[#1b4053]">{prof.name}</strong>
                      <span className="block text-xs text-[#5f6e78]">{prof.location ?? `Espacio ${prof.room_code}`}</span>
                    </button>
                  ) : (
                    <div className="w-full rounded-xl border border-[#dce5e2] bg-white p-2.5 text-left text-sm">
                      <strong className="text-[#1b4053]">{prof.name}</strong>
                      <span className="block text-xs text-[#5f6e78]">{prof.location ?? "Ubicación no disponible"}</span>
                    </div>
                  )}
                </div>
              ))}
              {matches.map((room) => (
                <button
                  key={room.code}
                  type="button"
                  onClick={() => handleSelectSpace(room.code)}
                  className="w-full rounded-xl border border-[#dce5e2] bg-white p-2.5 text-left text-sm hover:bg-[#edf5f5]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-[#1b4053]">{room.name || `${kindLabel[room.kind] ?? "Espacio"} ${room.code}`}</strong>
                    <span className="rounded bg-[#eef4f6] px-2 py-0.5 text-xs font-bold text-[#006699]">{room.code}</span>
                  </div>
                  {room.professors.length > 0 && (
                    <span className="mt-0.5 block text-xs text-[#0b5c46]">
                      Confirmado: {room.professors.map((p) => p.name).join(", ")}
                    </span>
                  )}
                </button>
              ))}
              {professorMatches.length === 0 && matches.length === 0 && (
                <p className="py-2 text-xs text-[#5f6e78]">Sin coincidencias para «{query}».</p>
              )}
            </div>
          )}
        </section>

        {/* Ficha paralela del espacio / cubículo seleccionado */}
        <section className="board-sidecard p-5" aria-live="polite">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="board-eyebrow">{buildingBadge}</span>
                <div className="flex items-center gap-1.5">
                  {govMeta && (
                    <span className="rounded-full bg-[#eef4f7] px-2.5 py-0.5 text-xs font-bold text-[#285063]">
                      {govMeta.coordLabel}
                    </span>
                  )}
                  <span className="rounded-full bg-[#006699]/10 px-2.5 py-0.5 text-xs font-extrabold text-[#006699]">
                    {selectedRoom ? kindLabel[selectedRoom.kind] ?? "Espacio" : "Salón / Cubículo"} · {selected}
                  </span>
                </div>
              </div>

              <h2 className="mt-2 text-xl font-extrabold text-[#1b4053]">
                {selectedRoom?.name || govMeta?.shortLabel || `Espacio ${selected}`}
              </h2>

              {selectedRoom?.description ? (
                <p className="mt-2 text-sm leading-relaxed text-[#485b65]">{selectedRoom.description}</p>
              ) : null}

              {/* SECCIÓN 1: UBICACIÓN OFICIAL (VERDAD CONFIRMADA POR PROFESOR / ADMIN) */}
              <div className="mt-4 border-t border-[#e2ece9] pt-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#0b5c46]">
                    Profesores confirmados (Verdad oficial)
                  </h3>
                  <span className="rounded-full bg-[#e1f3ee] px-2 py-0.5 text-[11px] font-bold text-[#0b5c46]">
                    {selectedRoom?.professors.length ?? 0}
                  </span>
                </div>

                {selectedRoom?.professors.length ? (
                  <ul className="mt-2.5 space-y-2">
                    {selectedRoom.professors.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-[#b7dfd5] bg-[#f4fbf9] px-3 py-2 text-sm"
                      >
                        <span className="font-bold text-[#143d32]">{p.name}</span>
                        <span className="rounded-full bg-[#0d7a5f] px-2.5 py-0.5 text-[11px] font-extrabold text-white">
                          Confirmado
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-[#64757e]">Ningún profesor se ha asignado oficialmente a este espacio todavía.</p>
                )}

                {viewer?.role === "profesor" && (
                  <ProfessorSelfAssignBox
                    key={`self-${selected}-${isViewerAssignedHere}`}
                    code={selected}
                    isAssignedHere={isViewerAssignedHere}
                    defaultLabel={selectedRoom?.name ?? ""}
                  />
                )}
              </div>

              {/* SECCIÓN 2: SUGERENCIAS DE ALUMNOS Y VOTACIÓN DE LA COMUNIDAD */}
              <div className="mt-4 border-t border-[#e2ece9] pt-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#8a5708]">
                    Sugerencias de alumnos (Votación)
                  </h3>
                  <span className="rounded-full bg-[#fef3d6] px-2 py-0.5 text-[11px] font-bold text-[#8a5708]">
                    {selectedRoom?.suggestions.length ?? 0}
                  </span>
                </div>

                {selectedRoom?.suggestions.length ? (
                  <ul className="mt-2.5 space-y-2.5">
                    {selectedRoom.suggestions.map((sug) => {
                      const net = sug.upvotes - sug.downvotes;
                      const canConfirm =
                        viewer?.role === "admin" || (viewer?.role === "profesor" && viewer.id === sug.professor_id);
                      const canDismiss = canConfirm || viewer?.id === sug.suggested_by;
                      return (
                        <li
                          key={sug.id}
                          className="rounded-xl border border-[#ecd9ab] bg-[#fffcf2] p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <span className="font-extrabold text-[#1b4053]">{sug.professor_name}</span>
                              <span className="ml-2 rounded-full bg-[#fae6b1] px-2 py-0.5 text-[10px] font-extrabold text-[#784904]">
                                Sugerencia · {net > 0 ? `+${net} a favor` : net < 0 ? `${net} en contra` : "En verificación"}
                              </span>
                              {sug.note && <p className="mt-1 text-xs text-[#4a5d66]">{sug.note}</p>}
                              <p className="mt-0.5 text-[11px] text-[#73848c]">Sugerido por {sug.suggested_by_name}</p>
                            </div>
                          </div>

                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#f1e4c3] pt-2">
                            <div className="flex items-center gap-1.5">
                              <form action={voteRoomSuggestion}>
                                <input type="hidden" name="suggestion_id" value={sug.id} />
                                <input type="hidden" name="vote" value="1" />
                                <button
                                  type="submit"
                                  disabled={!viewer}
                                  title={viewer ? "Votar que sí estuvo / está aquí" : "Inicia sesión para votar"}
                                  className={`rounded-lg border px-2.5 py-1 text-xs font-extrabold transition ${
                                    sug.my_vote === 1
                                      ? "border-[#0d7a5f] bg-[#0d7a5f] text-white"
                                      : "border-[#cbd8da] bg-white text-[#1f4252] hover:bg-[#eef6f5]"
                                  } disabled:opacity-50`}
                                >
                                  Sí está aquí ({sug.upvotes})
                                </button>
                              </form>
                              <form action={voteRoomSuggestion}>
                                <input type="hidden" name="suggestion_id" value={sug.id} />
                                <input type="hidden" name="vote" value="-1" />
                                <button
                                  type="submit"
                                  disabled={!viewer}
                                  title={viewer ? "Votar que no corresponde" : "Inicia sesión para votar"}
                                  className={`rounded-lg border px-2.5 py-1 text-xs font-extrabold transition ${
                                    sug.my_vote === -1
                                      ? "border-[#9a3028] bg-[#9a3028] text-white"
                                      : "border-[#cbd8da] bg-white text-[#526771] hover:bg-[#fdf2f2]"
                                  } disabled:opacity-50`}
                                >
                                  No está ({sug.downvotes})
                                </button>
                              </form>
                            </div>

                            {(canConfirm || canDismiss) && (
                              <div className="flex items-center gap-1.5">
                                {canConfirm && (
                                  <form action={resolveRoomSuggestion}>
                                    <input type="hidden" name="suggestion_id" value={sug.id} />
                                    <input type="hidden" name="decision" value="confirm" />
                                    <button
                                      type="submit"
                                      className="rounded-lg bg-[#0d7a5f] px-2.5 py-1 text-[11px] font-extrabold text-white hover:bg-[#095e49]"
                                    >
                                      Confirmar verdad
                                    </button>
                                  </form>
                                )}
                                {canDismiss && (
                                  <form action={resolveRoomSuggestion}>
                                    <input type="hidden" name="suggestion_id" value={sug.id} />
                                    <input type="hidden" name="decision" value="dismiss" />
                                    <button
                                      type="submit"
                                      className="rounded-lg border border-[#d9c3c1] bg-white px-2.5 py-1 text-[11px] font-bold text-[#8c2d25] hover:bg-[#fff2f1]"
                                    >
                                      Descartar
                                    </button>
                                  </form>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-[#64757e]">Sin sugerencias pendientes en este espacio.</p>
                )}

                <StudentSuggestionForm key={`sug-${selected}`} code={selected} professors={professors} viewer={viewer} />
              </div>

              {canEdit && <RoomEditor key={selected} code={selected} room={selectedRoom} professors={professors} />}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
