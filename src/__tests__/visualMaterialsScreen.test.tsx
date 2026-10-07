/**
 * Tela "Materiais visuais" da Central de Conteúdo (jsdom, servidor simulado): lista com o botão "Novo material visual",
 * formulário que manda o conteúdo para a rota do servidor (mesmos nomes de campo do comando), "Colar comando"
 * preenchendo o formulário e a página do material com arquivos, duplicar e gerar de novo.
 * Textos de teste, sem conteúdo clínico.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { VisualMaterials } from "../novo/app/admin/content/visual/VisualMaterials.jsx";

const MATERIAL = {
  id: "11111111-1111-4111-8111-111111111111",
  model: "flashcard_a6",
  specialty_key: "cirurgia",
  specialty_label: "Cirurgia",
  title: "Tema de teste",
  card_id: "CIR-0001",
  batch_label: null,
  batch_order: 1,
  current_version: 1,
  created_at: "2026-10-06T12:00:00Z",
  updated_at: "2026-10-06T12:00:00Z",
  created_by_name: "Adm",
  updated_by_name: "Adm",
  duplicated_from: null,
};
const CONTENT = {
  model: "flashcard_a6",
  specialty: { key: "cirurgia", label: "Cirurgia" },
  card_id: "CIR-0001",
  ordem: 1,
  lote: "",
  tema: "Tema de teste",
  pergunta: "Pergunta de teste?",
  resposta: "Resposta de teste",
  pontos_chave: [],
  tabela: null,
  ilustracao: { tipo: "nenhuma", icone: "coracao", imagem: "", legenda: "", alt: "" },
  bloco: null,
  mnemonico: null,
};

let calls: { url: string; init: any }[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  calls = [];
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_ch_visual_list") return [{ ...MATERIAL, status: "ready", files: 1 }];
    if (fn === "app_ch_visual_material")
      return {
        ...MATERIAL,
        versions: [{ id: "v1", version: 1, content: CONTENT, render_status: "ready", created_at: "2026-10-06T12:00:00Z", created_by_name: "Adm", check_result: { ok: true, problems: [] }, files: [{ id: "f1", format: "pdf", side: "pair", pages: 2 }] }],
      };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  (globalThis as any).fetch = vi.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    if (url === "/api/content-hub/visual/materials") return json({ material_id: "22222222-2222-4222-8222-222222222222", version: 1, card_id: "CIR-0002", created: true, queued: false, warnings: [] }, 201);
    if (url.endsWith("/duplicate")) return json({ material_id: "33333333-3333-4333-8333-333333333333", version: 1 }, 201);
    if (url.endsWith("/regenerate")) return json({ version: 1 });
    return json({ error: "não simulado" }, 404);
  });
});
afterEach(cleanup);

const ctx = (params: Record<string, string> = {}, go = vi.fn()) => ({ params: new URLSearchParams(params), go, status: { worker: true }, isAdmin: true, isStaff: true });

describe("Materiais visuais (painel)", () => {
  it("lista os materiais e abre o formulário pelo botão Novo material visual", async () => {
    const go = vi.fn();
    render(<VisualMaterials {...ctx({}, go)} />);
    expect(await screen.findByText("Tema de teste")).toBeTruthy();
    expect(screen.getByText("CIR-0001")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Novo material visual" }));
    expect(go).toHaveBeenCalledWith("visuais", { id: "novo" });
  });

  it("formulário: modelo, especialidade e conteúdo vão para a rota do servidor com os nomes do comando", async () => {
    const go = vi.fn();
    render(<VisualMaterials {...ctx({ id: "novo" }, go)} />);
    fireEvent.click(screen.getByRole("radio", { name: /Flashcard A6/ }));
    fireEvent.change(screen.getByLabelText("Especialidade *"), { target: { value: "cirurgia" } });
    fireEvent.change(screen.getByLabelText("Pergunta *"), { target: { value: "Pergunta digitada?" } });
    fireEvent.change(screen.getByLabelText("Resposta *"), { target: { value: "Resposta digitada" } });
    const save = screen.getByRole("button", { name: "Salvar rascunho" }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    // sem a conferência da prévia (não roda no jsdom), "Gerar" fica travado
    expect((screen.getByRole("button", { name: "Gerar par frente e verso" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/content-hub/visual/materials")).toBe(true));
    const body = JSON.parse(calls.find((c) => c.url === "/api/content-hub/visual/materials")!.init.body);
    expect(body.generate).toBe(false);
    expect(body.input).toMatchObject({ modelo: "flashcard_a6", especialidade: "cirurgia", pergunta: "Pergunta digitada?", resposta: "Resposta digitada" });
    await waitFor(() => expect(go).toHaveBeenCalledWith("visuais", { id: "22222222-2222-4222-8222-222222222222" }));
  });

  it("colar comando preenche o formulário", async () => {
    render(<VisualMaterials {...ctx({ id: "novo" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    fireEvent.change(screen.getByLabelText("Comando"), { target: { value: "modelo: story\nespecialidade: pediatria\ntitulo: Título colado de teste\npontos_chave:\n- ponto um\n- ponto dois" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar ao formulário" }));
    expect(await screen.findByText(/Comando aplicado/)).toBeTruthy();
    expect((screen.getByLabelText("Título do tema *") as HTMLInputElement).value).toBe("Título colado de teste");
    expect((screen.getByLabelText(/Pontos-chave/) as HTMLTextAreaElement).value).toBe("ponto um\nponto dois");
    expect((screen.getByLabelText("Especialidade *") as HTMLSelectElement).value).toBe("pediatria");
  });

  it("página do material: arquivo do par, duplicar e gerar de novo", async () => {
    const go = vi.fn();
    render(<VisualMaterials {...ctx({ id: MATERIAL.id }, go)} />);
    expect((await screen.findAllByRole("button", { name: /PDF \(frente e verso\)/ })).length).toBeGreaterThan(0);
    expect(screen.getByText(/Imprima em duplex, virando no eixo longo/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gerar de novo" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith(`/visual/materials/${MATERIAL.id}/regenerate`))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("visuais", { id: "33333333-3333-4333-8333-333333333333" }));
  });
});
