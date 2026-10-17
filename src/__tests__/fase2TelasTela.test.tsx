/**
 * Testes das telas da 2ª fase (React Testing Library).
 * Cobre as telas em src/novo/app/fase2/:
 *  - Fase2Home (Início com estado honesto, contadores e retomada)
 *  - Fase2Stations (Catálogo com filtros de texto, área, status de conclusão, Pro e erro de carga)
 *  - Fase2Player (Ciclo leitura -> atendimento com impressos sob demanda -> PEP com marcações -> tela final)
 *  - Fase2Peps (Lista de avaliações: sozinho abre o PEP; em dupla vem do histórico da 013400 e abre o resultado)
 *  - Fase2Performance (Desempenho prático real sem variações inventadas)
 *  - Fase2Patient (Paciente IA em breve, estático e sem tráfego de rede)
 *  - Fase2Theory (Teoria em preparação com links para a 1ª fase, sem termos de rascunho)
 *  - Acessibilidade mínima (role=timer e aria-label nos itens do PEP)
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mocks de infraestrutura da aplicação
const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({
    backend,
    boot: { role: "editor" },
    user: { id: "user-123", email: "editor@staziamed.dev" },
  }),
}));

vi.mock("../novo/app/Shell.jsx", () => ({
  useMobile: () => false,
  useMQ: () => false,
}));

import { Fase2Home } from "../novo/app/fase2/Fase2Home.jsx";
import { Fase2Stations } from "../novo/app/fase2/Fase2Stations.jsx";
import { Fase2Player } from "../novo/app/fase2/Fase2Player.jsx";
import { Fase2Peps } from "../novo/app/fase2/Fase2Peps.jsx";
import { Fase2Performance } from "../novo/app/fase2/Fase2Performance.jsx";
import { Fase2Patient } from "../novo/app/fase2/Fase2Patient.jsx";
import { Fase2Theory } from "../novo/app/fase2/Fase2Theory.jsx";

describe("Telas da 2ª Fase (React Testing Library)", () => {
  let go: any;

  beforeEach(() => {
    go = vi.fn();
    backend.rpc.mockReset();
    window.confirm = vi.fn(() => true);
  });

  afterEach(cleanup);

  // ---------------------------------------------------------------------------
  // 1. INÍCIO (Fase2Home)
  // ---------------------------------------------------------------------------
  describe("Início (Fase2Home)", () => {
    it("vazio (stations_total 0, tudo nulo) mostra que ainda não há estações aprovadas e NÃO mostra nome de estação nem nota", async () => {
      backend.rpc.mockImplementation(async (fn: string) => {
        if (fn === "app_fase2_overview") {
          return {
            stations_total: 0,
            areas: [],
            done_count: 0,
            avg_score10: null,
            last: null,
            open_attempt: null,
          };
        }
        throw new Error(`rpc inesperada: ${fn}`);
      });

      render(
        <MemoryRouter>
          <Fase2Home go={go} />
        </MemoryRouter>
      );

      // Mensagem honesta de estado vazio
      await screen.findByText("Ainda não há estações aprovadas");
      expect(
        screen.getByText("O catálogo de estações práticas é preenchido após a validação da revisão médica.")
      ).toBeTruthy();

      // Não mostra nomes de estação nem notas fictícias
      expect(screen.queryByText(/Cetoacidose/i)).toBeNull();
      expect(screen.queryByText(/Bronquiolite/i)).toBeNull();
      expect(screen.queryByText(/Última estação/i)).toBeNull();
    });

    it("com dados mostra contagens recebidas, nome da última estação e botão de continuar estação aberta", async () => {
      backend.rpc.mockImplementation(async (fn: string) => {
        if (fn === "app_fase2_overview") {
          return {
            stations_total: 10,
            areas: [
              { area: "Clínica Médica", total: 6 },
              { area: "Pediatria", total: 4 },
            ],
            done_count: 3,
            avg_score10: 8.4,
            last: {
              id: "att-last-1",
              origin: "solo",
              station_id: "st-cm",
              name: "Cetoacidose diabética",
              area: "Clínica Médica",
              at: "2026-10-15T10:00:00Z",
              score10: 8.4,
            },
            open_attempt: {
              id: "att-open-77",
              station_id: "st-ped",
              name: "Bronquiolite viral aguda",
              status: "attending",
            },
          };
        }
        throw new Error(`rpc inesperada: ${fn}`);
      });

      render(
        <MemoryRouter>
          <Fase2Home go={go} />
        </MemoryRouter>
      );

      // Destaque de continuar estação em andamento
      await screen.findByText("Continue sua estação");
      expect(screen.getByText("Bronquiolite viral aguda")).toBeTruthy();

      const btnContinuar = screen.getByRole("button", { name: /Continuar estação/i });
      fireEvent.click(btnContinuar);
      expect(go).toHaveBeenCalledWith("estacao", { tentativa: "att-open-77" });

      // Contagens reais dos indicadores
      expect(screen.getAllByText("3").length).toBeGreaterThan(0); // feitas
      expect(screen.getAllByText("8,4").length).toBeGreaterThan(0); // média
      expect(screen.getByText("10")).toBeTruthy(); // disponíveis

      // Última estação realizada
      expect(screen.getByText("Cetoacidose diabética")).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. BANCO DE ESTAÇÕES (Fase2Stations)
  // ---------------------------------------------------------------------------
  describe("Banco de estações (Fase2Stations)", () => {
    const STATIONS_DATA = [
      {
        id: "st-1",
        name: "Cetoacidose diabética",
        topic: "DM1 descompensado",
        area: "Clínica Médica",
        setting: "Pronto-socorro",
        institution: "INEP",
        year: "2024",
        duration_ms: 600000,
        is_pro_only: false,
        locked: false,
        my_best: 8.5,
        my_count: 2,
      },
      {
        id: "st-2",
        name: "Bronquiolite viral aguda",
        topic: "BVA no lactente",
        area: "Pediatria",
        setting: "Ambulatório",
        institution: "INEP",
        year: "2023",
        duration_ms: 600000,
        is_pro_only: false,
        locked: false,
        my_best: null,
        my_count: 0,
      },
      {
        id: "st-3",
        name: "Apendicite aguda",
        topic: "Abdome agudo cirúrgico",
        area: "Cirurgia Geral",
        setting: "Pronto-socorro",
        institution: "INEP",
        year: "2022",
        duration_ms: 600000,
        is_pro_only: true,
        locked: true,
        my_best: null,
        my_count: 0,
      },
    ];

    it("lista cartões recebidos, filtra por busca, área e status; clique abre a estação", async () => {
      backend.rpc.mockImplementation(async (fn: string) => {
        if (fn === "app_fase2_stations") return STATIONS_DATA;
        throw new Error(`rpc inesperada: ${fn}`);
      });

      render(
        <MemoryRouter>
          <Fase2Stations go={go} />
        </MemoryRouter>
      );

      await screen.findByText("Cetoacidose diabética");
      expect(screen.getByText("Bronquiolite viral aguda")).toBeTruthy();
      expect(screen.getByText("Apendicite aguda")).toBeTruthy();

      // Busca por texto
      const searchInput = screen.getByRole("textbox", { name: /Buscar estação/i });
      fireEvent.change(searchInput, { target: { value: "lactente" } });
      expect(screen.getByText("Bronquiolite viral aguda")).toBeTruthy();
      expect(screen.queryByText("Cetoacidose diabética")).toBeNull();
      expect(screen.queryByText("Apendicite aguda")).toBeNull();

      // Limpa busca
      fireEvent.change(searchInput, { target: { value: "" } });
      expect(screen.getByText("Cetoacidose diabética")).toBeTruthy();

      // Filtro de área via Chip
      const chipPed = screen.getByRole("button", { name: /^Pediatria/i });
      fireEvent.click(chipPed);
      expect(screen.getByText("Bronquiolite viral aguda")).toBeTruthy();
      expect(screen.queryByText("Cetoacidose diabética")).toBeNull();

      // Volta para Todas
      const chipTodas = screen.getByRole("button", { name: /^Todas/i });
      fireEvent.click(chipTodas);

      // Filtro de status "Não feitas" (my_count === 0)
      const optNaoFeitas = screen.getByRole("radio", { name: "Não feitas" });
      fireEvent.click(optNaoFeitas);
      expect(screen.getByText("Bronquiolite viral aguda")).toBeTruthy();
      expect(screen.getByText("Apendicite aguda")).toBeTruthy();
      expect(screen.queryByText("Cetoacidose diabética")).toBeNull();

      // Filtro de status "Já feitas" (my_count > 0)
      const optFeitas = screen.getByRole("radio", { name: "Já feitas" });
      fireEvent.click(optFeitas);
      expect(screen.getByText("Cetoacidose diabética")).toBeTruthy();
      expect(screen.queryByText("Bronquiolite viral aguda")).toBeNull();

      // Clique em estação disponível chama go("estacao", { id })
      const cardCm = screen.getByRole("button", { name: /Cetoacidose diabética/i });
      fireEvent.click(cardCm);
      expect(go).toHaveBeenCalledWith("estacao", { id: "st-1" });
    });

    it("estação locked fica desativada e mostra 'Plano Pro'; lista vazia mostra mensagem honesta; erro permite tentar de novo", async () => {
      backend.rpc.mockImplementation(async (fn: string) => {
        if (fn === "app_fase2_stations") return STATIONS_DATA;
        throw new Error(`rpc inesperada: ${fn}`);
      });

      render(
        <MemoryRouter>
          <Fase2Stations go={go} />
        </MemoryRouter>
      );

      await screen.findByText("Apendicite aguda");
      const cardLocked = screen.getByRole("button", { name: /Apendicite aguda/i });
      expect(cardLocked).toBeDisabled();
      expect(within(cardLocked).getByText("Plano Pro")).toBeTruthy();

      fireEvent.click(cardLocked);
      expect(go).not.toHaveBeenCalledWith("estacao", { id: "st-3" });

      // Lista vazia
      cleanup();
      backend.rpc.mockImplementation(async (fn: string) => {
        if (fn === "app_fase2_stations") return [];
        throw new Error(`rpc inesperada: ${fn}`);
      });

      render(
        <MemoryRouter>
          <Fase2Stations go={go} />
        </MemoryRouter>
      );

      await screen.findByText("Nenhuma estação aprovada no momento");
      expect(
        screen.getByText(
          "O catálogo de estações práticas da 2ª fase é disponibilizado conforme a revisão médica valida os casos clínicos."
        )
      ).toBeTruthy();

      // Erro do rpc e botão 'Tentar de novo'
      cleanup();
      let shouldFail = true;
      backend.rpc.mockImplementation(async (fn: string) => {
        if (fn === "app_fase2_stations") {
          if (shouldFail) throw new Error("Falha no servidor Supabase.");
          return STATIONS_DATA;
        }
        throw new Error(`rpc inesperada: ${fn}`);
      });

      render(
        <MemoryRouter>
          <Fase2Stations go={go} />
        </MemoryRouter>
      );

      await screen.findByText("Tentar de novo");
      shouldFail = false;
      fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
      await screen.findByText("Cetoacidose diabética");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. ESTAÇÃO (PLAYER - Fase2Player)
  // ---------------------------------------------------------------------------
  describe("Estação (Player - Fase2Player)", () => {
    it("ciclo completo: start -> leitura -> atendimento com impressos -> PEP com marcações -> tela final; sem vazar roteiro do ator", async () => {
      const READING_PAYLOAD = {
        attempt_id: "att-player-01",
        status: "reading",
        server_now: "2026-10-15T12:00:00Z",
        station: {
          id: "st-1",
          name: "Cetoacidose diabética",
          topic: "DM1 descompensado",
          area: "Clínica Médica",
          setting: "Pronto-socorro",
          duration_ms: 600000,
        },
        scene: "Pronto-socorro. Paciente jovem com dor abdominal e náuseas.",
        tasks: "Realizar anamnese, exame físico e solicitar exames complementares.",
        actor_script_secret: "SEGREDO-DO-ATOR", // Campo extra simulado para conferência de segurança
        started_at: "2026-10-15T12:00:00Z",
      };

      const ATTENDING_PAYLOAD = {
        ...READING_PAYLOAD,
        status: "attending",
        attendance_started_at: "2026-10-15T12:00:05Z",
        pressings: [
          { id: "pr-1", name: "Gasometria venosa", content: "pH 7.15, HCO3 8" },
          { id: "pr-2", name: "Glicemia capilar", content: "Glicemia 480 mg/dL" },
        ],
      };

      const SCORING_PAYLOAD = {
        ...ATTENDING_PAYLOAD,
        status: "scoring",
        attendance_ended_at: "2026-10-15T12:10:05Z",
        checklist: [
          {
            order: 1,
            phase: "Apresentação",
            content: "Apresenta-se ao paciente e pede permissão.",
            max: 4.0,
            partial: null,
          },
          {
            order: 2,
            phase: "Conduta",
            content: "Prescreve hidratação venosa vigorosa.",
            max: 6.0,
            partial: 3.0,
          },
        ],
      };

      const DONE_PAYLOAD = {
        attempt_id: "att-player-01",
        status: "done",
        station: READING_PAYLOAD.station,
        result: {
          score: 7.0,
          max_score: 10.0,
          score10: 7.0,
          finished_at: "2026-10-15T12:12:00Z",
          marks: [
            { order: 1, phase: "Apresentação", content: "Item 1", grade: "correct", points: 4.0, max: 4.0 },
            { order: 2, phase: "Conduta", content: "Item 2", grade: "partial", points: 3.0, max: 6.0 },
          ],
        },
        actor_script_secret: "SEGREDO-DO-ATOR",
      };

      backend.rpc.mockImplementation(async (fn: string, args: any) => {
        if (fn === "app_fase2_start") {
          expect(args).toEqual({ p_station_id: "st-1" });
          return READING_PAYLOAD;
        }
        if (fn === "app_fase2_begin") {
          expect(args).toEqual({ p_attempt_id: "att-player-01" });
          return ATTENDING_PAYLOAD;
        }
        if (fn === "app_fase2_finish") {
          expect(args).toEqual({ p_attempt_id: "att-player-01" });
          return SCORING_PAYLOAD;
        }
        if (fn === "app_fase2_submit") {
          expect(args).toEqual({
            p_attempt_id: "att-player-01",
            p_marks: { "1": "correct", "2": "partial" },
          });
          return DONE_PAYLOAD;
        }
        throw new Error(`rpc inesperada: ${fn}`);
      });

      render(
        <MemoryRouter initialEntries={["/estacao?id=st-1"]}>
          <Fase2Player go={go} />
        </MemoryRouter>
      );

      // ETAPA 1: Leitura
      await screen.findByText("Cenário de atuação");
      expect(screen.getByText("Pronto-socorro. Paciente jovem com dor abdominal e náuseas.")).toBeTruthy();

      // Aba de tarefas
      const tabTarefas = screen.getByRole("button", { name: /Tarefas/i });
      fireEvent.click(tabTarefas);
      expect(screen.getByText("Realizar anamnese, exame físico e solicitar exames complementares.")).toBeTruthy();

      // Não mostra impressos nem checklist na leitura
      expect(screen.queryByRole("button", { name: /Impressos/i })).toBeNull();
      expect(screen.queryByText("Padrão Esperado de Procedimentos")).toBeNull();
      expect(document.body.textContent).not.toContain("SEGREDO-DO-ATOR");

      // Iniciar atendimento
      const btnBegin = screen.getByRole("button", { name: /Iniciar atendimento/i });
      fireEvent.click(btnBegin);

      // ETAPA 2: Atendimento
      await screen.findByRole("button", { name: /Impressos \(2\)/i });
      const tabImpressos = screen.getByRole("button", { name: /Impressos \(2\)/i });
      fireEvent.click(tabImpressos);

      // Cada impresso começa fechado (conteúdo ausente)
      expect(screen.getByText("Gasometria venosa")).toBeTruthy();
      expect(screen.queryByText("pH 7.15, HCO3 8")).toBeNull();

      // Solicitar impresso revela o conteúdo
      const btnSolicitar = screen.getAllByRole("button", { name: /Solicitar este impresso/i })[0];
      fireEvent.click(btnSolicitar);
      expect(screen.getByText("pH 7.15, HCO3 8")).toBeTruthy();

      // Encerrar atendimento com confirmação
      const btnFinish = screen.getByRole("button", { name: /Encerrar atendimento e abrir o PEP/i });
      fireEvent.click(btnFinish);
      expect(window.confirm).toHaveBeenCalled();

      // ETAPA 3: Avaliação PEP (scoring)
      await screen.findByText("Padrão Esperado de Procedimentos");
      const btnSubmit = screen.getByRole("button", { name: /Concluir e ver a nota/i });

      // Botão desativado até marcar todos os itens
      expect(btnSubmit).toBeDisabled();

      // Item 1 sem partial (não tem botão Parcial)
      const groupItem1 = screen.getByRole("radiogroup", { name: "Item 1" });
      expect(within(groupItem1).queryByRole("radio", { name: "Parcial" })).toBeNull();
      const radioAdequado1 = within(groupItem1).getByRole("radio", { name: "Adequado" });

      // Item 2 com partial (tem botão Parcial)
      const groupItem2 = screen.getByRole("radiogroup", { name: "Item 2" });
      const radioParcial2 = within(groupItem2).getByRole("radio", { name: "Parcial" });

      // Marca item 1
      fireEvent.click(radioAdequado1);
      expect(btnSubmit).toBeDisabled(); // ainda falta o item 2

      // Marca item 2
      fireEvent.click(radioParcial2);
      expect(btnSubmit).not.toBeDisabled();

      // Conclui e submete
      fireEvent.click(btnSubmit);

      // ETAPA 4: Tela Final (done)
      await screen.findByText("Resultado oficial da estação");
      // Nota que veio do servidor
      expect(screen.getByText("7")).toBeTruthy();
      expect(screen.getByText("Pontuação total: 7 de 10 pontos")).toBeTruthy();

      // Roteiro do ator nunca apareceu
      expect(document.body.textContent).not.toContain("SEGREDO-DO-ATOR");
    });

    it("erro do rpc mostra mensagem em português", async () => {
      backend.rpc.mockImplementation(async () => {
        throw new Error("Estação não encontrada ou ainda sem aprovação médica.");
      });

      render(
        <MemoryRouter initialEntries={["/estacao?id=st-inexistente"]}>
          <Fase2Player go={go} />
        </MemoryRouter>
      );

      await screen.findByText(/Estação não encontrada ou ainda sem aprovação médica/);
      expect(screen.getByRole("button", { name: "Voltar ao banco de estações" })).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. MEUS PEPS (Fase2Peps)
  // ---------------------------------------------------------------------------
  describe("Meus PEPs (Fase2Peps)", () => {
    it("vazio mostra aviso honesto e botão para o banco de estações", async () => {
      backend.rpc.mockImplementation(async (fn: string) => {
        if (fn === "app_fase2_peps") return [];
        if (fn === "app_fase2_performance") return { count: 0 };
        if (fn === "app_dupla_history") return [];
        throw new Error(`rpc inesperada: ${fn}`);
      });

      render(
        <MemoryRouter>
          <Fase2Peps go={go} />
        </MemoryRouter>
      );

      await screen.findByText("Você ainda não tem estações avaliadas");
      const btnBanco = screen.getByRole("button", { name: /Ir para o banco de estações/i });
      fireEvent.click(btnBanco);
      expect(go).toHaveBeenCalledWith("estacoes");
    });

    it("com lista mostra origem Sozinho/Em dupla, nota formatada; Sozinho abre a tentativa e Em dupla abre o resultado", async () => {
      backend.rpc.mockImplementation(async (fn: string) => {
        if (fn === "app_fase2_peps") {
          return [
            {
              id: "att-solo-01",
              origin: "solo",
              station_id: "st-cm",
              name: "Cetoacidose diabética",
              area: "Clínica Médica",
              at: "2026-10-15T14:00:00Z",
              score10: 8.5,
            },
            {
              id: "sess-dupla-02",
              origin: "dupla",
              station_id: "st-ped",
              name: "Bronquiolite viral aguda",
              area: "Pediatria",
              at: "2026-10-14T10:00:00Z",
              score10: 7.0,
            },
          ];
        }
        if (fn === "app_fase2_performance") return { count: 2 };
        // a linha "dupla" do app_fase2_peps é ignorada: as rodadas em dupla vêm do histórico (013400)
        if (fn === "app_dupla_history") {
          return [
            {
              room_id: "sala-1", round: 1, role: "candidate", status: "concluida", revised: false, finished_at: "2026-10-14T10:00:00Z",
              partner: { public_name: "Bruno" },
              station: { number: 4, area: "Pediatria", area_code: "PED", name: "Bronquiolite viral aguda", edition: "2020" },
              score: 7, max_score: 10, pct: 70,
            },
          ];
        }
        throw new Error(`rpc inesperada: ${fn}`);
      });

      render(
        <MemoryRouter>
          <Fase2Peps go={go} />
        </MemoryRouter>
      );

      await screen.findByText("Meus PEPs");

      // Badges de origem
      expect(screen.getByText("Sozinho")).toBeTruthy();
      expect(screen.getByText("Em dupla")).toBeTruthy();

      // Notas formatadas com vírgula
      expect(screen.getByText("8,5")).toBeTruthy();
      expect(screen.getByText("7")).toBeTruthy();

      // Linha 'Sozinho' é clicável e abre a tentativa
      const rowSolo = screen.getByRole("button", { name: /Cetoacidose diabética/i });
      expect(rowSolo).not.toBeDisabled();
      fireEvent.click(rowSolo);
      expect(go).toHaveBeenCalledWith("estacao", { tentativa: "att-solo-01" });

      // Linha 'Em dupla' liberada abre o resultado da rodada (só leitura)
      const rowDupla = screen.getByRole("button", { name: /Bronquiolite viral aguda/i });
      expect(rowDupla).not.toBeDisabled();
      expect(screen.getAllByText(/Bronquiolite viral aguda/)).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. DESEMPENHO PRÁTICO (Fase2Performance)
  // ---------------------------------------------------------------------------
  describe("Desempenho prático (Fase2Performance)", () => {
    it("vazio mostra 'Ainda não há estações avaliadas'", async () => {
      backend.rpc.mockImplementation(async (fn: string) => {
        if (fn === "app_fase2_performance") {
          return { count: 0 };
        }
        throw new Error(`rpc inesperada: ${fn}`);
      });

      render(
        <MemoryRouter>
          <Fase2Performance go={go} />
        </MemoryRouter>
      );

      await screen.findByText("Ainda não há estações avaliadas");
      expect(
        screen.getByText(
          "Faça uma estação no banco e pontue pelo PEP para visualizar sua evolução prática e estatísticas por grande área."
        )
      ).toBeTruthy();
    });

    it("com dados mostra média, melhor nota, áreas e 'Onde você perde pontos'; sem variação inventada", async () => {
      backend.rpc.mockImplementation(async (fn: string) => {
        if (fn === "app_fase2_performance") {
          return {
            count: 5,
            avg_score10: 8.2,
            best_score10: 9.5,
            by_area: [
              { area: "Clínica Médica", count: 3, avg_score10: 8.5 },
              { area: "Pediatria", count: 2, avg_score10: 7.8 },
            ],
            evolution: [
              { at: "2026-10-10T10:00:00Z", score10: 7.0 },
              { at: "2026-10-12T10:00:00Z", score10: 8.0 },
              { at: "2026-10-15T10:00:00Z", score10: 9.5 },
            ],
            by_phase: [
              { phase: "Anamnese", earned: 15, max: 20, pct: 75 },
              { phase: "Conduta", earned: 10, max: 20, pct: 50 },
            ],
            lost_items: [
              { phase: "Conduta", content: "Prescrever hidratação com soro fisiológico", lost: 4.0, times: 2 },
            ],
          };
        }
        throw new Error(`rpc inesperada: ${fn}`);
      });

      render(
        <MemoryRouter>
          <Fase2Performance go={go} />
        </MemoryRouter>
      );

      await screen.findByText("Estações avaliadas");
      expect(screen.getAllByText("8,2").length).toBeGreaterThan(0);
      expect(screen.getAllByText("9,5").length).toBeGreaterThan(0);
      expect(screen.getByText("Nota por grande área")).toBeTruthy();
      expect(screen.getByText("Onde você perde pontos")).toBeTruthy();
      expect(screen.getByText("Prescrever hidratação com soro fisiológico")).toBeTruthy();

      // Sem texto inventado de variação como 'no último mês'
      expect(document.body.textContent).not.toMatch(/no último mês/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. PACIENTE SIMULADO (Fase2Patient)
  // ---------------------------------------------------------------------------
  describe("Paciente simulado (Fase2Patient)", () => {
    it("mostra 'Em breve', NÃO tem campo de texto nem botão de enviar, e NÃO chama backend.rpc nem fetch", () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      render(
        <MemoryRouter>
          <Fase2Patient go={go} />
        </MemoryRouter>
      );

      expect(screen.getByText("Paciente simulado com IA")).toBeTruthy();
      expect(screen.getByText("Em breve")).toBeTruthy();
      expect(
        screen.getByText(
          "Em breve você poderá treinar a anamnese conversando com um paciente simulado. Esta função ainda não está ligada."
        )
      ).toBeTruthy();

      // Sem campos interativos de envio
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByRole("button", { name: /enviar/i })).toBeNull();

      // Sem chamadas de rede
      expect(backend.rpc).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. TEORIA (Fase2Theory)
  // ---------------------------------------------------------------------------
  describe("Teoria (Fase2Theory)", () => {
    it("mostra 'Em preparação', NÃO contém termos do protótipo e cartões chamam temas, atualizacoes e questoes", () => {
      render(
        <MemoryRouter>
          <Fase2Theory go={go} />
        </MemoryRouter>
      );

      expect(screen.getByText("Teoria para a prática")).toBeTruthy();
      expect(screen.getByText("Em preparação")).toBeTruthy();
      expect(screen.getByText("Este material só será publicado depois da revisão médica.")).toBeTruthy();

      // Não contém termos do protótipo
      const bodyText = document.body.textContent || "";
      expect(bodyText).not.toContain("Zuspan");
      expect(bodyText).not.toContain("Pritchard");
      expect(bodyText).not.toContain("SPIKES");
      expect(bodyText).not.toContain("ATLS");
      expect(bodyText).not.toContain("sulfato de magnésio");

      // Links direcionam para a 1ª fase
      const btnTemas = screen.getByRole("button", { name: /Abrir temas/i });
      fireEvent.click(btnTemas);
      expect(go).toHaveBeenCalledWith("temas");

      const btnAtualizacoes = screen.getByRole("button", { name: /Abrir diretrizes/i });
      fireEvent.click(btnAtualizacoes);
      expect(go).toHaveBeenCalledWith("atualizacoes");

      const btnQuestoes = screen.getByRole("button", { name: /Abrir questões/i });
      fireEvent.click(btnQuestoes);
      expect(go).toHaveBeenCalledWith("questoes");
    });
  });

  // ---------------------------------------------------------------------------
  // 8. ACESSIBILIDADE MÍNIMA
  // ---------------------------------------------------------------------------
  describe("Acessibilidade mínima", () => {
    it("o cronômetro tem role='timer' e os grupos de marcação têm aria-label='Item N'", async () => {
      backend.rpc.mockImplementation(async (fn: string) => {
        if (fn === "app_fase2_start") {
          return {
            attempt_id: "att-a11y-01",
            status: "scoring",
            station: { id: "st-1", name: "Estação A11y", area: "Clínica Médica", duration_ms: 600000 },
            checklist: [
              { order: 1, phase: "Apresentação", content: "Item 1", max: 5.0, partial: null },
              { order: 2, phase: "Conduta", content: "Item 2", max: 5.0, partial: 2.5 },
            ],
          };
        }
        throw new Error(`rpc inesperada: ${fn}`);
      });

      render(
        <MemoryRouter initialEntries={["/estacao?id=st-1"]}>
          <Fase2Player go={go} />
        </MemoryRouter>
      );

      // Cronômetro com role="timer"
      const timer = await screen.findByRole("timer");
      expect(timer).toBeTruthy();

      // Grupos de marcação com aria-label="Item N"
      const item1Group = screen.getByRole("radiogroup", { name: "Item 1" });
      expect(item1Group).toBeTruthy();

      const item2Group = screen.getByRole("radiogroup", { name: "Item 2" });
      expect(item2Group).toBeTruthy();
    });
  });
});
