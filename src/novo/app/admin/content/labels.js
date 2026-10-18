// Rótulos e tons da Central de Conteúdo (o banco guarda os códigos; a tela mostra em português).

export const DOC_STATUS = {
  received: ["Recebido", "neutral"],
  extracting: ["Extraindo", "info"],
  classifying: ["Classificando", "info"],
  verifying_sources: ["Verificando fontes", "info"],
  drafting: ["Gerando rascunhos", "ai"],
  awaiting_review: ["Aguardando revisão", "warning"],
  no_drafts: ["Sem rascunhos para revisar", "warning"],
  failed: ["Falhou", "danger"],
};

/**
 * Depois do envio (CC10): o arquivo entra na fila e o processamento (tarefa no Google Cloud Run) pega na próxima passada. O agendador
 * passa a cada 10 minutos (scripts/cloudrun/deploy-pdf-worker.sh); se a tarefa estiver ocupada com outro documento, entra na vez.
 */
export const PROCESSING_START_NOTICE =
  "Arquivo recebido e na fila. O processamento pega o arquivo na próxima passada (a tarefa passa a cada 10 minutos; se estiver ocupada com outro documento, ele espera a vez) e PDF grande leva mais tempo para terminar.";

export const UNIT_STATUS = {
  draft: ["Rascunho", "neutral"],
  awaiting_review: ["Aguardando revisão", "warning"],
  approved: ["Aprovado", "success"],
  published: ["Publicado", "brand"],
  needs_update: ["Requer atualização", "danger"],
  retired: ["Retirado", "neutral"],
};

export const JOB_STATUS = {
  queued: ["Na fila", "neutral"],
  running: ["Em execução", "info"],
  succeeded: ["Concluída", "success"],
  failed: ["Falhou — nova tentativa", "warning"],
  dead: ["Falhou", "danger"],
  blocked: ["Pendente de configuração", "warning"],
};

export const STEP_LABEL = {
  extract: "Extração",
  source_index: "Indexação da fonte",
  classify: "Classificação",
  claims: "Afirmações",
  evidence: "Conferência nas fontes",
  draft: "Rascunho da unidade",
  materials: "Materiais",
  render: "Arquivos finais",
  review_check: "Revisão automática",
  source_search: "Busca de fontes",
  question_analysis: "Análise de questões por IA",
  draft_check: "Conferência de rascunhos por IA",
  similarity: "Questões parecidas",
};

export const BLOCK_STATUS = {
  extracted: ["Extraído", "success"],
  pending: ["Pendente", "warning"],
  illegible: ["Ilegível", "danger"],
  excluded: ["Excluído", "neutral"],
};

export const BLOCK_TYPE = {
  heading: "Título",
  paragraph: "Parágrafo",
  list: "Lista",
  table: "Tabela",
  figure: "Figura",
  caption: "Legenda",
  footnote: "Nota de rodapé",
  reference: "Referência",
  other: "Outro",
};

export const CLAIM_STATUS = {
  extracted: ["Sem conferência ainda", "neutral"],
  evidence_linked: ["Evidência vinculada", "info"],
  compatible: ["Compatível", "success"],
  outdated: ["Desatualizada", "danger"],
  conflicting: ["Conflitante", "danger"],
  insufficient: ["Insuficientemente sustentada", "warning"],
  context_dependent: ["Depende de contexto", "warning"],
  needs_review: ["Requer revisão", "warning"],
};

export const VERDICTS = [
  ["compatible", "Compatível"],
  ["outdated", "Desatualizada"],
  ["conflicting", "Conflitante"],
  ["insufficient", "Insuficientemente sustentada"],
  ["context_dependent", "Depende de contexto"],
];

export const SOURCE_KIND = {
  final: "Documento final",
  public_consultation: "Consulta pública",
  preliminary: "Relatório preliminar",
  rectification: "Retificação",
  society_guideline: "Diretriz de sociedade médica",
};

// Nível de autoridade da fonte: só A–D valem como evidência; E serve para descobrir o assunto.
export const AUTHORITY = {
  A: "A · Oficial (Ministério da Saúde, INEP, Conitec, Anvisa, legislação)",
  B: "B · Sociedade médica reconhecida",
  C: "C · Organização internacional (OMS, OPAS, CDC, NICE…)",
  D: "D · Revisão sistemática, metanálise, periódico de alto nível",
  E: "E · Livro, apostila ou curso (fonte complementar: não dá selo ao aluno)",
};

