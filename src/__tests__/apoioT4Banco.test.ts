// @vitest-environment node
/**
 * APOIO-T4 (testador adversarial): fonte complementar ("Sangue nos Olhos") × CAMPOS DIGITADOS PELA EQUIPE e DADOS ANTIGOS,
 * num Postgres real em memória (PGlite) com todas as migrações.
 *
 * Regra do dono: a apostila vale como fonte para a IA e a equipe, mas NADA que a identifique chega ao aluno
 * (título, órgão, link, arquivo, trecho, página). Só fonte oficial dá selo.
 *
 * Como ler este arquivo:
 *  - `it(...)` normal = fato conferido (passa hoje e deve continuar passando).
 *  - `it.fails("VAZAMENTO ...")` = o teste afirma a regra do dono e FALHA hoje (por isso o it.fails passa). Quando o vazamento
 *    for corrigido, o it.fails passa a acusar "esperava falhar": troque por `it`.
 *  - Para nenhum it.fails "passar por acidente" (erro de montagem também faria o teste falhar), o último bloco
 *    "prova positiva" lê de novo cada caso e confere que o termo proibido ESTÁ mesmo na resposta ao aluno.
 *
 * Montagem: migrações ATÉ a 9610 → dados publicados ANTES da regra citando a apostila (dados antigos) → migração 9620 →
 * administrador marca as fontes como complementares → a equipe salva conteúdo NOVO com o nome da apostila nos campos de texto.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const REGRA = "20261003009620"; // fontes complementares
const ADMIN = "00000000-0000-4000-8000-0000000004ad";
const EDITOR = "00000000-0000-4000-8000-0000000004ed";
const REVISOR = "00000000-0000-4000-8000-0000000004f1"; // revisor médico de Pediatria (papel de aluno)
const ALUNA = "00000000-0000-4000-8000-00000000040a";

const COMP_TITLE = "Sangue nos Olhos — Pediatria";
const COMP_ORGAN = "Sangue nos Olhos";
const COMP_URL = "https://apostilas.sno-exemplo.invalid/pediatria-2026.pdf";
const COMP_FILE = "sno-pediatria-2026.pdf";
const NEU_TITLE = "Manual de Pediatria Beta (teste)"; // apostila de nome neutro, marcada na biblioteca
const OFI_TITLE = "PCDT Bronquiolite T4 (teste)";
const OFI_URL = "https://www.gov.br/saude/pcdt-bronquiolite-t4";
const TRECHO = "FRASE-SECRETA-SNO";
const CITA = `Segundo a apostila Sangue nos Olhos (p. 345): ${TRECHO}.`;
/** Nada disto pode chegar ao aluno. */
const PROIBIDOS = ["Sangue", "sangue", "apostila", "Apostila", TRECHO, "sno-exemplo", COMP_FILE, NEU_TITLE, "p. 345", "cursinho"];

let db: PGlite;
const sql = async <T = any>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
const arg = (v: unknown) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);
async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => arg(args[k])));
    return r.rows[0].result;
  });
}
/** Leitura direta da tabela como a aluna (o que o PostgREST devolve a quem chama a API REST). */
async function comoAluna<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ALUNA })]);
    return (await tx.query<T>(text, params)).rows;
  });
}
const proibidoEm = (resposta: unknown) => PROIBIDOS.filter((t) => JSON.stringify(resposta ?? null).includes(t));
/** Regra do dono: a resposta ao aluno não traz nenhum termo proibido. */
const limpo = (resposta: unknown, onde = "resposta ao aluno") => expect(proibidoEm(resposta), `${onde} traz termo da apostila`).toEqual([]);

const opcoes = (expl: Record<string, string>) => ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: expl[id] ?? "" }));
const Q_OLD = "revalida_2023_1_q001";
const Q_NEW = "revalida_2023_1_q002";
let sComp: string;
let sNeu: string;
let aulaAntiga: string;
let aulaNova: string;
let atualizacaoNova: string;
let podcastAntigo: string;
let podcastNovo: string;
let conversaAntiga: string;
let materialAntigo: string;
let salvar: Record<string, { ok: boolean; erro?: string; avisos: unknown }> = {};

/**
 * Salva como equipe e anota se o banco barrou ou avisou (procura qualquer chave de aviso na resposta).
 * (APOIO-B) Desde a 9621 o banco BARRA o texto novo que cita a apostila. Para os testes de leitura do aluno continuarem a ter o texto
 * (que pode ter entrado por outro caminho: servidor, importação, dado antigo), `plano_b` grava o mesmo conteúdo direto no banco.
 */
