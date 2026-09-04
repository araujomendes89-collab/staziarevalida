/**
 * Stazia Component Transformer (Etapa 1.27F).
 * Pure transformation engine converting ComponentBlueprints into declarative
 * StaziaComponentDrafts styled with StaziaMed visual identity (MEDICAL_EDITORIAL_V1).
 */

import {
  ComponentBlueprint,
  StaziaComponentDraft,
  StaziaComponentNode,
} from "../types/componentCapture";
import { MEDICAL_EDITORIAL_TOKENS } from "./staziaDesignTokens";

export function transformComponentBlueprintToStaziaDraft(
  blueprint: ComponentBlueprint,
  styleProfile: string = "MEDICAL_EDITORIAL_V1"
): StaziaComponentDraft {
  const tokenMapping: Record<string, string> = {
    pageBackground: MEDICAL_EDITORIAL_TOKENS.pageBackground,
    surface: MEDICAL_EDITORIAL_TOKENS.surface,
    surfaceMuted: MEDICAL_EDITORIAL_TOKENS.surfaceMuted,
    textPrimary: MEDICAL_EDITORIAL_TOKENS.textPrimary,
    textSecondary: MEDICAL_EDITORIAL_TOKENS.textSecondary,
    border: MEDICAL_EDITORIAL_TOKENS.border,
    brandNavy: MEDICAL_EDITORIAL_TOKENS.navy,
    brandTeal: MEDICAL_EDITORIAL_TOKENS.primary,
    brandTealLight: MEDICAL_EDITORIAL_TOKENS.primaryLight,
    brandBlue: MEDICAL_EDITORIAL_TOKENS.secondary,
    noteBackground: MEDICAL_EDITORIAL_TOKENS.noteBackground,
    noteBorder: MEDICAL_EDITORIAL_TOKENS.noteBorder,
    noteText: MEDICAL_EDITORIAL_TOKENS.noteText,
    tableHeaderBg: MEDICAL_EDITORIAL_TOKENS.tableHeaderBackground,
    tableHeaderText: MEDICAL_EDITORIAL_TOKENS.tableHeaderText,
    tableRowBg: MEDICAL_EDITORIAL_TOKENS.tableRowBackground,
  };

  // Build declarative component tree
  const componentTree = buildDeclarativeTree(blueprint);

  return {
    id: `draft_${blueprint.id}`,
    name: formatComponentDraftName(blueprint),
    componentType: blueprint.componentType,
    classification: blueprint.classification,
    sourceComponentBlueprintId: blueprint.id,
    sourceReferenceId: blueprint.sourceReferenceId,
    styleProfile,
    layout: {
      display: blueprint.layout.display,
      flexDirection: blueprint.layout.flexDirection,
      gridColumns: blueprint.layout.gridColumns,
      gap: blueprint.layout.gap,
      padding: blueprint.layout.padding,
    },
    componentTree,
    tokenMapping,
    interactionMapping: blueprint.interactions.map((inter, idx) => ({
      elementId: `action_${idx + 1}`,
      action: inter.action,
      description: `Dispara ação declarativa ${inter.action} ao ocorrer ${inter.trigger}`,
    })),
    responsiveRules: {
      mobileStack: blueprint.responsiveRules.mobileStack,
      tabletColumns: blueprint.responsiveRules.tabletColumns,
      desktopColumns: blueprint.responsiveRules.desktopColumns,
    },
    status: "DRAFT",
    functionalToolLogicCaptured: false,
    createdAt: new Date().toISOString(),
    createdBy: "admin-master",
  };
}

function formatComponentDraftName(blueprint: ComponentBlueprint): string {
  const typeLabels: Record<string, string> = {
    CARD_GROUP: "Painel de Cartões Clínicos",
    CARD: "Cartão Editorial Médico",
    TABLE: "Tabela de Condutas e Protocolos",
    FILTER_PANEL: "Painel de Filtros & Especialidades",
    CALCULATOR_LAYOUT: "Calculadora Clínica (Layout Revalida)",
    HERO: "Hero Section / Destaque Institucional",
    HEADER: "Cabeçalho com Navegação StaziaMed",
    SIDEBAR: "Barra Lateral de Navegação",
    TABS: "Navegação por Abas Médicas",
    ACCORDION: "Acordeão de Casos Clínicos",
    TIMELINE: "Linha do Tempo de Conduta",
    PROGRESS: "Barra de Progresso & Metas",
    FORM: "Formulário Estruturado",
    SEARCH: "Barra de Busca Médica",
  };

  return typeLabels[blueprint.componentType] || `Componente StaziaMed (${blueprint.componentType})`;
}

