/**
 * Proposta B da tela de questão (escolhida pelo dono em 19/10/2026): sem a caixa "PERGUNTA"; o enunciado é contínuo e a pergunta
 * aparece em NEGRITO no fim do próprio texto, como na prova impressa do Inep. Figuras e tabelas entram na posição da prova quando a
 * figura tem `apos` (trecho do enunciado); sem `apos`, no lugar de sempre. Vale para treino, simulado, nivelamento e revisão.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { Alternatives, QuestionSheet, QuestionStatement, ReportQuestion } from "../novo/app/practice/tela/QuestionSheet.jsx";

afterEach(cleanup);

const CASO = "Criança de 3 anos com febre há dois dias.";
const PERGUNTA = "Qual a conduta mais adequada?";
const Q = { id: "q9", statement: `${CASO} ${PERGUNTA}`, options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Texto da ${id}.` })), images: [], support: null };

const Q73 =
  "Na maternidade, um recém-nascido (RN) de 30 horas de vida, evolui com icterícia zona 3 de Kramer. A tipagem sanguínea da mãe é O- e do RN é B+. Os exames laboratoriais, realizados quando a criança estava com 32 horas de vida, revelam: Considerando-se o caso e a tabela de referência apresentados, a conduta médica adequada é";
const PERGUNTA_Q73 = "Considerando-se o caso e a tabela de referência apresentados, a conduta médica adequada é";

/** Ordem dos nós relevantes dentro do cartão: "texto:<início>", "figura:<alt>", "pergunta:<texto>". */
function ordem(container: HTMLElement) {
  const nos = container.querySelectorAll(".tq-stem, img, strong.tq-pergunta");
  return Array.from(nos).map((n) => {
    if (n.tagName === "IMG") return `figura:${n.getAttribute("alt")}`;
    if (n.classList.contains("tq-pergunta")) return `pergunta:${n.textContent}`;
    return `texto:${Array.from(n.childNodes).filter((c) => c.nodeType === 3).map((c) => c.textContent).join("").trim().slice(0, 20)}`;
  });
}

