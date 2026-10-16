/**
 * Telas do grupo B na Central de Conteúdo (jsdom, banco e servidor simulados): Unidades (aviso honesto de publicação, prévia
 * "Publicar para os alunos", retirar, arquivo final sem pop-up), conferência de dose só pelo revisor da área, correção de
 * evidências e a revisão médica dos materiais visuais. Textos de teste, sem conteúdo clínico real.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { Units } from "../novo/app/admin/content/Units.jsx";
import { VisualMaterials } from "../novo/app/admin/content/visual/VisualMaterials.jsx";

const VERSAO = (over: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  version: { id: "v1", version: 1, status: "approved", content: { sections: [] }, content_hash: "h", generated_by_model: "modelo-de-teste", review_flags: [], scope_note: null, candidate_reason: null, ...over },
  title: "Unidade de teste",
  area_code: "GINECOLOGIA_OBSTETRICIA",
  problems: [],
  claims: [{ id: "c1", statement: "Afirmação de teste com dose.", critical_kinds: ["dose"], critical_checked: false, evidence: [{ source: "Fonte A", organ: "Órgão", version: "2022", page: 3, quote: "Trecho citado.", verdict: "compatible", stale: false, numeric_check: { ok: true } }], status: "compatible" }],
  materials: [{ id: "m1", kind: "lesson", content: { sections: [], references: [] }, generated_by_model: null, renders: [{ id: "r1", format: "pdf", current: true, check: { ok: true } }] }],
  approvals: [],
  publications: [],
  ...extra,
});
const PREVIA = (over: Record<string, unknown> = {}) => ({
  version_id: "v1", status: "approved", title: "Unidade de teste", problems: [], shadow_mode: false, publish_enabled: true,
  lesson: { action: "create", id: null, title: "Unidade de teste", topic: "Tema de teste", area: "PEDIATRIA", area_label: "Pediatria" },
  similar: [], key_points: 2, cards: { added: 3, kept: 0, hidden: 0, total: 3 },
  student_text: "Material StaziaMed · revisado por médico da área em 12/10/2026 · não é material oficial do Inep\n\nTexto da aula de teste.",
  student_key_points: ["Ponto um.", "Ponto dois."], ...over,
});

let dados: { versao: any; previa: any; podeConferir: any; evidencias: any };
const chamadas: { fn: string; args: any }[] = [];

beforeEach(() => {
  chamadas.length = 0;
  dados = { versao: VERSAO(), previa: PREVIA(), podeConferir: { areas: ["GINECOLOGIA_OBSTETRICIA"], can: false }, evidencias: [] };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    chamadas.push({ fn, args });
    if (fn === "app_ch_unit_version") return dados.versao;
    if (fn === "app_ch_units") return [];
    if (fn === "app_ch_publish_preview") return dados.previa;
    if (fn === "app_ch_claim_can_confirm") return dados.podeConferir;
    if (fn === "app_ch_claim_confidence") return null;
    if (fn === "app_ch_claim_evidence") return dados.evidencias;
    return true;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ctx = (extra: Record<string, unknown> = {}) => ({ params: new URLSearchParams({ versao: "v1" }), go: vi.fn(), isAdmin: true, isStaff: true, reviewerAreas: [], ...extra });
const chamou = (fn: string) => chamadas.filter((c) => c.fn === fn);

describe("Unidades: o aviso diz a verdade e não promete o que não existe", () => {
  it("lista vazia não promete unidades criadas pela equipe (não há botão para isso)", async () => {
    render(<Units {...ctx({ params: new URLSearchParams() })} />);
    expect(await screen.findByText("Nenhuma unidade aqui")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/criadas pela equipe/);
    expect(document.body.textContent).toMatch(/cada documento enviado gera um rascunho por tema/);
  });

  it("sem bloqueios de conteúdo mas ainda não aprovada: o aviso diz o que falta (não 'nenhum bloqueio' seco)", async () => {
    dados.versao = VERSAO({ status: "awaiting_review" });
    render(<Units {...ctx()} />);
    expect(await screen.findByText("Nenhum bloqueio de conteúdo encontrado")).toBeTruthy();
    expect(document.body.textContent).toMatch(/Falta a aprovação: a revisão médica \(administrador ou revisor da área\) e a editorial/);
    expect(screen.queryByRole("button", { name: /Publicar para os alunos/ })).toBeNull();
  });

  it("aprovada: administrador é levado à prévia; quem não é administrador lê que a publicação é do administrador", async () => {
    render(<Units {...ctx()} />);
    expect(await screen.findByText(/A versão está aprovada: clique em Publicar para ver a prévia/)).toBeTruthy();
    cleanup();
    render(<Units {...ctx({ isAdmin: false })} />);
    expect(await screen.findByText(/A publicação é feita por um administrador/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Publicar para os alunos/ })).toBeNull();
  });

  it("com bloqueios lista cada um", async () => {
    dados.versao = VERSAO({}, { problems: ["Afirmação sem fonte oficial vigente (nível A a D): Texto."] });
    render(<Units {...ctx()} />);
    expect(await screen.findByText("O que falta para publicar (1)")).toBeTruthy();
    expect(screen.getByText(/sem fonte oficial vigente/)).toBeTruthy();
  });
});

describe("Prévia 'Publicar para os alunos'", () => {
  const abrir = async () => {
    render(<Units {...ctx()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Publicar para os alunos…/ }));
    await screen.findByText("Veja o que muda para o aluno antes de confirmar. Nada é publicado até você clicar no botão no fim.");
  };

  it("mostra aula nova, pontos-chave, flashcards e o texto como o aluno verá; a prévia não publica nada", async () => {
    await abrir();
    expect(document.body.textContent).toMatch(/Aula nova.*em Estudar › Aulas.*“Unidade de teste”.*Pediatria.*tema Tema de teste/);
    expect(document.body.textContent).toMatch(/3 novo\(s\) · 0 mantido\(s\) · 0 saem do baralho/);
    expect(document.body.textContent).toMatch(/2 ponto\(s\)-chave/);
    expect(document.body.textContent).toMatch(/não entram nesta publicação: elas seguem pela fila de Questões inéditas/);
    fireEvent.click(screen.getByRole("button", { name: /Ver como o aluno vai ver/ }));
    expect(screen.getByText(/Texto da aula de teste\./)).toBeTruthy();
    expect(screen.getByText("Ponto dois.")).toBeTruthy();
    expect(chamou("app_ch_publish")).toHaveLength(0);
  });

  it("modo sombra ligado ou publicação desligada: o botão fica desligado e o motivo aparece", async () => {
    dados.previa = PREVIA({ shadow_mode: true, publish_enabled: false });
    await abrir();
    expect(screen.getByText("Modo sombra ligado")).toBeTruthy();
    expect(screen.getByText("Publicação desligada")).toBeTruthy();
    const botao = screen.getAllByRole("button", { name: "Publicar para os alunos" }).pop() as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.click(botao);
    expect(chamou("app_ch_publish")).toHaveLength(0);
  });

  it("aula parecida exige 'Publicar mesmo assim' antes de liberar o botão; confirmar chama o banco com a marca", async () => {
    dados.previa = PREVIA({ similar: [{ id: "x", title: "Aula antiga parecida" }] });
    await abrir();
    const botao = () => screen.getAllByRole("button", { name: "Publicar para os alunos" }).pop() as HTMLButtonElement;
    expect(screen.getByText("Já existe aula parecida publicada")).toBeTruthy();
    expect(botao().disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Publicar mesmo assim/ }));
    expect(botao().disabled).toBe(false);
    fireEvent.click(botao());
    await waitFor(() => expect(chamou("app_ch_publish")).toHaveLength(1));
    expect(chamou("app_ch_publish")[0].args).toEqual({ p_version_id: "v1", p_options: { confirm_similar: true } });
    expect(await screen.findByText(/Publicada\. A aula já está em Estudar › Aulas para todos os alunos, e os flashcards no baralho StaziaMed\./)).toBeTruthy();
  });

  it("pendências do banco travam o botão e aparecem na lista", async () => {
    dados.previa = PREVIA({ problems: ["Afirmação sem fonte oficial vigente (nível A a D): Algo."] });
    await abrir();
    expect(screen.getAllByText(/sem fonte oficial vigente/).length).toBeGreaterThan(0);
    expect((screen.getAllByRole("button", { name: "Publicar para os alunos" }).pop() as HTMLButtonElement).disabled).toBe(true);
  });

  it("SQL novo ainda não colado no banco: a tela explica o que fazer, sem erro técnico", async () => {
    const base = backend.rpc.getMockImplementation();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_ch_publish_preview") throw new Error("Could not find the function public.app_ch_publish_preview(p_version_id) in the schema cache");
      return base(fn, args);
    });
    render(<Units {...ctx()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Publicar para os alunos…/ }));
    expect(await screen.findByText("A publicação nova ainda não está no banco")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/schema cache|PGRST/);
  });

  it("versão no ar: Criar versão para corrigir cria o rascunho e abre a versão nova", async () => {
    dados.versao = VERSAO({ status: "published" });
    const go = vi.fn();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      chamadas.push({ fn, args });
      if (fn === "app_ch_unit_version") return dados.versao;
      if (fn === "app_ch_new_version") return "v2";
      return null;
    });
    render(<Units {...ctx({ go })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Criar versão para corrigir" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("unidades", { versao: "v2" }));
    expect(chamou("app_ch_new_version")[0].args).toEqual({ p_from_version_id: "v1" });
  });

  it("versão publicada: Retirar pede o motivo e avisa que nada do aluno é apagado", async () => {
    dados.versao = VERSAO({ status: "published" });
    render(<Units {...ctx()} />);
    const botao = (await screen.findByRole("button", { name: "Retirar" })) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Motivo da retirada"), { target: { value: "Erro encontrado." } });
    fireEvent.click(screen.getByRole("button", { name: "Retirar" }));
    await waitFor(() => expect(chamou("app_ch_retire")).toHaveLength(1));
    expect(await screen.findByText(/A aula e os flashcards saem da lista do aluno; nada do que os alunos já fizeram é apagado\./)).toBeTruthy();
  });
});

describe("Conferência de dose só pelo revisor da área e correção de evidências", () => {
  it("quem não é revisor da área não vê o botão de confirmar e lê de quem é a conferência", async () => {
    render(<Units {...ctx()} />);
    await screen.findByText("Afirmação de teste com dose.");
    expect(await screen.findByText(/é de um revisor médico cadastrado na área \(Ginecologia e Obstetrícia\)/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Confirmar conferência/ })).toBeNull();
  });

  it("o revisor da área vê o botão e confirma", async () => {
    dados.podeConferir = { areas: ["GINECOLOGIA_OBSTETRICIA"], can: true };
    render(<Units {...ctx()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Confirmar conferência de/ }));
    await waitFor(() => expect(chamou("app_ch_confirm_critical")).toHaveLength(1));
  });

  it("afirmação sem área explica o que fazer", async () => {
    dados.podeConferir = { areas: [], can: false };
    render(<Units {...ctx()} />);
    expect(await screen.findByText(/ainda não tem área: classifique o trecho ou a unidade primeiro/)).toBeTruthy();
  });

  it("Corrigir evidências: descartar exige motivo de 10 caracteres e chama o banco", async () => {
    dados.evidencias = [{ id: "e1", source: "Fonte A", organ: "Órgão", version: "2022", page: 3, quote: "Trecho citado.", verdict: "conflicting", stale: false, discarded: false, settled: false }];
    render(<Units {...ctx()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Corrigir evidências" }));
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    const botao = screen.getByRole("button", { name: "Descartar esta evidência" }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Motivo do descarte/), { target: { value: "Ligada à fonte errada." } });
    fireEvent.click(screen.getByRole("button", { name: "Descartar esta evidência" }));
    await waitFor(() => expect(chamou("app_ch_discard_evidence")).toHaveLength(1));
    expect(chamou("app_ch_discard_evidence")[0].args).toEqual({ p_evidence_id: "e1", p_reason: "Ligada à fonte errada." });
  });
});

describe("Arquivo final abre sem ser barrado como pop-up (CC17)", () => {
  beforeEach(() => {
    (URL as any).createObjectURL = vi.fn(() => "blob:arquivo-de-teste");
    (globalThis as any).fetch = vi.fn(async () => new Response(new Blob(["%PDF"]), { status: 200, headers: { "content-type": "application/pdf" } }));
  });

  it("a aba abre já no clique, antes de baixar o arquivo, e depois recebe o endereço", async () => {
    const aba: any = { closed: false, location: { href: "" }, close: vi.fn() };
    const abrirJanela = vi.spyOn(window, "open").mockReturnValue(aba);
    render(<Units {...ctx()} />);
    fireEvent.click(await screen.findByRole("button", { name: /PDF.*conferido/ }));
    expect(abrirJanela).toHaveBeenCalledTimes(1);
    expect(abrirJanela.mock.calls[0][0]).toBe("about:blank"); // chamada no mesmo clique, antes de qualquer espera
    await waitFor(() => expect(aba.location.href).toBe("blob:arquivo-de-teste"));
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
  });

  it("se o navegador não abrir a aba, o arquivo é baixado e a tela avisa", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const clique = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<Units {...ctx()} />);
    fireEvent.click(await screen.findByRole("button", { name: /PDF.*conferido/ }));
    expect(await screen.findByText(/O navegador não abriu a aba nova, então o arquivo foi baixado\./)).toBeTruthy();
    expect(clique).toHaveBeenCalled();
  });

  it("erro ao baixar fecha a aba em branco e mostra o erro", async () => {
    const aba: any = { closed: false, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(aba);
    (globalThis as any).fetch = vi.fn(async () => new Response(JSON.stringify({ error: "Arquivo não disponível." }), { status: 403, headers: { "content-type": "application/json" } }));
    render(<Units {...ctx()} />);
    fireEvent.click(await screen.findByRole("button", { name: /PDF.*conferido/ }));
    expect(await screen.findByText("Arquivo não disponível.")).toBeTruthy();
    expect(aba.close).toHaveBeenCalled();
  });
});

describe("Materiais visuais: revisão médica antes de baixar (CC28)", () => {
  const MATERIAL = { id: "11111111-1111-4111-8111-111111111111", model: "feed", specialty_key: "ginecologia", specialty_label: "Ginecologia", title: "Card com dose", card_id: null, batch_label: null, batch_order: 1, current_version: 1, created_at: "2026-10-06T12:00:00Z", updated_at: "2026-10-06T12:00:00Z", created_by_name: "Adm", updated_by_name: "Adm", duplicated_from: null };
  const pagina = (review: any) => ({
    ...MATERIAL,
    versions: [{ id: "vv1", version: 1, content: { model: "feed", specialty: { key: "ginecologia", label: "Ginecologia" }, titulo: "Card com dose", pontos_chave: [] }, render_status: "ready", created_at: "2026-10-06T12:00:00Z", created_by_name: "Adm", check_result: { ok: true, problems: [] }, medical_review: review, files: [{ id: "f1", format: "png", side: "single", pages: 1 }] }],
  });
  const ctxV = (id?: string) => ({ params: new URLSearchParams(id ? { id } : {}), go: vi.fn(), status: { worker: true }, isAdmin: true, isStaff: true });

  it("pendente: aviso, download travado e o revisor da área registra a revisão", async () => {
    let revisao: any = { required: true, done: false, area: "GINECOLOGIA_OBSTETRICIA", can_review: true };
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      chamadas.push({ fn, args });
      if (fn === "app_ch_visual_material") return pagina(revisao);
      if (fn === "app_ch_visual_review") {
        revisao = { required: true, done: true, at: "2026-10-12T12:00:00Z", by_name: "Dra. Revisora", note: "Dose conferida." };
        return { reviewed: true };
      }
      return true;
    });
    render(<VisualMaterials {...ctxV(MATERIAL.id)} />);
    expect(await screen.findByText("Este material tem dose ou contraindicação: falta a revisão médica")).toBeTruthy();
    for (const b of screen.getAllByRole("button", { name: /PNG/ })) expect((b as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("O que foi conferido (opcional)"), { target: { value: "Dose conferida." } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar revisão médica" }));
    await waitFor(() => expect(chamou("app_ch_visual_review")).toHaveLength(1));
    expect(chamou("app_ch_visual_review")[0].args).toEqual({ p_version_id: "vv1", p_note: "Dose conferida." });
    expect(await screen.findByText("Revisado por médico da área")).toBeTruthy();
    await waitFor(() => { for (const b of screen.getAllByRole("button", { name: /PNG/ })) expect((b as HTMLButtonElement).disabled).toBe(false); });
  });

  it("quem não é revisor da área vê o aviso, sem o botão de registrar", async () => {
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_ch_visual_material" ? pagina({ required: true, done: false, area: "GINECOLOGIA_OBSTETRICIA", can_review: false }) : true));
    render(<VisualMaterials {...ctxV(MATERIAL.id)} />);
    expect(await screen.findByText(/O revisor da área precisa abrir este material aqui e registrar a revisão\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Registrar revisão médica" })).toBeNull();
  });

  it("material sem dose não mostra aviso nenhum e baixa direto; a lista marca o que aguarda revisão", async () => {
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_ch_visual_material" ? pagina({ required: false, done: false }) : true));
    render(<VisualMaterials {...ctxV(MATERIAL.id)} />);
    await screen.findByText("Card com dose");
    expect(document.body.textContent).not.toMatch(/falta a revisão médica/);
    for (const b of screen.getAllByRole("button", { name: /PNG/ })) expect((b as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_ch_visual_list" ? [{ ...MATERIAL, status: "ready", files: 1, review_pending: true }] : true));
    render(<VisualMaterials {...ctxV()} />);
    expect(await screen.findByText("Aguardando revisão médica")).toBeTruthy();
  });
});
