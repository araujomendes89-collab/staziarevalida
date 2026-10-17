// CÉREBRO DO TUTOR — a troca do MATERIAL DO TEMA (contextUpdate) logo depois de next_question atrasa ou corta a abertura da questão nova?
// (revisão de 17/10: a ponte manda o material novo ~300-500 ms depois da resposta de next_question, bem quando o modelo prepara a fala.)
// Sessão real no Gemini Live (Vertex, token do gcloud deste Mac, nunca impresso), sem banco e sem aluno:
//   1. a professora tem a ferramenta next_question; o "aluno" pede a próxima questão (texto);
//   2. a ferramenta responde depois de 100 ms com um enunciado de teste;
//   3. variante "sem": nada mais; "300"/"500": contextUpdate com ~8 mil tokens de material N ms depois da resposta da ferramenta;
//      "depois": contextUpdate só depois do turnComplete da abertura (o jeito proposto);
//   4. mede: resposta da ferramenta → 1º áudio, se veio "interrupted", quanto falou e se terminou.
//   tsx scripts/voz-teste/live-troca-material.ts <repetições> [variantes separadas por vírgula]
// Saída: /Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro/correcao/troca-material.jsonl
import fs from "node:fs";
import WebSocket from "ws";
import { liveUrl, tokenGcloud, vertexEnv } from "./vertex.mjs";
import { custoUsd, tokensPorModalidade } from "./precos.mjs";

const MODELO = process.env.VOZ_LIVE_MODELO || "gemini-3.8-live";
const SAIDA = "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro/correcao/troca-material.jsonl";
const { projeto, regiaoLive } = vertexEnv();
type Msg = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const agora = () => performance.now();
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const INSTR = [
  "Você é a Stazia, professora de medicina do StaziaMed (preparação para o Revalida). Fale sempre em português do Brasil.",
  "Quando o aluno pedir a próxima questão, chame next_question e depois leia o enunciado em voz alta, sem dizer a resposta.",
].join("\n");
// material de TESTE (não é conteúdo do app): parágrafo repetido até ~8 mil tokens
const PARAGRAFO = "Trecho de teste do material do tema, sem valor clínico, usado só para medir o tempo da troca das instruções da sessão. ";
const MATERIAL = `MATERIAL DO TEMA (dados de teste; não leia em voz alta)\n${PARAGRAFO.repeat(Math.ceil(32_000 / PARAGRAFO.length))}`;
const QUESTAO = { question: { id: "teste-1", statement: "Mulher de 28 anos, 32 semanas de gestação, pressão 168 por 112, cefaleia e escotomas. Qual a conduta inicial?", options: ["A) Observar", "B) Sulfato de magnésio e anti-hipertensivo", "C) Alta", "D) Repouso"] } };

async function rodar(variante: string, rep: number) {
  const ws = new WebSocket(liveUrl(regiaoLive), { headers: { Authorization: `Bearer ${tokenGcloud()}` } });
  const usos: Msg[] = [];
  return new Promise<Msg>((resolve) => {
    let t0 = 0, tResp: number | null = null, tAudio: number | null = null, tUpd: number | null = null, tFim: number | null = null;
    let interrompido = false, fala = "", acabou = false, chamou = false;
    const ms = () => Math.round(agora() - t0);
    const enviar = (o: unknown) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
    const fim = (motivo: string) => {
      if (acabou) return; acabou = true; clearTimeout(lim);
      setTimeout(() => {
        try { ws.close(); } catch { /* */ }
        const tot = usos.map((u) => tokensPorModalidade(u)).reduce((a: Record<string, number>, b: Record<string, number>) => Object.fromEntries(Object.keys(b).map((k) => [k, (a[k] ?? 0) + b[k]])), {} as Record<string, number>);
        resolve({ quando: new Date().toISOString(), variante, rep, modelo: MODELO, motivo, chamou, resposta_ferramenta_ms: tResp, context_update_ms: tUpd,
          primeiro_audio_ms: tAudio, resultado_ate_audio_ms: tAudio != null && tResp != null ? tAudio - tResp : null, turno_completo_ms: tFim,
          interrompido, leu_enunciado: /32 semanas|168|escotoma|cefaleia/i.test(fala), fala: fala.trim().slice(0, 300), custo_usd: custoUsd(MODELO, tot) });
      }, 300);
    };
    const lim = setTimeout(() => fim("tempo esgotado (25 s)"), 25_000);
    ws.on("open", () => enviar({ setup: { model: `projects/${projeto}/locations/${regiaoLive}/publishers/google/models/${MODELO}`,
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }, languageCode: "pt-BR" } },
      systemInstruction: { parts: [{ text: INSTR }] }, outputAudioTranscription: {},
      tools: [{ functionDeclarations: [{ name: "next_question", description: "Abre a próxima questão para o aluno e devolve o enunciado.", parameters: { type: "OBJECT", properties: {} } }] }] } }));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.usageMetadata) usos.push(m.usageMetadata);
      if (m.setupComplete) { t0 = agora(); enviar({ clientContent: { turns: [{ role: "user", parts: [{ text: "Professora, manda a próxima questão." }] }], turnComplete: true } }); return; }
      if (m.toolCall?.functionCalls?.length) {
        chamou = true;
        const calls = m.toolCall.functionCalls as { id: string; name: string }[];
        setTimeout(() => {
          enviar({ toolResponse: { functionResponses: calls.map((c) => ({ id: c.id, name: c.name, response: QUESTAO })) } });
          tResp = ms();
          const n = Number(variante);
          if (Number.isFinite(n)) setTimeout(() => { enviar({ contextUpdate: { systemInstruction: { parts: [{ text: `${INSTR}\n\n${MATERIAL}` }] } } }); tUpd = ms(); }, n);
        }, 100);
      }
      const sc = m.serverContent; if (!sc) return;
      if (sc.outputTranscription?.text && tResp != null) fala += sc.outputTranscription.text;
      if (sc.interrupted) interrompido = true;
      for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data && tResp != null && tAudio == null) tAudio = ms();
      if (sc.turnComplete && tResp != null && tAudio != null) {
        tFim = ms();
        if (variante === "depois") { enviar({ contextUpdate: { systemInstruction: { parts: [{ text: `${INSTR}\n\n${MATERIAL}` }] } } }); tUpd = ms(); }
        fim("ok");
      }
    });
    ws.on("error", () => fim("erro de conexão"));
    ws.on("close", () => fim("fechou"));
  });
}

const [repStr = "1", filtro = "sem,300,500,depois"] = process.argv.slice(2);
for (let rep = 1; rep <= (Number(repStr) || 1); rep++) for (const v of filtro.split(",")) {
  const r = await rodar(v, rep);
  fs.appendFileSync(SAIDA, JSON.stringify(r) + "\n");
  console.log(`${v.padEnd(7)} rep${rep}: resultado→1º áudio ${r.resultado_ate_audio_ms} ms · contextUpdate ${r.context_update_ms} · fim ${r.turno_completo_ms} · interrompido ${r.interrompido} · leu ${r.leu_enunciado} · ${r.motivo} · US$ ${r.custo_usd?.toFixed(4)}`);
  await esperar(500);
}
