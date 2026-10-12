/**
 * Fase 1 · B12 e B4 nas telas do aluno (backend simulado): o e-mail de suporte vem de uma configuração única (padrão
 * suporte@staziamed.com.br) e aparece no login, na Conta (Ajuda e suporte, "Seu plano") e nos avisos de acesso bloqueado, sem falar de
 * pagamento automático nem de preço; "Relatar um problema" envia a mensagem à Administração; "Seu plano" mostra as datas reais.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const session: { boot: any } = { boot: null };
const backend: any = { rpc: vi.fn(), signIn: vi.fn(), signInWithGoogle: vi.fn(), resetPassword: vi.fn(), masterSetup: { needed: vi.fn(async () => false) } };
vi.mock("../novo/app/session.jsx", async (orig) => ({
  ...(await orig<any>()),
  useSession: () => ({ boot: session.boot, user: { id: "eu", email: "ana@teste.dev" }, backend, signOut: vi.fn(), updateProfile: vi.fn() }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/play/PlayProfile.jsx", () => ({ PlayProfileSection: () => null }));

import { AccountScreen } from "../novo/app/account/AccountScreen.jsx";
import { LoginScreen } from "../novo/app/auth/LoginScreen.jsx";
import { AuthFlow } from "../novo/app/AuthScreens.jsx";
import { TutorGate } from "../novo/app/tutor/nexus/TutorGate.jsx";
import { QuestionBuilder } from "../novo/app/practice/QuestionBuilder.jsx";
import { lockNotice, planSummary, withSupport } from "../novo/app/plan/planAccess.js";
import { DEFAULT_SUPPORT_EMAIL } from "../novo/app/support/supportContact.jsx";
import { rememberScreen, resetRememberedScreens, screenBeforeAccount } from "../novo/app/support/lastScreen.js";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const dataBR = (ms: number) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ms));
const PROFILE = { name: "Ana", phase: 1, exam_type: "REVALIDA", target_edition: null, daily_minutes: null, exam_date: null, theme: "light", phone: null };
const bootOf = (subscription: any, over: any = {}) => ({ role: "student", profile: PROFILE, subscription, has_pro: false, legal: null, ...over });
const FIM_TESTE = Date.now() + 3 * DAY;
const FIM_PAGO = Date.now() + 20 * DAY;
const TESTE = { plan: "trial", status: "trialing", trial_ends_at: iso(FIM_TESTE), current_period_end: null };
const TESTE_ACABOU = { plan: "trial", status: "trialing", trial_ends_at: iso(Date.now() - 3 * DAY), current_period_end: null };
const PAGO = { plan: "pro", status: "active", trial_ends_at: null, current_period_end: iso(FIM_PAGO) };
const SEM_TESTE = { plan: "trial", status: "expired", trial_ends_at: null, current_period_end: null };

/** Responde o que o banco responde; `contato` = o e-mail da configuração (ou erro quando o SQL ainda não foi colado). */
const banco = (opts: { contato?: string | Error; acesso?: any; resto?: (fn: string, args?: any) => any } = {}) => {
  backend.rpc.mockImplementation(async (fn: string, args?: any) => {
    if (fn === "app_support_contact") {
      if (opts.contato instanceof Error) throw opts.contato;
      return { email: opts.contato ?? DEFAULT_SUPPORT_EMAIL };
    }
    if (fn === "app_my_access") return opts.acesso ?? { locked: false, state: null, tutor_closed: false };
    return opts.resto ? opts.resto(fn, args) : null;
  });
};

beforeEach(() => {
  backend.rpc.mockReset();
  localStorage.clear();
  resetRememberedScreens();
});
afterEach(cleanup);

