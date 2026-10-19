// @vitest-environment jsdom
/**
 * Administração · limites dos convites do radar (AdminDuplaConvites) e registro de trocas de @ (AdminDuplaHandleLog).
 * `backend.rpc` simulado por função; dados SÓ de teste.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin" }, user: { id: "adm" } }) }));

import { AdminDuplaConvites, AdminDuplaHandleLog } from "../novo/app/admin/AdminDuplaConvites.jsx";

const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const L = {
  hora: "Convites por hora (por aluno)",
  dia: "Convites por dia (por aluno)",
  espera: "Espera para reconvidar a mesma pessoa (minutos)",
  pedidos: "Pedidos de treino por link, por dia (por aluno)",
};
const NULOS = { convites: { por_hora: null, por_dia: null, espera_min: null, pedidos_por_dia: null } };
const SEM_LIMITE = /Hoje não há limite por hora/;

let loaded: any;
let saveImpl: (args: any) => any;

beforeEach(() => {
  loaded = NULOS;
  saveImpl = (args) => args.p_config;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_dupla_radar") return loaded;
    if (fn === "app_admin_save_dupla_radar") return saveImpl(args);
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

describe("AdminDuplaConvites", () => {
  it("carrega app_admin_dupla_radar e mostra os 4 campos vazios quando vêm nulos, com o aviso de que não há limite", async () => {
    render(<AdminDuplaConvites />);
    await screen.findByLabelText(L.hora);
    expect(calls("app_admin_dupla_radar")).toHaveLength(1);
    for (const label of Object.values(L)) expect(field(label).value).toBe("");
    expect(screen.getByText(SEM_LIMITE)).toBeTruthy();
    expect(screen.getByText(/campo vazio é sem limite/)).toBeTruthy();
    expect(screen.queryByText("Configurações salvas.")).toBeNull();
  });

  it("valores vindos do banco preenchem os campos e o aviso de 'sem limite' some", async () => {
    loaded = { convites: { por_hora: 5, por_dia: 20, espera_min: 30, pedidos_por_dia: 10 } };
    render(<AdminDuplaConvites />);
    await screen.findByLabelText(L.hora);
    expect([L.hora, L.dia, L.espera, L.pedidos].map((l) => field(l).value)).toEqual(["5", "20", "30", "10"]);
    expect(screen.queryByText(SEM_LIMITE)).toBeNull();
  });

  it("um só campo preenchido já tira o aviso; esvaziar de novo o traz de volta", async () => {
    render(<AdminDuplaConvites />);
    await screen.findByLabelText(L.hora);
    fireEvent.change(field(L.espera), { target: { value: "15" } });
    expect(screen.queryByText(SEM_LIMITE)).toBeNull();
    fireEvent.change(field(L.espera), { target: { value: "" } });
    expect(screen.getByText(SEM_LIMITE)).toBeTruthy();
  });

  it("salva números e null para os vazios, e mostra 'Configurações salvas.'", async () => {
    render(<AdminDuplaConvites />);
    await screen.findByLabelText(L.hora);
    fireEvent.change(field(L.hora), { target: { value: "5" } });
    fireEvent.change(field(L.pedidos), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar limites dos convites" }));
    expect(await screen.findByText("Configurações salvas.")).toBeTruthy();
    expect(calls("app_admin_save_dupla_radar")).toHaveLength(1);
    expect(calls("app_admin_save_dupla_radar")[0][1]).toEqual({
      p_config: { convites: { por_hora: 5, por_dia: null, espera_min: null, pedidos_por_dia: 12 } },
    });
    const sent = calls("app_admin_save_dupla_radar")[0][1].p_config.convites;
    expect(typeof sent.por_hora).toBe("number");
    expect(sent.por_dia).toBeNull();
    // o formulário passa a mostrar o que o servidor devolveu
    expect(field(L.hora).value).toBe("5");
    expect(field(L.dia).value).toBe("");
  });

  it("salvar tudo vazio manda quatro null", async () => {
    render(<AdminDuplaConvites />);
    await screen.findByLabelText(L.hora);
    fireEvent.click(screen.getByRole("button", { name: "Salvar limites dos convites" }));
    await screen.findByText("Configurações salvas.");
    expect(calls("app_admin_save_dupla_radar")[0][1]).toEqual({
      p_config: { convites: { por_hora: null, por_dia: null, espera_min: null, pedidos_por_dia: null } },
    });
  });

  it("o valor do servidor manda: se ele corrigir um número, o campo mostra o corrigido", async () => {
    saveImpl = () => ({ convites: { por_hora: 60, por_dia: null, espera_min: null, pedidos_por_dia: null } });
    render(<AdminDuplaConvites />);
    await screen.findByLabelText(L.hora);
    fireEvent.change(field(L.hora), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar limites dos convites" }));
    await screen.findByText("Configurações salvas.");
    expect(field(L.hora).value).toBe("60");
  });

  it("mostra o erro do servidor, sem 'Configurações salvas.', e mantém o que foi digitado", async () => {
    saveImpl = () => {
      throw new Error("Convites por hora: informe de 1 a 60.");
    };
    render(<AdminDuplaConvites />);
    await screen.findByLabelText(L.hora);
    fireEvent.change(field(L.hora), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar limites dos convites" }));
    expect(await screen.findByText("Convites por hora: informe de 1 a 60.")).toBeTruthy();
    expect(screen.queryByText("Configurações salvas.")).toBeNull();
    expect(field(L.hora).value).toBe("500");
  });

  it("editar depois de salvar tira o 'Configurações salvas.'", async () => {
    render(<AdminDuplaConvites />);
    await screen.findByLabelText(L.hora);
    fireEvent.click(screen.getByRole("button", { name: "Salvar limites dos convites" }));
    await screen.findByText("Configurações salvas.");
    fireEvent.change(field(L.dia), { target: { value: "3" } });
    expect(screen.queryByText("Configurações salvas.")).toBeNull();
  });

  it("erro ao carregar mostra o aviso de erro em vez do formulário", async () => {
    backend.rpc.mockImplementation(async () => {
      throw new Error("Falha de teste ao carregar.");
    });
    render(<AdminDuplaConvites />);
    expect(await screen.findByText(/Falha de teste ao carregar/)).toBeTruthy();
    expect(screen.queryByLabelText(L.hora)).toBeNull();
  });
});

describe("AdminDuplaHandleLog", () => {
  it("lista 'Nome @velho → @novo' com a data, da forma que o servidor entrega", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_dupla_handle_log")
        return {
          items: [
            { id: "l2", public_name: "Colega Teste Um", old_handle: "colega.velho", new_handle: "colega.novo", changed_at: "2026-10-12T15:00:00Z" },
            { id: "l1", public_name: "Colega Teste Dois", old_handle: "revalida.k7m2", new_handle: "colega.dois", changed_at: "2026-10-05T15:00:00Z" },
          ],
        };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<AdminDuplaHandleLog />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Colega Teste Um");
    expect(rows[0].textContent).toContain("@colega.velho → @colega.novo");
    expect(rows[0].textContent).toMatch(/12\/10\/2026/);
    expect(rows[1].textContent).toContain("Colega Teste Dois");
    expect(rows[1].textContent).toContain("@revalida.k7m2 → @colega.dois");
    expect(rows[1].textContent).toMatch(/05\/10\/2026/);
    expect(within(rows[0]).getByText("Colega Teste Um").tagName).toBe("B");
    expect(calls("app_admin_dupla_handle_log")[0][1]).toEqual({ p_limit: 50 });
    expect(screen.queryByText("Nenhuma troca até agora.")).toBeNull();
  });

  it("sem @ antigo mostra '—' no lugar", async () => {
    backend.rpc.mockResolvedValue({ items: [{ id: "l1", public_name: "Colega Teste Um", old_handle: null, new_handle: "colega.novo", changed_at: "2026-10-12T15:00:00Z" }] });
    render(<AdminDuplaHandleLog />);
    expect((await screen.findByRole("listitem")).textContent).toContain("@— → @colega.novo");
  });

  it("vazio: 'Nenhuma troca até agora.'", async () => {
    backend.rpc.mockResolvedValue({ items: [] });
    render(<AdminDuplaHandleLog />);
    expect(await screen.findByText("Nenhuma troca até agora.")).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("resposta sem 'items' também mostra 'Nenhuma troca até agora.'", async () => {
    backend.rpc.mockResolvedValue({});
    render(<AdminDuplaHandleLog />);
    expect(await screen.findByText("Nenhuma troca até agora.")).toBeTruthy();
  });

  it("nunca mostra e-mail, mesmo que o servidor mandasse o campo", async () => {
    backend.rpc.mockResolvedValue({
      items: [{ id: "l1", public_name: "Colega Teste Um", email: "colega@teste.invalid", old_handle: "a.velho", new_handle: "a.novo", changed_at: "2026-10-12T15:00:00Z" }],
    });
    render(<AdminDuplaHandleLog />);
    await screen.findByRole("listitem");
    expect(document.body.textContent).not.toMatch(/teste\.invalid|e-mail|email/i);
  });

  it("erro ao carregar não quebra a tela", async () => {
    backend.rpc.mockRejectedValue(new Error("Falha de teste ao carregar."));
    render(<AdminDuplaHandleLog />);
    await waitFor(() => expect(screen.getByText(/Falha de teste ao carregar/)).toBeTruthy());
  });
});
