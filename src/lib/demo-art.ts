const noticeArt: Record<string, string> = {
  "Noche de combate · cartel de archivo": "/demo/noche-combate.webp",
  "Amistoso Burros Blancos vs ESCOM": "/demo/amistoso-futbol.webp",
  "Comunicado de condolencias | Cuauhtémoc Cárdenas Solórzano": "/demo/comunicado-ipn.webp",
  "Oportunidad | Capital One para estudiantes y recién egresados": "/demo/capital-one.webp",
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
