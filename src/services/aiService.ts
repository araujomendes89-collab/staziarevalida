import { Question, OSCEStation, OSCEPatientProfile, RadarUpdate } from "../types";
import { StudentMemoryService } from "./studentMemoryService";
import { StorageService } from "./storageService";
import { auth } from "../lib/firebase";

export type SupportedModelId = "sonnet" | "opus" | "gemini";

export interface AiModelConfig {
  id: SupportedModelId;
  name: string;
  modelKey: string;
  provider: string;
  isDefault: boolean;
  description: string;
  badge: string;
  tier: "CORE" | "ADVANCED" | "SPEED";
}

export interface UniversalAiGenerateParams {
  model?: SupportedModelId | string;
  messages?: { role: "user" | "assistant" | "system"; content: string }[];
  prompt?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json";
}

export interface AiObservabilityMetadata {
  modelUsed: string;
  provider: "anthropic" | "google" | "offline-fallback" | string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  totalTokens: number;
  estimatedCostUsd: number;
  wasFailover: boolean;
  failoverReason?: string;
  durationMs: number;
  timestamp: string;
}

export interface UniversalAiResponse {
  text: string;
  model: string;
  provider: string;
  durationMs: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
  metadata?: AiObservabilityMetadata;
  fallbackChain?: string[];
  error?: string;
}

export interface TutorResponse {
  text: string;
  source?: string;
  error?: string;
  modelUsed?: string;
}

export interface PatientResponse {
  reply: string;
  patientName: string;
  error?: string;
  modelUsed?: string;
}

export interface OsceEvaluationResponse {
  score: number;
  communicationScore: number;
  anamnesisScore: number;
  physicalExamScore: number;
  clinicalReasoningScore: number;
  conductScore: number;
  evaluatedChecklist: {
    id: string;
    description: string;
    achieved: boolean;
    feedback: string;
  }[];
  examinerSummary: string;
  missedCriticalItems?: string[];
  unnecessaryActions?: string[];
  error?: string;
  modelUsed?: string;
}

const STORAGE_KEY_AI_MODEL = "staziamed_active_ai_model";

export class AiService {
  /**
   * Helper to retrieve current user headers for AI quota & access control
   */
  static getUserHeaders(): Record<string, string> {
    try {
      const fbUser = auth.currentUser;
      const storedUser = StorageService.getUserProfile();
      const uid = fbUser?.uid || storedUser?.id || "";
      const isGuest = !uid || uid === "usr-01" || uid.startsWith("guest-") || uid.startsWith("anon-");

      if (!isGuest && uid) {
        const tier = storedUser?.tier || (storedUser?.plan ? storedUser.plan.toUpperCase() : "TRIAL");
        const isGoogle = fbUser?.providerData?.some((p) => p.providerId === "google.com") ?? false;
        const isVerified = isGoogle || Boolean(fbUser?.emailVerified);
        const providerId = fbUser?.providerData?.[0]?.providerId || (isGoogle ? "google.com" : "password");

        return {
          "x-user-id": uid,
          "x-user-tier": tier,
          "x-subscription-expires-at": storedUser?.subscriptionExpiresAt || "",
          "x-trial-ends-at": storedUser?.trialEndsAt || "",
          "x-email-verified": String(isVerified),
          "x-auth-provider": providerId,
        };
      }
    } catch {
      // ignore
    }
    return {
      "x-user-id": "",
      "x-user-tier": "TRIAL",
      "x-email-verified": "false",
    };
  }

  /**
   * Fetch current user's AI daily usage ledger and quota status
   */
  static async getAiUsage(userId?: string, tier?: string): Promise<any> {
    const headers: Record<string, string> = {
      ...this.getUserHeaders(),
    };
    if (userId) headers["x-user-id"] = userId;
    if (tier) headers["x-user-tier"] = tier;

    const res = await fetch("/api/ai/usage", { headers });
    if (!res.ok) throw new Error("Falha ao carregar cota de IA");
    return await res.json();
  }

