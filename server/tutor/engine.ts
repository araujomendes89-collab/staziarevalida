/**
 * Motor de turno do Stazia Tutor. Para cada fala do aluno:
 *
 *   1. confere se pode responder (ligado, plano, limite do dia, IA liberada);
 *   2. recupera o contexto (aluno, conversa, questão) e a base conferida (questão oficial, análise revisada, fontes oficiais);
 *   3. monta as camadas: NÚCLEO → MODO → (VOZ) → PERSONALIDADE, e os dados: base, aluno, conversa, fala, tarefa;
 *   4. gera a resposta estruturada;
 *   5. VALIDA por software (safety.ts); barrada, tenta mais uma vez com a correção; barrada de novo, entrega a resposta fixa;
 *   6. grava a troca e o uso do dia.
 *
 * A personalidade só entra na etapa 3 e nunca passa pela etapa 5 com conteúdo inválido.
 *
 * Voz com GPT-Live: o mesmo turno responde ao que o GPT-Live delega (action.voiceCallId). Muda só a conta: não gasta interação
 * de texto (a voz é cobrada por tempo), o custo entra como "tutor_voice_backend" e a resposta já sai conferida para ser dita.
 */
import { asDocument } from "../contentHub/ai/prompts";
import { AiInvalidOutput, resolveProviderKind, withFallback, type StructuredRequest } from "../contentHub/ai/provider";
import { aiAllowed, registerPrompts, type PromptEntry } from "../contentHub/ai/registry";
import type { ContentDb } from "../contentHub/infra";
import { avatarOf, engineFor, languageIntensity, leituraDoRegistro, normalize, profanityForIntensity, recentExpressions, stateLayer, step, usedStarts, type Happening, type PersonaEngine, type TutorState } from "./emotion";
import { effectiveParams, personalityLayer, profanityLevel, type Personality, type ProfanityLevel, type TutorSettings } from "./personality";
import { NO_EVALUATION, TUTOR_PROMPT_LAYERS, TUTOR_SCHEMA, TUTOR_VERSION, composeSystem, taskInstruction, type TutorMode, type TutorOutput, type TutorTask } from "./prompts";
import { ComplementarTermsUnavailable, labelIsSupportMaterial, loadComplementarTerms } from "../contentHub/complementarGuard";
import { fallbackReply, pedeCaso, safetyCheck, spokenText, type BaseBlock, type SafetyResult, type Violation } from "./safety";
import { protegerFala, sugestoesSemSigilo, violacoesDeSigilo } from "./escudo";
import { lerRegistro, notaDoRegistro, palavraoContido } from "./leituraDoAluno";
import { nomeSeguro } from "./sigilo";
import { deterministicTutor, tutorSettings } from "./settings";
import { buscarOuReserva, vetorEmParalelo } from "./conhecimento/buscar";
import { prepararPassagem } from "./opening";

/** Quanto a reação à resposta ainda espera a passagem preparada terminar (ela roda junto; quase sempre já terminou). */
const PREP_EXTRA_WAIT_MS = 1000;

export interface TutorDeps {
  db: ContentDb;
  mockRespond?: (req: StructuredRequest) => unknown;
  log?: (m: string) => void;
  /** Voz natural: nos testes, um provedor fixo (ou null = desligada); fora deles, vem do .env (speech.ts). */
  speech?: import("./speech").SpeechProvider | null;
  /** Ambiente da voz do professor (ElevenLabs): nos testes, um ambiente falso; fora deles, process.env. */
  elevenEnv?: NodeJS.ProcessEnv;
  /** Depósito das amostras aprovadas das vozes (tutor-voice-samples): o "Ouvir" do aluno toca daqui. */
  storage?: import("../contentHub/infra").Storage;
  /** Transcrição da Nexus: nos testes, configuração simulada; fora deles, .env (stt.ts). */
  stt?: import("./stt").SttConfig;
  /** Voz em tempo real: nos testes, configuração e fetch simulados; fora deles, .env e fetch de verdade (realtime.ts). */
  realtime?: import("./realtime").RealtimeConfig;
  /** GPT-Live: nos testes, configuração simulada; fora deles, .env (voiceProviders.ts). */
  live?: import("./voiceProviders").LiveConfig;
  /** Voz nativa do Gemini: nos testes, configuração e cliente simulados; fora deles, .env e o Google (voiceProviders.ts). */
  gemini?: import("./voiceProviders").GeminiVoiceConfig;
  geminiClient?: import("./voiceProviders").GeminiTokenRequest["client"];
  fetch?: typeof fetch;
}

export interface TutorAction {
  type: "message" | "hint" | "react" | "reveal";
  text?: string;
  voice?: boolean;
  interrupted?: string | null;
  /** Turno pedido pela voz (GPT-Live delegou): a ligação já foi conferida pelo servidor; não usa a cota de texto. */
  voiceCallId?: string | null;
  /** Gasta 1 interação de texto mesmo vindo pela voz (turno da Nexus pela voz do professor). Padrão: só fora da voz. */
  chargeText?: boolean;
}

/** Erro que o aluno pode ler (com o código HTTP certo). */
export class TutorError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Aluno sem o aceite dos Tutores de IA (§34 do Termo vigente). A frase é a mesma com que o banco recusa (42501). O 403 leva o código
 * `tutor_consent`: o aplicativo mostra o cartão do aceite, nunca o aviso de plano pago.
 */
export const TUTOR_CONSENT_PENDING = "Aceite do Tutor pendente.";
/** Conversa antiga só para leitura (professor trocado ou desligado): o turno e a voz recusam com 409. */
export const PROFESSOR_CHANGED = "Este professor mudou. Comece uma conversa nova.";
export function consentError(): TutorError & { code: "tutor_consent" } {
  return Object.assign(new TutorError(TUTOR_CONSENT_PENDING, 403), { code: "tutor_consent" as const });
}

