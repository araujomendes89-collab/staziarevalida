// @vitest-environment node
/**
 * Fontes complementares, parte da EQUIPE (supabase/migrations/…9621_fontes_complementares_equipe.sql), num Postgres real em memória
 * com TODAS as migrações (APOIO-B).
 *  1. Checagem ao salvar (gatilhos): o que a equipe digita e o aluno lê não pode citar o NOME CADASTRADO de uma fonte complementar (título completo,
 *     órgão distintivo, sigla). Desde 2026-10-11 "Sangue nos Olhos" e a palavra "apostila" SOLTAS passam (texto médico legítimo).
 *  2. Varredura ampliada (app_ch_complementar_mentions): tabela, id, campo e trecho; só o administrador.
 *  3. Fonte de podcast marcada como complementar (só o administrador), com registro.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const NOVA = path.join(MIGRATIONS, "20261003009621_fontes_complementares_equipe.sql");
const ADMIN = "00000000-0000-4000-8000-0000000b00ad";
const EDITOR = "00000000-0000-4000-8000-0000000b00ed";
const ALUNA = "00000000-0000-4000-8000-0000000b000a";
const REVISOR = "00000000-0000-4000-8000-0000000b00f1";
const MENSAGEM = "Este texto cita uma fonte complementar cadastrada (o aluno não pode ver). Reescreva sem citar o nome desse material.";

const SNO_TITLE = "Sangue nos Olhos — Pediatria";
const SNO_ORGAN = "Sangue nos Olhos";
const GAMA_TITLE = "Manual de Pediatria Gama (teste)";
const GAMA_ORGAN = "Editora Gama de Pediatria (teste)"; // órgão DISTINTIVO (3+ palavras e 20+ letras); um órgão curto não barra texto (2026-10-11)
const GAMA_URL = "https://gama.invalid/pediatria-2026.pdf";
const OFI_TITLE = "PCDT Bronquiolite (teste)";
const OFI_ORGAN = "Ministério da Saúde (teste)";
const OFI_URL = "https://www.gov.br/saude/pcdt-bronquiolite-teste";

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
async function recusa(p: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await p;
  } catch (e: any) {
    return { message: e.message, code: e.code };
  }
  throw new Error("Era para recusar, mas passou.");
}
/** Recusa pela checagem: mesma mensagem, mesmo código. */
const barrado = async (p: Promise<unknown>) => {
  const r = await recusa(p);
  expect(r.message).toBe(MENSAGEM);
  expect(r.code).toBe("22023");
};

const aula = (extra: Record<string, unknown> = {}) => ({ area: "PEDIATRIA", topic: "Bronquiolite", title: "Bronquiolite no lactente", summary: "Suporte clínico e oxigênio.", ...extra });
const opcoes = (expl: Record<string, string> = {}) => ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: expl[id] ?? "" }));
const questao = (number: number, extra: Record<string, unknown> = {}) => ({
  kind: "REVALIDA", year: 2024, semester: 1, number, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "Manejo", statement: "Lactente de 4 meses com sibilância. Qual a conduta?",
  options: opcoes({ B: "B é a conduta." }), correct_option: "B", status: "valid", expected_conduct: "Suporte.", inep_intent: "", needs_image: false,
  sources: [{ title: OFI_TITLE, organization: OFI_ORGAN, url: OFI_URL }], ...extra,
});
const atualizacao = (extra: Record<string, unknown> = {}) => ({ area: "PEDIATRIA", topic: "Bronquiolite em lactentes", ...extra });

