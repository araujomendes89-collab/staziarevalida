// @vitest-environment node
/**
 * Importar aula pronta na Central (migração 9950, app_ch_import_lesson_package), com a aula REAL GR-001 (Tuberculose pulmonar,
 * pacote gerado por scripts/aulas/gerar-sql-importacao.mjs a partir de aulas-piloto/GR-001/final) e as 3 fontes reais do catálogo
 * de fontes oficiais (cadastradas aqui pelas funções oficiais, como o pacote de 12/10 faz). Nenhuma IA é chamada.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { abrirBanco, ADMIN, ALUNO, EDITOR, REVISOR, type Rpc, type Sql } from "./helpers/publicacaoCentral";
import { sha } from "./helpers/centralUnidades";
import { negacoes } from "../../scripts/aulas/gerar-sql-importacao.mjs";

const PACOTE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/aula-pronta-GR-001.json"), "utf8"));
const FONTES = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/aula-pronta-GR-001-fontes.json"), "utf8")).fontes;
const copia = () => structuredClone(PACOTE);
/** Afirmações reais com "sem"/"não" que o trecho citado não traz: pela regra da Central entram com evidência "insuficiente". */
const SEM_NEGACAO_NO_TRECHO: string[] = PACOTE.afirmacoes.filter((a: any) => negacoes(a.texto).some((n) => !negacoes(a.citacao).includes(n))).map((a: any) => a.id);
/** Correção feita pela equipe de conteúdo (no teste): a afirmação passa a ter o texto literal do documento oficial. */
const corrigido = () => {
  const p = copia();
  for (const a of p.afirmacoes) if (SEM_NEGACAO_NO_TRECHO.includes(a.id)) a.texto = a.citacao;
  return p;
};

let db: PGlite; let sql: Sql; let rpc: Rpc;
const importar = (quem: string | null, pacote: unknown) => rpc(quem, "app_ch_import_lesson_package", { p_package: pacote });
const contagens = async () =>
  (await sql(`select (select count(*)::int from public.ch_units) u, (select count(*)::int from public.ch_unit_versions) v, (select count(*)::int from public.ch_claims) c,
                     (select count(*)::int from public.ch_evidence) e, (select count(*)::int from public.ch_source_passages) p, (select count(*)::int from public.ch_materials) m,
                     (select count(*)::int from public.ch_audit) a, (select count(*)::int from public.ch_jobs) j, (select count(*)::int from public.ch_approvals) ap,
                     (select coalesce(md5(string_agg(x::text, '|' order by x.id)), '') from public.ch_unit_versions x) hv,
                     (select coalesce(md5(string_agg(x::text, '|' order by x.id)), '') from public.ch_materials x) hm`))[0];
let primeira: any;

beforeAll(async () => {
  ({ db, sql, rpc } = await abrirBanco());
  // revisor médico da Clínica Médica (papel de aluno: só é revisor) e as 3 fontes reais pelas funções oficiais
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CLINICA_MEDICA') on conflict do nothing`, [REVISOR]);
  for (const f of FONTES) {
    const r = await rpc(ADMIN, "app_ch_register_source", { p_source: { title: f.title, organ: f.organ, kind: f.kind, url: f.url, version: f.version } });
    await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: r.id, p_level: f.level });
  }
}, 300_000);

describe("Quem importa", () => {
  it("aluno, revisor médico sem papel de equipe e visitante são recusados, sem gravar nada", async () => {
    const antes = await contagens();
    await expect(importar(ALUNO, copia())).rejects.toThrow(/só para administrador ou editor/);
    await expect(importar(REVISOR, copia())).rejects.toThrow(/só para administrador ou editor/);
    await expect(importar(null, copia())).rejects.toThrow(/permission denied|permissão/i);
    expect(await contagens()).toEqual(antes);
  });
});

