/**
 * ABERTURA E PASSAGEM NATURAIS (decisão do dono de 17/10/2026, "Tutor natural, sem textos prontos").
 *
 * O banco continua gravando, na hora, a fala sorteada de tutor_personalities.openings / lines (app_tutor_start e
 * tutor_next_for): ela é a RESERVA. Logo depois, o servidor pede à IA uma fala nova para aquele momento, a partir da ficha do
 * personagem (fichas.ts), do estado da sessão e do contexto (tema, o que o aluno errou da última vez, se voltou depois de dias,
 * horário, nome), confere por software (safety.ts: número sem base, letra da questão aberta, palavrão acima do nível, ataque à
 * pessoa) e contra as últimas falas que o aluno já ouviu desse professor, e troca o texto (ch_worker_tutor_set_opening).
 * IA desligada, fora do ar, lenta (passou do tempo) ou fala barrada duas vezes: a reserva fica, sem erro para o aluno.
 *
 * Sem conteúdo médico: a IA da abertura não recebe enunciado, alternativas nem gabarito, só o tema.
 * Não gasta a cota de interações do aluno (o custo vai para o ai_usage_ledger com interactions = 0).
 */
import { aiAllowed } from "../contentHub/ai/registry";
import type { Schema } from "../contentHub/ai/schema";
import { resolveTutorProvider, type TutorDeps } from "./engine";
import { engineFor, languageIntensity, normalize, profanityForIntensity, stateLayer, usedStarts, type PersonaEngine, type TutorState } from "./emotion";
import { effectiveParams, personalityLayer, profanityLevel, type Personality, type ProfanityLevel, type TutorSettings } from "./personality";
import { NO_EVALUATION, type TutorMode } from "./prompts";
import { safetyCheck, type Violation } from "./safety";
import { deterministicTutor, tutorSettings } from "./settings";
import { protegerFala, violacoesDeSigilo } from "./escudo";
import { achadosDeSigilo, blocoSigilo, nomeSeguro } from "./sigilo";
import { languageViolations } from "./safety";

export const OPENING_VERSION = "1.2.0";
/**
 * Tempo máximo esperando a IA quando a troca acontece por trás (a tela já mostra a reserva e troca quando a fala chega: /opening do
 * NexusScreen ao passar de questão). Passou disso, a reserva fica.
 */
export const OPENING_TIMEOUT_MS = 6000; // bancada de 17/10: com 4,5 s, 9 de ~40 aberturas ficaram na reserva por tempo
/**
 * Tempo máximo quando a tela ou a voz ESPERAM a fala para seguir (abertura da Nexus, "próxima" na voz do professor e no GPT-Live).
 * Revisão de 17/10: a espera de 6 s deixava a voz calada depois de "próxima". A passagem já sai pronta (preparada logo depois da
 * resposta), então quase nunca espera; a abertura espera no máximo isto e, depois, fica a reserva.
 */
export const OPENING_WAIT_MS = 2000;
/** Tempo da passagem preparada (roda junto com a reação à resposta, ninguém espera por ela). */
export const PREP_TIMEOUT_MS = 6000;
const MAX_CHARS = 280;

export type OpeningKind = "abertura" | "passagem";

export interface OpeningState {
  message: { id: number; content: string; kind: OpeningKind } | null;
  session?: {
    mode: TutorMode; topic: string | null; title: string | null; context_type: string | null; context_label: string | null; area: string | null;
    question_state: string; personality_id: string; session_mood: string | null; discuss_letter: string | null; previous_correct: boolean | null;
  };
  recent?: string[];
  previous_session?: { days: number; topic: string | null } | null;
  local_hour?: number;
  /** passagem já preparada logo depois da resposta (tutor_natural_prep): entra na hora, sem chamar a IA */
  prepared?: string | null;
  /** preparação: a questão respondida a que a passagem se refere */
  question_id?: string;
}

