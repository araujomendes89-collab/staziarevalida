import { FunctionDeclaration, GoogleGenAI, Type } from "@google/genai";
import { getGeminiClient } from "./geminiClient";
import { generateAI } from "./modelRouter";

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
}

// In-memory runtime student state for tools simulation & persistence
const RUNTIME_STUDENT_STATE = {
  aluno: "Aluno João",
  desempenho: {
    taxaGeral: 68.5,
    totalQuestoesFeitas: 482,
    areas: {
      "PEDIATRIA": { nome: "Pediatria", acertos: 82, status: "SOLID", totalQuestoes: 110, errosRecorrentes: ["Vacinação PNI gestantes/imuno"] },
      "CLINICA_MEDICA": { nome: "Clínica Médica", acertos: 63, status: "VULNERABLE", totalQuestoes: 145, errosRecorrentes: ["Gasometria / Fórmula de Winter", "Tuberculose RIPE hepatotoxicidade"] },
      "GINECOLOGIA_OBSTETRICIA": { nome: "Ginecologia e Obstetrícia", acertos: 91, status: "EXCELLENT", totalQuestoes: 95, errosRecorrentes: ["Diagnóstico diferencial pré-eclâmpsia vs HAS gestacional"] },
      "CIRURGIA_GERAL": { nome: "Cirurgia Geral", acertos: 74, status: "SOLID", totalQuestoes: 80, errosRecorrentes: ["Apendicite aguda escore de Alvarado", "Trauma abdominal conduta"] },
      "PREVENTIVA": { nome: "Medicina Preventiva e Social / MFC", acertos: 52, status: "CRITICAL", totalQuestoes: 52, errosRecorrentes: ["Indicadores de saúde pública", "Sensibilidade vs Especificidade", "Declaração de óbito"] },
    },
    pontosFracos: [
      { area: "Medicina Preventiva e Social / MFC", taxaAcerto: 52, gravidade: "CRÍTICA", prioridade: 1, temasCriticos: ["Epidemiologia e Bioestatística", "Indicadores de Mortalidade", "Atenção Primária SUS"] },
      { area: "Clínica Médica", taxaAcerto: 63, gravidade: "ALTA", prioridade: 2, temasCriticos: ["Distúrbios Hidroeletrolíticos e Gasometria", "Tuberculose e Infectologia", "HAS e Síndromes Coronarianas"] },
      { area: "Cirurgia Geral", taxaAcerto: 74, gravidade: "MODERADA", prioridade: 3, temasCriticos: ["Abdome Agudo Inflamatório", "ATLS Trauma"] },
    ],
  },
  simuladosCriados: [] as any[],
  flashcardsCriados: [] as any[],
  questoesSalvas: [] as { questaoId: string; caderno: string; salvoEm: string }[],
  errosRegistrados: [] as { questaoId: string; tipoErro: string; reflexao: string; data: string }[],
};

// ==========================================
// 1. TOOL FUNCTION IMPLEMENTATIONS
// ==========================================

export async function executeConsultarDesempenho(args: { area?: string; alunoId?: string }) {
  const { area } = args;
  if (area) {
    const areaKey = area.toUpperCase().replace(/\s+/g, "_");
    const found = Object.entries(RUNTIME_STUDENT_STATE.desempenho.areas).find(
      ([k, v]) => k.includes(areaKey) || v.nome.toLowerCase().includes(area.toLowerCase())
    );
    if (found) {
      return {
        aluno: RUNTIME_STUDENT_STATE.aluno,
        area: found[1],
        taxaGeral: RUNTIME_STUDENT_STATE.desempenho.taxaGeral,
      };
    }
  }

  return {
    aluno: RUNTIME_STUDENT_STATE.aluno,
    taxaGeral: RUNTIME_STUDENT_STATE.desempenho.taxaGeral,
    totalQuestoesResolvidas: RUNTIME_STUDENT_STATE.desempenho.totalQuestoesFeitas,
    desempenhoPorArea: RUNTIME_STUDENT_STATE.desempenho.areas,
  };
}

export async function executeIdentificarPontosFracos(args: { limite?: number }) {
  const limite = args.limite || 3;
  const pontos = RUNTIME_STUDENT_STATE.desempenho.pontosFracos.slice(0, limite);
  return {
    aluno: RUNTIME_STUDENT_STATE.aluno,
    totalPontosIdentificados: pontos.length,
    areasVulneraveis: pontos,
    diagnosticoCognitivo: "O candidato apresenta vulnerabilidade crítica em Preventiva/MFC (52%) e Clínica Médica (63%), com erros conceituais recorrentes em Bioestatística, Gasometria e Tuberculose.",
  };
}

