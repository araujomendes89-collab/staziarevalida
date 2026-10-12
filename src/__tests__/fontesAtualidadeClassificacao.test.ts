// @vitest-environment node
/**
 * Fontes oficiais, atualidade: a decisão do servidor (funções puras, sem banco, sem rede). Uma data só conta quando o documento
 * ou a página a mostra; nada de "mais atual" sem prova.
 */
import { describe, expect, it } from "vitest";
import { classifyCurrency, compareDates, dateInText, parseDate, proveDates, showDate } from "../../server/contentHub/sources/currency";

const pages = (...texts: string[]) => texts.map((text, i) => ({ page: i + 1, text }));
const lib = (published_on: string | null, over: Record<string, unknown> = {}) => ({ id: "L1", title: "PCDT Teste", version: "2019", published_on, ...over });

describe("datas", () => {
  it("só aceita data inteira válida ou ano; mostra sem inventar o dia", () => {
    expect(parseDate("2024-05-10")).toMatchObject({ year: 2024, month: 5, day: 10 });
    expect(parseDate("2024")).toMatchObject({ year: 2024 });
    expect(parseDate("2024-02-30")).toBeNull();
    expect(parseDate("10/05/2024")).toBeNull();
    expect(parseDate("1800")).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(showDate("2024-05-10")).toBe("10/05/2024");
    expect(showDate("2024")).toBe("ano de 2024");
    expect(showDate(null)).toBe("sem data");
  });

  it("compara dia com dia, ano com ano e não adivinha dia contra ano no mesmo ano", () => {
    const d = (s: string) => parseDate(s)!;
    expect(compareDates(d("2024-05-10"), d("2023-12-31"))).toBe("newer");
    expect(compareDates(d("2024-05-10"), d("2024-05-10"))).toBe("same");
    expect(compareDates(d("2024-05-09"), d("2024-05-10"))).toBe("older");
    expect(compareDates(d("2024"), d("2023"))).toBe("newer");
    expect(compareDates(d("2024"), d("2024"))).toBe("same");
    expect(compareDates(d("2024-05-10"), d("2024"))).toBe("unknown");
    expect(compareDates(d("2025-01-01"), d("2024"))).toBe("newer");
  });
});

describe("a data aparece no documento?", () => {
  const day = parseDate("2024-05-10")!;
  it("reconhece o dia em várias formas, com o contexto de publicação", () => {
    for (const text of ["Publicado em 10/05/2024.", "Brasília, 10 de maio de 2024", "Atualizado em 10 DE MAIO DE 2024", "Portaria publicada em 10.05.2024", "Data de publicação: 2024-05-10", "Published May 10, 2024", "Last updated 10 May 2024", "Atualização de 10 mai. 2024", "Edição: 1º de maio de 2024 e 10/5/2024"]) {
      expect(dateInText(day, pages(text)), text).toBe(true);
    }
  });
  it("não aceita outro dia, outro mês ou número solto", () => {
    for (const text of ["Publicado em 11/05/2024", "Publicado em 10/06/2024", "Publicado em 10 de junho de 2024", "Publicado em 110/05/2024", "Publicado em 10/05/20245", "versão 10 05 2024 sem separador", "Publicado em maio de 2024"]) {
      expect(dateInText(day, pages(text)), text).toBe(false);
    }
  });
  it("a data solta, sem o contexto do significado, não prova nada (revisão independente 1, achado 5)", () => {
    for (const text of ["Em 10/05/2024 houve uma reunião.", "Referência: Fulano, 10 de maio de 2024.", "Acessado em 10/05/2024.", "Prazo de entrega: 10/05/2024"]) {
      expect(dateInText(day, pages(text)), text).toBe(false);
    }
    // o contexto precisa estar logo antes da data
    expect(dateInText(day, pages("Publicado há muito tempo. " + "x".repeat(80) + " 10/05/2024"))).toBe(false);
  });
  it("vigência: só com palavra de validade; a data de publicação não comprova o fim da vigência", () => {
    expect(dateInText(day, pages("Publicado em 10/05/2024."), "vigencia")).toBe(false);
    expect(dateInText(day, pages("Vigente até 10/05/2024."), "vigencia")).toBe(true);
    expect(dateInText(day, pages("Válido até 10 de maio de 2024"), "vigencia")).toBe(true);
    expect(dateInText(day, pages("Validade: 10/05/2024"), "vigencia")).toBe(true);
    expect(dateInText(day, pages("Valid until May 10, 2024"), "vigencia")).toBe(true);
    // e o contrário: a data de validade não é data de publicação
    expect(dateInText(day, pages("Vigente até 10/05/2024."), "publicacao")).toBe(false);
  });
  it("ano isolado não comprova: só com contexto, nas 3 primeiras páginas", () => {
    const y = parseDate("2024")!;
    expect(dateInText(y, pages("Capa", "Edição 2024"))).toBe(true);
    expect(dateInText(y, pages("Brasília - DF - 2024"))).toBe(true);
    expect(dateInText(y, pages("Capa 2024"))).toBe(false);
    expect(dateInText(y, pages("Lei 2024 trata de outra coisa"))).toBe(false);
    expect(dateInText(y, pages("a", "b", "c", "Edição 2024"))).toBe(false);
    expect(dateInText(y, pages("Edição código 20245"))).toBe(false);
  });
});

