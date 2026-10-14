// @vitest-environment node
/**
 * Pacote do dono "materiais v5 da GR-001" (scripts/aulas/gerar-pacote-materiais-aula.mjs), ensaiado num banco simulado (PGlite com todas
 * as migrações): parte do estado de 13/10 (GR-001 v3 importada + ficha do revisor, pelo mesmo SQL do pacote central-unidades), marca uma
 * decisão da ficha, cola o arquivo novo DUAS vezes e confere: só os comandos das peças e os arquivos mudam; texto, afirmações, resumo,
 * flashcards, questões, ficha e decisões ficam iguais; a segunda colagem não muda nada; as travas não gravam nada. Sem IA, sem rede.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { abrirBanco, ADMIN, type Rpc, type Sql } from "./helpers/publicacaoCentral";
// @ts-expect-error módulo .mjs sem tipos
import { sqlAtualizarAula } from "../../scripts/aulas/gerar-pacote-unidades.mjs";
// @ts-expect-error módulo .mjs sem tipos
import { sqlAtualizar, sqlConferir, diferencasDeTexto } from "../../scripts/aulas/gerar-pacote-materiais-aula.mjs";

const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8"));
const V3 = fx("aula-pronta-GR-001-v3.json");
const V5 = { ...structuredClone(V3), ...fx("aula-pronta-GR-001-v5-materiais.json") };
const FICHA = fx("ficha-revisor-GR-001-v3.json");
const FONTES = fx("aula-pronta-GR-001-v3-fontes.json").fontes.map((f: any) => ({ doc_id: f.cid, instituicao: f.organ }));
const EMAIL = "adm83@t.dev";

let db: PGlite; let sql: Sql; let rpc: Rpc;
const colar = async (texto: string) => db.exec(texto);
const linha = async (tabela: string, col: string) => (await sql(`select ${col} as l from ${tabela}`))[0]?.l as string;
const versao = async () => (await sql(`select v.id, v.version, v.status, v.content_hash from public.ch_unit_versions v
   where exists (select 1 from public.ch_audit a where a.action = 'unit.import' and a.target = v.id::text and a.details ->> 'codigo' = 'GR-001')
   order by v.created_at desc limit 1`))[0];
/** Tudo o que é texto da aula (não pode mudar) e o estado da revisão. */
const textos = async (id: string) =>
  (await sql(`select v.content_hash, v.status,
      (select jsonb_object_agg(m.kind, m.content - 'arquivos' - 'comandos') from public.ch_materials m where m.unit_version_id = v.id and m.kind <> 'visual_cards') as materiais,
      (select jsonb_agg(uc.claim_id order by uc.claim_id) from public.ch_unit_claims uc where uc.unit_version_id = v.id) as afirmacoes,
      (select count(*)::int from public.ch_review_sheets s where s.unit_version_id = v.id) as fichas,
      (select jsonb_agg(jsonb_build_array(d.n, d.decision) order by d.id) from public.ch_review_decisions d where d.unit_version_id = v.id) as decisoes
    from public.ch_unit_versions v where v.id = $1`, [id]))[0];
const estado = async () =>
  (await sql(`select (select md5(string_agg(x::text, '|' order by x.id)) from public.ch_unit_versions x) v, (select md5(string_agg(x::text, '|' order by x.id)) from public.ch_materials x) m,
                     (select count(*)::int from public.ch_audit) a, (select count(*)::int from public.ch_claims) c`))[0];
const visuais = async (id: string) =>
  (await sql(`select m.content -> 'comandos' as comandos, (select count(*)::int from public.ch_materials mm, jsonb_array_elements(coalesce(mm.content -> 'arquivos', '[]'::jsonb)) f
     where mm.unit_version_id = $1) as arquivos, (select bool_and(f ->> 'caminho' like 'aulas-prontas/GR-001/v5/%') from public.ch_materials mm, jsonb_array_elements(coalesce(mm.content -> 'arquivos', '[]'::jsonb)) f
     where mm.unit_version_id = $1) as v5 from public.ch_materials m where m.unit_version_id = $1 and m.kind = 'visual_cards'`, [id]))[0];

let base: any;
let antes: any;

