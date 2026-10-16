/**
 * Treinamento em Dupla · etapa 3 · tarefa 9: a sala desenhada a partir da fase gravada (sem tempo real, sem ações).
 * `backend.rpc` é simulado por função, como o banco devolve (RoomState, RoomContent, marcações e ResultData do plano).
 * Pessoas, estações e notas daqui são SÓ de teste.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const rpc = vi.fn();
const backend = { rpc };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend }) }));

import { RoomScreen } from "../novo/app/dupla/room/RoomScreen.jsx";

const ROOT = path.resolve(__dirname, "../..");

const NOW = "2026-10-11T15:00:00.000Z";

const STATION = {
  id: "teste-dupla-e01", name: "Estação de teste", area: "Clínica Médica", area_code: "CM", number: 3,
  edition: "2020", reapplication: false, institution: "INEP", duration_ms: 600000, is_pro_only: false,
};

function roomState(over: Record<string, any> = {}) {
  return {
    id: "r1", rev: 3, phase: "roles", round: 1, server_now: NOW,
    station: STATION, duration_ms: 600000,
    me: { user_id: "u-ana", public_name: "Ana Souza", role: null, confirmed: false, connected: false, ready: false },
    partner: { user_id: "u-bruno", public_name: "Bruno Lima", role: null, confirmed: false, connected: false, ready: false, seen_ms_ago: 2000 },
    match_note: null, invite_pending: false, call_link: null,
    started_at: null, ends_at: null, paused_left_ms: null, paused_at: null, finished_at: null,
    released_pressings: [], closed_reason: null, closed_by: null,
    ...over,
  };
}

// Etapa P (012900): o candidato (e quem ainda não tem papel) recebe a estação sem o nome e sem o id, com "label".
const { id: _id, name: _name, ...SEM_TEMA } = STATION;
const CAND_STATION = { ...SEM_TEMA, label: "Estação 3" };

const roles = (me: "candidate" | "evaluator" | null, over: Record<string, any> = {}) =>
  roomState({
    station: me === "evaluator" ? STATION : CAND_STATION,
    ...over,
    me: { ...roomState().me, role: me, ...(over.me || {}) },
    partner: { ...roomState().partner, role: me ? (me === "candidate" ? "evaluator" : "candidate") : null, ...(over.partner || {}) },
  });

const ITEMS = [
  {
    id: "i1", order: 1, content: "Item um", tip: "Dica um",
    grades: { correct: 2.5, partial: 1.25, incorrect: 0 },
    criteria: { correct: "Adequado um", partial: "Parcial um", incorrect: "Inadequado um" }, subitems: [],
  },
  {
    id: "i2", order: 2, content: "Item dois", tip: "",
    grades: { correct: 2.5, partial: null, incorrect: 0 },
    criteria: { correct: "Adequado dois", incorrect: "Inadequado dois" }, subitems: [],
  },
  {
    id: "i3", order: 3, content: "Item três", tip: "Dica três",
    grades: { correct: 5, partial: 2.5, incorrect: 0 },
    criteria: { correct: "Adequado três", partial: "Parcial três", incorrect: "Inadequado três" },
    subitems: [{ id: "s1", text: "Subitem um" }, { id: "s2", text: "Subitem dois" }],
  },
];

const SCENE = "Cenário de teste, bloco um.\n\nCenário de teste, bloco dois.";
const TASKS = "1. Fazer a anamnese.\n2. Pedir exames.";
const SCRIPT = "Dados pessoais:\nPaciente de teste, 40 anos.\n\nSó se perguntado:\nNenhuma alergia conhecida.";

const minimal = { id: STATION.id, name: STATION.name, label: "Estação 3", area: STATION.area, area_code: "CM", number: 3, duration_ms: 600000 };
const { id: _mid, name: _mname, ...minimalCand } = minimal;

/** `initial`: com um impresso inicial (relato) visível desde o início, fora da contagem e da liberação. */
function contentFor(role: "candidate" | "evaluator" | null, released: string[] = [], initial = false) {
  if (!role) return { role: null, station: minimalCand, pressing_count: 2, pressings: [] };
  const relato = { id: "p0", index: 1, display_number: 1, source_number: 1, initially_visible: true, name: "Relato do caso", content: "Relato inicial de teste.", has_image: false };
  const all = [
    ...(initial ? [relato] : []),
    { id: "p1", index: initial ? 2 : 1, display_number: 1, source_number: initial ? 2 : 1, initially_visible: false, name: "Hemograma", content: "Hb 9,0 g/dL\n\nLiberação: quando o candidato pedir o hemograma.", has_image: false },
    { id: "p2", index: initial ? 3 : 2, display_number: 2, source_number: initial ? 3 : 2, initially_visible: false, name: "Imagem de tórax", content: "Radiografia de tórax.", has_image: true },
  ];
  if (role === "candidate") {
    // o servidor manda ao candidato a chave de tela ('i<n>' inicial, 'd<n>' liberável), sem source_number
    const key = (p: any) => (p.initially_visible ? "i" : "d") + p.display_number;
    return {
      role,
      station: { ...minimalCand, version: "1.0", doctor_scene: SCENE, doctor_tasks: TASKS, candidate_sheet: { has_image: false } },
      pressing_count: 2,
      pressings: all
        .filter((p) => p.initially_visible || released.includes(key(p)))
        .map(({ source_number: _s, index: _i, ...p }) => ({ ...p, id: key(p), content: p.content.replace(/\n\nLiberação:.*$/s, "") })),
    };
  }
  return {
    role,
    station: { ...minimal, version: "1.0", doctor_scene: SCENE, doctor_tasks: TASKS, actor_script: SCRIPT },
    pressing_count: 2,
    pressings: all,
    checklist_items: ITEMS,
  };
}