describe("Recusa com a lista do que falta (nada é gravado)", () => {
  it("afirmação sem citação literal conferida", async () => {
    const p = copia();
    p.afirmacoes[0].citacao = "";
    p.afirmacoes[1].conferencia.ok = false;
    const antes = await contagens();
    const erro = await importar(EDITOR, p).catch((e) => e.message);
    expect(erro).toMatch(new RegExp(`Afirmação ${p.afirmacoes[0].id} sem citação literal`));
    expect(erro).toMatch(new RegExp(`Afirmação ${p.afirmacoes[1].id}: a citação não passou na conferência literal`));
    expect(await contagens()).toEqual(antes);
  });

  it("número da afirmação que não está no trecho citado (a mesma conferência de app_ch_link_evidence)", async () => {
    const p = copia();
    p.afirmacoes[2].texto = p.afirmacoes[2].texto + " Dose de 999 mg.";
    const erro = await importar(EDITOR, p).catch((e) => e.message);
    expect(erro).toMatch(/valores que não constam do trecho citado: 999mg/);
  });

  it("fonte que não está na biblioteca: lista quais faltam", async () => {
    const p = copia();
    p.fontes[1].url = "https://www.gov.br/saude/documento-que-nao-existe.pdf";
    const antes = await contagens();
    const erro = await importar(EDITOR, p).catch((e) => e.message);
    expect(erro).toMatch(new RegExp(`Fonte fora da biblioteca: "${p.fontes[1].titulo.replace(/[()]/g, ".")}"`));
    expect(await contagens()).toEqual(antes);
  });

  it("referência no texto do aluno (marca de citação ou seção Referências) é recusada", async () => {
    const p = copia();
    p.aula.sections[1].paragraphs[0].text += " [1]";
    p.aula.sections.push({ heading: "Referências", paragraphs: [{ text: "Lista de fontes.", clinical: false, claim_ids: [] }] });
    p.flashcards.cards[0].back += " (Trechos citados: GVS p. 98)";
    const erro = await importar(EDITOR, p).catch((e) => e.message);
    expect(erro).toMatch(/parágrafo 1: o texto do aluno não pode trazer referência/);
    expect(erro).toMatch(/Seção "Referências": o texto do aluno não pode trazer referência/);
    expect(erro).toMatch(/Flashcard 1: o texto do aluno não pode trazer referência/);
  });

  it("parágrafo clínico sem afirmação e tema que não existe na taxonomia", async () => {
    const p = copia();
    const par = p.aula.sections[1].paragraphs[0];
    par.claim_ids = [];
    p.tema.tema = "Tuberculose pulmonar";
    const erro = await importar(EDITOR, p).catch((e) => e.message);
    expect(erro).toMatch(/parágrafo clínico sem afirmação citada/);
    expect(erro).toMatch(/O tema "Tuberculose pulmonar" .* não existe na taxonomia publicada da Central.*parecidos: Tuberculose/);
  });
});