export interface Entitlement {
  enabled: boolean;
  mode: "paid" | "trial" | "blocked";
  text: { used: number; limit: number; remaining: number };
  can_use: boolean;
  can_text: boolean;
  block_reason: string | null;
  /** Bloqueado porque a conta não tem plano pago nem teste grátis valendo e nunca começou o teste do Tutor (PL02, …9730). */
  plan_locked?: boolean;
}

interface Memory {
  profile?: { strongest_topics: string[]; weak_topics: string[]; careless_error_rate: number | null; average_response_s: number | null; preferred_personality: string | null; reasoning_quality: number | null };
  inside_jokes?: { topic: string; strength: number; beaten: boolean }[];
  improvements?: { topic: string; errors_before: number; correct_recent: number }[];
  areas: { area: string; level: string; accuracy: number | null }[];
  weak_subareas: { area: string; subarea: string; accuracy: number }[];
  recurrent_errors: { error_type: string; knowledge_gap: string | null; times: number }[];
  recent_errors: { error_type: string; knowledge_gap: string | null; theme: string | null; question_id: string | null; resolved: boolean }[];
}

interface PlayContext {
  rank: number | null; percentile: number | null; league: string | null; weekly_xp: number; stazia_score: number | null;
  questions: number; accuracy: number; streak: number; weakest_area: string | null; missions_pending: number;
}

interface Context {
  /** O banco diz que o aluno ainda não aceitou os Tutores de IA (equipe e revisor médico nunca ficam pendentes). */
  consent_pending?: boolean;
  config: { enabled: boolean; requires_pro: boolean; daily_limit: number; max_profanity: ProfanityLevel };
  entitlement: Entitlement;
  session: {
    id: string; mode: TutorMode; topic: string | null; title: string; status: string; question_state: string; hint_level: number; intensity: number;
    settings: TutorSettings & { params?: unknown; area?: string | null }; difficulty_level: number; streak_wrong: number; emotion: (Partial<TutorState> & Record<string, unknown>) | null;
    context: { type: string | null; id: string | null; label: string | null };
    /** Conversa marcada na troca dos professores ou de professor desligado: só leitura. */
    read_only?: boolean;
  };
  personality: Personality & { engine?: Partial<PersonaEngine> | null };
  memory: Memory | null;
  session_errors: { error_type: string; question_id: string | null; knowledge_gap?: string | null; theme?: string | null }[];
  student: { first_name: string | null; phase: number; days_to_exam: number | null } | null;
  mastery: { areas: { area: string; level: string; accuracy: number | null }[] };
  recent_results: boolean[];
  history: { role: "student" | "tutor"; content: string }[];
  question: {
    id: string; area: string; topic: string; subtopic: string | null; statement: string; exam: string | null; number: number;
    options: { id: string; text: string; explanation: string | null }[];
    official_answer: string; expected_conduct: string | null; inep_intent: string | null; sources?: unknown;
    last_answer: { selected: string; is_correct: boolean; confidence: number | null; lucky_guess: boolean; heavy_hints: boolean; hints_used: number; justification: string | null; response_ms?: number | null; first_pick?: string | null } | null;
    practice_answer?: { selected: string; is_correct: boolean } | null;
    analysis: { question_core: string; trap: string | null; golden_rule: string | null; options: { option_id: string; reasoning: string; why_wrong: string | null; trap: string | null }[] | null } | null;
    update_card: { official_answer: string; current_answer: string | null; what_changed: string; effective_date: string | null; sources: unknown } | null;
  } | null;
}

export interface Passage {
  source: string; organ: string; version: string | null; page: number | null; section: string | null; text: string;
  /** cérebro do Tutor: citação pronta (título, ano, seção, página) */
  citacao?: string;
}

/**
 * Provedor do Tutor. O consentimento para enviar a fala do aluno ao provedor de IA é próprio do Tutor (TUTOR_AI_ALLOW_EXTERNAL=1):
 * ligar o Tutor não autoriza, de carona, o envio de documentos da Central de Conteúdo, e vice-versa.
 */
export function resolveTutorProvider(mockRespond?: (req: StructuredRequest) => unknown) {
  const env = process.env;
  const opts = {
    allowExternal: env.TUTOR_AI_ALLOW_EXTERNAL === "1",
    allowHint: "Envio da fala do aluno ao provedor de IA não autorizado: defina TUTOR_AI_ALLOW_EXTERNAL=1 no servidor depois de aprovar o uso.",
  };
  return withFallback(resolveProviderKind((env.TUTOR_AI_PROVIDER || "anthropic").trim(), mockRespond, env.TUTOR_MODEL, opts), mockRespond, undefined, opts);
}

/** Conversa pede resposta rápida: o Tutor usa esforço baixo (TUTOR_ANTHROPIC_EFFORT muda). A validação por software continua igual. */
const EFFORT = (["low", "medium", "high"].includes(process.env.TUTOR_ANTHROPIC_EFFORT ?? "") ? process.env.TUTOR_ANTHROPIC_EFFORT : "low") as "low" | "medium" | "high";

/** Gerador simples com semente (mulberry32): a variação humana do humor é reprodutível em teste. */
export function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    let x = h;
    return () => {
      x = (x + 0x6d2b79f5) | 0;
      let t = Math.imul(x ^ (x >>> 15), 1 | x);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
}

const STATE_PT: Record<string, string> = { open: "aberta", answered: "respondida", revealed: "revelada", none: "sem questão" };

