// @vitest-environment jsdom
import React from "react";
import { calcularPorContagem, EXEMPLO_ESPECIFICACAO } from "../novo/app/nivelamento/calculo.js";
const RESULTADO_EXEMPLO = calcularPorContagem(EXEMPLO_ESPECIFICACAO);
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const refresh = vi.fn();
const updateProfile = vi.fn();
const go = vi.fn();

let backendState = {
  situacao: "novo",
  bloco: null,
  respondidas: 0,
  total_bloco: 15,
  questoes_feitas: 0,
  resultado: null,
  primeira_tela: true,
  convite: true
};

let respostasBloco1 = {};
let respostasBloco2 = {};

function createBackend() {
  return {
    rpc: vi.fn().mockImplementation(async (fn, args) => {
      if (fn === "app_nivelamento_estado") {
        return {
          aplicavel: true,
          primeira_tela: backendState.primeira_tela,
          convite: backendState.convite,
          situacao: backendState.situacao,
          adiado: backendState.situacao === "adiado",
          bloco: backendState.bloco,
          respondidas: backendState.respondidas,
          total_bloco: backendState.total_bloco,
          questoes_feitas: backendState.questoes_feitas,
          resultado: backendState.resultado
        };
      }
      
      if (fn === "app_nivelamento_adiar") {
        backendState.situacao = "adiado";
        backendState.primeira_tela = false;
        return {
          ...backendState,
          aplicavel: true,
          adiado: true
        };
      }
      
      if (fn === "app_nivelamento_iniciar") {
        backendState.situacao = "bloco1";
        backendState.bloco = 1;
        backendState.respondidas = Object.keys(respostasBloco1).length;
        
        const itens = Array.from({ length: 15 }).map((_, i) => ({
          ordem: i + 1,
          posicao: i + 1,
          resposta: respostasBloco1[i + 1] || null,
          questao: {
            id: `q${i+1}`, code: `Q${i+1}`, number: i+1, area: "CIRURGIA_GERAL",
            statement: `Questao ${i+1}`, options: [{id:"A", text:"Op A"}, {id:"B", text:"Op B"}]
          }
        }));
        
        return {
          situacao: "bloco1",
          bloco: 1,
          total: 15,
          respondidas: backendState.respondidas,
          itens
        };
      }
      
      if (fn === "app_nivelamento_responder") {
        if (backendState.situacao === "bloco1") {
          respostasBloco1[args.p_ordem] = args.p_resposta;
          backendState.respondidas = Object.keys(respostasBloco1).length;
        } else if (backendState.situacao === "bloco2") {
          respostasBloco2[args.p_ordem] = args.p_resposta;
          backendState.respondidas = Object.keys(respostasBloco2).length;
        }
        return { ordem: args.p_ordem, resposta: args.p_resposta, respondidas: backendState.respondidas, total: 15 };
      }
      
      if (fn === "app_nivelamento_finalizar") {
        if (backendState.situacao === "bloco1") {
          backendState.situacao = "parcial";
          backendState.bloco = null;
          backendState.questoes_feitas = 15;
          backendState.resultado = RESULTADO_EXEMPLO;
        }
        return {
          aplicavel: true,
          primeira_tela: backendState.primeira_tela,
          convite: backendState.convite,
          situacao: backendState.situacao,
          adiado: false,
          bloco: backendState.bloco,
          respondidas: 0,
          total_bloco: 15,
          questoes_feitas: backendState.questoes_feitas,
          resultado: backendState.resultado
        };
      }
      
      if (fn === "app_nivelamento_continuar") {
        backendState.situacao = "bloco2";
        backendState.bloco = 2;
        backendState.respondidas = Object.keys(respostasBloco2).length;
        
        const itens = Array.from({ length: 15 }).map((_, i) => ({
          ordem: i + 16,
          posicao: i + 1,
          resposta: respostasBloco2[i + 16] || null,
          questao: {
            id: `q${i+16}`, code: `Q${i+16}`, number: i+16, area: "CIRURGIA_GERAL",
            statement: `Questao ${i+16}`, options: [{id:"A", text:"Op A"}, {id:"B", text:"Op B"}]
          }
        }));
        
        return {
          situacao: "bloco2",
          bloco: 2,
          total: 15,
          respondidas: backendState.respondidas,
          itens
        };
      }

      if (fn === "app_nivelamento_correcao") {
        return {
          itens: [
            {
              ordem: 1, bloco: 1, posicao: 1, resposta: "A", correta: false, gabarito: "B",
              comentario: "Estudou errado",
              questao: {
                id: "q1", code: "Q1", number: 1, area: "CIRURGIA_GERAL",
                statement: "Questao 1", options: [{id:"A", text:"Op A"}, {id:"B", text:"Op B"}]
              }
            }
          ]
        };
      }

      throw new Error(`rpc não simulada: ${fn}`);
    })
  };
}

