// @vitest-environment node
/**
 * Fontes complementares (supabase/migrations/…9620_fontes_complementares.sql), num Postgres real em memória com TODAS as migrações.
 *
 * Regra do dono: as apostilas "Sangue nos Olhos" entram na biblioteca como fonte COMPLEMENTAR (valem para a IA e para a equipe),
 * mas nada que as identifique chega ao aluno. O teste de varredura liga uma fonte complementar a conteúdo (questão com análise
 * publicada e cartão de atualização, aula, podcast publicado, diretriz, contexto do Tutor) e chama COMO ALUNO cada função que
 * devolve fonte: o JSON inteiro da resposta não pode conter título, órgão, link, nome de arquivo nem "Sangue". Como administrador as
 * mesmas fontes aparecem. A fonte oficial ao lado da complementar continua aparecendo.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const NOVA = path.join(MIGRATIONS, "20261003009620_fontes_complementares.sql");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000ed";
const ALUNA = "00000000-0000-4000-8000-00000000000a";

const COMP_TITLE = "Sangue nos Olhos — Clínica Médica";
const COMP_ORGAN = "Sangue nos Olhos";
const COMP_URL = "https://apostilas.sangue-exemplo.invalid/clinica-medica-2026.pdf";
const COMP_FILE = "sangue-nos-olhos-clinica-medica-2026.pdf";
const OFI_TITLE = "PCDT de Bronquiolite (teste)";
const OFI_ORGAN = "Ministério da Saúde (teste)";
const OFI_URL = "https://www.gov.br/saude/pcdt-bronquiolite-teste";
// apostila de nome neutro (não diz "Sangue"): só a classe na biblioteca a esconde do aluno
const NEU_TITLE = "Manual de Pediatria Alfa (teste)";
const NEU_ORGAN = "Editora Alfa (teste)";
const NEU_URL = "https://editora-alfa.invalid/pediatria.pdf";
/** Nada disto pode aparecer na resposta ao aluno. */
const PROIBIDOS = [COMP_TITLE, COMP_ORGAN, COMP_URL, COMP_FILE, "Sangue", "sangue-exemplo", "Clínica Médica", "clinica-medica", NEU_TITLE, NEU_ORGAN, NEU_URL, "editora-alfa"];

let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
    return r.rows[0].result;
  });
}
async function recusa(p: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await p;
  } catch (e: any) {
    return { message: e.message, code: e.code };
  }
  throw new Error("Era para recusar, mas passou.");
}
const sql = async <T = any>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
/** Consulta direta como aluno (o que a tabela devolve pelo PostgREST). */
async function comoAluno<T = any>(text: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ALUNA })]);
    return (await tx.query<T>(text)).rows;
  });
}
const limpo = (resposta: unknown) => {
  const texto = JSON.stringify(resposta ?? null);
  for (const termo of PROIBIDOS) expect(texto, `a resposta ao aluno traz "${termo}"`).not.toContain(termo);
  return texto;
};

const opcoes = ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: id === "B" ? "B é a conduta." : "" }));
const questao = {
  kind: "REVALIDA", year: 2024, semester: 1, number: 1, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "Manejo",
  statement: "Lactente de 4 meses com sibilância e coriza há 2 dias. Qual a conduta?",
  options: opcoes, correct_option: "B", status: "valid", expected_conduct: "Suporte.", inep_intent: "", needs_image: false,
  // gabarito da prova com a fonte digitada na importação: uma oficial e uma complementar
  sources: [
    { title: "Gabarito oficial definitivo INEP 2024/1 (teste)", organization: "INEP" },
    { title: COMP_TITLE, organization: COMP_ORGAN, url: COMP_URL },
  ],
};
const QID = "revalida_2024_1_q001";

