/**
 * Central › Unidades e revisão: botão "Importar aula pronta" (só equipe). Lê o pacote .json, chama a função do banco e abre a versão
 * importada (aguardando revisão). Banco simulado; o pacote é o da GR-001 real.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { Units } from "../novo/app/admin/content/Units.jsx";

const PACOTE = fs.readFileSync(path.join(__dirname, "fixtures/aula-pronta-GR-001.json"), "utf8");
const arquivo = (texto: string) => {
  const f = new File([texto], "pacote-GR-001.json", { type: "application/json" });
  (f as any).text = async () => texto;
  return f;
};
let resposta: any;
beforeEach(() => {
  resposta = { resultado: "criada", version_id: "v-importada", version: 1, status: "awaiting_review", afirmacoes: 42, avisos: [] };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_ch_units") return [];
    if (fn === "app_ch_import_lesson_package") {
      if (resposta instanceof Error) throw resposta;
      return resposta;
    }
    return null;
  });
});
afterEach(() => cleanup());
const ctx = (extra: Record<string, unknown> = {}) => ({ params: new URLSearchParams(), go: vi.fn(), isAdmin: false, isStaff: true, reviewerAreas: [], ...extra });

describe("Importar aula pronta", () => {
  it("equipe escolhe o pacote: a função recebe o pacote inteiro e a tela abre a versão importada", async () => {
    const c = ctx();
    const { container } = render(<Units {...c} />);
    await screen.findByRole("button", { name: /Importar aula pronta/ });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [arquivo(PACOTE)] } });
    await waitFor(() => expect(c.go).toHaveBeenCalledWith("unidades", { versao: "v-importada" }));
    const chamada = backend.rpc.mock.calls.find((x: any[]) => x[0] === "app_ch_import_lesson_package");
    expect(chamada[1].p_package).toEqual(JSON.parse(PACOTE));
  });

  it("recusa do banco aparece na tela, em português, e nada é aberto", async () => {
    resposta = new Error("Aula não importada. Corrija o pacote: Fonte fora da biblioteca: \"Manual\"");
    const c = ctx();
    const { container } = render(<Units {...c} />);
    await screen.findByRole("button", { name: /Importar aula pronta/ });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [arquivo(PACOTE)] } });
    expect(await screen.findByText(/Fonte fora da biblioteca/)).toBeTruthy();
    expect(c.go).not.toHaveBeenCalled();
  });

  it("arquivo que não é pacote: aviso, sem chamar o banco", async () => {
    const c = ctx();
    const { container } = render(<Units {...c} />);
    await screen.findByRole("button", { name: /Importar aula pronta/ });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [arquivo("isto não é json")] } });
    expect(await screen.findByText(/não é um pacote de aula/)).toBeTruthy();
    expect(backend.rpc.mock.calls.some((x: any[]) => x[0] === "app_ch_import_lesson_package")).toBe(false);
  });

  it("revisor médico sem papel de equipe não vê o botão", async () => {
    render(<Units {...ctx({ isStaff: false, reviewerAreas: ["CLINICA_MEDICA"] })} />);
    await screen.findByText(/Nenhuma unidade aqui/);
    expect(screen.queryByRole("button", { name: /Importar aula pronta/ })).toBeNull();
  });
});
