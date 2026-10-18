// @vitest-environment jsdom
// Administração → Lista de interesse (013960): a tela com o servidor simulado. Números e por dia; link do grupo (recusa o link com
// "?s=…" antes de mandar); lista com o botão "Abrir conversa" (wa.me) e o clique no grupo; "Avisar todos" só depois da prévia e da
// confirmação, mandando o número que a prévia mostrou. A aba não aparece para quem não é administrador.
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// o backend da sessão é o MESMO objeto entre renderizações (como no app); um novo a cada vez recarregaria sem parar
const sessao = vi.hoisted(() => ({ role: "admin", backend: { accessToken: async () => "tok" } }));
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ backend: sessao.backend, boot: { role: sessao.role, profile: { name: "Adm" } }, user: { id: "a" } }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/admin/AdminQuestions.jsx", () => ({ AdminQuestions: () => null }));
vi.mock("../novo/app/admin/AdminUsers.jsx", () => ({ AdminUsers: () => null }));
vi.mock("../novo/app/admin/AdminPlay.jsx", () => ({ AdminPlay: () => null }));
vi.mock("../novo/app/admin/AdminLessons.jsx", () => ({ AdminLessons: () => null }));
vi.mock("../novo/app/admin/AdminUpdates.jsx", () => ({ AdminUpdates: () => null }));
vi.mock("../novo/app/admin/AdminPodcasts.jsx", () => ({ AdminPodcasts: () => null }));
vi.mock("../novo/app/admin/AdminPanels.jsx", () => ({ AdminAudit: () => null, AdminOverview: () => null, AdminPlans: () => null, AdminSettings: () => null, AdminStations: () => null, AdminTutor: () => null }));
vi.mock("../novo/app/admin/content/ContentHub.jsx", () => ({ ContentHub: () => null }));
vi.mock("../novo/app/admin/ai/AdminAI.jsx", () => ({ AdminAI: () => null }));
vi.mock("../novo/app/admin/radar/RadarFila.jsx", () => ({ RadarFila: () => null }));
vi.mock("../novo/app/admin/OfficialVoicesPanel.jsx", () => ({ OfficialVoicesPanel: () => null }));

import { AdminListaInteresse } from "../novo/app/admin/AdminListaInteresse.jsx";
import { AdminScreen } from "../novo/app/admin/AdminScreen.jsx";
import { linkConversa, whatsappBonito } from "../novo/app/admin/listaInteresseApi.js";

