/**
 * Treino em Dupla · etapa 3 · tarefa 7: tela Banco de estações (/novo/estacoes).
 * Comportamento e textos do protótipo (Stations.jsx:19-58), sem "Simulado de prova".
 * Pedido do dono de 17/10: o cartão e a linha trazem só área, nome, grau de dificuldade (selo só quando a revisão médica
 * gravou) e origem ("Revalida 2020 · INEP" ou "Estação inédita"); embaixo, "Sua última nota" e "Média geral". Sem o número e
 * sem os temas pequenos (styles), que continuam valendo na busca.
 * Os dados seguem o contrato de `app_dupla_stations()` (Tarefa 6); aqui entram por um backend simulado, com as 10 estações
 * de TESTE do INEP 2020 (ids `teste-inep2020-eNN`, só dado de teste) como conteúdo. Nada disso existe em produção.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import testStations from "../../server/dupla/data/teste-inep2020.json";

const state: { rpc: (...args: any[]) => Promise<any> } = { rpc: async () => null };
// o `backend` do app é sempre o mesmo objeto: um novo a cada render faria a tela recarregar sem parar
const session: { backend: any; boot?: { role: string } } = { backend: { rpc: (...args: unknown[]) => state.rpc(...args) } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));

import { StationsScreen } from "../novo/app/dupla/StationsScreen.jsx";

const AREA_CODE: Record<string, string> = {
  "Clínica Médica": "CM",
  "Cirurgia Geral": "CR",
  "Ginecologia e Obstetrícia": "GO",
  Pediatria: "PED",
  "Medicina de Família e Comunidade": "MFC",
};

type Row = {
  id: string;
  name: string;
  topic: string;
  area: string;
  area_code: string;
  number: number | null;
  edition: string | null;
  reapplication: boolean;
  institution: string | null;
  styles: string[];
  duration_ms: number;
  is_pro_only: boolean;
  criteria_count: number;
  pressing_count: number;
  my_last_pct: number | null;
  average_pct: number | null;
  evaluations: number;
  difficulty?: "facil" | "medio" | "dificil" | null;
  origin_label?: string | null;
  content_status?: "awaiting_content" | "content_ready";
};

/** Linhas no formato de app_dupla_stations(), na ordem da prova que o servidor entrega (aqui, a numeração 1 a 10). */
function bankRows(extra: Partial<Record<string, Partial<Row>>> = {}): Row[] {
  return (testStations as any[]).map((s, i) => ({
    id: s.id,
    name: s.name,
    topic: s.topic,
    area: s.area,
    area_code: AREA_CODE[s.area],
    number: i + 1,
    edition: "2020",
    reapplication: false,
    institution: "INEP",
    styles: s.styles,
    duration_ms: 600000,
    is_pro_only: false,
    criteria_count: 8,
    pressing_count: 2,
    my_last_pct: null,
    average_pct: null,
    evaluations: 0,
    ...(extra[s.id] ?? {}),
  }));
}

const ID = (n: number) => `teste-inep2020-e${String(n).padStart(2, "0")}`;
const cardTitles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const cardOf = (title: string) => screen.getByRole("heading", { name: title, level: 3 }).closest("button") as HTMLElement;

function setup(rows: Row[] = bankRows(), go = vi.fn()) {
  state.rpc = vi.fn(async (fn: string) => {
    if (fn !== "app_dupla_stations") throw new Error(`função inesperada: ${fn}`);
    return rows;
  }) as unknown as typeof state.rpc;
  const view = render(<StationsScreen go={go} />);
  return { go, ...view };
}
const ready = () => screen.findByPlaceholderText("Buscar por estação, tema ou queixa");

beforeEach(() => {
  state.rpc = async () => null;
});
afterEach(() => {
  cleanup();
  delete session.boot;
});