let sOficial: string;
let sComp: string;
let sNeutra: string;
let podcastId: string;
let aulaId: string;
let atualizacaoSlug = "diretriz-bronquiolite-teste";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [id, email, name] of [[ADMIN, "master@teste.dev", "Master"], [EDITOR, "editor@teste.dev", "Editora"], [ALUNA, "aluna@teste.dev", "Aluna"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);

  // fontes: a oficial e a futura complementar (começa oficial, nível A, como estaria uma apostila cadastrada por engano)
  sOficial = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level) values ($1, $2, 'final', $3, '1', 'A') returning id`, [OFI_TITLE, OFI_ORGAN, OFI_URL]))[0].id;
  sComp = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level) values ($1, $2, 'final', $3, '2026', 'A') returning id`, [COMP_TITLE, COMP_ORGAN, COMP_URL]))[0].id;

  sNeutra = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level) values ($1, $2, 'final', $3, '3', 'B') returning id`, [NEU_TITLE, NEU_ORGAN, NEU_URL]))[0].id;

  // questão com análise publicada, evidência das duas fontes e cartão de atualização que cita as duas
  // (APOIO-B) a checagem ao salvar barra a equipe de digitar a apostila: salva só com a fonte oficial e grava a fonte antiga direto
  // no banco (como um dado antigo), que é o que este teste quer provar que o aluno não recebe.
  await rpc(ADMIN, "app_admin_save_question", { p_question: { ...questao, sources: questao.sources.slice(0, 1) } });
  await sql(`update public.questions set sources = $2::jsonb where id = $1`, [QID, JSON.stringify(questao.sources)]);
  const claim = (await sql(`insert into public.ch_claims (statement) values ('Suporte é a conduta na bronquiolite leve.') returning id`))[0].id;
  await sql(`insert into public.question_claims (question_id, claim_id, role) values ($1, $2, 'solves')`, [QID, claim]);
  for (const [src, page] of [[sOficial, 12], [sComp, 345], [sNeutra, 77]] as const) {
    await sql(
      `insert into public.ch_evidence (claim_id, source_id, section, page, source_version, quote, verdict, checked_by) values ($1, $2, 'Conduta', $3, '1', 'Suporte clínico.', 'compatible', $4)`,
      [claim, src, page, ADMIN]
    );
  }
  const analise = (await sql(
    `insert into public.question_analysis (question_id, version, question_core, basis_hash, status, official_answer_at_analysis, reviewed_at)
     select q.id, 1, 'Pede a conduta na bronquiolite leve.', 'x', 'published', q.correct_option, now() from public.questions q where q.id = $1 returning id`, [QID]))[0].id;
  await sql(
    `insert into public.question_option_analysis (analysis_id, question_id, option_id, is_official_correct, distractor_kind, reasoning, why_wrong, trap)
     values ($1, $2, 'B', true, 'CORRECT', 'B é a conduta.', null, null)`, [analise, QID]);
  await sql(
    `insert into public.question_update_cards (question_id, version, temporal_status, impact_level, official_answer, current_answer, what_changed, sources, reviewed_by)
     values ($1, 1, 'UPDATED_BUT_SAME_ANSWER', 'COMMENT_ONLY', 'B', 'B', 'A diretriz manteve a conduta.', $2::jsonb, $3)`,
    [QID, JSON.stringify([
      { title: OFI_TITLE, organ: OFI_ORGAN, version: "1", page: 12, url: OFI_URL },
      { title: COMP_TITLE, organ: COMP_ORGAN, version: "2026", page: 345, url: COMP_URL },
      { title: NEU_TITLE, organ: NEU_ORGAN, version: "3", page: 77, url: NEU_URL },
    ]), ADMIN]);
  await sql(`insert into public.question_official_answers (question_id, version, answer, answer_status, source) values ($1, 1, 'B', 'FINAL', $2)`, [QID, `Gabarito INEP; ${COMP_TITLE}`]);
  // a aluna respondeu a questão (por isso vê correção e comentário)
  await sql(`insert into public.practice_sessions (user_id, kind, question_ids, finished_at) values ($1, 'questoes', $2, now())`, [ALUNA, [QID]]);

  // aula com a diretriz e um material que identificam a apostila, e um material normal
  aulaId = (await sql(
    `insert into public.lessons (area, topic, title, guideline_title, guideline_url, published) values ('PEDIATRIA', 'Bronquiolite', 'Bronquiolite na prática', $1, $2, true) returning id`,
    [COMP_TITLE, COMP_URL]))[0].id;
  await sql(`insert into public.lesson_materials (lesson_id, kind, title, url) values ($1, 'slides', 'Slides da aula', 'https://exemplo.invalid/slides')`, [aulaId]);
  await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1, 'other', $2, $3)`, [aulaId, COMP_FILE, `lessons/${aulaId}/${COMP_FILE}`]);

  // podcast publicado com fonte oficial e fonte vinda da apostila (enviada como arquivo)
  podcastId = (await sql(
    `insert into public.podcasts (title, topic, area, status, script, approved_at, audio_path, published_at)
     values ('Bronquiolite em 8 minutos', 'Bronquiolite', 'PEDIATRIA', 'published', '{"lines":[{"speaker":"ANA","text":"Vamos falar de bronquiolite.","sources":[]}]}'::jsonb, now(), 'podcasts/x.mp3', now()) returning id`))[0].id;
  const pOf = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, url, position) values ($1, 'link', $2, $3, 1) returning id`, [podcastId, OFI_TITLE, OFI_URL]))[0].id;
  const pComp = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, pages, position) values ($1, 'pdf', $2, 'podcasts/a.pdf', 400, 2) returning id`, [podcastId, COMP_FILE]))[0].id;
  await sql(`insert into public.podcast_chunks (podcast_id, source_id, ord, page, text) values ($1, $2, 0, 12, 'Trecho oficial.'), ($1, $3, 0, 345, 'Trecho da apostila.')`, [podcastId, pOf, pComp]);

  // atualização/diretriz publicada que cita a apostila como documento
  await sql(
    `insert into public.guideline_updates (slug, area, topic, institution, document_title, source_url, published, review_status, source_checked_at, reviewed_by, reviewed_at)
     values ($1, 'PEDIATRIA', 'Bronquiolite leve', $2, $3, $4, true, 'approved', now(), $5, now())`,
    [atualizacaoSlug, COMP_ORGAN, COMP_TITLE, COMP_URL, ADMIN]);
}, 90_000);

