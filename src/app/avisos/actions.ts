"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GoogleGenAI } from "@google/genai";
import { audit, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  canManageAvisos,
  categoryLabel,
  isCategory,
  isSourceArea,
  parseExternalUrl,
  parsePublishAt,
  sourceAreaLabel,
  sourceAreaShortLabel,
  type Category,
  type FormState,
  type SourceArea,
} from "./shared";

async function publisher() {
  const user = await getSession();
  if (!user || !canManageAvisos(user)) return null;
  return user;
}

function truncateClean(text: string, maxLen: number): string {
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  const sliced = clean.slice(0, maxLen - 1);
  const lastSentence = Math.max(sliced.lastIndexOf(". "), sliced.lastIndexOf(".\n"), sliced.lastIndexOf("\n"));
  if (lastSentence >= Math.floor(maxLen * 0.55)) {
    return sliced.slice(0, lastSentence + 1).trim();
  }
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace > 40) {
    return `${sliced.slice(0, lastSpace).replace(/[,;:\s-]+$/, "")}…`;
  }
  return `${sliced}…`;
}

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function detectSourceAreaFromText(text: string): SourceArea {
  const lower = text.toLowerCase();
  if (/\bcelex\b|idioma\s+extranjero|cursos?\s+de\s+(?:idiomas|ingl[eé]s|franc[eé]s|alem[aá]n)/.test(lower)) return "celex";
  if (/\bctce\b|consejo\s+t[eé]cnico\s+consultivo|\bcosie\b|\bdictamen\b/.test(lower)) return "ctce";
  if (/\bsepi\b|posgrado|maestr[ií]a|doctorado/.test(lower)) return "sepi";
  if (/subdirecci[oó]n\s+administrativa|recursos\s+financieros|capital\s+humano|servicios\s+generales/.test(lower)) {
    return "subdireccion_administrativa";
  }
  if (
    /servicios\s+educativos\s+e\s+integraci[oó]n\s+social|\bsseis\b|beca|sibec|servicio\s+social|\bsiss\b|cultural|deportiv|futbol|f[uú]tbol|burros\s+blancos|cine|combate|salud|enfermer[ií]a|orientaci[oó]n\s+juvenil/.test(
      lower,
    )
  ) {
    return "sseis";
  }
  if (
    /subdirecci[oó]n\s+acad[eé]mica|gesti[oó]n\s+escolar|reinscrip|\bsaes\b|k[aá]rdex|boleta\s+global|constancia\s+de\s+estudios|\bcatt\b|trabajo\s+terminal|protocolo\s+de\s+tt|\bets\b|evaluaci[oó]n\s+a\s+t[ií]tulo|sala\s+14/.test(
      lower,
    )
  ) {
    return "subdireccion_academica";
  }
  if (
    /\bdirecci[oó]n\b(?!\s+(?:de\s+correo|electr[oó]nica|web|url|del\s+evento|exacta))|iv[aá]n\s+giovanny\s+mosso|director\s+de\s+la\s+escom|condolencias/.test(
      lower,
    )
  ) {
    return "direccion";
  }
  return "general";
}

function detectCategoryFromText(text: string, sourceArea: SourceArea): Category {
  const lower = text.toLowerCase();
  if (
    /beca|sibec|reinscrip|constancia|boleta|tramite|tr[aá]mite|saes|ventanilla|servicio\s+social|siss|titulaci|imss|dictamen|cosie|expediente|inscripci[oó]n\s+al\s+celex|convocatoria\s+de\s+beca/.test(
      lower,
    )
  ) {
    return "tramites";
  }
  if (
    /torneo|futbol|f[uú]tbol|cultural|cine|club|festival|convivencia|bienvenida|amistoso|deport|combate|concierto|exposici[oó]n|condolencias/.test(
      lower,
    )
  ) {
    return "social";
  }
  if (sourceArea === "ctce") return "tramites";
  return "academico";
}

function formatFormDateToSpanish(rawDate: string): string | null {
  const clean = rawDate.trim();
  if (!clean) return null;
  // Formato mexicano D/M/yyyy (solo asumir M/d/yyyy si el segundo campo supera 12)
  const dmy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const year = Number(dmy[3]);
    const month = b > 12 ? a : b;
    const day = b > 12 ? b : a;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      return new Intl.DateTimeFormat("es-MX", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
    }
  }
  const ymd = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const date = new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0));
    return new Intl.DateTimeFormat("es-MX", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  return clean.length >= 4 && clean.length <= 80 ? clean : null;
}

function fitTweet(candidate: string, fallback: string, externalUrl?: string): string {
  const raw = (candidate || fallback).replace(/\s+/g, " ").trim();
  if (raw.length <= 280) return raw;
  const url = externalUrl?.trim();
  const hasUrl = Boolean(url && raw.includes(url));
  const hashtags = raw.includes("#ESCOM") ? "" : " #ESCOM #IPN";
  const tail = `${hasUrl && url ? ` ${url}` : ""}${hashtags}`;
  const withoutTail = (hasUrl && url ? raw.replace(url, "") : raw).replace(/\s+/g, " ").trim();
  const avail = Math.max(24, 280 - tail.length);
  return `${truncateClean(withoutTail, avail)}${tail}`.slice(0, 280).trim();
}