let backend = createBackend();
let boot = { nivelamento: null };

vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ backend, refresh, boot }),
  useOptionalSession: () => ({ backend, refresh, boot })
}));

import { Nivelamento, deveMostrarNivelamento } from "../novo/app/nivelamento/Nivelamento.jsx";
import { NivelamentoConvite } from "../novo/app/nivelamento/NivelamentoConvite.jsx";
import { Simulador } from "../novo/app/nivelamento/Simulador.jsx";
import { reasonText } from "../novo/app/home/plan.js";

beforeEach(() => {
  backendState = {
    situacao: "novo",
    bloco: null,
    respondidas: 0,
    total_bloco: 15,
    questoes_feitas: 0,
    resultado: null,
    primeira_tela: true,
    convite: true
  };
  respostasBloco1 = {};
  respostasBloco2 = {};
  backend = createBackend();
  boot = { nivelamento: { ...backendState, aplicavel: true } };
  refresh.mockReset();
  go.mockReset();
});

afterEach(cleanup);

describe("Telas de Nivelamento", () => {
  it("Apresentacao", async () => {
    render(<Nivelamento modo="primeira" go={go} />);
    
    expect(await screen.findByText("Vamos conhecer o seu nível")).toBeTruthy();
    expect(screen.getByText(/15 questões/)).toBeTruthy();
    expect(screen.getByText(/30 minutos/)).toBeTruthy();
    expect(screen.getByText(/não aparecem gabarito, explicação nem dicas/)).toBeTruthy();

    const btnDepois = screen.getByText("Fazer depois");
    fireEvent.click(btnDepois);
    
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_nivelamento_adiar"));
    expect(refresh).toHaveBeenCalled();
  });

  it("Questoes", async () => {
    backendState.situacao = "bloco1";
    backendState.bloco = 1;
    render(<Nivelamento modo="rota" go={go} />);
    
    expect(await screen.findByText("Nivelamento · parte 1")).toBeTruthy();
    expect(screen.getByText("Questao 1")).toBeTruthy();

    expect(screen.queryByText(/Gabarito/i)).toBeNull();
    expect(screen.queryByText(/Explicação/i)).toBeNull();
    expect(screen.queryByText(/Comentário/i)).toBeNull();
    expect(screen.queryByText(/Dica/i)).toBeNull();
    expect(screen.queryByText(/fácil/i)).toBeNull();
    expect(screen.queryByText(/difícil/i)).toBeNull();
    expect(screen.queryByText(/acertou/i)).toBeNull();

    // Responder
    const optA = screen.getByText("Op A");
    fireEvent.click(optA);
    const btnConfirma = screen.getByText("Confirmar e seguir");
    fireEvent.click(btnConfirma);
    
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_nivelamento_responder", { p_ordem: 1, p_resposta: "A" }));
  });

  it("Finalizar", async () => {
    // Fill all answers
    for (let i = 1; i <= 15; i++) {
      respostasBloco1[i] = "A";
    }
    backendState.situacao = "bloco1";
    backendState.bloco = 1;
    backendState.respondidas = 15;
    
    render(<Nivelamento modo="rota" go={go} />);
    
    // com as 15 respondidas, a tela já abre na última, pronta para finalizar
    const btnFin = await screen.findByText("Finalizar e ver resultado");
    fireEvent.click(btnFin);
    
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_nivelamento_finalizar"));
    
    // Resultado
    expect(await screen.findByText("57,5%")).toBeTruthy();
    expect(screen.getByText(/Intermediário/)).toBeTruthy();
    expect(screen.getByText(/18 de 30/)).toBeTruthy();
    // 1ª prioridade: Cirurgia (prioridade 62,5), depois GO; a régua dos níveis não repete os nomes
    expect(screen.getByText("prioridade 62,5")).toBeTruthy();
    expect(screen.getByLabelText("Nível 3 de 5")).toBeTruthy();
    expect(screen.getAllByText("Cirurgia").length).toBeGreaterThan(0);
    expect(screen.getByText(/Resultado inicial sujeito a revisão por novas questões/)).toBeTruthy();
    expect(screen.getByText("Provisório")).toBeTruthy();

    // a faixa indicativa (45,8 a 69,2) nunca aparece ao aluno
    expect(screen.queryByText(/45,8/)).toBeNull();
    expect(screen.queryByText(/69,2/)).toBeNull();
    expect(screen.getByText(/A maior prioridade de revisão é Cirurgia, seguida de Ginecologia e Obstetrícia/)).toBeTruthy();
    expect(screen.queryByText(/chance de aprovação/i)).toBeNull();
    
    // Continuar 30 só em parcial
    expect(screen.getByText("Continuar até 30 questões")).toBeTruthy();
  });

  it("Correcao", async () => {
    backendState.situacao = "parcial";
    backendState.resultado = RESULTADO_EXEMPLO;
    
    render(<Nivelamento modo="primeira" go={go} />);
    
    const btnCor = await screen.findByText("Ver correção das questões");
    fireEvent.click(btnCor);
    
    expect(await screen.findByText("Correção do diagnóstico")).toBeTruthy();
    expect(screen.queryAllByText(/^Gabarito/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Você errou").length).toBeGreaterThan(0);
  });

  it("deveMostrarNivelamento and Convite", () => {
    expect(deveMostrarNivelamento({ nivelamento: { primeira_tela: true } })).toBe(true);
    expect(deveMostrarNivelamento({ nivelamento: { primeira_tela: false } })).toBe(false);

    // Convite novo
    const { rerender } = render(<NivelamentoConvite estado={{ convite: true, situacao: "novo" }} go={go} />);
    expect(screen.getAllByText("Diagnóstico de nivelamento").length).toBeGreaterThan(0);
    
    rerender(<NivelamentoConvite estado={{ convite: true, situacao: "parcial", resultado: { nivel: 3, nivel_nome: "Intermediário" } }} go={go} />);
    expect(screen.getByText(/Nível 3 · Intermediário/)).toBeTruthy();
  });

  it("reasonText", () => {
    expect(reasonText({ ref: { reason: "nivelamento", proficiencia: 45.2 }})).toBe("É a área com maior prioridade de estudo pelo seu nivelamento (proficiência estimada de 45,2%).");
  });

  it("Simulador", async () => {
    render(<Simulador />);
    
    expect(screen.getByText("57,5%")).toBeTruthy();
    
    const btns = screen.getAllByText("+");
    fireEvent.click(btns[0]); // altera primeira área
    
    await waitFor(() => {
      expect(screen.queryByText("57,5%")).toBeNull();
    });
    
    const rest = screen.getByText("Restaurar exemplo");
    fireEvent.click(rest);
    
    expect(await screen.findByText("57,5%")).toBeTruthy();
  });
});