interface OpeningContext {
  consent_pending?: boolean;
  config: { max_profanity: ProfanityLevel };
  session: { read_only?: boolean; settings: TutorSettings; emotion: (Partial<TutorState> & Record<string, unknown>) | null };
  personality: Personality & { engine?: Partial<PersonaEngine> | null };
  memory: { recent_errors?: { error_type: string; knowledge_gap: string | null; theme: string | null; resolved: boolean }[]; weak_subareas?: { subarea: string }[] } | null;
  student: { first_name: string | null; days_to_exam: number | null } | null;
  question: { official_answer: string; options: { id: string; text: string }[]; topic: string; area: string } | null;
  history?: { role: "student" | "tutor"; content: string }[];
}

export const OPENING_SCHEMA: Schema = {
  type: "object",
  additionalProperties: false,
  required: ["fala"],
  properties: { fala: { type: "string", minLength: 1, maxLength: 400 } },
};

const fold = (t: string) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const startOf = (t: string, n = 3) => fold(t).split(" ").slice(0, n).join(" ");
/** Palavras que toda fala tem (não dizem se uma fala copia a outra). */
const COMMON = new Set(("voce voces vamos vamo por para pra pro com que uma umas uns hoje aqui isso esse essa este esta mais como onde quer ser ter tem sem dos das nos nas " +
  "mas sim nao ate bem ja vai vou sua seu teu tua meu minha gente agora entao tambem quando qual quais muito pouco").split(" "));
const words = (t: string, ignore: ReadonlySet<string> = new Set()) => new Set(fold(t).split(" ").filter((w) => w.length >= 3 && !COMMON.has(w) && !ignore.has(w)));
/**
 * Parecida demais: mais de 60% das palavras que contam em comum (com poucas palavras, as mesmas palavras). `ignore`: o tema, que
 * toda fala sobre ele repete por força.
 */
export function tooSimilar(a: string, b: string, ignore: string | null = null): boolean {
  const skip = new Set(ignore ? fold(ignore).split(" ") : []);
  const A = words(a, skip), B = words(b, skip);
  if (!A.size || !B.size) return fold(a) === fold(b);
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  if (Math.min(A.size, B.size) < 3) return common === A.size && common === B.size;
  return common / Math.min(A.size, B.size) > 0.6;
}

/**
 * Por onde começar desta vez (descrição, não frase): sorteado por fala. Sem isto, alunos diferentes ouviam a mesma entrada do mesmo
 * personagem (a memória das últimas falas é por aluno; a bancada de 17/10 mostrou a mesma abertura em 3 de 7 alunos novos).
 */
export const ANGULOS_ABERTURA = [
  "comece reagindo ao período do dia (sem cumprimento de atendente)",
  "comece direto pelo tema, com uma provocação ou curiosidade sobre ele, sem fato médico",
  "comece pelo aluno: o que você sabe dele (a volta depois de dias, o que errou da última vez, o nome); sem nada disso, pergunte como ele chega hoje",
  "comece pelo seu humor do dia, do seu jeito",
  "comece com uma pergunta curta e já cobre a ação",
  "comece com uma imagem do dia a dia (plantão, prova, jogo, trânsito), sem conteúdo médico",
  "comece lançando um desafio ou uma meta para esta conversa",
  "comece com duas ou três palavras soltas e depois chame para agir",
];
export const ANGULOS_PASSAGEM = [
  "comece comentando como foi a questão anterior, em poucas palavras",
  "comece lançando o desafio da próxima",
  "comece pelo ritmo da sessão até aqui",
  "comece com uma pergunta curta que já põe o aluno na questão nova",
  "comece pelo seu humor agora, do seu jeito",
];
/** Entradas batidas que a bancada achou em várias conversas: não servem de começo. */
export const ENTRADAS_BATIDAS = ["chegou", "chegou a hora", "bora", "fala", "senta aí", "na mesa", "desembucha", "olha quem"];
export function anguloDe(seed: string, kind: OpeningKind): string {
  const list = kind === "passagem" ? ANGULOS_PASSAGEM : ANGULOS_ABERTURA;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return list[(h >>> 0) % list.length];
}

const period = (h: number) => (h < 5 ? "madrugada" : h < 12 ? "manhã" : h < 18 ? "tarde" : "noite");

