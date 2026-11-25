// Las marcas de la fuente delimitan instrucciones. El editor asigna sus propios identificadores.
export const numberedStep = /^(?:(?:paso|etapa)\s+\d+\b\s*[.:)–-]*|(?:\d+|[ivxlc]+)\s*[.)]\s*[-–]?)\s*/i;
export const bullet = /^[•●▪*–-]\s+/;
const sectionLabel = /^(?:pasos(?: a seguir)?|procedimiento(?: a seguir)?|instrucciones(?: del trámite)?|desarrollo del procedimiento)\s*[:.]?$/i;
const letterhead = /^(?:instituto politécnico nacional|escuela superior de cómputo|subdirección (?:académica|administrativa)|ipn\s*[-–]\s*escom)$/i;
const titlePrefix = /^(?:proceso|guía|instructivo|procedimiento|convocatoria|trámite|solicitud|registro|renovación|inscripción|reinscripción|constancia)\b/i;
const metadata = /^(?:vigencia|última actualización|contacto|correo de contacto)\s*:/i;
const sentences = new Intl.Segmenter("es", { granularity: "sentence" });

export function isDocumentLabel(line: string) {
  return sectionLabel.test(line) || letterhead.test(line) || metadata.test(line);
}

function readPage(page: string) {
  const lines = page.split("\n").map((line) => line.replace(/\s+/g, " ").trim());
  // El OCR a veces interpreta el escudo encima del membrete como varias palabras.
  const masthead = lines.findIndex((line, i) => i < 12 && letterhead.test(line));
  const logoPrefix = masthead >= 0 && lines.slice(0, masthead).every((line) =>
    line.length < 20 && !titlePrefix.test(line) && !numberedStep.test(line) && !/[.!?:]$/.test(line),
  );
  return lines.slice(logoPrefix ? masthead : 0).filter((line) =>
    !letterhead.test(line) && !/^(?:IPN|ESCOM|página\s+\d+(?:\s+de\s+\d+)?|\d{1,3}(?:\s*\/\s*\d{1,3})?)$/i.test(line),
  );
}

export function readProcedure(text: string) {
  const notes: string[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\f").flatMap(readPage).filter((line) => {
    if (!metadata.test(line)) return true;
    notes.push(line);
    return false;
  });
  const first = lines.findIndex(Boolean);
  if (first < 0) throw new Error("No pudimos leer instrucciones de trámite en el archivo.");
  const heading = lines[first];
  const section = lines.findIndex((line) => sectionLabel.test(line));
  const hasTitle = !sectionLabel.test(heading) && (
    (section > first && !numberedStep.test(heading) && !bullet.test(heading)) ||
    (titlePrefix.test(heading) && heading.length <= 160 && !/[.!?]\s+\S/.test(heading) && lines.slice(first + 1).some(Boolean))
  );
  const start = hasTitle ? first + 1 : first;
  const numbered = lines.findIndex((line) => numberedStep.test(line));
  const bodyStart = section >= start && (numbered < 0 || section < numbered) ? section + 1 : start;
  const intro = lines.slice(start, bodyStart).filter((line) => line && !sectionLabel.test(line)).join(" ");
  const titleText = heading.replace(numberedStep, "").replace(bullet, "").trim();
  const title = hasTitle ? heading.replace(/[.:]$/, "") : sentences.segment(titleText).containing(0)?.segment.trim();
  return {
    title: title || "Guía de trámite",
    intro,
    notes,
    lines: lines.slice(bodyStart).filter((line) => !sectionLabel.test(line)),
  };
}

export function instructionTitle(text: string) {
  const first = sentences.segment(text.replace(/\s+/g, " ")).containing(0)?.segment.trim() ?? text;
  // Conserva el sujeto y la acción principal. Los incisos y las condiciones siguen en el cuerpo.
  const clause = first.replace(/^(?:si |cuando |para )[^,]+,\s*/i, "")
    .split(/[,;:]|\s+que\s*:/i)[0].replace(/[.:]$/, "").trim();
  const main = clause.split(/\s+(?:con|para|según|directamente|contad[oa]s? a partir)\s+/i)[0];
  const label = main.length >= 30 && main.split(" ").length >= 5 ? main : clause;
  return label ? label[0].toUpperCase() + label.slice(1) : first;
}
