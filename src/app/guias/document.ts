import path from "node:path";
import { unzipSync } from "fflate";
import * as saxes from "saxes";
import { createWorker } from "tesseract.js";
import { GoogleGenAI } from "@google/genai";
import { asFaqs, serializeFaqs, validateSteps, type GuideStep } from "./shared";
import { bullet, instructionTitle, isDocumentLabel, numberedStep, readProcedure } from "./procedure-text";

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
    if (skipFallback === 0 && (node.name === "w:p" || node.name === "w:tr")) out.push("\n\n");
    tag = "";
  });
  parser.write(new TextDecoder().decode(entry)).close();
  return out.join("");
}

async function ocrWorker() {
  return createWorker("spa", undefined, {
    langPath: path.join(process.cwd(), "node_modules/@tesseract.js-data/spa/4.0.0_best_int"),
    cacheMethod: "none",
  });
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
  const loading = pdf.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  let worker: Awaited<ReturnType<typeof ocrWorker>> | undefined;
  try {
    const doc = await loading.promise;
    const pages: string[] = [];
    let scannedPages = 0;
    if (doc.numPages > 20) throw new Error("Divide el PDF en archivos de hasta 20 páginas para la lectura local.");
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const view = page.getViewport({ scale: 1 });
      const nativeItems = content.items.flatMap((item) => {
        if (!("str" in item) || !item.str.trim()) return [];
        const [x, baseline] = view.convertToViewportPoint(item.transform[4], item.transform[5]);
        return [{ str: item.str, x, y: -baseline, width: item.width, height: item.height }];
      });
      const links = (await page.getAnnotations()).map((a) => a.url).filter((url): url is string => typeof url === "string");
      const ops = await page.getOperatorList();
      const hasImages = ops.fnArray.some((op) =>
        op === pdf.OPS.paintImageXObject || op === pdf.OPS.paintInlineImageXObject ||
        op === pdf.OPS.paintImageXObjectRepeat,
      );
      if (!hasImages && nativeItems.length) {
        pages.push(sortPdfItems(nativeItems));
      } else {
        if (!nativeItems.length && ++scannedPages > 10) {
          throw new Error("Divide el PDF en archivos de hasta 10 páginas escaneadas para la lectura local.");
        }
        worker ??= await ocrWorker();
        const scale = Math.min(2, 3600 / Math.max(view.width, view.height));
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvas: canvas as never, viewport }).promise;
        const mixed = nativeItems.length > 0;
        const { data } = await worker.recognize(canvas.toBuffer("image/png"), { rotateAuto: !mixed }, { blocks: mixed });
        if (mixed) {
          // Conserva la ortografía del texto seleccionable y agrega solo palabras de la imagen.
          const items: PositionedItem[] = [...nativeItems];
          const lines = (data.blocks ?? []).flatMap((block) =>
            block.paragraphs.flatMap((paragraph) => paragraph.lines),
          );
          for (const line of lines) {
            for (const word of line.words) {
              const { x0, x1, y0, y1 } = word.bbox;
              const centerX = (x0 + x1) / (2 * scale);
              const centerY = -(y0 + y1) / (2 * scale);
              const selectable = nativeItems.some((item) =>
                centerX >= item.x - 1 && centerX <= item.x + item.width + 1 &&
                centerY >= item.y - 2 && centerY <= item.y + item.height + 2,
              );
              if (!selectable) items.push({ str: word.text, x: x0 / scale, y: -line.baseline.y0 / scale });
            }
          }
          pages.push(sortPdfItems(items));
        } else {
          pages.push(data.text);
        }
      }
      pages[pages.length - 1] = restoreWrappedLinks(pages[pages.length - 1], links);
      page.cleanup();
    }
    return pages.join("\n\f\n");
  } finally {
    await worker?.terminate();
    await loading.destroy();
  }
}