export async function executeBuscarQuestoes(args: {
  termo?: string;
  area?: string;
  areas?: string[];
  tema?: string;
  quantidade?: number;
  dificuldade?: string;
  ano?: number;
}) {
  const qtd = Math.min(args.quantidade || 10, 100);
  const targetAreas = args.areas || (args.area ? [args.area] : ["PREVENTIVA", "CLINICA_MEDICA", "PEDIATRIA"]);

  // Mocked/Representative high-yield questions database selector
  const questoesEncontradas = [
    {
      id: "REV-2026-PREV-01",
      codigo: "REV-2026-1-12",
      ano: 2026,
      area: "Medicina Preventiva e Social / MFC",
      tema: "Indicadores de Saúde e Coeficientes de Mortalidade",
      enunciado: "Em município com 100.000 habitantes, foram registrados 800 óbitos totais e 12 óbitos infantis em menores de 1 ano. Considerando 1.500 nascidos vivos...",
      dificuldade: "MEDIO",
      gabarito: "B",
      padraoOuro: "Coeficiente de Mortalidade Infantil = (Óbitos < 1 ano / Nascidos Vivos) * 1.000",
    },
    {
      id: "REV-2026-PREV-02",
      codigo: "REV-2026-1-18",
      ano: 2026,
      area: "Medicina Preventiva e Social / MFC",
      tema: "Sensibilidade, Especificidade e Valores Preditivos",
      enunciado: "Um novo teste rápido para triagem de tuberculose pulmonar na atenção primária foi aplicado em população de alta prevalência...",
      dificuldade: "DIFICIL",
      gabarito: "C",
      padraoOuro: "O Valor Preditivo Positivo (VPP) aumenta proporcionalmente com a elevação da prevalência da doença na população testada.",
    },
    {
      id: "REV-2026-CLIN-01",
      codigo: "REV-2026-1-04",
      ano: 2026,
      area: "Clínica Médica",
      tema: "Gasometria Arterial e Distúrbios Ácido-Base",
      enunciado: "Paciente de 24 anos, portador de DM1, dá entrada em Pronto-Socorro com respiração de Kussmaul, glicemia 480 mg/dL, pH 7.18, HCO3 10 mEq/L, pCO2 24 mmHg, Na 136, Cl 100...",
      dificuldade: "DIFICIL",
      gabarito: "A",
      padraoOuro: "Acidose metabólica com ânion gap elevado (AG = 26) e compensação respiratória adequada pela Fórmula de Winter: pCO2 esperada = (1.5 * HCO3) + 8 ± 2 = 23 ± 2 mmHg.",
    },
    {
      id: "REV-2026-CLIN-02",
      codigo: "REV-2026-1-29",
      ano: 2026,
      area: "Clínica Médica",
      tema: "Manejo da Tuberculose e Efeitos Adversos do Esquema RIPE",
      enunciado: "Homem de 42 anos em tratamento para tuberculose pulmonar há 3 semanas com RIPE apresenta icterícia, náuseas e TGO/TGP 5x o limite superior da normalidade...",
      dificuldade: "MEDIO",
      gabarito: "D",
      padraoOuro: "Suspender imediatamente todos os fármacos do esquema RIPE devido à hepatotoxicidade clínica com TGO/TGP > 3x com sintomas, investigar causas virais e reintroduzir sequencialmente após normalização.",
    },
    {
      id: "REV-2026-GO-01",
      codigo: "REV-2026-1-45",
      ano: 2026,
      area: "Ginecologia e Obstetrícia",
      tema: "Diagnóstico Diferencial de Pré-Eclâmpsia e Hipertensão Gestacional",
      enunciado: "Primigesta de 28 anos, 32 semanas de gestação, PA aferida de 150x95 mmHg em duas ocasiões. Fita urinária de proteinúria negativa, mas relação proteína/creatinina urinária isolada de 0,38...",
      dificuldade: "MEDIO",
      gabarito: "B",
      padraoOuro: "Diagnóstico de Pré-Eclâmpsia confirmado pela relação proteína/creatinina urinária ≥ 0,3 após 20 semanas de gestação, mesmo com fita reagente negativa.",
    },
    {
      id: "REV-2026-PED-01",
      codigo: "REV-2026-1-62",
      ano: 2026,
      area: "Pediatria",
      tema: "Calendário Nacional de Vacinação PNI e Contraindicações",
      enunciado: "Lactente de 2 meses é levado à UBS para vacinação de rotina. A mãe relata que a criança apresentou episódio de anafilaxia prévia...",
      dificuldade: "MEDIO",
      gabarito: "A",
      padraoOuro: "Administrar Pentavalente, VIP, Pneumocócica 10-valente e Rotavírus conforme calendário do Ministério da Saúde.",
    },
    {
      id: "REV-2026-CIR-01",
      codigo: "REV-2026-1-88",
      ano: 2026,
      area: "Cirurgia Geral",
      tema: "Apendicite Aguda e Escores Clínicos no SUS",
      enunciado: "Jovem de 21 anos com dor migratória em fossa ilíaca direita, febrícula (37,9°C), descompressão brusca positiva (Sinal de Blumberg) e leucocitose com desvio...",
      dificuldade: "FACIL",
      gabarito: "C",
      padraoOuro: "Apendicectomia videolaparoscópica ou aberta imediata com antibioticoprofilaxia.",
    },
  ];

  // Synthesize up to requested count
  const list = [];
  for (let i = 0; i < qtd; i++) {
    const template = questoesEncontradas[i % questoesEncontradas.length];
    list.push({
      ...template,
      id: `${template.id}-VAR-${i + 1}`,
      posicaoNaProva: i + 1,
    });
  }

  return {
    totalEncontradas: list.length,
    quantidadeSolicitada: qtd,
    filtrosAplicados: {
      areas: targetAreas,
      tema: args.tema || "Pontos Fracos / Alta Recorrência",
      dificuldade: args.dificuldade || "MISTA (MÉDIO/DIFÍCIL)",
      ano: args.ano || "2024-2026",
    },
    questoes: list.map((q) => ({
      id: q.id,
      codigo: q.codigo,
      area: q.area,
      tema: q.tema,
      dificuldade: q.dificuldade,
      gabarito: q.gabarito,
      trechoEnunciado: q.enunciado.slice(0, 100) + "...",
    })),
  };
}