beforeAll(async () => {
  ({ db, sql, rpc } = await abrirBanco());
  // estado de 13/10: o 2-Atualizar-GR-001-v3.sql (fontes, aula v3 e ficha do revisor), como foi entregue ao dono
  await colar(sqlAtualizarAula(V3, FONTES, FICHA, EMAIL));
  expect(await linha("_aula_importada", "resultado ->> 'status'")).toBe("awaiting_review");
  base = await versao();
  await rpc(ADMIN, "app_ch_review_decide", { p_version_id: base.id, p_n: 1, p_decision: "de_acordo", p_note: "ensaio" });
  antes = await textos(base.id);
}, 600_000);

describe("Pacote materiais v5 da GR-001 (colado 2 vezes no banco simulado)", () => {
  it("o texto do pacote v5 é igual ao da v3 (só comandos e arquivos mudam)", () => {
    expect(diferencasDeTexto(V3, V5)).toEqual([]);
    expect(V5.visuais.comandos.every((c: any) => /tema_cor: GR-001/.test(c.comando) && !/fonte:/.test(c.comando))).toBe(true);
    expect(V5.arquivos).toHaveLength(61);
  });

  it("antes: 0-CONFERIR diz FALTA (materiais anteriores) sem erro", async () => {
    await colar(sqlConferir(V5, "v5"));
    expect(await linha("_materiais_conferir", "conferencia")).toMatch(/^FALTA: a GR-001 versão \d+ \(awaiting_review\) ainda está com os materiais anteriores/);
  });

  it("1ª colagem: grava os comandos e os 61 arquivos na MESMA versão; texto, ficha e decisões iguais; segue aguardando revisão", async () => {
    await colar(sqlAtualizar(V5, "v5", EMAIL));
    expect(await linha("_materiais_resultado", "linha")).toMatch(/^OK: GR-001 versão \d+, aguardando revisão médica e editorial: materiais v5 gravados \(3 comandos das peças, 61 arquivos\)/);
    const v = await versao();
    expect(v.id).toBe(base.id);
    expect(await textos(v.id)).toEqual(antes);
    const vis = await visuais(v.id);
    expect(vis.comandos.map((c: any) => c.modelo)).toEqual(["feed", "story", "a4"]);
    for (const c of vis.comandos) {
      expect(c.comando).toMatch(/tema_cor: GR-001/);
      expect(c.comando).not.toMatch(/fonte:|Ministério da Saúde/);
    }
    expect(vis.arquivos).toBe(61);
    expect(vis.v5).toBe(true);
    await colar(sqlConferir(V5, "v5"));
    expect(await linha("_materiais_conferir", "conferencia")).toMatch(/^OK: GR-001 versão \d+ \(awaiting_review\) com os materiais v5: 3 comandos das peças e 61 arquivos/);
  });

  it("2ª colagem: não muda nada", async () => {
    const e1 = await estado();
    await colar(sqlAtualizar(V5, "v5", EMAIL));
    expect(await linha("_materiais_resultado", "linha")).toMatch(/já estava com os materiais v5 \(nada mudou\)/);
    expect(await estado()).toEqual(e1);
    expect(await textos(base.id)).toEqual(antes);
  });

  it("trava: pacote que mudaria o texto da aula não grava nada", async () => {
    const e1 = await estado();
    const errado = structuredClone(V5);
    errado.aula.sections[0].paragraphs[0].text += " Frase nova.";
    await expect(colar(sqlAtualizar(errado, "v5", EMAIL))).rejects.toThrow(/O texto da GR-001 mudaria/);
    expect(await estado()).toEqual(e1);
  });

  it("trava: versão aprovada ou publicada não é tocada", async () => {
    await sql(`update public.ch_unit_versions set status = 'approved' where id = $1`, [base.id]);
    const e1 = await estado();
    const outro = structuredClone(V5);
    outro.arquivos = outro.arquivos.slice(0, 60);
    await expect(colar(sqlAtualizar(outro, "v5", EMAIL))).rejects.toThrow(/não mexo em versão aprovada ou publicada/);
    expect(await estado()).toEqual(e1);
    await sql(`update public.ch_unit_versions set status = 'awaiting_review' where id = $1`, [base.id]);
  });
});
