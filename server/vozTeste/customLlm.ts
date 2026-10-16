/**
 * Voice Tutor — Fase 2 (protótipo). Endpoint "Custom LLM" no formato OpenAI Chat Completions com streaming SSE, que é o que a
 * ElevenLabs Agents consome (doc oficial: elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm — "data: {json}\n\n" e
 * termina com "data: [DONE]\n\n", Content-Type text/event-stream).
 *
 * Regras do protótipo:
 * - Só responde com o segredo compartilhado (Authorization: Bearer <VOZ_LLM_SEGREDO>); sem segredo configurado, recusa tudo.
 * - O prompt é NOSSO (Durona de teste, server/vozTeste/durona.ts): as mensagens "system" que chegam da ElevenLabs são ignoradas,
 *   para que nada configurado lá fora (nem override do navegador) mude regra médica ou personalidade.
 * - Conferência por FRASE antes de mandar (languageViolations do Tutor atual): frase com ataque pessoal ou palavrão acima do
 *   nível não sai. A voz começa a falar na primeira frase aprovada (não espera a resposta inteira).
 * - Dados de TESTE fixos, sem aluno real, sem banco.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { languageViolations } from "../tutor/safety";
import type { ProfanityLevel } from "../tutor/personality";
import { camadaDurona, instrucoesDurona, nivelValido, type NivelTeste } from "./durona";
import { letraDita, QUESTAO_ANAFILAXIA, type QuestaoTeste } from "./questaoTeste";
import { bearer, segredoConfere } from "./tokens";
import type { MensagemGemini, PedacoGemini } from "./vertexTexto";

type ParteOpenAI = { type?: string; text?: string };
export interface MensagemOpenAI { role: string; content?: string | ParteOpenAI[] | null }

const textoDe = (c: MensagemOpenAI["content"]): string =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p?.type === "text" || p?.text ? p.text ?? "" : "")).join("") : "";

/** Conversa da ElevenLabs → conteúdo do Gemini. Ignora "system"/"tool"/"developer"; junta papéis repetidos; começa pelo aluno. */
export function mensagensParaGemini(msgs: MensagemOpenAI[]): MensagemGemini[] {
  const out: MensagemGemini[] = [];
  for (const m of msgs ?? []) {
    const role = m?.role === "user" ? "user" : m?.role === "assistant" ? "model" : null;
    const texto = textoDe(m?.content).trim();
    if (!role || !texto) continue;
    const ult = out.at(-1);
    if (ult && ult.role === role) ult.parts[0].text += `\n${texto}`;
    else out.push({ role, parts: [{ text: texto }] });
  }
  if (!out.length || out[0].role !== "user") out.unshift({ role: "user", parts: [{ text: "(o aluno entrou na conversa)" }] });
  return out;
}

/**
 * Prepara um turno: prompt da Durona no nível pedido, conversa no formato do Gemini e o "Truth Engine" do protótipo
 * (a letra que o aluno disse é detectada no SERVIDOR; só então o gabarito entra no contexto).
 */
export function prepararTurno(msgs: MensagemOpenAI[], nivel: NivelTeste, questao: QuestaoTeste, reacoes: string[]) {
  const letras = Object.keys(questao.alternativas);
  let respondida: string | null = null;
  for (const m of msgs ?? []) if (m?.role === "user" && !respondida) respondida = letraDita(textoDe(m.content), letras);
  const { palavrao } = camadaDurona(nivel);
  const sistema = instrucoesDurona({ nivel, canal: "texto", questao, respondida, reacoes });
  return { sistema, contents: mensagensParaGemini(msgs), palavrao, respondida };
}