/** Em que situação a fala entra (só o tipo; a fala é da IA). */
export function situationOf(st: OpeningState): string {
  const s = st.session!;
  if (st.message!.kind === "passagem") return "passagem para a próxima questão (a questão nova já está na tela, aberta)";
  if (s.question_state === "answered") return "conversa sobre uma questão que o aluno já respondeu: quer saber o porquê da escolha dele";
  if (s.mode === "erros") return "revisão de uma questão que o aluno já errou antes (ela está na tela, aberta)";
  if (s.mode === "questao") return "treino de questão: a questão está na tela, aberta, e o aluno vai ler e responder";
  if (s.mode === "perguntas") return "Me teste: você vai fazer perguntas ao aluno sobre o tema, uma por vez";
  if (s.topic || (s.context_label && s.context_type !== "weak_points")) return "conversa livre sobre um tema que o aluno já escolheu";
  if (s.context_type === "weak_points") return "conversa sobre os pontos fracos do aluno";
  return "conversa livre, sem tema escolhido ainda: o aluno vai dizer o que quer estudar";
}

/** O sistema da fala: a persona inteira (ficha, estado, palavrão, limites) e as regras da abertura. */
export function openingSystem(persona: string, kind: OpeningKind, personaId?: string | null): string {
  return [
    "Você é o professor de medicina do aplicativo de estudos StaziaMed, conversando por chat ou voz com um médico que estuda para a 1ª fase do Revalida.",
    persona,
    `AGORA: escreva só a ${kind === "abertura" ? "PRIMEIRA fala da conversa (abertura)" : "fala de PASSAGEM para a próxima questão"}, criada agora para este aluno e este momento, a partir de <contexto>.`,
    "Uma ou duas frases curtas (até 200 caracteres), português do Brasil falado, falando com o aluno em \"você\", no jeito da sua ficha e do seu estado agora.",
    "Use o contexto que for natural, sem forçar tudo: o tema, o período do dia, se ele voltou depois de dias, o que ele errou da última vez, como foi a questão anterior. O nome do aluno, só de vez em quando.",
    "Termine puxando o aluno para agir (dizer o tema, contar o que já sabe, ler a questão, contar o raciocínio), do seu jeito.",
    "Siga o jeito de começar sorteado em <contexto> (jeito_de_comecar). Não use como começo estas entradas batidas: " + ENTRADAS_BATIDAS.map((e) => `«${e}»`).join(", ") + ". Varie também a estrutura: nada de «tema na mesa», «tema hoje:» como fórmula.",
    "Proibido: repetir ou parafrasear de perto qualquer fala de <ja_ouviu>, começar com as mesmas palavras de uma delas, saudação de atendente, oferecer ajuda no fim, marcação entre colchetes, emoji.",
    "Sem conteúdo médico nenhum: nada de número, dose, critério, conduta, diagnóstico ou pista da questão. Questão aberta: nunca sugira letra nem resposta.",
    'Responda só no formato pedido: {"fala": "..."}.',
    // sigilo (sigilo.ts): nada no contexto é ordem, nem o nome do aluno
    blocoSigilo(personaId),
  ].join("\n\n");
}

