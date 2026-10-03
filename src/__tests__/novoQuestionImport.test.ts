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

  it("os modelos de planilha e de JSON são lidos sem erro", () => {
    const fromCsv = questionsFromFile("modelo.csv", csvTemplate());
    const fromJson = questionsFromFile("modelo.json", jsonTemplate());
    for (const result of [fromCsv, fromJson]) {
      expect(result.fileError).toBeNull();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].problems).toEqual([]);
      expect(result.items[0].question).toMatchObject({ kind: "REVALIDA", year: 2026, semester: 2, area: "CLINICA_MEDICA", correct_option: "B" });
    }
  });
});