describe("Importa a GR-001 real", () => {
  it("cria a unidade no tema Tuberculose e a versão aguardando revisão, com afirmações, trechos, evidências e materiais", async () => {
    primeira = await importar(EDITOR, copia());
    expect(primeira).toMatchObject({ resultado: "criada", version: 1, status: "awaiting_review", area_code: "CLINICA_MEDICA", afirmacoes: PACOTE.afirmacoes.length });
    expect(primeira.materiais).toEqual(["lesson", "summary", "visual_cards", "flashcards", "questions"]);
    const v = (await sql(`select v.*, u.title, n.name tema from public.ch_unit_versions v join public.ch_units u on u.id = v.unit_id join public.ch_taxonomy_nodes n on n.id = u.theme_node_id where v.id = $1`, [primeira.version_id]))[0];
    expect(v).toMatchObject({ title: PACOTE.titulo, tema: "Tuberculose", origin: "independent", status: "awaiting_review" });
    expect(v.content_hash).toBe((await sql(`select public.ch_hash(content) h from public.ch_unit_versions where id = $1`, [v.id]))[0].h);
    // cada afirmação: evidência compatível na fonte certa, no trecho da página com a citação literal, leitura e conferência marcadas
    const linhas = await sql(
      `select c.statement, c.status, c.context, e.verdict, e.page, e.quote, s.url, sp.page sp_page, sp.text sp_text, sp.reading_kind, sp.literal_check
         from public.ch_unit_claims uc join public.ch_claims c on c.id = uc.claim_id join public.ch_evidence e on e.claim_id = c.id
         join public.ch_sources s on s.id = e.source_id join public.ch_source_passages sp on sp.id = e.passage_id where uc.unit_version_id = $1`, [v.id]);
    expect(linhas).toHaveLength(PACOTE.afirmacoes.length);
    for (const a of PACOTE.afirmacoes) {
      const l = linhas.find((x) => x.context.aula_pronta.id === a.id);
      const fonte = PACOTE.fontes.find((f: any) => f.ref === a.fonte);
      const esperado = SEM_NEGACAO_NO_TRECHO.includes(a.id) ? "insufficient" : "compatible";
      expect(l).toMatchObject({ statement: a.texto, status: esperado, verdict: esperado, page: a.pagina, quote: a.citacao, url: fonte.url, sp_page: a.pagina, sp_text: a.citacao, reading_kind: "texto_digital" });
      expect(l.literal_check).toMatchObject({ ok: true, por: "validar_trecho.py", aula: "GR-001", pagina_pdf: a.pagina });
    }
    // o texto da unidade é o da aula, com os números das afirmações no banco
    expect(v.content.sections.map((s: any) => s.heading)).toEqual(PACOTE.aula.sections.map((s: any) => s.heading));
    const lesson = (await sql(`select content from public.ch_materials where unit_version_id = $1 and kind = 'lesson'`, [v.id]))[0].content;
    expect(lesson.sections).toEqual(v.content.sections);
    expect(lesson.references.length).toBeGreaterThan(3);
    expect(lesson.arquivos.map((f: any) => f.caminho)).toEqual(["aulas-prontas/GR-001/pdf/GR-001-tuberculose-pulmonar-aluno.pdf"]);
    const cards = (await sql(`select content from public.ch_materials where unit_version_id = $1 and kind = 'visual_cards'`, [v.id]))[0].content;
    expect(cards.arquivos.every((f: any) => /^[0-9a-f]{64}$/.test(f.sha256) && f.deposito === "content-hub")).toBe(true);
    expect(cards.arquivos.filter((f: any) => f.tipo === "image/png").every((f: any) => f.texto_alternativo)).toBe(true);
    const q = (await sql(`select content from public.ch_materials where unit_version_id = $1 and kind = 'questions'`, [v.id]))[0].content;
    expect(q.items.every((i: any) => i.official === false && /não é questão oficial do Inep/.test(i.label))).toBe(true);
    // Registro e pedido do arquivo final (só desta versão, sem documento)
    expect((await sql(`select action, details ->> 'result' r from public.ch_audit where target = $1 and action = 'unit.import'`, [v.id]))).toEqual([{ action: "unit.import", r: "criada" }]);
    expect(await sql(`select step, status, document_id from public.ch_jobs where scope_key = $1`, ["import:" + v.id])).toEqual([{ step: "render", status: "queued", document_id: null }]);
    // tipos críticos por regra (dose, tempo, via...): precisam da conferência do revisor da área
    expect(Number((await sql(`select count(*) n from public.ch_unit_claims uc join public.ch_claims c on c.id = uc.claim_id where uc.unit_version_id = $1 and cardinality(c.critical_kinds) > 0`, [v.id]))[0].n)).toBeGreaterThan(0);
  });

  it("aparece na fila 'Aguardando revisão' e na tela de revisão com as citações por afirmação", async () => {
    const unidades = await rpc(EDITOR, "app_ch_units");
    const u = unidades.find((x: any) => x.unit_id === primeira.unit_id);
    expect(u.versions[0]).toMatchObject({ status: "awaiting_review", version: 1 });
    const tela = await rpc(REVISOR, "app_ch_unit_version", { p_version_id: primeira.version_id });
    expect(tela.claims).toHaveLength(PACOTE.afirmacoes.length);
    expect(tela.claims.every((c: any) => c.evidence[0].quote && c.evidence[0].page && c.evidence[0].source)).toBe(true);
    expect(tela.claims.filter((c: any) => c.evidence[0].verdict === "insufficient")).toHaveLength(SEM_NEGACAO_NO_TRECHO.length);
    expect(tela.problems).toContain("Falta a aprovação editorial para esta versão exata.");
    // as afirmações com "sem"/"não" fora do trecho aparecem como pendência e como aviso ao revisor
    expect(tela.problems.filter((x: string) => x.startsWith("Afirmação pendente (insufficient)"))).toHaveLength(SEM_NEGACAO_NO_TRECHO.length);
    expect(tela.version.review_flags.filter((f: any) => f.by === "importacao" && /condição ou negação/.test(f.detail))).toHaveLength(SEM_NEGACAO_NO_TRECHO.length);
  });

  it("colar de novo o mesmo pacote não muda nada (nem o Registro, nem a fila)", async () => {
    const antes = await contagens();
    const r = await importar(ADMIN, copia());
    expect(r).toMatchObject({ resultado: "sem_mudanca", version_id: primeira.version_id, status: "awaiting_review" });
    expect(await contagens()).toEqual(antes);
  });

  it("nunca vira aprovada nem publicada sozinha; o aluno não vê nada", async () => {
    expect((await sql(`select status from public.ch_unit_versions where unit_id = $1`, [primeira.unit_id])).map((x) => x.status)).toEqual(["awaiting_review"]);
    await expect(rpc(ADMIN, "app_ch_publish", { p_version_id: primeira.version_id, p_options: {} })).rejects.toThrow();
    expect(await sql(`select 1 from public.ch_publications p join public.ch_unit_versions v on v.id = p.unit_version_id where v.unit_id = $1`, [primeira.unit_id])).toEqual([]);
    expect(await sql(`select 1 from public.lessons where ch_unit_id = $1`, [primeira.unit_id])).toEqual([]);
    await expect(rpc(ALUNO, "app_ch_units")).rejects.toThrow(/restrito/);
    await expect(rpc(ALUNO, "app_ch_unit_version", { p_version_id: primeira.version_id })).rejects.toThrow(/restrito/);
    await expect(rpc(ALUNO, "app_ch_published_units")).rejects.toThrow(/restrito/);
    const lista = await rpc(ALUNO, "app_lessons", { p_area: "CLINICA_MEDICA" });
    expect(JSON.stringify(lista)).not.toContain("Tuberculose pulmonar: da tosse");
  });
});

