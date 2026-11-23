import { unzipSync } from "fflate";
import * as saxes from "saxes";
import { createWorker } from "tesseract.js";
import { GoogleGenAI } from "@google/genai";
import { asFaqs, serializeFaqs, validateSteps, type GuideStep } from "./shared";

function sourceFormat(bytes: Buffer, name: string) {
  if (bytes.subarray(0, 4).toString() === "%PDF") return "application/pdf";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (name.toLowerCase().endsWith(".docx") && bytes[0] === 0x50 && bytes[1] === 0x4b) return "docx";
  return "text";
}

function wordText(bytes: Buffer): string {
  const files = unzipSync(new Uint8Array(bytes));
  const entry = files["word/document.xml"];
  if (!entry || entry.byteLength > 2 * 1024 * 1024) return "";
  const parser = new saxes.SaxesParser({ xmlns: false });
  const out: string[] = [];
  let tag = "";
  let skipFallback = 0;
  parser.on("opentag", (node: { name: string }) => {
    tag = node.name;
    if (node.name === "mc:Fallback") skipFallback += 1;
    if (skipFallback === 0 && node.name === "w:tab") out.push(" ");
    if (skipFallback === 0 && node.name === "w:br") out.push("\n");
  });
  parser.on("text", (value: string) => {
    if (skipFallback === 0 && tag === "w:t") out.push(value);
  });
  parser.on("closetag", (node: { name: string }) => {
    if (node.name === "mc:Fallback" && skipFallback > 0) skipFallback -= 1;
    if (skipFallback === 0 && (node.name === "w:p" || node.name === "w:tr")) out.push("\n");
    tag = "";
  });
  parser.write(new TextDecoder().decode(entry)).close();
  return out.join("");
}

async function ocrWorker() {
  const worker = await createWorker("spa");
  return worker;
}

async function recognize(bytes: Buffer): Promise<string> {
  const worker = await ocrWorker();
  try {
    const result = await worker.recognize(bytes, { rotateAuto: true });
    return result.data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

type PositionedItem = { str: string; x: number; y: number };

function sortPdfItems(items: PositionedItem[]): string {
  if (!items.length) return "";
  const sorted = [...items].sort((a, b) => {
    const dy = b.y - a.y;
    if (Math.abs(dy) > 6) return dy;
    return a.x - b.x;
  });
  const lines: string[] = [];
  let currentY = sorted[0].y;
  let currentParts: string[] = [];
  for (const item of sorted) {
    if (Math.abs(item.y - currentY) > 6) {
      if (currentParts.length) lines.push(currentParts.join(" ").replace(/\s+/g, " ").trim());
      currentParts = [];
      currentY = item.y;
    }
    if (item.str.trim()) currentParts.push(item.str.trim());
  }
  if (currentParts.length) lines.push(currentParts.join(" ").replace(/\s+/g, " ").trim());
  return lines.filter(Boolean).join("\n");
}

async function pdfText(bytes: Buffer): Promise<string> {
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const doc = await pdf.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  let text = "";
  const pageCount = Math.min(doc.numPages, 20);
  for (let n = 1; n <= pageCount; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: PositionedItem[] = [];
    for (const raw of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (raw && typeof raw.str === "string" && raw.str.trim()) {
        const tr = raw.transform ?? [1, 0, 0, 1, 0, 0];
        items.push({ str: raw.str, x: tr[4] ?? 0, y: tr[5] ?? 0 });
      }
    }
    text += `${sortPdfItems(items)}\n\n`;
  }
  const meaningfulChars = text.replace(/[\s\d/.-]+/g, "").length;
  if (meaningfulChars >= 80) return text;

  const worker = await ocrWorker();
  try {
    let scanned = "";
    const scanPages = Math.min(doc.numPages, 10);
    for (let n = 1; n <= scanPages; n += 1) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: canvas as never, viewport }).promise;
      const result = await worker.recognize(canvas.toBuffer("image/png"), { rotateAuto: true });
      scanned += `${result.data.text ?? ""}\n\n`;
    }
    return scanned.trim().length > text.trim().length ? scanned : text;
  } finally {
    await worker.terminate();
  }
}

const BOILERPLATE_RE =
  /^(instituto polit[eé]cnico nacional|escuela superior de c[oó]mputo|subdirecci[oó]n|secretar[ií]a de|p[aá]gina\s+\d+(\s+de\s+\d+)?|ipn\s*-?\s*escom|av\.\s+juan\s+de\s+dios\s+b[aá]tiz)$/i;