function buildFallbackSocial(input: {
  title: string;
  body: string;
  category: string;
  sourceArea?: SourceArea;
  externalUrl?: string;
}) {
  const label = categoryLabel(input.category);
  const areaShort = sourceAreaShortLabel(input.sourceArea ?? "general");
  const areaFull = sourceAreaLabel(input.sourceArea ?? "general");
  const cleanTitle = input.title.trim().replace(/[.!]+$/, "");

  const bodyLines = input.body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.toLowerCase() !== cleanTitle.toLowerCase());

  const summaryLines = bodyLines.filter((l) => !/^https?:\/\//i.test(l));
  const compactSummary = summaryLines.join(" ").replace(/\s+/g, " ").trim();

  const urlSuffix = input.externalUrl ? ` ${input.externalUrl}` : "";
  const hashtags = " #ESCOM #IPN";
  const prefix = `📢 ${areaShort} | ${cleanTitle}. `;
  const fixedLen = prefix.length + urlSuffix.length + hashtags.length;
  let twitter: string;
  if (fixedLen >= 272) {
    const shortTitle = truncateClean(cleanTitle, Math.max(30, 268 - areaShort.length - urlSuffix.length - hashtags.length - 6));
    twitter = `📢 ${areaShort} | ${shortTitle}${urlSuffix}${hashtags}`.trim();
  } else {
    const maxBody = Math.max(20, 280 - fixedLen);
    const tweetSummary = truncateClean(compactSummary, maxBody);
    twitter = `${prefix}${tweetSummary}${urlSuffix}${hashtags}`.trim();
  }

  const fbLinkLine =
    input.externalUrl && !compactSummary.includes(input.externalUrl) ? `\n\n🔗 Enlace oficial: ${input.externalUrl}` : "";
  const fbTags = "\n\n#ESCOM #IPN #ComunidadESCOM";
  const fbHeader = `📌 Comunicado ESCOM · ${areaFull} (${label})\n\n${cleanTitle}\n\n`;
  const fbBody = truncateClean(bodyLines.join("\n\n"), Math.max(120, 1000 - fbHeader.length - fbLinkLine.length - fbTags.length));
  const facebook = `${fbHeader}${fbBody}${fbLinkLine}${fbTags}`.slice(0, 1000);

  const igHeader = `📣 ${cleanTitle}\n🏛️ ${areaFull} · ESCOM IPN\n\n`;
  const igLinkNote = input.externalUrl ? `\n\n🔗 Más información en:\n${input.externalUrl}` : "";
  const igTags = "\n\n#ESCOM #IPN #ComunidadPolitécnica #Zacatenco #ESCOMIPN";
  const igBody = truncateClean(summaryLines.slice(0, 4).join("\n"), Math.max(120, 1000 - igHeader.length - igLinkNote.length - igTags.length));
  const instagram = `${igHeader}${igBody}${igLinkNote}${igTags}`.slice(0, 1000);

  return {
    twitter,
    facebook,
    instagram,
    text: `Twitter / X:\n${twitter}\n\nFacebook:\n${facebook}\n\nInstagram:\n${instagram}`,
  };
}

function rewriteColloquialLine(line: string): string {
  let out = line.trim();
  if (!out) return "";

  // Bullet normalization
  if (/^[-*•]\s+/.test(out)) {
    const item = out
      .replace(/^[-*•]\s+/, "")
      .replace(/\bporfa\b|\bxfa\b/gi, "por favor")
      .trim();
    return `• ${item.charAt(0).toUpperCase()}${item.slice(1)}`;
  }

  // Strip pure colloquial greetings / intros if the line has further content
  out = out
    .replace(
      /^([¡!¿?\s]*(que\s+onda|qué\s+onda|hola|buen\s+d[ií]a|buenas\s+tardes|buenas\s+noches|hey|oigan|aviso\s+importante|atenci[oó]n)(\s+(banda|bandita|compas|compañer[oa]s|amig[oa]s|comunidad|chicos|gente))?[,!\s:.-]*)+/i,
      "",
    )
    .trim();

  // Rewrite common informal patterns into institutional Spanish
  out = out
    .replace(
      /^les\s+paso\s+el\s+dato\s+que\s+mand[oó]\s+([^,.!]+?)\s+(?:por\s+si\s+alguien\s+anda\s+tramitando|sobre|para)\s+(.+?)[.!]*$/i,
      "El área de $1 informa a la comunidad estudiantil los lineamientos y requisitos para $2.",
    )
    .replace(
      /^les\s+(?:paso\s+el\s+dato|comparto|avisamos)\s+(?:por\s+si\s+alguien\s+anda\s+tramitando|que|sobre)\s+(.+?)[.!]*$/i,
      "Se informa a la comunidad de la ESCOM sobre $1.",
    )
    .replace(
      /^urge\s+porque\s+cierra\s+(?:este\s+)?(.+?)\s+y\s+si\s+no\s+suben\s+(.+?)\s+bien\s+los\s+botan[.!]*$/i,
      "Fecha límite: $1. Es indispensable subir $2 de forma completa y legible para validar el trámite.",
    )
    .replace(
      /^urge\s+porque\s+cierra\s+(?:este\s+)?(.+?)[.!]*$/i,
      "Fecha límite: $1.",
    )
    .replace(/\by\s+si\s+no\s+suben\s+el\s+pdf\s+bien\s+los\s+botan\b/gi, "por lo que es indispensable adjuntar la documentación en PDF legible para su validación")
    .replace(/\bsi\s+no\s+lo\s+suben\s+bien\s+los\s+botan\b/gi, "es indispensable adjuntar la documentación completa para su validación")
    .replace(/\blos\s+botan\b|\bte\s+botan\b/gi, "no procederá el trámite")
    .replace(/^tienen\s+que\s+entrar\s+a\s+(\S+)\s+y\s+subir\s*:?$/i, "Realiza el trámite en $1 adjuntando la siguiente documentación:")
    .replace(/^tienen\s+que\s+entrar\s+a\s+(\S+)\s+para\s+(.+?)[.!]*$/i, "Ingresa a $1 para $2.")
    .replace(
      /cualquier\s+duda\s+o\s+rechazo\s+de\s+expediente\s+pasan\s+directo\s+a\s+(.+?)[.!]*$/i,
      "Para atención de dudas o seguimiento de expediente, acude directamente a $1.",
    )
    .replace(/\bpasan\s+directo\s+a\b|\bcaiganle\s+a\b|\bl[aá]ncense\s+a\b/gi, "acude a")
    .replace(
      /[¡!.\s]*avisen\s+a\s+sus\s+compas\s+de\s+([^.!]+)[¡!.\s]*$/i,
      " Dirigido a la comunidad estudiantil de $1.",
    )
    .replace(/[¡!.\s]*avisen\s+a\s+sus\s+compas[¡!.\s]*$/i, "")
    .replace(/\bcompas\b|\bbanda\b|\bbandita\b/gi, "comunidad estudiantil")
    .replace(/\bporfa\b|\bxfa\b/gi, "por favor")
    .replace(/!{2,}/g, ".")
    .trim();

  if (!out) return "";
  return `${out.charAt(0).toUpperCase()}${out.slice(1)}`;
}

