// Rótulos e contas do Stazia Play (sem React, para poder testar sozinho).
// Nomes de nível, liga e medalha vêm do banco; aqui ficam só os textos de apoio.

export const RARITY = { comum: "Comum", rara: "Rara", epica: "Épica", lendaria: "Lendária" };
export const CATEGORY = { estudo: "Estudo", precisao: "Precisão", streak: "Sequência", areas: "Áreas", evolucao: "Evolução", especiais: "Especiais" };
export const KIND_LABEL = { geral: "Geral", semana: "Semana", mes: "Mês", precisao: "Precisão", evolucao: "Evolução", questoes: "Questões", streak: "Sequência" };
export const KINDS = Object.keys(KIND_LABEL);
export const NODE_STATE = {
  locked: { label: "Bloqueada", icon: "lock" },
  available: { label: "Disponível", icon: "play" },
  in_progress: { label: "Em andamento", icon: "flag" },
  completed: { label: "Concluída", icon: "check" },
  mastered: { label: "Dominada", icon: "star" },
};
export const EVENT_LABEL = {
  QUESTION_CORRECT: "Acerto", QUESTION_WRONG: "Resposta", SESSION_10: "10 questões na sessão", SESSION_30: "30 questões na sessão",
  FLASHCARD_REVIEWED: "Flashcard revisado", FLASHCARD_MASTERED: "Flashcard consolidado", SPACED_REVIEW_DONE: "Fila de flashcards zerada",
  SIMULATION_COMPLETED: "Simulado completo", DAILY_GOAL_COMPLETED: "Plano de hoje concluído", DAILY_MISSIONS_COMPLETED: "Todas as missões do dia",
  MISSION_COMPLETED: "Missão concluída", ACHIEVEMENT_UNLOCKED: "Medalha", LEVEL_UP: "Novo nível", STREAK_INCREMENTED: "Sequência",
  STREAK_FREEZE_USED: "Proteção usada", STREAK_FREEZE_EARNED: "Proteção ganha", STREAK_BROKEN: "Sequência interrompida",
  LEAGUE_PROMOTED: "Subiu de liga", LEAGUE_RELEGATED: "Desceu de liga", REWARD_CLAIMED: "Recompensa",
  GUESS_PENALTY: "Multa por chute",
};

/** Cor da liga pelo token do banco (ex.: "--league-ouro"). */
export const leagueColor = (league) => (league?.color_token ? `var(${league.color_token})` : "var(--league)");
export const levelColor = (level) => (level?.color_token ? `var(${level.color_token})` : "var(--text-brand)");

/** "TOP 2,4%" a partir do percentil (posição / total). Nunca humilha: acima de 50% vira "TOP 50%+" . */
export function topLabel(percentile) {
  if (percentile == null) return null;
  const p = Number(percentile);
  if (p <= 50) return `TOP ${p < 10 ? p.toFixed(1).replace(".", ",") : Math.ceil(p)}%`;
  return `TOP ${Math.min(100, Math.ceil(p / 10) * 10)}%`;
}

/** "↑ 34 posições esta semana" · "↓ 2 posições" · null sem comparação. */
export function movementText(change) {
  if (change == null || change === 0) return change === 0 ? "Mesma posição esta semana" : null;
  const n = Math.abs(change);
  return `${change > 0 ? "↑" : "↓"} ${n} ${n === 1 ? "posição" : "posições"} esta semana`;
}

/** Quanto falta para a posição à frente: "Faltam 12 pontos para #436". */
export function gapText(next, kind = "geral") {
  if (!next) return null;
  const unit = kind === "geral" ? "pontos" : kind === "precisao" ? "pontos de precisão" : kind === "streak" ? "dias" : "XP";
  const gap = Math.max(0, Math.ceil(Math.abs(Number(next.gap))) + (Number(next.gap) % 1 === 0 ? 1 : 0));
  return `${gap === 1 ? "Falta 1 ponto" : `Faltam ${gap} ${unit}`} para #${next.rank}`;
}

/** Progresso do score dentro do nível atual (0–100). */
export function levelProgress(score, level, nextLevel) {
  if (!level) return 0;
  const min = level.min_score ?? 0;
  const max = nextLevel ? nextLevel.min_score : (level.max_score ?? 1000) + 1;
  return Math.max(0, Math.min(100, Math.round((100 * (score - min)) / Math.max(1, max - min))));
}

/** Linhas do detalhe de XP de uma resposta, na ordem de exibição. */
export function xpLines(xp) {
  if (!xp) return [];
  const names = [
    ["base", "Responder"], ["correct", "Acerto"], ["difficulty_bonus", "Questão difícil"], ["first_attempt_bonus", "Primeira tentativa"],
    ["unseen_bonus", "Questão inédita"], ["review_bonus", "Revisão de erro"], ["fix_bonus", "Erro corrigido"],
  ];
  return names.filter(([k]) => xp[k]).map(([k, label]) => ({ label, value: xp[k] }));
}

/** Por que a resposta não valeu XP. */
export function invalidReason(reason) {
  return {
    too_fast: "Resposta rápida demais para contar.",
    guess: "Rápida demais para ter lido a questão: conta como chute e não vale XP.",
    repeat_lock: "Você respondeu esta questão há menos de 3 dias: ela volta a valer XP depois disso.",
    no_time: "Sem tempo de resposta medido: esta não contou.",
    rate_limit: "Muitas respostas em um minuto: esta não contou.",
    repeated_question_farming: "Questão repetida muitas vezes: não vale mais XP.",
    duplicate_event: "Resposta repetida.",
    invalid_attempt: "Tentativa inválida.",
  }[reason] ?? "Esta resposta não contou XP.";
}

export function pluralDays(n) {
  return `${n} ${n === 1 ? "dia" : "dias"}`;
}

/** Tempo até o fim da temporada: "3d 14h" · "14h" · "encerra hoje". */
export function endsIn(endsOn, now = new Date()) {
  if (!endsOn) return "";
  const end = new Date(`${endsOn}T23:59:59`);
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return "encerrando";
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h`;
}
