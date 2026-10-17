// CÉREBRO DO TUTOR — confere o caminho REST do vetor da pergunta que a PONTE usa (server/tutor/conhecimento/vetorPergunta.ts):
// mesmo modelo e mesmo formato da Central (vetor quase idêntico ao gravado em embedding-pergunta.json pela biblioteca do Google).
// Usa o login do gcloud do dono (como a ponte no Mac) ou a credencial padrão do Google. Custo: ~6 perguntas curtas (frações de centavo). Não toca no banco.
//   node_modules/.bin/tsx scripts/conhecimento/conferir-vetor-rest.ts
import fs from "node:fs";
import { GoogleAuth } from "google-auth-library";
import { tokenGoogle as tokenGcloud } from "../../server/vozPonte/googleToken";

// a ponte no Mac usa o gcloud; sem login nele, a credencial padrão do Google (a mesma da biblioteca da Central)
const adc = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const tokenGoogle = async () => tokenGcloud().catch(async () => String((await adc.getAccessToken()) ?? ""));
import { vetorVertex } from "../../server/tutor/conhecimento/vetorPergunta";

const ref = JSON.parse(fs.readFileSync("/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro/embedding-pergunta.json", "utf8")) as { vetores: { pergunta: string; values: number[] }[] };
const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b));
const projeto = process.env.GCLOUD_PROJECT_VERTEX || "staziamed-revalida-prod";
const ms: number[] = [];
for (const [i, r] of ref.vetores.slice(0, 6).entries()) {
  const t = performance.now();
  const v = await vetorVertex(r.pergunta, { projeto, local: "us", tokenGoogle });
  const d = performance.now() - t;
  if (i > 0) ms.push(d);
  console.log(`${i === 0 ? "frio " : "     "}${d.toFixed(0)} ms  cosseno com o vetor da biblioteca: ${cos(v, r.values).toFixed(4)}  ${r.pergunta}`);
}
ms.sort((a, b) => a - b);
console.log(`quente: p50 ${ms[Math.floor(ms.length / 2)].toFixed(0)} ms, máx ${ms.at(-1)!.toFixed(0)} ms (do Mac; da ponte nos EUA deve ser menor)`);