const RESULT = {
  round: 1, viewer: "candidate",
  station: { ...STATION },
  score: 3.75, max_score: 10, pct: 38, previous_pct: 32,
  items: [
    { id: "i1", order: 1, content: "Item um", max_points: 2.5, grade: "correct", points: 2.5 },
    { id: "i2", order: 2, content: "Item dois", max_points: 2.5, grade: "incorrect", points: 0 },
    { id: "i3", order: 3, content: "Item três", max_points: 2.5, grade: "partial", points: 1.25 },
    { id: "i4", order: 4, content: "Item quatro", max_points: 2.5, grade: null, points: 0 },
  ],
  evaluator: { user_id: "u-bruno", public_name: "Bruno Lima" },
  candidate: { user_id: "u-ana", public_name: "Ana Souza" },
  finished_at: "2026-10-11T15:07:32.000Z", used_ms: 452000,
  feedback: { pos: "Boa comunicação.", neg: "", gen: "Organize o raciocínio." },
  review: { requested_at: null, reason: null, revised_at: null, score_before_review: null },
};

type Scenario = { room: any; content?: any; marks?: any[]; result?: any; stations?: any[] };
function serve(s: Scenario) {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_dupla_room") return s.room;
    if (fn === "app_dupla_room_content") return s.content ?? contentFor(null);
    if (fn === "app_dupla_marks") return s.marks ?? [];
    if (fn === "app_dupla_result") return s.result ?? RESULT;
    if (fn === "app_dupla_stations") return s.stations ?? [];
    if (fn === "app_dupla_heartbeat") return { server_now: NOW };
    throw new Error("função não esperada: " + fn);
  });
}

async function mount(s: Scenario, go = vi.fn()) {
  serve(s);
  const view = render(<RoomScreen roomId="r1" go={go} />);
  await waitFor(() => expect(view.container.querySelector("[aria-busy='true']")).toBeNull());
  return { ...view, go };
}