export const TRIAL_OVER = "Seu teste grátis do Tutor terminou. O Tutor continua nos planos pagos.";
/** Conta sem plano pago e sem teste grátis valendo (PL02): o Tutor faz parte dos planos pagos; questões e flashcards seguem abertos. */
export const PLAN_LOCKED = "Seu teste grátis terminou. O Tutor faz parte dos planos pagos; as questões e os flashcards continuam abertos. Para pedir acesso ou tirar dúvidas, fale com o suporte (veja o e-mail em Conta, Ajuda e suporte).";
/** Aviso de Tutor bloqueado: o da conta sem teste (PL02) quando o banco avisa `plan_locked`, senão o do fim do teste do Tutor. */
export const trialOverMessage = (e?: { plan_locked?: boolean } | null) => (e?.plan_locked ? PLAN_LOCKED : TRIAL_OVER);
export const textLimitMessage = (e: Pick<Entitlement, "mode" | "text">) =>
  `Você chegou ao limite de ${e.text.limit} interações de hoje${e.mode === "trial" ? " no teste grátis" : ""}. Amanhã tem mais.`;

/** Blocos da base conferida. O gabarito e as explicações só entram quando a questão já foi respondida ou quando a tarefa é uma dica. */
export function buildBlocks(ctx: Context, passages: Passage[], includeAnswer: boolean): BaseBlock[] {
  const blocks: BaseBlock[] = [];
  const q = ctx.question;
  if (q) {
    const lines = [
      `Questão oficial: ${q.exam ?? ""} nº ${q.number} · ${q.topic}`,
      `Estado: ${STATE_PT[ctx.session.question_state] ?? ctx.session.question_state}`,
      `Enunciado: ${q.statement}`,
      ...q.options.map((o) => `${o.id}) ${o.text}`),
    ];
    if (includeAnswer) {
      lines.push(`Gabarito oficial da prova: ${q.official_answer}`);
      for (const o of q.options) if (o.explanation) lines.push(`Explicação oficial de ${o.id}: ${o.explanation}`);
      if (q.expected_conduct) lines.push(`Conduta esperada: ${q.expected_conduct}`);
      if (q.inep_intent) lines.push(`O que a questão avalia: ${q.inep_intent}`);
    }
    if (q.last_answer) lines.push(`Resposta do aluno: ${q.last_answer.selected} (${q.last_answer.is_correct ? "acertou" : "errou"})`);
    else if (q.practice_answer) lines.push(`Resposta do aluno no treino: ${q.practice_answer.selected} (${q.practice_answer.is_correct ? "acertou" : "errou"})`);
    blocks.push({ ref: "Q", kind: "question", label: "Questão oficial", text: lines.join("\n") });
    if (q.analysis) {
      const a = q.analysis;
      blocks.push({
        ref: "A", kind: "analysis", label: "Análise Stazia revisada por médico",
        text: [`O que a questão pede: ${a.question_core}`, a.trap ? `Armadilha: ${a.trap}` : "", a.golden_rule ? `Regra para lembrar: ${a.golden_rule}` : "",
          ...(a.options ?? []).map((o) => `${o.option_id}: ${o.reasoning}${o.why_wrong ? ` Por que está errada: ${o.why_wrong}` : ""}${o.trap ? ` Armadilha: ${o.trap}` : ""}`)].filter(Boolean).join("\n"),
      });
    }
    if (q.update_card) {
      const u = q.update_card;
      blocks.push({
        ref: "U", kind: "update", label: "Atualização de conduta revisada",
        text: `Gabarito oficial da prova: ${u.official_answer}. Conduta atual conferida: ${u.current_answer ?? "nenhuma alternativa isolada"}. O que mudou: ${u.what_changed}${u.effective_date ? ` Em vigor desde ${u.effective_date}.` : ""}`,
      });
    }
  }
  passages.forEach((p, i) =>
    blocks.push({ ref: `F${i + 1}`, kind: "source", label: p.citacao ?? `${p.source} · ${p.organ}${p.version ? ` · versão ${p.version}` : ""}${p.page != null ? ` · p. ${p.page}` : ""}`, text: p.text })
  );
  return blocks;
}

const STOP = new Set(["sobre", "quais", "qual", "como", "para", "pela", "pelo", "entre", "quando", "porque", "essa", "esse", "isso", "esta", "este", "numa", "mais", "menos", "muito", "paciente", "questao", "alternativa", "resposta", "explica", "explique", "tutor"]);

/** Consulta para as fontes oficiais: os termos mais específicos do tema, ligados por "or". */
export function sourceQuery(...texts: (string | null | undefined)[]): string {
  const words = texts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5 && !STOP.has(w));
  return [...new Set(words)].slice(0, 8).join(" or ");
}

/** Termos das fontes complementares; se a lista estiver indisponível, o Tutor recusa o pedido (503) em vez de responder sem conferência. */
export async function termsOrFail(deps: TutorDeps): Promise<string[]> {
  try {
    return await loadComplementarTerms(deps.db, undefined, deps.log);
  } catch (error) {
    if (error instanceof ComplementarTermsUnavailable) throw new TutorError("O Tutor não conseguiu fazer uma conferência de segurança agora. Tente de novo em instantes.", 503);
    throw error;
  }
}

/**
 * Reserva do Tutor (cérebro sem índice ou fora do ar): só fontes oficiais, por palavras, e só as COM aprovação editorial (decisão do
 * dono de 17/10/2026; ch_worker_tutor_kb_fontes_reserva, migração 013620). A busca da Central (ch_worker_search_official_passages)
 * não muda. Sem a função nova no banco, nenhuma fonte sai (lado seguro): a busca antiga deixaria passar fonte sem aprovação.
 */