function synthesizeInstitutionalTitle(rawText: string, bodyLines: string[], sourceArea: SourceArea, explicitTitle?: string): string {
  if (explicitTitle && explicitTitle.trim().length >= 4) {
    return explicitTitle.trim().replace(/!+$/, "").slice(0, 140);
  }

  const fullText = rawText.replace(/\s+/g, " ").trim();

  // Check for specific named programs, convocatorias, or events
  const becaMatch = fullText.match(/\b(beca\s+institucional(?:\s+20\d{2}-[ab12])?|beca\s+de\s+[a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,3}(?:\s+20\d{2}-[ab12])?|convocatoria\s+sibec(?:\s+20\d{2}-[ab12])?)/i);
  const deadlineMatch = fullText.match(/\b(?:cierra|fecha\s+l[ií]mite|hasta\s+el|antes\s+del)\s+(?:este\s+)?((?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)?\s*\d{1,2}\s+de\s+[a-záéíóú]+(?:\s+a\s+las\s+\d{1,2}:\d{2}\s*(?:hrs|horas|h)?)?)/i);

  if (becaMatch) {
    const lowerWords = new Set(["de", "del", "la", "las", "el", "los", "y", "para", "en", "a"]);
    const becaName = becaMatch[1]
      .trim()
      .split(/\s+/)
      .map((w, idx) =>
        idx > 0 && lowerWords.has(w.toLowerCase())
          ? w.toLowerCase()
          : `${w.charAt(0).toUpperCase()}${w.slice(1)}`,
      )
      .join(" ");
    if (/expediente|subir|pdf|sibec/i.test(fullText)) {
      return `${becaName}: entrega de expediente digital y fecha límite`.slice(0, 140);
    }
    return `Convocatoria y lineamientos · ${becaName}`.slice(0, 140);
  }

  const ttMatch = fullText.match(/\b(protocolos?\s+de\s+trabajo\s+terminal(?:\s+20\d{2}-[ab12])?|trabajo\s+terminal\s+(?:tt1|tt2|20\d{2}-[ab12]))/i);
  if (ttMatch) {
    return `Recepción y registro de ${ttMatch[1].trim()}`.slice(0, 140);
  }

  const reinscMatch = fullText.match(/\b(reinscripci[oó]n(?:es)?(?:\s+20\d{2}-[ab12])?)/i);
  if (reinscMatch) {
    return `Calendario y lineamientos de ${reinscMatch[1].trim()}`.slice(0, 140);
  }

  const celexMatch = fullText.match(/\b(inscripci[oó]n(?:es)?\s+(?:al\s+)?celex|examen\s+de\s+colocaci[oó]n\s+celex|cursos?\s+de\s+ingl[eé]s\s+celex)/i);
  if (celexMatch) {
    return `CELEX ESCOM: ${celexMatch[1].trim()}`.slice(0, 140);
  }

  // Fallback: take the first meaningful non-bullet sentence and clean it into a headline
  const candidate = (bodyLines.find((l) => !l.startsWith("•") && !l.startsWith("📅") && l.length >= 10) ?? "Comunicado institucional ESCOM")
    .replace(/^El área de [^,.]+ informa a la comunidad estudiantil los lineamientos y requisitos para\s+/i, "Lineamientos y requisitos: ")
    .replace(/^Se informa a la comunidad de la ESCOM sobre\s+/i, "")
    .replace(/^La Subdirección [^,.]+ informa sobre\s+/i, "")
    .split(/[.!?]\s+/)[0]
    .replace(/[.!]+$/, "")
    .trim();

  if (deadlineMatch && candidate.length < 75 && !candidate.toLowerCase().includes("fecha")) {
    return `${candidate.charAt(0).toUpperCase()}${candidate.slice(1)} (cierre: ${deadlineMatch[1].trim()})`.slice(0, 140);
  }

  const areaPrefix = sourceArea !== "general" ? `${sourceAreaShortLabel(sourceArea)}: ` : "";
  const cleanCandidate = `${candidate.charAt(0).toUpperCase()}${candidate.slice(1)}`;
  if (cleanCandidate.length < 55 && areaPrefix && !cleanCandidate.toLowerCase().includes(sourceAreaShortLabel(sourceArea).toLowerCase())) {
    return `${areaPrefix}${cleanCandidate}`.slice(0, 140);
  }
  return (cleanCandidate || "Comunicado institucional ESCOM").slice(0, 140);
}

/**
 * Procesador determinista que entiende TANTO las 10 preguntas del Microsoft Forms
 * de la profesora de Comunicación Social COMO mensajes coloquiales de WhatsApp/correo/oficio.
 */