let aulaId: string;
let atualizacaoId: string;
let podcastId: string;
let fonteId: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  for (const [id, email, name] of [[ADMIN, "adm@b.dev", "Adm"], [EDITOR, "ed@b.dev", "Editora"], [ALUNA, "aluna@b.dev", "Aluna"], [REVISOR, "rev@b.dev", "Dra. Revisora"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await sql(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await sql(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [REVISOR]);

  // biblioteca: duas apostilas (nível E nasce complementar), uma fonte oficial e um nome que as duas classes têm em comum
  await sql(`insert into public.ch_sources (title, organ, kind, authority_level) values ($1, $2, 'final', 'E')`, [SNO_TITLE, SNO_ORGAN]);
  await sql(`insert into public.ch_sources (title, organ, kind, url, authority_level) values ($1, $2, 'final', $3, 'E')`, [GAMA_TITLE, GAMA_ORGAN, GAMA_URL]);
  await sql(`insert into public.ch_sources (title, organ, kind, url, authority_level) values ($1, $2, 'final', $3, 'A')`, [OFI_TITLE, OFI_ORGAN, OFI_URL]);
  await sql(`insert into public.ch_sources (title, organ, kind, authority_level) values ('Diretriz Compartilhada', 'Curso Z', 'final', 'E')`);
  await sql(`insert into public.ch_sources (title, organ, kind, authority_level) values ('Documento X', 'Diretriz Compartilhada', 'final', 'A')`);

  aulaId = (await rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula() })).id;
  atualizacaoId = (await rpc(ADMIN, "app_admin_save_guideline_update", { p_update: atualizacao() })).items?.find((u: any) => u.topic === "Bronquiolite em lactentes")?.id
    ?? (await sql(`select id from public.guideline_updates where topic = 'Bronquiolite em lactentes'`))[0].id;
  podcastId = (await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Bronquiolite em 8 minutos", topic: "Bronquiolite", area: "PEDIATRIA" } })).id;
  fonteId = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'resumo-final.pdf', 'podcasts/x.pdf', 1) returning id`, [podcastId]))[0].id;
}, 240_000);

// ------------------------------------------------------------------------------------------------- 1. checagem ao salvar
describe("1. checagem ao salvar: aula", () => {
  it("administrador e editor são barrados ao citar o título cadastrado 'Sangue nos Olhos — Pediatria' (resumo)", async () => {
    await barrado(rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula({ id: aulaId, summary: `Conforme o ${SNO_TITLE}, o suporte basta.` }) }));
    await barrado(rpc(EDITOR, "app_admin_save_lesson", { p_lesson: aula({ id: aulaId, summary: `Segundo ${SNO_TITLE.toUpperCase()}: suporte.` }) }));
  });

  it("barra em cada campo de texto da aula: título, tema, professor, especialidade, pontos-chave e diretriz", async () => {
    for (const extra of [
      { title: `Bronquiolite (${GAMA_TITLE})` },
      { topic: `Bronquiolite do ${SNO_TITLE}` },
      { instructor: `Equipe ${GAMA_ORGAN}` },
      { specialty: `Pediatria ${GAMA_ORGAN}` },
      { key_points: ["Oxigênio se saturação baixa", `Ponto da ${GAMA_TITLE}`] },
      { guideline_title: GAMA_TITLE },
      { guideline_url: GAMA_URL },
    ]) await barrado(rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula({ id: aulaId, ...extra }) }));
  });

  it("nova aula (inserção) também é conferida", async () => {
    await barrado(rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula({ summary: `Material: ${GAMA_TITLE}` }) }));
    expect((await sql(`select count(*)::int as n from public.lessons where title = 'Bronquiolite no lactente'`))[0].n).toBe(1);
  });

  it("texto normal passa; fonte OFICIAL citada passa; o tema 'Pediatria' não é barrado só porque aparece no título de uma apostila", async () => {
    const r = await rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula({ id: aulaId, topic: "Pediatria", specialty: "Pediatria",
      summary: `Siga o ${OFI_TITLE} (${OFI_ORGAN}). Apostilar o conteúdo não é preciso.`, guideline_title: OFI_TITLE, guideline_url: OFI_URL }) });
    expect(r.id).toBe(aulaId);
  });

  it("nome que também é de fonte OFICIAL não bloqueia (evita barrar texto legítimo)", async () => {
    await rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula({ id: aulaId, summary: "Conforme a Diretriz Compartilhada, o suporte basta." }) });
  });

  it("editar OUTRO campo de uma linha antiga que já cita não bloqueia; mudar o campo que cita para outro texto citando, sim", async () => {
    await sql(`update public.lessons set summary = $2 where id = $1`, [aulaId, `Resumo antigo: veja o ${SNO_TITLE}.`]); // dado antigo (sem usuário)
    await rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula({ id: aulaId, title: "Bronquiolite no lactente (revisada)", summary: `Resumo antigo: veja o ${SNO_TITLE}.` }) });
    expect((await sql(`select title from public.lessons where id = $1`, [aulaId]))[0].title).toBe("Bronquiolite no lactente (revisada)");
    await barrado(rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula({ id: aulaId, summary: `Outro resumo, ainda citando o ${SNO_TITLE}.` }) }));
    // limpar o campo é permitido
    await rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula({ id: aulaId, summary: "Suporte clínico e oxigênio." }) });
  });

  it("(2026-10-11) 'Sangue nos Olhos' solto e a palavra 'apostila' soltas SÃO salvos pela equipe: texto médico legítimo", async () => {
    const livre = "Paciente refere sangue nos olhos após tosse (hemorragia subconjuntival). Veja a apostila do curso para revisar.";
    await rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula({ id: aulaId, summary: livre, key_points: [livre], title: "Hemorragia subconjuntival", instructor: "Equipe Sangue nos Olhos" }) });
    expect((await sql(`select summary from public.lessons where id = $1`, [aulaId]))[0].summary).toBe(livre);
    await rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula({ id: aulaId, summary: "Suporte clínico e oxigênio.", key_points: [], title: "Bronquiolite no lactente (revisada)", instructor: null }) });
  });

  it("gravação interna (servidor/worker, sem usuário logado) não é barrada: só aviso", async () => {
    await sql(`update public.lessons set summary = $2 where id = $1`, [aulaId, `Gerado pela IA: segundo o ${SNO_TITLE}.`]);
    await sql(`update public.lessons set summary = 'Suporte clínico e oxigênio.' where id = $1`, [aulaId]);
  });
});

describe("1. checagem ao salvar: atualizações e diretrizes", () => {
  it("barra em subtema, rótulo, instituição, documento, link, antes, conduta, impactos, pegadinha, linha do tempo, flashcards e nota", async () => {
    for (const extra of [
      { subtopic: `Manejo (${SNO_TITLE})` },
      { publication_label: `Edição ${GAMA_ORGAN}` },
      { institution: GAMA_ORGAN, document_title: "Guia", source_url: "https://exemplo.invalid/x" },
      { document_title: GAMA_TITLE },
      { source_url: GAMA_URL },
      { before_text: `Antes, segundo o ${GAMA_TITLE}: broncodilatador.` },
      { current_conduct: `Suporte, como no ${SNO_TITLE}.` },
      { clinical_impact: `Menos internações (${GAMA_TITLE}).` },
      { exam_impact: `Cai na prova: ${GAMA_TITLE}` },
      { trap: `Pegadinha do ${GAMA_TITLE}` },
      { timeline: [{ year: 2026, text: `Mudou, diz o ${GAMA_TITLE}.` }] },
      { flashcards: [{ front: "Conduta?", back: `Suporte (${SNO_TITLE}).` }] },
    ]) await barrado(rpc(ADMIN, "app_admin_save_guideline_update", { p_update: atualizacao({ id: atualizacaoId, ...extra }) }));
  });

  it("texto normal e documento oficial passam", async () => {
    await rpc(ADMIN, "app_admin_save_guideline_update", { p_update: atualizacao({ id: atualizacaoId, institution: OFI_ORGAN, document_title: OFI_TITLE, source_url: OFI_URL,
      current_conduct: "Suporte clínico.", timeline: [{ year: 2026, text: "Mudou a recomendação." }] }) });
    expect((await sql(`select source_hidden from public.guideline_updates where id = $1`, [atualizacaoId]))[0].source_hidden).toBe(false);
  });

  it("a nota da conferência médica (review_note) é conferida ao aprovar", async () => {
    await barrado(rpc(REVISOR, "app_admin_review_guideline_update", { p_id: atualizacaoId, p_decision: "approve", p_note: `Conferido no ${SNO_TITLE}, p. 345.` }));
  });
});

describe("1. checagem ao salvar: questões", () => {
  it("barra explicação de alternativa, conduta esperada, o que avalia, tema, subtema e fontes", async () => {
    for (const extra of [
      { options: opcoes({ B: `B é a conduta. Veja o ${SNO_TITLE} p. 345.` }) },
      { expected_conduct: `Suporte. Conforme o ${GAMA_TITLE}.` },
      { inep_intent: `Avalia o manejo da ${GAMA_TITLE}.` },
      { topic: `Bronquiolite (${SNO_TITLE})` },
      { subtopic: `Manejo — ${GAMA_TITLE}` },
      { sources: [{ title: SNO_TITLE, organization: SNO_ORGAN }] },
      { sources: [{ title: "Livro", organization: "Editora", url: GAMA_URL }] },
    ]) {
      const r = await recusa(rpc(ADMIN, "app_admin_save_question", { p_question: questao(1, extra) }).then(() => { throw new Error(`passou: ${JSON.stringify(extra).slice(0, 80)}`); }));
      expect(r.message, JSON.stringify(extra).slice(0, 80)).toBe(MENSAGEM);
    }
    expect((await sql(`select count(*)::int as n from public.questions where code like '%2024%'`))[0].n).toBe(0);
  });

  it("questão normal, com fonte oficial, passa; editar o enunciado de uma questão antiga que cita nas explicações não bloqueia", async () => {
    await rpc(ADMIN, "app_admin_save_question", { p_question: questao(1) });
    const qid = (await sql<{ id: string }>(`select id from public.questions order by created_at desc limit 1`))[0].id;
    await sql(`update public.questions set options = $2::jsonb where id = $1`, [qid, JSON.stringify(opcoes({ B: `Antigo: ${SNO_TITLE}.` }))]);
    await rpc(ADMIN, "app_admin_save_question", { p_question: questao(1, { id: qid, statement: "Lactente de 4 meses com sibilância e coriza. Qual a conduta?", options: opcoes({ B: `Antigo: ${SNO_TITLE}.` }) }) });
    await barrado(rpc(ADMIN, "app_admin_save_question", { p_question: questao(1, { id: qid, options: opcoes({ B: `Novo texto citando o ${SNO_TITLE}.` }) }) }));
  });
});

describe("1. checagem ao salvar: podcasts e aviso geral", () => {
  it("título, tema, roteiro e nome da fonte renomeada são conferidos", async () => {
    await barrado(rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { id: podcastId, title: `Bronquiolite — ${SNO_TITLE}`, topic: "Bronquiolite", area: "PEDIATRIA" } }));
    await barrado(rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { id: podcastId, title: "Bronquiolite em 8 minutos", topic: `Revisão ${GAMA_ORGAN}`, area: "PEDIATRIA" } }));
    await barrado(rpc(EDITOR, "app_admin_podcast_save_script", { p_id: podcastId, p_script: { lines: [{ speaker: "ANA", text: `Oi. Segundo o ${SNO_TITLE}, suporte.` }, { speaker: "BRUNO", text: "Certo." }] } }));
    await barrado(rpc(EDITOR, "app_admin_podcast_rename_source", { p_source_id: fonteId, p_title: `${GAMA_TITLE} (resumo)` }));
    await rpc(EDITOR, "app_admin_podcast_rename_source", { p_source_id: fonteId, p_title: "Apostila do cursinho — Pediatria" }); // (2026-10-11) a palavra solta passa
    await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: podcastId, p_script: { lines: [{ speaker: "ANA", text: "Oi. Suporte clínico." }, { speaker: "BRUNO", text: "Certo." }] } });
    await rpc(EDITOR, "app_admin_podcast_rename_source", { p_source_id: fonteId, p_title: "Resumo da equipe" });
  });

  it("o nome do ARQUIVO enviado pode ser o da apostila (entrada do servidor, sem usuário): a equipe marca a fonte como complementar", async () => {
    const id = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'Sangue nos Olhos Pediatria.pdf', 'podcasts/s.pdf', 2) returning id`, [podcastId]))[0].id;
    expect(id).toBeTruthy();
  });

  it("aviso geral: título e texto conferidos; ligar o aviso sem mexer no texto antigo não bloqueia", async () => {
    await barrado(rpc(ADMIN, "app_admin_save_settings", { p_settings: { announcement: { active: true, tone: "info", title: "Novidade", text: `Material novo: ${SNO_TITLE}.` } } }));
    await barrado(rpc(ADMIN, "app_admin_save_settings", { p_settings: { announcement: { active: true, tone: "info", title: `Nova: ${GAMA_TITLE}`, text: "" } } }));
    await sql(`update public.app_settings set value = '{"active": false, "tone": "info", "title": "Antigo", "text": "Veja o Sangue nos Olhos — Pediatria."}'::jsonb where key = 'announcement'`);
    await rpc(ADMIN, "app_admin_save_settings", { p_settings: { announcement: { active: true, tone: "info", title: "Antigo", text: `Veja o ${SNO_TITLE}.` } } });
    await rpc(ADMIN, "app_admin_save_settings", { p_settings: { announcement: { active: true, tone: "info", title: "Novidade", text: "Aulas novas de pediatria." } } });
    await rpc(ADMIN, "app_admin_save_settings", { p_settings: { trial_days: 7 } }); // outra configuração não passa pela checagem do aviso
  });
});