describe("prova das datas", () => {
  it("a data da IA que está no texto é comprovada pelo texto", () => {
    const r = proveDates({ aiPublished: "2024-05-10", aiValidUntil: "2026-05-10", fileDate: null, fileKind: "pdf", pages: pages("Publicado em 10/05/2024, vigente até 10/05/2026.") });
    expect(r).toMatchObject({ date: "2024-05-10", basis: "texto", validUntil: "2026-05-10", validUntilProven: true });
    expect(r.notes).toEqual([]);
  });
  it("vigência igual à data de publicação, sem palavra de validade: não comprovada", () => {
    const r = proveDates({ aiPublished: "2024-05-10", aiValidUntil: "2024-05-10", fileDate: null, fileKind: "pdf", pages: pages("Publicado em 10/05/2024.") });
    expect(r).toMatchObject({ date: "2024-05-10", validUntil: "2024-05-10", validUntilProven: false });
    expect(r.notes.join(" ")).toMatch(/vigência dita pela IA \(10\/05\/2024\) não aparece no documento como fim da vigência/);
  });
  it("data da IA que não está no texto não vale; metadado de PDF não prova; vira data não comprovada com aviso", () => {
    const r = proveDates({ aiPublished: "2025-03-14", aiValidUntil: "2027-01-01", fileDate: "2019-07-01", fileKind: "pdf", pages: pages("Texto sem data nenhuma.") });
    expect(r.date).toBeNull();
    expect(r.basis).toBeNull();
    expect(r.validUntil).toBe("2027-01-01");
    expect(r.validUntilProven).toBe(false);
    expect(r.notes.join(" ")).toMatch(/dita pela IA \(14\/03\/2025\) não aparece no documento como data de publicação/);
    expect(r.notes.join(" ")).toMatch(/data interna \(01\/07\/2019\), que não prova/);
    expect(r.notes.join(" ")).toMatch(/vigência dita pela IA \(01\/01\/2027\) não aparece/);
  });
  it("a página web que declara a data (meta) comprova", () => {
    const r = proveDates({ aiPublished: null, aiValidUntil: null, fileDate: "2024-02-01", fileKind: "html", pages: pages("Página.") });
    expect(r).toMatchObject({ date: "2024-02-01", basis: "pagina" });
  });
  it("sem data em lugar nenhum: nada inventado", () => {
    const r = proveDates({ aiPublished: null, aiValidUntil: "vigente", fileDate: null, fileKind: "pdf", pages: pages("Texto.") });
    expect(r).toMatchObject({ date: null, basis: null, validUntil: null, validUntilProven: false });
    expect(r.notes.join(" ")).toMatch(/Nem a IA nem o documento trazem a data/);
  });
});

