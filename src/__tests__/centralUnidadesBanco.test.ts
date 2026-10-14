// @vitest-environment node
/**
 * Central de Conteúdo › Unidades (migrações 9980 e 9981), com a aula REAL GR-001 v3 (Tuberculose pulmonar): importação pela função
 * oficial da 9950, materiais (inserir, retirar, pré-visualizar), ficha do revisor, aprovação médica do administrador ou do revisor,
 * portão de atualidade, permissões e anotações do aluno. Banco de teste (PGlite) com todas as migrações; nenhuma IA, nenhuma chave.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { abrirBanco, ADMIN, ALUNO, ALUNO2, EDITOR, REVISOR, type AsUser, type Rpc, type Sql } from "./helpers/publicacaoCentral";
import { sha } from "./helpers/centralUnidades";

const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8"));
const PACOTE = fx("aula-pronta-GR-001-v3.json");
const FONTES = fx("aula-pronta-GR-001-v3-fontes.json").fontes;
const FICHA = fx("ficha-revisor-GR-001-v3.json");

let db: PGlite; let sql: Sql; let rpc: Rpc; let asUser: AsUser;
let versao: string; let unidade: string; let tema: string; let claimIds: string[];
const item = async (kind: string) => ((await rpc(EDITOR, "app_ch_unit_materials", { p_version_id: versao })) as any[]).find((x) => x.kind === kind);
const quem = [["aluno", ALUNO], ["visitante", null]] as const;

beforeAll(async () => {
  ({ db, sql, rpc, asUser } = await abrirBanco());
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CLINICA_MEDICA') on conflict do nothing`, [REVISOR]);
  await sql(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`);
  for (const f of FONTES) {
    const r = await rpc(ADMIN, "app_ch_register_source", { p_source: { title: f.title, organ: f.organ, kind: f.kind, url: f.url, version: f.version } });
    await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: r.id, p_level: f.level });
  }
}, 300_000);

describe("Importa a GR-001 v3 e ela NÃO chega ao aluno", () => {
  it("entra aguardando revisão, sem aprovação, sem publicação e sem aula do aluno", async () => {
    const r = await rpc(EDITOR, "app_ch_import_lesson_package", { p_package: PACOTE });
    expect(r).toMatchObject({ resultado: "criada", status: "awaiting_review", afirmacoes: PACOTE.afirmacoes.length });
    versao = r.version_id;
    unidade = (await sql(`select unit_id from public.ch_unit_versions where id = $1`, [versao]))[0].unit_id;
    tema = (await sql(`select theme_node_id from public.ch_units where id = $1`, [unidade]))[0].theme_node_id;
    claimIds = (await sql(`select claim_id from public.ch_unit_claims where unit_version_id = $1`, [versao])).map((x) => x.claim_id);
    expect((await sql(`select count(*)::int n from public.ch_approvals`))[0].n).toBe(0);
    expect((await sql(`select count(*)::int n from public.ch_publications`))[0].n).toBe(0);
    expect((await sql(`select count(*)::int n from public.lessons where published`))[0].n).toBe(0);
    expect((await sql(`select status from public.ch_unit_versions where id = $1`, [versao]))[0].status).toBe("awaiting_review");
  });

  it("as 4 fontes de v3 (inclusive a Nota 2/2026) ficam na biblioteca e as 86 afirmações têm trecho, página e conferência literal", async () => {
    expect(PACOTE.afirmacoes).toHaveLength(86);
    const s = await rpc(EDITOR, "app_ch_approval_summary", { p_version_id: versao });
    expect(s.afirmacoes.total).toBe(86);
    expect(s.afirmacoes.validadas).toBe(86);
    expect(s.afirmacoes.sem_validacao).toBe(0);
  });
});

describe("Lista e cabeçalho da unidade (tudo lido do banco)", () => {
  it("lista: código GR-001, título, área › subárea, versão, data, afirmações, palavras, situação", async () => {
    const lista = await rpc(EDITOR, "app_ch_unit_overview_list");
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ code: "GR-001", title: PACOTE.titulo, version: 1, status: "awaiting_review", afirmacoes: 86, area_code: "CLINICA_MEDICA", questoes_ligadas: 0 });
    expect(lista[0].caminho).toMatchObject({ area: "Clínica Médica", subarea: "Infectologia", tema: "Tuberculose" });
    expect(lista[0].palavras).toBeGreaterThan(1500);
    expect(new Date(lista[0].date).getFullYear()).toBeGreaterThan(2025);
  });

  it("questões ligadas: lê a tabela dos Grandes Temas quando ela existe (e só conta questão que existe)", async () => {
    await sql(`set session_replication_role = replica`);
    for (const n of [1, 2, 3])
      await sql(`insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option) values ($1, $2, 'exam-x', $3, 'CLINICA_MEDICA', 'Tuberculose', 'Enunciado de teste', '[{},{},{},{}]'::jsonb, 'A') on conflict do nothing`, [`qtb${n}`, `QTB-${n}`, n]);
    await sql(`set session_replication_role = origin`);
    const existentes = (await sql(`select id::text from public.questions where id like 'qtb%' order by id`)).map((x) => x.id);
    for (const id of existentes) await sql(`insert into public.grande_tema_questoes (tema_id, question_id, no_taxonomia) values ('GR-001', $1, 'x')`, [id]);
    await sql(`insert into public.grande_tema_questoes (tema_id, question_id, no_taxonomia) values ('GR-001', 'nao-existe', 'x')`);
    const o = await rpc(EDITOR, "app_ch_unit_overview", { p_version_id: versao });
    expect(o.questoes_ligadas).toBe(existentes.length);
    await sql(`delete from public.grande_tema_questoes where tema_id = 'GR-001'`);
  });

  it("cabeçalho e caminho: auditoria feita, médica pendente, portão, publicação travada", async () => {
    const o = await rpc(EDITOR, "app_ch_unit_overview", { p_version_id: versao });
    expect(o.unit).toMatchObject({ code: "GR-001", title: PACOTE.titulo });
    expect(o.version).toMatchObject({ version: 1, status: "awaiting_review" });
    expect(o.auditoria.estado).toBe("feita");
    expect(o.auditoria.data).toBeTruthy();
    expect(o.aprovacao_medica.valida).toBe(false);
    expect(o.aprovacao_editorial.valida).toBe(false);
    expect(o.portao.modo).toBe("desligado");
    expect(o.portao.status).not.toBe("ok");
    expect(o.publicacao.no_ar).toBe(false);
    expect(o.pode).toMatchObject({ editar: true, aprovar_medica: false, aprovar_editorial: true, publicar: false });
    const adm = await rpc(ADMIN, "app_ch_unit_overview", { p_version_id: versao });
    expect(adm.pode).toMatchObject({ aprovar_medica: true, aprovar_editorial: true, conferir_criticas: true, publicar: false });
    const rev = await rpc(REVISOR, "app_ch_unit_overview", { p_version_id: versao });
    expect(rev.pode).toMatchObject({ editar: false, aprovar_medica: true, aprovar_editorial: false, publicar: false });
  });
});

describe("Materiais da unidade", () => {
  it("lista todos os tipos da aula; os arquivos de equipe são só da equipe", async () => {
    const itens = (await rpc(EDITOR, "app_ch_unit_materials", { p_version_id: versao })) as any[];
    const por = Object.fromEntries(itens.map((x) => [x.kind, x]));
    expect(Object.keys(por).sort()).toEqual(["card_feed", "flashcards_a6", "flashcards_ilustrados", "pdf_a4", "pdf_interativo", "questoes_fixacao", "revisao_aula", "story", "texto_aula"]);
    for (const k of ["pdf_interativo", "pdf_a4", "card_feed", "story", "flashcards_a6"]) expect(por[k]).toMatchObject({ visibility: "equipe", status: "ativo" });
    for (const k of ["texto_aula", "questoes_fixacao", "flashcards_ilustrados", "revisao_aula"]) expect(por[k]).toMatchObject({ visibility: "aluno", status: "ativo" });
    expect(por.questoes_fixacao.title).toMatch(/\(3\)/);
    expect(por.flashcards_ilustrados.title).toMatch(/9 cartões/);
    expect(por.flashcards_ilustrados.files).toHaveLength(18);
    expect(por.flashcards_a6.files.length).toBe(27);
    expect(por.revisao_aula.files[0].texto_alternativo).toBeTruthy();
    expect(JSON.stringify(itens)).not.toMatch(/aulas-prontas\//); // o navegador nunca recebe o caminho do depósito
    // sincronizar de novo não duplica
    expect((await rpc(EDITOR, "app_ch_unit_materials", { p_version_id: versao })).length).toBe(itens.length);
  });

  it("o banco recusa PDF/card/story/A6 visíveis ao aluno (regra do banco, não da tela)", async () => {
    await expect(sql(`update public.ch_unit_materials set visibility = 'aluno' where unit_version_id = $1 and kind = 'pdf_a4'`, [versao])).rejects.toThrow(/ch_unit_materials_so_equipe/);
    await expect(sql(`update public.ch_unit_materials set visibility = 'aluno' where unit_version_id = $1 and kind = 'pdf_interativo'`, [versao])).rejects.toThrow(/ch_unit_materials_so_equipe/);
  });

  it("insere vídeo e áudio por link seguro (YouTube/Vimeo) com duração, legenda e posição; link direto de arquivo é recusado", async () => {
    const v = await rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: { kind: "video", title: "Vídeo de apoio", url: "https://youtu.be/dQw4w9WgXcQ", duration_seconds: 125, position: 2, caption: "Legenda de teste", visibility: "equipe" } });
    expect(v.id).toBeTruthy();
    const a = await rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: { kind: "audio", title: "Áudio de apoio", url: "https://vimeo.com/123456789", duration_seconds: 300, transcript: "Transcrição de teste.", visibility: "equipe" } });
    const itens = (await rpc(EDITOR, "app_ch_unit_materials", { p_version_id: versao })) as any[];
    const video = itens.find((x) => x.id === v.id);
    expect(video).toMatchObject({ kind: "video", embed_url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", duration_seconds: 125, position: 2, origin: "inserido", visibility: "equipe" });
    expect(video.content.legenda).toBe("Legenda de teste");
    expect(itens.find((x) => x.id === a.id).embed_url).toBe("https://player.vimeo.com/video/123456789");
    for (const url of ["https://exemplo.com/aula.mp4", "http://youtu.be/dQw4w9WgXcQ", "https://evil.com/?https://youtu.be/dQw4w9WgXcQ", "javascript:alert(1)"])
      await expect(rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: { kind: "video", title: "x", url, duration_seconds: 10 } })).rejects.toThrow(/YouTube ou do Vimeo/);
    await expect(rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: { kind: "video", title: "x", url: "https://youtu.be/dQw4w9WgXcQ" } })).rejects.toThrow(/duração/);
    await expect(rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: { kind: "pdf_a4", title: "x" } })).rejects.toThrow(/tabela, áudio e vídeo/);
  });

  it("texto do aluno não leva referência; tabela do aluno exige afirmações da unidade", async () => {
    await expect(rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: { kind: "video", title: "Vídeo [1]", url: "https://youtu.be/dQw4w9WgXcQ", duration_seconds: 10 } })).rejects.toThrow(/não pode trazer referência/);
    await expect(rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: { kind: "tabela", title: "Tabela", headers: ["a"], rows: [["b"]] } })).rejects.toThrow(/precisa citar afirmações/);
    await expect(rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: { kind: "tabela", title: "Tabela", headers: ["a"], rows: [["b"]], claim_ids: ["00000000-0000-4000-8000-000000000001"] } })).rejects.toThrow(/não faz parte da base revisada/);
  });

  it("retirar não apaga: o item fica na lista como retirado, com motivo, e no histórico; dá para devolver", async () => {
    const story = await item("story");
    await expect(rpc(EDITOR, "app_ch_unit_material_retire", { p_item_id: story.id, p_reason: "" })).rejects.toThrow(/motivo/);
    await rpc(EDITOR, "app_ch_unit_material_retire", { p_item_id: story.id, p_reason: "Story fora da campanha." });
    const depois = await item("story");
    expect(depois).toMatchObject({ status: "retirado", retire_reason: "Story fora da campanha." });
    expect((await sql(`select count(*)::int n from public.ch_unit_materials where id = $1`, [story.id]))[0].n).toBe(1);
    await rpc(EDITOR, "app_ch_unit_material_restore", { p_item_id: story.id });
    expect((await item("story")).status).toBe("ativo");
    const h = (await rpc(EDITOR, "app_ch_unit_history", { p_version_id: versao })) as any[];
    expect(h.map((x) => x.acao)).toEqual(expect.arrayContaining(["unit.import", "unit.material.insert", "unit.material.retire", "unit.material.restore"]));
    expect(h.find((x) => x.acao === "unit.material.retire").detalhes.reason).toBe("Story fora da campanha.");
    expect(h.find((x) => x.acao === "unit.material.retire").quem).toBeTruthy();
    const texto = await item("texto_aula");
    await expect(rpc(EDITOR, "app_ch_unit_material_retire", { p_item_id: texto.id, p_reason: "x" })).rejects.toThrow(/não se retira/);
  });

  it("pré-visualizar como aluno: só o que o aluno veria (sem PDF, sem equipe, sem retirado, sem caminho de arquivo)", async () => {
    const video = await rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: { kind: "video", title: "Vídeo para o aluno", url: "https://youtu.be/dQw4w9WgXcQ", duration_seconds: 90, position: 3 } });
    const antes = await rpc(EDITOR, "app_ch_unit_student_preview", { p_version_id: versao });
    expect(antes.midias).toHaveLength(1);
    expect(antes.midias[0]).toMatchObject({ tipo: "video", titulo: "Vídeo para o aluno", duracao_segundos: 90 });
    expect(antes.secoes).toHaveLength(PACOTE.aula.sections.length);
    expect(antes.cabecalho).toMatch(/aguardando revisão médica da área/);
    expect(antes.revisao_aula.titulo).toMatch(/Revisão da Aula/);
    expect(antes.flashcards.cartoes).toHaveLength(9);
    expect(antes.questoes.itens).toHaveLength(3);
    const texto = JSON.stringify(antes);
    expect(texto).not.toMatch(/aulas-prontas|\.pdf|pdf_a4|pdf_interativo|Story|Card de feed|Flashcards A6|Só equipe|só equipe/);
    // retirar o vídeo tira da pré-visualização; o item continua na lista
    await rpc(EDITOR, "app_ch_unit_material_retire", { p_item_id: video.id, p_reason: "Teste." });
    expect((await rpc(EDITOR, "app_ch_unit_student_preview", { p_version_id: versao })).midias).toHaveLength(0);
    // a pré-visualização também não é do aluno
    for (const [, uid] of quem) await expect(rpc(uid, "app_ch_unit_student_preview", { p_version_id: versao })).rejects.toThrow();
  });

  it("arquivo de um item: só a equipe pede (e só o caminho, para o servidor ler do depósito)", async () => {
    const a4 = await item("pdf_a4");
    expect(await rpc(EDITOR, "app_ch_unit_material_file", { p_item_id: a4.id, p_idx: 0 })).toMatchObject({ tipo: "application/pdf", caminho: "aulas-prontas/GR-001/imagens/GR-001-pagina-a4.pdf" });
    expect(await rpc(REVISOR, "app_ch_unit_material_file", { p_item_id: a4.id, p_idx: 0 })).toMatchObject({ tipo: "application/pdf" });
    for (const [, uid] of quem) await expect(rpc(uid, "app_ch_unit_material_file", { p_item_id: a4.id, p_idx: 0 })).rejects.toThrow();
  });
});

describe("Ficha do revisor médico", () => {
  it("só a equipe importa a ficha; a mesma ficha de novo não muda nada", async () => {
    await expect(rpc(ALUNO, "app_ch_review_sheet_import", { p_version_id: versao, p_sheet: FICHA })).rejects.toThrow(/administrador ou editor/);
    await expect(rpc(REVISOR, "app_ch_review_sheet_import", { p_version_id: versao, p_sheet: FICHA })).rejects.toThrow(/administrador ou editor/);
    await expect(rpc(EDITOR, "app_ch_review_sheet_import", { p_version_id: versao, p_sheet: { decisoes: [] } })).rejects.toThrow(/lista "decisoes"/);
    expect(await rpc(EDITOR, "app_ch_review_sheet_import", { p_version_id: versao, p_sheet: FICHA, p_origin_name: "para-o-revisor-medico.md (v3)" })).toMatchObject({ resultado: "criada", decisoes: 6 });
    expect(await rpc(EDITOR, "app_ch_review_sheet_import", { p_version_id: versao, p_sheet: FICHA })).toMatchObject({ resultado: "sem_mudanca" });
    const f = await rpc(EDITOR, "app_ch_review_sheet", { p_version_id: versao });
    expect(f.existe).toBe(true);
    expect(f.ficha.decisoes.map((d: any) => d.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(f.ficha.pontos).toHaveLength(9);
    expect(f.ficha.fora.length).toBeGreaterThan(3);
    expect(f.decisoes).toEqual([]);
  });

  it("decisão do revisor: administrador ou revisor da área; editor, aluno e visitante não", async () => {
    for (const [, uid] of [["editor", EDITOR], ...quem] as const) await expect(rpc(uid, "app_ch_review_decide", { p_version_id: versao, p_n: 1, p_decision: "de_acordo" })).rejects.toThrow();
    await expect(rpc(ADMIN, "app_ch_review_decide", { p_version_id: versao, p_n: 9, p_decision: "de_acordo" })).rejects.toThrow(/não existe na ficha/);
    await expect(rpc(ADMIN, "app_ch_review_decide", { p_version_id: versao, p_n: 1, p_decision: "talvez" })).rejects.toThrow(/Decisão inválida/);
    await rpc(REVISOR, "app_ch_review_decide", { p_version_id: versao, p_n: 1, p_decision: "de_acordo", p_note: "Cenário, como está." });
    const d = await rpc(ADMIN, "app_ch_review_decide", { p_version_id: versao, p_n: 2, p_decision: "mudar", p_note: "Quero a referência." });
    expect(d.find((x: any) => x.n === 1)).toMatchObject({ decision: "de_acordo", note: "Cenário, como está." });
    expect(d.find((x: any) => x.n === 2).decision).toBe("mudar");
  });
});

describe("Aprovação médica: administrador ou revisor médico da área", () => {
  it("antes: editor, aluno e visitante não aprovam; sem as 6 decisões 'de acordo' ninguém aprova", async () => {
    for (const [, uid] of [["editor", EDITOR], ...quem] as const) await expect(rpc(uid, "app_ch_approve", { p_version_id: versao, p_kind: "medical" })).rejects.toThrow();
    await expect(rpc(ADMIN, "app_ch_approve", { p_version_id: versao, p_kind: "medical" })).rejects.toThrow(/Marque "de acordo" em todas as 6 decisões.*2, 3, 4, 5, 6/);
    expect((await sql(`select count(*)::int n from public.ch_approvals`))[0].n).toBe(0);
  });

  it("administrador aprova com as 6 decisões marcadas: grava quem, quando, o hash exato, a ficha e o resumo", async () => {
    for (const n of [2, 3, 4, 5, 6]) await rpc(ADMIN, "app_ch_review_decide", { p_version_id: versao, p_n: n, p_decision: "de_acordo" });
    const resumo = await rpc(ADMIN, "app_ch_approval_summary", { p_version_id: versao });
    expect(resumo).toMatchObject({ versao: 1, titulo: PACOTE.titulo });
    expect(resumo.ficha).toMatchObject({ existe: true, decisoes_total: 6 });
    expect(resumo.ficha.decisoes).toHaveLength(6);
    expect(resumo.mudancas.primeira_versao).toBe(true);
    expect(resumo.afirmacoes.validadas).toBe(86);
    const r = await rpc(ADMIN, "app_ch_approve", { p_version_id: versao, p_kind: "medical", p_note: "Conferido pelo administrador, que é médico." });
    expect(r.status).toBe("awaiting_review"); // falta a editorial
    const ap = (await sql(`select * from public.ch_approvals where kind = 'medical'`))[0];
    expect(ap).toMatchObject({ reviewer_id: ADMIN, area_code: "CLINICA_MEDICA", content_hash: (await sql(`select content_hash from public.ch_unit_versions where id = $1`, [versao]))[0].content_hash });
    expect(ap.decided_at).toBeTruthy();
    expect(ap.sheet).toHaveLength(6);
    expect(ap.sheet.every((d: any) => d.decision === "de_acordo")).toBe(true);
    expect(ap.summary.afirmacoes.validadas).toBe(86);
    const o = await rpc(EDITOR, "app_ch_unit_overview", { p_version_id: versao });
    expect(o.aprovacao_medica).toMatchObject({ valida: true, por: "adm83@t.dev", hash: ap.content_hash });
    expect(o.aprovacao_editorial.valida).toBe(false);
  });

  it("a aprovação médica não libera nada sozinha: a editorial é outra, e a publicação continua do administrador", async () => {
    await expect(rpc(ADMIN, "app_ch_publish", { p_version_id: versao, p_options: { confirm_similar: true } })).rejects.toThrow(/Só uma versão aprovada pode ser publicada/);
    expect((await sql(`select count(*)::int n from public.ch_publications`))[0].n).toBe(0);
    expect((await sql(`select count(*)::int n from public.lessons where published`))[0].n).toBe(0);
  });

  it("mudar a decisão depois de aprovar derruba a aprovação médica; mexer em material que o aluno vê também", async () => {
    await rpc(REVISOR, "app_ch_review_decide", { p_version_id: versao, p_n: 2, p_decision: "mudar", p_note: "Revi." });
    expect((await rpc(ADMIN, "app_ch_unit_overview", { p_version_id: versao })).aprovacao_medica.valida).toBe(false);
    await rpc(REVISOR, "app_ch_review_decide", { p_version_id: versao, p_n: 2, p_decision: "de_acordo", p_note: "De acordo." });
    // o revisor médico da área também aprova (e só ele, além do administrador)
    await rpc(REVISOR, "app_ch_approve", { p_version_id: versao, p_kind: "medical", p_note: "Revisor." });
    expect((await rpc(ADMIN, "app_ch_unit_overview", { p_version_id: versao })).aprovacao_medica).toMatchObject({ valida: true, por: "rev83@t.dev" });
    await rpc(EDITOR, "app_ch_approve", { p_version_id: versao, p_kind: "editorial" });
    expect((await sql(`select status from public.ch_unit_versions where id = $1`, [versao]))[0].status).toBe("approved");
    // inserir material que o aluno vê invalida as duas aprovações (o aluno veria algo que o revisor não viu)
    const novo = await rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: { kind: "audio", title: "Áudio depois da aprovação", url: "https://vimeo.com/987654321", duration_seconds: 30 } });
    expect(novo.status).toBe("draft");
    expect((await sql(`select count(*)::int n from public.ch_approvals where invalidated_at is null`))[0].n).toBe(0);
    await rpc(EDITOR, "app_ch_unit_material_retire", { p_item_id: novo.id, p_reason: "Teste." });
  });

  it("sem usuário (processamento, IA, automação) nunca aprova", async () => {
    await expect(rpc(null, "app_ch_approve", { p_version_id: versao, p_kind: "medical" })).rejects.toThrow();
    await expect(sql(`select public.app_ch_approve($1, 'medical')`, [versao])).rejects.toThrow(/Entre na sua conta/);
    await expect(sql(`select public.app_ch_review_decide($1, 1, 'de_acordo')`, [versao])).rejects.toThrow(/Entre na sua conta/);
  });
});

describe("Publicar ao aluno: aprovação médica + editorial + modo geral do portão de atualidade", () => {
  const prepararParaPublicar = async () => {
    await rpc(EDITOR, "app_ch_submit_for_review", { p_version_id: versao }).catch(() => undefined);
    await rpc(ADMIN, "app_ch_approve", { p_version_id: versao, p_kind: "medical", p_note: "ok" });
    await rpc(EDITOR, "app_ch_approve", { p_version_id: versao, p_kind: "editorial" });
    for (const m of await sql(`select id, content_hash from public.ch_materials where unit_version_id = $1 and kind in ('lesson', 'visual_cards')`, [versao]))
      await sql(`select public.ch_worker_save_render($1::jsonb)`, [JSON.stringify({ material_id: m.id, format: "pdf", storage_path: `renders/${m.id}.pdf`, sha256: sha(m.id), template_version: "t", brand_version: "b", material_hash: m.content_hash, check_result: { ok: true } })]);
  };

  it("com tudo aprovado a tela segue o modo geral do portão: desligado não exige, bloqueia trava, só avisar publica com o motivo; só administrador", async () => {
    await rpc(EDITOR, "app_ch_submit_for_review", { p_version_id: versao });
    // afirmações com dose, tempo ou via esperam a conferência médica: editor e aluno não conferem; administrador e revisor da área sim
    const criticas = (await sql(`select c.id from public.ch_claims c join public.ch_unit_claims uc on uc.claim_id = c.id where uc.unit_version_id = $1 and cardinality(c.critical_kinds) > 0 and c.critical_checked_by is null order by c.id`, [versao])).map((x) => x.id);
    expect(criticas.length).toBeGreaterThan(5);
    expect((await rpc(ADMIN, "app_ch_unit_overview", { p_version_id: versao })).afirmacoes.criticas_sem_conferencia).toBe(criticas.length);
    for (const uid of [EDITOR, ALUNO, null]) await expect(rpc(uid, "app_ch_confirm_critical", { p_claim_id: criticas[0] })).rejects.toThrow();
    await rpc(REVISOR, "app_ch_confirm_critical", { p_claim_id: criticas[0] });
    for (const id of criticas.slice(1)) await rpc(ADMIN, "app_ch_confirm_critical", { p_claim_id: id });
    expect((await rpc(ADMIN, "app_ch_unit_overview", { p_version_id: versao })).afirmacoes.criticas_sem_conferencia).toBe(0);
    for (const n of [1, 2, 3, 4, 5, 6]) await rpc(ADMIN, "app_ch_review_decide", { p_version_id: versao, p_n: n, p_decision: "de_acordo" });
    await prepararParaPublicar();
    expect((await sql(`select status from public.ch_unit_versions where id = $1`, [versao]))[0].status).toBe("approved");
    // decisão do dono (14/10/2026): a tela de Unidades SEGUE o modo geral do portão, sem exigência própria
    // 'desligado' (o padrão): o tema sem dossiê não segura nada
    const desl = await rpc(ADMIN, "app_ch_unit_overview", { p_version_id: versao });
    expect(desl.portao.modo).toBe("desligado");
    expect(desl.portao.status).not.toBe("ok");
    expect(desl.publicacao.problemas).toEqual([]);
    expect(desl.pode.publicar).toBe(true);
    // 'bloqueia': o tema fora de "ok" trava, pelas duas portas
    await rpc(ADMIN, "app_admin_vigilance_set_gate", { p_mode: "bloqueia" });
    const o = await rpc(ADMIN, "app_ch_unit_overview", { p_version_id: versao });
    expect(o.portao.modo).toBe("bloqueia");
    expect(o.portao.status).not.toBe("ok");
    expect(o.publicacao.problemas.join(" ")).toMatch(/Vigilância científica/);
    expect(o.pode.publicar).toBe(false);
    await expect(rpc(ADMIN, "app_ch_publish", { p_version_id: versao, p_options: { confirm_similar: true } })).rejects.toThrow(/Vigilância científica/);
    await expect(rpc(ADMIN, "app_ch_unit_publish", { p_version_id: versao, p_options: { confirm_similar: true } })).rejects.toThrow(/Vigilância científica/);
    for (const uid of [EDITOR, REVISOR, ALUNO, null]) for (const fn of ["app_ch_publish", "app_ch_unit_publish"]) await expect(rpc(uid, fn, { p_version_id: versao, p_options: {} })).rejects.toThrow();
    expect((await sql(`select count(*)::int n from public.ch_publications`))[0].n).toBe(0);
    // 'aviso': publica e devolve o motivo
    await rpc(ADMIN, "app_admin_vigilance_set_gate", { p_mode: "aviso" });
    const av = await rpc(ADMIN, "app_ch_unit_overview", { p_version_id: versao });
    expect(av.portao.modo).toBe("aviso");
    expect(av.portao.status).not.toBe("ok");
    expect(av.pode.publicar).toBe(true);
    const pub = await rpc(ADMIN, "app_ch_unit_publish", { p_version_id: versao, p_options: { confirm_similar: true } });
    expect(pub.content_hash).toBeTruthy();
    expect(pub.portao.modo).toBe("aviso");
    expect(pub.portao.status).not.toBe("ok");
    expect((pub.portao.motivos ?? []).length).toBeGreaterThan(0);
    expect((await sql(`select status from public.ch_unit_versions where id = $1`, [versao]))[0].status).toBe("published");
  });

  it("versão no ar não se edita: inserir ou retirar material pede a versão para corrigir", async () => {
    await expect(rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: { kind: "audio", title: "Tarde demais", url: "https://vimeo.com/987654321", duration_seconds: 30 } })).rejects.toThrow(/está no ar/);
    const story = await item("story");
    await expect(rpc(EDITOR, "app_ch_unit_material_retire", { p_item_id: story.id, p_reason: "x" })).rejects.toThrow(/está no ar/);
    const nova = await rpc(EDITOR, "app_ch_new_version", { p_from_version_id: versao });
    const itens = (await rpc(EDITOR, "app_ch_unit_materials", { p_version_id: nova })) as any[];
    expect(itens.map((x) => x.kind)).toContain("pdf_a4");
    expect(itens.length).toBeGreaterThanOrEqual(9);
    // a versão nova é outra aprovação: nada herdado
    const o = await rpc(ADMIN, "app_ch_unit_overview", { p_version_id: nova });
    expect(o.aprovacao_medica.valida).toBe(false);
    const mud = (await rpc(ADMIN, "app_ch_approval_summary", { p_version_id: nova })).mudancas;
    expect(mud).toMatchObject({ primeira_versao: false, versao_anterior: 1, texto_igual: true, paragrafos_novos: 0 });
    expect((await rpc(ADMIN, "app_ch_review_sheet", { p_version_id: nova })).existe).toBe(true); // a ficha acompanha; as decisões recomeçam
    expect((await rpc(ADMIN, "app_ch_review_sheet", { p_version_id: nova })).decisoes).toEqual([]);
  });
});

describe("Permissões: aluno nunca vê a Central", () => {
  const funcoes: [string, Record<string, unknown>][] = [
    ["app_ch_unit_overview_list", {}], ["app_ch_unit_overview", { p_version_id: "$v" }], ["app_ch_unit_materials", { p_version_id: "$v" }], ["app_ch_unit_history", { p_version_id: "$v" }],
    ["app_ch_approval_summary", { p_version_id: "$v" }], ["app_ch_review_sheet", { p_version_id: "$v" }], ["app_ch_unit_student_preview", { p_version_id: "$v" }],
  ];
  it("aluno e visitante são recusados em toda função nova da tela", async () => {
    for (const [fn, args] of funcoes)
      for (const [, uid] of quem) {
        const a = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v === "$v" ? versao : v]));
        await expect(rpc(uid, fn, a), `${fn} para ${uid ? "aluno" : "visitante"}`).rejects.toThrow();
      }
  });
  it("as tabelas novas não se leem nem se gravam direto (aluno, visitante, nem editor)", async () => {
    for (const t of ["ch_unit_materials", "ch_review_sheets", "ch_review_decisions"]) {
      await expect(asUser(ALUNO, `select * from public.${t}`)).rejects.toThrow(/permission denied/);
      await expect(asUser(EDITOR, `delete from public.${t}`)).rejects.toThrow(/permission denied/);
    }
  });
  it("revisor médico lê a unidade (sem papel de equipe) mas não insere nem retira material", async () => {
    expect((await rpc(REVISOR, "app_ch_unit_materials", { p_version_id: versao })).length).toBeGreaterThan(8);
    await expect(rpc(REVISOR, "app_ch_unit_material_insert", { p_version_id: versao, p_item: { kind: "video" } })).rejects.toThrow(/administrador ou editor/);
    const story = await item("story");
    await expect(rpc(REVISOR, "app_ch_unit_material_retire", { p_item_id: story.id, p_reason: "x" })).rejects.toThrow(/administrador ou editor/);
  });
  it("a aula do aluno não leva PDF, arquivo, fonte nem referência", async () => {
    const l = await sql(`select public.ch_student_lesson($1) as l`, [versao]).catch(async () => (await db.query(`select public.ch_student_lesson($1) as l`, [versao])).rows);
    const txt = JSON.stringify(l);
    expect(txt).not.toMatch(/pdf|aulas-prontas|Fontes oficiais desta aula|\[\d+\]|Trechos citados/i);
  });
});

describe("Anotações do aluno (Minhas anotações e caixas marcadas)", () => {
  let aula: string;
  beforeAll(async () => {
    aula = (await sql(`select id from public.lessons where published limit 1`))[0].id;
  });
  it("cada aluno só vê e grava as suas; o outro aluno, o editor e o administrador não leem", async () => {
    await rpc(ALUNO, "app_lesson_notes_save", { p_lesson_id: aula, p_note: "Minha anotação privada.", p_checks: { "1": true, "2": false } });
    await rpc(ALUNO2, "app_lesson_notes_save", { p_lesson_id: aula, p_note: "Do outro aluno.", p_checks: {} });
    expect(await rpc(ALUNO, "app_lesson_notes", { p_lesson_id: aula })).toMatchObject({ note: "Minha anotação privada.", checks: { "1": true, "2": false } });
    expect((await rpc(ALUNO2, "app_lesson_notes", { p_lesson_id: aula })).note).toBe("Do outro aluno.");
    expect((await asUser(ALUNO, `select note from public.lesson_notes`)).map((x) => x.note)).toEqual(["Minha anotação privada."]);
    expect(await asUser(ADMIN, `select note from public.lesson_notes`)).toEqual([]);
    expect(await asUser(EDITOR, `select note from public.lesson_notes`)).toEqual([]);
    await expect(asUser(ALUNO, `insert into public.lesson_notes (user_id, lesson_id, note) values ('${ALUNO2}', '${aula}', 'forjado')`)).rejects.toThrow(/permission denied/);
    await expect(asUser(ALUNO, `update public.lesson_notes set note = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(rpc(null, "app_lesson_notes", { p_lesson_id: aula })).rejects.toThrow();
  });
  it("regrava a mesma linha (sem duplicar), recusa limite, chave ruim e aula não publicada", async () => {
    await rpc(ALUNO, "app_lesson_notes_save", { p_lesson_id: aula, p_note: "Segunda versão.", p_checks: { "1": false } });
    expect((await sql(`select count(*)::int n from public.lesson_notes where user_id = $1`, [ALUNO]))[0].n).toBe(1);
    expect((await rpc(ALUNO, "app_lesson_notes", { p_lesson_id: aula })).checks).toEqual({ "1": false });
    await expect(rpc(ALUNO, "app_lesson_notes_save", { p_lesson_id: aula, p_note: "x".repeat(20001), p_checks: {} })).rejects.toThrow(/20\.000/);
    await expect(rpc(ALUNO, "app_lesson_notes_save", { p_lesson_id: aula, p_note: "", p_checks: { a: "sim" } })).rejects.toThrow(/Caixa marcada inválida/);
    await expect(rpc(ALUNO, "app_lesson_notes_save", { p_lesson_id: "00000000-0000-4000-8000-0000000000aa", p_note: "", p_checks: {} })).rejects.toThrow(/Aula não encontrada/);
    expect(await rpc(ALUNO, "app_lesson_notes", { p_lesson_id: "00000000-0000-4000-8000-0000000000aa" })).toMatchObject({ note: "" });
  });
  it("apagar a conta do aluno apaga as anotações dele", async () => {
    await sql(`delete from auth.users where id = $1`, [ALUNO2]);
    expect((await sql(`select count(*)::int n from public.lesson_notes where user_id = $1`, [ALUNO2]))[0].n).toBe(0);
  });
});
