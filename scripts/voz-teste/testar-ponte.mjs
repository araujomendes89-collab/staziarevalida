// Teste de ponta a ponta da PONTE da prévia (página 31991 → servidor 31996 → Gemini Live), como o navegador faria:
// pede token, abre o WebSocket, fala a frase 02 ("Eu marcaria a letra B...") em tempo real e mostra os eventos reais.
// Também confere que o token não pode ser reusado (401) e que origem estranha é recusada.
// Uso: node scripts/voz-teste/testar-ponte.mjs [fala=02]
import path from "node:path";
import WebSocket from "ws";
import { lerWav, reamostrar } from "./vertex.mjs";
import { PASTA } from "./bateria.mjs";

const fala = process.argv[2] ?? "02";
const BASE = "http://127.0.0.1:31991";
const ORIGEM = { Origin: BASE };
const sess = await (await fetch(`${BASE}/api/voz/sessao`, { method: "POST", headers: { "Content-Type": "application/json", ...ORIGEM }, body: JSON.stringify({ voz: "Kore", nivel: "forte", vad: "padrao" }) })).json();
const w = lerWav(path.join(PASTA, "bateria", `${fala}.wav`));
const pcm = reamostrar(w.pcm, w.rate, 16000);
const t0 = performance.now();
const ms = () => Math.round(performance.now() - t0);
const ws = new WebSocket(`ws://127.0.0.1:31991${sess.ws}`, { headers: ORIGEM });
let tFim = null, primeiro = null, bytes = 0;
const eventos = [];
ws.on("message", async (d, bin) => {
  if (bin) { bytes += d.length; if (primeiro == null) { primeiro = ms(); console.log(`[${primeiro}] 1º áudio (${primeiro - tFim} ms depois do fim da fala)`); } return; }
  const m = JSON.parse(d.toString());
  eventos.push(m.tipo);
  if (m.tipo !== "transcricao") console.log(`[${ms()}]`, JSON.stringify(m).slice(0, 220));
  if (m.tipo === "pronto") {
    for (let i = 0; i < pcm.length; i += 1280) { ws.send(pcm.subarray(i, i + 1280)); await new Promise((r) => setTimeout(r, 40)); }
    tFim = ms(); console.log(`[${tFim}] fim da fala`);
    const sil = Buffer.alloc(1280);
    const t = setInterval(() => ws.readyState === 1 && ws.send(sil), 40);
    setTimeout(() => { clearInterval(t); ws.send(JSON.stringify({ tipo: "fim" })); }, 15000);
  }
  if (m.tipo === "transcricao") process.stdout.write(m.quem === "aluno" ? "" : "");
});
ws.on("close", async () => {
  console.log("eventos:", [...new Set(eventos)].join(", "), "| áudio recebido:", (bytes / 48000).toFixed(1), "s");
  // token reusado
  const r1 = await new Promise((res) => { const x = new WebSocket(`ws://127.0.0.1:31991${sess.ws}`, { headers: ORIGEM }); x.on("unexpected-response", (_q, r) => res(r.statusCode)); x.on("open", () => { res("ABRIU (falha!)"); x.close(); }); x.on("error", () => {}); });
  console.log("token reusado →", r1);
  const r2 = await fetch(`${BASE}/api/voz/sessao`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: "{}" });
  console.log("origem estranha →", r2.status);
  process.exit(0);
});
ws.on("error", (e) => console.log("erro", String(e)));
