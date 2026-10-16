// Progresso de uma medalha bloqueada, com os MESMOS números que o banco usa para liberar (gam_check_achievements, migração
// 20261003003900): questões válidas, acerto, maior sequência e evolução saem de app_gamification_summary (user_gamification_stats).
// O alvo vem de item.criteria quando o banco o enviar; até lá, do critério semeado na migração 20261003003800, e SÓ se a
// descrição que o banco devolve for a semeada (se a equipe editar a medalha, a tela mostra só o critério, sem barra inventada).
// Áreas, "Aprendeu Mesmo" e "Top 10 semanal" dependem de contas que o resumo não traz: aparece só o critério.

const SEMEADAS = {
  primeiros_passos: [{ type: "questions_total", n: 10 }, "10 questões respondidas."],
  aquecendo_motores: [{ type: "questions_total", n: 100 }, "100 questões respondidas."],
  maquina_de_questoes: [{ type: "questions_total", n: 1000 }, "1.000 questões respondidas."],
  insano: [{ type: "questions_total", n: 5000 }, "5.000 questões respondidas."],
  mira_boa: [{ type: "accuracy", min_questions: 50, pct: 80 }, "80% de acerto em pelo menos 50 questões."],
  atirador_de_elite: [{ type: "accuracy", min_questions: 100, pct: 90 }, "90% de acerto em pelo menos 100 questões."],
  quase_banca: [{ type: "accuracy", min_questions: 200, pct: 95 }, "95% de acerto em pelo menos 200 questões."],
  streak_3: [{ type: "streak", days: 3 }, "Sequência de 3 dias."],
  streak_7: [{ type: "streak", days: 7 }, "Sequência de 7 dias."],
  streak_15: [{ type: "streak", days: 15 }, "Sequência de 15 dias."],
  streak_30: [{ type: "streak", days: 30 }, "Sequência de 30 dias."],
  streak_60: [{ type: "streak", days: 60 }, "Sequência de 60 dias."],
  streak_100: [{ type: "streak", days: 100 }, "Sequência de 100 dias."],
  streak_365: [{ type: "streak", days: 365 }, "Sequência de 365 dias."],
  virada_de_jogo: [{ type: "comeback", pts: 10 }, "Melhorou a precisão em 10 pontos ou mais entre uma quinzena e a seguinte."],
};

const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const fmt = (n) => Math.round(n).toLocaleString("pt-BR");
const pctDe = (atual, alvo) => Math.max(0, Math.min(100, Math.floor((100 * atual) / Math.max(1, alvo))));

/** Critério da medalha: o do banco (item.criteria) ou o semeado, se a descrição não foi editada. */
export function criterioDa(item) {
  if (item?.criteria && typeof item.criteria === "object" && item.criteria.type) return item.criteria;
  const s = SEMEADAS[item?.slug];
  return s && item.description === s[1] ? s[0] : null;
}

/**
 * { pct, texto } para a barra de uma medalha bloqueada, ou null quando não há número confiável.
 * resumo = resposta de app_gamification_summary (questions, accuracy, streak.longest, evolution_pts).
 */
export function progressoDaMedalha(item, resumo) {
  const p = calcular(item, resumo);
  // o banco confere as medalhas a cada atividade (gam_check_achievements): número já batido e medalha ainda trancada = libera na próxima
  if (p && p.pct >= 100) return { pct: 100, texto: `${p.texto} · libera na próxima atividade` };
  return p;
}

function calcular(item, resumo) {
  if (!item || item.unlocked_at || item.secret || !resumo) return null;
  const c = criterioDa(item);
  if (!c) return null;
  const q = num(resumo.questions);
  if (c.type === "questions_total") {
    const alvo = num(c.n);
    if (q == null || !alvo) return null;
    return { pct: pctDe(q, alvo), texto: `${fmt(Math.min(q, alvo))} de ${fmt(alvo)} questões` };
  }
  if (c.type === "accuracy") {
    const min = num(c.min_questions);
    const meta = num(c.pct);
    const acc = num(resumo.accuracy);
    if (q == null || !min || !meta) return null;
    if (q < min) return { pct: pctDe(q, min), texto: `${fmt(q)} de ${fmt(min)} questões${acc != null ? ` · acerto ${fmt(acc)}% (meta ${fmt(meta)}%)` : ""}` };
    if (acc == null) return null;
    return { pct: pctDe(acc, meta), texto: `Acerto ${fmt(acc)}% de ${fmt(meta)}% · ${fmt(q)} questões` };
  }
  if (c.type === "streak") {
    const alvo = num(c.days);
    const maior = num(resumo.streak?.longest);
    if (maior == null || !alvo) return null;
    return { pct: pctDe(maior, alvo), texto: `Maior sequência: ${fmt(Math.min(maior, alvo))} de ${fmt(alvo)} ${alvo === 1 ? "dia" : "dias"}` };
  }
  if (c.type === "comeback") {
    const alvo = num(c.pts);
    const evo = num(resumo.evolution_pts);
    if (evo == null || !alvo) return null;
    const sinal = evo > 0 ? "+" : "";
    return { pct: pctDe(Math.max(0, evo), alvo), texto: `Evolução atual: ${sinal}${fmt(evo)} de +${fmt(alvo)} pontos` };
  }
  return null;
}