function isNoiseLine(line: string): boolean {
  const clean = line.trim();
  if (clean.length < 2) return true;
  if (/^\d{1,3}(\s*\/\s*\d{1,3})?$/.test(clean)) return true;
  return BOILERPLATE_RE.test(clean);
}

function cleanStepTitle(raw: string, fallback: string): string {
  const trimmed = raw
    .replace(/^(?:paso\s*\d+|etapa\s*\d+|\d+[.)]|[•\-*–])\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const base = trimmed.length >= 2 ? trimmed : fallback;
  return base.slice(0, 160);
}

export function draftFromText(text: string) {
  const rawLines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !isNoiseLine(line));

  if (!rawLines.length) {
    throw new Error("No pudimos leer texto útil del archivo.");
  }

  // Detectar título omitiendo líneas demasiado cortas o puramente numéricas
  const titleIdx = rawLines.findIndex((l) => l.length >= 4 && !/^\d/.test(l));
  const titleLine = titleIdx >= 0 ? rawLines[titleIdx] : rawLines[0];
  const title = titleLine.replace(/^[•\-*\d.)\s]+/, "").slice(0, 180) || "Guía de trámite ESCOM";
  const bodyLines = rawLines.filter((_, idx) => idx !== (titleIdx >= 0 ? titleIdx : 0));

  // Separar FAQs (soporta pregunta y respuesta en la misma línea O pregunta en una línea y respuesta abajo)
  const faqs: { q: string; a: string }[] = [];
  const stepSourceLines: string[] = [];
  for (let i = 0; i < bodyLines.length; i += 1) {
    const line = bodyLines[i];
    const inlineFaq = line.match(/^(¿.+?\?)\s+(.+)$/);
    if (inlineFaq) {
      faqs.push({ q: inlineFaq[1].slice(0, 240), a: inlineFaq[2].slice(0, 500) });
      continue;
    }
    if (/^¿.+\?$/.test(line) && i + 1 < bodyLines.length && !/^¿.+\?$/.test(bodyLines[i + 1])) {
      faqs.push({ q: line.slice(0, 240), a: bodyLines[i + 1].slice(0, 500) });
      i += 1;
      continue;
    }
    stepSourceLines.push(line);
  }

  // Agrupar líneas en bloques coherentes de pasos (encabezados numerados, viñetas o saltos lógicos)
  const blocks: { heading: string; details: string[]; isCondition?: { label: string; text: string } }[] = [];
  const stepStartRe = /^(?:paso\s*\d+|etapa\s*\d+|\d+[.)]|[ivxlc]+[.)]|requisito\s*\d*)\s*[:-]?\s*(.+)$/i;
  const condRe = /^(si\s+(?:eres|ya|no|cuentas|vas|aplicas|tienes|trabajas|cursas)[^:]{3,80}|en caso de[^:]{3,80}|para alumnos[^:]{2,70}|modalidad\s+[^:]{2,60})\s*:\s*(.+)$/i;

  for (const line of stepSourceLines) {
    const cond = line.match(condRe);
    if (cond) {
      blocks.push({
        heading: cond[1].trim().slice(0, 140),
        details: [cond[2].trim()],
        isCondition: { label: cond[1].trim().slice(0, 120), text: cond[2].trim() },
      });
      continue;
    }

    const start = line.match(stepStartRe);
    if (start) {
      blocks.push({ heading: cleanStepTitle(line, "Paso"), details: [start[1].trim()] });
      continue;
    }

    const isUpperHeading = line.length <= 80 && line === line.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{4}/.test(line);
    if (isUpperHeading) {
      blocks.push({ heading: line.slice(0, 140), details: [] });
      continue;
    }

    if (blocks.length === 0) {
      blocks.push({ heading: cleanStepTitle(line, "Inicio del trámite"), details: [line] });
    } else {
      const current = blocks[blocks.length - 1];
      const currentLen = current.details.join(" ").length;
      if (currentLen < 700 && current.details.length < 6) {
        current.details.push(line);
      } else {
        blocks.push({ heading: cleanStepTitle(line, `Paso ${blocks.length + 1}`), details: [line] });
      }
    }
  }

  // Compactar si excede 14 bloques para que la guía siga siendo clara e intuitiva
  while (blocks.length > 14) {
    const tail = blocks.pop()!;
    const prev = blocks[blocks.length - 1];
    prev.details.push(`${tail.heading}: ${tail.details.join(" ")}`.trim());
  }

  if (blocks.length === 0) {
    blocks.push({ heading: "Consulta los requisitos", details: [title] });
  }

  const steps: GuideStep[] = [];
  let i = 0;
  while (i < blocks.length) {
    const runStart = i;
    while (i < blocks.length && blocks[i].isCondition) i += 1;
    const condCount = i - runStart;
    if (condCount >= 2 && steps.length + condCount + (blocks.length - i) + 2 <= 28) {
      const choiceId = steps.length + 1;
      const firstBranch = choiceId + 1;
      const afterBranches = firstBranch + condCount;
      const branchSlice = blocks.slice(runStart, i);
      steps.push({
        id: choiceId,
        title: "Elige tu modalidad o situación",
        body: "Selecciona el caso que corresponde a tu trámite para continuar.",
        choices: branchSlice.map((b, offset) => ({
          label: (b.isCondition?.label ?? b.heading).slice(0, 140),
          to: firstBranch + offset,
        })),
      });
      branchSlice.forEach((b, offset) => {
        const bodyText = b.details.join("\n").trim() || b.heading;
        steps.push({
          id: firstBranch + offset,
          title: cleanStepTitle(b.heading, `Opción ${offset + 1}`),
          body: bodyText.slice(0, 2000),
          choices: i < blocks.length ? [{ label: "Continuar", to: afterBranches }] : [],
        });
      });
    } else {
      const idx = runStart === i ? i++ : runStart;
      if (runStart !== idx) i = idx + 1;
      const block = blocks[idx];
      const joined = block.details.join("\n").trim() || block.heading;
      steps.push({
        id: steps.length + 1,
        title: cleanStepTitle(block.heading, `Paso ${steps.length + 1}`),
        body: (joined.length >= 4 ? joined : `${block.heading}. Revisa los detalles en ventanilla.`).slice(0, 2000),
      });
      i = idx + 1;
    }
  }

  const valid = validateSteps(steps);
  if ("error" in valid) {
    throw new Error(valid.error);
  }

  const summaryCandidate =
    (blocks[0]?.details.join(" ").trim() || bodyLines[0] || title).slice(0, 400);
  const summary =
    summaryCandidate.length >= 8
      ? summaryCandidate
      : `Guía interactiva paso a paso para ${title.slice(0, 120)}.`;

  return {
    title,
    summary,
    steps: valid.steps,
    faqs: serializeFaqs(faqs),
  };
}

