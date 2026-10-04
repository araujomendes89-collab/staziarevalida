// Rótulos e tons da Central de Conteúdo (o banco guarda os códigos; a tela mostra em português).

export const DOC_STATUS = {
  received: ["Recebido", "neutral"],
  extracting: ["Extraindo", "info"],
  classifying: ["Classificando", "info"],
  verifying_sources: ["Verificando fontes", "info"],
  drafting: ["Gerando rascunhos", "ai"],
  awaiting_review: ["Aguardando revisão", "warning"],
  failed: ["Falhou", "danger"],
};

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

export const RIGHTS = {
  unknown: "Não informado",
  own: "Próprio (autoria StaziaMed)",
  licensed_adaptation: "Adaptação licenciada",
  reference_only: "Somente referência",
  unauthorized: "Sem autorização de uso",
};

export const SOURCE_KIND = {
  final: "Documento final",
  public_consultation: "Consulta pública",
  preliminary: "Relatório preliminar",
  rectification: "Retificação",
  society_guideline: "Diretriz de sociedade médica",
};

export const SOURCE_STATUS = { current: ["Vigente", "success"], superseded: ["Substituída", "warning"], withdrawn: ["Retirada", "danger"] };

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
  questions: "Questões inéditas StaziaMed",
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
