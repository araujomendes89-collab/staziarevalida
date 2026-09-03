import { AiService } from "./aiService";

export type OfficialSourceType =
  | "GOVERNMENT_HEALTH"
  | "INEP"
  | "SCIENTIFIC_SOCIETY"
  | "OTHER_PRIMARY_SOURCE";

export type DocumentVersionStatus =
  | "CURRENT_VERIFIED"
  | "CURRENT_UNVERIFIED"
  | "SUPERSEDED"
  | "UNKNOWN";

export type VerificationStatus =
  | "VERIFIED_PRIMARY_SOURCE"
  | "PARTIALLY_VERIFIED"
  | "UNVERIFIED";

export interface OfficialSearchSource {
  title: string;
  uri: string;
  domain: string;
  verifiedGov: boolean;
  sourceType?: OfficialSourceType;
  sourceTypeLabel?: string;
}

export interface OfficialSearchResult {
  query: string;
  protocolName: string;
  publisher: string;
  publicationYear: string;
  publicationDate?: string;
  revisionDate?: string;
  reviewedAt?: string;
  status: "ATUALIZADO_2026" | "VIGENTE" | "EM_CONSULTA" | "ATENCAO_MUDANCA";
  versionStatus?: DocumentVersionStatus;
  verificationStatus?: VerificationStatus;
  sourceType?: OfficialSourceType;
  sourceTypeLabel?: string;
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
  sourceType?: OfficialSourceType;
}

export interface OfficialSourcesDirectory {
  verifiedGovDomains: VerifiedDomainInfo[];
  partnerSocieties: VerifiedDomainInfo[];
}

/**
 * Classify a source domain and publisher into distinct authority levels
 */
export function classifySourceAuthority(
  domain: string,
  publisher?: string
): { sourceType: OfficialSourceType; label: string; isGov: boolean } {
  const d = (domain || "").toLowerCase();
  const p = (publisher || "").toLowerCase();

  if (d.includes("inep.gov.br") || p.includes("inep")) {
    return {
      sourceType: "INEP",
      label: "Documento INEP",
      isGov: true,
    };
  }

  if (
    d.includes("saude.gov.br") ||
    d.includes("conitec.gov.br") ||
    d.includes("anvisa.gov.br") ||
    d.includes("bvsms.saude.gov.br") ||
    d.endsWith(".gov.br") ||
    p.includes("ministério da saúde") ||
    p.includes("conitec") ||
    p.includes("anvisa") ||
    p.includes("pni") ||
    p.includes("svsa")
  ) {
    return {
      sourceType: "GOVERNMENT_HEALTH",
      label: "Fonte Governamental (SUS / MS)",
      isGov: true,
    };
  }

  if (
    d.includes("cardiol.br") ||
    d.includes("sbp.com.br") ||
    d.includes("febrasgo.org.br") ||
    d.includes("diabetes.org.br") ||
    d.includes("sbpt.org.br") ||
    d.includes("amb.org.br") ||
    d.includes("cfm.org.br") ||
    d.includes("sbim.org.br") ||
    d.includes("sbn.org.br") ||
    p.includes("sociedade brasileira") ||
    p.includes("febrasgo") ||
    p.includes("sbc") ||
    p.includes("sbp") ||
    p.includes("sbd") ||
    p.includes("amb") ||
    p.includes("cfm") ||
    p.includes("college of surgeons")
  ) {
    return {
      sourceType: "SCIENTIFIC_SOCIETY",
      label: "Diretriz de Sociedade Científica",
      isGov: false,
    };
  }

  return {
    sourceType: "OTHER_PRIMARY_SOURCE",
    label: "Fonte Primária / Referência",
    isGov: false,
  };
}

