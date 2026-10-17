// BANCADA DO HUMOR A CADA FALA NA VOZ AO VIVO (Tutor natural, parte 2, 17/10/2026): conversas curtas REAIS no Gemini Live pelo
// Vertex, passando pela PONTE de verdade (server/vozPonte/ponte.ts rodando aqui, num WebSocket local), com as instruções montadas
// como o app monta (ficha do personagem + bloco do estado + abertura criada na hora).
// Mede: a sessão não cai (sem "reconectando", "erro" ou fim antes da hora), o 1º áudio do professor depois do fim da fala do aluno
// (comparar com docs/voice-tutor/02-linha-de-base.md: P50 ~0,93–1,0 s) e quando a ponte trocou o estado (contextUpdate).
// Sem ferramentas e sem banco (o conteúdo médico não é o que se mede aqui). Custo: ~US$ 0,02 por conversa.
// Uso: npx tsx scripts/voz-teste/bancada-humor-live.ts <personalidade=durona> <humor=1|0> [rotulo]
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { geminiTts, lerWav, reamostrar, tokenGcloud, vertexEnv, wav } from "./vertex.mjs";
import { NoncesUsados, selarBilhete, type ConteudoBilhete } from "../../server/vozPonte/bilhete";
import { atenderPonte } from "../../server/vozPonte/ponte";
import { composeRealtimeInstructions } from "../../server/tutor/prompts";
import { DEFAULT_EXPLOSIVA, personaFixedLayer, personaStateLayer, personaTurn, resolveProfile, voiceActingLayer } from "../../server/tutor/personalityEngine";
import { humorParaBilhete } from "../../server/tutor/humorVoz";
import { anguloDe, ENTRADAS_BATIDAS } from "../../server/tutor/opening";

const [persona = "durona", humorStr = "1", rotulo = ""] = process.argv.slice(2);
const COM_HUMOR = humorStr !== "0";
const MODELO = process.env.VOZ_LIVE_MODELO || "gemini-3.8-live";
const VOZ = persona === "durao" || persona === "acolhedor" ? "Zubenelgenubi" : "Kore";
const SAIDA = "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/natural/voz-ao-vivo";
fs.mkdirSync(path.join(SAIDA, "falas"), { recursive: true });

// falas do aluno (geradas uma vez pelo Gemini TTS e guardadas): brincadeira, ansiedade e uma conduta errada
const FALAS = [
  { id: "brinca", voz: "Puck", texto: "Tô brincando, professora, é zoeira! Hoje eu vim só pra passar vergonha. Eu daria corticoide primeiro na anafilaxia." },
  { id: "ansiosa", voz: "Aoede", texto: "Ai, eu tô muito ansiosa, não consigo entender nada disso. A prova é daqui a pouco." },
  { id: "pergunta", voz: "Fenrir", texto: "Tá, e por que não pode ser a adrenalina no braço, subcutânea?" },
];
async function falaPcm(f: (typeof FALAS)[number]): Promise<Buffer> {
  const arq = path.join(SAIDA, "falas", `${f.id}.wav`);
  if (!fs.existsSync(arq)) fs.writeFileSync(arq, wav((await geminiTts({ modelo: "gemini-3.8-flash-tts", voz: f.voz, texto: f.texto })).pcm, 24000));
  const w = lerWav(arq);
  return reamostrar(w.pcm, w.rate, 16000);
}

// instruções como o app (realtime.ts, caminho do Vertex)
const resolved = resolveProfile({ personality: persona, explosiva: persona.startsWith("dur") ? { ...DEFAULT_EXPLOSIVA, adultDeclared: true } : null, platform: { maxProfanity: "moderate", explosivaEnabled: true } });
const directive = personaTurn({ resolved, memory: null, rules: [], provider: "gemini_live" });
const estado = personaStateLayer(directive);
const personaTxt = [personaFixedLayer(directive, { personalityId: persona, examples: [] }), estado, voiceActingLayer(persona)].filter(Boolean).join("\n");
const contexto = [
  "SESSÃO: Anafilaxia.", "Tema: Anafilaxia.",
  "ABERTURA DESTA LIGAÇÃO: criada agora, para este aluno e este momento, no jeito da sua ficha (nada de fala pronta). Comece numa frase curta e já puxe o assunto da sessão.",
  `Agora é ${new Date().getHours() < 12 ? "manhã" : new Date().getHours() < 18 ? "tarde" : "noite"} no horário de Brasília.`,
  `Jeito de começar desta vez: ${anguloDe(String(Date.now()), "abertura")}.`,
  `Não comece com entradas batidas (${ENTRADAS_BATIDAS.map((e) => `«${e}»`).join(", ")}), nem com saudação de atendente.`,
].join("\n");
const instrucoes = composeRealtimeInstructions({ mode: "livre", persona: personaTxt, context: contexto, personaId: persona });
const SEG = "b".repeat(48);
const bilhete: ConteudoBilhete = {
  vc: "00000000-0000-4000-8000-000000000b01", u: "00000000-0000-4000-8000-000000000b02", modelo: MODELO, voz: VOZ, instrucoes, ferramentas: [], maxSegundos: 180,
  ...(COM_HUMOR ? { humor: humorParaBilhete({ directive, resolved, rules: [], estado }) } : {}),
};

const { projeto, regiaoLive } = vertexEnv();
const t0 = performance.now();
const ms = () => Math.round(performance.now() - t0);
const trocas: { t: number; estado: string }[] = [];
const logs: Record<string, unknown>[] = [];