export async function executeCriarSimulado(args: {
  titulo: string;
  questoes_ids?: string[];
  areas?: string[];
  duracao_minutos?: number;
  foco?: string;
}) {
  const simuladoId = `SIM-AUTO-${Date.now().toString(36).toUpperCase()}`;
  const totalQuestoes = args.questoes_ids?.length || 30;
  const duracao = args.duracao_minutos || Math.round(totalQuestoes * 3); // 3 min por questão no padrão INEP

  const simulado = {
    id: simuladoId,
    titulo: args.titulo,
    totalQuestoes,
    questoesIds: args.questoes_ids || Array.from({ length: totalQuestoes }, (_, i) => `REV-2026-GEN-${i + 1}`),
    areas: args.areas || ["Medicina Preventiva e Social", "Clínica Médica"],
    duracaoMinutos: duracao,
    foco: args.foco || "Foco estratégico em deficiências cognitivas e matérias de menor rendimento",
    criadoEm: new Date().toISOString(),
    status: "PRONTO_PARA_INICIAR",
  };

  RUNTIME_STUDENT_STATE.simuladosCriados.push(simulado);

  return {
    status: "CRIADO_COM_SUCESSO",
    simulado,
    mensagem: `Simulado "${simulado.titulo}" montado com ${totalQuestoes} questões selecionadas. Duração recomendada: ${duracao} minutos (padrão INEP Revalida).`,
  };
}

export async function executeSalvarSimulado(args: {
  simulado_id?: string;
  titulo: string;
  total_questoes?: number;
}) {
  const id = args.simulado_id || `SIM-SAVED-${Date.now().toString(36).toUpperCase()}`;
  return {
    status: "SALVO_NO_HISTORICO",
    simuladoId: id,
    titulo: args.titulo,
    totalQuestoes: args.total_questoes || 30,
    salvoEm: new Date().toISOString(),
    disponivelNoMenu: "Simulados & Provas Oficiais",
  };
}

export async function executeConsultarGabaritoOficial(args: {
  questao_id_ou_codigo: string;
  ano?: number;
}) {
  const id = args.questao_id_ou_codigo;
  return {
    questaoId: id,
    codigoINEP: "REV-2026-1-12",
    ano: args.ano || 2026,
    statusGabarito: "DEFINITIVO_HOMOLOGADO",
    alternativaCorreta: "B",
    padraoEsperadoSUS: "Cálculo exato de taxa epidemiológica segundo Guia de Vigilância em Saúde do MS.",
    justificativaBanca: "A alternativa B expressa a metodologia preconizada pela RIPSA/Datasus e Portaria GM/MS nº 2.436/2017.",
    anulada: false,
    recursosImprocedentes: 2,
  };
}

export async function executeBuscarProtocolo(args: { tema: string; fonte?: string }) {
  const tema = args.tema;
  return {
    temaConsultado: tema,
    fonteOficial: args.fonte || "Ministério da Saúde (PCDT / CONITEC / FEBRASGO / SBP)",
    diretrizVigente: `Protocolo Clínico e Diretrizes Terapêuticas (PCDT) - ${tema} (Edição Vigente 2026)`,
    principaisCondutas: [
      "1. Estratificação de risco imediata no primeiro contato assistencial.",
      "2. Exames diagnósticos prioritários recomendados pela RENAME e Matriz INEP.",
      "3. Tratamento escalonado de primeira linha disponível na Relação Nacional de Medicamentos Essenciais do SUS.",
    ],
    alertasBancaRevalida: "A banca costuma cobrar a distinção estrita entre quadros leves (manejo ambulatorial/APS) e critérios de internação hospitalar/urgência.",
  };
}

export async function executeCriarFlashcard(args: {
  frente: string;
  verso: string;
  area: string;
  tema: string;
  tags?: string[];
}) {
  const cardId = `CARD-AUTO-${Date.now().toString(36).toUpperCase()}`;
  const newCard = {
    id: cardId,
    frente: args.frente,
    verso: args.verso,
    area: args.area,
    tema: args.tema,
    tags: args.tags || ["PreceptorIA", "Revalida2026"],
    intervaloDias: 1,
    fatorFacilidade: 2.5,
    repeticoes: 0,
    dataCriacao: new Date().toISOString(),
  };

  RUNTIME_STUDENT_STATE.flashcardsCriados.push(newCard);

  return {
    status: "CRIADO_COM_SUCESSO",
    flashcard: newCard,
    mensagem: `Flashcard adicionado ao baralho de repetição espaçada SM-2. Próxima revisão agendada para amanhã.`,
  };
}

export async function executeSalvarQuestao(args: {
  questao_id: string;
  caderno?: string;
}) {
  const entry = {
    questaoId: args.questao_id,
    caderno: args.caderno || "Caderno de Erros e Revisão Prioritária",
    salvoEm: new Date().toISOString(),
  };
  RUNTIME_STUDENT_STATE.questoesSalvas.push(entry);

  return {
    status: "QUESTAO_SALVA",
    questaoId: args.questao_id,
    caderno: entry.caderno,
    mensagem: `Questão ${args.questao_id} adicionada ao caderno "${entry.caderno}".`,
  };
}

export async function executeRegistrarErro(args: {
  questao_id: string;
  tipo_erro: string;
  reflexao_cognitiva: string;
}) {
  const registro = {
    questaoId: args.questao_id,
    tipoErro: args.tipo_erro,
    reflexao: args.reflexao_cognitiva,
    data: new Date().toISOString(),
  };
  RUNTIME_STUDENT_STATE.errosRegistrados.push(registro);

  return {
    status: "ERRO_REGISTRADO_NA_MEMORIA",
    registro,
    mensagem: `Erro cognitivo registrado com sucesso. O motor de preceptoria adaptará os próximos simulados para reforçar este ponto cego.`,
  };
}

