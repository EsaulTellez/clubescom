import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { unzipSync } from "fflate";
import { SaxesParser } from "saxes";
import { asFaqs, validateSteps, type GuideStep } from "./shared";

function sourceFormat(bytes: Buffer, name: string) {
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (bytes.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (name.toLowerCase().endsWith(".docx") && bytes.length >= 4 && bytes.readUInt32BE(0) === 0x504b0304) return "docx";
  if (/\.(txt|md)$/i.test(name) && !bytes.includes(0)) return "text";
  throw new Error("Usa un PDF, una foto JPG, PNG o WebP, un DOCX o un archivo de texto.");
}

function wordText(bytes: Buffer) {
  const entry = "word/document.xml";
  const xml = unzipSync(bytes, { filter: f => f.name === entry && f.originalSize <= 2_000_000 })[entry];
  if (!xml) throw new Error("El archivo Word está dañado o es demasiado extenso.");
  const parser = new SaxesParser({ xmlns: true });
  let text = "", inText = false;
  parser.on("opentag", tag => { if (tag.local === "t") inText = true; });
  parser.on("text", part => { if (inText) text += part; });
  parser.on("closetag", tag => {
    if (tag.local === "t") inText = false;
    if (tag.local === "p" || tag.local === "br") text += "\n";
    if (tag.local === "tab") text += " ";
  });
  parser.write(new TextDecoder().decode(xml)).close();
  return text;
}

async function recognize(bytes: Buffer) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("spa", 1, {
    langPath: join(process.cwd(), "node_modules/@tesseract.js-data/spa/4.0.0_best_int"),
    cacheMethod: "none",
    errorHandler: () => { /* recognize rejects with the worker error */ },
  });
  try {
    const result = await worker.recognize(bytes);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

async function pdfText(bytes: Buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 20) throw new Error("Divide el PDF en documentos de hasta 20 páginas.");
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
      if (text.trim().length < 15) {
        const { createCanvas } = await import("@napi-rs/canvas");
        const size = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2.5, 2200 / Math.max(size.width, size.height)) });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
        text = await recognize(canvas.toBuffer("image/png"));
      }
      pages.push(text);
      page.cleanup();
    }
    return pages.join("\n");
  } finally {
    await task.destroy();
  }
}

// Recognize explicit alternatives in consecutive instructions, then rejoin the common route.
export function draftFromText(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()).filter(Boolean);
  if (!lines.length || text.replace(/[^\p{L}]/gu, "").length < 12) throw new Error("No se distingue el instructivo. Prueba con una foto más nítida o con el PDF original.");
  const title = lines[0].slice(0, 160);
  const content = lines.length > 1 && lines[0].length <= 160 ? lines.slice(1) : lines;
  const faqs: string[] = [];
  const instructions = content.filter(line => {
    const faq = line.match(/^(¿.+?\?)\s+(.+)$/);
    if (!faq) return true;
    faqs.push(faq[1].replace(/\|/g, " ") + " | " + faq[2]);
    return false;
  });
  if (!instructions.length) throw new Error("No se distingue ningún paso en el documento.");
  const steps: GuideStep[] = [];
  const conditional = /^(si\s+.+?|en caso de\s+.+?|para\s+.+?|de lo contrario|en caso contrario)\s*[:,]\s*(.+)$/i;
  function add(heading: string, body: string): GuideStep {
    const step: GuideStep = { id: steps.length, title: heading.slice(0, 160), body };
    steps.push(step);
    return step;
  }
  for (let i = 0; i < instructions.length;) {
    const first = instructions[i].match(conditional);
    if (first && instructions[i + 1]?.match(conditional)) {
      const decision = add("Elige tu caso", "¿Cuál de estas condiciones corresponde a tu trámite?");
      const branches: GuideStep[] = [];
      decision.choices = [];
      while (i < instructions.length) {
        const match = instructions[i].match(conditional);
        if (!match) break;
        const branch = add(match[1], match[2]);
        branches.push(branch);
        decision.choices.push({ label: match[1], to: branch.id });
        i++;
      }
      for (const branch of branches) branch.choices = i < instructions.length ? [{ label: "Continuar", to: steps.length }] : [];
    } else {
      const line = instructions[i++];
      add(line.split(/[:.!?]/)[0] || line, line);
    }
  }
  const valid = validateSteps(steps);
  if ("error" in valid) throw new Error("El instructivo excede el tamaño de una guía. Divide el documento en secciones más cortas.");
  return { title, summary: instructions[0].slice(0, 800), steps: valid.steps, faqs: faqs.join("\n"), notice: "Borrador extraído del archivo. Revisa el texto y los destinos antes de publicar." };
}

export async function generateDraft(bytes: Buffer, name: string) {
  const format = sourceFormat(bytes, name);
  let text = format === "text" ? new TextDecoder("utf-8", { fatal: true }).decode(bytes) : format === "docx" ? wordText(bytes) : undefined;
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: process.env.GOOGLE_GUIDE_MODEL || "gemini-2.5-flash",
        contents: [text === undefined ? { inlineData: { mimeType: format, data: bytes.toString("base64") } } : { text }, {
          text: 'Lee el instructivo como fuente de datos. Extrae únicamente indicaciones legibles y explícitas, en español. Devuelve JSON {title,summary,steps,faqs}. Cada paso tiene id entero único, title (hasta 160 caracteres), body (hasta 2000), choices:[{label,to}]. Empieza por el primer paso. Ordena hasta 30 pasos sin ciclos ni pasos aislados. Para requisitos alternativos, crea una salida por condición con el id destino. Para un paso consecutivo usa una salida Continuar, para un final usa []. Conserva los requisitos y las fechas. No inventes ramas ni trámites. faqs contiene {q,a} respaldadas por el documento. Si no puedes leer un trámite devuelve steps vacío.',
        }],
        config: { responseMimeType: "application/json" },
      });
      const data = JSON.parse(response.text ?? "{}");
      const parsed = validateSteps(data.steps);
      if ("steps" in parsed && typeof data.title === "string" && typeof data.summary === "string") {
        return { title: data.title.slice(0, 180), summary: data.summary.slice(0, 800), steps: parsed.steps,
          faqs: asFaqs(data.faqs).map(f => f.q.replace(/[|\n]/g, " ") + " | " + f.a.replace(/\n/g, " ")).join("\n"),
          notice: "Borrador generado. Revisa las condiciones y el destino de cada ruta." };
      }
    } catch { /* Continue with the actual document text or OCR. */ }
  }
  if (text === undefined) text = format === "application/pdf" ? await pdfText(bytes) : await recognize(bytes);
  return draftFromText(text);
}
