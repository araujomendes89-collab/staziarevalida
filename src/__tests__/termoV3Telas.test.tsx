/**
 * Textos legais 3.0 nas telas (migração …13740_termo_v3): tela de aceite com "o que mudou" e a caixa nova, textos completos vindos
 * do banco (Contrato com tabelas, Política, Regulamento), páginas públicas (/novo/termos, /novo/privacidade, /novo/regulamento),
 * cadastro aceitando a 3.0 (com o IP completado pelo mesmo navegador) e Minha Conta → Documentos (ver e baixar a versão aceita).
 * O banco aqui é de mentira: responde app_legal_current, app_legal_text e app_my_legal_documents como a migração.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const TEXTOS: Record<string, string> = {
  termo_uso: readFileSync("src/novo/app/legal/textos/contrato-v3.0.md", "utf8"),
  politica_privacidade: readFileSync("src/novo/app/legal/textos/politica-privacidade-v3.0.md", "utf8"),
  regulamento: readFileSync("src/novo/app/legal/textos/regulamento-v1.0.md", "utf8"),
};
const MUDANCAS: string[] = JSON.parse(readFileSync("src/novo/app/legal/textos/mudancas-v3.0.json", "utf8"));
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const VERSAO: Record<string, string> = { termo_uso: "3.0", politica_privacidade: "3.0", regulamento: "1.0" };
const TITULO: Record<string, string> = { termo_uso: "Contrato de Assinatura e Termos de Uso", politica_privacidade: "Política de Privacidade", regulamento: "Regulamento" };

const banco = {
  ligado: true,
  rpc: vi.fn(async (fn: string, args: any = {}) => {
    if (!banco.ligado) throw new Error(`Could not find the function public.${fn}`);
    if (fn === "app_legal_current") {
      return Object.fromEntries(
        Object.keys(TEXTOS).map((d) => [d, { version: VERSAO[d], title: TITULO[d], sha256: sha(TEXTOS[d]), acceptance_group: VERSAO[d], changes: d === "termo_uso" ? MUDANCAS : [] }]),
      );
    }
    if (fn === "app_legal_text") {
      const d = args.p_document;
      if (args.p_version && args.p_version !== VERSAO[d]) return null;
      return { document: d, version: VERSAO[d], title: TITULO[d], body: TEXTOS[d], sha256: sha(TEXTOS[d]) };
    }
    if (fn === "app_my_legal_documents") {
      return [
        { document: "termo_uso", version: "3.0", accepted_at: "2026-10-17T21:40:00Z", origin: "tela_aceite", text_sha256: sha(TEXTOS.termo_uso), title: TITULO.termo_uso, stored: true,
          companions: { politica_privacidade: { version: "3.0", sha256: sha(TEXTOS.politica_privacidade) }, regulamento: { version: "1.0", sha256: sha(TEXTOS.regulamento) } } },
        { document: "termo_uso", version: "2.0", accepted_at: "2026-10-16T12:00:00Z", origin: "cadastro", text_sha256: null, title: null, stored: false, companions: {} },
      ];
    }
    if (fn === "app_export_my_data") return { acceptances: [] };
    if (fn === "app_legal_cadastro_ip") return true;
    return null;
  }),
};
vi.mock("../novo/data", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, getBackend: async () => banco };
});

const state: { session: any } = { session: null };
vi.mock("../novo/app/session.jsx", async (orig) => ({ ...(await orig<any>()), SessionProvider: ({ children }: any) => children, useSession: () => state.session }));

import { AcceptanceScreen, precisaTelaDeAceite } from "../novo/app/legal/AcceptanceScreen.jsx";
import { LegalPage } from "../novo/app/legal/LegalPage.jsx";
import { AuthFlow } from "../novo/app/AuthScreens.jsx";
import { DocumentosSection } from "../novo/app/account/DocumentosSection.jsx";
import { esquecerTextosLegais } from "../novo/app/legal/vigente.js";
import { ACEITE_TEXTO_V3, AVISO_ACEITE_V3 } from "../novo/app/legal/documentos.js";

const legal3 = (accepted: string | null) => ({
  termo_uso: { current: "3.0", accepted, accepted_at: accepted ? "2026-10-16T12:00:00Z" : null, valid: false },
  tutor_ia: { current: "2.0", accepted: "2.0", accepted_at: "2026-10-16T12:00:00Z" },
  student: true,
  phone_missing: true,
  gate_required: true,
  declarations_required: true,
});
function abrirAceite(legal: any) {
  const fns = { acceptTerms: vi.fn(async (_a: any) => {}), refresh: vi.fn(async () => {}), signOut: vi.fn() };
  state.session = { status: "ready", boot: { role: "student", legal }, user: { email: "ana@teste.dev" }, backend: banco, ...fns };
  render(<AcceptanceScreen />);
  return fns;
}
const botao = () => screen.getByRole("button", { name: "ACEITAR E CONTINUAR" });
const caixa = () => screen.getByRole("checkbox", { name: ACEITE_TEXTO_V3 });

beforeEach(() => {
  esquecerTextosLegais();
  banco.ligado = true;
  banco.rpc.mockClear();
  localStorage.clear();
  window.scrollTo = vi.fn() as any;
});
afterEach(cleanup);

describe("Termo 3.0 — tela de aceite", () => {
  it("quem aceitou a versão anterior vê 'Atualizamos nosso Contrato', o resumo do que mudou, a caixa nova e o aviso do IP", async () => {
    const fns = abrirAceite(legal3("2.0"));
    expect(screen.getByRole("heading", { level: 1, name: "Atualizamos nosso Contrato" })).toBeTruthy();
    const resumo = await screen.findByRole("region", { name: "O que mudou" });
    expect(within(resumo).getAllByRole("listitem").map((li) => li.textContent)).toEqual(MUDANCAS);
    expect(screen.getByText(AVISO_ACEITE_V3)).toBeTruthy();
    // sem a caixa: erro e nada gravado
    fireEvent.click(botao());
    expect(screen.getByText("Para continuar, aceite os Termos de Uso e o Contrato de Assinatura.")).toBeTruthy();
    expect(fns.acceptTerms).not.toHaveBeenCalled();
    fireEvent.click(caixa());
    fireEvent.click(botao());
    await waitFor(() => expect(fns.acceptTerms).toHaveBeenCalledTimes(1));
    expect(fns.acceptTerms).toHaveBeenCalledWith({ document: "termo_uso", version: "3.0", origin: "tela_aceite", declarations: { adult: true } });
  });

  it("os textos completos abrem por cima, vindos do banco: Contrato (com as tabelas), Política e Regulamento", async () => {
    abrirAceite(legal3("2.0"));
    fireEvent.click(screen.getByRole("button", { name: "Termos de Uso e Contrato" }));
    let janela = await screen.findByRole("dialog", { name: "Termos de Uso e Contrato" });
    await within(janela).findByRole("heading", { level: 1, name: /CONTRATO DE PRESTAÇÃO DE SERVIÇOS/ });
    expect(within(janela).getAllByRole("table").length).toBeGreaterThanOrEqual(3);
    expect(janela.textContent).toContain("6.5-A. Alunos que já têm conta.");
    expect(janela.textContent).not.toContain("**");
    fireEvent.click(within(janela).getByRole("button", { name: "Fechar" }));

    fireEvent.click(screen.getByRole("button", { name: "Regulamento de Coins e Ligas" }));
    janela = await screen.findByRole("dialog", { name: "Regulamento de Coins, XP, Ligas e Benefícios" });
    await within(janela).findByRole("heading", { level: 1, name: /REGULAMENTO DE STAZIA COINS/ });
    fireEvent.click(within(janela).getByRole("button", { name: "Fechar" }));

    // o link da Política dentro da própria caixa
    fireEvent.click(within(screen.getByText(/declaro ter acesso à/).closest("label")!).getByRole("button", { name: "Política de Privacidade" }));
    janela = await screen.findByRole("dialog", { name: "Política de Privacidade" });
    await within(janela).findByRole("heading", { level: 1, name: /POLÍTICA DE PRIVACIDADE/ });
    expect(janela.textContent).toContain("9.1 O que guardamos no aceite.");
  });

  it("sem aceitar dá para baixar os dados, pedir o cancelamento ao suporte ou sair", async () => {
    const createObjectURL = vi.fn(() => "blob:x");
    (URL as any).createObjectURL = createObjectURL;
    (URL as any).revokeObjectURL = vi.fn();
    const fns = abrirAceite(legal3("2.0"));
    fireEvent.click(screen.getByRole("button", { name: "Baixar meus dados" }));
    await waitFor(() => expect(banco.rpc).toHaveBeenCalledWith("app_export_my_data"));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    const cancelar = screen.getByRole("link", { name: "Não aceito: pedir o cancelamento" });
    expect(cancelar.getAttribute("href")).toMatch(/^mailto:suporte@staziamed\.com\.br\?subject=Pedido%20de%20cancelamento/);
    fireEvent.click(screen.getByRole("button", { name: "Sair da conta" }));
    expect(fns.signOut).toHaveBeenCalledTimes(1);
  });

  it("quem nunca aceitou vê 'Antes de começar', sem resumo e sem pedir cancelamento", async () => {
    abrirAceite(legal3(null));
    expect(screen.getByRole("heading", { level: 1, name: "Antes de começar" })).toBeTruthy();
    await screen.findByRole("button", { name: "Regulamento de Coins e Ligas" });
    expect(screen.queryByRole("region", { name: "O que mudou" })).toBeNull();
    expect(screen.queryByRole("link", { name: /pedir o cancelamento/ })).toBeNull();
    expect(caixa()).toBeTruthy();
  });

  it("3.0.1 do mesmo grupo de aceite (valid): a tela não aparece", () => {
    expect(precisaTelaDeAceite({ ...legal3("3.0"), termo_uso: { current: "3.0.1", accepted: "3.0", valid: true }, gate_required: false })).toBe(false);
    expect(precisaTelaDeAceite(legal3("2.0"))).toBe(true);
  });
});

describe("Termo 3.0 — páginas públicas", () => {
  it.each([
    ["termos", /CONTRATO DE PRESTAÇÃO DE SERVIÇOS/],
    ["privacidade", /POLÍTICA DE PRIVACIDADE/],
    ["regulamento", /REGULAMENTO DE STAZIA COINS/],
  ])("/novo/%s mostra o texto vigente do banco, com a navegação entre os três", async (pagina, titulo) => {
    render(<MemoryRouter><LegalPage doc={pagina} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { level: 1, name: titulo })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Documentos legais" });
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/novo/termos", "/novo/privacidade", "/novo/regulamento"]);
  });

  it("o texto do Contrato na página tem todas as palavras do arquivo (sem as marcas de negrito, itálico e tabela)", async () => {
    render(<MemoryRouter><LegalPage doc="termos" /></MemoryRouter>);
    const t = await screen.findByTestId("legal-texto");
    const palavras = (s: string) => s.split(/\s+/).filter(Boolean);
    const esperadas = palavras(
      TEXTOS.termo_uso
        .split("\n")
        .filter((l) => l.trim() !== "---" && !/^\|?\s*-{3}/.test(l.trim()))
        .map((l) => l.replace(/^#{1,3} /, "").replace(/^- /, "").replace(/\*/g, "").replace(/\|/g, " "))
        .join("\n"),
    );
    const naPagina = [...t.querySelectorAll("h1, h2, h3, p, li, th, td")].flatMap((el) => palavras(el.textContent ?? ""));
    expect(naPagina).toEqual(esperadas);
  });

  it("banco sem a 013740: o Regulamento avisa que ainda não vale", async () => {
    banco.ligado = false;
    render(<MemoryRouter><LegalPage doc="regulamento" /></MemoryRouter>);
    expect(await screen.findByText(/passa a valer junto com a versão 3\.0/)).toBeTruthy();
  });
});

