// LEVANTAMENTO 3 do "cérebro" do Tutor (17/10/2026): recursos do Gemini Live (Vertex, gemini-3.8-live) para esconder a latência
// quando a resposta depende de consulta ao conhecimento. Só bancada: sem banco, sem aluno, sem nada do app no ar.
//
// Modos (um por execução):
//   ferramenta  -> chamada de função BLOQUEANTE x NÃO BLOQUEANTE (behavior NON_BLOCKING + scheduling INTERRUPT/WHEN_IDLE/SILENT),
//                  com a ferramenta demorando 100, 300 e 800 ms. Mede 1º áudio (qualquer), 1º áudio depois do resultado, se a
//                  professora falou enquanto a ferramenta rodava e se a resposta usou o resultado (cita a seção "4.2").
//   contexto    -> material do tema pré-carregado nas instruções (0, 2k, 8k, 20k, 40k tokens): tempo de abertura e 1º áudio
//                  da 1ª e da 2ª pergunta (efeito do cache de prefixo interno), tokens cobrados e tokens "em cache".
//   injecao     -> material colocado NO MEIO da sessão: (a) contextUpdate.systemInstruction; (b) clientContent sem turnComplete.
//   antecipada  -> pergunta falada (bateria 03); o trecho é injetado (clientContent, turnComplete false) enquanto o aluno fala
//                  ("durante") ou logo depois ("depois"), sem ferramenta; compara com "controle". Mede 1º áudio após o fim da fala.
//
// Uso: npx tsx scripts/voz-teste/live-recursos-cerebro.ts <modo> [repeticoes] [filtro]
//   ferramenta: filtro = lista separada por vírgula com variantes (padrao,blocking,nb-interrupt,nb-when_idle,nb-silent,
//               nb-interrupt-fora), atrasos em ms (100,300,800), instruções de espera (i:espera,i:primeiro,i:sem) e/ou "audio"
//               para mandar a pergunta como fala gravada (bateria 03) em vez de texto.
//   contexto:   filtro = tamanhos em milhares de tokens (ex.: 0,2,8,20,40).
// Saída: $SAIDA (padrão /Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro/dados/<modo>.jsonl). Token do gcloud, nunca impresso.
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import { lerWav, liveUrl, reamostrar, tokenGcloud, vertexEnv } from "./vertex.mjs";
import { custoUsd, tokensPorModalidade } from "./precos.mjs";

const MODELO = process.env.VOZ_LIVE_MODELO || "gemini-3.8-live";
const VOZ = process.env.VOZ_TUTOR || "Kore";
const SAIDA = process.env.SAIDA || "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro/dados";
const BATERIA = "/Volumes/StaziaMed/.tmp-aulas/voice-tutor/linha-de-base/bateria";
const FONTES_MATERIAL = (process.env.MATERIAL_DIR || "/Volumes/StaziaMed/.tmp-aulas/aulas-revisao-1610");
const { projeto, regiaoLive } = vertexEnv();
fs.mkdirSync(SAIDA, { recursive: true });