describe("classe da fonte", () => {

  it("só o administrador muda a classe, com registro; editor e aluna são recusados", async () => {
    expect((await recusa(rpc(EDITOR, "app_ch_set_source_audience", { p_source_id: sComp, p_audience: "complementar" }))).message).toMatch(/administrador/i);
    expect((await recusa(rpc(ALUNA, "app_ch_set_source_audience", { p_source_id: sComp, p_audience: "complementar" }))).message).toMatch(/administrador|permiss/i);
    expect((await recusa(rpc(ADMIN, "app_ch_set_source_audience", { p_source_id: sComp, p_audience: "secreta" }))).code).toBe("22023");
    expect((await sql(`select audience from public.ch_sources where id = $1`, [sComp]))[0].audience).toBe("oficial");
  });

  it("fonte nova de nível E nasce complementar; as outras continuam oficiais; nada é marcado sozinho", async () => {
    const e = (await sql(`insert into public.ch_sources (title, organ, authority_level) values ('Livro de apoio', 'Editora X', 'E') returning audience`))[0];
    expect(e.audience).toBe("complementar");
    expect((await sql(`select audience from public.ch_sources where id = $1`, [sOficial]))[0].audience).toBe("oficial");
    expect((await sql(`select audience from public.ch_sources where id = $1`, [sComp]))[0].audience).toBe("oficial");
  });

  it("ANTES de marcar: a fonte de nome neutro ainda aparece ao aluno; a que cita Sangue nos Olhos já fica escondida (regra do dono, vale antes do cadastro)", async () => {
    const c = await rpc(ALUNA, "app_question_commentary", { p_question_id: QID, p_level: "full" });
    expect(c.sources.map((s: any) => s.title).sort()).toEqual([NEU_TITLE, OFI_TITLE].sort());
  });

  it("marcar como complementar: nível vai para E, fica no registro (ch_audit e Registro da Administração) e vale duas vezes", async () => {
    const r = await rpc(ADMIN, "app_ch_set_source_audience", { p_source_id: sComp, p_audience: "complementar", p_reason: "Apostila Sangue nos Olhos" });
    expect(r).toMatchObject({ audience: "complementar", authority_level: "E" });
    expect(await rpc(ADMIN, "app_ch_set_source_audience", { p_source_id: sNeutra, p_audience: "complementar" })).toMatchObject({ audience: "complementar", authority_level: "E" });
    await rpc(ADMIN, "app_ch_set_source_audience", { p_source_id: sComp, p_audience: "complementar" });
    expect((await sql(`select count(*)::int n from public.ch_audit where action = 'source.audience' and target = $1`, [sComp]))[0].n).toBe(1);
    expect((await sql(`select count(*)::int n from public.admin_audit_log where action = 'source.audience' and target = $1`, [sComp]))[0].n).toBe(1);
  });

  it("fonte complementar não aceita nível A a D; oficial aceita", async () => {
    expect((await recusa(rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: sComp, p_level: "B" }))).message).toMatch(/complementar/i);
    expect((await recusa(sql(`update public.ch_sources set authority_level = 'A' where id = $1`, [sComp]))).message).toMatch(/complementar/i);
    expect(await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: sOficial, p_level: "A" })).toBe(true);
  });

  it("a lista de classes é da equipe; aluna é recusada", async () => {
    const mapa = await rpc(EDITOR, "app_ch_source_audiences");
    expect(mapa[sComp]).toBe("complementar");
    expect(mapa[sOficial]).toBe("oficial");
    await recusa(rpc(ALUNA, "app_ch_source_audiences"));
  });
});