describe("Termo 3.0 — cadastro", () => {
  it("caixa nova com o aviso; manda a versão 3.0 e completa o IP com o número da conta", async () => {
    const backend: any = {
      rpc: banco.rpc,
      signUp: vi.fn(async () => ({ needsEmailConfirmation: true, userId: "conta-1" })),
      signInWithGoogle: vi.fn(),
      signIn: vi.fn(),
      resendConfirmation: vi.fn(),
      masterSetup: { needed: vi.fn(async () => false) },
    };
    state.session = { backend };
    render(<AuthFlow />);
    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
    const box = await screen.findByLabelText(ACEITE_TEXTO_V3);
    expect(screen.getByText(AVISO_ACEITE_V3)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Ana Lima" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@teste.dev" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha-segura" } });
    fireEvent.change(screen.getByLabelText("Conferir senha"), { target: { value: "senha-segura" } });
    fireEvent.click(screen.getByRole("button", { name: /^CRIAR CONTA/ }));
    expect(screen.getByText("Para criar a conta, aceite os Termos de Uso e o Contrato de Assinatura.")).toBeTruthy();
    expect(backend.signUp).not.toHaveBeenCalled();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: /^CRIAR CONTA/ }));
    await waitFor(() => expect(backend.signUp).toHaveBeenCalledTimes(1));
    expect(backend.signUp.mock.calls[0][3]).toMatchObject({ termsVersion: "3.0", declaresAdult: true });
    await waitFor(() => expect(banco.rpc).toHaveBeenCalledWith("app_legal_cadastro_ip", { p_user: "conta-1" }));
  });
});