export async function searchSources(deps: TutorDeps, query: string): Promise<Passage[]> {
  if (!query) return [];
  try {
    const rows = (await deps.db.service<Passage[]>("ch_worker_tutor_kb_fontes_reserva", { p_query: query, p_limit: 3 })) ?? [];
    // fonte complementar (apostila) nunca vai ao aluno: o banco já só devolve fonte oficial, e aqui confere de novo pelo nome
    const terms = await loadComplementarTerms(deps.db, undefined, deps.log); // sem a lista, cai no catch abaixo: nenhuma fonte é devolvida
    return rows.filter((p) => !labelIsSupportMaterial(`${p.source} ${p.organ}`, terms));
  } catch (error) {
    deps.log?.(`[tutor] busca nas fontes falhou: ${(error as Error).message}`);
    return [];
  }
}

const registered = new WeakSet<object>();
const busy = new Set<string>();

export interface TurnResult {
  message: {
    id: number; role: "tutor"; content: string; spoken: string; grounding: string; sources: { ref: string; label: string }[]; hint_level: number | null; suggested: string[]; notice: string | null;
    /** Para o mascote e a voz (o texto é o que se mostra). */
    avatar: ReturnType<typeof avatarOf>;
    /** O estado com que o texto foi escrito (antes da avaliação): a voz e a esfera falam com ele. */
    voice_avatar: ReturnType<typeof avatarOf>;
  };
  /** Estado do professor depois deste turno (a voz recebe como instrução de tom). */
  tone: string;
  /** "explain": o professor só segue para a próxima questão depois de o aluno explicar o raciocínio. */
  gate: "explain" | null;
  question_state: string;
  used_today: number;
  daily_limit: number;
}

