/**
 * CÉREBRO DO TUTOR — a pergunta do aluno vira consulta: termos (palavras de 3 letras ou mais, siglas médicas sempre), a tsquery
 * da busca por palavras (termos por OU e, para palavras vizinhas na pergunta, a frase com <->) e o hash do cache de vetores.
 *
 * Antes (engine.ts sourceQuery) palavras com menos de 5 letras caíam: "asma", "dose", "AVC", "IAM", "HIV", "DPOC" e "gota" sumiam
 * da busca. Aqui o mínimo é 3 letras e as siglas da lista ficam mesmo com 2.
 * Arquivo puro (sem banco nem rede): também vai no pacote da ponte de voz (Cloud Run).
 */
import { createHash } from "node:crypto";

/** Siglas e palavras curtas da medicina que nunca podem cair da consulta. */
export const SIGLAS = new Set([
  "avc", "ait", "iam", "sca", "icc", "ic", "fa", "tep", "tvp", "has", "dm", "dm1", "dm2", "drc", "irc", "ira", "lra", "dpoc", "hiv", "aids",
  "hbv", "hcv", "hpv", "hav", "ist", "dst", "itu", "tb", "ilt", "iltb", "trm", "bcg", "dtp", "vip", "vop", "hpp", "dpp", "rciu", "dheg", "dmg",
  "rn", "rnpt", "pig", "gig", "aig", "apgar", "tc", "rm", "usg", "ecg", "eeg", "pcr", "rcp", "acls", "atls", "pals", "bls", "sara", "sdra",
  "cad", "eha", "ehh", "aas", "ieca", "bra", "bcc", "ains", "ibp", "tsh", "t4", "hb", "ht", "vhs", "inr", "ttpa", "pfc", "ubs", "upa", "sus",
  "samu", "caps", "esf", "nasf", "aps", "ab", "sbv", "sav", "uti", "ctg", "imc", "pa", "fc", "fr", "sat", "spo2", "glasgow", "qsofa",
  "gota", "asma", "lues", "sifilis", "raiva", "ebv", "cmv", "vsr", "covid", "h1n1", "lpv", "mmii", "mmss",
]);

/** Palavras vazias (português corrente e as da conversa com o Tutor). */
const VAZIAS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "da", "do", "das", "dos", "e", "ou", "em", "na", "no", "nas", "nos", "por", "pra", "pro",
  "para", "pela", "pelo", "pelas", "pelos", "com", "sem", "que", "qual", "quais", "quando", "como", "onde", "porque", "por que", "se", "me", "te",
  "lhe", "eu", "voce", "ele", "ela", "nos", "eles", "elas", "meu", "minha", "seu", "sua", "isso", "isto", "esse", "essa", "este", "esta", "aquele",
  "aquela", "ao", "aos", "mais", "menos", "muito", "muita", "pouco", "tem", "ter", "ser", "estar", "esta", "sao", "foi", "era", "fazer", "faz",
  "sobre", "entre", "numa", "num", "the", "and", "of", "ja", "nao", "sim", "mas", "entao", "tipo", "ai", "la", "aqui", "agora", "sempre", "nunca",
  "explica", "explique", "explicar", "fala", "falar", "diz", "dizer", "sabe", "saber", "quero", "queria", "preciso", "pode", "poderia", "duvida",
  "tutor", "professor", "professora", "stazia", "stazi", "paciente", "questao", "questoes", "alternativa", "resposta", "certo", "certa", "errado",
  "errada", "aquilo", "coisa", "coisas", "gente", "favor", "obrigado", "obrigada", "ola", "oi", "bom", "boa", "dia", "tarde", "noite",
  "deve", "devo", "seria", "vai", "vou", "tenho", "temos", "quanto", "quanta", "quantos", "quantas", "qual", "e", "ha", "houver",
  "mudou", "mudaram", "muda", "mudanca", "mudancas", "novidade", "novidades", "atual", "atuais", "hoje", "precisa", "precisam",
  // fala solta da conversa: uma palavra de 5+ letras que não existe no índice conta como assunto que falta (o banco exige o assunto)
  "direitinho", "certinho", "rapidinho", "entendi", "entender", "entendo", "ajuda", "ajudar", "ajude", "lembrar", "lembro", "lembra",
  "esqueci", "esquecer", "estudar", "estudando", "estudei", "importante", "principal", "principais", "exemplo", "exemplos", "resumo",
  "resumir", "resume", "detalhe", "detalhes", "jeito", "forma", "maneira", "pergunta", "perguntar", "responder", "respondi", "acho",
  "achei", "falou", "disse", "dizendo", "falando", "mesmo", "mesma", "outra", "outro", "agora", "depois", "antes", "ainda", "tambem",
  "assim", "nesse", "nessa", "desse", "dessa", "daquele", "daquela", "alguma", "algum", "alguns", "algumas", "porfa", "beleza", "valeu",
]);

