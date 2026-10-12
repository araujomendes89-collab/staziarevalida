/**
 * Fontes oficiais, atualidade — telas (jsdom, banco e servidor simulados, nenhuma IA nem internet reais):
 *  - o botão "Buscar fontes com IA" nas abas (assistente de Questões e de Atualizações, Editar atualização do app anterior,
 *    Análise de questões e busca de trechos): custo estimado, aviso "só entra depois que você aprovar", andamento, busca repetida,
 *    SQL antigo, quem só vê o aviso;
 *  - a tela de candidatos: selo de atualidade, datas comprovadas, versão mais antiga com confirmação explícita.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const who = vi.hoisted(() => ({ role: "admin" }));
const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: who.role, profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { SearchSourcesButton, sourceSearchContext, OPEN_CONTEXT, isMissingFunction, friendlyError, AVERAGE_COST_USD, OLD_SQL, GENERIC_ERROR } from "../novo/app/admin/assistant/SearchSourcesButton.jsx";
import { TabAssistant } from "../novo/app/admin/assistant/TabAssistant.jsx";
import { AdminUpdates } from "../novo/app/admin/AdminUpdates.jsx";
import { SourceCandidates } from "../novo/app/admin/content/SourceCandidates.jsx";
import { ClaimCard } from "../novo/app/admin/content/ui.jsx";
import { QuestionAnalyses } from "../novo/app/admin/content/QuestionAnalyses.jsx";
import { QUESTOES_SPEC } from "../shared/adminAssistant/questoes";
import { ATUALIZACOES_SPEC } from "../shared/adminAssistant/atualizacoes";

// os componentes são JSX sem tipos: aqui todas as propriedades são opcionais
const Tab: any = TabAssistant;
const Claim: any = ClaimCard;
const Candidates: any = SourceCandidates;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers({ "content-type": "application/json" }) });
const STATUS = { ready: true, problems: [], warnings: [], max_searches: 5, provider: "anthropic", model: "claude-opus-5-5", per_search_usd: 0.01 };
const EMPTY_CHECK = { recent: [], waiting: 0, search: null };

let status: any;
let checks: ((args: any) => any)[]; // respostas de app_ch_source_search_check, na ordem (a última se repete)
let startResult: any;
let fetchCalls: { url: string; method: string; body: any }[];
let fetchHandlers: Record<string, (body: any) => any>;
const rpcCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);

beforeEach(() => {
  who.role = "admin";
  status = STATUS;
  checks = [() => EMPTY_CHECK];
  startResult = { searches: [{ id: "s9", theme: "Bronquiolite", duplicate: false }] };
  fetchCalls = [];
  fetchHandlers = {};
  backend.rpc.mockReset();
  let n = 0;
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_ch_source_search_check") {
      const f = checks[Math.min(n, checks.length - 1)];
      n += 1;
      const r = f(args);
      if (r instanceof Error) throw r;
      return r;
    }
    if (fn === "app_ch_source_search_start") return startResult;
    throw new Error(`rpc não simulada: ${fn}`);
  });
  (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) => {
    const method = init.method ?? "GET";
    const body = init.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    fetchCalls.push({ url, method, body });
    const h = fetchHandlers[`${method} ${url}`];
    if (h) return h(body);
    if (url === "/api/content-hub/source-search/status") return json(status);
    throw new Error(`fetch não simulado: ${url}`);
  });
  window.confirm = vi.fn(() => true);
});
afterEach(cleanup);

const ctx = { area: "PEDIATRIA", theme: "Bronquiolite", freeText: null };
const buy = () => screen.findByRole("button", { name: "Buscar fontes com IA" });
const search = (over: Record<string, unknown> = {}) => ({ id: "s9", status: "na_fila", message: null, found_count: 0, verified_count: 0, discarded_count: 0, job_status: "queued", ...over });

describe("contexto do item aberto", () => {
  it("Questões: área e tema (ou subtema); Atualizações: tema, subtema e instituição; área fora da lista não vai", () => {
    expect(sourceSearchContext("questoes", { area: "PEDIATRIA", topic: " Bronquiolite ", subtopic: "Tratamento" })).toEqual({ area: "PEDIATRIA", theme: "Bronquiolite", freeText: "Subtema: Tratamento" });
    expect(sourceSearchContext("questoes", { area: "PEDIATRIA", topic: "", subtopic: "Só subtema" })).toEqual({ area: "PEDIATRIA", theme: "Só subtema", freeText: null });
    expect(sourceSearchContext("atualizacoes", { area: "GINECOLOGIA_OBSTETRICIA", topic: "Pré-eclâmpsia", subtopic: "AAS", institution: "Ministério da Saúde" })).toEqual({
      area: "GINECOLOGIA_OBSTETRICIA", theme: "Pré-eclâmpsia", freeText: "Subtema: AAS. Instituição: Ministério da Saúde",
    });
    expect(sourceSearchContext("questoes", { area: "Outra coisa", topic: "X" }).area).toBeNull();
    expect(sourceSearchContext("questoes", {})).toEqual({ area: null, theme: "", freeText: null });
    expect(sourceSearchContext("atualizacoes", { topic: "x".repeat(500), subtopic: "y".repeat(500), institution: "z".repeat(500) }).freeText!.length).toBeLessThanOrEqual(300);
  });
  it("reconhece a função ausente do banco", () => {
    expect(isMissingFunction(new Error("Could not find the function public.app_ch_source_search_check(p_area, p_theme) in the schema cache"))).toBe(true);
    expect(isMissingFunction(new Error("function public.x() does not exist"))).toBe(true);
    expect(isMissingFunction(new Error("Somente administradores."))).toBe(false);
  });
});

describe("textos para o dono (revisão independente 1, achado 8)", () => {
  it("erro cru vira aviso em português; mensagem em português do sistema passa", () => {
    expect(friendlyError(new Error("Could not find the function public.x in the schema cache"))).toBe(OLD_SQL);
    expect(friendlyError(new Error("Failed to fetch"))).toBe("Sem conexão com o servidor agora. Confira a internet e tente de novo.");
    expect(friendlyError(new Error("permission denied for function app_ch_source_search_start"))).toBe("Você não tem permissão para pedir esta busca.");
    expect(friendlyError(new Error('insert or update on table "ch_source_searches" violates foreign key constraint'))).toBe(GENERIC_ERROR);
    expect(friendlyError(new Error("TypeError: Cannot read properties of undefined"))).toBe(GENERIC_ERROR);
    expect(friendlyError(new Error("Something unexpected happened"))).toBe(GENERIC_ERROR);
    expect(friendlyError(new Error(""))).toBe(GENERIC_ERROR);
    expect(friendlyError(new Error("Somente administradores."))).toBe("Somente administradores.");
    expect(friendlyError(new Error("Teto de gasto atingido."))).toBe("Teto de gasto atingido.");
    expect(GENERIC_ERROR).not.toMatch(/SQL|Supabase|migra/i);
  });
  it("erro cru ao pedir a busca não aparece na tela", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_ch_source_search_check") return EMPTY_CHECK;
      throw new Error('insert or update on table "ch_source_searches" violates foreign key constraint "x"');
    });
    render(<SearchSourcesButton tab="questoes" context={ctx} />);
    fireEvent.click(await buy());
    expect(await screen.findByText(GENERIC_ERROR)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/violates|ch_source_searches/);
  });
  it("mensagem da busca com erro cru também é traduzida", async () => {
    checks = [() => EMPTY_CHECK, () => ({ ...EMPTY_CHECK, search: search({ status: "falhou", message: "TypeError: fetch failed" }) })];
    render(<SearchSourcesButton tab="questoes" context={ctx} pollMs={5} />);
    fireEvent.click(await buy());
    expect(await screen.findByText(/A busca falhou: Sem conexão com o servidor agora/)).toBeTruthy();
  });
});

describe("busca parada (pendente)", () => {
  it("o acompanhamento continua mais devagar enquanto está pendente e volta ao andamento quando retoma", async () => {
    let calls = 0;
    const seq = [search({ status: "pendente", message: "Teto de gasto atingido." }), search({ status: "pendente", message: "Teto de gasto atingido." }), search({ status: "buscando" }), search({ status: "concluida", verified_count: 2, found_count: 2 })];
    checks = [() => EMPTY_CHECK, () => ({ ...EMPTY_CHECK, search: seq[Math.min(calls++, seq.length - 1)] })];
    render(<SearchSourcesButton tab="questoes" context={ctx} pollMs={20} />);
    fireEvent.click(await buy());
    expect(await screen.findByText(/A busca está parada: Teto de gasto atingido\. Ela continua quando o problema for resolvido\./)).toBeTruthy();
    // não parou: continua consultando, até retomar e concluir
    expect(await screen.findByText("A IA está buscando nos sites oficiais…", {}, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText("Concluída com 2 candidatos para você conferir.", {}, { timeout: 3000 })).toBeTruthy();
    expect(calls).toBeGreaterThanOrEqual(4);
  });
  it("pendente é consultada com intervalo maior que o do andamento", async () => {
    const times: number[] = [];
    checks = [() => EMPTY_CHECK, () => { times.push(Date.now()); return { ...EMPTY_CHECK, search: search({ status: "pendente", message: "Teto." }) }; }];
    render(<SearchSourcesButton tab="questoes" context={ctx} pollMs={30} />);
    fireEvent.click(await buy());
    await waitFor(() => expect(times.length).toBeGreaterThanOrEqual(3), { timeout: 3000 });
    const gap = times[2] - times[1];
    expect(gap).toBeGreaterThanOrEqual(70); // 3 x 30 ms (com folga de relógio)
  });
});

describe("botão Buscar fontes com IA", () => {
  it("mostra o custo estimado (cerca de US$ 0,40, preço por busca da tabela), o aviso da aprovação e pede a busca de um tema", async () => {
    render(<SearchSourcesButton tab="questoes" context={ctx} pollMs={5} />);
    expect(screen.getByText("Tema da busca: Bronquiolite")).toBeTruthy();
    expect(await screen.findByText(/Custo estimado: cerca de US\$ 0,40 por tema/)).toBeTruthy();
    expect(AVERAGE_COST_USD).toBe(0.4);
    expect(screen.getByText(/Inclui até 5 buscas na internet a US\$ 0,01 cada \(preço atual da tabela de preços\) e o uso do modelo Claude claude-opus-5-5\./)).toBeTruthy();
    expect(screen.getByText(/Só entra na biblioteca depois que você aprovar na aba Fontes\./)).toBeTruthy();
    fireEvent.click(await buy());
    await waitFor(() => expect(rpcCalls("app_ch_source_search_start")).toHaveLength(1));
    expect(rpcCalls("app_ch_source_search_check")[0][1]).toEqual({ p_area: "PEDIATRIA", p_theme: "Bronquiolite" });
    expect(rpcCalls("app_ch_source_search_start")[0][1]).toEqual({ p_request: { area: "PEDIATRIA", theme: "Bronquiolite", top_themes: null, free_text: null } });
    // nada de fila nova: só a função que a tela Fontes já usa
    expect(backend.rpc.mock.calls.map((c: any[]) => c[0]).filter((f: string) => f !== "app_ch_source_search_check")).toEqual(["app_ch_source_search_start"]);
  });

  it("mostra o andamento: na fila, buscando, conferindo e concluída com N candidatos e o atalho Ver candidatos", async () => {
    checks = [
      () => EMPTY_CHECK,
      () => ({ ...EMPTY_CHECK, search: search({ status: "na_fila" }) }),
      () => ({ ...EMPTY_CHECK, search: search({ status: "buscando", job_status: "running" }) }),
      () => ({ ...EMPTY_CHECK, search: search({ status: "conferindo", found_count: 4 }) }),
      () => ({ ...EMPTY_CHECK, search: search({ status: "concluida", found_count: 4, verified_count: 3, discarded_count: 1 }) }),
    ];
    render(<SearchSourcesButton tab="questoes" context={ctx} pollMs={30} />);
    fireEvent.click(await buy());
    expect(await screen.findByText(/Na fila: a busca começa em instantes/)).toBeTruthy();
    expect(await screen.findByText("A IA está buscando nos sites oficiais…")).toBeTruthy();
    expect(await screen.findByText(/Conferindo os documentos achados/)).toBeTruthy();
    expect(await screen.findByText("Concluída com 3 candidatos para você conferir.")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Ver candidatos" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toMatch(/\?aba=conteudo&secao=fontes$/);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    // a busca terminou: o acompanhamento para
    const seen = rpcCalls("app_ch_source_search_check").length;
    await new Promise((r) => setTimeout(r, 120));
    expect(rpcCalls("app_ch_source_search_check").length).toBe(seen);
    expect(rpcCalls("app_ch_source_search_check").at(-1)![1]).toMatchObject({ p_search_id: "s9" });
  });

  it("nada encontrado, falhou (com o motivo em português) e parada", async () => {
    for (const [s, text] of [
      [{ status: "nada_encontrado", message: "A IA não encontrou documentos oficiais para este pedido." }, /Nada encontrado nos sites oficiais\. A IA não encontrou documentos oficiais/],
      [{ status: "falhou", message: "A IA não respondeu." }, /A busca falhou: A IA não respondeu\./],
      [{ status: "falhou", message: null }, /A busca falhou\./],
      [{ status: "pendente", message: "Teto de gasto atingido." }, /A busca está parada: Teto de gasto atingido\. Ela continua quando o problema for resolvido\./],
      [{ status: "concluida", verified_count: 0, discarded_count: 2, found_count: 2 }, /Concluída, mas nenhum achado passou na conferência \(2 descartados\)\./],
    ] as const) {
      cleanup();
      checks = [() => EMPTY_CHECK, () => ({ ...EMPTY_CHECK, search: search(s) })];
      render(<SearchSourcesButton tab="questoes" context={ctx} pollMs={5} />);
      fireEvent.click(await buy());
      expect(await screen.findByText(text)).toBeTruthy();
    }
  });

  it("busca do mesmo tema nos últimos 7 dias ou candidatos aguardando: avisa e só repete com 'Buscar de novo mesmo assim'", async () => {
    checks = [() => ({ recent: [{ id: "s1", status: "concluida", created_at: "2026-10-10T15:00:00Z", found_count: 3, verified_count: 2 }], waiting: 2, search: null }), () => ({ ...EMPTY_CHECK, search: search({ status: "buscando" }) })];
    render(<SearchSourcesButton tab="atualizacoes" context={ctx} pollMs={5} />);
    fireEvent.click(await buy());
    expect(await screen.findByText("Este tema já foi buscado")).toBeTruthy();
    expect(screen.getByText(/Busca de 10\/10\/2026: Concluída, 2 candidatos\./)).toBeTruthy();
    expect(screen.getByText("2 candidatos aguardam a sua conferência na aba Fontes.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver candidatos" })).toBeTruthy();
    expect(rpcCalls("app_ch_source_search_start")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Buscar fontes com IA" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Buscar de novo mesmo assim" }));
    await waitFor(() => expect(rpcCalls("app_ch_source_search_start")).toHaveLength(1));
    expect(await screen.findByText("A IA está buscando nos sites oficiais…")).toBeTruthy();
  });

  it("'Não buscar' desfaz o aviso sem pedir nada", async () => {
    checks = [() => ({ recent: [], waiting: 1, search: null })];
    render(<SearchSourcesButton tab="questoes" context={ctx} />);
    fireEvent.click(await buy());
    expect(await screen.findByText("1 candidato aguarda a sua conferência na aba Fontes.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Não buscar" }));
    expect(await buy()).toBeTruthy();
    expect(rpcCalls("app_ch_source_search_start")).toHaveLength(0);
  });

  it("busca igual já na fila: avisa e acompanha a mesma", async () => {
    startResult = { searches: [{ id: "s1", theme: "Bronquiolite", duplicate: true }] };
    checks = [() => EMPTY_CHECK, () => ({ ...EMPTY_CHECK, search: search({ id: "s1", status: "buscando" }) })];
    render(<SearchSourcesButton tab="questoes" context={ctx} pollMs={5} />);
    fireEvent.click(await buy());
    expect(await screen.findByText("Já havia uma busca igual na fila; acompanhando a mesma.")).toBeTruthy();
    expect(await screen.findByText("A IA está buscando nos sites oficiais…")).toBeTruthy();
  });

  it("site novo com SQL antigo: aviso em português, sem o erro cru e sem pedir busca", async () => {
    checks = [() => new Error('Could not find the function public.app_ch_source_search_check(p_area, p_theme) in the schema cache')];
    render(<SearchSourcesButton tab="questoes" context={ctx} />);
    fireEvent.click(await buy());
    expect(await screen.findByText(OLD_SQL)).toBeTruthy();
    expect(OLD_SQL).toMatch(/aguardando uma atualização.*Avise quem cuida do sistema/);
    // o dono não lê SQL, migração, Supabase nem erro cru
    expect(OLD_SQL).not.toMatch(/SQL|migra|Supabase|9820|colar/i);
    expect(document.body.textContent).not.toMatch(/schema cache|Could not find|Supabase|migração|SQL/);
    expect(rpcCalls("app_ch_source_search_start")).toHaveLength(0);
  });

  it("só o administrador pede: editor, revisor e quem não é da equipe veem o aviso, sem botão e sem chamadas", async () => {
    for (const role of ["editor", "student", "reviewer"]) {
      cleanup();
      who.role = role;
      render(<SearchSourcesButton tab="questoes" context={ctx} />);
      expect(screen.getByText("Peça ao administrador para buscar fontes deste tema.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Buscar fontes com IA" })).toBeNull();
    }
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchCalls).toHaveLength(0);
    expect(backend.rpc).not.toHaveBeenCalled();
  });

  it("busca desligada: mostra os motivos e trava o botão; sem tema, pede o tema", async () => {
    status = { ...STATUS, ready: false, problems: ["Desligada: configure esta função na Central de IAs."] };
    render(<SearchSourcesButton tab="analises" context={OPEN_CONTEXT} />);
    expect(await screen.findByText("Desligada: configure esta função na Central de IAs.")).toBeTruthy();
    const b = screen.getByRole("button", { name: "Buscar fontes com IA" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    cleanup();
    render(<SearchSourcesButton tab="analises" context={OPEN_CONTEXT} />);
    await screen.findByText(/Custo estimado/);
    const button = screen.getByRole("button", { name: "Buscar fontes com IA" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); // sem tema
  });

  it("sem tema no item: o administrador escreve o tema e a busca sai com ele", async () => {
    render(<SearchSourcesButton tab="analises" context={OPEN_CONTEXT} pollMs={5} />);
    await screen.findByText(/Custo estimado/);
    fireEvent.change(screen.getByLabelText("Tema para buscar fontes"), { target: { value: "Asma" } });
    fireEvent.click(await buy());
    await waitFor(() => expect(rpcCalls("app_ch_source_search_start")).toHaveLength(1));
    expect(rpcCalls("app_ch_source_search_start")[0][1].p_request).toMatchObject({ area: null, theme: "Asma" });
  });

  it("servidor sem os campos novos do status: o custo médio aparece mesmo assim, sem inventar preço por busca", async () => {
    status = { ready: true, problems: [], warnings: [], max_searches: 5 };
    render(<SearchSourcesButton tab="questoes" context={ctx} />);
    expect(await screen.findByText(/cerca de US\$ 0,40 por tema \(média medida nas buscas feitas\)\.$/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/preço atual da tabela/);
  });
});

// ---------------------------------------------------------------- o botão em cada lugar onde falta fonte
const LINE = { ready: true, label: "Claude", model: "claude-a", pending: null };
const NO_SOURCE = (fields: string[]) => ({ mode: "preencher", suggestions: [], findings: [], missing: [], reply: null, no_source: fields, warnings: [], usage: null, source_passages: { material: 0, official: 0 } });

describe("botão em cada aba", () => {
  const assistantFetch = (tab: string, run: any) => {
    fetchHandlers[`GET /api/admin-assistant/status?tab=${tab}`] = () => json({ tab, modes: { preencher: LINE, conferir: LINE, conversar: LINE } });
    fetchHandlers["POST /api/admin-assistant/run"] = () => json(run);
  };
  it("assistente de Questões: 'Faltou fonte para este tema' traz o botão com a área e o tema da questão", async () => {
    assistantFetch("questoes", NO_SOURCE(["explanation_A", "explanation_B", "explanation_C", "explanation_D", "expected_conduct", "inep_intent"]));
    const form = { area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "", options: [] };
    render(<Tab spec={QUESTOES_SPEC} title="Assistente" form={form} onUse={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText("Faltou fonte para este tema")).toBeTruthy();
    expect(screen.getByText("Tema da busca: Bronquiolite")).toBeTruthy();
    fireEvent.click(await buy());
    await waitFor(() => expect(rpcCalls("app_ch_source_search_start")).toHaveLength(1));
    expect(rpcCalls("app_ch_source_search_start")[0][1].p_request).toEqual({ area: "PEDIATRIA", theme: "Bronquiolite", top_themes: null, free_text: null });
  });

  it("assistente de Atualizações: 'Sem fonte' por campo traz o botão com tema, subtema e instituição", async () => {
    assistantFetch("atualizacoes", NO_SOURCE(["current_conduct"]));
    const form = { area: "GINECOLOGIA_OBSTETRICIA", topic: "Pré-eclâmpsia", subtopic: "AAS", institution: "Ministério da Saúde", timeline: [], flashcards: [] };
    render(<Tab spec={ATUALIZACOES_SPEC} title="Assistente" form={form} onUse={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText(/Conduta vigente: Sem fonte: cole um trecho da diretriz ou envie o material/)).toBeTruthy();
    fireEvent.click(await buy());
    await waitFor(() => expect(rpcCalls("app_ch_source_search_start")).toHaveLength(1));
    expect(rpcCalls("app_ch_source_search_start")[0][1].p_request).toEqual({ area: "GINECOLOGIA_OBSTETRICIA", theme: "Pré-eclâmpsia", top_themes: null, free_text: "Subtema: AAS. Instituição: Ministério da Saúde" });
  });

  it("assistente: com fonte para tudo, o botão não aparece (e nenhuma chamada é feita)", async () => {
    assistantFetch("questoes", { ...NO_SOURCE([]), suggestions: [] });
    render(<Tab spec={QUESTOES_SPEC} title="Assistente" form={{ area: "PEDIATRIA", topic: "Asma", options: [] }} onUse={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    await waitFor(() => expect(fetchCalls.some((c) => c.url === "/api/admin-assistant/run")).toBe(true));
    expect(screen.queryByRole("button", { name: "Buscar fontes com IA" })).toBeNull();
    expect(fetchCalls.some((c) => c.url === "/api/content-hub/source-search/status")).toBe(false);
  });

  it("assistente para editor: o aviso 'Peça ao administrador…' no lugar do botão", async () => {
    who.role = "editor";
    assistantFetch("questoes", NO_SOURCE(["explanation_A"]));
    render(<Tab spec={QUESTOES_SPEC} title="Assistente" form={{ area: "PEDIATRIA", topic: "Asma", options: [] }} onUse={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText("Peça ao administrador para buscar fontes deste tema.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Buscar fontes com IA" })).toBeNull();
  });

  it("Editar atualização (veio do app anterior: link com erro, selo sem registro, citação que não confere): botão com o tema do item", async () => {
    const legacy = {
      id: "u1", slug: "prot-x", area: "GINECOLOGIA_OBSTETRICIA", topic: "Atualização antiga de teste", subtopic: null, years: [2025], priority: 1, publication_label: "05/2025",
      institution: "Instituição", document_title: "Documento", source_url: null, before_text: "Antes.", timeline: [{ year: 2025, text: "Mudou." }], current_conduct: "Agora.",
      clinical_impact: null, exam_impact: null, trap: null, search_terms: "teste", flashcards: [], practice_questions: [], reviewed: false, reviewed_at: null, published: false,
      review_status: "pending", review_note: null, reviewer: null, source_checked_at: null, origin: "legacy_app", position: 1, can_review: true,
      legacy: { status_label: "VALIDADO_OFICIAL_SUS", last_verification_claim: "2026-08-30", original_url: "https://site.test/antigo", original_url_check: { http_status: 404, checked_on: "2026-10-06" }, cited_questions: [] },
    };
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_guideline_updates") return { is_admin: true, review_areas: ["GINECOLOGIA_OBSTETRICIA"], items: [legacy] };
      if (fn === "app_ch_source_search_check") return EMPTY_CHECK;
      if (fn === "app_ch_source_search_start") return startResult;
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<AdminUpdates />);
    fireEvent.click(await screen.findByRole("button", { name: /Atualização antiga de teste/ }));
    expect(await screen.findByText(/dava erro 404/)).toBeTruthy();
    expect(screen.getByText(/não têm registro de quem conferiu/)).toBeTruthy();
    expect(screen.getByText("Tema da busca: Atualização antiga de teste")).toBeTruthy();
    fireEvent.click(await buy());
    await waitFor(() => expect(rpcCalls("app_ch_source_search_start")).toHaveLength(1));
    expect(rpcCalls("app_ch_source_search_start")[0][1].p_request).toMatchObject({ area: "GINECOLOGIA_OBSTETRICIA", theme: "Atualização antiga de teste", free_text: "Instituição: Instituição" });
  });
});

describe("botão nas telas da Central de Conteúdo", () => {
  it("busca de trechos sem resultado ('Cadastre a fonte oficial…'): botão com campo de tema", async () => {
    fetchHandlers["POST /api/content-hub/search"] = () => json({ mode: "palavras", results: [] });
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_ch_claim_confidence") throw new Error("não simulada");
      if (fn === "app_ch_source_search_check") return EMPTY_CHECK;
      if (fn === "app_ch_source_search_start") return startResult;
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<Claim claim={{ id: "k1", status: "pending", statement: "AAS reduz o risco.", evidence: [] }} canConfirm />);
    fireEvent.click(screen.getByRole("button", { name: "Vincular evidência" }));
    expect(screen.queryByRole("button", { name: "Buscar fontes com IA" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByText(/Nenhum trecho encontrado\. Cadastre a fonte oficial/)).toBeTruthy();
    fireEvent.change(await screen.findByLabelText("Tema para buscar fontes"), { target: { value: "AAS na pré-eclâmpsia" } });
    fireEvent.click(await buy());
    await waitFor(() => expect(rpcCalls("app_ch_source_search_start")).toHaveLength(1));
    expect(rpcCalls("app_ch_source_search_start")[0][1].p_request).toMatchObject({ theme: "AAS na pré-eclâmpsia" });
  });

  it("Análise de questões sem evidência oficial: botão junto do aviso", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_question_update_summary") return { questions_with_claims: 0, claims: 0, claims_with_official_evidence: 0, by_impact: {}, critical_open: 0, with_proposal: 0, cards_published: 0, with_content_diff: 0, cards: 0 };
      if (fn === "app_question_analyses") return { total: 0, items: [], exams: [], summary: { analyzed: 0, questions: 0, by_status: {} } };
      if (fn === "app_ch_source_search_check") return EMPTY_CHECK;
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<QuestionAnalyses reviewerAreas={[]} />);
    expect(await screen.findByText(/Sem fonte oficial cadastrada e conferida, o sistema não consegue dizer/)).toBeTruthy();
    expect(await buy()).toBeTruthy();
    expect(screen.getByLabelText("Tema para buscar fontes")).toBeTruthy();
  });
});

// ---------------------------------------------------------------- candidatos: atualidade
const CAND: any = {
  id: "c1", search_id: "s1", status: "aguardando", site_address: "gov.br/saude", site_kind: "governo", site_institution: "Ministério da Saúde",
  requested_url: "https://www.gov.br/saude/pedido.pdf", final_url: "https://www.gov.br/saude/final.pdf",
  ai_title: "PCDT de teste", ai_institution: "Ministério da Saúde", ai_published: "2024-05-10", ai_valid_until: null, ai_nature: "PCDT", ai_kind: "final", ai_level: "A",
  ai_reason: "Documento oficial vigente do tema.", file_title: "Protocolo de teste", file_date: null,
  quote: "Trecho de teste copiado do documento.", quote_page: 12, seen_in_search: true, file_kind: "pdf", sha256: "abcdef0123456789abcdef0123456789",
  size_bytes: 2621440, page_count: 48, preview: "Texto.", suggested_level: "A", suggested_kind: "final", suggested_nature: "PCDT",
  edited: {}, created_at: "2026-10-10T15:05:00Z", decision_reason: null, source_id: null, document_id: null,
  search: { theme: "Bronquiolite", area: "PEDIATRIA", created_at: "2026-10-10T15:00:00Z", provider: "anthropic", model: "claude-a" }, replaces: null,
  currency: null, currency_date: null, currency_info: {},
};
const LIB = { id: "L1", title: "PCDT de teste", version: "2019", published_on: "2019-03-01" };

function showCandidates(items: any[]) {
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_ch_source_candidates") return { items, counts: { aguardando: items.length, aprovado: 0, rejeitado: 0 } };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  render(<Candidates />);
}
const card = (id = "c1") => screen.findByTestId(`candidate-${id}`);
const readyToApprove = (c: HTMLElement) => fireEvent.click(within(c).getByLabelText("Conferi o documento no arquivo guardado"));
const approved = () => fetchCalls.filter((x) => x.url === "/api/content-hub/source-candidates/c1/approve");

describe("candidatos: selo de atualidade e datas comprovadas", () => {
  it("cada estado tem o seu selo em português; sem estado: 'Atualidade não avaliada'", async () => {
    showCandidates([
      { ...CAND, id: "c1", currency: "versao_mais_nova", currency_date: "2025-03-14", currency_info: { basis: "texto", note: "Mais nova que a fonte vigente.", library: LIB }, replaces: LIB },
      { ...CAND, id: "c2", currency: "mesma_versao", currency_date: "2019-03-01", currency_info: { basis: "texto" } },
      { ...CAND, id: "c3", currency: "data_nao_comprovada", currency_info: { notes: ["A data dita pela IA (14/03/2025) não aparece no documento."] } },
      { ...CAND, id: "c4", currency: "sem_comparacao", currency_date: "2023-02-20", currency_info: { basis: "pagina" } },
      { ...CAND, id: "c5" },
    ]);
    expect(within(await card("c1")).getByText("Versão mais nova que a da biblioteca")).toBeTruthy();
    expect(within(await card("c2")).getByText("Mesma versão da biblioteca")).toBeTruthy();
    expect(within(await card("c3")).getByText("Data não comprovada")).toBeTruthy();
    expect(within(await card("c3")).getByText("A data dita pela IA (14/03/2025) não aparece no documento.")).toBeTruthy();
    expect(within(await card("c4")).getByText("Documento novo na biblioteca")).toBeTruthy();
    expect(within(await card("c5")).getByText("Atualidade não avaliada")).toBeTruthy();
    // datas: comprovada (com a base), vigência da IA
    expect(within(await card("c1")).getByText("14/03/2025 (comprovada no texto do documento)")).toBeTruthy();
    expect(within(await card("c4")).getByText("20/02/2023 (declarada pela própria página)")).toBeTruthy();
    expect(within(await card("c3")).getByText("não comprovada no documento")).toBeTruthy();
    // mais nova: mostra a nota e o aviso de substituição como sempre
    expect(within(await card("c1")).getByText("Mais nova que a fonte vigente.")).toBeTruthy();
    expect(within(await card("c1")).getByText("Vai substituir a fonte vigente: PCDT de teste (versão 2019).")).toBeTruthy();
  });

  it("vigência dita pela IA: diz se a data aparece no documento ou não", async () => {
    showCandidates([
      { ...CAND, id: "c1", ai_valid_until: "2030-01-01", currency: "sem_comparacao", currency_info: { valid_until: "2030-01-01", valid_until_proven: true } },
      { ...CAND, id: "c2", ai_valid_until: "2031-02-02", currency: "sem_comparacao", currency_info: { valid_until: "2031-02-02", valid_until_proven: false } },
    ]);
    expect(within(await card("c1")).getByText("01/01/2030 (comprovada no texto do documento)")).toBeTruthy();
    expect(within(await card("c2")).getByText("02/02/2031 (não encontrada no documento)")).toBeTruthy();
  });
});

describe("candidatos: data da fonte só comprovada (achado 1)", () => {
  it("a data do formulário vem da data COMPROVADA, nunca da que só a IA disse", async () => {
    showCandidates([
      { ...CAND, id: "c1", ai_published: "2024-05-10", file_date: "2023-01-01", currency_date: null },
      { ...CAND, id: "c2", ai_published: "2024-05-10", currency_date: "2025-03-14", currency: "sem_comparacao", currency_info: { basis: "texto" } },
    ]);
    expect((within(await card("c1")).getByLabelText("Data de publicação") as HTMLInputElement).value).toBe("");
    expect((within(await card("c2")).getByLabelText("Data de publicação") as HTMLInputElement).value).toBe("2025-03-14");
  });
  it("o banco pede a confirmação de versão sem data comparável e a tela a repassa", async () => {
    let n = 0;
    fetchHandlers["POST /api/content-hub/source-candidates/c1/approve"] = () => {
      n += 1;
      return n === 1 ? json({ error: 'Confirme a versão sem data comparável: não foi possível comprovar que esta fonte é mais nova que a vigente "X" (versão 1, sem data); aprovar vai SUBSTITUIR a vigente.' }, 400) : json({ source_id: "s", document_id: "d", superseded: true }, 201);
    };
    showCandidates([{ ...CAND, currency: "data_nao_comprovada" }]);
    const c = await card();
    readyToApprove(c);
    fireEvent.click(within(c).getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(approved()).toHaveLength(2));
    expect(approved()[1].body.fields.confirm_older).toBe(true);
  });
});

describe("candidatos: aprovar versão mais antiga", () => {
  const OLDER = { ...CAND, currency: "versao_mais_antiga", currency_date: "2015-01-01", currency_info: { basis: "texto", note: 'Mais antiga que a fonte vigente "PCDT de teste" (versão 2019): esta é de 01/01/2015; a biblioteca tem 01/03/2019.', library: LIB }, replaces: LIB };

  it("avisa em vermelho, não oferece como substituta, pede confirmação explícita e envia confirm_older", async () => {
    fetchHandlers["POST /api/content-hub/source-candidates/c1/approve"] = () => json({ source_id: "s", document_id: "d", superseded: true }, 201);
    showCandidates([OLDER]);
    const c = await card();
    expect(within(c).getByText("Mais antiga que a da biblioteca")).toBeTruthy();
    expect(within(c).getByText(/Não é oferecida como substituta: aprovar vai trocar a fonte mais nova pela mais antiga/)).toBeTruthy();
    expect(within(c).queryByText(/Vai substituir a fonte vigente/)).toBeNull();
    readyToApprove(c);
    fireEvent.click(within(c).getByRole("button", { name: "Aprovar versão mais antiga" }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledWith('Esta fonte é mais antiga que a fonte vigente "PCDT de teste". Aprovar vai SUBSTITUIR a mais nova pela mais antiga. Aprovar mesmo assim?'));
    await waitFor(() => expect(approved()).toHaveLength(1));
    expect(approved()[0].body.fields).toMatchObject({ checked: true, confirm_older: true });
    expect(await screen.findByText("Você confirmou a aprovação de uma versão mais antiga.")).toBeTruthy();
  });

  it("recusar a confirmação não envia nada", async () => {
    (window.confirm as any).mockReturnValue(false);
    showCandidates([OLDER]);
    const c = await card();
    readyToApprove(c);
    fireEvent.click(within(c).getByRole("button", { name: "Aprovar versão mais antiga" }));
    expect(await within(c).findByText(/Aprovação cancelada: a versão mais antiga não foi confirmada/)).toBeTruthy();
    expect(approved()).toHaveLength(0);
  });

  it("'outra mais nova do mesmo tema' também pede a confirmação, com a data da mais nova", async () => {
    fetchHandlers["POST /api/content-hub/source-candidates/c1/approve"] = () => json({ source_id: "s", document_id: "d", superseded: false }, 201);
    showCandidates([{ ...CAND, currency: "outra_mais_nova", currency_date: "2020-01-01", currency_info: { note: "A busca achou outra versão mais nova do mesmo documento (01/06/2024).", newer: { id: "x", date: "2024-06-01" } } }]);
    const c = await card();
    expect(within(c).getByText("A IA achou outra mais nova para o mesmo tema")).toBeTruthy();
    expect(within(c).getByText(/Aprovar esta não traz a versão mais nova/)).toBeTruthy();
    readyToApprove(c);
    fireEvent.click(within(c).getByRole("button", { name: "Aprovar versão mais antiga" }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledWith("A busca achou outra versão mais nova deste mesmo documento (01/06/2024). Aprovar esta versão mais antiga não traz a mais nova. Aprovar mesmo assim?"));
    await waitFor(() => expect(approved()).toHaveLength(1));
    expect(approved()[0].body.fields.confirm_older).toBe(true);
  });

  it("o banco pode pedir a confirmação mesmo sem estado guardado (data do dono anterior à da biblioteca): reenvia com confirm_older", async () => {
    let n = 0;
    fetchHandlers["POST /api/content-hub/source-candidates/c1/approve"] = () => {
      n += 1;
      return n === 1 ? json({ error: 'Confirme a versão mais antiga: esta fonte (01/01/2015) é mais antiga que a vigente "PCDT de teste" (versão 2019, 01/03/2019) e aprovar vai SUBSTITUIR a mais nova pela mais antiga.' }, 400) : json({ source_id: "s", document_id: "d", superseded: true }, 201);
    };
    showCandidates([{ ...CAND, currency: "sem_comparacao" }]);
    const c = await card();
    readyToApprove(c);
    expect(within(c).getByRole("button", { name: "Aprovar" })).toBeTruthy(); // sem estado de versão antiga, o botão é o de sempre
    fireEvent.click(within(c).getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(approved()).toHaveLength(2));
    expect(approved()[0].body.fields.confirm_older).toBeUndefined();
    expect(approved()[1].body.fields.confirm_older).toBe(true);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/^Confirme a versão mais antiga: .* Aprovar mesmo assim\?$/));
  });

  it("versão mais nova aprova como sempre: sem confirm_older", async () => {
    fetchHandlers["POST /api/content-hub/source-candidates/c1/approve"] = () => json({ source_id: "s", document_id: "d", superseded: false }, 201);
    showCandidates([{ ...CAND, currency: "versao_mais_nova", currency_date: "2025-03-14", currency_info: { basis: "texto" } }]);
    const c = await card();
    readyToApprove(c);
    fireEvent.click(within(c).getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(approved()).toHaveLength(1));
    expect(approved()[0].body.fields.confirm_older).toBeUndefined();
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