describe("varredura: o que a aluna recebe NÃO identifica a fonte complementar", () => {
  it("correção da questão: a fonte oficial do gabarito aparece, a complementar não", async () => {
    const c = await rpc(ALUNA, "practice_correction_view", { p_question_id: QID, p_selected: "B" });
    const texto = limpo(c);
    expect(texto).toContain("Gabarito oficial definitivo INEP 2024/1 (teste)");
    expect(c.sources).toHaveLength(1);
  });

  it("comentário da questão: fontes, cartão de atualização, selo e atualidade só contam a fonte oficial", async () => {
    const c = await rpc(ALUNA, "app_question_commentary", { p_question_id: QID, p_level: "full" });
    const texto = limpo(c);
    expect(c.sources.map((s: any) => s.title)).toEqual([OFI_TITLE]);
    expect(c.update_card.sources.map((s: any) => s.title)).toEqual([OFI_TITLE]);
    expect(texto).toContain(OFI_TITLE);
    expect(c.freshness.sources).toBe(1);
  });

  it("linha do tempo: o gabarito oficial não cita a apostila", async () => {
    const t = await rpc(ALUNA, "app_question_timeline", { p_question_id: QID });
    const texto = limpo(t);
    expect(texto).toContain("OFFICIAL_ANSWER");
  });

  it("Tutor: o que o servidor recebe da questão (tutor_truth) não traz a apostila", async () => {
    const t = (await sql(`select public.tutor_truth($1, 'full') t`, [QID]))[0].t;
    const texto = limpo(t);
    expect(texto).toContain("Gabarito oficial definitivo INEP");
    expect(t.update_card.sources.map((s: any) => s.title)).toEqual([OFI_TITLE]);
  });

  it("busca do Tutor e das checagens oficiais: a fonte complementar nunca entra", async () => {
    await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, 12, 'bronquiolite suporte oficial'), ($2, 345, 'bronquiolite suporte apostila')`, [sOficial, sComp]);
    const achados = (await sql(`select public.ch_worker_search_official_passages('bronquiolite', 5) r`))[0].r;
    expect(achados.map((p: any) => p.source)).toEqual([OFI_TITLE]);
    // mas a busca ampla da equipe e da IA (evidência, conferência) continua achando a complementar
    const amplos = (await sql(`select public.ch_worker_search_passages('bronquiolite', 5) r`))[0].r;
    expect(amplos.map((p: any) => p.source).sort()).toEqual([COMP_TITLE, OFI_TITLE].sort());
  });

  it("podcast publicado: a lista e o episódio não trazem a fonte da apostila, nem páginas dela, nem buraco na numeração", async () => {
    const lista = await rpc(ALUNA, "app_podcasts");
    limpo(lista);
    const ep = await rpc(ALUNA, "app_podcast", { p_id: podcastId });
    limpo(ep);
    expect(ep.sources.map((s: any) => s.title)).toEqual([OFI_TITLE]);
    expect(ep.sources[0].pages ?? []).toEqual([]);
  });

  it("podcast: fonte marcada à mão como complementar também some, mesmo com nome neutro", async () => {
    const neutra = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'Resumo-final.pdf', 'podcasts/b.pdf', 3) returning id`, [podcastId]))[0].id;
    expect((await rpc(ALUNA, "app_podcast", { p_id: podcastId })).sources).toHaveLength(2);
    await sql(`update public.podcasts set status = 'published' where id = $1`, [podcastId]);
    await rpc(ADMIN, "app_admin_podcast_source_complementar", { p_source_id: neutra, p_complementar: true });
    expect((await rpc(ALUNA, "app_podcast", { p_id: podcastId })).sources.map((s: any) => s.title)).toEqual([OFI_TITLE]);
  });

  it("aula: diretriz e material que identificam a apostila não saem (lista, aula e leitura direta da tabela)", async () => {
    limpo(await rpc(ALUNA, "app_lessons"));
    const aula = await rpc(ALUNA, "app_lesson", { p_id: aulaId });
    limpo(aula);
    // rótulo neutro (9580) e só o material que não identifica a apostila
    expect(aula.materials.map((m: any) => m.title)).toEqual(["Material complementar"]);
    expect(aula.materials[0].file_title).toBeUndefined();
    expect(aula.guideline_title).toBeNull();
    // a tabela de materiais não se lê direto (9580): nada chega ao aluno
    expect(await comoAluno(`select title, url from public.lesson_materials`)).toEqual([]);
    const matComp = (await sql(`select id from public.lesson_materials where title = $1`, [COMP_FILE]))[0].id;
    expect(await rpc(ALUNA, "app_lesson_material", { p_id: matComp })).toBeNull();
    expect((await rpc(ADMIN, "app_lesson_material", { p_id: matComp })).title).toBe(COMP_FILE);
  });

  it("Atualizações & Diretrizes: instituição, documento e link da apostila não saem", async () => {
    limpo(await rpc(ALUNA, "app_guideline_updates"));
    limpo(await rpc(ALUNA, "app_guideline_update", { p_slug: atualizacaoSlug }));
  });

  it("o texto de uma fonte trocada depois de salvo é conferido de novo (a aula passa a esconder)", async () => {
    await sql(`update public.lessons set guideline_title = 'Diretriz oficial qualquer', guideline_url = 'https://www.gov.br/x' where id = $1`, [aulaId]);
    expect((await rpc(ALUNA, "app_lesson", { p_id: aulaId })).guideline_title).toBe("Diretriz oficial qualquer");
    await sql(`update public.lessons set guideline_title = $2 where id = $1`, [aulaId, `Resumo da ${COMP_TITLE}`]);
    expect((await rpc(ALUNA, "app_lesson", { p_id: aulaId })).guideline_title).toBeNull();
  });
});

