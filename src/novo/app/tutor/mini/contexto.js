// Mini Tutor: o contexto que cada tela passa e como ele vira a conversa no servidor (app_tutor_start). Funções puras.
//
// contexto = {
//   tipo: "questao" | "aula" | "livre",
//   questao?: { id, statement, options, area, origin, exam },  // a questão aberta na tela
//   respondida?: boolean,      // o aluno já respondeu (treino corrigido ou simulado entregue)
//   simuladoEmAndamento?: boolean,
//   anulada?: boolean,
//   tema?: { id, title, area, area_name }, secao?: string,     // aula
//   rotulo?: string,           // o que aparece no topo da janelinha
// }
import { MINI_TUTOR, TEXTOS } from "./config.js";
import { isStaziamed } from "../../practice/format.js";
// mesma regra de practice/Correction.jsx (isAnnulled), sem trazer a tela da correção para cá
const isAnnulled = (c) => c?.annulled === true || (c != null && c.correct_option == null);

/** Treino ou simulado em andamento (PracticeSession): a questão aberta. */
export function contextoDaQuestao(question, { simulado = false, respondida = false } = {}) {
  if (!question) return null;
  if (simulado) return { tipo: "questao", questao: resumo(question), respondida: false, simuladoEmAndamento: true, rotulo: "Simulado em andamento" };
  return {
    tipo: "questao", questao: resumo(question), respondida: Boolean(respondida),
    anulada: Boolean(respondida && isAnnulled(question.correction)), rotulo: respondida ? "Questão respondida" : "Questão aberta",
  };
}

/** Revisão do resultado (treino ou simulado já entregue): a questão aberta na lista; sem nenhuma aberta, conversa livre. */
export function contextoDaRevisao(question, { simulado = false } = {}) {
  if (!question) return { tipo: "livre", rotulo: simulado ? "Resultado do simulado" : "Resultado do treino" };
  const respondida = question.selected != null;
  return { tipo: "questao", questao: resumo(question), respondida, anulada: isAnnulled(question.correction), rotulo: simulado ? "Revisão do simulado" : "Revisão do treino" };
}

/** Aula do tema (TemaAula): o tema e a seção que está na tela. */
export function contextoDaAula(tema, secao = null) {
  if (!tema) return null;
  return { tipo: "aula", tema: { id: tema.id, title: tema.title, area: tema.area ?? null, area_name: tema.area_name ?? null }, secao: secao || null, rotulo: "Aula" };
}

function resumo(q) {
  return { id: q.id, statement: q.statement ?? "", options: q.options ?? [], area: q.area ?? null, origin: q.origin ?? null, exam: q.exam ?? null };
}

/**
 * Por que o mini tutor não conversa neste contexto (ou null quando conversa).
 * "simulado": simulado em andamento (decisão 3); "inedita": Questão Inédita (o Tutor só comenta questão oficial); "anulada".
 */
export function bloqueio(ctx) {
  if (!ctx) return null;
  if (ctx.simuladoEmAndamento && MINI_TUTOR.travarSimuladoEmAndamento) return "simulado";
  if (ctx.tipo === "questao" && isStaziamed(ctx.questao)) return "inedita";
  if (ctx.tipo === "questao" && ctx.anulada) return "anulada";
  return null;
}

/** Fase da questão: "antes" (só pistas) ou "depois" (explica tudo). Fora de questão, null. */
export const faseDaQuestao = (ctx) => (ctx?.tipo === "questao" ? (ctx.respondida ? "depois" : "antes") : null);

/** Uma conversa por contexto: mudou a questão, a resposta ou o tema, começa outra. A seção da aula não troca a conversa. */
export function chaveDoContexto(ctx) {
  if (!ctx) return "nada";
  if (ctx.tipo === "questao") return `q:${ctx.questao?.id}:${ctx.respondida ? "r" : "a"}:${ctx.simuladoEmAndamento ? "sim" : ""}`;
  if (ctx.tipo === "aula") return `aula:${ctx.tema?.id}`;
  return `livre:${ctx.rotulo ?? ""}`;
}

/**
 * Argumentos de app_tutor_start (mesma RPC do Tutor; a personalidade vem do perfil quando p_personality é null).
 *  - questão antes de responder: modo "questao" com a questão (estado "aberta": a IA nem recebe o gabarito numa mensagem livre);
 *  - questão respondida: modo "livre" com a questão (estado "respondida": explica tudo);
 *  - aula: modo "livre" com o tema; livre: modo "livre".
 */
export function argumentosDoInicio(ctx, personalidade = null) {
  const base = { p_topic: null, p_question_id: null, p_context: null, p_personality: personalidade };
  if (ctx?.tipo === "questao") {
    const id = ctx.questao.id;
    return ctx.respondida
      ? { ...base, p_mode: "livre", p_question_id: id, p_context: { type: "question", id } }
      : { ...base, p_mode: "questao", p_question_id: id, p_context: { type: "question", id } };
  }
  if (ctx?.tipo === "aula") {
    const t = ctx.tema;
    return { ...base, p_mode: "livre", p_topic: t.title, p_context: { type: "theme", id: t.id, label: t.title, ...(t.area_name ? { area: t.area_name } : {}) } };
  }
  return { ...base, p_mode: "livre", p_context: { type: "free" } };
}

/** Na aula, a pergunta vai com a seção que está na tela (o Tutor sabe de que parte o aluno fala). */
export function textoParaEnviar(ctx, texto) {
  const t = String(texto ?? "").trim();
  if (ctx?.tipo === "aula" && ctx.secao) return `[Aula de ${ctx.tema.title}, parte "${ctx.secao}"] ${t}`.slice(0, 2000);
  return t.slice(0, 2000);
}

/** Frase de boas-vindas do personagem (local, sem IA e sem gastar saldo). */
export function boasVindas(ctx) {
  const fase = faseDaQuestao(ctx);
  if (fase === "antes") return TEXTOS.antesDeResponder;
  if (fase === "depois") return TEXTOS.depoisDeResponder;
  if (ctx?.tipo === "aula") return TEXTOS.aula(ctx.tema.title);
  return TEXTOS.livre;
}

/** Atalhos de pergunta. `acao: "hint"` pede pista ao servidor; as outras viram mensagem. Antes de responder, nada pede a resposta. */
export function atalhos(ctx) {
  const fase = faseDaQuestao(ctx);
  if (fase === "antes") return [
    { id: "pista", rotulo: "Me dá uma pista", acao: "hint" },
    { id: "raciocinio", rotulo: "Como eu começo a pensar?", texto: "Como eu começo a raciocinar nesta questão? Não me diga a resposta." },
    { id: "conceito", rotulo: "Qual o conceito-chave?", texto: "Qual é o conceito-chave que esta questão cobra? Sem dizer a alternativa certa." },
  ];
  if (fase === "depois") return [
    { id: "explica", rotulo: "Explique a questão", texto: "Explique esta questão: por que a alternativa certa está certa e as outras erradas." },
    { id: "errei", rotulo: "Onde eu errei?", texto: "Onde eu errei no meu raciocínio nesta questão?" },
    { id: "resumo", rotulo: "Resumo do tema", texto: "Me dá um resumo curto do tema desta questão para a prova." },
  ];
  if (ctx?.tipo === "aula") return [
    { id: "simples", rotulo: "Explica de um jeito simples", texto: "Explica essa parte da aula de um jeito simples." },
    { id: "prova", rotulo: "Como cai na prova?", texto: "Como esse assunto costuma cair na prova do Revalida?" },
  ];
  return [];
}
