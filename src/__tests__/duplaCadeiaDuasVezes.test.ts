// @vitest-environment node
/**
 * Publicação da 2ª fase (2026-10-17): a cadeia inteira 013300 → 013406 colada DUAS vezes seguidas no banco (como o dono
 * pode fazer no editor SQL). No ensaio em produção a 2ª colagem da 013300 esbarrava na linha 'treino_dupla_chat' gravada
 * pela 013370 (app_settings_key_check). Aqui: a 2ª colagem passa, as chaves e a chave desligada ficam, e o aluno segue sem
 * ler station_id do match.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, openDuplaDb, type DuplaDb } from "./helpers/duplaDb";

const CADEIA = [
  "20261003013300_treino_dupla_dados.sql",
  "20261003013310_treino_dupla_telas.sql",
  "20261003013320_treino_dupla_match.sql",
  "20261003013330_fase2_telas_reais.sql",
  "20261003013340_treino_dupla_pacote.sql",
  "20261003013350_treino_dupla_sala.sql",
  "20261003013360_treino_dupla_resultado.sql",
  "20261003013370_treino_dupla_chat.sql",
  "20261003013380_treino_dupla_ajustes_1610.sql",
  "20261003013390_treino_dupla_folha_candidato.sql",
  "20261003013400_treino_dupla_decisoes_1710.sql",
  "20261003013405_treino_dupla_correcoes_publicacao.sql",
  "20261003013406_treino_dupla_correcoes_publicacao_2.sql",
];

describe("2ª fase: cadeia 013300–013406 colada duas vezes", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb(); // 1ª colagem: todas as migrações, em ordem
  }, 120_000);
  afterAll(async () => {
    await d?.db.close();
  });

  it("a 2ª colagem da cadeia inteira não dá erro", async () => {
    for (const f of CADEIA) {
      await expect(d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8")), f).resolves.toBeDefined();
    }
  }, 120_000);

  it("depois da 2ª colagem: as chaves seguem as mesmas, o Treino segue desligado e o aluno não lê station_id do match", async () => {
    expect(await d.sql(`select key from public.app_settings order by key`)).toEqual([
      // 'creditos' (Stazia Match, 014020, etapa 2) já estava no banco antes da 2ª colagem e continua
      { key: "announcement" }, { key: "creditos" }, { key: "simulado_ineditas_pct" }, { key: "treino_dupla" }, { key: "treino_dupla_chat" }, { key: "trial_days" },
    ]);
    expect((await d.sql<{ v: unknown }>(`select value->'aberto' as v from public.app_settings where key = 'treino_dupla'`))[0].v).toBe(false);
    await expect(d.sql(`insert into public.app_settings (key, value) values ('outra', '1')`)).rejects.toThrow(/check constraint/);
    const [p] = await d.sql<{ anon: boolean; aut: boolean }>(
      `select has_column_privilege('anon', 'public.study_matches', 'station_id', 'SELECT') as anon,
              has_column_privilege('authenticated', 'public.study_matches', 'station_id', 'SELECT') as aut`
    );
    expect(p).toEqual({ anon: false, aut: false });
  });

  it("depois da 2ª colagem valem as versões da 013405 (a última da cadeia): aviso por quem já viu, exportação sem o tema", async () => {
    const src = async (fn: string) =>
      (await d.sql<{ s: string }>(`select prosrc as s from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [fn]))[0].s;
    const estado = await src("dupla_room_state");
    expect(estado).toContain("seen_station");
    expect(estado).not.toContain("picked_station");
    expect(estado).not.toContain("study_swipes");
    expect(await src("dupla_export_rooms")).toContain("checklist_room_station_views");
    expect(await src("dupla_export_rooms")).not.toContain("to_jsonb(t)");
    for (const fn of ["app_dupla_set_station", "app_dupla_confirm_roles", "app_dupla_swipe"]) expect(await src(fn), fn).toContain("dupla_station_liberada");
    expect(await d.sql(`select tgname from pg_trigger where tgrelid = 'public.checklist_rooms'::regclass and tgname = 'checklist_rooms_station_views'`)).toHaveLength(1);
  });

  it("depois da 2ª colagem valem as versões da 013406: aviso em qualquer sala, estação indisponível fecha a rodada, exportação do treino sozinho", async () => {
    const src = async (fn: string) =>
      (await d.sql<{ s: string }>(`select prosrc as s from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [fn]))[0].s;
    const visto = await src("dupla_room_seen");
    expect(visto).toContain("actor_id");
    expect(visto).not.toContain("v.room_id = p_room.id");
    expect(await src("dupla_sweep")).toContain("station_dropped_round");
    expect(await src("dupla_sweep")).toContain("dupla_station_liberada");
    expect(await src("dupla_room_state")).toContain("'notice'");
    expect(await src("app_dupla_room_content")).toContain("dupla_sweep");
    expect(await src("app_export_my_data")).toContain("export_station_attempts()");
    expect(await d.sql(`select provolatile from pg_proc where proname = 'app_dupla_room_content'`)).toEqual([{ provolatile: "v" }]);
  });
});
