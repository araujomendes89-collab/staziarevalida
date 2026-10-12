/**
 * Treinamento em Dupla · etapa 1 · tarefa 3 (junção): índice do design system, CSS e vitrine de desenvolvimento.
 * Os testes de cada componente estão em duplaComponentesEstacaoA.test.tsx e duplaComponentesEstacaoB.test.tsx.
 * Aqui: a vitrine renderiza tudo sem erro, não usa cor escrita, e o App só liga a vitrine em desenvolvimento.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import * as ds from "../novo/ds/index.js";
import { Vitrine } from "../novo/app/dupla/Vitrine.jsx";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("junção dos componentes da estação", () => {
  it("ds/index.js exporta os sete componentes novos (partes A e B)", () => {
    for (const name of ["Timer", "PrintItem", "PrintImage", "StatTile", "StationCard", "MatchCard", "PepTable"]) {
      expect(typeof (ds as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  it("styles.css importa osce.css e osce-match.css depois de components.css", () => {
    const imports = [...read("src/novo/ds/styles.css").matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const comp = imports.indexOf("./components/components.css");
    expect(comp).toBeGreaterThan(-1);
    expect(imports.indexOf("./components/osce/osce.css")).toBeGreaterThan(comp);
    expect(imports.indexOf("./components/osce/osce-match.css")).toBeGreaterThan(comp);
  });

  it("os arquivos da parte A continuam sem a parte B (e o contrário)", () => {
    const a = read("src/novo/ds/components/osce/index.js") + read("src/novo/ds/components/osce/osce.css");
    expect(a).not.toMatch(/MatchCard|PepTable|osce-match/);
    const b = read("src/novo/ds/components/osce/index-b.js");
    expect(b).toMatch(/MatchCard/);
    expect(b).toMatch(/PepTable/);
    expect(b).not.toMatch(/Timer|PrintItem|PrintImage|StatTile|StationCard/);
  });
});

describe("Vitrine do Treinamento em Dupla", () => {
  it("renderiza o título e todos os componentes sem erro", () => {
    const { container } = render(<Vitrine />);
    expect(screen.getByRole("heading", { level: 1, name: "Vitrine do Treinamento em Dupla" })).toBeTruthy();

    // cronômetro em todos os estados
    const timers = screen.getAllByRole("timer");
    expect(timers.map((t) => t.getAttribute("data-state"))).toEqual(["idle", "running", "running", "running", "paused", "expired"]);
    expect(timers.map((t) => t.getAttribute("data-tone"))).toEqual([null, null, "warn", "danger", null, "danger"]);

    // cartões de estação: as cinco áreas, com e sem nota
    const cards = container.querySelectorAll(".osce-station");
    expect(cards).toHaveLength(10);
    expect(screen.getAllByText(/\(sem nota\)/)).toHaveLength(5);
    expect(screen.getAllByText(/\(com nota\)/)).toHaveLength(5);
    expect(screen.getAllByTitle("Já realizada")).toHaveLength(5);
    for (const nome of ["Clínica Médica", "Cirurgia", "Ginecologia e Obstetrícia", "Pediatria", "Medicina de Família"]) {
      expect(screen.getAllByText(nome).length, nome).toBeGreaterThanOrEqual(2);
    }

    // impressos, indicadores, selos de papel
    expect(screen.getAllByText(/^Impresso 1/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Ver conteúdo/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Ver conteúdo/ })[0]);
    expect(screen.getAllByRole("button", { name: "Ampliar impresso" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Candidato").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ator/Avaliador").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".osce-stat")).toHaveLength(2);

    // cartão de parceiro com uma pessoa de exemplo
    expect(screen.getByRole("article").getAttribute("aria-label")).toContain("Pessoa de Exemplo 1");

    // folha do PEP: editável e só leitura
    expect(screen.getAllByText("PADRÃO ESPERADO DE PROCEDIMENTO")).toHaveLength(2);
    expect(screen.getAllByText("0 de 3 avaliados")).toHaveLength(1);
    expect(screen.getAllByRole("radiogroup", { name: "Item 1" })).toHaveLength(2);

    // janela, avisos, seção e texto
    expect(screen.getByRole("button", { name: "Abrir janela de exemplo" })).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(4);
    expect(screen.getByRole("button", { name: /Seção de exemplo/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Anotações (exemplo)")).toBeTruthy();
  });

  it("a folha editável marca e o total acompanha; a janela de exemplo abre e fecha", () => {
    render(<Vitrine />);
    const grupo = screen.getAllByRole("radiogroup", { name: "Item 1" })[0];
    fireEvent.click(within(grupo).getByRole("radio", { name: "Parcialmente adequado, 1,25 ponto" }));
    expect(screen.getByText("1 de 3 avaliados")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Abrir janela de exemplo" }));
    expect(screen.getByRole("dialog", { name: "Janela de exemplo" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Janela de exemplo" })).toBeNull();
  });

  it("o cartão de parceiro sai pelo botão e volta pelo botão de trazer de volta", () => {
    vi.useFakeTimers();
    render(<Vitrine />);
    expect(screen.getByText("Última escolha: —")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Estudar junto/ }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("Última escolha: Estudar (exemplo)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trazer o cartão de volta" }));
    expect(screen.getByText("Última escolha: —")).toBeTruthy();
  });

  it("toda a vitrine é de exemplo: sem pessoa, nota ou número inventado do protótipo", () => {
    const text = render(<Vitrine />).container.textContent ?? "";
    expect(text).toContain("Exemplo");
    expect(text).not.toMatch(/14 feitas|PEP 7,8/);
    expect(read("src/novo/app/dupla/Vitrine.jsx")).not.toMatch(/prototype|data\.js|SEED/);
  });

  it("sem cor escrita: nenhuma cor hexadecimal, rgb(), hsl() ou rgba() na vitrine", () => {
    const src = read("src/novo/app/dupla/Vitrine.jsx");
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(src).not.toMatch(/\b(?:rgba?|hsla?)\s*\(/i);
  });

  it("toda variável de cor usada na vitrine existe nos tokens", () => {
    const src = read("src/novo/app/dupla/Vitrine.jsx");
    const tokens = ["colors.css", "semantic.css", "dupla.css", "typography.css", "spacing.css"].map((f) => read(`src/novo/ds/tokens/${f}`)).join("\n");
    const used = new Set<string>();
    for (const m of src.matchAll(/--[a-z][a-z0-9-]*/g)) used.add(m[0]);
    // nomes montados no código (--area-${...}, --inep-blue-${n}) são conferidos pelos valores reais
    const montados = [
      ...["clinica", "cirurgia", "go", "pediatria", "preventiva"].flatMap((t) => [`--area-${t}`, `--area-${t}-soft`, `--area-${t}-ink`, `--area-${t}-solid`]),
      ...[900, 700, 500, 300, 200, 100, 50].map((n) => `--inep-blue-${n}`),
    ];
    for (const name of [...used, ...montados]) {
      if (/-$/.test(name)) continue; // pedaço de nome montado: o nome inteiro está em "montados"
      expect(tokens, name).toMatch(new RegExp(`${name}\\s*:`));
    }
  });
});