type Msg = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const agora = () => performance.now();
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ sessão genérica
interface Sessao {
  ws: WebSocket; setupMs: number | null; erro: string | null; usos: Msg[]; fechada: boolean;
  aoMsg: ((m: Msg) => void) | null; enviar: (o: unknown) => void; fechar: () => void;
}
function abrir(setup: Msg): Promise<Sessao> {
  return new Promise((resolve) => {
    const t0 = agora();
    const ws = new WebSocket(liveUrl(regiaoLive), { headers: { Authorization: `Bearer ${tokenGcloud()}` } });
    const s: Sessao = {
      ws, setupMs: null, erro: null, usos: [], fechada: false, aoMsg: null,
      enviar: (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); },
      fechar: () => { s.fechada = true; try { ws.close(); } catch { /* */ } },
    };
    const limite = setTimeout(() => { s.erro = s.erro ?? "abertura demorou > 20 s"; resolve(s); }, 20_000);
    ws.on("open", () => s.enviar({ setup: { model: `projects/${projeto}/locations/${regiaoLive}/publishers/google/models/${MODELO}`, ...setup } }));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.usageMetadata) s.usos.push(m.usageMetadata);
      if (m.setupComplete) { s.setupMs = Math.round(agora() - t0); clearTimeout(limite); resolve(s); return; }
      if (m.error) s.erro = JSON.stringify(m.error).slice(0, 300);
      s.aoMsg?.(m);
    });
    ws.on("close", (c, why) => { s.fechada = true; if (!s.erro && s.setupMs == null) s.erro = `fechou ${c} ${String(why).slice(0, 200)}`; else if (c !== 1000 && c !== 1005) s.erro = s.erro ?? `fechou ${c} ${String(why).slice(0, 200)}`; clearTimeout(limite); resolve(s); });
    ws.on("error", (e) => { s.erro = `erro ${String(e).slice(0, 200)}`; });
  });
}
function somaUso(usos: Msg[]) {
  const por = usos.map((u) => tokensPorModalidade(u));
  const tot = por.reduce((a: Record<string, number>, b: Record<string, number>) => Object.fromEntries(Object.keys(b).map((k) => [k, (a[k] ?? 0) + b[k]])), {} as Record<string, number>);
  return { tokens: tot, custo_usd: custoUsd(MODELO, tot), prompt_por_turno: usos.map((u) => u.promptTokenCount ?? null), cache_por_turno: usos.map((u) => u.cachedContentTokenCount ?? 0) };
}
const geracao = { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ } }, languageCode: "pt-BR" } };

// ------------------------------------------------------------------ 1) ferramenta bloqueante x não bloqueante
// Três instruções de espera: "espera" (pode dizer uma frase curta enquanto a busca roda), "primeiro" (chame a ferramenta ANTES de
// falar qualquer coisa e só depois diga a frase de espera) e "sem" (nenhuma menção a frase de espera).
type Instr = "espera" | "primeiro" | "sem";
const NUCLEO_FERRAMENTA = [
  "Você é a Stazia, professora de medicina do StaziaMed (preparação para o Revalida). Fale sempre em português do Brasil, curto (no máximo 2 frases por fala).",
  "Para QUALQUER pergunta médica com número, dose, critério ou conduta, chame a ferramenta buscar_conhecimento com a pergunta do aluno ANTES de dar o dado.",
  "Use só o que a ferramenta devolver e cite a fonte em voz (título e seção). Nunca invente número.",
];
const ESPERA: Record<Instr, string> = {
  espera: "Se a busca estiver rodando, você pode dizer uma frase curtinha e natural de espera (por exemplo: 'deixa eu ver aqui no material') e aguardar o resultado.",
  primeiro: "Ordem obrigatória: PRIMEIRO emita a chamada buscar_conhecimento, sem dizer nada antes; DEPOIS da chamada, enquanto o resultado não chega, diga só uma frase curtinha de espera (por exemplo: 'deixa eu ver aqui no material') e aguarde o resultado.",
  sem: "",
};
const instrucaoFerramenta = (i: Instr) => [...NUCLEO_FERRAMENTA, ESPERA[i]].filter(Boolean).join("\n");
const RESULTADO = {
  titulo: "Protocolo de Teste StaziaMed: Anafilaxia", ano: 2026, secao: "4.2",
  trecho: "Adrenalina intramuscular na face anterolateral da coxa: 0,01 mg/kg, máximo 0,5 mg no adulto; pode repetir a cada 5 a 15 minutos se não houver melhora.",
};
const PERGUNTA_TEXTO = "Professora, qual é a dose de adrenalina na anafilaxia do adulto? Procura no material pra mim.";
const AUDIO_PERGUNTA = "03"; // "Qual é a dose de adrenalina no adulto?"
type Variante = "padrao" | "blocking" | "nb-interrupt" | "nb-when_idle" | "nb-silent" | "nb-interrupt-fora";
const VARIANTES: Variante[] = ["padrao", "blocking", "nb-interrupt", "nb-when_idle", "nb-silent"];