export async function tutorTurn(deps: TutorDeps, userId: string, sessionId: string, action: TutorAction): Promise<TurnResult> {
  if (/^(false|0|off|no)$/i.test((process.env.TUTOR_ENABLED ?? "").trim())) throw new TutorError("O Tutor está desligado no servidor.", 503);
  if (busy.has(userId)) throw new TutorError("Espere a resposta anterior antes de mandar outra.", 429);
  busy.add(userId);
  try {
    const ctx = await deps.db.service<Context | null>("ch_worker_tutor_context", { p_user: userId, p_session_id: sessionId });
    if (!ctx) throw new TutorError("Conversa não encontrada.", 404);
    // o aceite vem antes de qualquer outra conferência (plano, limite, IA): sem ele a tela mostra o cartão do aceite, não o aviso de plano
    if (ctx.consent_pending) throw consentError();
    if (ctx.session.read_only) throw new TutorError(PROFESSOR_CHANGED, 409);
    // Stazia Play: só números agregados (ranking, liga, sequência, área mais fraca); a IA interpreta, nunca decide pontos
    const play = await deps.db.service<PlayContext | null>("ch_worker_tutor_play_context", { p_user: userId }).catch(() => null);
    const ent = ctx.entitlement;
    if (!ent.enabled) throw new TutorError("O Tutor ainda não está ligado.", 503);
    if (ent.mode === "blocked") throw new TutorError(trialOverMessage(ent), 403);
    if (ctx.session.status !== "active") throw new TutorError("Esta conversa foi encerrada. Abra uma nova.", 409);
    const voiceTurn = Boolean(action.voiceCallId);
    // a voz ao vivo é cobrada pelo tempo; o turno da Nexus (voz do professor) gasta 1 interação de texto
    const charged = action.chargeText ?? !voiceTurn;
    if (!ent.can_text && charged) throw new TutorError(textLimitMessage(ent), 429);
    const settings = await tutorSettings(deps);
    const allowed = await aiAllowed(deps.db);
    if (!allowed.ok) {
      deps.log?.(`[tutor] IA bloqueada: ${allowed.why}`);
      throw new TutorError("O Tutor está indisponível no momento.", 503);
    }

    // ---- a tarefa desta resposta
    const q = ctx.question;
    const open = ctx.session.question_state === "open";
    let task: TutorTask;
    let studentText = "";
    let hintLevel: number | null = null;
    // o que aconteceu, pelos fatos (antes da IA); a avaliação completa o quadro depois
    let happening: Happening = { kind: "message" };
    if (action.type === "hint") {
      if (!q || !open) throw new TutorError("Não há questão aberta para pedir dica.", 409);
      if (ctx.session.hint_level >= 5) throw new TutorError("Você já recebeu todas as dicas desta questão.", 409);
      hintLevel = ctx.session.hint_level + 1;
      task = { type: "hint", level: hintLevel };
      studentText = hintLevel === 1 ? "Me dá uma ajuda aqui." : "Me ajuda mais um pouco.";
      happening = { kind: "hint" };
    } else if (action.type === "reveal") {
      if (!q || !open) throw new TutorError("Não há questão aberta para mostrar a resolução.", 409);
      hintLevel = 5;
      task = { type: "reveal" };
      studentText = "Me mostra a resolução.";
      happening = { kind: "reveal" };
    } else if (action.type === "react") {
      const a = q?.last_answer;
      if (!q || !a || ctx.session.question_state !== "answered") throw new TutorError("Responda a questão antes.", 409);
      const repeated = 1 + (ctx.memory?.recent_errors ?? []).filter((e) => e.question_id === q.id && !e.resolved).length;
      task = { type: "react", selected: a.selected, correct: a.is_correct, confidence: a.confidence, hints: a.hints_used, lucky: a.lucky_guess, repeated };
      studentText = `Marquei a ${a.selected}.`;
      const fast = a.response_ms != null && a.response_ms < 12_000;
      const changed = a.first_pick && a.first_pick !== a.selected
        ? a.first_pick === q.official_answer ? "correct_to_wrong" as const : a.is_correct ? "wrong_to_correct" as const : "wrong_to_wrong" as const
        : null;
      happening = {
        kind: "answer", correct: a.is_correct, severity: 3, repeated: repeated >= 2, changed, responseMs: a.response_ms ?? null,
        // chute: confiança mínima, ou rápido demais e errado sem confiança informada
        guess: (a.confidence != null && a.confidence <= 1) || (!a.is_correct && fast && a.confidence == null),
      };
    } else {
      studentText = (action.text ?? "").trim();
      if (!studentText) throw new TutorError("Escreva ou fale a sua mensagem.", 400);
      if (studentText.length > 2000) throw new TutorError("Mensagem longa demais (até 2.000 caracteres).", 400);
      const a = q?.last_answer;
      task = a && a.is_correct && a.lucky_guess && !a.justification && ctx.session.question_state === "answered" ? { type: "justify" } : { type: "message", interrupted: action.interrupted?.slice(0, 300) || null };
      // revisão de 17/10: a fala do aluno mexe no humor (brincando, aflito, sério, provocando, cansado), como na voz pela ponte
      happening = { kind: "message", leitura: leituraDoRegistro(lerRegistro(studentText).registro) };
    }

    // passagem preparada (revisão de 17/10): logo depois da resposta, a fala de passagem para a próxima questão é pedida JUNTO com a
    // reação (não soma tempo); quando o aluno pedir a próxima, ela entra na hora (opening.ts). Só nos modos com sequência de questões.
    const prep = task.type === "react" && (ctx.session.mode === "questao" || ctx.session.mode === "erros") ? prepararPassagem(deps, userId, sessionId) : null;

    // cérebro do Tutor: o vetor da pergunta (só com TUTOR_CONHECIMENTO_VETOR=1) começa já, junto com o resto do preparo do turno
    const weak = ctx.session.context?.type === "weak_points" ? (ctx.memory?.weak_subareas ?? []).slice(0, 3).map((w) => w.subarea).join(" ") : "";
    const termosBusca = [q?.topic, q?.subtopic, ctx.session.topic, ctx.session.context?.label, weak, task.type === "message" && !q ? studentText : ""];
    const vetorCedo = vetorEmParalelo(termosBusca.filter(Boolean).join(" "));

    const { provider, status } = resolveTutorProvider(deps.mockRespond);
    if (!provider) {
      deps.log?.(`[tutor] IA não configurada: ${status.pending}`);
      throw new TutorError("O Tutor está indisponível no momento.", 503);
    }
    if (!registered.has(deps.db)) {
      await registerPrompts(deps.db, TUTOR_PROMPT_LAYERS as PromptEntry[]);
      registered.add(deps.db);
    }

    // ---- base conferida
    const includeAnswer = Boolean(q) && (!open || task.type === "hint" || task.type === "reveal");
    // lista de fontes que o aluno não pode ver: sem ela o Tutor não responde (nada é publicado nem gravado); o aluno tenta de novo
    const supportTerms = await termsOrFail(deps);
    // cérebro do Tutor: busca no conhecimento aprovado (aulas, atualizações, fontes, flashcards, explicações já liberadas), travas no banco;
    // sem o índice, a busca de antes
    const passages = (await buscarOuReserva(deps, { userId, sessionId, pergunta: termosBusca.filter(Boolean).join(" "), vetor: vetorCedo, via: "texto" }, () => searchSources(deps, sourceQuery(...termosBusca)))).passagens as Passage[];
    const blocks = buildBlocks(ctx, passages, includeAnswer);

    // ---- personalidade (sempre depois do conteúdo): estilo do professor + estado da sessão
    const prefs = ctx.session.settings;
    const sessionTypes = (ctx.session_errors ?? []).map((x) => x.error_type);
    const engine = engineFor(ctx.personality.id, ctx.personality.engine, settings.durona_level);
    const prev = normalize(ctx.session.emotion, engine);
    // a mesma variação nas duas passagens (antes e depois da avaliação): o humor não "pula" entre elas
    const seed = deterministicTutor() ? () => () => 0.5 : seededRandom(`${sessionId}:${ctx.history.length}`);
    // motor emocional desligado no painel: o professor fica no tom de base (o resto do turno é igual)
    const moved = (h: Happening, rand: () => number) => (settings.emotion_engine ? step(prev, engine, h, rand).state : prev);
    const before = moved(happening, seed());
    const eff = effectiveParams(ctx.personality.params, 3, prefs);
    const personaMax = profanityLevel(ctx.personality.params, prefs.profanity ?? "off", ctx.config.max_profanity);
    const li = languageIntensity(before, engine);
    const RANK = { off: 0, mild: 1, moderate: 2 } as const;
    const byIntensity = profanityForIntensity(li);
    // leitura do aluno (leituraDoAluno.ts): aluno ansioso, frustrado, desanimado ou abalado não ouve palavrão nesta fala
    const lido = task.type === "message" ? lerRegistro(studentText) : null;
    const contido = Boolean(lido && palavraoContido(lido));
    const profanity = contido ? "off" : RANK[byIntensity] < RANK[personaMax] ? byIntensity : personaMax;
    // a conferência aceita um degrau acima do pedido (a reação à gravidade real do erro pode subir o tom)
    const checkLevel = contido ? (RANK[personaMax] > 0 ? "mild" : "off") : RANK[profanityForIntensity(Math.min(5, li + 1))] < RANK[personaMax] ? profanityForIntensity(Math.min(5, li + 1)) : personaMax;
    const mood = { label: before.mood, text: stateLayer(ctx.personality.id, before, engine, profanity), swearing: "conforme a INTENSIDADE DE LINGUAGEM do estado", strong: li >= 3 };
    // a ficha diz o grito e o palavrão que valem na conversa (teto do painel, do professor e do aluno; aluno mal: nenhum)
    const limites = { palavrao: contido ? ("off" as const) : personaMax, gritos: !contido };
    const system = composeSystem({ mode: ctx.session.mode, browserVoice: Boolean(action.voice), persona: personalityLayer(ctx.personality, eff, profanity, 3, null, mood, { seed: sessionId, limites }), personaId: ctx.personality.id });

    const mem = ctx.memory;
    const studentCtx = {
      nome: nomeSeguro(ctx.student?.first_name),
      dias_para_a_prova: ctx.student?.days_to_exam ?? null,
      dominio_por_area: (ctx.mastery?.areas ?? []).filter((a) => a.level !== "SEM_DADOS").map((a) => ({ area: a.area, nivel: a.level })),
      pontos_fracos: (mem?.weak_subareas ?? []).slice(0, 5).map((w) => `${w.subarea} (${w.accuracy}%)`),
      erros_recorrentes: (mem?.recurrent_errors ?? []).map((r) => ({ tipo: r.error_type, lacuna: r.knowledge_gap, vezes: r.times })),
      erros_recentes: (mem?.recent_errors ?? []).slice(0, 4).map((r) => ({ tipo: r.error_type, lacuna: r.knowledge_gap, tema: r.theme })),
      contexto_da_sessao: ctx.session.context?.label ?? ctx.session.topic ?? null,
      nivel_da_conversa: ctx.session.difficulty_level,
      perfil: mem?.profile ?? null,
      jogo: play ? {
        posicao_no_ranking: play.rank, percentil: play.percentile, liga: play.league, xp_na_semana: play.weekly_xp, stazia_score: play.stazia_score,
        questoes: play.questions, precisao: play.accuracy, sequencia_dias: play.streak, area_mais_fraca: play.weakest_area, missoes_pendentes_hoje: play.missions_pending,
      } : null,
      evolucao: (mem?.improvements ?? []).map((i) => `${i.topic}: errava (${i.errors_before}x), agora acertou ${i.correct_recent} nos últimos 7 dias`),
    };
    // memória do professor nesta sessão: erros, repetições, piadas internas e o que não repetir
    const teacher = {
      erros_nesta_sessao: (ctx.session_errors ?? []).slice(-6).map((e) => ({ tipo: e.error_type, lacuna: e.knowledge_gap ?? null, tema: e.theme ?? null })),
      erros_repetidos: (mem?.recurrent_errors ?? []).filter((r) => r.times >= 2).map((r) => `${r.error_type}${r.knowledge_gap ? ` (${r.knowledge_gap})` : ""} ×${r.times}`),
      piadas_internas: (settings.inside_jokes ? mem?.inside_jokes ?? [] : []).map((j) => (j.beaten ? `${j.topic}: já foi o "inimigo" dele (${j.strength} erros) e ele superou` : `${j.topic}: o assunto que mais o derruba (${j.strength} erros); dá para virar uma referência recorrente, com leveza e de vez em quando`)),
      evite_repetir: recentExpressions(ctx.history.filter((h) => h.role === "tutor").map((h) => h.content)),
      comecos_ja_usados: usedStarts(ctx.history.filter((h) => h.role === "tutor").map((h) => h.content)),
    };
    // leitura do aluno por software (sem IA): uma linha interna na tarefa quando há sinal claro (leituraDoAluno.ts)
    const leitura = lido ? notaDoRegistro(lido) : "";
    const conversation = ctx.history.map((h) => `${h.role === "student" ? "Aluno" : "Tutor"}: ${h.content.slice(0, 600)}`).join("\n");
    const baseInput =
      `Responda no formato "tutor".\n<base>\n${JSON.stringify(blocks.map((b) => ({ ref: b.ref, tipo: b.kind, rotulo: b.label, texto: b.text })))}\n</base>\n` +
      `<contexto_do_aluno>\n${JSON.stringify(studentCtx)}\n</contexto_do_aluno>\n<estado_do_professor>\n${JSON.stringify(teacher)}\n</estado_do_professor>\n<conversa>\n${conversation}\n</conversa>\n<aluno>\n${asDocument(studentText)}\n</aluno>\n` +
      `<tarefa>\n${taskInstruction(task)}${leitura ? `\n${leitura}` : ""}\n</tarefa>`;

    const safetyCtx = {
      blocks,
      supportTerms,
      conversationTexts: [studentText, ...ctx.history.map((h) => h.content)],
      question: q ? { open, officialLetter: q.official_answer, officialText: q.options.find((o) => o.id === q.official_answer)?.text ?? null } : null,
      hintLevel,
      hasUpdateCard: Boolean(q?.update_card),
      profanity: checkLevel,
    };

    // ---- reserva atômica de uma interação (dois aparelhos não passam do limite juntos); devolvida se a IA falhar.
    // Turno da voz ao vivo não reserva: a voz é cobrada pelo tempo autorizado na ligação.
    let release: () => Promise<unknown> = async () => undefined;
    if (charged) {
      const reserved = await deps.db.service<{ ok: boolean; reason?: string; reservation?: number; entitlement?: Entitlement }>("ch_worker_tutor_text_reserve", { p_user: userId, p_session_id: sessionId });
      if (!reserved.ok) {
        if (reserved.reason === "trial_expired") throw new TutorError(trialOverMessage(reserved.entitlement ?? ent), 403);
        if (reserved.reason === "disabled") throw new TutorError("O Tutor ainda não está ligado.", 503);
        throw new TutorError(textLimitMessage(reserved.entitlement ?? ent), 429);
      }
      release = () => deps.db.service("ch_worker_tutor_text_release", { p_user: userId, p_reservation: reserved.reservation }).catch(() => undefined);
    }

    // ---- gerar e validar (uma nova tentativa com a correção)
    const usage = { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, provider: provider.name, model: provider.model, ...(voiceTurn && !charged ? { feature: "tutor_voice_backend" } : {}) };
    let out: TutorOutput | null = null;
    let check: SafetyResult | null = null;
    let violations: Violation[] = [];
    let model = provider.model;
    let providerName = provider.name;
    // sigilo (escudo.ts): o que pode ser repetido sem ser vazamento é o que o aluno disse, a conversa e a base
    const sigiloCtx = { instrucoes: system, permitidos: [studentText, ...ctx.history.map((h) => h.content), ...blocks.map((b) => b.text)], base: blocks.map((b) => b.text), pergunta: studentText };
    let ultima: { out: TutorOutput; check: SafetyResult } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      // revisão de 17/10: barrada por número sem base, a segunda tentativa recebe o COMO (sem o número, ou só os da base), não só o quê
      const comoCorrigir = violations.some((x) => x.code === "ungrounded_number")
        ? "\n- Como corrigir: tire esses valores e fale sem número (\"febre alta\", \"pressão baixa\", \"dose de ataque\"), ou use só os valores que estão em <base> com a citação. Caso de exemplo: descreva sinais e sintomas em palavras, sem número." : "";
      const input = attempt === 0 ? baseInput : `${baseInput}\n<correcao_obrigatoria>\nSua resposta anterior foi barrada. Refaça sem estes problemas:\n${violations.map((x) => `- ${x.detail}`).join("\n")}${comoCorrigir}\n</correcao_obrigatoria>`;
      let r;
      try {
        r = await provider.generate<TutorOutput>({ promptId: "tutor", promptVersion: TUTOR_VERSION, system, input, schema: TUTOR_SCHEMA, schemaName: "staziamed_tutor", maxOutputTokens: 2000, effort: EFFORT });
      } catch (error) {
        // resposta fora do formato: conta como barrada e ganha uma nova tentativa (nunca é "consertada")
        if (error instanceof AiInvalidOutput) {
          usage.calls++;
          violations = [{ code: "invalid_format", detail: `A resposta veio fora do formato pedido (${error.message.slice(0, 160)}). Responda só no formato "tutor", com reply de até 2.600 caracteres.` }];
          continue;
        }
        deps.log?.(`[tutor] falha do provedor: ${(error as Error).message.slice(0, 200)}`);
        if (usage.calls === 0) {
          await release(); // erro do provedor não gasta a cota do aluno
          throw new TutorError("O Tutor não conseguiu responder agora. Tente de novo em instantes.", 502);
        }
        break;
      }
      usage.calls++;
      usage.input_tokens += r.inputTokens ?? 0;
      usage.output_tokens += r.outputTokens ?? 0;
      usage.cost_usd += r.costUsd ?? 0;
      model = r.model;
      providerName = r.provider;
      usage.model = r.model;
      usage.provider = r.provider;
      const c = safetyCheck(r.output, safetyCtx);
      violations = [...c.violations, ...violacoesDeSigilo(r.output, sigiloCtx)];
      ultima = { out: r.output, check: c };
      if (!violations.length) {
        out = r.output;
        check = c;
        break;
      }
    }

    // barrada só por sigilo nas duas tentativas: a resposta fica, reescrita no personagem (não vira a resposta fixa)
    if (!out && ultima && violations.length && violations.every((x) => x.code === "sigilo")) ({ out, check } = ultima);
    const replaced = !out;
    // reserva fixa por situação (revisão de 17/10): reação à letra marcada, pedido de caso sem questão aberta ou dado sem fonte
    const situacao = {
      reacao: task.type === "react" ? { letra: task.selected, acertou: task.correct } : null,
      pedidoDeCaso: task.type === "message" && !(q && open) && pedeCaso(studentText),
      tema: q?.topic ?? ctx.session.topic ?? ctx.session.context?.label ?? null,
      semente: ctx.history.length,
    };
    const reply = protegerFala(out ? out.reply.trim() : fallbackReply(violations, situacao), ctx.personality.id, sigiloCtx).texto;
    // a resolução (dica 5 ou pedido explícito) revela a resposta mesmo se a IA esquecer de marcar
    const reveals = hintLevel === 5 && (Boolean(out?.reveals_answer) || task.type === "reveal" || replaced);
    const ev = out?.evaluation ?? NO_EVALUATION;

    // ---- avaliação silenciosa: vira evento pedagógico (erro registrado) e mexe no estado da sessão
    let learning: Record<string, unknown> | null = null;
    // erro na questão respondida (no Tutor ou no treino) só vira evento uma vez por questão nesta sessão
    const wrongHere = Boolean(q && !open && (q.last_answer ? !q.last_answer.is_correct : q.practice_answer?.is_correct === false));
    const alreadyLogged = Boolean(q && (ctx.session_errors ?? []).some((x) => x.question_id === q.id));
    const errorTurn = (task.type === "react" && !task.correct) || (task.type === "justify" && out?.justification === "INSUFFICIENT") || (task.type === "message" && wrongHere && !alreadyLogged) || (!q && ev.answer_correct === "no");
    if (out && ev.error_type !== "none" && errorTurn) {
      learning = { kind: "error", error_type: ev.error_type, knowledge_gap: ev.knowledge_gap || null, question_id: q?.id ?? null, source: voiceTurn ? "tutor_voice" : "tutor_text", metadata: { severity: ev.severity, unsafe: ev.unsafe } };
    } else if (task.type === "react" && task.correct) learning = { kind: "correct", question_id: q?.id ?? null };
    // o quadro completo: fatos + avaliação (tipo e gravidade do erro, repetição, explicação esquecida, conduta perigosa)
    const gap = (ev.knowledge_gap || "").trim().toLowerCase();
    const repeatedType = sessionTypes.includes(ev.error_type) || (ctx.memory?.recurrent_errors ?? []).some((r) => r.error_type === ev.error_type);
    const forgot = Boolean(gap) && (ctx.session_errors ?? []).some((e) => (e.knowledge_gap ?? "").trim().toLowerCase() === gap);
    const oral = ctx.session.mode === "perguntas" && !q && ev.answer_correct !== "na" ? { correct: ev.answer_correct === "yes" ? true : ev.answer_correct === "no" ? false : null } : {};
    // fora do "Me teste" (conversa livre, discussão depois da questão): a resposta oral só mexe no humor, sem contar como questão
    const oralLeve = !("correct" in oral) && task.type === "message" && (!q || !open) && (ev.answer_correct === "yes" || ev.answer_correct === "no") ? { oralLeve: ev.answer_correct === "yes" } : {};
    const full: Happening = {
      ...happening,
      ...oral,
      ...oralLeve,
      ...(happening.correct === false || oral.correct === false
        ? { severity: ev.error_type !== "none" ? ev.severity : happening.severity ?? 3, errorType: ev.error_type !== "none" ? ev.error_type : null, repeated: Boolean(happening.repeated) || (ev.error_type !== "none" && repeatedType), forgotExplanation: forgot, unsafe: ev.unsafe }
        : {}),
      excellent: (happening.correct === true || oral.correct === true) && ev.reasoning_quality === "high",
      seriousAttempt: ev.reasoning_quality === "medium" || ev.reasoning_quality === "high",
      selfCorrected: ev.self_corrected,
      // destrava: o aluno explicou com raciocínio aceitável (ou já insistiu duas vezes)
      explained: prev.gate === "explain" && task.type !== "react" && action.type === "message" && (ev.reasoning_quality === "medium" || ev.reasoning_quality === "high" || prev.events.filter((e) => e === "explain_attempt").length >= 2),
    };
    const after = moved(full, seed());
    const emotion: TutorState = prev.gate === "explain" && action.type === "message" && !full.explained ? { ...after, events: [...after.events, "explain_attempt"].slice(-8) } : after;
    // "Me teste": a dificuldade acompanha as respostas orais
    const level = ctx.session.mode === "perguntas" && ev.answer_correct !== "na"
      ? Math.max(1, Math.min(10, ctx.session.difficulty_level + (ev.answer_correct === "yes" ? 1 : ev.answer_correct === "no" ? -1 : 0)))
      : null;

    const meta: Record<string, unknown> = {
      grounding: replaced ? "insufficient" : check!.grounding,
      sources: replaced ? [] : check!.sources,
      suggested: replaced ? [] : sugestoesSemSigilo(out!.suggested_replies),
      notice: replaced ? "Resposta substituída: a primeira versão trazia informação que não pôde ser conferida." : null,
      model, provider: providerName, prompt_version: TUTOR_VERSION, simulated: provider.isMock,
      personality: { id: ctx.personality.id, profanity, mood: before.mood, language_intensity: li, frustration: before.frustration, enthusiasm: before.enthusiasm },
      avatar: avatarOf(ctx.personality.id, emotion),
      ...(task.type === "react" || task.type === "justify" ? { answer_reasoning_quality: ev.reasoning_quality } : {}),
      voice: Boolean(action.voice),
      ...(voiceTurn ? { realtime: true, delegated: true } : {}),
      emotion,
      ...(out ? { evaluation: ev } : {}),
      ...(learning ? { learning_event: learning } : {}),
      ...(level != null ? { difficulty_level: level } : {}),
      ...(violations.length ? { violations: violations.map((x) => x.code) } : {}),
      ...(hintLevel != null ? { hint_level: hintLevel, reveals_answer: reveals } : {}),
      ...(task.type === "react" && !task.correct && out && ev.error_type !== "none" ? { error_class: ev.error_type } : {}),
      ...(task.type === "justify" && out && out.justification !== "NONE" ? { justification: out.justification } : {}),
    };
    let saved: { id: number; used_today: number };
    try {
      saved = await deps.db.service<{ id: number; used_today: number }>("ch_worker_tutor_append", {
        p_user: userId, p_session_id: sessionId, p_student: studentText, p_tutor: reply, p_meta: meta, p_usage: usage,
      });
    } catch (error) {
      await release();
      throw error;
    }
    // a passagem preparada quase sempre já terminou; se não, espera no máximo um pouco (na Vercel, trabalho depois da resposta pode parar)
    if (prep) await Promise.race([prep, new Promise((r) => setTimeout(r, PREP_EXTRA_WAIT_MS))]);
    return {
      message: {
        id: saved.id, role: "tutor", content: reply, spoken: spokenText(reply), grounding: String(meta.grounding), sources: meta.sources as { ref: string; label: string }[], hint_level: hintLevel,
        suggested: meta.suggested as string[], notice: (meta.notice as string | null) ?? null, avatar: avatarOf(ctx.personality.id, emotion),
        voice_avatar: avatarOf(ctx.personality.id, before),
      },
      tone: stateLayer(ctx.personality.id, emotion, engine, profanity),
      gate: emotion.gate,
      question_state: reveals ? "revealed" : ctx.session.question_state,
      used_today: saved.used_today,
      daily_limit: ent.text.limit,
    };
  } finally {
    busy.delete(userId);
  }
}
