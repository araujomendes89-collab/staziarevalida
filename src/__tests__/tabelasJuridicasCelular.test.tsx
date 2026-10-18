/**
 * Tabelas dos documentos jurídicos no celular (pedido do dono, 18/10/2026): no iPhone o quadro-resumo do Contrato ("Tema | Resumo")
 * saía cortado à direita e era preciso arrastar para o lado. Agora, até 600 px, cada linha vira um bloco empilhado: a 1ª coluna em
 * negrito como título e as outras logo abaixo, na largura toda (legal.css). No computador a tabela continua como era.
 * Vale para todas as tabelas (Contrato, Política, Regulamento), porque todas passam por LegalText — o cadastro, a tela de aceite,
 * as páginas públicas e Minha Conta → Documentos.
 * O jsdom não calcula layout: aqui conferimos a marcação (data-label, papéis de tabela, classe das tabelas com 3+ colunas), que o
 * texto não muda, e as regras do CSS. A medida de verdade (scrollWidth ≤ innerWidth dentro da janela, a 375 e 390 px, aberta pelo
 * cadastro e por Minha Conta → Documentos) fica em scripts/previa-criar-conta/medir-tabelas.mjs.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { LegalText } from "../novo/app/legal/LegalText.jsx";

const ler = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const TEXTOS = {
  contrato: ler("../novo/app/legal/textos/contrato-v3.0.md"),
  politica: ler("../novo/app/legal/textos/politica-privacidade-v3.0.md"),
  regulamento: ler("../novo/app/legal/textos/regulamento-v1.0.md"),
};
const CSS = ler("../novo/app/legal/legal.css");
const simples = (s: string) => s.replace(/\*\*\*([^*]+?)\*\*\*/g, "$1").replace(/\*\*([^*]+?)\*\*/g, "$1").replace(/\*([^*\s](?:[^*]*?[^*\s])?)\*/g, "$1").trim();

/** As tabelas do Markdown, do jeito que estão no arquivo (cabeçalho e linhas, sem a linha "|---|"). */
function tabelasDoArquivo(md: string) {
  const tabelas: string[][][] = [];
  let atual: string[][] | null = null;
  for (const linha of md.replace(/\r/g, "").split("\n").map((l) => l.trim())) {
    if (!linha.startsWith("|")) {
      atual = null;
      continue;
    }
    if (/^\|?\s*:?-{2,}/.test(linha)) continue;
    const celulas = linha.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => simples(c));
    if (!atual) tabelas.push((atual = []));
    atual.push(celulas);
  }
  return tabelas;
}

afterEach(cleanup);