function buildFallbackFromRawText(rawText: string) {
  const normalized = rawText.replace(/\r/g, "").trim();
  const rawLines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let explicitAreaText = "";
  let explicitTitle = "";
  let startDateRaw = "";
  let endDateRaw = "";
  let voboWarning = "";
  let pubTypeNote = "";
  let internalNote = "";

  const contentLines: string[] = [];
  type ExpectSection = "none" | "area" | "vobo" | "pub_type" | "copy" | "start_date" | "end_date" | "links" | "files" | "notes";
  let section: ExpectSection = "none";

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const lower = line.toLowerCase();

    // Detect Microsoft Forms boilerplate lines to ignore immediately
    if (
      /^(enter your answer|please input date|upload file|non-anonymous question|\(non-anonymous question\)|file number limit:|single file size limit:|allowed file types:|seleccione\.{2,}|other)$/i.test(
        line,
      ) ||
      /^https?:\/\/forms\.(?:cloud\.microsoft|office\.com)\//i.test(line)
    ) {
      continue;
    }

    // Q1: ¿A qué Sección, Área o Subdirección pertenece?
    const q1Inline = line.match(/^(?:1[.)]\s*)?(?:¿?a\s+qu[eé]\s+secci[oó]n,\s*[aá]rea\s+o\s+subdirecci[oó]n\s+pertenece\??|[aá]rea\s+o\s+subdirecci[oó]n|secci[oó]n\s+o\s+[aá]rea|subdirecci[oó]n\s+solicitante)\s*[:?-]?\s*(.*)$/i);
    if (q1Inline) {
      if (q1Inline[1]?.trim()) {
        explicitAreaText = q1Inline[1].trim();
        section = "none";
      } else {
        section = "area";
      }
      continue;
    }

    // Q2: ¿Cuenta con el visto bueno de su Jefe inmediato...?
    const q2Inline = line.match(/^(?:2[.)]\s*)?(?:¿?cuenta\s+con\s+el\s+visto\s+bueno|visto\s+bueno|vobo)\b[^:?]*[:?]?\s*(.*)$/i);
    if (q2Inline) {
      const val = q2Inline[1]?.trim() ?? "";
      if (val) {
        if (/^no\b|solicitar\s+autorizaci[oó]n/i.test(val)) {
          voboWarning = "⚠️ Atención: La solicitud indica que NO cuenta con visto bueno (VoBo) del jefe inmediato.";
        }
        section = "none";
      } else {
        section = "vobo";
      }
      continue;
    }
    if (
      /^(?:s[ií],\s+el\s+director,\s+mtro\.\s+iv[aá]n\s+giovanny\s+mosso|s[ií],\s+el\(la\)\s+subdirector\(a\)|s[ií],\s+el\s+jefe\s+de\s+la\s+secci[oó]n|no,\s+favor\s+de\s+solicitar\s+autorizaci[oó]n)/i.test(
        line,
      )
    ) {
      if (/^no\b|solicitar\s+autorizaci[oó]n/i.test(line)) {
        voboWarning = "⚠️ Atención: La solicitud indica que NO cuenta con visto bueno (VoBo) del jefe inmediato.";
      }
      section = "none";
      continue;
    }

    // Q3: ¿Cuál es el tipo de publicación que solicita?
    const q3Inline = line.match(/^(?:3[.)]\s*)?(?:¿?cu[aá]l\s+es\s+el\s+tipo\s+de\s+publicaci[oó]n|tipo\s+de\s+publicaci[oó]n)\b[^:?]*[:?]?\s*(.*)$/i);
    if (q3Inline) {
      const val = q3Inline[1]?.trim() ?? "";
      if (/dise[ñn]o\s+de\s+cartel/i.test(val)) {
        pubTypeNote = "Solicitud marcada para Diseño de Cartel.";
      }
      section = val ? "none" : "pub_type";
      continue;
    }
    if (/^(?:aviso\s+para\s+publicaci[oó]n\s+en\s+redes\s+sociales|dise[ñn]o\s+de\s+cartel)$/i.test(line)) {
      if (/dise[ñn]o\s+de\s+cartel/i.test(line)) {
        pubTypeNote = "Solicitud marcada para Diseño de Cartel.";
      }
      section = "none";
      continue;
    }

    // Q4: Redacte el copy de su publicación (Redes Sociales) o el Título y texto (Cartel)
    const q4Inline = line.match(/^(?:4[.)]\s*)?(?:redacte\s+el\s+copy\s+de\s+su\s+publicaci[oó]n|copy\s+de\s+la\s+publicaci[oó]n)\b[^:)]*[):]?\s*(.*)$/i);
    if (q4Inline) {
      if (q4Inline[1]?.trim()) {
        contentLines.push(q4Inline[1].trim());
      }
      section = "copy";
      continue;
    }

    // Q5: Fecha de inicio / evento (solo encabezados del formulario)
    const q5Inline = line.match(
      /^(?:5[.)]\s*|fecha\s+de\s+inicio\s*:|fecha\s+del\s+evento\s*:|proporcione\s+la\s+fecha\s+en\s+que\s+se\s+llevar[aá]\s+a\s+cabo)\b[^:)]*[):]?\s*(.*)$/i,
    );
    if (q5Inline) {
      if (q5Inline[1]?.trim() && !/opcional/i.test(q5Inline[1])) {
        startDateRaw = q5Inline[1].trim();
        section = "none";
      } else {
        section = "start_date";
      }
      continue;
    }

    // Q6: Fecha de finalización
    const q6Inline = line.match(
      /^(?:6[.)]\s*)?(?:si\s+la\s+fecha\s+en\s+que\s+se\s+llevar[aá]\s+a\s+cabo.*fecha\s+de\s+finalizaci[oó]n|fecha\s+de\s+finalizaci[oó]n|fecha\s+de\s+fin|fecha\s+de\s+t[eé]rmino)\b[^:)]*[):]?\s*(.*)$/i,
    );
    if (q6Inline) {
      if (q6Inline[1]?.trim() && !/opcional/i.test(q6Inline[1])) {
        endDateRaw = q6Inline[1].trim();
        section = "none";
      } else {
        section = "end_date";
      }
      continue;
    }

    // Q7: Enlaces a recursos externos
    const q7Inline = line.match(/^(?:7[.)]\s*)?(?:proporcione\s+los\s+enlaces\s+a\s+recursos\s+externos|enlaces?\s+externos?)\b[^:)]*[):]?\s*(.*)$/i);
    if (q7Inline) {
      if (q7Inline[1]?.trim()) {
        contentLines.push(q7Inline[1].trim());
      }
      section = "links";
      continue;
    }

    // Q8 & Q9: Suba en este apartado el archivo...
    if (/^(?:[89][.)]\s*)?suba\s+en\s+este\s+apartado\b/i.test(line)) {
      section = "files";
      continue;
    }

    // Q10: Indicación adicional
    const q10Inline = line.match(
      /^(?:10[.)]\s*)?(?:si\s+tiene\s+alguna\s+indicaci[oó]n\s+adicional|indicaciones?\s+adicionales?)\b[^:)]*[):]?\s*(.*)$/i,
    );
    if (q10Inline) {
      if (q10Inline[1]?.trim()) {
        internalNote = q10Inline[1].trim();
      }
      section = "notes";
      continue;
    }

    // Explicit Título: / Texto: lines inside Q4 or general text
    const titlePrefix = line.match(/^(?:t[ií]tulo|asunto|encabezado)\s*:\s*(.+)$/i);
    if (titlePrefix) {
      explicitTitle = titlePrefix[1].trim();
      continue;
    }
    const bodyPrefix = line.match(/^(?:texto|cuerpo|copy|mensaje|descripci[oó]n)\s*:\s*(.+)$/i);
    if (bodyPrefix) {
      contentLines.push(bodyPrefix[1].trim());
      section = "copy";
      continue;
    }

    // Route the line according to active Microsoft Form section
    if (section === "area") {
      explicitAreaText = line;
      section = "none";
      continue;
    }
    if (section === "vobo") {
      if (/^no\b|solicitar\s+autorizaci[oó]n/i.test(line)) {
        voboWarning = "⚠️ Atención: La solicitud indica que NO cuenta con visto bueno (VoBo) del jefe inmediato.";
      }
      section = "none";
      continue;
    }
    if (section === "pub_type") {
      if (/dise[ñn]o\s+de\s+cartel/i.test(line)) {
        pubTypeNote = "Solicitud marcada para Diseño de Cartel.";
      }
      section = "none";
      continue;
    }
    if (section === "start_date") {
      startDateRaw = line;
      section = "none";
      continue;
    }
    if (section === "end_date") {
      endDateRaw = line;
      section = "none";
      continue;
    }
    if (section === "files") {
      continue;
    }
    if (section === "notes") {
      if (!/^(ninguna|n\/a|sin\s+indicaciones|gracias|no)$/i.test(lower)) {
        internalNote = internalNote ? `${internalNote} · ${line}` : line;
      }
      continue;
    }

    contentLines.push(line);
  }

  // Extract all URLs from the text
  const allUrls = Array.from(
    new Set(
      (normalized.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [])
        .map((u) => u.replace(/[.,;!?]+$/, ""))
        .filter((u) => !/^https?:\/\/forms\.(?:cloud\.microsoft|office\.com)\//i.test(u)),
    ),
  );
  const externalUrl = allUrls[0] ?? "";

  const sourceArea: SourceArea = explicitAreaText
    ? detectSourceAreaFromText(explicitAreaText)
    : detectSourceAreaFromText(contentLines.join("\n") || normalized);

  const category = detectCategoryFromText(contentLines.join("\n") || normalized, sourceArea);

  // Rewrite content lines from colloquial to institutional
  const rewrittenLines = contentLines
    .map(rewriteColloquialLine)
    .filter((l) => l.length > 0);

  // Format optional start/end dates from Q5 and Q6
  const startFormatted = formatFormDateToSpanish(startDateRaw);
  const endFormatted = formatFormDateToSpanish(endDateRaw);
  if (startFormatted && endFormatted && startFormatted !== endFormatted) {
    rewrittenLines.push(`📅 Periodo de la actividad: del ${startFormatted} al ${endFormatted}.`);
  } else if (startFormatted) {
    rewrittenLines.push(`📅 Fecha de la actividad: ${startFormatted}.`);
  }

  // Ensure secondary links (if >1 link in Q7) are listed cleanly
  const extraUrls = allUrls.slice(1);
  for (const extra of extraUrls) {
    if (!rewrittenLines.some((l) => l.includes(extra))) {
      rewrittenLines.push(`🔗 Recurso adicional: ${extra}`);
    }
  }

  const title = synthesizeInstitutionalTitle(
    contentLines.join("\n") || normalized,
    rewrittenLines,
    sourceArea,
    explicitTitle,
  );

  // Group contiguous bullet items cleanly and separate paragraphs
  const formattedBlocks: string[] = [];
  let bulletGroup: string[] = [];
  for (const line of rewrittenLines) {
    if (line.startsWith("• ")) {
      bulletGroup.push(line);
    } else {
      if (bulletGroup.length > 0) {
        formattedBlocks.push(bulletGroup.join("\n"));
        bulletGroup = [];
      }
      // Don't repeat the title verbatim as the first single line
      if (formattedBlocks.length === 0 && line.replace(/[.!]+$/, "").toLowerCase() === title.toLowerCase()) {
        continue;
      }
      formattedBlocks.push(line);
    }
  }
  if (bulletGroup.length > 0) {
    formattedBlocks.push(bulletGroup.join("\n"));
  }

  const body = (formattedBlocks.join("\n\n").trim() || title).slice(0, 7500);
  const lowerAll = `${normalized} ${internalNote}`.toLowerCase();
  const featured = /urgente|importante|convocatoria|cierre|[uú]ltimo\s+d[ií]a|destacar|beca|reinscrip/i.test(lowerAll);

  const social = buildFallbackSocial({
    title,
    body,
    category,
    sourceArea,
    externalUrl,
  });

  const notes: string[] = [];
  if (voboWarning) notes.push(voboWarning);
  if (pubTypeNote) notes.push(pubTypeNote);
  if (internalNote) notes.push(`Indicación del solicitante: "${internalNote}"`);

  return {
    title,
    body,
    category,
    sourceArea,
    externalUrl,
    featured,
    lacksVobo: Boolean(voboWarning),
    ...social,
    metaNotes: notes.join(" · "),
  };
}

