// @vitest-environment node
/**
 * Banco de estações · migração 013425 (supabase/migrations/…013425_treino_dupla_estacoes_origem_conteudo.sql), sobre o banco
 * local (PGlite, migrações reais): app_dupla_stations() devolve a origem do catálogo (origin_label, da 013420) e a situação do
 * conteúdo (content_status). A equipe recebe os cartões aguardando conteúdo; o aluno nunca.
 * Os cartões são os do catálogo da 013420 (sem conteúdo); nada aqui é conteúdo médico.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addStation, MIGRATIONS_DIR, openDuplaDb, setDupla, setPlan, STATION, U, type DuplaDb } from "./helpers/duplaDb";

const MIGRACAO = "20261003013425_treino_dupla_estacoes_origem_conteudo.sql";
const PRONTA = { ...STATION, id: "teste-origem-e01", name: "Estação de teste da origem" };

describe("Migração 013425: origem do catálogo e situação do conteúdo no Banco de estações", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    await setPlan(d.db, U.ana, "pro", "active");
    await addStation(d.db, PRONTA);
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });
  const porId = async (uid: string) => Object.fromEntries(((await d.rpc<any[]>(uid, "app_dupla_stations")) ?? []).map((s) => [s.id, s]));

  it("equipe recebe os cartões aguardando conteúdo, com a origem do catálogo; 2011 a 2017 sem INEP", async () => {
    const equipe = await porId(U.admin);
    expect(equipe["rev2013-e01"]).toMatchObject({ origin_label: "Revalida 2013", content_status: "awaiting_content", difficulty: null });
    expect(equipe["inep2020-e01"]).toMatchObject({ origin_label: "Revalida 2020 · INEP", content_status: "awaiting_content" });
    // estação de fora do catálogo: sem origem gravada (a tela calcula) e com conteúdo
    expect(equipe[PRONTA.id]).toMatchObject({ origin_label: null, content_status: "content_ready" });
    const aguardando = Object.values(equipe).filter((s: any) => s.content_status === "awaiting_content");
    expect(aguardando.length).toBeGreaterThan(100);
  });

  it("o aluno não recebe nenhum cartão aguardando conteúdo; a estação aprovada vem com content_ready", async () => {
    const aluno = await porId(U.ana);
    expect(Object.values(aluno).filter((s: any) => s.content_status !== "content_ready")).toEqual([]);
    expect(aluno["rev2013-e01"]).toBeUndefined();
    expect(aluno[PRONTA.id]).toMatchObject({ content_status: "content_ready", origin_label: null });
  });

  it("colar a 013425 de novo dá o mesmo banco; função com search_path vazio e fechada ao visitante", async () => {
    const defs = () =>
      d.sql<{ id: string; def: string; acl: string | null }>(
        `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`
      );
    const antes = await defs();
    await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8"));
    expect(await defs()).toEqual(antes);
    const acl = Object.fromEntries(antes.map((f) => [f.id, f.acl]));
    expect(acl["app_dupla_stations()"]).not.toMatch(/(^|[{,])anon=/);
    const [f] = await d.sql(`select prosecdef, proconfig from pg_proc where proname = 'app_dupla_stations'`);
    expect(f).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'] });
    await expect(d.rpc(null, "app_dupla_stations")).rejects.toThrow();
  });
});
