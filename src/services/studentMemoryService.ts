import { MedicalArea, QuestionAttempt, Question } from "../types";

export interface RecurrentErrorItem {
  id: string;
  topic: string;
  area: MedicalArea;
  errorCount: number;
  specificConfusion: string;
  triggerKeywords: string[];
  lastOccurredAt: string;
  severity: "HIGH" | "MEDIUM" | "CRITICAL";
  tutorRecommendation: string;
  questionIds: string[];
}

export interface AreaMastery {
  areaKey: MedicalArea;
  label: string;
  percentage: number;
  asciiBar: string;
  status: "EXCELLENT" | "SOLID" | "VULNERABLE" | "CRITICAL";
}

export interface StudentCognitiveProfile {
  studentName: string;
  targetExam: string;
  lastUpdated: string;
  specialtiesMastery: {
    pediatria: AreaMastery;
    clinicaMedica: AreaMastery;
    ginecologia: AreaMastery;
    cirurgia: AreaMastery;
    preventiva: AreaMastery;
  };
  recurrentErrors: RecurrentErrorItem[];
  totalQuestionsAnswered: number;
  accuracyRate: number;
}

const STORAGE_KEY_STUDENT_MEMORY = "staziamed_student_cognitive_memory_v1";

export class StudentMemoryService {
  /**
   * Generates a precise visual ASCII bar e.g. "████████░░ 82%"
   */
  static renderAsciiBar(percentage: number, totalBlocks: number = 10): string {
    const filledBlocks = Math.round((Math.max(0, Math.min(100, percentage)) / 100) * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    const bar = "█".repeat(filledBlocks) + "░".repeat(emptyBlocks);
    return `${bar} ${percentage}%`;
  }

  /**
   * Default Initial Memory Profile for fresh student
   */
  static getDefaultProfile(studentName: string = "Dr(a). Candidato(a)"): StudentCognitiveProfile {
    return {
      studentName,
      targetExam: "Revalida INEP 2026",
      lastUpdated: new Date().toISOString(),
      specialtiesMastery: {
        pediatria: {
          areaKey: "PEDIATRIA",
          label: "Pediatria",
          percentage: 0,
          asciiBar: this.renderAsciiBar(0),
          status: "VULNERABLE",
        },
        clinicaMedica: {
          areaKey: "CLINICA_MEDICA",
          label: "Clínica Médica",
          percentage: 0,
          asciiBar: this.renderAsciiBar(0),
          status: "VULNERABLE",
        },
        ginecologia: {
          areaKey: "GINECOLOGIA_OBSTETRICIA",
          label: "Ginecologia e Obstetrícia",
          percentage: 0,
          asciiBar: this.renderAsciiBar(0),
          status: "VULNERABLE",
        },
        cirurgia: {
          areaKey: "CIRURGIA_GERAL",
          label: "Cirurgia Geral",
          percentage: 0,
          asciiBar: this.renderAsciiBar(0),
          status: "VULNERABLE",
        },
        preventiva: {
          areaKey: "MEDICINA_FAMILIA_COMUNIDADE",
          label: "Preventiva / MFC",
          percentage: 0,
          asciiBar: this.renderAsciiBar(0),
          status: "VULNERABLE",
        },
      },
      recurrentErrors: [],
      totalQuestionsAnswered: 0,
      accuracyRate: 0,
    };
  }

  /**
   * Retrieves the student profile from storage or loads default
   */
  static getProfile(): StudentCognitiveProfile {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_STUDENT_MEMORY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // If legacy mockup profile (Aluno Joao), reset
        if (parsed.studentName === "Aluno João") {
          const fresh = this.getDefaultProfile();
          this.saveProfile(fresh);
          return fresh;
        }
        // ensure asciiBars are freshly computed
        if (parsed.specialtiesMastery) {
          Object.keys(parsed.specialtiesMastery).forEach((k) => {
            const item = parsed.specialtiesMastery[k];
            item.asciiBar = this.renderAsciiBar(item.percentage);
          });
        }
        return parsed;
      }
    } catch {
      // fallback
    }
    const defaultProf = this.getDefaultProfile();
    this.saveProfile(defaultProf);
    return defaultProf;
  }

  /**
   * Saves updated profile to local storage
   */
  static saveProfile(profile: StudentCognitiveProfile): void {
    try {
      profile.lastUpdated = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY_STUDENT_MEMORY, JSON.stringify(profile));
    } catch (e) {
      console.warn("Failed to persist student memory:", e);
    }
  }

  /**
   * Set custom student name
   */
  static setStudentName(name: string): StudentCognitiveProfile {
    const prof = this.getProfile();
    prof.studentName = name.trim() || "Dr(a). Candidato(a)";
    this.saveProfile(prof);
    return prof;
  }

  /**
   * Matches question text or topic against known recurrent errors
   */
  static findMatchingRecurrentError(questionText: string, topic?: string): RecurrentErrorItem | null {
    const prof = this.getProfile();
    const cleanText = `${topic || ""} ${questionText}`.toLowerCase();

    for (const err of prof.recurrentErrors) {
      const hasMatch = err.triggerKeywords.some((kw) => cleanText.includes(kw.toLowerCase()));
      if (hasMatch) {
        return err;
      }
    }
    return null;
  }

  /**
   * Records a new attempt to adjust cognitive memory
   */
  static recordAttempt(question: Question, selectedOption: string, isCorrect: boolean): void {
    const prof = this.getProfile();
    prof.totalQuestionsAnswered += 1;

    const matchedErr = this.findMatchingRecurrentError(question.clinicalCase, question.topic);

    if (!isCorrect) {
      if (matchedErr) {
        matchedErr.errorCount += 1;
        matchedErr.lastOccurredAt = new Date().toISOString();
        if (!matchedErr.questionIds.includes(question.id)) {
          matchedErr.questionIds.push(question.id);
        }
        matchedErr.tutorRecommendation = `Você já errou ${matchedErr.errorCount} questões envolvendo ${matchedErr.specificConfusion}. Vou priorizar esse tema na revisão.`;
      } else if (question.topic) {
        // Create new tracked recurrent error if missed
        const newErr: RecurrentErrorItem = {
          id: `rec-${Date.now()}`,
          topic: question.topic,
          area: question.specialty as MedicalArea || "CLINICA_MEDICA",
          errorCount: 1,
          specificConfusion: `Conduta e diagnóstico em ${question.topic}.`,
          triggerKeywords: [question.topic.toLowerCase()],
          lastOccurredAt: new Date().toISOString(),
          severity: "MEDIUM",
          tutorRecommendation: `Primeira falha registrada em ${question.topic}. Manteremos sob monitoramento ativo.`,
          questionIds: [question.id],
        };
        prof.recurrentErrors.push(newErr);
      }
    }

    this.saveProfile(prof);
  }

  /**
   * Generates the structured Cognitive Memory Prompt to inject into LLMs (Sonnet 5, Opus 5, Gemini)
   */
  static getCognitivePromptInjection(): string {
    const prof = this.getProfile();
    const { specialtiesMastery, recurrentErrors, studentName } = prof;

    const masteryList = Object.values(specialtiesMastery)
      .map((m) => `${m.label}\n${m.asciiBar}`)
      .join("\n\n");

    const errorList = recurrentErrors
      .map(
        (e, idx) =>
          `• ${e.topic} (${e.errorCount} erros registrados):\n  - Detalhe: ${e.specificConfusion}\n  - Frase de Contexto: "${e.tutorRecommendation}"`
      )
      .join("\n");

    return `
[MEMÓRIA REAL DO ESTUDANTE - ${studentName.toUpperCase()}]
O sistema mantém rastreamento cognitivo profundo do desempenho real deste aluno:

DOMÍNIO POR GRANDE ÁREA:
${masteryList}

ERROS RECORRENTES IDENTIFICADOS:
${errorList}

DIRETRIZ DE VOZ E PROATIVIDADE DO TUTOR IA:
Ao interagir com o aluno sobre qualquer um destes temas (especialmente pré-eclâmpsia, interpretação de gasometria, vacinação ou tuberculose), você NÃO DEVE agir como um chat genérico sem histórico.
Você DEVE utilizar a memória ativa para situar o aluno, dizendo com precisão cirúrgica frases como:
"Você já errou três questões envolvendo diagnóstico diferencial entre pré-eclâmpsia e hipertensão gestacional. Vou priorizar esse tema na revisão."
Seja empático, direto, técnico e focado na matriz do INEP e diretrizes vigentes do SUS.
`;
  }
}