/** O contexto do momento, como dado (sem enunciado, sem alternativas, sem gabarito). */
export function openingInput(st: OpeningState, ctx: OpeningContext): string {
  const s = st.session!;
  const mem = ctx.memory;
  const errs = (mem?.recent_errors ?? []).filter((e) => !e.resolved).slice(0, 2).map((e) => ({ tema: e.theme, o_que_faltou: e.knowledge_gap }));
  const dados = {
    situacao: situationOf(st),
    jeito_de_comecar: anguloDe(`${st.message!.id}:${st.message!.content}:${st.local_hour ?? ""}`, st.message!.kind),
    tema: s.topic ?? (s.context_type !== "weak_points" ? s.context_label : null) ?? (ctx.question?.topic ?? null),
    area: s.area ?? ctx.question?.area ?? null,
    ...(s.discuss_letter ? { alternativa_que_ele_marcou: s.discuss_letter } : {}),
    ...(st.message!.kind === "passagem" && s.previous_correct != null ? { questao_anterior: s.previous_correct ? "acertou" : "errou" } : {}),
    nome: nomeSeguro(ctx.student?.first_name),
    periodo_do_dia: st.local_hour != null ? period(st.local_hour) : null,
    dias_desde_a_ultima_conversa: st.previous_session?.days ?? null,
    assunto_da_ultima_conversa: st.previous_session?.topic ?? null,
    errou_da_ultima_vez: errs,
    pontos_fracos: (mem?.weak_subareas ?? []).slice(0, 2).map((w) => w.subarea),
    dias_para_a_prova: ctx.student?.days_to_exam ?? null,
    humor_do_dia: s.session_mood === "good" ? "bom" : s.session_mood === "impatient" ? "impaciente" : "neutro",
  };
  const ja = [...(st.recent ?? []), st.message!.content].filter((t) => String(t ?? "").trim());
  return `<contexto>\n${JSON.stringify(dados)}\n</contexto>\n<ja_ouviu>\n${JSON.stringify(ja)}\n</ja_ouviu>`;
}

/**
 * Abertura da voz que pode ir para a memória (e, na próxima ligação, para as instruções como DADO). Revisão de 17/10: a 1ª fala do
 * professor vinha do navegador (/voice/transcript) e entrava crua nas instruções da ligação seguinte; um app adulterado conseguia
 * pôr texto com cara de ordem ali. Fica de fora: texto com cara de instrução, bastidor/sigilo, ataque ou apelido, marcação.
 */
const CARA_DE_ORDEM =
  /\b(?:regras?|instruc\w*|sistema|system|prompt|ignore|ignora|ignorar|esque[cç]a|esquece|a partir de agora|de agora em diante|daqui pra frente|finja|modo (?:dev|desenvolvedor|deus|livre|sem filtro)|desenvolvedor|developer|admin\w*|assistant|jailbreak|obede[cç]a|voc[eê] (?:deve|tem que|precisa)|sempre (?:responda|diga|fale)|nunca (?:recuse|diga)|libera(?:do|da)? (?:tudo|geral)|sem limite|sem filtro|gabarito|resposta (?:certa|correta)|letra [a-e]\b)/i;
