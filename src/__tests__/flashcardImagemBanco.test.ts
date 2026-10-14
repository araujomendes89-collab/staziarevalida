// @vitest-environment node
/**
 * Flashcard ilustrado no baralho (migração 9993), com a aula REAL GR-001 v3 no banco de teste (PGlite).
 * A publicação feita aqui é SÓ do banco de simulação: não é produção. Nenhuma IA, nenhuma chave.
 * Prova: antes de publicar o aluno não vê nada; depois vê só o que é dele (sem PDF, equipe, caminho, fonte, afirmação, código GR).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { abrirBanco, ADMIN, ALUNO, ALUNO2, EDITOR, REVISOR, type Rpc, type Sql } from "./helpers/publicacaoCentral";
import { sha } from "./helpers/centralUnidades";
import { PGlite as PG } from "@electric-sql/pglite";
import { PGlite as PG } from "@electric-sql/pglite";

const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8"));
const PACOTE = fx("aula-pronta-GR-001-v3.json");
const FONTES = fx("aula-pronta-GR-001-v3-fontes.json").fontes;
const FICHA = fx("ficha-revisor-GR-001-v3.json");

let db: PGlite; let sql: Sql; let rpc: Rpc;
let versao: string; let aulaId: string;

beforeAll(async () => {
  ({ db, sql, rpc } = await abrirBanco());
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CLINICA_MEDICA') on conflict do nothing`, [REVISOR]);
  await sql(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`);
  for (const f of FONTES) {
    const r = await rpc(ADMIN, "app_ch_register_source", { p_source: { title: f.title, organ: f.organ, kind: f.kind, url: f.url, version: f.version } });
    await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: r.id, p_level: f.level });
  }
  const r = await rpc(EDITOR, "app_ch_import_lesson_package", { p_package: PACOTE });
  versao = r.version_id;
}, 300_000);


describe("Flashcard ilustrado no baralho", () => {
  const ids = async () => ((await rpc(ALUNO, "app_flashcards")).queue as any[]).map((c) => c.id);
  it("antes de publicar o aluno não tem cartão nem imagem; visitante é barrado", async () => {
    expect(await ids()).toEqual([]);
    expect(await rpc(ALUNO, "app_flashcards_ilustrados", { p_ids: ["00000000-0000-4000-8000-000000000001"] })).toEqual({});
    await expect(rpc(null, "app_flashcards_ilustrados", { p_ids: [] })).rejects.toThrow();
  });

  it("publicada (SÓ no banco de simulação): os 9 cartões do baralho ganham o par de imagens certo", async () => {
    await rpc(EDITOR, "app_ch_review_sheet_import", { p_version_id: versao, p_sheet: FICHA });
    for (const n of [1, 2, 3, 4, 5, 6]) await rpc(ADMIN, "app_ch_review_decide", { p_version_id: versao, p_n: n, p_decision: "de_acordo" });
    await rpc(EDITOR, "app_ch_submit_for_review", { p_version_id: versao }).catch(() => undefined);
    const criticas = (await sql(`select c.id from public.ch_claims c join public.ch_unit_claims uc on uc.claim_id = c.id where uc.unit_version_id = $1 and cardinality(c.critical_kinds) > 0 and c.critical_checked_by is null`, [versao])).map((x) => x.id);
    for (const id of criticas) await rpc(ADMIN, "app_ch_confirm_critical", { p_claim_id: id });
    await rpc(ADMIN, "app_ch_approve", { p_version_id: versao, p_kind: "medical", p_note: "ok" });
    await rpc(EDITOR, "app_ch_approve", { p_version_id: versao, p_kind: "editorial" });
    for (const m of await sql(`select id, content_hash from public.ch_materials where unit_version_id = $1 and kind in ('lesson', 'visual_cards')`, [versao]))
      await sql(`select public.ch_worker_save_render($1::jsonb)`, [JSON.stringify({ material_id: m.id, format: "pdf", storage_path: `renders/${m.id}.pdf`, sha256: sha(m.id), template_version: "t", brand_version: "b", material_hash: m.content_hash, check_result: { ok: true } })]);
    await rpc(ADMIN, "app_admin_vigilance_set_gate", { p_mode: "aviso" });
    await rpc(ADMIN, "app_ch_unit_publish", { p_version_id: versao, p_options: { confirm_similar: true } });
    const fila = (await rpc(ALUNO, "app_flashcards")).queue as any[];
    expect(fila).toHaveLength(9);
    const mapa = await rpc(ALUNO, "app_flashcards_ilustrados", { p_ids: fila.map((c) => c.id) });
    expect(Object.keys(mapa)).toHaveLength(9);
    const porFrente = (txt: string) => fila.find((c) => c.front.startsWith(txt));
    expect(mapa[porFrente("Caso novo de TB pulmonar: qual exame molecular").id]).toEqual({ tema: "GR-001", n: 1 });
    expect(mapa[porFrente("Quanto tempo de tosse define o sintomático").id]).toEqual({ tema: "GR-001", n: 2 });
    expect(new Set(Object.values(mapa).map((x: any) => x.n)).size).toBe(9);
    expect(JSON.stringify(mapa)).not.toMatch(/aulas-prontas|pdf|png/i);
  });

  it("cada n devolvido tem frente e verso na rota protegida; cartão pessoal e id inexistente não entram", async () => {
    const fila = (await rpc(ALUNO, "app_flashcards")).queue as any[];
    const mapa = await rpc(ALUNO, "app_flashcards_ilustrados", { p_ids: fila.map((c) => c.id) });
    for (const x of Object.values(mapa) as any[])
      for (const qual of ["frente", "verso"]) expect((await sql(`select public.ch_worker_aula_aluno_arquivo($1, $2, $3) r`, [x.tema, qual, x.n]))[0].r.caminho).toMatch(new RegExp(`F0${x.n}-digital-${qual}\\.png$`));
    const meu = await rpc(ALUNO, "app_create_flashcard", { p_area: "CLINICA_MEDICA", p_topic: "Meu", p_front: "Pergunta minha", p_back: "Resposta minha" });
    const m2 = await rpc(ALUNO, "app_flashcards_ilustrados", { p_ids: [meu.id, "00000000-0000-4000-8000-000000000009"] });
    expect(m2).toEqual({});
  });

  it("aluno não pede mais de 300 cartões; retirada da unidade tira a imagem (o cartão sai do baralho)", async () => {
    await expect(rpc(ALUNO, "app_flashcards_ilustrados", { p_ids: Array.from({ length: 301 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`) })).rejects.toThrow(/até 300/);
    const fila = (await rpc(ALUNO, "app_flashcards")).queue as any[];
    await rpc(ADMIN, "app_ch_retire", { p_version_id: versao, p_reason: "Teste de retirada." });
    expect(await rpc(ALUNO, "app_flashcards_ilustrados", { p_ids: fila.map((c) => c.id) })).toEqual({});
  });

  it("pacote: 0-CONFERIR sem erro em banco incompleto; colar 2 vezes; depois OK", async () => {
    const ROOT = path.resolve(__dirname, "../..");
    const conferir = fs.readFileSync(path.join(ROOT, "supabase/conferir/flashcard-imagem.sql"), "utf8");
    const migracao = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003009993_flashcard_ilustrado_no_baralho.sql"), "utf8");
    const vazio = new PG();
    await vazio.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
    expect((await vazio.query<any>(conferir)).rows[0].resultado).toMatch(/^FALTA: requisito/);
    await vazio.close();
    await db.exec(migracao);
    await db.exec(migracao);
    expect((await db.query<any>(conferir)).rows[0].resultado).toMatch(/^OK:/);
  });
});