function declaracao(v: Variante) {
  const d: Msg = {
    name: "buscar_conhecimento",
    description: "Busca no conhecimento aprovado do StaziaMed (aulas, diretrizes, protocolos) o trecho que responde à pergunta. Devolve título, ano, seção e trecho.",
    parameters: { type: "OBJECT", properties: { pergunta: { type: "STRING", description: "A dúvida do aluno, em uma frase." } }, required: ["pergunta"] },
  };
  if (v === "blocking") d.behavior = "BLOCKING";
  else if (v !== "padrao") d.behavior = "NON_BLOCKING";
  return d;
}
function respostaFerramenta(v: Variante, f: { id: string; name: string }) {
  const sched = v === "nb-interrupt" || v === "nb-interrupt-fora" ? "INTERRUPT" : v === "nb-when_idle" ? "WHEN_IDLE" : v === "nb-silent" ? "SILENT" : null;
  if (!sched) return { id: f.id, name: f.name, response: { result: RESULTADO } };
  // a doc do Gemini API põe "scheduling" DENTRO de response (ao lado de result); o tipo FunctionResponse do SDK também tem o campo
  // de fora. "nb-interrupt-fora" testa o campo de fora.
  if (v === "nb-interrupt-fora") return { id: f.id, name: f.name, response: { result: RESULTADO }, scheduling: sched };
  return { id: f.id, name: f.name, response: { result: RESULTADO, scheduling: sched } };
}
const usouResultado = (t: string) => /4[.,]2|quatro ponto dois|0[,.]5|meio miligrama|zero v[ií]rgula cinco|0[,.]01|protocolo/i.test(t);

async function rodarFerramenta(v: Variante, atrasoMs: number, comAudio: boolean, rep: number, instr: Instr) {
  const s = await abrir({
    generationConfig: geracao, systemInstruction: { parts: [{ text: instrucaoFerramenta(instr) }] },
    outputAudioTranscription: {}, inputAudioTranscription: {}, tools: [{ functionDeclarations: [declaracao(v)] }],
  });
  const base = { quando: new Date().toISOString(), modo: "ferramenta", variante: v, atraso_ms: atrasoMs, entrada: comAudio ? "audio" : "texto", instrucao: instr, rep, modelo: MODELO, setup_ms: s.setupMs };
  if (s.setupMs == null) { s.fechar(); return { ...base, erro: s.erro }; }
  return new Promise<Msg>((resolve) => {
    let t0 = 0; // texto: envio; áudio: fim da fala
    const ev: { t: number; e: string }[] = [];
    const ms = () => (t0 ? Math.round(agora() - t0) : -1);
    let tCall: number | null = null, tResp: number | null = null, tAudio1: number | null = null, tAudioPos: number | null = null;
    let falaAntes = "", falaDepois = "", entendeu = "";
    let chamadas = 0, cancelamentos = 0, turnosCompletos = 0;
    let acabou = false; let relogio: NodeJS.Timeout | null = null;
    const fim = (motivo: string) => {
      if (acabou) return; acabou = true; if (relogio) clearInterval(relogio); clearTimeout(lim);
      setTimeout(() => {
        s.fechar();
        resolve({ ...base, motivo, erro: s.erro, chamou_ferramenta: chamadas, cancelamentos, turnos_completos: turnosCompletos,
          chamada_ms: tCall, resultado_enviado_ms: tResp, primeiro_audio_ms: tAudio1, primeiro_audio_depois_resultado_ms: tAudioPos,
          falou_antes_do_resultado: tAudio1 != null && (tResp == null || tAudio1 < tResp),
          espera_silenciosa_ms: tAudio1 != null && tCall != null && tAudio1 > tCall ? tAudio1 - tCall : null,
          usou_resultado: usouResultado(falaDepois), fala_antes: falaAntes.trim(), fala_depois: falaDepois.trim(), entendeu: entendeu.trim(),
          eventos: ev, ...somaUso(s.usos) });
      }, 400);
    };
    const lim = setTimeout(() => fim("tempo esgotado (25 s)"), 25_000);
    let idle: NodeJS.Timeout | null = null;
    const armarIdle = (msIdle: number) => { if (idle) clearTimeout(idle); idle = setTimeout(() => fim(`ocioso ${msIdle} ms`), msIdle); };
    s.aoMsg = (m) => {
      if (m.toolCall?.functionCalls?.length) {
        const calls = m.toolCall.functionCalls as { id: string; name: string; args?: Msg }[];
        chamadas += calls.length; if (tCall == null) tCall = ms(); ev.push({ t: ms(), e: `toolCall ${calls.map((c) => c.name + JSON.stringify(c.args ?? {})).join(";").slice(0, 160)}` });
        setTimeout(() => {
          if (acabou) return;
          s.enviar({ toolResponse: { functionResponses: calls.map((c) => respostaFerramenta(v, c)) } });
          if (tResp == null) tResp = ms(); ev.push({ t: ms(), e: "toolResponse enviado" });
          armarIdle(v === "nb-silent" ? 6000 : 12000);
        }, atrasoMs);
      }
      if (m.toolCallCancellation) { cancelamentos++; ev.push({ t: ms(), e: `toolCallCancellation ${JSON.stringify(m.toolCallCancellation.ids ?? [])}` }); }
      const sc = m.serverContent; if (!sc) return;
      if (sc.inputTranscription?.text) entendeu += sc.inputTranscription.text;
      if (sc.outputTranscription?.text) { if (tResp == null) falaAntes += sc.outputTranscription.text; else falaDepois += sc.outputTranscription.text; }
      for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data) {
        if (tAudio1 == null) { tAudio1 = ms(); ev.push({ t: tAudio1, e: "1º áudio" }); }
        if (tResp != null && tAudioPos == null) { tAudioPos = ms(); ev.push({ t: tAudioPos, e: "1º áudio depois do resultado" }); }
        if (tResp != null) armarIdle(3000); // a resposta está saindo: encerra 3 s depois do último pedaço se não vier turnComplete
      }
      if (sc.interrupted) ev.push({ t: ms(), e: "interrupted" });
      if (sc.generationComplete) ev.push({ t: ms(), e: "generationComplete" });
      if (sc.turnComplete) {
        turnosCompletos++; ev.push({ t: ms(), e: "turnComplete" });
        if (tResp != null && tAudioPos != null) fim("ok");
        else if (chamadas === 0 && tAudio1 != null) armarIdle(4000); // respondeu sem chamar: espera um pouco para ver se ainda chama
      }
    };
    if (!comAudio) { t0 = agora(); s.enviar({ clientContent: { turns: [{ role: "user", parts: [{ text: PERGUNTA_TEXTO }] }], turnComplete: true } }); return; }
    // áudio: a fala gravada em pedaços de 40 ms e depois "microfone aberto em silêncio" (como bancada-live.ts)
    const w = lerWav(path.join(BATERIA, `${AUDIO_PERGUNTA}.wav`)); const pcm = reamostrar(w.pcm, w.rate, 16000);
    const fila: Buffer[] = []; for (let i = 0; i < pcm.length; i += 1280) fila.push(pcm.subarray(i, i + 1280));
    const sil = Buffer.alloc(1280);
    relogio = setInterval(() => {
      const b = fila.shift();
      s.enviar({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: (b ?? sil).toString("base64") } } });
      if (!b && !t0) t0 = agora();
    }, 40);
  });
}

