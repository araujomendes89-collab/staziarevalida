/**
 * Treinamento em Dupla · etapa 1 · tarefa 3 (parte B): MatchCard e PepTable.
 * Comportamento do pacote de design (components/osce/MatchCard.jsx e ui_kits/treino-dupla/Room.jsx) com os tokens do app.
 * Os testes importam os arquivos da parte B direto (o index.js do osce e o ds/index.js são ligados pelo líder na junção).
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MatchCard } from "../novo/ds/components/osce/MatchCard.jsx";
import { PepTable } from "../novo/ds/components/osce/PepTable.jsx";
import * as indexB from "../novo/ds/components/osce/index-b.js";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const DIR = "src/novo/ds/components/osce/";
const FILES_B = [
  `${DIR}MatchCard.jsx`,
  `${DIR}MatchCard.d.ts`,
  `${DIR}PepTable.jsx`,
  `${DIR}PepTable.d.ts`,
  `${DIR}osce-match.css`,
  `${DIR}index-b.js`,
];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const PESSOA = {
  name: "Pessoa de Exemplo",
  online: true,
  compat: 87,
  meta: "Instituição de exemplo · Revalida 2026/2",
  bio: "Texto de exemplo.",
  facts: [{ icon: "clock", label: "Ritmo", value: "Cronometrado" }],
  reasons: [
    { icon: "check", text: "Estuda as mesmas áreas", strong: true },
    { icon: "minus", text: "Dias diferentes", weak: true },
  ],
  tags: ["Clínica Médica"],
};

function drag(card: HTMLElement, dx: number) {
  fireEvent.pointerDown(card, { clientX: 200, pointerId: 1, pointerType: "touch" });
  fireEvent.pointerMove(card, { clientX: 200 + dx, pointerId: 1, pointerType: "touch" });
  fireEvent.pointerUp(card, { clientX: 200 + dx, pointerId: 1, pointerType: "touch" });
}

describe("MatchCard", () => {
  it("mostra só o que vem por props: nome, pílulas, motivos e tags", () => {
    render(<MatchCard person={PESSOA} />);
    const card = screen.getByRole("article");
    expect(card.getAttribute("aria-label")).toBe("Pessoa de Exemplo. Arraste para a direita para estudar, para a esquerda para pular.");
    expect(screen.getByRole("heading", { name: "Pessoa de Exemplo" })).toBeTruthy();
    expect(screen.getByText("online")).toBeTruthy();
    expect(screen.getByText("87% compatível")).toBeTruthy();
    expect(screen.getByText("PE")).toBeTruthy(); // iniciais
    expect(screen.getByText("Por que vocês combinam")).toBeTruthy();
    expect(screen.getByText("Estuda as mesmas áreas")).toBeTruthy();
    expect(screen.getByText("Clínica Médica")).toBeTruthy();
    expect(screen.getByText("ESTUDAR")).toBeTruthy();
    expect(screen.getByText("PULAR")).toBeTruthy();
  });

  it("sem online, sem compat, sem motivos e sem tags: nada é inventado", () => {
    render(<MatchCard person={{ name: "Só Nome" }} />);
    expect(screen.queryByText("online")).toBeNull();
    expect(screen.queryByText(/compatível/)).toBeNull();
    expect(screen.queryByText("Por que vocês combinam")).toBeNull();
  });

  it("arrastar 120 px para a direita chama onSwipe('right') depois de 240 ms; 100 px volta sem chamar", () => {
    vi.useFakeTimers();
    const onSwipe = vi.fn();
    render(<MatchCard person={PESSOA} onSwipe={onSwipe} />);
    const card = screen.getByRole("article");
    expect(card.style.touchAction).toBe("pan-y");

    drag(card, 100);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onSwipe).not.toHaveBeenCalled();
    expect(card.style.transform).toContain("translate3d(0px");
    expect(card.style.transition).toContain("220ms");

    drag(card, 120);
    act(() => {
      vi.advanceTimersByTime(239);
    });
    expect(onSwipe).not.toHaveBeenCalled();
    expect(card.style.transition).toContain("260ms cubic-bezier(.2,.7,.2,1)");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith("right");
  });

  it("arrastar 120 px para a esquerda chama onSwipe('left')", () => {
    vi.useFakeTimers();
    const onSwipe = vi.fn();
    render(<MatchCard person={PESSOA} onSwipe={onSwipe} />);
    drag(screen.getByRole("article"), -120);
    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(onSwipe).toHaveBeenCalledWith("left");
  });

  it("durante o arrasto: rotação dx/22 e selo com opacidade |dx|/110", () => {
    vi.useFakeTimers();
    render(<MatchCard person={PESSOA} />);
    const card = screen.getByRole("article");
    fireEvent.pointerDown(card, { clientX: 200, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerMove(card, { clientX: 255, pointerId: 1, pointerType: "touch" });
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(card.style.transform).toBe("translate3d(55px,0,0) rotate(2.5deg)");
    expect(screen.getByText("ESTUDAR").style.opacity).toBe("0.5");
    expect(screen.getByText("PULAR").style.opacity).toBe("0");
    fireEvent.pointerMove(card, { clientX: 100, pointerId: 1, pointerType: "touch" });
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(screen.getByText("PULAR").style.opacity).toBe("0.9090909090909091");
    expect(screen.getByText("ESTUDAR").style.opacity).toBe("0");
  });

  it("command {dir:-1} chama onSwipe('left'); outro n com dir 1 chama 'right' só uma vez cada", () => {
    vi.useFakeTimers();
    const onSwipe = vi.fn();
    const { rerender } = render(<MatchCard person={PESSOA} onSwipe={onSwipe} command={{ dir: -1, n: 1 }} />);
    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenLastCalledWith("left");
    // um cartão que já saiu não sai de novo
    rerender(<MatchCard person={PESSOA} onSwipe={onSwipe} command={{ dir: 1, n: 2 }} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onSwipe).toHaveBeenCalledTimes(1);
  });

  it("command {dir:1} chama onSwipe('right')", () => {
    vi.useFakeTimers();
    const onSwipe = vi.fn();
    render(<MatchCard person={PESSOA} onSwipe={onSwipe} command={{ dir: 1, n: 1 }} />);
    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(onSwipe).toHaveBeenCalledWith("right");
  });
});

// Exemplo do plano: níveis (correto / parcial / inadequado) 2,5/1,25/0 · 2,5/—/0 · 5/2,5/0
const ITENS = [
  { id: "i1", number: "1", text: "Cumprimenta o paciente", section: "Anamnese", levels: { correct: 2.5, partial: 1.25, incorrect: 0 },
    criteria: [{ label: "Adequado", text: "Faz tudo" }], tip: "Dica de exemplo" },
  { id: "i2", number: "2", text: "Lava as mãos", levels: { correct: 2.5, partial: null, incorrect: 0 } },
  { id: "i3", number: "3", text: "Examina o abdome", levels: { correct: 5, partial: 2.5, incorrect: 0 },
    subitems: [{ id: "s1", text: "Inspeção" }, { id: "s2", text: "Palpação" }] },
];
const SEM_MARCAS = { i1: { grade: null, subitems: [] }, i2: { grade: null, subitems: [] }, i3: { grade: null, subitems: [] } };

function pep(over: Record<string, unknown> = {}) {
  return <PepTable stationNumber={7} area="Clínica Médica" items={ITENS as any} marks={SEM_MARCAS as any} {...over} />;
}

describe("PepTable", () => {
  it("cabeçalho do impresso do INEP e colunas", () => {
    render(pep());
    expect(screen.getByText("ESTAÇÃO 7")).toBeTruthy();
    expect(screen.getByText("PADRÃO ESPERADO DE PROCEDIMENTO")).toBeTruthy();
    expect(screen.getByText("Área: Clínica Médica")).toBeTruthy();
    expect(screen.getByText("ITENS DE DESEMPENHO AVALIADOS")).toBeTruthy();
    expect(screen.getByText("DESEMPENHO OBSERVADO")).toBeTruthy();
    expect(screen.getByText("Inadequado")).toBeTruthy();
    expect(screen.getByText("Parcialmente adequado")).toBeTruthy();
    expect(screen.getByText("Adequado")).toBeTruthy();
    expect(screen.getByText("Anamnese")).toBeTruthy();
    expect(screen.getByText("TOTAL")).toBeTruthy();
    expect(screen.getByText("Faz tudo", { exact: false })).toBeTruthy();
    expect(screen.getByText("Dica de exemplo")).toBeTruthy();
  });

  it("sem número da estação não escreve 'ESTAÇÃO'", () => {
    render(pep({ stationNumber: null }));
    expect(screen.queryByText(/ESTAÇÃO/)).toBeNull();
  });

  it("soma os níveis, hachura o parcial que não existe, mostra TOTAL e '1 de 3 avaliados'", () => {
    const { container, rerender } = render(pep());
    expect(screen.getByText("0 de 3 avaliados")).toBeTruthy();
    expect(container.textContent).toContain("0,00 / 10,00");

    const marks = { ...SEM_MARCAS, i1: { grade: "partial", subitems: [] } };
    rerender(pep({ marks }));
    expect(screen.getByText("1 de 3 avaliados")).toBeTruthy();
    const total = screen.getByText("TOTAL").parentElement as HTMLElement;
    expect(total.textContent).toBe("TOTAL1,25 / 10,00");
    expect(container.textContent).toContain("1,25 / 10,00");

    // o item 2 não tem parcial: só 2 opções e uma célula hachurada escondida da leitura de tela
    const g2 = screen.getByRole("radiogroup", { name: "Item 2" });
    expect(within(g2).getAllByRole("radio")).toHaveLength(2);
    const hachuradas = g2.parentElement!.querySelectorAll('[aria-hidden="true"].sm-pep__cell--none');
    expect(hachuradas).toHaveLength(1);
    expect(hachuradas[0].textContent).toBe("");

    // todos corretos = 10,00 / 10,00; parcial do item 2 (que não existe) não conta
    const todos = {
      i1: { grade: "correct", subitems: [] },
      i2: { grade: "correct", subitems: [] },
      i3: { grade: "correct", subitems: [] },
    };
    rerender(pep({ marks: todos }));
    expect(screen.getByText("3 de 3 avaliados")).toBeTruthy();
    expect(screen.getByText("TOTAL").parentElement!.textContent).toBe("TOTAL10,00 / 10,00");
    rerender(pep({ marks: { ...todos, i2: { grade: "partial", subitems: [] } } }));
    expect(screen.getByText("TOTAL").parentElement!.textContent).toBe("TOTAL7,50 / 10,00");
  });

  it("maxScore muda o denominador", () => {
    const { container } = render(pep({ maxScore: 20 }));
    expect(container.textContent).toContain("0,00 / 20,00");
  });

  it("cada item é um radiogroup com rótulo; opções com aria-checked e aria-label '{nível}, {pontos} ponto(s)'", () => {
    render(pep({ marks: { ...SEM_MARCAS, i1: { grade: "correct", subitems: [] } } }));
    const g1 = screen.getByRole("radiogroup", { name: "Item 1" });
    const radios = within(g1).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Inadequado, 0,00 ponto",
      "Parcialmente adequado, 1,25 ponto",
      "Adequado, 2,50 pontos",
    ]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
    // tabindex móvel: só o marcado entra na ordem de tabulação
    expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual(["-1", "-1", "0"]);
    // sem marca: o primeiro nível existente
    const r3 = within(screen.getByRole("radiogroup", { name: "Item 3" })).getAllByRole("radio");
    expect(r3.map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(r3[2].getAttribute("aria-label")).toBe("Adequado, 5,00 pontos");
  });

  it("radiogroup: ← → andam entre os níveis existentes, Espaço e Enter marcam, marcar de novo limpa", () => {
    const onMark = vi.fn();
    const Harness = () => {
      const [marks, setMarks] = React.useState<any>(SEM_MARCAS);
      return pep({
        marks,
        onMark: (id: string, grade: string | null) => {
          onMark(id, grade);
          setMarks((m: any) => ({ ...m, [id]: { grade, subitems: [] } }));
        },
      });
    };
    render(<Harness />);
    const g = screen.getByRole("radiogroup", { name: "Item 1" });
    const [ina, par, ade] = within(g).getAllByRole("radio");
    ina.focus();
    fireEvent.keyDown(ina, { key: "ArrowRight" });
    expect(document.activeElement).toBe(par);
    expect(par.getAttribute("tabindex")).toBe("0");
    expect(ina.getAttribute("tabindex")).toBe("-1");
    fireEvent.keyDown(par, { key: "ArrowRight" });
    expect(document.activeElement).toBe(ade);
    fireEvent.keyDown(ade, { key: "ArrowRight" }); // volta ao começo
    expect(document.activeElement).toBe(ina);
    fireEvent.keyDown(ina, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(ade);
    expect(onMark).not.toHaveBeenCalled(); // setas só movem o foco

    fireEvent.keyDown(par, { key: " " });
    expect(onMark).toHaveBeenLastCalledWith("i1", "partial");
    expect(par.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(par, { key: "Enter" });
    expect(onMark).toHaveBeenLastCalledWith("i1", null); // marcar de novo limpa
    expect(par.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(ade);
    expect(onMark).toHaveBeenLastCalledWith("i1", "correct");
    expect(onMark).toHaveBeenCalledTimes(3);

    // item sem parcial: → pula direto para Adequado
    const [ina2, ade2] = within(screen.getByRole("radiogroup", { name: "Item 2" })).getAllByRole("radio");
    ina2.focus();
    fireEvent.keyDown(ina2, { key: "ArrowRight" });
    expect(document.activeElement).toBe(ade2);
  });

  it("sem onMark é só leitura: nada marca e o grupo avisa aria-readonly", () => {
    render(pep({ marks: { ...SEM_MARCAS, i1: { grade: "partial", subitems: [] } } }));
    const g = screen.getByRole("radiogroup", { name: "Item 1" });
    expect(g.getAttribute("aria-readonly")).toBe("true");
    const [ina, par] = within(g).getAllByRole("radio");
    fireEvent.click(ina);
    fireEvent.keyDown(ina, { key: " " });
    expect(par.getAttribute("aria-checked")).toBe("true");
    expect(ina.getAttribute("aria-checked")).toBe("false");
  });

  it("subitens: caixas marcadas pelas marcas e onToggleSubitem(itemId, subitemId)", () => {
    const onToggleSubitem = vi.fn();
    render(pep({ onToggleSubitem, marks: { ...SEM_MARCAS, i3: { grade: null, subitems: ["s2"] } } }));
    const insp = screen.getByLabelText("Inspeção") as HTMLInputElement;
    const palp = screen.getByLabelText("Palpação") as HTMLInputElement;
    expect(insp.checked).toBe(false);
    expect(palp.checked).toBe(true);
    fireEvent.click(insp);
    expect(onToggleSubitem).toHaveBeenCalledWith("i3", "s1");
  });
});

describe("arquivos da parte B", () => {
  it("index-b.js exporta só MatchCard e PepTable", () => {
    expect(Object.keys(indexB).sort()).toEqual(["MatchCard", "PepTable"]);
  });

  it("todos existem, sem cor hexadecimal nem rgba()", () => {
    for (const rel of FILES_B) {
      const text = read(rel);
      expect(text.length, rel).toBeGreaterThan(0);
      expect(text, rel).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(text, rel).not.toMatch(/rgba?\(/i);
      expect(text, rel).not.toMatch(/\b(?:hsla?|hwb)\(/i);
    }
  });

  it("componentes não importam lucide-react nem desenham ícones à mão", () => {
    for (const rel of [`${DIR}MatchCard.jsx`, `${DIR}PepTable.jsx`]) {
      const text = read(rel);
      expect(text).not.toMatch(/lucide-react/);
      expect(text).not.toMatch(/<svg/i);
    }
  });

  it("CSS: folha do PEP nos dois temas, marcado em azul INEP e touch-action do cartão", () => {
    const css = read(`${DIR}osce-match.css`);
    expect(css).toMatch(/\.sm-pep\s*\{[^}]*background:\s*var\(--pep-sheet\)/);
    expect(css).toMatch(/\.sm-pep\s*\{[^}]*color:\s*var\(--pep-sheet-text\)/);
    expect(css).toMatch(/\.sm-pep__cell\[aria-checked="true"\]\s*\{[^}]*background:\s*var\(--inep-blue-700\)/);
    expect(css).toMatch(/\.sm-pep__cell\[aria-checked="true"\]\s*\{[^}]*color:\s*var\(--pep-sheet\)/);
    expect(css).not.toMatch(/\[data-theme="dark"\]\s*\.sm-pep\s*\{[^}]*background/); // nada de folha escura
    expect(css).toMatch(/\.sm-match\s*\{[^}]*touch-action:\s*pan-y/);
    expect(css).toMatch(/violet-50/);
    expect(css).toMatch(/violet-600/);
  });

  it("textos de interface em pt-BR (ESTUDAR/PULAR) e números só por formatDecimal", () => {
    const pepSrc = read(`${DIR}PepTable.jsx`);
    expect(pepSrc).toMatch(/formatDecimal/);
    expect(pepSrc).not.toMatch(/toFixed|toLocaleString/);
  });
});
