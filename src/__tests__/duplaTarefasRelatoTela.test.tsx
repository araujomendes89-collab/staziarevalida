/**
 * Treino em Dupla · decisão (b) do dono de 17/10 na sala: com o relato do caso na folha do candidato, as tarefas citam
 * "o relato do caso clínico (na sua folha, acima)" e "orientação do relato do caso", na folha em texto do candidato e no painel
 * do avaliador. Sem o relato na folha, o texto sai como está. Servidor simulado (helpers/duplaSala); estação de teste.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NOW, advance, asCandidate, baseRoom, contentOf, serve, type Srv } from "./helpers/duplaSala";

const rpc = vi.fn();
const backend: any = { rpc, accessToken: async () => "token-de-teste" };
const session: any = { backend, user: { id: "u-ana" }, dupla: { aberto: true, permitido: true } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/dupla/sound.js", () => ({ playWhistle: () => undefined, installAudioWake: () => undefined }));

import { RoomScreen } from "../novo/app/dupla/room/RoomScreen.jsx";

// texto das tarefas como o da estação de teste da leucemia (INEP 2020, e01)
const TAREFAS =
  "1. ler o impresso 1 (relato do caso clínico presente sobre a mesa do consultório);\n2. receber o paciente;\n3. realizar exame físico específico, conforme orientação do impresso 1;\n4. responder aos questionamentos do paciente simulado.";
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
const running = () => baseRoom({ phase: "running", started_at: NOW, ends_at: at(400000) });
let srv: Srv;

function comTarefas(c: any, semRelato = false) {
  const pressings = semRelato ? c.pressings.filter((p: any) => !p.initially_visible) : c.pressings;
  return { ...c, station: { ...c.station, doctor_tasks: TAREFAS }, pressings };
}

async function mount() {
  render(<RoomScreen roomId="r1" go={vi.fn()} />);
  await advance(0);
  await advance(0);
  await advance(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
  window.localStorage.clear();
  window.sessionStorage.clear();
  srv = { room: running(), content: comTarefas(contentOf("evaluator")), marks: [], result: null, steps: {} };
  serve(rpc, srv);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("tarefas com o relato na folha (decisão do dono de 17/10)", () => {
  it("candidato: a folha em texto cita o relato, não o impresso 1", async () => {
    srv.room = asCandidate(running());
    srv.content = comTarefas(contentOf("candidate"));
    await mount();
    expect(screen.getByText("ler o relato do caso clínico (na sua folha, acima);")).toBeTruthy();
    expect(screen.getByText("realizar exame físico específico, conforme orientação do relato do caso;")).toBeTruthy();
    expect(document.body.textContent).not.toContain("ler o impresso 1");
  });

  it("avaliador: o painel mostra as tarefas como o candidato lê", async () => {
    await mount();
    expect(screen.getByText("ler o relato do caso clínico (na sua folha, acima);")).toBeTruthy();
    expect(screen.getByText("realizar exame físico específico, conforme orientação do relato do caso;")).toBeTruthy();
  });

  it("sem o relato na folha: as tarefas saem como no documento oficial", async () => {
    srv.room = asCandidate(running());
    srv.content = comTarefas(contentOf("candidate"), true);
    await mount();
    expect(screen.getByText("ler o impresso 1 (relato do caso clínico presente sobre a mesa do consultório);")).toBeTruthy();
    expect(screen.getByText("realizar exame físico específico, conforme orientação do impresso 1;")).toBeTruthy();
  });
});
