// Celebrações do Stazi no app: tradução do que o banco JÁ devolve em eventos do catálogo (src/motion-studio/celebracoes).
// Funções puras (não chamam o banco, não gravam nada). Cada evento leva:
//   id          → evento do catálogo (cenário, Stazi, frases, sons);
//   dados       → valores reais do banco, nunca recalculados (sem o valor, a frase/detalhe que depende dele não aparece);
//   chave       → o que já foi comemorado não volta como se fosse novo (medalha, nível, dia da sequência, semana da liga...);
//   complemento → texto real do app sob o título (nome da medalha, placar do simulado...);
//   importante  → fica no histórico de comemorações (Conta → Comemorações e sons), mesmo quando o limite do dia a encolhe;
//   rotulo      → como aparece nesse histórico.
import { diasEntre, faixaSimulado, mapearBlocoPlay, proximaSerie } from "../../../../motion-studio/celebracoes/mapear";

/** Eventos pequenos (faixa no rodapé) que podem aparecer logo depois da resposta; o resto espera o fim da atividade. */
export const IMEDIATOS = new Set(["questao-correta", "erro-encorajador", "xp-ganho", "dia-2", "dia-3", "streak-dia-comum"]);
/** Marcos da sequência que entram no histórico. */
const MARCOS = new Set(["primeiro-dia", "streak-7", "streak-14", "streak-30", "streak-60", "streak-100", "streak-365"]);
/** Liga nova (slug do banco) → evento de promoção do catálogo. Bronze é a primeira: ninguém sobe para ela. */
export const PROMOCAO_POR_LIGA = {
  prata: "liga-promocao-prata",
  ouro: "liga-promocao-ouro",
  platina: "liga-promocao-platina",
  diamante: "liga-promocao-diamante",
  elite: "liga-promocao-elite",
  revalida_master: "liga-promocao-master",
};
/** Fechamento de liga mais antigo que isto já passou: não se comemora mais (a pessoa ficou dias sem abrir o app). */
export const LIGA_DIAS_MAX = 14;

const positivo = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
const comXp = (xp) => (positivo(xp) ? { xp } : {});

/**
 * Bloco `play` de uma resposta (app_answer_question → gam_turn_summary) + correção da questão.
 * `acertou`: correction.is_correct (true/false); `anulada`: questão anulada pela banca (não comemora nem consola).
 */
export function eventosDaResposta(play, { acertou = null, anulada = false, hoje }) {
  if (!play) return []; // gamificação desligada: nada de comemoração
  const out = [];
  for (const ev of mapearBlocoPlay(play, { hoje })) {
    // nível e medalhas vêm abaixo (com o código do nível e o nome da medalha); "novo recorde" e "volta" precisam de dados que o
    // bloco não traz (o recorde anterior e o último dia estudado): ficam de fora em vez de arriscar um número errado
    if (ev.id === "novo-nivel" || ev.id === "conquista-desbloqueada" || ev.id === "novo-recorde" || ev.id === "volta-apos-pausa") continue;
    const { recorde: _semRecorde, ...dados } = ev.dados; // o bloco não manda o recorde: sem ele o detalhe some (nunca um número inventado)
    const n = Number(dados.n);
    out.push({ id: ev.id, dados, chave: `sequencia:${hoje}`, importante: MARCOS.has(ev.id), rotulo: n === 1 ? "Primeiro dia de sequência" : `Sequência de ${n} dias` });
  }
  if (play.level_up?.to) {
    const nome = play.level_up.name;
    out.push({ id: "novo-nivel", dados: nome ? { nivel: nome } : {}, nivelSlug: play.level_up.to, chave: `nivel:${play.level_up.to}`, importante: true, rotulo: nome ? `Novo nível: ${nome}` : "Novo nível" });
  }
  for (const a of play.achievements_unlocked ?? []) {
    if (!a?.slug) continue;
    out.push({ id: "conquista-desbloqueada", dados: comXp(a.xp), complemento: a.name || undefined, chave: `conquista:${a.slug}`, importante: true, rotulo: a.name ? `Medalha desbloqueada: ${a.name}` : "Medalha desbloqueada" });
  }
  for (const b of play.bonus ?? []) {
    if (b?.type === "MISSION_COMPLETED") {
      const semanal = b.meta?.period === "weekly";
      out.push({ id: "missao-cumprida", dados: comXp(b.xp), complemento: semanal ? "Missão da semana" : undefined, chave: `missao:${b.meta?.mission ?? "?"}:${hoje}`, importante: true, rotulo: semanal ? "Missão da semana cumprida" : "Missão cumprida" });
    } else if (b?.type === "DAILY_MISSIONS_COMPLETED") {
      out.push({ id: "missao-cumprida", dados: comXp(b.xp), complemento: "Todas as missões de hoje", chave: `missoes-do-dia:${hoje}`, importante: true, rotulo: "Todas as missões de hoje" });
    } else if (b?.type === "DAILY_GOAL_COMPLETED") {
      out.push({ id: "meta-diaria", dados: {}, chave: `meta:${hoje}`, importante: false, rotulo: "Meta de hoje cumprida" });
    }
  }
  if (acertou === true) out.push({ id: "questao-correta", dados: {} });
  else if (acertou === false && !anulada) out.push({ id: "erro-encorajador", dados: {} });
  return out;
}