/** Corta o texto que chega em pedaços em FRASES (fim por . ! ? … ou quebra de linha; frase longa demais sai na última vírgula/espaço). */
export class Fraseador {
  private buf = "";
  constructor(private maxChars = 160) {}
  empurrar(t: string): string[] {
    this.buf += t;
    const prontas: string[] = [];
    for (;;) {
      const m = /[.!?…]+["»”)]*\s+|\n+/.exec(this.buf);
      if (m) {
        const fim = m.index + m[0].length;
        const f = this.buf.slice(0, fim);
        this.buf = this.buf.slice(fim);
        if (f.trim()) prontas.push(f);
        continue;
      }
      if (this.buf.length > this.maxChars) {
        const corte = Math.max(this.buf.lastIndexOf(", ", this.maxChars), this.buf.lastIndexOf(" ", this.maxChars));
        const fim = corte > 20 ? corte + 1 : this.maxChars;
        prontas.push(this.buf.slice(0, fim));
        this.buf = this.buf.slice(fim);
        continue;
      }
      return prontas;
    }
  }
  resto(): string {
    const r = this.buf;
    this.buf = "";
    return r.trim() ? r : "";
  }
}

/** Limpa uma frase antes de ir para a voz: tira marcações não autorizadas, markdown e confere a linguagem. */
export function conferirFrase(frase: string, palavrao: ProfanityLevel, reacoes: string[]): { texto: string | null; violacoes: string[] } {
  const permitidas = new Set(reacoes.map((r) => r.toLowerCase()));
  let t = frase.replace(/\[[^\]]{1,40}\]/g, (tag) => (permitidas.has(tag.toLowerCase()) ? tag : "")).replace(/[*_#`]+/g, "");
  if (!t.trim()) return { texto: null, violacoes: [] };
  const v = languageViolations(t, palavrao);
  if (v.length) return { texto: null, violacoes: v.map((x) => x.code) };
  t = t.replace(/ {2,}/g, " ");
  return { texto: t, violacoes: [] };
}

export const pedacoSse = (id: string, modelo: string, criado: number, delta: Record<string, unknown>, fim: string | null = null, uso?: Record<string, number>) =>
  `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: criado, model: modelo, choices: [{ index: 0, delta, finish_reason: fim }], ...(uso ? { usage: uso } : {}) })}\n\n`;

export interface DepsCustomLlm {
  segredo: string | undefined;
  /** Gera o texto (Vertex em produção; falso nos testes). */
  gerar: (o: { sistema: string; contents: MensagemGemini[]; signal: AbortSignal }) => AsyncIterable<PedacoGemini>;
  modelo: string;
  reacoes: string[];
  /** Questão de teste da sessão (padrão: anafilaxia). */
  questao?: QuestaoTeste;
  /** "frase" (padrão: confere cada frase antes de mandar) ou "token" (manda na hora, sem conferência; só para medir). */
  fluxo: "frase" | "token";
  /** Primeiro pedaço de enchimento (dica oficial da ElevenLabs: terminar em "... " com espaço). Vazio = desligado. */
  enchimento: string;
  log: (o: Record<string, unknown>) => void;
  agora?: () => number;
}

async function lerCorpo(req: IncomingMessage, limite = 512 * 1024): Promise<string> {
  let tam = 0;
  const partes: Buffer[] = [];
  for await (const p of req) {
    tam += (p as Buffer).length;
    if (tam > limite) throw Object.assign(new Error("corpo grande demais"), { status: 413 });
    partes.push(p as Buffer);
  }
  return Buffer.concat(partes).toString("utf8");
}

const erroJson = (res: ServerResponse, status: number, mensagem: string) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: { message: mensagem, type: status === 401 ? "invalid_request_error" : "server_error" } }));
};