async function salvaEAnota(nome: string, uid: string, fn: string, args: Record<string, unknown>, plano_b?: () => Promise<any>) {
  try {
    const r: any = await rpc(uid, fn, args);
    const texto = JSON.stringify(r ?? {});
    salvar[nome] = { ok: true, avisos: /fonte complementar|o aluno n[aã]o v[eê]|cita a apostila|cites_material/i.test(texto) ? "aviso na resposta" : null };
    return r;
  } catch (e: any) {
    salvar[nome] = { ok: false, erro: e.message, avisos: null };
    return plano_b ? await plano_b() : null;
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files.filter((f) => f < REGRA)) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  for (const [id, email, name] of [[ADMIN, "adm4@teste.dev", "Adm"], [EDITOR, "ed4@teste.dev", "Editora"], [REVISOR, "rev4@teste.dev", "Dra. Revisora"], [ALUNA, "aluna4@teste.dev", "Aluna"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await sql(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await sql(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [REVISOR]);

  // ================= DADOS ANTIGOS (publicados ANTES da regra; a apostila estava cadastrada como fonte comum, nível A/B)
  sComp = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level) values ($1, $2, 'final', $3, '2026', 'A') returning id`, [COMP_TITLE, COMP_ORGAN, COMP_URL]))[0].id;
  sNeu = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level) values ($1, 'Editora Beta (teste)', 'final', 'https://editora-beta.invalid/ped.pdf', '1', 'B') returning id`, [NEU_TITLE]))[0].id;
  const sOfi = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level) values ($1, 'Ministério da Saúde (teste)', 'final', $2, '1', 'A') returning id`, [OFI_TITLE, OFI_URL]))[0].id;

  // questão antiga: explicações, conduta esperada, o que avalia, subtema e fonte do gabarito digitados citando a apostila
  await rpc(ADMIN, "app_admin_save_question", { p_question: {
    kind: "REVALIDA", year: 2023, semester: 1, number: 1, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: `Manejo (${COMP_ORGAN})`,
    statement: "Lactente de 3 meses com sibilância e coriza há 2 dias. Qual a conduta?",
    options: opcoes({ B: `B é a conduta. ${CITA}`, A: `A está errada (${COMP_TITLE}).` }), correct_option: "B", status: "valid",
    expected_conduct: `Suporte clínico. ${CITA}`, inep_intent: `Avalia o manejo como ensina a apostila ${COMP_ORGAN}.`, needs_image: false,
    sources: [{ title: COMP_TITLE, organization: COMP_ORGAN, url: COMP_URL }, { title: "Gabarito oficial INEP 2023/1 (teste)", organization: "INEP" }],
  } });
  const claim = (await sql(`insert into public.ch_claims (statement) values ('Suporte é a conduta na bronquiolite (T4).') returning id`))[0].id;
  await sql(`insert into public.question_claims (question_id, claim_id, role) values ($1, $2, 'solves')`, [Q_OLD, claim]);
  await sql(`insert into public.ch_evidence (claim_id, source_id, page, source_version, quote, verdict, checked_by) values ($1, $2, 345, '2026', $3, 'compatible', $4)`, [claim, sComp, TRECHO, ADMIN]);
  const analise = (await sql(
    `insert into public.question_analysis (question_id, version, question_core, golden_rule, basis_hash, status, official_answer_at_analysis, reviewed_at, temporal_status, last_source_check_at)
     values ($1, 1, 'Pede a conduta na bronquiolite.', $2, 'h', 'published', 'B', now(), 'CURRENT', now()) returning id`, [Q_OLD, `Para lembrar: ${CITA}`]))[0].id;
  await sql(`insert into public.question_option_analysis (analysis_id, question_id, option_id, is_official_correct, distractor_kind, reasoning) values ($1, $2, 'B', true, 'CORRECT', 'B é a conduta.')`, [analise, Q_OLD]);
  await sql(`insert into public.question_comments (question_id, analysis_id, version, level, content, content_hash, status, published_at) values ($1, $2, 1, 'full', $3::jsonb, 'x', 'published', now())`,
    [Q_OLD, analise, JSON.stringify({ texto: `Comentário: ${CITA}` })]);
  // cartão de atualização conferido SÓ com a apostila (na época ela contava como fonte A)
  await sql(`insert into public.question_update_cards (question_id, version, temporal_status, impact_level, official_answer, current_answer, what_changed, sources, reviewed_by)
             values ($1, 1, 'UPDATED_BUT_SAME_ANSWER', 'COMMENT_ONLY', 'B', 'B', 'A conduta segue a mesma.', $2::jsonb, $3)`,
    [Q_OLD, JSON.stringify([{ title: COMP_TITLE, organ: COMP_ORGAN, version: "2026", page: 345, url: COMP_URL }]), ADMIN]);
  await sql(`insert into public.question_official_answers (question_id, version, answer, answer_status, source) values ($1, 1, 'B', 'FINAL', 'Gabarito INEP 2023/1')`, [Q_OLD]);
  await sql(`insert into public.practice_sessions (user_id, kind, question_ids, finished_at) values ($1, 'questoes', $2, now())`, [ALUNA, [Q_OLD]]);

  // aula antiga publicada: resumo, professor, especialidade, pontos-chave; material "diretriz" (link) com a palavra apostila
  aulaAntiga = (await sql(
    `insert into public.lessons (area, topic, title, instructor, specialty, summary, key_points, guideline_title, guideline_url, published)
     values ('PEDIATRIA', 'Bronquiolite', 'Bronquiolite (aula antiga)', $1, $2, $3, $4, $5, $6, true) returning id`,
    [`Equipe ${COMP_ORGAN}`, `Pediatria ${COMP_ORGAN}`, `Resumo. ${CITA}`, [`Ponto: ${CITA}`], COMP_TITLE, COMP_URL]))[0].id;
  materialAntigo = (await sql(`insert into public.lesson_materials (lesson_id, kind, title, url) values ($1, 'guideline', 'Apostila de Pediatria do cursinho (PDF)', 'https://cursinho.invalid/ped.pdf') returning id`, [aulaAntiga]))[0].id;

  // atualização antiga publicada e conferida com a apostila como "documento"
  await sql(
    `insert into public.guideline_updates (slug, area, topic, subtopic, publication_label, institution, document_title, source_url, before_text, current_conduct, timeline, flashcards,
                                           review_status, review_note, legacy, published, source_checked_at, reviewed_by, reviewed_at)
     values ('t4-antiga', 'PEDIATRIA', 'Bronquiolite antiga', $1, $2, $3, $4, $5, 'Antes: broncodilatador.', 'Suporte.', $6::jsonb, $7::jsonb,
             'approved', $8, $9::jsonb, true, now(), $10, now())`,
    [`Subtema (${COMP_ORGAN})`, `Ed. ${COMP_ORGAN} 2026`, COMP_ORGAN, COMP_TITLE, COMP_URL,
     JSON.stringify([{ year: 2026, text: `Mudou em 2026. ${CITA}` }]), JSON.stringify([{ front: "Conduta?", back: `Suporte. ${CITA}` }]),
     `Conferido na ${COMP_TITLE}, p. 345.`, JSON.stringify({ fonte_antiga: COMP_TITLE }), REVISOR]);

  // podcast antigo publicado: a fala cita a apostila; fonte enviada como arquivo
  podcastAntigo = (await sql(
    `insert into public.podcasts (title, topic, area, status, script, approved_at, audio_path, published_at)
     values ('Bronquiolite (episódio antigo)', 'Bronquiolite', 'PEDIATRIA', 'published', $1::jsonb, now(), 'podcasts/t4.mp3', now()) returning id`,
    [JSON.stringify({ lines: [{ speaker: "ANA", text: `Vamos lá. ${CITA}`, sources: [] }, { speaker: "BRUNO", text: "Combinado.", sources: [] }] })]))[0].id;
  await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', $2, 'podcasts/t4.pdf', 1)`, [podcastAntigo, COMP_FILE]);

  // Tutor: conversa antiga da aluna, com a citação gravada no meta e no resumo
  const persona = (await sql(`select id from public.tutor_personalities order by id limit 1`))[0].id;
  const conversa = conversaAntiga = (await sql(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity, status, summary) values ($1, 'livre', 'Bronquiolite', $2, 3, 'closed', $3::jsonb) returning id`,
    [ALUNA, persona, JSON.stringify({ concepts_mastered: [`Suporte (${COMP_TITLE} p. 345)`] })]))[0].id;
  await sql(`insert into public.tutor_messages (session_id, user_id, role, content, meta) values ($1, $2, 'tutor', $3, $4::jsonb)`,
    [conversa, ALUNA, `Na bronquiolite, suporte. ${CITA}`, JSON.stringify({ grounding: "source", sources: [{ ref: "S1", label: `${COMP_TITLE}, p. 345` }] })]);

  // estação aprovada cujo roteiro cita a apostila; aviso geral publicado citando a apostila
  await sql(`insert into public.checklist_stations (id, name, topic, area, medical_review) values ('t4-est', 'Estação T4', 'Bronquiolite', 'Pediatria', 'approved')`);
  await sql(`insert into public.checklist_station_contents (station_id, content) values ('t4-est', $1::jsonb)`, [JSON.stringify({ roteiro: `Roteiro. ${CITA}`, impressos: [{ titulo: COMP_TITLE }] })]);
  await sql(`update public.app_settings set value = $1::jsonb where key = 'announcement'`, [JSON.stringify({ active: true, tone: "info", title: "Novidade", text: `Novas aulas com base na ${COMP_TITLE}.` })]);

  // ================= A REGRA ENTRA (9620) e o administrador marca as duas apostilas como complementares
  for (const f of files.filter((f) => f >= REGRA)) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  await rpc(ADMIN, "app_ch_set_source_audience", { p_source_id: sComp, p_audience: "complementar", p_reason: "Apostila" });
  await rpc(ADMIN, "app_ch_set_source_audience", { p_source_id: sNeu, p_audience: "complementar", p_reason: "Apostila de nome neutro" });
  void sOfi;

  // ================= CONTEÚDO NOVO salvo pela equipe DEPOIS da regra, com o nome da apostila nos campos de texto
  const questaoNova = (extra: Record<string, unknown> = {}) => ({
    kind: "REVALIDA", year: 2023, semester: 1, number: 2, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: `Manejo (${COMP_ORGAN})`,
    statement: "Lactente de 5 meses com sibilância. Qual a conduta inicial?",
    options: opcoes({ B: `B é a conduta. ${CITA}`, C: `C está errada; ${NEU_TITLE}.` }), correct_option: "B", status: "valid",
    expected_conduct: `Suporte. ${CITA}`, inep_intent: `Avalia como ensina a apostila ${COMP_ORGAN}.`, needs_image: false,
    sources: [{ title: COMP_TITLE, organization: COMP_ORGAN, url: COMP_URL }], ...extra,
  });
  await salvaEAnota("questão (explicações, conduta, o que avalia, subtema, fontes)", ADMIN, "app_admin_save_question", { p_question: questaoNova() }, async () => {
    await rpc(ADMIN, "app_admin_save_question", { p_question: questaoNova({ subtopic: "Manejo", options: opcoes({ B: "B é a conduta." }), expected_conduct: "Suporte.", inep_intent: "", sources: [] }) });
    const n = questaoNova();
    await sql(`update public.questions set subtopic = $2, options = $3::jsonb, expected_conduct = $4, inep_intent = $5, sources = $6::jsonb where id = $1`,
      [Q_NEW, n.subtopic, JSON.stringify(n.options), n.expected_conduct, n.inep_intent, JSON.stringify(n.sources)]);
  });
  await sql(`insert into public.practice_sessions (user_id, kind, question_ids, finished_at) values ($1, 'questoes', $2, now())`, [ALUNA, [Q_NEW]]);

  // (APOIO-B) cada salvamento abaixo é BARRADO pela 9621; o plano B grava o mesmo conteúdo direto no banco (como entraria por outro caminho)
  await salvaEAnota("aula (título, professor, especialidade, resumo, pontos-chave, diretriz)", EDITOR, "app_admin_save_lesson", { p_lesson: {
    area: "PEDIATRIA", topic: "Bronquiolite", title: `Bronquiolite — revisão ${COMP_ORGAN}`, instructor: `Equipe ${COMP_ORGAN}`, specialty: `Pediatria ${COMP_ORGAN}`,
    summary: `Resumo novo. ${CITA}`, key_points: [`Ponto novo: ${CITA}`], guideline_title: "Apostila de Pediatria do cursinho", guideline_url: "https://cursinho.invalid/ped-2026.pdf",
    published: true, review_note: "Conferido o texto da aula com a equipe médica.",
  } }, async () => {
    aulaNova = (await sql(
      `insert into public.lessons (area, topic, title, instructor, specialty, summary, key_points, guideline_title, guideline_url, published)
       values ('PEDIATRIA', 'Bronquiolite', $1, $2, $3, $4, $5, 'Apostila de Pediatria do cursinho', 'https://cursinho.invalid/ped-2026.pdf', true) returning id`,
      [`Bronquiolite — revisão ${COMP_ORGAN}`, `Equipe ${COMP_ORGAN}`, `Pediatria ${COMP_ORGAN}`, `Resumo novo. ${CITA}`, [`Ponto novo: ${CITA}`]]))[0].id;
  });

  await salvaEAnota("atualização (subtema, rótulo, antes, conduta, impactos, pegadinha, linha do tempo, flashcard, fonte)", EDITOR, "app_admin_save_guideline_update", { p_update: {
    area: "PEDIATRIA", topic: "Bronquiolite nova T4", subtopic: `Subtema (${COMP_ORGAN})`, publication_label: `Ed. ${COMP_ORGAN} 2026`,
    institution: COMP_ORGAN, document_title: COMP_TITLE, source_url: COMP_URL,
    before_text: `Antes. ${CITA}`, current_conduct: `Suporte. ${CITA}`, clinical_impact: `Impacto. ${CITA}`, exam_impact: `Prova. ${CITA}`, trap: `Pegadinha. ${CITA}`,
    timeline: [{ year: 2026, text: `Mudou. ${CITA}` }], flashcards: [{ front: "Conduta?", back: `Suporte. ${CITA}` }],
  } }, async () => {
    atualizacaoNova = (await sql(
      `insert into public.guideline_updates (slug, area, topic, subtopic, publication_label, institution, document_title, source_url, before_text, current_conduct, clinical_impact, exam_impact, trap,
                                             timeline, flashcards, review_status, review_note, published, source_checked_at, reviewed_by, reviewed_at)
       values ('t4-nova', 'PEDIATRIA', 'Bronquiolite nova T4', $1, $2, $3, $4, $5, $6, $6, $6, $6, $6, $7::jsonb, $8::jsonb, 'approved', $9, true, now(), $10, now()) returning id`,
      [`Subtema (${COMP_ORGAN})`, `Ed. ${COMP_ORGAN} 2026`, COMP_ORGAN, COMP_TITLE, COMP_URL, CITA, JSON.stringify([{ year: 2026, text: `Mudou. ${CITA}` }]),
       JSON.stringify([{ front: "Conduta?", back: `Suporte. ${CITA}` }]), `Conferido na ${COMP_TITLE}, p. 345.`, REVISOR]))[0].id;
  });
  // a conferência médica com a apostila na nota também é barrada (a atualização do plano B já está conferida e publicada)
  const pendente = (await sql(`insert into public.guideline_updates (slug, area, topic, source_url, current_conduct) values ('t4-pendente', 'PEDIATRIA', 'Bronquiolite pendente T4', 'https://exemplo.invalid/doc-t4', 'Suporte clínico.') returning id`))[0].id;
  await salvaEAnota("atualização: conferência médica com a apostila na nota", REVISOR, "app_admin_review_guideline_update", { p_id: pendente, p_decision: "approve", p_note: `Conferido na ${COMP_TITLE}, p. 345.` });

  await salvaEAnota("podcast (título, tema)", EDITOR, "app_admin_save_podcast", { p_podcast: { title: `Bronquiolite — ${COMP_ORGAN}`, topic: `Revisão ${COMP_ORGAN}`, area: "PEDIATRIA" } }, async () => {
    podcastNovo = (await sql(`insert into public.podcasts (title, topic, area) values ($1, $2, 'PEDIATRIA') returning id`, [`Bronquiolite — ${COMP_ORGAN}`, `Revisão ${COMP_ORGAN}`]))[0].id;
  });
  const fontePod = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'Resumo.pdf', 'podcasts/t4-r.pdf', 1) returning id`, [podcastNovo]))[0].id;
  await salvaEAnota("podcast: nome da fonte dado pela equipe", EDITOR, "app_admin_podcast_rename_source", { p_source_id: fontePod, p_title: "Apostila do cursinho — Pediatria" }, async () => {
    await sql(`update public.podcast_sources set title = 'Apostila do cursinho — Pediatria', title_by_staff = true where id = $1`, [fontePod]);
  });
  await salvaEAnota("podcast: roteiro editado à mão", EDITOR, "app_admin_podcast_save_script", { p_id: podcastNovo, p_script: { lines: [{ speaker: "ANA", text: `Oi. ${CITA}` }, { speaker: "BRUNO", text: "Certo." }] } }, async () => {
    await sql(`update public.podcasts set script = $2::jsonb where id = $1`, [podcastNovo, JSON.stringify({ lines: [{ speaker: "ANA", text: `Oi. ${CITA}` }, { speaker: "BRUNO", text: "Certo." }] })]);
  });
  // o resto do caminho (aprovar, áudio e publicar) não tem texto novo: gravado direto
  await sql(`update public.podcasts set status = 'published', approved_at = now(), audio_path = 'podcasts/t4-novo.mp3', published_at = now() where id = $1`, [podcastNovo]);

  await salvaEAnota("aviso geral (título, texto)", ADMIN, "app_admin_save_settings", { p_settings: { announcement: { active: true, tone: "info", title: `Nova apostila ${COMP_ORGAN}`, text: `Material: ${CITA}` } } }, async () => {
    await sql(`update public.app_settings set value = $1::jsonb where key = 'announcement'`, [JSON.stringify({ active: true, tone: "info", title: `Nova apostila ${COMP_ORGAN}`, text: `Material: ${CITA}` })]);
  });
}, 180_000);

