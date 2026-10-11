/**
 * Aba Aulas da Administração, correções de 11/10/2026 (A03, A09, A10 e as demais deste arquivo): jsdom, banco simulado.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminLessons } from "../novo/app/admin/AdminLessons.jsx";

const SAVED_AT = "2026-10-06T12:00:00Z";
const base = () => ({ lessons: [] as any[] });
let store: { lessons: any[] };

beforeEach(() => {
  store = base();
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_lessons") return store;
    if (fn === "app_lesson_topics") return [];
    // a função real devolve a aula SEM started_by/completed_by (só a lista da equipe traz as contagens)
    if (fn === "app_admin_save_lesson") return { id: "l1", ...args.p_lesson, key_points: [], materials: [], updated_at: SAVED_AT };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

async function createLesson(title = "Aula de teste") {
  fireEvent.click(await screen.findByRole("button", { name: "Nova aula" }));
  fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Bronquiolite" } });
  fireEvent.change(screen.getByLabelText("Título da aula"), { target: { value: title } });
  fireEvent.click(screen.getByRole("button", { name: "Criar aula" }));
  expect(await screen.findByText("Aula salva.")).toBeTruthy();
}

describe("A03 - Nova aula abre formulário em branco", () => {
  it("depois de criar uma aula, clicar em Nova aula abre um formulário em branco (não edita a aula recém-criada)", async () => {
    render(<AdminLessons />);
    await createLesson();
    expect(screen.getByRole("heading", { name: "Editar aula" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nova aula" }));
    expect(screen.getByRole("heading", { name: "Nova aula" })).toBeTruthy();
    expect((screen.getByLabelText("Título da aula") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Tema") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Outro" } });
    fireEvent.change(screen.getByLabelText("Título da aula"), { target: { value: "Segunda aula" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar aula" }));
    await waitFor(() => expect(backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_admin_save_lesson").length).toBe(2));
    const second = backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_admin_save_lesson")[1][1].p_lesson;
    expect(second.id).toBeUndefined(); // criou outra aula, não escreveu por cima da primeira
  });
});
describe("A09 - lista logo depois de criar", () => {
  it("mostra 0 iniciaram e 0 concluíram (nunca 'undefined')", async () => {
    render(<AdminLessons />);
    await createLesson();
    const row = await screen.findByText(/Aula de teste/, { selector: "span" });
    expect(row).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/undefined/);
    expect(document.body.textContent).toMatch(/0 iniciaram, 0 concluíram/);
  });
});


const withMaterials = (materials: any[]) => ({
  id: "l9", area: "PEDIATRIA", topic: "Bronquiolite", title: "Bronquiolite", published: true, key_points: [], updated_at: SAVED_AT,
  started_by: 2, completed_by: 1, materials,
});

describe("A06 - prefixo 'Flashcast:' repetido", () => {
  it("o título do áudio da aula não repete o prefixo na lista da equipe", async () => {
    store.lessons = [withMaterials([{ id: "m1", kind: "flashcast", title: "Flashcast: Flashcast: Bronquiolite", has_file: true, size_bytes: 2048, url: null }])];
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: /Bronquiolite/ }));
    expect(screen.getByText(/Flashcast: Bronquiolite/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Flashcast: Flashcast/);
  });
});

describe("A10 - erro de envio em português", () => {
  const signedFetch = () =>
    ((globalThis as any).fetch = vi.fn(async (url: string) => {
      if (url === "/api/lessons/l9/upload") return new Response(JSON.stringify({ mode: "signed", bucket: "lessons", key: "lessons/l9/slides-aaaaaaaaaaaaaaaa.pdf", path: "p", token: "t" }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }));

  it("erro do depósito em inglês aparece traduzido, nunca como veio", async () => {
    store.lessons = [withMaterials([])];
    signedFetch();
    backend.uploadToSignedUrl = vi.fn(async () => {
      throw Object.assign(new Error("The object exceeded the maximum allowed size"), { code: "unknown" });
    });
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: /Bronquiolite/ }));
    fireEvent.change(screen.getByLabelText("Escolher PDF"), { target: { files: [new File(["%PDF-1.4"], "apostila.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(backend.uploadToSignedUrl).toHaveBeenCalled());
    expect(await screen.findByText(/grande demais/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/exceeded/);
  });

  it("falha de rede e erro desconhecido também saem em português", async () => {
    store.lessons = [withMaterials([])];
    signedFetch();
    backend.uploadToSignedUrl = vi.fn(async () => {
      throw Object.assign(new Error("Failed to fetch"), { code: "network" });
    });
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: /Bronquiolite/ }));
    fireEvent.change(screen.getByLabelText("Escolher PDF"), { target: { files: [new File(["%PDF-1.4"], "apostila.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText(/conexão/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Failed to fetch/);
  });
});

describe("A01 - conferência do texto antes de publicar", () => {
  it("ao ligar Publicada aparece o campo de conferência e ele vai ao banco junto com os avisos da IA", async () => {
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: "Nova aula" }));
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Asma" } });
    fireEvent.change(screen.getByLabelText("Título da aula"), { target: { value: "Asma na infância" } });
    expect(screen.queryByLabelText(/O que você conferiu/)).toBeNull(); // rascunho não pede
    fireEvent.click(screen.getByRole("switch", { name: /Publicada/ }));
    fireEvent.change(await screen.findByLabelText(/O que você conferiu/), { target: { value: "Conferi com a apostila, página 3." } });
    fireEvent.click(screen.getByRole("button", { name: "Criar aula" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_save_lesson", expect.anything()));
    const sent = backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_admin_save_lesson")[1].p_lesson;
    expect(sent).toMatchObject({ published: true, review_note: "Conferi com a apostila, página 3." });
    expect("ai_notes" in sent).toBe(false); // sem assistente nesta sessão: não mexe nos avisos guardados
  });

  it("aula já conferida mostra quem conferiu e quando; o campo recomeça vazio e os avisos guardados aparecem", async () => {
    store.lessons = [{ ...withMaterials([]), reviewer: "Dra. Ana", reviewed_at: "2026-10-06T12:00:00Z", review_note: "Conferi tudo com a diretriz.", ai_notes: ['Resumo: "40 mg" não está nos trechos citados.'] }];
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: /Bronquiolite/ }));
    expect(screen.getByText(/Dra\. Ana/)).toBeTruthy();
    expect(screen.getByText(/Conferi tudo com a diretriz/)).toBeTruthy();
    expect(screen.getByText(/"40 mg" não está nos trechos citados/)).toBeTruthy();
    expect((screen.getByLabelText(/O que você conferiu/) as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_save_lesson", expect.anything()));
    const sent = backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_admin_save_lesson")[1].p_lesson;
    expect(sent.review_note).toBe("");
    expect("ai_notes" in sent).toBe(false);
  });

  it("aula publicada sem registro de conferência avisa isso", async () => {
    store.lessons = [withMaterials([])];
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: /Bronquiolite/ }));
    expect(screen.getByText(/sem registro de conferência/i)).toBeTruthy();
  });
});

describe("A01 - avisos da IA ficam guardados na aula", () => {
  it("usar a sugestão leva os avisos e o 'o material não esclarece' para a aula salva", async () => {
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (url === "/api/lessons/assist/providers") return json({ choices: [{ kind: "gemini", label: "Gemini", model: "m", ready: true }], override_allowed: true, current: null });
      if (url === "/api/lessons/assist")
        return json({
          suggestion: { title: "Asma", topic: "Asma", area: "PEDIATRIA", summary: "Resumo.", summary_pages: [1], key_points: [{ text: "Ponto", sources: [1], pages: [1] }], missing: ["Dose do corticoide"] },
          warnings: ['Resumo: "40 mg" não está nos trechos citados.'], usage: { provider: "gemini", model: "m", input_tokens: 1, output_tokens: 1, cost_usd: 0, calls: 1 }, used_chunks: 1, total_chunks: 1,
        });
      return new Response("{}", { status: 404 });
    });
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: "Nova aula" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir assistente" }));
    fireEvent.change(await screen.findByLabelText(/Texto \(transcrição/), { target: { value: "Texto de apoio da aula ".repeat(8) } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar sugestões" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar tudo no formulário" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar aula" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_save_lesson", expect.anything()));
    const sent = backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_admin_save_lesson")[1].p_lesson;
    expect(sent.ai_notes).toEqual(['Resumo: "40 mg" não está nos trechos citados.', "O material não esclarece: Dose do corticoide"]);
  });
});

describe("A02 - trecho citado ao lado da página", () => {
  it("a sugestão mostra o começo de cada trecho citado, não só o número da página", async () => {
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (url === "/api/lessons/assist/providers") return json({ choices: [{ kind: "gemini", label: "Gemini", model: "m", ready: true }], override_allowed: true, current: null });
      if (url === "/api/lessons/assist")
        return json({
          suggestion: {
            title: "Asma", topic: "Asma", area: "PEDIATRIA", summary: "Resumo.", summary_pages: [3], summary_excerpts: [{ id: 1, page: 3, text: "Trecho do resumo na página três." }],
            key_points: [{ text: "Ponto", sources: [2], pages: [4], excerpts: [{ id: 2, page: 4, text: "Trecho do ponto na página quatro." }] }], missing: [],
          },
          warnings: [], usage: { provider: "gemini", model: "m", input_tokens: 1, output_tokens: 1, cost_usd: 0, calls: 1 }, used_chunks: 2, total_chunks: 2,
        });
      return new Response("{}", { status: 404 });
    });
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: "Nova aula" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir assistente" }));
    fireEvent.change(await screen.findByLabelText(/Texto \(transcrição/), { target: { value: "Texto de apoio da aula ".repeat(8) } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar sugestões" }));
    expect(await screen.findByText("Trecho do resumo na página três.")).toBeTruthy();
    expect(screen.getByText("Trecho do ponto na página quatro.")).toBeTruthy();
    expect(screen.getAllByText(/Trecho citado \(p\. [34]\)/).length).toBe(2);
  });
});