export async function tratarChatCompletions(req: IncomingMessage, res: ServerResponse, d: DepsCustomLlm): Promise<void> {
  const agora = d.agora ?? (() => performance.now());
  const t0 = agora();
  if (!d.segredo || d.segredo.length < 32) return erroJson(res, 503, "Custom LLM sem segredo configurado (VOZ_LLM_SEGREDO).");
  if (!segredoConfere(bearer(req.headers.authorization), d.segredo)) return erroJson(res, 401, "não autorizado");
  let corpo: Record<string, unknown>;
  try {
    corpo = JSON.parse(await lerCorpo(req));
  } catch (e) {
    return erroJson(res, (e as { status?: number }).status ?? 400, "JSON inválido");
  }
  const extra = (corpo.elevenlabs_extra_body ?? {}) as Record<string, unknown>;
  const nivel = nivelValido(extra.nivel);
  const { sistema, contents, palavrao, respondida } = prepararTurno((corpo.messages ?? []) as MensagemOpenAI[], nivel, d.questao ?? QUESTAO_ANAFILAXIA, d.reacoes);
  const stream = corpo.stream !== false;
  const id = `chatcmpl-${randomUUID()}`;
  const criado = Math.floor(Date.now() / 1000);
  const modelo = String(corpo.model ?? d.modelo);
  const ctrl = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ctrl.abort(); });

  const met: Record<string, unknown> = { rota: "chat/completions", nivel, stream, fluxo: d.fluxo, msgs: contents.length, respondida };
  let primeiroTokenGemini: number | null = null;
  let primeiroEnvio: number | null = null;
  let completo = "";
  let uso: Record<string, unknown> | null = null;
  const barradas: string[] = [];

  const escrever = (texto: string) => {
    if (!texto) return;
    if (primeiroEnvio == null) primeiroEnvio = agora();
    completo += texto;
    if (stream) res.write(pedacoSse(id, modelo, criado, { content: texto }));
  };

  if (stream) {
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write(pedacoSse(id, modelo, criado, { role: "assistant", content: "" }));
    if (d.enchimento) escrever(d.enchimento);
  }
  const frases = new Fraseador();
  const mandarFrase = (f: string) => {
    const c = conferirFrase(f, palavrao, d.reacoes);
    if (c.texto) escrever(c.texto);
    else if (c.violacoes.length) barradas.push(...c.violacoes);
  };
  try {
    for await (const p of d.gerar({ sistema, contents, signal: ctrl.signal })) {
      if (p.uso) uso = p.uso;
      if (!p.texto) continue;
      if (primeiroTokenGemini == null) primeiroTokenGemini = agora();
      if (d.fluxo === "token") escrever(p.texto);
      else for (const f of frases.empurrar(p.texto)) mandarFrase(f);
    }
    if (d.fluxo !== "token") { const r = frases.resto(); if (r) mandarFrase(r); }
    if (!completo.trim() || (d.enchimento && completo.trim() === d.enchimento.trim())) escrever(barradas.length ? "Hum. Deixa eu reformular: me diz de novo o que você marcou." : "Repete pra mim?");
  } catch (e) {
    met.erro = String((e as Error).message ?? e).slice(0, 200);
    if (ctrl.signal.aborted) met.erro = "cliente desconectou (interrupção)";
    else if (!completo) escrever("Caiu alguma coisa aqui. Repete?");
  }
  const usoOpenAi = uso
    ? { prompt_tokens: Number(uso.promptTokenCount ?? 0), completion_tokens: Number(uso.candidatesTokenCount ?? 0), total_tokens: Number(uso.totalTokenCount ?? 0) }
    : undefined;
  if (stream) {
    if (!res.writableEnded && !ctrl.signal.aborted) {
      res.write(pedacoSse(id, modelo, criado, {}, "stop", usoOpenAi));
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } else {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ id, object: "chat.completion", created: criado, model: modelo, choices: [{ index: 0, message: { role: "assistant", content: completo }, finish_reason: "stop" }], ...(usoOpenAi ? { usage: usoOpenAi } : {}) }));
  }
  d.log({
    ...met,
    primeiro_token_vertex_ms: primeiroTokenGemini != null ? Math.round(primeiroTokenGemini - t0) : null,
    primeiro_envio_ms: primeiroEnvio != null ? Math.round(primeiroEnvio - t0) : null,
    total_ms: Math.round(agora() - t0),
    barradas,
    chars: completo.length,
    uso,
  });
}
