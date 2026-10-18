// @vitest-environment node
/**
 * Treino em Dupla, Tarefa 5: as 10 estações do INEP 2020 do pacote de design como DADO DE TESTE
 * (ids teste-inep2020-eNN), só nos testes e no banco local. A carga do Supabase as recusa.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { convertInep2020 } from "../../scripts/dupla/converter-inep2020";
import { assertNoTestStations, buildSeedRows, buildSeedStatements } from "../../scripts/supabase/seed-builder";
import { buildDuplaTestStatements, loadDuplaTestStations } from "../../server/dupla/testStations";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import testStationsJson from "../../server/dupla/data/teste-inep2020.json";

// Pacote de design de 11/10 (o atual) e o de 08/10 (ainda aceito). Lidos só como TEXTO e só se existirem (só na máquina do dono).
const PACOTE_NOVO = "/Users/joaopaulomendes/Documents/StaziaMed-Previas/treino-dupla-2026-10-11/ui_kits/treino-dupla/stations-inep2020.js";
const PACOTE_ANTIGO = "/Users/joaopaulomendes/Downloads/templates/handoff-treino-dupla/ui_kits/treino-dupla/stations-inep2020.js";
const ITENS = [8, 28, 11, 13, 14, 9, 14, 18, 13, 11];
const IMPRESSOS = [2, 3, 3, 4, 0, 1, 4, 2, 4, 1];
const raw = testStationsJson as any[];

describe("Estações de teste do INEP 2020 (formato publicado)", () => {
  it("10 estações válidas (soma 10,00 cada) com 8/28/11/13/14/9/14/18/13/11 itens = 139", () => {
    const stations = loadDuplaTestStations(); // valida: lança se alguma soma for diferente de 10
    expect(stations).toHaveLength(10);
    expect(stations.map((s) => s.checklist_items.length)).toEqual(ITENS);
    expect(ITENS.reduce((a, b) => a + b, 0)).toBe(139);
    for (const s of stations) {
      expect(s.checklist_items.reduce((sum, i) => sum + i.grades.correct, 0)).toBeCloseTo(10, 6);
      expect(s.max_score).toBe(10);
      expect(s.duration_ms).toBe(600000);
    }
  });

  it("formato publicado: ids teste-inep2020-eNN, PEP com phase 'PEP', impressos sem imagem, roteiro do ator só na E1, aprovadas", () => {
    const stations = loadDuplaTestStations();
    expect(stations.map((s) => s.id)).toEqual(Array.from({ length: 10 }, (_, i) => `teste-inep2020-e${String(i + 1).padStart(2, "0")}`));
    expect(stations.map((s) => s.pressings.length)).toEqual(IMPRESSOS);
    for (const s of stations) {
      expect(s.medical_review).toBe("approved");
      expect(s.is_pro_only).toBe(false);
      expect(s.institution).toBe("INEP");
      expect(s.year).toBe("2020");
      expect(s.goal).toBe("Revalida");
      expect(s.topic).toBe(s.name);
      expect(s.taxonomy_path).toEqual([s.area, s.name]);
      // TODO(dono): o roteiro das outras 9 vem da Montagem (PEP oficial, com revisão médica); só a E1 veio do dono
      if (s.id !== "teste-inep2020-e01") expect(s.actor_script).toBe("");
      expect(s.summary).toEqual([]);
      s.pressings.forEach((p, k) => {
        expect(p.id).toBe(`${s.id}-p${k + 1}`);
        expect(p.image_url).toBeNull(); // TODO(dono): imagens dos impressos vêm da Montagem
        if (s.id !== "teste-inep2020-e01") {
          expect(p).not.toHaveProperty("source_number");
          expect(p).not.toHaveProperty("display_number");
          expect(p).not.toHaveProperty("initially_visible");
        }
      });
      s.checklist_items.forEach((item, k) => {
        expect(item.id).toBe(`${s.id}-i${k + 1}`);
        expect(item.order).toBe(k + 1);
        expect(item.phase).toBe("PEP");
        expect(item.grades.incorrect).toBe(0);
        expect(item.auto_grade_rule).toBeNull();
        item.subitems.forEach((sub, j) => expect(sub.id).toBe(`${item.id}-s${j + 1}`));
      });
    }
    expect(raw.every((s) => s.version === "teste")).toBe(true);
    // área pelo código do pacote: CM, CR, PED, GO, MFC, CM, CR, PED, GO, MFC
    expect(stations.map((s) => s.area)).toEqual([
      "Clínica Médica",
      "Cirurgia Geral",
      "Pediatria",
      "Ginecologia e Obstetrícia",
      "Medicina de Família e Comunidade",
      "Clínica Médica",
      "Cirurgia Geral",
      "Pediatria",
      "Ginecologia e Obstetrícia",
      "Medicina de Família e Comunidade",
    ]);
  });

  it("conteúdo fiel ao pacote: critérios por nível, subitens, dicas, tarefas e impressos", () => {
    const [e1, e2, e3, e4, e5] = loadDuplaTestStations();
    expect(e1.name).toBe("Leucemia aguda: palpação de fígado e baço");
    expect(e1.styles).toEqual(["Cansaço", "Febre", "Sangramento gengival"]);
    expect(e1.doctor_tasks.split("\n")).toHaveLength(4);
    expect(e1.doctor_tasks.startsWith("1. ler o impresso 1")).toBe(true);
    // sem rubric no pacote: texto dos níveis fica vazio (nada é inventado)
    expect(e1.checklist_items[0]).toMatchObject({ content: "Cumprimenta o paciente simulado.", tip: "", criteria: { correct: "", incorrect: "" } });
    expect(e1.checklist_items[1].tip).toBe("É necessária a execução dos 2 procedimentos para a obtenção do ponto.");
    // 3 níveis com subitens
    const tosse = e3.checklist_items[1];
    expect(tosse.grades).toEqual({ correct: 2, partial: 1, incorrect: 0 });
    expect(tosse.criteria).toEqual({
      correct: "Investiga as três características da tosse.",
      partial: "Investiga até duas características da tosse.",
      incorrect: "Não caracteriza a tosse.",
    });
    expect(tosse.subitems.map((s) => s.text)).toEqual([
      "Duração — acima de 20 dias",
      "Relação com o ciclo respiratório — tossidas rápidas e curtas (de cinco a dez) em uma única expiração",
      "Frequência — 30 a 40 episódios/dia",
    ]);
    // 2 níveis: sem "partial"
    const eco = e4.checklist_items[11];
    expect(eco.grades.partial).toBeNull();
    expect(eco.criteria).not.toHaveProperty("partial");
    expect(eco.criteria.correct).toBe("Solicita ecografia transvaginal e nenhum outro exame de imagem da pelve.");
    expect(e4.checklist_items[2].tip).toContain("PALM-COEIN: pólipo");
    // a "Observação" do caderno não vira tarefa numerada
    expect(e5.doctor_tasks.split("\n").map((l) => l.slice(0, 3))).toEqual(["1. ", "2. ", "3. ", "4. ", "Obs"]);
    // impressos: texto literal do pacote; os que dependem de imagem ficam com o aviso do próprio pacote
    expect(e2.pressings[2].name).toBe("Pergunta do chefe de plantão");
    expect(e3.pressings[2].content).toBe("Imagem disponível no documento original (página 11 do caderno de prova).");
  });

  it("E1: relato é impresso inicial (display 1, source 1) e o esfregaço é display 1 / source 2", () => {
    const [e1] = loadDuplaTestStations();
    expect(e1.pressings).toHaveLength(2);
    const [relato, esfregaco] = e1.pressings;
    expect(relato.name).toBe("Relato do caso clínico");
    expect(relato).toMatchObject({ source_number: 1, display_number: 1, initially_visible: true });
    expect(esfregaco.name).toBe("Imagem do esfregaço de sangue periférico");
    expect(esfregaco).toMatchObject({ source_number: 2, display_number: 1, initially_visible: false });
    // as demais estações não têm impresso inicial
    for (const s of loadDuplaTestStations().slice(1)) expect(s.pressings.some((p) => p.initially_visible)).toBe(false);
  });

  it("E1: actor_script traz os 10 blocos do roteiro e as outras 9 seguem vazias", () => {
    const stations = loadDuplaTestStations();
    const linhas = stations[0].actor_script.split("\n");
    expect(linhas).toHaveLength(10);
    expect(linhas.map((l) => l.slice(0, l.indexOf(":")))).toEqual([
      "DADOS PESSOAIS",
      "MOTIVO DE CONSULTA",
      "CARACTERÍSTICAS DO CANSAÇO/ FRAQUEZA",
      "CARACTERÍSTICAS DA FEBRE",
      "CARACTERÍSTICAS DO SANGRAMENTO GENGIVAL",
      "ANTECEDENTES PESSOAIS",
      "QUANDO O CANDIDATO TERMINAR A LEITURA DAS TAREFAS",
      "QUANDO O CANDIDATO TERMINAR A DESCRIÇÃO DO EXAME FÍSICO",
      "SE O CANDIDATO DER ALGUM DIAGNÓSTICO",
      "SE O CANDIDATO INDICAR ALGUM EXAME PARA CONFIRMAR",
    ]);
    // texto exato do roteiro, sem completar o que o roteiro não diz
    expect(linhas[0]).toBe("DADOS PESSOAIS: Marcelo, 30 anos de idade.");
    expect(linhas[2]).toBe("CARACTERÍSTICAS DO CANSAÇO/ FRAQUEZA: Não consta no script.");
    expect(linhas[4]).toBe("CARACTERÍSTICAS DO SANGRAMENTO GENGIVAL: Tempo de evolução: Dez dias. Outras características: Não consta no script.");
    expect(linhas[7]).toContain("liberar o IMPRESSO 2");
    expect(stations.slice(1).every((s) => s.actor_script === "")).toBe(true);
  });

  it("nenhuma imagem do pacote é copiada: image_url continua nulo e o JSON não cita caminho de imagem do pacote", () => {
    for (const s of raw) for (const p of s.pressings) expect(p.image_url).toBeNull();
    expect(JSON.stringify(testStationsJson)).not.toMatch(/assets\/inep2020|\.png|\.jpg|candidateImage|candidate_image/);
  });

  it("o conversor refeito a partir do pacote NOVO dá exatamente o JSON commitado", () => {
    if (!fs.existsSync(PACOTE_NOVO)) return; // o pacote só existe na máquina do dono
    const refeito = convertInep2020(fs.readFileSync(PACOTE_NOVO, "utf8"), "stations-inep2020.js");
    expect(refeito).toEqual(testStationsJson);
  });

  it("o pacote ANTIGO (08/10) também é aceito: só a E1 muda (sem roteiro, sem impresso inicial, sem os campos novos)", () => {
    if (!fs.existsSync(PACOTE_ANTIGO)) return;
    const antigo = convertInep2020(fs.readFileSync(PACOTE_ANTIGO, "utf8"), "stations-inep2020.js") as any[];
    expect(antigo).toHaveLength(10);
    expect(antigo.slice(1)).toEqual(raw.slice(1));
    expect(antigo[0].actor_script).toBe("");
    for (const p of antigo[0].pressings) {
      expect(p).not.toHaveProperty("initially_visible");
      expect(p).not.toHaveProperty("display_number");
    }
  });
});

describe("Conversor: lê o pacote como texto, sem executar nada", () => {
  const OK = (extra = "") => `(function () {
const O = (max, part) => [];
const C = (title, max, part, extra) => ({ title, max, options: O(max, part) });
const R = (...pairs) => pairs;
window.SZ_INEP2020 = [
{ id: "inep20-01", n: 1, name: "X", area: "Clínica Médica", code: "CM", short: "CM", duration: 600, origin: "o", difficulty: "Médio", tags: [],
  scenario: "S", tasks: ["a;"], prints: [], criteria: [C("Tudo.", 10)] }
];
${extra}
})();`;

  it("aceita a forma mínima e converte", () => {
    const [s] = convertInep2020(OK());
    expect(s.id).toBe("teste-inep2020-e01");
    expect(s.checklist_items).toHaveLength(1);
  });

  it("não executa o arquivo: código fora das formas aceitas vira erro com a posição", () => {
    (globalThis as any).__executou = false;
    expect(() => convertInep2020(OK("globalThis.__executou = true;"), "x.js")).toThrow(/x\.js:\d+:\d+: instrução não aceita/);
    expect(() => convertInep2020(OK('const A = require("fs");'), "x.js")).toThrow(/x\.js:\d+:\d+: constante não aceita "A"/);
    expect(() => convertInep2020(OK("window.SZ_INEP2020.forEach(s => { s.x = 1; }); process.exit(1);"), "x.js")).toThrow(/instrução não aceita/);
    expect((globalThis as any).__executou).toBe(false);
  });

  const NOVO = () => OK().replace(
    'tags: [],',
    `tags: [], candidateImage: "../../assets/x.png",`
  ).replace(
    "prints: [],",
    `prints: [{ title: "Relato", body: "R" }, { displayIndex: 1, title: "Esfregaço", body: "E", img: "../../assets/y.png" }, { title: "Outro", body: "O" }],`
  );

  it("aceita candidateImage, displayIndex e img: números ficam gravados, relato é inicial, imagens são ignoradas", () => {
    const [s] = convertInep2020(NOVO());
    expect(s.pressings.map((p) => [p.source_number, p.display_number, p.initially_visible])).toEqual([
      [1, 1, true],
      [2, 1, false],
      [3, 3, false],
    ]);
    expect(s.pressings.every((p) => p.image_url === null)).toBe(true);
    expect(JSON.stringify(s)).not.toMatch(/assets|\.png/);
  });

  it("sem candidateImage nem displayIndex o impresso fica como estava (sem campos novos)", () => {
    const [s] = convertInep2020(OK().replace("prints: [],", 'prints: [{ title: "A", body: "a" }],'));
    expect(s.pressings[0]).toEqual({ id: "teste-inep2020-e01-p1", name: "A", content: "a", image_url: null });
  });

  it("ACTOR_SCRIPT_1 vira actor_script com linhas RÓTULO: texto, só na estação 1; outra constante continua recusada", () => {
    const script = 'const ACTOR_SCRIPT_1 = [["DADOS PESSOAIS", "Fulano."], ["SE O CANDIDATO PERGUNTAR", "Dizer: ‘sim’."]];\nwindow.SZ_INEP2020.forEach(s => { s.actor = s.n === 1 ? ACTOR_SCRIPT_1 : []; s.max = 1; });';
    const [s] = convertInep2020(OK(script));
    expect(s.actor_script).toBe("DADOS PESSOAIS: Fulano.\nSE O CANDIDATO PERGUNTAR: Dizer: ‘sim’.");
    expect(() => convertInep2020(OK('const ACTOR_SCRIPT_2 = [["A", "b"]];'), "x.js")).toThrow(/constante não aceita "ACTOR_SCRIPT_2"/);
    expect(() => convertInep2020(OK('const ACTOR_SCRIPT_1 = [["A"]];'), "x.js")).toThrow(/ACTOR_SCRIPT_1/);
    expect(() => convertInep2020(OK('const ACTOR_SCRIPT_1 = "texto";'), "x.js")).toThrow(/ACTOR_SCRIPT_1/);
  });

  it("propriedade desconhecida no impresso segue recusada", () => {
    expect(() => convertInep2020(OK().replace("prints: [],", 'prints: [{ title: "A", body: "a", extra: 1 }],'))).toThrow(/impresso 1: propriedade desconhecida "extra"/);
    expect(() => convertInep2020(OK().replace("prints: [],", 'prints: [{ title: "A", body: "a", displayIndex: 0 }],'))).toThrow(/displayIndex/);
  });

  it("recusa chamada desconhecida, propriedade desconhecida e soma diferente de 10 (não corrige dado)", () => {
    expect(() => convertInep2020(OK().replace('C("Tudo.", 10)', 'eval("1")'))).toThrow(/chamada não aceita: eval/);
    expect(() => convertInep2020(OK().replace("scenario:", "extra: 1, scenario:"))).toThrow(/propriedade desconhecida "extra"/);
    expect(() => convertInep2020(OK().replace('C("Tudo.", 10)', 'C("Tudo.", 9.5)'))).toThrow(/soma 9\.500/);
    expect(() => convertInep2020(OK().replace('code: "CM"', 'code: "CR"'))).toThrow(/não bate com o código/);
  });
});

describe("A carga do Supabase não leva estações de teste", () => {
  it("a carga do Supabase recusa o prefixo teste- e a carga real não tem nenhuma", () => {
    expect(() => assertNoTestStations(["teste-inep2020-e01"])).toThrow("A carga do Supabase não aceita estações de teste (teste-…).");
    expect(() => assertNoTestStations(["inep-2020-e01", "outra"])).not.toThrow();
    const rows = buildSeedRows();
    expect(rows.stations.length).toBeGreaterThan(0);
    expect(rows.stations.some((s) => String(s.id).startsWith("teste-"))).toBe(false);
    expect(rows.contents.some((c) => String(c.station_id).startsWith("teste-"))).toBe(false);
    expect(buildSeedStatements().some((sql) => sql.includes("teste-inep2020"))).toBe(false);
  });

  it("as estações de teste não saem em produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(() => buildDuplaTestStatements()).toThrow("As estações de teste não existem em produção.");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("Banco local de desenvolvimento", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dupla-t5-"));
  let dev: DevDatabase | null = null;
  afterAll(async () => {
    await dev?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("o banco local recebe as 10 estações de teste aprovadas, com conteúdo", async () => {
    dev = await openDevDatabaseForTests(path.join(tmp, "db"));
    const { db } = dev;
    const lista = (await db.query<any>(`select id, medical_review, institution, year, area, is_pro_only, max_score::float as max_score, duration_ms from public.checklist_stations where id like 'teste-%' order by id`)).rows;
    expect(lista).toHaveLength(10);
    expect(lista.every((r) => r.medical_review === "approved" && r.institution === "INEP" && r.year === "2020" && !r.is_pro_only && r.max_score === 10 && r.duration_ms === 600000)).toBe(true);
    // a carga real continua lá (pendentes de revisão), sem misturar
    // (os 179 cartões do catálogo da migração 013420, sem conteúdo e pendentes, ficam fora desta conta)
    const reais = (await db.query<any>(`select count(*)::int as n from public.checklist_stations where id not like 'teste-%' and catalog_edition is null`)).rows[0].n;
    expect(reais).toBe(10);

    const conteudo = (await db.query<any>(`select station_id, content from public.checklist_station_contents where station_id like 'teste-%' order by station_id`)).rows;
    expect(conteudo).toHaveLength(10);
    expect(conteudo.map((c: any) => c.content.checklist_items.length)).toEqual(ITENS);
    expect(conteudo.map((c: any) => c.content.pressings.length)).toEqual(IMPRESSOS);
    expect(conteudo.every((c: any) => c.content.version === "teste")).toBe(true);
    // roteiro do ator só na E1; relato inicial e números do impresso chegam ao conteúdo gravado
    expect(conteudo.map((c: any) => c.content.actor_script !== "")).toEqual([true, ...Array(9).fill(false)]);
    expect(conteudo[0].content.pressings.map((p: any) => [p.source_number, p.display_number, p.initially_visible])).toEqual([[1, 1, true], [2, 1, false]]);

    // rodar a carga de novo é seguro (on conflict do update)
    for (const sql of buildDuplaTestStatements()) await db.exec(sql);
    const depois = (await db.query<any>(`select (select count(*) from public.checklist_stations where id like 'teste-%')::int as a, (select count(*) from public.checklist_station_contents where station_id like 'teste-%')::int as b`)).rows[0];
    expect(depois).toEqual({ a: 10, b: 10 });
  }, 240_000);
});
