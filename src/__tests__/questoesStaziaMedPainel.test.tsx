// @vitest-environment jsdom
/**
 * Questões StaziaMed — painel da Central de Conteúdo (Tarefas 12 e 13): a seção, o aviso de acervo, "Gerar" com o custo antes,
 * a lista com filtros e "Conferir pendentes", e o rascunho aberto com editar, buscar fonte, equilibrar, aprovar, publicar e recolher.
 * O banco (`backend.rpc`) e o servidor (`fetch`) são simulados.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "token" };
let boot: any = { role: "admin", profile: { name: "Adm" }, reviewer_areas: [] };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { ContentHub } from "../novo/app/admin/content/ContentHub.jsx";
import { MATERIAL_KIND } from "../novo/app/admin/content/labels.js";

const HASH = "a".repeat(64);
const OFICIAL = { passage_id: "p1", source_id: "s1", source: "PCDT de Otite", organ: "Ministério da Saúde", version: "2026", page: 7, quote: "indica-se amoxicilina 90 mg/kg/dia por 10 dias", supports: "Tratar a otite com amoxicilina." };
const base = (over: any = {}) => ({
  id: "d1", batch: "pedido_20261012_abcd1234", source_id: "vaga_01", slot: 1, area: "PEDIATRIA", subarea: null, competency: null, title: "Otite no lactente",
  stem: "Lactente de 8 meses com febre e otalgia. Qual a conduta?", alternatives: { A: "Amoxicilina.", B: "Observar.", C: "Azitromicina.", D: "Ceftriaxona." },
  correct_answer: "A", explanation: "Amoxicilina é a primeira escolha.", alternative_explanations: { A: "Correta. Ok.", B: "Incorreta.", C: "Incorreta.", D: "Incorreta." },
  source_citations: [OFICIAL], update_application: null, similarity_to_official: 12, support_type: "NONE", support_title: null, support_rows: [],
  clinical_decision: "Tratar a otite com amoxicilina.", model: "gpt-teste", status: "awaiting_medical_review", reviewed_by: null, reviewed_at: null, review_note: null,
  reviewed_hash: null, ai_review: null, generated_by: "servidor", topic: "Otite média aguda", content_hash: HASH, published_hash: null, question_id: null,
  situacao: "awaiting_medical_review", can_review: false, can_edit: true, can_publish: true, reviewer: null, review_outdated: false, blocked_no_source: false,
  stale_sources: [], approval_blockers: [], question: null, checks: {},
  ...over,
});
const LEGACY_CITATION = { source_file: "Apostila do curso.pdf", supported_claim: "Amoxicilina por 10 dias." };
const list = (items: any[], over: any = {}) => ({
  batches: [{ batch: "pedido_20261012_abcd1234", total: items.length, awaiting: items.length, approved: 0, published: 0, retired: 0, needs_changes: 0, rejected: 0 }],
  checks: { software: { pass: 2 } }, total: items.length,
  counts: { awaiting_medical_review: items.length, needs_changes: 1, approved: 2, published: 3, retired: 0, rejected: 0, blocked: 5, stale: 0 },
  answer_distribution: { A: 4, B: 3, C: 2, D: 1 }, acervo: 2, items, ...over,
});
const ESTIMATE = { chamadas_min: 18, chamadas_max: 36, usd_min: 0.5, usd_max: 1.25, sem_preco: [], ias: { criadora: "openai/gpt-teste", conferentes: ["anthropic/claude-teste"] }, acervo: 2, ia_pendente: [], teto: { ligado: false, mensal: null, por_execucao: null } };

const fetchCalls: { path: string; body: any }[] = [];
let fetchRoutes: Record<string, (body: any) => any> = {};
function setFetch() {
  (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) => {
    const path = String(url).replace("/api/content-hub", "");
    const body = init.body ? JSON.parse(init.body) : null;
    fetchCalls.push({ path, body });
    if (path === "/status") return new Response(JSON.stringify({ pending: [] }), { status: 200, headers: { "content-type": "application/json" } });
    const handler = fetchRoutes[path];
    if (!handler) return new Response(JSON.stringify({ error: `rota não simulada: ${path}` }), { status: 404, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(handler(body)), { status: 200, headers: { "content-type": "application/json" } });
  });
}
let rpcs: Record<string, (args: any) => any> = {};
const call = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const mount = (secao = "ineditas") =>
  render(
    <MemoryRouter initialEntries={[`/?aba=conteudo&secao=${secao}`]}>
      <ContentHub isAdmin isStaff />
    </MemoryRouter>
  );

beforeEach(() => {
  boot = { role: "admin", profile: { name: "Adm" }, reviewer_areas: [] };
  fetchCalls.length = 0;
  fetchRoutes = {};
  rpcs = {
    app_draft_questions: () => list([base()]),
    app_staziamed_topics: () => [{ area: "PEDIATRIA", topic: "Otite média aguda", total: 12 }, { area: "PEDIATRIA", topic: "Bronquiolite", total: 9 }],
    app_staziamed_requests: () => [],
    app_draft_question_detail: () => ({ draft: base(), events: [], proposals: [], similar_question: null, request: null }),
  };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    const h = rpcs[fn];
    if (!h) throw new Error(`rpc não simulada: ${fn}`);
    return h(args);
  });
  setFetch();
});
afterEach(cleanup);

describe("Seção Questões StaziaMed", () => {
  it("a aba se chama 'Questões inéditas' (pedido do dono, 2026-10-12) e ?secao=ineditas continua abrindo", async () => {
    mount();
    expect(await screen.findByText(/não são questões oficiais do Inep/i)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Questões inéditas" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("tab", { name: "Questões StaziaMed" })).toBeNull();
  });

  it("textos da Central: 'Questões inéditas' nos materiais", () => {
    expect(MATERIAL_KIND.questions).toBe("Questões inéditas");
  });

  it("sem acervo: 'Cadastre fontes oficiais na Central de Conteúdo' com link para Fontes oficiais e Gerar desabilitado", async () => {
    rpcs.app_draft_questions = () => list([], { acervo: 0 });
    mount();
    expect(await screen.findByText("Cadastre fontes oficiais na Central de Conteúdo")).toBeTruthy();
    expect((await screen.findByRole("button", { name: "Calcular custo" })).hasAttribute("disabled")).toBe(true);
    expect((screen.getByRole("button", { name: "Confirmar e gerar" })).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Ir para Fontes oficiais" }));
    expect(await screen.findByRole("tab", { name: "Fontes oficiais" })).toBeTruthy();
  });

  it("gerar: o custo aparece antes; confirmar cria o pedido; vaga pulada mostra 'sem fonte oficial'", async () => {
    fetchRoutes["/questoes-staziamed/estimativa"] = () => ESTIMATE;
    fetchRoutes["/questoes-staziamed/pedidos"] = () => ({ id: "r1" });
    let created = false;
    rpcs.app_staziamed_requests = () =>
      created
        ? [{ id: "r1", mode: "tema", area: "PEDIATRIA", topic: "Otite média aguda", count: 3, state: "concluido", created_at: "2026-10-12T10:00:00Z", cost_usd: 0.4, created_by_email: "ed@t.dev",
            summary: { geradas: 1, puladas: 1, descartadas: 1 },
            slots: [
              { slot: 1, area: "PEDIATRIA", topic: "Otite média aguda", target: "B", state: "gerada", reason: null, job_status: "succeeded" },
              { slot: 2, area: "PEDIATRIA", topic: "Otite média aguda", target: "C", state: "pulada", reason: "sem fonte oficial", job_status: "succeeded" },
              { slot: 3, area: "PEDIATRIA", topic: "Otite média aguda", target: "D", state: "descartada", reason: "Validação: O trecho citado não aparece literalmente", job_status: "succeeded" },
            ] }]
        : [];
    mount();
    fireEvent.change(await screen.findByLabelText("Área"), { target: { value: "PEDIATRIA" } });
    fireEvent.change(await screen.findByLabelText("Tema"), { target: { value: "Otite média aguda" } });
    expect(screen.getByRole("button", { name: "Confirmar e gerar" }).hasAttribute("disabled")).toBe(true); // custo antes
    fireEvent.click(screen.getByRole("button", { name: "Calcular custo" }));
    expect(await screen.findByText("18 a 36 chamadas de IA")).toBeTruthy();
    expect(screen.getByText(/US\$ 0,50 a US\$ 1,25/)).toBeTruthy();
    expect(screen.getByText(/openai\/gpt-teste/)).toBeTruthy();
    created = true;
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e gerar" }));
    await waitFor(() => expect(fetchCalls.some((c) => c.path === "/questoes-staziamed/pedidos")).toBe(true));
    expect(fetchCalls.find((c) => c.path === "/questoes-staziamed/pedidos")!.body).toEqual({ modo: "tema", area: "PEDIATRIA", tema: "Otite média aguda", quantidade: 3 });
    expect((await screen.findAllByText(/— sem fonte oficial/)).length).toBe(1);
    expect(screen.getByText(/Validação: O trecho citado não aparece literalmente/)).toBeTruthy();
    expect(screen.getByText("1 geradas")).toBeTruthy();
  });

  it("custo desconhecido quando falta preço: diz de qual modelo e não inventa número", async () => {
    fetchRoutes["/questoes-staziamed/estimativa"] = () => ({ ...ESTIMATE, usd_min: null, usd_max: null, sem_preco: ["openai/gpt-teste"], ia_pendente: ["Claude está desligada na Central de IAs."] });
    mount();
    fireEvent.change(await screen.findByLabelText("Área"), { target: { value: "PEDIATRIA" } });
    fireEvent.change(await screen.findByLabelText("Tema"), { target: { value: "Bronquiolite" } });
    fireEvent.click(screen.getByRole("button", { name: "Calcular custo" }));
    expect(await screen.findByText("custo desconhecido")).toBeTruthy();
    expect(screen.getByText(/sem preço cadastrado na Central de IAs para: openai\/gpt-teste/)).toBeTruthy();
    expect(screen.getByText("Claude está desligada na Central de IAs.")).toBeTruthy();
  });

  it("lista: filtros chegam a app_draft_questions; contagens e distribuição do gabarito; Conferir pendentes mostra o custo antes", async () => {
    fetchRoutes["/questoes-staziamed/estimativa"] = (b) => (b.acao === "conferir" ? { ...ESTIMATE, chamadas_min: 10, chamadas_max: 10, rascunhos: ["d1", "d2"] } : ESTIMATE);
    fetchRoutes["/questoes-staziamed/conferir"] = () => ({ na_fila: 2, ja_na_fila: 0 });
    mount();
    expect(await screen.findByText("5 bloqueadas sem fonte oficial")).toBeTruthy();
    expect(screen.getByLabelText("Gabarito das publicadas").textContent).toContain("A: 4");
    fireEvent.change(screen.getByLabelText("Filtrar por origem"), { target: { value: "gerador_antigo" } });
    fireEvent.click(screen.getByLabelText("Bloqueadas sem fonte oficial"));
    fireEvent.change(screen.getByLabelText("Semelhança mínima"), { target: { value: "55" } });
    await waitFor(() => expect(call("app_draft_questions").some((c: any[]) => c[1].p_origin === "gerador_antigo" && c[1].p_blocked === true && c[1].p_min_similarity === 55)).toBe(true));
    fireEvent.click(screen.getByRole("radio", { name: "Publicadas" }));
    await waitFor(() => expect(call("app_draft_questions").some((c: any[]) => c[1].p_status === "published")).toBe(true));
    fireEvent.click(screen.getByLabelText("Sem tema"));
    await waitFor(() => expect(call("app_draft_questions").some((c: any[]) => c[1].p_topic === "")).toBe(true));
    // conferir pendentes: o custo vem antes, a confirmação depois
    fireEvent.click(screen.getByRole("button", { name: "Conferir pendentes" }));
    expect(await screen.findByText("10 chamadas de IA")).toBeTruthy();
    expect(fetchCalls.find((c) => c.path === "/questoes-staziamed/estimativa" && c.body.acao === "conferir")!.body.filtro).toMatchObject({ origin: "gerador_antigo", blocked: true, min_similarity: 55, status: "published", topic: "" });
    expect(fetchCalls.some((c) => c.path === "/questoes-staziamed/conferir")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar conferência de 2 rascunhos" }));
    await waitFor(() => expect(fetchCalls.find((c) => c.path === "/questoes-staziamed/conferir")?.body).toEqual({ rascunhos: ["d1", "d2"] }));
  });

  it("revisor sem papel de equipe não vê Gerar nem Conferir pendentes", async () => {
    boot = { role: "student", profile: { name: "Rev" }, reviewer_areas: ["PEDIATRIA"] };
    render(
      <MemoryRouter initialEntries={["/?aba=conteudo&secao=ineditas"]}>
        <ContentHub isAdmin={false} isStaff={false} />
      </MemoryRouter>
    );
    expect(await screen.findByText(/Você pode decidir nas áreas: Pediatria/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Calcular custo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Conferir pendentes" })).toBeNull();
  });
});

describe("Rascunho aberto", () => {
  const open = async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Otite no lactente/ }));
  };

  it("abrir: citação da apostila riscada com 'não é fonte oficial'; citação oficial com órgão, documento, versão, página e trecho; oficial mais parecida; trilha", async () => {
    const draft = base({ source_citations: [OFICIAL, LEGACY_CITATION], generation: { prompts: { staziamed_questao: "1.0.0" }, modelos: { criacao: { model: "gpt-teste" } }, reescrita: { feita: true }, custo_usd: 0.12 } });
    rpcs.app_draft_questions = () => list([base({ source_citations: [OFICIAL, LEGACY_CITATION], blocked_no_source: true, stale_sources: ["PCDT de Otite"] })]);
    rpcs.app_draft_question_detail = () => ({
      draft,
      events: [{ kind: "gerada", at: "2026-10-12T10:00:00Z", actor_email: null, note: null }, { kind: "editada", at: "2026-10-12T11:00:00Z", actor_email: "ed@t.dev", note: "Equilibrar gabarito: A → C" }],
      proposals: [],
      similar_question: { id: "q1", code: "REV-2024-Q10", exam_label: "Revalida 2024/1", statement: "Texto da questão oficial parecida.", options: [] },
      request: null,
    });
    await open();
    expect(await screen.findByText("Texto da questão oficial parecida.")).toBeTruthy();
    expect(screen.getByText(/Revalida 2024\/1, REV-2024-Q10/)).toBeTruthy();
    const legacy = screen.getByText(/Apostila do curso\.pdf/);
    expect(legacy.closest("li")!.getAttribute("style")).toMatch(/line-through/);
    expect(within(legacy.closest("li")!).getByText("não é fonte oficial")).toBeTruthy();
    const fresh = screen.getByText("PCDT de Otite", { selector: "li strong" }).closest("li")!;
    expect(fresh.textContent).toContain("Ministério da Saúde");
    expect(fresh.textContent).toContain("versão 2026");
    expect(fresh.textContent).toContain("p. 7");
    expect(fresh.textContent).toContain("indica-se amoxicilina 90 mg/kg/dia por 10 dias");
    expect(screen.getAllByText("Bloqueada: sem fonte oficial").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/fonte desatualizada: PCDT de Otite/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Gerada pelo servidor/)).toBeTruthy();
    expect(screen.getByText(/Equilibrar gabarito: A → C/)).toBeTruthy();
    expect(screen.getByText(/com uma reescrita/)).toBeTruthy();
  });

  it("editar: avisa que conferências e revisão voltam a zero e salva com o hash aberto", async () => {
    rpcs.app_draft_question_save = (a) => ({ id: a.p_id, content_hash: "b".repeat(64), status: "awaiting_medical_review", changed: true });
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    expect(await screen.findByText("Salvar zera as conferências e a revisão médica deste rascunho.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Enunciado"), { target: { value: "Enunciado editado pela equipe, com mais detalhes do caso." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(call("app_draft_question_save")).toHaveLength(1));
    const args = call("app_draft_question_save")[0][1];
    expect(args.p_hash).toBe(HASH);
    expect(args.p_content.stem).toBe("Enunciado editado pela equipe, com mais detalhes do caso.");
    expect(args.p_content.topic).toBe("Otite média aguda");
  });

  it("buscar fonte: o custo vem antes; proposta lado a lado; 'Usar estas fontes' desabilitado na incompleta; usar pede revisão da aplicação", async () => {
    fetchRoutes["/questoes-staziamed/estimativa"] = () => ({ ...ESTIMATE, chamadas_min: 3, chamadas_max: 3 });
    fetchRoutes["/questoes-staziamed/rascunhos/d1/buscar-fonte"] = () => ({ job_id: "j1", ja_na_fila: false });
    const claims = (complete: boolean) => [
      { kind: "decisao_clinica", text: "Tratar a otite com amoxicilina.", status: "encontrada", citation: OFICIAL, reason: null },
      { kind: "numero", text: "Amoxicilina 90 mg/kg/dia por 10 dias.", status: complete ? "encontrada" : "nao_encontrada", citation: complete ? OFICIAL : null, reason: complete ? null : "Nenhum trecho de fonte oficial trata desta afirmação." },
    ];
    let proposals = [{ id: "pr1", created_at: "2026-10-12T10:00:00Z", state: "pendente", complete: false, current: true, claims: claims(false) }];
    rpcs.app_draft_question_detail = () => ({ draft: base({ update_application: "Conforme a apostila." }), events: [], proposals, similar_question: null, request: null });
    rpcs.app_draft_source_accept = () => ({ draft_id: "d1", content_hash: "c".repeat(64), revisar_aplicacao: true });
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Buscar fonte oficial" }));
    expect(await screen.findByText("3 chamadas de IA")).toBeTruthy();
    expect(fetchCalls.some((c) => c.path.endsWith("/buscar-fonte"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar busca de fonte" }));
    await waitFor(() => expect(fetchCalls.some((c) => c.path === "/questoes-staziamed/rascunhos/d1/buscar-fonte")).toBe(true));
    // proposta incompleta: lado a lado, "não encontrada" e botão desabilitado
    expect((await screen.findByRole("button", { name: "Usar estas fontes" })).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Nenhum trecho de fonte oficial trata desta afirmação.")).toBeTruthy();
    expect(screen.getByText("não encontrada")).toBeTruthy();
    cleanup();
    proposals = [{ ...proposals[0], complete: true, claims: claims(true) }];
    await open();
    const use = await screen.findByRole("button", { name: "Usar estas fontes" });
    expect(use.hasAttribute("disabled")).toBe(false);
    fireEvent.click(use);
    await waitFor(() => expect(call("app_draft_source_accept")).toHaveLength(1));
    expect(call("app_draft_source_accept")[0][1]).toEqual({ p_proposal_id: "pr1" });
    expect(await screen.findByText("Revise o campo 'aplicação da atualização': ele fala da apostila.")).toBeTruthy();
  });

  it("Aprovar desabilitado lista o que falta; com tudo em dia exige 'Conferi as fontes citadas' e manda o hash", async () => {
    rpcs.app_draft_questions = () => list([base({ can_review: true, approval_blockers: ["Falta o tema.", "Conferência pendente: Atualidade."] })]);
    rpcs.app_draft_question_decide = () => true;
    await open();
    const approve = await screen.findByRole("button", { name: "Aprovar" });
    expect(approve.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Ainda não dá para aprovar")).toBeTruthy();
    expect(screen.getByText("Falta o tema.")).toBeTruthy();
    expect(screen.getByText("Conferência pendente: Atualidade.")).toBeTruthy();
    cleanup();
    rpcs.app_draft_questions = () => list([base({ can_review: true, approval_blockers: [] })]);
    await open();
    const ok = await screen.findByRole("button", { name: "Aprovar" });
    expect(ok.hasAttribute("disabled")).toBe(true); // falta marcar as fontes
    fireEvent.click(screen.getByLabelText("Conferi as fontes citadas"));
    expect(ok.hasAttribute("disabled")).toBe(false);
    fireEvent.change(screen.getByLabelText(/Observação/), { target: { value: "Li o trecho oficial." } });
    fireEvent.click(ok);
    await waitFor(() => expect(call("app_draft_question_decide")).toHaveLength(1));
    expect(call("app_draft_question_decide")[0][1]).toEqual({ p_id: "d1", p_decision: "approved", p_note: "Li o trecho oficial.", p_hash: HASH, p_sources_checked: true });
  });

  it("administrador: Publicar mostra a prévia e publica; Recolher pede motivo; editor não vê Publicar", async () => {
    rpcs.app_draft_questions = () => list([base({ status: "approved", situacao: "approved", can_publish: true })]);
    rpcs.app_staziamed_preview = () => ({ number: 7, code: "STZ-0007", statement: "Enunciado da prévia.", support: null, options: [{ id: "A", text: "Alt A" }, { id: "B", text: "Alt B" }], correct_option: "A", blockers: [] });
    rpcs.app_staziamed_publish = () => ({ question_id: "staziamed_q0007", code: "STZ-0007", number: 7, action: "publicada" });
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Publicar" }));
    const preview = await screen.findByLabelText("Prévia como o aluno vê");
    expect(within(preview).getByText("Questão StaziaMed · nº 7")).toBeTruthy();
    expect(within(preview).getByText("não é questão oficial do Inep")).toBeTruthy();
    expect(within(preview).getByText("Enunciado da prévia.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar publicar" }));
    await waitFor(() => expect(call("app_staziamed_publish")).toHaveLength(1));
    expect(call("app_staziamed_publish")[0][1]).toEqual({ p_id: "d1", p_hash: HASH });
    cleanup();
    // publicada: Recolher pede motivo
    rpcs.app_draft_questions = () => list([base({ status: "approved", situacao: "published", published_hash: HASH, question_id: "staziamed_q0007", question: { id: "staziamed_q0007", code: "STZ-0007", number: 7, retired_at: null } })]);
    rpcs.app_staziamed_retire = () => ({ question_id: "staziamed_q0007", retired_at: "2026-10-12T12:00:00Z" });
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Recolher" }));
    const confirm = screen.getByRole("button", { name: "Confirmar recolhimento" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/Motivo para recolher/), { target: { value: "Fonte revista." } });
    fireEvent.click(confirm);
    await waitFor(() => expect(call("app_staziamed_retire")).toHaveLength(1));
    expect(call("app_staziamed_retire")[0][1]).toEqual({ p_id: "d1", p_reason: "Fonte revista." });
    cleanup();
    // editor (não administrador): sem caixa de publicação
    rpcs.app_draft_questions = () => list([base({ status: "approved", situacao: "approved", can_publish: false })]);
    render(
      <MemoryRouter initialEntries={["/?aba=conteudo&secao=ineditas"]}>
        <ContentHub isAdmin={false} isStaff />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /Otite no lactente/ }));
    await screen.findByRole("button", { name: "Editar" });
    expect(screen.queryByRole("button", { name: "Publicar" })).toBeNull();
    expect(screen.queryByText("Publicação (administrador)")).toBeNull();
  });

  it("Equilibrar gabarito chama a função e recarrega", async () => {
    rpcs.app_draft_balance_answer = () => ({ from: "A", to: "C", content_hash: "d".repeat(64) });
    await open();
    const before = call("app_draft_questions").length;
    fireEvent.click(await screen.findByRole("button", { name: "Equilibrar gabarito" }));
    await waitFor(() => expect(call("app_draft_balance_answer")).toHaveLength(1));
    expect(call("app_draft_balance_answer")[0][1]).toEqual({ p_id: "d1", p_hash: HASH });
    await waitFor(() => expect(call("app_draft_questions").length).toBeGreaterThan(before));
  });
});