export async function generateSocialCopy(input: {
  title: string;
  body: string;
  category: string;
  sourceArea?: string;
  externalUrl?: string;
}): Promise<{
  text?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  aiUsed?: boolean;
  notice?: string;
  error?: string;
}> {
  const user = await publisher();
  if (!user) return { error: "No tienes permiso para generar formatos de avisos." };
  const title = input.title.trim().slice(0, 180);
  const body = input.body.trim().slice(0, 8000);
  const sourceArea: SourceArea = isSourceArea(String(input.sourceArea ?? ""))
    ? (input.sourceArea as SourceArea)
    : detectSourceAreaFromText(`${title}\n${body}`);
  const externalUrl = input.externalUrl?.trim() ?? "";

  if (title.length < 3 || body.length < 1 || !isCategory(input.category)) {
    return { error: "Completa título, cuerpo y categoría antes de generar el formato." };
  }
  const fallback = buildFallbackSocial({
    title,
    body,
    category: input.category,
    sourceArea,
    externalUrl,
  });
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ...fallback,
      aiUsed: false,
      notice: "La IA no está configurada en el servidor; se aplicó la plantilla institucional local. Revisa y edita antes de publicar.",
    };
  }

  const models = Array.from(
    new Set(
      [
        process.env.GOOGLE_AVISO_MODEL?.trim(),
        "gemini-3.5-flash-lite",
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
      ].filter((m): m is string => Boolean(m)),
    ),
  );

  const ai = new GoogleGenAI({ apiKey });
  let lastAiErr = "";
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: `Redacta tres formatos institucionales para redes sociales en español de México para la comunidad de ESCOM del IPN.
Conserva únicamente los datos presentes (fechas, horarios, oficinas, enlaces, requisitos). Nunca repitas el título dos veces seguidas ni cortes palabras a la mitad.
Devuelve estrictamente un JSON con las llaves:
- "twitter": máximo 280 caracteres con #ESCOM #IPN
- "facebook": entre 140 y 650 caracteres, estructurado con viñetas si aplica
- "instagram": entre 140 y 650 caracteres, visual y con hashtags institucionales

Área emisora: ${sourceAreaLabel(sourceArea)}
Categoría: ${input.category}
Título: ${title}
Enlace externo: ${externalUrl || "ninguno"}
Comunicado:
${body}`,
        config: { responseMimeType: "application/json" },
      });
      const raw = stripJsonFences(response.text ?? "");
      const parsed = JSON.parse(raw) as {
        twitter?: string;
        facebook?: string;
        instagram?: string;
      };
      const parsedUrl = externalUrl;
      const twitter = fitTweet(parsed.twitter ?? "", fallback.twitter, parsedUrl);
      const facebook = truncateClean(parsed.facebook ?? fallback.facebook, 1000);
      const instagram = truncateClean(parsed.instagram ?? fallback.instagram, 1000);
      return {
        twitter,
        facebook,
        instagram,
        text: `Twitter / X:\n${twitter}\n\nFacebook:\n${facebook}\n\nInstagram:\n${instagram}`,
        aiUsed: true,
        notice: "Formatos de redes regenerados con IA.",
      };
    } catch (err) {
      lastAiErr = err instanceof Error ? err.message : "Error de IA";
    }
  }

  return {
    ...fallback,
    aiUsed: false,
    notice: `IA no disponible (${lastAiErr.slice(0, 70) || "sin respuesta"}); se usaron formatos institucionales locales.`,
  };
}

