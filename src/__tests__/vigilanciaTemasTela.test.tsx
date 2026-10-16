// @vitest-environment jsdom
/**
 * Vigilância por tema — telas (banco simulado com o formato de app_admin_topics / app_admin_topic / app_admin_unit_topic da 9960).
 * Dados reais: o tema Tuberculose com as 3 fontes da aula GR-001 (reais.json) e o aviso real da Nota Informativa nº 2/2026 (BPaLM),
 * como o banco escreve no motivo quando a página de notas 2026 a mostra.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin" }, user: { id: "a" } }) }));
import { TemaDaUnidade, TemasVigiados } from "../novo/app/admin/content/vigilancia/TemasVigiados.jsx";

const R = JSON.parse(readFileSync("src/__tests__/fixtures/vigilancia/reais.json", "utf8"));
const TB = ["gvs-6ed-rev-v2", "tb-manual-controle-2ed-2019", "tb-nota-informativa-5-2024"].map((id) => R.fontes.find((f: any) => f.id === id));
const MOTIVO = "Documento oficial novo para o tema: NOTA INFORMATIVA Nº 2/2026-CGTM/.DATHI/SVSA/MS";
const TEMA = { tema_id: "t-tb", tema: "Tuberculose", verificado_em: "2026-10-13T12:00:00Z", pendencias: 1, situacao: { status: "mudanca_pendente", motivos: [MOTIVO] },
  fontes: TB.map((f: any, i: number) => ({ id: `f${i}`, titulo: f.titulo, url: f.url, status: "current", papel: "principal" })) };

beforeEach(() => {
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_topics") return { modo_portao: "aviso", temas: [TEMA] };
    if (fn === "app_admin_topic") return { ...TEMA, depende: { unidades: [{ id: "u1", titulo: "GR-001 Tuberculose pulmonar" }], flashcards: 1, questoes: 0 } };
    if (fn === "app_admin_unit_topic") return { modo: "bloqueia", tema: "Tuberculose", status: "mudanca_pendente", motivos: [MOTIVO] };
    if (fn === "app_admin_vigilance_set_gate") throw new Error("Acesso restrito a administradores.");
    throw new Error(`inesperado: ${fn} ${JSON.stringify(args)}`);
  });
});
afterEach(cleanup);

describe("Temas vigiados", () => {
  it("cartão do tema com a situação, o motivo real e, ao abrir, as fontes e o que depende", async () => {
    render(<TemasVigiados />);
    expect(await screen.findByText("Tuberculose")).toBeTruthy();
    expect(screen.getByText("Mudança pendente")).toBeTruthy();
    expect(screen.getByText(MOTIVO)).toBeTruthy();
    fireEvent.click(screen.getByText("Ver fontes e o que depende"));
    expect(await screen.findByText(TB[0].titulo)).toBeTruthy();
    expect(screen.getByText(/1 unidade, 1 conjunto de flashcards, 0 questões/)).toBeTruthy();
  });
  it("a recusa do banco ao mudar o portão aparece na tela (só o administrador grava)", async () => {
    render(<TemasVigiados />);
    await screen.findByText("Tuberculose");
    fireEvent.click(screen.getByText("Bloquear"));
    await waitFor(() => expect(screen.getByText(/restrito a administradores/)).toBeTruthy());
  });
  it("detalhe da unidade: situação do tema e o aviso do portão", async () => {
    render(<TemaDaUnidade unitId="u1" />);
    expect(await screen.findByText(/Evidência do tema “Tuberculose”: Mudança pendente/)).toBeTruthy();
    expect(screen.getByText(/a publicação fica travada/)).toBeTruthy();
  });
});