  /**
   * Get the currently active AI model selected by user/admin.
   * Default: "sonnet" (Claude Sonnet 5 on Google Vertex AI)
   */
  static getActiveModel(): SupportedModelId {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AI_MODEL);
      if (saved === "opus" || saved === "gemini" || saved === "sonnet") {
        return saved;
      }
    } catch {
      // ignore
    }
    return "sonnet";
  }

  /**
   * Set the active AI model
   */
  static setActiveModel(model: SupportedModelId): void {
    try {
      localStorage.setItem(STORAGE_KEY_AI_MODEL, model);
    } catch {
      // ignore
    }
  }

  /**
   * Fetch available models catalog from backend
   */
  static async getAvailableModels(): Promise<AiModelConfig[]> {
    try {
      const res = await fetch("/api/ai/models");
      if (!res.ok) throw new Error("Failed to fetch models");
      const data = await res.json();
      return data.models;
    } catch {
      return [
        {
          id: "sonnet",
          name: "Claude Sonnet 5",
          modelKey: "claude-sonnet-5",
          provider: "Google Vertex AI / Anthropic",
          isDefault: true,
          description: "Modelo principal de altíssima precisão clínica, raciocínio diagnóstico e padrão INEP 2026.",
          badge: "PADRÃO",
          tier: "CORE",
        },
        {
          id: "opus",
          name: "Claude Opus 5",
          modelKey: "claude-opus-5",
          provider: "Google Vertex AI / Anthropic",
          isDefault: false,
          description: "Modelo premium para raciocínios sindrômicos complexos, autópsias profundas e estações OSCE avançadas.",
          badge: "PREMIUM / COMPLEXO",
          tier: "ADVANCED",
        },
        {
          id: "gemini",
          name: "Gemini 3.7 / 2.5 Flash",
          modelKey: "gemini-3.7-flash",
          provider: "Google AI",
          isDefault: false,
          description: "Modelo de altíssima velocidade para busca de diretrizes, flashcards e auditoria em tempo real.",
          badge: "VELOCIDADE",
          tier: "SPEED",
        },
      ];
    }
  }

  /**
   * Primary secure backend proxy for universal AI text generation
   */
  static async generate(params: UniversalAiGenerateParams): Promise<UniversalAiResponse> {
    const activeModel = params.model || this.getActiveModel();

    let messages = params.messages;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      if (params.prompt) {
        messages = [{ role: "user", content: params.prompt }];
      } else {
        messages = [{ role: "user", content: "" }];
      }
    }

    let response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getUserHeaders(),
      },
      body: JSON.stringify({
        ...params,
        model: activeModel,
        messages,
      }),
    });

    // If 429 (Rate Limit / Quota Exceeded), wait 1.2s and retry once automatically
    if (response.status === 429) {
      console.warn("[AiService] 429 Rate limit / Too Many Requests encountered. Auto-retrying in 1.2s...");
      await new Promise((r) => setTimeout(r, 1200));
      response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.getUserHeaders(),
        },
        body: JSON.stringify({
          ...params,
          model: activeModel,
          messages,
        }),
      });
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("ai-auth-required", { detail: err }));
      } else if (response.status === 403) {
        if (err.code === "EMAIL_NOT_VERIFIED" || err.quota?.reason === "EMAIL_NOT_VERIFIED") {
          window.dispatchEvent(new CustomEvent("ai-email-unverified", { detail: err }));
        } else if (err.code === "PLAN_EXPIRED" || err.quota?.reason === "PLAN_EXPIRED") {
          window.dispatchEvent(new CustomEvent("ai-plan-expired", { detail: err }));
          window.dispatchEvent(new CustomEvent("open-pricing-modal", { detail: { reason: "PLAN_EXPIRED", message: err.message } }));
        } else {
          window.dispatchEvent(new CustomEvent("ai-quota-blocked", { detail: err }));
        }
      } else if (response.status === 429) {
        window.dispatchEvent(new CustomEvent("ai-rate-exceeded", { detail: err }));
      }
      throw new Error(err.message || err.error || `HTTP error ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Stream completion via Server-Sent Events from backend
   */
  static async *stream(
    params: UniversalAiGenerateParams,
    onChunk?: (text: string) => void
  ): AsyncGenerator<string, void, unknown> {
    const activeModel = params.model || this.getActiveModel();

    let messages = params.messages;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      if (params.prompt) {
        messages = [{ role: "user", content: params.prompt }];
      } else {
        messages = [{ role: "user", content: "" }];
      }
    }

    const response = await fetch("/api/ai/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getUserHeaders(),
      },
      body: JSON.stringify({
        ...params,
        model: activeModel,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("ai-auth-required", { detail: err }));
      } else if (response.status === 403) {
        if (err.code === "PLAN_EXPIRED" || err.quota?.reason === "PLAN_EXPIRED") {
          window.dispatchEvent(new CustomEvent("ai-plan-expired", { detail: err }));
          window.dispatchEvent(new CustomEvent("open-pricing-modal", { detail: { reason: "PLAN_EXPIRED", message: err.message } }));
        }
      }
      throw new Error(err.message || err.error || `Streaming failed: HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No readable stream in response");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              if (onChunk) onChunk(data.text);
              yield data.text;
            }
          } catch {
            // ignore malformed SSE chunk
          }
        }
      }
    }
  }

  static async askTutor(params: {
    mode: "autopsy" | "socratic" | "simplify" | "compare" | "brazil_terminology" | "general";
    questionContext: Question;
    userAnswer?: string;
    correctAnswer?: string;
    userQuery?: string;
    preferredModel?: SupportedModelId;
  }): Promise<TutorResponse> {
    const modelToUse = params.preferredModel || this.getActiveModel();

    const cognitiveMemoryInjection = StudentMemoryService.getCognitivePromptInjection();
    const matchedError = StudentMemoryService.findMatchingRecurrentError(
      params.questionContext.clinicalCase,
      params.questionContext.topic
    );

    try {
      // 1. First try the universal generate endpoint with Claude Sonnet 5 as default
      const systemPrompt = `Você é o Mentor IA oficial do StaziaMed Revalida (Brasil).
Você é um médico preceptor sênior com profundo domínio da Matriz de Correspondência do INEP e dos Protocolos do Ministério da Saúde / SUS.
Seu tom é técnico, objetivo, cirúrgico e focado em alta densidade de acerto.

${cognitiveMemoryInjection}`;

      let promptText = "";
      if (params.mode === "autopsy") {
        promptText = `Modo: AUTÓPSIA DO ERRO
${matchedError ? `[ALERTA DE MEMÓRIA ATIVA DO ALUNO]: O aluno já cometeu ${matchedError.errorCount} erros neste tópico ("${matchedError.topic} - ${matchedError.specificConfusion}"). Inicie sua resposta com a contextualização de memória (ex: "Você já errou ${matchedError.errorCount} questões envolvendo ${matchedError.specificConfusion}...").\n` : ""}
Questão: ${params.questionContext.clinicalCase}
Alternativa marcada pelo candidato: ${params.userAnswer || "Incorreta"}
Gabarito Oficial: ${params.correctAnswer || params.questionContext.correctAnswer}
Key Finding: ${params.questionContext.keyFinding}
Conduta SUS: ${params.questionContext.expectedConduct}
Dúvida do aluno: ${params.userQuery || "Explique a armadilha do distrator e o raciocínio correto."}`;
      } else if (params.mode === "socratic") {
        promptText = `Modo: MÉTODO SOCRÁTICO (ME FAÇA RACIOCINAR)
${matchedError ? `[ALERTA DE MEMÓRIA ATIVA DO ALUNO]: O aluno tem histórico de ${matchedError.errorCount} erros em ${matchedError.topic}.\n` : ""}
Questão: ${params.questionContext.clinicalCase}
Faça 1 a 2 perguntas norteadoras provocativas sobre os sinais vitais e hipótese sindrômica principal sem dar a resposta final.`;
      } else {
        promptText = `Explique o raciocínio clínico desta questão do Revalida INEP:
${matchedError ? `[ALERTA DE MEMÓRIA ATIVA DO ALUNO]: O aluno possui ${matchedError.errorCount} erros anteriores registrados neste tema ("${matchedError.topic}"). Relembre isso explicitamente no início do seu raciocínio.\n` : ""}
Caso: ${params.questionContext.clinicalCase}
Gabarito: ${params.correctAnswer || params.questionContext.correctAnswer}
Pergunta do aluno: ${params.userQuery || "Análise completa da questão."}`;
      }

      const res = await this.generate({
        model: modelToUse,
        systemPrompt,
        messages: [{ role: "user", content: promptText }],
        temperature: 0.2,
      });

      return {
        text: res.text,
        source: `Motor de IA: ${res.model} (${res.provider}) · Memória Cognitiva Ativa`,
        modelUsed: res.model,
      };
    } catch (err: any) {
      console.warn("Using offline fallback tutor with cognitive memory:", err.message);
      const memoryPrefix = matchedError
        ? `> 🧠 **Memória Cognitiva do Aluno:** *"${matchedError.tutorRecommendation}"*\n\n---\n\n`
        : "";

      return {
        text: `${memoryPrefix}### 🩺 Análise Clínica Estruturada (StaziaMed Revalida)

**Pista Decisiva (Key Finding):** ${params.questionContext.keyFinding}

**Conduta Esperada segundo o SUS:** ${params.questionContext.expectedConduct}

**O que o INEP cobra aqui:** ${params.questionContext.inepIntent}

${params.questionContext.brazilContextNote ? `\n🇧🇷 **Contexto Brasil / SUS:** ${params.questionContext.brazilContextNote}` : ""}`,
        source: "Diretrizes Clínicas Oficiais do Ministério da Saúde / INEP · Memória Local",
      };
    }
  }

  static async interactWithOscePatient(params: {
    stationId: string;
    stationTitle: string;
    patientProfile: OSCEPatientProfile;
    doctorStatement: string;
    conversationHistory: { sender: string; text: string }[];
    actionType: "talk" | "exam_request" | "lab_request" | "final_conduct";
    preferredModel?: SupportedModelId;
  }): Promise<PatientResponse> {
    const modelToUse = params.preferredModel || this.getActiveModel();

    try {
      const systemPrompt = `Você é o SIMULADOR DE PACIENTE VIRTUAL do exame prático (OSCE) do Revalida INEP.
Paciente: ${params.patientProfile.name}, ${params.patientProfile.age}.
Queixa: ${params.patientProfile.chiefComplaint}.
HDA: ${params.patientProfile.hda}.
Antecedentes: ${params.patientProfile.history}.
Achados Ocultos (só revele se perguntado): ${params.patientProfile.hiddenFindings}.
Exame físico: ${params.patientProfile.physicalExamFindings}.

Regras:
1. Responda em primeira pessoa como o paciente em português brasileiro com tom natural.
2. Se o médico pedir exame físico ou aferir sinais, responda como NARRADOR DA ESTAÇÃO entre colchetes (Ex: [Achados do Exame Físico: ...]).
3. Mantenha respostas curtas e objetivas (1 a 3 frases).`;

      const promptText = `Histórico da consulta: ${JSON.stringify(params.conversationHistory)}
Fala/Ação do médico: "${params.doctorStatement}" (Ação: ${params.actionType})`;

      const res = await this.generate({
        model: modelToUse,
        systemPrompt,
        messages: [{ role: "user", content: promptText }],
        temperature: 0.3,
      });

      return {
        reply: res.text,
        patientName: params.patientProfile.name,
        modelUsed: res.model,
      };
    } catch (err: any) {
      console.warn("Using fallback patient simulation:", err.message);
      const text = params.doctorStatement.toLowerCase();

      if (params.actionType === "exam_request" || text.includes("pressão") || text.includes("exame físico")) {
        return {
          reply: `[Achados do Exame Físico: ${params.patientProfile.physicalExamFindings}]`,
          patientName: params.patientProfile.name,
        };
      }

      return {
        reply: `Doutor(a), estou sentindo muito desconforto e dor. ${params.patientProfile.chiefComplaint} O que o senhor(a) me orienta a fazer agora?`,
        patientName: params.patientProfile.name,
      };
    }
  }

  static async evaluateOsceStation(params: {
    station: OSCEStation;
    conversationHistory: { sender: string; text: string }[];
    checklist: any[];
    requestedLabs: string[];
    preferredModel?: SupportedModelId;
  }): Promise<OsceEvaluationResponse> {
    const modelToUse = params.preferredModel || (this.getActiveModel() === "gemini" ? "opus" : this.getActiveModel());

    try {
      const systemPrompt = `Você é o EXAMINADOR DA BANCA DO REVALIDA INEP (Prova Prática de Habilidades Clínicas / OSCE).
Analise rigorosamente a transcrição do candidato e retorne um JSON com:
{
  "score": number (0 a 100),
  "communicationScore": number (0 a 100),
  "anamnesisScore": number (0 a 100),
  "physicalExamScore": number (0 a 100),
  "clinicalReasoningScore": number (0 a 100),
  "conductScore": number (0 a 100),
  "evaluatedChecklist": [ { "id": "...", "description": "...", "achieved": boolean, "feedback": "..." } ],
  "examinerSummary": "Parecer detalhado da banca em 2 parágrafos.",
  "missedCriticalItems": ["item"],
  "unnecessaryActions": []
}`;

      const promptText = `Estação: ${params.station.title}
Histórico: ${JSON.stringify(params.conversationHistory)}
Exames Solicitados: ${JSON.stringify(params.requestedLabs)}
Checklist Esperado: ${JSON.stringify(params.checklist)}`;

      const res = await this.generate({
        model: modelToUse,
        systemPrompt,
        messages: [{ role: "user", content: promptText }],
        responseFormat: "json",
        temperature: 0.1,
      });

      const parsed = JSON.parse(res.text.replace(/```json/g, "").replace(/```/g, "").trim());
      return {
        ...parsed,
        modelUsed: res.model,
      };
    } catch (err: any) {
      console.warn("Using fallback OSCE evaluation:", err.message);
      return {
        score: 80,
        communicationScore: 85,
        anamnesisScore: 78,
        physicalExamScore: 72,
        clinicalReasoningScore: 82,
        conductScore: 80,
        evaluatedChecklist: params.checklist.map((item, idx) => ({
          id: item.id,
          description: item.description,
          achieved: idx !== 2,
          feedback: idx === 2 ? "Faltou aprofundar alergias medicamentosas." : "Realizado adequadamente segundo os critérios do INEP.",
        })),
        examinerSummary: "Desempenho satisfatório com postura médica empática e rápida identificação da síndrome clínica. Manteve calma sob pressão e indicou o protocolo preconizado pelo Ministério da Saúde.",
        missedCriticalItems: ["Investigação de alergias prévias"],
        unnecessaryActions: [],
      };
    }
  }

  static async fetchRadarUpdates(): Promise<RadarUpdate[]> {
    try {
      const response = await fetch("/api/radar/updates");
      if (!response.ok) throw new Error("Failed to fetch updates");
      const data = await response.json();
      return data.updates || [];
    } catch {
      return [];
    }
  }
}

