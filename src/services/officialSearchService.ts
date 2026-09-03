import { AiService } from "./aiService";

export interface OfficialSearchSource {
  title: string;
  uri: string;
  domain: string;
  verifiedGov: boolean;
}

export interface OfficialSearchResult {
  query: string;
  protocolName: string;
  publisher: string;
  publicationYear: string;
  status: "ATUALIZADO_2026" | "VIGENTE" | "EM_CONSULTA" | "ATENCAO_MUDANCA";
  relevantChanges: string;
  previousConduct?: string;
  currentConduct: string;
  susStandardConduct: string;
  inepImpact: string;
  pitfallsInDistractors?: string;
  officialSources: OfficialSearchSource[];
  fullAnalysisMarkdown: string;
  modelUsed: string;
  provider: string;
  searchGroundingUsed: boolean;
  timestamp: string;
}

export interface VerifiedDomainInfo {
  domain: string;
  name: string;
  category?: string;
  badge?: string;
  specialty?: string;
}

export interface OfficialSourcesDirectory {
  verifiedGovDomains: VerifiedDomainInfo[];
  partnerSocieties: VerifiedDomainInfo[];
}

export const TOP_2026_HOT_TOPICS = [
  {
    topic: "Dose Única da Vacina HPV no SUS",
    category: "Imunizações / Pediatria / Preventiva",
    badge: "2024-2026",
    publisher: "Ministério da Saúde (PNI)",
    highlight: "Adolescentes de 9 a 14 anos agora recebem dose única (0,5 mL). Imunodeprimidos mantêm 3 doses.",
    query: "Vacina HPV esquema dose única Ministério da Saúde PNI 2026",
  },
  {
    topic: "Rastreio de Câncer de Colo Uterino por Teste Molecular DNA-HPV",
    category: "Ginecologia & Obstetrícia",
    badge: "CONITEC 2025-2026",
    publisher: "CONITEC / Ministério da Saúde",
    highlight: "Incorporação do teste DNA-HPV a cada 5 anos para mulheres de 25-64 anos, substituindo o citopatológico rotineiro.",
    query: "Rastreamento Câncer Colo Útero DNA-HPV CONITEC Ministério da Saúde",
  },
  {
    topic: "Diretrizes de Hipertensão Arterial e Metas Pressóricas",
    category: "Clínica Médica / Atenção Primária",
    badge: "SBC / SUS 2026",
    publisher: "SBC / Ministério da Saúde",
    highlight: "Meta estrita <130/80 mmHg para alto risco cardiovascular e terapia combinada de 1ª linha.",
    query: "Diretriz Hipertensão Arterial SBC metas pressóricas SUS terapia combinada",
  },
  {
    topic: "Manejo da Dengue e Arboviroses (Classificação A, B, C, D)",
    category: "Clínica Médica / Pediatria / Urgência",
    badge: "VIGENTE 6ª ED.",
    publisher: "Ministério da Saúde / SVSA",
    highlight: "Hidratação precoce na sala de espera e estrita vigilância de sinais de alarme e choque.",
    query: "Dengue manejo clínico classificação A B C D Ministério da Saúde hidratação",
  },
  {
    topic: "Diagnóstico de Tuberculose por Teste Rápido Molecular (TRM-TB)",
    category: "Infectologia / Preventiva / APS",
    badge: "PCDT OFICIAL",
    publisher: "Ministério da Saúde",
    highlight: "TRM-TB em amostra única de escarro + testagem universal de HIV para todo caso diagnosticado.",
    query: "Tuberculose TRM-TB manual recomendações controle Brasil Ministério da Saúde",
  },
  {
    topic: "Profilaxia Pré-Exposição (PrEP) e Pós-Exposição (PEP) do HIV",
    category: "Infectologia / Preventiva",
    badge: "PCDT HIV 2026",
    publisher: "Ministério da Saúde / DATHI",
    highlight: "Expansão de PrEP sob demanda e PrEP diária na Atenção Básica com monitoramento renal e sorológico.",
    query: "PrEP PEP HIV protocolo clínico diretrizes terapêuticas Ministério da Saúde",
  },
  {
    topic: "Manejo de Sífilis Gestacional e Congênita",
    category: "Ginecologia / Pediatria / SUS",
    badge: "PCDT SUS",
    publisher: "Ministério da Saúde",
    highlight: "Critérios estritos de tratamento adequado da gestante (Penicilina Benzatina iniciada até 30 dias antes do parto).",
    query: "Sífilis gestacional congênita PCDT Ministério da Saúde tratamento adequado",
  },
  {
    topic: "Suporte Avançado no Trauma (ATLS 11ª Edição / Protocolo SUS)",
    category: "Cirurgia Geral / Urgência & Emergência",
    badge: "ATLS 11ª ED.",
    publisher: "American College of Surgeons / Protocolo Trauma SUS",
    highlight: "Reanimação hemostática precoce (1:1:1), uso do ácido tranexâmico nas primeiras 3h e controle vascular por balão (REBOA).",
    query: "ATLS 11 trauma reanimação hemostática choque hemorrágico ácido tranexâmico",
  },
];