describe("Banco de estações: cartões", () => {
  it("cartões com área, nome, 'Revalida 2020 · INEP', 'Sua última nota' e 'Média geral' (— sem dado); sem número e sem temas pequenos", async () => {
    setup(bankRows({ [ID(3)]: { my_last_pct: 72, average_pct: 61.4, evaluations: 6 }, [ID(4)]: { average_pct: 70.56, evaluations: 5 } }));
    await ready();
    expect(state.rpc).toHaveBeenCalledWith("app_dupla_stations");

    const peds = cardOf("Coqueluche no lactente");
    expect(within(peds).getByText("Pediatria")).toBeTruthy(); // área
    expect(within(peds).queryByText("3")).toBeNull(); // sem o número da estação
    expect(peds.querySelector(".osce-station__num")).toBeNull();
    expect(within(peds).getByText("Revalida 2020 · INEP")).toBeTruthy();
    expect(within(peds).getByText("Sua última nota").nextSibling?.textContent).toBe("72%");
    expect(within(peds).getByText("Média geral").nextSibling?.textContent).toBe("61,4%");
    expect(within(peds).getByTitle("Já realizada")).toBeTruthy();
    expect(within(peds).queryByText("Tosse")).toBeNull(); // sem os temas pequenos (styles)
    expect(peds.querySelector(".osce-station__tags")).toBeNull();

    const semDado = cardOf("Leucemia aguda: palpação de fígado e baço");
    expect(within(semDado).getByText("Sua última nota").nextSibling?.textContent).toBe("—");
    expect(within(semDado).getByText("Média geral").nextSibling?.textContent).toBe("—");
    expect(within(semDado).queryByTitle("Já realizada")).toBeNull();

    // média sem nota própria: só a média aparece
    const soMedia = cardOf("Sangramento uterino anormal");
    expect(within(soMedia).getByText("Sua última nota").nextSibling?.textContent).toBe("—");
    expect(within(soMedia).getByText("Média geral").nextSibling?.textContent).toBe("70,6%");
    expect(cardTitles()).toHaveLength(10);
  });

  it("estação sem instituição é 'Estação inédita'; reaplicação com a edição certa", async () => {
    const rows = bankRows();
    rows[0] = { ...rows[0], number: null, edition: null, institution: null };
    rows[1] = { ...rows[1], edition: "2022/1", reapplication: true };
    setup(rows);
    await ready();
    expect(within(cardOf(rows[0].name)).getByText("Estação inédita")).toBeTruthy();
    expect(within(cardOf(rows[1].name)).getByText("Revalida 2022/1 (reaplicação) · INEP")).toBeTruthy();
  });

  it("grau de dificuldade: selo Fácil, Médio ou Difícil na ordem área, nome, grau, origem; sem grau, selo nenhum", async () => {
    setup(bankRows({ [ID(1)]: { difficulty: "dificil" }, [ID(2)]: { difficulty: "facil" }, [ID(3)]: { difficulty: "medio" } }));
    await ready();
    const leucemia = cardOf("Leucemia aguda: palpação de fígado e baço");
    expect(within(leucemia).getByText("Difícil")).toBeTruthy();
    // ordem no cartão: área, nome, grau, origem e, embaixo, as notas
    const texto = leucemia.textContent ?? "";
    const pos = ["Clínica Médica", "Leucemia aguda", "Difícil", "Revalida 2020 · INEP", "Sua última nota", "Média geral"].map((t) => texto.indexOf(t));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    expect(within(cardOf("Trauma: fratura exposta de tíbia")).getByText("Fácil")).toBeTruthy();
    expect(within(cardOf("Coqueluche no lactente")).getByText("Médio")).toBeTruthy();
    // sem grau gravado: nada (nem "—", nem palavra de dificuldade)
    const semGrau = cardOf("Apendicite aguda");
    expect(semGrau.querySelector(".osce-level")).toBeNull();
    expect(semGrau.textContent).not.toMatch(/F[áa]cil|M[ée]dio|Dif[íi]cil|Dificuldade/);
    expect(document.querySelectorAll(".osce-level")).toHaveLength(3);
    // código desconhecido também não vira selo
    cleanup();
    setup(bankRows({ [ID(1)]: { difficulty: "extremo" as any } }));
    await ready();
    expect(document.querySelectorAll(".osce-level")).toHaveLength(0);
  });

  it("lista: mesma ordem e mesmos dados do cartão, sem número e sem temas pequenos", async () => {
    setup(bankRows({ [ID(1)]: { difficulty: "medio", my_last_pct: 80, average_pct: 61.5, evaluations: 7 } }));
    await ready();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Visualização" })).getByRole("radio", { name: "Lista" }));
    const rows = screen.getAllByRole("button").filter((b) => b.textContent?.includes("Sua última nota"));
    expect(rows).toHaveLength(10);
    const texto = rows[0].textContent ?? "";
    const pos = ["Clínica Médica", "Leucemia aguda", "Médio", "Revalida 2020 · INEP", "Sua última nota", "80%", "Média geral", "61,5%"].map((t) => texto.indexOf(t));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    expect(texto).not.toMatch(/Cansaço|Febre|Sangramento gengival/); // styles da estação 1 de teste
    expect(rows[0].querySelector(".dst__num")).toBeNull();
    expect(rows[1].querySelector(".osce-level")).toBeNull(); // sem grau, sem selo
  });
});