// ------------------------------------------------------------------ 2) material pré-carregado (tamanho x latência)
const AGULHA = "CÓDIGO DE CONFERÊNCIA DESTE MATERIAL (só para teste): tucano quatrocentos e dezoito.";
let textoFonte = "";
function fonteMaterial() {
  if (textoFonte) return textoFonte;
  const pastas = fs.readdirSync(FONTES_MATERIAL).filter((d) => /^GR-\d+$/.test(d)).sort();
  textoFonte = pastas.map((d) => path.join(FONTES_MATERIAL, d, "1-texto-do-aluno.md")).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n\n");
  return textoFonte;
}
const CHARS_POR_TOKEN = Number(process.env.CHARS_POR_TOKEN || 3.6); // calibrado pelo promptTokenCount devolvido
function material(milTokens: number) {
  if (!milTokens) return "";
  const t = fonteMaterial().slice(0, Math.round(milTokens * 1000 * CHARS_POR_TOKEN));
  if (t.length < milTokens * 1000 * CHARS_POR_TOKEN * 0.95) throw new Error(`fonte curta: ${t.length} caracteres`);
  const meio = Math.floor(t.length / 2);
  return `${t.slice(0, meio)}\n\n${AGULHA}\n\n${t.slice(meio)}`;
}
const BASE_CONTEXTO = "Você é a Stazia, professora de medicina do StaziaMed. Fale sempre em português do Brasil, curto (no máximo 2 frases). Responda só com base no MATERIAL DO TEMA abaixo quando a pergunta for sobre ele.";
const PERGUNTAS_CONTEXTO = [
  "Qual é o código de conferência deste material? Fala só o código.",
  "Me diz em uma frase qual é o tema principal do material.",
];