// ------------------------------------------------------------------------------------------------- 2. campos digitados
describe("2. campos digitados pela equipe: o salvamento avisa ou barra a apostila?", () => {
  it("(APOIO-B) o banco BARRA o salvamento de texto novo que cita a apostila, com a mesma mensagem para todos", () => {
    const MENSAGEM = "Este texto cita uma fonte complementar (o aluno não pode ver). Reescreva sem citar a apostila nem o nome do material.";
    for (const [nome, r] of Object.entries(salvar)) {
      expect(r.ok, `${nome} foi aceito`).toBe(false);
      expect(r.erro, nome).toBe(MENSAGEM);
    }
    expect(Object.keys(salvar)).toHaveLength(8);
  });

  it("o banco só ESCONDE (na leitura) os campos de FONTE da aula e da atualização; não há marca para os demais campos", async () => {
    const aula = (await sql(`select guideline_hidden from public.lessons where id = $1`, [aulaNova]))[0];
    expect(aula.guideline_hidden).toBe(false); // "Apostila de Pediatria do cursinho" não bate com a biblioteca nem com "Sangue nos Olhos"
    const upd = (await sql(`select source_hidden from public.guideline_updates where id = $1`, [atualizacaoNova]))[0];
    expect(upd.source_hidden).toBe(true);
  });
});

