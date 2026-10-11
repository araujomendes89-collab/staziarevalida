/**
 * Painéis de administração de Aulas e de Atualizações & Diretrizes (jsdom, banco simulado): digitar nas caixas de texto
 * chega ao banco, o aviso do conteúdo do app anterior aparece, a conferência médica e a publicação chamam as funções certas.
 * Atualizações (10/10/2026): só publica com conferência aprovada (AT03), recusar uma publicada avisa que sai do ar (AT01) e
 * mudar o texto de uma publicada avisa antes de salvar que ela sai do ar até nova conferência (AT02). O Registro mostra em
 * português quando uma atualização é publicada ou tirada do ar, com o tema e o motivo em linguagem simples; a retirada
 * feita pela migração 7800 aparece como "Retirada automática pela regra nova" (não como "conta excluída"), também nas
 * linhas sem a marca "automatica". As ações novas das Questões aparecem em português, com a questão (polimento 10/10/2026).
 * RG03 (11/10/2026): aulas, podcasts, Stazia Arena, Tutor e Central de IAs aparecem com nome e resumo em português (o
 * título da aula ou do episódio vem do banco), sem código técnico.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
      if (fn === "app_admin_audit") return [
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
      ];
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const { container } = render(<AdminAudit />);
    expect((await screen.findAllByText("Retirada automática pela regra nova")).length).toBe(2);
    expect(screen.getByText("Tema: Rastreamento com DNA-HPV · Motivo: estava publicada sem conferência médica aprovada; pela regra nova, só fica no ar o que um revisor médico conferiu")).toBeTruthy();
    expect(screen.getByText("Tema: Hipertensão arterial · Motivo: estava publicada sem conferência médica aprovada; pela regra nova, só fica no ar o que um revisor médico conferiu")).toBeTruthy();
    expect(screen.getAllByText("Atualização tirada do ar").length).toBe(1);
    expect(screen.getByText("Tema: Pré-eclâmpsia · Motivo: recusada na conferência médica · Nota do revisor: Conduta não confere com a versão vigente.")).toBeTruthy();
    expect(screen.getByText("Atualização publicada")).toBeTruthy();
    expect(screen.getByText("Tema: Pré-eclâmpsia · Conferência médica aprovada")).toBeTruthy();
    expect(screen.getByText("Atualização apagada")).toBeTruthy();
    // sem autor: as duas da regra nova são "automático"; a de uma conta apagada continua "conta excluída"
    expect(screen.getAllByText(/automático/).length).toBe(2);
    expect(screen.getAllByText(/conta excluída/).length).toBe(1);
    // nenhum código interno na tela
    expect(container.textContent).not.toMatch(/guideline_update|automatica|review_status|pending|approved|correção de 10\/10\/2026/);
    expect(container.textContent).not.toContain(ID);
  });

  it("questões: gabarito oficial e explicações revisadas aparecem em português, com a prova e o número, sem código", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_audit") return [
        { id: 2, action: "question.explanations_reviewed", target: "revalida_2025_1_q045", created_at: at, actor: "ed@t.dev",
          details: { review: { de: "C", para: "B", campos: ["expected_conduct", "explanation_B", "explanation_C"], desde: at, por: ID, motivo: "Recurso aceito", fonte: "INEP" } } },
        { id: 1, action: "question.official_answer", target: "revalida_2025_1_q045", created_at: at, actor: "adm@t.dev",
          details: { status: "CHANGED_AFTER_APPEAL", answer: "B", from: "C", version: 2, source: "Gabarito definitivo do INEP", reason: "Recurso aceito", recorrected: 3 } },
      ];
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const { container } = render(<AdminAudit />);
    expect(await screen.findByText("Gabarito oficial registrado")).toBeTruthy();
    expect(screen.getByText("Explicações marcadas como revisadas")).toBeTruthy();
    expect(screen.getByText("Revalida 2025/1, questão 45 · Gabarito B, alterado após recurso (antes era C) · Fonte: Gabarito definitivo do INEP · Motivo: Recurso aceito · 3 respostas de alunos corrigidas de novo")).toBeTruthy();
    expect(screen.getByText("Revalida 2025/1, questão 45 · Gabarito mudou de C para B · Revisadas: conduta esperada, explicação da B, explicação da C")).toBeTruthy();
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
      if (fn === "app_admin_audit") return rows;
      throw new Error(`rpc não simulada: ${fn}`);
    });
    const { container } = render(<AdminAudit />);
    expect(await screen.findByText("Aula apagada")).toBeTruthy();
    expect(screen.getByText("Bronquiolite viral aguda")).toBeTruthy();
    expect(screen.getByText("Podcast tirado do ar")).toBeTruthy();
    expect(screen.getByText("Roteiro do podcast escrito pela IA")).toBeTruthy();
    expect(screen.getByText("Episódio 1: sepse · IA: Gemini (gemini-2.5-pro) · 12 de 20 trechos das fontes usados · custo US$ 0,0512")).toBeTruthy();
    expect(screen.getByText("Regra da Stazia Arena alterada")).toBeTruthy();
    expect(screen.getByText("Regra flags.gamification_enabled: desligada")).toBeTruthy();
    expect(screen.getByText("Pontos de um aluno recalculados")).toBeTruthy();
    expect(screen.getByText("Aluno: ana@t.dev")).toBeTruthy();
    expect(screen.getByText("Voz do professor aprovada")).toBeTruthy();
    expect(screen.getByText("Voz: Durona")).toBeTruthy();
    expect(screen.getByText("IA ligada ou desligada")).toBeTruthy();
    expect(screen.getByText("Gemini: ligada")).toBeTruthy();
    expect(screen.getByText("Função de IA configurada")).toBeTruthy();
    expect(screen.getByText("Assistente: preencher")).toBeTruthy();
    expect(screen.getByText("Episódio 1: sepse · Duração: 8 min 20 s")).toBeTruthy();
    expect(screen.getByText("Material de aula apagado")).toBeTruthy();
    // nenhum nome técnico de ação (aula.delete, podcast.script.ai, ai.provider, tutor.voice.approve…) aparece na tela
    expect(container.textContent).not.toMatch(/\b(lesson|podcast|gamification|tutor|ai)\.[a-z_.]+/);
    expect(container.textContent).not.toContain(ID);
  });
});
