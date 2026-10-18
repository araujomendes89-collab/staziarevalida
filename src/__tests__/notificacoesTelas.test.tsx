// @vitest-environment jsdom
/**
 * Central de Notificações do aluno nas telas (migração 013830): sino com bolinha (até "9+") e nome acessível, painel com a lista do
 * mais novo para o mais antigo, botão de ação que marca como lida e leva ao lugar certo, "Marcar todas como lidas", estado vazio,
 * carregamento, painel de baixo para cima no celular, atualização ao voltar para a aba (sem repetir a cada segundo), equipe sem
 * sino, pop-up de cobrança avisando a Central, avisos urgentes (não saem com "marcar como lida"; "Entendi" vale só nesta abertura)
 * e a tela de Comunicados da Administração (prévia antes de enviar).
 */
import React from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { role: "student" }, user: { id: "u1" } }) }));

import { NotificacoesProvider } from "../novo/app/notificacoes/NotificacoesProvider.jsx";
import { Sino } from "../novo/app/notificacoes/Sino.jsx";
import { destinoDaAcao, rotuloBolinha, rotuloSino, tempoRelativo } from "../novo/app/notificacoes/modelo.js";
import { AvisosPopup } from "../novo/app/plan/AvisosPopup.jsx";
import { AdminComunicados, problemaDoComunicado } from "../novo/app/admin/AdminComunicados.jsx";

const agora = Date.now();
const ITENS = [
  { id: 3, tipo: "acesso_bloqueado", titulo: "Seu acesso pago foi pausado", texto: "Pague em Meu plano.", rota: "planos", link: null, acao: "Pagar agora", em: new Date(agora - 2 * 3600e3).toISOString(), lida: false },
  { id: 2, tipo: "comunicado", titulo: "Simulado nacional no sábado", texto: "Às 9h, no app.", rota: "nenhuma", link: null, acao: null, em: new Date(agora - 26 * 3600e3).toISOString(), lida: false },
  { id: 1, tipo: "contrato_novo", titulo: "Atualizamos o Contrato (versão 3.0)", texto: "Leia e aceite.", rota: "aceite", link: null, acao: "Ler o contrato", em: new Date(agora - 5 * 86400e3).toISOString(), lida: true },
];

function Onde() {
  const l = useLocation();
  return <span data-testid="onde">{l.pathname + l.search}</span>;
}
function montar({ ativo = true, rota = "/" } = {}) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <NotificacoesProvider ativo={ativo}>
        <Sino />
        <Routes>
          <Route path="*" element={<Onde />} />
        </Routes>
      </NotificacoesProvider>
    </MemoryRouter>
  );
}
const responder = (itens = ITENS, naoLidas = itens.filter((i) => !i.lida).length) =>
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_minhas_notificacoes") return { aluno: true, nao_lidas: naoLidas, itens };
    if (fn === "app_notificacoes_lidas") return 1;
    return null;
  });
let celular = false;

