/**
 * Painéis de administração de Aulas e de Atualizações & Diretrizes (jsdom, banco simulado): digitar nas caixas de texto
 * chega ao banco, o aviso do conteúdo do app anterior aparece, a conferência médica e a publicação chamam as funções certas.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminLessons } from "../novo/app/admin/AdminLessons.jsx";
import { AdminUpdates } from "../novo/app/admin/AdminUpdates.jsx";

const LEGACY = {
  id: "u1", slug: "prot-x", area: "GINECOLOGIA_OBSTETRICIA", topic: "Atualização antiga de teste", subtopic: null, years: [2025], priority: 1,
  publication_label: "05/2025", institution: "Instituição", document_title: "Documento", source_url: null, before_text: "Antes.",
  timeline: [{ year: 2025, text: "Mudou." }], current_conduct: "Agora.", clinical_impact: null, exam_impact: null, trap: null, search_terms: "teste",
  flashcards: [], practice_questions: [], reviewed: false, reviewed_at: null, published: false, review_status: "pending", review_note: null,
  reviewer: null, source_checked_at: null, origin: "legacy_app", position: 1, can_review: true,
  legacy: { status_label: "VALIDADO_OFICIAL_SUS", last_verification_claim: "2026-08-30", original_url: "https://site.test/antigo", original_url_check: { http_status: 404, checked_on: "2026-10-06" }, cited_questions: [{ exam_code: "REV-2021-GO-45", claimed_answer: "Alternativa C", matched_question_id: "q45", matched_topic: "Doenças hipertensivas da gestação" }] },
};

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
});