async function turnoTexto(s: Sessao, texto: string, limiteMs = 20_000): Promise<{ primeiro_audio_ms: number | null; total_ms: number | null; fala: string; erro?: string }> {
  return new Promise((resolve) => {
    const t0 = agora(); let a1: number | null = null; let fala = ""; let ok = false;
    const lim = setTimeout(() => { if (!ok) { ok = true; resolve({ primeiro_audio_ms: a1, total_ms: null, fala, erro: s.erro ?? "tempo esgotado" }); } }, limiteMs);
    s.aoMsg = (m) => {
      const sc = m.serverContent; if (!sc) return;
      if (sc.outputTranscription?.text) fala += sc.outputTranscription.text;
      for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data && a1 == null) a1 = Math.round(agora() - t0);
      if (sc.turnComplete && a1 != null && !ok) { ok = true; clearTimeout(lim); resolve({ primeiro_audio_ms: a1, total_ms: Math.round(agora() - t0), fala: fala.trim() }); }
    };
    s.enviar({ clientContent: { turns: [{ role: "user", parts: [{ text: texto }] }], turnComplete: true } });
  });
}
const achouAgulha = (t: string) => /tucano|418|quatrocentos e dezoito/i.test(t);

async function rodarContexto(milTokens: number, rep: number) {
  const mat = material(milTokens);
  const sistema = mat ? `${BASE_CONTEXTO}\n\n### MATERIAL DO TEMA\n${mat}` : BASE_CONTEXTO;
  const s = await abrir({ generationConfig: geracao, systemInstruction: { parts: [{ text: sistema }] }, outputAudioTranscription: {} });
  const base = { quando: new Date().toISOString(), modo: "contexto", mil_tokens_alvo: milTokens, caracteres: sistema.length, rep, modelo: MODELO, setup_ms: s.setupMs };
  if (s.setupMs == null) { s.fechar(); return { ...base, erro: s.erro }; }
  const turnos = [];
  for (const p of PERGUNTAS_CONTEXTO) { turnos.push(await turnoTexto(s, p)); await esperar(300); }
  await esperar(600); s.fechar();
  return { ...base, erro: s.erro, turnos, achou_agulha: achouAgulha(turnos[0]?.fala ?? ""), ...somaUso(s.usos) };
}

// ------------------------------------------------------------------ 3) material injetado no meio da sessão
async function rodarInjecao(como: "contextUpdate" | "clientContent", milTokens: number, rep: number) {
  const s = await abrir({ generationConfig: geracao, systemInstruction: { parts: [{ text: BASE_CONTEXTO }] }, outputAudioTranscription: {} });
  const base = { quando: new Date().toISOString(), modo: "injecao", como, mil_tokens_alvo: milTokens, rep, modelo: MODELO, setup_ms: s.setupMs };
  if (s.setupMs == null) { s.fechar(); return { ...base, erro: s.erro }; }
  const aquecimento = await turnoTexto(s, "Oi, professora! Tudo bem? Responde só 'tudo'.");
  const mat = material(milTokens);
  const tEnvio = agora();
  if (como === "contextUpdate") s.enviar({ contextUpdate: { systemInstruction: { parts: [{ text: `${BASE_CONTEXTO}\n\n### MATERIAL DO TEMA\n${mat}` }] } } });
  else s.enviar({ clientContent: { turns: [{ role: "user", parts: [{ text: `### MATERIAL DO TEMA (consulta da professora; não leia em voz alta)\n${mat}` }] }], turnComplete: false } });
  await esperar(50);
  const t1 = await turnoTexto(s, PERGUNTAS_CONTEXTO[0]);
  await esperar(300);
  const t2 = await turnoTexto(s, PERGUNTAS_CONTEXTO[1]);
  await esperar(600); s.fechar();
  return { ...base, erro: s.erro, envio_ate_pergunta_ms: Math.round(agora() - tEnvio), aquecimento, turnos: [t1, t2], achou_agulha: achouAgulha(t1.fala), ...somaUso(s.usos) };
}

