/**
 * Treino em Dupla · Etapa P, Tarefa P6: conferência do vazamento do tema da estação ao candidato.
 * Banco local (PGlite, migrações reais) + tela de verdade: a sala (RoomScreen) recebe as respostas do banco como a pessoa
 * que está logada. O candidato não pode ver, em nenhuma resposta nem em nenhum texto de tela, o nome, o topic, o summary,
 * o caminho no catálogo, o nome de arquivo nem o id da estação, até o resultado. Estação e pessoas daqui são SÓ de teste.
 */
import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { addProfile, addSession, addStation, makeRoom, openDuplaDb, setDupla, setPlan, STATION, U, type DuplaDb, type Phase } from "./helpers/duplaDb";

const quem = { uid: "" };
let d: DuplaDb;
const respostas: unknown[] = [];
const backend = {
  rpc: async (fn: string, args: Record<string, unknown> = {}) => {
    const r = await d.rpc(quem.uid, fn, args);
    respostas.push(r);
    return r;
  },
};
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend }) }));

import { RoomScreen } from "../novo/app/dupla/room/RoomScreen.jsx";

const ESTACAO = (n: number, marca: string) => ({
  ...STATION,
  id: `teste-inep2020-e0${n}`,
  name: `${marca}NOME da estação`,
  topic: `${marca}TEMA`,
  taxonomy_path: ["Clínica Médica", `${marca}TAXO`],
  summary: [{ title: `${marca}RESUMO`, text: "Resumo" }],
  pressings: [
    { id: `teste-inep2020-e0${n}-p1`, name: "Relato", content: "Relato inicial.", image_url: null, source_number: 1, display_number: 1, initially_visible: true },
    { id: `teste-inep2020-e0${n}-p2`, name: "Exame", content: "Resultado.", image_url: null, source_number: 2, display_number: 1, initially_visible: false },
  ],
  pressing_assets: { [`teste-inep2020-e0${n}-p2`]: { path: `${marca}ARQUIVO/x.png` } },
});
const E1 = ESTACAO(6, "AA");
const E2 = ESTACAO(7, "BB");
const marcas = (m: string, n: number) => [`${m}NOME`, `${m}TEMA`, `${m}TAXO`, `${m}RESUMO`, `${m}ARQUIVO`, `teste-inep2020-e0${n}`];

async function telaComo(uid: string, sala: string) {
  quem.uid = uid;
  respostas.length = 0;
  const view = render(<RoomScreen roomId={sala} go={vi.fn()} />);
  await waitFor(() => expect(view.container.querySelector("[aria-busy='true']")).toBeNull());
  await waitFor(() => expect(respostas.length).toBeGreaterThan(0));
  await new Promise((r) => setTimeout(r, 50));
  const texto = document.body.textContent ?? "";
  cleanup();
  return { texto, bruto: JSON.stringify(respostas) };
}

beforeAll(async () => {
  d = await openDuplaDb();
  await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
  for (const u of [U.carla, U.fabio]) await setPlan(d.db, u, "pro", "active");
  await addProfile(d.db, U.carla, { public_name: "Carla Teste" });
  await addProfile(d.db, U.fabio, { public_name: "Fábio Teste" });
  await addStation(d.db, E1);
  await addStation(d.db, E2);
}, 180_000);
afterAll(async () => {
  await d?.db.close();
});
beforeEach(async () => {
  await d.sql(`delete from public.checklist_study_sessions`);
  await d.sql(`delete from public.checklist_rooms`);
});
afterEach(() => cleanup());

const ANDAMENTO = { started_at: new Date(Date.now() - 60_000).toISOString(), ends_at: new Date(Date.now() + 540_000).toISOString() };

describe("Tema reservado: o candidato não recebe nem vê o tema da estação antes do resultado", () => {
  it("candidato em cada fase (roles, connecting, setup, running, review): nenhuma resposta e nenhum texto de tela contém o nome, o topic ou o summary da estação", async () => {
    for (const fase of ["roles", "connecting", "setup", "running", "review"] as Phase[]) {
      const extra: Record<string, unknown> = { released_pressings: [E1.pressings[1].id] };
      if (fase === "running") Object.assign(extra, ANDAMENTO);
      if (fase === "review") Object.assign(extra, ANDAMENTO, { finished_at: new Date().toISOString() });
      const sala = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: fase, candidate: U.carla, evaluator: U.fabio, station: E1.id, extra });
      const { texto, bruto } = await telaComo(U.carla, sala);
      expect(marcas("AA", 6).filter((m) => bruto.includes(m)), `${fase} (respostas)`).toEqual([]);
      expect(marcas("AA", 6).filter((m) => texto.includes(m)), `${fase} (tela)`).toEqual([]);
      // e o avaliador vê o nome (na preparação, dentro da "sala do avaliador", aberta antes do início)
      if (fase === "setup") window.sessionStorage.setItem(`smn-dupla-sala-avaliador:${sala}:1`, "1");
      const aval = await telaComo(U.fabio, sala);
      window.sessionStorage.clear();
      expect(aval.bruto, fase).toContain("AANOME");
      // a tela foi mesmo desenhada (prova de que a conferência olha o que a pessoa vê)
      expect(texto, fase).toMatch(/Estação 6 · Clínica Médica|Carregando a estação|Aguardando avaliação/);
      if (fase === "running") expect(texto).toContain("Relato inicial.");
      if (fase === "setup" || fase === "running") expect(aval.texto, fase).toContain("AANOME");
      await d.sql(`delete from public.checklist_rooms`);
    }
  });

  it("depois de inverter (rodada 2) quem agora é candidato também não recebe o nome da nova estação", async () => {
    const sala = await makeRoom(d.db, {
      members: [U.carla, U.fabio], phase: "running", candidate: U.fabio, evaluator: U.carla, station: E2.id, round: 2, extra: ANDAMENTO,
    });
    await addSession(d.db, { room: sala, round: 1, doctor: U.carla, actor: U.fabio, station: E1.id, correctness: 50 });
    const { texto, bruto } = await telaComo(U.fabio, sala);
    expect(marcas("BB", 7).filter((m) => bruto.includes(m) || texto.includes(m))).toEqual([]);
  });

  it("no resultado o candidato recebe o nome", async () => {
    const sala = await makeRoom(d.db, {
      members: [U.carla, U.fabio], phase: "result", candidate: U.carla, evaluator: U.fabio, station: E1.id,
      extra: { ...ANDAMENTO, finished_at: new Date().toISOString() },
    });
    await addSession(d.db, { room: sala, round: 1, doctor: U.carla, actor: U.fabio, station: E1.id, correctness: 70 });
    const { texto } = await telaComo(U.carla, sala);
    expect(texto).toContain("AANOME da estação");
  });
});