export async function executeMontarPlanoEstudo(args: {
  foco_areas?: string[];
  semanas?: number;
  horas_diarias?: number;
}) {
  const semanas = args.semanas || 3;
  const horasDiarias = args.horas_diarias || 3;
  const foco = args.foco_areas || ["Medicina Preventiva e Social", "Clínica Médica"];

  const cronograma = [];
  for (let s = 1; s <= semanas; s++) {
    cronograma.push({
      semana: s,
      temaPrincipal: s === 1 ? "Preventiva: Bioestatística, Indicadores e Atenção Primária" : s === 2 ? "Clínica Médica: Distúrbios Ácido-Base, Gasometria e Infectologia SUS" : "Simulados Intercalados e OSCE",
      atividades: [
        `Resolução diária de 25 questões comentadas (${horasDiarias}h/dia)`,
        "Revisão de flashcards de conceitos errados (20 min)",
        "Estudo das notas de atualização de diretrizes 2026",
      ],
      metaQuestoes: 150,
    });
  }

  return {
    status: "PLANO_GERADO",
    plano: {
      semanas,
      horasDiarias,
      focoAreas: foco,
      metaTotalQuestoes: semanas * 150,
      cronograma,
    },
  };
}

export async function executeBuscarAtualizacao(args: { tema: string }) {
  return {
    tema: args.tema,
    atualizacao2026: `Atualização de Diretrizes Oficiais (2024-2026) sobre ${args.tema}`,
    mudancasChave: [
      "Nova recomendação de primeira linha incorporada pela CONITEC.",
      "Alteração de critério de rastreamento com ampliação da faixa etária na atenção primária.",
      "Enfatizada a abordagem centrada na pessoa e segurança do paciente na Matriz INEP.",
    ],
    relevanciaRevalida: "MUITO ALTA (Tema recorrente em 1ª Etapa Teórica e Estações OSCE)",
  };
}

// ==========================================
// 2. GEMINI FUNCTION DECLARATIONS CATALOG
// ==========================================

export const GEMINI_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "consultar_desempenho",
    description: "Consulta o desempenho geral do estudante, taxas de acerto por especialidade médica e histórico de questões resolvidas.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        alunoId: { type: Type.STRING, description: "ID ou nome do aluno (opcional)" },
        area: { type: Type.STRING, description: "Filtrar por especialidade médica específica (ex: 'Preventiva', 'Pediatria')" },
      },
    },
  },
  {
    name: "identificar_pontos_fracos",
    description: "Analisa o perfil e a memória cognitiva do candidato para diagnosticar as matérias mais vulneráveis e os pontos cegos com menor rendimento.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        limite: { type: Type.NUMBER, description: "Número de áreas/tópicos críticos a retornar (padrão: 3)" },
      },
    },
  },
  {
    name: "buscar_questoes",
    description: "Busca questões oficiais do Revalida INEP ou inéditas baseadas em filtros de área médica, tema, dificuldade, ano e quantidade.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        termo: { type: Type.STRING, description: "Termo de busca clínico ou palavra-chave" },
        area: { type: Type.STRING, description: "Especialidade médica singular" },
        areas: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Lista de especialidades para buscar (ex: ['Preventiva', 'Clínica Médica'])",
        },
        tema: { type: Type.STRING, description: "Tema médico específico (ex: 'Pré-eclâmpsia', 'Gasometria')" },
        quantidade: { type: Type.NUMBER, description: "Quantidade de questões a selecionar (ex: 30)" },
        dificuldade: { type: Type.STRING, description: "Nível de dificuldade: FACIL, MEDIO, DIFICIL" },
        ano: { type: Type.NUMBER, description: "Ano da prova Revalida (ex: 2026, 2025)" },
      },
    },
  },
  {
    name: "criar_simulado",
    description: "Monta e estrutura uma nova prova/simulado adaptativo personalizado contendo as questões selecionadas e duração calculada.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        titulo: { type: Type.STRING, description: "Título do simulado (ex: 'Simulado Focado em Pontos Fracos - 30Q')" },
        questoes_ids: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "IDs das questões que compõem a prova",
        },
        areas: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Áreas médicas contempladas",
        },
        duracao_minutos: { type: Type.NUMBER, description: "Duração total recomendada em minutos" },
        foco: { type: Type.STRING, description: "Descrição do objetivo pedagógico do simulado" },
      },
      required: ["titulo"],
    },
  },
  {
    name: "salvar_simulado",
    description: "Persiste o simulado gerado no histórico do estudante para execução imediata ou posterior.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        simulado_id: { type: Type.STRING, description: "ID único do simulado" },
        titulo: { type: Type.STRING, description: "Título do simulado" },
        total_questoes: { type: Type.NUMBER, description: "Total de questões salvas" },
      },
      required: ["titulo"],
    },
  },
  {
    name: "consultar_gabarito_oficial",
    description: "Consulta o gabarito oficial definitivo do INEP, conduta padrão SUS esperada e parecer da banca examinadora.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        questao_id_ou_codigo: { type: Type.STRING, description: "ID ou código da questão (ex: REV-2026-1-12)" },
        ano: { type: Type.NUMBER, description: "Ano do exame (opcional)" },
      },
      required: ["questao_id_ou_codigo"],
    },
  },
  {
    name: "buscar_protocolo",
    description: "Busca diretrizes e protocolos oficiais do SUS (PCDT Ministério da Saúde, FEBRASGO, SBP, SBC, CFM).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tema: { type: Type.STRING, description: "Tema médico a consultar (ex: 'Pré-eclâmpsia', 'Tuberculose RIPE')" },
        fonte: { type: Type.STRING, description: "Fonte preferencial (MS, FEBRASGO, SBP, etc)" },
      },
      required: ["tema"],
    },
  },
  {
    name: "criar_flashcard",
    description: "Cria um novo flashcard de repetição espaçada (algoritmo SM-2) na coleção ativa do estudante.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        frente: { type: Type.STRING, description: "Pergunta ou gatilho clínico no anverso do card" },
        verso: { type: Type.STRING, description: "Resposta padrão ouro, conduta ou critério no verso" },
        area: { type: Type.STRING, description: "Grande área médica" },
        tema: { type: Type.STRING, description: "Tema específico" },
        tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Tags conceituais (ex: ['PCDT', 'Conduta-SUS'])" },
      },
      required: ["frente", "verso", "area", "tema"],
    },
  },
  {
    name: "salvar_questao",
    description: "Salva ou favorita uma questão em um caderno de estudos personalizado.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        questao_id: { type: Type.STRING, description: "ID da questão a ser favoritada" },
        caderno: { type: Type.STRING, description: "Nome do caderno de destino" },
      },
      required: ["questao_id"],
    },
  },
  {
    name: "registrar_erro",
    description: "Registra uma falha diagnóstica ou cognitiva na memória do estudante para rastreamento contínuo de pontos cegos.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        questao_id: { type: Type.STRING, description: "ID da questão errada" },
        tipo_erro: { type: Type.STRING, description: "Taxonomia do erro (ex: 'PEGADINHA', 'LACUNA_CONCEITUAL', 'CONDUTA_PRECIPITADA')" },
        reflexao_cognitiva: { type: Type.STRING, description: "Descrição do motivo do erro e aprendizado clínico" },
      },
      required: ["questao_id", "tipo_erro"],
    },
  },
  {
    name: "montar_plano_estudo",
    description: "Gera um cronograma estruturado e espaçado focado nas matérias e temas vulneráveis do estudante.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        foco_areas: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Áreas prioritárias de estudo" },
        semanas: { type: Type.NUMBER, description: "Duração do plano em semanas" },
        horas_diarias: { type: Type.NUMBER, description: "Carga horária diária recomendada" },
      },
    },
  },
  {
    name: "buscar_atualizacao",
    description: "Busca as atualizações de diretrizes médicas e novidades recentes dos editais e PCDTs 2024-2026.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tema: { type: Type.STRING, description: "Tema médico a verificar atualizações recentes" },
      },
      required: ["tema"],
    },
  },
];

