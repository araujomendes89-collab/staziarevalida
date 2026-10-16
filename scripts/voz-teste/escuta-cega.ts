// Página de ESCUTA CEGA (pedido do dono: escolher pela qualidade sem saber o preço). Gera os áudios e monta
// /Volumes/StaziaMed/.tmp-aulas/voice-tutor/comparacao-cega/index.html com letras embaralhadas e o gabarito em arquivo separado.
//  1) a MESMA fala da Durona (expressiva sem palavrão, e explosiva) em: Gemini Live (Kore, Aoede, Leda, Zephyr, Charon) e
//     Gemini TTS 3.8 flash e flash-lite (Kore e Leda). O TTS lê qualquer instrução escrita antes do texto (medido: frase de 8 s
//     virou 17-20 s), então ele recebe só o texto; o "jeito" fica por conta da pontuação.
//  2) voz × cérebro: 3 trechos de cada combinação da bateria pedagógica (A = Gemini Live com ferramentas; B = Gemini 3.8 Flash
//     + Gemini TTS flash e flash-lite). ElevenLabs e Claude ficaram fora (parados por decisão do dono / cota).
// Uso: npx tsx scripts/voz-teste/escuta-cega.ts
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import { geminiTts, liveUrl, tokenGcloud, vertexEnv, wav } from "./vertex.mjs";
import { custoUsd, tokensPorModalidade } from "./precos.mjs";

const DIR = "/Volumes/StaziaMed/.tmp-aulas/voice-tutor/comparacao-cega";
const AUD = path.join(DIR, "audios");
fs.mkdirSync(AUD, { recursive: true });
const FALAS = {
  expressiva: "O QUÊ?! Corticoide primeiro? Não, não, não... Na anafilaxia a primeira droga é adrenalina intramuscular, na coxa, agora! Corticoide demora horas e não tira ninguém do choque. Agora me explica: por que a adrenalina vem antes?",
  explosiva: "CARALHO! Corticoide primeiro?! Puta que pariu... Adrenalina intramuscular, porra! Na coxa, agora! Corticoide demora horas e não tira ninguém do choque. Me explica por que a adrenalina vem antes.",
};
const ATRIZ = `Você é uma atriz brasileira dublando a professora Durona, médica de plantão, teatral, impaciente e engraçada, adulta falando com adultos.
Quando receber um texto entre « », fale EXATAMENTE esse texto, palavra por palavra, sem acrescentar nem tirar nada, em português do Brasil, atuando com muita emoção: indignação que sobe de surpresa no começo, suspiro, ironia, e explicação firme no fim.`;

function liveFala(voz: string, texto: string): Promise<{ pcm: Buffer; usage: Record<string, unknown> | null }> {
  const { projeto, regiaoLive } = vertexEnv();
  return new Promise((ok, erro) => {
    const ws = new WebSocket(liveUrl(regiaoLive), { headers: { Authorization: `Bearer ${tokenGcloud()}` } });
    const partes: Buffer[] = [];
    let uso: Record<string, unknown> | null = null;
    const t = setTimeout(() => { ws.close(); erro(new Error("tempo esgotado")); }, 45_000);
    ws.on("open", () => ws.send(JSON.stringify({ setup: {
      model: `projects/${projeto}/locations/${regiaoLive}/publishers/google/models/gemini-3.8-live`,
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } }, languageCode: "pt-BR" } },
      systemInstruction: { parts: [{ text: ATRIZ }] },
    } })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.setupComplete) ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: `«${texto}»` }] }], turnComplete: true } }));
      if (m.usageMetadata) uso = m.usageMetadata;
      for (const p of m.serverContent?.modelTurn?.parts ?? []) if (p.inlineData?.data) partes.push(Buffer.from(p.inlineData.data, "base64"));
      if (m.serverContent?.turnComplete) { clearTimeout(t); ws.close(); ok({ pcm: Buffer.concat(partes), usage: uso }); }
    });
    ws.on("error", (e) => { clearTimeout(t); erro(e); });
  });
}