describe("Banco de estações: origem do catálogo e cartões aguardando conteúdo (013420/013425)", () => {
  it("usa a origem gravada no catálogo; sem ela, o cálculo pela edição (2011 a 2017: 'Revalida 2013', não 'Estação inédita')", async () => {
    const rows = bankRows();
    rows[0] = { ...rows[0], edition: null, institution: null, origin_label: "Revalida 2013" };
    rows[1] = { ...rows[1], origin_label: "Revalida 2022/2 · INEP (também reaplicação da 2022/1)" };
    rows[2] = { ...rows[2], origin_label: "   " }; // vazio: volta ao cálculo
    setup(rows);
    await ready();
    expect(within(cardOf(rows[0].name)).getByText("Revalida 2013")).toBeTruthy();
    expect(within(cardOf(rows[0].name)).queryByText("Estação inédita")).toBeNull();
    expect(within(cardOf(rows[1].name)).getByText("Revalida 2022/2 · INEP (também reaplicação da 2022/1)")).toBeTruthy();
    expect(within(cardOf(rows[2].name)).getByText("Revalida 2020 · INEP")).toBeTruthy();
  });

  const comCatalogo = () => {
    const rows = bankRows();
    rows[0] = { ...rows[0], content_status: "awaiting_content" }; // Leucemia (CM)
    rows[6] = { ...rows[6], content_status: "awaiting_content" }; // Apendicite (CR)
    return rows;
  };

  it("equipe: 'Só com conteúdo' ligado por padrão esconde os cartões sem conteúdo; desligado, eles aparecem com o selo na grade e na lista", async () => {
    session.boot = { role: "admin" };
    setup(comCatalogo());
    await ready();
    const filtro = screen.getByRole("switch", { name: /Só com conteúdo/ }) as HTMLInputElement;
    expect(filtro.checked).toBe(true);
    expect(screen.getByText("Escondidos: 2 aguardando conteúdo")).toBeTruthy();
    expect(cardTitles()).toHaveLength(8);
    expect(cardTitles()).not.toContain("Apendicite aguda");
    expect(screen.queryByText("Aguardando conteúdo")).toBeNull();
    // contagens seguem o filtro
    expect(within(screen.getByRole("group", { name: "Área" })).getByRole("button", { name: /Todas/ }).textContent).toBe("Todas8");

    fireEvent.click(filtro);
    expect(cardTitles()).toHaveLength(10);
    expect(within(cardOf("Apendicite aguda")).getByText("Aguardando conteúdo")).toBeTruthy();
    expect(within(cardOf("Leucemia aguda: palpação de fígado e baço")).getByText("Aguardando conteúdo")).toBeTruthy();
    expect(within(cardOf("Coqueluche no lactente")).queryByText("Aguardando conteúdo")).toBeNull();
    expect(screen.getAllByText("Aguardando conteúdo")).toHaveLength(2);

    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Visualização" })).getByRole("radio", { name: "Lista" }));
    const linhas = screen.getAllByRole("button").filter((b) => b.textContent?.includes("Sua última nota"));
    expect(linhas).toHaveLength(10);
    expect(linhas.find((b) => b.textContent?.includes("Apendicite aguda"))!.textContent).toContain("Aguardando conteúdo");
    expect(linhas.filter((b) => b.textContent?.includes("Aguardando conteúdo"))).toHaveLength(2);
  });

  it("equipe com tudo escondido pelo filtro: a tela diz para desligar 'Só com conteúdo'", async () => {
    session.boot = { role: "editor" };
    setup(bankRows().map((r) => ({ ...r, content_status: "awaiting_content" as const })));
    await ready();
    expect(screen.getByText("Nenhuma estação encontrada")).toBeTruthy();
    expect(screen.getByText(/Desligue “Só com conteúdo” para ver os cartões aguardando conteúdo/)).toBeTruthy();
  });

  it("aluno: sem o filtro e sem o selo, mesmo que um cartão viesse marcado", async () => {
    session.boot = { role: "student" };
    setup(comCatalogo());
    await ready();
    expect(screen.queryByRole("switch", { name: /Só com conteúdo/ })).toBeNull();
    expect(screen.queryByText("Aguardando conteúdo")).toBeNull();
    expect(cardTitles()).toHaveLength(10);
  });
});

