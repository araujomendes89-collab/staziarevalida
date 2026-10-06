/**
 * FERRAMENTAS do Stazia Tutor por voz (OpenAI Realtime, "function calling"). O modelo nunca toca no banco: ele pede uma destas
 * ferramentas pelo nome, o navegador repassa o pedido ao servidor com a sessão do aluno, e o servidor executa com as regras daqui.
 *
 *   - o aluno e a sessão são os da chamada de voz (o modelo não escolhe usuário nem lê outra sessão);
 *   - só a questão da sessão; com ela aberta, sem gabarito (a resolução só com pedido explícito, e a questão sai como "revelada");
 *   - quem corrige a resposta é o banco (submit_answer);
 *   - nada de SQL vindo do modelo: cada ferramenta é uma função fixa.
 *
 * Nomes do pedido de 2026-10-06 → ferramentas daqui: get_current_question / get_official_answer / get_question_explanation →
 * get_question_context (o gabarito só sai depois da resposta ou com reveal); grade_student_answer → submit_answer;
 * get_authoritative_content → get_topic_context; get_student_profile / get_topic_performance → get_student_learning_memory;
 * get_recent_errors → get_student_errors; update_learning_state → register_learning_event; e as novas save_tutor_memory,
 * schedule_review e wait_for_user.
 */
import { avatarOf, engineFor, normalize, stateLayer, step, type Happening, type PersonaEngine, type TutorState } from "./emotion";
import { searchSources, sourceQuery, TutorError, type TutorDeps } from "./engine";
import { tutorSettings } from "./settings";
import { evaluateReasoning } from "./evaluation";
import { ERROR_TYPES } from "./prompts";

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

/** Definições no formato da sessão Realtime (session.tools). */
export const REALTIME_TOOLS = [
  {
    type: "function", name: "get_question_context",
    description: "Traz a questão desta sessão do banco oficial: enunciado e alternativas; depois de respondida (ou com reveal = true), também o gabarito oficial, as explicações, a análise revisada e a atualização de conduta.",
    parameters: obj({ reveal: { type: "boolean", description: "true só se o aluno pediu a resolução com todas as letras" } }),
  },
  {
    type: "function", name: "submit_answer",
    description: "Registra a alternativa que o aluno disse para a questão aberta. O sistema corrige e devolve se acertou.",
    parameters: obj({ option: { type: "string", enum: ["A", "B", "C", "D"] }, confidence: { type: "integer", minimum: 0, maximum: 5, description: "confiança que o aluno disse, se disse" } }, ["option"]),
  },
  { type: "function", name: "next_question", description: "Abre a próxima questão (modos Questões e Meus erros), depois que a atual foi respondida.", parameters: obj({}) },
  {
    type: "function", name: "get_student_learning_memory",
    description: "Memória pedagógica do aluno: domínio por área, pontos fracos, erros recorrentes e recentes, revisões pendentes.",
    parameters: obj({ area: { type: "string" }, theme: { type: "string" } }),
  },
  { type: "function", name: "get_student_errors", description: "Erros recentes e recorrentes do aluno (caderno de erros do Tutor).", parameters: obj({ area: { type: "string" } }) },
  {
    type: "function", name: "get_topic_context",
    description: "Trechos de fontes oficiais conferidas sobre um tema. Use antes de falar de número, dose, corte ou conduta de um tema.",
    parameters: obj({ topic: { type: "string" } }, ["topic"]),
  },
  {
    type: "function", name: "evaluate_student_reasoning",
    description: "Avaliação silenciosa do raciocínio do aluno (depois que ele respondeu a questão, ou numa resposta oral do Me teste). Devolve tipo de erro e a próxima intervenção recomendada.",
    parameters: obj({ answer: { type: "string" }, reasoning: { type: "string" } }, ["answer", "reasoning"]),
  },
  {
    type: "function", name: "register_learning_event",
    description: "Registra o que aconteceu: erro (com o tipo), acerto ou autocorreção do aluno.",
    parameters: obj({ kind: { type: "string", enum: ["error", "correct", "self_correction"] }, error_type: { type: "string", enum: [...ERROR_TYPES] }, knowledge_gap: { type: "string" } }, ["kind"]),
  },
  {
    type: "function", name: "save_tutor_memory",
    description: "Guarda algo marcante sobre o aluno para lembrar em outras conversas: o assunto que sempre o derruba (inside_joke), um fato, uma preferência de estudo, uma meta ou uma conquista. Use pouco: só o que vale lembrar daqui a dias.",
    parameters: obj({
      kind: { type: "string", enum: ["inside_joke", "fact", "preference", "goal", "milestone"] },
      concept: { type: "string", description: "o assunto, curto (ex.: sulfato de magnésio)" },
      note: { type: "string", description: "o que lembrar, em uma frase" },
    }, ["kind", "concept"]),
  },
  {
    type: "function", name: "schedule_review",
    description: "Manda a questão desta conversa para a revisão espaçada do aluno daqui a alguns dias.",
    parameters: obj({ days: { type: "integer", minimum: 1, maximum: 60 } }, ["days"]),
  },
  {
    type: "function", name: "wait_for_user",
    description: "Use quando o som não for o aluno falando com você (TV, outra pessoa, tosse, música, teclado, ruído), quando ele só fez um som de acompanhamento ou está pensando em silêncio. Você não fala nada e continua ouvindo.",
    parameters: obj({ reason: { type: "string", enum: ["background", "noise", "not_addressed", "thinking_pause"] } }),
  },
] as const;