// ------------------------------------------------------------------------------------------------- 2. varredura
describe("2. varredura ampliada", () => {
  let achados: any[];
  const acha = (tabela: string, campo: string, id?: string) => achados.find((a) => a.tabela === tabela && a.campo === campo && (id == null || a.id === id));
  let qid: string;
  let sessaoId: string;

  beforeAll(async () => {
    qid = (await sql<{ id: string }>(`select id from public.questions order by created_at desc limit 1`))[0].id;
    // dados "antigos" (gravados sem passar pela checagem, como o servidor ou uma migração faria)
    await sql(`update public.questions set expected_conduct = $4, inep_intent = $5, subtopic = $6,
                 options = $2::jsonb, sources = $3::jsonb where id = $1`,
      [qid, JSON.stringify(opcoes({ B: `Explicação do ${GAMA_TITLE}.` })), JSON.stringify([{ title: SNO_TITLE, organization: SNO_ORGAN }]),
       `Suporte (${SNO_TITLE} p. 345).`, `Avalia o que diz o ${GAMA_TITLE}.`, `Manejo (${SNO_TITLE})`]);
    await sql(`update public.lessons set instructor = $3, specialty = $4, summary = 'Resumo limpo.', key_points = '{}', guideline_title = $2 where id = $1`, [aulaId, GAMA_TITLE, `Equipe ${GAMA_ORGAN}`, `Pediatria (${GAMA_TITLE})`]);
    // (2026-10-11) material cujo nome é o da apostila cadastrada já fica ESCONDIDO do aluno pela 9620 (hidden_from_student) e, por isso, não é listado
    await sql(`insert into public.lesson_materials (lesson_id, kind, title, url) values ($1, 'other', $2, 'https://cursinho.invalid/p.pdf')`, [aulaId, `${GAMA_TITLE} (PDF)`]);
    await sql(`update public.guideline_updates set subtopic = $5, publication_label = $6, timeline = $2::jsonb, flashcards = $3::jsonb, review_note = $7,
                 legacy = $4::jsonb, practice_questions = '[]'::jsonb, current_conduct = 'Suporte clínico.' where id = $1`,
      [atualizacaoId, JSON.stringify([{ year: 2026, text: `Mudou, diz o ${GAMA_TITLE}.` }]), JSON.stringify([{ front: "Q", back: SNO_TITLE }]), JSON.stringify({ origem: GAMA_TITLE }),
       `Subtema (${GAMA_TITLE})`, `Ed. ${SNO_TITLE}`, `Conferido no ${GAMA_TITLE}.`]);
    await sql(`update public.podcast_sources set title = $2 where id = $1`, [fonteId, `${SNO_TITLE} — resumo`]);
    const persona = (await sql(`select id from public.tutor_personalities order by id limit 1`))[0].id;
    sessaoId = (await sql(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity, status, summary) values ($1, 'livre', 'Bronquiolite', $2, 3, 'closed', $3::jsonb) returning id`,
      [ALUNA, persona, JSON.stringify({ concepts_mastered: [`Suporte (${SNO_TITLE} p. 345)`] })]))[0].id;
    await sql(`insert into public.tutor_messages (session_id, user_id, role, content, meta) values ($1, $2, 'tutor', $3, '{}'::jsonb)`, [sessaoId, ALUNA, `Na bronquiolite, suporte. Conforme o ${SNO_TITLE}.`]);
    await sql(`insert into public.checklist_stations (id, name, topic, area, medical_review) values ('b-est', 'Estação B', 'Bronquiolite', 'Pediatria', 'approved')`);
    await sql(`insert into public.checklist_station_contents (station_id, content) values ('b-est', $1::jsonb)`, [JSON.stringify({ roteiro: `Roteiro do ${SNO_TITLE}.` })]);
    await sql(`update public.app_settings set value = '{"active": true, "tone": "info", "title": "Aviso", "text": "Nova: Manual de Pediatria Gama (teste) no ar."}'::jsonb where key = 'announcement'`);
    achados = await rpc(ADMIN, "app_ch_complementar_mentions");
  });

  it("acha questões (explicações, conduta esperada, o que avalia, subtema, fontes) com tabela, id, campo e trecho", () => {
    for (const campo of ["Alternativas e explicações", "Conduta esperada", "O que a questão avalia", "Subtema", "Fontes"]) {
      const a = acha("questions", campo, qid);
      expect(a, campo).toBeTruthy();
      expect(a).toMatchObject({ kind: "questao", aba: "questoes", item: qid });
      expect(a.trecho.length).toBeGreaterThan(5);
      expect(a.trecho.length).toBeLessThanOrEqual(160);
    }
    expect(acha("questions", "Conduta esperada", qid).trecho).toContain("Sangue nos Olhos");
  });

  it("acha professor e especialidade da aula; não lista a diretriz nem o material que o banco já esconde do aluno", () => {
    expect(acha("lessons", "Professor", aulaId)).toMatchObject({ kind: "aula", aba: "aulas", item: aulaId });
    expect(acha("lessons", "Especialidade", aulaId)).toBeTruthy();
    expect(acha("lessons", "Título da diretriz", aulaId)).toBeUndefined(); // bate com a biblioteca: já sai filtrado ao aluno
    expect(achados.find((a) => a.tabela === "lesson_materials" && a.item === aulaId)).toBeUndefined(); // já escondido do aluno (hidden_from_student): não precisa de correção
  });

  it("acha os campos da atualização: subtema, rótulo, linha do tempo, flashcards, nota da conferência e dados do app antigo", () => {
    for (const campo of ["Subtema", "Rótulo da publicação", "Linha do tempo", "Flashcards", "Nota da conferência", "Dados do app antigo"]) expect(acha("guideline_updates", campo, atualizacaoId), campo).toBeTruthy();
    expect(acha("guideline_updates", "Conduta atual", atualizacaoId)).toBeUndefined(); // texto limpo não aparece
  });

  it("acha o nome da fonte de podcast, o Tutor (mensagem e resumo), a estação e o aviso geral", () => {
    expect(acha("podcast_sources", "Nome da fonte", fonteId)).toMatchObject({ kind: "fonte_podcast", aba: "podcasts", item: podcastId });
    expect(achados.find((a) => a.tabela === "tutor_messages")).toMatchObject({ kind: "tutor_mensagem", item: sessaoId });
    expect(acha("tutor_sessions", "Resumo da conversa", sessaoId)).toBeTruthy();
    expect(acha("checklist_station_contents", "Roteiro e impressos", "b-est")).toMatchObject({ kind: "estacao", aba: "estacoes" });
    expect(acha("app_settings", "Aviso geral", "announcement")).toMatchObject({ kind: "aviso", aba: "configuracoes", publicado: true });
  });

  it("só o administrador; aluno, editor e anônimo são recusados", async () => {
    await recusa(rpc(ALUNA, "app_ch_complementar_mentions"));
    await recusa(rpc(EDITOR, "app_ch_complementar_mentions"));
    await recusa(rpc(null, "app_ch_complementar_mentions"));
  });

  it("depois de corrigir o texto, o item some da lista ('Conferir de novo')", async () => {
    await sql(`update public.lessons set instructor = 'Equipe de pediatria' where id = $1`, [aulaId]);
    const de_novo: any[] = await rpc(ADMIN, "app_ch_complementar_mentions");
    expect(de_novo.find((a) => a.tabela === "lessons" && a.campo === "Professor")).toBeUndefined();
    expect(de_novo.find((a) => a.tabela === "lessons" && a.campo === "Especialidade")).toBeTruthy();
  });
});

// ------------------------------------------------------------------------------------------------- 3. fonte de podcast
describe("3. fonte de podcast: marcar como complementar e voltar a oficial", () => {
  it("só o administrador marca; editor e aluno são recusados", async () => {
    await recusa(rpc(EDITOR, "app_admin_podcast_source_complementar", { p_source_id: fonteId, p_complementar: true }));
    await recusa(rpc(ALUNA, "app_admin_podcast_source_complementar", { p_source_id: fonteId, p_complementar: true }));
    await recusa(rpc(null, "app_admin_podcast_source_complementar", { p_source_id: fonteId, p_complementar: true }));
  });

  it("marcada, a fonte some da transcrição do aluno e a equipe vê a marca; fica no Registro com o nome da fonte", async () => {
    const pdf = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'resumo-b.pdf', 'podcasts/rb.pdf', 5) returning id`, [podcastId]))[0].id;
    const view = await rpc(ADMIN, "app_admin_podcast_source_complementar", { p_source_id: pdf, p_complementar: true });
    expect(view.sources.find((s: any) => s.id === pdf)).toMatchObject({ complementar: true, student_hidden: true });
    expect(view.sources.find((s: any) => s.id === fonteId)).toMatchObject({ complementar: false });
    const log = (await sql(`select action, target, details from public.admin_audit_log where action = 'podcast.source_complementar' order by created_at desc limit 1`))[0];
    expect(log).toMatchObject({ action: "podcast.source_complementar", target: podcastId });
    expect(log.details).toMatchObject({ source: pdf, title: "resumo-b.pdf", from: "oficial", to: "complementar" });
    // aluno: o episódio publicado não traz a fonte marcada
    await sql(`update public.podcasts set status = 'published', approved_at = now(), audio_path = 'podcasts/a.mp3', published_at = now() where id = $1`, [podcastId]);
    const aluna: any = await rpc(ALUNA, "app_podcast", { p_id: podcastId });
    expect(JSON.stringify(aluna.sources)).not.toContain("resumo-b");
    // volta a oficial (o episódio publicado não impede: marcar só esconde)
    const volta = await rpc(ADMIN, "app_admin_podcast_source_complementar", { p_source_id: pdf, p_complementar: false });
    expect(volta.sources.find((s: any) => s.id === pdf)).toMatchObject({ complementar: false, student_hidden: false });
    expect((await sql(`select details from public.admin_audit_log where action = 'podcast.source_complementar' order by created_at desc limit 1`))[0].details).toMatchObject({ from: "complementar", to: "oficial" });
  });

  it("fonte que não existe: erro em português", async () => {
    const r = await recusa(rpc(ADMIN, "app_admin_podcast_source_complementar", { p_source_id: "00000000-0000-4000-8000-000000000999", p_complementar: true }));
    expect(r.message).toBe("Fonte não encontrada.");
  });
});