/** Prefixos soltos ("pós-parto" vira "pos parto"): sozinhos não dizem nada; só contam dentro da frase com a palavra seguinte. */
const SO_EM_FRASE = new Set(["pos", "pre", "apos", "anti", "sub", "semi", "auto", "intra", "extra", "peri"]);

/** Minúsculas, sem acento, só letras e números separados por espaço. */
export function normalizar(texto: string | null | undefined): string {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Uma palavra conta na consulta? Siglas da lista sempre; senão, 3 letras ou mais e fora das vazias; números só com 2 dígitos ou mais. */
function conta(w: string): boolean {
  if (!w) return false;
  if (SIGLAS.has(w)) return true;
  if (VAZIAS.has(w)) return false;
  if (/^\d+$/.test(w)) return w.length >= 2;
  return w.length >= 3 && !SO_EM_FRASE.has(w);
}

/**
 * Palavras clínicas genéricas ("tratamento", "conduta", "dose", "grave"...): aparecem em quase todo trecho e, soltas na busca por OU,
 * puxavam documento errado ("dose de adrenalina" trazia "dose zero" do calendário de vacinação). Ficam só se a pergunta não tiver
 * outra palavra. A INTENÇÃO não se perde: o banco sobe, entre os trechos do assunto, os que falam de tratamento/dose/conduta ou de
 * diagnóstico/critério (ch_worker_tutor_kb_buscar, v_intencao), sem que a palavra genérica sozinha traga trecho de outro assunto.
 */
const GENERICAS = new Set([
  "tratamento", "tratar", "trata", "conduta", "condutas", "manejo", "manejar", "diagnostico", "diagnosticar", "criterio", "criterios",
  "indicar", "indicacao", "indicado", "classificar", "classificacao", "abordar", "abordagem", "fazer", "usar", "uso", "caso", "casos",
  "adulto", "adultos", "quadro", "pacientes", "doenca", "sinais", "sintomas", "primeira", "linha", "escolha", "melhor",
  "dose", "doses", "grave", "graves", "novo", "nova", "novos", "novas", "diretriz", "diretrizes", "protocolo", "protocolos", "aula", "aulas",
  "atualizacao", "atualizacoes", "recomendacao", "recomendacoes", "orientacao", "candidato", "estacao",
]);

/** Todas as palavras que contam, na ordem, sem repetição (até 12): é a chave do cache do vetor ("conduta" e "diagnóstico" mudam o sentido). */
function todosOsTermos(...textos: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const w of normalizar(textos.filter(Boolean).join(" ")).split(" ")) {
    if (conta(w) && !out.includes(w)) out.push(w);
    if (out.length >= 12) break;
  }
  return out;
}

/** Termos da busca por palavras: os da pergunta sem as genéricas (só ficam se não houver outra palavra). */
export function termosDaConsulta(...textos: (string | null | undefined)[]): string[] {
  const out = todosOsTermos(...textos);
  const especificas = out.filter((w) => !GENERICAS.has(w));
  return especificas.length ? especificas : out;
}

/**
 * tsquery para to_tsquery('portuguese', …): termos por OU e, para cada par de palavras que estavam lado a lado na pergunta,
 * a frase "(a <-> b)" (sobe na ordem quem tem a expressão inteira, ex.: "crise asmatica"). Só [a-z0-9]: nada que quebre a sintaxe.
 */
export function tsqueryDe(...textos: (string | null | undefined)[]): string {
  const palavras = normalizar(textos.filter(Boolean).join(" ")).split(" ").filter(Boolean);
  const termos = termosDaConsulta(...textos);
  if (!termos.length) return "";
  const frases: string[] = [];
  for (let i = 0; i + 1 < palavras.length && frases.length < 3; i++) {
    const a = palavras[i];
    const b = palavras[i + 1];
    const ok = (w: string) => (conta(w) && termos.includes(w)) || SO_EM_FRASE.has(w) || GENERICAS.has(w);
    if (ok(a) && conta(b) && (termos.includes(b) || GENERICAS.has(b)) && a !== b && !(GENERICAS.has(a) && GENERICAS.has(b))) {
      const f = `(${a} <-> ${b})`;
      if (!frases.includes(f)) frases.push(f);
    }
  }
  return [...termos, ...frases].join(" | ");
}

/** Chave do cache dos vetores de pergunta: termos normalizados, na ordem (a mesma pergunta dita de novo cai no mesmo vetor). */
export function chaveDaConsulta(texto: string): string {
  return todosOsTermos(texto).join(" ");
}

export function hashDaConsulta(texto: string): string | null {
  const k = chaveDaConsulta(texto);
  return k ? createHash("sha256").update(`tutor-kb:consulta:v1:${k}`).digest("hex") : null;
}