describe("Contato de suporte: onde aparece", () => {
  it("login: mostra o e-mail padrão e depois o da configuração", async () => {
    banco({ contato: "ajuda@staziamed.com.br" });
    render(<LoginScreen go={vi.fn()} />);
    expect(screen.getByRole("link", { name: DEFAULT_SUPPORT_EMAIL }).getAttribute("href")).toBe(`mailto:${DEFAULT_SUPPORT_EMAIL}`);
    expect(await screen.findByRole("link", { name: "ajuda@staziamed.com.br" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: DEFAULT_SUPPORT_EMAIL })).toBeNull();
  });

  it("login: se o banco ainda não tem a função, fica o e-mail padrão (sem erro na tela)", async () => {
    banco({ contato: new Error("Could not find the function public.app_support_contact") });
    render(<LoginScreen go={vi.fn()} />);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_support_contact"));
    expect(screen.getByRole("link", { name: DEFAULT_SUPPORT_EMAIL })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cadastro e recuperar senha também mostram o contato", () => {
    banco();
    render(<AuthFlow link={{ kind: null }} />);
    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
    expect(screen.getByRole("link", { name: DEFAULT_SUPPORT_EMAIL })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    fireEvent.click(screen.getByRole("button", { name: /esqueci minha senha/i }));
    expect(screen.getByRole("link", { name: DEFAULT_SUPPORT_EMAIL })).toBeTruthy();
  });
});

describe("Avisos de acesso bloqueado (B4)", () => {
  const SEM = /assinatura pelo app|pagamento autom|cobran|R\$|\bpre[cç]o|checkout|stripe|cart[aã]o/i;

  it("os textos pedem contato com o suporte da configuração e não falam de pagamento automático nem de preço", () => {
    for (const estado of ["teste_acabou", "plano_acabou", "sem_teste"]) {
      for (const tutorFechado of [true, false]) {
        const n = lockNotice(estado, tutorFechado, "ajuda@staziamed.com.br")!;
        expect(n.text).toContain("Para pedir acesso ou tirar dúvidas, fale com o suporte: ajuda@staziamed.com.br.");
        expect(`${n.title} ${n.text}`).not.toMatch(SEM);
      }
    }
    expect(lockNotice("teste_acabou")!.text).toContain(DEFAULT_SUPPORT_EMAIL);
  });

  it("mensagem antiga do banco ('A assinatura pelo app ainda não está disponível') é trocada pelo contato; outras ficam como estão", () => {
    const velha = "Seu teste grátis terminou. Os simulados completos fazem parte dos planos pagos; as questões e os flashcards continuam abertos. A assinatura pelo app ainda não está disponível.";
    const nova = withSupport(velha, "ajuda@staziamed.com.br");
    expect(nova).not.toMatch(SEM);
    expect(nova).toBe("Seu teste grátis terminou. Os simulados completos fazem parte dos planos pagos; as questões e os flashcards continuam abertos. Para pedir acesso ou tirar dúvidas, fale com o suporte: ajuda@staziamed.com.br.");
    expect(withSupport("Nenhuma questão encontrada.")).toBe("Nenhuma questão encontrada.");
  });

  it("Tutor bloqueado: a tela mostra o contato da configuração, sem 'assinatura pelo app' nem 'Ver planos'", async () => {
    session.boot = bootOf(TESTE_ACABOU);
    banco({ contato: "ajuda@staziamed.com.br", acesso: { locked: true, state: "teste_acabou", tutor_closed: true }, resto: (fn) => (fn === "app_tutor_status" ? { enabled: true, consent_required: false, available: false, entitlement: { plan_locked: true, block_reason: "trial_expired" } } : null) });
    render(<TutorGate go={vi.fn()}>{() => <div>conteúdo</div>}</TutorGate>);
    expect(await screen.findByText(/fale com o suporte: ajuda@staziamed\.com\.br\./)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(SEM);
    expect(screen.queryByText("Ver planos")).toBeNull();
  });

  it("Simulados: o aviso do botão desligado traz o contato", async () => {
    session.boot = bootOf(TESTE_ACABOU);
    banco({ contato: "ajuda@staziamed.com.br", acesso: { locked: true, state: "teste_acabou", tutor_closed: true }, resto: (fn) => (fn === "app_question_filters" ? { total: 50, exams: [], topics: [] } : fn === "app_count_questions" ? { total: 50, by_area: {} } : fn === "app_recent_sessions" ? [] : null) });
    render(<MemoryRouter><QuestionBuilder go={vi.fn()} mode="sim" /></MemoryRouter>);
    expect(await screen.findByText(/fale com o suporte: ajuda@staziamed\.com\.br\./)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(SEM);
  });
});

describe("Conta: Seu plano (datas reais, sem número inventado)", () => {
  const abrir = (subscription: any, over: any = {}) => {
    session.boot = bootOf(subscription, over);
    banco();
    return render(<AccountScreen go={vi.fn()} />);
  };
  const cartao = () => screen.getByRole("heading", { name: "Seu plano" }).parentElement!;

  it("teste grátis no prazo: 'Teste grátis até' e a data do teste", () => {
    abrir(TESTE);
    expect(cartao().textContent).toContain(`Teste grátis até ${dataBR(FIM_TESTE)}`);
  });
  it("teste vencido: diz 'encerrado em' com a data real", () => {
    abrir(TESTE_ACABOU);
    expect(cartao().textContent).toContain(`Teste grátis encerrado em ${dataBR(Date.now() - 3 * DAY)}`);
  });
  it("plano pago: 'Plano pago até' e a data de 'Plano pago até' da assinatura", () => {
    abrir(PAGO);
    expect(cartao().textContent).toContain(`Plano pago até ${dataBR(FIM_PAGO)}`);
  });
  it("sem teste e sem plano: não inventa data", () => {
    abrir(SEM_TESTE);
    expect(cartao().textContent).toContain("Sem teste nem plano pago no momento");
    expect(cartao().textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
  it("tem o contato de suporte e nenhum preço", () => {
    abrir(PAGO);
    expect(cartao().textContent).toContain(`Fale com o suporte: ${DEFAULT_SUPPORT_EMAIL}`);
    expect(cartao().textContent).not.toMatch(/R\$|cobran|assinatura pelo app/i);
  });
  it("equipe não tem 'Seu plano'", () => {
    abrir(null, { role: "admin" });
    expect(screen.queryByRole("heading", { name: "Seu plano" })).toBeNull();
  });
  it("planSummary: plano pago vencido, cancelado e pagamento pendente", () => {
    const antes = { ...PAGO, current_period_end: iso(Date.now() - 2 * DAY) };
    expect(planSummary(antes, "student")).toMatchObject({ lead: "Plano pago encerrado em" });
    expect(planSummary({ ...PAGO, status: "canceled" }, "student")).toMatchObject({ lead: "Plano pago encerrado em" });
    expect(planSummary({ ...PAGO, status: "past_due" }, "student")).toMatchObject({ lead: "Plano pago até", note: "Há um pagamento pendente neste plano." });
    expect(planSummary(null, "student")).toBeNull();
  });
});

describe("Conta: Ajuda e suporte e Relatar um problema", () => {
  const abrirAjuda = async (contato: string | Error = "ajuda@staziamed.com.br", resto?: (fn: string, args?: any) => any) => {
    session.boot = bootOf(TESTE);
    banco({ contato, resto });
    render(<AccountScreen go={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Ajuda e suporte/ }));
    return screen.findByRole("form", { name: "Relatar um problema" });
  };
  const escrever = (texto: string) => fireEvent.change(screen.getByLabelText("O que aconteceu?"), { target: { value: texto } });
  const enviar = () => fireEvent.click(screen.getByRole("button", { name: "Enviar relato" }));

  it("mostra o e-mail de suporte da configuração e o aviso de não escrever dados de pacientes", async () => {
    await abrirAjuda();
    expect(await screen.findAllByRole("link", { name: "ajuda@staziamed.com.br" })).not.toHaveLength(0);
    expect(screen.getByText(/Não escreva senhas nem dados de pacientes/)).toBeTruthy();
  });

  it("a tela de antes da Conta já vem escolhida; o aluno pode trocar", async () => {
    rememberScreen("simulados");
    rememberScreen("perfil");
    expect(screenBeforeAccount()).toBe("Simulados");
    await abrirAjuda();
    expect((screen.getByLabelText("Em qual tela aconteceu?") as HTMLSelectElement).value).toBe("Simulados");
    fireEvent.change(screen.getByLabelText("Em qual tela aconteceu?"), { target: { value: "Flashcards" } });
    escrever("O cartão repete sem parar depois de eu responder.");
    enviar();
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_report_problem", { p_screen: "Flashcards", p_message: "O cartão repete sem parar depois de eu responder." }));
  });

  it("envia, mostra o agradecimento e limpa o texto", async () => {
    await abrirAjuda("ajuda@staziamed.com.br", (fn) => (fn === "app_report_problem" ? { ok: true } : null));
    escrever("  O gabarito da questão 12 parece errado.  ");
    enviar();
    expect(await screen.findByText(/Relato enviado\. Obrigado!/)).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_report_problem", { p_screen: "Outra tela ou não sei", p_message: "O gabarito da questão 12 parece errado." });
    expect((screen.getByLabelText("O que aconteceu?") as HTMLTextAreaElement).value).toBe("");
  });

  it("texto curto: avisa na própria tela e não envia", async () => {
    await abrirAjuda();
    escrever("curto");
    enviar();
    expect(await screen.findByText(/pelo menos 10 letras/)).toBeTruthy();
    expect(backend.rpc).not.toHaveBeenCalledWith("app_report_problem", expect.anything());
  });

  it("o limite do tamanho está no campo (1000 letras)", async () => {
    await abrirAjuda();
    expect(screen.getByLabelText("O que aconteceu?").getAttribute("maxlength")).toBe("1000");
  });

  it("limite de 5 por dia: mostra a mensagem do banco em português", async () => {
    await abrirAjuda("ajuda@staziamed.com.br", (fn) => {
      if (fn === "app_report_problem") throw new Error("Você já enviou 5 relatos nas últimas 24 horas. Tente de novo mais tarde.");
      return null;
    });
    escrever("Mais um problema com bastante detalhe.");
    enviar();
    expect(await screen.findByText("Você já enviou 5 relatos nas últimas 24 horas. Tente de novo mais tarde.")).toBeTruthy();
  });

  it("banco sem a função (SQL ainda não colado): manda escrever para o suporte, sem termo técnico", async () => {
    await abrirAjuda("ajuda@staziamed.com.br", (fn) => {
      if (fn === "app_report_problem") throw new Error("Could not find the function public.app_report_problem(p_message, p_screen) in the schema cache");
      return null;
    });
    escrever("O botão de iniciar não responde nunca.");
    enviar();
    const aviso = await screen.findByText(/O envio de relatos ainda não está disponível\. Escreva para o suporte:/);
    expect(aviso.textContent).toContain("ajuda@staziamed.com.br");
    expect(aviso.textContent).not.toMatch(/function|schema|public\./i);
  });

  it("outro erro: texto geral com o contato (não mostra o erro técnico)", async () => {
    await abrirAjuda("ajuda@staziamed.com.br", (fn) => {
      if (fn === "app_report_problem") throw new Error("deadlock detected");
      return null;
    });
    escrever("O botão de iniciar não responde nunca.");
    enviar();
    const aviso = await screen.findByText(/Não foi possível enviar agora\./);
    expect(aviso.textContent).not.toMatch(/deadlock/);
    expect(aviso.textContent).toContain("ajuda@staziamed.com.br");
  });
});
