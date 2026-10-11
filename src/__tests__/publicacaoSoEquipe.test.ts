// @vitest-environment node
/**
 * Correção imediata (migração 8300, decisão do dono de 2026-10-10): o conteúdo inteiro das unidades publicadas
 * (com gabarito e rastros internos) e a tabela de publicações são só da equipe de conteúdo; o aluno não lê nenhum dos dois.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { abrirBanco, ADMIN, ALUNO, EDITOR, REVISOR, type AsUser, type Rpc, type Sql } from "./helpers/publicacaoCentral";
let db: PGlite; let sql: Sql; let rpc: Rpc; let asUser: AsUser;
beforeAll(async () => { ({ db, sql, rpc, asUser } = await abrirBanco()); }, 180_000);

const MIGRACAO = path.resolve(__dirname, "../../supabase/migrations/20261003008300_central_so_equipe.sql");

describe("Correção imediata: o conteúdo inteiro das unidades é só da equipe", () => {
  it("aluno e visitante são recusados; equipe continua lendo", async () => {
    await expect(rpc(ALUNO, "app_ch_published_units")).rejects.toThrow(/restrito à equipe/);
    await expect(rpc(null, "app_ch_published_units")).rejects.toThrow();
    expect(await rpc(EDITOR, "app_ch_published_units")).toEqual([]);
    expect((await sql(`select has_function_privilege('anon', 'public.app_ch_published_units()', 'execute') a`))[0].a).toBe(false);
  });
  it("aluno não lê publicações direto na tabela; equipe lê", async () => {
    const [u] = await sql(`insert into public.ch_units (theme_node_id, title) select id, 'Unidade da correção' from public.ch_taxonomy_nodes where level = 'theme' order by name limit 1 returning id`);
    const [v] = await sql(`insert into public.ch_unit_versions (unit_id, version, status, content, content_hash) values ($1, 1, 'published', '{"sections": []}', 'h') returning id`, [u.id]);
    await sql(`insert into public.ch_publications (unit_version_id, content_hash, published_by) values ($1, 'h', $2)`, [v.id, ADMIN]);
    expect(await asUser(ALUNO, `select * from public.ch_publications`)).toEqual([]);
    expect(await asUser(EDITOR, `select unit_version_id from public.ch_publications`)).toEqual([{ unit_version_id: v.id }]);
    expect((await rpc(EDITOR, "app_ch_published_units"))[0]).toMatchObject({ title: "Unidade da correção", version: 1 });
  });
  it("revisor médico também lê; colar a migração de novo (com dados) não dá erro nem muda nada", async () => {
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [REVISOR]);
    expect(await asUser(REVISOR, `select count(*)::int n from public.ch_publications`)).toEqual([{ n: 1 }]);
    expect(await rpc(REVISOR, "app_ch_published_units")).toHaveLength(1);

    await db.exec(fs.readFileSync(MIGRACAO, "utf8"));
    expect((await sql(`select policyname from pg_policies where schemaname = 'public' and tablename = 'ch_publications' order by 1`)).map((r) => r.policyname)).toEqual(["publicações: equipe lê"]);
    await expect(rpc(ALUNO, "app_ch_published_units")).rejects.toThrow(/restrito à equipe/);
    expect(await asUser(ALUNO, `select * from public.ch_publications`)).toEqual([]);
    expect(await rpc(EDITOR, "app_ch_published_units")).toHaveLength(1);
    expect((await sql(`select has_function_privilege('anon', 'public.app_ch_published_units()', 'execute') a, has_function_privilege('authenticated', 'public.app_ch_published_units()', 'execute') b`))[0]).toEqual({ a: false, b: true });
  });
});