const servidor = http.createServer();
const wss = new WebSocketServer({ server: servidor });
wss.on("connection", (ws) => atenderPonte(ws, {
  segredo: SEG, usados: new NoncesUsados(), projeto, regiao: regiaoLive, log: (o) => logs.push(o), tokenGoogle: async () => tokenGcloud(),
  abrirGoogle: (url, headers) => {
    const g = new WebSocket(url, { headers });
    const send = g.send.bind(g);
    // só para medir: quando a ponte trocou o estado (o texto não sai daqui, só a linha do estado)
    (g as unknown as { send: (d: string) => void }).send = (d: string) => {
      if (d.includes('"contextUpdate"')) trocas.push({ t: ms(), estado: (/ESTADO AGORA \(interno, nunca diga\): ([^,]+)/.exec(JSON.parse(d).contextUpdate.systemInstruction.parts[0].text) ?? [])[1] ?? "?" });
      send(d);
    };
    return g;
  },
}));
await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
const porta = (servidor.address() as { port: number }).port;

const falas = await Promise.all(FALAS.map(falaPcm));
const cliente = new WebSocket(`ws://127.0.0.1:${porta}`);
const mandar = (o: unknown) => cliente.readyState === 1 && cliente.send(JSON.stringify(o));
const CHUNK = 1280;
const SIL = Buffer.alloc(CHUNK).toString("base64");
const ev: string[] = [];
const turnos: { fala: string; fimFala: number | null; primeiroAudio: number | null; latencia: number | null; trocasDuranteFala: number; aluno: string; professor: string }[] = [];
let atual = { fala: "abertura", fimFala: null as number | null, primeiroAudio: null as number | null, latencia: null as number | null, trocasDuranteFala: 0, aluno: "", professor: "" };
let silencio: NodeJS.Timeout | null = null;
let proxima = 0;
let terminou: () => void;
const fimConversa = new Promise<void>((ok) => { terminou = ok; });

async function falar(i: number) {
  atual = { fala: FALAS[i].id, fimFala: null, primeiroAudio: null, latencia: null, trocasDuranteFala: 0, aluno: "", professor: "" };
  if (silencio) clearInterval(silencio);
  const antes = trocas.length;
  const pcm = falas[i];
  for (let k = 0; k < pcm.length; k += CHUNK) { mandar({ t: "audio", d: pcm.subarray(k, k + CHUNK).toString("base64") }); await new Promise((r) => setTimeout(r, 40)); }
  atual.fimFala = ms();
  atual.trocasDuranteFala = trocas.length - antes;
  silencio = setInterval(() => mandar({ t: "audio", d: SIL }), 40);
}

cliente.on("open", () => mandar({ t: "abrir", bilhete: selarBilhete(bilhete, SEG).bilhete }));
cliente.on("message", (d) => {
  const m = JSON.parse(d.toString());
  if (m.t !== "audio" && m.t !== "transcricao" && m.t !== "uso") ev.push(`${ms()} ${m.t}`);
  if (m.t === "pronto") {
    atual.fimFala = ms();
    silencio = setInterval(() => mandar({ t: "audio", d: SIL }), 40);
    mandar({ t: "texto", texto: "O aluno acabou de abrir a conversa por voz. Abra do seu jeito, numa frase curta." });
  }
  if (m.t === "audio" && atual.primeiroAudio == null && atual.fimFala != null) { atual.primeiroAudio = ms(); atual.latencia = atual.primeiroAudio - atual.fimFala; }
  if (m.t === "transcricao") { if (m.quem === "tutor") atual.professor += m.texto; else atual.aluno += m.texto; }
  if (m.t === "turno_completo" && atual.primeiroAudio != null) {
    turnos.push({ ...atual });
    if (proxima < FALAS.length) { const i = proxima++; setTimeout(() => void falar(i), 1200); }
    else setTimeout(() => { mandar({ t: "fim" }); }, 800);
  }
  if (m.t === "encerrado") terminou();
});
cliente.on("close", () => terminou());
setTimeout(() => { ev.push(`${ms()} TEMPO ESGOTADO`); mandar({ t: "fim" }); setTimeout(() => terminou(), 2000); }, 120_000);
await fimConversa;
if (silencio) clearInterval(silencio);

const fim = logs.find((l) => l.ponte === "fim") ?? {};
const caiu = ev.some((e) => /reconectando|erro|TEMPO ESGOTADO/.test(e)) || (fim as { motivo?: string }).motivo !== "aluno encerrou";
const resultado = {
  quando: new Date().toISOString(), rotulo, persona, humor: COM_HUMOR, modelo: MODELO, voz: VOZ,
  sessao_caiu: caiu, motivo_fim: (fim as { motivo?: string }).motivo, reaberturas: (fim as { reaberturas?: number }).reaberturas,
  custo_usd: (fim as { custo_usd?: number }).custo_usd, humor_trocas: (fim as { humor_trocas?: number }).humor_trocas, humor_final: (fim as { humor_final?: string }).humor_final,
  turnos, trocas, eventos: ev,
};
fs.appendFileSync(path.join(SAIDA, "resultados.jsonl"), `${JSON.stringify(resultado)}\n`);
console.log(JSON.stringify({ ...resultado, eventos: undefined }, null, 1));
servidor.close();
process.exit(0);