describe("administrador e equipe continuam vendo tudo", () => {
  it("comentário, correção, cartão, aula, podcast e diretriz trazem a fonte complementar", async () => {
    for (const uid of [ADMIN, EDITOR]) {
      const c = await rpc(uid, "app_question_commentary", { p_question_id: QID, p_level: "full" });
      expect(c.update_card.sources.map((s: any) => s.title).sort()).toEqual([COMP_TITLE, NEU_TITLE, OFI_TITLE].sort());
      const corr = await rpc(uid, "practice_correction_view", { p_question_id: QID, p_selected: "B" });
      expect(JSON.stringify(corr)).toContain(COMP_TITLE);
      expect((await rpc(uid, "app_podcast", { p_id: podcastId })).sources.length).toBeGreaterThanOrEqual(3);
      const aula = await rpc(uid, "app_lesson", { p_id: aulaId });
      expect(aula.materials.map((m: any) => m.file_title)).toContain(COMP_FILE);
      expect(JSON.stringify(await rpc(uid, "app_guideline_update", { p_slug: atualizacaoSlug }))).toContain(COMP_TITLE);
    }
    expect(JSON.stringify(await rpc(ADMIN, "app_question_timeline", { p_question_id: QID }))).toContain(COMP_TITLE);
  });

  it("a busca ampla traz a complementar para a IA e para a equipe (vale como fonte)", async () => {
    const termos = (await sql(`select public.ch_worker_complementar_terms() t`))[0].t as string[];
    expect(termos).toEqual(expect.arrayContaining([COMP_TITLE, COMP_ORGAN, "Sangue nos Olhos"]));
  });
});