describe("sigla cadastrada (aliases)", () => {
  it("a sigla SNO só barra o texto digitado DEPOIS de cadastrada em ch_sources.aliases; sem cadastro passa", async () => {
    const sno = (await sql(`select id from public.ch_sources where title = $1`, [SNO_TITLE]))[0].id;
    const comSigla = { id: aulaId, summary: "Conforme o resumo do SNO, o suporte basta." };
    await rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula(comSigla) }); // sigla ainda não cadastrada: vazamento conhecido, passa
    await rpc(ADMIN, "app_ch_set_source_aliases", { p_source_id: sno, p_aliases: "{SNO}" });
    try {
      await barrado(rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula({ id: aulaId, summary: "Conforme o resumo do SNO, o suporte basta (outra)." }) }));
    } finally {
      await rpc(ADMIN, "app_ch_set_source_aliases", { p_source_id: sno, p_aliases: "{}" });
    }
    await rpc(ADMIN, "app_admin_save_lesson", { p_lesson: aula({ id: aulaId, summary: "Suporte clínico e oxigênio." }) });
  });
});

describe("lote: o gatilho em muitas linhas de uma vez", () => {
  it("500 aulas gravadas em um comando (texto normal) passam em poucos segundos (gravação interna, o gatilho confere cada linha)", async () => {
    const t0 = Date.now();
    await sql(`insert into public.lessons (area, topic, title, summary) select 'PEDIATRIA', 'Tema ' || g, 'Aula de lote ' || g, 'Resumo clínico número ' || g || ' sobre conduta e suporte.' from generate_series(1, 500) g`);
    const ms = Date.now() - t0;
    expect((await sql(`select count(*)::int as n from public.lessons where title like 'Aula de lote %'`))[0].n).toBe(500);
    console.info(`[lote] 500 linhas com o gatilho: ${ms} ms`);
    expect(ms).toBeLessThan(20_000);
    await sql(`delete from public.lessons where title like 'Aula de lote %'`);
  });
});