const RESUMO = {
  total: 3,
  contagem: { ativos: 3, descadastrados: 1, clicaram_grupo: 2, com_email: 2, email_pendente: 1, email_confirmado: 1, email_avisado: 0 },
  por_dia: [{ dia: "2026-10-18", inscritos: 3, emails_confirmados: 1, cliques_grupo: 2 }],
  a_avisar: 1,
  aviso: { na_fila: 0, enviados: 0, incertos: 0, nao_enviados: 0, primeiro_em: null },
  grupo: { link: null },
};
const LISTA = {
  total: 1,
  itens: [{ id: 7, whatsapp: "+5511987654321", nome: "Maria", email: "maria@exemplo.com", email_estado: "confirmado", estado: "ativo", origem: "site_inicio", criado_em: "2026-10-18T12:00:00Z", grupo_clicado_em: "2026-10-18T12:01:00Z" }],
};
let chamadas: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  chamadas = [];
  sessao.role = "admin";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (url.startsWith("/api/interesse/admin/resumo")) return json(RESUMO);
    if (url.startsWith("/api/interesse/admin/lista")) return json(LISTA);
    if (url === "/api/interesse/admin/grupo") return json({ link: JSON.parse(String(init?.body)).link });
    if (url === "/api/interesse/admin/aviso/previa") return json({ destinatarios: 1, email_pendente: 1, so_whatsapp: 1, email: { assunto: "A 2ª fase do StaziaMed abriu", texto: "Olá, Maria!\n\nEla abriu." } });
    if (url === "/api/interesse/admin/aviso") return json({ emails: 1 });
    return json({ error: "?" }, 404);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Administração → Lista de interesse", () => {
  it("mostra os números, o por dia e a lista com WhatsApp, conversa no WhatsApp e clique no grupo; tudo com o token", async () => {
    render(<AdminListaInteresse />);
    expect(await screen.findByText("Clicaram no grupo")).toBeTruthy();
    expect(screen.getByText("18/10/2026")).toBeTruthy();
    expect(await screen.findByText("+55 (11) 98765-4321")).toBeTruthy();
    const conversa = screen.getByRole("link", { name: /Abrir conversa no WhatsApp/ });
    expect(conversa.getAttribute("href")).toBe("https://wa.me/5511987654321");
    expect(conversa.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText(/Clicou no grupo em/)).toBeTruthy();
    expect(chamadas.every((c) => (c.init?.headers as Record<string, string>)?.Authorization === "Bearer tok")).toBe(true);
  });

  it("link do grupo: com '?s=…' a tela avisa e não deixa salvar; o convite limpo é salvo", async () => {
    render(<AdminListaInteresse />);
    const campo = await screen.findByLabelText("Link de convite do grupo do WhatsApp");
    fireEvent.change(campo, { target: { value: "https://chat.whatsapp.com/DNC7gB0Yku2ARNf0f55USz?s=cl&p=a" } });
    expect(screen.getByText(/Tire o que vem depois do/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Salvar link" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(campo, { target: { value: "https://chat.whatsapp.com/DNC7gB0Yku2ARNf0f55USz" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar link" }));
    expect(await screen.findByText(/Link salvo/)).toBeTruthy();
    const salvar = chamadas.find((c) => c.url === "/api/interesse/admin/grupo")!;
    expect(JSON.parse(String(salvar.init?.body))).toEqual({ link: "https://chat.whatsapp.com/DNC7gB0Yku2ARNf0f55USz" });
  });

  it("avisar: nada sai sem a prévia e a confirmação; manda o número que a prévia mostrou", async () => {
    render(<AdminListaInteresse />);
    fireEvent.click(await screen.findByRole("button", { name: /Ver prévia \(1 pessoa\)/ }));
    const previa = await screen.findByTestId("previa-aviso");
    expect(within(previa).getByText("A 2ª fase do StaziaMed abriu")).toBeTruthy();
    expect(chamadas.some((c) => c.url === "/api/interesse/admin/aviso")).toBe(false);
    fireEvent.click(within(previa).getByRole("button", { name: "Sim, avisar 1 pessoa" }));
    expect(await screen.findByText(/entraram na fila de e-mail/)).toBeTruthy();
    const av = chamadas.find((c) => c.url === "/api/interesse/admin/aviso")!;
    expect(av.init?.method).toBe("POST");
    expect(JSON.parse(String(av.init?.body))).toEqual({ esperado: 1 });
  });

  it("formatos: WhatsApp do Brasil fica legível; de fora fica como está; wa.me só com os dígitos", () => {
    expect(whatsappBonito("+5521998765432")).toBe("+55 (21) 99876-5432");
    expect(whatsappBonito("+556133334444")).toBe("+55 (61) 3333-4444");
    expect(whatsappBonito("+595981123456")).toBe("+595981123456");
    expect(linkConversa("+595981123456")).toBe("https://wa.me/595981123456");
  });
});

describe("a aba só existe para o administrador", () => {
  it("editor não vê a aba Lista de interesse", async () => {
    sessao.role = "editor";
    render(
      <MemoryRouter initialEntries={["/admin?aba=interesse"]}>
        <AdminScreen />
      </MemoryRouter>,
    );
    const abas = within(screen.getByRole("tablist", { name: "Administração" })).getAllByRole("tab").map((a) => a.textContent);
    expect(abas).not.toContain("Lista de interesse");
    expect(screen.queryByTestId("admin-lista-interesse")).toBeNull();
  });
});