beforeEach(() => {
  rpc.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => cleanup());

describe("Sala: fases a partir do estado gravado", () => {
  it("papéis: nomes, faixa do match, 'Aguardando Bruno Lima entrar na sala', Escolher e Trocar estação", async () => {
    const note = "Definido pelo match: você quer ser médico(a) e Bruno topa qualquer papel. Vocês ainda podem trocar.";
    await mount({ room: roles("candidate", { match_note: note, invite_pending: true }), content: contentFor("candidate") });
    expect(screen.getByText("Dupla com Bruno Lima")).toBeTruthy();
    // candidato: "Estação 3 · Clínica Médica", nunca o nome da estação
    expect(screen.getByText(/Estação 3 · Clínica Médica · Revalida 2020 · INEP\./)).toBeTruthy();
    expect(document.body.textContent).not.toContain("Estação de teste");
    expect(screen.getByText(/Antes de conectar, definam quem será o candidato e quem será o ator\/avaliador\./)).toBeTruthy();
    expect(screen.getByText(note)).toBeTruthy();
    expect(screen.getByText("Aguardando Bruno Lima entrar na sala")).toBeTruthy();
    expect(screen.getByText("Papéis desta rodada")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sortear" })).toBeTruthy();
    // marcado = meu papel
    expect(screen.getByRole("button", { name: /^Candidato/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Ator\/Avaliador/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/^Bruno Lima será/).textContent).toBe("Bruno Lima será Ator/Avaliador.");
    // só o avaliador escolhe ou troca a estação
    expect(screen.queryByRole("button", { name: "Trocar estação" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Escolher estação" })).toBeNull();
    expect(screen.getByRole("button", { name: "Confirmar papéis e conectar" })).toBeTruthy();
    cleanup();

    // candidato sem estação: aguarda o avaliador escolher
    await mount({ room: roles("candidate", { station: null }), content: contentFor(null) });
    expect(screen.getByText("Aguardando Bruno escolher a estação.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Escolher estação" })).toBeNull();
    cleanup();

    // avaliador: Trocar estação com o nome
    await mount({ room: roles("evaluator"), content: contentFor(null) });
    expect(screen.getByText(/Estação 3 · Estação de teste · Revalida 2020 · INEP\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Trocar estação" })).toBeTruthy();
    cleanup();

    // sem estação, sem papéis, sem convite pendente e sem faixa do match
    await mount({ room: roles(null, { station: null }), content: contentFor(null) });
    expect(screen.getByText("Definam os papéis antes de escolher a estação.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Escolher estação" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Trocar estação" })).toBeNull();
    expect(screen.queryByText(/^Bruno Lima será/)).toBeNull();
    expect(screen.queryByText(/Aguardando Bruno Lima entrar/)).toBeNull();
    expect(screen.queryByText(/Definido pelo match/)).toBeNull();
    expect(screen.queryByText(/^Estação \d/)).toBeNull();
    cleanup();

    // confirmado por mim
    await mount({ room: roles("evaluator", { me: { confirmed: true } }), content: contentFor(null) });
    expect(screen.getByText("Aguardando Bruno Lima confirmar os papéis")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmar papéis e conectar" })).toBeNull();
  });

  it("papéis: o seletor de estação lista por área 'Estação {n} · {nome}', busca e escolhe", async () => {
    const stations = [
      { id: "s1", name: "Dor torácica", topic: "Cardiologia", area: "Clínica Médica", area_code: "CM", number: 3 },
      { id: "s2", name: "Apendicite", topic: "Abdome", area: "Cirurgia Geral", area_code: "CR", number: 7 },
      { id: "s3", name: "Estação autoral", topic: "Autoral", area: "Pediatria", area_code: "PED", number: null },
    ];
    await mount({ room: roles("evaluator", { station: null }), content: contentFor(null), stations });
    fireEvent.click(screen.getByRole("button", { name: "Escolher estação" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Estação 3 · Dor torácica")).toBeTruthy();
    expect(within(dialog).getByText("Estação 7 · Apendicite")).toBeTruthy();
    expect(within(dialog).getByText("Estação autoral")).toBeTruthy();
    expect(within(dialog).getByText("Clínica Médica")).toBeTruthy();
    expect(within(dialog).getByText("Cirurgia")).toBeTruthy();
    fireEvent.change(within(dialog).getByPlaceholderText("Buscar por estação, tema ou queixa"), { target: { value: "apend" } });
    expect(within(dialog).queryByText("Estação 3 · Dor torácica")).toBeNull();
    expect(within(dialog).getByText("Estação 7 · Apendicite")).toBeTruthy();
    fireEvent.change(within(dialog).getByPlaceholderText("Buscar por estação, tema ou queixa"), { target: { value: "zzz" } });
    expect(within(dialog).getByText("Nenhuma estação encontrada")).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("app_dupla_stations");
  });

  it("conexão: 5 etapas com 'Sincronizando com Bruno Lima' e Sair da sala", async () => {
    await mount({ room: roles("candidate", { phase: "connecting" }), content: contentFor("candidate") });
    expect(screen.getByText("Preparando a sala…")).toBeTruthy();
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(5);
    // a estação já está no estado; o acesso (sessão) ainda não foi conferido aqui (os eventos são testados em duplaSalaPreparo)
    expect(steps.map((s) => s.getAttribute("data-state"))).toEqual(["done", "run", "todo", "todo", "todo"]);
    expect(screen.getByText("Carregando a estação")).toBeTruthy();
    expect(screen.getByText("Validando acesso")).toBeTruthy();
    expect(screen.getByText("Separando conteúdo por papel")).toBeTruthy();
    expect(screen.getByText("Criando sala privada")).toBeTruthy();
    expect(screen.getByText("Sincronizando com Bruno Lima")).toBeTruthy();
    expect(screen.getByText("20%")).toBeTruthy();
    expect(screen.getByText("Você e Bruno")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sair da sala" })).toBeTruthy();
  });

  it("preparação: só a prontidão; avaliador abre a sala do avaliador com os dois prontos; candidato vê 'Só o avaliador inicia'", async () => {
    // avaliador
    await mount({ room: roles("evaluator", { phase: "setup" }), content: contentFor("evaluator") });
    expect(screen.getByText("Sala com Bruno Lima")).toBeTruthy();
    expect(screen.getByText("Confirmem a prontidão para iniciar a estação.")).toBeTruthy();
    expect(screen.getByText("Aguardando prontidão")).toBeTruthy();
    expect(screen.getByText("Papéis definidos")).toBeTruthy();
    expect(screen.getByText(/Você é/).textContent).toBe("Você é Ator/Avaliador · Bruno Lima é Candidato");
    expect(screen.getByText("1. Prontidão")).toBeTruthy();
    expect(screen.getByText("Ana Souza (você)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Estou pronto para iniciar" })).toBeTruthy();
    // sem link da chamada (D3), sem leitura prévia e sem cronômetro na preparação (vai ao rodapé da sala do avaliador)
    expect(screen.queryByLabelText("Link da reunião")).toBeNull();
    expect(screen.queryByText("Leitura prévia do avaliador")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reduzir 30 segundos" })).toBeNull();
    expect(screen.queryByText("Paciente de teste, 40 anos.")).toBeNull();
    expect(screen.getByText("Aguardando os dois confirmarem prontidão")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Abrir sala do avaliador" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Iniciar estação" })).toBeNull();
    cleanup();

    // candidato
    await mount({ room: roles("candidate", { phase: "setup", me: { ready: true } }), content: contentFor("candidate") });
    expect(screen.getByText("Só o avaliador inicia")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pronto · aguardando o colega" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Abrir sala do avaliador" })).toBeNull();
    expect(screen.queryByText("Paciente de teste, 40 anos.")).toBeNull();
    expect(screen.queryByText("Cenário de teste, bloco um.")).toBeNull();
    cleanup();

    // os dois prontos: selo some e o avaliador abre a sala do avaliador
    await mount({ room: roles("evaluator", { phase: "setup", me: { ready: true }, partner: { ready: true } }), content: contentFor("evaluator") });
    expect(screen.queryByText("Aguardando prontidão")).toBeNull();
    expect(screen.getByText("Prontidão confirmada. Entre na sala do avaliador para controlar o cronômetro.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Abrir sala do avaliador" }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();

    await mount({ room: roles("candidate", { phase: "setup", me: { ready: true }, partner: { ready: true } }), content: contentFor("candidate") });
    expect(screen.getByText("Dupla conectada. Aguardando Bruno (avaliador) iniciar a estação…")).toBeTruthy();
  });

  it("sem link da chamada em nenhuma fase (os dois conversam fora do app)", async () => {
    for (const phase of ["setup", "running"]) {
      for (const me of ["evaluator", "candidate"] as const) {
        await mount({ room: roles(me, { phase, ends_at: "2026-10-11T15:04:07.000Z" }), content: contentFor(me) });
        expect(screen.queryByLabelText("Link da reunião")).toBeNull();
        expect(screen.queryByRole("button", { name: /Chamada|Abrir chamada|Compartilhar link/ })).toBeNull();
        cleanup();
      }
    }
  });

  it("estação: avaliador com PEP e impressos; candidato sem roteiro, sem PEP e com 'Aguardando liberação'", async () => {
    const running = { phase: "running", started_at: "2026-10-11T14:55:00.000Z", ends_at: "2026-10-11T15:04:07.000Z", released_pressings: ["p1"] };
    // avaliador
    await mount({ room: roles("evaluator", running), content: contentFor("evaluator") });
    expect(screen.getByRole("heading", { name: "Estação de teste" })).toBeTruthy();
    expect(screen.getByText("Clínica Médica · Revalida 2020 · INEP")).toBeTruthy();
    expect(screen.getAllByText("Em andamento").length).toBeGreaterThan(0);
    // o cronômetro do avaliador fica no rodapé (o tempo vem do servidor)
    expect(screen.getByRole("button", { name: /^Ajustar tempo, 04:0[67]$/ })).toBeTruthy();
    for (const t of ["Cenário e tarefas", "Orientações do Ator/Atriz", "Impressos", "Anotações", "Feedback"]) expect(screen.getByRole("button", { name: new RegExp(t) })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Materiais/ })).toBeNull(); // sem resumo, sem Materiais (D9)
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getByText("Paciente de teste, 40 anos.")).toBeTruthy();
    expect(screen.getByPlaceholderText("Anote o que observar durante o atendimento")).toBeTruthy();
    expect(screen.getByText("Anotações ficam só neste aparelho.")).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Item 1" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Item 3" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Checklist PEP" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Estação: cenário, orientações e impressos" })).toBeTruthy();
    expect(screen.queryByText("PEP oficial (INEP)")).toBeNull();
    expect(screen.queryByText("Sinalizar problema")).toBeNull();
    expect(screen.queryByText("TutorIA")).toBeNull();
    expect(screen.getByRole("button", { name: "Pausar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Finalizar estação" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sair da sala" })).toBeTruthy();
    cleanup();

    // candidato: só o 1 liberado, sem a linha "Liberação"; o 2 aguarda
    await mount({ room: roles("candidate", { ...running, released_pressings: ["d1"] }), content: contentFor("candidate", ["d1"]) });
    expect(document.body.textContent).not.toContain("Estação de teste");
    expect(screen.getByRole("heading", { name: "Estação 3 · Clínica Médica" })).toBeTruthy();
    expect(screen.getByText("Enunciado")).toBeTruthy();
    expect(screen.getByText("Cenário de teste, bloco um.")).toBeTruthy();
    expect(screen.getByText("Nos 10 minutos de duração, execute:")).toBeTruthy();
    expect(screen.getByText("01")).toBeTruthy();
    expect(screen.getByText("Fazer a anamnese.")).toBeTruthy();
    expect(screen.getByText("1 liberado")).toBeTruthy();
    expect(screen.getByText("Impresso 1 · Hemograma")).toBeTruthy();
    expect(screen.getByText("Impresso 2 · Aguardando liberação")).toBeTruthy();
    expect(screen.queryByText("Orientações do Ator/Atriz")).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Item 1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pausar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Finalizar estação" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reduzir 1 minuto" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sair da sala" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("Liberação:");
    expect(document.body.textContent).not.toContain("Nenhuma alergia");
  });

  it("estação: pausada, tempo esgotado e cronômetro do candidato escondido só nesta aba", async () => {
    const base = { phase: "running" };
    await mount({ room: roles("evaluator", { ...base, ends_at: null, paused_left_ms: 125000, paused_at: NOW }), content: contentFor("evaluator") });
    expect(screen.getAllByText("Pausada").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Ajustar tempo, 02:05" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retomar" })).toBeTruthy();
    cleanup();

    await mount({ room: roles("evaluator", { ...base, ends_at: "2026-10-11T14:59:00.000Z" }), content: contentFor("evaluator") });
    expect(screen.getAllByText("Tempo esgotado").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Ajustar tempo, 00:00" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pausar" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    await mount({ room: roles("candidate", { ...base, ends_at: "2026-10-11T15:05:00.000Z" }), content: contentFor("candidate") });
    expect(screen.getByRole("timer")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Minimizar cronômetro" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Esconder cronômetro" }));
    expect(window.sessionStorage.getItem("smn-dupla-cron-oculto")).toBe("1");
    expect(screen.queryByRole("timer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar cronômetro" }));
    expect(window.sessionStorage.getItem("smn-dupla-cron-oculto")).toBe("0");
    expect(screen.getByRole("timer")).toBeTruthy();
  });

  it("estação (Etapa P): relato inicial visível ao candidato sem liberação e fora da lista; avaliador vê os números da prova", async () => {
    const running = { phase: "running", started_at: "2026-10-11T14:55:00.000Z", ends_at: "2026-10-11T15:04:07.000Z", released_pressings: [] };
    await mount({ room: roles("candidate", running), content: contentFor("candidate", [], true) });
    expect(screen.getByText("Impresso 1 · Relato do caso")).toBeTruthy();
    expect(screen.getByText("Relato inicial de teste.")).toBeTruthy();
    expect(screen.getByText("Impresso 1 · Aguardando liberação")).toBeTruthy();
    expect(screen.getByText("Impresso 2 · Aguardando liberação")).toBeTruthy();
    expect(screen.getByText("0 liberados")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Estação de teste");
    expect(document.body.textContent).not.toContain("documento oficial");
    cleanup();

    await mount({ room: roles("evaluator", { ...running, released_pressings: ["p1"] }), content: contentFor("evaluator", [], true) });
    expect(screen.getByText("Este impresso já está visível desde o início.")).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy(); // só os liberáveis contam
    expect(screen.getAllByRole("button", { name: /^(Liberar|Ocultar)$/ })).toHaveLength(2); // o relato não tem botão
    expect(screen.getByText("no documento oficial: Impresso 2")).toBeTruthy();
  });

  it("preparação (Etapa P): candidato vê só 'Estação N · Área' e 'O enunciado aparece quando o avaliador iniciar a estação.'", async () => {
    const setup = { phase: "setup", call_link: null };
    await mount({ room: roles("candidate", setup), content: contentFor("candidate", [], true) });
    expect(screen.getByText("Estação 3 · Clínica Médica · Revalida 2020 · INEP")).toBeTruthy();
    expect(screen.getByText("O enunciado aparece quando o avaliador iniciar a estação.")).toBeTruthy();
    expect(screen.queryByText("Leitura prévia do avaliador")).toBeNull();
    expect(screen.getByRole("button", { name: "Sair da sala" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("Estação de teste");
    cleanup();

    await mount({ room: roles("evaluator", setup), content: contentFor("evaluator", [], true) });
    expect(screen.queryByText("Leitura prévia do avaliador")).toBeNull();
    expect(screen.getByRole("button", { name: "Abrir sala do avaliador" })).toBeTruthy();
  });

  it("decisões do dono (16/10): origem sempre visível ao candidato e aviso a quem escolheu a estação e ficou como candidato", async () => {
    // b) a origem "Revalida 2020 · INEP" aparece para o candidato nos papéis, na preparação e na estação; a) nunca o nome
    await mount({ room: roles("candidate", { me: { picked_station: true } }), content: contentFor("candidate") });
    expect(screen.getByText("Estação 3 · Clínica Médica · Revalida 2020 · INEP")).toBeTruthy();
    // c) quem escolheu a estação (Banco de estações ou sala) e está como candidato vê o aviso; o tema não aparece
    expect(screen.getByRole("note").textContent).toBe("Você escolheu esta estação, então já conhece o tema.");
    expect(document.body.textContent).not.toContain("Estação de teste");
    cleanup();

    // os dois escolhem os papéis: o mesmo aviso some se a pessoa passa a ser avaliador, e não aparece a quem não escolheu
    await mount({ room: roles("evaluator", { me: { picked_station: true } }), content: contentFor(null) });
    expect(screen.queryByText("Você escolheu esta estação, então já conhece o tema.")).toBeNull();
    cleanup();
    await mount({ room: roles("candidate", { me: { picked_station: false } }), content: contentFor("candidate") });
    expect(screen.queryByRole("note")).toBeNull();
    cleanup();

    await mount({ room: roles("candidate", { phase: "connecting" }), content: contentFor("candidate") });
    expect(document.body.textContent).not.toContain("Estação de teste");
    cleanup();

    await mount({ room: roles("candidate", { phase: "running", started_at: "2026-10-11T14:55:00.000Z", ends_at: "2026-10-11T15:04:07.000Z" }), content: contentFor("candidate", [], true) });
    expect(screen.getByText("Clínica Médica · Revalida 2020 · INEP")).toBeTruthy();
    // d) impressos 1, 2, 3 contínuos para o candidato; o número da prova (source_number) nunca aparece para ele
    expect(screen.getByText("Impresso 1 · Aguardando liberação")).toBeTruthy();
    expect(screen.getByText("Impresso 2 · Aguardando liberação")).toBeTruthy();
    expect(document.body.textContent).not.toContain("documento oficial");
    expect(document.body.textContent).not.toContain("Estação de teste");
  });

  it("conferência: avaliador com nota provisória e pendentes; candidato com 'Aguardando avaliação' e Sair da sala", async () => {
    const marks = [
      { item_id: "i1", grade: "correct", subitems: [] },
      { item_id: "i2", grade: "incorrect", subitems: [] },
      { item_id: "i3", grade: "partial", subitems: ["s1"] },
    ];
    await mount({ room: roles("evaluator", { phase: "review" }), content: contentFor("evaluator"), marks });
    expect(screen.getByText("Conferência da avaliação")).toBeTruthy();
    expect(screen.getByText("Revise as notas e escreva o feedback antes de liberar o resultado para Bruno.")).toBeTruthy();
    expect(screen.getByText("Nota provisória")).toBeTruthy();
    const provisional = within(screen.getByRole("region", { name: "Nota provisória" }));
    expect(provisional.getByText("5,00")).toBeTruthy();
    expect(provisional.getByText(/10,00 · 50%/)).toBeTruthy();
    expect(screen.getByText("3 de 3 critérios avaliados")).toBeTruthy();
    expect(screen.getByText("Tudo avaliado")).toBeTruthy();
    expect(screen.queryByText("Voltar ao checklist")).toBeNull();
    expect(screen.getByLabelText("Pontos positivos")).toBeTruthy();
    expect(screen.getByLabelText("Pontos para melhorar")).toBeTruthy();
    expect(screen.getByLabelText("Orientações gerais")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Finalizar e liberar resultado" })).toBeTruthy();
    // o item 3 está marcado como Parcial
    const g3 = screen.getByRole("radiogroup", { name: "Nota do critério 3" });
    expect(within(g3).getByRole("radio", { name: /Parcial/ }).getAttribute("aria-checked")).toBe("true");
    cleanup();

    // com pendentes
    await mount({ room: roles("evaluator", { phase: "review" }), content: contentFor("evaluator"), marks: marks.slice(0, 1) });
    expect(screen.getByText("2 pendentes")).toBeTruthy();
    expect(screen.getByText(/2 critérios sem nota\. Serão registrados como não avaliados\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Pendentes/ }));
    expect(screen.queryByText("Item um")).toBeNull();
    expect(screen.getByText("Item dois")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finalizar e liberar resultado" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Finalizar avaliação?")).toBeTruthy();
    expect(within(dialog).getByText(/2 critério\(s\) pendente\(s\) serão registrados como não avaliados\. Depois de finalizada, a nota só muda por solicitação de revisão\./)).toBeTruthy();
    cleanup();

    // candidato (as marcações são só do avaliador: nem são pedidas ao servidor)
    rpc.mockClear();
    await mount({ room: roles("candidate", { phase: "review" }), content: contentFor("candidate", ["p1"]) });
    expect(screen.getByText("Aguardando avaliação")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sair da sala" })).toBeTruthy();
    expect(screen.queryByText("Conferência da avaliação")).toBeNull();
    expect(rpc).not.toHaveBeenCalledWith("app_dupla_marks", expect.anything());
  });

  it("resultado: '3,75', '/ 10,00', '38% de aproveitamento', '+6 p.p. vs. última tentativa (32%)', avaliador e '7 min 32 s'", async () => {
    await mount({ room: roles("candidate", { phase: "result" }), content: contentFor("candidate", ["p1"]), result: RESULT });
    expect(screen.getByText("Resultado da rodada 1")).toBeTruthy();
    expect(screen.getByText("Estação 3 · Clínica Médica")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Estação de teste" })).toBeTruthy();
    expect(screen.getByText("3,75")).toBeTruthy();
    expect(screen.getByText("/ 10,00")).toBeTruthy();
    expect(screen.getByText(/38% de aproveitamento/)).toBeTruthy();
    expect(screen.getByText("+6 p.p. vs. última tentativa (32%)")).toBeTruthy();
    for (const l of ["Adequado", "Parcial", "Inadequado", "Não avaliado"]) expect(screen.getAllByText(l).length).toBeGreaterThan(0);
    expect(screen.getByText("Avaliador")).toBeTruthy();
    expect(screen.getAllByText("Bruno Lima").length).toBeGreaterThan(0);
    expect(screen.getByText("11 de outubro de 2026")).toBeTruthy();
    expect(screen.getByText("7 min 32 s")).toBeTruthy();
    expect(screen.getByText("Escrito por Bruno Lima")).toBeTruthy();
    expect(screen.getByText("Boa comunicação.")).toBeTruthy();
    expect(screen.getByText("Organize o raciocínio.")).toBeTruthy();
    expect(screen.getAllByText("Sem comentários.")).toHaveLength(1);
    expect(screen.getByText("2,50 / 2,50")).toBeTruthy();
    expect(screen.getByText("3,75 / 10,00")).toBeTruthy();
    expect(screen.getByText("6,25 pt perdidos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Encerrar treino" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Treinar novamente — Inverter papéis" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Solicitar revisão da nota" })).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("app_dupla_result", { p_room_id: "r1", p_round: 1 });
    // aba "Com perda de pontos": só o que perdeu ponto
    fireEvent.click(screen.getByRole("tab", { name: /Com perda de pontos/ }));
    expect(screen.queryByText("Item um")).toBeNull();
    expect(screen.getByText("Item dois")).toBeTruthy();
    cleanup();

    // avaliador: sem pedir revisão; sem tentativa anterior, sem comparação
    await mount({
      room: roles("evaluator", { phase: "result" }), content: contentFor("evaluator"),
      result: { ...RESULT, viewer: "evaluator", previous_pct: null, feedback: { pos: "", neg: "", gen: "" } },
    });
    expect(screen.queryByRole("button", { name: "Solicitar revisão da nota" })).toBeNull();
    expect(screen.queryByText(/última tentativa/)).toBeNull();
    expect(screen.getAllByText("Sem comentários.")).toHaveLength(3);
    cleanup();

    // igual e queda
    await mount({ room: roles("candidate", { phase: "result" }), content: contentFor("candidate"), result: { ...RESULT, previous_pct: 38 } });
    expect(screen.getByText(/igual à última tentativa/)).toBeTruthy();
    cleanup();
    await mount({ room: roles("candidate", { phase: "result" }), content: contentFor("candidate"), result: { ...RESULT, previous_pct: 50 } });
    expect(screen.getByText("−12 p.p. vs. última tentativa (50%)")).toBeTruthy();
  });

  it("sala encerrada: os três motivos", async () => {
    // o parceiro saiu
    const { go } = await mount({
      room: roomState({ phase: "closed", closed_reason: "saiu", closed_by: { user_id: "u-bruno", public_name: "Bruno Lima", me: false } }),
    });
    expect(screen.getByText("Treino encerrado por Bruno Lima.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Voltar para Praticar" }));
    expect(go).toHaveBeenCalledWith("dupla");
    expect(rpc).not.toHaveBeenCalledWith("app_dupla_room_content", expect.anything());
    cleanup();

    // convite recusado / vencido
    await mount({ room: roomState({ phase: "closed", closed_reason: "convite_recusado" }) });
    expect(screen.getByText("Bruno Lima não entrou na sala.")).toBeTruthy();
    cleanup();
    await mount({ room: roomState({ phase: "closed", closed_reason: "convite_expirado" }) });
    expect(screen.getByText("Bruno Lima não entrou na sala.")).toBeTruthy();
    cleanup();

    // sem sinal
    await mount({ room: roomState({ phase: "closed", closed_reason: "sem_sinal" }) });
    expect(screen.getByText("Treino encerrado.")).toBeTruthy();
    cleanup();

    // encerrada por mim: volta direto ao Praticar
    const mine = vi.fn();
    serve({ room: roomState({ phase: "closed", closed_reason: "saiu", closed_by: { user_id: "u-ana", public_name: "Ana Souza", me: true } }) });
    render(<RoomScreen roomId="r1" go={mine} />);
    await waitFor(() => expect(mine).toHaveBeenCalledWith("dupla"));
  });

  it("montar de novo em cada fase desenha a mesma fase (o estado vem só do servidor)", async () => {
    const running = { phase: "running", ends_at: "2026-10-11T15:04:07.000Z", released_pressings: ["p1"] };
    const cases: Scenario[] = [
      { room: roles("candidate"), content: contentFor("candidate") },
      { room: roles("evaluator", { phase: "connecting" }), content: contentFor("evaluator") },
      { room: roles("evaluator", { phase: "setup" }), content: contentFor("evaluator") },
      { room: roles("candidate", running), content: contentFor("candidate", ["p1"]) },
      { room: roles("evaluator", running), content: contentFor("evaluator") },
      { room: roles("evaluator", { phase: "review" }), content: contentFor("evaluator"), marks: [{ item_id: "i1", grade: "correct", subitems: [] }] },
      { room: roles("candidate", { phase: "result" }), content: contentFor("candidate"), result: RESULT },
      { room: roomState({ phase: "closed", closed_reason: "sem_sinal" }) },
    ];
    // os identificadores do React (useId) mudam a cada montagem; o resto do desenho tem de ser igual
    // o cronômetro anda (conta a partir do relógio do servidor): "mm:ss" vira "TT"
    const same = (html: string) => html.replace(/«r[0-9a-z]*»|_r_[0-9a-z]+_|:r[0-9a-z]*:/g, "ID").replace(/\d\d:\d\d/g, "TT");
    for (const scenario of cases) {
      const first = await mount(scenario);
      const html = same(first.container.innerHTML);
      expect(html.length).toBeGreaterThan(100);
      first.unmount();
      const second = await mount(scenario);
      expect(same(second.container.innerHTML)).toBe(html);
      cleanup();
    }
  });

  it("erro ao abrir a sala mostra o motivo do servidor e deixa tentar de novo", async () => {
    rpc.mockRejectedValue(new Error("Sala não encontrada."));
    render(<RoomScreen roomId="r1" go={vi.fn()} />);
    expect(await screen.findByText("Sala não encontrada.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
  });
});

describe("Sala: arquivos", () => {
  const FILES = [
    "RoomScreen", "RolesPhase", "ConnectingPhase", "SetupPhase", "RunningPhase", "ReviewPhase", "ResultPhase", "ClosedPhase", "StationPicker", "parts",
    "EvaluatorFooter", "CandidateSheet",
  ].map((n) => `src/novo/app/dupla/room/${n}.jsx`).concat([
    "src/novo/app/dupla/room/useRoom.js", "src/novo/app/dupla/content.js", "src/novo/app/dupla/clock.js", "src/novo/app/dupla/printsApi.js",
    "src/novo/app/dupla/room/sala.css",
  ]);
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

  it("sem cor escrita, sem lucide-react e sem IA", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, f).not.toMatch(/\brgba?\(|\bhsla?\(/);
      expect(src, f).not.toMatch(/lucide-react/);
      expect(src, f).not.toMatch(/server\/ai|maestro/);
    }
  });

  it("toda variável de estilo usada existe nos tokens", () => {
    const tokens = ["base", "colors", "dupla", "effects", "fonts", "semantic", "spacing", "typography"]
      .map((n) => read(`src/novo/ds/tokens/${n}.css`)).join("\n");
    const defined = new Set([...(tokens + read("src/novo/app/dupla/room/sala.css")).matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
    for (const f of FILES) {
      for (const m of read(f).matchAll(/var\((--[a-z0-9-]+)/gi)) {
        expect(defined.has(m[1]), `${f}: ${m[1]}`).toBe(true);
      }
    }
  });
});
