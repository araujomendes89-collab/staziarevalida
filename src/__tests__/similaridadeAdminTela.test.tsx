// @vitest-environment jsdom
/**
 * Motor de Similaridade — tela "Questões parecidas" da Central de Conteúdo (telas, banco simulado): só a equipe vê a seção; o
 * resumo do motor; os filtros Propostas / Possíveis duplicatas / Baixa confiança / Todas; cada par com as duas questões lado a lado,
 * tipo, pontuação, confiança e justificativa; aprovar, rejeitar trocando o tipo e anotando, reprocessar (todas ou o par) só depois
 * de confirmar; paginação; e o aviso amigável quando o banco ainda não tem a função.
 *
 * Dados: questões REAIS do banco (fixtures/questoes-reais-similaridade.json, tiradas de questoes-1200.json). Os pares que o banco
 * simulado devolve são montados com elas; tipo, pontuação e confiança são escolhidos só para testar a tela e a justificativa é
 * neutra (repete a classificação que o banco já tem), sem laudo clínico inventado.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";

const backend: any = { rpc: vi.fn() }; // sem token: a Central não chama o servidor, só o banco (simulado)
let boot: any = { role: "admin", profile: { name: "Adm" }, reviewer_areas: [] };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { ContentHub } from "../novo/app/admin/content/ContentHub.jsx";

type Real = {
  id: string; code: string; exam_id: string; number: number; area: string; topic: string; subtopic: string | null; statement: string;
  options: { id: string; text: string; explanation?: string | null }[]; correct_option: string; expected_conduct: string | null; inep_intent: string | null;
};
const REAIS: Real[] = JSON.parse(readFileSync("src/__tests__/fixtures/questoes-reais-similaridade.json", "utf8"));
const byId: Record<string, Real> = Object.fromEntries(REAIS.map((q) => [q.id, q]));
const side = (q: Real) => ({ id: q.id, code: q.code, excerpt: q.statement.slice(0, 160), subtema: q.subtopic });
const pair = (id: string, a: Real, b: Real, over: Record<string, unknown> = {}) => ({
  id, a: side(a), b: side(b), relation: "mesmo_subtema", score: 0.8, confidence: "media", reason: `Mesmo tema na classificação do banco: ${a.topic}.`,
  status: "proposta", origin: "motor", created_at: "2026-10-12T15:00:00Z", ...over,
});
const Q045 = byId.revalida_2021_1_q045;
const Q059 = byId.revalida_2023_2_q059;
const Q074 = byId.revalida_2022_2_q074;
const Q024 = byId.revalida_2024_1_q024;
const PAIR1 = pair("6f1d2c3b-0a4e-4c55-9d1e-1a2b3c4d5e01", Q045, Q059, { relation: "mesmo_raciocinio", score: 0.87, confidence: "alta" });
const PAIR2 = pair("6f1d2c3b-0a4e-4c55-9d1e-1a2b3c4d5e02", Q074, Q024, { relation: "mesmo_subtema", score: 0.71, confidence: 0.42, origin: "ia" });
const STATUS = { perfis: REAIS.length, com_vetor: REAIS.length, relacoes: 2, pendentes_revisao: 2, ultima_execucao: "2026-10-12T15:00:00Z" };
const NAME1 = `Par ${Q045.code} e ${Q059.code}`;
const NAME2 = `Par ${Q074.code} e ${Q024.code}`;
const MISSING = (fn: string) => Object.assign(new Error(`Could not find the function public.${fn} without parameters in the schema cache`), { code: "PGRST202" });

let rpcs: Record<string, (args: any) => any> = {};
const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
beforeEach(() => {
  boot = { role: "admin", profile: { name: "Adm" }, reviewer_areas: [] };
  rpcs = {
    app_admin_similarity_status: () => STATUS,
    app_admin_question_relations: () => ({ total: 2, items: [PAIR1, PAIR2] }),
    app_admin_review_relation: (a: any) => ({ ...PAIR1, status: a.p_decision === "aprovar" ? "aprovada" : "rejeitada" }),
    app_admin_similarity_reprocess: (a: any) => ({ queued: a.p_question_ids ? a.p_question_ids.length : REAIS.length }),
  };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (rpcs[fn]) return rpcs[fn](args);
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

const mount = (props: { isAdmin: boolean; isStaff: boolean } = { isAdmin: true, isStaff: true }, secao = "parecidas") =>
  render(
    <MemoryRouter initialEntries={[`/?aba=conteudo&secao=${secao}`]}>
      <ContentHub {...props} />
    </MemoryRouter>
  );
const tabs = () => screen.queryAllByRole("tab").map((t) => t.textContent);
const pairGroup = (name: string) => screen.findByRole("group", { name });

describe("Questões parecidas: quem vê", () => {
  it("administrador e editor veem a seção na Central de Conteúdo", async () => {
    mount();
    expect(tabs()).toContain("Questões parecidas");
    expect(screen.getByRole("tab", { name: "Questões parecidas" }).getAttribute("aria-selected")).toBe("true");
    await pairGroup(NAME1);
    cleanup();
    boot = { role: "editor", profile: { name: "Ed" }, reviewer_areas: [] };
    mount({ isAdmin: false, isStaff: true });
    expect(tabs()).toContain("Questões parecidas");
    await pairGroup(NAME1);
  });

  it("revisor médico sem papel de equipe e aluno não veem a seção nem chamam o banco, mesmo com o endereço direto", async () => {
    boot = { role: "student", profile: { name: "Dra." }, reviewer_areas: ["GINECOLOGIA_OBSTETRICIA"] };
    rpcs.app_question_analyses = () => ({ total: 0, items: [], exams: [], summary: { analyzed: 0, questions: 0, by_status: {} } });
    mount({ isAdmin: false, isStaff: false });
    expect(tabs()).not.toContain("Questões parecidas");
    expect(tabs().length).toBeGreaterThan(0);
    cleanup();
    boot = { role: "student", profile: { name: "Aluna" }, reviewer_areas: [] };
    mount({ isAdmin: false, isStaff: false });
    expect(tabs()).toEqual([]);
    await new Promise((r) => setTimeout(r, 20));
    expect(backend.rpc.mock.calls.map((c: any[]) => c[0]).filter((f: string) => f.startsWith("app_admin_"))).toEqual([]);
  });
});

describe("Questões parecidas: resumo, pares e filtros", () => {
  it("resumo do motor e cada par com as duas questões lado a lado, tipo, pontuação, confiança e justificativa", async () => {
    mount();
    const first = await pairGroup(NAME1);
    expect(screen.getByText(`${REAIS.length} questões com perfil`)).toBeTruthy();
    expect(screen.getByText(`${REAIS.length} com vetor`)).toBeTruthy();
    expect(screen.getByText("2 relações encontradas")).toBeTruthy();
    expect(screen.getByText("2 para revisar")).toBeTruthy();
    expect(screen.getByText(/Última execução: 12\/10\/2026/)).toBeTruthy();
    for (const q of [Q045, Q059]) {
      expect(within(first).getByText(q.code)).toBeTruthy();
      expect(within(first).getByText(`Subtema: ${q.subtopic}`)).toBeTruthy();
      expect(within(first).getByText(q.statement.slice(0, 160))).toBeTruthy();
    }
    expect(within(first).getByText("Mesmo raciocínio clínico")).toBeTruthy();
    expect(within(first).getByText("Pontuação 0,87")).toBeTruthy();
    expect(within(first).getByText("Confiança alta")).toBeTruthy();
    expect(within(first).getByText("Proposta")).toBeTruthy();
    expect(within(first).getByText(`Mesmo tema na classificação do banco: ${Q045.topic}.`)).toBeTruthy();
    const second = await pairGroup(NAME2);
    expect(within(second).getByText("Mesmo subtema")).toBeTruthy();
    expect(within(second).getByText("Confiança 0,42")).toBeTruthy();
    expect(within(second).getByText(/classificador de IA/)).toBeTruthy();
  });

  it("filtros: Propostas (de início), Possíveis duplicatas, Baixa confiança e Todas; cada troca volta à primeira página", async () => {
    mount();
    await pairGroup(NAME1);
    const filters = screen.getByRole("group", { name: "Filtrar pares" });
    expect(calls("app_admin_question_relations")[0][1]).toEqual({ p_filter: "propostas", p_limit: 20, p_offset: 0 });
    for (const [label, value] of [["Possíveis duplicatas", "duplicadas"], ["Baixa confiança", "baixa_confianca"], ["Todas", "todas"], ["Propostas", "propostas"]]) {
      fireEvent.click(within(filters).getByRole("button", { name: label }));
      expect(within(filters).getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
      await waitFor(() => expect(calls("app_admin_question_relations").at(-1)[1]).toEqual({ p_filter: value, p_limit: 20, p_offset: 0 }));
    }
  });

  it("lista vazia: diz que não há pares neste filtro", async () => {
    rpcs.app_admin_question_relations = () => ({ total: 0, items: [] });
    mount();
    expect(await screen.findByText("Nenhum par neste filtro")).toBeTruthy();
  });

  it("paginação como nas outras listas: 20 por página", async () => {
    rpcs.app_admin_question_relations = (a: any) => ({ total: 45, items: a.p_offset === 0 ? [PAIR1] : [PAIR2] });
    mount();
    await pairGroup(NAME1);
    expect(screen.getByText("1/3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await pairGroup(NAME2);
    expect(calls("app_admin_question_relations").at(-1)[1]).toEqual({ p_filter: "propostas", p_limit: 20, p_offset: 20 });
    expect(screen.getByText("2/3")).toBeTruthy();
  });
});

describe("Questões parecidas: decisões", () => {
  it("aprovar sem trocar o tipo: manda só a decisão, avisa e recarrega a lista", async () => {
    mount();
    const first = await pairGroup(NAME1);
    const before = calls("app_admin_question_relations").length;
    fireEvent.click(within(first).getByRole("button", { name: "Aprovar" }));
    expect(await screen.findByText("Relação aprovada.")).toBeTruthy();
    expect(calls("app_admin_review_relation")).toEqual([["app_admin_review_relation", { p_id: PAIR1.id, p_decision: "aprovar", p_relation: null, p_note: null }]]);
    await waitFor(() => expect(calls("app_admin_question_relations").length).toBeGreaterThan(before));
  });

  it("rejeitar trocando o tipo e com nota", async () => {
    mount();
    const first = await pairGroup(NAME1);
    fireEvent.click(within(first).getByRole("button", { name: "Trocar o tipo ou anotar" }));
    const select = within(first).getByLabelText("Tipo de relação") as HTMLSelectElement;
    expect(select.value).toBe("mesmo_raciocinio");
    expect([...select.options].map((o) => o.value)).toEqual(["duplicada_exata", "duplicada_semantica", "mesmo_raciocinio", "complementar", "mesmo_subtema", "mesmo_tema", "nao_relacionada"]);
    fireEvent.change(select, { target: { value: "complementar" } });
    fireEvent.change(within(first).getByLabelText("Nota (opcional)"), { target: { value: "Conferido pela equipe." } });
    fireEvent.click(within(first).getByRole("button", { name: "Rejeitar" }));
    expect(await screen.findByText("Relação rejeitada.")).toBeTruthy();
    expect(calls("app_admin_review_relation")[0][1]).toEqual({ p_id: PAIR1.id, p_decision: "rejeitar", p_relation: "complementar", p_note: "Conferido pela equipe." });
  });

  it("aprovar trocando o tipo manda o tipo novo", async () => {
    mount();
    const second = await pairGroup(NAME2);
    fireEvent.click(within(second).getByRole("button", { name: "Trocar o tipo ou anotar" }));
    fireEvent.change(within(second).getByLabelText("Tipo de relação"), { target: { value: "mesmo_tema" } });
    fireEvent.click(within(second).getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(calls("app_admin_review_relation")).toHaveLength(1));
    expect(calls("app_admin_review_relation")[0][1]).toEqual({ p_id: PAIR2.id, p_decision: "aprovar", p_relation: "mesmo_tema", p_note: null });
  });

  it("recusa do banco em português aparece no próprio par", async () => {
    rpcs.app_admin_review_relation = () => {
      throw Object.assign(new Error("Só a equipe pode revisar relações entre questões."), { code: "42501" });
    };
    mount();
    const first = await pairGroup(NAME1);
    fireEvent.click(within(first).getByRole("button", { name: "Aprovar" }));
    expect(await within(first).findByText("Só a equipe pode revisar relações entre questões.")).toBeTruthy();
    expect(screen.queryByText("Relação aprovada.")).toBeNull();
  });

  it("par já aprovado não oferece 'Aprovar' de novo; rejeitado não oferece 'Rejeitar'", async () => {
    rpcs.app_admin_question_relations = () => ({ total: 2, items: [{ ...PAIR1, status: "aprovada" }, { ...PAIR2, status: "rejeitada" }] });
    mount();
    const first = await pairGroup(NAME1);
    const second = await pairGroup(NAME2);
    expect(within(first).queryByRole("button", { name: "Aprovar" })).toBeNull();
    expect(within(first).getByRole("button", { name: "Rejeitar" })).toBeTruthy();
    expect(within(second).queryByRole("button", { name: "Rejeitar" })).toBeNull();
    expect(within(second).getByRole("button", { name: "Aprovar" })).toBeTruthy();
  });
});

describe("Questões parecidas: reprocessar com confirmação", () => {
  it("todas: pede confirmação; cancelar não manda nada; confirmar manda todas e diz quantas entraram na fila", async () => {
    mount();
    await pairGroup(NAME1);
    fireEvent.click(screen.getByRole("button", { name: "Reprocessar todas" }));
    expect(screen.getByText("Reprocessar todas as questões?")).toBeTruthy();
    expect(calls("app_admin_similarity_reprocess")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("Reprocessar todas as questões?")).toBeNull();
    expect(calls("app_admin_similarity_reprocess")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Reprocessar todas" }));
    fireEvent.click(screen.getByRole("button", { name: "Sim, reprocessar" }));
    expect(await screen.findByText(`${REAIS.length} questões entraram na fila de reprocessamento.`)).toBeTruthy();
    expect(calls("app_admin_similarity_reprocess")).toEqual([["app_admin_similarity_reprocess", { p_question_ids: null }]]);
  });

  it("o par: confirma e manda só as duas questões dele", async () => {
    mount();
    const first = await pairGroup(NAME1);
    fireEvent.click(within(first).getByRole("button", { name: "Reprocessar este par" }));
    expect(within(first).getByText("Reprocessar as duas questões deste par?")).toBeTruthy();
    expect(calls("app_admin_similarity_reprocess")).toHaveLength(0);
    fireEvent.click(within(first).getByRole("button", { name: "Sim, reprocessar" }));
    expect(await within(first).findByText("2 questões entraram na fila de reprocessamento.")).toBeTruthy();
    expect(calls("app_admin_similarity_reprocess")[0][1]).toEqual({ p_question_ids: [Q045.id, Q059.id] });
  });
});

describe("Questões parecidas: banco ainda sem a atualização", () => {
  it("sem a função do resumo: aviso amigável, sem erro técnico", async () => {
    rpcs.app_admin_similarity_status = () => {
      throw MISSING("app_admin_similarity_status");
    };
    mount();
    expect(await screen.findByText(/Falta aplicar a atualização do banco desta função/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/schema cache|PGRST|app_admin/);
    expect(screen.queryByRole("button", { name: "Reprocessar todas" })).toBeNull();
  });

  it("sem a função da lista: o mesmo aviso", async () => {
    rpcs.app_admin_question_relations = () => {
      throw MISSING("app_admin_question_relations");
    };
    mount();
    expect(await screen.findByText(/Falta aplicar a atualização do banco desta função/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/schema cache|PGRST/);
  });
});
