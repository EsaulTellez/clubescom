const noticeArt: Record<string, string> = {
  "Inicio de semestre 2026-B": "/demo/explanada-escom.webp",
  "Noche de combate · cartel de archivo": "/demo/noche-combate.webp",
  "Amistoso Burros Blancos vs ESCOM": "/demo/amistoso-futbol.webp",
  "Comunicado de condolencias | Cuauhtémoc Cárdenas Solórzano": "/demo/comunicado-ipn.webp",
  "Oportunidad | Capital One para estudiantes y recién egresados": "/demo/capital-one.webp",
  "Reinscripciones: fechas importantes": "/demo/aviso-reinscripciones.svg",
  "Becas institucionales: validación de expediente digital": "/demo/aviso-becas.svg",
  "Entrega de protocolos de Trabajo Terminal 2026-B": "/demo/aviso-catt-tt.svg",
  "Semana de bienvenida ESCOM": "/demo/explanada-escom.webp",
};

export function demoNoticeArt(title: string) {
  return noticeArt[title] ?? null;
}

export function demoNoticeAuthor(title: string) {
  if (title.startsWith("Oportunidad | Capital One")) return "Capital One";
  if (title.startsWith("Comunicado de condolencias")) return "Instituto Politécnico Nacional";
  if (title.startsWith("Noche de combate")) return "IPN Cultura";
  if (title.startsWith("Amistoso Burros Blancos")) return "Burros Blancos · ESCOM";
  return "Comunidad ESCOM";
}

export function demoClubArt(name: string) {
  return name === "Club de Algoritmia" ? "/demo/club-algoritmia.webp" : null;
}
