// Teste de ponta a ponta da PONTE (página 31991 → servidor de teste 31996 → ponte → Gemini Live no Vertex), como o navegador:
// pede a sessão (bilhete), abre o WebSocket, entrega o bilhete, fala a frase da bateria em tempo real, executa as ferramentas
// pelo servidor e mostra os eventos reais. Confere também: bilhete reusado, bilhete adulterado e origem estranha são recusados.
// Uso: node scripts/voz-teste/testar-ponte.mjs [fala=02] [nivel=n3]
import path from "node:path";
import WebSocket from "ws";
import { lerWav, reamostrar } from "./vertex.mjs";
import { PASTA } from "./bateria.mjs";

const [fala = "02", nivel = "n3"] = process.argv.slice(2);
const BASE = "http://127.0.0.1:31991";
const ORIGEM = { Origin: BASE };
const post = (p, b) => fetch(`${BASE}${p}`, { method: "POST", headers: { "Content-Type": "application/json", ...ORIGEM }, body: JSON.stringify(b) }).then((r) => r.json());
const sess = await post("/api/voz/sessao", { voz: "Kore", nivel, gritos: true, palavroes: true, vad: "padrao" });
const w = lerWav(path.join(PASTA, "bateria", `${fala}.wav`));
const pcm = reamostrar(w.pcm, w.rate, 16000);
const t0 = performance.now();
const ms = () => Math.round(performance.now() - t0);
const ws = new WebSocket(`ws://127.0.0.1:31991${sess.ponte}`, { headers: ORIGEM });
let tFim = null, primeiro = null, audioB = 0, tutor = "", aluno = "";
const eventos = new Set();
const mandar = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
ws.on("open", () => mandar({ t: "abrir", bilhete: sess.bilhete }));
ws.on("message", async (d) => {
  const m = JSON.parse(d.toString());
  eventos.add(m.t);
  if (m.t === "audio") { audioB += Buffer.from(m.d, "base64").length; if (primeiro == null && tFim != null) { primeiro = ms(); console.log(`[${primeiro}] 1º áudio (${primeiro - tFim} ms depois do fim da fala)`); } return; }
  if (m.t === "transcricao") { if (m.quem === "tutor") tutor += m.texto; else aluno += m.texto; return; }
  console.log(`[${ms()}]`, JSON.stringify(m).slice(0, 200));
  if (m.t === "ferramentas") {
    const respostas = [];
    for (const c of m.chamadas) respostas.push({ id: c.id, name: c.name, response: { output: (await post("/api/voz/ferramenta", { vc: sess.vc, name: c.name, args: c.args })).output } });
    mandar({ t: "ferramentas", respostas });
  }
  if (m.t === "pronto") {
    for (let i = 0; i < pcm.length; i += 1280) { mandar({ t: "audio", d: pcm.subarray(i, i + 1280).toString("base64") }); await new Promise((r) => setTimeout(r, 40)); }
    tFim = ms(); console.log(`[${tFim}] fim da fala`);
    const sil = Buffer.alloc(1280).toString("base64");
    const t = setInterval(() => mandar({ t: "audio", d: sil }), 40);
    setTimeout(() => { clearInterval(t); mandar({ t: "fim" }); }, 16000);
  }
});
ws.on("close", async () => {
  console.log("eventos:", [...eventos].join(", "), "| áudio:", (audioB / 48000).toFixed(1), "s");
  console.log("aluno:", aluno.trim()); console.log("tutor:", tutor.trim());
  const tentar = (bilhete, origem = ORIGEM) => new Promise((res) => {
    const x = new WebSocket(`ws://127.0.0.1:31991${sess.ponte}`, { headers: origem });
    x.on("open", () => x.send(JSON.stringify({ t: "abrir", bilhete })));
    x.on("message", (dd) => { const mm = JSON.parse(dd.toString()); if (mm.t === "erro" || mm.t === "encerrado") { res(mm.mensagem ?? mm.motivo); x.close(); } if (mm.t === "pronto") { res("ABRIU (falha!)"); x.close(); } });
    x.on("unexpected-response", (_q, r) => res(`HTTP ${r.statusCode}`));
    x.on("error", () => res("conexão recusada"));
  });
  console.log("bilhete reusado →", await tentar(sess.bilhete));
  console.log("bilhete adulterado →", await tentar(sess.bilhete.slice(0, -4) + "AAAA"));
  console.log("origem estranha →", await tentar(sess.bilhete, { Origin: "https://evil.example" }));
  process.exit(0);
});
ws.on("error", (e) => console.log("erro", String(e)));