export async function generateAvisoFromRawText(rawTextInput: string): Promise<{
  title?: string;
  body?: string;
  category?: Category;
  sourceArea?: SourceArea;
  externalUrl?: string;
  featured?: boolean;
  lacksVobo?: boolean;
  aiUsed?: boolean;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  text?: string;
  notice?: string;
  error?: string;
}> {
  const user = await publisher();
  if (!user) return { error: "No tienes permiso para usar el generador de comunicados." };
  const rawText = rawTextInput.trim().slice(0, 12000);
  if (rawText.length < 15) {
    return { error: "Pega al menos 15 caracteres del mensaje, correo o formulario recibido." };
  }

  const fallback = buildFallbackFromRawText(rawText);
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  const suffixNotice = fallback.metaNotes ? ` (${fallback.metaNotes})` : "";

  if (!apiKey) {
    return {
      ...fallback,
      aiUsed: false,
      notice: `La IA no está configurada; el comunicado y formatos se estructuraron con reglas locales${suffixNotice}.`,
    };
  }

  const models = Array.from(
    new Set(
      [
        process.env.GOOGLE_AVISO_MODEL?.trim(),
        "gemini-3.5-flash-lite",
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
      ].filter((m): m is string => Boolean(m)),
    ),
  );

  const ai = new GoogleGenAI({ apiKey });
  let lastAiErr = "";

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: `Eres la titular de Comunicación Social de la ESCOM (IPN, México).
Recibes solicitudes para publicar anuncios ya sea pegadas desde el formulario oficial de Microsoft Forms de Comunicación Social o por mensajes informales de WhatsApp, correo u oficio.

REGLAS ESTRICTAS DE TRANSFORMACIÓN:
1. Si el texto viene con lenguaje coloquial o de WhatsApp ("Que onda banda", "les paso el dato", "los botan", "avisen a sus compas", etc.), TRANSFÓRMALO por completo a redacción institucional, formal, clara y directa del IPN/ESCOM. PROHIBIDO dejar jerga coloquial en el título, en el cuerpo o en los textos de redes.
2. Si el texto incluye preguntas o respuestas del formulario de solicitud de Comunicación Social:
   - Pregunta 1 (Sección, Área o Subdirección): úsala para asignar "sourceArea" y mencionar qué área informa, sin copiar la pregunta al texto.
   - Pregunta 2 (Visto Bueno / VoBo del Director Mtro. Iván Giovanny Mosso García, Subdirector o Jefe SEPI): es control interno. JAMÁS incluyas el VoBo en el comunicado público. Si dice "No, favor de solicitar autorización", pon "lacksVobo": true.
   - Pregunta 3 (Tipo de publicación: Redes Sociales o Diseño de Cartel): es control interno, no lo incluyas en el texto público.
   - Preguntas 5 y 6 (Fecha de inicio y fecha de finalización del evento o periodo, a veces en formato M/d/yyyy): intégralas redactadas en español claro dentro del comunicado.
   - Pregunta 7 (Enlaces a recursos externos: formularios, web, PDFs, Drive): coloca el enlace principal en "externalUrl" y conserva enlaces adicionales en el cuerpo.
   - Preguntas 8, 9 y 10 (Archivos e indicaciones adicionales para Comunicación): las indicaciones adicionales son notas internas para ti; NO las pegues en el comunicado público, pero úsalas para saber si es urgente ("featured": true).
3. NO inventes fechas, horarios, oficinas, requisitos ni enlaces que no estén en el texto original.
4. El "title" debe ser un titular institucional claro y conciso (máx. 130 caracteres), NUNCA la primera oración coloquial copiada y NUNCA repetido como primera línea igual en "body".

Devuelve estrictamente un JSON con estas llaves:
- "title": titular institucional para la plataforma ESCOM (máx. 130 caracteres)
- "body": comunicado institucional completo, ordenado en párrafos cortos y viñetas "• " para requisitos o pasos
- "category": exactamente uno de "academico", "social", "tramites"
- "sourceArea": exactamente uno de "direccion", "subdireccion_academica", "sseis", "subdireccion_administrativa", "sepi", "celex", "ctce", "general"
  (Nota: Becas, Servicio Social, Culturales, Deportivos y Salud pertenecen a "sseis"; Gestión Escolar, Reinscripciones, SAES, CATT, Trabajo Terminal y ETS pertenecen a "subdireccion_academica"; COSIE/dictámenes a "ctce"; Posgrado a "sepi"; Idiomas/Inglés a "celex").
- "externalUrl": URL principal con http:// o https:// encontrada en el texto, o ""
- "featured": booleano (true si es urgente, tiene fecha límite próxima o es convocatoria institucional importante)
- "twitter": copy institucional para Twitter/X (máx. 280 caracteres, sin repetir el título dos veces, con #ESCOM #IPN)
- "facebook": copy institucional para Facebook (entre 140 y 650 caracteres, bien estructurado)
- "instagram": copy institucional para Instagram (entre 140 y 650 caracteres, visual y con hashtags de ESCOM/IPN)

Texto recibido:
${rawText}`,
        config: { responseMimeType: "application/json" },
      });

      const raw = stripJsonFences(response.text ?? "");
      const parsed = JSON.parse(raw) as {
        title?: string;
        body?: string;
        category?: string;
        sourceArea?: string;
        externalUrl?: string;
        featured?: boolean;
        lacksVobo?: boolean;
        twitter?: string;
        facebook?: string;
        instagram?: string;
      };

      const candidateTitle = (parsed.title ?? "").trim();
      const hasColloquialTitle = /^(?:[¡!¿?\s]*)(?:que\s+onda|qué\s+onda|hola\s+banda|les\s+paso\s+el\s+dato)/i.test(
        candidateTitle,
      );
      const title = (!candidateTitle || hasColloquialTitle ? fallback.title : candidateTitle).slice(0, 180);
      const body = ((parsed.body ?? "").trim() || fallback.body).slice(0, 8000);
      const category = isCategory(String(parsed.category ?? ""))
        ? (parsed.category as Category)
        : fallback.category;
      const sourceArea = isSourceArea(String(parsed.sourceArea ?? ""))
        ? (parsed.sourceArea as SourceArea)
        : fallback.sourceArea;
      const urlCandidate = (parsed.externalUrl ?? fallback.externalUrl).trim();
      const externalUrl = /^https?:\/\//i.test(urlCandidate) ? urlCandidate.slice(0, 500) : fallback.externalUrl;
      const featured = typeof parsed.featured === "boolean" ? parsed.featured : fallback.featured;

      const parsedUrl = parsed.externalUrl?.trim() || fallback.externalUrl;
      const twitter = fitTweet(parsed.twitter ?? "", fallback.twitter, parsedUrl);
      const facebook = truncateClean(parsed.facebook?.trim() || fallback.facebook, 1000);
      const instagram = truncateClean(parsed.instagram?.trim() || fallback.instagram, 1000);
      const voboNote = parsed.lacksVobo && !suffixNotice.includes("autorización")
        ? `${suffixNotice} · Falta confirmar visto bueno (VoBo).`
        : suffixNotice;

      return {
        title,
        body,
        category,
        sourceArea,
        externalUrl,
        featured,
        lacksVobo: Boolean(parsed.lacksVobo || fallback.lacksVobo),
        aiUsed: true,
        twitter,
        facebook,
        instagram,
        text: `Twitter / X:\n${twitter}\n\nFacebook:\n${facebook}\n\nInstagram:\n${instagram}`,
        notice: `IA transformó la información en comunicado institucional y formatos para X, Facebook e Instagram${voboNote}.`,
      };
    } catch (err) {
      lastAiErr = err instanceof Error ? err.message : "Error de IA";
    }
  }

  return {
    ...fallback,
    aiUsed: false,
    notice: `IA no disponible (${lastAiErr.slice(0, 70) || "sin respuesta"}); el comunicado y formatos se estructuraron con reglas locales${suffixNotice}.`,
  };
}

