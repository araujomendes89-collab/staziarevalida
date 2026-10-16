// Conversa com o Gemini Live pelo Vertex mandando as falas do aluno como TEXTO (clientContent), turno a turno, com as
// ferramentas do protótipo (o gabarito só sai por submit_answer). Serve à bateria pedagógica (o que o tutor diz, não o ouvido).
import WebSocket from "ws";
import { liveUrl, tokenGcloud, vertexEnv } from "./vertex.mjs";
import { tokensPorModalidade } from "./precos.mjs";
import { instrucoesDurona, type NivelTeste } from "../../server/vozTeste/durona";
import { DECLARACOES_FERRAMENTAS, EstadoQuestao, type QuestaoTeste } from "../../server/vozTeste/questaoTeste";
import { MODELO_LIVE } from "../../server/vozTeste/liveConfig";

export interface TurnoLive { aluno: string; tutor: string; primeiro_audio_ms: number | null; total_ms: number; audio: Buffer; tokens: Record<string, number>; ferramentas: string[] }

export function conversaLive(o: { nivel: NivelTeste; questao: QuestaoTeste; falas: string[]; voz?: string; ferramentas?: boolean }): Promise<{ turnos: TurnoLive[]; erro?: string }> {
  const { projeto, regiaoLive } = vertexEnv();
  const ferr = o.ferramentas !== false;
  const estado = new EstadoQuestao(o.questao);
  return new Promise((resolve) => {
    const ws = new WebSocket(liveUrl(regiaoLive), { headers: { Authorization: `Bearer ${tokenGcloud()}` } });
    const turnos: TurnoLive[] = [];
    let atual: TurnoLive | null = null;
    let t0 = 0;
    let idx = 0;
    let acabou = false;
    const fim = (erro?: string) => { if (acabou) return; acabou = true; clearTimeout(limite); try { ws.close(); } catch { /* */ } resolve({ turnos, erro }); };
    const limite = setTimeout(() => fim("tempo esgotado"), 30_000 * (o.falas.length + 1));
    const proximo = () => {
      if (idx >= o.falas.length) return fim();
      const fala = o.falas[idx++];
      atual = { aluno: fala, tutor: "", primeiro_audio_ms: null, total_ms: 0, audio: Buffer.alloc(0), tokens: {}, ferramentas: [] };
      t0 = performance.now();
      ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: fala }] }], turnComplete: true } }));
    };
    ws.on("open", () => ws.send(JSON.stringify({ setup: {
      model: `projects/${projeto}/locations/${regiaoLive}/publishers/google/models/${MODELO_LIVE}`,
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: o.voz ?? "Kore" } }, languageCode: "pt-BR" } },
      systemInstruction: { parts: [{ text: instrucoesDurona({ nivel: o.nivel, canal: "live", ferramentas: ferr, questao: o.questao, respondida: null }) }] },
      outputAudioTranscription: {},
      ...(ferr ? { tools: [{ functionDeclarations: DECLARACOES_FERRAMENTAS }] } : {}),
    } })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.setupComplete) return proximo();
      if (m.usageMetadata && atual) {
        const t = tokensPorModalidade(m.usageMetadata);
        for (const [k, v] of Object.entries(t)) atual.tokens[k] = (atual.tokens[k] ?? 0) + (v as number);
      }
      if (m.toolCall?.functionCalls?.length && atual) {
        const calls = m.toolCall.functionCalls as { id: string; name: string; args?: Record<string, unknown> }[];
        atual.ferramentas.push(...calls.map((f) => `${f.name}${f.args && Object.keys(f.args).length ? JSON.stringify(f.args) : ""}`));
        ws.send(JSON.stringify({ toolResponse: { functionResponses: calls.map((f) => ({ id: f.id, name: f.name, response: estado.executar(f.name, f.args ?? {}) })) } }));
      }
      const sc = m.serverContent;
      if (!sc || !atual) { if (m.error) fim(`erro ${JSON.stringify(m.error).slice(0, 200)}`); return; }
      if (sc.outputTranscription?.text) atual.tutor += sc.outputTranscription.text;
      for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data) {
        if (atual.primeiro_audio_ms == null) atual.primeiro_audio_ms = Math.round(performance.now() - t0);
        atual.audio = Buffer.concat([atual.audio, Buffer.from(p.inlineData.data, "base64")]);
      }
      if (sc.turnComplete && atual.audio.length) {
        atual.total_ms = Math.round(performance.now() - t0);
        atual.tutor = atual.tutor.trim();
        turnos.push(atual);
        atual = null;
        setTimeout(proximo, 200);
      }
    });
    ws.on("close", (codigo, porque) => fim(turnos.length < o.falas.length ? `Live fechou antes do fim (${codigo} ${String(porque).slice(0, 160)})` : undefined));
    ws.on("error", (e) => fim(`erro ${String(e).slice(0, 150)}`));
  });
}
