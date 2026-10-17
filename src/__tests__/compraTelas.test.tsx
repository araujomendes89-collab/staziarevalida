// @vitest-environment jsdom
/**
 * Planos etapa 4 nas telas: cadeado ("assine para liberar") quando o banco recusa por plano, faixa da amostra do dia, pop-up dos
 * avisos de cobrança, Minha conta › Assinatura (troca Pix/cartão, cancelar sem multa, histórico com recibo) e a compra no cartão
 * (aba segura aberta antes, estado "não concluído"). Desligado (sem cadeados / sem cobrança), nada disso aparece.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { role: "student", subscription: { plan: "pro", status: "active" } }, user: { id: "u1" } }) }));

import { BackendError, lockHintOf } from "../novo/data/backend";
import { comAvisoDeCadeado } from "../novo/app/plan/cadeadoEvento.js";
import { AmostraFaixa, CadeadoDialog } from "../novo/app/plan/cadeado.jsx";
import { AvisosPopup } from "../novo/app/plan/AvisosPopup.jsx";
import { AssinaturaSection } from "../novo/app/plan/Assinatura.jsx";
import { BillingSection } from "../novo/app/plan/BillingSection.jsx";
import { cpfValido, formatarCpf, mascararCpf } from "../novo/app/plan/compraUtil.js";

const AMOSTRA = {
  ligado: true,
  perfil: "teste",
  simulado_max_questoes: 30,
  recursos: {
    questoes: { acesso: "amostra", limite: 20, usados: 20, restam: 0, ofertas: [{ tipo: "assinar", plano: "pro", nome: "PRO", a_venda: true }, { tipo: "assinar", plano: "elite", nome: "ELITE", a_venda: false }] },
    simulados_teoricos: { acesso: "amostra", limite: 1, usados: 0, restam: 1, ofertas: [] },
    flashcards: { acesso: "amostra", limite: 10, usados: 3, restam: 7, ofertas: [] },
  },
};

let calls: { url: string; body: any }[] = [];
function mockFetch(routes: Record<string, any>) {
  calls = [];
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body ? JSON.parse(init.body) : undefined });
    const key = Object.keys(routes).find((k) => u.endsWith(k));
    const v = key ? routes[key] : { status: "aberto" };
    if (v instanceof Response) return v;
    return new Response(JSON.stringify(v), { status: v?.__status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as any;
}

beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(cleanup);

describe("cadeado", () => {
  it("lê só a dica conhecida do banco", () => {
    expect(lockHintOf(new BackendError("unknown", "x", "amostra:questoes"))).toEqual({ tipo: "amostra", recurso: "questoes" });
    expect(lockHintOf(new BackendError("unknown", "x", "cadeado:estacoes"))).toEqual({ tipo: "cadeado", recurso: "estacoes" });
    expect(lockHintOf(new BackendError("unknown", "x", "outra coisa"))).toBeNull();
    expect(lockHintOf(new Error("sem dica"))).toBeNull();
  });

  it("recusa por plano: o erro segue igual para a tela E abre a mensagem 'assine para liberar' com o que sobra hoje", async () => {
    const go = vi.fn();
    const bruto = { rpc: vi.fn(async (fn: string) => {
      if (fn === "app_answer") throw new BackendError("unknown", "Você já usou a amostra de hoje (20 respostas por dia). Amanhã tem mais, ou assine um plano para liberar.", "amostra:questoes");
      return AMOSTRA;
    }), mode: "local" };
    const b = comAvisoDeCadeado(bruto);
    backend.rpc.mockImplementation(async () => AMOSTRA);
    render(<CadeadoDialog go={go} />);
    await expect(b.rpc("app_answer", {})).rejects.toThrow(/amostra de hoje/);
    const d = await screen.findByTestId("cadeado-dialogo");
    expect(d.textContent).toContain("A amostra de hoje acabou");
    expect(d.textContent).toContain("20 respostas por dia");
    await waitFor(() => expect(d.textContent).toContain("Flashcards: restam 7 cartões hoje"));
    expect(d.textContent).toContain("PRO");
    expect(d.textContent).toContain("ELITE · em breve");
    fireEvent.click(screen.getByRole("button", { name: /Ver planos e assinar/ }));
    expect(go).toHaveBeenCalledWith("planos");
    expect(screen.queryByTestId("cadeado-dialogo")).toBeNull();
    // erro comum (sem dica) não abre nada
    bruto.rpc.mockRejectedValueOnce(new BackendError("network", "sem rede"));
    await expect(b.rpc("app_home", {})).rejects.toThrow("sem rede");
    expect(screen.queryByTestId("cadeado-dialogo")).toBeNull();
  });

  it("faixa da amostra: mostra quanto sobra; com os cadeados desligados não aparece", async () => {
    backend.rpc.mockResolvedValue(AMOSTRA);
    const go = vi.fn();
    const { unmount } = render(<AmostraFaixa recurso="flashcards" go={go} />);
    const f = await screen.findByTestId("amostra-flashcards");
    expect(f.textContent).toContain("Amostra de hoje: 7 cartões de 10");
    fireEvent.click(screen.getByRole("button", { name: "Assinar para liberar" }));
    expect(go).toHaveBeenCalledWith("planos");
    unmount();
    render(<AmostraFaixa recurso="questoes" go={go} />);
    expect((await screen.findByTestId("amostra-questoes")).textContent).toContain("A amostra de hoje acabou");
    cleanup();
    backend.rpc.mockResolvedValue({ ligado: false });
    render(<AmostraFaixa recurso="questoes" go={go} />);
    await act(async () => {});
    expect(screen.queryByTestId("amostra-questoes")).toBeNull();
  });
});

describe("pop-up dos avisos", () => {
  it("mostra o aviso não visto; 'Entendi' marca como visto; 'Abrir Meu plano' leva à compra", async () => {
    backend.rpc.mockImplementation(async (fn: string) =>
      fn === "app_meus_avisos"
        ? { novos: [{ id: 7, tipo: "renovacao", titulo: "Seu PRO renova em 3 dias", texto: "Em 20/10/2026, R$ 99,90 serão cobrados à vista no seu cartão de crédito.", rota: "planos" }, { id: 8, tipo: "acesso_liberado", titulo: "Pagamento confirmado", texto: "Recebemos.", rota: "planos" }], recentes: [] }
        : 1
    );
    const go = vi.fn();
    render(<AvisosPopup go={go} />);
    const p = await screen.findByTestId("avisos-popup");
    expect(p.textContent).toContain("Seu PRO renova em 3 dias");
    expect(p.textContent).toContain("1 de 2");
    fireEvent.click(screen.getByRole("button", { name: "Entendi" }));
    expect(backend.rpc).toHaveBeenCalledWith("app_avisos_vistos", { p_ids: [7] });
    await screen.findByText("Pagamento confirmado");
    fireEvent.click(screen.getByRole("button", { name: /Abrir Meu plano/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("planos", undefined));
    expect(screen.queryByTestId("avisos-popup")).toBeNull();
  });

  it("sem avisos (cobrança desligada ou função ainda não publicada): nada aparece", async () => {
    backend.rpc.mockRejectedValue(new Error("function app_meus_avisos does not exist"));
    render(<AvisosPopup go={vi.fn()} />);
    await act(async () => {});
    expect(screen.queryByTestId("avisos-popup")).toBeNull();
  });
});

const OV_ASSINATURA = {
  enabled: true,
  mode: "test",
  methods: { card: true, pix: true },
  contrato_doc: { versao: "3.0", url: "/novo/contrato" },
  contrato: { plano: "pro", ciclo: "mensal", metodo: "cartao", valor_centavos: 9990, renova: true, periodo_fim: new Date(Date.now() + 20 * 86400e3).toISOString(), contratado_em: new Date(Date.now() - 3 * 86400e3).toISOString() },
  pedidos_abertos: [],
  devolucoes: [{ cobranca_id: 5, tipo: "plano", codigo: "pro", ciclo: "mensal", valor_centavos: 9990, regra: "integral_7_dias" }],
};

describe("Minha conta › Assinatura", () => {
  beforeEach(() => {
    backend.rpc.mockImplementation(async (fn: string) =>
      fn === "app_billing_historico"
        ? { pagamentos: [{ id: 1, tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "cartao", valor_centavos: 9990, status: "paga", pago_em: new Date().toISOString(), recibo_url: "https://sandbox.asaas.com/i/abc" }], aceite: { em: new Date().toISOString(), versao: "3.0" }, contrato_url: "/novo/contrato" }
        : { novos: [], recentes: [{ id: 1, titulo: "Pagamento confirmado", em: new Date().toISOString(), email: true }] }
    );
  });

  it("plano, próxima cobrança, forma de pagamento, histórico com recibo e o contrato aceito", async () => {
    mockFetch({ "/overview": OV_ASSINATURA });
    render(<AssinaturaSection go={vi.fn()} />);
    const plano = await screen.findByTestId("assinatura-plano");
    expect(plano.textContent).toContain("PRO mensal");
    expect(plano.textContent).toContain("Próxima cobrança");
    expect(plano.textContent).toContain("Cartão de crédito · renova sozinho no dia");
    const h = await screen.findByTestId("assinatura-historico");
    expect(h.querySelector("a")!.getAttribute("href")).toBe("https://sandbox.asaas.com/i/abc");
    expect(screen.getByText(/versão 3.0/)).toBeTruthy();
    expect(screen.getByText("Pagamento confirmado")).toBeTruthy();
  });

  it("trocar para Pix pede confirmação e chama o servidor; cancelar explica que é sem multa", async () => {
    mockFetch({ "/overview": OV_ASSINATURA, "/payment-method": { ok: true, metodo: "pix" }, "/cancel-renewal": { ok: true, acesso_ate: OV_ASSINATURA.contrato.periodo_fim } });
    render(<AssinaturaSection go={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Trocar para Pix" }));
    expect(screen.getByRole("alertdialog").textContent).toMatch(/Sem multa e sem cobrança a mais/);
    fireEvent.click(screen.getAllByRole("button", { name: "Trocar para Pix" }).at(-1)!);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/payment-method") && c.body.metodo === "pix")).toBe(true));
    await screen.findByText(/a renovação agora é por Pix/);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar assinatura" }));
    expect(screen.getByRole("alertdialog").textContent).toMatch(/Sem multa/);
    expect(screen.getByRole("alertdialog").textContent).toMatch(/7 dias/);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar a renovação" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/cancel-renewal"))).toBe(true));
  });

  it("cobrança desligada: a seção diz que ainda não está disponível", async () => {
    mockFetch({ "/overview": { __status: 503 } });
    render(<AssinaturaSection go={vi.fn()} />);
    expect(await screen.findByText(/ainda não está disponível/)).toBeTruthy();
  });
});

describe("compra no cartão", () => {
  const OV = {
    enabled: true, mode: "test", methods: { card: true, pix: true }, precisa_documento: false, vendas_ligadas: true,
    contrato_doc: { versao: "3.0", url: "/novo/contrato" },
    vitrine: { planos: [{ codigo: "pro", nome: "PRO", descricao: "1ª fase", mensal_centavos: 9990, trimestral_centavos: 26970, a_venda: true }], extras: [] },
    contrato: null, pedidos_abertos: [], devolucoes: [],
  };

  it("trimestral à vista: resumo com renovação, link do contrato vigente, aba segura aberta antes e 'não concluído' com tentar de novo", async () => {
    const aba: any = { opener: 1, document: { title: "", body: { innerHTML: "" } }, location: { href: "" }, close: vi.fn() };
    const abrir = vi.fn(() => aba);
    (window as any).open = abrir;
    mockFetch({ "/overview": OV, "/checkout": { id: "33333333-3333-4333-8333-333333333333", status: "aberto", nome: "PRO trimestral", tipo: "plano", metodo: "cartao", valor_centavos: 26970, url: "https://sandbox.asaas.com/i/xyz" }, "/orders/33333333-3333-4333-8333-333333333333": { id: "33333333-3333-4333-8333-333333333333", status: "falhou", tipo: "plano", metodo: "cartao", valor_centavos: 26970 } });
    render(<BillingSection go={vi.fn()} />);
    const pro = await screen.findByTestId("cobranca-plano-pro");
    expect(pro.textContent).toContain("economia de R$ 30,00");
    fireEvent.click(pro.querySelectorAll("button[role=radio]")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Assinar o PRO trimestral" }));
    fireEvent.click(screen.getByRole("radio", { name: /Cartão de crédito/ }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar e pagar" }));
    const resumo = screen.getByTestId("cobranca-resumo").textContent!;
    expect(resumo).toContain("R$ 269,70 a cada 3 meses");
    expect(resumo).toContain("Cartão de crédito, à vista");
    expect(resumo).toMatch(/Renova sozinho no cartão em \d\d\/\d\d\/\d{4} \(a cada 3 meses\)/);
    expect(screen.getByRole("link", { name: /Contrato de Assinatura \(versão 3.0\)/ }).getAttribute("href")).toBe("/novo/contrato");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Ir para a página segura do cartão" }));
    await screen.findByTestId("cobranca-aberta");
    expect(abrir).toHaveBeenCalledWith("", "_blank");
    expect(aba.opener).toBeNull();
    expect(aba.location.href).toBe("https://sandbox.asaas.com/i/xyz");
    expect(calls.find((c) => c.url.endsWith("/checkout"))!.body).toMatchObject({ tipo: "plano", codigo: "pro", ciclo: "trimestral", metodo: "cartao", aceite: true });
    // voltou para a aba: confere na hora e mostra que não foi concluído
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await screen.findByTestId("cobranca-falhou");
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
  });
});

describe("CPF", () => {
  it("confere, formata e esconde", () => {
    expect(cpfValido("366.385.446-91")).toBe(true);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("366.385.446-90")).toBe(false);
    expect(formatarCpf("36638544691")).toBe("366.385.446-91");
    expect(formatarCpf("3663854")).toBe("366.385.4");
    expect(mascararCpf("366.385.446-91")).toBe("***.385.446-**");
  });
});

describe("formas de pagamento (decisão do dono 17/10, noite: débito também)", () => {
  it("débito só aparece quando o servidor aceita e fora do plano mensal (que renova sozinho no crédito)", async () => {
    const { metodosDaCompra, textoFormas } = await import("../novo/app/plan/BillingSection.jsx");
    const semDebito = { methods: { pix: true, card: true } };
    const comDebito = { methods: { pix: true, card: true, debit: true } };
    const ids = (ov: any, alvo: any) => metodosDaCompra(ov, alvo).map((m: any) => m.id);
    expect(ids(semDebito, { tipo: "plano", ciclo: "trimestral" })).toEqual(["pix", "cartao"]);
    expect(ids(comDebito, { tipo: "plano", ciclo: "mensal" })).toEqual(["pix", "cartao"]);
    expect(ids(comDebito, { tipo: "plano", ciclo: "trimestral" })).toEqual(["pix", "cartao", "debito"]);
    expect(ids(comDebito, { tipo: "extra", ciclo: "avulso" })).toEqual(["pix", "cartao", "debito"]);
    expect(textoFormas(comDebito)).toBe("Pix, crédito ou débito");
    expect(textoFormas(semDebito)).toBe("Pix ou cartão de crédito");
  });
});

describe("pagamento em aberto ao voltar para o app", () => {
  it("o Pix aberto do resumo (sem 'status') aparece aguardando, com QR e copia-e-cola", async () => {
    mockFetch({ "/overview": { ...OV_ASSINATURA, contrato: { ...OV_ASSINATURA.contrato, metodo: "pix" }, pedidos_abertos: [{ id: "44444444-4444-4444-8444-444444444444", tipo: "plano", nome: "Pro mensal (renovação)", metodo: "pix", motivo: "renovacao", valor_centavos: 9990, pix: { payload: "000201REN7", image: "img" }, url: "https://x" }] } });
    backend.rpc.mockResolvedValue({ pagamentos: [], novos: [], recentes: [] });
    render(<AssinaturaSection go={vi.fn()} />);
    expect((await screen.findByTestId("cobranca-aberta")).textContent).toContain("000201REN7");
  });
});