interface Item { secao: string; rotulo: string; arquivo: string; segundos: number; custo_usd: number | null; custo_min_usd: number | null; texto: string }
const itens: Item[] = [];
const salvar = (secao: string, rotulo: string, nome: string, pcm: Buffer, custo: number | null, texto: string) => {
  fs.writeFileSync(path.join(AUD, nome), wav(pcm, 24000));
  const s = pcm.length / 48000;
  itens.push({ secao, rotulo, arquivo: nome, segundos: +s.toFixed(1), custo_usd: custo, custo_min_usd: custo != null && s > 0 ? +((custo / s) * 60).toFixed(4) : null, texto });
  console.log(secao, rotulo, s.toFixed(1), "s", custo != null ? `US$ ${custo.toFixed(5)}` : "");
};

for (const [estilo, texto] of Object.entries(FALAS)) {
  for (const voz of ["Kore", "Aoede", "Leda", "Zephyr", "Charon"]) {
    try {
      const r = await liveFala(voz, texto);
      salvar(`mesma-fala-${estilo}`, `Gemini Live · ${voz}`, `live-${estilo}-${voz}.wav`, r.pcm, custoUsd("gemini-3.8-live", tokensPorModalidade(r.usage)), texto);
    } catch (e) { console.log("falhou", estilo, voz, String(e).slice(0, 120)); }
  }
  for (const modelo of ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]) for (const voz of ["Kore", "Leda"]) {
    try {
      const r = await geminiTts({ modelo, voz, texto });
      salvar(`mesma-fala-${estilo}`, `Gemini TTS ${modelo.includes("lite") ? "flash-lite" : "flash"} · ${voz}`, `tts-${modelo}-${estilo}-${voz}.wav`, r.pcm, custoUsd(modelo, tokensPorModalidade(r.usage)), texto);
    } catch (e) { console.log("falhou", modelo, voz, String(e).slice(0, 120)); }
  }
}

// voz × cérebro (3 trechos de cada): A vem pronto da bateria pedagógica; B = texto do Flash lido pelo TTS
const ped = fs.readFileSync("/Volumes/StaziaMed/.tmp-aulas/voice-tutor/linha-de-base/cerebros/pedagogica.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const audA = "/Volumes/StaziaMed/.tmp-aulas/voice-tutor/linha-de-base/cerebros/audio";
const escolhaA = fs.readdirSync(audA).filter((f) => /^A-sem_filtro-.*-t[23]\.wav$/.test(f)).slice(0, 3);
for (const f of escolhaA) {
  const pcm = fs.readFileSync(path.join(audA, f)).subarray(44);
  const [, , q, t] = f.replace(".wav", "").split("-");
  const conv = ped.find((r) => r.cerebro === "A" && r.nivel === "sem_filtro" && r.questao === q);
  const turno = conv?.turnos?.[Number(t.slice(1))];
  salvar("voz-x-cerebro", "A · Gemini Live (voz e cérebro) + ferramentas", `vc-A-${q}-${t}.wav`, pcm, turno?.custo_usd ?? null, turno?.tutor ?? "");
}
const textosB = ped.filter((r) => r.cerebro === "B" && r.nivel === "sem_filtro" && r.turnos).slice(0, 3).map((r) => ({ q: r.questao, texto: r.turnos[1].tutor, custoLlm: r.turnos[1].custo_usd ?? 0 }));
for (const modelo of ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]) for (const b of textosB) {
  try {
    const r = await geminiTts({ modelo, voz: "Kore", texto: b.texto });
    const tts = custoUsd(modelo, tokensPorModalidade(r.usage)) ?? 0;
    salvar("voz-x-cerebro", `B · Gemini 3.8 Flash + TTS ${modelo.includes("lite") ? "flash-lite" : "flash"}`, `vc-B-${modelo}-${b.q}.wav`, r.pcm, tts + b.custoLlm, b.texto);
  } catch (e) { console.log("falhou B", modelo, String(e).slice(0, 120)); }
}

