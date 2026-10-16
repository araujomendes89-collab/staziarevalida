/**
 * Voice Tutor — Fase 2 (protótipo). Ponte navegador ↔ Gemini Live (Vertex) pelo NOSSO servidor.
 *
 * Por que ponte: o Live do Vertex só aceita o token do Google (conta), que não pode ir ao navegador. O navegador abre um
 * WebSocket com o token TEMPORÁRIO de sessão (server/vozTeste/tokens.ts) e só manda áudio do microfone; quem escolhe modelo,
 * voz, instruções da Durona e detector de fala é o servidor.
 *
 * Protocolo com o navegador:
 *   navegador → servidor: binário = PCM 16 bits mono 16 kHz (microfone); JSON {tipo:"mudo",valor} | {tipo:"texto",texto} | {tipo:"fim"}
 *   servidor → navegador: binário = PCM 16 bits mono 24 kHz (voz do tutor); JSON com eventos REAIS do Live:
 *     pronto · ferramenta {nome} · transcricao {quem:"aluno"|"tutor", texto} · interrompido · turno_completo · geracao_completa ·
 *     uso {turno, sessao, custo_usd} · reconectando · aviso_fim {segundos} · erro {mensagem} · encerrado {motivo}
 */
import type { IncomingMessage } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { instrucoesDurona, nivelValido } from "./durona";
import { configVad, custoLiveUsd, MODELO_LIVE, somarUso, usoDe, vozValida, type UsoLive } from "./liveConfig";
import type { DadosSessao } from "./tokens";
import { DECLARACOES_FERRAMENTAS, EstadoQuestao, QUESTAO_ANAFILAXIA, type QuestaoTeste } from "./questaoTeste";

export interface DepsLive {
  projeto: string;
  regiao: string;
  token: () => Promise<string>;
  maxSessaoS: number;
  log: (o: Record<string, unknown>) => void;
  /** Liga a retomada de sessão do Live (handle do servidor) para reconectar sem perder a conversa. */
  retomada: boolean;
}

const URL_LIVE = (regiao: string) => `wss://${regiao}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`;

/**
 * Setup do Live. Com ferramentas (padrão do protótipo), o caso e a correção vêm do nosso servidor (get_question_context /
 * submit_answer) e o gabarito NUNCA está no prompt; sem ferramentas, o caso vai no prompt sem gabarito.
 */