function extractJsonText(raw: string): Record<string, unknown> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Respuesta JSON vacía.");
  }
  return parsed as Record<string, unknown>;
}

function coerceAiSteps(rawSteps: unknown): GuideStep[] {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw new Error("La IA no devolvió pasos.");
  }

  const capped = rawSteps.slice(0, 24);
  const idMap = new Map<number, number>();
  capped.forEach((item, idx) => {
    const rawId = Number((item as Record<string, unknown>)?.id);
    if (Number.isInteger(rawId) && rawId > 0 && !idMap.has(rawId)) {
      idMap.set(rawId, idx + 1);
    }
  });

  const normalized: GuideStep[] = capped.map((item, idx) => {
    const row = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const stepNum = idx + 1;
    const title = String(row.title ?? `Paso ${stepNum}`).trim().slice(0, 160) || `Paso ${stepNum}`;
    let body = String(row.body ?? title).trim().slice(0, 2000);
    if (body.length < 4) body = `${title}. Verifica requisitos en tu coordinación.`;

    let choices: { label: string; to: number }[] | undefined;
    if (Array.isArray(row.choices)) {
      const validChoices: { label: string; to: number }[] = [];
      for (const c of row.choices) {
        const rec = (typeof c === "object" && c !== null ? c : {}) as Record<string, unknown>;
        const label = String(rec.label ?? "Continuar").trim().slice(0, 140);
        const mappedTo = idMap.get(Number(rec.to)) ?? Number(rec.to);
        if (label.length >= 2 && Number.isInteger(mappedTo) && mappedTo > stepNum && mappedTo <= capped.length) {
          validChoices.push({ label, to: mappedTo });
        }
      }
      if (validChoices.length > 0 || row.choices.length === 0) {
        choices = validChoices;
      }
    }
    return {
      id: stepNum,
      title: title.length >= 2 ? title : `Paso ${stepNum}`,
      body,
      ...(choices !== undefined ? { choices } : {}),
    };
  });

  // Asegurar conectividad desde el paso 1 si alguna rama quedó huérfana
  const directCheck = validateSteps(normalized);
  if ("steps" in directCheck) return directCheck.steps;

  // Respaldo lineal preservando contenido si las elecciones tuvieron ciclos/huérfanos
  const linear = normalized.map(({ id, title, body }) => ({ id, title, body }));
  const linearCheck = validateSteps(linear);
  if ("steps" in linearCheck) return linearCheck.steps;
  throw new Error(linearCheck.error);
}