// embaralha por seção (determinístico: ordem por hash do nome), letras A, B, C...
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const secoes = [...new Set(itens.map((i) => i.secao))];
const gabarito: Record<string, Record<string, unknown>> = {};
const blocos: string[] = [];
const TITULO: Record<string, string> = {
  "mesma-fala-expressiva": "1. A mesma fala, expressiva (sem palavrão)",
  "mesma-fala-explosiva": "2. A mesma fala, explosiva (com palavrão)",
  "voz-x-cerebro": "3. Conversa de verdade (voz × cérebro): trechos da bateria de questões",
};
for (const s of secoes) {
  const lista = itens.filter((i) => i.secao === s).sort((a, b) => hash(a.arquivo) - hash(b.arquivo));
  gabarito[s] = {};
  const linhas = lista.map((i, k) => {
    const letra = String.fromCharCode(65 + k);
    gabarito[s][letra] = { caminho: i.rotulo, segundos: i.segundos, custo_usd: i.custo_usd, custo_por_minuto_de_fala_usd: i.custo_min_usd, arquivo: i.arquivo };
    return `<div class="item"><b>${letra}</b><audio controls preload="none" src="audios/${i.arquivo}"></audio><label>Nota <select data-s="${s}" data-l="${letra}"><option></option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>${s === "voz-x-cerebro" ? `<details><summary>texto</summary><p>${i.texto.replace(/</g, "&lt;")}</p></details>` : ""}</div>`;
  });
  blocos.push(`<section><h2>${TITULO[s] ?? s}</h2>${s !== "voz-x-cerebro" ? `<p class="fala">«${(s.endsWith("explosiva") ? FALAS.explosiva : FALAS.expressiva)}»</p>` : ""}${linhas.join("\n")}</section>`);
}
fs.writeFileSync(path.join(DIR, "gabarito-NAO-ABRIR-antes-de-escolher.json"), JSON.stringify(gabarito, null, 1));
fs.writeFileSync(path.join(DIR, "index.html"), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Escuta cega</title>
<style>:root{--f:#f6f7fb;--t:#1c2233;--s:#5b6478;--b:#d9deea;--c:#fff}@media (prefers-color-scheme:dark){:root{--f:#11141c;--t:#e8ebf3;--s:#9aa3b8;--b:#2a3142;--c:#181c27}}
body{margin:0;background:var(--f);color:var(--t);font:16px/1.45 system-ui,sans-serif}main{max-width:820px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:28px}.fala{color:var(--s);font-style:italic}.item{display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:var(--c);border:1px solid var(--b);border-radius:12px;padding:10px;margin:8px 0}
.item b{font-size:1.2rem;width:24px}audio{flex:1;min-width:220px}details{width:100%;color:var(--s);font-size:.9rem}button{font:inherit;padding:8px 12px;border-radius:10px;border:1px solid var(--b);background:var(--c);color:var(--t)}#res{white-space:pre-wrap;background:var(--c);border:1px solid var(--b);border-radius:12px;padding:10px}</style></head>
<body><main><h1>Escuta cega da Durona</h1><p>Ouça cada letra e dê nota de 1 a 5 só pelo som (naturalidade, emoção, português). Os nomes e os preços estão no arquivo de gabarito, ao lado desta página: abra só depois de escolher.</p>
${blocos.join("\n")}
<h2>Minhas notas</h2><button id="copiar">Mostrar minhas notas</button><p id="res"></p></main>
<script>document.getElementById("copiar").onclick=()=>{const n={};document.querySelectorAll("select").forEach(s=>{if(s.value){(n[s.dataset.s]??={})[s.dataset.l]=s.value}});document.getElementById("res").textContent=JSON.stringify(n,null,1)};</script></body></html>`);
console.log("pronto:", path.join(DIR, "index.html"), itens.length, "áudios");
