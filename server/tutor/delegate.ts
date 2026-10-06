/**
 * DELEGAÇÃO do GPT-Live (modo "client"). Quando a voz precisa do sistema, ela avisa o aplicativo (session.delegation.created,
 * sem conteúdo); o aplicativo manda para cá o que foi dito desde a última resposta e o servidor responde com o MOTOR DO TUTOR,
 * o mesmo do texto (Truth Engine, avaliação silenciosa, personalidade com o estado da sessão, conferência por software).
 *
 *   say        o que a voz deve dizer, já conferido, em pedaços de até ~400 tokens (limite de cada envio ao GPT-Live)
 *   thinking   contexto silencioso (ex.: o caso e as alternativas da nova questão, para a voz ler sem inventar)
 *   tone       o estado do professor depois deste turno (vai como instrução para a voz seguir o tom)
 *
 * Pedidos sobre a questão (a letra, uma dica, a resolução, a próxima) são reconhecidos aqui, por regra, antes da IA: quem
 * corrige é o banco, nunca a voz nem a personalidade.
 */
import { TutorError, tutorTurn, type TurnResult, type TutorDeps } from "./engine";
import { voiceCall } from "./realtime";

export interface DelegateInput {
  /** Falas transcritas desde a última resposta (o aplicativo junta os pedaços que o GPT-Live manda). */
  transcript: { role: "student" | "tutor"; text: string }[];
  /** Texto digitado no chat da tela de voz (mesma sessão). */
  typed?: string | null;
  /** O que o professor dizia quando o aluno interrompeu, se for o caso. */
  interrupted?: string | null;
}

export type VoiceIntent =
  | { kind: "answer"; option: "A" | "B" | "C" | "D" }
  | { kind: "hint" }
  | { kind: "reveal" }
  | { kind: "next" }
  | { kind: "message" };

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/**
 * O que o aluno pediu, por regra (sem IA). Com a questão aberta: a letra (nunca com "não é a B" nem com duas letras em dúvida),
 * dica ou resolução. Respondida: próxima questão. O resto é conversa (o motor responde).
 */
export function voiceIntent(text: string, questionState: string): VoiceIntent {
  const t = norm(text);
  if (!t) return { kind: "message" };
  if (questionState === "open") {
    if (/\b(resolucao|desisto|me (diz|fala|mostra|da) (a resposta|o gabarito|qual e)|qual (e )?(a resposta|o gabarito)|mostra a resposta)\b/.test(t)) return { kind: "reveal" };
    if (/\b(dica|pista|me (da|de) uma ajuda|me ajuda|uma ajuda|ajuda aqui|to travad[oa]|estou travad[oa])\b/.test(t)) return { kind: "hint" };
    const raw = text.toLowerCase().replace(/\s+/g, " ").trim();
    const negated = /\bnao (e |seria |eh )?(a |o )?(letra |alternativa )?[abcd]\b/.test(t);
    // palavras que anunciam a escolha (sem acento) e o verbo "é" (COM acento: sem ele, "e" é a conjunção "e a C")
    const letters = new Set([
      ...[...t.matchAll(/\b(?:letra|alternativa|opcao|resposta|marco|marquei|marcar|fico com|vou de|vou na|vou com|escolho)\s+(?:e\s+)?(?:a\s+|o\s+|na\s+)?(?:letra\s+|alternativa\s+)?([abcd])\b/g)].map((m) => m[1]),
      ...[...raw.matchAll(/(?:^|[\s,])(?:é|eh|seria)\s+(?:a\s+|o\s+)?(?:letra\s+|alternativa\s+)?([abcd])(?![a-zà-ú])/g)].map((m) => m[1]),
    ]);
    if (/^(a|b|c|d)[.!]?$/.test(t)) letters.add(t[0]);
    // dúvida entre duas ("entre a A e a C"): é conversa, não resposta
    const mentioned = new Set([...letters, ...[...text.matchAll(/\b([A-D])\b/g)].map((m) => m[1].toLowerCase())]);
    if (!negated && letters.size === 1 && mentioned.size === 1) return { kind: "answer", option: [...letters][0].toUpperCase() as "A" | "B" | "C" | "D" };
  }
  if (questionState === "answered" || questionState === "revealed") {
    if (/\b(proxima( questao)?|outra questao|manda (a )?(proxima|outra)|vamos para a proxima|bora pra proxima)\b/.test(t)) return { kind: "next" };
  }
  return { kind: "message" };
}

