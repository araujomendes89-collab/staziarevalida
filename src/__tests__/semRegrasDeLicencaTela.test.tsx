/**
 * Central de Conteúdo sem regras de licença (decisão do dono, 2026-10-09): as telas não têm campo, aviso nem selo de direitos.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { Documents } from "../novo/app/admin/content/Documents.jsx";
import { Units } from "../novo/app/admin/content/Units.jsx";

const DOC = { id: "d1", name: "Apostila", status: "ready", purpose: "study_material", rights_status: "own", sha256: "abc", page_count: 1, text_kind: "text", created_at: "2026-10-09T12:00:00Z", provenance: {}, jobs: [] };
const ctx = (params = "") => ({ params: new URLSearchParams(params), go: vi.fn(), isAdmin: true, isStaff: true, reviewerAreas: [] });

beforeEach(() => {
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_ch_documents") return [DOC];
    if (fn === "app_ch_document") return { document: DOC, jobs: [], inventory: null, pages: [], claims: [], ai_runs: [] };
    if (fn === "app_ch_unit_version") {
      return { title: "Bronquiolite", area_code: null, version: { id: "v1", version: 1, status: "draft", origin: "adaptation", generated_by_model: "modelo", content: { sections: [] }, review_flags: [] }, claims: [], approvals: [], publications: [], materials: [], problems: [], decisions: [], history: [] };
    }
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

describe("Central de Conteúdo sem regras de licença (telas)", () => {
  it("Importar PDF: sem direitos, sem aviso de licença, botão liberado só com o arquivo", async () => {
    render(<Documents {...ctx()} />);
    await screen.findByText("Apostila");
    expect(screen.queryByText(/Direitos de uso/)).toBeNull();
    expect(screen.queryByText(/Licença ou autorização/)).toBeNull();
    expect(screen.queryByText(/não significam licença/)).toBeNull();
    expect(screen.queryByText(/Próprio \(autoria/)).toBeNull();
    const button = screen.getByRole("button", { name: /Enviar e processar/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Arquivo PDF"), { target: { files: [new File(["%PDF-1.4"], "a.pdf", { type: "application/pdf" })] } });
    expect(button.disabled).toBe(false);
  });

  it("detalhe do documento: sem seção de direitos nem de licença", async () => {
    render(<Documents {...ctx("id=d1")} />);
    await screen.findByText("Procedência");
    expect(screen.queryByText("Direitos de uso")).toBeNull();
    expect(screen.queryByText("Licença de adaptação")).toBeNull();
  });

  it("unidade: sem selo de origem (adaptação licenciada / criação independente)", async () => {
    render(<Units {...ctx("versao=v1")} />);
    await screen.findByText("Bronquiolite");
    expect(screen.queryByText(/Adaptação licenciada/)).toBeNull();
    expect(screen.queryByText(/Criação independente/)).toBeNull();
  });
});