// La anotación conserva el destino completo aunque la URL impresa ocupe dos renglones.
function restoreWrappedLinks(text: string, links: string[]) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    let prefix = lines[i].match(/https?:\/\/\S+$/)?.[0];
    if (!prefix) continue;
    const visible = prefix;
    const target = links.find((url) => url.startsWith(visible));
    if (!target) continue;
    while (prefix !== target && i + 1 < lines.length) {
      const part = lines[i + 1].match(/^\S+/)?.[0];
      if (!part || !target.startsWith(prefix + part)) break;
      prefix += part;
      lines[i] += lines.splice(i + 1, 1)[0];
    }
  }
  return lines.join("\n");
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
  const { title, intro, notes, lines: bodyLines } = readProcedure(text);
  const upperHeading = (line: string) =>
    line.length <= 80 && line === line.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{4}/.test(line);
  const sentences = new Intl.Segmenter("es", { granularity: "sentence" });
  const faqs: { q: string; a: string }[] = [];
  type Block = { heading: string; details: string[]; numbered?: boolean; isCondition?: { label: string } };
  const blocks: Block[] = [];
  const condRe = /^(si\s+(?:eres|ya|no|cuentas|vas|aplicas|tienes|trabajas|cursas)[^:]{3,80}|en caso de[^:]{3,80}|para alumnos[^:]{2,70}|modalidad\s+[^:]{2,60})\s*:\s*(.+)$/i;
  let paragraph: string[] = [];
  let section: Block | undefined;

  function flushParagraph() {
    const prose = paragraph.join(" ");
    paragraph = [];
    if (!prose) return;
    if (section && section.details.length) {
      if (section.numbered) {
        section.details[section.details.length - 1] += ` ${prose}`;
      } else {
        section.details.push(prose);
      }
      return;
    }
    for (const { segment } of sentences.segment(prose)) {
      const sequence = segment.split(/;\s+(?=(?:luego|después|a continuación|por último|finalmente)\b)/i);
      for (const part of sequence) {
        const instruction = part.trim();
        if (section) {
          section.details.push(instruction);
          section = undefined;
        } else {
          blocks.push({ heading: instruction, details: [instruction] });
        }
      }
    }
  }

  for (let i = 0; i < bodyLines.length; i += 1) {
    const line = bodyLines[i];
    if (!line) {
      flushParagraph();
      continue;
    }
    const faq = line.match(/^(¿.+?\?)\s*(.*)$/);
    const condition = line.match(condRe);
    if (faq) {
      let next = i + 1;
      while (next < bodyLines.length && !bodyLines[next]) next++;
      const answer = faq[2] || bodyLines[next];
      if (answer && !answer.startsWith("¿") && !numberedStep.test(answer) && !bullet.test(answer)) {
        flushParagraph();
        section = undefined;
        faqs.push({ q: faq[1].slice(0, 240), a: answer.slice(0, 500) });
        if (!faq[2]) i = next;
        continue;
      }
    }
    if (section?.numbered && bullet.test(line)) {
      flushParagraph();
      section.details.push(line);
      continue;
    }
    if (condition || numberedStep.test(line) || bullet.test(line) || upperHeading(line) || /^requisito\s+\d+/i.test(line)) {
      flushParagraph();
      const heading = condition?.[1] || line.replace(numberedStep, "").replace(bullet, "").trim() || line;
      section = {
        heading,
        numbered: numberedStep.test(line),
        details: condition ? [condition[2]] : upperHeading(line) ? [] : [heading],
        ...(condition && { isCondition: { label: condition[1] } }),
      };
      blocks.push(section);
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();

  const hasReadableStep = blocks.some((block) => {
    const words = block.details.join(" ").match(/\p{L}+/gu) ?? [];
    return words.some((word) => word.length >= 4) && (words.length >= 2 || block.numbered);
  });
  if (!hasReadableStep) {
    throw new Error("No pudimos leer instrucciones de trámite en el archivo. Usa una copia legible que incluya los pasos.");
  }
  if (blocks.length > 30 || blocks.some((block) => block.details.join("\n").length > 2000)) {
    throw new Error("Divide el instructivo en archivos más cortos para conservar todas las indicaciones en la guía.");
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
      const block = blocks[runStart];
      const joined = block.details.join("\n").trim() || block.heading;
      steps.push({
        id: steps.length + 1,
        title: cleanStepTitle(block.numbered ? instructionTitle(joined) : block.heading, `Paso ${steps.length + 1}`),
        body: joined.length >= 4 ? joined : `Paso ${steps.length + 1}. ${joined}`,
      });
      i = runStart + 1;
    }
  }

  const valid = validateSteps(steps);
  if ("error" in valid) {
    throw new Error(valid.error);
  }

  const summaryCandidate =
    [intro || blocks[0]?.details.join(" ").trim() || title, ...notes].join("\n").slice(0, 800);
  const summary =
    summaryCandidate.length >= 8
      ? summaryCandidate
      : `Guía interactiva paso a paso para ${title.slice(0, 120)}.`;

  return {
    title: title.length >= 4 ? title.slice(0, 180) : `Guía de ${title}`,
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
    const body = String(row.body ?? "").trim().slice(0, 2000);
    if (body.length < 4 || isDocumentLabel(title) || isDocumentLabel(body)) {
      throw new Error("La IA devolvió un encabezado o un paso sin instrucciones.");
    }

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
      "- Cada nodo debe nombrar una acción concreta con un título corto. Omite escudos, membretes y rótulos como Pasos. El objetivo y la vigencia van en summary.",
      "- Respeta los pasos enumerados en orden de aparición aunque se repita un número. Conserva las viñetas de requisitos en el paso al que pertenecen, y distingue las acciones del alumno de las del área responsable.",
      "- Los ids de steps deben ser consecutivos empezando en 1 (máximo 18 pasos).",
      "- Solo usa choices si el trámite tiene decisiones reales (ej. modalidad, primera vez vs renovación, regular vs irregular), o [] en el paso final de una rama; nunca crees ciclos ni pasos huérfanos.",
      "- Lee las instrucciones escritas en párrafos, listas, tablas, pies de figura y texto visible en fotografías o escaneos. Integra las indicaciones de las figuras y del texto en el orden del trámite.",
      "- Cuando solo haya prosa, separa las acciones en pasos consecutivos aunque no tengan números, encabezados ni ilustraciones. Mantén juntos cada acción y sus requisitos.",
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
      } catch {
        // Prueba el siguiente modelo. Si todos fallan, usa la extracción local.
      }
    }
  }

  if (text === undefined) {
    text = format === "application/pdf" ? await pdfText(bytes) : await recognize(bytes);
  }
  const localDraft = draftFromText(text);
  return {
    ...localDraft,
    aiUsed: false,
    notice: apiKey
      ? "La IA no pudo generar la guía. Se usó el lector local. Revisa los pasos antes de publicar."
      : "Borrador generado con el lector local. Revisa los pasos antes de publicar.",
  };
}