/** Casos de vazamento: nome, severidade, causa (arquivo:linha) e como a aluna lê. */
type Caso = { nome: string; sev: "CRÍTICO" | "IMPORTANTE" | "MENOR"; causa: string; ler: () => Promise<unknown> };
const correcao = (q: string) => () => rpc(ALUNA, "practice_correction_view", { p_question_id: q, p_selected: "B" });
const CASOS_NOVOS: Caso[] = [
  { nome: "questão nova: correção (explicação, 'por que não as outras', conduta esperada, o que avalia, subtema)", sev: "CRÍTICO",
    causa: "supabase/migrations/20261003009620_fontes_complementares.sql:292-304 (practice_correction_view só filtra 'sources')", ler: correcao(Q_NEW) },
  { nome: "questão nova: leitura direta da tabela questions (coluna sources liberada ao aluno)", sev: "CRÍTICO",
    causa: "supabase/migrations/20261003001900_answer_key_lockdown.sql:17-19 (grant select (... sources ...) to authenticated)",
    ler: () => comoAluna(`select subtopic, sources from public.questions where id = $1`, [Q_NEW]) },
  { nome: "aula nova: app_lesson (título, professor, especialidade, resumo, pontos-chave)", sev: "CRÍTICO",
    causa: "20261003009620_fontes_complementares.sql:425-430 (lesson_view só esconde guideline_*)",
    ler: async () => { const a: any = await rpc(ALUNA, "app_lesson", { p_id: aulaNova }); return [a.title, a.instructor, a.specialty, a.summary, a.key_points]; } },
  { nome: "aula nova: diretriz digitada 'Apostila de Pediatria do cursinho' (não bate com a biblioteca)", sev: "IMPORTANTE",
    causa: "20261003009620:70-83 (ch_complementar_hit não considera a palavra 'apostila'; a varredura e o servidor consideram)",
    ler: async () => { const a: any = await rpc(ALUNA, "app_lesson", { p_id: aulaNova }); return [a.guideline_title, a.guideline_url]; } },
  { nome: "aula nova: leitura direta da tabela lessons", sev: "CRÍTICO", causa: "20261003004000_aulas.sql:36-37 (política: publicadas para logados, todas as colunas)",
    ler: () => comoAluna(`select title, instructor, summary, key_points, guideline_title from public.lessons where id = $1`, [aulaNova]) },
  { nome: "atualização nova: app_guideline_update (subtema, rótulo, antes, conduta, impactos, pegadinha, linha do tempo, flashcard)", sev: "CRÍTICO",
    causa: "20261003009620:450-463 (guideline_update_view só esconde institution/document_title/source_url)",
    ler: async () => { const u: any = await rpc(ALUNA, "app_guideline_update", { p_slug: (await sql(`select slug from public.guideline_updates where id = $1`, [atualizacaoNova]))[0].slug }); const { institution, document_title, source_url, ...resto } = u; return resto; } },
  { nome: "atualização nova: leitura direta (instituição, documento, link, nota da conferência)", sev: "CRÍTICO",
    causa: "20261003004100_atualizacoes_diretrizes.sql:55-56 (política: publicadas para logados, todas as colunas, inclusive review_note)",
    ler: () => comoAluna(`select institution, document_title, source_url, review_note from public.guideline_updates where id = $1`, [atualizacaoNova]) },
  { nome: "podcast novo: lista e episódio (título, tema, falas)", sev: "CRÍTICO",
    causa: "20261003009620:380-398 (app_podcast filtra fontes, não título/tema/falas); 20261003004700_podcasts.sql:240-300 (salvar/aprovar/publicar sem checagem)",
    ler: async () => [await rpc(ALUNA, "app_podcasts"), (await rpc<any>(ALUNA, "app_podcast", { p_id: podcastNovo })).lines] },
  { nome: "podcast novo: fonte renomeada pela equipe 'Apostila do cursinho — Pediatria'", sev: "IMPORTANTE",
    causa: "20261003009620:387 e 394 (title_by_staff sai como está; a palavra 'apostila' não é checada) e 20261003009593:34-50 (renomear sem checagem)",
    ler: async () => (await rpc<any>(ALUNA, "app_podcast", { p_id: podcastNovo })).sources },
  { nome: "aviso geral salvo pelo administrador", sev: "CRÍTICO", causa: "20261003001300_admin.sql:86-91 e 697-730 (app_announcement / app_admin_save_settings sem checagem)",
    ler: () => rpc(ALUNA, "app_announcement") },
];

