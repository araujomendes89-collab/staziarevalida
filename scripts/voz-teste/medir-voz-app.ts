// Mede a voz ao vivo COMO O APP MONTA (mesmo setupVertex da ponte, mesmas instruções composeRealtimeInstructions e as mesmas
// ferramentas REALTIME_TOOLS), direto no Gemini Live do Vertex (us-central1), com as falas gravadas da bateria.
// Por fala: fim da fala → transcrição do aluno → chamadas de ferramenta (com atraso simulado da ida ao nosso servidor) → 1º áudio.
// Guarda também os tokens de pensamento (thoughtsTokenCount) e de entrada de cada turno.
// Uso: npx tsx scripts/voz-teste/medir-voz-app.ts <variante> <falas separadas por vírgula> [atraso_ferramenta_ms]
//   variante: atual | rapida   (rapida = bilhete com vad "rapido": fim de fala com sensibilidade alta e 400 ms de silêncio)
//   18/10 (voz-natural): MATERIAL=1 põe um bloco de material do tema de ~4 mil tokens (texto de teste), como o pacote do cérebro
//   que o app manda no bilhete; SAIDA=<arquivo.jsonl> grava uma linha por fala.
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import { PASTA } from "./bateria.mjs";
import { lerWav, liveUrl, reamostrar, tokenGcloud } from "./vertex.mjs";
import { setupVertex } from "../../server/vozPonte/ponte";
import { composeRealtimeInstructions } from "../../server/tutor/prompts";
import { REALTIME_TOOLS } from "../../server/tutor/tools";
import { camadaDurona } from "../../server/vozTeste/durona";

const [variante = "atual", falasStr = "03", atrasoStr = "1500"] = process.argv.slice(2);
const atrasoFerramenta = Number(atrasoStr) || 0;
const projeto = "staziamed-revalida-prod", regiao = process.env.VOZ_LIVE_REGIAO || "us-central1";
const persona = camadaDurona("forte" as never).texto;
const instrucoesCheias = composeRealtimeInstructions({ mode: "livre" as never, persona, context: "SESSÃO: Anafilaxia.\nO aluno se chama João.\nComece numa frase curta, no seu jeito, e já puxe o assunto da sessão.", pronunciations: [] });
// CURTA=1: só a persona e o contexto (para saber se o tamanho das instruções pesa no tempo; não é proposta de produção)
const instrucoes = process.env.CURTA === "1" ? `${persona}\n\nSESSÃO: Anafilaxia. O aluno se chama João. Fatos com número, dose ou conduta: chame get_topic_context antes de falar.` : instrucoesCheias;
const bilhete = {
  vc: "medida", u: "medida", modelo: process.env.VOZ_LIVE_MODELO || "gemini-3.8-live", voz: "Kore", instrucoes, maxSegundos: 120,
  ferramentas: REALTIME_TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
  ...(variante === "rapida" ? { vad: "rapido" } : {}),
  ...(process.env.MATERIAL === "1" ? { material: `MATERIAL DO TEMA (dados de teste para medir tempo; não leia em voz alta)\n${"Anafilaxia: adrenalina intramuscular na coxa é a primeira conduta; corticoide e anti-histamínico são adjuvantes. ".repeat(160)}` } : {}),
};
const STUB: Record<string, unknown> = {
  get_topic_context: { topic: "anafilaxia", sources: [{ title: "Diretriz de anafilaxia", text: "Adrenalina IM 0,01 mg/kg (máx. 0,5 mg no adulto) na face anterolateral da coxa; repetir a cada 5 a 15 min se necessário. Corticoide e anti-histamínico são adjuvantes e não substituem a adrenalina. Observação mínima de 4 a 6 h; mais se reação grave ou bifásica." }] },
  submit_answer: { result: { is_correct: true, correct_option: "B", outcome: "correct", review_scheduled: false }, question: { stem: "Paciente com anafilaxia após picada de abelha. Conduta inicial?", options: { A: "Hidrocortisona IV", B: "Adrenalina IM na coxa", C: "Prometazina IM", D: "Adrenalina SC no braço" }, state: "answered", last_answer: { option: "B", is_correct: true } }, tone: "Acertou: reconheça curto, no seu jeito, e puxe o porquê." },
  get_question_context: { question: "Paciente com anafilaxia após picada de abelha. Conduta inicial?", options: { A: "Hidrocortisona IV", B: "Adrenalina IM na coxa", C: "Prometazina IM", D: "Adrenalina SC no braço" }, state: "open" },
};

