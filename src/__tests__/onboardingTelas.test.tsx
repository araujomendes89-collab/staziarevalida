/**
 * Onboarding inteligente nas telas (src/novo/app/onboarding): fluxo inteiro (apresentação, 7 perguntas salvas uma a uma,
 * nivelamento existente, plano real e concluir), pular, voltar, teclado (setas e foco no título), erro do servidor, pergunta da
 * fase conforme o acesso do servidor (teste com 2ª fase fechada, PRO, ELITE, vencido), retomar no passo salvo, quem não faz o
 * nivelamento, Primeiros passos por ação real, convite da conta antiga, dica de primeiro uso e o tour (posição, Esc, avançar).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const backend: any = { rpc: vi.fn() };
const sessao: any = { boot: {}, backend, refresh: vi.fn(), setOnboarding: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => sessao,
  useOptionalSession: () => sessao,
}));
// o nivelamento de verdade tem testes próprios; aqui só a porta de saída que o onboarding usa
vi.mock("../novo/app/nivelamento/Nivelamento.jsx", () => ({
  Nivelamento: ({ aoSair }: any) => (
    <div>
      <p>Nivelamento existente</p>
      <button type="button" onClick={() => aoSair()}>
        Fazer depois
      </button>
    </div>
  ),
  deveMostrarNivelamento: () => false,
}));

import { Onboarding, deveMostrarOnboarding } from "../novo/app/onboarding/Onboarding.jsx";
import { ConviteOnboarding, DicaPrimeiroUso, PrimeirosPassosCartao, PrimeirosPassosFaixa } from "../novo/app/onboarding/Inicio.jsx";
import { Tour, posicionar } from "../novo/app/onboarding/Tour.jsx";
import { passoInicial, passosVisiveis } from "../novo/app/onboarding/estado.js";

const ESTADO = (extra: any = {}) => ({
  versao: 1, aplicavel: true, mostrar: true, convite: false, conta_antiga: false, status: "not_started", origem: "cadastro", passo_atual: "apresentacao",
  etapas: { apresentacao: false, configuracao: false, nivelamento: null, trilha: false },
  tour: { status: "pendente", passo: 0 }, dicas_vistas: [],
  preferencias: { exam_date: null, daily_minutes: null, dias_semana: null, areas_dificeis: null, jeito_estudar: null, tutor_personagem: null, tutor_personalidade: null, lembretes_quer: null, lembretes_horario: null, fase_escolhida: null, prioridade_fase: null },
  tutor_atual: null,
  acesso: { perfil: "teste", modo_fase: "escolher_teste", fase2_aberta: false, teste_escolha: "teoria", teste_escolhido: false, teste_fim: "2026-10-24T12:00:00-03:00", teoria: "teste", pratica: "sem_acesso" },
  nivelamento: { situacao: "novo", concluido: false, cabe: true },
  primeiros_passos: [
    { id: "perfil", feito: false }, { id: "plano", feito: false }, { id: "questoes", feito: false }, { id: "tutor", feito: false }, { id: "revisao", feito: false },
  ],
  ...extra,
});
const PLANO = { day: "2026-10-17", done: 0, total: 1, tasks: [{ id: "t1", kind: "praticar", title: "Diagnóstico inicial: 10 questões nas 5 grandes áreas", minutes: 20, done: false, progress: 0, target: 10, ref: { reason: "diagnostic" } }] };

let salvos: any[];
let estadoAtual: any;
function servidor(base: any, falhar: Record<string, string> = {}) {
  estadoAtual = base;
  salvos = [];
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_onboarding_salvar") {
      salvos.push([args.p_passo, args.p_dados]);
      if (falhar[args.p_passo]) throw new Error(falhar[args.p_passo]);
      const ordem = ["apresentacao", "fase", "prova", "rotina", "dificuldades", "jeito", "tutor", "lembretes", "nivelamento", "trilha", "fim"];
      const prox = ordem[ordem.indexOf(args.p_passo) + 1] ?? "fim";
      estadoAtual = { ...estadoAtual, status: args.p_passo === "concluir" ? "completed" : args.p_passo === "pular" ? "skipped" : "in_progress", passo_atual: prox,
        etapas: { ...estadoAtual.etapas, ...(args.p_passo === "nivelamento" ? { nivelamento: "pulado" } : {}) } };
      return estadoAtual;
    }
    if (fn === "app_today") return PLANO;
    if (fn === "app_onboarding_tour" || fn === "app_onboarding_dica_vista" || fn === "app_onboarding_estado") return estadoAtual;
    throw new Error(`rpc inesperada: ${fn}`);
  });
}
const abrir = (estado: any, props: any = {}) => {
  sessao.boot = { onboarding: estado, profile: { theme: "light" }, totals: { questions: 1200 }, play: { enabled: true } };
  return render(
    <MemoryRouter>
      <Onboarding {...props} />
    </MemoryRouter>
  );
};
const continuar = () => fireEvent.click(screen.getByRole("button", { name: /^Continuar/ }));

beforeEach(() => {
  backend.rpc.mockReset();
  sessao.refresh.mockReset();
  sessao.setOnboarding.mockReset();
});
afterEach(() => cleanup());

describe("fluxo inteiro de uma conta nova em teste (2ª fase fechada)", () => {
  it("apresentação → 7 perguntas salvas uma a uma → nivelamento existente → plano real → painel", async () => {
    servidor(ESTADO());
    abrir(ESTADO());
    expect(screen.getByRole("heading", { name: "Oi! Eu sou o Stazi." })).toBeTruthy();
    for (let i = 0; i < 5; i += 1) continuar();
    expect(screen.getByRole("heading", { name: "Agora é com você" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Montar meu estudo/ }));
    await screen.findByRole("heading", { name: "Para qual prova você vai estudar?" });
    expect(salvos[0]).toEqual(["apresentacao", {}]);
    // 2ª fase e "as duas" em breve, sem clique
    expect((screen.getByRole("radio", { name: /2ª fase/ }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("radio", { name: /As duas fases/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText("Em breve")).toHaveLength(2);
    expect((screen.getByRole("radio", { name: /1ª fase/ }) as HTMLInputElement).checked).toBe(true);
    continuar();
    await screen.findByRole("heading", { name: "Quando é a sua prova?" });
    expect(salvos[1]).toEqual(["fase", { escolha: "teoria" }]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Ainda não sei/ }));
    continuar();
    await screen.findByRole("heading", { name: /Quanto tempo por dia/ });
    expect(salvos[2]).toEqual(["prova", { exam_date: null }]);
    fireEvent.click(screen.getByRole("radio", { name: /1 h 30/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "sábado" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "segunda" }));
    continuar();
    await screen.findByRole("heading", { name: /dificuldade/ });
    expect(salvos[3]).toEqual(["rotina", { daily_minutes: 90, dias_semana: [2, 3, 4, 5, 6] }]);
    // sem escolha não continua
    expect((screen.getByRole("button", { name: /^Continuar/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Pediatria/ }));
    continuar();
    await screen.findByRole("heading", { name: "Como você prefere estudar?" });
    expect(salvos[4]).toEqual(["dificuldades", { areas: ["PEDIATRIA"] }]);
    fireEvent.click(screen.getByRole("radio", { name: /Um pouco de tudo/ }));
    continuar();
    await screen.findByRole("heading", { name: "Quem vai te acompanhar no Tutor?" });
    expect(salvos[5]).toEqual(["jeito", { jeito: "misto" }]);
    fireEvent.click(screen.getByRole("radio", { name: /Stazia/ }));
    expect((screen.getByRole("radio", { name: /Tranquila/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Durona/ }));
    continuar();
    await screen.findByRole("heading", { name: "Quer lembretes para estudar?" });
    expect(salvos[6]).toEqual(["tutor", { personagem: "stazia", personalidade: "durona" }]);
    expect(screen.getByText(/o app ainda não envia lembretes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /Quero lembretes/ }));
    fireEvent.change(screen.getByLabelText("Horário"), { target: { value: "07:30" } });
    continuar();
    await screen.findByText("Nivelamento existente");
    expect(salvos[7]).toEqual(["lembretes", { quer: true, horario: "07:30" }]);
    fireEvent.click(screen.getByRole("button", { name: "Fazer depois" }));
    await screen.findByRole("heading", { name: "Seu plano de hoje está pronto" });
    expect(salvos[8]).toEqual(["nivelamento", {}]);
    expect(await screen.findByText("Diagnóstico inicial: 10 questões nas 5 grandes áreas")).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_today", { p_rebuild: true });
    await waitFor(() => expect(salvos.some(([p]) => p === "trilha")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /Ir para o meu painel/ }));
    await waitFor(() => expect(sessao.refresh).toHaveBeenCalled());
    expect(salvos.at(-1)).toEqual(["concluir", {}]);
  });

  it("pular tudo: grava 'pular' e entra no app", async () => {
    servidor(ESTADO());
    abrir(ESTADO());
    fireEvent.click(screen.getByRole("button", { name: "Pular tudo" }));
    await waitFor(() => expect(sessao.refresh).toHaveBeenCalled());
    expect(salvos).toEqual([["pular", {}]]);
  });

  it("voltar não salva; erro do servidor aparece e o passo não avança; teclado: setas nas cenas e foco no título", async () => {
    servidor(ESTADO({ status: "in_progress", passo_atual: "prova", etapas: { apresentacao: true } }), { prova: "A data da prova precisa ser hoje ou depois." });
    abrir(estadoAtual);
    const titulo = await screen.findByRole("heading", { name: "Quando é a sua prova?" });
    expect(document.activeElement).toBe(titulo);
    fireEvent.click(screen.getByRole("checkbox", { name: /Ainda não sei/ }));
    continuar();
    expect((await screen.findAllByRole("alert"))[0].textContent).toContain("A data da prova precisa ser hoje ou depois.");
    expect(screen.getByRole("heading", { name: "Quando é a sua prova?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Voltar/ }));
    await screen.findByRole("heading", { name: "Para qual prova você vai estudar?" });
    expect(salvos.map(([p]) => p)).toEqual(["prova"]);
    fireEvent.click(screen.getByRole("button", { name: /Voltar/ }));
    await screen.findByRole("heading", { name: "Oi! Eu sou o Stazi." });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("heading", { name: "Todo dia, um Plano de Hoje" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { name: "Oi! Eu sou o Stazi." })).toBeTruthy();
  });
});

describe("a pergunta da fase segue o acesso do servidor", () => {
  const naFase = (acesso: any) => {
    const e = ESTADO({ status: "in_progress", passo_atual: "fase", acesso: { ...ESTADO().acesso, ...acesso } });
    servidor(e);
    abrir(e);
  };
  it("PRO: 1ª fase já sabida, sem escolha", async () => {
    naFase({ perfil: "pro", modo_fase: "pro" });
    expect(await screen.findByText("Seu plano PRO")).toBeTruthy();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    continuar();
    await waitFor(() => expect(salvos[0]).toEqual(["fase", {}]));
  });
  it("ELITE: escolhe por onde começar; a 2ª fase fechada fica em breve", async () => {
    naFase({ perfil: "elite", modo_fase: "elite" });
    expect((await screen.findByRole("radio", { name: /2ª fase/ }) as HTMLInputElement).disabled).toBe(true);
    continuar();
    await waitFor(() => expect(salvos[0]).toEqual(["fase", { prioridade: "teoria" }]));
  });
  it("2ª fase aberta: as três escolhas liberadas e o aviso de um teste por conta", async () => {
    naFase({ fase2_aberta: true });
    fireEvent.click(await screen.findByRole("radio", { name: /As duas fases/ }));
    expect(screen.getByText(/Só existe um teste grátis por conta/)).toBeTruthy();
    continuar();
    await waitFor(() => expect(salvos[0]).toEqual(["fase", { escolha: "as_duas" }]));
  });
  it("vencido: convite com tudo guardado, sem prometer acesso", async () => {
    naFase({ perfil: "vencido", modo_fase: "convite", teoria: "vencida" });
    expect(await screen.findByText(/as suas preferências e o seu progresso ficam guardados/)).toBeTruthy();
  });
});

describe("retomar, passos visíveis e quem não faz o nivelamento", () => {
  it("retoma no passo mais adiantado salvo no servidor; nivelamento só para quem cabe", () => {
    expect(passoInicial(ESTADO({ status: "in_progress", passo_atual: "jeito" }))).toBe("jeito");
    expect(passosVisiveis(ESTADO())).toContain("nivelamento");
    expect(passosVisiveis(ESTADO({ nivelamento: { cabe: false } }))).not.toContain("nivelamento");
    expect(passosVisiveis(ESTADO({ nivelamento: { cabe: true, concluido: true } }))).not.toContain("nivelamento");
    expect(passoInicial(ESTADO({ status: "in_progress", passo_atual: "nivelamento", nivelamento: { cabe: false } }))).toBe("trilha");
    expect(passoInicial(ESTADO({ status: "completed", passo_atual: "fim" }), "fase")).toBe("fase");
    expect(deveMostrarOnboarding({ onboarding: { mostrar: true } })).toBe(true);
    expect(deveMostrarOnboarding({ onboarding: null })).toBe(false);
  });
  it("PRÁTICA (sem nivelamento): depois dos lembretes o servidor registra o nivelamento e vai direto ao plano", async () => {
    const e = ESTADO({ status: "in_progress", passo_atual: "lembretes", nivelamento: { cabe: false, concluido: false } });
    servidor(e);
    abrir(e);
    await screen.findByRole("heading", { name: "Quer lembretes para estudar?" });
    continuar();
    await screen.findByRole("heading", { name: "Seu plano de hoje está pronto" });
    expect(salvos.slice(0, 2).map(([p]) => p)).toEqual(["lembretes", "nivelamento"]);
    expect(screen.queryByText("Nivelamento existente")).toBeNull();
  });
  it("refazer pela Ajuda: começa na pergunta pedida e 'Fechar' volta ao painel sem gravar nada", async () => {
    const go = vi.fn();
    const e = ESTADO({ mostrar: false, status: "completed", passo_atual: "fim" });
    servidor(e);
    abrir(e, { modo: "refazer", inicio: "fase", go });
    await screen.findByRole("heading", { name: "Para qual prova você vai estudar?" });
    fireEvent.click(screen.getByRole("button", { name: /Fechar/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("home"));
    expect(salvos).toEqual([]);
  });
});

describe("Início: Primeiros passos por ação real, faixa, convite e dicas", () => {
  it("lista os 5 passos com o 'feito' do banco; tocar leva à área; tour pausado pode ser retomado", async () => {
    const go = vi.fn();
    servidor(ESTADO());
    const e = ESTADO({ tour: { status: "pausado", passo: 2 }, primeiros_passos: [{ id: "perfil", feito: true }, { id: "plano", feito: true }, { id: "questoes", feito: false }, { id: "tutor", feito: false }, { id: "revisao", feito: false }] });
    render(<PrimeirosPassosCartao estado={e} go={go} />);
    expect(screen.getByText("Primeiros passos · 2 de 5")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Configurar seu estudo, feito" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Conhecer o Tutor" }));
    expect(go).toHaveBeenCalledWith("tutor", undefined);
    fireEvent.click(screen.getByRole("button", { name: /Retomar o tour do painel \(passo 3 de 5\)/ }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_onboarding_tour", { p_status: "em_andamento", p_passo: 2 }));
  });
  it("sem o retrato do banco (função ausente), nada aparece", () => {
    const { container } = render(<><PrimeirosPassosCartao estado={null} go={() => {}} /><PrimeirosPassosFaixa estado={null} go={() => {}} /><ConviteOnboarding estado={null} go={() => {}} /></>);
    expect(container.textContent).toBe("");
  });
  it("faixa compacta mostra o próximo passo; 'Ocultar' guarda no banco", async () => {
    servidor(ESTADO());
    const go = vi.fn();
    render(<PrimeirosPassosFaixa estado={ESTADO({ primeiros_passos: [{ id: "perfil", feito: true }, { id: "plano", feito: true }, { id: "questoes", feito: true }, { id: "tutor", feito: false }, { id: "revisao", feito: false }] })} go={go} />);
    expect(screen.getByText("Próximo: conhecer o tutor.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_onboarding_dica_vista", { p_dica: "primeiros_passos" }));
  });
  it("convite da conta antiga: Começar abre a configuração; Agora não guarda a dispensa", async () => {
    servidor(ESTADO());
    const go = vi.fn();
    render(<ConviteOnboarding estado={ESTADO({ mostrar: false, convite: true, conta_antiga: true, origem: "conta_antiga" })} go={go} />);
    fireEvent.click(screen.getByRole("button", { name: "Começar" }));
    expect(go).toHaveBeenCalledWith("apresentacao", { inicio: "fase" });
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_onboarding_dica_vista", { p_dica: "convite_onboarding" }));
  });
  it("dica de primeiro uso: aparece na área, some ao tocar Entendi e não volta depois de vista", async () => {
    servidor(ESTADO());
    sessao.boot = { onboarding: ESTADO() };
    const { unmount } = render(<DicaPrimeiroUso route="classificacao" />);
    expect(screen.getByText("Primeira vez na Stazia Arena?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Entendi" }));
    expect(screen.queryByText("Primeira vez na Stazia Arena?")).toBeNull();
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_onboarding_dica_vista", { p_dica: "arena" }));
    unmount();
    sessao.boot = { onboarding: ESTADO({ dicas_vistas: ["arena"] }) };
    const { container } = render(<DicaPrimeiroUso route="missoes" />);
    expect(container.textContent).toBe("");
    sessao.boot = { onboarding: ESTADO({ aplicavel: false }) };
    const r2 = render(<DicaPrimeiroUso route="simulados" />);
    expect(r2.container.textContent).toBe("");
  });
});

describe("tour no painel", () => {
  it("posiciona ao lado do menu lateral, embaixo, em cima ou no pé da tela, sempre dentro da janela", () => {
    const caixa = { width: 360, height: 220 };
    expect(posicionar({ top: 300, left: 20, right: 360, bottom: 350, width: 340, height: 50 } as any, caixa, 1440, 900).lado).toBe("direita");
    expect(posicionar({ top: 100, left: 600, right: 900, bottom: 300, width: 300, height: 200 } as any, caixa, 1440, 900).lado).toBe("baixo");
    expect(posicionar({ top: 780, left: 120, right: 200, bottom: 840, width: 80, height: 60 } as any, caixa, 390, 844).lado).toBe("cima");
    const pe = posicionar({ top: 100, left: 10, right: 380, bottom: 700, width: 370, height: 600 } as any, caixa, 390, 844);
    expect(pe.lado).toBe("pe");
    expect(pe.left).toBeGreaterThanOrEqual(16);
    expect(pe.top + caixa.height).toBeLessThanOrEqual(844 - 16);
  });
  it("acha o marcador visível, avança gravando o passo e Esc interrompe (pausado, para retomar)", async () => {
    servidor(ESTADO());
    const rect = { top: 100, left: 300, right: 700, bottom: 300, width: 400, height: 200, x: 300, y: 100, toJSON() {} };
    const orig = HTMLElement.prototype.getBoundingClientRect;
    const origRects = HTMLElement.prototype.getClientRects;
    HTMLElement.prototype.getBoundingClientRect = function () {
      return this.hasAttribute?.("data-tour") ? (rect as any) : orig.call(this);
    };
    HTMLElement.prototype.getClientRects = function () {
      return (this.hasAttribute?.("data-tour") ? [rect] : origRects.call(this)) as any;
    };
    try {
      render(
        <div>
          <section data-tour="plano-de-hoje">plano</section>
          <button data-tour="questoes">Questões</button>
          <button data-tour="tutor">Tutor</button>
          <button data-tour="evolucao">Evolução</button>
          <button data-tour="conta">Conta</button>
        </div>
      );
      const mudou = vi.fn();
      render(<Tour inicio={0} onMudou={mudou} />);
      const dialogo = await screen.findByRole("dialog", { name: "Seu Plano de Hoje" });
      expect(within(dialogo).getByText("Tour · 1 de 5")).toBeTruthy();
      fireEvent.click(within(dialogo).getByRole("button", { name: "Próximo" }));
      expect(await screen.findByRole("dialog", { name: "Banco de Questões" })).toBeTruthy();
      await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_onboarding_tour", { p_status: "em_andamento", p_passo: 1 }));
      act(() => {
        fireEvent.keyDown(document, { key: "Escape" });
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(backend.rpc).toHaveBeenCalledWith("app_onboarding_tour", { p_status: "pausado", p_passo: 1 });
    } finally {
      HTMLElement.prototype.getBoundingClientRect = orig;
      HTMLElement.prototype.getClientRects = origRects;
    }
  });
});
