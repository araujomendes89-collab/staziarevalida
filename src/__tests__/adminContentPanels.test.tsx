/**
 * Painéis de administração de Aulas e de Atualizações & Diretrizes (jsdom, banco simulado): digitar nas caixas de texto
 * chega ao banco, o aviso do conteúdo do app anterior aparece, a conferência médica e a publicação chamam as funções certas.
 * Atualizações (10/10/2026): só publica com conferência aprovada (AT03), recusar uma publicada avisa que sai do ar (AT01) e
 * mudar o texto de uma publicada avisa antes de salvar que ela sai do ar até nova conferência (AT02). O Registro mostra em
 * português quando uma atualização é publicada ou tirada do ar, com o tema e o motivo em linguagem simples; a retirada
 * feita pela migração 7800 aparece como "Retirada automática pela regra nova" (não como "conta excluída"), também nas
 * linhas sem a marca "automatica". As ações novas das Questões aparecem em português, com a questão (polimento 10/10/2026).
 * RG03 (11/10/2026): aulas, podcasts, Stazia Arena, Tutor e Central de IAs aparecem com nome e resumo em português (o
 * título da aula ou do episódio vem do banco), sem código técnico. RG02: papel e plano alterados dizem de quem foi.
 * RG05: o Registro tem páginas de 50 ações e filtros por tipo, pessoa e data (app_admin_audit_page).
 * RG01: o que se faz na Central de Conteúdo aparece no mesmo Registro, com o selo de origem, em português.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminLessons } from "../novo/app/admin/AdminLessons.jsx";
import { AdminUpdates } from "../novo/app/admin/AdminUpdates.jsx";
import { AdminAudit } from "../novo/app/admin/AdminPanels.jsx";

const LEGACY = {
  id: "u1", slug: "prot-x", area: "GINECOLOGIA_OBSTETRICIA", topic: "Atualização antiga de teste", subtopic: null, years: [2025], priority: 1,
  publication_label: "05/2025", institution: "Instituição", document_title: "Documento", source_url: null, before_text: "Antes.",
  timeline: [{ year: 2025, text: "Mudou." }], current_conduct: "Agora.", clinical_impact: null, exam_impact: null, trap: null, search_terms: "teste",
  flashcards: [], practice_questions: [], reviewed: false, reviewed_at: null, published: false, review_status: "pending", review_note: null,
  reviewer: null, source_checked_at: null, origin: "legacy_app", position: 1, can_review: true,
  legacy: { status_label: "VALIDADO_OFICIAL_SUS", last_verification_claim: "2026-08-30", original_url: "https://site.test/antigo", original_url_check: { http_status: 404, checked_on: "2026-10-06" }, cited_questions: [{ exam_code: "REV-2021-GO-45", claimed_answer: "Alternativa C", matched_question_id: "q45", matched_topic: "Doenças hipertensivas da gestação" }] },
};
const PUBLISHED = {
  ...LEGACY, id: "u2", slug: "prot-y", topic: "Atualização publicada de teste", origin: "manual", legacy: {}, source_url: "https://www.gov.br/teste",
  review_status: "approved", reviewed: true, reviewer: "Dra. Revisora", reviewed_at: "2026-10-06T12:00:00Z", review_note: "Conferido no documento.",
  source_checked_at: "2026-10-06T12:00:00Z", published: true,
};
// Uma página do Registro como o banco devolve (app_admin_audit_page, migração 9512).
const auditPage = (items: any[], extra: Record<string, unknown> = {}) => ({ total: items.length, limit: 50, offset: 0, actions: [...new Set(items.map((i) => i.action))], items, ...extra });
const OFF_AIR_NOTE = "Conteúdo alterado depois da conferência: revisar de novo. Saiu do ar para os alunos até a nova conferência; depois dela, o administrador publica outra vez.";

beforeEach(() => {
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_lessons") return { lessons: [] };
    if (fn === "app_lesson_topics") return [{ area: "PEDIATRIA", topic: "Bronquiolite", questions: 5 }];
    if (fn === "app_admin_save_lesson") return { id: "l1", ...args.p_lesson, key_points: args.p_lesson.key_points.filter((x: string) => x.trim()), materials: [], published: false, updated_at: "2026-10-06T12:00:00Z" };
    if (fn === "app_admin_guideline_updates") return { is_admin: true, review_areas: ["GINECOLOGIA_OBSTETRICIA"], items: [LEGACY] };
    if (fn === "app_admin_save_guideline_update") return { ...LEGACY, ...args.p_update };
    if (fn === "app_admin_review_guideline_update") return { is_admin: true, review_areas: ["GINECOLOGIA_OBSTETRICIA"], items: [{ ...LEGACY, review_status: "approved", reviewed: true, reviewer: "Dra. Revisora", reviewed_at: "2026-10-06T12:00:00Z", review_note: args.p_note }] };
    if (fn === "app_admin_publish_guideline_update") return { is_admin: true, review_areas: [], items: [{ ...LEGACY, published: args.p_published }] };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

describe("Aulas (painel)", () => {
  it("criar aula: resumo e pontos-chave digitados chegam ao banco", async () => {
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: "Nova aula" }));
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Bronquiolite" } });
    fireEvent.change(screen.getByLabelText("Título da aula"), { target: { value: "Aula de teste" } });
    fireEvent.change(screen.getByLabelText("Resumo & racionalidade clínica"), { target: { value: "Resumo digitado." } });
    fireEvent.change(screen.getByLabelText("Pontos-chave para o Revalida (um por linha)"), { target: { value: "Ponto 1\nPonto 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar aula" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_save_lesson", expect.anything()));
    const call = backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_admin_save_lesson")[1].p_lesson;
    expect(call).toMatchObject({ topic: "Bronquiolite", title: "Aula de teste", summary: "Resumo digitado.", key_points: ["Ponto 1", "Ponto 2"] });
    expect(await screen.findByText("Aula salva.")).toBeTruthy();
  });

  it("nova aula: materiais complementares escolhidos antes de criar sobem logo depois de salvar", async () => {
    const uploads: string[] = [];
    const saved = { id: "l1", area: "PEDIATRIA", topic: "Bronquiolite", title: "Aula de teste", key_points: [], materials: [] as any[], published: false, updated_at: "2026-10-06T12:00:00Z" };
    (globalThis as any).fetch = vi.fn(async (url: string, init: any) => {
      if (url === "/api/lessons/l1/upload") return new Response(JSON.stringify({ mode: "direct" }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.startsWith("/api/lessons/l1/materials?")) {
        const kind = new URL(url, "http://x").searchParams.get("kind")!;
        uploads.push(kind);
        saved.materials.push({ id: `m-${kind}`, kind, title: kind === "slides" ? "apostila.pdf" : "audio.mp3", has_file: true, size_bytes: 2048, url: null });
        return new Response(JSON.stringify({ ...saved, materials: [...saved.materials] }), { status: 201, headers: { "content-type": "application/json" } });
      }
      return new Response("{}", { status: 404 });
    });
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_lessons") return { lessons: [] };
      if (fn === "app_lesson_topics") return [];
      if (fn === "app_admin_save_lesson") return Object.assign(saved, args.p_lesson, { id: "l1", key_points: [], materials: [] }); // a função real devolve a aula completa
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: "Nova aula" }));
    expect(screen.getByText("Material complementar (PDF)")).toBeTruthy();
    expect(screen.getByText("Áudio Flashcast (MP3)")).toBeTruthy();
    expect(screen.getByText("Diretriz SUS / PCDT")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Bronquiolite" } });
    fireEvent.change(screen.getByLabelText("Título da aula"), { target: { value: "Aula de teste" } });
    fireEvent.change(screen.getByLabelText("Escolher PDF"), { target: { files: [new File(["%PDF-1.4"], "apostila.pdf", { type: "application/pdf" })] } });
    fireEvent.change(screen.getByLabelText("Escolher MP3"), { target: { files: [new File(["ID3"], "audio.mp3", { type: "audio/mpeg" })] } });
    expect(screen.getAllByText("Será enviado ao criar a aula").length).toBe(2);
    fireEvent.change(screen.getByLabelText("Endereço oficial (https)"), { target: { value: "https://www.gov.br/saude/pcdt" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar aula" }));
    await waitFor(() => expect(uploads).toEqual(["slides", "flashcast"]));
    const call = backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_admin_save_lesson")[1].p_lesson;
    expect(call.guideline_url).toBe("https://www.gov.br/saude/pcdt");
    expect(await screen.findByText("Aula salva.")).toBeTruthy();
    expect(screen.getAllByText("Disponível").length).toBe(3); // PDF, áudio e diretriz
  });
});

describe("Atualizações & Diretrizes (painel)", () => {
  it("conteúdo do app anterior: aviso do que não se sustenta; conferência com nota; publicar", async () => {
    render(<AdminUpdates />);
    fireEvent.click(await screen.findByRole("button", { name: /Atualização antiga de teste/ }));
    expect(screen.getByText(/Veio do app anterior/)).toBeTruthy();
    expect(screen.getByText(/dava erro 404 em 06\/10\/2026/)).toBeTruthy();
    expect(screen.getByText(/a citação não confere/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Conduta vigente"), { target: { value: "Agora, editado." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_save_guideline_update", expect.objectContaining({ p_update: expect.objectContaining({ current_conduct: "Agora, editado." }) })));
    const approve = screen.getByRole("button", { name: /Aprovar: confere com o documento oficial/ });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("O que foi conferido (documento, página, versão)"), { target: { value: "Documento oficial, página 3." } });
    fireEvent.click(approve);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_review_guideline_update", { p_id: "u1", p_decision: "approve", p_note: "Documento oficial, página 3." }));
    expect(await screen.findByText(/Conferida por Dra\. Revisora/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Publicada para os alunos/));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_publish_guideline_update", { p_id: "u1", p_published: true }));
  });

  it("sem conferência aprovada, a publicação fica travada e a tela diz por quê", async () => {
    render(<AdminUpdates />);
    fireEvent.click(await screen.findByRole("button", { name: /Atualização antiga de teste/ }));
    const toggle = screen.getByLabelText(/Publicada para os alunos/) as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    expect(screen.getByText(/Só pode ser publicada depois que um revisor médico aprovar a conferência/)).toBeTruthy();
    fireEvent.click(toggle);
    expect(backend.rpc).not.toHaveBeenCalledWith("app_admin_publish_guideline_update", expect.anything());
  });

  it("publicada: avisa antes de salvar mudança no texto; cancelar não grava; confirmar grava e mostra que saiu do ar", async () => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_guideline_updates") return { is_admin: true, review_areas: ["GINECOLOGIA_OBSTETRICIA"], items: [PUBLISHED] };
      if (fn === "app_admin_save_guideline_update") {
        const textChanged = args.p_update.current_conduct !== PUBLISHED.current_conduct;
        return textChanged
          ? { ...PUBLISHED, ...args.p_update, published: false, reviewed: false, review_status: "pending", review_note: OFF_AIR_NOTE }
          : { ...PUBLISHED, ...args.p_update };
      }
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      render(<AdminUpdates />);
      fireEvent.click(await screen.findByRole("button", { name: /Atualização publicada de teste/ }));
      // o aviso aparece antes de salvar
      expect(screen.getByText(/Se você mudar o texto, ela sai do ar para os alunos/)).toBeTruthy();
      // mudar só a posição não tira do ar: salva sem perguntar
      fireEvent.change(screen.getByLabelText("Posição"), { target: { value: "5" } });
      fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
      await waitFor(() => expect(backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_admin_save_guideline_update").length).toBe(1));
      expect(confirm).not.toHaveBeenCalled();
      // mudar o texto pergunta antes; cancelar não grava
      fireEvent.change(screen.getByLabelText("Conduta vigente"), { target: { value: "Agora, editado." } });
      fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
      expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/sai do ar/));
      expect(backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_admin_save_guideline_update").length).toBe(1);
      // confirmar grava e a tela mostra que saiu do ar
      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
      expect(await screen.findByText(OFF_AIR_NOTE)).toBeTruthy();
      expect(screen.getByText("Não publicada")).toBeTruthy();
      expect(screen.queryByText(/Se você mudar o texto, ela sai do ar para os alunos/)).toBeNull();
    } finally {
      confirm.mockRestore();
    }
  });

  it("publicada: a tela compara o texto como o banco (que só tira espaços das pontas, não quebras de linha)", async () => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_guideline_updates") return { is_admin: true, review_areas: ["GINECOLOGIA_OBSTETRICIA"], items: [PUBLISHED] };
      // o banco grava o texto sem os espaços das pontas (btrim)
      if (fn === "app_admin_save_guideline_update") return { ...PUBLISHED, ...args.p_update, current_conduct: String(args.p_update.current_conduct).replace(/^ +| +$/g, "") };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const saves = () => backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_admin_save_guideline_update").length;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      render(<AdminUpdates />);
      fireEvent.click(await screen.findByRole("button", { name: /Atualização publicada de teste/ }));
      // espaço sobrando no fim: o banco tira (btrim) e nada muda para o aluno, então salva sem perguntar
      fireEvent.change(screen.getByLabelText("Conduta vigente"), { target: { value: "Agora.  " } });
      fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
      await waitFor(() => expect(saves()).toBe(1));
      expect(confirm).not.toHaveBeenCalled();
      // quebra de linha no fim: o banco guarda e conta como texto mudado (tira do ar), então a tela pergunta antes
      fireEvent.change(screen.getByLabelText("Conduta vigente"), { target: { value: "Agora.\n" } });
      fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
      expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/sai do ar/));
      expect(saves()).toBe(1);
    } finally {
      confirm.mockRestore();
    }
  });

  it("recusar uma publicada: a tela avisa que sai do ar e mostra que saiu", async () => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_guideline_updates") return { is_admin: true, review_areas: ["GINECOLOGIA_OBSTETRICIA"], items: [PUBLISHED] };
      if (fn === "app_admin_review_guideline_update") return { is_admin: true, review_areas: ["GINECOLOGIA_OBSTETRICIA"], items: [{ ...PUBLISHED, review_status: "rejected", reviewed: false, published: false, review_note: args.p_note }] };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<AdminUpdates />);
    fireEvent.click(await screen.findByRole("button", { name: /Atualização publicada de teste/ }));
    expect(screen.getByText(/Recusar tira esta atualização do ar para os alunos na hora/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("O que foi conferido (documento, página, versão)"), { target: { value: "Conduta não confere com a versão vigente." } });
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_review_guideline_update", { p_id: "u2", p_decision: "reject", p_note: "Conduta não confere com a versão vigente." }));
    expect(await screen.findByText("Não publicada")).toBeTruthy();
    expect((screen.getByLabelText(/Publicada para os alunos/) as HTMLInputElement).disabled).toBe(true);
  });
});

describe("Registro (Administração)", () => {
  const at = "2026-10-10T12:00:00Z";
  const ID = "6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b";
  const AUTO = "Estava publicada sem conferência médica aprovada: retirada do ar pela correção de 10/10/2026.";

  it("atualizações: tema e motivo em português; a retirada da regra nova aparece como automática (com ou sem a marca), não como conta excluída", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_audit_page") return auditPage([
        // gravada por uma versão anterior do SQL da 7800 (sem a marca "automatica"), como pode estar no banco do site
        { id: 6, action: "guideline_update.unpublish", target: ID, created_at: at, actor: null,
          details: { topic: "Rastreamento com DNA-HPV", review_status: "pending", motivo: AUTO } },
        { id: 5, action: "guideline_update.unpublish", target: ID, created_at: at, actor: null,
          details: { topic: "Hipertensão arterial", review_status: "pending", automatica: true, motivo: AUTO } },
        { id: 4, action: "guideline_update.unpublish", target: ID, created_at: at, actor: "rev@t.dev",
          details: { topic: "Pré-eclâmpsia", motivo: "Recusada na conferência médica: saiu do ar na hora.", note: "Conduta não confere com a versão vigente." } },
        { id: 3, action: "guideline_update.publish", target: ID, created_at: at, actor: "adm@t.dev", details: { topic: "Pré-eclâmpsia", review_status: "approved" } },
        { id: 2, action: "guideline_update.delete", target: ID, created_at: at, actor: "adm@t.dev", details: { topic: "Atualização de teste" } },
        { id: 1, action: "user.delete", target: "x", created_at: at, actor: null, details: { email: "antigo@t.dev" } },
      ]);
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const { container } = render(<AdminAudit />);
    const list = within(await screen.findByRole("list", { name: "Ações registradas" }));
    expect((await list.findAllByText("Retirada automática pela regra nova")).length).toBe(2);
    expect(list.getByText("Tema: Rastreamento com DNA-HPV · Motivo: estava publicada sem conferência médica aprovada; pela regra nova, só fica no ar o que um revisor médico conferiu")).toBeTruthy();
    expect(list.getByText("Tema: Hipertensão arterial · Motivo: estava publicada sem conferência médica aprovada; pela regra nova, só fica no ar o que um revisor médico conferiu")).toBeTruthy();
    expect(list.getAllByText("Atualização tirada do ar").length).toBe(1);
    expect(list.getByText("Tema: Pré-eclâmpsia · Motivo: recusada na conferência médica · Nota do revisor: Conduta não confere com a versão vigente.")).toBeTruthy();
    expect(list.getByText("Atualização publicada")).toBeTruthy();
    expect(list.getByText("Tema: Pré-eclâmpsia · Conferência médica aprovada")).toBeTruthy();
    expect(list.getByText("Atualização apagada")).toBeTruthy();
    // sem autor: as duas da regra nova são "automático"; a de uma conta apagada continua "conta excluída"
    expect(list.getAllByText(/automático/).length).toBe(2);
    expect(list.getAllByText(/conta excluída/).length).toBe(1);
    // nenhum código interno na tela
    expect(container.textContent).not.toMatch(/guideline_update|automatica|review_status|pending|approved|correção de 10\/10\/2026/);
    expect(container.textContent).not.toContain(ID);
  });

  it("questões: gabarito oficial e explicações revisadas aparecem em português, com a prova e o número, sem código", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_audit_page") return auditPage([
        { id: 2, action: "question.explanations_reviewed", target: "revalida_2025_1_q045", created_at: at, actor: "ed@t.dev",
          details: { review: { de: "C", para: "B", campos: ["expected_conduct", "explanation_B", "explanation_C"], desde: at, por: ID, motivo: "Recurso aceito", fonte: "INEP" } } },
        { id: 1, action: "question.official_answer", target: "revalida_2025_1_q045", created_at: at, actor: "adm@t.dev",
          details: { status: "CHANGED_AFTER_APPEAL", answer: "B", from: "C", version: 2, source: "Gabarito definitivo do INEP", reason: "Recurso aceito", recorrected: 3 } },
      ]);
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const { container } = render(<AdminAudit />);
    const list = within(await screen.findByRole("list", { name: "Ações registradas" }));
    expect(await list.findByText("Gabarito oficial registrado")).toBeTruthy();
    expect(list.getByText("Explicações marcadas como revisadas")).toBeTruthy();
    expect(list.getByText("Revalida 2025/1, questão 45 · Gabarito B, alterado após recurso (antes era C) · Fonte: Gabarito definitivo do INEP · Motivo: Recurso aceito · 3 respostas de alunos corrigidas de novo")).toBeTruthy();
    expect(list.getByText("Revalida 2025/1, questão 45 · Gabarito mudou de C para B · Revisadas: conduta esperada, explicação da B, explicação da C")).toBeTruthy();
    expect(container.textContent).not.toMatch(/question\.|official_answer|explanations_reviewed|CHANGED_AFTER_APPEAL|explanation_|expected_conduct|revalida_2025/);
    expect(container.textContent).not.toContain(ID);
  });
  it("RG03: aulas, podcasts, Stazia Arena, Tutor e Central de IAs aparecem com nome e resumo em português, sem código técnico", async () => {
    const rows = [
      { id: 12, action: "lesson.delete", target: ID, title: "Bronquiolite viral aguda", details: {} },
      { id: 11, action: "podcast.unpublish", target: ID, title: "Episódio 1: sepse", details: {} },
      { id: 10, action: "podcast.script.ai", target: ID, title: "Episódio 1: sepse", details: { provider: "gemini", model: "gemini-2.5-pro", used_chunks: 12, total_chunks: 20, cost_usd: 0.0512, simulated: false } },
      { id: 9, action: "gamification.rule", target: "flags.gamification_enabled", details: { value: false, enabled: true } },
      { id: 8, action: "gamification.recalculate", target: ID, subject: "ana@t.dev", details: {} },
      { id: 7, action: "tutor.voice.approve", target: "tutor", details: { voice: "durona", fingerprint: "f".repeat(64), scenarios: ["a"] } },
      { id: 6, action: "ai.provider", target: "gemini", details: { enabled: true } },
      { id: 5, action: "ai.function", target: "assistente_preencher", details: { mode: "comite" } },
      { id: 4, action: "podcast.audio", target: ID, title: "Episódio 1: sepse", details: { seconds: "500", provider: "openai" } },
      { id: 3, action: "lesson.material.delete", target: ID, title: null, details: {} },
    ].map((r) => ({ created_at: at, actor: "adm@t.dev", ...r }));
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_audit_page") return auditPage(rows);
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const { container } = render(<AdminAudit />);
    const list = within(await screen.findByRole("list", { name: "Ações registradas" }));
    expect(await list.findByText("Aula apagada")).toBeTruthy();
    expect(list.getByText("Bronquiolite viral aguda")).toBeTruthy();
    expect(list.getByText("Podcast tirado do ar")).toBeTruthy();
    expect(list.getByText("Roteiro do podcast escrito pela IA")).toBeTruthy();
    expect(list.getByText("Episódio 1: sepse · IA: Gemini (gemini-2.5-pro) · 12 de 20 trechos das fontes usados · custo US$ 0,0512")).toBeTruthy();
    expect(list.getByText("Regra da Stazia Arena alterada")).toBeTruthy();
    expect(list.getByText("Regra flags.gamification_enabled: desligada")).toBeTruthy();
    expect(list.getByText("Pontos de um aluno recalculados")).toBeTruthy();
    expect(list.getByText("Aluno: ana@t.dev")).toBeTruthy();
    expect(list.getByText("Voz do professor aprovada")).toBeTruthy();
    expect(list.getByText("Voz: Durona")).toBeTruthy();
    expect(list.getByText("IA ligada ou desligada")).toBeTruthy();
    expect(list.getByText("Gemini: ligada")).toBeTruthy();
    expect(list.getByText("Função de IA configurada")).toBeTruthy();
    expect(list.getByText("Assistente: preencher")).toBeTruthy();
    expect(list.getByText("Episódio 1: sepse · Duração: 8 min 20 s")).toBeTruthy();
    expect(list.getByText("Material de aula apagado")).toBeTruthy();
    // nenhum nome técnico de ação (aula.delete, podcast.script.ai, ai.provider, tutor.voice.approve…) aparece na tela
    expect(container.textContent).not.toMatch(/\b(lesson|podcast|gamification|tutor|ai)\.[a-z_.]+/);
    expect(container.textContent).not.toContain(ID);
  });
  it("RG02: papel e plano alterados mostram o e-mail da pessoa afetada; conta apagada diz conta excluída", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_audit_page") return auditPage([
        { id: 3, action: "user.role", target: ID, created_at: at, actor: "adm@t.dev", subject: "ana@t.dev", details: { from: "student", to: "admin" } },
        { id: 2, action: "user.subscription", target: ID, created_at: at, actor: "adm@t.dev", subject: null, details: { to: { plan: "pro", status: "active" } } },
        { id: 1, action: "user.delete", target: ID, created_at: at, actor: "adm@t.dev", subject: null, details: { email: "antigo@t.dev" } },
      ]);
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const { container } = render(<AdminAudit />);
    const list = within(await screen.findByRole("list", { name: "Ações registradas" }));
    expect(await list.findByText("Pessoa: ana@t.dev · Aluno → Administrador")).toBeTruthy();
    expect(list.getByText("Pessoa: conta excluída · Pro · Ativo")).toBeTruthy();
    expect(list.getByText("antigo@t.dev")).toBeTruthy();
    expect(container.textContent).not.toContain(ID);
  });
  it("RG01: ações da Central de Conteúdo aparecem junto das da Administração, com o selo de origem e sem código", async () => {
    const rows = [
      { id: 9, key: "c:9", source: "central", action: "publish", target: ID, title: "Sepse no adulto (versão 2)", details: { hash: "f".repeat(64) }, actor: "adm@t.dev" },
      { id: 9, key: "a:9", source: "administracao", action: "user.role", target: ID, subject: "ana@t.dev", details: { from: "student", to: "editor" }, actor: "adm@t.dev" },
      { id: 8, key: "c:8", source: "central", action: "reviewer.areas", target: ID, subject: "ana@t.dev", details: { areas: ["CLINICA_MEDICA"] }, actor: "adm@t.dev" },
      { id: 7, key: "c:7", source: "central", action: "retire", target: ID, title: "Sepse no adulto (versão 2)", details: { reason: "Diretriz nova" }, actor: "adm@t.dev" },
      { id: 6, key: "c:6", source: "central", action: "guideline_update.save", target: ID, details: { topic: "Pré-eclâmpsia", review_reset: true, unpublished: true }, actor: "ed@t.dev" },
      { id: 5, key: "c:5", source: "central", action: "question.official_answer", target: "revalida_2025_1_q045", details: { status: "FINAL", answer: "B", version: 2 }, actor: "adm@t.dev" },
    ].map((r) => ({ created_at: at, ...r }));
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_audit_page") return auditPage(rows);
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const { container } = render(<AdminAudit />);
    const list = within(await screen.findByRole("list", { name: "Ações registradas" }));
    expect(list.getByText("Conteúdo publicado para os alunos")).toBeTruthy();
    expect(list.getByText("Sepse no adulto (versão 2)")).toBeTruthy();
    expect(list.getByText("Sepse no adulto (versão 2) · Motivo: Diretriz nova")).toBeTruthy();
    expect(list.getByText("Conteúdo retirado do ar")).toBeTruthy();
    expect(list.getByText("Pessoa: ana@t.dev · Áreas: Clínica Médica")).toBeTruthy();
    expect(list.getByText("Tema: Pré-eclâmpsia · Conferência voltou para pendente · Saiu do ar")).toBeTruthy();
    expect(list.getByText("Revalida 2025/1, questão 45 · Gabarito B, definitivo")).toBeTruthy();
    // selo de origem só nas da Central (5); a da Administração não leva
    expect(list.getAllByText("Central de Conteúdo").length).toBe(5);
    expect(list.getByText("Papel alterado").parentElement!.textContent).not.toContain("Central de Conteúdo");
    // dois ids iguais (9) das duas tabelas convivem na lista
    expect(list.getAllByRole("listitem").length).toBe(6);
    expect(container.textContent).not.toMatch(/\b(reviewer|guideline_update|approve|flag|taxonomy)\.[a-z_.]+|\bretire\b|official_answer/);
    expect(container.textContent).not.toContain(ID);
  });

  describe("RG05: páginas e filtros", () => {
    const rows = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: 1000 - from - i, action: "settings.save", target: null, created_at: at, actor: "adm@t.dev", details: { trial_days: from + i } }));
    // banco simulado: 120 ações; o filtro de tipo "plan.save" acha 2; qualquer outro filtro não acha nada
    const install = () =>
      backend.rpc.mockImplementation(async (fn: string, args: any) => {
        if (fn !== "app_admin_audit_page") throw new Error(`rpc não simulada: ${fn}`);
        const f = args.p_filters;
        const actions = ["plan.save", "settings.save", "user.role"];
        if (f.action === "plan.save") return { total: 2, limit: 50, offset: 0, actions, items: [{ id: 7, action: "plan.save", target: "pro", created_at: at, actor: "adm@t.dev", details: { active: true } }, { id: 6, action: "plan.save", target: "elite", created_at: at, actor: "adm@t.dev", details: {} }] };
        if (f.action || f.person || f.from || f.to) return { total: 0, limit: 50, offset: 0, actions, items: [] };
        return { total: 120, limit: 50, offset: args.p_offset, actions, items: rows(Math.min(50, 120 - args.p_offset), args.p_offset) };
      });
    const callsWith = (match: (a: any) => boolean) => backend.rpc.mock.calls.filter(([fn, a]: any) => fn === "app_admin_audit_page" && match(a));

    it("páginas de 50: quantas ações, página X de Y, anterior e próxima", async () => {
      install();
      render(<AdminAudit />);
      expect(await screen.findByText("Mostrando 1 a 50 de 120 ações")).toBeTruthy();
      expect(screen.getByText("Página 1 de 3")).toBeTruthy();
      expect((screen.getByRole("button", { name: /Anterior/ }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getAllByRole("listitem").length).toBe(50);
      fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
      expect(await screen.findByText("Mostrando 51 a 100 de 120 ações")).toBeTruthy();
      expect(callsWith((a) => a.p_offset === 50 && a.p_limit === 50).length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
      expect(await screen.findByText("Mostrando 101 a 120 de 120 ações")).toBeTruthy();
      expect(screen.getAllByRole("listitem").length).toBe(20);
      expect((screen.getByRole("button", { name: /Próxima/ }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: /Anterior/ }));
      expect(await screen.findByText("Mostrando 51 a 100 de 120 ações")).toBeTruthy();
    });

    it("tipo: a lista traz o nome em português (sem código); escolher filtra e volta para a primeira página; limpar desfaz", async () => {
      install();
      render(<AdminAudit />);
      await screen.findByText("Mostrando 1 a 50 de 120 ações");
      fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
      await screen.findByText("Mostrando 51 a 100 de 120 ações");
      const select = screen.getByLabelText("Tipo de ação") as HTMLSelectElement;
      expect([...select.options].map((o) => o.textContent)).toEqual(["Todos os tipos", "Configurações salvas", "Papel alterado", "Plano editado"]);
      expect([...select.options].map((o) => o.textContent).join(" ")).not.toMatch(/\.save|\.role/);
      fireEvent.change(select, { target: { value: "plan.save" } });
      expect(await screen.findByText("Mostrando 1 a 2 de 2 ações com esses filtros")).toBeTruthy();
      expect(callsWith((a) => a.p_filters.action === "plan.save" && a.p_offset === 0).length).toBeGreaterThan(0);
      expect(screen.queryByText(/Página/)).toBeNull(); // uma página só: sem botões
      fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
      expect(await screen.findByText("Mostrando 1 a 50 de 120 ações")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
    });

    it("pessoa e datas: mandam o filtro ao banco; sem resultado, diz que nada bate com os filtros", async () => {
      install();
      render(<AdminAudit />);
      await screen.findByText("Mostrando 1 a 50 de 120 ações");
      fireEvent.change(screen.getByLabelText("Pessoa"), { target: { value: " ana@t.dev " } });
      await waitFor(() => expect(callsWith((a) => a.p_filters.person === "ana@t.dev").length).toBeGreaterThan(0)); // sem os espaços, depois de uma pausa na digitação
      expect(await screen.findByText("Nenhuma ação com esses filtros")).toBeTruthy();
      fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-03-01" } });
      fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-03-31" } });
      await waitFor(() => expect(callsWith((a) => a.p_filters.from === "2026-03-01" && a.p_filters.to === "2026-03-31" && a.p_filters.person === "ana@t.dev").length).toBeGreaterThan(0));
      fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
      expect(await screen.findByText("Mostrando 1 a 50 de 120 ações")).toBeTruthy();
      expect((screen.getByLabelText("Pessoa") as HTMLInputElement).value).toBe("");
    });

    it("sem nenhuma ação e sem filtro: mensagem de registro vazio; falha ao carregar oferece tentar de novo", async () => {
      backend.rpc.mockImplementation(async () => ({ total: 0, limit: 50, offset: 0, actions: [], items: [] }));
      render(<AdminAudit />);
      expect(await screen.findByText("Nenhuma ação registrada")).toBeTruthy();
      cleanup();
      backend.rpc.mockImplementation(async () => { throw new Error("falha de rede"); });
      render(<AdminAudit />);
      expect(await screen.findByRole("button", { name: "Tentar de novo" })).toBeTruthy();
    });
  });
});
