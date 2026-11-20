export type ClubJoinQuestionType = "text" | "choice" | "boolean";

export type ClubJoinQuestion = {
  id: string;
  prompt: string;
  type: ClubJoinQuestionType;
  required: boolean;
  options?: string[];
};

export type ClubApplicationAnswer = {
  questionId: string;
  prompt: string;
  answer: string;
};

export const MAX_CLUB_JOIN_QUESTIONS = 8;

function sanitizeQuestionId(raw: unknown, fallbackIndex: number): string {
  const s = typeof raw === "string" ? raw.trim().replace(/[^a-zA-Z0-9_-]/g, "") : "";
  return s.slice(0, 40) || `q_${fallbackIndex + 1}`;
}

export function parseJoinQuestions(raw: unknown): ClubJoinQuestion[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      return [];
    }
  }

  const out: ClubJoinQuestion[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < list.length && out.length < MAX_CLUB_JOIN_QUESTIONS; i++) {
    const item = list[i];
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const prompt = typeof obj.prompt === "string" ? obj.prompt.trim().slice(0, 200) : "";
    if (!prompt) continue;

    const rawType = typeof obj.type === "string" ? obj.type.trim() : "text";
    const type: ClubJoinQuestionType =
      rawType === "choice" || rawType === "boolean" ? rawType : "text";
    const required = obj.required !== false;

    let id = sanitizeQuestionId(obj.id, i);
    while (seenIds.has(id)) {
      id = `${id}_${out.length + 1}`;
    }
    seenIds.add(id);

    if (type === "choice") {
      const rawOpts = Array.isArray(obj.options)
        ? obj.options
        : typeof obj.options === "string"
          ? obj.options.split(",")
          : [];
      const options = Array.from(
        new Set(
          rawOpts
            .map((o) => (typeof o === "string" ? o.trim().slice(0, 80) : ""))
            .filter(Boolean),
        ),
      ).slice(0, 6);
      if (options.length < 2) continue;
      out.push({ id, prompt, type, required, options });
    } else {
      out.push({ id, prompt, type, required });
    }
  }

  return out;
}

export function parseJoinQuestionsFromForm(
  form: FormData,
): { questions: ClubJoinQuestion[] } | { error: string } {
  const raw = String(form.get("join_questions_json") ?? "").trim();
  if (!raw || raw === "[]") {
    return { questions: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "El formato del cuestionario de ingreso no es válido." };
  }
  if (!Array.isArray(parsed)) {
    return { error: "El cuestionario debe ser una lista de preguntas." };
  }
  if (parsed.length > MAX_CLUB_JOIN_QUESTIONS) {
    return { error: `El filtro de ingreso admite máximo ${MAX_CLUB_JOIN_QUESTIONS} preguntas.` };
  }

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!item || typeof item !== "object") {
      return { error: `Pregunta #${i + 1} inválida.` };
    }
    const obj = item as Record<string, unknown>;
    const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : "";
    if (prompt.length < 4) {
      return { error: `La pregunta #${i + 1} debe tener al menos 4 caracteres.` };
    }
    if (prompt.length > 200) {
      return { error: `La pregunta #${i + 1} excede 200 caracteres.` };
    }
    if (obj.type === "choice") {
      const opts = Array.isArray(obj.options)
        ? obj.options.map((o) => String(o).trim()).filter(Boolean)
        : [];
      if (opts.length < 2) {
        return { error: `La pregunta de opción múltiple #${i + 1} requiere al menos 2 opciones.` };
      }
    }
  }

  return { questions: parseJoinQuestions(parsed) };
}

export function collectAnswersFromForm(
  questions: ClubJoinQuestion[],
  form: FormData,
): { answers: ClubApplicationAnswer[]; summary: string } | { error: string } {
  const answers: ClubApplicationAnswer[] = [];

  for (const q of questions) {
    const raw = String(form.get(`answer_${q.id}`) ?? "").trim().slice(0, 600);
    if (!raw) {
      if (q.required) {
        return { error: `Responde la pregunta obligatoria: "${q.prompt}"` };
      }
      continue;
    }

    if (q.type === "boolean") {
      if (raw !== "Sí" && raw !== "No") {
        return { error: `Elige Sí o No en: "${q.prompt}"` };
      }
    } else if (q.type === "choice" && q.options && !q.options.includes(raw)) {
      return { error: `Elige una opción válida en: "${q.prompt}"` };
    }

    answers.push({
      questionId: q.id,
      prompt: q.prompt,
      answer: raw,
    });
  }

  const summary = answers.map((a) => `${a.prompt}: ${a.answer}`).join(" | ");
  return { answers, summary };
}

export function parseApplicationAnswers(raw: unknown): ClubApplicationAnswer[] {
  if (!Array.isArray(raw)) return [];
  const out: ClubApplicationAnswer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const questionId = typeof obj.questionId === "string" ? obj.questionId.trim() : "";
    const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : "";
    const answer = typeof obj.answer === "string" ? obj.answer.trim() : "";
    if (!prompt || !answer) continue;
    out.push({ questionId: questionId || `a_${out.length + 1}`, prompt, answer });
  }
  return out;
}
