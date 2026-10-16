// Classifica a dificuldade das questões com o Gemini (Vertex), em lotes. Uso: node classificar.mjs <modelo> [pasta-saida] [tamanho-lote] [arquivo-ids.json]
// Retoma sozinho (pula lotes já gravados). Nunca imprime a chave.
import fs from "node:fs";
import path from "node:path";
const D = "/Volumes/StaziaMed/.tmp-aulas/dificuldade";
const [, , MODELO = "gemini-3.1-pro-preview", OUT = `${D}/gemini`, TAM = "20", IDS] = process.argv;
const CONC = 2;
const env = Object.fromEntries(fs.readFileSync(`${process.env.HOME}/.config/vertex-staziamed/vertex.env`, "utf8").split("\n").map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const URL = `${env.VERTEX_API_BASE}/${MODELO}:generateContent?key=${env.VERTEX_API_KEY}`;
const criterio = fs.readFileSync(`${D}/CRITERIO.md`, "utf8");
let qs = JSON.parse(fs.readFileSync(`${D}/questoes.json`, "utf8"));
if (IDS) { const s = new Set(JSON.parse(fs.readFileSync(IDS, "utf8"))); qs = qs.filter((q) => s.has(q.id)); }
qs.sort((a, b) => a.area.localeCompare(b.area) || a.exam.localeCompare(b.exam) || a.n - b.n);
fs.mkdirSync(OUT, { recursive: true });
const tam = Number(TAM);
const lotes = [];
for (let i = 0; i < qs.length; i += tam) lotes.push(qs.slice(i, i + tam));
const nomeLote = (i) => path.join(OUT, `lote-${String(i).padStart(3, "0")}.json`);

const schema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      id: { type: "STRING" }, nota: { type: "INTEGER" }, faixa: { type: "STRING", enum: ["facil", "media", "dificil"] },
      motivo: { type: "STRING" }, confianca: { type: "STRING", enum: ["alta", "media", "baixa"] }, suspeita_gabarito: { type: "BOOLEAN" },
    },
    required: ["id", "nota", "faixa", "motivo", "confianca"],
  },
};

function texto(q) {
  const alts = q.options.map((o) => `${o.id}) ${o.text}`).join("\n");
  return `### ID: ${q.id}\nÁrea: ${q.area} | Tema: ${q.topic}${q.subtopic ? " / " + q.subtopic : ""}${q.needs_image && !q.n_images ? " | IMAGEM NÃO DISPONÍVEL" : ""}\nEnunciado: ${q.statement}\nAlternativas:\n${alts}\nGabarito: ${q.gabarito}`;
}

async function chamar(lote) {
  const prompt = `Você é um professor experiente de preparação para o Revalida (médicos formados no exterior). Classifique a DIFICULDADE de cada questão abaixo seguindo exatamente o critério a seguir.\n\n${criterio}\n\nResponda um JSON (lista) com um objeto por questão, na mesma ordem, com os campos: id (copie o ID), nota (1 a 5), faixa (facil|media|dificil, coerente com a nota: 1-2 facil, 3 media, 4-5 dificil), motivo (uma frase curta em português), confianca (alta|media|baixa) e suspeita_gabarito (true/false). Não omita nenhuma questão.\n\nQUESTÕES:\n\n${lote.map(texto).join("\n\n")}`;
  const corpo = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema, maxOutputTokens: 16000 } };
  for (let t = 1; t <= 6; t++) {
    try {
      const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(600000) });
      const j = await r.json();
      if (j.error) throw new Error(`${j.error.code} ${String(j.error.message).slice(0, 120)}`);
      const txt = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      const arr = JSON.parse(txt);
      const ids = new Set(lote.map((q) => q.id));
      const ok = arr.filter((x) => ids.has(x.id));
      if (ok.length < lote.length) throw new Error(`veio ${ok.length} de ${lote.length}`);
      return ok;
    } catch (e) {
      console.log(`  tentativa ${t} falhou: ${String(e.message).replace(/key=\S+/g, "key=[oculta]").slice(0, 160)}`);
      await new Promise((r) => setTimeout(r, 15000 * t));
    }
  }
  return null;
}

let proximo = 0, feitos = 0, falhas = [];
async function trabalhador() {
  while (true) {
    const i = proximo++;
    if (i >= lotes.length) return;
    if (fs.existsSync(nomeLote(i))) { feitos++; continue; }
    const r = await chamar(lotes[i]);
    if (r) { fs.writeFileSync(nomeLote(i), JSON.stringify({ modelo: MODELO, itens: r }, null, 1)); feitos++; console.log(`lote ${i}/${lotes.length - 1} ok (${feitos}/${lotes.length})`); }
    else { falhas.push(i); console.log(`lote ${i} FALHOU`); }
  }
}
console.log(`modelo ${MODELO}: ${qs.length} questões em ${lotes.length} lotes de ${tam}`);
await Promise.all(Array.from({ length: CONC }, trabalhador));
console.log(`fim: ${feitos} lotes prontos; falhas: ${falhas.join(",") || "nenhuma"}`);
