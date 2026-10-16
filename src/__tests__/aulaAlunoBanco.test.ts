// @vitest-environment node
/**
 * A aula dentro do Grande Tema, lado do ALUNO (migração 9992), com a aula REAL GR-001 v3 no banco de teste (PGlite).
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

const FUNCOES: [string, Record<string, unknown>][] = [
  ["app_temas_com_aula", {}],
  ["app_tema_aula", { p_tema_id: "GR-001" }],
];

describe("Antes de publicar: a GR-001 (aguardando revisão) não aparece ao aluno", () => {
  it("o aluno recebe lista vazia e nenhuma aula; o visitante é recusado", async () => {
    expect(await rpc(ALUNO, "app_temas_com_aula")).toEqual([]);
    expect(await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" })).toBeNull();
    for (const [fn, args] of FUNCOES) await expect(rpc(null, fn, args), fn).rejects.toThrow();
  });
  it("o servidor também não recebe caminho de arquivo de aula não publicada; aluno não chama a função do servidor", async () => {
    await expect(sql(`select public.ch_worker_aula_aluno_arquivo('GR-001', 'revisao', 1)`)).rejects.toThrow(/Aula não encontrada/);
    await expect(rpc(ALUNO, "ch_worker_aula_aluno_arquivo", { p_tema_id: "GR-001", p_qual: "revisao" })).rejects.toThrow(/permission denied/);
  });
  it("aprovar só pela metade (médica sem editorial) continua sem aula para o aluno", async () => {
    await rpc(EDITOR, "app_ch_review_sheet_import", { p_version_id: versao, p_sheet: FICHA });
    for (const n of [1, 2, 3, 4, 5, 6]) await rpc(ADMIN, "app_ch_review_decide", { p_version_id: versao, p_n: n, p_decision: "de_acordo" });
    await rpc(EDITOR, "app_ch_submit_for_review", { p_version_id: versao }).catch(() => undefined);
    await rpc(ADMIN, "app_ch_approve", { p_version_id: versao, p_kind: "medical", p_note: "ok" });
    expect(await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" })).toBeNull();
  });
});

describe("Publicada (SÓ no banco de simulação): o aluno vê o que é dele", () => {
  let aula: any;
  beforeAll(async () => {
    const criticas = (await sql(`select c.id from public.ch_claims c join public.ch_unit_claims uc on uc.claim_id = c.id where uc.unit_version_id = $1 and cardinality(c.critical_kinds) > 0 and c.critical_checked_by is null`, [versao])).map((x) => x.id);
    for (const id of criticas) await rpc(ADMIN, "app_ch_confirm_critical", { p_claim_id: id });
    await rpc(EDITOR, "app_ch_approve", { p_version_id: versao, p_kind: "editorial" });
    for (const m of await sql(`select id, content_hash from public.ch_materials where unit_version_id = $1 and kind in ('lesson', 'visual_cards')`, [versao]))
      await sql(`select public.ch_worker_save_render($1::jsonb)`, [JSON.stringify({ material_id: m.id, format: "pdf", storage_path: `renders/${m.id}.pdf`, sha256: sha(m.id), template_version: "t", brand_version: "b", material_hash: m.content_hash, check_result: { ok: true } })]);
    await rpc(ADMIN, "app_admin_vigilance_set_gate", { p_mode: "aviso" });
    await rpc(ADMIN, "app_ch_unit_publish", { p_version_id: versao, p_options: { confirm_similar: true } });
    aulaId = (await sql(`select id from public.lessons where published limit 1`))[0].id;
    aula = await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" });
  }, 120_000);

  it("a lista de temas com aula traz só a GR-001", async () => {
    expect(await rpc(ALUNO, "app_temas_com_aula")).toEqual(["GR-001"]);
    expect(await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-002" })).toBeNull();
  });

  it("traz seções, fixação, flashcards, Revisão da Aula e o id para anotações", async () => {
    expect(aula.lesson_id).toBe(aulaId);
    expect(aula.secoes).toHaveLength(PACOTE.aula.sections.length);
    // editor profissional (migração 013020): "ricos" alinhado aos parágrafos (null sem formatação nova), "doc_config" nulo sem configuração
    for (const s of aula.secoes) expect(s.ricos).toEqual(s.paragrafos.map(() => null));
    expect(aula.doc_config).toBeNull();
    expect(aula.questoes.itens).toHaveLength(3);
    expect(aula.flashcards.cartoes).toHaveLength(9);
    expect(aula.flashcards.cartoes.every((c: any) => c.imagem)).toBe(true);
    expect(aula.revisao_aula.titulo).toBe("Revisão da Aula");
    expect(aula.titulo).toBe(PACOTE.titulo);
  });

  it("editor profissional (013020): o rico de um parágrafo chega alinhado ao parágrafo; o texto continua igual", async () => {
    const rico = { f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "x" }] }] } };
    const antes = await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" });
    const [{ v }] = await sql(`select l.ch_version_id v from public.lessons l where l.id = $1`, [aulaId]);
    await sql(`update public.ch_unit_versions set content = jsonb_set(jsonb_set(content, '{sections,0,paragraphs,0,rico}', $2::jsonb), '{doc_config}', '{"pagina": {"tamanho": "A4"}}'::jsonb) where id = $1`, [v, JSON.stringify(rico)]);
    try {
      const depois = await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" });
      expect(depois.secoes.map((s: any) => s.paragrafos)).toEqual(antes.secoes.map((s: any) => s.paragrafos));
      expect(depois.secoes[0].ricos[0]).toEqual(rico);
      expect(depois.secoes[0].ricos.slice(1).every((r: any) => r === null)).toBe(true);
      expect(depois.doc_config).toEqual({ pagina: { tamanho: "A4" } });
    } finally {
      await sql(`update public.ch_unit_versions set content = (content #- '{sections,0,paragraphs,0,rico}') - 'doc_config' where id = $1`, [v]);
    }
  });

  it("não leva PDF, equipe, caminho de arquivo, afirmação, fonte, referência nem o código GR", async () => {
    const t = JSON.stringify(aula);
    expect(t).not.toMatch(/pdf|aulas-prontas|\.png|claim_ids|Fontes oficiais desta aula|Trechos citados|Story|Card de feed|só equipe/i);
    expect(t).not.toMatch(/GR-\d{3}/);
    expect(t).not.toMatch(/\[\d+\]/);
  });

  it("o servidor recebe o caminho da imagem só de item do aluno (Revisão A4 e flashcards digitais), nunca PDF", async () => {
    expect((await sql(`select public.ch_worker_aula_aluno_arquivo('GR-001', 'revisao', 1) r`))[0].r.caminho).toMatch(/pagina-a4\.png$/);
    expect((await sql(`select public.ch_worker_aula_aluno_arquivo('GR-001', 'frente', 3) r`))[0].r.caminho).toMatch(/F03-digital-frente\.png$/);
    expect((await sql(`select public.ch_worker_aula_aluno_arquivo('GR-001', 'verso', 9) r`))[0].r.caminho).toMatch(/F09-digital-verso\.png$/);
    for (const [q, n] of [["verso", 10], ["pdf", 1], ["frente", 0]] as const)
      await expect(sql(`select public.ch_worker_aula_aluno_arquivo('GR-001', $1, $2)`, [q, n])).rejects.toThrow(/não encontrad/);
    await expect(sql(`select public.ch_worker_aula_aluno_arquivo('GR-002', 'revisao', 1)`)).rejects.toThrow();
  });

  it("item retirado da lista do aluno some da aula (Revisão da Aula)", async () => {
    // a versão no ar não se edita: simula a retirada direto na tabela como dono, depois devolve
    await sql(`update public.ch_unit_materials set status = 'retirado' where unit_version_id = $1 and kind = 'revisao_aula'`, [versao]);
    expect((await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" })).revisao_aula).toBeNull();
    await expect(sql(`select public.ch_worker_aula_aluno_arquivo('GR-001', 'revisao', 1)`)).rejects.toThrow();
    await sql(`update public.ch_unit_materials set status = 'ativo' where unit_version_id = $1 and kind = 'revisao_aula'`, [versao]);
  });

  it("anotações e caixas marcadas: por aluno, com a aula publicada", async () => {
    await rpc(ALUNO, "app_lesson_notes_save", { p_lesson_id: aula.lesson_id, p_note: "Minha nota", p_checks: { a: true } });
    await rpc(ALUNO2, "app_lesson_notes_save", { p_lesson_id: aula.lesson_id, p_note: "Outra", p_checks: {} });
    expect(await rpc(ALUNO, "app_lesson_notes", { p_lesson_id: aula.lesson_id })).toMatchObject({ note: "Minha nota", checks: { a: true } });
  });

  it("retirar a unidade tira a aula do aluno", async () => {
    await rpc(ADMIN, "app_ch_retire", { p_version_id: versao, p_reason: "Teste de retirada." });
    expect(await rpc(ALUNO, "app_temas_com_aula")).toEqual([]);
    expect(await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" })).toBeNull();
  });
});

describe("Pacote de publicação: conferir e colar duas vezes", () => {
  const ROOT = path.resolve(__dirname, "../..");
  const conferir = fs.readFileSync(path.join(ROOT, "supabase/conferir/aula-aluno.sql"), "utf8");
  const migracao = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003009992_aula_do_aluno_no_tema.sql"), "utf8");
  it("0-CONFERIR roda sem erro em banco incompleto e diz o que falta", async () => {
    const vazio = new PG();
    await vazio.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
    const r = (await vazio.query<any>(conferir)).rows[0].resultado as string;
    expect(r).toMatch(/^FALTA: requisito/);
    await vazio.close();
  });
  it("colar o SQL de novo não dá erro e o 0-CONFERIR passa a dizer OK; visitante não executa", async () => {
    await db.exec(migracao);
    await db.exec(migracao);
    expect((await db.query<any>(conferir)).rows[0].resultado).toMatch(/^OK:/);
    await expect(rpc(null, "app_temas_com_aula")).rejects.toThrow();
  });
});
