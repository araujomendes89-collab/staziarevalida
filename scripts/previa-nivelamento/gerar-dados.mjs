// rodapé da prova que às vezes vem colado no texto (o banco do app já tira; aqui é só a prévia)
const limpar = (t) => String(t ?? "").replace(/\s*(enamed|revalida)?\s*Exame Nacional de (Avalia|Revalida)[^\n]*$/i, "").trim();
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSONL_PATH = path.join(__dirname, "../../revalida-reverse-engine/data/exports/staziamed_import_ready/v1/questions_active.jsonl");
const OUTPUT_PATH = path.join(__dirname, "dados.json");

const AREA_MAP = {
  "CLINICAL_MEDICINE": "CLINICA_MEDICA",
  "GENERAL_SURGERY": "CIRURGIA_GERAL",
  "PEDIATRICS": "PEDIATRIA",
  "OBSTETRICS_GYNECOLOGY": "GINECOLOGIA_OBSTETRICIA",
  "FAMILY_COMMUNITY_PUBLIC_HEALTH": "MEDICINA_FAMILIA_COMUNIDADE"
};

async function gerar() {
  const fileStream = fs.createReadStream(JSONL_PATH);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  // Store candidates by area and difficulty
  const candidatos = {
    CLINICA_MEDICA: { facil: [], media: [], dificil: [] },
    CIRURGIA_GERAL: { facil: [], media: [], dificil: [] },
    PEDIATRIA: { facil: [], media: [], dificil: [] },
    GINECOLOGIA_OBSTETRICIA: { facil: [], media: [], dificil: [] },
    MEDICINA_FAMILIA_COMUNIDADE: { facil: [], media: [], dificil: [] }
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    const q = JSON.parse(line);
    
    // Filtros: válidas, sem figura, review_required falso
    if (q.visual && q.visual.has_specific_assets) continue;
    if (q.dna?.review_required) continue;
    
    const area = AREA_MAP[q.dna?.primary_area];
    if (!area) continue;

    const diff = q.dna?.difficulty_estimate || "MODERATE";
    let faixa = diff === "LOW" ? "facil" : diff === "HIGH" ? "dificil" : "media";

    candidatos[area][faixa].push(q);
  }

  const selecionadas = [];
  const temasUsados = new Set();

  for (const area of Object.keys(candidatos)) {
    const selecionar = (faixa, qtd_desejada) => {
      let qtd = 0;
      for (const q of candidatos[area][faixa]) {
        if (qtd >= qtd_desejada) break;
        const topic = q.dna?.topic || "sem_tema";
        if (temasUsados.has(topic)) continue; // temas diferentes
        
        temasUsados.add(topic);
        
        // Format to the expected question schema
        selecionadas.push({
          id: q.id,
          // prova e número reais, lidos do id (ex.: revalida_2024_1_q012, enamed_2025_q001); nada inventado
          ...(() => {
            const [tipo, ano, sem] = q.exam_id.split("_");
            const enamed = tipo === "enamed";
            const n = Number(q.question_number);
            return {
              code: enamed ? `ENAMED-${ano}-Q${String(n).padStart(3, "0")}` : `REV-${ano}.${sem}-Q${String(n).padStart(3, "0")}`,
              number: n,
              exam: { id: q.exam_id, kind: enamed ? "ENAMED" : "REVALIDA", year: Number(ano), semester: enamed ? null : Number(sem), title: enamed ? `ENAMED ${ano}` : `Revalida ${ano}/${sem}` },
            };
          })(),
          statement: q.stem || q.statement,
          options: q.alternatives ? Object.entries(q.alternatives).map(([id, text]) => ({ id, text: limpar(text) })) : [],
          gabarito: q.official_answer || q.answer,
          comentario: q.correction?.explanation || null,
          topic: topic,
          faixa: faixa,
          images: [],
          origin: "official",
          support: null,
          preliminary: null
        });
        qtd++;
      }
      return qtd;
    };

    let facil = selecionar("facil", 2);
    let media = selecionar("media", 2);
    let dificil = selecionar("dificil", 2);

    // Compensar se faltar
    if (dificil < 2) media += selecionar("media", 2 - dificil);
    if (facil < 2) media += selecionar("media", 2 - facil);
    // Tenta pegar o que der se ainda faltar
    if (media < 2) {
       selecionar("facil", 6 - (facil + media + dificil));
    }
  }

  // ordem da prévia: as 15 primeiras têm 1 fácil, 1 média e 1 difícil de cada área (MFC sem difícil: 2 médias), como o banco sorteia
  const usadas = new Set();
  const bloco1 = [];
  for (const area of [...new Set(selecionadas.map((q) => q.area))]) {
    for (const faixa of ["facil", "media", "dificil"]) {
      const q = selecionadas.find((x) => x.area === area && !usadas.has(x.id) && x.faixa === faixa) ?? selecionadas.find((x) => x.area === area && !usadas.has(x.id) && x.faixa === "media");
      if (q) { usadas.add(q.id); bloco1.push(q); }
    }
  }
  const ordenadas = [...bloco1, ...selecionadas.filter((q) => !usadas.has(q.id))];
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(ordenadas, null, 2));
  console.log(`Gerados ${selecionadas.length} dados em ${OUTPUT_PATH}`);
}

gerar().catch(console.error);