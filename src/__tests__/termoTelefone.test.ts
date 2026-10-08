// @vitest-environment node
/**
 * Regras do WhatsApp do cadastro (src/novo/app/legal/phone.js): país + número digitado viram o formato internacional que o
 * banco aceita (profiles.phone: "+" e de 8 a 15 dígitos, o primeiro de 1 a 9), com as mensagens do spec (seções 5 e 11).
 */
import { describe, expect, it } from "vitest";
import { COUNTRIES, normalizePhone, phoneError, splitPhone } from "../novo/app/legal/phone.js";
import { TERMO_VERSAO, TUTOR_IA_VERSAO } from "../novo/app/legal/versions.js";

const VAZIO = "Informe seu WhatsApp.";
const SEM_DDD = "Informe o WhatsApp com DDD.";
const SEM_PAIS = "Informe o WhatsApp com código do país.";
const BANCO = /^\+[1-9][0-9]{7,14}$/; // o check de profiles.phone

describe("WhatsApp — exemplos do spec", () => {
  it("limpa a digitação e guarda no formato internacional", () => {
    expect(normalizePhone("+55", "(41) 99999-8888")).toBe("+5541999998888");
    expect(normalizePhone("+55", "041 3333-4444")).toBe("+554133334444");
    expect(normalizePhone("+55", "+55 41 99999-8888")).toBe("+5541999998888");
    expect(normalizePhone("+351", "912 345 678")).toBe("+351912345678");
    expect(normalizePhone("+598", "12345678901234")).toBeNull(); // 14 dígitos depois do código
  });

  it("mostra a mensagem certa para cada erro", () => {
    expect(phoneError("+55", "9999-8888")).toBe(SEM_DDD);
    expect(phoneError("+1", "12345")).toBe(SEM_PAIS);
    expect(phoneError("+55", "")).toBe(VAZIO);
    expect(phoneError("+55", "(41) 99999-8888")).toBeNull();
    expect(phoneError("+351", "912 345 678")).toBeNull();
  });

  it("separa o código do país do número guardado", () => {
    expect(splitPhone("+5541999998888")).toEqual({ code: "+55", number: "41999998888" });
  });
});

describe("WhatsApp — lista de países e versões", () => {
  it("o seletor começa no Brasil e termina em Outro, na ordem do spec", () => {
    expect(COUNTRIES.map((c) => c.label)).toEqual([
      "Brasil +55",
      "Argentina +54",
      "Bolívia +591",
      "Chile +56",
      "Colômbia +57",
      "Cuba +53",
      "Equador +593",
      "Espanha +34",
      "Estados Unidos +1",
      "Paraguai +595",
      "Peru +51",
      "Portugal +351",
      "Uruguai +598",
      "Venezuela +58",
      "Outro",
    ]);
    expect(COUNTRIES[0]).toEqual({ code: "+55", label: "Brasil +55" });
    expect(COUNTRIES.at(-1)).toEqual({ code: "outro", label: "Outro" });
    for (const c of COUNTRIES.slice(0, -1)) expect(c.label.endsWith(c.code)).toBe(true);
  });

  it("as versões vigentes dos documentos", () => {
    expect(TERMO_VERSAO).toBe("1.0");
    expect(TUTOR_IA_VERSAO).toBe("1.0");
  });
});