describe("Termo 3.0 — Minha Conta → Documentos", () => {
  const Cab = ({ title, subtitle }: any) => (
    <div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );

  it("lista o que a pessoa aceitou (data e hora de Brasília, código) e a Política e o Regulamento daquele aceite", async () => {
    state.session = { backend: banco, boot: { legal: legal3("3.0") }, user: { email: "ana@teste.dev" } };
    render(<DocumentosSection Cabecalho={Cab} />);
    expect(await screen.findByText("Contrato de Assinatura e Termos de Uso · versão 3.0")).toBeTruthy();
    expect(screen.getByText("Aceito em 17/10/2026 às 18:40 (horário de Brasília), na tela de aceite.")).toBeTruthy();
    expect(screen.getByText(`Código de integridade: ${sha(TEXTOS.termo_uso).slice(0, 8)}…${sha(TEXTOS.termo_uso).slice(-8)}`)).toBeTruthy();
    expect(screen.getByText("Política de Privacidade · versão 3.0")).toBeTruthy();
    expect(screen.getByText("Regulamento de Coins, XP, Ligas e Benefícios · versão 1.0")).toBeTruthy();
    expect(screen.getByText("Termo de Aceite e Uso · versão 2.0")).toBeTruthy();
  });

  it("Ver abre o texto exato aceito; Baixar salva a cópia com versão, data e código", async () => {
    const createObjectURL = vi.fn((_b: Blob) => "blob:x");
    (URL as any).createObjectURL = createObjectURL;
    (URL as any).revokeObjectURL = vi.fn();
    state.session = { backend: banco, boot: { legal: legal3("3.0") }, user: { email: "ana@teste.dev" } };
    render(<DocumentosSection Cabecalho={Cab} />);
    await screen.findByText("Contrato de Assinatura e Termos de Uso · versão 3.0");
    fireEvent.click(screen.getAllByRole("button", { name: "Ver" })[0]);
    const janela = await screen.findByRole("dialog", { name: "Contrato de Assinatura e Termos de Uso · versão 3.0" });
    await within(janela).findByRole("heading", { level: 1, name: /CONTRATO DE PRESTAÇÃO/ });
    fireEvent.click(within(janela).getByRole("button", { name: "Fechar" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Baixar" })[0]);
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    const texto = await (createObjectURL.mock.calls[0][0] as Blob).text();
    expect(texto).toContain("Contrato de Assinatura e Termos de Uso — versão 3.0");
    expect(texto).toContain("Aceito em 17/10/2026 às 18:40 (horário de Brasília) pela conta ana@teste.dev");
    expect(texto).toContain(`Código de integridade (SHA-256) do texto: ${sha(TEXTOS.termo_uso)}`);
    expect(texto).toContain("6.5-A. Alunos que já têm conta.");
    expect(texto).not.toContain("**");
  });
});
