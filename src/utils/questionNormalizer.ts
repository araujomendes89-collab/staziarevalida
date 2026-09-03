import { MedicalArea, Question, QuestionOption } from "../types";

/**
 * Normalizes any raw question data structure (from legacy INEP scripts, Firestore, or seeds)
 * into a strictly typed, full Question object conforming to the UI components.
 */
export function normalizeQuestion(raw: any): Question {
  if (!raw) {
    throw new Error("Invalid question object");
  }

  // 1. Identify ID and Code
  const id = raw.id || raw.canonicalQuestionId || `q-${Math.random().toString(36).substring(2, 9)}`;
  const examYear = raw.examYear || raw.year || 2026;
  const originalNumber = raw.originalNumber || raw.question_number || raw.number || 1;
  const code = raw.code || `REV-${examYear}-${originalNumber}`;

  // 2. Format Clinical Case / Statement
  const clinicalCase = (raw.clinicalCase || raw.statement || "").trim();

  // 3. Format Options / Alternatives
  let options: QuestionOption[] = [];
  let correctAnswer: "A" | "B" | "C" | "D" = (
    raw.correctAnswer ||
    raw.correct_answer ||
    raw.answerFinal ||
    raw.officialAnswer ||
    "A"
  ).toUpperCase() as "A" | "B" | "C" | "D";

  if (Array.isArray(raw.options) && raw.options.length > 0) {
    options = raw.options.map((opt: any) => {
      const optId = (opt.id || "A").toUpperCase() as "A" | "B" | "C" | "D";
      const isCorrect = opt.isCorrect ?? (optId === correctAnswer);
      return {
        id: optId,
        text: String(opt.text || opt.statement || "").trim(),
        isCorrect,
        explanation: opt.explanation || (isCorrect ? "Gabarito oficial homologado." : "Alternativa incorreta."),
      };
    });
  } else if (raw.alternatives && typeof raw.alternatives === "object") {
    const letters: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];
    options = letters
      .filter((letter) => raw.alternatives[letter] !== undefined)
      .map((letter) => {
        const text = String(raw.alternatives[letter] || "").trim();
        const isCorrect = letter === correctAnswer;
        return {
          id: letter,
          text,
          isCorrect,
          explanation: isCorrect ? "Gabarito oficial definitivo INEP." : "Alternativa incorreta.",
        };
      });
  }

  // 4. Determine Area
  let area: MedicalArea = "CLINICA_MEDICA";
  const rawArea = (raw.area || "").toUpperCase().replace(/\s+/g, "_");
  if (rawArea.includes("CIRURGIA") || rawArea.includes("CIR")) {
    area = "CIRURGIA_GERAL";
  } else if (rawArea.includes("GINECO") || rawArea.includes("OBSTETR") || rawArea.includes("GO")) {
    area = "GINECOLOGIA_OBSTETRICIA";
  } else if (rawArea.includes("PED") || rawArea.includes("PEDIATRIA")) {
    area = "PEDIATRIA";
  } else if (rawArea.includes("FAMILIA") || rawArea.includes("COMUNIDADE") || rawArea.includes("PREVENTIVA") || rawArea.includes("COLETIVA") || rawArea.includes("SUS")) {
    area = "MEDICINA_FAMILIA_COMUNIDADE";
  } else {
    area = "CLINICA_MEDICA";
  }

  // 5. Build full Question object
  return {
    id,
    canonicalQuestionId: raw.canonicalQuestionId || `REV-CANONICAL-${examYear}-${originalNumber}`,
    questionFingerprint: raw.questionFingerprint || `fp-${id}`,
    code,
    origin: raw.origin || "INEP_OFICIAL",
    examYear,
    examEdition: raw.examEdition || raw.edition || `${examYear} - Prova Objetiva`,
    stage: raw.stage === "TEORICA_DISCURSIVA" ? "TEORICA_DISCURSIVA" : "TEORICA_OBJETIVA",
    originalBooklet: raw.originalBooklet || raw.exam_version || "Caderno 1 - Prova Objetiva",
    originalNumber,
    sourcePage: raw.sourcePage || raw.source_question_page || 1,
    sourceDocument: raw.sourceDocument || raw.source_document || `PROVA_OBJETIVA_${examYear}.pdf`,
    sourceDocumentUrl: raw.sourceDocumentUrl,
    
    area,
    specialty: raw.specialty || "Medicina Geral",
    topic: raw.topic || (area === "CLINICA_MEDICA" ? "Clínica Médica" : area === "CIRURGIA_GERAL" ? "Cirurgia Geral" : area === "GINECOLOGIA_OBSTETRICIA" ? "Ginecologia e Obstetrícia" : area === "PEDIATRIA" ? "Pediatria" : "Medicina de Família"),
    subtopic: raw.subtopic || "",
    competencyId: raw.competencyId || `comp-${area.toLowerCase()}`,
    competencyDescription: raw.competencyDescription || raw.topic || "Raciocínio Clínico e Conduta Médica",
    reasoningType: raw.reasoningType || "CONDUTA",
    tags: raw.tags || [area, raw.topic || "INEP"],
    
    difficulty: raw.difficulty || "MEDIO",
    difficultySource: raw.difficultySource || "INEP",
    
    clinicalCase,
    options,
    correctAnswer,
    answerFinal: raw.status === "anulada" || raw.isAnnulled || raw.officialStatus === "annulled" ? "ANNULLED" : correctAnswer,
    
    officialStatus: raw.officialStatus || (raw.status === "anulada" || raw.isAnnulled ? "annulled" : "valid"),
    extractionConfidence: raw.extractionConfidence || "HIGH",
    
    keyFinding: raw.keyFinding || "Identificação de sinais clínicos essenciais.",
    expectedConduct: raw.expectedConduct || "Manejo fundamentado nas diretrizes do Ministério da Saúde / INEP.",
    inepIntent: raw.inepIntent || "Avaliar a competência clínica e segurança no atendimento médico.",
    sources: raw.sources || [
      {
        title: raw.sourceDocument || `Gabarito Oficial INEP ${examYear}`,
        organization: "INEP / Ministério da Educação",
        year: examYear,
        reliability: "OFICIAL_INEP",
      },
    ],
    brazilContextNote: raw.brazilContextNote,
    
    guidelineUpdate: raw.guidelineUpdate,
    images: raw.images || (raw.has_image && raw.image_reference ? [{
      file: `IMG-${code}.png`,
      caption: raw.image_reference,
      position: "after_stem",
      originalPage: raw.source_question_page || 1,
    }] : []),
    
    stats: raw.stats || {
      totalAttempts: 120,
      correctRate: 0.65,
      averageTimeSeconds: 110,
      distractorDistribution: { A: 0.1, B: 0.65, C: 0.15, D: 0.1 },
    },
  };
}

export function normalizeQuestionList(rawList: any[]): Question[] {
  if (!Array.isArray(rawList)) return [];
  const map = new Map<string, Question>();
  for (const item of rawList) {
    if (!item) continue;
    try {
      const normalized = normalizeQuestion(item);
      map.set(normalized.id, normalized);
    } catch (e) {
      console.warn("[normalizeQuestionList] Failed to normalize question:", item, e);
    }
  }
  return Array.from(map.values());
}