// ------------------------------------------------------------------ 4) busca antecipada: o servidor busca enquanto o aluno ainda fala
// e injeta o trecho como clientContent (turnComplete: false) antes de o modelo começar a responder. Sem ferramenta declarada.
// "controle" = sem injeção; "durante" = injeta no 1º pedaço de transcrição do aluno + atraso; "depois" = injeta X ms após o fim da fala.
type Antecipada = "controle" | "durante" | "depois";
const INSTR_ANTECIPADA = [
  "Você é a Stazia, professora de medicina do StaziaMed (preparação para o Revalida). Fale sempre em português do Brasil, curto (no máximo 2 frases por fala).",
  "Às vezes o sistema coloca na conversa um bloco 'MATERIAL DE CONSULTA'. Se houver material sobre a pergunta, use só ele e cite em voz o título e a seção. Se não houver, diga que vai conferir no material.",
].join("\n");
async function rodarAntecipada(v: Antecipada, atrasoMs: number, rep: number) {
  const s = await abrir({ generationConfig: geracao, systemInstruction: { parts: [{ text: INSTR_ANTECIPADA }] }, outputAudioTranscription: {}, inputAudioTranscription: {} });
  const base = { quando: new Date().toISOString(), modo: "antecipada", variante: v, atraso_ms: atrasoMs, rep, modelo: MODELO, setup_ms: s.setupMs };
  if (s.setupMs == null) { s.fechar(); return { ...base, erro: s.erro }; }
  return new Promise<Msg>((resolve) => {
    const tIni = agora(); let tFimFala = 0; let tInj: number | null = null; let tA1: number | null = null;
    let fala = "", entendeu = ""; let acabou = false; let injetar = v !== "controle";
    const rel = () => (tFimFala ? Math.round(agora() - tFimFala) : -Math.round(agora() - tIni)); // negativo = ainda falando
    const injeta = () => {
      if (!injetar || acabou) return; injetar = false;
      setTimeout(() => {
        if (acabou) return;
        s.enviar({ clientContent: { turns: [{ role: "user", parts: [{ text: `MATERIAL DE CONSULTA (não leia em voz alta; use para responder): ${RESULTADO.titulo}, ${RESULTADO.ano}, seção ${RESULTADO.secao}: ${RESULTADO.trecho}` }] }], turnComplete: false } });
        tInj = rel();
      }, atrasoMs);
    };
    const fim = (motivo: string) => {
      if (acabou) return; acabou = true; clearInterval(relogio); clearTimeout(lim);
      setTimeout(() => { s.fechar(); resolve({ ...base, motivo, erro: s.erro, injetado_ms: tInj, primeiro_audio_ms: tA1, usou_resultado: usouResultado(fala), fala: fala.trim(), entendeu: entendeu.trim(), ...somaUso(s.usos) }); }, 300);
    };
    const lim = setTimeout(() => fim("tempo esgotado (25 s)"), 25_000);
    s.aoMsg = (m) => {
      const sc = m.serverContent; if (!sc) return;
      if (sc.inputTranscription?.text) { entendeu += sc.inputTranscription.text; if (v === "durante") injeta(); }
      if (sc.outputTranscription?.text) fala += sc.outputTranscription.text;
      for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data && tA1 == null) tA1 = rel();
      if (sc.turnComplete && tA1 != null) fim("ok");
    };
    const w = lerWav(path.join(BATERIA, `${AUDIO_PERGUNTA}.wav`)); const pcm = reamostrar(w.pcm, w.rate, 16000);
    const fila: Buffer[] = []; for (let i = 0; i < pcm.length; i += 1280) fila.push(pcm.subarray(i, i + 1280));
    const sil = Buffer.alloc(1280);
    const relogio = setInterval(() => {
      const b = fila.shift();
      s.enviar({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: (b ?? sil).toString("base64") } } });
      if (!b && !tFimFala) { tFimFala = agora(); if (v === "depois") injeta(); }
    }, 40);
  });
}

// ------------------------------------------------------------------ principal
const [modo = "ferramenta", repStr = "1", filtro = ""] = process.argv.slice(2);
const reps = Number(repStr) || 1;
const arq = path.join(SAIDA, `${modo}.jsonl`);
const gravar = (r: Msg) => fs.appendFileSync(arq, JSON.stringify(r) + "\n");

