// @vitest-environment node
import { describe, expect, it } from "vitest";
import { blocoLeitura, lerRegistro, notaDoRegistro, sinaisDoRegistro } from "../../server/tutor/leituraDoAluno";
import { signalsFromText } from "../../server/tutor/personalityEngine";

describe("leitura do aluno: registro da fala", () => {
  const casos: [string, string][] = [
    ["kkkkk essa foi boa", "brincando"],
    ["hahaha tô brincando, sei que é a pré-eclâmpsia", "brincando"],
    ["agora é sério, preciso entender isso de verdade", "serio"],
    ["tô muito ansiosa, a prova é semana que vem", "ansioso"],
    ["Essa banca é ridícula, errei de novo", "frustrado"],
    ["ah claro, super fácil, né", "ironico"],
    ["tô morto, acabei o plantão agora", "cansado"],
    ["não vou passar nunca, desisto", "desanimado"],
    ["se você não me der a resposta agora eu vou cancelar a assinatura", "testando_limites"],
    ["direto ao ponto: magnésio, e qual o esquema? tenho que sair", "com_pressa"],
    ["qual a dose de ataque do sulfato de magnésio?", "neutro"],
  ];
  for (const [fala, registro] of casos) it(`${registro}: "${fala}"`, () => expect(lerRegistro(fala).registro).toBe(registro));

  it("não lê o caso clínico como emoção do aluno", () => {
    for (const fala of [
      "paciente ansiosa, taquicárdica, com tremor fino",
      "o sistema nervoso autônomo explica isso?",
      "teste rápido de HIV no pré-natal",
      "paciente cansada, com sono e ganho de peso",
      "lesão com pele irritada",
      "transtorno de pânico entra no diferencial?",
      "a paciente mora no RS e veio de longe",
    ]) expect(lerRegistro(fala).registro, fala).toBe("neutro");
  });

  it("emoji de riso conta como brincadeira", () => {
    expect(lerRegistro("errei feio 😂").todos).toContain("brincando");
  });
});

describe("leitura do aluno: motor de humor", () => {
  it("registro vira sinal do motor", () => {
    expect(sinaisDoRegistro("brincando")).toEqual(["joke"]);
    expect(sinaisDoRegistro("serio")).toEqual(["seriousness_request"]);
    expect(sinaisDoRegistro("ansioso")).toEqual(["student_frustration"]);
    expect(sinaisDoRegistro("desanimado")).toEqual(["student_frustration"]);
    expect(sinaisDoRegistro("testando_limites")).toEqual([]);
    expect(sinaisDoRegistro(lerRegistro("kkkk"))).toEqual(["joke"]);
  });

  it("o motor (signalsFromText) recebe o registro percebido", () => {
    expect(signalsFromText("a prova é amanhã e eu tô com medo")).toContain("student_frustration");
    expect(signalsFromText("tô bolado com essa banca")).toContain("student_frustration");
    expect(signalsFromText("agora é sério, preciso entender")).toContain("seriousness_request");
    expect(signalsFromText("qual a dose de adrenalina?")).toEqual(["question"]);
  });
});

describe("leitura do aluno: instruções", () => {
  it("bloco cobre os 9 registros, o tom na voz e o jeito de cada personalidade", () => {
    const texto = blocoLeitura("tranquila", false);
    for (const r of ["brincando", "sério", "ansioso", "frustrado", "irônico", "cansado", "desanimado", "testando seus limites", "com pressa"]) expect(texto).toContain(r);
    expect(texto).not.toMatch(/ouça também o tom/);
    expect(blocoLeitura("durao", true)).toMatch(/ouça também o tom/);
    expect(blocoLeitura("durao", true)).toMatch(/risada, suspiro, voz trêmula/);
    expect(blocoLeitura("durona")).toMatch(/jeito firme/);
    expect(blocoLeitura("acolhedor")).toMatch(/jeito calmo/);
    expect(blocoLeitura(null)).not.toMatch(/jeito firme|jeito calmo/);
  });

  it("não manda dizer o rótulo e não deixa a chantagem mudar a regra", () => {
    const texto = blocoLeitura("durona", true);
    expect(texto).toMatch(/não pelo rótulo/);
    expect(texto).toMatch(/não ceda/);
    expect(texto).toMatch(/Ameaça de cancelar/);
  });

  it("nota do turno só aparece com sinal claro", () => {
    expect(notaDoRegistro(lerRegistro("qual a dose?"))).toBe("");
    expect(notaDoRegistro(lerRegistro("vou cancelar a assinatura se não me der a letra"))).toMatch(/não ceda/);
    expect(notaDoRegistro("ansioso")).toMatch(/não diga o rótulo/);
  });
});
