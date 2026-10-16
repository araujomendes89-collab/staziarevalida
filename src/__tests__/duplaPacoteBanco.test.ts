/**
 * Treino em Dupla · Etapa P, Tarefa P2: migração 012900 (era "9900" no plano) sobre o banco local (PGlite, migrações reais).
 * O candidato NUNCA recebe o tema da estação (nome, topic, taxonomy_path, summary, id da estação, nome de arquivo) até o
 * resultado; impressos iniciais vão a ele sem liberação; número de tela x número de origem.
 * Conferência por TEXTO BRUTO da resposta (JSON.stringify), não só pelas chaves.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addStation, MIGRATIONS_DIR, makeRoom, openDuplaDb, setDupla, setPlan, STATION, U, type DuplaDb, type Phase } from "./helpers/duplaDb";

const MIGRACAO = "20261003013340_treino_dupla_pacote.sql";

// Estação de TESTE com marcas fáceis de procurar no texto bruto (nada disto é conteúdo real).
const SECRETA = {
  ...STATION,
  id: "teste-inep2020-e05",
  name: "ZZNOME estação secreta",
  topic: "ZZTEMA reservado",
  taxonomy_path: ["Clínica Médica", "ZZTAXO"],
  summary: [{ title: "ZZRESUMO", text: "Resumo do tema" }],
  pressings: [
    { id: "teste-inep2020-e05-p1", name: "Relato do caso", content: "Relato inicial de teste.", image_url: null, source_number: 1, display_number: 1, initially_visible: true },
    { id: "teste-inep2020-e05-p2", name: "Exame A", content: "Resultado A.\nLiberação: quando pedir o exame A.", image_url: null, source_number: 2, display_number: 1, initially_visible: false },
    { id: "teste-inep2020-e05-p3", name: "Exame B", content: "Resultado B.", image_url: null, source_number: 3, display_number: 2, initially_visible: false },
  ],
  pressing_assets: { "teste-inep2020-e05-p3": { path: "ZZARQUIVO/b.png" }, candidate_sheet: { path: "ZZARQUIVO/folha.png" } },
};
const MARCAS = ["ZZNOME", "ZZTEMA", "ZZTAXO", "ZZRESUMO", "ZZARQUIVO", "teste-inep2020-e05"];
const vaza = (x: unknown) => MARCAS.filter((m) => JSON.stringify(x).includes(m));

describe("Migração 012900: o candidato não recebe o tema da estação", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    for (const u of [U.carla, U.fabio]) await setPlan(d.db, u, "pro", "active");
    await addStation(d.db, SECRETA);
    await addStation(d.db, STATION);
  }, 180_000);
  afterAll(async () => {
    await d?.db.close();
  });
  beforeEach(async () => {
    await d.sql(`delete from public.checklist_rooms`);
  });

  const sala = (phase: Phase, extra: Record<string, unknown> = {}, papeis = true) =>
    makeRoom(d.db, {
      members: [U.carla, U.fabio], phase, station: SECRETA.id,
      ...(papeis ? { candidate: U.carla, evaluator: U.fabio } : {}),
      extra: { released_pressings: ["teste-inep2020-e05-p2"], ...extra },
    });
  const ler = async (uid: string, id: string) => ({
    estado: await d.rpc(uid, "app_dupla_room", { p_room_id: id }),
    conteudo: await d.rpc(uid, "app_dupla_room_content", { p_room_id: id }),
  });

  it("candidato: texto bruto de app_dupla_room e app_dupla_room_content, em todas as fases até review, não contém o nome, o topic nem o summary da estação", async () => {
    for (const fase of ["roles", "connecting", "setup", "running", "review"] as Phase[]) {
      const id = await sala(fase);
      const r = await ler(U.carla, id);
      expect(vaza(r), fase).toEqual([]);
      expect(r.estado.station.label, fase).toBe("Estação 5");
      expect(r.estado.station.name, fase).toBeUndefined();
      expect(r.estado.station.id, fase).toBeUndefined();
      await d.sql(`delete from public.checklist_rooms`);
    }
  });

  it("candidato no resultado recebe o nome; avaliador o recebe desde que os papéis estão definidos", async () => {
    const fim = await sala("result");
    expect((await ler(U.carla, fim)).estado.station.name).toBe(SECRETA.name);
    expect((await ler(U.carla, fim)).conteudo.station.name).toBe(SECRETA.name);
    await d.sql(`delete from public.checklist_rooms`);
    for (const fase of ["roles", "connecting", "setup", "running", "review"] as Phase[]) {
      const id = await sala(fase);
      const r = await ler(U.fabio, id);
      expect(r.estado.station.name, fase).toBe(SECRETA.name);
      expect(r.conteudo.station.name, fase).toBe(SECRETA.name);
      await d.sql(`delete from public.checklist_rooms`);
    }
  });

  it("fase roles sem papéis: ninguém recebe o nome, só 'Estação N'", async () => {
    const id = await sala("roles", {}, false);
    for (const u of [U.carla, U.fabio]) {
      const r = await ler(u, id);
      expect(vaza(r)).toEqual([]);
      expect(r.estado.station.label).toBe("Estação 5");
      expect(r.conteudo.station.label).toBe("Estação 5");
    }
  });

  it("impresso inicial: o candidato recebe sem liberação, fora de pressing_count e fora de released_pressings", async () => {
    const id = await sala("running", { released_pressings: [] });
    const r = await ler(U.carla, id);
    expect(r.conteudo.pressing_count).toBe(2);
    expect(r.conteudo.pressings).toEqual([
      { id: "i1", display_number: 1, initially_visible: true, name: "Relato do caso", content: "Relato inicial de teste.", has_image: false },
    ]);
    expect(r.estado.released_pressings).toEqual([]);
    // mesmo que o id do inicial esteja gravado como liberado, ele não aparece na lista de liberados
    await d.sql(`update public.checklist_rooms set released_pressings = $2 where id = $1`, [id, ["teste-inep2020-e05-p1", "teste-inep2020-e05-p3"]]);
    const r2 = await ler(U.carla, id);
    expect(r2.estado.released_pressings).toEqual(["d2"]);
    expect(r2.conteudo.pressings.map((p: any) => p.id)).toEqual(["i1", "d2"]);
  });

  it("display_number e source_number: candidato só vê display; avaliador vê os dois", async () => {
    const id = await sala("running");
    const c = (await ler(U.carla, id)).conteudo;
    expect(c.pressings[1]).toEqual({ id: "d1", display_number: 1, initially_visible: false, name: "Exame A", content: "Resultado A.", has_image: false });
    expect(JSON.stringify(c)).not.toContain("source_number");
    const a = (await ler(U.fabio, id)).conteudo;
    expect(a.pressings.map((p: any) => [p.id, p.display_number, p.source_number, p.initially_visible])).toEqual([
      ["teste-inep2020-e05-p1", 1, 1, true],
      ["teste-inep2020-e05-p2", 1, 2, false],
      ["teste-inep2020-e05-p3", 2, 3, false],
    ]);
    expect(a.pressings[1].content).toContain("Liberação: quando pedir o exame A.");
    expect(a.pressings[2].has_image).toBe(true);
  });

  it("estação sem os campos novos: posição como display e source, nenhum impresso inicial", async () => {
    const id = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "running", candidate: U.carla, evaluator: U.fabio, station: STATION.id });
    const a = (await ler(U.fabio, id)).conteudo;
    expect(a.pressings.map((p: any) => [p.display_number, p.source_number, p.initially_visible])).toEqual([
      [1, 1, false],
      [2, 2, false],
    ]);
    const c = (await ler(U.carla, id)).conteudo;
    expect(c.pressing_count).toBe(2);
    expect(c.pressings).toEqual([]);
  });

  it("candidate_sheet.has_image reflete a chave; sem a chave é falso", async () => {
    const id = await sala("running");
    expect((await ler(U.carla, id)).conteudo.station.candidate_sheet).toEqual({ has_image: true });
    const outra = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "running", candidate: U.carla, evaluator: U.fabio, station: STATION.id });
    expect((await ler(U.carla, outra)).conteudo.station.candidate_sheet).toEqual({ has_image: false });
  });

  it("a sala não é lida direto da tabela, e a exportação do candidato não traz a estação da sala aberta", async () => {
    const id = await sala("running");
    expect(await d.asUser(U.carla, `select station_id from public.checklist_rooms`)).toEqual([]);
    const exp = await d.rpc(U.carla, "app_export_my_data");
    expect(exp.checklist_rooms.map((r: any) => r.id)).toEqual([id]);
    expect(vaza(exp)).toEqual([]);
    const expAvaliador = await d.rpc(U.fabio, "app_export_my_data");
    expect(expAvaliador.checklist_rooms[0].station_id).toBe(SECRETA.id);
    expect(exp).toHaveProperty("declarations");
  });

  it("colar a 012900 duas vezes dá o mesmo banco; permissões iguais às das outras app_dupla_*", async () => {
    const defs = () =>
      d.sql<{ id: string; def: string; acl: string | null }>(
        `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`
      );
    const antes = await defs();
    await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8"));
    expect(await defs()).toEqual(antes);
    const acl = Object.fromEntries(antes.map((f) => [f.id, f.acl]));
    expect(acl["app_dupla_room_content(uuid)"]).toBe(acl["app_dupla_room(uuid,integer)"]);
    for (const f of ["dupla_pressings(jsonb)", "dupla_room_state(checklist_rooms,uuid)"]) {
      expect(acl[f], f).not.toContain("authenticated");
      expect(acl[f], f).not.toContain("anon");
    }
    expect(await d.rpc(null, "dupla_export_rooms")).toEqual([]);
  });
});
