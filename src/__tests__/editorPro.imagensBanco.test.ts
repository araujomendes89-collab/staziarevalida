// @vitest-environment node
/**
 * Editor profissional, módulo M11a (imagens: guarda) — migração 013030 ensaiada no PGlite (banco de simulação, nunca produção).
 * Prova: só a equipe lê/grava (pelas funções); o caminho do depósito nunca sai nas funções app_*; o aluno só recebe imagem que está
 * numa aula PUBLICADA (publicação ativa); versões novas guardam a antiga; migração idempotente, com desfazer e conferir.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { abrirBanco, ADMIN, ALUNO, EDITOR, REVISOR, type AsUser, type Rpc, type Sql } from "./helpers/publicacaoCentral";
import { sha } from "./helpers/centralUnidades";
import { PGlite as PG } from "@electric-sql/pglite";

const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8"));
const PACOTE = fx("aula-pronta-GR-001-v3.json");
const FONTES = fx("aula-pronta-GR-001-v3-fontes.json").fontes;
const FICHA = fx("ficha-revisor-GR-001-v3.json");

let db: PG; let sql: Sql; let rpc: Rpc; let asUser: AsUser;
let versao: string; let aulaId: string;
let unitId: string;

const ROOT = path.resolve(__dirname, "../..");
const migracao = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003013030_editor_pro_imagens.sql"), "utf8");
const desfazer = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013030_editor_pro_imagens.desfazer.sql"), "utf8");
const conferir = fs.readFileSync(path.join(ROOT, "supabase/conferir/editor-pro-imagens.sql"), "utf8");

beforeAll(async () => {
  ({ db, sql, rpc, asUser } = await abrirBanco());
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CLINICA_MEDICA') on conflict do nothing`, [REVISOR]);
  await sql(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`);
  
  for (const f of FONTES) {
    const r = await rpc(ADMIN, "app_ch_register_source", { p_source: { title: f.title, organ: f.organ, kind: f.kind, url: f.url, version: f.version } });
    await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: r.id, p_level: f.level });
  }

  const r = await rpc(EDITOR, "app_ch_import_lesson_package", { p_package: PACOTE });
  versao = r.version_id;
  const v = await sql(`select unit_id from public.ch_unit_versions where id = $1`, [versao]);
  unitId = v[0].unit_id;
}, 300_000);

describe("1. Migração idempotente e depósito privado", () => {
  it("colar a migração de novo não falha (o banco já tem todas as migrações)", async () => {
    await db.exec(migracao);
    await db.exec(migracao);
  }, 120_000);

  it("com o esquema storage (como no Supabase): cria doc-imagens PRIVADO; se alguém deixou público, volta a privado; conferir dá OK", async () => {
    await db.exec(`
      create schema if not exists storage;
      create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text);
    `);
    await db.exec(migracao);
    let b = await sql(`select * from storage.buckets where id = 'doc-imagens'`);
    expect(b[0].public).toBe(false);
    expect(Number(b[0].file_size_limit)).toBe(5242880);
    expect(b[0].allowed_mime_types).toEqual(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    await sql(`update storage.buckets set public = true where id = 'doc-imagens'`);
    expect((await sql(conferir))[0].resultado).toMatch(/^FALTA: .*PÚBLICO/);
    await db.exec(migracao);
    b = await sql(`select public from storage.buckets where id = 'doc-imagens'`);
    expect(b[0].public).toBe(false);
    expect((await sql(conferir))[0].resultado).toMatch(/^OK/);
  }, 120_000);
});

describe("3. ch_worker_doc_imagem_registrar", () => {
  let imageId: string;
  const assetData = {
    storage_path: "aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    mime: "image/png",
    width: 800,
    height: 600,
    bytes: 102400,
    alt_text: "Teste",
    original_name: "teste.png",
    unit_id: null,
    lesson_id: null
  };

  it("EDITOR cria versão 1 e erro com ALUNO", async () => {
    assetData.unit_id = unitId as any;
    
    await expect(sql(`select public.ch_worker_doc_imagem_registrar($1, $2::jsonb)`, [ALUNO, JSON.stringify(assetData)])).rejects.toThrow(/acesso restrito à equipe/);
    
    const res = await sql(`select public.ch_worker_doc_imagem_registrar($1, $2::jsonb) r`, [EDITOR, JSON.stringify(assetData)]);
    const img = res[0].r;
    expect(img.version).toBe(1);
    expect(img.repetida).toBe(false);
    expect(img.alt_text).toBe("Teste");
    imageId = img.id;
  });

  it("Repetir o mesmo sha/unidade devolve a mesma linha com repetida=true", async () => {
    const res = await sql(`select public.ch_worker_doc_imagem_registrar($1, $2::jsonb) r`, [EDITOR, JSON.stringify(assetData)]);
    expect(res[0].r.id).toBe(imageId);
    expect(res[0].r.repetida).toBe(true);
  });

  it("Substituir cria versão 2 com mesmo family_id e alt herdado", async () => {
    const subsData = { ...assetData, storage_path: "bb/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png", sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", alt_text: "", substitui: imageId };
    const res = await sql(`select public.ch_worker_doc_imagem_registrar($1, $2::jsonb) r`, [EDITOR, JSON.stringify(subsData)]);
    const img = res[0].r;
    expect(img.version).toBe(2);
    expect(img.previous_id).toBe(imageId);
    expect(img.alt_text).toBe("Teste"); // herdado
    expect(img.repetida).toBe(false);
  });

  it("galeria: por padrão só a última versão de cada imagem; todas_versoes traz as duas; detalhe mostra o histórico", async () => {
    const so = await rpc(EDITOR, "app_ch_doc_imagens", { p_filtro: { busca: "teste.png" } });
    expect(so.itens.map((x: any) => x.version)).toEqual([2]);
    const todas = await rpc(EDITOR, "app_ch_doc_imagens", { p_filtro: { busca: "teste.png", todas_versoes: true } });
    expect(todas.itens.map((x: any) => x.version).sort()).toEqual([1, 2]);
    const d = await rpc(EDITOR, "app_ch_doc_imagem", { p_id: imageId });
    expect(d.versoes.map((x: any) => x.version)).toEqual([1, 2]);
    expect(d.historico.map((h: any) => h.acao)).toEqual(["enviada", "nova_versao"]);
    expect(d.historico[0].por).toBe("ed83@t.dev");
  });
});

describe("4. Funções app_*", () => {
  let imgId: string;
  let imgFamily: string;
  beforeAll(async () => {
    const res = await sql(`select public.ch_worker_doc_imagem_registrar($1, $2::jsonb) r`, [EDITOR, JSON.stringify({
      storage_path: "cc/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.jpg",
      sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      mime: "image/jpeg", width: 100, height: 100, bytes: 1000, alt_text: "Busca123", unit_id: unitId
    })]);
    imgId = res[0].r.id;
    imgFamily = res[0].r.family_id;
  });

  it("EDITOR lista na galeria, busca por texto", async () => {
    const res = await rpc(EDITOR, "app_ch_doc_imagens", { p_filtro: { busca: "Busca123" } });
    expect(res.itens.length).toBeGreaterThan(0);
    expect(res.itens[0].id).toBe(imgId);
    expect(JSON.stringify(res)).not.toMatch(/[0-9a-f]{2}\/[0-9a-f]{64}/);
  });

  it("detalhe com versoes e historico", async () => {
    const res = await rpc(EDITOR, "app_ch_doc_imagem", { p_id: imgId });
    expect(res.imagem.id).toBe(imgId);
    expect(res.versoes.length).toBeGreaterThan(0);
    expect(res.historico.length).toBeGreaterThan(0);
    expect(JSON.stringify(res)).not.toMatch(/[0-9a-f]{2}\/[0-9a-f]{64}/);
  });

  it("muda texto alternativo e recusa > 500", async () => {
    const res = await rpc(EDITOR, "app_ch_doc_imagem_texto_alternativo", { p_id: imgId, p_texto: "NovoTexto" });
    expect(res.alt_text).toBe("NovoTexto");
    await expect(rpc(EDITOR, "app_ch_doc_imagem_texto_alternativo", { p_id: imgId, p_texto: "x".repeat(501) })).rejects.toThrow();
  });

  it("arquiva e restaura", async () => {
    await rpc(EDITOR, "app_ch_doc_imagem_arquivar", { p_id: imgId, p_arquivar: true });
    let lista = await rpc(EDITOR, "app_ch_doc_imagens", { p_filtro: { busca: "NovoTexto" } }); // default arquivadas=false
    expect(lista.itens.length).toBe(0);
    
    lista = await rpc(EDITOR, "app_ch_doc_imagens", { p_filtro: { busca: "NovoTexto", arquivadas: true } });
    expect(lista.itens.length).toBeGreaterThan(0);

    await rpc(EDITOR, "app_ch_doc_imagem_arquivar", { p_id: imgId, p_arquivar: false });
    lista = await rpc(EDITOR, "app_ch_doc_imagens", { p_filtro: { busca: "NovoTexto" } });
    expect(lista.itens.length).toBeGreaterThan(0);
  });

  it("ALUNO e visitante são recusados nas app_*", async () => {
    await expect(rpc(ALUNO, "app_ch_doc_imagens", {})).rejects.toThrow(/acesso restrito/i);
    await expect(rpc(ALUNO, "app_ch_doc_imagem", { p_id: imgId })).rejects.toThrow(/acesso restrito/i);
    await expect(rpc(null, "app_ch_doc_imagens", {})).rejects.toThrow();
  });
});

describe("5. RLS", () => {
  it("EDITOR pode dar select, ALUNO vê 0 linhas, nenhum pode insert/update/delete", async () => {
    const r1 = await asUser(EDITOR, `select count(*) from public.ch_doc_assets`);
    expect(parseInt(r1[0].count)).toBeGreaterThan(0);

    const r2 = await asUser(ALUNO, `select count(*) from public.ch_doc_assets`);
    expect(parseInt(r2[0].count)).toBe(0);

    const valida = `(gen_random_uuid(), '${"1".repeat(2)}/${"1".repeat(64)}.png', '${"1".repeat(64)}', 'image/png', 1, 1, 1)`;
    for (const quem of [ALUNO, EDITOR]) {
      await expect(asUser(quem, `insert into public.ch_doc_assets (family_id, storage_path, sha256, mime, width, height, bytes) values ${valida}`)).rejects.toThrow(/permission denied/);
      await expect(asUser(quem, `update public.ch_doc_assets set alt_text = 'x'`)).rejects.toThrow(/permission denied/);
      await expect(asUser(quem, `delete from public.ch_doc_assets`)).rejects.toThrow(/permission denied/);
      await expect(asUser(quem, `delete from public.ch_doc_asset_events`)).rejects.toThrow(/permission denied/);
    }
    expect((await asUser(ALUNO, `select count(*)::int n from public.ch_doc_asset_events`))[0].n).toBe(0);
  });

  it("ALUNO/EDITOR não executam as ch_worker_* nem a função interna (permission denied)", async () => {
    const zero = "00000000-0000-4000-8000-000000000000";
    for (const quem of [ALUNO, EDITOR]) {
      await expect(rpc(quem, "ch_worker_doc_imagem_aluno", { p_id: zero })).rejects.toThrow(/permission denied/);
      await expect(rpc(quem, "ch_worker_doc_imagem_arquivo", { p_actor: quem, p_id: zero })).rejects.toThrow(/permission denied/);
      await expect(rpc(quem, "ch_worker_doc_imagem_links", { p_actor: quem, p_ids: `{${zero}}` })).rejects.toThrow(/permission denied/);
      await expect(rpc(quem, "ch_worker_doc_imagem_registrar", { p_actor: quem, p_asset: {} })).rejects.toThrow(/permission denied/);
    }
  });
});

describe("6. Arquivo para equipe", () => {
  let imgId: string;
  beforeAll(async () => {
    const res = await sql(`select public.ch_worker_doc_imagem_registrar($1, $2::jsonb) r`, [EDITOR, JSON.stringify({
      storage_path: "dd/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.png",
      sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      mime: "image/png", width: 10, height: 10, bytes: 10, unit_id: unitId
    })]);
    imgId = res[0].r.id;
  });

  it("ch_worker_doc_imagem_arquivo com EDITOR e REVISOR devolve {caminho, tipo}; ALUNO -> 42501", async () => {
    const r1 = await sql(`select public.ch_worker_doc_imagem_arquivo($1, $2) r`, [EDITOR, imgId]);
    expect(r1[0].r.caminho).toMatch(/^dd\//);

    const r2 = await sql(`select public.ch_worker_doc_imagem_arquivo($1, $2) r`, [REVISOR, imgId]);
    expect(r2[0].r.caminho).toMatch(/^dd\//);

    await expect(sql(`select public.ch_worker_doc_imagem_arquivo($1, $2) r`, [ALUNO, imgId])).rejects.toThrow(/acesso restrito/);
  });

  it("ch_worker_doc_imagem_links", async () => {
    const r = await sql(`select public.ch_worker_doc_imagem_links($1, $2) r`, [EDITOR, `{${imgId}}`]);
    expect(r[0].r[0].id).toBe(imgId);
    expect(r[0].r[0].caminho).toMatch(/^dd\//);
    
    const ids = Array(101).fill(imgId).join(',');
    await expect(sql(`select public.ch_worker_doc_imagem_links($1, '{${ids}}') r`, [EDITOR])).rejects.toThrow(/No máximo 100/);
  });
});

describe("7. Aluno: ch_worker_doc_imagem_aluno", () => {
  let imgId: string;
  let imgNaoPub: string;
  beforeAll(async () => {
    const res = await sql(`select public.ch_worker_doc_imagem_registrar($1, $2::jsonb) r`, [EDITOR, JSON.stringify({
      storage_path: "ee/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png",
      sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      mime: "image/png", width: 10, height: 10, bytes: 10, unit_id: unitId
    })]);
    imgId = res[0].r.id;
    
    const res2 = await sql(`select public.ch_worker_doc_imagem_registrar($1, $2::jsonb) r`, [EDITOR, JSON.stringify({
      storage_path: "ff/ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff.png",
      sha256: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      mime: "image/png", width: 10, height: 10, bytes: 10, unit_id: unitId
    })]);
    imgNaoPub = res2[0].r.id;
  }, 120_000);

  it("GR-001 ainda NÃO publicada recusa", async () => {
    await expect(sql(`select public.ch_worker_doc_imagem_aluno($1)`, [imgId])).rejects.toThrow(/Imagem não encontrada/);
  });

  it("Depois de publicar com o conteúdo inserido entrega; retirar recusa", async () => {
    // Aprova e publica (SÓ no banco de simulação), como em aulaAlunoBanco.test.ts
    await rpc(EDITOR, "app_ch_review_sheet_import", { p_version_id: versao, p_sheet: FICHA });
    for (const n of [1, 2, 3, 4, 5, 6]) await rpc(ADMIN, "app_ch_review_decide", { p_version_id: versao, p_n: n, p_decision: "de_acordo" });
    await rpc(EDITOR, "app_ch_submit_for_review", { p_version_id: versao }).catch(() => undefined);
    await rpc(ADMIN, "app_ch_approve", { p_version_id: versao, p_kind: "medical", p_note: "ok" });
    const criticas = (await sql(`select c.id from public.ch_claims c join public.ch_unit_claims uc on uc.claim_id = c.id where uc.unit_version_id = $1 and cardinality(c.critical_kinds) > 0 and c.critical_checked_by is null`, [versao])).map((x) => x.id);
    for (const id of criticas) await rpc(ADMIN, "app_ch_confirm_critical", { p_claim_id: id });
    await rpc(EDITOR, "app_ch_approve", { p_version_id: versao, p_kind: "editorial" });
    for (const m of await sql(`select id, content_hash from public.ch_materials where unit_version_id = $1 and kind in ('lesson', 'visual_cards')`, [versao]))
      await sql(`select public.ch_worker_save_render($1::jsonb)`, [JSON.stringify({ material_id: m.id, format: "pdf", storage_path: `renders/${m.id}.pdf`, sha256: sha(m.id), template_version: "t", brand_version: "b", material_hash: m.content_hash, check_result: { ok: true } })]);
    await rpc(ADMIN, "app_admin_vigilance_set_gate", { p_mode: "aviso" });
    await rpc(ADMIN, "app_ch_unit_publish", { p_version_id: versao, p_options: { confirm_similar: true } });
    expect(await rpc(ALUNO, "app_temas_com_aula")).toEqual(["GR-001"]);
    aulaId = (await sql(`select id from public.lessons where published limit 1`))[0].id;

    // Ainda não inseriu no json
    await expect(sql(`select public.ch_worker_doc_imagem_aluno($1)`, [imgId])).rejects.toThrow(/Imagem não encontrada/);

    // Insere imagem no rico
    const rico = { f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "figura", attrs: { asset: imgId, largura: 60 } }] } };
    await sql(`update public.ch_unit_versions set content = jsonb_set(content, '{sections,0,paragraphs,0,rico}', $1::jsonb) where id = $2`, [JSON.stringify(rico), versao]);
    // a aula do aluno (app_tema_aula) leva só o id da imagem, nunca o caminho do depósito
    const aula = await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" });
    expect(JSON.stringify(aula)).toContain(imgId);
    expect(JSON.stringify(aula)).not.toMatch(/[0-9a-f]{2}\/[0-9a-f]{64}/);
    
    const r = await sql(`select public.ch_worker_doc_imagem_aluno($1) r`, [imgId]);
    expect(r[0].r.caminho).toMatch(/^ee\//);

    // Não referenciada
    await expect(sql(`select public.ch_worker_doc_imagem_aluno($1)`, [imgNaoPub])).rejects.toThrow(/Imagem não encontrada/);

    // Retirar publicação
    await sql(`update public.ch_publications set retired_at = now() where unit_version_id = $1`, [versao]);
    await expect(sql(`select public.ch_worker_doc_imagem_aluno($1)`, [imgId])).rejects.toThrow(/Imagem não encontrada/);
    
    // Restaura
    await sql(`update public.ch_publications set retired_at = null where unit_version_id = $1`, [versao]);
  });
  
  it("Editar aula (lessons.summary_rico, migração 013040 do M13): aula publicada que usa a imagem entrega; despublicada recusa", async () => {
    await sql(`alter table public.lessons add column if not exists summary_rico jsonb`);
    // com a 013040 o resumo rico só fica guardado junto de um resumo em texto (sem texto, a guarda apaga o rico)
    const rico = { f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "figura", attrs: { asset: imgNaoPub } }] } };
    const [{ id }] = await sql(`insert into public.lessons (area, topic, title, published, summary, summary_rico) values ((select enum_range(null::public.med_area))[1], 'Teste', 'Aula de teste M11a', true, 'Resumo com figura', $1::jsonb) returning id`, [JSON.stringify(rico)]);
    try {
      const r = await sql(`select public.ch_worker_doc_imagem_aluno($1) r`, [imgNaoPub]);
      expect(r[0].r.caminho).toMatch(/^ff\//);
      await sql(`update public.lessons set published = false where id = $1`, [id]);
      await expect(sql(`select public.ch_worker_doc_imagem_aluno($1)`, [imgNaoPub])).rejects.toThrow(/Imagem não encontrada/);
    } finally {
      await sql(`delete from public.lessons where id = $1`, [id]);
    }
  });
});

describe("8. Desfazer e colar de novo", () => {
  it("o desfazer tira tabelas e funções (depósito vazio sai); colar de novo volta tudo e o conferir dá OK", async () => {
    await db.exec(desfazer);
    expect((await sql(`select to_regclass('public.ch_doc_assets') t`))[0].t).toBeNull();
    expect((await sql(`select to_regprocedure('public.ch_worker_doc_imagem_aluno(uuid)') f`))[0].f).toBeNull();
    expect(await sql(`select 1 from storage.buckets where id = 'doc-imagens'`)).toHaveLength(0);
    expect((await sql(conferir))[0].resultado).toMatch(/^FALTA: /);
    await db.exec(migracao);
    expect((await sql(conferir))[0].resultado).toMatch(/^OK/);
    expect((await rpc(EDITOR, "app_ch_doc_imagens", {})).itens).toEqual([]);
  }, 120_000);
});