describe("WhatsApp — Brasil", () => {
  it("aceita espaços, parênteses e traços, com ou sem espaços nas pontas", () => {
    for (const digitado of ["(41) 99999-8888", "41 99999 8888", "41-99999-8888", "  41999998888  ", "(41)99999-8888"]) {
      expect(normalizePhone("+55", digitado)).toBe("+5541999998888");
    }
  });

  it("DDD com 2 dígitos mais 8 ou 9 dígitos", () => {
    expect(normalizePhone("+55", "4133334444")).toBe("+554133334444"); // fixo
    expect(normalizePhone("+55", "41999998888")).toBe("+5541999998888"); // celular
    for (const ruim of ["413333444", "419999988889", "99999-8888", "41", "abc"]) {
      expect(normalizePhone("+55", ruim)).toBeNull();
    }
    expect(phoneError("+55", "413333444")).toBe(SEM_DDD);
    expect(phoneError("+55", "419999988889")).toBe(SEM_DDD);
  });

  it("o zero antes do DDD é retirado (só uma vez) e o DDD não começa com zero", () => {
    expect(normalizePhone("+55", "0 41 99999-8888")).toBe("+5541999998888");
    expect(normalizePhone("+55", "041999998888")).toBe("+5541999998888");
    expect(normalizePhone("+55", "00 99999-8888")).toBeNull();
    expect(normalizePhone("+55", "0041999998888")).toBeNull();
  });

  it("+55 digitado no número é retirado; sem o sinal de mais, 55 é o DDD", () => {
    expect(normalizePhone("+55", "+55 (41) 99999-8888")).toBe("+5541999998888");
    expect(normalizePhone("+55", "+5541999998888")).toBe("+5541999998888");
    expect(normalizePhone("+55", "+55 55 99999-8888")).toBe("+5555999998888"); // DDD 55 depois do +55
    expect(normalizePhone("+55", "55 99999-8888")).toBe("+5555999998888"); // DDD 55
    expect(normalizePhone("+55", "+55 041 99999-8888")).toBe("+5541999998888");
  });

  it("outro país digitado no número não vale", () => {
    expect(normalizePhone("+55", "+351 912 345 678")).toBeNull();
    expect(phoneError("+55", "+351 912 345 678")).toBe(SEM_DDD);
  });

  it("o + vale mesmo depois de parênteses, espaços ou marcas invisíveis de quem copia o número do WhatsApp", () => {
    expect(normalizePhone("+55", "(+55) 41 99999-8888")).toBe("+5541999998888");
    expect(normalizePhone("+55", "(+55) (41) 99999-8888")).toBe("+5541999998888");
    expect(normalizePhone("+55", "‪+55 41 99999‑8888‬")).toBe("+5541999998888"); // marcas de direção e hífen que não quebra
    expect(normalizePhone("+55", " +55 41 99999-8888")).toBe("+5541999998888"); // espaços que não quebram
    expect(normalizePhone("+351", "(+351) 912 345 678")).toBe("+351912345678");
  });

  it("letras no número não valem (os dígitos de uma palavra não fazem parte do número)", () => {
    expect(normalizePhone("+55", "(41) 99999-8888 casa")).toBeNull();
    expect(normalizePhone("+55", "41 99999-8888 ramal 12")).toBeNull();
    expect(normalizePhone("+351", "912 345 678 ext 12")).toBeNull(); // sem a regra, viraria +35191234567812
    expect(normalizePhone("+55", "4199999a8888")).toBeNull();
    expect(phoneError("+55", "(41) 99999-8888 casa")).toBe(SEM_DDD);
    expect(phoneError("+351", "912 345 678 ext 12")).toBe(SEM_PAIS);
  });

  it("só o que não tem número nenhum é vazio", () => {
    for (const vazio of ["", "   ", "( ) -", "---"]) expect(phoneError("+55", vazio)).toBe(VAZIO);
    expect(phoneError("+55", "+55")).toBe(SEM_DDD); // tem número, mas falta o resto
  });
});

describe("WhatsApp — outros países", () => {
  it("de 6 a 13 dígitos depois do código, e o zero da frente fica", () => {
    expect(normalizePhone("+351", "123456")).toBe("+351123456");
    expect(normalizePhone("+351", "12345")).toBeNull();
    expect(normalizePhone("+54", "1234567890123")).toBe("+541234567890123"); // 13 dígitos, 15 no total
    expect(normalizePhone("+54", "12345678901234")).toBeNull();
    expect(normalizePhone("+351", "0912 345 678")).toBe("+3510912345678"); // zero só sai no Brasil
    expect(normalizePhone("+34", "612 34 56 78")).toBe("+34612345678");
  });

  it("o total (código + número) respeita o banco: de 8 a 15 dígitos", () => {
    expect(normalizePhone("+598", "123456789012")).toBe("+598123456789012"); // 15 no total
    expect(normalizePhone("+598", "1234567890123")).toBeNull(); // 16 no total
    expect(normalizePhone("+598", "123456")).toBe("+598123456");
    expect(normalizePhone("+1", "123456")).toBeNull(); // 6 dígitos, mas só 7 no total
    expect(normalizePhone("+1", "1234567")).toBe("+11234567");
    expect(normalizePhone("+1", "(202) 555-0123")).toBe("+12025550123");
  });

  it("+código digitado no número é retirado quando é o do país escolhido", () => {
    expect(normalizePhone("+351", "+351 912 345 678")).toBe("+351912345678");
    expect(normalizePhone("+1", "+1 (202) 555-0123")).toBe("+12025550123");
  });

  it("outro país digitado no número não vale (não vira um número de 15 dígitos sem sentido)", () => {
    expect(normalizePhone("+351", "+44 7911 123456")).toBeNull();
    expect(phoneError("+351", "+44 7911 123456")).toBe(SEM_PAIS);
  });

  it("todas as mensagens fora do Brasil pedem o código do país", () => {
    for (const code of ["+54", "+591", "+1", "+351", "+598"]) {
      expect(phoneError(code, "123")).toBe(SEM_PAIS);
      expect(phoneError(code, "")).toBe(VAZIO);
    }
  });
});

describe("WhatsApp — Outro (a pessoa digita o código)", () => {
  it("aceita o código com ou sem o sinal de mais e com espaços", () => {
    for (const code of ["+44", "44", " + 44 ", "+ 4 4"]) expect(normalizePhone(code, "7911 123456")).toBe("+447911123456");
    expect(normalizePhone("+244", "923 456 789")).toBe("+244923456789");
    expect(phoneError("+244", "923 456 789")).toBeNull();
  });

  it("código inválido ou ainda não digitado pede o código do país", () => {
    for (const code of ["outro", "", "  ", "+", "+0", "+0044", "+4444", "abc", "4a4", "+44x"]) {
      expect(normalizePhone(code, "7911123456")).toBeNull();
      expect(phoneError(code, "7911123456")).toBe(SEM_PAIS);
    }
    expect(phoneError("outro", "")).toBe(VAZIO); // sem número, a mensagem é a de vazio
  });

  it("código 55 digitado em Outro vale as regras do Brasil", () => {
    expect(normalizePhone("55", "(41) 99999-8888")).toBe("+5541999998888");
    expect(phoneError("55", "9999-8888")).toBe(SEM_DDD);
  });

  it("o número digitado com o próprio + vale como código e número juntos só quando o código bate", () => {
    expect(normalizePhone("+44", "+44 7911 123456")).toBe("+447911123456");
    expect(normalizePhone("+44", "+49 151 12345678")).toBeNull();
  });
});