describe("tabelas dos documentos jurídicos no celular", () => {
  for (const [nome, md] of Object.entries(TEXTOS)) {
    it(`${nome}: toda célula leva o nome da coluna (data-label) e o texto é o mesmo do arquivo`, () => {
      const esperadas = tabelasDoArquivo(md);
      expect(esperadas.length).toBeGreaterThan(0);
      const { container } = render(<LegalText source={md} />);
      const caixas = [...container.querySelectorAll(".lgl-tabela")];
      expect(caixas).toHaveLength(esperadas.length);
      caixas.forEach((caixa, t) => {
        const [cabecalho, ...linhas] = esperadas[t];
        const tabela = within(caixa as HTMLElement).getByRole("table");
        // ainda é tabela para leitores de tela, mesmo empilhada
        expect(within(tabela).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(cabecalho);
        const linhasNaTela = within(tabela).getAllByRole("row").slice(1);
        expect(linhasNaTela).toHaveLength(linhas.length);
        linhasNaTela.forEach((tr, j) => {
          const tds = within(tr).getAllByRole("cell");
          expect(tds.map((td) => td.textContent)).toEqual(linhas[j]);
          expect(tds.map((td) => td.getAttribute("data-label"))).toEqual(cabecalho.slice(0, tds.length));
        });
        // 3 colunas ou mais: o nome da coluna aparece em cima das células depois da 1ª
        expect(caixa.classList.contains("lgl-tabela--rotulos")).toBe(cabecalho.length > 2);
      });
    });
  }

  it("o quadro-resumo do Contrato é 'Tema | Resumo' (2 colunas: sem rótulo, Tema vira o título do bloco)", () => {
    const { container } = render(<LegalText source={TEXTOS.contrato} />);
    const primeira = container.querySelector(".lgl-tabela")!;
    expect([...primeira.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Tema", "Resumo"]);
    expect(primeira.classList.contains("lgl-tabela--rotulos")).toBe(false);
    expect(primeira.querySelector("td")!.textContent).toBe("Quem presta o serviço");
  });

  it("CSS: até 600 px a tabela vira blocos (sem largura mínima nem rolagem para o lado); no computador continua tabela", () => {
    const m = CSS.match(/@media \(max-width: 600px\) \{([\s\S]*?)\n\}/);
    expect(m, "falta o bloco @media (max-width: 600px) das tabelas").toBeTruthy();
    const celular = m![1];
    expect(celular).toMatch(/\.lgl-tabela table, \.lgl-tabela tbody, \.lgl-tabela tr, \.lgl-tabela td \{[^}]*display: block;[^}]*min-width: 0;/);
    expect(celular).toMatch(/\.lgl-tabela \{[^}]*overflow-x: visible;/);
    expect(celular).toMatch(/\.lgl-tabela thead \{[^}]*position: absolute;[^}]*clip: rect\(0 0 0 0\);/);
    expect(celular).toMatch(/\.lgl-tabela td:first-child \{[^}]*font-weight: 700;/);
    expect(celular).toMatch(/\.lgl-tabela td \{[^}]*overflow-wrap: break-word;/);
    expect(celular).toMatch(/\.lgl-tabela--rotulos td \+ td::before \{[^}]*content: attr\(data-label\);/);
    // fora do celular a regra de sempre (tabela com largura mínima, rola só se a tela for estreita) continua
    const fora = CSS.replace(m![0], "");
    expect(fora).toMatch(/\.lgl-tabela table \{[^}]*min-width: 600px;/);
    expect(fora).not.toMatch(/\.lgl-tabela[^{]*\{[^}]*display: block/);
  });

  it("texto justificado (18/10/2026): parágrafos sempre; no celular o Resumo das tabelas de 2 colunas; Tema e tabelas de 3+ à esquerda", () => {
    const { container } = render(<LegalText source={TEXTOS.contrato} />);
    // hifenização em português, para não abrir buracos entre as palavras
    expect(container.querySelector(".lgl-text")!.getAttribute("lang")).toBe("pt-BR");
    const regra = (sel: string, css: string) => {
      const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return css.match(new RegExp(`(?:^|\\n)\\s*${esc} \\{([^}]*)\\}`))?.[1] ?? "";
    };
    const m = CSS.match(/@media \(max-width: 600px\) \{([\s\S]*?)\n\}/)!;
    const fora = CSS.replace(m[0], "");
    // parágrafos do corpo: justificados no celular e no computador, última linha à esquerda, hifenização e inter-word
    const p = regra(".lgl-text > p", fora);
    for (const d of ["text-align: justify;", "text-justify: inter-word;", "text-align-last: left;", "hyphens: auto;", "-webkit-hyphens: auto;", "hyphenate-limit-chars: 6 3 3;"]) {
      expect(p).toContain(d);
    }
    // títulos e listas não são justificados
    expect(CSS).not.toMatch(/\.lgl-(?:text|paper) (?:h[123]|ul|li)[^{]*\{[^}]*text-align: justify/);
    // celular: Resumo justificado, Tema à esquerda, tabelas de 3+ colunas à esquerda (vem depois e ganha)
    const cel = m[1];
    expect(regra(".lgl-tabela td + td", cel)).toContain("text-align: justify;");
    expect(regra(".lgl-tabela td + td", cel)).toContain("text-align-last: left;");
    expect(regra(".lgl-tabela td:first-child", cel)).toContain("text-align: left;");
    expect(cel.lastIndexOf(".lgl-tabela--rotulos td + td { text-align: left; }")).toBeGreaterThan(cel.indexOf(".lgl-tabela td + td {"));
    // no computador as células da tabela não são justificadas
    expect(fora).not.toMatch(/\.lgl-tabela[^{]*\{[^}]*text-align: justify/);
  });
});