describe("a migração", () => {
  it("pode ser colada duas vezes sem erro e sem mudar os dados", async () => {
    const antes = await sql(`select id, audience from public.ch_sources order by id`);
    await db.exec(fs.readFileSync(NOVA, "utf8"));
    await db.exec(fs.readFileSync(NOVA, "utf8"));
    expect(await sql(`select id, audience from public.ch_sources order by id`)).toEqual(antes);
    expect((await sql(`select count(*)::int as n from pg_trigger where tgname like '%\\_guard\\_complementar' and not tgisinternal`))[0].n).toBe(6);
  });

  it("funções internas não são chamáveis por aluno nem por anônimo", async () => {
    for (const fn of ["ch_complementar_terms_keys()", "ch_complementar_regex()", "ch_complementar_snippet('a','b')", "ch_complementar_url_hit('https://x')", "podcast_admin_view('00000000-0000-4000-8000-000000000999')"]) {
      for (const role of ["authenticated", "anon"]) {
        const r = await db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          try {
            await tx.query(`select public.${fn}`);
            return "passou";
          } catch (e: any) {
            return e.code;
          }
        });
        expect(r, `${fn} como ${role}`).toBe("42501");
      }
    }
  });

  it("os termos da expressão: títulos cadastrados e órgãos DISTINTIVOS; nunca 'Sangue nos Olhos' solto (órgão curto), nem o nome de fonte oficial", async () => {
    const keys: string[] = (await sql(`select public.ch_complementar_terms_keys() as k`))[0].k;
    expect(keys).toEqual(expect.arrayContaining(["manual de pediatria gama teste", "editora gama de pediatria teste", "sangue nos olhos pediatria"]));
    expect(keys).not.toContain("sangue nos olhos"); // o órgão cadastrado é só "Sangue nos Olhos" (16 letras): não é distintivo
    expect(keys).not.toContain("curso z"); // órgão curto
    expect(keys).not.toContain("diretriz compartilhada");
    expect(keys).not.toContain(await sql(`select public.ch_text_key('${OFI_TITLE}') as k`).then((r) => r[0].k));
  });
});