/** Divide um texto em pedaços de até `max` caracteres, cortando em fim de frase quando dá. */
export function chunks(text: string, max = 1500): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    const slice = rest.slice(0, max);
    const cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "), slice.lastIndexOf("; "));
    const at = cut > max * 0.5 ? cut + 1 : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Fala do aluno para este turno: o digitado, senão as últimas falas dele desde a última do professor. */
export function studentTurnText(input: DelegateInput): string {
  if (typeof input.typed === "string" && input.typed.trim()) return input.typed.trim().slice(0, 2000);
  const list = (Array.isArray(input.transcript) ? input.transcript : []).filter((x) => x && (x.role === "student" || x.role === "tutor") && typeof x.text === "string");
  const tail: string[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role === "tutor") break;
    tail.unshift(list[i].text.trim());
  }
  return tail.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 2000);
}

export interface DelegateResult {
  intent: VoiceIntent["kind"] | "unclear";
  say: string[];
  thinking: string[];
  tone: string | null;
  avatar: TurnResult["message"]["avatar"] | null;
  gate: "explain" | null;
  question_state: string | null;
}

export async function delegateVoice(deps: TutorDeps, userId: string, voiceCallId: string, input: DelegateInput): Promise<DelegateResult> {
  const v = await voiceCall(deps, userId, voiceCallId);
  if (v.status !== "active") throw new TutorError("A conversa por voz foi encerrada.", 409);
  if (v.provider !== "live") throw new TutorError("Esta conversa por voz não usa delegação.", 409);
  const said = studentTurnText(input);
  const base = { thinking: [] as string[], tone: null, avatar: null, gate: null, question_state: null };
  if (!said) {
    // a voz delegou mas não há fala transcrita (áudio cortado): pedir para repetir é melhor do que inventar
    return { ...base, intent: "unclear", say: ["Não peguei direito o que você disse. Repete a última parte?"] };
  }
  const svc = <T>(fn: string, a: Record<string, unknown>) => deps.db.service<T>(fn, { p_user: userId, ...a });
  const q = await svc<{ state?: string } | null>("ch_worker_tutor_tool_question", { p_session_id: v.session_id, p_reveal: false });
  const intent = voiceIntent(said, q?.state ?? "none");
  const turn = (action: Parameters<typeof tutorTurn>[3]) => tutorTurn(deps, userId, v.session_id, { ...action, voice: true, voiceCallId });
  const out = (kind: DelegateResult["intent"], t: TurnResult, thinking: string[] = []): DelegateResult => ({
    intent: kind, say: chunks(t.message.spoken || t.message.content), thinking, tone: t.tone ? t.tone.slice(0, 1800) : null,
    avatar: t.message.avatar, gate: t.gate, question_state: t.question_state,
  });

  switch (intent.kind) {
    case "answer": {
      // quem corrige é o banco; o professor reage ao resultado já gravado
      await svc("ch_worker_tutor_answer_as", { p_session_id: v.session_id, p_option: intent.option, p_confidence: null });
      return out("answer", await turn({ type: "react" }));
    }
    case "hint":
      return out("hint", await turn({ type: "hint" }));
    case "reveal":
      return out("reveal", await turn({ type: "reveal" }));
    case "next": {
      const next = await svc<{ question?: { statement?: string; options?: { id: string; text: string }[] } | null; opening?: string | null }>("ch_worker_tutor_next_as", { p_session_id: v.session_id });
      const nq = next?.question;
      const caseText = nq?.statement
        ? `Leia para o aluno, com naturalidade e sem dar a resposta, o caso e as alternativas desta questão: ${nq.statement} ${(nq.options ?? []).map((o) => `Alternativa ${o.id}: ${o.text}.`).join(" ")}`
        : "";
      return { ...base, intent: "next", say: chunks(next?.opening ?? "Vamos para a próxima."), thinking: chunks(caseText, 1600), question_state: nq ? "open" : null };
    }
    default:
      return out("message", await turn({ type: "message", text: said, interrupted: input.interrupted ?? null }));
  }
}
