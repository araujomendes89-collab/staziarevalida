// LINHA DE BASE do Gemini Live pelo Vertex (sem nada do app; só a bateria fixa e as instruções da Durona de teste).
// Para cada fala: conecta, manda a fala em tempo real (pedaços de 40 ms a 16 kHz) e depois "microfone aberto em silêncio",
// mede o primeiro áudio do tutor depois do fim da fala, interrompe 1,5 s depois com a fala "Espera, espera! E a dose?",
// mede quando o servidor avisa a interrupção e o primeiro áudio da resposta nova; guarda o uso de tokens (usageMetadata).
// Uso: npx tsx scripts/voz-teste/bancada-live.ts <config: padrao|rapido> <repeticoes> [ids separados por vírgula]
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import { FALAS, INTERRUPCAO, PASTA } from "./bateria.mjs";
import { lerWav, liveUrl, reamostrar, tokenGcloud, vertexEnv, wav } from "./vertex.mjs";
import { custoUsd, tokensPorModalidade } from "./precos.mjs";
import { instrucoesDurona } from "../../server/vozTeste/durona";
import { configVad, type ConfigVad } from "../../server/vozTeste/liveConfig";
import { DECLARACOES_FERRAMENTAS, EstadoQuestao, QUESTAO_ANAFILAXIA } from "../../server/vozTeste/questaoTeste";

const MODELO = process.env.VOZ_LIVE_MODELO || "gemini-3.8-live";
const VOZ = process.env.VOZ_TUTOR || "Kore";
const [cfgNome = "padrao", repStr = "1", ids] = process.argv.slice(2);
const cfg = cfgNome as ConfigVad;
const repeticoes = Number(repStr) || 1;
const falas = ids ? FALAS.filter((f) => ids.split(",").includes(f.id)) : FALAS;
const saidaDir = path.join(PASTA, "live");
fs.mkdirSync(saidaDir, { recursive: true });
const FERR = process.env.FERRAMENTAS === "1";
const sistema = instrucoesDurona({ nivel: "forte", canal: "live", ferramentas: FERR, questao: QUESTAO_ANAFILAXIA, respondida: null });
const { projeto, regiaoLive } = vertexEnv();

const carregar = (id: string) => { const w = lerWav(path.join(PASTA, "bateria", `${id}.wav`)); return reamostrar(w.pcm, w.rate, 16000); };
const interrupcao = carregar(INTERRUPCAO.id);
const CHUNK = 1280; // 40 ms a 16 kHz, 16 bits
const SILENCIO = Buffer.alloc(CHUNK);

