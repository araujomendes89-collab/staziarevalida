// @vitest-environment node
/**
 * Editor profissional, expansão — Central de Conteúdo + Aulas (migração 013160), no banco de simulação (PGlite; nada em produção).
 * As 4 provas do brief:
 *   (1) SÓ formatação não derruba: legenda/transcrição de material (aprovações da versão ficam) e pontos-chave da aula (conferência fica);
 *   (2) conteúdo derruba: texto novo ou formatação que traz conteúdo (nível de título) derruba aprovação / pede conferência;
 *   (3) o aluno só recebe o que já pode ver: aula publicada, mídia ativa do aluno (nada de material da equipe), pontos inteiros;
 *   (4) item antigo sem formatação: app_tema_aula / app_lesson respondem IGUAL ao corpo de antes (desfazer ensaiado aqui).
 * E o ensaio do 013160-conferir.sql e 013160-desfazer.sql: aplicar → conferir OK → desfazer → funções e tabelas iguais às de antes.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { ADMIN, ALUNO, EDITOR, REVISOR, criarUsuarios, rpcFor, sqlFor, type Rpc, type Sql } from "./helpers/publicacaoCentral";
import { sha } from "./helpers/centralUnidades";
import { materialParaSalvar, pontosParaSalvar, ricoDoMaterial, ricoDoPonto } from "../shared/aulas/camposRicos";

const ROOT = path.resolve(__dirname, "../..");
const MIG = path.join(ROOT, "supabase/migrations");
const NOSSA = "20261003013160_editor_pro_central_aulas.sql";
const SQLS = "/Volumes/StaziaMed/.tmp-aulas/editor-pro/sql";
const ler = (p: string) => fs.readFileSync(p, "utf8");
const fx = (n: string) => JSON.parse(ler(path.join(__dirname, "fixtures", n)));
const PACOTE = fx("aula-pronta-GR-001-v3.json");
const FONTES = fx("aula-pronta-GR-001-v3-fontes.json").fontes;
const FICHA = fx("ficha-revisor-GR-001-v3.json");

const txt = (t: string, marks?: any[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const env = (content: any[]) => ({ f: "sdoc", v: 1, doc: { type: "doc", content } });
const par = (inline: any[], attrs?: any) => env([{ type: "paragraph", ...(attrs ? { attrs } : {}), content: inline }]);
const titulo = (t: string) => env([{ type: "heading", attrs: { level: 4 }, content: [txt(t)] }]);

const LEGENDA = "Vídeo curto sobre a febre";
const TRANSCRICAO = "Febre alta exige avaliação no mesmo dia";
const negritoLegenda = par([txt("Vídeo curto", [{ type: "bold" }]), txt(" sobre a febre")]);
const corLegenda = par([txt("Vídeo curto", [{ type: "italic" }, { type: "textStyle", attrs: { color: "#c00000" } }]), txt(" sobre a febre")], { textAlign: "center" });
const tachadoTranscricao = par([txt("Febre alta", [{ type: "strike" }]), txt(" exige avaliação no mesmo dia")]);

let db: PGlite;
let sql: Sql;
let rpc: Rpc;
let versao: string;
let video: string;   // vídeo do aluno COM formatação
let antigo: string;  // vídeo do aluno SEM formatação (como os de hoje)
let equipe: string;  // vídeo só da equipe com formatação
let aulaId: string;
let antesDaMigracao: Awaited<ReturnType<typeof retrato>>;

async function retrato() {
  const q = async (s: string) => (await db.query<Record<string, string>>(s)).rows.map((r) => Object.values(r).join(" | "));
  return {
    funcoes: await q(`select p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid)), coalesce(array_to_string(p.proacl, ','), '')
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' order by 1`),
    colunas: await q(`select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' order by 1, 2`),
    gatilhos: await q(`select c.relname, t.tgname, md5(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                        join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal order by 1, 2`),
    regras: await q(`select conrelid::regclass::text, conname, md5(pg_get_constraintdef(oid)) from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
  };
}
const aprovacoesValidas = async () => Number((await sql(`select count(*)::int n from public.ch_approvals where unit_version_id = $1 and invalidated_at is null`, [versao]))[0].n);
const conteudo = async (id: string) => (await sql(`select content from public.ch_unit_materials where id = $1`, [id]))[0].content;
const conferir = async () => (await db.exec(ler(path.join(SQLS, "013160-conferir.sql")))).map((r) => r.rows[0]);
const midia = (aula: any, titulo: string) => aula.midias.find((m: any) => m.titulo === titulo);
// tira da resposta nova só o que a 013160 acrescenta (para comparar com o corpo de antes)
const semFormatacao = (aula: any) => {
  const { pontos_chave_ricos: _p, ...resto } = aula;
  return { ...resto, midias: aula.midias.map(({ formatacao: _f, ...m }: any) => m) };
};

beforeAll(async () => {
  // banco com TODAS as migrações menos a 013160 → retrato de "antes" → aplica a 013160 (colada duas vezes: não muda nada)
  db = new PGlite();
  await db.exec(ler(path.join(ROOT, "supabase/tests/bootstrap.sql")));
  for (const f of fs.readdirSync(MIG).filter((f) => f.endsWith(".sql") && !f.startsWith("._") && f !== NOSSA).sort()) await db.exec(ler(path.join(MIG, f)));
  sql = sqlFor(db);
  rpc = rpcFor(db);
  await criarUsuarios(sql);
  antesDaMigracao = await retrato();
  await db.exec(ler(path.join(MIG, NOSSA)));
  const uma = await retrato();
  await db.exec(ler(path.join(MIG, NOSSA)));
  expect(await retrato()).toEqual(uma);

  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CLINICA_MEDICA') on conflict do nothing`, [REVISOR]);
  await sql(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`);
  for (const f of FONTES) {
    const r = await rpc(ADMIN, "app_ch_register_source", { p_source: { title: f.title, organ: f.organ, kind: f.kind, url: f.url, version: f.version } });
    await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: r.id, p_level: f.level });
  }
  versao = (await rpc(EDITOR, "app_ch_import_lesson_package", { p_package: PACOTE })).version_id;
}, 600_000);

describe("conferir (013160-conferir.sql) logo depois de colar", () => {
  it("primeira linha toda true; nenhum material/aula formatado ainda", async () => {
    const [linha, , contagens] = await conferir();
    expect(Object.values(linha).every((x) => x === true), JSON.stringify(linha)).toBe(true);
    expect(contagens).toEqual({ materiais_com_formatacao: 0, aulas_com_pontos_formatados: 0 });
  });
});

describe("Materiais da unidade: legenda e transcrição com formatação", () => {
  it("inserir guarda content.formatacao só dos campos com texto; a tela manda a mesma coisa que o banco guarda", async () => {
    const g = materialParaSalvar({ legenda: `  ${LEGENDA} `, transcricao: TRANSCRICAO }, { legenda: negritoLegenda, transcricao: null });
    expect(g).toEqual({ textos: { legenda: LEGENDA, transcricao: TRANSCRICAO }, formatacao: { legenda: negritoLegenda } });
    video = (await rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: {
      kind: "video", title: "Vídeo formatado", url: "https://youtu.be/dQw4w9WgXcQ", duration_seconds: 90, position: 1,
      caption: g.textos.legenda, transcript: g.textos.transcricao, formatacao: { ...g.formatacao, nota: negritoLegenda } } })).id;
    expect(await conteudo(video)).toEqual({ legenda: LEGENDA, transcricao: TRANSCRICAO, formatacao: { legenda: negritoLegenda } }); // chave estranha fica fora
    antigo = (await rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: {
      kind: "audio", title: "Áudio antigo", url: "https://vimeo.com/123456789", duration_seconds: 60, position: 1, caption: "Legenda simples" } })).id;
    expect(await conteudo(antigo)).toEqual({ legenda: "Legenda simples" }); // sem formatação: igual a hoje (nem a chave)
    equipe = (await rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: {
      kind: "video", title: "Vídeo da equipe", visibility: "equipe", url: "https://youtu.be/dQw4w9WgXcQ", duration_seconds: 30, caption: LEGENDA, formatacao: { legenda: negritoLegenda } } })).id;
    await expect(rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: {
      kind: "video", title: "Forma ruim", url: "https://youtu.be/dQw4w9WgXcQ", duration_seconds: 30, caption: "x", formatacao: { legenda: { f: "x" } } } })).rejects.toThrow(/formato inválido/);
    // a lista da equipe traz a formatação para a janela de edição
    const lista = await rpc(EDITOR, "app_ch_unit_materials", { p_version_id: versao });
    expect(lista.find((x: any) => x.id === video).content.formatacao).toEqual({ legenda: negritoLegenda });
  });

  it("aluno e revisor não mudam legenda/transcrição; tabela e outros materiais não têm esse campo", async () => {
    await expect(rpc(ALUNO, "app_ch_unit_material_textos", { p_item_id: video, p_item: { formatacao: null } })).rejects.toThrow(/administrador ou editor/);
    await expect(rpc(REVISOR, "app_ch_unit_material_textos", { p_item_id: video, p_item: { formatacao: null } })).rejects.toThrow(/administrador ou editor/);
    await expect(rpc(null, "app_ch_unit_material_textos", { p_item_id: video, p_item: {} })).rejects.toThrow();
    const texto = (await sql(`select id from public.ch_unit_materials where unit_version_id = $1 and kind = 'texto_aula'`, [versao]))[0].id;
    await expect(rpc(EDITOR, "app_ch_unit_material_textos", { p_item_id: texto, p_item: { caption: "x" } })).rejects.toThrow(/Só áudio e vídeo/);
  });

  it("(1) depois da aprovação médica, SÓ formatação (cor, alinhamento, tachado) não derruba a aprovação", async () => {
    await rpc(EDITOR, "app_ch_review_sheet_import", { p_version_id: versao, p_sheet: FICHA });
    for (const n of [1, 2, 3, 4, 5, 6]) await rpc(ADMIN, "app_ch_review_decide", { p_version_id: versao, p_n: n, p_decision: "de_acordo" });
    await rpc(EDITOR, "app_ch_submit_for_review", { p_version_id: versao }).catch(() => undefined);
    await rpc(ADMIN, "app_ch_approve", { p_version_id: versao, p_kind: "medical", p_note: "ok" });
    expect(await aprovacoesValidas()).toBe(1);
    const r = await rpc(EDITOR, "app_ch_unit_material_textos", { p_item_id: video, p_item: { caption: LEGENDA, transcript: TRANSCRICAO, formatacao: { legenda: corLegenda, transcricao: tachadoTranscricao } } });
    expect(r).toMatchObject({ so_formatacao: true });
    expect(await aprovacoesValidas()).toBe(1);
    expect((await conteudo(video)).formatacao).toEqual({ legenda: corLegenda, transcricao: tachadoTranscricao });
    const log = await sql(`select details from public.ch_audit where action = 'unit.material.format' and target = $1`, [versao]);
    expect(log).toHaveLength(1);
    expect(log[0].details).toMatchObject({ item: video, antes: { legenda: negritoLegenda } });
    // mandar de novo o mesmo: nada muda, nada registra
    expect(await rpc(EDITOR, "app_ch_unit_material_textos", { p_item_id: video, p_item: { caption: LEGENDA, transcript: TRANSCRICAO, formatacao: { legenda: corLegenda, transcricao: tachadoTranscricao } } })).toMatchObject({ sem_mudanca: true });
    // tirar a formatação toda também é só formatação
    expect(await rpc(EDITOR, "app_ch_unit_material_textos", { p_item_id: video, p_item: { formatacao: null } })).toMatchObject({ so_formatacao: true });
    expect(await conteudo(video)).toEqual({ legenda: LEGENDA, transcricao: TRANSCRICAO });
    expect(await aprovacoesValidas()).toBe(1);
  });

  it("(2) conteúdo derruba: virar título (nível é conteúdo) ou mudar o texto de material do aluno; material da equipe não derruba", async () => {
    expect(await rpc(EDITOR, "app_ch_unit_material_textos", { p_item_id: equipe, p_item: { caption: "Legenda nova da equipe" } })).toMatchObject({ so_formatacao: false });
    expect(await aprovacoesValidas()).toBe(1);
    expect(await rpc(EDITOR, "app_ch_unit_material_textos", { p_item_id: video, p_item: { formatacao: { legenda: titulo(LEGENDA) } } })).toMatchObject({ so_formatacao: false });
    expect(await aprovacoesValidas()).toBe(0);
    const log = await sql(`select details from public.ch_audit where action = 'unit.material.edit' and target = $1 order by id`, [versao]);
    expect(log.map((l: any) => l.details.item)).toEqual(expect.arrayContaining([equipe, video]));
    // texto novo também é conteúdo; e a trava de citação vale como no inserir
    await expect(rpc(EDITOR, "app_ch_unit_material_textos", { p_item_id: video, p_item: { caption: "Veja [1]" } })).rejects.toThrow(/referência/);
    expect(await rpc(EDITOR, "app_ch_unit_material_textos", { p_item_id: video, p_item: { caption: LEGENDA, formatacao: { legenda: negritoLegenda } } })).toMatchObject({ so_formatacao: false });
    expect(await conteudo(video)).toEqual({ legenda: LEGENDA, transcricao: TRANSCRICAO, formatacao: { legenda: negritoLegenda } });
  });

  it("(3) antes de publicar o aluno não recebe nada (nem formatação)", async () => {
    expect(await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" })).toBeNull();
  });
});

describe("publicada (SÓ no banco de simulação)", () => {
  let aula: any;
  beforeAll(async () => {
    await rpc(EDITOR, "app_ch_submit_for_review", { p_version_id: versao }).catch(() => undefined);
    await rpc(ADMIN, "app_ch_approve", { p_version_id: versao, p_kind: "medical", p_note: "ok de novo" });
    const criticas = (await sql(`select c.id from public.ch_claims c join public.ch_unit_claims uc on uc.claim_id = c.id where uc.unit_version_id = $1 and cardinality(c.critical_kinds) > 0 and c.critical_checked_by is null`, [versao])).map((x) => x.id);
    for (const id of criticas) await rpc(ADMIN, "app_ch_confirm_critical", { p_claim_id: id });
    await rpc(EDITOR, "app_ch_approve", { p_version_id: versao, p_kind: "editorial" });
    for (const m of await sql(`select id, content_hash from public.ch_materials where unit_version_id = $1 and kind in ('lesson', 'visual_cards')`, [versao]))
      await sql(`select public.ch_worker_save_render($1::jsonb)`, [JSON.stringify({ material_id: m.id, format: "pdf", storage_path: `renders/${m.id}.pdf`, sha256: sha(m.id), template_version: "t", brand_version: "b", material_hash: m.content_hash, check_result: { ok: true } })]);
    await rpc(ADMIN, "app_admin_vigilance_set_gate", { p_mode: "aviso" });
    await rpc(ADMIN, "app_ch_unit_publish", { p_version_id: versao, p_options: { confirm_similar: true } });
    aulaId = (await sql(`select id from public.lessons where published and origin = 'central' limit 1`))[0].id;
    aula = await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" });
  }, 300_000);

  it("(3) o aluno recebe a formatação válida só da mídia dele; mídia antiga sem a chave; nada da equipe", async () => {
    expect(midia(aula, "Vídeo formatado").formatacao).toEqual({ legenda: negritoLegenda });
    expect(ricoDoMaterial(midia(aula, "Vídeo formatado").formatacao, "legenda", midia(aula, "Vídeo formatado").legenda)).not.toBeNull();
    expect("formatacao" in midia(aula, "Áudio antigo")).toBe(false);
    expect(midia(aula, "Vídeo da equipe")).toBeUndefined();
    expect(JSON.stringify(aula)).not.toContain("Legenda nova da equipe");
    expect("pontos_chave_ricos" in aula).toBe(false); // aula sem pontos formatados: a chave nem aparece
  });

  it("(1) versão NO AR: só formatação passa (o aluno vê na hora) e a aprovação fica; texto novo é recusado", async () => {
    const validas = await aprovacoesValidas();
    expect(await rpc(EDITOR, "app_ch_unit_material_textos", { p_item_id: video, p_item: { formatacao: { legenda: corLegenda } } })).toMatchObject({ so_formatacao: true, status: "published" });
    expect(await aprovacoesValidas()).toBe(validas);
    expect(midia(await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" }), "Vídeo formatado").formatacao).toEqual({ legenda: corLegenda });
    await expect(rpc(EDITOR, "app_ch_unit_material_textos", { p_item_id: video, p_item: { caption: "Outra legenda" } })).rejects.toThrow(/crie a versão para corrigir/);
    await expect(rpc(EDITOR, "app_ch_unit_material_textos", { p_item_id: video, p_item: { formatacao: { legenda: titulo(LEGENDA) } } })).rejects.toThrow(/crie a versão para corrigir/);
    expect((await conteudo(video)).legenda).toBe(LEGENDA);
  });

  it("formatação com forma inválida guardada por fora não chega ao aluno; campo sem texto também não", async () => {
    await sql(`update public.ch_unit_materials set content = content || '{"formatacao": {"legenda": {"f": "x"}, "transcricao": {"f": "sdoc", "v": 1, "doc": {"type": "doc", "content": []}}}}'::jsonb where id = $1`, [antigo]);
    expect("formatacao" in midia(await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" }), "Áudio antigo")).toBe(false);
    await sql(`update public.ch_unit_materials set content = content - 'formatacao' where id = $1`, [antigo]);
  });

  it("pontos-chave da aula da Central: só mudam pela distribuição; quando têm formatação, app_tema_aula leva alinhado", async () => {
    const [{ key_points }] = await sql(`select key_points from public.lessons where id = $1`, [aulaId]);
    expect(key_points.length).toBeGreaterThan(0);
    const ricos = key_points.map((p: string, i: number) => (i === 0 ? par([txt(p, [{ type: "bold" }])]) : null));
    await expect(sql(`update public.lessons set key_points_rico = $2::jsonb where id = $1`, [aulaId, JSON.stringify(ricos)])).rejects.toThrow(/vem da Central/);
    await db.transaction(async (tx) => {
      await tx.query(`select set_config('app.ch_distribute', 'on', true)`);
      await tx.query(`update public.lessons set key_points_rico = $2::jsonb where id = $1`, [aulaId, JSON.stringify(ricos)]);
    });
    const a = await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" });
    expect(a.pontos_chave_ricos).toEqual(ricos);
    expect(ricoDoPonto(a.pontos_chave_ricos, 0, a.pontos_chave[0])).not.toBeNull();
    // devolve como estava
    await db.transaction(async (tx) => {
      await tx.query(`select set_config('app.ch_distribute', 'on', true)`);
      await tx.query(`update public.lessons set key_points_rico = null where id = $1`, [aulaId]);
    });
  });

  it("(4) item antigo sem formatação: a resposta é a MESMA do corpo de antes; desfazer volta funções e tabelas como antes", async () => {
    await rpc(EDITOR, "app_ch_unit_material_textos", { p_item_id: video, p_item: { formatacao: null } });   // tudo sem formatação, como hoje
    const novo = await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" });
    const novoAula = await rpc(ALUNO, "app_lesson", { p_id: aulaId });
    expect(novo).toEqual(semFormatacao(novo)); // nenhuma chave nova quando não há formatação
    expect("key_points_rico" in novoAula).toBe(false);

    await db.exec(ler(path.join(SQLS, "013160-desfazer.sql")));
    expect(await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" })).toEqual(novo);
    expect(await rpc(ALUNO, "app_lesson", { p_id: aulaId })).toEqual(novoAula);
    const [linha, , contagens] = await conferir();
    expect(linha.funcao_textos_material).toBe(false);
    expect(linha.coluna_pontos_rico).toBe(false);
    expect(linha.resumo_rico_continua).toBe(true);
    expect(contagens.aulas_com_pontos_formatados).toBe(0);
    expect(await retrato()).toEqual(antesDaMigracao);
    await db.exec(ler(path.join(SQLS, "013160-desfazer.sql"))); // colar duas vezes não quebra
    expect(await retrato()).toEqual(antesDaMigracao);

    // e de volta: a migração de novo, mesma resposta, conferir OK
    await db.exec(ler(path.join(MIG, NOSSA)));
    expect(await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" })).toEqual(novo);
    const [l2] = await conferir();
    expect(Object.values(l2).every((x) => x === true), JSON.stringify(l2)).toBe(true);
  });

  it("(4) com formatação: tirando só as chaves novas, a resposta é a mesma do corpo de antes", async () => {
    await rpc(EDITOR, "app_ch_unit_material_textos", { p_item_id: video, p_item: { formatacao: { legenda: negritoLegenda } } });
    const novo = await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" });
    expect(midia(novo, "Vídeo formatado").formatacao).toEqual({ legenda: negritoLegenda });
    const de013020 = ler(path.join(MIG, "20261003013020_editor_pro_ricos_aluno.sql"));
    await db.exec(de013020);
    try {
      expect(await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" })).toEqual(semFormatacao(novo));
    } finally {
      await db.exec(ler(path.join(MIG, NOSSA)));
    }
  });
});

describe("Editar aula: pontos-chave com formatação (lessons.key_points_rico)", () => {
  const P1 = "Febre alta e [guia](https://www.gov.br/saude) hoje";
  const P2 = "Oxigênio se saturação baixa";
  const negrito = par([txt("Febre alta", [{ type: "bold" }]), txt(" e "), txt("guia", [{ type: "link", attrs: { href: "https://www.gov.br/saude" } }]), txt(" hoje")]);
  const corEAlinhado = par([txt("Febre alta", [{ type: "bold" }, { type: "textStyle", attrs: { color: "#ff0000" } }]), txt(" e "), txt("guia", [{ type: "link", attrs: { href: "https://www.gov.br/saude" } }]), txt(" hoje")], { textAlign: "center" });
  const base = (extra: Record<string, unknown> = {}) => ({ area: "PEDIATRIA", topic: "Febre", title: "Aula de pontos formatados", summary: "Resumo.", published: true, ...extra });
  let id: string;

  it("salvar: pontos vazios saem junto com a formatação deles; a tela manda o mesmo que o banco guarda", async () => {
    const tela = pontosParaSalvar(`${P1}\n\n  ${P2}  `, [negrito, null, null]);
    expect(tela).toEqual({ key_points: [P1, P2], key_points_rico: [negrito, null] });
    const criada = await rpc(EDITOR, "app_admin_save_lesson", { p_lesson: base({ key_points: [P1, "  ", P2], key_points_rico: [negrito, corEAlinhado, null], review_note: "Conferido o texto da aula." }) });
    id = criada.id;
    expect(criada.key_points).toEqual([P1, P2]);
    expect(criada.key_points_rico).toEqual([negrito, null]); // a entrada do ponto vazio saiu com ele
    const aluno = await rpc(ALUNO, "app_lesson", { p_id: id });
    expect(aluno.key_points_rico).toEqual([negrito, null]);
    expect(ricoDoPonto(aluno.key_points_rico, 0, aluno.key_points[0])).not.toBeNull();
    // sem nenhuma formatação: nulo (aula como as de hoje)
    const simples = await rpc(EDITOR, "app_admin_save_lesson", { p_lesson: base({ title: "Aula simples", key_points: [P1], key_points_rico: [null], review_note: "Conferido o texto da aula." }) });
    expect("key_points_rico" in (await rpc(ALUNO, "app_lesson", { p_id: simples.id }))).toBe(false);
  });

  it("(1) aula publicada: só formatação dos pontos salva SEM nova conferência e a conferência registrada não muda", async () => {
    const [rev0] = await sql(`select reviewed_by, reviewed_at, review_note from public.lesson_reviews where lesson_id = $1`, [id]);
    const salva = await rpc(EDITOR, "app_admin_save_lesson", { p_lesson: base({ id, key_points: [P1, P2], key_points_rico: [corEAlinhado, par([txt(P2, [{ type: "superscript" }])])] }) });
    expect(salva.key_points_rico).toEqual([corEAlinhado, par([txt(P2, [{ type: "superscript" }])])]);
    const [rev1] = await sql(`select reviewed_by, reviewed_at, review_note from public.lesson_reviews where lesson_id = $1`, [id]);
    expect(rev1).toEqual(rev0);
    const logs = await sql(`select details from public.admin_audit_log where action = 'lesson.format' and target = $1`, [id]);
    expect(logs).toHaveLength(1);
    expect(logs[0].details).toMatchObject({ pontos_chave: true, published: true });
    const save = await sql(`select details from public.admin_audit_log where action = 'lesson.save' and target = $1`, [id]);
    expect(save.every((s: any) => !("key_points_rico" in s.details))).toBe(true);
    // tirar a formatação toda: também só formatação
    expect((await rpc(EDITOR, "app_admin_save_lesson", { p_lesson: base({ id, key_points: [P1, P2], key_points_rico: [null, null] }) })).key_points_rico ?? null).toBeNull();
  });

  it("(2) conteúdo pede conferência: virar título, link diferente só no rico, ou texto novo", async () => {
    for (const ricos of [[titulo(P1), null], [par([txt("Febre alta e "), txt("guia", [{ type: "link", attrs: { href: "https://outro.gov.br" } }]), txt(" hoje")]), null]])
      await expect(rpc(EDITOR, "app_admin_save_lesson", { p_lesson: base({ id, key_points: [P1, P2], key_points_rico: ricos }) })).rejects.toThrow(/registre o que foi conferido/);
    await expect(rpc(EDITOR, "app_admin_save_lesson", { p_lesson: base({ id, key_points: [P1, "Outro ponto"], key_points_rico: [negrito, null] }) })).rejects.toThrow(/registre o que foi conferido/);
    // com a conferência registrada, passa
    expect((await rpc(EDITOR, "app_admin_save_lesson", { p_lesson: base({ id, key_points: [P1, P2], key_points_rico: [negrito, null], review_note: "Conferido de novo o texto." }) })).key_points_rico).toEqual([negrito, null]);
  });

  it("caminho que não conhece a formatação: fica só a dos pontos que continuam iguais; forma errada é recusada", async () => {
    await sql(`update public.lessons set key_points = array[$2, 'Ponto novo'] where id = $1`, [id, P1]);
    expect((await sql(`select key_points_rico from public.lessons where id = $1`, [id]))[0].key_points_rico).toEqual([negrito, null]);
    await sql(`update public.lessons set key_points = array['Mudou', 'Ponto novo'] where id = $1`, [id]);
    expect((await sql(`select key_points_rico from public.lessons where id = $1`, [id]))[0].key_points_rico).toBeNull();
    await expect(sql(`update public.lessons set key_points_rico = '[{"f": "x"}, null]'::jsonb where id = $1`, [id])).rejects.toThrow(/lessons_key_points_rico_forma/);
    await expect(sql(`update public.lessons set key_points_rico = '[null]'::jsonb where id = $1`, [id])).rejects.toThrow(/lessons_key_points_rico_forma/); // tamanho diferente
    // o app (app_admin_save_lesson) devolve a mensagem de sempre para forma errada
    await expect(rpc(EDITOR, "app_admin_save_lesson", { p_lesson: base({ id, key_points: ["Mudou", "Ponto novo"], key_points_rico: [{ f: "x" }, null], review_note: "Conferido o texto da aula." }) })).rejects.toThrow(/Dados da aula inválidos/);
  });

  it("(3) aluno: aula não publicada não chega; ponto que cita fonte complementar some e o rico dos pontos não vai", async () => {
    const rasc = await rpc(EDITOR, "app_admin_save_lesson", { p_lesson: base({ title: "Rascunho", published: false, key_points: [P1], key_points_rico: [negrito] }) });
    expect(await rpc(ALUNO, "app_lesson", { p_id: rasc.id })).toBeNull();
    const TITULO = "Sangue nos Olhos — Pontos 013160";
    const fonte = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level) values ($1, 'Editora Exemplo Ltda', 'final', 'https://apostilas.exemplo.invalid/p.pdf', '2026', 'A') returning id`, [TITULO]))[0].id;
    await rpc(ADMIN, "app_ch_set_source_audience", { p_source_id: fonte, p_audience: "complementar", p_reason: "Apostila" });
    // a equipe não grava rico que cita a apostila (guarda do rico dos pontos)
    await expect(rpc(EDITOR, "app_admin_save_lesson", { p_lesson: base({ id, key_points: ["Mudou", "Ponto novo"], key_points_rico: [par([txt(`Mudou ${TITULO}`)]), null], review_note: "Conferido o texto da aula." }) })).rejects.toThrow(/fonte complementar/);
    // dado antigo gravado por dentro: o ponto que cita some do aluno e o rico dos pontos não vai (a lista não chegou inteira)
    const ricos = [par([txt("Ponto limpo", [{ type: "bold" }])]), null];
    const antiga = (await sql(`insert into public.lessons (area, topic, title, summary, key_points, key_points_rico, published) values ('PEDIATRIA', 'Febre', 'Aula antiga', 'Resumo', array['Ponto limpo', $1], $2::jsonb, true) returning id`,
      [`Segundo o ${TITULO}`, JSON.stringify(ricos)]))[0].id;
    const aluno = await rpc(ALUNO, "app_lesson", { p_id: antiga });
    expect(aluno.key_points).toEqual(["Ponto limpo"]);
    expect("key_points_rico" in aluno).toBe(false);
    const equipe = (await rpc(EDITOR, "app_admin_lessons")).lessons.find((l: any) => l.id === antiga);
    expect(equipe.key_points_rico).toEqual(ricos);
  });
});