export function setupLive(d: DadosSessao, deps: Pick<DepsLive, "projeto" | "regiao" | "retomada">, handle?: string, ferramentas = true, questao: QuestaoTeste = QUESTAO_ANAFILAXIA) {
  return {
    setup: {
      model: `projects/${deps.projeto}/locations/${deps.regiao}/publishers/google/models/${MODELO_LIVE}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: vozValida(d.voz) } }, languageCode: "pt-BR" },
      },
      systemInstruction: { parts: [{ text: instrucoesDurona({ nivel: nivelValido(d.nivel), canal: "live", ferramentas, questao, respondida: null }) }] },
      ...(ferramentas ? { tools: [{ functionDeclarations: DECLARACOES_FERRAMENTAS }] } : {}),
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      ...configVad(d.vad === "rapido" ? "rapido" : "padrao"),
      ...(deps.retomada ? { sessionResumption: handle ? { handle } : {} } : {}),
    },
  };
}

/** Atende uma conexão do navegador já autorizada (token verificado antes do upgrade). */
export function atenderNavegador(cliente: WebSocket, dados: DadosSessao, deps: DepsLive): void {
  const inicio = Date.now();
  let google: WebSocket | null = null;
  let pronto = false;
  let encerrado = false;
  let handle: string | undefined;
  let tentativas = 0;
  let mudo = false;
  let sessao: UsoLive = { textoEntrada: 0, audioEntrada: 0, textoSaida: 0, audioSaida: 0, total: 0 };
  let turnos = 0;
  const pendentes: Buffer[] = [];
  const questao = new EstadoQuestao(QUESTAO_ANAFILAXIA);
  const evento = (o: Record<string, unknown>) => cliente.readyState === WebSocket.OPEN && cliente.send(JSON.stringify(o));

  const encerrar = (motivo: string) => {
    if (encerrado) return;
    encerrado = true;
    clearTimeout(limite);
    evento({ tipo: "encerrado", motivo });
    try { google?.close(); } catch { /* nada */ }
    try { cliente.close(1000, motivo.slice(0, 100)); } catch { /* nada */ }
    deps.log({ rota: "live", fim: motivo, duracao_s: Math.round((Date.now() - inicio) / 1000), turnos, uso: sessao, custo_usd: +custoLiveUsd(sessao).toFixed(5), voz: dados.voz, nivel: dados.nivel, vad: dados.vad });
  };
  const limite = setTimeout(() => encerrar(`limite de ${deps.maxSessaoS} s da sessão de teste`), deps.maxSessaoS * 1000);

  const enviarAudio = (pcm: Buffer) => {
    if (!google || google.readyState !== WebSocket.OPEN || !pronto) { if (pendentes.length < 50) pendentes.push(pcm); return; }
    google.send(JSON.stringify({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: pcm.toString("base64") } } }));
  };

  const conectar = async () => {
    let tok: string;
    try { tok = await deps.token(); } catch (e) { evento({ tipo: "erro", mensagem: String((e as Error).message) }); return encerrar("sem token do Google"); }
    if (encerrado) return;
    pronto = false;
    const g = new WebSocket(URL_LIVE(deps.regiao), { headers: { Authorization: `Bearer ${tok}` } });
    google = g;
    g.on("open", () => g.send(JSON.stringify(setupLive(dados, deps, handle))));
    g.on("message", (raw) => {
      let m: Record<string, any>;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.setupComplete) {
        pronto = true;
        tentativas = 0;
        evento({ tipo: "pronto", modelo: MODELO_LIVE, voz: vozValida(dados.voz) });
        while (pendentes.length) enviarAudio(pendentes.shift()!);
        return;
      }
      if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) handle = m.sessionResumptionUpdate.newHandle;
      if (m.usageMetadata) {
        const turno = usoDe(m.usageMetadata);
        sessao = somarUso(sessao, turno);
        turnos++;
        evento({ tipo: "uso", turno, sessao, custo_usd: +custoLiveUsd(sessao).toFixed(5), segundos: Math.round((Date.now() - inicio) / 1000) });
      }
      if (m.toolCall?.functionCalls?.length) {
        const respostas = (m.toolCall.functionCalls as { id: string; name: string; args?: Record<string, unknown> }[]).map((f) => {
          const t = performance.now();
          const response = questao.executar(f.name, f.args ?? {});
          evento({ tipo: "ferramenta", nome: f.name, ms: Math.round(performance.now() - t), ...(f.name === "submit_answer" ? { letra: questao.respondida } : {}) });
          return { id: f.id, name: f.name, response };
        });
        g.send(JSON.stringify({ toolResponse: { functionResponses: respostas } }));
      }
      if (m.goAway) evento({ tipo: "aviso_fim", segundos: parseInt(String(m.goAway.timeLeft ?? "0"), 10) || null });
      const sc = m.serverContent;
      if (!sc) { if (m.error) evento({ tipo: "erro", mensagem: String(m.error.message ?? "erro do Live").slice(0, 200) }); return; }
      if (sc.inputTranscription?.text) evento({ tipo: "transcricao", quem: "aluno", texto: sc.inputTranscription.text, fim: Boolean(sc.inputTranscription.finished) });
      if (sc.outputTranscription?.text) evento({ tipo: "transcricao", quem: "tutor", texto: sc.outputTranscription.text });
      if (sc.interrupted) evento({ tipo: "interrompido" });
      for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data && cliente.readyState === WebSocket.OPEN) cliente.send(Buffer.from(p.inlineData.data, "base64"));
      if (sc.generationComplete) evento({ tipo: "geracao_completa" });
      if (sc.turnComplete) evento({ tipo: "turno_completo" });
    });
    g.on("close", (codigo, motivo) => {
      if (encerrado || google !== g) return;
      // queda do lado do Google: tenta retomar 2 vezes (com o handle, a conversa continua de onde estava)
      if (tentativas < 2) {
        tentativas++;
        evento({ tipo: "reconectando", tentativa: tentativas, codigo });
        setTimeout(() => void conectar(), 400 * tentativas);
      } else encerrar(`Live fechou (${codigo} ${motivo.toString().slice(0, 80)})`);
    });
    g.on("error", (e) => deps.log({ rota: "live", erro_google: String(e).slice(0, 160) }));
  };

  cliente.on("message", (raw, binario) => {
    if (binario) { if (!mudo) enviarAudio(raw as Buffer); return; }
    let m: Record<string, unknown>;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.tipo === "mudo") {
      mudo = Boolean(m.valor);
      // sem áudio, o detector do Google precisa saber que o microfone parou (fecha o turno que estiver aberto)
      if (mudo && google?.readyState === WebSocket.OPEN && pronto) google.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    } else if (m.tipo === "texto" && typeof m.texto === "string" && m.texto.trim() && google?.readyState === WebSocket.OPEN) {
      google.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: m.texto.slice(0, 500) }] }], turnComplete: true } }));
    } else if (m.tipo === "interromper" && google?.readyState === WebSocket.OPEN && pronto) {
      // botão "Interromper": conteúdo do cliente corta a geração em andamento sem pedir resposta nova (turnComplete: false)
      google.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: "(o aluno apertou para interromper; pare e espere ele falar)" }] }], turnComplete: false } }));
    } else if (m.tipo === "fim") encerrar("aluno encerrou");
  });
  cliente.on("close", () => encerrar("navegador fechou"));
  cliente.on("error", () => encerrar("erro no navegador"));
  void conectar();
}

/** Servidor WebSocket sem porta própria (o upgrade vem do servidor HTTP, depois de validar o token). */
export const servidorWsLive = () => new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
export type { IncomingMessage };