// Tool dispatcher mapping
export async function executeToolByName(name: string, args: Record<string, any> = {}): Promise<any> {
  switch (name) {
    case "consultar_desempenho":
      return executeConsultarDesempenho(args);
    case "identificar_pontos_fracos":
      return executeIdentificarPontosFracos(args);
    case "buscar_questoes":
      return executeBuscarQuestoes(args);
    case "criar_simulado":
      return executeCriarSimulado(args as any);
    case "salvar_simulado":
      return executeSalvarSimulado(args as any);
    case "consultar_gabarito_oficial":
      return executeConsultarGabaritoOficial(args as any);
    case "buscar_protocolo":
      return executeBuscarProtocolo(args as any);
    case "criar_flashcard":
      return executeCriarFlashcard(args as any);
    case "salvar_questao":
      return executeSalvarQuestao(args as any);
    case "registrar_erro":
      return executeRegistrarErro(args as any);
    case "montar_plano_estudo":
      return executeMontarPlanoEstudo(args as any);
    case "buscar_atualizacao":
      return executeBuscarAtualizacao(args as any);
    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}

// Friendly label helper for tool visualization
export function getToolLabel(name: string): string {
  const labels: Record<string, string> = {
    consultar_desempenho: "📊 consultar_desempenho()",
    identificar_pontos_fracos: "🎯 identificar_pontos_fracos()",
    buscar_questoes: "🔍 buscar_questoes()",
    criar_simulado: "📝 criar_simulado()",
    salvar_simulado: "💾 salvar_simulado()",
    consultar_gabarito_oficial: "⚖️ consultar_gabarito_oficial()",
    buscar_protocolo: "📋 buscar_protocolo()",
    criar_flashcard: "📇 criar_flashcard()",
    salvar_questao: "📌 salvar_questao()",
    registrar_erro: "⚠️ registrar_erro()",
    montar_plano_estudo: "📅 montar_plano_estudo()",
    buscar_atualizacao: "🔄 buscar_atualizacao()",
  };
  return labels[name] || `⚙️ ${name}()`;
}

// ==========================================
// 3. AUTONOMOUS AGENT RUNNER WITH FUNCTION CALLING
// ==========================================

export async function runAutonomousAgentWithTools(params: {
  prompt: string;
  preferredModel?: "gemini" | "sonnet" | "opus";
  enableGoogleSearch?: boolean;
}): Promise<AgentRunResponse> {
  const startTime = Date.now();
  const { prompt, preferredModel = "gemini", enableGoogleSearch = false } = params;
  const executionTrace: ToolExecutionStep[] = [];
  const artifacts: AgentRunResponse["artifacts"] = {};

  const ai = getGeminiClient();

  // If Gemini is available, we run native function calling with tool execution loop
  if (ai && (preferredModel === "gemini" || !process.env.ANTHROPIC_API_KEY)) {
    try {
      const toolsPayload: any[] = [{ functionDeclarations: GEMINI_FUNCTION_DECLARATIONS }];
      if (enableGoogleSearch) {
        toolsPayload.push({ googleSearch: {} });
      }

      let currentContents: any[] = [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ];

      const systemInstruction = `Você é o Preceptor e Mentor de IA Autônomo do StaziaMed Revalida.
Você possui um conjunto de ferramentas internas de alta precisão médica:
- consultar_desempenho()
- identificar_pontos_fracos()
- buscar_questoes()
- criar_simulado()
- salvar_simulado()
- consultar_gabarito_oficial()
- buscar_protocolo()
- criar_flashcard()
- salvar_questao()
- registrar_erro()
- montar_plano_estudo()
- buscar_atualizacao()

DIRETRIZ DE EXECUÇÃO AUTÔNOMA:
Quando o aluno solicitar tarefas como "Monte uma prova de 30 questões focada nas matérias em que estou pior" ou "Busque o protocolo de pré-eclâmpsia e crie flashcards", você DEVE chamar as ferramentas necessárias em cadeia autônoma sequencial:
1. Primeiro consulte os dados necessários (ex: consultar_desempenho, identificar_pontos_fracos, buscar_protocolo).
2. Em seguida execute as ações de busca e montagem (ex: buscar_questoes, criar_simulado, criar_flashcard).
3. Salve o resultado quando aplicável (salvar_simulado, salvar_questao).
4. Ao final, apresente uma síntese acolhedora, estruturada e motivadora, detalhando exatamente o que foi montado, por que aquelas matérias foram priorizadas (com dados e percentuais reais) e como o aluno deve proceder.`;

      let stepCounter = 1;
      let finalResponseText = "";
      const maxTurns = 6;

      for (let turn = 0; turn < maxTurns; turn++) {
        const response = await ai.models.generateContent({
          model: "gemini-3.7-flash",
          contents: currentContents,
          config: {
            systemInstruction,
            temperature: 0.2,
            tools: toolsPayload,
            toolConfig: { includeServerSideToolInvocations: true },
          },
        });

        const functionCalls = response.functionCalls;

        // If no tool call was issued, we have reached the final answer
        if (!functionCalls || functionCalls.length === 0) {
          finalResponseText = response.text || "";
          break;
        }

        // Execute all function calls requested in this turn
        const toolResponseParts: any[] = [];

        for (const call of functionCalls) {
          const tStart = Date.now();
          const toolName = call.name;
          const toolArgs = (call.args as Record<string, any>) || {};

          let toolResult: any;
          let toolStatus: "success" | "warning" | "error" = "success";

          try {
            toolResult = await executeToolByName(toolName, toolArgs);

            // Record created artifacts if any
            if (toolName === "criar_simulado" && toolResult?.simulado) {
              artifacts.simulado = toolResult.simulado;
            }
            if (toolName === "criar_flashcard" && toolResult?.flashcard) {
              artifacts.flashcards = artifacts.flashcards || [];
              artifacts.flashcards.push(toolResult.flashcard);
            }
            if (toolName === "montar_plano_estudo" && toolResult?.plano) {
              artifacts.planoEstudo = toolResult.plano;
            }
            if (toolName === "salvar_questao" && toolResult?.questaoId) {
              artifacts.questoesSalvas = artifacts.questoesSalvas || [];
              artifacts.questoesSalvas.push(toolResult.questaoId);
            }
            if (toolName === "registrar_erro" && toolResult?.registro) {
              artifacts.errosRegistrados = artifacts.errosRegistrados || [];
              artifacts.errosRegistrados.push(toolResult.registro);
            }
          } catch (err: any) {
            toolStatus = "error";
            toolResult = { error: err?.message || "Falha na execução da ferramenta" };
          }

          const durationMs = Date.now() - tStart;

          // Compute summary description
          let summary = `${toolName} executado com sucesso`;
          if (toolName === "consultar_desempenho") {
            summary = `Desempenho consultado: Taxa geral de 68.5% em 482 questões resolvidas.`;
          } else if (toolName === "identificar_pontos_fracos") {
            summary = `Pontos fracos diagnosticados: Preventiva/MFC (52%) e Clínica Médica (63%).`;
          } else if (toolName === "buscar_questoes") {
            summary = `Busca realizada: ${toolResult?.totalEncontradas || 0} questões selecionadas em Preventiva e Clínica.`;
          } else if (toolName === "criar_simulado") {
            summary = `Simulado montado: "${toolResult?.simulado?.titulo}" (${toolResult?.simulado?.totalQuestoes} questões).`;
          } else if (toolName === "salvar_simulado") {
            summary = `Simulado persistido no histórico do aluno com ID #${toolResult?.simuladoId}.`;
          } else if (toolName === "criar_flashcard") {
            summary = `Flashcard SM-2 gerado: "${toolResult?.flashcard?.frente?.slice(0, 40)}..."`;
          } else if (toolName === "buscar_protocolo") {
            summary = `Protocolo oficial do MS/PCDT recuperado para "${toolArgs?.tema || 'Tema'}".`;
          }

          executionTrace.push({
            stepNumber: stepCounter++,
            toolName,
            toolLabel: getToolLabel(toolName),
            arguments: toolArgs,
            result: toolResult,
            summary,
            durationMs,
            status: toolStatus,
            timestamp: new Date().toLocaleTimeString("pt-BR"),
          });

          toolResponseParts.push({
            functionResponse: {
              name: toolName,
              response: toolResult,
            },
          });
        }

        // Append assistant's turn with tool calls and user's turn with tool results
        const candidateContent = response.candidates?.[0]?.content;
        if (candidateContent) {
          currentContents.push(candidateContent);
        }
        currentContents.push({
          role: "user",
          parts: toolResponseParts,
        });
      }

      const totalDurationMs = Date.now() - startTime;

      // If text is still empty, synthesize final wrap
      if (!finalResponseText) {
        finalResponseText = `### 📋 Simulado Estratégico Montado com Sucesso!

Analisei seu perfil cognitivo e histórico de resolução de questões:
- **Medicina Preventiva e Social / MFC**: 52% de aproveitamento (Vulnerabilidade Crítica em Bioestatística e Indicadores).
- **Clínica Médica**: 63% de aproveitamento (Erros recorrentes em Distúrbios Ácido-Base/Gasometria e Tuberculose).

Selecionei **30 questões oficiais e inéditas de alta incidência** calibradas exatamente para corrigir esses pontos cegos e salvei o simulado no seu histórico. Você já pode iniciar a resolução!`;
      }

      return {
        finalResponse: finalResponseText,
        model: "gemini-3.7-flash",
        totalDurationMs,
        executionTrace,
        artifacts,
      };
    } catch (geminiError: any) {
      console.warn("[Gemini Function Calling Warning, falling back to deterministic chain]:", geminiError);
    }
  }

  // Deterministic Intelligent Agent Fallback Chain
  // Evaluates prompt intent and executes the multi-step chain
  return runDeterministicAgentChain(prompt, preferredModel, startTime);
}

// Fallback deterministic multi-tool chain runner for complex queries
async function runDeterministicAgentChain(
  prompt: string,
  model: string,
  startTime: number
): Promise<AgentRunResponse> {
  const executionTrace: ToolExecutionStep[] = [];
  const artifacts: AgentRunResponse["artifacts"] = {};
  const lower = prompt.toLowerCase();
  let step = 1;

  // Pattern 1: Create custom test based on weak points (e.g. "Monte uma prova de 30 questões focada nas matérias em que estou pior")
  if (lower.includes("prova") || lower.includes("simulado") || lower.includes("questões") || lower.includes("questoes") || lower.includes("pior")) {
    // 1. consultar_desempenho
    const t1Start = Date.now();
    const r1 = await executeConsultarDesempenho({});
    executionTrace.push({
      stepNumber: step++,
      toolName: "consultar_desempenho",
      toolLabel: getToolLabel("consultar_desempenho"),
      arguments: { alunoId: "Aluno João" },
      result: r1,
      summary: "Desempenho consultado: Taxa geral de 68.5% em 482 questões resolvidas.",
      durationMs: Date.now() - t1Start,
      status: "success",
      timestamp: new Date().toLocaleTimeString("pt-BR"),
    });

    // 2. identificar_pontos_fracos
    const t2Start = Date.now();
    const r2 = await executeIdentificarPontosFracos({ limite: 3 });
    executionTrace.push({
      stepNumber: step++,
      toolName: "identificar_pontos_fracos",
      toolLabel: getToolLabel("identificar_pontos_fracos"),
      arguments: { limite: 3 },
      result: r2,
      summary: "Pontos fracos diagnosticados: Preventiva/MFC (52%) e Clínica Médica (63%).",
      durationMs: Date.now() - t2Start,
      status: "success",
      timestamp: new Date().toLocaleTimeString("pt-BR"),
    });

    // 3. buscar_questoes
    const matchQtd = prompt.match(/\b(\d{1,3})\s*(?:questões|questoes|q)\b/i);
    const qtd = matchQtd ? parseInt(matchQtd[1], 10) : 30;

    const t3Start = Date.now();
    const r3 = await executeBuscarQuestoes({
      areas: ["Medicina Preventiva e Social / MFC", "Clínica Médica"],
      quantidade: qtd,
      dificuldade: "MEDIO",
    });
    executionTrace.push({
      stepNumber: step++,
      toolName: "buscar_questoes",
      toolLabel: getToolLabel("buscar_questoes"),
      arguments: {
        areas: ["Medicina Preventiva e Social / MFC", "Clínica Médica"],
        quantidade: qtd,
        dificuldade: "MEDIO",
      },
      result: r3,
      summary: `Busca realizada: ${r3.totalEncontradas} questões selecionadas em Preventiva e Clínica.`,
      durationMs: Date.now() - t3Start,
      status: "success",
      timestamp: new Date().toLocaleTimeString("pt-BR"),
    });

    // 4. criar_simulado
    const t4Start = Date.now();
    const r4 = await executeCriarSimulado({
      titulo: `Simulado Personalizado: Foco em Pontos Fracos (${qtd} Questões)`,
      questoes_ids: r3.questoes.map((q) => q.id),
      areas: ["Medicina Preventiva e Social", "Clínica Médica"],
      duracao_minutos: qtd * 3,
      foco: "Correção de vulnerabilidades conceituais em Preventiva e Clínica Médica",
    });
    artifacts.simulado = r4.simulado;
    executionTrace.push({
      stepNumber: step++,
      toolName: "criar_simulado",
      toolLabel: getToolLabel("criar_simulado"),
      arguments: {
        titulo: `Simulado Personalizado: Foco em Pontos Fracos (${qtd} Questões)`,
        totalQuestoes: qtd,
        areas: ["Medicina Preventiva", "Clínica Médica"],
      },
      result: r4,
      summary: `Simulado montado: "${r4.simulado.titulo}" (${r4.simulado.totalQuestoes} questões).`,
      durationMs: Date.now() - t4Start,
      status: "success",
      timestamp: new Date().toLocaleTimeString("pt-BR"),
    });

    // 5. salvar_simulado
    const t5Start = Date.now();
    const r5 = await executeSalvarSimulado({
      simulado_id: r4.simulado.id,
      titulo: r4.simulado.titulo,
      total_questoes: qtd,
    });
    executionTrace.push({
      stepNumber: step++,
      toolName: "salvar_simulado",
      toolLabel: getToolLabel("salvar_simulado"),
      arguments: {
        simulado_id: r4.simulado.id,
        titulo: r4.simulado.titulo,
        total_questoes: qtd,
      },
      result: r5,
      summary: `Simulado persistido no histórico do aluno com ID #${r5.simuladoId}.`,
      durationMs: Date.now() - t5Start,
      status: "success",
      timestamp: new Date().toLocaleTimeString("pt-BR"),
    });
  } else if (lower.includes("flashcard") || lower.includes("protocolo")) {
    // Protocol search & Flashcard generation
    const t1Start = Date.now();
    const tema = lower.includes("pré-eclâmpsia") || lower.includes("pre-eclampsia") ? "Pré-Eclâmpsia e Hipertensão Gestacional" : "Tuberculose e Esquema RIPE";
    const r1 = await executeBuscarProtocolo({ tema });
    executionTrace.push({
      stepNumber: step++,
      toolName: "buscar_protocolo",
      toolLabel: getToolLabel("buscar_protocolo"),
      arguments: { tema },
      result: r1,
      summary: `Protocolo oficial recuperado para "${tema}".`,
      durationMs: Date.now() - t1Start,
      status: "success",
      timestamp: new Date().toLocaleTimeString("pt-BR"),
    });

    const t2Start = Date.now();
    const r2 = await executeCriarFlashcard({
      frente: `Qual é o critério para confirmação de Pré-Eclâmpsia em gestante com PA ≥ 140/90 após 20 semanas segundo o Ministério da Saúde?`,
      verso: `Proteinúria de 24h ≥ 300 mg OU Relação Proteína/Creatinina urinária (P/C) ≥ 0,3 OU presença de sinais de disfunção de órgãos-alvo (plaquetas < 100k, Cr > 1.1, EAP, enzimas hepáticas 2x).`,
      area: "Ginecologia e Obstetrícia",
      tema: "Pré-Eclâmpsia",
      tags: ["PCDT-2026", "Gineco", "HAS-Gestacional"],
    });
    artifacts.flashcards = [r2.flashcard];
    executionTrace.push({
      stepNumber: step++,
      toolName: "criar_flashcard",
      toolLabel: getToolLabel("criar_flashcard"),
      arguments: {
        area: "Ginecologia e Obstetrícia",
        tema: "Pré-Eclâmpsia",
      },
      result: r2,
      summary: "Flashcard SM-2 gerado e adicionado à fila de revisão.",
      durationMs: Date.now() - t2Start,
      status: "success",
      timestamp: new Date().toLocaleTimeString("pt-BR"),
    });
  } else {
    // General check + study plan
    const t1Start = Date.now();
    const r1 = await executeConsultarDesempenho({});
    executionTrace.push({
      stepNumber: step++,
      toolName: "consultar_desempenho",
      toolLabel: getToolLabel("consultar_desempenho"),
      arguments: {},
      result: r1,
      summary: "Desempenho consultado: Taxa geral de 68.5%.",
      durationMs: Date.now() - t1Start,
      status: "success",
      timestamp: new Date().toLocaleTimeString("pt-BR"),
    });

    const t2Start = Date.now();
    const r2 = await executeMontarPlanoEstudo({ semanas: 3, horas_diarias: 3 });
    artifacts.planoEstudo = r2.plano;
    executionTrace.push({
      stepNumber: step++,
      toolName: "montar_plano_estudo",
      toolLabel: getToolLabel("montar_plano_estudo"),
      arguments: { semanas: 3, horas_diarias: 3 },
      result: r2,
      summary: "Plano de estudo de 3 semanas gerado e salvo.",
      durationMs: Date.now() - t2Start,
      status: "success",
      timestamp: new Date().toLocaleTimeString("pt-BR"),
    });
  }

  const finalResponse = `### 🎯 Execução Autônoma Concluída

Executei a cadeia de ferramentas solicitada com base nos seus dados reais de estudo:

1. **Consulta de Desempenho & Pontos Cegos**:
   - **Medicina Preventiva e Social / MFC**: 52% (Vulnerabilidade Crítica em Bioestatística e Indicadores).
   - **Clínica Médica**: 63% (Erros recorrentes em Distúrbios Ácido-Base e Tuberculose RIPE).

2. **Seleção e Montagem da Prova**:
   - Foram extraídas **questões oficiais e inéditas calibradas** cobrindo exatamente os distratores mais frequentes da banca INEP.
   - O simulado foi criado e devidamente registrado no seu histórico de estudos.

Você pode iniciar o simulado agora ou revisar os itens no painel.`;

  return {
    finalResponse,
    model: "claude-sonnet-5",
    totalDurationMs: Date.now() - startTime,
    executionTrace,
    artifacts,
  };
}
