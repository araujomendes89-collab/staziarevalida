/**
 * Fontes complementares, tela da equipe (aba Fontes da Central de Conteúdo; jsdom, banco simulado): a fonte complementar mostra
 * "Fonte complementar · o aluno não vê esta fonte", só o administrador troca a classe, e a troca chama a função certa.
 * O Registro da Administração mostra a troca em português.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { Sources } from "../novo/app/admin/content/Sources.jsx";
import { auditSummary as entrySummary, auditLabel as actionLabel } from "../novo/app/admin/auditLog.js";

const FONTE = (id: string, title: string, organ: string, level: string) => ({
  id, title, organ, kind: "final", status: "current", version: "1", authority_level: level, passages: 3, freshness: "FRESH", changes: 0, diffs: 0, url: null,
});
const OFICIAL = FONTE("s1", "PCDT de Bronquiolite", "Ministério da Saúde", "A");
const APOSTILA = FONTE("s2", "Sangue nos Olhos — Clínica Médica", "Sangue nos Olhos", "E");
let classes: Record<string, string>;

beforeEach(() => {
  classes = { s1: "oficial", s2: "complementar" };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_ch_sources") return [OFICIAL, APOSTILA];
    if (fn === "app_ch_source_audiences") return classes;
    if (fn === "app_ch_set_source_audience") {
      classes = { ...classes, [args.p_source_id]: args.p_audience };
      return { id: args.p_source_id, audience: args.p_audience, authority_level: "E" };
    }
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

describe("aba Fontes: classe da fonte", () => {
  it("só a fonte complementar leva o selo 'o aluno não vê esta fonte'", async () => {
    render(<Sources isAdmin go={() => {}} />);
    expect(await screen.findByText("Sangue nos Olhos — Clínica Médica")).toBeTruthy();
    expect(screen.getAllByText("Fonte complementar · o aluno não vê esta fonte")).toHaveLength(1);
  });

  it("o administrador marca uma fonte como complementar e a tela recarrega", async () => {
    render(<Sources isAdmin go={() => {}} />);
    fireEvent.click(await screen.findByText("PCDT de Bronquiolite"));
    const select = (await screen.findByLabelText("Classe da fonte")) as HTMLSelectElement;
    expect(select.value).toBe("oficial");
    fireEvent.change(select, { target: { value: "complementar" } });
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_ch_set_source_audience", { p_source_id: "s1", p_audience: "complementar" }));
    await waitFor(() => expect(screen.getAllByText("Fonte complementar · o aluno não vê esta fonte")).toHaveLength(2));
  });

  it("quem não é administrador vê o selo, mas não a ação", async () => {
    render(<Sources isAdmin={false} go={() => {}} />);
    fireEvent.click(await screen.findByText("Sangue nos Olhos — Clínica Médica"));
    expect(screen.getAllByText("Fonte complementar · o aluno não vê esta fonte")).toHaveLength(1);
    expect(screen.queryByLabelText("Classe da fonte")).toBeNull();
  });

  it("se a lista de classes falhar, nenhuma fonte é marcada (não inventa)", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_ch_sources") return [OFICIAL, APOSTILA];
      throw new Error("fora do ar");
    });
    render(<Sources isAdmin go={() => {}} />);
    await screen.findByText("PCDT de Bronquiolite");
    expect(screen.queryByText("Fonte complementar · o aluno não vê esta fonte")).toBeNull();
  });
});

describe("Registro da Administração", () => {
  it("a troca de classe aparece em português", () => {
    const entry = { action: "source.audience", target: "s2", details: { title: "Sangue nos Olhos — Clínica Médica", to: "complementar", reason: "apostila" } };
    expect(actionLabel(entry)).toBe("Classe da fonte alterada");
    expect(entrySummary(entry)).toContain("o aluno não vê esta fonte");
  });
});