function medir(id: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const w = lerWav(path.join(PASTA, "bateria", `${id}-aparado.wav`));
    const pcm = reamostrar(w.pcm, w.rate, 16000);
    const t0 = performance.now(), ms = () => Math.round(performance.now() - t0);
    const g = new WebSocket(liveUrl(regiao), { headers: { Authorization: `Bearer ${tokenGcloud()}` } });
    const r: Record<string, any> = { fala: id, variante, ferramentas: [] as string[] };
    let tFim: number | null = null, abertura = true, fechou = false, silencio: NodeJS.Timeout | null = null;
    const fim = () => { if (fechou) return; fechou = true; if (silencio) clearInterval(silencio); try { g.close(); } catch { /* */ } resolve(r); };
    const setup = setupVertex(bilhete as never, projeto, regiao);
    // teste de pensamento por variável: PENSAR=0 (thinkingBudget 0) | minimal | low (thinkingLevel); sem PENSAR = o que o setup manda
    const pensar = process.env.PENSAR;
    // SILENCIO=<ms>: troca só o silêncio de fim de fala (com sensibilidade alta), para achar o ponto entre rápido e não cortar o aluno
    if (process.env.SILENCIO) (setup.setup as any).realtimeInputConfig = { automaticActivityDetection: { startOfSpeechSensitivity: "START_SENSITIVITY_HIGH", endOfSpeechSensitivity: "END_SENSITIVITY_HIGH", prefixPaddingMs: 100, silenceDurationMs: Number(process.env.SILENCIO) } };
    // NAOBLOQ=1: ferramentas de consulta como NON_BLOCKING (o modelo pode falar enquanto a ferramenta roda)
    if (process.env.NAOBLOQ === "1") for (const f of (setup.setup as any).tools?.[0]?.functionDeclarations ?? []) if (["get_topic_context", "get_question_context", "get_student_learning_memory", "get_student_errors"].includes(f.name)) f.behavior = "NON_BLOCKING";
    if (pensar) (setup.setup as any).generationConfig.thinkingConfig = pensar === "0" ? { thinkingBudget: 0 } : { thinkingLevel: pensar };
    g.on("open", () => { r.t_conectou = ms(); g.send(JSON.stringify(setup)); });
    g.on("message", async (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.setupComplete) {
        r.t_setup = ms();
        // como no app: o aluno fala logo (sem abertura do tutor), pedaços de 40 ms em tempo real e depois microfone em silêncio
        abertura = false;
        for (let i = 0; i < pcm.length; i += 1280) { g.send(JSON.stringify({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: pcm.subarray(i, i + 1280).toString("base64") } } })); await new Promise((s) => setTimeout(s, 40)); }
        tFim = ms();
        const sil = Buffer.alloc(1280).toString("base64");
        silencio = setInterval(() => g.readyState === 1 && g.send(JSON.stringify({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: sil } } })), 40);
        setTimeout(fim, 20000);
        return;
      }
      if (m.error) { r.erro = String(m.error.message ?? JSON.stringify(m.error)).slice(0, 200); return fim(); }
      if (m.usageMetadata && tFim != null) {
        r.pensamento_tokens = (r.pensamento_tokens ?? 0) + Number(m.usageMetadata.thoughtsTokenCount ?? 0);
        r.entrada_tokens = (r.entrada_tokens ?? 0) + Number(m.usageMetadata.promptTokenCount ?? 0);
      }
      if (m.toolCall?.functionCalls?.length && tFim != null) {
        const t = ms() - tFim;
        for (const f of m.toolCall.functionCalls) r.ferramentas.push(`${f.name}@${t}ms`);
        if (r.t_1a_ferramenta == null) r.t_1a_ferramenta = t;
        await new Promise((s) => setTimeout(s, atrasoFerramenta));
        g.send(JSON.stringify({ toolResponse: { functionResponses: m.toolCall.functionCalls.map((f: any) => ({ id: f.id, name: f.name, response: { output: STUB[f.name] ?? { ok: true } }, ...(process.env.NAOBLOQ === "1" ? { scheduling: "WHEN_IDLE" } : {}) })) } }));
        if (r.t_resposta_ferramenta == null) r.t_resposta_ferramenta = ms() - tFim;
        return;
      }
      const sc = m.serverContent;
      if (!sc || tFim == null || abertura) return;
      if (sc.inputTranscription?.text) { r.aluno = (r.aluno ?? "") + sc.inputTranscription.text; if (r.t_transcricao == null) r.t_transcricao = ms() - tFim; }
      if (sc.outputTranscription?.text) r.tutor = (r.tutor ?? "") + sc.outputTranscription.text;
      if (sc.modelTurn?.parts?.some((p: any) => p.inlineData?.data) && r.t_1o_audio == null) r.t_1o_audio = ms() - tFim;
      if (sc.turnComplete && r.t_1o_audio != null) { r.t_turno_completo = ms() - tFim; setTimeout(fim, 300); }
    });
    g.on("close", (c, why) => { if (!fechou) { r.fechou = `${c} ${why.toString().slice(0, 120)}`; fim(); } });
    g.on("error", (e) => { r.erro = String(e).slice(0, 160); fim(); });
  });
}

const falas = falasStr.split(",");
const saida: Record<string, unknown>[] = [];
for (const f of falas) {
  const r = await medir(f);
  saida.push(r);
  console.log(JSON.stringify({ ...r, tutor: String(r.tutor ?? "").slice(0, 90), aluno: String(r.aluno ?? "").slice(0, 60) }));
  if (process.env.SAIDA) fs.appendFileSync(process.env.SAIDA, JSON.stringify({ ...r, material: process.env.MATERIAL === "1", atrasoFerramenta }) + "\n");
}
const v = saida.map((r) => Number(r.t_1o_audio)).filter(Number.isFinite).sort((a, b) => a - b);
console.log(`RESUMO ${variante}: n=${v.length} P50=${v[Math.floor((v.length - 1) / 2)] ?? "-"} ms  max=${v.at(-1) ?? "-"} ms  instr_chars=${instrucoes.length}`);
process.exit(0);