describe("Banco de estações: filtros", () => {
  it("bloco de área filtra; busca acha por tema e pílula; 'Limpar filtros' volta tudo", async () => {
    setup();
    const search = (await ready()) as HTMLInputElement;

    // 5 blocos com a contagem de cada área (2 por área nas estações de teste)
    const blocks = screen.getByRole("group", { name: "Resumo por área" });
    const labels = within(blocks).getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual([
      "2Clínica Médica",
      "2Cirurgia Geral",
      "2Ginecologia e Obstetrícia",
      "2Pediatria",
      "2Medicina de Família e Comunidade",
    ]);

    // bloco liga e desliga o filtro
    fireEvent.click(within(blocks).getByRole("button", { name: /Cirurgia Geral/ }));
    expect(within(blocks).getByRole("button", { name: /Cirurgia Geral/ }).getAttribute("aria-pressed")).toBe("true");
    expect(cardTitles().sort()).toEqual(["Apendicite aguda", "Trauma: fratura exposta de tíbia"]);
    fireEvent.click(within(blocks).getByRole("button", { name: /Cirurgia Geral/ }));
    expect(cardTitles()).toHaveLength(10);

    // a aba de área faz o mesmo e a contagem da aba "Todas" é o total
    const tabs = screen.getByRole("group", { name: "Área" });
    expect(within(tabs).getByRole("button", { name: /Todas/ }).textContent).toBe("Todas10");
    fireEvent.click(within(tabs).getByRole("button", { name: /Pediatria/ }));
    expect(cardTitles().sort()).toEqual(["Coqueluche no lactente", "Crise álgica na anemia falciforme"]);
    fireEvent.click(within(tabs).getByRole("button", { name: /Todas/ }));

    // busca por tema (nome), sem diferenciar acento nem maiúscula
    fireEvent.change(search, { target: { value: "APENDICITE" } });
    expect(cardTitles()).toEqual(["Apendicite aguda"]);
    fireEvent.change(search, { target: { value: "clinica" } }); // não está no nome: a área não entra na busca
    expect(screen.getByText("Nenhuma estação encontrada")).toBeTruthy();

    // busca por pílula (queixa)
    fireEvent.change(search, { target: { value: "puerperio" } });
    expect(cardTitles()).toEqual(["Lipotimia no puerpério"]);
    fireEvent.change(search, { target: { value: "febre" } });
    expect(cardTitles().sort()).toEqual([
      "Apendicite aguda",
      "Coqueluche no lactente",
      "Leucemia aguda: palpação de fígado e baço",
      "Pneumonia adquirida na comunidade",
    ]);

    // vazio: mensagem do protótipo e "Limpar filtros" limpa busca e área
    fireEvent.change(search, { target: { value: "zzzz" } });
    fireEvent.click(within(blocks).getByRole("button", { name: /Pediatria/ }));
    expect(screen.getByText("Nenhuma estação encontrada")).toBeTruthy();
    expect(screen.getByText("Tente outro termo ou limpe o filtro de área.")).toBeTruthy();
    expect(screen.queryAllByRole("heading", { level: 3 }).filter((h) => h.className.includes("osce-station"))).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(search.value).toBe("");
    expect(cardTitles()).toHaveLength(10);
    expect(within(blocks).getByRole("button", { name: /Pediatria/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("frase de apoio na primeira linha, busca com o texto do protótipo e sem título repetido", async () => {
    setup();
    await ready();
    expect(screen.getByText("Escolha uma estação para treinar em dupla. Cada uma traz o enunciado, os impressos e o checklist PEP.")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull(); // o título fica no cabeçalho do app
  });
});

describe("Banco de estações: ordem, visualização e agrupamento", () => {
  it("A–Z, Grade/Lista e agrupamento por área na ordem da prova", async () => {
    setup();
    await ready();

    // Todas + Ordem da prova: um bloco por área, na ordem das áreas, e dentro de cada um a ordem do servidor
    const sections = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(sections).toEqual(["Clínica Médica2", "Cirurgia Geral2", "Ginecologia e Obstetrícia2", "Pediatria2", "Medicina de Família e Comunidade2"]);
    expect(cardTitles()).toEqual([
      "Leucemia aguda: palpação de fígado e baço", // 1 CM
      "Pneumonia adquirida na comunidade", // 6 CM
      "Trauma: fratura exposta de tíbia", // 2 CR
      "Apendicite aguda", // 7 CR
      "Sangramento uterino anormal", // 4 GO
      "Lipotimia no puerpério", // 9 GO
      "Coqueluche no lactente", // 3 PED
      "Crise álgica na anemia falciforme", // 8 PED
      "Tuberculose: transferência de cuidado e TDO", // 5 MFC
      "Adolescente em situação de violência", // 10 MFC
    ]);

    // A–Z: lista única, sem os blocos por área
    const order = screen.getByRole("radiogroup", { name: "Ordenar" });
    expect(within(order).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Ordem da prova", "A–Z"]);
    fireEvent.click(within(order).getByRole("radio", { name: "A–Z" }));
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    const az = cardTitles();
    expect(az).toEqual([...az].sort((a, b) => String(a).localeCompare(String(b), "pt-BR")));
    expect(az[0]).toBe("Adolescente em situação de violência");

    // com um filtro de área, mesmo na ordem da prova, sem blocos por área
    fireEvent.click(within(order).getByRole("radio", { name: "Ordem da prova" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Área" })).getByRole("button", { name: /Cirurgia Geral/ }));
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(cardTitles()).toEqual(["Trauma: fratura exposta de tíbia", "Apendicite aguda"]);
    fireEvent.click(within(screen.getByRole("group", { name: "Área" })).getByRole("button", { name: /Todas/ }));

    // Lista: uma linha por estação, com "Última nota" e "Média geral", sem cartões
    const view = screen.getByRole("radiogroup", { name: "Visualização" });
    expect(within(view).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Grade", "Lista"]);
    fireEvent.click(within(view).getByRole("radio", { name: "Lista" }));
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    const rows = screen.getAllByRole("button").filter((b) => b.textContent?.includes("Sua última nota"));
    expect(rows).toHaveLength(10);
    expect(within(rows[0]).getByText("Média geral")).toBeTruthy();
    expect(rows[0].textContent).toContain("Leucemia aguda: palpação de fígado e baço");
    fireEvent.click(within(view).getByRole("radio", { name: "Grade" }));
    expect(cardTitles()).toHaveLength(10);
  });

  it("estação de área desconhecida não some no agrupamento", async () => {
    const rows = bankRows();
    rows[2] = { ...rows[2], area: "Outra área", area_code: "XX" };
    setup(rows);
    await ready();
    expect(cardTitles()).toHaveLength(10);
    expect(cardTitles()).toContain(rows[2].name);
  });
});

describe("Banco de estações: clique", () => {
  it("clique abre o Praticar com a estação", async () => {
    const { go } = setup();
    await ready();
    fireEvent.click(cardOf("Coqueluche no lactente"));
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith("dupla", { estacao: ID(3) });

    // também na lista
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Visualização" })).getByRole("radio", { name: "Lista" }));
    const row = screen.getAllByRole("button").find((b) => b.textContent?.includes("Apendicite aguda"))!;
    fireEvent.click(row);
    expect(go).toHaveBeenLastCalledWith("dupla", { estacao: ID(7) });
  });
});

describe("Banco de estações: nada inventado", () => {
  it("sem Simulado de prova e, sem grau gravado, sem Dificuldade nem número inventado", async () => {
    const { container } = setup();
    await ready();
    const visible = container.cloneNode(true) as HTMLElement;
    visible.querySelectorAll("style").forEach((el) => el.remove()); // o CSS da tela também tem "%"
    const text = visible.textContent ?? "";
    expect(screen.queryByText(/Simulado de prova/i)).toBeNull();
    expect(screen.queryByText(/Dificuldade/i)).toBeNull();
    expect(screen.queryByText(/F[áa]cil|M[ée]dio|Dif[íi]cil/)).toBeNull();
    expect(screen.queryByRole("radio", { name: /Dificuldade/i })).toBeNull();
    // sem nenhuma nota gravada, nenhuma porcentagem aparece (nada de "72%" do protótipo)
    expect(text).not.toMatch(/\d\s*%/);
    expect(container.querySelectorAll(".osce-station__bar")).toHaveLength(0);
    expect(container.querySelectorAll('[title="Já realizada"]')).toHaveLength(0);
    // nada do protótipo
    expect(text).not.toMatch(/54,9|61,4|PEP 7,8|14 feitas/);
  });

  it("banco vazio: diz que não há estação, sem oferecer 'Limpar filtros'", async () => {
    setup([]);
    await ready();
    expect(screen.getByText("Nenhuma estação encontrada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("erro de carregamento mostra o aviso e tenta de novo", async () => {
    let calls = 0;
    state.rpc = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("Não foi possível carregar as estações.");
      return bankRows();
    });
    render(<StationsScreen go={vi.fn()} />);
    expect(screen.getByText("Carregando…")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));
    await ready();
    await waitFor(() => expect(cardTitles()).toHaveLength(10));
  });
});

describe("StationsScreen.jsx: regras do módulo", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../novo/app/dupla/StationsScreen.jsx"), "utf8");
  it("sem cor hexadecimal, sem lucide-react, sem IA e sem dados do protótipo", () => {
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/rgba?\(/);
    expect(source).not.toMatch(/lucide-react/);
    expect(source).not.toMatch(/server\/ai|maestro/);
    expect(source).not.toMatch(/SZ_INEP2020|localStorage|sz-scores/);
  });
});
