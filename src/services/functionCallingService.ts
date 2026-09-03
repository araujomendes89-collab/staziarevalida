import { AiService } from "./aiService";

export interface ToolExecutionStep {
  stepNumber: number;
  toolName: string;
  toolLabel: string;
  arguments: Record<string, any>;
  result: Record<string, any>;
  summary: string;
  durationMs: number;
  status: "success" | "warning" | "error";
  timestamp: string;
}

export interface AgentRunResponse {
  finalResponse: string;
  model: string;
  totalDurationMs: number;
  executionTrace: ToolExecutionStep[];
  artifacts: {
    simulado?: {
      id: string;
      titulo: string;
      totalQuestoes: number;
      questoesIds: string[];
      areas: string[];
      duracaoMinutos: number;
      foco: string;
    };
    flashcards?: Array<{
      id: string;
      frente: string;
      verso: string;
      area: string;
      tema: string;
      tags: string[];
    }>;
    planoEstudo?: {
      semanas: number;
      horasDiarias: number;
      focoAreas: string[];
      cronograma: Array<{
        semana: number;
        temaPrincipal: string;
        atividades: string[];
        metaQuestoes: number;
      }>;
    };
    questoesSalvas?: string[];
    errosRegistrados?: Array<{
      questaoId: string;
      tipoErro: string;
      reflexao: string;
    }>;
  };
  error?: string;
}

export interface ToolCatalogItem {
  name: string;
  label: string;
  description: string;
  parameters: any;
}

export class FunctionCallingService {
  /**
   * Dispara a execução autônoma do agente com Function Calling
   */
  static async runAgent(
    prompt: string,
    options: {
      preferredModel?: "gemini" | "sonnet" | "opus";
      enableGoogleSearch?: boolean;
    } = {}
  ): Promise<AgentRunResponse> {
    try {
      const response = await fetch("/api/ai/agent-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...AiService.getUserHeaders(),
        },
        body: JSON.stringify({
          prompt,
          preferredModel: options.preferredModel || "gemini",
          enableGoogleSearch: options.enableGoogleSearch ?? false,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent("ai-auth-required", { detail: errJson }));
        } else if (response.status === 403) {
          if (errJson.code === "PLAN_EXPIRED" || errJson.quota?.reason === "PLAN_EXPIRED") {
            window.dispatchEvent(new CustomEvent("ai-plan-expired", { detail: errJson }));
            window.dispatchEvent(new CustomEvent("open-pricing-modal", { detail: { reason: "PLAN_EXPIRED", message: errJson.message } }));
          }
        }
        throw new Error(errJson.message || errJson.error || `Erro HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error("[FunctionCallingService.runAgent Error]:", error);
      throw error;
    }
  }

  /**
   * Obtém o catálogo de ferramentas internas registradas para Claude / Gemini
   */
  static async getToolCatalog(): Promise<ToolCatalogItem[]> {
    try {
      const response = await fetch("/api/ai/tools");
      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status}`);
      }
      const data = await response.json();
      return data.tools || [];
    } catch (error) {
      console.warn("[FunctionCallingService.getToolCatalog Fallback]:", error);
      return [
        {
          name: "consultar_desempenho",
          label: "📊 consultar_desempenho()",
          description: "Consulta o desempenho atual do estudante e porcentagens por grande área médica.",
          parameters: { type: "OBJECT", properties: { area: { type: "STRING" } } },
        },
        {
          name: "identificar_pontos_fracos",
          label: "🎯 identificar_pontos_fracos()",
          description: "Diagnostica as áreas e temas mais vulneráveis com erros recorrentes.",
          parameters: { type: "OBJECT", properties: { limite: { type: "NUMBER" } } },
        },
        {
          name: "buscar_questoes",
          label: "🔍 buscar_questoes()",
          description: "Busca questões oficiais do Revalida INEP ou inéditas baseadas em critérios clínicos.",
          parameters: { type: "OBJECT", properties: { areas: { type: "ARRAY" }, quantidade: { type: "NUMBER" } } },
        },
        {
          name: "criar_simulado",
          label: "📝 criar_simulado()",
          description: "Cria uma prova ou simulado personalizado com foco estratégico.",
          parameters: { type: "OBJECT", properties: { titulo: { type: "STRING" } } },
        },
        {
          name: "salvar_simulado",
          label: "💾 salvar_simulado()",
          description: "Salva o simulado no histórico do estudante.",
          parameters: { type: "OBJECT", properties: { simulado_id: { type: "STRING" } } },
        },
        {
          name: "consultar_gabarito_oficial",
          label: "⚖️ consultar_gabarito_oficial()",
          description: "Consulta o gabarito oficial e justificativa da banca INEP.",
          parameters: { type: "OBJECT", properties: { questao_id: { type: "STRING" } } },
        },
        {
          name: "buscar_protocolo",
          label: "📋 buscar_protocolo()",
          description: "Busca diretrizes e protocolos oficiais do SUS / Ministério da Saúde.",
          parameters: { type: "OBJECT", properties: { tema: { type: "STRING" } } },
        },
        {
          name: "criar_flashcard",
          label: "📇 criar_flashcard()",
          description: "Gera um novo card SM-2 na coleção ativa do estudante.",
          parameters: { type: "OBJECT", properties: { frente: { type: "STRING" }, verso: { type: "STRING" } } },
        },
        {
          name: "salvar_questao",
          label: "📌 salvar_questao()",
          description: "Favorita uma questão em um caderno de estudos.",
          parameters: { type: "OBJECT", properties: { questao_id: { type: "STRING" } } },
        },
        {
          name: "registrar_erro",
          label: "⚠️ registrar_erro()",
          description: "Registra uma falha diagnóstica na memória cognitiva.",
          parameters: { type: "OBJECT", properties: { questao_id: { type: "STRING" }, tipo_erro: { type: "STRING" } } },
        },
        {
          name: "montar_plano_estudo",
          label: "📅 montar_plano_estudo()",
          description: "Gera cronograma espaçado de estudo focado em deficiências.",
          parameters: { type: "OBJECT", properties: { semanas: { type: "NUMBER" } } },
        },
        {
          name: "buscar_atualizacao",
          label: "🔄 buscar_atualizacao()",
          description: "Busca atualizações de diretrizes médicas 2024-2026.",
          parameters: { type: "OBJECT", properties: { tema: { type: "STRING" } } },
        },
      ];
    }
  }

  /**
   * Executa uma ferramenta individual diretamente para testes/inspeção
   */
  static async executeToolDirectly(toolName: string, args: Record<string, any> = {}): Promise<any> {
    const response = await fetch("/api/ai/execute-tool", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...AiService.getUserHeaders(),
      },
      body: JSON.stringify({ toolName, arguments: args }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("ai-auth-required", { detail: err }));
      } else if (response.status === 403) {
        if (err.code === "PLAN_EXPIRED" || err.quota?.reason === "PLAN_EXPIRED") {
          window.dispatchEvent(new CustomEvent("ai-plan-expired", { detail: err }));
          window.dispatchEvent(new CustomEvent("open-pricing-modal", { detail: { reason: "PLAN_EXPIRED", message: err.message } }));
        }
      }
      throw new Error(err.message || err.error || `Erro HTTP ${response.status}`);
    }

    return await response.json();
  }
}