export const TOOL_NAMES = new Set<string>(REALTIME_TOOLS.map((t) => t.name));

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

interface ToolCtx {
  deps: TutorDeps;
  userId: string;
  sessionId: string;
  personaId: string;
  /** Guarda o texto das fontes devolvidas (a conferência do que foi dito aceita valores que vieram daqui). */
  remember?: (texts: string[]) => void;
}

/**
 * Passa o acontecimento pelo motor de personalidade, guarda o novo estado e devolve o tom para a voz seguir e a emoção para a
 * esfera da tela de voz (calculada aqui, nunca deduzida do texto).
 */
async function moodAfter(t: ToolCtx, h: Happening): Promise<{ tone: string; avatar: ReturnType<typeof avatarOf> }> {
  const ctx = await t.deps.db.service<{ session: { emotion: Partial<TutorState> & Record<string, unknown> }; personality: { engine?: Partial<PersonaEngine> } } | null>(
    "ch_worker_tutor_context", { p_user: t.userId, p_session_id: t.sessionId });
  const settings = await tutorSettings(t.deps);
  const engine = engineFor(t.personaId, ctx?.personality.engine, settings.durona_level);
  const prev = normalize(ctx?.session.emotion, engine);
  // motor emocional desligado no painel: o tom fica o de base
  const next = settings.emotion_engine ? step(prev, engine, h).state : prev;
  if (settings.emotion_engine) await t.deps.db.service("ch_worker_tutor_set_emotion", { p_user: t.userId, p_session_id: t.sessionId, p_emotion: next });
  return { tone: stateLayer(t.personaId, next, engine), avatar: avatarOf(t.personaId, next) };
}

