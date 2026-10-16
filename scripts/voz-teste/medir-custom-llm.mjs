// Mede o endpoint Custom LLM local como a ElevenLabs chamaria: POST /v1/chat/completions com stream, Bearer do segredo,
// as 10 falas da bateria como última mensagem do aluno (com a abertura da tutora antes). Tempo até o 1º pedaço de texto e total.
// Uso: node scripts/voz-teste/medir-custom-llm.mjs <url base, ex.: http://127.0.0.1:31996> <rótulo> [repetições]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FALAS, PASTA } from "./bateria.mjs";
import { lerEnv } from "./vertex.mjs";

const [base = "http://127.0.0.1:31996", rotulo = "frase", repStr = "1"] = process.argv.slice(2);
const segredo = lerEnv(path.join(os.homedir(), ".config/staziamed-voz-teste/segredos.env")).VOZ_LLM_SEGREDO;
const ABERTURA = "Bora. Mulher de 28 anos, comeu camarão, urticária, lábio inchado, chiado e pressão oitenta por cinquenta. Qual a primeira conduta medicamentosa?";
const saida = path.join(PASTA, "custom-llm");
fs.mkdirSync(saida, { recursive: true });

async function uma(fala) {
  const t0 = performance.now();
  const r = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${segredo}` },
    body: JSON.stringify({
      model: "stazia-durona-teste", stream: true, temperature: 0.9, max_tokens: 350, user_id: "teste",
      messages: [
        { role: "system", content: "PROMPT DA ELEVENLABS (deve ser ignorado pelo nosso servidor)" },
        { role: "assistant", content: ABERTURA },
        { role: "user", content: fala.texto },
      ],
      elevenlabs_extra_body: { nivel: "forte" },
    }),
  });
  let primeiro = null, texto = "", fimOk = false, buf = "";
  const dec = new TextDecoder();
  for await (const p of r.body) {
    buf += dec.decode(p, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const ev = buf.slice(0, i).replace(/^data: /, ""); buf = buf.slice(i + 2);
      if (ev === "[DONE]") { fimOk = true; continue; }
      const j = JSON.parse(ev); const c = j.choices?.[0]?.delta?.content;
      if (c) { if (primeiro == null) primeiro = performance.now() - t0; texto += c; }
    }
  }
  return { fala: fala.id, status: r.status, primeiro_texto_ms: primeiro && Math.round(primeiro), total_ms: Math.round(performance.now() - t0), terminou_com_DONE: fimOk, texto };
}

const reps = Number(repStr) || 1;
for (let k = 0; k < reps; k++) for (const f of FALAS) {
  const res = await uma(f);
  fs.appendFileSync(path.join(saida, "resultados.jsonl"), JSON.stringify({ quando: new Date().toISOString(), rotulo, ...res }) + "\n");
  console.log(rotulo, f.id, res.status, "1º texto", res.primeiro_texto_ms, "ms · total", res.total_ms, "ms ·", res.texto.slice(0, 90).replace(/\n/g, " "));
}
// conferência de segurança: sem segredo e com segredo errado tem de dar 401
for (const h of [{}, { Authorization: "Bearer errado-errado-errado-errado-errado-errado" }]) {
  const r = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: "{}" });
  console.log("sem/errado segredo →", r.status);
}