beforeEach(() => {
  backend.rpc.mockReset();
  celular = false;
  window.matchMedia = ((q: string) => ({ matches: celular && /max-width: (719|860)px/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as any;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("regras da tela", () => {
  it("bolinha até 9+, nome acessível e data relativa em português", () => {
    expect(rotuloBolinha(0)).toBeNull();
    expect(rotuloBolinha(3)).toBe("3");
    expect(rotuloBolinha(9)).toBe("9");
    expect(rotuloBolinha(10)).toBe("9+");
    expect(rotuloSino(3)).toBe("Notificações, 3 não lidas");
    expect(rotuloSino(1)).toBe("Notificações, 1 não lida");
    expect(rotuloSino(0)).toBe("Notificações, nenhuma não lida");
    const base = new Date("2026-10-17T15:00:00-03:00");
    const antes = (ms: number) => new Date(base.getTime() - ms).toISOString();
    expect(tempoRelativo(antes(20e3), base)).toBe("agora mesmo");
    expect(tempoRelativo(antes(5 * 60e3), base)).toBe("há 5 minutos");
    expect(tempoRelativo(antes(2 * 3600e3), base)).toBe("há 2 horas");
    expect(tempoRelativo(antes(20 * 3600e3), base)).toBe("ontem");
    expect(tempoRelativo(antes(3 * 86400e3), base)).toBe("há 3 dias");
    expect(tempoRelativo("2026-09-02T12:00:00-03:00", base)).toMatch(/^2 de set/);
  });

  it("o botão leva ao lugar certo; link de fora só https", () => {
    expect(destinoDaAcao({ acao: "Pagar agora", rota: "planos" })).toEqual({ rota: "/planos" });
    expect(destinoDaAcao({ acao: "Ver assinatura", rota: "perfil" })).toEqual({ rota: "/perfil?secao=assinatura" });
    expect(destinoDaAcao({ acao: "Ler o contrato", rota: "aceite" })).toEqual({ rota: "/aceite" });
    expect(destinoDaAcao({ acao: "Abrir", rota: "link", link: "/atualizacoes" })).toEqual({ rota: "/atualizacoes" });
    expect(destinoDaAcao({ acao: "Abrir", rota: "link", link: "https://www.gov.br/inep" })).toEqual({ externo: "https://www.gov.br/inep" });
    expect(destinoDaAcao({ acao: "Abrir", rota: "link", link: "javascript:alert(1)" })).toBeNull();
    expect(destinoDaAcao({ acao: null, rota: "nenhuma" })).toBeNull();
  });
});

describe("sino", () => {
  it("mostra o número de não lidas com nome acessível; mais de 9 vira 9+", async () => {
    responder();
    montar();
    const sino = await screen.findByRole("button", { name: "Notificações, 2 não lidas" });
    expect(within(sino).getByTestId("sino-bolinha").textContent).toBe("2");
    cleanup();
    responder(ITENS, 12);
    montar();
    expect((await screen.findByTestId("sino-bolinha")).textContent).toBe("9+");
    expect(screen.getByRole("button", { name: "Notificações, 12 não lidas" })).toBeTruthy();
  });

  it("equipe e revisores: sem sino e sem consulta ao banco", async () => {
    responder();
    montar({ ativo: false });
    await act(async () => {});
    expect(screen.queryByTestId("sino")).toBeNull();
    expect(backend.rpc).not.toHaveBeenCalled();
  });

  it("abre o painel: lista do mais novo para o mais antigo, com data relativa e botão de cada uma", async () => {
    responder();
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Notificações, 2/ }));
    const painel = await screen.findByRole("dialog", { name: "Notificações" });
    const titulos = within(painel).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titulos).toEqual(["Seu acesso pago foi pausado", "Simulado nacional no sábado", "Atualizamos o Contrato (versão 3.0)"]);
    expect(within(painel).getByText("há 2 horas")).toBeTruthy();
    expect(within(painel).getByRole("button", { name: /Pagar agora/ })).toBeTruthy();
    expect(within(painel).getByRole("button", { name: /Ler o contrato/ })).toBeTruthy();
    expect(within(painel).getByRole("button", { name: "Marcar como lida" })).toBeTruthy(); // comunicado sem link
    expect(screen.getByTestId("sino").getAttribute("aria-expanded")).toBe("true");
  });

  it("o botão de ação marca como lida, fecha e leva ao lugar certo", async () => {
    responder();
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Notificações, 2/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Pagar agora/ }));
    expect(backend.rpc).toHaveBeenCalledWith("app_notificacoes_lidas", { p_ids: [3] });
    await waitFor(() => expect(screen.getByTestId("onde").textContent).toBe("/planos"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Notificações, 1 não lida" })).toBeTruthy();
  });

  it("marcar todas como lidas zera a bolinha", async () => {
    responder();
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Notificações, 2/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Marcar todas como lidas/ }));
    expect(backend.rpc).toHaveBeenCalledWith("app_notificacoes_lidas", { p_ids: null });
    await waitFor(() => expect(screen.queryByTestId("sino-bolinha")).toBeNull());
    expect(screen.getByRole("button", { name: "Notificações, nenhuma não lida" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Marcar todas como lidas/ })).toBeNull();
  });

  it("estado vazio e carregamento", async () => {
    let soltar: (v: any) => void = () => {};
    backend.rpc.mockImplementation(() => new Promise((r) => (soltar = r)));
    montar();
    fireEvent.click(screen.getByTestId("sino"));
    expect(await screen.findByText("Carregando notificações…")).toBeTruthy();
    await act(async () => soltar({ aluno: true, nao_lidas: 0, itens: [] }));
    expect(await screen.findByText("Nenhuma notificação por enquanto")).toBeTruthy();
    expect(screen.queryByTestId("sino-bolinha")).toBeNull();
  });

  it("Esc fecha e o foco volta para o sino", async () => {
    responder();
    montar();
    const sino = await screen.findByRole("button", { name: /Notificações, 2/ });
    fireEvent.click(sino);
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(sino));
  });

  it("celular: painel de baixo para cima, com fundo escuro que fecha ao tocar", async () => {
    celular = true;
    responder();
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Notificações, 2/ }));
    const painel = await screen.findByRole("dialog", { name: "Notificações" });
    expect(painel.className).toContain("ntf-painel--celular");
    expect(painel.getAttribute("aria-modal")).toBe("true");
    fireEvent.click(document.querySelector(".ntf-fundo")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("atualiza ao voltar para a aba, mas não mais de uma vez a cada 20 s", async () => {
    responder();
    let relogio = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => relogio);
    montar();
    await screen.findByTestId("sino-bolinha");
    const pedidos = () => backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_minhas_notificacoes").length;
    expect(pedidos()).toBe(1);
    relogio += 5_000;
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(pedidos()).toBe(1);
    relogio += 30_000;
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(pedidos()).toBe(2));
  });

  it("o pop-up de cobrança avisa a Central quando o aviso é visto", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_meus_avisos") return { novos: [{ id: 9, tipo: "renovacao", titulo: "Seu PRO vence em 3 dias", texto: "Pague o Pix.", rota: "planos" }], recentes: [] };
      if (fn === "app_minhas_notificacoes") return { aluno: true, nao_lidas: 1, itens: [{ ...ITENS[0], id: 9 }] };
      return 1;
    });
    render(
      <MemoryRouter>
        <NotificacoesProvider ativo>
          <AvisosPopup go={vi.fn()} />
        </NotificacoesProvider>
      </MemoryRouter>
    );
    await screen.findByTestId("avisos-popup");
    const antes = backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_minhas_notificacoes").length;
    fireEvent.click(screen.getByRole("button", { name: "Entendi" }));
    await waitFor(() => expect(backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_minhas_notificacoes").length).toBe(antes + 1));
    expect(backend.rpc).toHaveBeenCalledWith("app_avisos_vistos", { p_ids: [9] });
  });
});