export class OfficialSearchService {
  /**
   * Run official search against verified Brazilian medical domains
   */
  static async searchOfficialProtocol(
    query: string,
    options?: {
      preferredModel?: "gemini" | "sonnet" | "opus";
      targetSources?: string[];
    }
  ): Promise<OfficialSearchResult> {
    try {
      const res = await fetch("/api/ai/official-medical-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...AiService.getUserHeaders(),
        },
        body: JSON.stringify({
          query,
          preferredModel: options?.preferredModel || "gemini",
          targetSources: options?.targetSources,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent("ai-auth-required", { detail: errorData }));
        } else if (res.status === 403) {
          if (errorData.code === "PLAN_EXPIRED" || errorData.quota?.reason === "PLAN_EXPIRED") {
            window.dispatchEvent(new CustomEvent("ai-plan-expired", { detail: errorData }));
            window.dispatchEvent(new CustomEvent("open-pricing-modal", { detail: { reason: "PLAN_EXPIRED", message: errorData.message } }));
          }
        }
        throw new Error(errorData.message || errorData.error || `Erro HTTP ${res.status}`);
      }

      return await res.json();
    } catch (err: any) {
      console.warn("[OfficialSearchService] Fallback to local offline synthesis:", err);
      // Fallback response in case server is momentarily offline
      return {
        query,
        protocolName: `Diretriz Oficial do Ministério da Saúde: ${query}`,
        publisher: "Ministério da Saúde / CONITEC / INEP",
        publicationYear: "2025-2026",
        status: "VIGENTE",
        relevantChanges: "Consulte o protocolo clínico oficial do Ministério da Saúde (PCDT) para verificação de dosagens e linhas de cuidado na Atenção Primária.",
        currentConduct: "Abordagem escalonada na UBS conforme diretrizes clínicas e RENAME.",
        susStandardConduct: "Atendimento na Atenção Primária à Saúde com encaminhamento regulado conforme critérios de gravidade.",
        inepImpact: "O Revalida INEP avalia a conduta médica no contexto do SUS, com ênfase no uso racional de recursos e diagnóstico clínico.",
        officialSources: [
          {
            title: "Portal de PCDT - Ministério da Saúde",
            uri: "https://www.gov.br/saude/pt-br/assuntos/protocolos-clinicos-e-diretrizes-terapeuticas-pcdt",
            domain: "saude.gov.br",
            verifiedGov: true,
          },
          {
            title: "Biblioteca Virtual em Saúde (BVSMS)",
            uri: "https://bvsms.saude.gov.br",
            domain: "bvsms.saude.gov.br",
            verifiedGov: true,
          },
        ],
        fullAnalysisMarkdown: `### 🏛️ Síntese de Auditoria: ${query}\n\nPara o exame do Revalida INEP, mantenha foco na conduta preconizada pelo Ministério da Saúde e pelas Sociedades Médicas Brasileiras.`,
        modelUsed: "offline-fallback-engine",
        provider: "offline",
        searchGroundingUsed: false,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Fetch list of verified domains
   */
  static async getOfficialSourcesDirectory(): Promise<OfficialSourcesDirectory | null> {
    try {
      const res = await fetch("/api/ai/official-sources");
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}