/** Acertos seguidos no treino (contador da sessão): devolve o novo contador e, em 5/10/20, o evento. Anulada não conta nem quebra. */
export function serieDeAcertos(seguidas, { acertou, anulada = false, sessao }) {
  if (anulada || acertou == null) return { seguidas };
  const r = proximaSerie(seguidas, acertou === true);
  if (!r.evento) return { seguidas: r.seguidas };
  return { seguidas: r.seguidas, evento: { ...r.evento, chave: `serie:${sessao}:${r.seguidas}`, rotulo: `${r.seguidas} acertos seguidos` } };
}

/** Simulado finalizado (app_finish_session): mesma conta da tela de resultado (em branco conta como erro; anuladas já vêm fora). */
export function eventoDoSimulado(session) {
  const r = session?.result;
  if (session?.kind !== "simulado" || !r || !(r.total > 0)) return null;
  const pct = Math.round((100 * (r.correct ?? 0)) / r.total);
  return {
    id: `simulado-${faixaSimulado(pct)}`,
    dados: { pct, acertos: r.correct ?? 0, total: r.total },
    complemento: `${r.correct ?? 0} de ${r.total} ${r.total === 1 ? "questão certa" : "questões certas"}`,
    chave: `simulado:${session.id}`,
    importante: true,
    rotulo: `Simulado: ${pct}% de acertos`,
  };
}

/** Aula concluída (app_lesson_progress ou fim do vídeo confirmado por app_lesson_watch). */
export function eventoDaAula(lesson, xp) {
  if (!lesson?.id) return null;
  return { id: "aula-concluida", dados: comXp(xp), complemento: lesson.title || undefined, chave: `aula:${lesson.id}`, importante: false, rotulo: lesson.title ? `Aula concluída: ${lesson.title}` : "Aula concluída" };
}

/** Fila de revisão de flashcards do dia zerada (todas as áreas). */
export function eventoDosFlashcards(total, hoje) {
  const n = positivo(total);
  if (!n) return null;
  return { id: "flashcards-dia", dados: { total: n }, chave: `flashcards:${hoje}`, importante: false, rotulo: "Revisão de flashcards do dia feita" };
}

/**
 * Fechamento semanal da liga (app_league_current → history, só temporadas FECHADAS pelo banco).
 * A promoção só é comemorada depois de confirmada no fechamento; a mesma semana nunca é comemorada duas vezes.
 */
export function eventosDaLiga(liga, { hoje }) {
  if (!liga?.enabled) return [];
  return [...eventosDoFechamento(liga, { hoje }), ...eventoInicioDaSemana(liga, { hoje })];
}

/**
 * Começo da semana da liga ("a batalha começou"): a temporada ABERTA que o banco já devolve (season.starts_on) com o aluno inscrito.
 * Só comemora; não muda regra nenhuma. A chave é a semana: aparece uma vez por semana, na mesma consulta do fechamento.
 */