if (modo === "ferramenta") {
  const partes = filtro ? filtro.split(",") : [];
  const comAudio = partes.includes("audio");
  const instrs = partes.filter((p) => p.startsWith("i:")).map((p) => p.slice(2) as Instr);
  const vs = (partes.filter((p) => p !== "audio" && !p.startsWith("i:") && !/^\d+$/.test(p)) as Variante[]);
  const atrasos = partes.filter((p) => /^\d+$/.test(p)).map(Number);
  for (let rep = 1; rep <= reps; rep++) for (const v of vs.length ? vs : VARIANTES) for (const a of atrasos.length ? atrasos : [100, 300, 800]) for (const ins of instrs.length ? instrs : ["espera" as Instr]) {
    const r = await rodarFerramenta(v, a, comAudio, rep, ins);
    gravar(r);
    console.log(`${v.padEnd(18)} ${String(a).padStart(3)} ms ${r.entrada} ${ins} rep${rep}: chamada ${r.chamada_ms} · 1º áudio ${r.primeiro_audio_ms} · depois do resultado ${r.primeiro_audio_depois_resultado_ms} · falou antes ${r.falou_antes_do_resultado} · usou ${r.usou_resultado} · ${r.motivo}${r.erro ? " · ERRO " + r.erro : ""} · "${String(r.fala_antes ?? "").slice(0, 50)}" | "${String(r.fala_depois ?? "").slice(0, 70)}"`);
  }
} else if (modo === "contexto") {
  const tamanhos = filtro ? filtro.split(",").map(Number) : [0, 2, 8, 20, 40];
  for (let rep = 1; rep <= reps; rep++) for (const k of tamanhos) {
    const r: Msg = await rodarContexto(k, rep);
    gravar(r);
    console.log(`${String(k).padStart(2)}k rep${rep}: abertura ${r.setup_ms} ms · 1º áudio ${r.turnos?.map((t: Msg) => t.primeiro_audio_ms).join(" / ")} ms · prompt ${JSON.stringify(r.prompt_por_turno)} · cache ${JSON.stringify(r.cache_por_turno)} · agulha ${r.achou_agulha} · US$ ${r.custo_usd?.toFixed(4)}${r.erro ? " · ERRO " + r.erro : ""} · "${String(r.turnos?.[0]?.fala ?? "").slice(0, 60)}"`);
  }
} else if (modo === "injecao") {
  const tamanhos = filtro ? filtro.split(",").map(Number) : [8, 20];
  for (let rep = 1; rep <= reps; rep++) for (const como of ["contextUpdate", "clientContent"] as const) for (const k of tamanhos) {
    const r: Msg = await rodarInjecao(como, k, rep);
    gravar(r);
    console.log(`${como.padEnd(13)} ${k}k rep${rep}: aquecimento ${r.aquecimento?.primeiro_audio_ms} · 1º áudio ${r.turnos?.map((t: Msg) => t.primeiro_audio_ms).join(" / ")} ms · prompt ${JSON.stringify(r.prompt_por_turno)} · agulha ${r.achou_agulha}${r.erro ? " · ERRO " + r.erro : ""} · "${String(r.turnos?.[0]?.fala ?? "").slice(0, 60)}"`);
  }
} else if (modo === "antecipada") {
  // filtro: variantes (controle,durante,depois) e atrasos em ms (ex.: 0,300)
  const partes = filtro ? filtro.split(",") : [];
  const vs = partes.filter((p) => !/^\d+$/.test(p)) as Antecipada[];
  const atrasos = partes.filter((p) => /^\d+$/.test(p)).map(Number);
  for (let rep = 1; rep <= reps; rep++) for (const v of vs.length ? vs : (["controle", "durante", "depois"] as Antecipada[])) for (const a of v === "controle" ? [0] : atrasos.length ? atrasos : [0, 300]) {
    const r: Msg = await rodarAntecipada(v, a, rep);
    gravar(r);
    console.log(`${v.padEnd(9)} ${String(a).padStart(3)} ms rep${rep}: injetado ${r.injetado_ms} · 1º áudio ${r.primeiro_audio_ms} ms após o fim da fala · usou ${r.usou_resultado} · ${r.motivo}${r.erro ? " · ERRO " + r.erro : ""} · entendeu "${String(r.entendeu ?? "").slice(0, 50)}" · "${String(r.fala ?? "").slice(0, 90)}"`);
  }
} else {
  console.error("modo desconhecido: use ferramenta | contexto | injecao | antecipada");
  process.exit(1);
}