describe("App.jsx: a vitrine só existe em desenvolvimento", () => {
  const app = read("src/novo/app/App.jsx");
  // o que não é comentário de linha inteira
  const code = app.split("\n").filter((l) => !l.trim().startsWith("//"));

  it("toda linha de código que cita a vitrine tem import.meta.env.DEV na mesma linha", () => {
    const citam = code.filter((l) => /vitrine/i.test(l));
    expect(citam.length).toBeGreaterThanOrEqual(4);
    for (const linha of citam) expect(linha, linha).toContain("import.meta.env.DEV");
  });

  it("a vitrine entra por React.lazy dentro da condição, sem import estático", () => {
    expect(app).toMatch(/const Vitrine = import\.meta\.env\.DEV \? React\.lazy\(\(\) => import\("\.\/dupla\/Vitrine\.jsx"\)\) : null;/);
    expect(app).not.toMatch(/^import[^\n]*Vitrine/m);
    expect(app.match(/dupla\/Vitrine/g)).toHaveLength(1);
  });

  it("a rota vitrine-dupla fica fora de PHASE2_ROUTES e de qualquer lista fixa", () => {
    const fixas = code.filter((l) => /vitrine-dupla/.test(l) && !l.includes("import.meta.env.DEV"));
    expect(fixas).toEqual([]);
  });
});