export const TOP_2026_HOT_TOPICS = [
  {
    topic: "Dose Única da Vacina HPV no SUS",
    category: "Imunizações / Pediatria / Preventiva",
    badge: "MS / PNI",
    publisher: "Ministério da Saúde (PNI)",
    sourceType: "GOVERNMENT_HEALTH" as OfficialSourceType,
    sourceTypeLabel: "Fonte Governamental (SUS / MS)",
    highlight: "Adolescentes de 9 a 14 anos agora recebem dose única (0,5 mL). Imunodeprimidos mantêm 3 doses.",
    query: "Vacina HPV esquema dose única Ministério da Saúde PNI 2026",
    reviewedAt: "2026-08-31",
  },
  {
    topic: "Rastreio de Câncer de Colo Uterino por Teste Molecular DNA-HPV",
    category: "Ginecologia & Obstetrícia",
    badge: "CONITEC",
    publisher: "CONITEC / Ministério da Saúde",
    sourceType: "GOVERNMENT_HEALTH" as OfficialSourceType,
    sourceTypeLabel: "Fonte Governamental (SUS / MS)",
    highlight: "Incorporação do teste DNA-HPV a cada 5 anos para mulheres de 25-64 anos, substituindo o citopatológico rotineiro.",
    query: "Rastreamento Câncer Colo Útero DNA-HPV CONITEC Ministério da Saúde",
    reviewedAt: "2026-08-31",
  },
  {
    topic: "Diretrizes de Hipertensão Arterial e Metas Pressóricas",
    category: "Clínica Médica / Atenção Primária",
    badge: "SBC",
    publisher: "Sociedade Brasileira de Cardiologia (SBC)",
    sourceType: "SCIENTIFIC_SOCIETY" as OfficialSourceType,
    sourceTypeLabel: "Diretriz de Sociedade Científica",
    highlight: "Meta estrita <130/80 mmHg para alto risco cardiovascular e terapia combinada de 1ª linha.",
    query: "Diretriz Hipertensão Arterial SBC metas pressóricas SUS terapia combinada",
    reviewedAt: "2026-08-31",
  },
  {
    topic: "Manejo da Dengue e Arboviroses (Classificação A, B, C, D)",
    category: "Clínica Médica / Pediatria / Urgência",
    badge: "MS / SVSA 6ª ED.",
    publisher: "Ministério da Saúde / SVSA",
    sourceType: "GOVERNMENT_HEALTH" as OfficialSourceType,
    sourceTypeLabel: "Fonte Governamental (SUS / MS)",
    highlight: "Hidratação precoce na sala de espera e estrita vigilância de sinais de alarme e choque.",
    query: "Dengue manejo clínico classificação A B C D Ministério da Saúde hidratação",
    reviewedAt: "2026-08-31",
  },
  {
    topic: "Diagnóstico de Tuberculose por Teste Rápido Molecular (TRM-TB)",
    category: "Infectologia / Preventiva / APS",
    badge: "MS / PCDT",
    publisher: "Ministério da Saúde",
    sourceType: "GOVERNMENT_HEALTH" as OfficialSourceType,
    sourceTypeLabel: "Fonte Governamental (SUS / MS)",
    highlight: "TRM-TB em amostra única de escarro + testagem universal de HIV para todo caso diagnosticado.",
    query: "Tuberculose TRM-TB manual recomendações controle Brasil Ministério da Saúde",
    reviewedAt: "2026-08-31",
  },
  {
    topic: "Profilaxia Pré-Exposição (PrEP) e Pós-Exposição (PEP) do HIV",
    category: "Infectologia / Preventiva",
    badge: "MS / DATHI",
    publisher: "Ministério da Saúde / DATHI",
    sourceType: "GOVERNMENT_HEALTH" as OfficialSourceType,
    sourceTypeLabel: "Fonte Governamental (SUS / MS)",
    highlight: "Expansão de PrEP sob demanda e PrEP diária na Atenção Básica com monitoramento renal e sorológico.",
    query: "PrEP PEP HIV protocolo clínico diretrizes terapêuticas Ministério da Saúde",
    reviewedAt: "2026-08-31",
  },
  {
    topic: "Manejo de Sífilis Gestacional e Congênita",
    category: "Ginecologia / Pediatria / SUS",
    badge: "MS / PCDT",
    publisher: "Ministério da Saúde",
    sourceType: "GOVERNMENT_HEALTH" as OfficialSourceType,
    sourceTypeLabel: "Fonte Governamental (SUS / MS)",
    highlight: "Critérios estritos de tratamento adequado da gestante (Penicilina Benzatina iniciada até 30 dias antes do parto).",
    query: "Sífilis gestacional congênita PCDT Ministério da Saúde tratamento adequado",
    reviewedAt: "2026-08-31",
  },
  {
    topic: "Suporte Avançado no Trauma (ATLS 11ª Edição / Diretriz)",
    category: "Cirurgia Geral / Urgência & Emergência",
    badge: "ATLS 11ª ED.",
    publisher: "American College of Surgeons / Protocolo de Trauma",
    sourceType: "SCIENTIFIC_SOCIETY" as OfficialSourceType,
    sourceTypeLabel: "Diretriz de Sociedade Científica",
    highlight: "Reanimação hemostática precoce (1:1:1), uso do ácido tranexâmico nas primeiras 3h e controle vascular por balão (REBOA).",
    query: "ATLS 11 trauma reanimação hemostática choque hemorrágico ácido tranexâmico",
    reviewedAt: "2026-08-31",
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

      const rawResult = await res.json();
      const authority = classifySourceAuthority(
        rawResult.officialSources?.[0]?.domain || "",
        rawResult.publisher
      );

      return {
        ...rawResult,
        sourceType: rawResult.sourceType || authority.sourceType,
        sourceTypeLabel: rawResult.sourceTypeLabel || authority.label,
        versionStatus: rawResult.versionStatus || "CURRENT_UNVERIFIED",
        verificationStatus: rawResult.verificationStatus || (rawResult.searchGroundingUsed ? "VERIFIED_PRIMARY_SOURCE" : "PARTIALLY_VERIFIED"),
        officialSources: (rawResult.officialSources || []).map((s: OfficialSearchSource) => {
          const sAuth = classifySourceAuthority(s.domain, rawResult.publisher);
          return {
            ...s,
            sourceType: sAuth.sourceType,
            sourceTypeLabel: sAuth.label,
          };
        }),
      };
    } catch (err: any) {
      console.warn("[OfficialSearchService] Fallback to local offline synthesis:", err);
      const authority = classifySourceAuthority("saude.gov.br", "Ministério da Saúde / CONITEC / INEP");

      // Fallback response in case server is momentarily offline
      return {
        query,
        protocolName: `Diretriz do Ministério da Saúde / Sociedades: ${query}`,
        publisher: "Ministério da Saúde / CONITEC / INEP",
        publicationYear: "2024-2026",
        publicationDate: "2024-2026",
        reviewedAt: "2026-08-31",
        status: "VIGENTE",
        versionStatus: "CURRENT_UNVERIFIED",
        verificationStatus: "PARTIALLY_VERIFIED",
        sourceType: authority.sourceType,
        sourceTypeLabel: authority.label,
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
            sourceType: "GOVERNMENT_HEALTH",
            sourceTypeLabel: "Fonte Governamental (SUS / MS)",
          },
          {
            title: "Biblioteca Virtual em Saúde (BVSMS)",
            uri: "https://bvsms.saude.gov.br",
            domain: "bvsms.saude.gov.br",
            verifiedGov: true,
            sourceType: "OTHER_PRIMARY_SOURCE",
            sourceTypeLabel: "Fonte Primária / Referência",
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
