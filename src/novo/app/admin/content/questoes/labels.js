// Rótulos em português da seção "Questões StaziaMed" da Central de Conteúdo.

/** Situação do rascunho na lista: [texto, tom]. */
export const SITUACAO = {
  awaiting_medical_review: ["Aguardando revisão médica", "warning"],
  needs_changes: ["Ajustes pedidos", "info"],
  approved: ["Aprovada pelo revisor", "success"],
  published: ["Publicada", "success"],
  retired: ["Recolhida", "neutral"],
  rejected: ["Recusada", "danger"],
  reserve: ["Reserva (repetida)", "neutral"],
};

/** Opções do filtro de situação. */
export const SITUACAO_FILTRO = [
  { value: "", label: "Todas" },
  { value: "awaiting_medical_review", label: "Aguardando" },
  { value: "needs_changes", label: "Ajustes" },
  { value: "approved", label: "Aprovadas" },
  { value: "published", label: "Publicadas" },
  { value: "retired", label: "Recolhidas" },
  { value: "rejected", label: "Recusadas" },
  { value: "reserve", label: "Reserva" },
];

export const LAYER = {
  software: "Regras (sem IA)",
  sources: "Fontes oficiais",
  currency: "Atualidade",
  redteam: "Revisão clínica independente (IA)",
};

export const VERDICT = {
  pass: ["sem problemas", "success"],
  issues: ["com apontamentos", "warning"],
  fail: ["reprovada", "danger"],
  insufficient: ["fonte insuficiente", "warning"],
  inconclusive: ["não foi possível conferir", "neutral"],
};

export const SEVERITY = { critical: ["crítico", "danger"], major: ["importante", "warning"], minor: ["menor", "neutral"], info: ["informação", "info"] };

/** De onde veio o rascunho. */
export const ORIGEM = { gerador_antigo: "Gerador antigo (200)", servidor: "Gerado pelo servidor" };

/** Situação de cada vaga de um pedido. */
export const VAGA = {
  na_fila: ["Na fila", "neutral"],
  gerando: ["Gerando", "info"],
  gerada: ["Gerada", "success"],
  pulada: ["Pulada", "warning"],
  descartada: ["Descartada", "danger"],
};

/** Situação da tarefa da fila de uma vaga. */
export const TAREFA = { queued: "na fila", running: "rodando", blocked: "parada (falta configurar a IA ou o teto)", succeeded: "concluída", failed: "falhou, vai tentar de novo", dead: "falhou" };

/** Selo de triagem (ch_draft_triage): só triagem das conferências, nunca aprovação. [texto, tom] */
export const TRIAGE = {
  reprovada: ["Reprovada pela IA ou pelas regras", "danger"],
  sem_fonte: ["Sem fonte oficial: bloqueada", "danger"],
  com_apontamentos: ["Com apontamentos", "warning"],
  so_regras: ["Só regras conferidas", "neutral"],
  nao_conferida: ["Ainda não conferida", "neutral"],
  sem_apontamentos: ["Sem apontamentos", "success"],
};
export const TRIAGE_ORDER = ["reprovada", "sem_fonte", "com_apontamentos", "so_regras", "nao_conferida", "sem_apontamentos"];
export const TRIAGE_NOTE = "A IA não aprova: quem decide é o revisor médico.";

export const AREAS = ["CLINICA_MEDICA", "CIRURGIA", "GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "MFC"];

export const REVIEW_VERDICT = { APPROVED: "sem problemas apontados", REVISION_REQUIRED: "pede revisão", REJECTED: "recusa" };
export const PEDAGOGY_VERDICT = { sem_problemas: "sem problemas", revisar: "pede revisão", recusar: "recomenda recusar" };

/** Nome curto do lote: "Lote 001 · 2026/2" para os antigos, "Pedido de 12/10" para os do servidor. */
export function batchName(b) {
  const old = /^simulado_preditivo_(\d{4})_(\d)_(\d+)$/.exec(b);
  if (old) return `Lote ${old[3]} · ${old[1]}/${old[2]}`;
  const req = /^pedido_(\d{4})(\d{2})(\d{2})_([0-9a-f]{8})$/.exec(b);
  if (req) return `Pedido de ${req[3]}/${req[2]}/${req[1]} (${req[4]})`;
  return b;
}

/** US$ com no máximo 4 casas, sem inventar quando o custo é desconhecido. */
export const usd = (v) => (v == null ? null : `US$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`);
