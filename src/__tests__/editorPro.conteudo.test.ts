/**
 * Decisão do dono (16/10): mudança SÓ de formatação não derruba a aprovação dos revisores. Quem decide é o banco (migração 013080,
 * public.ch_conteudo_hash); o espelho em TypeScript (src/shared/docRico/conteudo.ts) tem de dar a MESMA resposta.
 * Banco de simulação (PGlite); nenhuma IA, nada de produção.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { abrirBanco, ADMIN, ALUNO, EDITOR, REVISOR, type Rpc, type Sql } from "./helpers/publicacaoCentral";
import { sha } from "./helpers/centralUnidades";
import { docParaUnidade, envelope, FORMATO_ATRIBUTOS, FORMATO_MARCAS, NOS_DO_TEXTO, ricoValido, soFormatacao, unidadeParaDoc } from "../shared/docRico";

const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8"));
const PACOTE = fx("aula-pronta-GR-001-v3.json");
const FONTES = fx("aula-pronta-GR-001-v3-fontes.json").fontes;
const FICHA = fx("ficha-revisor-GR-001-v3.json");

let db: any; let sql: Sql; let rpc: Rpc; let versao: string;

beforeAll(async () => {
  ({ db, sql, rpc } = await abrirBanco());
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CLINICA_MEDICA') on conflict do nothing`, [REVISOR]);
  await sql(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`);
  for (const f of FONTES) {
    const r = await rpc(ADMIN, "app_ch_register_source", { p_source: { title: f.title, organ: f.organ, kind: f.kind, url: f.url, version: f.version } });
    await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: r.id, p_level: f.level });
  }
  versao = (await rpc(EDITOR, "app_ch_import_lesson_package", { p_package: PACOTE })).version_id;
}, 300_000);

const conteudoDe = async (id: string) => (await sql(`select content, content_hash, status from public.ch_unit_versions where id = $1`, [id]))[0];
const mesmoNoBanco = async (a: unknown, b: unknown) => (await sql(`select public.ch_conteudo_hash($1::jsonb) = public.ch_conteudo_hash($2::jsonb) r`, [JSON.stringify(a), JSON.stringify(b)]))[0].r as boolean;
const aprovacoesValidas = async (id: string) =>
  Number((await sql(`select count(*)::int n from public.ch_approvals a join public.ch_unit_versions v on v.id = a.unit_version_id where a.unit_version_id = $1 and a.invalidated_at is null and a.content_hash = v.content_hash`, [id]))[0].n);

/** Negrito em todo o 1º parágrafo da 1ª seção, pelo caminho do editor (unidade → documento → unidade). */
function negritoNoPrimeiro(content: any) {
  const doc: any = unidadeParaDoc(content);
  const bloco = doc.content.find((b: any) => b.attrs?.ref === "0:0");
  for (const n of bloco.content ?? []) if (n.type === "text") n.marks = [...(n.marks ?? []).filter((m: any) => m.type !== "bold"), { type: "bold" }];
  return docParaUnidade(doc, content) as any;
}