async function uploadNoticeImage(userId: string, form: FormData): Promise<{ url: string | null } | { error: string }> {
  const { resolveUploadedPublicImage } = await import("@/lib/resolve-upload");
  return resolveUploadedPublicImage(form, "image", userId, "avisos");
}

function readAviso(form: FormData) {
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const category = String(form.get("category") ?? "");
  const rawSourceArea = String(form.get("source_area") ?? "general").trim();
  const sourceArea: SourceArea = isSourceArea(rawSourceArea) ? rawSourceArea : "general";
  const featured = form.get("featured") === "on";
  const isPublic = form.get("is_public") === "on";
  const publishAt = parsePublishAt(String(form.get("publish_at") ?? ""));
  const externalUrlParsed = parseExternalUrl(String(form.get("external_url") ?? ""));
  const socialTwitter = String(form.get("social_twitter") ?? "").trim().slice(0, 280);
  const socialFacebook = String(form.get("social_facebook") ?? "").trim().slice(0, 1000);
  const socialInstagram = String(form.get("social_instagram") ?? "").trim().slice(0, 1000);
  const socialRaw = String(form.get("social_copy") ?? "").trim().slice(0, 1600);

  if (title.length < 3 || title.length > 180) {
    return { error: "El título debe tener entre 3 y 180 caracteres." } as const;
  }
  if (!body || body.length > 8000) {
    return { error: "Escribe el cuerpo del aviso (máximo 8000 caracteres)." } as const;
  }
  if (!isCategory(category)) {
    return { error: "Elige una categoría: académico, social o trámites." } as const;
  }
  if (!publishAt) {
    return { error: "Indica una fecha de publicación válida." } as const;
  }
  if ("error" in externalUrlParsed) {
    return { error: externalUrlParsed.error } as const;
  }

  const combinedSocial =
    socialTwitter || socialFacebook || socialInstagram
      ? [
          socialTwitter ? `Twitter / X:\n${socialTwitter}` : "",
          socialFacebook ? `Facebook:\n${socialFacebook}` : "",
          socialInstagram ? `Instagram:\n${socialInstagram}` : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      : socialRaw;

  return {
    title,
    body,
    category,
    sourceArea,
    featured,
    isPublic,
    publishAt,
    externalUrl: externalUrlParsed.url,
    socialCopy: combinedSocial || null,
    socialTwitter: socialTwitter || null,
    socialFacebook: socialFacebook || null,
    socialInstagram: socialInstagram || null,
  } as const;
}

function refresh(id?: string) {
  revalidatePath("/");
  revalidatePath("/avisos");
  revalidatePath("/avisos/nuevo");
  if (id) revalidatePath(`/avisos/${id}`);
}

export async function crearAviso(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await publisher();
  if (!user) return { error: "No tienes permiso para publicar avisos." };

  const parsed = readAviso(form);
  if ("error" in parsed) return { error: parsed.error };

  const uploaded = await uploadNoticeImage(user.id, form);
  if ("error" in uploaded) return { error: uploaded.error };

  const { rows } = await pool.query<{ id: string }>(
    `insert into avisos
       (author_id, title, body, category, source_area, featured, is_public, publish_at, external_url, social_copy, social_twitter, social_facebook, social_instagram, image_url, published_triggered)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, ($8 <= now()))
     returning id`,
    [
      user.id,
      parsed.title,
      parsed.body,
      parsed.category,
      parsed.sourceArea,
      parsed.featured,
      parsed.isPublic,
      parsed.publishAt,
      parsed.externalUrl,
      parsed.socialCopy,
      parsed.socialTwitter,
      parsed.socialFacebook,
      parsed.socialInstagram,
      uploaded.url,
    ],
  );
  const id = rows[0]?.id;
  if (!id) return { error: "No se pudo guardar el aviso." };

  await audit(user.id, "crear", "avisos", id);
  refresh(id);
  if (form.get("stay") === "1") {
    return { ok: true, id };
  }
  redirect(`/avisos/${id}`);
}

export async function actualizarAviso(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await publisher();
  if (!user) return { error: "No tienes permiso para editar avisos." };

  const id = String(form.get("id") ?? "");
  const parsed = readAviso(form);
  if ("error" in parsed) return { error: parsed.error };

  const uploaded = await uploadNoticeImage(user.id, form);
  if ("error" in uploaded) return { error: uploaded.error };

  const { rows } = await pool.query<{ id: string }>(
    `update avisos
     set title = $1, body = $2, category = $3, source_area = $4, featured = $5,
         is_public = $6, publish_at = $7, external_url = $8,
         social_copy = $9, social_twitter = $10, social_facebook = $11, social_instagram = $12,
         image_url = coalesce($13, image_url),
         published_triggered = ($7 <= now())
     where id = $14 and (author_id = $15 or $16::boolean)
     returning id`,
    [
      parsed.title,
      parsed.body,
      parsed.category,
      parsed.sourceArea,
      parsed.featured,
      parsed.isPublic,
      parsed.publishAt,
      parsed.externalUrl,
      parsed.socialCopy,
      parsed.socialTwitter,
      parsed.socialFacebook,
      parsed.socialInstagram,
      uploaded.url,
      id,
      user.id,
      user.role === "admin",
    ],
  );
  if (!rows[0]) return { error: "Solo puedes editar avisos que publicaste tú o con cuenta de administración." };

  await audit(user.id, "editar", "avisos", id);
  refresh(id);
  if (form.get("stay") === "1") {
    return { ok: true, id };
  }
  redirect(`/avisos/${id}`);
}

export async function eliminarAviso(form: FormData) {
  const user = await publisher();
  if (!user) redirect("/avisos");

  const id = String(form.get("id") ?? "");
  const { rows } = await pool.query<{ id: string }>(
    "delete from avisos where id = $1 and (author_id = $2 or $3::boolean) returning id",
    [id, user.id, user.role === "admin"],
  );
  if (rows[0]) await audit(user.id, "eliminar", "avisos", id);
  refresh(id);
  redirect("/avisos");
}

export async function eliminarAvisoInline(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await publisher();
  if (!user) return { error: "No tienes permiso para eliminar avisos." };

  const id = String(form.get("id") ?? "");
  const { rows } = await pool.query<{ id: string }>(
    "delete from avisos where id = $1 and (author_id = $2 or $3::boolean) returning id",
    [id, user.id, user.role === "admin"],
  );
  if (!rows[0]) return { error: "No se pudo eliminar el aviso." };
  await audit(user.id, "eliminar", "avisos", id);
  refresh(id);
  return { ok: true, id };
}
