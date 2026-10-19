// @vitest-environment node
/**
 * Estações da 2ª fase · segunda rodada de decisões do dono de 17/10, migração 013560, num Postgres em memória (PGlite) com todas
 * as migrações: (1) subárea Reumatologia em Clínica Médica; (2) impresso visível desde o início (aparece sozinho, numerado com os
 * demais, não bloqueia a folha em imagem); (3) "O que mudou desde a prova": só no resultado, nunca antes nem pela exportação.
 * Tudo é dado de TESTE com marcas fáceis de procurar no texto bruto.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addSession, addStation, caminhoImpresso, makeRoom, openDuplaDb, setDupla, setPlan, STATION, stationAssets, U, type DuplaDb } from "./helpers/duplaDb";

const tem = (x: unknown, marca: string) => JSON.stringify(x).includes(marca);
const ASSET = "11111111-1111-4111-8111-111111111111";
const MONITOR = caminhoImpresso("monitor");

// Estação do tipo 2025-1/08: relato na folha, monitor e bandeja "em cima da maca" (visíveis desde o início), exame liberável.
const MACA = {
  ...STATION,
  id: "teste-inep2025-1-e08",
  name: "ZZNOME anafilaxia",
  topic: "ZZTEMA reservado",
  area: "Pediatria",
  pressings: [
    { id: "m-p1", name: "Relato do caso", content: "Relato da maca.", image_url: null },
    { id: "m-p2", name: "Monitor", content: "FC 120.\nLiberação: em cima da maca, sem pedido.", image_url: null, display_number: 1, initially_visible: true },
    { id: "m-p3", name: "Exame físico", content: "Sibilos.\nLiberação: caso peça o exame.", image_url: null, display_number: 2 },
    { id: "m-p4", name: "Bandeja", content: "Adrenalina.", image_url: null, display_number: 3, initially_visible: true },
  ],
  pressing_assets: { "m-p2": ASSET },
  conduct_notes: [
    { item_order: 2, text: "ZZNOTA a via preferida hoje é a intramuscular." },
    { text: "ZZNOTA2 nota geral, sem item." },
    { item_order: 3, text: "   " },
    { item_order: 4 },
  ],
};
// Sem notas.
const SEM_NOTA = { ...STATION, id: "teste-inep2025-1-e09", name: "YYNOME sem nota", topic: "YYTEMA" };

describe("Migração 013560 (2ª leva de decisões do dono, 17/10)", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    for (const u of [U.ana, U.bruno]) await setPlan(d.db, u, "pro", "active");
    await stationAssets(d.db, [{ id: ASSET, storage_path: MONITOR }]);
    await addStation(d.db, MACA);
    await addStation(d.db, SEM_NOTA);
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });
  beforeEach(async () => {
    await d.sql(`delete from public.checklist_study_sessions`);
    await d.sql(`delete from public.checklist_rooms`);
  });

  const sala = (phase: string, o: Record<string, unknown> = {}, station = MACA.id) =>
    makeRoom(d.db, { members: [U.ana, U.bruno], phase: phase as any, candidate: U.ana, evaluator: U.bruno, station, ...o });

  // ------------------------------------------------------------------ 1) subárea
  describe("subárea Reumatologia", () => {
    it("a lista tem Reumatologia em Clínica Médica e as subáreas que os grandes temas já usavam", async () => {
      const lista = await d.rpc(U.ana, "app_area_subareas");
      expect(lista["Clínica Médica"]).toEqual(expect.arrayContaining(["Reumatologia", "Cardiologia", "Pneumologia", "Infectologia"]));
      expect(lista["Pediatria"]).toEqual(expect.arrayContaining(["Neonatologia", "Puericultura"]));
      // "Cirurgia" dos grandes temas é "Cirurgia Geral" nas estações
      expect(Object.keys(lista)).toContain("Cirurgia Geral");
      expect(Object.keys(lista)).not.toContain("Cirurgia");
      expect(lista["Clínica Médica"]).toEqual([...lista["Clínica Médica"]].sort());
    });
    it("só quem entrou lê; ninguém grava; colar de novo não duplica", async () => {
      await expect(d.rpc(null, "app_area_subareas")).rejects.toThrow(/permission denied/);
      await expect(d.asUser(U.ana, `insert into public.area_subareas (area, subarea) values ('Clínica Médica', 'Teste')`)).rejects.toThrow();
      expect((await d.asUser(U.ana, `select subarea from public.area_subareas where area = 'Clínica Médica' and subarea = 'Reumatologia'`)).length).toBe(1);
      await d.sql(`insert into public.area_subareas (area, subarea) values ('Clínica Médica', 'Reumatologia') on conflict do nothing`);
      expect(await d.sql(`select 1 from public.area_subareas where subarea = 'Reumatologia'`)).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------ 2) impresso visível desde o início
  describe("impresso visível desde o início", () => {
    it("fonte da folha sem bloqueio: só o relato vai para a folha", async () => {
      const [{ r }] = await d.sql(`select public.ch_worker_dupla_folha_fonte($1) as r`, [MACA.id]);
      expect(r.fonte.bloqueio).toBeNull();
      expect(r.fonte.impressos).toEqual([{ nome: "Relato do caso", texto: "Relato da maca." }]);
      expect(await d.rpc(U.admin, "app_admin_dupla_folha_pedir", { p_station_id: MACA.id })).toMatchObject({ estado: "pedida", bloqueio: null });
    });

    it("numeração: o relato (na folha) tem contagem própria; monitor, exame e bandeja seguem 1, 2, 3", async () => {
      const r = await d.sql(
        `select p.id, p.initially_visible as ini, p.screen_number as tela
           from public.checklist_station_contents k, public.dupla_pressings_tela(k.content) p where k.station_id = $1 order by p.n`,
        [MACA.id]
      );
      expect(r).toEqual([
        { id: "m-p1", ini: true, tela: 1 },
        { id: "m-p2", ini: true, tela: 1 },
        { id: "m-p3", ini: false, tela: 2 },
        { id: "m-p4", ini: true, tela: 3 },
      ]);
    });

    it("candidato: vê sozinho o monitor e a bandeja (v1, v3), sem liberar; o exame aparece só quando o avaliador libera (d2)", async () => {
      const id = await sala("running");
      const c = await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: id });
      expect(c.pressing_count).toBe(3);
      expect(c.pressings.map((p: any) => [p.id, p.display_number, p.initially_visible, p.in_sheet, p.name])).toEqual([
        ["i1", 1, true, true, "Relato do caso"],
        ["v1", 1, true, false, "Monitor"],
        ["v3", 3, true, false, "Bandeja"],
      ]);
      expect(c.pressings[1]).toMatchObject({ content: "FC 120.", has_image: true });
      expect(tem(c, "Liberação")).toBe(false);
      expect(tem(c, "m-p2")).toBe(false);
      expect(tem(c, "ZZNOME") || tem(c, "ZZTEMA") || tem(c, "ZZNOTA")).toBe(false);
      // o estado da sala não mostra nada liberado
      const e = await d.rpc(U.ana, "app_dupla_room", { p_room_id: id });
      expect(e.released_pressings).toEqual([]);

      // o avaliador libera o exame (o monitor já está visível: recusa)
      await expect(d.rpc(U.bruno, "app_dupla_release", { p_room_id: id, p_pressing_id: "m-p2", p_released: true })).rejects.toThrow(/já está visível desde o início/);
      await d.rpc(U.bruno, "app_dupla_release", { p_room_id: id, p_pressing_id: "m-p3", p_released: true });
      const c2 = await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: id });
      expect(c2.pressings.map((p: any) => p.id)).toEqual(["i1", "v1", "d2", "v3"]);
      expect(c2.pressings.map((p: any) => p.display_number)).toEqual([1, 1, 2, 3]);
    });

    it("avaliador: vê tudo com in_sheet, display_number contínuo fora da folha e o número de origem", async () => {
      const id = await sala("running");
      const a = await d.rpc(U.bruno, "app_dupla_room_content", { p_room_id: id });
      expect(a.pressings.map((p: any) => [p.id, p.display_number, p.source_number, p.initially_visible, p.in_sheet])).toEqual([
        ["m-p1", 1, 1, true, true],
        ["m-p2", 1, 2, true, false],
        ["m-p3", 2, 3, false, false],
        ["m-p4", 3, 4, true, false],
      ]);
      expect(a.pressing_count).toBe(3);
    });

    it("imagem: o candidato abre o impresso visível pela chave de tela v1; o liberável sem liberar e a chave 'd' errada seguem barrados", async () => {
      const id = await sala("running");
      expect(await d.rpc(U.ana, "app_dupla_print_path", { p_room_id: id, p_pressing_id: "v1" })).toBe(MONITOR);
      await expect(d.rpc(U.ana, "app_dupla_print_path", { p_room_id: id, p_pressing_id: "d2" })).rejects.toThrow(/não liberado/);
      await expect(d.rpc(U.ana, "app_dupla_print_path", { p_room_id: id, p_pressing_id: "d1" })).rejects.toThrow(/não liberado/);
      // o avaliador abre pelo id verdadeiro
      expect(await d.rpc(U.bruno, "app_dupla_print_path", { p_room_id: id, p_pressing_id: "m-p2" })).toBe(MONITOR);
    });

    it("estação só com relato e liberáveis: tudo como antes (i1 e d1, d2)", async () => {
      await addStation(d.db, {
        ...STATION,
        id: "teste-dupla-antes",
        pressings: [
          { id: "a-p1", name: "Relato do caso", content: "Relato.", image_url: null },
          { id: "a-p2", name: "Exame A", content: "A.", image_url: null },
          { id: "a-p3", name: "Exame B", content: "B.", image_url: null },
        ],
      });
      const id = await sala("running", {}, "teste-dupla-antes");
      await d.sql(`update public.checklist_rooms set released_pressings = $2 where id = $1`, [id, ["a-p3"]]);
      const c = await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: id });
      expect(c.pressing_count).toBe(2);
      expect(c.pressings.map((p: any) => [p.id, p.display_number, p.in_sheet])).toEqual([["i1", 1, true], ["d2", 2, false]]);
    });
  });

  // ------------------------------------------------------------------ 3) o que mudou desde a prova
  describe("O que mudou desde a prova", () => {
    it("antes do resultado o candidato não recebe a nota por nenhum caminho: conteúdo, estado, resultado, histórico e exportação", async () => {
      for (const fase of ["connecting", "setup", "running", "review"]) {
        await d.sql(`delete from public.checklist_rooms`);
        const id = await sala(fase);
        for (const uid of [U.ana, U.bruno]) {
          expect(tem(await d.rpc(uid, "app_dupla_room_content", { p_room_id: id }), "ZZNOTA"), `${fase} conteúdo`).toBe(false);
          expect(tem(await d.rpc(uid, "app_dupla_room", { p_room_id: id }), "ZZNOTA"), `${fase} estado`).toBe(false);
        }
        await expect(d.rpc(U.ana, "app_dupla_result", { p_room_id: id, p_round: 1 })).rejects.toThrow(/Resultado ainda não liberado/);
        await expect(d.rpc(U.ana, "app_dupla_history_result", { p_room_id: id, p_round: 1 })).rejects.toThrow(/Resultado ainda não liberado/);
        expect(tem(await d.rpc(U.ana, "app_dupla_history", {}), "ZZNOTA")).toBe(false);
        expect(tem(await d.rpc(U.ana, "app_export_my_data"), "ZZNOTA"), `${fase} exportação`).toBe(false);
      }
      // sala em revisão da nota (a avaliação existe, mas a sala está em 'review'): o candidato ainda não abre
      await d.sql(`delete from public.checklist_rooms`);
      const id = await sala("review");
      await addSession(d.db, { room: id, round: 1, doctor: U.ana, actor: U.bruno, station: MACA.id, correctness: 80 });
      await expect(d.rpc(U.ana, "app_dupla_result", { p_room_id: id, p_round: 1 })).rejects.toThrow(/Resultado ainda não liberado/);
    });

    it("no resultado (sala): as notas vêm na ordem, sem as vazias, para o candidato e para o avaliador; a nota não muda", async () => {
      const id = await sala("result");
      await addSession(d.db, { room: id, round: 1, doctor: U.ana, actor: U.bruno, station: MACA.id, correctness: 80 });
      const esperado = [
        { item_order: 2, text: "ZZNOTA a via preferida hoje é a intramuscular." },
        { item_order: null, text: "ZZNOTA2 nota geral, sem item." },
      ];
      const cand = await d.rpc(U.ana, "app_dupla_result", { p_room_id: id, p_round: 1 });
      expect(cand.conduct_notes).toEqual(esperado);
      expect(cand).toMatchObject({ viewer: "candidate", pct: 80 });
      expect(Number(cand.score)).toBe(8);
      expect((await d.rpc(U.bruno, "app_dupla_result", { p_room_id: id, p_round: 1 })).conduct_notes).toEqual(esperado);
    });

    it("no histórico (Meus PEPs), depois de a sala fechar: as mesmas notas; com revisão pedida e não feita, nada", async () => {
      const id = await sala("closed", { extra: { closed_reason: "saiu" } });
      const s = await addSession(d.db, { room: id, round: 1, doctor: U.ana, actor: U.bruno, station: MACA.id, correctness: 60 });
      expect((await d.rpc(U.ana, "app_dupla_history_result", { p_room_id: id, p_round: 1 })).conduct_notes).toHaveLength(2);
      expect(tem(await d.rpc(U.ana, "app_dupla_history", {}), "ZZNOTA")).toBe(false); // a lista não traz as notas
      await d.sql(`update public.checklist_study_sessions set review_requested_at = now(), review_reason = 'x' where id = $1`, [s]);
      await expect(d.rpc(U.ana, "app_dupla_history_result", { p_room_id: id, p_round: 1 })).rejects.toThrow(/Aguardando revisão/);
    });

    it("estação sem notas: lista vazia; quem não estava na rodada não lê", async () => {
      const id = await sala("result", {}, SEM_NOTA.id);
      await addSession(d.db, { room: id, round: 1, doctor: U.ana, actor: U.bruno, station: SEM_NOTA.id, correctness: 70 });
      expect((await d.rpc(U.ana, "app_dupla_result", { p_room_id: id, p_round: 1 })).conduct_notes).toEqual([]);
      await setPlan(d.db, U.carla, "pro", "active");
      await expect(d.rpc(U.carla, "app_dupla_result", { p_room_id: id, p_round: 1 })).rejects.toThrow(/Resultado ainda não liberado/);
    });

    it("a exportação de dados do candidato, depois do resultado, também não leva o texto das notas (só a avaliação)", async () => {
      const id = await sala("result");
      await addSession(d.db, { room: id, round: 1, doctor: U.ana, actor: U.bruno, station: MACA.id, correctness: 90 });
      expect(tem(await d.rpc(U.ana, "app_export_my_data"), "ZZNOTA")).toBe(false);
      expect(tem(await d.rpc(U.bruno, "app_export_my_data"), "ZZNOTA")).toBe(false);
    });

    it("o conteúdo da estação com as notas segue fechado para o aluno (política da tabela só da equipe)", async () => {
      expect(await d.asUser(U.ana, `select content from public.checklist_station_contents where station_id = $1`, [MACA.id])).toEqual([]);
    });
  });
});
