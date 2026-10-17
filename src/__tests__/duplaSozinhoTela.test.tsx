/**
 * Treino sozinho (2ª fase, rota `estacao`): janela de leitura, atendimento por escrito, impressos, cronômetro do servidor,
 * entrega e escolha da correção. O "servidor" é simulado (helpers/soloServidor.ts) e guarda a fase; a tela só mostra.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CHECKLIST, SEGREDO_ATOR, makeSoloServer } from "./helpers/soloServidor";

const state: { server: ReturnType<typeof makeSoloServer> } = { server: null as any };
const acceptTerms = vi.fn();

vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ backend: state.server.backend, boot: { role: "student" }, user: { id: "u1" }, acceptTerms }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
const whistle = vi.fn();
vi.mock("../novo/app/dupla/sound.js", async (importOriginal) => ({ ...(await importOriginal<any>()), playWhistle: () => whistle() }));

import { Fase2Player } from "../novo/app/fase2/Fase2Player.jsx";

const go = vi.fn();
const open = (url = "/estacao?id=st-teste-1") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Fase2Player go={go} />
    </MemoryRouter>
  );

beforeEach(() => {
  go.mockReset();
  whistle.mockReset();
  acceptTerms.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Começa o atendimento pela tela de leitura. */
async function begin() {
  fireEvent.click(await screen.findByRole("button", { name: "Iniciar atendimento" }));
  await screen.findByRole("button", { name: "Entregar" });
}