describe("Proposta B: sem caixa PERGUNTA, pergunta em negrito no fim do texto", () => {
  it("sem figura: a pergunta é <strong> no mesmo parágrafo do caso; nada de caixa nem rótulo 'Pergunta'", () => {
    const { container } = render(<QuestionStatement question={Q} />);
    expect(container.querySelector(".tq-ask")).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
    expect(screen.queryByText("Pergunta")).toBeNull();
    expect(screen.getByText("Caso clínico")).toBeTruthy();
    const stems = container.querySelectorAll("p.tq-stem");
    expect(stems).toHaveLength(1);
    expect(stems[0].textContent).toBe(`${CASO} ${PERGUNTA}`);
    const forte = stems[0].querySelector("strong.tq-pergunta")!;
    expect(forte.textContent).toBe(PERGUNTA);
    // o parágrafo continua justificado e hifenizado em português
    expect((stems[0] as HTMLElement).style.textAlign).toBe("justify");
    expect(stems[0].getAttribute("lang")).toBe("pt-BR");
  });

  it("acessibilidade: a pergunta continua sendo o título da questão (nível 1 na tela; nível 2 no cartão compacto)", () => {
    render(<QuestionStatement question={Q} />);
    const titulo = screen.getByRole("heading", { name: PERGUNTA });
    expect(titulo.getAttribute("aria-level")).toBe("1");
    cleanup();
    render(<QuestionSheet question={Q} compact revealed alternatives={null} />);
    expect(screen.getByRole("heading", { name: PERGUNTA }).getAttribute("aria-level")).toBe("2");
  });

  it("Q73 com os dados de hoje: caso até 'revelam:' -> figura -> pergunta em negrito num parágrafo próprio", () => {
    const q = { ...Q, statement: Q73, images: [{ url: "/t.png", alt: "Três tabelas" }] };
    const { container } = render(<QuestionStatement question={q} />);
    expect(ordem(container)).toEqual(["texto:Na maternidade, um r", "figura:Três tabelas", "texto:", `pergunta:${PERGUNTA_Q73}`]);
    const stems = container.querySelectorAll("p.tq-stem");
    expect(stems[0].textContent!.endsWith("revelam:")).toBe(true);
    expect(stems[1].classList.contains("tq-stem--fim")).toBe(true);
    expect(stems[1].textContent).toBe(PERGUNTA_Q73);
    // as figuras continuam dentro do caso
    expect(container.querySelector(".tq-case")!.contains(screen.getByAltText("Três tabelas"))).toBe(true);
  });

  it("figuras com posição (apos): cada uma entra depois do seu trecho, com o índice original preservado", () => {
    const statement = "Exames: Ao exame, abdome doloroso. Evolução: Qual a conduta mais adequada?";
    const images = [
      { url: "/b.png", alt: "Figura B", apos: "Evolução:" },
      { url: "/a.png", alt: "Figura A", apos: "Exames:" },
    ];
    const { container } = render(<QuestionStatement question={{ ...Q, statement, images }} />);
    expect(ordem(container)).toEqual(["texto:Exames:", "figura:Figura A", "texto:Ao exame, abdome dol", "figura:Figura B", "texto:", "pergunta:Qual a conduta mais adequada?"]);
    // a legenda "Figura N" segue a numeração original (a do array), mesmo fora de ordem
    expect(screen.getByAltText("Figura A").closest("figure")!.textContent).toContain("Figura 2");
    expect(screen.getByAltText("Figura B").closest("figure")!.textContent).toContain("Figura 1");
  });

  it("figura do tipo tabela usa a largura toda, sem o teto de altura", () => {
    const q = { ...Q, images: [{ url: "/t.png", alt: "Tabela de exames", tipo: "tabela" }] };
    render(<QuestionStatement question={q} />);
    const img = screen.getByAltText("Tabela de exames") as HTMLImageElement;
    expect(img.style.maxHeight).toBe("none");
  });

  it("um só diálogo de ampliar para o cartão: abre e fecha", () => {
    const statement = "Exames: Ao exame, abdome doloroso. Qual a conduta mais adequada?";
    const images = [{ url: "/a.png", alt: "Figura A", apos: "Exames:" }, { url: "/b.png", alt: "Figura B" }];
    render(<QuestionStatement question={{ ...Q, statement, images }} />);
    fireEvent.click(screen.getByRole("button", { name: "Ampliar: Figura B" }));
    const dialog = screen.getByRole("dialog", { name: "Figura B" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("'Ver caso completo' (caso encolhido depois de responder): a pergunta fica fora do parágrafo encolhido", () => {
    const { container } = render(<QuestionStatement question={Q} revealed />);
    const encolhido = container.querySelector('p.tq-stem[data-clamp="true"]')!;
    expect(encolhido.querySelector("strong")).toBeNull();
    const fim = container.querySelector("p.tq-stem--fim")!;
    expect(fim.getAttribute("data-clamp")).not.toBe("true");
    expect(fim.textContent).toBe(PERGUNTA);
    fireEvent.click(screen.getByRole("button", { name: "Ver caso completo" }));
    // aberto: volta a ser um parágrafo só, com a pergunta no fim
    expect(container.querySelectorAll("p.tq-stem")).toHaveLength(1);
    expect(container.querySelector("p.tq-stem strong.tq-pergunta")!.textContent).toBe(PERGUNTA);
  });

  it("a dica do Tutor fica sempre fora do enunciado, depois dele", () => {
    const { container } = render(<QuestionStatement question={Q} hint={<span>DICA</span>} />);
    const solo = container.querySelector(".tq-hint-solo")!;
    expect(solo.textContent).toBe("DICA");
    expect(container.querySelector(".tq-case")!.contains(solo)).toBe(false);
  });

  it("tabela de apoio (Questões Inéditas) antes da pergunta", () => {
    const q = { ...Q, support: { title: "Exames", rows: [{ label: "Hemoglobina", value: "9 g/dL" }] } };
    const { container } = render(<QuestionStatement question={q} />);
    const tabela = screen.getByRole("table", { name: "Exames" });
    const pergunta = container.querySelector("strong.tq-pergunta")!;
    expect(tabela.compareDocumentPosition(pergunta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("Proposta B: alternativas, riscar e 'Nos avise de um erro'", () => {
  it("botões de riscar com rótulo e estado intactos", () => {
    render(<Alternatives options={Q.options} stateOf={() => "idle"} struck={["B"]} onStrike={() => {}} />);
    expect(screen.getByRole("button", { name: "Riscar alternativa A" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Desfazer risco da alternativa B" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("'Nos avise de um erro'", () => {
    render(<ReportQuestion question={{ ...Q, exam: { kind: "REVALIDA", year: 2024, semester: 2 }, number: 73 }} />);
    expect(screen.getByRole("button", { name: "Nos avise de um erro" })).toBeTruthy();
  });

  it("CSS: sem a caixa PERGUNTA; alternativas 16,5 px (16 no celular), letra com tinta, riscar discreto sem a linha e >= 44 px", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../novo/app/practice/tela/tela-questao.css"), "utf8");
    expect(css).not.toMatch(/\.tq-ask/);
    expect(css).toMatch(/\.tq-stem strong\.tq-pergunta\s*\{[^}]*font-weight:\s*700[^}]*color:\s*var\(--tq-ink\)/);
    expect(css).toMatch(/\.tq-alt__text\s*\{[^}]*font-size:\s*16\.5px/);
    expect(css).toMatch(/\.tq-alt__letter\s*\{[^}]*color:\s*var\(--tq-ink\)/);
    expect(css).not.toMatch(/\[data-theme="dark"\] \.tq-alt__letter\s*\{\s*color:\s*var\(--text-secondary\)/);
    const strike = css.match(/\.tq-alt__strike\s*\{[^}]*\}/)![0];
    expect(strike).not.toMatch(/border-left/);
    expect(strike).toMatch(/opacity:\s*0?\.55/);
    expect(css).toMatch(/\.tq-alt:hover \.tq-alt__strike[^{]*\.tq-alt__strike:focus-visible[^{]*\.tq-alt__strike\[aria-pressed="true"\][^{]*\{[^}]*opacity:\s*1/);
    // nenhuma largura do riscar abaixo de 44 px
    for (const m of css.matchAll(/\.tq-alt__strike\s*\{[^}]*width:\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(44);
    // celular: alternativa a 16 px
    expect(css).toMatch(/@media \(max-width: 720px\)\s*\{[^@]*\.tq-alt__text\s*\{[^}]*font-size:\s*16px/);
  });
});