describe("avisos urgentes de cobrança (decisão do dono 17/10)", () => {
  const URG = { id: 7, tipo: "pagamento_falhou", titulo: "A renovação no cartão não passou", texto: "Pague por Pix em Meu plano.", rota: "planos", link: null, acao: "Pagar agora", em: new Date(agora - 3600e3).toISOString(), lida: false, urgente: true };

  it("sino em destaque, urgente primeiro com selo, sem 'marcar como lida'; 'marcar todas' não cala o urgente", async () => {
    responder([URG, ...ITENS], 3);
    montar();
    const sino = await screen.findByRole("button", { name: "Notificações, 3 não lidas, 1 urgente" });
    expect(sino.className).toContain("is-urgente");
    fireEvent.click(sino);
    const painel = await screen.findByRole("dialog", { name: "Notificações" });
    const primeiro = within(painel).getAllByRole("article")[0];
    expect(primeiro.className).toContain("is-urgente");
    expect(within(primeiro).getByText(/Urgente/)).toBeTruthy();
    expect(within(primeiro).queryByRole("button", { name: "Marcar como lida" })).toBeNull();
    fireEvent.click(within(painel).getByRole("button", { name: /Marcar todas como lidas/ }));
    expect(backend.rpc).toHaveBeenCalledWith("app_notificacoes_lidas", { p_ids: null });
    await waitFor(() => expect(screen.getByTestId("sino-bolinha").textContent).toBe("1"));
    expect(screen.getByRole("button", { name: "Notificações, 1 não lida, 1 urgente" })).toBeTruthy();
    expect(within(painel).getAllByRole("article")[0].className).toContain("is-nova"); // segue não lido
    expect(within(painel).queryByRole("button", { name: /Marcar todas como lidas/ })).toBeNull(); // só sobrou o urgente
  });

  it("pop-up: 'Entendi' no urgente esconde só até a próxima abertura do app (voltar para a aba não traz de volta)", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_meus_avisos") return { novos: [{ id: 77, tipo: "acesso_bloqueado", titulo: "Seu acesso pago foi pausado", texto: "Pague em Meu plano.", rota: "planos", urgente: true }], recentes: [] };
      return 1;
    });
    const ver = () =>
      render(
        <MemoryRouter>
          <AvisosPopup go={vi.fn()} />
        </MemoryRouter>
      );
    ver();
    await screen.findByTestId("avisos-popup");
    fireEvent.click(screen.getByRole("button", { name: "Entendi" }));
    await waitFor(() => expect(screen.queryByTestId("avisos-popup")).toBeNull());
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => {});
    expect(screen.queryByTestId("avisos-popup")).toBeNull();
    cleanup();
    ver(); // outra tela da mesma abertura
    await act(async () => {});
    expect(screen.queryByTestId("avisos-popup")).toBeNull();
    expect(backend.rpc).toHaveBeenCalledWith("app_avisos_vistos", { p_ids: [77] });
  });
});

