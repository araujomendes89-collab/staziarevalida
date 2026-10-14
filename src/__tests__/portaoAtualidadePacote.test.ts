// @vitest-environment node
/**
 * Simulação do pacote do dono (1-Vigilancia.sql + 0-CONFERIR.sql, gerados por scripts/portao-atualidade/gerar-pacote.mjs) num banco de
 * desenvolvimento (PGlite, nunca a produção): 0-CONFERIR diz OK; colar o pacote 2 vezes não muda estrutura, permissões nem dados;
 * recolar a 9960 (que refaz o portão antigo) e colar o pacote de novo devolve o portão dos 100 temas; 0-CONFERIR volta a dizer FALTA quando falta peça.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openFontesDb, type FontesDb } from "./helpers/fontesDb";

vi.setConfig({ testTimeout: 180_000 });
const PACOTE = process.env.PACOTE_PORTAO ?? path.join(os.homedir(), "Downloads/publicacao-staziamed-2026-10-14-vigilancia-e-portao");
const existe = fs.existsSync(path.join(PACOTE, "1-Vigilancia.sql"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "portao-pacote-"));
let t: FontesDb;
const ler = (f: string) => fs.readFileSync(path.join(PACOTE, f), "utf8");
const ultima = (r: any[]) => String(Object.values(r[r.length - 1]?.rows?.[0] ?? { x: "(sem linha)" })[0]);
const cola = async (sql: string) => ultima(await t.dev.db.exec(sql));
const q = async (s: string) => (await t.dev.db.query<any>(s)).rows;
const retrato = async () => ({
  funcoes: await q(`select p.oid::regprocedure::text f, md5(p.prosrc) h, array(select a::text from unnest(coalesce(p.proacl, '{}')) a order by 1) acl from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`),
  tabelas: await q(`select relname, relrowsecurity, relacl::text acl from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`),
  dados: await q(`select (select count(*) from public.ch_gt_dossiers) d, (select count(*) from public.ch_gt_fontes) f, (select count(*) from public.ch_topic_dossiers) o, (select count(*) from public.ch_index_pages) p,
                  (select md5(string_agg(tema_id || catalogo_id || papel || removida::text, ',' order by tema_id, catalogo_id)) from public.ch_gt_fontes) h`),
});

beforeAll(async () => {
  t = await openFontesDb(path.join(tmp, "db"));
}, 300_000);
afterAll(async () => {
  await t?.dev.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}, 120_000);

describe.skipIf(!existe)("pacote do dono: portão de atualidade", () => {
  it("0-CONFERIR diz OK com tudo no banco; diz FALTA quando uma peça falta", async () => {
    expect(await cola(ler("0-CONFERIR.sql"))).toMatch(/^OK: Vigilância científica no banco.*100 dossiês dos 100 temas/);
    await t.dev.db.exec("alter table public.ch_gt_fontes rename to ch_gt_fontes_x");
    expect(await cola(ler("0-CONFERIR.sql"))).toMatch(/^FALTA: .*ch_gt_fontes/);
    await t.dev.db.exec("alter table public.ch_gt_fontes_x rename to ch_gt_fontes");
    expect(await cola(ler("0-CONFERIR.sql"))).toMatch(/^OK/);
  });
  it("colar o pacote 2 vezes responde OK e não muda estrutura, permissões nem dados", async () => {
    expect(await cola(ler("1-Vigilancia.sql"))).toMatch(/^OK: Vigilância científica por tema e portão de atualidade colados \(100 dossiês/);
    const a = await retrato();
    expect(await cola(ler("1-Vigilancia.sql"))).toMatch(/^OK/);
    expect(await retrato()).toEqual(a);
    expect(await cola(ler("0-CONFERIR.sql"))).toMatch(/^OK/);
  });
  it("recolar a 9960 refaz o portão antigo (0-CONFERIR avisa); colar o pacote de novo devolve o portão dos 100 temas", async () => {
    await t.dev.db.exec(fs.readFileSync(path.join(__dirname, "../../supabase/migrations/20261003009960_vigilancia_por_tema.sql"), "utf8"));
    expect(await cola(ler("0-CONFERIR.sql"))).toMatch(/^FALTA: .*não conhece os 100 temas/);
    expect(await cola(ler("1-Vigilancia.sql"))).toMatch(/^OK/);
    expect(await cola(ler("0-CONFERIR.sql"))).toMatch(/^OK/);
  });
  it("o que a equipe marcou (conferência, papel, palavras-chave) sobrevive a colar de novo", async () => {
    await t.dev.db.exec(`update public.ch_gt_dossiers set last_verified_at = now(), last_verified_name = 'Dra. Teste', keywords = array['palavra da equipe'] where tema_id = 'GR-002';
                         update public.ch_gt_fontes set removida = true where tema_id = 'GR-002' and papel = 'principal'`);
    await cola(ler("1-Vigilancia.sql"));
    const r = await q(`select last_verified_name n, keywords k, (select count(*) from public.ch_gt_fontes where tema_id = 'GR-002' and papel = 'principal' and removida) r from public.ch_gt_dossiers where tema_id = 'GR-002'`);
    expect(r[0]).toMatchObject({ n: "Dra. Teste", k: ["palavra da equipe"] });
    expect(Number(r[0].r)).toBeGreaterThan(0);
  });
});
