// @vitest-environment jsdom
/** Portão de atualidade dos 100 Grandes Temas — tela (banco simulado no formato de app_admin_gt_list / app_admin_gt da 9990). */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin" }, user: { id: "a" } }) }));
import { GrandesTemasAtualidade } from "../novo/app/admin/content/vigilancia/GrandesTemasAtualidade.jsx";

const T1 = { tema_id: "GR-001", titulo: "Tuberculose pulmonar", area: "Clínica Médica", nivel: "desatualizado", motivos: ["O dossiê nunca foi conferido pela equipe (clique em \"Marcar conferido\" depois de conferir as fontes)."], avisos: [], n_principais: 2, n_principais_cadastradas: 2, verificado_em: null };
const T2 = { tema_id: "GR-035", titulo: "Trauma abdominal", area: "Cirurgia", nivel: "sem_dossie", motivos: ["O tema não tem nenhuma fonte principal vigente cadastrada na biblioteca."], avisos: [], n_principais: 0, n_principais_cadastradas: 0, verificado_em: null };
const DET = { ...T1, faltam: [], palavras_chave: ["BPaLM", "TPT"], fontes: [{ catalogo_id: "tb-manual-controle-2ed-2019", titulo: "Manual de Recomendações para o Controle da Tuberculose no Brasil", ano: "2019", url: "https://www.gov.br/x.pdf", papel: "principal", cadastrada: true, evidencia: [{ tipo: "titulo", termo: "tuberculose" }, { tipo: "texto", termo: "tuberculose", paginas: 120, exemplos: [3, 4], paginas_ocr: [] }] }] };

beforeEach(() => {
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_gt_list") return { modo_portao: "desligado", temas: [T1, T2], resumo: { em_dia: 0, atencao: 0, desatualizado: 1, sem_dossie: 1 } };
    if (fn === "app_admin_gt") return DET;
    if (fn === "app_admin_gt_verified") return { ...DET, nivel: "em_dia" };
    if (fn === "app_admin_vigilance_set_gate") throw new Error("Acesso restrito a administradores.");
    throw new Error(`inesperado: ${fn} ${JSON.stringify(args)}`);
  });
});
afterEach(cleanup);

describe("Atualidade dos 100 Grandes Temas", () => {
  it("mostra a situação de cada tema, os motivos e filtra por situação", async () => {
    render(<GrandesTemasAtualidade />);
    expect(await screen.findByText("GR-001 · Tuberculose pulmonar")).toBeTruthy();
    expect(screen.getAllByText("Desatualizado").length).toBeGreaterThan(0);
    expect(screen.getByText(/nunca foi conferido/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Sem dossiê" }));
    await waitFor(() => expect(screen.queryByText("GR-001 · Tuberculose pulmonar")).toBeNull());
    expect(screen.getByText("GR-035 · Trauma abdominal")).toBeTruthy();
  });
  it("detalhe: fontes com a evidência do vínculo; conferir exige nome e nota e chama o banco com os dois", async () => {
    render(<GrandesTemasAtualidade />);
    await screen.findByText("GR-001 · Tuberculose pulmonar");
    fireEvent.click(screen.getAllByText("Ver fontes e conferir")[0]);
    expect(await screen.findByText(/termo no título “tuberculose”; termo no texto do PDF “tuberculose” em 120 páginas/)).toBeTruthy();
    const botao = screen.getByText("Marcar conferido").closest("button") as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Quem conferiu/), { target: { value: "Dra. Teste" } });
    fireEvent.change(screen.getByLabelText(/O que foi conferido/), { target: { value: "Conferi as três fontes nas páginas oficiais." } });
    fireEvent.click(botao);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_gt_verified", { p_tema_id: "GR-001", p_name: "Dra. Teste", p_note: "Conferi as três fontes nas páginas oficiais." }));
  });
  it("a recusa do banco ao mudar o portão aparece na tela", async () => {
    render(<GrandesTemasAtualidade />);
    await screen.findByText("GR-001 · Tuberculose pulmonar");
    fireEvent.click(screen.getByRole("radio", { name: "Bloquear" }));
    await waitFor(() => expect(screen.getByText(/restrito a administradores/)).toBeTruthy());
  });
});