describe("Administração > Comunicados", () => {
  it("valida antes da prévia", () => {
    expect(problemaDoComunicado({ titulo: "oi", texto: "abc", link: "" })).toMatch(/título/);
    expect(problemaDoComunicado({ titulo: "Aviso", texto: "", link: "" })).toMatch(/texto/);
    expect(problemaDoComunicado({ titulo: "Aviso", texto: "abc", link: "javascript:alert(1)" })).toMatch(/link/);
    expect(problemaDoComunicado({ titulo: "Aviso", texto: "abc", link: "http://site.com" })).toMatch(/link/);
    expect(problemaDoComunicado({ titulo: "Aviso", texto: "abc", link: "/novo/atualizacoes" })).toBeNull();
    expect(problemaDoComunicado({ titulo: "Aviso", texto: "abc", link: "https://www.gov.br" })).toBeNull();
  });

  it("escreve, vê a prévia (como fica e quantos recebem) e só então envia, uma vez", async () => {
    const enviados: any[] = [];
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_comunicados") return enviados;
      if (fn === "app_admin_comunicado_previa") return { destinatarios: args.p_filtro === "pro" ? 12 : 40 };
      if (fn === "app_admin_comunicado_enviar") {
        const c = { id: 1, titulo: args.p_titulo, texto: args.p_texto, link: args.p_link, publico: args.p_publico, filtro: args.p_filtro, destinatarios: 12, enviado_em: new Date().toISOString(), enviado_por: "Admin Teste", lidas: 0, repetido: false };
        enviados.unshift(c);
        return c;
      }
      return null;
    });
    render(
      <MemoryRouter>
        <AdminComunicados />
      </MemoryRouter>
    );
    expect(await screen.findByText("Nenhum comunicado enviado ainda.")).toBeTruthy();
    const verPrevia = screen.getByRole("button", { name: /Ver prévia/ });
    expect((verPrevia as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Aula ao vivo hoje" } });
    fireEvent.change(screen.getByLabelText("Texto"), { target: { value: "Às 20h, na tela de Atualizações." } });
    fireEvent.change(screen.getByLabelText("Link (opcional)"), { target: { value: "/atualizacoes" } });
    fireEvent.click(screen.getByRole("radio", { name: "Um plano" }));
    expect((screen.getByLabelText("Plano") as HTMLSelectElement).value).toBe("pro");
    fireEvent.click(screen.getByRole("button", { name: /Ver prévia/ }));
    const previa = await screen.findByTestId("previa-comunicado");
    expect(within(previa).getByRole("heading", { name: "Aula ao vivo hoje" })).toBeTruthy();
    expect(within(previa).getByRole("button", { name: /Abrir/ })).toBeTruthy();
    expect(previa.textContent).toContain("Vai para 12 alunos (Alunos do PRO)");
    expect(backend.rpc).not.toHaveBeenCalledWith("app_admin_comunicado_enviar", expect.anything());
    fireEvent.click(within(previa).getByRole("button", { name: "Enviar para 12 alunos" }));
    expect(await screen.findByText("Comunicado enviado")).toBeTruthy();
    const envio = backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_admin_comunicado_enviar")[1];
    expect(envio).toMatchObject({ p_titulo: "Aula ao vivo hoje", p_link: "/atualizacoes", p_publico: "plano", p_filtro: "pro" });
    expect(envio.p_idem.length).toBeGreaterThanOrEqual(8);
    expect(await screen.findByText(/por Admin Teste · lido por 0 de 12/)).toBeTruthy();
  });

  it("mudar o texto depois da prévia pede a prévia de novo", async () => {
    backend.rpc.mockImplementation(async (fn: string) => (fn === "app_admin_comunicados" ? [] : { destinatarios: 3 }));
    render(
      <MemoryRouter>
        <AdminComunicados />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Aviso geral" } });
    fireEvent.change(screen.getByLabelText("Texto"), { target: { value: "Texto." } });
    fireEvent.click(screen.getByRole("button", { name: /Ver prévia/ }));
    await screen.findByTestId("previa-comunicado");
    fireEvent.change(screen.getByLabelText("Texto"), { target: { value: "Texto mudado." } });
    expect(screen.queryByTestId("previa-comunicado")).toBeNull();
    expect(screen.getByRole("button", { name: /Ver prévia/ })).toBeTruthy();
  });
});
