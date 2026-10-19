/**
 * Proposta B da tela de questão (escolhida pelo dono em 19/10/2026): sem a caixa "PERGUNTA"; o enunciado é contínuo e a pergunta
 * aparece em NEGRITO no fim do próprio texto, como na prova impressa do Inep. Figuras e tabelas entram na posição da prova quando a
 * figura tem `apos` (trecho do enunciado); sem `apos`, no lugar de sempre. Vale para treino, simulado, nivelamento e revisão.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { Alternatives, QuestionSheet, QuestionStatement, ReportQuestion } from "../novo/app/practice/tela/QuestionSheet.jsx";

afterEach(cleanup);

/** Simula a largura da tela para o useMQ (matchMedia). Sem isto, os testes são o computador (setupTests: nada casa). */
function tela(largura: number) {
  const original = window.matchMedia;
  window.matchMedia = ((q: string) => {
    const max = q.match(/max-width:\s*(\d+)px/);
    return { matches: max ? largura <= Number(max[1]) : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false };
  }) as any;
  onTestFinished(() => {
    window.matchMedia = original;
  });
}

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

  it("tabelas (tipo 'tabela'): sem a legenda 'Figura N' (a prova não tem); as figuras comuns continuam numeradas entre si", () => {
    const images = [
      { url: "/t1.png", alt: "Tabela 1", tipo: "tabela" },
      { url: "/f.png", alt: "Foto A" },
      { url: "/t2.png", alt: "Tabela 2", tipo: "tabela" },
      { url: "/g.png", alt: "Foto B" },
    ];
    const { container } = render(<QuestionStatement question={{ ...Q, images }} />);
    expect(screen.getByAltText("Tabela 1").closest("figure")!.querySelector("figcaption")).toBeNull();
    expect(screen.getByAltText("Tabela 2").closest("figure")!.querySelector("figcaption")).toBeNull();
    expect(Array.from(container.querySelectorAll("figcaption")).map((c) => c.textContent)).toEqual(["Figura 1", "Figura 2"]);
    cleanup();
    // só tabelas (a Q73 corrigida): nenhuma legenda
    render(<QuestionStatement question={{ ...Q, images: [images[0], images[2]] }} />);
    expect(document.querySelectorAll("figcaption")).toHaveLength(0);
  });

  it("tabela no celular: não encolhe abaixo de 560 px (rola de lado dentro do cartão); recorte menor que isso fica no próprio tamanho", () => {
    const q = { ...Q, images: [{ url: "/t.png", alt: "Tabela de exames", tipo: "tabela" }, { url: "/p.png", alt: "Tabela pequena", tipo: "tabela" }] };
    render(<QuestionStatement question={q} />);
    const carrega = (alt: string, largura: number) => {
      const img = screen.getByAltText(alt) as HTMLImageElement;
      Object.defineProperty(img, "naturalWidth", { configurable: true, value: largura });
      act(() => {
        fireEvent.load(img);
      });
      return img;
    };
    const grande = carrega("Tabela de exames", 733);
    const botao = screen.getByRole("button", { name: "Ampliar: Tabela de exames" });
    expect(botao.style.minWidth).toBe("562px"); // 560 + borda
    expect(botao.style.maxWidth).toBe("735px"); // nunca maior que o arquivo
    expect(grande.style.width).toBe("100%");
    expect(grande.style.maxHeight).toBe("none");
    expect(botao.parentElement!.classList.contains("tq-tabela-rolagem")).toBe(true);
    // a rolagem da figura-tabela não desenha a sombra de borda (no computador sobrava um fio solto à direita da tabela)
    const css = fs.readFileSync(path.resolve(__dirname, "../novo/app/practice/tela/tela-questao.css"), "utf8");
    expect(css).toMatch(/\.tq \.tq-fig-tabela \.tq-tabela-rolagem\s*\{[^}]*background:\s*none/);
    expect(grande.closest("figure")!.getAttribute("data-larga")).toBe("true");
    carrega("Tabela pequena", 400);
    const pequena = screen.getByRole("button", { name: "Ampliar: Tabela pequena" });
    expect(pequena.style.minWidth).toBe("402px");
    expect(screen.getByAltText("Tabela pequena").closest("figure")!.getAttribute("data-larga")).toBe("false");
  });

  it("ampliar tabela: abre no tamanho do arquivo, com rolagem (encaixar na tela do celular quase não aumentava a letra)", () => {
    render(<QuestionStatement question={{ ...Q, images: [{ url: "/t.png", alt: "Tabela", tipo: "tabela" }, { url: "/f.png", alt: "Foto" }] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Ampliar: Tabela" }));
    let dialog = screen.getByRole("dialog", { name: "Tabela" });
    expect(dialog.style.overflow).toBe("auto");
    expect((within(dialog).getByAltText("Tabela") as HTMLImageElement).style.maxWidth).toBe("none");
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    fireEvent.click(screen.getByRole("button", { name: "Ampliar: Foto" }));
    dialog = screen.getByRole("dialog", { name: "Foto" });
    expect((within(dialog).getByAltText("Foto") as HTMLImageElement).style.maxWidth).toBe("100%");
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

  it("computador, depois de responder (correção, revisão): o caso vem inteiro, sem 'Ver caso completo', e a pergunta continua no fim do texto", () => {
    tela(1280);
    const { container } = render(<QuestionStatement question={Q} revealed />);
    expect(screen.queryByRole("button", { name: "Ver caso completo" })).toBeNull();
    expect(container.querySelector('[data-clamp="true"]')).toBeNull();
    expect(container.querySelector("p.tq-stem--fim")).toBeNull();
    const stems = container.querySelectorAll("p.tq-stem");
    expect(stems).toHaveLength(1);
    expect(stems[0].textContent).toBe(`${CASO} ${PERGUNTA}`);
    expect(stems[0].querySelector("strong.tq-pergunta")!.textContent).toBe(PERGUNTA);
  });

  it("computador: ao confirmar a resposta a pergunta não pula de linha (mesmo parágrafo antes e depois)", () => {
    tela(1440);
    const { container, rerender } = render(<QuestionStatement question={Q} />);
    const antes = container.querySelector("p.tq-stem")!;
    rerender(<QuestionStatement question={Q} revealed />);
    expect(container.querySelector("p.tq-stem")).toBe(antes);
    expect(antes.querySelector("strong.tq-pergunta")).toBeTruthy();
    expect(container.querySelector("p.tq-stem--fim")).toBeNull();
  });

  it("'Ver caso completo' (tablet/celular, caso encolhido depois de responder): a pergunta fica fora do parágrafo encolhido", () => {
    tela(834);
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

  it("celular, depois de responder, com figura no meio do caso: só o 1º parágrafo encolhe (o botão logo depois dele) e a pergunta fica no fim do último", () => {
    tela(390);
    const statement = "Exames: Ao exame, abdome doloroso. Qual a conduta mais adequada?";
    const images = [{ url: "/a.png", alt: "Figura A", apos: "Exames:" }];
    const { container } = render(<QuestionStatement question={{ ...Q, statement, images }} revealed />);
    const stems = Array.from(container.querySelectorAll("p.tq-stem"));
    expect(stems.map((p) => p.getAttribute("data-clamp"))).toEqual(["true", "false"]);
    const botao = screen.getByRole("button", { name: "Ver caso completo" });
    expect(stems[0].nextElementSibling).toBe(botao);
    expect(botao.getAttribute("aria-controls")).toBe(stems[0].id);
    expect(stems[1].textContent).toBe("Ao exame, abdome doloroso. Qual a conduta mais adequada?");
    expect(stems[1].querySelector("strong.tq-pergunta")).toBeTruthy();
    expect(container.querySelector("p.tq-stem--fim")).toBeNull();
  });

  it("figura ancorada no fim do texto (depois da pergunta): pergunta em negrito no fim do texto e a figura depois dela", () => {
    const statement = "Paciente com lesão de pele no dorso há 3 meses. Qual o diagnóstico da lesão mostrada na imagem a seguir?";
    const { container } = render(<QuestionStatement question={{ ...Q, statement, images: [{ url: "/x.png", alt: "Lesão", apos: "na imagem a seguir?" }] }} />);
    expect(ordem(container)).toEqual(["texto:Paciente com lesão d", "pergunta:Qual o diagnóstico da lesão mostrada na imagem a seguir?", "figura:Lesão"]);
    expect(screen.getByText("Caso clínico")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Qual o diagnóstico da lesão mostrada na imagem a seguir?" })).toBeTruthy();
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
    // contraste do riscar parado (>= 3:1): cor de tinta no claro (3,5:1 a 0,55); no escuro, o cinza secundário (3,4:1)
    expect(strike).toMatch(/color:\s*var\(--tq-ink\)/);
    expect(css).toMatch(/\[data-theme="dark"\] \.tq-alt__strike\s*\{\s*color:\s*var\(--text-secondary\)/);
    // "Nos avise de um erro" com 44 px de toque
    expect(css).toMatch(/\.tq-link\s*\{[^}]*height:\s*44px/);
    // A−/A+ (36 px de desenho): a área de toque passa 4 px acima e abaixo (36 + 8 = 44)
    expect(css).toMatch(/\.tq-fs button::after\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*-4px 0/);
    // celular: alternativa a 16 px
    expect(css).toMatch(/@media \(max-width: 720px\)\s*\{[^@]*\.tq-alt__text\s*\{[^}]*font-size:\s*16px/);
  });
});
