export type CatalogEntry = {
  id: string;
  name: string;
  kind: string;
  text: string;
  type: "club" | "propuesta";
  statusLabel: string;
  interests?: number;
};

export type SimilarityMatch = CatalogEntry & {
  score: number;
  isBlocking: boolean;
  reason: string;
};

const STOP_WORDS = new Set([
  "club",
  "grupo",
  "taller",
  "sociedad",
  "comunidad",
  "equipo",
  "asociacion",
  "escom",
  "ipn",
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "en",
  "y",
  "o",
  "para",
  "por",
  "con",
  "sobre",
  "a",
  "al",
  "un",
  "una",
  "unos",
  "unas",
]);

export function normalizeClubText(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMeaningfulTokens(raw: string): string[] {
  const normalized = normalizeClubText(raw);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function bigrams(value: string): string[] {
  const clean = value.replace(/\s+/g, "");
  if (clean.length < 2) return clean ? [clean] : [];
  const out: string[] = [];
  for (let i = 0; i < clean.length - 1; i += 1) {
    out.push(clean.slice(i, i + 2));
  }
  return out;
}

function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (!ba.length || !bb.length) return 0;
  const counts = new Map<string, number>();
  for (const g of ba) counts.set(g, (counts.get(g) ?? 0) + 1);
  let overlap = 0;
  for (const g of bb) {
    const count = counts.get(g) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(g, count - 1);
    }
  }
  return (2 * overlap) / (ba.length + bb.length);
}

function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function findSimilarClubsOrProposals(
  candidateName: string,
  candidateObjective: string,
  catalog: CatalogEntry[],
): SimilarityMatch[] {
  const cleanName = extractMeaningfulTokens(candidateName).join(" ");
  const rawNormName = normalizeClubText(candidateName);
  const nameTokens = extractMeaningfulTokens(candidateName);
  const objectiveTokens = extractMeaningfulTokens(candidateObjective);

  if (rawNormName.length < 2 && objectiveTokens.length < 2) return [];

  const matches: SimilarityMatch[] = [];

  for (const entry of catalog) {
    const entryRawNorm = normalizeClubText(entry.name);
    const entryCleanName = extractMeaningfulTokens(entry.name).join(" ");
    const entryNameTokens = extractMeaningfulTokens(entry.name);
    const entryTextTokens = extractMeaningfulTokens(`${entry.name} ${entry.text}`);

    const exactOrContained =
      cleanName.length >= 3 &&
      entryCleanName.length >= 3 &&
      (cleanName === entryCleanName ||
        (cleanName.length >= 5 && entryCleanName.includes(cleanName)) ||
        (entryCleanName.length >= 5 && cleanName.includes(entryCleanName)));

    const nameDice = diceSimilarity(cleanName || rawNormName, entryCleanName || entryRawNorm);
    const nameJaccard = jaccardSimilarity(nameTokens, entryNameTokens);
    const nameScore = Math.max(nameDice, nameJaccard);

    const objJaccard =
      objectiveTokens.length >= 2 ? jaccardSimilarity(objectiveTokens, entryTextTokens) : 0;
    const combinedTokens = [...nameTokens, ...objectiveTokens];
    const combinedJaccard =
      combinedTokens.length >= 2 ? jaccardSimilarity(combinedTokens, entryTextTokens) : 0;

    const finalScore = Math.max(nameScore, objJaccard * 0.9, combinedJaccard * 0.95);
    const isBlocking = Boolean(exactOrContained || nameScore >= 0.78);

    if (isBlocking || finalScore >= 0.4) {
      let reason = "Temática y palabras clave similares";
      if (exactOrContained || nameScore >= 0.78) {
        reason = "Nombre prácticamente idéntico";
      } else if (nameScore >= 0.45) {
        reason = "Nombre muy parecido";
      } else if (objJaccard >= 0.4) {
        reason = "Objetivo muy similar";
      }

      matches.push({
        ...entry,
        score: isBlocking ? Math.max(finalScore, 0.85) : finalScore,
        isBlocking,
        reason,
      });
    }
  }

  return matches.sort((a, b) => Number(b.isBlocking) - Number(a.isBlocking) || b.score - a.score).slice(0, 4);
}