export async function generateDraft(bytes: Buffer, name: string) {
  const format = sourceFormat(bytes, name);
  let text =
    format === "text"
      ? new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      : format === "docx"
        ? wordText(bytes)
        : undefined;

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  let aiFailureNote = "";

  if (apiKey) {
    const models = Array.from(
      new Set(
        [
          process.env.GOOGLE_GUIDE_MODEL?.trim(),
          "gemini-3.5-flash-lite",
          "gemini-2.5-flash-lite",
          "gemini-2.5-flash",
        ].filter((value): value is string => Boolean(value)),
      ),
    );

    const prompt = [
      "Eres especialista en procesos escolares de ESCOM (IPN): CATT, Becas, Gestión Escolar y Clubes.",
      "Convierte el siguiente documento, convocatoria o infografía en una guía interactiva clara y fiel al contenido original.",
      "Responde únicamente JSON válido (sin markdown ni comentarios) con la forma exactísima:",
      '{"title":string,"summary":string,"steps":[{"id":number,"title":string,"body":string,"choices"?:[{"label":string,"to":number}]}],"faqs":[{"q":string,"a":string}]}',
      "Reglas:",
      "- title máximo 160 caracteres (omite encabezados genéricos como INSTITUTO POLITÉCNICO NACIONAL o ESCOM; usa el nombre real del trámite).",
      "- summary claro de 20 a 350 caracteres explicando para quién es y qué resuelve.",
      "- Los ids de steps deben ser consecutivos empezando en 1 (máximo 18 pasos).",
      "- Solo usa choices si el trámite tiene decisiones reales (ej. modalidad, primera vez vs renovación, regular vs irregular), o [] en el paso final de una rama; nunca crees ciclos ni pasos huérfanos.",
      "- En body de cada paso incluye fechas, documentos, montos, formatos o correos exactos mencionados en la imagen/archivo.",
      "- No inventes datos que no estén en el archivo.",
    ].join("\n");

    const parts: Array<Record<string, unknown>> =
      format === "docx" || format === "text"
        ? [{ text: `${prompt}\n\nCONTENIDO:\n${(text ?? "").slice(0, 32000)}` }]
        : [
            { inlineData: { data: bytes.toString("base64"), mimeType: format } },
            { text: prompt },
          ];

    for (const model of models) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: parts as never }],
          config: { responseMimeType: "application/json", temperature: 0.2 },
        });
        const data = extractJsonText(response.text ?? "");
        const steps = coerceAiSteps(data.steps);
        const rawTitle = String(data.title ?? "").trim().slice(0, 180);
        const rawSummary = String(data.summary ?? "").trim().slice(0, 800);
        if (rawTitle.length >= 4 && rawSummary.length >= 8) {
          return {
            title: rawTitle,
            summary: rawSummary,
            steps,
            faqs: serializeFaqs(asFaqs(data.faqs)),
            aiUsed: true,
            notice: "Borrador estructurado con IA. Revisa condiciones, documentos exactos y orden de pasos antes de publicar.",
          };
        }
      } catch (err) {
        aiFailureNote = err instanceof Error ? err.message : "Error de conexión con Gemini";
      }
    }
  } else {
    aiFailureNote = "Falta GOOGLE_GENERATIVE_AI_API_KEY en el servidor";
  }

  if (text === undefined) {
    text = format === "application/pdf" ? await pdfText(bytes) : await recognize(bytes);
  }
  const localDraft = draftFromText(text);
  return {
    ...localDraft,
    aiUsed: false,
    notice: aiFailureNote
      ? `Se extrajo localmente con OCR/texto (IA no disponible: ${aiFailureNote.slice(0, 90)}). Revisa títulos, pasos y FAQs antes de publicar.`
      : "Borrador extraído del documento con analizador local. Revisa títulos, pasos y FAQs antes de publicar.",
  };
}
