// @vitest-environment node
/** Leitura de planilhas e JSON de questões para a importação do painel de administração. */
import { describe, expect, it } from "vitest";
import {
  csvTemplate,
  jsonTemplate,
  markDuplicates,
  parseArea,
  parseCsv,
  parseExam,
  questionsFromCsv,
  questionsFromFile,
  questionsFromJson,
} from "../novo/app/admin/questionImport.js";

const header = "prova;numero;area;tema;subtema;enunciado;A;B;C;D;gabarito;explicacao;situacao";
const row = (cells: string[]) => cells.join(";");
const statement = "Lactente de 4 meses com coriza e sibilância há 2 dias. Qual é a conduta adequada?";

describe("Importação de questões — planilha", () => {
  it("lê CSV com ; , ou tab, aspas, aspas escapadas e quebra de linha dentro do campo", () => {
    expect(parseCsv('a;b\n1;"x; ""y""\nz"\n')).toEqual([["a", "b"], ["1", 'x; "y"\nz']]);
    expect(parseCsv("﻿a,b\r\n1,2\r\n\r\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("reconhece prova e área em vários formatos", () => {
    expect(parseExam("Revalida 2026/2")).toEqual({ kind: "REVALIDA", year: 2026, semester: 2 });
    expect(parseExam("REVALIDA INEP 2024.1")).toEqual({ kind: "REVALIDA", year: 2024, semester: 1 });
    expect(parseExam("revalida-2021")).toEqual({ kind: "REVALIDA", year: 2021, semester: null });
    expect(parseExam("ENAMED 2025")).toEqual({ kind: "ENAMED", year: 2025, semester: null });
    expect(parseExam("Residência 2025")).toBeNull();
    expect(["Clínica Médica", "GO", "Gineco & Obstetrícia", "Preventiva", "cirurgia geral", "PEDIATRIA"].map(parseArea)).toEqual([
      "CLINICA_MEDICA",
      "GINECOLOGIA_OBSTETRICIA",
      "GINECOLOGIA_OBSTETRICIA",
      "MEDICINA_FAMILIA_COMUNIDADE",
      "CIRURGIA_GERAL",
      "PEDIATRIA",
    ]);
    expect(parseArea("Odontologia")).toBeNull();
  });

  it("converte cada linha para o formato do banco, com a explicação na alternativa correta", () => {
    const csv = [
      header,
      row(["Revalida 2026/2", "7", "Pediatria", "Bronquiolite", "", statement, "a", "b", "c", "d", "c", "Suporte clínico.", "válida"]),
      row(["Revalida 2026/2", "8", "Pediatria", "Bronquiolite", "", statement, "a", "b", "c", "d", "ANULADA", "", ""]),
    ].join("\n");
    const { items, fileError } = questionsFromCsv(csv);
    expect(fileError).toBeNull();
    expect(items[0]).toMatchObject({ line: 2, problems: [] });
    expect(items[0].question).toMatchObject({
      kind: "REVALIDA",
      year: 2026,
      semester: 2,
      number: 7,
      area: "PEDIATRIA",
      topic: "Bronquiolite",
      subtopic: null,
      correct_option: "C",
      status: "valid",
      needs_image: false,
      sources: [],
    });
    expect(items[0].question.options).toEqual([
      { id: "A", text: "a", explanation: "" },
      { id: "B", text: "b", explanation: "" },
      { id: "C", text: "c", explanation: "Suporte clínico." },
      { id: "D", text: "d", explanation: "" },
    ]);
    expect(items[1].question).toMatchObject({ status: "annulled", correct_option: null });
    expect(items[1].problems).toEqual([]);
  });

  it("aponta os problemas de cada linha e as colunas que faltam", () => {
    const csv = [header, row(["Residência 2025", "x", "Odonto", "", "", "curto", "a", "", "c", "d", "E", "", "talvez"])].join("\n");
    const [item] = questionsFromCsv(csv).items;
    expect(item.problems).toEqual([
      'Prova não reconhecida: "Residência 2025". Use, por exemplo, Revalida 2026/2 ou ENAMED 2025.',
      "Número da questão inválido.",
      'Grande área não reconhecida: "Odonto".',
      "Informe o tema.",
      "Enunciado vazio ou curto demais.",
      "Alternativa sem texto: B.",
      'Situação não reconhecida: "talvez". Use válida, anulada ou alterada.',
      'Gabarito inválido: "E". Use A, B, C, D ou ANULADA.',
    ]);
    expect(questionsFromCsv("prova;numero\nRevalida 2026/2;1").fileError).toMatch(/^Faltam colunas: area, tema, enunciado, A, B, C, D, gabarito/);
    expect(questionsFromCsv(header).fileError).toMatch(/pelo menos uma questão/);
  });

  it("marca questão que cita figura e repetida no arquivo", () => {
    const withFigure = "Paciente com dor torácica. O ECG abaixo mostra o traçado da admissão. Qual o diagnóstico?";
    const csv = [
      header,
      row(["Revalida 2026/2", "1", "Clínica Médica", "IAM", "", withFigure, "a", "b", "c", "d", "A", "", ""]),
      row(["Revalida 2026/2", "1", "Clínica Médica", "IAM", "", statement, "a", "b", "c", "d", "A", "", ""]),
    ].join("\n");
    const items = markDuplicates(questionsFromCsv(csv).items);
    expect(items[0].question.needs_image).toBe(true);
    expect(items[1].problems).toEqual(["Repetida no arquivo (mesma prova e número da linha 2)."]);
  });

  it("diz se a coluna imagem veio preenchida: sem ela, 'cita figura' é só um palpite e não troca a marca gravada", () => {
    const withFigure = "Paciente com dor torácica. O ECG abaixo mostra o traçado da admissão. Qual o diagnóstico?";
    const line = (number: string, text: string, image: string) =>
      row(["Revalida 2026/2", number, "Clínica Médica", "IAM", "", text, "a", "b", "c", "d", "A", "", "", image]);
    const csv = [`${header};imagem`, line("1", withFigure, ""), line("2", statement, ""), line("3", statement, "sim"), line("4", withFigure, "não")].join("\n");
    const items = questionsFromCsv(csv).items.map((i) => i.question);
    expect(items.map((q) => [q.needs_image, q.needs_image_declared])).toEqual([
      [true, false],
      [false, false],
      [true, true],
      [false, true],
    ]);
    expect(questionsFromCsv([header, row(["Revalida 2026/2", "5", "Pediatria", "Bronquiolite", "", statement, "a", "b", "c", "d", "A", "", ""])].join("\n")).items[0].question)
      .toMatchObject({ needs_image: false, needs_image_declared: false });
  });
});

describe("Importação de questões — JSON e modelos", () => {
  it("aceita lista ou { questions }, com alternativas em colunas ou em lista", () => {
    const base = { prova: "ENAMED 2025", numero: 3, area: "Cirurgia", tema: "Trauma", enunciado: statement, gabarito: "a" };
    const asColumns = questionsFromJson(JSON.stringify([{ ...base, A: "1", B: "2", C: "3", D: "4" }]));
    const asList = questionsFromJson(
      JSON.stringify({ questions: [{ ...base, alternativas: [{ letra: "A", texto: "1", explicacao: "Porque sim." }, "2", "3", { id: "D", text: "4" }] }] })
    );
    for (const result of [asColumns, asList]) {
      expect(result.fileError).toBeNull();
      expect(result.items[0].problems).toEqual([]);
      expect(result.items[0].question).toMatchObject({ kind: "ENAMED", year: 2025, number: 3, area: "CIRURGIA_GERAL", correct_option: "A" });
      expect(result.items[0].question.options.map((o: any) => o.text)).toEqual(["1", "2", "3", "4"]);
    }
    expect(asList.items[0].question.options[0].explanation).toBe("Porque sim.");
    expect(questionsFromJson("{ ruim").fileError).toMatch(/mal formado/);
    expect(questionsFromJson("{}").fileError).toMatch(/lista de questões/);
  });

  it("os modelos de planilha e de JSON são lidos, mas a linha de exemplo é recusada (Q08): não pode virar questão", () => {
    const fromCsv = questionsFromFile("modelo.csv", csvTemplate());
    const fromJson = questionsFromFile("modelo.json", jsonTemplate());
    for (const result of [fromCsv, fromJson]) {
      expect(result.fileError).toBeNull();
      expect(result.items).toHaveLength(1);
      // a linha continua sendo lida (o banco recebe os mesmos campos), mas com o problema na lista: a importação não é liberada
      expect(result.items[0].question).toMatchObject({ kind: "REVALIDA", year: 2026, semester: 2, area: "CLINICA_MEDICA", correct_option: "B" });
      expect(result.items[0].problems).toHaveLength(1);
      expect(result.items[0].problems[0]).toMatch(/linha de exemplo do modelo/);
    }
  });

  it("recusa qualquer campo que ainda tenha o texto de exemplo do modelo, mesmo com o resto trocado; texto parecido não é recusado", () => {
    const real = { prova: "Revalida 2026/2", numero: 7, area: "Pediatria", tema: "Bronquiolite", enunciado: statement, A: "a", B: "b", C: "c", D: "d", gabarito: "B" };
    const withCell = (cell: Record<string, unknown>) => questionsFromJson(JSON.stringify([{ ...real, ...cell }])).items[0].problems;
    expect(withCell({})).toEqual([]);
    for (const cell of [
      { tema: "Tema principal da questão" },
      { enunciado: "Texto completo do enunciado, como está no caderno de prova." },
      { enunciado: "  texto completo do enunciado,  como está no caderno de PROVA.  " },
      { A: "Texto da alternativa A" },
      { D: "Texto da alternativa D" },
      { subtema: "Subtema (opcional)" },
      { explicacao: "Por que a alternativa correta está certa (opcional)" },
      { "conduta esperada": "Conduta esperada (opcional)" },
      { fonte: "Gabarito oficial definitivo (opcional)" },
    ]) {
      const problems = withCell(cell);
      expect(problems, JSON.stringify(cell)).toHaveLength(1);
      expect(problems[0]).toMatch(/linha de exemplo do modelo/);
    }
    // só o campo inteiro igual ao exemplo conta: uma frase que apenas contém o texto, ou a prova e o número do exemplo, não
    expect(withCell({ tema: "Tema principal da questão: bronquiolite" })).toEqual([]);
    expect(withCell({ numero: 1, area: "Clínica Médica" })).toEqual([]);
  });
});

describe("Importação de questões — avisos que não travam (Q11)", () => {
  it("explicação geral em questão ANULADA não é gravada: a linha avisa, sem virar problema", () => {
    const csv = [
      header,
      row(["Revalida 2026/2", "7", "Pediatria", "Bronquiolite", "", statement, "a", "b", "c", "d", "ANULADA", "Explicação geral.", ""]),
      row(["Revalida 2026/2", "8", "Pediatria", "Bronquiolite", "", statement, "a", "b", "c", "d", "B", "Explicação geral.", ""]),
      row(["Revalida 2026/2", "9", "Pediatria", "Bronquiolite", "", statement, "a", "b", "c", "d", "ANULADA", "", ""]),
    ].join("\n");
    const { items } = questionsFromCsv(csv);
    expect(items.map((i: any) => i.problems)).toEqual([[], [], []]);
    expect(items[0].notes).toEqual([expect.stringMatching(/explicação geral.*anulada/i)]);
    expect(items[1].notes).toEqual([]);
    expect(items[2].notes).toEqual([]);
    // a explicação de cada alternativa, quando vem, é gravada mesmo na anulada
    const json = questionsFromJson(JSON.stringify([{ prova: "ENAMED 2025", numero: 3, area: "Cirurgia", tema: "Trauma", enunciado: statement, gabarito: "anulada", A: "1", B: "2", C: "3", D: "4", "explicacao a": "Só a A." }]));
    expect(json.items[0].notes).toEqual([]);
    expect(json.items[0].question.options[0].explanation).toBe("Só a A.");
  });
});