describe("estado de atualidade", () => {
  it("versão mais nova que a da biblioteca", () => {
    const r = classifyCurrency({ date: "2024-05-10", library: lib("2019-03-01"), siblings: [] });
    expect(r.state).toBe("versao_mais_nova");
    expect(r.note).toMatch(/Mais nova que a fonte vigente "PCDT Teste" \(versão 2019\).*10\/05\/2024.*01\/03\/2019/);
    expect(r.library?.id).toBe("L1");
  });
  it("mesma versão da biblioteca", () => {
    expect(classifyCurrency({ date: "2019-03-01", library: lib("2019-03-01"), siblings: [] }).state).toBe("mesma_versao");
  });
  it("versão mais antiga que a da biblioteca: avisa", () => {
    const r = classifyCurrency({ date: "2015-01-01", library: lib("2019-03-01"), siblings: [] });
    expect(r.state).toBe("versao_mais_antiga");
    expect(r.note).toMatch(/Mais antiga que a fonte vigente/);
  });
  it("outra mais nova do mesmo documento (com ou sem biblioteca)", () => {
    const withSibling = classifyCurrency({ date: "2020-01-01", library: null, siblings: [{ id: "x", date: "2024-01-01" }, { id: "y", date: "2022-01-01" }, { id: "z", date: null }] });
    expect(withSibling.state).toBe("outra_mais_nova");
    expect(withSibling.newer).toEqual({ id: "x", date: "2024-01-01" });
    const overLibrary = classifyCurrency({ date: "2024-05-10", library: lib("2019-03-01"), siblings: [{ id: "x", date: "2025-02-02" }] });
    expect(overLibrary.state).toBe("outra_mais_nova");
  });
  it("irmão da mesma data ou mais antigo não muda nada", () => {
    expect(classifyCurrency({ date: "2024-05-10", library: null, siblings: [{ id: "x", date: "2024-05-10" }, { id: "y", date: "2020-01-01" }] }).state).toBe("sem_comparacao");
  });
  it("sem data comprovada: nunca é 'mais nova'", () => {
    const r = classifyCurrency({ date: null, library: lib("2019-03-01"), siblings: [{ id: "x", date: "2025-01-01" }] });
    expect(r.state).toBe("data_nao_comprovada");
  });
  it("biblioteca sem data ou só o ano contra dia: não adivinha", () => {
    expect(classifyCurrency({ date: "2024-05-10", library: lib(null), siblings: [] }).state).toBe("data_nao_comprovada");
    const r = classifyCurrency({ date: "2024-05-10", library: lib("2024"), siblings: [] });
    expect(r.state).toBe("data_nao_comprovada");
    expect(r.note).toMatch(/só tem o ano/);
  });
  it("irmão comprovadamente mais novo vale antes de 'mesma versão', 'biblioteca sem data' e 'só o ano' (revisão independente 1, achado 4)", () => {
    const sib = [{ id: "x", date: "2025-02-02" }];
    expect(classifyCurrency({ date: "2024-01-01", library: lib("2024-01-01"), siblings: sib }).state).toBe("outra_mais_nova");
    expect(classifyCurrency({ date: "2024-01-01", library: lib(null), siblings: sib }).state).toBe("outra_mais_nova");
    expect(classifyCurrency({ date: "2024-01-01", library: lib("2024"), siblings: sib }).state).toBe("outra_mais_nova");
    // mais antiga que a biblioteca continua sendo o estado mais grave
    expect(classifyCurrency({ date: "2015-01-01", library: lib("2019-03-01"), siblings: sib }).state).toBe("versao_mais_antiga");
    // irmão que não é mais novo não muda nada
    expect(classifyCurrency({ date: "2024-01-01", library: lib("2024-01-01"), siblings: [{ id: "y", date: "2023-01-01" }] }).state).toBe("mesma_versao");
  });
  it("documento novo para a biblioteca, com data comprovada", () => {
    const r = classifyCurrency({ date: "2024-05-10", library: null, siblings: [] });
    expect(r.state).toBe("sem_comparacao");
  });
});