describe("Treino sozinho: leitura e atendimento", () => {
  it("leitura: cenário e tarefas, sem impressos nem PEP; Iniciar atendimento começa o relógio do servidor", async () => {
    state.server = makeSoloServer({ leak: true });
    open();
    await screen.findByText("Cenário de atuação");
    expect(screen.getByText(/Cenário de teste: paciente de teste/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Tarefas/ }));
    expect(screen.getByText(/1\. Fazer a anamnese\./)).toBeTruthy();
    expect(screen.queryByText("Impressos")).toBeNull();
    expect(screen.queryByText(/Apresenta-se e pede permissão/)).toBeNull();
    expect(screen.getByRole("timer").textContent).toMatch(/10:00/);
    expect(state.server.callsOf("app_fase2_begin")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Iniciar atendimento" }));
    await screen.findByRole("button", { name: "Entregar" });
    expect(state.server.callsOf("app_fase2_begin")[0].args).toEqual({ p_attempt_id: "att-teste-1" });
  });

  it("atendimento: enunciado, relato aberto, uma caixa por tarefa com o texto de ajuda e cronômetro de 10 minutos", async () => {
    state.server = makeSoloServer();
    open();
    await begin();
    expect(screen.getByText("Enunciado")).toBeTruthy();
    expect(screen.getByText("Relato de teste do caso.")).toBeTruthy();
    const box1 = screen.getByRole("textbox", { name: "Sua resposta à tarefa 1" });
    const box2 = screen.getByRole("textbox", { name: "Sua resposta à tarefa 2" });
    expect(box1.getAttribute("placeholder")).toBe("Escreva aqui como você faria e o que diria ao paciente.");
    expect(box2).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Sua resposta à tarefa 3" })).toBeNull();
    // "Observação: …" não é tarefa: fica como nota, sem caixa
    expect(screen.getByText("Observação: nota de teste.")).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toMatch(/^(10:00|09:59)$/);
  });

  it("tarefas que não se reconhecem: uma caixa só", async () => {
    state.server = makeSoloServer({ tasks: "Conduza o atendimento do paciente de teste." });
    open();
    await begin();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Sua resposta" })).toBeTruthy();
    expect(screen.getByText("Conduza o atendimento do paciente de teste.")).toBeTruthy();
  });

  it("o texto é salvo sozinho depois de parar de digitar e volta igual ao recarregar a página", async () => {
    state.server = makeSoloServer();
    open();
    await begin();
    fireEvent.change(screen.getByRole("textbox", { name: "Sua resposta à tarefa 1" }), { target: { value: "Pergunto o nome e a queixa." } });
    expect(state.server.callsOf("app_fase2_save_answers")).toHaveLength(0); // ainda digitando
    await waitFor(() => expect(state.server.callsOf("app_fase2_save_answers")).toHaveLength(1), { timeout: 3000 });
    expect(state.server.callsOf("app_fase2_save_answers")[0].args).toEqual({
      p_attempt_id: "att-teste-1",
      p_answers: [{ task: 1, text: "Pergunto o nome e a queixa." }, { task: 2, text: "" }],
    });
    await screen.findByText("Texto salvo.");

    cleanup(); // "recarregar": outra montagem pela mesma tentativa
    open("/estacao?tentativa=att-teste-1");
    const box1 = (await screen.findByRole("textbox", { name: "Sua resposta à tarefa 1" })) as HTMLTextAreaElement;
    expect(box1.value).toBe("Pergunto o nome e a queixa.");
    expect(screen.getByRole("button", { name: "Entregar" })).toBeTruthy(); // mesma fase
  });

  it("ao sair da página o texto que faltava é salvo; falha de rede do salvamento mostra aviso e tenta de novo", async () => {
    state.server = makeSoloServer({ failSaves: 1 });
    open();
    await begin();
    fireEvent.change(screen.getByRole("textbox", { name: "Sua resposta à tarefa 2" }), { target: { value: "Oriento o retorno." } });
    await screen.findByText("Não foi possível salvar agora. Vamos tentar de novo.", {}, { timeout: 3000 });
    // o texto continua na tela
    expect((screen.getByRole("textbox", { name: "Sua resposta à tarefa 2" }) as HTMLTextAreaElement).value).toBe("Oriento o retorno.");
    // sair da tela envia o que ficou pendente
    cleanup();
    await waitFor(() => expect(state.server.callsOf("app_fase2_save_answers").length).toBeGreaterThanOrEqual(2));
    expect(state.server.state.answers).toEqual([{ task: 1, text: "" }, { task: 2, text: "Oriento o retorno." }]);
  });

  it("impressos: só o nome até pedir; Pedir impresso abre o texto, registra e mostra 'Impresso aberto'; imagem pela rota assinada", async () => {
    state.server = makeSoloServer();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/prints/p2/link")) return new Response(JSON.stringify({ url: "https://imagens.teste/p2.png" }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    open();
    await begin();
    expect(screen.getByText("Impresso 1 · Exame de teste A")).toBeTruthy();
    expect(screen.queryByText("Resultado de teste A")).toBeNull();
    expect(screen.queryByText("Impresso aberto")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Pedir impresso 1: Exame de teste A" }));
    await screen.findByText("Resultado de teste A");
    expect(state.server.callsOf("app_fase2_open_pressing")[0].args).toEqual({ p_attempt_id: "att-teste-1", p_pressing_id: "p1" });
    expect(screen.getByText("Impresso aberto")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pedir impresso 1: Exame de teste A" })).toBeNull();

    // impresso com imagem: link assinado com o token da sessão
    fireEvent.click(screen.getByRole("button", { name: "Pedir impresso 2: Exame de teste B" }));
    await screen.findByText("Resultado de teste B");
    const img = await screen.findByAltText("Imagem do impresso: Exame de teste B");
    expect(img.getAttribute("src")).toBe("https://imagens.teste/p2.png");
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/prints/p2/link"))!;
    expect(call[0]).toBe("/api/dupla/solo/att-teste-1/prints/p2/link");
    expect((call[1] as any).headers.Authorization).toBe("Bearer token-de-teste");

    // ampliar a imagem e fechar com Esc
    fireEvent.click(screen.getByRole("button", { name: "Ampliar impresso" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("impresso que o servidor recusa mostra o motivo em português e continua fechado", async () => {
    state.server = makeSoloServer({ errors: { app_fase2_open_pressing: "Esta tentativa não aceita mais impressos." } });
    open();
    await begin();
    fireEvent.click(screen.getByRole("button", { name: "Pedir impresso 1: Exame de teste A" }));
    await screen.findByText("Esta tentativa não aceita mais impressos.");
    expect(screen.queryByText("Resultado de teste A")).toBeNull();
  });

  it("00:00: aparece 'Tempo esgotado', o apito toca uma vez, nada se encerra sozinho e ainda dá para entregar", async () => {
    state.server = makeSoloServer({ durationMs: 1400 });
    open();
    await begin();
    expect(screen.queryByText("Tempo esgotado")).toBeNull();
    await screen.findByText("Tempo esgotado", {}, { timeout: 4000 });
    expect(screen.getAllByText("Tempo esgotado").length).toBeGreaterThan(0);
    expect(screen.getByRole("timer").textContent).toMatch(/00:00/);
    expect(whistle).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 700));
    expect(whistle).toHaveBeenCalledTimes(1);
    // sem auto-encerramento: nenhuma chamada de fim e a tela segue no atendimento
    expect(state.server.callsOf("app_fase2_finish")).toHaveLength(0);
    expect(state.server.callsOf("app_fase2_deliver")).toHaveLength(0);
    expect(screen.getByText("O tempo acabou. Você ainda pode concluir e entregar.")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Sua resposta à tarefa 1" }), { target: { value: "Entrego depois do tempo." } });
    fireEvent.click(screen.getByRole("button", { name: "Entregar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sim, entregar" }));
    await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
    expect(state.server.callsOf("app_fase2_deliver")).toHaveLength(1);
  });
});

describe("Treino sozinho: entrega, escolha e autoavaliação", () => {
  it("Entregar pede confirmação, manda o texto junto e abre 'Como você quer corrigir?'", async () => {
    state.server = makeSoloServer();
    open();
    await begin();
    fireEvent.change(screen.getByRole("textbox", { name: "Sua resposta à tarefa 1" }), { target: { value: "Pergunto a queixa." } });
    fireEvent.click(screen.getByRole("button", { name: "Entregar" }));
    const confirm = await screen.findByRole("dialog", { name: "Entregar o atendimento?" });
    expect(state.server.callsOf("app_fase2_deliver")).toHaveLength(0);
    // Voltar não entrega
    fireEvent.click(within(confirm).getByRole("button", { name: "Voltar" }));
    expect(state.server.callsOf("app_fase2_deliver")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Entregar" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Entregar o atendimento?" })).getByRole("button", { name: "Sim, entregar" }));
    const choose = await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
    expect(state.server.callsOf("app_fase2_deliver")[0].args).toEqual({
      p_attempt_id: "att-teste-1",
      p_answers: [{ task: 1, text: "Pergunto a queixa." }, { task: 2, text: "" }],
    });
    // entregue: nenhum salvamento a mais depois da entrega
    const saves = state.server.callsOf("app_fase2_save_answers").length;
    await new Promise((r) => setTimeout(r, 1000));
    expect(state.server.callsOf("app_fase2_save_answers")).toHaveLength(saves);
    expect(within(choose).getByRole("button", { name: "Eu mesmo avalio com o PEP" })).toBeTruthy();
    expect(screen.getByText("Pergunto a queixa.")).toBeTruthy(); // o texto entregue, só leitura
  });

  it("falha na entrega: aviso em português, o texto continua na tela e a fase não muda", async () => {
    state.server = makeSoloServer({ errors: { app_fase2_deliver: "Não foi possível entregar agora." } });
    open();
    await begin();
    fireEvent.change(screen.getByRole("textbox", { name: "Sua resposta à tarefa 1" }), { target: { value: "Texto que não pode sumir." } });
    fireEvent.click(screen.getByRole("button", { name: "Entregar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sim, entregar" }));
    await screen.findByText("Não foi possível entregar agora.");
    expect((screen.getByRole("textbox", { name: "Sua resposta à tarefa 1" }) as HTMLTextAreaElement).value).toBe("Texto que não pode sumir.");
    expect(screen.queryByRole("dialog", { name: "Como você quer corrigir?" })).toBeNull();
  });

  it("entregue e recarregado: volta à janela da escolha; Esc fecha e o botão reabre", async () => {
    state.server = makeSoloServer({ status: "submitted", answers: [{ task: 1, text: "Texto entregue de teste." }] });
    open("/estacao?tentativa=att-teste-1");
    await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Escolher como corrigir" }));
    await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
  });

  it("'Eu mesmo avalio com o PEP' abre a autoavaliação: o PEP só aparece agora e a nota vem do servidor", async () => {
    state.server = makeSoloServer({ status: "submitted", leak: true });
    open("/estacao?tentativa=att-teste-1");
    const choose = await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
    // antes da escolha nenhum item do PEP na tela
    expect(document.body.textContent).not.toContain("Apresenta-se e pede permissão.");
    fireEvent.click(within(choose).getByRole("button", { name: "Eu mesmo avalio com o PEP" }));
    await screen.findByText("Padrão Esperado de Procedimentos");
    expect(state.server.callsOf("app_fase2_finish")).toHaveLength(1);
    expect(screen.getByText("Apresenta-se e pede permissão.")).toBeTruthy();
    const concluir = screen.getByRole("button", { name: "Concluir e ver a nota" });
    expect(concluir).toBeDisabled();
    // item sem nível parcial não mostra "Parcial"; critérios aparecem legíveis, sem JSON
    expect(within(screen.getByRole("radiogroup", { name: "Item 1" })).queryByRole("radio", { name: "Parcial" })).toBeNull();
    expect(document.body.textContent).not.toContain('"correct"');
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Item 1" })).getByRole("radio", { name: "Adequado" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Item 2" })).getByRole("radio", { name: "Parcial" }));
    expect(concluir).not.toBeDisabled();
    fireEvent.click(concluir);
    await screen.findByRole("heading", { name: "Resultado do treino sozinho" });
    expect(state.server.callsOf("app_fase2_submit")[0].args).toEqual({ p_attempt_id: "att-teste-1", p_marks: { "1": "correct", "2": "partial" } });
  });
});