/** Executa uma ferramenta pedida pela voz. Erros esperados voltam como { error } para o modelo dizer com naturalidade. */
export async function runTutorTool(t: ToolCtx, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!TOOL_NAMES.has(name)) return { error: "Ferramenta desconhecida." };
  const svc = <T>(fn: string, a: Record<string, unknown>) => t.deps.db.service<T>(fn, { p_user: t.userId, ...a });
  try {
    switch (name) {
      case "get_question_context": {
        const q = await svc<Record<string, unknown> | null>("ch_worker_tutor_tool_question", { p_session_id: t.sessionId, p_reveal: args.reveal === true });
        return q ? { question: q } : { error: "Esta sessão não tem questão." };
      }
      case "submit_answer": {
        const option = str(args.option, 1).toUpperCase();
        if (!/^[A-D]$/.test(option)) return { error: "Alternativa inválida: peça A, B, C ou D." };
        const conf = Number.isInteger(args.confidence) && (args.confidence as number) >= 0 && (args.confidence as number) <= 5 ? (args.confidence as number) : null;
        const r = await svc<Record<string, unknown>>("ch_worker_tutor_answer_as", { p_session_id: t.sessionId, p_option: option, p_confidence: conf });
        const q = await svc<Record<string, unknown> | null>("ch_worker_tutor_tool_question", { p_session_id: t.sessionId, p_reveal: false });
        const mood = await moodAfter(t, { kind: "answer", correct: Boolean(r.is_correct), severity: 3, guess: conf != null && conf <= 1 });
        return { result: { is_correct: r.is_correct, correct_option: r.correct_option, outcome: r.outcome, review_scheduled: r.review_scheduled }, question: q, tone: mood.tone, avatar: mood.avatar };
      }
      case "next_question":
        return await svc<Record<string, unknown>>("ch_worker_tutor_next_as", { p_session_id: t.sessionId });
      case "get_student_learning_memory":
        return { memory: await svc("ch_worker_tutor_memory", { p_area: str(args.area, 40) || null, p_theme: str(args.theme, 120) || null }) };
      case "get_student_errors": {
        const m = await svc<{ recurrent_errors: unknown; recent_errors: unknown }>("ch_worker_tutor_memory", { p_area: str(args.area, 40) || null, p_theme: null });
        return { recurrent_errors: m.recurrent_errors, recent_errors: m.recent_errors };
      }
      case "get_topic_context": {
        const passages = await searchSources(t.deps, sourceQuery(str(args.topic, 160)));
        t.remember?.(passages.map((p) => p.text));
        return passages.length
          ? { passages: passages.map((p) => ({ fonte: `${p.source} · ${p.organ}${p.version ? ` · versão ${p.version}` : ""}${p.page != null ? ` · p. ${p.page}` : ""}`, texto: p.text })) }
          : { passages: [], note: "Nada encontrado na base conferida para este tema. Diga ao aluno que não encontrou confirmação e não cite número, dose ou diretriz." };
      }
      case "evaluate_student_reasoning": {
        const q = await svc<Record<string, unknown> & { state?: string; last_answer?: { is_correct: boolean } | null } | null>("ch_worker_tutor_tool_question", { p_session_id: t.sessionId, p_reveal: false });
        if (q && q.state === "open") return { error: "A questão ainda está aberta: peça a resposta (submit_answer) antes de avaliar." };
        const topic = str(args.answer, 200);
        const passages = q ? [] : (await searchSources(t.deps, sourceQuery(topic))).map((p) => ({ label: p.source, text: p.text }));
        const ev = await evaluateReasoning(t.deps, { question: q, correct: q ? (q.last_answer?.is_correct ?? null) : null, answer: topic, reasoning: str(args.reasoning, 1500), topicPassages: passages });
        await svc("ch_worker_tutor_ledger", { p_session_id: t.sessionId, p_entry: { feature: "tutor_eval", provider: ev.usage.provider, model: ev.usage.model, input_text_tokens: ev.usage.input_tokens, output_text_tokens: ev.usage.output_tokens, estimated_cost_usd: ev.usage.cost_usd } });
        let times = 0;
        if (ev.error_type !== "none" && ev.correct === false) {
          times = (await svc<{ times: number }>("ch_worker_tutor_learning_event", { p_session_id: t.sessionId, p_event: { kind: "error", error_type: ev.error_type, knowledge_gap: ev.knowledge_gap, source: "tutor_voice" } })).times;
        }
        const mood = await moodAfter(t, {
          kind: "message", correct: null, seriousAttempt: ev.reasoning_quality === "medium" || ev.reasoning_quality === "high",
          excellent: ev.correct === true && ev.reasoning_quality === "high",
          adjust: ev.correct === false ? { severity: ev.severity, repeated: times >= 2, careless: ev.error_type === "attention_error", unsafe: ev.unsafe } : null,
        });
        const { usage, ...out } = ev;
        return { evaluation: { ...out, times_seen: times }, tone: mood.tone, avatar: mood.avatar };
      }
      case "register_learning_event": {
        const kind = str(args.kind, 20);
        if (!["error", "correct", "self_correction"].includes(kind)) return { error: "Tipo de evento inválido." };
        const r = await svc<{ times: number }>("ch_worker_tutor_learning_event", {
          p_session_id: t.sessionId, p_event: { kind, error_type: str(args.error_type, 40) || "unknown", knowledge_gap: str(args.knowledge_gap, 160) || null, source: "tutor_voice" },
        });
        const mood = await moodAfter(t, kind === "self_correction" ? { kind: "message", selfCorrected: true } : kind === "correct" ? { kind: "message", seriousAttempt: true } : { kind: "message", correct: null, adjust: { repeated: r.times >= 2 } });
        return { ok: true, times_seen: r.times, tone: mood.tone, avatar: mood.avatar };
      }
      case "save_tutor_memory": {
        const r = await svc<{ saved: boolean; strength?: number; reason?: string }>("ch_worker_tutor_save_memory", {
          p_session_id: t.sessionId, p_memory: { kind: str(args.kind, 20), concept: str(args.concept, 120), note: str(args.note, 400) || null },
        });
        return r.saved ? { ok: true, strength: r.strength } : { ok: false, note: r.reason ?? "Não guardei." };
      }
      case "schedule_review": {
        const days = Number.isInteger(args.days) ? (args.days as number) : 3;
        return await svc<Record<string, unknown>>("ch_worker_tutor_schedule_review", { p_session_id: t.sessionId, p_days: days });
      }
      case "wait_for_user":
        // nada a fazer no servidor: o aplicativo não pede nova resposta e o professor fica em silêncio, ouvindo
        return { ok: true, action: "stay_silent" };
    }
    return { error: "Ferramenta desconhecida." };
  } catch (error) {
    t.deps.log?.(`[tutor] ferramenta ${name} falhou: ${(error as Error).message.slice(0, 200)}`);
    if (error instanceof TutorError) return { error: error.message };
    const msg = (error as Error).message ?? "";
    // mensagens do banco que o aluno pode ouvir (limite do teste, questão não aberta…)
    return { error: /teste grátis|limite|Responda|questão|Não há|encerrada|inválid/i.test(msg) ? msg.slice(0, 200) : "Não consegui consultar isso agora." };
  }
}