describe("A regra: só formatação × conteúdo (banco e tela dão a mesma resposta)", () => {
  const P = (extra: Record<string, unknown> = {}) => ({ text: "Febre e [guia](https://www.gov.br/saude) hoje", clinical: true, claim_ids: ["c1"], ...extra });
  const C = (p: any, extra: Record<string, unknown> = {}) => ({ sections: [{ heading: "S", paragraphs: [p, { text: "outro", clinical: false, claim_ids: [] }] }], references: [{ t: "r" }], ...extra });
  const par = (inline: any[], attrs?: any) => envelope({ type: "doc", content: [{ type: "paragraph", ...(attrs ? { attrs } : {}), content: inline }] } as any);
  const txt = (t: string, marks?: any[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
  const link = { type: "link", attrs: { href: "https://www.gov.br/saude" } };
  const comFigura = (attrs: any) => envelope({ type: "doc", content: [{ type: "paragraph", content: [txt("Febre e "), txt("guia", [link]), txt(" hoje")] }, { type: "figura", attrs }] } as any);

  const casos: [string, unknown, unknown, boolean][] = [
    ["nada mudou", C(P()), C(P()), true],
    ["só página/estilos (doc_config)", C(P()), C(P(), { doc_config: { pagina: { tamanho: "A4" } } }), true],
    ["negrito, cor e alinhamento no rico, mesmo texto e mesmo link", C(P()), C(P({ rico: par([txt("Febre", [{ type: "bold" }, { type: "textStyle", attrs: { color: "#ff0000" } }]), txt(" e "), txt("guia", [link]), txt(" hoje")], { textAlign: "center" }) })), true],
    ["texto mudou", C(P()), C(P({ text: "Febre alta e [guia](https://www.gov.br/saude) hoje" })), false],
    ["'conteúdo clínico' mudou", C(P()), C(P({ clinical: false })), false],
    ["afirmação mudou", C(P()), C(P({ claim_ids: ["c2"] })), false],
    ["referências mudaram", C(P()), C(P(), { references: [] }), false],
    ["ordem dos parágrafos mudou", C(P()), { sections: [{ heading: "S", paragraphs: [{ text: "outro", clinical: false, claim_ids: [] }, P()] }], references: [{ t: "r" }] }, false],
    ["título da seção mudou", C(P()), { ...C(P()), sections: [{ ...C(P()).sections[0], heading: "S2" }] }, false],
    ["imagem inserida", C(P()), C(P({ rico: comFigura({ asset: "a1", alt: "Raio-x", largura: 50 }) })), false],
    ["imagem: só largura/alinhamento/disposição", C(P({ rico: comFigura({ asset: "a1", alt: "Raio-x", largura: 50 }) })), C(P({ rico: comFigura({ asset: "a1", alt: "Raio-x", largura: 80, alinhamento: "direita", disposicao: "quadrado" }) })), true],
    ["imagem trocada", C(P({ rico: comFigura({ asset: "a1", alt: "Raio-x" }) })), C(P({ rico: comFigura({ asset: "a2", alt: "Raio-x" }) })), false],
    ["texto alternativo mudou", C(P({ rico: comFigura({ asset: "a1", alt: "Raio-x" }) })), C(P({ rico: comFigura({ asset: "a1", alt: "Raio-x de tórax" }) })), false],
    ["recorte/giro de imagem", C(P({ rico: comFigura({ asset: "a1", alt: "x" }) })), C(P({ rico: comFigura({ asset: "a1", alt: "x", giro: 90 }) })), false],
    ["destino do link mudou só no rico", C(P()), C(P({ rico: par([txt("Febre e "), txt("guia", [{ type: "link", attrs: { href: "https://outro.gov.br" } }]), txt(" hoje")]) })), false],
    ["sobrescrito (10⁵ ≠ 105)", C(P()), C(P({ rico: par([txt("Febre e "), txt("guia", [link, { type: "superscript" }]), txt(" hoje")]) })), false],
    ["tachado", C(P()), C(P({ rico: par([txt("Febre e "), txt("guia", [link, { type: "strike" }]), txt(" hoje")]) })), false],
    ["virou título (nível)", C(P()), C(P({ rico: envelope({ type: "doc", content: [{ type: "heading", attrs: { level: 3 }, content: [txt("Febre e "), txt("guia", [link]), txt(" hoje")] }] } as any) })), false],
    ["estilo da numeração/marcador (listStyle) e borda de parágrafo",
      C(P({ text: "• Febre e [guia](https://www.gov.br/saude) hoje", rico: envelope({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [txt("Febre e "), txt("guia", [link]), txt(" hoje")] }] }] }] } as any) })),
      C(P({ text: "• Febre e [guia](https://www.gov.br/saude) hoje", rico: envelope({ type: "doc", content: [{ type: "bulletList", attrs: { listStyle: "square" }, content: [{ type: "listItem", content: [{ type: "paragraph", attrs: { borda: "fina" }, content: [txt("Febre e "), txt("guia", [link]), txt(" hoje")] }] }] }] } as any) })), true],
    ["aninhar lista continua sendo conteúdo",
      C(P({ text: "• Febre e [guia](https://www.gov.br/saude) hoje", rico: envelope({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [txt("Febre e "), txt("guia", [link]), txt(" hoje")] }] }] }] } as any) })),
      // aninhar muda a projeção do texto ("• • ..."), por isso o text guardado muda e conta como conteúdo
      C(P({ text: "• • Febre e [guia](https://www.gov.br/saude) hoje", rico: envelope({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [txt("Febre e "), txt("guia", [link]), txt(" hoje")] }] }] }] }] }] } as any) })), false],
    ["rico estranho", C(P()), C(P({ rico: { f: "outro", doc: {} } })), false],
    ["nota de rodapé (nó de módulo com texto)", C(P()), C(P({ rico: envelope({ type: "doc", content: [{ type: "paragraph", content: [txt("Febre e "), txt("guia", [link]), txt(" hoje"), { type: "notaRodape", content: [txt("ver diretriz")] }] }] } as any) })), false],
  ];

  it("as listas do banco e da tela são as mesmas", async () => {
    const [r] = await sql(`select public.ch_formato_marcas() m, public.ch_formato_atributos() a, public.ch_nos_do_texto() n`);
    expect(r.m).toEqual(FORMATO_MARCAS);
    expect(r.a).toEqual(FORMATO_ATRIBUTOS);
    expect(r.n).toEqual(NOS_DO_TEXTO);
  });

  for (const [nome, a, b, esperado] of casos) {
    it(`${esperado ? "só formatação" : "conteúdo"}: ${nome}`, async () => {
      expect(await mesmoNoBanco(a, b)).toBe(esperado);
      expect(soFormatacao(a, b)).toBe(esperado);
    });
  }

  it("a migração pode ser colada de novo e as conferências da publicação comparam o conteúdo (sem formatação)", async () => {
    await db.exec(fs.readFileSync(path.join(__dirname, "../../supabase/migrations/20261003013080_aprovacao_presa_ao_conteudo.sql"), "utf8"));
    const def = async (f: string) => (await sql(`select pg_get_functiondef(to_regprocedure($1)) d`, [f]))[0].d as string;
    const base = await def("public.ch_publish_problems_base(uuid)");
    expect(base).toContain("v.content_hash <> public.ch_conteudo_hash(v.content)");
    expect(base).not.toContain("public.ch_hash(v.content)");
    const aula = await def("public.ch_publish_problems_antes_tema(uuid)");
    expect(aula).toContain("public.ch_conteudo_hash(jsonb_build_object('sections', m.content -> 'sections'))");
    expect(aula).not.toContain("m.content -> 'sections' is distinct from v.content -> 'sections'");
    expect((await def("public.ch_publish_problems(uuid)"))).toContain("ch_publish_problems_antes_tema"); // a casca da 9960 continua por cima
  });

  it("conteúdo de hoje (sem rico e sem doc_config) tem o MESMO hash de antes: nenhuma aprovação muda", async () => {
    const amostras: unknown[] = [C(P()), PACOTE.aula ?? { sections: [] }];
    const pasta = process.env.DOC_RICO_DADOS ?? "/Volumes/StaziaMed/.tmp-aulas/editor-word/dados";
    if (fs.existsSync(path.join(pasta, "units.json"))) amostras.push(...JSON.parse(fs.readFileSync(path.join(pasta, "units.json"), "utf8")).map((u: any) => u.content));
    for (const c of amostras) {
      const [r] = await sql(`select public.ch_conteudo_hash($1::jsonb) = public.ch_hash($1::jsonb) r`, [JSON.stringify(c)]);
      expect(r.r).toBe(true);
    }
    const [v] = await sql(`select count(*)::int n from public.ch_unit_versions where public.ch_conteudo_hash(content) <> content_hash`);
    expect(v.n).toBe(0);
  });
});