export function eventoInicioDaSemana(liga, { hoje }) {
  const ini = liga?.joined && liga?.season?.starts_on ? String(liga.season.starts_on).slice(0, 10) : null;
  if (!ini) return [];
  const d = diasEntre(ini, hoje);
  if (!(d >= 0 && d < 7)) return []; // temporada de outra semana (ou data do aparelho errada): nada
  const nome = liga.league?.name ?? liga.league?.slug;
  const pos = [...(liga.leagues ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).findIndex((l) => l.slug === liga.league?.slug);
  return [{ id: "liga-inicio-semana", dados: { ...(nome ? { liga: nome } : {}), ...(pos >= 0 ? { nivel_liga: pos + 1 } : {}) }, chave: `liga:${ini}:inicio`, importante: false, rotulo: nome ? `Começou a semana na Liga ${nome}` : "Começou a semana da liga" }];
}

function eventosDoFechamento(liga, { hoje }) {
  const h = Array.isArray(liga?.history) ? liga.history[0] : null; // a mais recente vem primeiro
  if (!h?.starts_on || !h.league) return [];
  if (diasEntre(String(h.starts_on).slice(0, 10), hoje) > LIGA_DIAS_MAX) return [];
  const ligas = [...(liga.leagues ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const i = ligas.findIndex((l) => l.slug === h.league);
  if (i < 0) return [];
  const atual = ligas[i];
  const nome = (l) => l?.name ?? l?.slug ?? "";
  const pos = Number(h.position);
  const lugar = Number.isInteger(pos) && pos > 0 ? `Você fechou a semana em ${pos}º lugar` : undefined;
  const chave = `liga:${String(h.starts_on).slice(0, 10)}`;
  const out = [];
  if (h.outcome === "promoted") {
    const nova = ligas[i + 1];
    const id = nova && PROMOCAO_POR_LIGA[nova.slug];
    if (id) out.push({ id, dados: { liga: nome(nova), nivel_liga: i + 2 }, complemento: lugar, chave: `${chave}:resultado`, importante: true, rotulo: `Você subiu para a Liga ${nome(nova)}` });
  } else if (h.outcome === "relegated") {
    const nova = ligas[i - 1] ?? atual;
    out.push({ id: "liga-rebaixamento", dados: { liga: nome(nova), nivel_liga: Math.max(1, i) }, complemento: lugar, chave: `${chave}:resultado`, importante: true, rotulo: `Nova semana na Liga ${nome(nova)}` });
  } else if (h.outcome === "stayed") {
    out.push({ id: "liga-permanencia", dados: { liga: nome(atual), nivel_liga: i + 1 }, complemento: lugar, chave: `${chave}:resultado`, importante: true, rotulo: `Você segue na Liga ${nome(atual)}` });
  }
  if (pos === 1) out.push({ id: "liga-primeiro-lugar", dados: { liga: nome(atual), posicao: 1, nivel_liga: i + 1 }, complemento: `Liga ${nome(atual)}`, chave: `${chave}:podio`, importante: true, rotulo: `1º lugar na Liga ${nome(atual)}` });
  else if (pos === 2 || pos === 3) out.push({ id: "liga-podio", dados: { liga: nome(atual), posicao: pos, nivel_liga: i + 1 }, complemento: `Liga ${nome(atual)}`, chave: `${chave}:podio`, importante: true, rotulo: `${pos}º lugar na Liga ${nome(atual)}` });
  return out;
}

/**
 * Junta o que esperou o fim da atividade: a série de acertos fica só a maior; missões viram uma só (XP somado);
 * a mesma chave nunca entra duas vezes.
 */
export function juntarLote(eventos) {
  const out = [];
  const chaves = new Set();
  let serie = null;
  let missao = null;
  let missoes = 0;
  for (const e of eventos) {
    if (!e) continue;
    if (e.chave && chaves.has(e.chave)) continue;
    if (e.chave) chaves.add(e.chave);
    if (/^serie-acertos-\d+$/.test(e.id)) {
      if (!serie || Number(e.dados?.n) > Number(serie.dados?.n)) serie = e;
      continue;
    }
    if (e.id === "missao-cumprida") {
      missoes += 1;
      if (!missao) missao = { ...e, dados: { ...e.dados } };
      else {
        const xp = (positivo(missao.dados.xp) ?? 0) + (positivo(e.dados?.xp) ?? 0);
        missao = { ...missao, dados: xp > 0 ? { xp } : {}, complemento: `${missoes} missões cumpridas`, rotulo: `${missoes} missões cumpridas` };
      }
      continue;
    }
    out.push(e);
  }
  if (missao) out.push(missao);
  if (serie) out.push(serie);
  return out;
}

/** Texto para "Compartilhar marco" (primeira pessoa, sem dado pessoal). Sem texto = sem botão. */
export function textoCompartilhar(evento) {
  const d = evento?.dados ?? {};
  const id = evento?.id ?? "";
  if (/^streak-\d+$/.test(id) && positivo(Number(d.n))) return `Estou há ${d.n} dias seguidos estudando para o Revalida no StaziaMed!`;
  if (id === "conquista-desbloqueada" && evento.complemento) return `Desbloqueei a medalha “${evento.complemento}” no StaziaMed Revalida!`;
  if (id === "novo-nivel" && d.nivel) return `Cheguei ao nível ${d.nivel} no StaziaMed Revalida!`;
  if (id.startsWith("liga-promocao-") && d.liga) return `Subi para a Liga ${d.liga} no StaziaMed Revalida!`;
  if (id === "liga-primeiro-lugar" && d.liga) return `Fechei a semana em 1º lugar na Liga ${d.liga} do StaziaMed Revalida!`;
  if (id === "liga-podio" && d.liga && d.posicao) return `Fechei a semana em ${d.posicao}º lugar na Liga ${d.liga} do StaziaMed Revalida!`;
  return null;
}

/** Precisa do resumo do aluno (app_gamification_summary) para completar: nome do nível e maior sequência dos marcos. */
export function precisaResumo(eventos) {
  return eventos.some((e) => (e.id === "novo-nivel" && !e.dados?.nivel) || (/^streak-\d+$/.test(e.id) && e.dados?.recorde == null));
}

/** Completa com o resumo lido do banco DEPOIS da resposta (nunca recalcula): nome do nível e maior sequência. */
export function completarComResumo(eventos, resumo) {
  if (!resumo) return eventos;
  return eventos.map((e) => {
    if (e.id === "novo-nivel" && !e.dados?.nivel && resumo.level?.slug && resumo.level.slug === e.nivelSlug && resumo.level.name) {
      // o nome entra no detalhe do catálogo ("Agora você é {nivel}"); sem complemento, para não repetir o nome na tela
      return { ...e, dados: { ...e.dados, nivel: resumo.level.name }, rotulo: `Novo nível: ${resumo.level.name}` };
    }
    const maior = Number(resumo.streak?.longest);
    if (/^streak-\d+$/.test(e.id) && e.dados?.recorde == null && Number.isFinite(maior) && maior >= Number(e.dados?.n)) {
      return { ...e, dados: { ...e.dados, recorde: maior } };
    }
    return e;
  });
}
