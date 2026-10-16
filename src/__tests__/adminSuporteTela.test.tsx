/**
 * Fase 1 · B12 na Administração (backend simulado), aba Configurações: "Contato de suporte" (uma configuração só) e a lista
 * "Relatos dos alunos" (data, aluno, tela e texto; marcar como resolvido). Sem a atualização do banco, avisa em português simples.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/admin/AdminQuestions.jsx", () => ({ AdminQuestions: () => null }));
vi.mock("../novo/app/admin/AdminUsers.jsx", () => ({ AdminUsers: () => null }));
vi.mock("../novo/app/admin/AdminPlay.jsx", () => ({ AdminPlay: () => null }));
vi.mock("../novo/app/admin/AdminLessons.jsx", () => ({ AdminLessons: () => null }));
vi.mock("../novo/app/admin/AdminUpdates.jsx", () => ({ AdminUpdates: () => null }));
vi.mock("../novo/app/admin/AdminPodcasts.jsx", () => ({ AdminPodcasts: () => null }));
vi.mock("../novo/app/admin/AdminPanels.jsx", () => ({ AdminAudit: () => null, AdminOverview: () => null, AdminPlans: () => null, AdminSettings: () => <div>painel de configurações</div>, AdminStations: () => null, AdminTutor: () => <div>painel do tutor</div> }));
vi.mock("../novo/app/admin/content/ContentHub.jsx", () => ({ ContentHub: () => null }));
vi.mock("../novo/app/admin/ai/AdminAI.jsx", () => ({ AdminAI: () => null }));
vi.mock("../novo/app/admin/OfficialVoicesPanel.jsx", () => ({ OfficialVoicesPanel: () => null }));

import { AdminScreen } from "../novo/app/admin/AdminScreen.jsx";
import { AdminReports, AdminSupportContact } from "../novo/app/admin/AdminSupport.jsx";

const R1 = { id: 11, created_at: "2026-10-12T15:30:00Z", status: "open", screen: "Simulados", message: "O cronômetro do simulado travou no meio da prova.", student_name: "Ana Souza", student_email: "ana@teste.dev", resolved_at: null, resolved_by_name: null };
const R2 = { id: 10, created_at: "2026-10-11T10:00:00Z", status: "open", screen: null, message: "Não consigo entrar com o Google.", student_name: null, student_email: "bia@teste.dev", resolved_at: null, resolved_by_name: null };
let reports: any[];

const instalar = (extra: Record<string, (args?: any) => any> = {}) => {
  backend.rpc.mockImplementation(async (fn: string, args?: any) => {
    if (extra[fn]) return extra[fn](args);
    if (fn === "app_support_contact") return { email: "suporte@staziamed.com.br" };
    if (fn === "app_admin_reports") {
      const lista = reports.filter((r) => args.p_status === "all" || r.status === args.p_status);
      return { open: reports.filter((r) => r.status === "open").length, total: lista.length, items: lista.slice(0, args.p_limit) };
    }
    if (fn === "app_admin_report_resolve") {
      const r = reports.find((x) => x.id === args.p_id)!;
      r.status = args.p_resolved ? "resolved" : "open";
      r.resolved_at = args.p_resolved ? "2026-10-12T18:00:00Z" : null;
      r.resolved_by_name = args.p_resolved ? "Adm" : null;
      return { id: r.id, status: r.status };
    }
    if (fn === "app_admin_save_support_contact") return { email: String(args.p_email).trim().toLowerCase() };
    return null;
  });
};

beforeEach(() => {
  backend.rpc.mockReset();
  reports = [{ ...R1 }, { ...R2 }];
});
afterEach(cleanup);

describe("Configurações: onde ficam o contato e os relatos", () => {
  it("a aba Configurações do administrador mostra o contato de suporte e a lista de relatos", async () => {
    instalar();
    render(
      <MemoryRouter initialEntries={["/admin?aba=config"]}>
        <AdminScreen />
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { name: "Contato de suporte" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Relatos dos alunos" })).toBeTruthy();
    expect(screen.getByText("painel de configurações")).toBeTruthy();
  });
});

describe("Contato de suporte", () => {
  it("mostra o e-mail atual e o padrão na dica; salva e confirma", async () => {
    instalar();
    render(<AdminSupportContact />);
    const campo = (await screen.findByLabelText("E-mail de suporte")) as HTMLInputElement;
    expect(campo.value).toBe("suporte@staziamed.com.br");
    expect(screen.getByText(/Se ficar em branco, vale suporte@staziamed\.com\.br/)).toBeTruthy();
    fireEvent.change(campo, { target: { value: "Ajuda@StaziaMed.com.br" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar contato" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_save_support_contact", { p_email: "Ajuda@StaziaMed.com.br" }));
    expect(await screen.findByText("Contato de suporte salvo.")).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText("E-mail de suporte") as HTMLInputElement).value).toBe("ajuda@staziamed.com.br"));
  });

  it("e-mail inválido: mostra a mensagem do banco em português", async () => {
    instalar({ app_admin_save_support_contact: () => { throw new Error("Informe um e-mail de suporte válido (exemplo: suporte@staziamed.com.br)."); } });
    render(<AdminSupportContact />);
    fireEvent.change(await screen.findByLabelText("E-mail de suporte"), { target: { value: "sem-arroba" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar contato" }));
    expect(await screen.findByText("Informe um e-mail de suporte válido (exemplo: suporte@staziamed.com.br).")).toBeTruthy();
  });

  it("banco sem a atualização: avisa que ainda não está ativo e que os alunos veem o e-mail padrão", async () => {
    instalar({ app_support_contact: () => { throw new Error("Could not find the function public.app_support_contact in the schema cache"); } });
    render(<AdminSupportContact />);
    const aviso = await screen.findByText(/Ainda não está ativo: falta uma atualização do banco/);
    expect(aviso.textContent).toContain("os alunos veem suporte@staziamed.com.br");
    expect(aviso.textContent).not.toMatch(/function|schema/i);
  });
});

describe("Relatos dos alunos", () => {
  it("lista os abertos com data, aluno, tela e texto; mostra quantos estão abertos", async () => {
    instalar();
    render(<AdminReports />);
    const lista = await screen.findByRole("list", { name: "Relatos dos alunos" });
    const itens = within(lista).getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(itens[0].textContent).toContain("Ana Souza");
    expect(itens[0].textContent).toContain("ana@teste.dev");
    expect(itens[0].textContent).toContain("Simulados");
    expect(itens[0].textContent).toContain("O cronômetro do simulado travou no meio da prova.");
    expect(itens[0].textContent).toMatch(/12\/10\/2026/);
    expect(itens[1].textContent).toContain("Aluno sem nome");
    expect(screen.getByText("2 abertos")).toBeTruthy();
  });

  it("marcar como resolvido tira da lista de abertos e aparece em Resolvidos, com quem resolveu; dá para reabrir", async () => {
    instalar();
    render(<AdminReports />);
    const lista = await screen.findByRole("list", { name: "Relatos dos alunos" });
    fireEvent.click(within(within(lista).getAllByRole("listitem")[0]).getByRole("button", { name: "Marcar como resolvido" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_report_resolve", { p_id: 11, p_resolved: true }));
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Relatos dos alunos" })).getAllByRole("listitem")).toHaveLength(1));
    expect(screen.getByText("1 aberto")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Resolvidos" }));
    const resolvidos = await screen.findByText(/Resolvido por Adm em/);
    expect(resolvidos).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_report_resolve", { p_id: 11, p_resolved: false }));
    expect(await screen.findByText("Nenhum relato resolvido ainda")).toBeTruthy();
  });

  it("sem relatos: mensagem simples", async () => {
    reports = [];
    instalar();
    render(<AdminReports />);
    expect(await screen.findByText("Nenhum relato aberto")).toBeTruthy();
  });

  it("banco sem a atualização: avisa em português simples, sem termo técnico", async () => {
    instalar({ app_admin_reports: () => { throw new Error("Could not find the function public.app_admin_reports(p_limit, p_offset, p_status) in the schema cache"); } });
    render(<AdminReports />);
    const aviso = await screen.findByText(/Ainda não está ativo: falta uma atualização do banco/);
    expect(aviso.textContent).not.toMatch(/function|schema|p_limit/i);
  });

  it("falha ao marcar: mostra aviso e a lista continua", async () => {
    instalar({ app_admin_report_resolve: () => { throw new Error("Relato não encontrado."); } });
    render(<AdminReports />);
    const lista = await screen.findByRole("list", { name: "Relatos dos alunos" });
    fireEvent.click(within(within(lista).getAllByRole("listitem")[0]).getByRole("button", { name: "Marcar como resolvido" }));
    expect(await screen.findByText("Relato não encontrado.")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Relatos dos alunos" })).getAllByRole("listitem")).toHaveLength(2);
  });
});