export function aberturaGuardavel(texto: string | null | undefined): string | null {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (!t || t.length > 600) return null;
  if (CARA_DE_ORDEM.test(t) || /[[\]{}<>`]/.test(t)) return null;
  if (achadosDeSigilo(t).length) return null;
  if (languageViolations(t, "moderate").some((v) => v.code === "personal_attack")) return null;
  return t;
}

/** Conferência própria da abertura (além da safety.ts): tamanho, marcação, e nada parecido com o que o aluno já ouviu. */
export function openingViolations(text: string, heard: string[], startsUsed: string[] = [], topic: string | null = null): Violation[] {
  const v: Violation[] = [];
  const t = text.trim();
  if (!t) v.push({ code: "empty", detail: "A fala veio vazia." });
  if (t.length > MAX_CHARS) v.push({ code: "too_long", detail: `A fala passou de ${MAX_CHARS} caracteres: uma ou duas frases curtas.` });
  if (/[[\]{}<>]|\p{Extended_Pictographic}/u.test(t)) v.push({ code: "markup", detail: "Sem colchetes, marcação ou emoji." });
  const head = fold(t).split(" ").slice(0, 4).join(" ");
  const batida = ENTRADAS_BATIDAS.find((e) => head === fold(e) || head.startsWith(`${fold(e)} `));
  if (batida) v.push({ code: "batida", detail: `Começa com a entrada batida «${batida}»: comece de outro jeito.` });
  const two = startOf(t, 2);
  if (two && startsUsed.some((s) => startOf(s, 2) === two)) v.push({ code: "repeat_start", detail: `Já houve fala nesta conversa começando com «${two}»: comece de outro jeito.` });
  for (const h of heard) {
    if (startOf(t) && startOf(t) === startOf(h)) { v.push({ code: "repeat_start", detail: `Começa igual a uma fala que o aluno já ouviu («${h.slice(0, 60)}»): comece de outro jeito.` }); break; }
    if (tooSimilar(t, h, topic)) { v.push({ code: "repeat", detail: `Parecida demais com uma fala que o aluno já ouviu («${h.slice(0, 60)}»): diga outra coisa.` }); break; }
  }
  return v;
}

interface Uso { calls: number; input_tokens: number; output_tokens: number; cost_usd: number; provider: string; model: string }
interface Gerada { text: string | null; violations: Violation[]; usage: Uso; system: string }

const desligada = () =>
  /^(false|0|off|no)$/i.test((process.env.TUTOR_ENABLED ?? "").trim()) || /^(false|0|off|no)$/i.test((process.env.TUTOR_ABERTURA_IA ?? "").trim()) ||
  // modo determinístico (testes automatizados e conferências reproduzíveis): fica a reserva sorteada pelo banco
  deterministicTutor();

/** As falas que contam como "já ouvida" (a memória do aluno e a reserva, que não pode ser copiada). */
const ouvidas = (st: OpeningState) => [...(st.recent ?? []), ...(st.message?.content ? [st.message.content] : [])];

/** Começos já usados na conversa (passagem): a nova não começa como nenhuma fala do professor. */
const comecosDaConversa = (st: OpeningState, ctx: OpeningContext) =>
  st.message!.kind === "passagem" ? usedStarts((ctx.history ?? []).filter((h) => h.role === "tutor" && h.content !== st.message!.content).map((h) => h.content)) : [];

/** Pede a fala à IA e confere (até 2 tentativas dentro de `timeoutMs`, contado de `t0`). Nunca lança. Sem provedor: null. */
async function gerarFala(deps: TutorDeps, sessionId: string, st: OpeningState, ctx: OpeningContext, timeoutMs: number, t0: number): Promise<Gerada | null> {
  const { provider } = resolveTutorProvider(deps.mockRespond);
  if (!provider) return null;
  const settings = await tutorSettings(deps);

  // o mesmo professor e o mesmo estado do turno de texto (engine.ts): ficha, humor, teto de palavrão
  const engine = engineFor(ctx.personality.id, ctx.personality.engine, settings.durona_level);
  const state = normalize(ctx.session.emotion, engine);
  const prefs = ctx.session.settings;
  const personaMax = profanityLevel(ctx.personality.params, prefs.profanity ?? "off", ctx.config.max_profanity);
  const li = languageIntensity(state, engine);
  const RANK = { off: 0, mild: 1, moderate: 2 } as const;
  const byIntensity = profanityForIntensity(li);
  const profanity = RANK[byIntensity] < RANK[personaMax] ? byIntensity : personaMax;
  const checkLevel = RANK[profanityForIntensity(Math.min(5, li + 1))] < RANK[personaMax] ? profanityForIntensity(Math.min(5, li + 1)) : personaMax;
  const mood = { label: state.mood, text: stateLayer(ctx.personality.id, state, engine, profanity), swearing: "conforme a INTENSIDADE DE LINGUAGEM do estado", strong: li >= 3 };
  const persona = personalityLayer(ctx.personality, effectiveParams(ctx.personality.params, 3, prefs), profanity, 3, null, mood, { seed: sessionId, limites: { palavrao: personaMax, gritos: true } });
  const kind = st.message!.kind;
  const system = openingSystem(persona, kind, ctx.personality.id);
  const baseInput = openingInput(st, ctx);
  const heard = ouvidas(st);
  const starts = comecosDaConversa(st, ctx);
  const q = ctx.question;
  const open = st.session!.question_state === "open";
  const safetyCtx = {
    blocks: [], conversationTexts: [], hintLevel: null, hasUpdateCard: false, profanity: checkLevel,
    question: q ? { open, officialLetter: q.official_answer, officialText: q.options.find((o) => o.id === q.official_answer)?.text ?? null } : null,
  };

  const usage: Uso = { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, provider: provider.name, model: provider.model };
  let violations: Violation[] = [];
  let text: string | null = null;
  for (let attempt = 0; attempt < 2 && !text; attempt++) {
    const left = timeoutMs - (Date.now() - t0);
    if (left < 600) break;
    const input = attempt === 0 ? baseInput : `${baseInput}\n<correcao_obrigatoria>\nSua fala anterior foi barrada. Faça outra sem estes problemas:\n${violations.map((x) => `- ${x.detail}`).join("\n")}\n</correcao_obrigatoria>`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), left);
    try {
      const r = await provider.generate<{ fala: string }>({
        promptId: "tutor_abertura", promptVersion: OPENING_VERSION, system, input, schema: OPENING_SCHEMA, schemaName: "staziamed_tutor_abertura",
        maxOutputTokens: 300, effort: "low", care: "rapido", signal: ac.signal,
      });
      usage.calls++;
      usage.input_tokens += r.inputTokens ?? 0;
      usage.output_tokens += r.outputTokens ?? 0;
      usage.cost_usd += r.costUsd ?? 0;
      usage.provider = r.provider;
      usage.model = r.model;
      const fala = String(r.output?.fala ?? "").replace(/\s+/g, " ").trim();
      const out = { reply: fala, grounding: "GENERAL" as const, citations: [], evaluation: NO_EVALUATION, justification: "NONE" as const, reveals_answer: false, suggested_replies: [] };
      violations = [...openingViolations(fala, heard, starts, st.session!.topic ?? st.session!.context_label ?? ctx.question?.topic ?? null), ...safetyCheck(out, safetyCtx).violations,
        ...violacoesDeSigilo(out, { instrucoes: system })];
      // última palavra do sigilo (escudo.ts) antes de o aluno ver
      if (!violations.length) text = protegerFala(fala, ctx.personality.id, { instrucoes: system }).texto;
    } catch (error) {
      usage.calls++;
      deps.log?.(`[tutor] abertura natural: ${(error as Error).message.slice(0, 160)}`);
      violations = [{ code: "provider", detail: "A fala anterior não veio no formato pedido." }];
    } finally {
      clearTimeout(timer);
    }
  }
  return { text, violations, usage, system };
}

/** O estado da fala e o contexto do aluno, ou null quando não há o que trocar (sem fala, aceite pendente, conversa só de leitura). */
async function lerEstado(deps: TutorDeps, userId: string, sessionId: string, fn: "ch_worker_tutor_opening_state" | "ch_worker_tutor_passage_prep_state") {
  const st = await deps.db.service<OpeningState | null>(fn, { p_user: userId, p_session_id: sessionId });
  if (!st?.message || !st.session) return null;
  const ctx = await deps.db.service<OpeningContext | null>("ch_worker_tutor_context", { p_user: userId, p_session_id: sessionId });
  if (!ctx || ctx.consent_pending || ctx.session.read_only) return null;
  return { st, ctx };
}

/**
 * Troca a reserva pela fala da IA. Devolve a fala nova ({ id, content }) ou null quando a reserva fica (nada a trocar, IA
 * indisponível, tempo esgotado, fala barrada, outro pedido já ficou com ela, limite do aluno). Nunca lança: a abertura de reserva já
 * está gravada e a conversa segue.
 *
 * Revisão de 17/10: (1) a fala é RESERVADA no banco antes de chamar a IA (ch_worker_tutor_claim_opening, com o limite de frequência
 * 'tutor_opening'): pedidos juntos para a mesma conversa chamam a IA uma vez só; (2) a passagem preparada logo depois da resposta
 * (prepararPassagem) entra na hora, sem IA; (3) quem espera pela fala (tela parada, voz calada) passa `OPENING_WAIT_MS`.
 */
export async function naturalOpening(deps: TutorDeps, userId: string, sessionId: string, timeoutMs = OPENING_TIMEOUT_MS): Promise<{ id: number; content: string } | null> {
  const t0 = Date.now();
  try {
    if (desligada()) return null;
    const lido = await lerEstado(deps, userId, sessionId, "ch_worker_tutor_opening_state");
    if (!lido) return null;
    const { st, ctx } = lido;
    const msg = st.message!;
    const claim = async () => {
      const c = await deps.db.service<{ ok: boolean; motivo?: string } | null>("ch_worker_tutor_claim_opening", { p_user: userId, p_session_id: sessionId, p_message_id: msg.id });
      return Boolean(c?.ok);
    };
    const salvar = async (text: string | null, usage: Uso | { calls: 0 }, extra: Record<string, unknown>) => {
      const saved = await deps.db.service<{ ok: boolean; id: number | null; content: string | null }>("ch_worker_tutor_set_opening", {
        p_user: userId, p_session_id: sessionId, p_message_id: msg.id, p_text: text,
        p_meta: { prompt_version: OPENING_VERSION, ms: Date.now() - t0, ...extra }, p_usage: usage,
      });
      return saved?.ok && saved.id != null && saved.content ? { id: saved.id, content: saved.content } : null;
    };

    // passagem preparada logo depois da resposta: confere de novo contra o que o aluno já ouviu e entra sem IA
    const pronta = msg.kind === "passagem" ? String(st.prepared ?? "").trim() : "";
    if (pronta && !openingViolations(pronta, ouvidas(st), comecosDaConversa(st, ctx)).length) {
      if (!(await claim())) return null;
      return await salvar(pronta, { calls: 0 }, { origem: "preparada" });
    }

    if (!(await aiAllowed(deps.db)).ok) return null;
    if (!resolveTutorProvider(deps.mockRespond).provider) return null;
    // reserva atômica (e limite de frequência) antes de qualquer custo
    if (!(await claim())) return null;
    const g = await gerarFala(deps, sessionId, st, ctx, timeoutMs, t0);
    if (!g) return await salvar(null, { calls: 0 }, {});
    if (!g.text && g.violations.length) deps.log?.(`[tutor] abertura natural barrada (${g.violations.map((v) => v.code).join(", ")}): fica a reserva`);
    return await salvar(g.text, g.usage, { model: g.usage.model, provider: g.usage.provider, origem: "na_hora" });
  } catch (error) {
    deps.log?.(`[tutor] abertura natural falhou: ${(error as Error).message.slice(0, 160)}`);
    return null;
  }
}

/**
 * Passagem PREPARADA (revisão de 17/10): logo depois de o aluno responder (na reação, engine.ts), pede à IA a fala de passagem para a
 * próxima questão e guarda pronta (tutor_natural_prep). Quando ele pedir a próxima, naturalOpening usa a pronta na hora. Uma por
 * questão respondida, dentro do limite 'tutor_opening'. Nunca lança; devolve se ficou pronta.
 */
export async function prepararPassagem(deps: TutorDeps, userId: string, sessionId: string, timeoutMs = PREP_TIMEOUT_MS): Promise<boolean> {
  const t0 = Date.now();
  try {
    if (desligada()) return false;
    // TUTOR_PASSAGEM_PREPARADA=0 desliga; com a IA simulada (testes), só liga com =1 (a sequência de pedidos dos testes não muda)
    const env = (process.env.TUTOR_PASSAGEM_PREPARADA ?? "").trim();
    if (/^(false|0|off|no)$/i.test(env)) return false;
    if (!(await aiAllowed(deps.db)).ok) return false;
    const { provider } = resolveTutorProvider(deps.mockRespond);
    if (!provider || (provider.isMock && !/^(1|true|on|yes)$/i.test(env))) return false;
    const lido = await lerEstado(deps, userId, sessionId, "ch_worker_tutor_passage_prep_state");
    if (!lido?.st.question_id) return false;
    const g = await gerarFala(deps, sessionId, lido.st, lido.ctx, timeoutMs, t0);
    const ok = await deps.db.service<boolean | null>("ch_worker_tutor_passage_prep_save", {
      p_user: userId, p_session_id: sessionId, p_question_id: lido.st.question_id, p_text: g?.text ?? null, p_usage: g?.usage ?? { calls: 0 },
    });
    return Boolean(ok);
  } catch (error) {
    deps.log?.(`[tutor] passagem preparada falhou: ${(error as Error).message.slice(0, 160)}`);
    return false;
  }
}