function buildDeclarativeTree(blueprint: ComponentBlueprint): StaziaComponentNode {
  switch (blueprint.componentType) {
    case "CARD_GROUP":
      return {
        id: "root_card_group",
        type: "StaziaCardGroup",
        props: {
          columns: blueprint.layout.gridColumns || 3,
          gap: "16px",
        },
        children: [
          {
            id: "card_node_1",
            type: "StaziaCard",
            props: {
              badgeText: "Cardiologia",
              title: "Hipertensão Arterial Sistêmica",
              description: "Estratificação de risco cardiovascular e metas pressóricas segundo a Diretriz Brasileira 2024.",
              conductTip: "Iniciar IECA/BRA + BCC em estágio 2.",
              buttonLabel: "Ver Protocolo Completo",
            },
          },
          {
            id: "card_node_2",
            type: "StaziaCard",
            props: {
              badgeText: "Emergência",
              title: "Crise Hipertensiva: Urgência vs Emergência",
              description: "Diferenciação clínica imediata baseada em lesão aguda de órgão-alvo (LOA).",
              conductTip: "Nitroprussiato de sódio na emergência.",
              buttonLabel: "Revisar Critérios",
            },
          },
          {
            id: "card_node_3",
            type: "StaziaCard",
            props: {
              badgeText: "Nefrologia",
              title: "Nefropatia Hipertensiva",
              description: "Avaliação da taxa de filtração glomerular e microalbuminúria em pacientes revalidandos.",
              conductTip: "Meta estrita < 130/80 mmHg com albuminúria.",
              buttonLabel: "Consultar Diretriz",
            },
          },
        ],
      };

    case "TABLE":
      return {
        id: "root_table",
        type: "StaziaTable",
        props: {
          title: "Estratificação & Conduta Terapêutica na HAS",
          headers: ["Estágio / Classificação", "PA Sistólica / Diastólica", "Risco Adicional", "Conduta Inicial Recomendada"],
          rows: [
            ["Pré-Hipertensão", "130-139 / 85-89 mmHg", "Baixo / Moderado", "Mudança do Estilo de Vida (MEV) por 3-6 meses"],
            ["HAS Estágio 1", "140-159 / 90-99 mmHg", "Baixo / Moderado", "Monoterapia ou MEV + reavaliação em 30 dias"],
            ["HAS Estágio 2", "160-179 / 100-109 mmHg", "Alto", "Associação de 2 fármacos em doses sinérgicas (IECA + BCC)"],
            ["HAS Estágio 3", "≥ 180 / ≥ 110 mmHg", "Muito Alto", "Terapia tripla (IECA/BRA + BCC + Tiazídico)"],
          ],
        },
      };

    case "FILTER_PANEL":
      return {
        id: "root_filter_panel",
        type: "StaziaFilterPanel",
        props: {
          title: "Filtros de Conteúdo Clínico",
          searchPlaceholder: "Buscar por termo médico, tema ou CID-10...",
          options: ["Todas as Áreas", "Clínica Médica", "Cirurgia Geral", "Ginecologia & Obstetrícia", "Pediatria", "Medicina de Família"],
          activeOption: "Clínica Médica",
        },
      };

    case "CALCULATOR_LAYOUT":
      return {
        id: "root_calculator",
        type: "StaziaFormLayout",
        props: {
          title: "Calculadora de Risco Cardiovascular Global (Framingham / SBC)",
          description: "Layout demonstrativo StaziaMed. As fórmulas clínicas são calculadas pelo motor médico nativo.",
          inputs: [
            { id: "calc_age", label: "Idade do Paciente (anos)", placeholder: "Ex: 58", type: "number" },
            { id: "calc_sbp", label: "Pressão Arterial Sistólica (mmHg)", placeholder: "Ex: 155", type: "number" },
            { id: "calc_col", label: "Colesterol Total (mg/dL)", placeholder: "Ex: 220", type: "number" },
            { id: "calc_hdl", label: "HDL-Colesterol (mg/dL)", placeholder: "Ex: 38", type: "number" },
          ],
          buttonLabel: "Calcular Risco Estimado em 10 Anos",
          resultPlaceholder: "Resultado estimado: Alto Risco Cardiovascular (> 20% em 10 anos) — Indicação de Estatina de Alta Potência.",
        },
      };

    case "TABS":
      return {
        id: "root_tabs",
        type: "StaziaTabs",
        props: {
          tabs: ["Diagnóstico & Rastreio", "Tratamento Não Farmacológico", "Terapia Farmacológica", "Casos Especiais"],
          activeTabIndex: 0,
        },
      };

    case "ACCORDION":
      return {
        id: "root_accordion",
        type: "StaziaAccordion",
        props: {
          items: [
            { title: "Quais os critérios para MAPA vs MRPA?", content: "MAPA: vigília ≥ 135/85, sono ≥ 120/70, 24h ≥ 130/80 mmHg. MRPA: média ≥ 130/80 mmHg." },
            { title: "Quando suspeitar de Hipertensão Secundária?", content: "Início súbito antes dos 30 ou após os 50 anos, refratariedade a 3 drogas, hipocalemia espontânea ou sopro abdominal." },
            { title: "Qual a conduta no paciente hipertenso diabético?", content: "Meta < 130/80 mmHg com preferência por bloqueadores do SRAA (IECA ou BRA) para nefroproteção." },
          ],
        },
      };

    case "TIMELINE":
      return {
        id: "root_timeline",
        type: "StaziaTimeline",
        props: {
          steps: [
            { step: "01", title: "Rastreamento Inicial", description: "Medição de PA em toda consulta médica com manguito adequado." },
            { step: "02", title: "Confirmação Diagnóstica", description: "Mínimo de 2 consultas ou confirmação com MAPA / MRPA." },
            { step: "03", title: "Estratificação de Risco", description: "Pesquisa de lesões de órgão-alvo e cálculo do risco global." },
            { step: "04", title: "Otimização & Metas", description: "Atingimento da meta pressórica em até 3 meses de acompanhamento." },
          ],
        },
      };

    case "HERO":
      return {
        id: "root_hero",
        type: "StaziaHero",
        props: {
          badge: "Revalida INEP 2026",
          title: "Diretrizes de Prática Clínica & Medicina Baseada em Evidências",
          subtitle: "Componente visual padronizado para abertura de temas de alto rendimento.",
        },
      };

    default:
      return {
        id: "root_generic",
        type: "GenericStaziaBlock",
        props: {
          title: `Bloco Estrutural: ${blueprint.componentType}`,
          description: "Componente reconstruído fielmente com tokens visuais e tipografia editorial StaziaMed.",
        },
      };
  }
}