describe("WhatsApp — o que sai passa no banco", () => {
  it("tudo o que normalizePhone devolve cabe no check de profiles.phone", () => {
    const codigos = [...COUNTRIES.slice(0, -1).map((c) => c.code), "+44", "+244", "+7", "+972"];
    const numeros = ["12345", "123456", "1234567", "41999998888", "4133334444", "0412345678", "123456789012", "1234567890123", "12345678901234"];
    let aceitos = 0;
    for (const code of codigos) {
      for (const number of numeros) {
        const e164 = normalizePhone(code, number);
        if (e164 === null) continue;
        aceitos++;
        expect(e164).toMatch(BANCO);
        expect(phoneError(code, number)).toBeNull();
      }
    }
    expect(aceitos).toBeGreaterThan(30);
  });

  it("quando normalizePhone recusa, phoneError explica", () => {
    for (const code of ["+55", "+351", "+1", "outro"]) {
      for (const number of ["", "1", "12345", "abcdef", "+99 123456", "123456789012345678"]) {
        if (normalizePhone(code, number) === null) expect(phoneError(code, number)).toEqual(expect.any(String));
      }
    }
  });
});

describe("WhatsApp — separar o número guardado", () => {
  it("sem número guardado (ou texto que não é número) começa no Brasil, vazio", () => {
    for (const guardado of [null, "", "abc", "5541999998888", "+0123456789", "+55", "+1234567"]) {
      expect(splitPhone(guardado as string | null)).toEqual({ code: "+55", number: "" });
    }
  });

  it("os países da lista voltam com o código da lista", () => {
    for (const c of COUNTRIES.slice(0, -1)) {
      expect(splitPhone(`${c.code}123456789`)).toEqual({ code: c.code, number: "123456789" });
    }
    expect(splitPhone("+5491123456789")).toEqual({ code: "+54", number: "91123456789" });
    expect(splitPhone("+13105551234")).toEqual({ code: "+1", number: "3105551234" });
  });

  it.each([
    ["+447911123456", "+44", "7911123456"], // Reino Unido
    ["+4915112345678", "+49", "15112345678"], // Alemanha
    ["+393123456789", "+39", "3123456789"], // Itália
    ["+33612345678", "+33", "612345678"], // França
    ["+81312345678", "+81", "312345678"], // Japão
    ["+8613812345678", "+86", "13812345678"], // China
    ["+919876543210", "+91", "9876543210"], // Índia
    ["+79161234567", "+7", "9161234567"], // Rússia e Cazaquistão
    ["+521234567890", "+52", "1234567890"], // México
    ["+27821234567", "+27", "821234567"], // África do Sul
    ["+20101234567", "+20", "101234567"], // Egito
    ["+244923456789", "+244", "923456789"], // Angola
    ["+258841234567", "+258", "841234567"], // Moçambique
    ["+238991234567", "+238", "991234567"], // Cabo Verde
    ["+245955123456", "+245", "955123456"], // Guiné-Bissau
    ["+353871234567", "+353", "871234567"], // Irlanda
    ["+380441234567", "+380", "441234567"], // Ucrânia
    ["+420601234567", "+420", "601234567"], // Tchéquia
    ["+50212345678", "+502", "12345678"], // Guatemala
    ["+59971234567", "+599", "71234567"], // Curaçao
    ["+6591234567", "+65", "91234567"], // Singapura
    ["+85291234567", "+852", "91234567"], // Hong Kong
    ["+886912345678", "+886", "912345678"], // Taiwan
    ["+905551234567", "+90", "5551234567"], // Turquia
    ["+966512345678", "+966", "512345678"], // Arábia Saudita
    ["+972501234567", "+972", "501234567"], // Israel
    ["+971501234567", "+971", "501234567"], // Emirados Árabes
  ])("país fora da lista: %s vira Outro com o código certo", (guardado, code, number) => {
    expect(splitPhone(guardado)).toEqual({ code, number });
    // e voltar para o formato internacional dá o mesmo número
    expect(normalizePhone(code, number)).toBe(guardado);
  });

  it("separar e juntar de novo devolve o número guardado", () => {
    for (const guardado of ["+5541999998888", "+554133334444", "+351912345678", "+12025550123", "+59171234567", "+34612345678"]) {
      const { code, number } = splitPhone(guardado);
      expect(normalizePhone(code, number)).toBe(guardado);
    }
  });
});
