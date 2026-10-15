/**
 * Padrão visual único da aula do Grande Tema (docs/aula-layout.md): cada tipo de bloco, índice, progresso, cores do tema
 * e nada de código interno na tela. jsdom com banco simulado (forma de app_tema_aula, migração 9992, + "estilos" opcional por seção).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" }, user: { id: "u" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: ({ label }: any) => <button type="button">{label}</button> }));
import { ThemesScreen } from "../novo/app/study/ThemesScreen.jsx";
import { TEMA_CORES } from "../novo/app/study/temaCores.js";
import { blocoDe, boxOf, celula, dividirFrases, minutosDeLeitura, mudanca, progressoDaAula, secaoTipo, sobretitulo } from "../novo/app/study/aulaPadrao.js";

const TEMAS = {
  method: "Seleção.", official_total: 5, annulled: 0, linked: 5, unlinked: 0,
  areas: [{ id: "ped", name: "Pediatria", themes: 1, questions: 5 }],
  themes: [{ id: "GR-069", order: 69, title: "Bronquiolite viral aguda", area: "ped", area_name: "Pediatria", subarea: "Pneumologia", status: "aula_pronta", total: 5, by_exam: { a: 5 } }],
};
const LID = "22222222-2222-4222-8222-222222222222";
const AULA = {
  lesson_id: LID, titulo: "Bronquiolite viral aguda: do primeiro chiado à conduta de suporte", atualizado_em: "2026-10-14T12:00:00Z",
  cabecalho: "Resumo curto da aula.",
  pontos_chave: ["Diagnóstico clínico.", "Suporte é a conduta."],
  secoes: [
    { titulo: "Caso clínico de abertura", paragrafos: ["Helena, 4 meses, chiado há um dia."], estilos: ["caso"] },
    {
      titulo: "Bloco 1 · Quadro típico em lactentes",
      paragrafos: ["Texto comum do bloco.", "Primeiro chiado após quadro gripal é bronquiolite.", "Sigilo tem limite em risco de vida.", "Tome nota: o VSR é o agente mais comum."],
      estilos: ["normal", "alerta:Pegadinha de prova!", "alerta:Atenção: sigilo", "normal"],
    },
    { titulo: "O que mudou desde a prova", paragrafos: ["Vacina contra o VSR na gestante: incorporada ao SUS em 2025.", "Local da punção: Antes: segundo espaço. Agora: quinto espaço.", "A referência federal mais recente é de março de 2022: rastreio com PHQ-9."], estilos: ["mudou", "mudou", "mudou"] },
    { titulo: "Erros frequentes na prova", paragrafos: ["Tratar como asma. Pedir radiografia de rotina. Dar antibiótico sem infecção."], estilos: ["lista_erros"] },
    { titulo: "Voltando ao caso", paragrafos: ["Helena tem bronquiolite leve."], estilos: ["normal"] },
  ],
  tabelas: [{ titulo: "Gravidade e conduta", posicao: 2, headers: ["Gravidade", "Conduta"], rows: [["Leve", "Casa"], ["!alerta Grave", "Internar"]] }],
  midias: [], revisao_aula: null,
  flashcards: { cartoes: [{ n: 1, frente: "Qual idade?", verso: "Menor de 2 anos.", imagem: false }, { n: 2, frente: "Agente?", verso: "VSR.", imagem: false }, { n: 3, frente: "Exame?", verso: "Nenhum de rotina.", imagem: false }] },
  questoes: { itens: [{ numero: "1", enunciado: "Qual a conduta?", alternativas: [{ id: "A", text: "Corticoide." }, { id: "B", text: "Suporte." }], correta: "B", comentarios: [{ id: "A", text: "Não é de rotina." }, { id: "B", text: "Correta." }] }] },
};

let aula: any; let notas: any;
beforeEach(() => {
  aula = AULA;
  notas = { notas: { "sec-2": "minha nota" }, checks: { "sec-1": true } };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_grandes_temas") return TEMAS;
    if (fn === "app_temas_com_aula") return ["GR-069"];
    if (fn === "app_tema_aula") return aula;
    if (fn === "app_lesson_notes") return notas;
    if (fn === "app_lesson_section_note_save" || fn === "app_lesson_checks_save") return { ok: true };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  window.scrollTo = vi.fn() as any;
  (Element.prototype as any).scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const abrir = async () => {
  render(<ThemesScreen go={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Abrir a aula/ }));
  await screen.findByRole("heading", { level: 1 });
  await waitFor(() => expect((screen.getByRole("textbox", { name: /seção 1/ }) as HTMLTextAreaElement).disabled).toBe(false));
};
const secao = (nome: string) => screen.getByRole("region", { name: nome });

describe("regras do padrão (sem mudar uma palavra do texto)", () => {
  it("estilo do pacote decide a caixa; sem estilo, vale o começo do texto", () => {
    expect(blocoDe("Primeiro chiado…", "alerta:Pegadinha de prova!")).toMatchObject({ kind: "peg", title: "Pegadinha de prova!", body: "Primeiro chiado…" });
    expect(blocoDe("Sigilo tem limite.", "alerta:Atenção: sigilo")).toMatchObject({ kind: "atencao", title: "Atenção: sigilo" });
    expect(blocoDe("Texto.", "tome_nota")).toMatchObject({ kind: "nota", title: "Tome nota" });
    expect(blocoDe("Texto comum.", "figura_depois")).toMatchObject({ kind: "p" });
    expect(blocoDe("Armadilha: X.", undefined)).toMatchObject({ kind: "peg", body: "X." });
    expect(boxOf("Tome nota: o VSR.")).toMatchObject({ kind: "nota", body: "o VSR." });
  });
  it("tipo e sobretítulo da seção pelo título", () => {
    expect(secaoTipo("Caso clínico de abertura")).toBe("caso");
    expect(secaoTipo("Voltando ao caso")).toBe("volta");
    expect(secaoTipo("Erros frequentes na prova")).toBe("erros");
    expect(secaoTipo("O que mudou desde a prova")).toBe("mudou");
    expect(secaoTipo("Lista nacional em vigor", ["mudou", "mudou"])).toBe("mudou");
    expect(secaoTipo("Bloco 2 · Suporte")).toBe("bloco");
    expect(sobretitulo("Bloco 2 · Suporte", "bloco")).toBe("Bloco 2");
    expect(sobretitulo("O que mudou desde a prova", "mudou")).toBe("Atualização");
  });
  it("lista de erros vira as frases que já existem; tabela marca a linha de alerta", () => {
    expect(dividirFrases("Tratar como asma. Pedir radiografia. Dar antibiótico.")).toEqual(["Tratar como asma.", "Pedir radiografia.", "Dar antibiótico."]);
    expect(celula("!alerta Grave: abaixo de 90%")).toEqual({ alerta: true, texto: "Grave: abaixo de 90%" });
    expect(celula("Leve")).toEqual({ alerta: false, texto: "Leve" });
  });
  it("'O que mudou': rótulo curto vira título; frase longa não; antes × agora só com as palavras no texto", () => {
    expect(mudanca("Vacina contra o VSR na gestante: incorporada em 2025.")).toMatchObject({ titulo: "Vacina contra o VSR na gestante", corpo: "incorporada em 2025.", antes: null });
    expect(mudanca("A referência federal mais recente é de março de 2022: rastreio.")).toMatchObject({ titulo: null });
    expect(mudanca("Punção: Antes: segundo espaço. Agora: quinto espaço.")).toMatchObject({ antes: "segundo espaço.", agora: "quinto espaço." });
  });
  it("tempo de leitura e progresso", () => {
    const palavras = Array.from({ length: 1000 }, () => "x").join(" ");
    expect(minutosDeLeitura({ secoes: [{ titulo: "", paragrafos: [palavras] }] })).toBe(5);
    expect(minutosDeLeitura({ secoes: [] })).toBe(1);
    expect(progressoDaAula(5, { "sec-1": true, "sec-3": true, "erro-1": true, "sec-9": true }, { "sec-1": "a", "sec-2": "  ", geral: "b" })).toEqual({ feitas: 2, total: 5, anotacoes: 2, pct: 40 });
  });
});

describe("cada tipo de bloco aparece no padrão", () => {
  it("caso clínico, caixas, tabela, o que mudou, erros, voltando ao caso, fixação e flashcards", async () => {
    await abrir();
    expect(within(secao("Caso clínico de abertura")).getByText(/Helena, 4 meses/).closest(".al-caso")).toBeTruthy();
    const b1 = secao("Quadro típico em lactentes");
    expect(within(b1).getByText("Pegadinha de prova!").closest("[role=note]")!.className).toMatch(/al-peg/);
    expect(within(b1).getByText("Atenção: sigilo").closest("[role=note]")!.className).toMatch(/al-atencao/);
    expect(within(b1).getByText("Tome nota").closest("[role=note]")!.className).toMatch(/al-nota/);
    expect(within(b1).getByText("Texto comum do bloco.").tagName).toBe("P");
    const tabela = within(b1).getByRole("table");
    expect(within(tabela).getByText("Gravidade e conduta")).toBeTruthy();
    expect(within(tabela).getByText("Grave").closest("tr")!.className).toMatch(/al-tr-alerta/);
    expect(within(tabela).getByText("Internar").getAttribute("data-label")).toBe("Conduta");
    expect(tabela.textContent).not.toMatch(/!alerta/);
    const mud = secao("O que mudou desde a prova");
    expect(within(mud).getByRole("heading", { name: "Vacina contra o VSR na gestante" })).toBeTruthy();
    expect(within(mud).getByText("Antes")).toBeTruthy();
    expect(within(mud).getByText("Agora")).toBeTruthy();
    expect(within(mud).getByText("quinto espaço.")).toBeTruthy();
    expect(within(mud).getByText(/A referência federal mais recente é de março de 2022: rastreio/)).toBeTruthy();
    const erros = secao("Erros frequentes na prova");
    expect(within(erros).getAllByRole("checkbox", { name: /Tratar como asma|Pedir radiografia|Dar antibiótico/ })).toHaveLength(3);
    expect(within(secao("Voltando ao caso")).getByText(/bronquiolite leve/).closest(".al-volta")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Questões de fixação" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Em resumo" })).toBeTruthy();
    expect(screen.getByText("Diagnóstico clínico.")).toBeTruthy();
  });

  it("sem 'estilos' (dados de hoje), o parágrafo sem rótulo fica como texto comum e nada quebra", async () => {
    aula = { ...AULA, secoes: AULA.secoes.map(({ estilos, ...s }: any) => s) };
    await abrir();
    const b1 = secao("Quadro típico em lactentes");
    expect(within(b1).queryByText("Pegadinha de prova!")).toBeNull();
    expect(within(b1).getByText("Primeiro chiado após quadro gripal é bronquiolite.").tagName).toBe("P");
    expect(within(b1).getByText("Tome nota")).toBeTruthy(); // pelo começo do texto
  });

  it("flashcards: um cartão por vez, virar, próximo, anterior, escolher e setas do teclado", async () => {
    await abrir();
    const fc = screen.getByRole("group", { name: "Flashcards da aula" });
    expect(within(fc).getByText("Cartão 1 de 3")).toBeTruthy();
    fireEvent.click(within(fc).getByRole("button", { name: /Virar flashcard 1 de 3/ }));
    expect(within(fc).getByRole("button", { name: /Virar flashcard 1 de 3/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(fc).getByText("1 de 3 virados")).toBeTruthy();
    fireEvent.click(within(fc).getByRole("button", { name: "Próximo cartão" }));
    expect(within(fc).getByText("Cartão 2 de 3")).toBeTruthy();
    expect(within(fc).getByRole("button", { name: /Virar flashcard 2 de 3/ }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.keyDown(fc, { key: "ArrowRight" });
    expect(within(fc).getByText("Cartão 3 de 3")).toBeTruthy();
    fireEvent.keyDown(fc, { key: "ArrowLeft" });
    fireEvent.click(within(fc).getByRole("button", { name: "Cartão anterior" }));
    expect(within(fc).getByText("Cartão 1 de 3")).toBeTruthy();
    fireEvent.click(within(fc).getByRole("button", { name: "Ir para o cartão 3" }));
    expect(within(fc).getByRole("button", { name: "Ir para o cartão 3" }).getAttribute("aria-current")).toBe("true");
  });
});

describe("índice, progresso e cores", () => {
  it("índice lista as partes na ordem e leva até cada uma; botão Índice abre e Esc fecha", async () => {
    await abrir();
    const nav = screen.getByRole("navigation", { name: "Sumário da aula" });
    const itens = within(nav).getAllByRole("button").map((b) => b.textContent);
    expect(itens[0]).toMatch(/Em resumo/);
    expect(itens.slice(1, 6).map((t) => t!.replace(/ \(.*\)/, ""))).toEqual(["1. Caso clínico de abertura", "2. Quadro típico em lactentes", "3. O que mudou desde a prova", "4. Erros frequentes na prova", "5. Voltando ao caso"]);
    expect(itens.slice(6).join("|")).toMatch(/Questões de fixação\|Flashcards ilustrados/);
    expect(within(nav).getByRole("button", { name: /1\. Caso clínico de abertura\s*\(estudada\)/ })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: /2\. Quadro típico em lactentes.*com anotação/ })).toBeTruthy();
    const alvo = document.getElementById("al-s4")!;
    fireEvent.click(within(nav).getByRole("button", { name: /4\. Erros frequentes/ }));
    expect((Element.prototype.scrollIntoView as any).mock.contexts).toContain(alvo);
    const abre = screen.getByRole("button", { name: "Índice" });
    expect(abre.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(abre);
    expect(abre.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("al-toc-panel")!.className).toMatch(/is-open/);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(abre.getAttribute("aria-expanded")).toBe("false");
  });

  it("'Próxima' no fim de cada seção leva à parte seguinte", async () => {
    await abrir();
    fireEvent.click(within(secao("Caso clínico de abertura")).getByRole("button", { name: "Ir para a próxima parte: Quadro típico em lactentes" }));
    expect((Element.prototype.scrollIntoView as any).mock.contexts.at(-1)).toBe(document.getElementById("al-s2"));
  });

  it("cabeçalho: tempo de leitura e progresso (seções estudadas e anotações) que acompanham o aluno", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await abrir();
    expect(screen.getByText(/≈ 1 min de leitura/)).toBeTruthy();
    const barras = screen.getAllByRole("progressbar", { name: "Seções estudadas" });
    expect(barras.every((b) => b.getAttribute("aria-valuenow") === "1" && b.getAttribute("aria-valuemax") === "5")).toBe(true);
    expect(screen.getAllByText(/1 anotação$/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByLabelText("Marcar esta seção como estudada")[2]);
    expect(screen.getAllByRole("progressbar", { name: "Seções estudadas" })[0].getAttribute("aria-valuenow")).toBe("2");
    expect(within(secao("O que mudou desde a prova")).getByText("Estudada")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: /seção 3/ }), { target: { value: "nova" } });
    expect(screen.getAllByText(/2 anotações$/).length).toBeGreaterThan(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_lesson_checks_save").at(-1)[1]).toEqual({ p_lesson_id: LID, p_checks: { "sec-1": true, "sec-3": true } });
  });

  it("cores do tema só como variáveis (selo do tema na cor do tema); nenhum código de cor nem código GR na tela", async () => {
    await abrir();
    const raiz = document.querySelector(".al") as HTMLElement;
    const [p, e, c, b] = TEMA_CORES["GR-069"];
    expect(raiz.style.getPropertyValue("--gt-p")).toBe(p);
    expect(raiz.style.getPropertyValue("--gt-e")).toBe(e);
    expect(raiz.style.getPropertyValue("--gt-c")).toBe(c);
    expect(raiz.style.getPropertyValue("--gt-b")).toBe(b);
    expect(screen.getByText("Pediatria · Pneumologia").className).toMatch(/al-selo/);
    const t = document.body.textContent!;
    expect(t).not.toMatch(/GR-\d{3}/);
    expect(t).not.toMatch(/#[0-9A-F]{6}\b/i);
    expect(t).not.toMatch(/\bPDF\b|baixar|download|p\.\s?\d+|página \d+/i);
    expect(document.querySelectorAll("a[href]").length).toBe(0);
  });
});