describe("Salvar só formatação mantém as aprovações (e a publicação funciona com elas)", () => {
  it("versão aprovada: negrito no editor mantém as duas aprovações e registra quem mudou", async () => {
    await rpc(EDITOR, "app_ch_review_sheet_import", { p_version_id: versao, p_sheet: FICHA });
    for (const n of [1, 2, 3, 4, 5, 6]) await rpc(ADMIN, "app_ch_review_decide", { p_version_id: versao, p_n: n, p_decision: "de_acordo" });
    await rpc(EDITOR, "app_ch_submit_for_review", { p_version_id: versao }).catch(() => undefined);
    await rpc(ADMIN, "app_ch_approve", { p_version_id: versao, p_kind: "medical", p_note: "ok" });
    const criticas = (await sql(`select c.id from public.ch_claims c join public.ch_unit_claims uc on uc.claim_id = c.id where uc.unit_version_id = $1 and cardinality(c.critical_kinds) > 0 and c.critical_checked_by is null`, [versao])).map((x) => x.id);
    for (const id of criticas) await rpc(ADMIN, "app_ch_confirm_critical", { p_claim_id: id });
    await rpc(EDITOR, "app_ch_approve", { p_version_id: versao, p_kind: "editorial" });
    const antes = await conteudoDe(versao);
    expect(await aprovacoesValidas(versao)).toBe(2);

    const novo = negritoNoPrimeiro(antes.content);
    expect(novo.sections[0].paragraphs[0].text).toBe(antes.content.sections[0].paragraphs[0].text); // o texto oficial não mudou
    expect(novo.sections[0].paragraphs[0].rico).toBeTruthy();
    const r = await rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: versao, p_content: { ...novo, doc_config: { pagina: { tamanho: "A4" } } } });
    expect(r.so_formatacao).toBe(true);
    const depois = await conteudoDe(versao);
    expect(depois.content_hash).toBe(antes.content_hash);
    expect(depois.status).toBe(antes.status);
    expect(depois.content.doc_config).toEqual({ pagina: { tamanho: "A4" } });
    expect(await aprovacoesValidas(versao)).toBe(2);
    const [f] = await sql(`select count(*)::int n, max(full_hash_before) antes from public.ch_unit_format_changes where unit_version_id = $1`, [versao]);
    expect(f.n).toBe(1);
    const log = await sql(`select details from public.ch_audit where action = 'unit.format' and target = $1`, [versao]);
    expect(log).toHaveLength(1);
    expect((await rpc(EDITOR, "app_ch_format_changes", { p_version_id: versao }))[0].hash).toBe(antes.content_hash);
    await expect(rpc(ALUNO, "app_ch_format_changes", { p_version_id: versao })).rejects.toThrow();
  });

  it("publica com as aprovações mantidas; no ar, mudar só a formatação aparece ao aluno na hora, sem nova aprovação", async () => {
    for (const m of await sql(`select id, content_hash from public.ch_materials where unit_version_id = $1 and kind in ('lesson', 'visual_cards')`, [versao]))
      await sql(`select public.ch_worker_save_render($1::jsonb)`, [JSON.stringify({ material_id: m.id, format: "pdf", storage_path: `renders/${m.id}.pdf`, sha256: sha(m.id), template_version: "t", brand_version: "b", material_hash: m.content_hash, check_result: { ok: true } })]);
    await rpc(ADMIN, "app_admin_vigilance_set_gate", { p_mode: "aviso" });
    await rpc(ADMIN, "app_ch_unit_publish", { p_version_id: versao, p_options: { confirm_similar: true } });
    const pub = await conteudoDe(versao);
    expect(pub.status).toBe("published");

    // tira o negrito e centraliza a página: só formatação, na versão publicada
    const semNegrito = docParaUnidade(unidadeParaDoc({ ...pub.content, sections: pub.content.sections.map((s: any, i: number) => (i ? s : { ...s, paragraphs: s.paragraphs.map((p: any, j: number) => (j ? p : { ...p, rico: envelope({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: p.text, marks: [{ type: "italic" }] }] }] } as any) })) })) }), pub.content) as any;
    const r = await rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: versao, p_content: semNegrito });
    expect(r.so_formatacao).toBe(true);
    const aula = await rpc(ALUNO, "app_tema_aula", { p_tema_id: "GR-001" });
    expect(ricoValido(aula.secoes[0].paragrafos[0], aula.secoes[0].ricos[0])?.doc.content[0].content?.[0].marks).toEqual([{ type: "italic" }]);
    expect((await conteudoDe(versao)).status).toBe("published");
    expect(await aprovacoesValidas(versao)).toBe(2);

    // conteúdo numa versão publicada continua proibido
    const outroTexto = structuredClone(semNegrito);
    outroTexto.sections[0].paragraphs[0] = { ...outroTexto.sections[0].paragraphs[0], text: "Texto trocado", rico: undefined };
    delete outroTexto.sections[0].paragraphs[0].rico;
    await expect(rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: versao, p_content: outroTexto })).rejects.toThrow(/publicada/);
    // e imagem nova também é conteúdo
    const comImagem = structuredClone(semNegrito);
    comImagem.sections[0].paragraphs[0].rico.doc.content.push({ type: "figura", attrs: { asset: "a1", alt: "x" } });
    await expect(rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: versao, p_content: comImagem })).rejects.toThrow(/publicada/);
  }, 120_000);

  it("versão para corrigir: mudar o texto derruba a aprovação (como antes); só formatação não", async () => {
    const nova = await rpc(EDITOR, "app_ch_new_version", { p_from_version_id: versao });
    const v = await conteudoDe(nova);
    await sql(`insert into public.ch_approvals (unit_version_id, kind, reviewer_id, area_code, content_hash) values ($1, 'medical', $2, 'CLINICA_MEDICA', $3)`, [nova, REVISOR, v.content_hash]);
    expect((await rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: nova, p_content: { ...v.content, doc_config: { pagina: { tamanho: "A5" } } } })).so_formatacao).toBe(true);
    expect(await aprovacoesValidas(nova)).toBe(1);
    const mudado = structuredClone(v.content);
    mudado.sections[0].paragraphs[0] = { ...mudado.sections[0].paragraphs[0], text: "Texto trocado" };
    delete mudado.sections[0].paragraphs[0].rico;
    expect((await rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: nova, p_content: mudado })).so_formatacao).toBe(false);
    expect(await aprovacoesValidas(nova)).toBe(0);
  });
});