describe("selos honestos: só fonte oficial dá selo", () => {
  it("conteúdo apoiado só em fonte complementar não ganha 'fontes conferidas' nem atualidade", async () => {
    await sql(`insert into public.ch_sources (title, organ, kind, authority_level) values ('Outra apostila de apoio', 'Editora Y', 'final', 'E')`);
    const q2 = { ...questao, number: 2, sources: [] };
    await rpc(ADMIN, "app_admin_save_question", { p_question: q2 });
    const id2 = "revalida_2024_1_q002";
    const claim = (await sql(`insert into public.ch_claims (statement) values ('Outra afirmação.') returning id`))[0].id;
    await sql(`insert into public.question_claims (question_id, claim_id, role) values ($1, $2, 'solves')`, [id2, claim]);
    await sql(`insert into public.ch_evidence (claim_id, source_id, page, quote, verdict, checked_by) values ($1, $2, 3, 'Trecho.', 'compatible', $3)`, [claim, sComp, ADMIN]);
    const a = (await sql(`insert into public.question_analysis (question_id, version, question_core, basis_hash, status, official_answer_at_analysis, reviewed_at, temporal_status, last_source_check_at)
       values ($1, 1, 'Pede a conduta.', 'y', 'published', 'B', now(), 'CURRENT', now()) returning id`, [id2]))[0].id;
    await sql(`insert into public.question_option_analysis (analysis_id, question_id, option_id, is_official_correct, distractor_kind, reasoning) values ($1, $2, 'B', true, 'CORRECT', 'B.')`, [a, id2]);
    await sql(`insert into public.practice_sessions (user_id, kind, question_ids, finished_at) values ($1, 'questoes', $2, now())`, [ALUNA, [id2]]);
    const c = await rpc(ALUNA, "app_question_commentary", { p_question_id: id2, p_level: "full" });
    limpo(c);
    expect(c.sources).toEqual([]);
    expect(c.seal).toBeNull();
    expect(c.freshness.sources).toBe(0);
    expect(c.freshness.score).toBe(0);
  });
});

describe("varredura do que já está publicado", () => {
  it("o administrador vê as aulas e podcasts publicados que citam a apostila; a aluna e o editor são recusados", async () => {
    await sql(`update public.lessons set summary = 'Como diz a apostila, o suporte basta.' where id = $1`, [aulaId]);
    const achados = await rpc(ADMIN, "app_ch_complementar_mentions");
    expect(achados).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "aula", id: aulaId })]));
    expect(achados.find((a: any) => a.kind === "analise")).toBeUndefined();
    await recusa(rpc(ALUNA, "app_ch_complementar_mentions"));
    await recusa(rpc(EDITOR, "app_ch_complementar_mentions"));
    await sql(`update public.lessons set summary = 'Suporte clínico.' where id = $1`, [aulaId]);
    expect((await rpc(ADMIN, "app_ch_complementar_mentions")).find((a: any) => a.kind === "aula")).toBeUndefined();
  });
});

describe("a migração", () => {
  it("pode ser colada duas vezes sem erro e sem mudar nada", async () => {
    const antes = await sql(`select id, audience, authority_level from public.ch_sources order by id`);
    await db.exec(fs.readFileSync(NOVA, "utf8"));
    await db.exec(fs.readFileSync(NOVA, "utf8"));
    expect(await sql(`select id, audience, authority_level from public.ch_sources order by id`)).toEqual(antes);
  });

  it("funções internas não são chamáveis por aluno nem por anônimo; as das telas exigem login", async () => {
    for (const [fn, args] of [
      ["ch_student_sources", { p_sources: [] }], ["ch_student_text", { p_text: "x" }], ["ch_complementar_hit", { p_text: "x" }],
      ["ch_worker_complementar_terms", {}], ["ch_refresh_hidden_flags", {}],
    ] as const) {
      await recusa(rpc(ALUNA, fn, args as any));
      await recusa(rpc(null, fn, args as any));
    }
    await recusa(rpc(null, "app_ch_set_source_audience", { p_source_id: sComp, p_audience: "oficial" }));
    await recusa(rpc(null, "app_question_commentary", { p_question_id: QID, p_level: "full" }));
  });

  it("voltar para oficial é possível só pelo administrador e o nível continua E até alguém escolher outro", async () => {
    const r = await rpc(ADMIN, "app_ch_set_source_audience", { p_source_id: sComp, p_audience: "oficial" });
    expect(r).toMatchObject({ audience: "oficial", authority_level: "E" });
    await rpc(ADMIN, "app_ch_set_source_audience", { p_source_id: sComp, p_audience: "complementar" });
  });
});