describe("Revisão, hash e publicação pelo fluxo oficial", () => {
  it("aprovação médica vale para o hash exato: pacote mudado atualiza a versão em revisão e a aprovação deixa de valer", async () => {
    await rpc(REVISOR, "app_ch_approve", { p_version_id: primeira.version_id, p_kind: "medical", p_note: "Conferido nas fontes oficiais." });
    const ap = (await sql(`select content_hash, invalidated_at from public.ch_approvals where unit_version_id = $1`, [primeira.version_id]))[0];
    expect(ap.content_hash).toBe((await sql(`select content_hash from public.ch_unit_versions where id = $1`, [primeira.version_id]))[0].content_hash);
    expect(ap.invalidated_at).toBeNull();
    const p = copia();
    p.flashcards.cards[0].back = p.flashcards.cards[0].back + " ";
    p.questoes.items = p.questoes.items.slice(0, 2);
    const r = await importar(EDITOR, p);
    expect(r).toMatchObject({ resultado: "atualizada", version_id: primeira.version_id, status: "awaiting_review", afirmacoes_novas: 0, trechos_novos: 0 });
    expect((await sql(`select invalidated_at from public.ch_approvals where unit_version_id = $1`, [primeira.version_id]))[0].invalidated_at).not.toBeNull();
    expect(await rpc(EDITOR, "app_ch_publish_problems", { p_version_id: primeira.version_id })).toContain("Falta a aprovação médica de um revisor da área (CLINICA_MEDICA) para esta versão exata.");
    // volta ao pacote original (a mesma versão, sem afirmações nem trechos novos)
    const r2 = await importar(EDITOR, copia());
    expect(r2).toMatchObject({ resultado: "atualizada", version_id: primeira.version_id, afirmacoes_novas: 0 });
  });

  it("só depois da correção das afirmações, da conferência das críticas, das duas aprovações e do arquivo final a publicação passa; o aluno vê a aula e os flashcards", async () => {
    const v = primeira.version_id;
    expect(SEM_NEGACAO_NO_TRECHO.length).toBeGreaterThan(0);
    // aprovada com afirmação "insuficiente" a publicação continua barrada
    // a equipe de conteúdo corrige o pacote (texto literal do documento) e importa de novo: a mesma versão, só essas afirmações novas
    const r = await importar(EDITOR, corrigido());
    expect(r).toMatchObject({ resultado: "atualizada", version_id: v, afirmacoes_novas: SEM_NEGACAO_NO_TRECHO.length, trechos_novos: 0 });
    expect((await sql(`select count(*)::int n from public.ch_unit_claims uc join public.ch_claims c on c.id = uc.claim_id where uc.unit_version_id = $1 and c.status <> 'compatible'`, [v]))[0].n).toBe(0);
    for (const c of await sql(`select c.id from public.ch_unit_claims uc join public.ch_claims c on c.id = uc.claim_id where uc.unit_version_id = $1 and cardinality(c.critical_kinds) > 0`, [v]))
      await rpc(REVISOR, "app_ch_confirm_critical", { p_claim_id: c.id });
    await rpc(REVISOR, "app_ch_approve", { p_version_id: v, p_kind: "medical", p_note: "Conferido nas fontes oficiais." });
    expect((await sql(`select status from public.ch_unit_versions where id = $1`, [v]))[0].status).toBe("awaiting_review");
    await rpc(EDITOR, "app_ch_approve", { p_version_id: v, p_kind: "editorial" });
    expect((await sql(`select status from public.ch_unit_versions where id = $1`, [v]))[0].status).toBe("approved");
    // sem o arquivo final conferido a publicação é barrada
    let problemas = await rpc(EDITOR, "app_ch_publish_problems", { p_version_id: v });
    expect(problemas).toContain('O arquivo final de "lesson" não foi gerado a partir da versão atual.');
    // o arquivo final (no sistema, o processamento gera com o Chromium e confere o texto): gravado como o processamento grava
    for (const m of await sql(`select id, content_hash from public.ch_materials where unit_version_id = $1 and kind in ('lesson', 'visual_cards')`, [v]))
      await sql(`select public.ch_worker_save_render($1::jsonb)`, [JSON.stringify({ material_id: m.id, format: "pdf", storage_path: `renders/${m.id}/${m.content_hash.slice(0, 16)}.pdf`, sha256: sha(m.id), template_version: "templates-1.0", brand_version: "brand-1.0", material_hash: m.content_hash, check_result: { ok: true } })]);
    problemas = await rpc(EDITOR, "app_ch_publish_problems", { p_version_id: v });
    expect(problemas).toEqual([]);
    // publicação desligada e modo sombra de fábrica: barrada
    await expect(rpc(ADMIN, "app_ch_publish", { p_version_id: v, p_options: {} })).rejects.toThrow(/Modo sombra ligado|Publicação desligada/);
    await sql(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`);
    await expect(rpc(EDITOR, "app_ch_publish", { p_version_id: v, p_options: {} })).rejects.toThrow();
    const pub = await rpc(ADMIN, "app_ch_publish", { p_version_id: v, p_options: { confirm_similar: true } });
    expect(pub.distribution.lesson.action).toBe("create");
    expect(pub.distribution.flashcards).toMatchObject({ added: PACOTE.flashcards.cards.length });
    const aula = (await sql(`select id, title, topic, area, origin, published, summary from public.lessons where ch_unit_id = $1`, [primeira.unit_id]))[0];
    expect(aula).toMatchObject({ title: PACOTE.titulo, topic: "Tuberculose", area: "CLINICA_MEDICA", origin: "central", published: true });
    expect(aula.summary).toMatch(/^Material StaziaMed · revisado por médico da área em/);
    // decisão do dono (13/10): nenhuma referência no que o aluno lê; as fontes e os trechos ficam na Central
    const vista = await rpc(ALUNO, "app_lesson", { p_id: aula.id });
    const lista = await rpc(ALUNO, "app_lessons", { p_area: "CLINICA_MEDICA" });
    const cartoes = await sql(`select front, back from public.flashcards where ch_unit_id = $1 and published`, [primeira.unit_id]);
    expect(cartoes).toHaveLength(PACOTE.flashcards.cards.length);
    for (const texto of [aula.summary, JSON.stringify(vista), JSON.stringify(lista), JSON.stringify(cartoes)]) {
      expect(texto).not.toMatch(/Fontes oficiais desta aula|Refer[êe]ncias|Trechos citados|\[\s*[A-Z]{0,4}\d+\]|· p\. \d+/);
      expect(texto).not.toMatch(/claim_ids|aula_pronta|literal_check|validar_trecho|aulas-prontas\/|Guia de Vigilância em Saúde: volume 2/);
      for (const a of PACOTE.afirmacoes) expect(texto).not.toContain(a.citacao);
    }
    expect(JSON.stringify(vista)).toContain("TRM-TB");
    // a equipe continua vendo as fontes e os trechos citados na Central
    const tela = await rpc(EDITOR, "app_ch_unit_version", { p_version_id: v });
    expect(tela.claims.every((c: any) => c.evidence.length > 0 && c.evidence[0].quote)).toBe(true);
  });

  it("pacote mudado depois de publicada: versão nova candidata aguardando revisão; a publicada continua no ar", async () => {
    const p = corrigido();
    p.questoes.items = p.questoes.items.slice(0, 1);
    const r = await importar(EDITOR, p);
    expect(r).toMatchObject({ resultado: "nova_versao", version: 2, status: "awaiting_review" });
    const vs = await sql(`select version, status, candidate_of from public.ch_unit_versions where unit_id = $1 order by version`, [primeira.unit_id]);
    expect(vs).toEqual([{ version: 1, status: "published", candidate_of: null }, { version: 2, status: "awaiting_review", candidate_of: primeira.version_id }]);
    expect((await sql(`select published, ch_version_id from public.lessons where ch_unit_id = $1`, [primeira.unit_id]))[0]).toEqual({ published: true, ch_version_id: primeira.version_id });
    // colar de novo este mesmo pacote: nada muda
    const antes = await contagens();
    expect(await importar(EDITOR, p)).toMatchObject({ resultado: "sem_mudanca", version: 2 });
    expect(await contagens()).toEqual(antes);
  });
});
