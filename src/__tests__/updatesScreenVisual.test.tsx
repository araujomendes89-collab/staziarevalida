/**
 * Atualizações, visual de 14/10/2026 (prévia aprovada pelo dono): filtro de área em botões coloridos, busca, selo "Novo",
 * fonte e data no cartão, abas do detalhe (clique e teclado), linha do tempo em ordem, miniquiz dos flashcards,
 * "Marcar como lida" com progresso guardado só neste navegador, e flashcards na cor do Grande Tema (slug ...-gr-0XX)
 * ou da área quando não há tema. Nenhum código de cor aparece na tela.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { profile: { name: "Ana" } }, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { UpdatesScreen } from "../novo/app/study/UpdatesScreen.jsx";
import { atualizacaoVars, temaDaAtualizacao } from "../novo/app/study/temaCores.js";

const ANO = new Date().getFullYear();
const ASMA = {
  id: "1", slug: "atual-2026-10-14-gr-016", area: "CLINICA_MEDICA", topic: "Asma no adulto", subtopic: "Pneumologia", years: [ANO], priority: 1,
  publication_label: "24/03/2026 (Portaria de teste)", institution: "Ministério da Saúde (teste)", document_title: "PCDT de teste", source_url: "https://www.gov.br/teste",
  before_text: "Texto antigo da asma.", current_conduct: "1. Primeiro passo.\n2. Segundo passo.", reviewed: true, reviewed_at: "2026-10-06T12:00:00Z", published: true,
};
const ATLS = { ...ASMA, id: "2", slug: "atual-2026-10-14-atls-11", area: "CIRURGIA_GERAL", topic: "ATLS 11ª edição", subtopic: "Trauma", years: [2020], priority: 2, institution: "ACS (teste)", publication_label: "2025" };
const DETALHE = {
  timeline: [{ year: 2025, text: "Evento de 2025." }, { year: 2023, text: "Evento de 2023." }], clinical_impact: "Impacto de teste.", exam_impact: "Cai assim na prova.", trap: "Armadilha de teste.",
  flashcards: [{ front: "Pergunta 1?", back: "Resposta 1" }, { front: "Pergunta 2?", back: "Resposta 2" }], practice_questions: [], questions_count: 0,
};
let list: any;

beforeEach(() => {
  window.localStorage.clear();
  list = { total: 2, by_area: { CLINICA_MEDICA: 1, CIRURGIA_GERAL: 1 }, years: [2020, ANO], items: [ASMA, ATLS] };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_guideline_updates") {
      const items = list.items.filter((i: any) => (!args.p_area || i.area === args.p_area) && (!args.p_search || i.topic.toLowerCase().includes(args.p_search.toLowerCase())));
      return { ...list, items };
    }
    if (fn === "app_guideline_update") return { ...list.items.find((i: any) => i.slug === args.p_slug), ...DETALHE };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

const abrir = async (topic: string) => {
  fireEvent.click((await screen.findAllByRole("button", { name: new RegExp(`Ver o que mudou: ${topic}`) }))[0]);
  return screen.findByRole("heading", { name: topic });
};

describe("cores do tema", () => {
  it("slug com gr-0XX liga ao Grande Tema; sem tema, a cor da área", () => {
    expect(temaDaAtualizacao("atual-2026-10-14-gr-016")).toBe("GR-016");
    expect(temaDaAtualizacao("atual-2026-10-14-gr-036-queimaduras")).toBe("GR-036");
    expect(temaDaAtualizacao("atual-2026-10-14-atls-11")).toBeNull();
    expect(atualizacaoVars("atual-2026-10-14-gr-016", "CLINICA_MEDICA")["--gt-p"]).toBe("#075A49"); // GR-016
    expect(atualizacaoVars("atual-2026-10-14-atls-11", "CIRURGIA_GERAL")["--gt-p"]).toBe("#006D77"); // área Cirurgia
  });
});

describe("lista", () => {
  it("filtro de área em botões com estado, busca e contagem", async () => {
    render(<UpdatesScreen go={vi.fn()} />);
    const cm = await screen.findByRole("button", { name: /Clínica Médica/ });
    expect(cm.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(cm);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_guideline_updates", { p_area: "CLINICA_MEDICA", p_year: null, p_search: null }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Clínica Médica/ }).getAttribute("aria-pressed")).toBe("true"));
    expect(await screen.findByText(/Exibindo 1 de 2/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ver o que mudou: ATLS/ })).toBeNull();
    // clicar de novo na mesma área volta para todas
    fireEvent.click(screen.getByRole("button", { name: /Clínica Médica/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Todas as áreas/ }).getAttribute("aria-pressed")).toBe("true"));
    fireEvent.change(screen.getByLabelText("Buscar atualização"), { target: { value: "atls" } });
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_guideline_updates", { p_area: null, p_year: null, p_search: "atls" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Ver o que mudou: Asma/ })).toBeNull());
  });

  it("cartão: selo Novo só na mudança deste ano, instituição e data da fonte à vista, sem código de cor", async () => {
    render(<UpdatesScreen go={vi.fn()} />);
    const asma = (await screen.findAllByRole("button", { name: /Ver o que mudou: Asma no adulto/ })).at(-1)!;
    expect(within(asma).getByText("Novo")).toBeTruthy();
    expect(within(asma).getByText("Ministério da Saúde (teste)")).toBeTruthy();
    expect(within(asma).getByText("24/03/2026 (Portaria de teste)")).toBeTruthy();
    const atls = screen.getByRole("button", { name: /Ver o que mudou: ATLS/ });
    expect(within(atls).queryByText("Novo")).toBeNull();
    expect((asma as HTMLElement).style.getPropertyValue("--gt-p")).toBe("#087A63"); // faixa na cor da área
    expect(document.body.textContent).not.toMatch(/#[0-9A-F]{6}/i);
  });
});

describe("detalhe", () => {
  it("abas por clique e teclado, linha do tempo em ordem, armadilha em alerta e o que a prova cobra em destaque", async () => {
    render(<UpdatesScreen go={vi.fn()} />);
    await abrir("Asma no adulto");
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["O que mudou", "Conduta e impacto", "O que a prova cobra", "Armadilha", "Linha do tempo", "Flashcards", "Miniquiz"]);
    expect(screen.getByRole("tab", { name: "O que mudou" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("at-tab-mudou");
    // lista numerada da conduta vira <ol>
    expect(screen.getByText("Primeiro passo.").closest("ol")).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("tab", { name: "O que mudou" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Conduta e impacto" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Conduta e impacto" }));
    expect(screen.getByText("Impacto de teste.")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Conduta e impacto" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Miniquiz" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Miniquiz" }), { key: "ArrowRight" }); // dá a volta
    expect(screen.getByRole("tab", { name: "O que mudou" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "O que a prova cobra" }));
    expect(screen.getByText("O que lembrar para o Revalida")).toBeTruthy();
    expect(screen.getByText("Cai assim na prova.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Armadilha" }));
    expect(within(screen.getByRole("note", { name: "Pegadinha da banca" })).getByText("Armadilha de teste.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Linha do tempo" }));
    const anos = within(screen.getByRole("list", { name: "Transição" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(anos).toEqual(["2023Evento de 2023.", "2025Evento de 2025."]);
  });

  it("flashcards na cor do Grande Tema, viram e avançam; sem tema usam a cor da área", async () => {
    render(<UpdatesScreen go={vi.fn()} />);
    await abrir("Asma no adulto");
    fireEvent.click(screen.getByRole("tab", { name: "Flashcards" }));
    const card = screen.getByRole("button", { name: "Mostrar resposta" });
    expect(card.classList.contains("sm-flash--tema")).toBe(true);
    expect(card.style.getPropertyValue("--gt-p")).toBe("#075A49"); // GR-016
    fireEvent.click(card);
    expect(screen.getByRole("button", { name: "Mostrar pergunta" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Próximo/ }));
    expect(screen.getByText("Pergunta 2?")).toBeTruthy();
    expect(screen.getByText("2 de 2")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/#[0-9A-F]{6}|GR-\d{3}/i);
    cleanup();

    render(<UpdatesScreen go={vi.fn()} />);
    await abrir("ATLS 11ª edição");
    fireEvent.click(screen.getByRole("tab", { name: "Flashcards" }));
    expect(screen.getByRole("button", { name: "Mostrar resposta" }).style.getPropertyValue("--gt-p")).toBe("#006D77"); // área Cirurgia
  });

  it("miniquiz dos flashcards: certo e errado com retorno e placar", async () => {
    render(<UpdatesScreen go={vi.fn()} />);
    await abrir("Asma no adulto");
    fireEvent.click(screen.getByRole("tab", { name: "Miniquiz" }));
    const q1 = screen.getByRole("group", { name: "Pergunta 1 de 2" });
    fireEvent.click(within(q1).getByRole("button", { name: "Resposta 1" }));
    expect(within(q1).getByText("Certo!")).toBeTruthy();
    const q2 = screen.getByRole("group", { name: "Pergunta 2 de 2" });
    fireEvent.click(within(q2).getByRole("button", { name: "Resposta 1" }));
    expect(within(q2).getByText(/Não é essa/)).toBeTruthy();
    expect(screen.getByText("Você acertou 1 de 2")).toBeTruthy();
  });
});

describe("marcar como lida", () => {
  it("marca no detalhe, aparece no cartão e no progresso, fica guardado no navegador e desmarca", async () => {
    render(<UpdatesScreen go={vi.fn()} />);
    expect(await screen.findByText("0 de 2 lidas")).toBeTruthy();
    expect(screen.getByText("Fica salvo só neste aparelho e navegador.")).toBeTruthy();
    await abrir("Asma no adulto");
    const marcar = screen.getByRole("button", { name: "Marcar como lida" });
    expect(marcar.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(marcar);
    expect(screen.getAllByRole("button", { name: "Lida · desmarcar" })[0].getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(window.localStorage.getItem("sm-atualizacoes-lidas:u1")!)).toHaveProperty("atual-2026-10-14-gr-016");

    fireEvent.click(screen.getByRole("button", { name: /Voltar para as atualizações/ }));
    expect(await screen.findByText("1 de 2 lidas")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Seu progresso" }).getAttribute("aria-valuenow")).toBe("1");
    const lida = screen.getAllByRole("button", { name: /Ver o que mudou: Asma no adulto \(lida\)/ }).at(-1)!;
    expect(within(lida).getByText("Lida")).toBeTruthy();

    // depois de recarregar a tela continua lida; desmarcar volta a zero
    cleanup();
    render(<UpdatesScreen go={vi.fn()} />);
    expect(await screen.findByText("1 de 2 lidas")).toBeTruthy();
    await abrir("Asma no adulto");
    fireEvent.click(screen.getAllByRole("button", { name: "Lida · desmarcar" })[0]);
    expect(screen.getByRole("button", { name: "Marcar como lida" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Voltar para as atualizações/ }));
    expect(await screen.findByText("0 de 2 lidas")).toBeTruthy();
  });

  it("navegador sem armazenamento: a tela funciona e marca só nesta visita", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    render(<UpdatesScreen go={vi.fn()} />);
    await abrir("Asma no adulto");
    fireEvent.click(screen.getByRole("button", { name: "Marcar como lida" }));
    expect(screen.getAllByRole("button", { name: "Lida · desmarcar" }).length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