// Classe da fonte na biblioteca: oficial (confiável, pode ser mostrada ao aluno) ou complementar (o aluno não vê nada dela).
export const AUDIENCE = {
  oficial: "Oficial · confiável: pode ser mostrada ao aluno",
  complementar: "Fonte complementar · o aluno não vê esta fonte",
};
export const AUDIENCE_NOTE = "Fonte complementar · o aluno não vê esta fonte";

// Natureza da fonte (o que ela é), diferente de "tipo" (a situação do documento: final, consulta pública…).
export const SOURCE_TYPE = {
  GUIDELINE: "Diretriz", PCDT: "PCDT", LAW: "Lei ou norma", MANUAL: "Manual", CONSENSUS: "Consenso", ARTICLE: "Artigo", SYSTEMATIC_REVIEW: "Revisão sistemática",
  BOOK: "Livro", OFFICIAL_EXAM: "Prova oficial", OFFICIAL_ANSWER_KEY: "Gabarito oficial", VIDEO: "Vídeo", AUDIO: "Áudio", WEB_PAGE: "Página da web",
  SLIDES: "Slides", DOCUMENT: "Documento", OTHER: "Outra",
};

// Fontes oficiais com IA: estado da busca, tipo de site e estado do achado (candidato).
export const SEARCH_STATUS = {
  na_fila: ["Na fila", "neutral"],
  buscando: ["Buscando", "info"],
  conferindo: ["Conferindo", "info"],
  concluida: ["Concluída", "success"],
  nada_encontrado: ["Nada encontrado", "neutral"],
  pendente: ["Pendente", "warning"],
  falhou: ["Falhou", "danger"],
};

export const DOMAIN_KIND = { governo: "Governo", internacional: "Internacional", sociedade: "Sociedade médica" };

export const CANDIDATE_STATUS = {
  aguardando: ["Aguardando sua conferência", "warning"],
  aprovado: ["Aprovado", "success"],
  rejeitado: ["Rejeitado", "danger"],
};

export const SOURCE_STATUS = { current: ["Vigente", "success"], superseded: ["Substituída", "warning"], withdrawn: ["Retirada", "danger"] };

// Frescor da fonte: se alguém (o vigia) confere que a publicação continua igual.
export const FRESHNESS = {
  FRESH: ["Conferida no prazo", "success"],
  CHECK_DUE: ["Conferência vencida", "warning"],
  CHECKING: ["Conferindo", "info"],
  SOURCE_CHANGED: ["A publicação mudou", "danger"],
  REVIEW_REQUIRED: ["Evidências a reconferir", "warning"],
  UNKNOWN: ["Não monitorada", "neutral"],
};

// O que mudou em um trecho entre duas versões da fonte (comparação automática, sem IA).
export const DIFF_KIND = {
  UNCHANGED: ["Idêntico", "neutral"],
  EDITORIAL: ["Só a forma", "neutral"],
  MINOR_WORDING: ["Redação", "info"],
  NUMERIC: ["Número mudou", "danger"],
  NEGATION: ["Negação mudou", "danger"],
  SUBSTANTIVE: ["Reescrito", "warning"],
  REMOVED: ["Removido", "warning"],
  ADDED: ["Novo", "info"],
  NOT_LOCATED: ["Evidência não localizada", "danger"],
};

export const CRITICAL = {
  dose: "dose",
  route: "via",
  frequency: "frequência",
  duration: "duração",
  contraindication: "contraindicação",
  interaction: "interação",
  diagnostic_criterion: "critério diagnóstico",
  screening_interval: "intervalo de rastreamento",
  emergency_conduct: "conduta de urgência",
};

export const MATERIAL_KIND = {
  lesson: "Aula",
  summary: "Resumo",
  visual_cards: "Cards visuais",
  flashcards: "Flashcards",
  table: "Tabela",
  questions: "Questões inéditas",
  station: "Roteiro de estação",
};

export const AREA_LABEL = {
  CLINICA_MEDICA: "Clínica Médica",
  GINECOLOGIA_OBSTETRICIA: "Ginecologia e Obstetrícia",
  PEDIATRIA: "Pediatria",
  CIRURGIA: "Cirurgia",
  MFC: "Medicina de Família e Comunidade",
  SAUDE_MENTAL: "Saúde Mental",
  SAUDE_COLETIVA: "Saúde Coletiva",
};

/** [rótulo, tom] de um mapa, com o código como reserva. */
export const pick = (map, key) => map[key] ?? [key ?? "—", "neutral"];

export const isMockModel = (model) => /^mock/.test(model ?? "");