function rodar(falaId: string, rep: number): Promise<Record<string, unknown>> {
  const pergunta = carregar(falaId);
  return new Promise((resolve) => {
    const ws = new WebSocket(liveUrl(regiaoLive), { headers: { Authorization: `Bearer ${tokenGcloud()}` } });
    const t0 = performance.now();
    const ms = () => Math.round(performance.now() - t0);
    const r: Record<string, number | null> = { conectado: null, fimFala: null, primeiroAudio: null, interrompeuIni: null, interrompeuFim: null, avisoInterrompido: null, primeiroAudio2: null, turnoCompleto: null };
    let fase: "fala" | "espera" | "tutor" | "interrompendo" | "espera2" | "fim" = "fala";
    let entrada = "", entrada2 = "", saida = "", saida2 = "";
    const audio: Buffer[] = [];
    const usos: unknown[] = [];
    const ferramentas: string[] = [];
    const estadoQ = new EstadoQuestao(QUESTAO_ANAFILAXIA);
    let ultimoUso: unknown = null;
    let fila: Buffer[] = [];
    const enviarAudio = (b: Buffer) => ws.readyState === 1 && ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: b.toString("base64") } } }));
    // "microfone": a cada 40 ms manda o próximo pedaço da fila ou silêncio (como um microfone aberto de verdade)
    let relogio: NodeJS.Timeout | null = null;
    const ligarMic = () => { relogio = setInterval(() => {
      const b = fila.shift();
      enviarAudio(b ?? SILENCIO);
      if (!b && fase === "fala") { fase = "espera"; r.fimFala = ms(); }
      if (!b && fase === "interrompendo" && r.interrompeuFim == null) { r.interrompeuFim = ms(); fase = "espera2"; }
    }, 40); };
    const encher = (pcm: Buffer) => { for (let i = 0; i < pcm.length; i += CHUNK) fila.push(pcm.subarray(i, i + CHUNK)); };
    const fechar = (motivo: string) => {
      if (fase === "fim") return; fase = "fim";
      if (relogio) clearInterval(relogio);
      try { ws.close(); } catch { /* já fechado */ }
      // o Live manda um usageMetadata por turno do modelo (cada um conta o contexto inteiro daquele turno): a sessão é a SOMA
      const porTurno = usos.map((u) => tokensPorModalidade(u as never));
      const tokens = porTurno.reduce((a, b) => Object.fromEntries(Object.keys(b).map((k) => [k, (a[k] ?? 0) + b[k]])), {} as Record<string, number>);
      void ultimoUso;
      if (rep === 1 && audio.length) fs.writeFileSync(path.join(saidaDir, `${cfg}${FERR ? "-ferr" : ""}-${falaId}.wav`), wav(Buffer.concat(audio), 24000));
      resolve({
        fala: falaId, rep, config: cfg, ferramentas_ligadas: FERR, ferramentas_chamadas: ferramentas, modelo: MODELO, voz: VOZ, motivo,
        primeiro_audio_ms: r.primeiroAudio != null && r.fimFala != null ? r.primeiroAudio - r.fimFala : null,
        aviso_interrupcao_desde_inicio_ms: r.avisoInterrompido != null && r.interrompeuIni != null ? r.avisoInterrompido - r.interrompeuIni : null,
        primeiro_audio_apos_interrupcao_ms: r.primeiroAudio2 != null && r.interrompeuFim != null ? r.primeiroAudio2 - r.interrompeuFim : null,
        conexao_ms: r.conectado,
        entendeu: entrada.trim(), entendeu_interrupcao: entrada2.trim(), respondeu: saida.trim(), respondeu2: saida2.trim(),
        tokens, custo_usd: custoUsd(MODELO, tokens), sessao_s: +(ms() / 1000).toFixed(1), usos: porTurno,
      });
    };
    ws.on("open", () => ws.send(JSON.stringify({ setup: {
      model: `projects/${projeto}/locations/${regiaoLive}/publishers/google/models/${MODELO}`,
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ } }, languageCode: "pt-BR" } },
      systemInstruction: { parts: [{ text: sistema }] },
      inputAudioTranscription: {}, outputAudioTranscription: {},
      ...configVad(cfg),
      ...(FERR ? { tools: [{ functionDeclarations: DECLARACOES_FERRAMENTAS }] } : {}),
    } })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.usageMetadata) { usos.push(m.usageMetadata); ultimoUso = m.usageMetadata; }
      if (m.setupComplete) { r.conectado = ms(); encher(pergunta); ligarMic(); return; }
      if (m.toolCall?.functionCalls?.length) {
        ferramentas.push(...m.toolCall.functionCalls.map((f: { name: string }) => f.name));
        ws.send(JSON.stringify({ toolResponse: { functionResponses: m.toolCall.functionCalls.map((f: { id: string; name: string; args?: Record<string, unknown> }) => ({ id: f.id, name: f.name, response: estadoQ.executar(f.name, f.args ?? {}) })) } }));
      }
      if (m.goAway) return;
      const sc = m.serverContent; if (!sc) { if (m.error) fechar(`erro ${JSON.stringify(m.error).slice(0, 200)}`); return; }
      if (sc.inputTranscription?.text) { if (r.interrompeuIni == null) entrada += sc.inputTranscription.text; else entrada2 += sc.inputTranscription.text; }
      if (sc.outputTranscription?.text) { if (r.interrompeuIni == null) saida += sc.outputTranscription.text; else if (r.avisoInterrompido != null) saida2 += sc.outputTranscription.text; }
      if (sc.interrupted && r.interrompeuIni != null && r.avisoInterrompido == null) r.avisoInterrompido = ms();
      for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data) {
        if (r.primeiroAudio == null) {
          r.primeiroAudio = ms(); fase = "tutor";
          setTimeout(() => { if (fase === "tutor") { r.interrompeuIni = ms(); fase = "interrompendo"; fila = []; encher(interrupcao); } }, 1500);
        } else if (r.avisoInterrompido != null && r.primeiroAudio2 == null && fase === "espera2") r.primeiroAudio2 = ms();
        if (r.interrompeuIni == null) audio.push(Buffer.from(p.inlineData.data, "base64"));
      }
      if (sc.turnComplete && r.primeiroAudio2 != null) setTimeout(() => fechar("ok"), 300);
    });
    ws.on("close", (c, why) => fechar(`fechou ${c} ${why.toString().slice(0, 120)}`));
    ws.on("error", (e) => fechar(`erro ${String(e).slice(0, 160)}`));
    setTimeout(() => fechar("tempo esgotado (40 s)"), 40000);
  });
}

const arq = path.join(saidaDir, "resultados.jsonl");
for (let rep = 1; rep <= repeticoes; rep++) for (const f of falas) {
  const res = await rodar(f.id, rep);
  fs.appendFileSync(arq, JSON.stringify({ quando: new Date().toISOString(), ...res }) + "\n");
  console.log(`${cfg}${FERR ? "+ferr" : ""} ${f.id} rep${rep}: 1º áudio ${res.primeiro_audio_ms} ms · interrupção ${res.aviso_interrupcao_desde_inicio_ms} ms · ${res.motivo} · "${String(res.entendeu).slice(0, 60)}"`);
}