describe("2. campos digitados pela equipe: a aluna recebe o texto de volta?", () => {
  for (const c of CASOS_NOVOS) it.fails(`VAZAMENTO [${c.sev}] ${c.nome}`, async () => limpo(await c.ler(), c.nome));

  it("a fonte DIGITADA da aula/atualização some nas funções (o que o construtor cobriu)", async () => {
    const u: any = await rpc(ALUNA, "app_guideline_updates");
    const item = u.items.find((x: any) => x.id === atualizacaoNova);
    expect(item).toMatchObject({ institution: null, document_title: null, source_url: null });
    const a: any = await rpc(ALUNA, "app_lesson", { p_id: aulaAntiga });
    expect(a.guideline_title).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------- selos e indícios
describe("selos e indícios na tela do aluno", () => {
  it.fails("VAZAMENTO [IMPORTANTE] atualização conferida SÓ na apostila sai como 'Conferido por revisor médico no documento oficial' (reviewed=true)", async () => {
    // causa: 20261003007800_atualizacoes_publicar_so_conferida.sql:199-201 (aprovar só exige source_url, não que seja oficial) e
    // 20261003009620:458 ('reviewed' não olha source_hidden). Tela: src/novo/app/study/UpdatesScreen.jsx:243-244
    const slug = (await sql(`select slug from public.guideline_updates where id = $1`, [atualizacaoNova]))[0].slug;
    const u: any = await rpc(ALUNA, "app_guideline_update", { p_slug: slug });
    expect(u.reviewed).toBe(false);
  });

  it.fails("VAZAMENTO [IMPORTANTE] a busca da aluna acha a atualização pelo TÍTULO do documento escondido (oráculo: revela que existe)", async () => {
    // causa: 20261003004100_atualizacoes_diretrizes.sql:88-90 (busca em institution e document_title mesmo com source_hidden).
    // "Pediatria" só existe no título do documento escondido ("Sangue nos Olhos — Pediatria"); tela: UpdatesScreen.jsx:364
    const r: any = await rpc(ALUNA, "app_guideline_updates", { p_search: "Pediatria" });
    expect(r.items.map((x: any) => x.id)).not.toContain(atualizacaoNova);
  });

  it.fails("VAZAMENTO [IMPORTANTE] leitura direta mostra as marcas guideline_hidden/source_hidden = true (revela que há fonte escondida)", async () => {
    // causa: 20261003009620:131-133 (colunas novas legíveis pela política de leitura das tabelas)
    const [l] = await comoAluna(`select guideline_hidden from public.lessons where id = $1`, [aulaAntiga]);
    const [g] = await comoAluna(`select source_hidden from public.guideline_updates where id = $1`, [atualizacaoNova]);
    expect([l?.guideline_hidden, g?.source_hidden]).toEqual([undefined, undefined]);
  });

  it.fails("VAZAMENTO [MENOR] nova edição da APOSTILA põe a questão 'em revisão' e a aluna lê 'Uma fonte oficial desta questão mudou'", async () => {
    // causa: 20261003002400_sqie_knowledge.sql:21-41 (ch_flag_dependents não olha a classe); tela QuestionCommentary.jsx:162-165
    await sql(`select public.ch_flag_dependents($1, 'Nova edição da apostila')`, [sComp]);
    const c: any = await rpc(ALUNA, "app_question_commentary", { p_question_id: Q_OLD, p_level: "full" });
    expect(c.update_in_review).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------------- 3. dados antigos
const CASOS_ANTIGOS: Caso[] = [
  { nome: "questão antiga: correção (explicações, conduta esperada, o que avalia, subtema)", sev: "CRÍTICO", causa: "20261003009620:292-304", ler: correcao(Q_OLD) },
  { nome: "questão antiga: tabela questions.sources direto", sev: "CRÍTICO", causa: "20261003001900_answer_key_lockdown.sql:17-19",
    ler: () => comoAluna(`select sources from public.questions where id = $1`, [Q_OLD]) },
  { nome: "questão antiga: comentário publicado (regra de ouro e comentário)", sev: "CRÍTICO", causa: "20261003009620:249-258 (texto livre não filtrado; esperado: corrigir pela varredura)",
    ler: async () => { const c: any = await rpc(ALUNA, "app_question_commentary", { p_question_id: Q_OLD, p_level: "full" }); return [c.golden_rule, c.comment]; } },
  { nome: "aula antiga: resumo, professor, especialidade, pontos-chave", sev: "CRÍTICO", causa: "20261003009620:425-430",
    ler: async () => { const a: any = await rpc(ALUNA, "app_lesson", { p_id: aulaAntiga }); return [a.instructor, a.specialty, a.summary, a.key_points]; } },
  { nome: "aula antiga: material 'diretriz' por link com a palavra apostila", sev: "IMPORTANTE", causa: "20261003009620:410 (título digitado sai como está quando não há arquivo) e :70-83",
    ler: async () => (await rpc<any>(ALUNA, "app_lesson", { p_id: aulaAntiga })).materials },
  { nome: "atualização antiga: subtema, rótulo, linha do tempo, flashcard", sev: "CRÍTICO", causa: "20261003009620:450-463",
    ler: async () => { const u: any = await rpc(ALUNA, "app_guideline_update", { p_slug: "t4-antiga" }); return [u.subtopic, u.publication_label, u.timeline, u.flashcards]; } },
  { nome: "atualização antiga: leitura direta (review_note, legacy, documento)", sev: "CRÍTICO", causa: "20261003004100_atualizacoes_diretrizes.sql:55-56",
    ler: () => comoAluna(`select review_note, legacy, document_title from public.guideline_updates where slug = 't4-antiga'`) },
  { nome: "podcast antigo: falas", sev: "CRÍTICO", causa: "20261003009620:384", ler: async () => (await rpc<any>(ALUNA, "app_podcast", { p_id: podcastAntigo })).lines },
  { nome: "Tutor antigo: mensagem e meta.sources gravados (leitura direta e app_tutor_session)", sev: "CRÍTICO",
    causa: "20261003003100_tutor.sql:164 (política) e 20261003005600_tutor_nexus_conversa.sql:197-199 ('sources', m.meta -> 'sources' sem filtro)",
    ler: () => comoAluna(`select content, meta from public.tutor_messages where user_id = $1`, [ALUNA]) },
  { nome: "Tutor antigo: resumo da conversa", sev: "CRÍTICO", causa: "20261003003500_tutor_v2.sql:60 (summary legível pela política) e NexusScreen.jsx:382-388",
    ler: () => comoAluna(`select summary from public.tutor_sessions where user_id = $1`, [ALUNA]) },
  { nome: "estação aprovada: roteiro/impressos", sev: "CRÍTICO", causa: "20261003000400_checklist_bank.sql:37-43 (conteúdo inteiro legível)",
    ler: () => comoAluna(`select content from public.checklist_station_contents where station_id = 't4-est'`) },
];

describe("3. dados antigos (publicados antes da regra)", () => {
  for (const c of CASOS_ANTIGOS) it.fails(`VAZAMENTO [${c.sev}] ${c.nome}`, async () => limpo(await c.ler(), c.nome));

  it("o que JÁ é filtrado nos dados antigos: fontes da questão, fonte da aula, fontes do podcast, documento da atualização", async () => {
    const corr: any = await rpc(ALUNA, "practice_correction_view", { p_question_id: Q_OLD, p_selected: "B" });
    limpo(corr.sources, "fontes da correção");
    const c: any = await rpc(ALUNA, "app_question_commentary", { p_question_id: Q_OLD, p_level: "full" });
    limpo([c.sources, c.update_card?.sources, c.freshness], "fontes do comentário");
    const u: any = await rpc(ALUNA, "app_guideline_update", { p_slug: "t4-antiga" });
    expect([u.institution, u.document_title, u.source_url]).toEqual([null, null, null]);
  });

  it("(APOIO-B, corrigido) podcast antigo: o PDF da apostila com nome abreviado ('sno-pediatria-2026.pdf') some do aluno quando o administrador o marca como complementar (botão)", async () => {
    const fonte = (await sql(`select id from public.podcast_sources where podcast_id = $1`, [podcastAntigo]))[0].id;
    await rpc(ADMIN, "app_admin_podcast_source_complementar", { p_source_id: fonte, p_complementar: true });
    try {
      const p: any = await rpc(ALUNA, "app_podcast", { p_id: podcastAntigo });
      expect(p.sources).toEqual([]);
    } finally {
      await rpc(ADMIN, "app_admin_podcast_source_complementar", { p_source_id: fonte, p_complementar: false });
    }
  });

  it.fails("VAZAMENTO [IMPORTANTE] cartão antigo conferido SÓ na apostila continua dizendo 'Conduta atual conferida' (sem fonte nenhuma)", async () => {
    // causa: 20261003009620:271-275 (o cartão publicado sai mesmo com todas as fontes filtradas); tela QuestionCommentary.jsx:135-161 e 226-241
    const c: any = await rpc(ALUNA, "app_question_commentary", { p_question_id: Q_OLD, p_level: "full" });
    expect(c.update_card).toBeNull();
  });

  it("a varredura app_ch_complementar_mentions acha: análise, comentário, aula (resumo/pontos), podcast e atualização (antes/conduta)", async () => {
    const achados: any[] = await rpc(ADMIN, "app_ch_complementar_mentions");
    const tipos = new Set(achados.map((a) => `${a.kind}:${a.id}`));
    expect(tipos.has(`aula:${aulaAntiga}`)).toBe(true);
    expect(tipos.has(`podcast:${podcastAntigo}`)).toBe(true);
    expect(achados.some((a) => a.kind === "analise" && a.id === Q_OLD)).toBe(true);
    expect(achados.some((a) => a.kind === "comentario")).toBe(true);
    expect(achados.some((a) => a.kind === "atualizacao" && a.id === atualizacaoNova)).toBe(true);
  });

  /** O que a varredura NÃO enxerga (cada um é um lugar onde o texto antigo fica sem ninguém achar). */
  const lista = async () => JSON.stringify(await rpc(ADMIN, "app_ch_complementar_mentions"));
  it("(APOIO-B, corrigido) a varredura não olha a tabela questions (explicações, conduta esperada, o que avalia, subtema, fontes)", async () => {
    // causa: 20261003009620:502-522 (nenhum 'select ... from public.questions'). Com a análise, o comentário e o cartão limpos,
    // a questão antiga continua citando a apostila nas explicações e na conduta esperada, e some da lista.
    await sql(`update public.question_analysis set golden_rule = 'Limpo.' where question_id = $1`, [Q_OLD]);
    await sql(`update public.question_comments set content = '{"texto":"Limpo."}'::jsonb where question_id = $1`, [Q_OLD]);
    try {
      expect(await lista()).toContain(Q_OLD);
    } finally {
      await sql(`update public.question_analysis set golden_rule = $2 where question_id = $1`, [Q_OLD, `Para lembrar: ${CITA}`]);
      await sql(`update public.question_comments set content = $2::jsonb where question_id = $1`, [Q_OLD, JSON.stringify({ texto: `Comentário: ${CITA}` })]);
    }
  });
  it("(APOIO-B, corrigido) a varredura não olha professor/especialidade da aula nem a atualização antiga só pelo subtema/linha do tempo/flashcard/nota", async () => {
    // causa: 20261003009620:515 (aula: só title, topic, summary, key_points) e :521 (atualização: só before_text, current_conduct, clinical_impact, exam_impact, trap)
    await sql(`update public.lessons set summary = 'Resumo limpo.', key_points = '{}' where id = $1`, [aulaAntiga]);
    try {
      const achados: any[] = await rpc(ADMIN, "app_ch_complementar_mentions");
      expect(achados.some((a) => a.kind === "aula" && a.id === aulaAntiga)).toBe(true); // professor 'Equipe Sangue nos Olhos' continua lá
      expect(achados.some((a) => a.kind === "atualizacao" && a.onde.includes("Bronquiolite antiga"))).toBe(true);
    } finally {
      await sql(`update public.lessons set summary = $2, key_points = $3 where id = $1`, [aulaAntiga, `Resumo. ${CITA}`, [`Ponto: ${CITA}`]]);
    }
  });
  it("(APOIO-B, corrigido) a varredura não olha Tutor (mensagens, resumos), estações, aviso geral nem material de aula", async () => {
    // causa: 20261003009620:502-522 (só análise, comentário, cartão, aula, podcast e atualização)
    const texto = await lista();
    for (const [onde, id] of [["Tutor", conversaAntiga], ["estação", "t4-est"], ["material da aula", materialAntigo], ["aviso geral", "announcement"]]) expect(texto, onde).toContain(id);
  });

  it("(APOIO-B, corrigido) a varredura tem tela e a marca de fonte de podcast tem botão", async () => {
    const telas = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? telas(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const usam = telas(path.join(ROOT, "src/novo")).filter((f) => /\.(jsx?|tsx?)$/.test(f) && fs.readFileSync(f, "utf8").includes("app_ch_complementar_mentions"));
    expect(usam.map((f) => path.basename(f))).toEqual(["ComplementarMentions.jsx"]);
    const marcaPodcast = telas(path.join(ROOT, "src/novo")).filter((f) => /\.(jsx?|tsx?)$/.test(f) && fs.readFileSync(f, "utf8").includes("app_admin_podcast_source_complementar"));
    expect(marcaPodcast.map((f) => path.basename(f))).toEqual(["AdminPodcasts.jsx"]);
  });

});

// ------------------------------------------------------------------------------------------------- prova positiva
describe("prova positiva: cada it.fails acima falha pelo motivo certo (o termo proibido está mesmo na resposta)", () => {
  for (const c of [...CASOS_NOVOS, ...CASOS_ANTIGOS]) {
    it(`a aluna recebe mesmo: ${c.nome}`, async () => {
      expect(proibidoEm(await c.ler()).length, c.causa).toBeGreaterThan(0);
    });
  }
  it("selos/indícios: reviewed=true com fonte escondida; busca acha; marcas legíveis; cartão sem fonte continua", async () => {
    const slug = (await sql(`select slug from public.guideline_updates where id = $1`, [atualizacaoNova]))[0].slug;
    const u: any = await rpc(ALUNA, "app_guideline_update", { p_slug: slug });
    expect(u).toMatchObject({ reviewed: true, document_title: null, source_url: null });
    const busca: any = await rpc(ALUNA, "app_guideline_updates", { p_search: "Pediatria" });
    expect(busca.items.map((x: any) => x.id)).toContain(atualizacaoNova); // "Pediatria" só existe no título do documento escondido
    const [l] = await comoAluna(`select guideline_hidden from public.lessons where id = $1`, [aulaAntiga]);
    expect(l.guideline_hidden).toBe(true);
    const c: any = await rpc(ALUNA, "app_question_commentary", { p_question_id: Q_OLD, p_level: "full" });
    expect(c.update_card).toMatchObject({ current_answer: "B", sources: [] });
    expect(c.update_in_review).toBe(true); // depois do ch_flag_dependents do bloco de selos
    const p: any = await rpc(ALUNA, "app_podcast", { p_id: podcastAntigo });
    expect(p.sources.map((x: any) => x.title)).toEqual(["Documento 1"]);
  });
});
