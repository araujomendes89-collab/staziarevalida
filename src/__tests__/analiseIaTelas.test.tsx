/**
 * Pedir a IA pela tela (jsdom, banco simulado): "Gerar análises com IA" (aba Análise de questões) e "Conferir com IA" +
 * selo de triagem (aba Questões inéditas). Estimativa antes de confirmar, limites, avisos em português, SQL antigo, Registro.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/admin/content/UpdateQueue.jsx", () => ({ UpdateQueue: () => null }));
vi.mock("../novo/app/admin/content/UpdatedQuestions.jsx", () => ({ UpdatedQuestions: () => null }));

import { QuestionAnalyses } from "../novo/app/admin/content/QuestionAnalyses.jsx";
import { DraftQuestions } from "../novo/app/admin/content/DraftQuestions.jsx";
import { ACTION_LABEL, auditLabel, auditSummary } from "../novo/app/admin/auditLog.js";

const EXAMS = [{ id: "revalida-2021", title: "Revalida 2021" }, { id: "revalida-2022-1", title: "Revalida 2022/1" }];
const PREVIEW = {
  kind: "question_analysis", limits: { per_request: 50, per_day: 100, default: 3 }, available: 40, will_analyze: 3, used_today: 0, remaining_today: 100,
  estimate: { calls: 3, input_tokens: 9000, output_tokens_typical: 7800, output_tokens_max: 36000, typical_usd: 0.19, max_usd: 0.76, provider: "anthropic", model: "claude-opus-5-5", note: null },
  ai: { ready: true, reason: null }, areas: null,
};
const REQ = { id: "r1", kind: "question_analysis", status: "analisando", item_count: 3, done_count: 1, calls: 1, cost_usd: 0.06, estimate_usd: 0.19, message: null, created_at: "2026-10-12T10:00:00Z", can_cancel: false, params: {}, requested_by_email: "adm@t.dev" };
let requests: any[];
let preview: any;
let previewError: Error | null;

function analysesRpc() {
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_question_analyses") return { summary: { questions: 1200, analyzed: 0, by_status: {} }, total: 0, exams: EXAMS, items: [] };
    if (fn === "app_question_update_summary") return null;
    if (fn === "app_ch_question_analysis_preview") {
      if (previewError) throw previewError;
      return typeof preview === "function" ? preview(args) : preview;
    }
    if (fn === "app_ch_question_analysis_request") return { id: "r1", duplicate: false, status: "na_fila", items: args.p_count, estimate_usd: 0.19 };
    if (fn === "app_ch_ai_requests") return requests;
    if (fn === "app_ch_ai_request_cancel") return { id: "r2", status: "falhou" };
    throw new Error(`rpc não simulada: ${fn}`);
  });
}

beforeEach(() => {
  backend.rpc.mockReset();
  requests = [];
  preview = PREVIEW;
  previewError = null;
  analysesRpc();
});
afterEach(cleanup);

describe("Análise de questões › Gerar análises com IA", () => {
  it("mostra quantas questões entram e a estimativa em dólares ANTES de pedir; o pedido leva prova, quantidade e 'só sem análise'", async () => {
    render(<QuestionAnalyses reviewerAreas={[]} />);
    expect(await screen.findByText("Gerar análises com IA")).toBeTruthy();
    expect(await screen.findByText(/questões entram neste pedido \(40 disponíveis/)).toBeTruthy();
    expect(screen.getByTestId("estimate").textContent).toMatch(/≈ US\$ 0,19.*no máximo US\$ 0,76.*claude-opus-5-5/);
    expect(screen.getByText(/50 por pedido e 100 por dia/)).toBeTruthy();
    expect(backend.rpc).not.toHaveBeenCalledWith("app_ch_question_analysis_request", expect.anything());
    fireEvent.change(screen.getByLabelText("Prova a analisar") as HTMLSelectElement, { target: { value: "revalida-2022-1" } });
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_ch_question_analysis_preview", expect.objectContaining({ p_exam: "revalida-2022-1", p_count: 3, p_only_missing: true })));
    fireEvent.click(screen.getByRole("button", { name: "Pedir análise" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_ch_question_analysis_request", { p_exam: "revalida-2022-1", p_count: 3, p_only_missing: true, p_area: null }));
    expect(await screen.findByText(/Pedido enviado: 3 questão\(ões\), custo estimado ≈ US\$ 0,19/)).toBeTruthy();
  });

  it("a quantidade fica entre 1 e 50 (padrão 3) e a opção 'só sem análise' vai ao banco", async () => {
    render(<QuestionAnalyses reviewerAreas={[]} />);
    const qty = (await screen.findByLabelText("Quantas questões (1 a 50)")) as HTMLInputElement;
    expect(qty.value).toBe("3");
    fireEvent.change(qty, { target: { value: "99" } });
    expect(qty.value).toBe("50");
    fireEvent.change(qty, { target: { value: "0" } });
    expect(qty.value).toBe("1");
    fireEvent.click(screen.getByLabelText("Só questões ainda sem análise"));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_ch_question_analysis_preview", expect.objectContaining({ p_count: 1, p_only_missing: false })));
  });

  it("IA da Central não pronta: botão travado e o motivo em português", async () => {
    preview = { ...PREVIEW, ai: { ready: false, reason: 'A IA escolhida para "Engenharia reversa" (Claude) está desligada na Central de IAs. Ligue-a ou escolha outra.' } };
    render(<QuestionAnalyses reviewerAreas={[]} />);
    expect(await screen.findByText(/está desligada na Central de IAs/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pedir análise" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("cota do dia curta ou nenhuma questão disponível trava o botão com aviso", async () => {
    preview = { ...PREVIEW, remaining_today: 2, will_analyze: 3 };
    render(<QuestionAnalyses reviewerAreas={[]} />);
    expect(await screen.findByText(/limite de hoje não comporta/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pedir análise" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sem preço cadastrado: avisa que o valor em dólar não pode ser estimado (não inventa número)", async () => {
    preview = { ...PREVIEW, estimate: { ...PREVIEW.estimate, typical_usd: null, max_usd: null, note: "Sem preço cadastrado para claude-opus-5-5 (anthropic) na Central de IAs." } };
    render(<QuestionAnalyses reviewerAreas={[]} />);
    expect(await screen.findByText(/não foi possível estimar. Sem preço cadastrado/)).toBeTruthy();
  });

  it("andamento do pedido: barra, gasto e, ao concluir, aviso de que nada foi publicado e a lista recarrega", async () => {
    requests = [REQ, { ...REQ, id: "r2", status: "pendente", done_count: 0, calls: 0, cost_usd: 0, message: "Claude está desligada na Central de IAs.", can_cancel: true }];
    render(<QuestionAnalyses reviewerAreas={[]} />);
    const box = await screen.findByTestId("ai-requests");
    expect(within(box).getByText("Analisando")).toBeTruthy();
    expect(within(box).getByText("1 de 3")).toBeTruthy();
    expect(within(box).getByText(/Gasto até agora: US\$ 0,06 em 1 chamada\(s\) \(estimado US\$ 0,19\)/)).toBeTruthy();
    expect(within(box).getByText("Aguardando a IA")).toBeTruthy();
    expect(within(box).getByText("Claude está desligada na Central de IAs.")).toBeTruthy();
    fireEvent.click(within(box).getByRole("button", { name: "Cancelar pedido" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_ch_ai_request_cancel", { p_id: "r2" }));
  });

  it("pedido concluído e falho aparecem em português, sem código", async () => {
    requests = [{ ...REQ, status: "concluido", done_count: 3 }, { ...REQ, id: "r3", status: "falhou", done_count: 0, message: "A IA não respondeu." }];
    render(<QuestionAnalyses reviewerAreas={[]} />);
    const box = await screen.findByTestId("ai-requests");
    expect(within(box).getByText("Concluído")).toBeTruthy();
    expect(within(box).getByText(/Nada foi publicado: o aluno só vê depois que um revisor médico aprovar/)).toBeTruthy();
    expect(within(box).getByText("Falhou")).toBeTruthy();
    expect(within(box).getByText("A IA não respondeu.")).toBeTruthy();
    expect(box.textContent).not.toMatch(/question_analysis|na_fila|concluido/);
  });

  it("site novo + SQL antigo: aviso em português em vez de erro cru, e o resto da aba continua", async () => {
    previewError = new Error("Could not find the function public.app_ch_question_analysis_preview(p_area, p_count) in the schema cache");
    render(<QuestionAnalyses reviewerAreas={[]} />);
    expect(await screen.findByText("Pedido de IA ainda indisponível")).toBeTruthy();
    expect(screen.getByText(/atualização do banco de dados que ainda não foi aplicada/)).toBeTruthy();
    expect(screen.queryByText(/schema cache/)).toBeNull();
    expect(screen.getByText("Andamento")).toBeTruthy();
  });

  it("erro de limite do banco aparece como veio, em português", async () => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_ch_question_analysis_request") throw new Error("Limite de 100 questões por dia atingido: você já pediu 100 hoje e este pedido tem 3. O limite recomeça amanhã (horário de Brasília).");
      if (fn === "app_question_analyses") return { summary: { questions: 1, analyzed: 0, by_status: {} }, total: 0, exams: EXAMS, items: [] };
      if (fn === "app_ch_question_analysis_preview") return PREVIEW;
      if (fn === "app_ch_ai_requests") return [];
      return null;
    });
    render(<QuestionAnalyses reviewerAreas={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Pedir análise" }));
    expect(await screen.findByText(/Limite de 100 questões por dia atingido/)).toBeTruthy();
  });
});

const DRAFT = (over: any) => ({
  id: "d1", batch: "simulado_preditivo_2026_2_001", slot: 1, area: "PEDIATRIA", status: "awaiting_medical_review", title: "Rascunho A", stem: "Enunciado.",
  alternatives: { A: "a", B: "b", C: "c", D: "d" }, correct_answer: "A", alternative_explanations: {}, source_citations: [], checks: {}, can_review: true,
  triage: "nao_conferida", triage_rank: 5, blocked_no_source: false, blocked_reason: null, support_rows: [], similarity_to_official: 10, ...over,
});
const DPREVIEW = {
  kind: "draft_check", layers: ["software"], limits: { per_request: 20, per_day: 60, default: 10 }, available: 200, will_check: 10, used_today: 0, remaining_today: 60,
  estimate: { calls: 0, input_tokens: 0, output_tokens_typical: 0, typical_usd: 0, max_usd: 0, by_layer: {}, note: null }, ai: { ready: true, reason: null, needed: false }, areas: null,
};
let drafts: any[];
function draftsRpc() {
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_draft_questions")
      return { batches: [{ batch: "simulado_preditivo_2026_2_001", total: 2, awaiting: 2, approved: 0, needs_changes: 0, rejected: 0 }], checks: {}, total: drafts.length, items: drafts, triage_counts: { reprovada: 1, sem_fonte: 1 } };
    if (fn === "app_ch_draft_check_preview") return args.p_layers.includes("redteam") ? { ...DPREVIEW, layers: args.p_layers, estimate: { calls: 30, typical_usd: 0.4, max_usd: 1.2, by_layer: {}, note: null }, ai: { ready: true, reason: null, needed: true } } : DPREVIEW;
    if (fn === "app_ch_draft_check_request") return { id: "c1", duplicate: false, status: "na_fila", items: args.p_count, estimate_usd: 0 };
    if (fn === "app_ch_ai_requests") return [];
    throw new Error(`rpc não simulada: ${fn}`);
  });
}

describe("Questões inéditas › Conferir com IA e selo de triagem", () => {
  beforeEach(() => {
    drafts = [DRAFT({ id: "d1", triage: "sem_fonte", blocked_no_source: true, blocked_reason: "Sem fonte oficial (nível A a D) para a afirmação central: a aprovação fica bloqueada até haver o documento oficial cadastrado." }), DRAFT({ id: "d2", slot: 2, title: "Rascunho B", triage: "sem_apontamentos" })];
    draftsRpc();
  });

  it("estimativa antes de confirmar; camadas de IA mudam o custo; o pedido leva lote, área, quantidade e camadas", async () => {
    render(<DraftQuestions reviewerAreas={["PEDIATRIA"]} />);
    expect(await screen.findByText("Conferir com IA")).toBeTruthy();
    expect(await screen.findByText(/Só regras de software: sem chamada de IA e sem custo/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Revisão clínica independente"));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_ch_draft_check_preview", expect.objectContaining({ p_layers: ["software", "redteam"] })));
    await waitFor(() => expect(screen.getByTestId("estimate").textContent).toMatch(/≈ US\$ 0,40.*no máximo US\$ 1,20/));
    fireEvent.change(screen.getByLabelText("Quantos rascunhos (1 a 20)"), { target: { value: "99" } });
    expect((screen.getByLabelText("Quantos rascunhos (1 a 20)") as HTMLInputElement).value).toBe("20");
    fireEvent.click(screen.getByRole("button", { name: "Pedir conferência" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_ch_draft_check_request", { p_batch: null, p_area: null, p_count: 20, p_layers: ["software", "redteam"], p_recheck: false }));
    expect(await screen.findByText(/Pedido enviado: 20 rascunho\(s\)/)).toBeTruthy();
  });

  it("IA necessária e não pronta trava o botão; só regras não precisa de IA", async () => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_draft_questions") return { batches: [], checks: {}, total: 0, items: [], triage_counts: {} };
      if (fn === "app_ch_draft_check_preview") return { ...DPREVIEW, layers: args.p_layers, ai: { ready: false, reason: 'A função "Verificação" da Central de IAs está sem IA escolhida: escolha uma na Central de IAs.', needed: args.p_layers.length > 1 } };
      return [];
    });
    render(<DraftQuestions reviewerAreas={[]} />);
    const button = await screen.findByRole("button", { name: "Pedir conferência" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByLabelText("Fontes oficiais"));
    expect(await screen.findByText(/sem IA escolhida/)).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "Pedir conferência" }) as HTMLButtonElement).disabled).toBe(true));
  });

  it("selo de triagem em cada rascunho, contagem, nota 'A IA não aprova' e aprovação bloqueada sem fonte oficial", async () => {
    render(<DraftQuestions reviewerAreas={["PEDIATRIA"]} />);
    const blocked = await screen.findByRole("button", { name: /Rascunho A/ });
    expect(within(blocked).getByText("Sem fonte oficial: bloqueada")).toBeTruthy();
    expect(within(await screen.findByRole("button", { name: /Rascunho B/ })).getByText("Sem apontamentos")).toBeTruthy();
    expect(screen.getAllByText(/A IA não aprova: quem decide é o revisor médico/).length).toBeGreaterThan(0);
    expect(screen.getByText("Reprovada pela IA ou pelas regras: 1")).toBeTruthy();
    fireEvent.click(blocked);
    const approve = screen.getByRole("button", { name: "Aprovar" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(screen.getByText(/a aprovação fica bloqueada até haver o documento oficial/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pedir ajustes" })).toBeTruthy();
    fireEvent.click(approve);
    expect(backend.rpc).not.toHaveBeenCalledWith("app_draft_question_decide", expect.anything());
  });

  it("filtro e ordem por triagem vão ao banco", async () => {
    render(<DraftQuestions reviewerAreas={[]} />);
    fireEvent.change(await screen.findByLabelText("Triagem"), { target: { value: "sem_fonte" } });
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_draft_questions", expect.objectContaining({ p_triage: "sem_fonte" })));
    fireEvent.change(screen.getByLabelText("Ordem"), { target: { value: "problematicos" } });
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_draft_questions", expect.objectContaining({ p_triage: "sem_fonte", p_order: "problematicos" })));
  });

  it("site novo + SQL antigo: a lista aparece sem o selo, com aviso em português, e o pedido mostra o aviso de indisponível", async () => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_draft_questions") {
        if ("p_triage" in args) throw new Error('function public.app_draft_questions(p_batch => unknown, p_triage => unknown) does not exist');
        return { batches: [], checks: {}, total: 1, items: [DRAFT({ triage: undefined })] };
      }
      throw new Error("Could not find the function public.app_ch_draft_check_preview in the schema cache");
    });
    render(<DraftQuestions reviewerAreas={[]} />);
    expect(await screen.findByText("Selo de triagem indisponível")).toBeTruthy();
    expect(await screen.findByText("Pedido de IA ainda indisponível")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Rascunho A/ })).toBeTruthy();
    expect(screen.queryByText(/does not exist|schema cache/)).toBeNull();
  });
});

describe("Registro da Administração: nomes em português das ações novas", () => {
  it("pedido, resultado e cancelamento", () => {
    for (const a of ["question_analysis.request", "question_analysis.result", "draft_check.request", "draft_check.result", "ai_request.cancel"]) {
      expect((ACTION_LABEL as any)[a], a).toMatch(/^[A-ZÁÉÍÓÚ][^._]*$/);
    }
    expect(auditLabel({ action: "question_analysis.request", details: {} })).toBe("Análise de questões por IA pedida");
    expect(auditSummary({ action: "question_analysis.request", details: { items: 3, exam: "revalida-2021", estimate_usd: 0.19, only_missing: true } })).toBe("3 questões · custo estimado US$ 0,19 · Prova: revalida-2021");
    expect(auditSummary({ action: "question_analysis.result", details: { status: "concluido", items: 3, done: 3, calls: 3, cost_usd: 0.13 } })).toBe("Concluído · 3 de 3 questões · 3 chamadas de IA · custo US$ 0,13");
    expect(auditSummary({ action: "draft_check.request", details: { items: 10, batch: "lote", layers: ["software", "redteam"], recheck: false } })).toBe("10 rascunhos · Lote: lote · Camadas: regras, revisão clínica");
    expect(auditSummary({ action: "draft_check.result", details: { status: "falhou", items: 5, done: 0, calls: 0, cost_usd: 0, message: "A IA não respondeu." } })).toBe("Falhou · 0 de 5 rascunhos · 0 chamadas de IA · custo US$ 0 · Aviso: A IA não respondeu.");
    expect(auditLabel({ action: "draft_check.coisa", details: {} })).toBe("Outra ação na Central de Conteúdo");
  });
});