describe("Treino sozinho: sair, presença e sigilo", () => {
  it("Sair no atendimento pergunta 'Descartar este treino?'; Continuar treinando não descarta; Descartar chama abandon e volta ao banco", async () => {
    state.server = makeSoloServer();
    open();
    await begin();
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    let dialog = await screen.findByRole("dialog", { name: "Descartar este treino?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuar treinando" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(state.server.callsOf("app_fase2_abandon")).toHaveLength(0);
    expect(go).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    dialog = await screen.findByRole("dialog", { name: "Descartar este treino?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("estacoes"));
    expect(state.server.callsOf("app_fase2_abandon")[0].args).toEqual({ p_attempt_id: "att-teste-1" });
  });

  it("Sair na leitura volta direto, sem perguntar e sem descartar", async () => {
    state.server = makeSoloServer();
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Sair" }));
    expect(go).toHaveBeenCalledWith("estacoes");
    expect(state.server.callsOf("app_fase2_abandon")).toHaveLength(0);
  });

  it("durante o treino manda o sinal 'sozinho'; se o sinal falhar a tela continua normal", async () => {
    state.server = makeSoloServer({ errors: { app_dupla_heartbeat: "Falha do sinal." } });
    open();
    await begin();
    await waitFor(() => expect(state.server.callsOf("app_dupla_heartbeat").some((c) => c.args.p_status === "sozinho")).toBe(true));
    expect(screen.getByRole("button", { name: "Entregar" })).toBeTruthy();
  });

  it("a resposta de rede nunca traz o roteiro do ator nem os itens do PEP antes da entrega; e a tela não os mostra nem se vierem", async () => {
    // servidor correto: nada de PEP nem de roteiro até a autoavaliação
    state.server = makeSoloServer();
    open();
    await begin();
    fireEvent.click(screen.getByRole("button", { name: "Entregar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sim, entregar" }));
    await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
    for (const r of state.server.responses) {
      expect(r.json).not.toContain(SEGREDO_ATOR);
      expect(r.json).not.toContain("actor_script");
      expect(r.json).not.toContain("checklist");
      expect(r.json).not.toContain(CHECKLIST[0].content);
    }
    // a tela só chama funções do aluno
    const names = new Set(state.server.calls.map((c) => c.fn));
    for (const n of names) expect(n).toMatch(/^app_fase2_|^app_dupla_heartbeat$/);

    // servidor com defeito: mesmo recebendo, a tela não escreve
    cleanup();
    state.server = makeSoloServer({ leak: true, status: "attending" });
    open("/estacao?tentativa=att-teste-1");
    await screen.findByRole("button", { name: "Entregar" });
    expect(document.body.textContent).not.toContain(SEGREDO_ATOR);
    expect(document.body.textContent).not.toContain(CHECKLIST[0].content);
    expect(screen.queryByText("Padrão Esperado de Procedimentos")).toBeNull();
  });

  it("acessibilidade: cronômetro com role=timer, janelas com nome e Esc fecha a confirmação de entregar", async () => {
    state.server = makeSoloServer();
    open();
    await begin();
    expect(screen.getByRole("timer")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Etapas da estação" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Entregar" }));
    await screen.findByRole("dialog", { name: "Entregar o atendimento?" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(state.server.callsOf("app_fase2_deliver")).toHaveLength(0);
  });
});