const SQL_EXTRA = "/Volumes/StaziaMed/.tmp-aulas/editor-pro/sql";
describe.skipIf(!fs.existsSync(path.join(SQL_EXTRA, "013080-desfazer.sql")))("Conferir e desfazer a 013080 (ensaio)", () => {
  it("conferir dá tudo certo; desfazer volta as funções; colar de novo refaz", async () => {
    const conferir = async () => (await db.query(fs.readFileSync(path.join(SQL_EXTRA, "013080-conferir.sql"), "utf8").split(";\n")[0] + ";")).rows[0];
    expect(Object.values(await conferir())).toEqual([true, true, true, true, true]);
    await db.exec(fs.readFileSync(path.join(SQL_EXTRA, "013080-desfazer.sql"), "utf8"));
    const def = async (f: string) => (await sql(`select pg_get_functiondef(to_regprocedure($1)) d`, [f]))[0].d as string;
    expect(await def("public.app_ch_save_unit_version(uuid, jsonb, text, text)")).not.toContain("ch_conteudo_hash");
    expect(await def("public.ch_publish_problems_base(uuid)")).toContain("v.content_hash <> public.ch_hash(v.content)");
    expect((await sql(`select to_regprocedure('public.ch_conteudo_hash(jsonb)') is null r`))[0].r).toBe(true);
    await db.exec(fs.readFileSync(path.join(__dirname, "../../supabase/migrations/20261003013080_aprovacao_presa_ao_conteudo.sql"), "utf8"));
    expect(Object.values(await conferir())).toEqual([true, true, true, true, true]);
  });
});
