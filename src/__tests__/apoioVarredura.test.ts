// @vitest-environment node
/**
 * TESTE ADVERSARIAL (APOIO-T) das fontes complementares (migração 20261003009620_fontes_complementares.sql), num Postgres real em
 * memória (PGlite) com TODAS as migrações.
 *
 * Regra do dono: a apostila "Sangue nos Olhos" é fonte COMPLEMENTAR (vale para a IA e para a equipe), mas NADA que a identifique
 * chega ao ALUNO (título, órgão, link, nome de arquivo, trecho, página, contagem). As fontes oficiais continuam aparecendo ao aluno e
 * só elas contam para os selos.
 *
 * Este arquivo NÃO depende do teste do construtor (fontesComplementaresBanco.test.ts). Monta um mundo com administrador, editora,
 * revisor médico, aluno e visitante; liga a fonte complementar e a oficial a tudo o que o aluno vê; e VARRE SISTEMATICAMENTE:
 *   (a) toda função de public que o papel authenticated pode executar (pg_proc + has_function_privilege), chamada como aluno com
 *       argumentos do mundo montado (cada chamada numa transação desfeita depois);
 *   (b) toda tabela/visão de public que authenticated pode ler (privilégio de tabela OU de coluna), lida como aluno;
 *   (c) o mesmo para o visitante (anon).
 * A resposta inteira (ou a mensagem de erro) não pode conter nenhuma marca da fonte complementar.
 *
 * Vazamentos achados ficam como `it.fails(...)`: o teste descreve a regra e FALHA hoje (o Vitest conta como "passou porque falhou").
 * Quando o vazamento for corrigido, o `it.fails` passa a acusar erro e deve virar `it` normal.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
/** Vazamento documentado: falha hoje de propósito. Com APOIO_MOSTRAR_VAZAMENTOS=1 vira `it` comum e mostra a falha real. */
const vazamento = process.env.APOIO_MOSTRAR_VAZAMENTOS === "1" ? it : it.fails;
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const EDITORA = "00000000-0000-4000-8000-0000000000e1";
const REVISOR = "00000000-0000-4000-8000-0000000000f1";
const ALUNO = "00000000-0000-4000-8000-0000000000b1";

// ---- marcas únicas da fonte complementar
const COMP_TITLE = "Sangue nos Olhos — Clínica Médica";
const COMP_ORGAN = "Editora Sangue nos Olhos";
const COMP_URL = "https://apostila.exemplo/sno.pdf";
const COMP_FILE = "SNO-ClinicaMedica-2026.pdf";
const FRASE = "FRASE-SECRETA-SNO";
const COMP_PAGE = 123;
// ---- fonte oficial
const OFI_TITLE = "PCDT Hepatite B";
const OFI_ORGAN = "Ministério da Saúde";
const OFI_URL = "https://www.gov.br/saude/pcdt-hepatite-b";

/** Marcas procuradas (sem diferença de maiúsculas) em TUDO o que o aluno recebe. */
const MARCAS = ["sangue", "apostila", "frase-secreta-sno", "sno-clinicamedica", "clinicamedica-2026", "sno.pdf"];
/** Página da apostila dentro de JSON/texto: "page":123, "pages":[...,123,...] ou "p. 123". */
const PAGINA = new RegExp(`"page"\\s*:\\s*${COMP_PAGE}\\b|"pages"\\s*:\\s*\\[[^\\]]*\\b${COMP_PAGE}\\b|p\\.\\s*${COMP_PAGE}\\b`);
function marcasEm(texto: string): string[] {
  const t = texto.toLowerCase();
  const achou = MARCAS.filter((m) => t.includes(m));
  if (PAGINA.test(texto)) achou.push(`página ${COMP_PAGE}`);
  return achou;
}

let db: PGlite;
const sql = async <T = any>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;

/** Roda `fn` como `uid` (null = visitante) numa transação que é DESFEITA no fim (nada do que o aluno chama muda o mundo). */
async function como<T>(uid: string | null, fn: (q: <R = any>(s: string, p?: unknown[]) => Promise<R[]>) => Promise<T>, grava = false): Promise<T> {
  await db.exec("begin");
  let ok = false;
  try {
    await db.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await fn(async (s, p = []) => (await db.query<any>(s, p)).rows);
    ok = true;
    return r;
  } finally {
    await db.exec(grava && ok ? "commit" : "rollback");
  }
}
const arg = (a: unknown) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a);
/** Chamada como `uid`, desfeita no fim (leitura/ataque). */
async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}, grava = false): Promise<T> {
  const keys = Object.keys(args);
  return como(uid, async (q) => (await q<{ r: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, keys.map((k) => arg(args[k]))))[0].r, grava);
}
/** Chamada como `uid` que GRAVA (montagem do mundo pela equipe). */
const grava = <T = any>(uid: string, fn: string, args: Record<string, unknown> = {}) => rpc<T>(uid, fn, args, true);
async function recusa(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e: any) {
    return String(e.message);
  }
  throw new Error("Era para recusar, mas passou.");
}

// ---- ids do mundo
const QID = "revalida_2024_1_q001"; // a questão com as duas fontes
let sOfi: string, sComp: string, docComp: string, claim: string, analise: string, cartao: string;
let aulaId: string, matComp: string, matLink: string, podcastId: string, pSrcOfi: string, pSrcLink: string, pSrcPdf: string;
let atualizacaoId: string;
const SLUG = "pcdt-hepatite-b-teste";
let treinoId: string, tutorId: string;

const questao = (number: number, sources: unknown[]) => ({
  kind: "REVALIDA", year: 2024, semester: 1, number, area: "PEDIATRIA", topic: "Hepatite B", subtopic: "Transmissão vertical",
  statement: `Gestante HBsAg reagente (questão ${number}). Qual a conduta com o recém-nascido?`,
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: id === "B" ? "Vacina e imunoglobulina nas primeiras 12 horas." : "" })),
  correct_option: "B", status: "valid", expected_conduct: "Vacina e imunoglobulina.", inep_intent: "", needs_image: false, sources,
});

async function evidencia(claimId: string, src: string, page: number, quote: string) {
  await sql(`insert into public.ch_evidence (claim_id, source_id, section, page, source_version, quote, verdict, checked_by) values ($1, $2, 'Conduta', $3, '1', $4, 'compatible', $5)`,
    [claimId, src, page, quote, ADMIN]);
}
async function analisePublicada(qid: string, extra: Record<string, unknown> = {}) {
  const a = (await sql(
    `insert into public.question_analysis (question_id, version, question_core, trap, golden_rule, basis_hash, status, official_answer_at_analysis, reviewed_at, temporal_status, last_source_check_at)
     values ($1, 1, 'Pede a conduta no recém-nascido de mãe HBsAg reagente.', $2, 'Vacina e imunoglobulina cedo.', 'x', 'published', 'B', now(), $3, $4) returning id`,
    [qid, extra.trap ?? "Não esperar o resultado do anti-HBs.", extra.temporal ?? "CURRENT", extra.checked === false ? null : new Date().toISOString()]))[0].id;
  for (const id of ["A", "B", "C", "D"]) {
    await sql(`insert into public.question_option_analysis (analysis_id, question_id, option_id, is_official_correct, distractor_kind, reasoning, why_wrong) values ($1, $2, $3, $4, $5, 'Raciocínio clínico.', $6)`,
      [a, qid, id, id === "B", id === "B" ? "CORRECT" : "WRONG", id === "B" ? null : "Não protege o recém-nascido."]);
  }
  return a as string;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));

  // ---- pessoas
  for (const [id, email, name] of [[ADMIN, "adm@t.dev", "Adm"], [EDITORA, "ed@t.dev", "Editora"], [REVISOR, "rev@t.dev", "Revisor"], [ALUNO, "aluno@t.dev", "Aluno"]]) {
    await sql(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await sql(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await sql(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITORA]);
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [REVISOR]);
  await sql(`update public.subscriptions set plan = 'pro', status = 'active' where user_id = $1`, [ALUNO]);
  await sql(`insert into public.legal_acceptances (user_id, document, version, origin, email_hash)
             select $1::uuid, v.document, v.version, case v.document when 'termo_uso' then 'cadastro' else 'tutor' end, public.legal_email_hash('aluno@t.dev')
             from public.legal_versions v on conflict do nothing`, [ALUNO]);

  // ---- biblioteca: documento da apostila (nome do arquivo), fonte complementar (nível E → nasce complementar) e fonte oficial
  docComp = (await sql(`insert into public.ch_documents (owner_id, name, sha256, storage_path, mime) values ($1, $2, $3, $4, 'application/pdf') returning id`,
    [ADMIN, COMP_FILE, crypto.randomBytes(32).toString("hex"), `documents/${COMP_FILE}`]))[0].id;
  sComp = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level, document_id) values ($1, $2, 'final', $3, '2026', 'E', $4) returning id`,
    [COMP_TITLE, COMP_ORGAN, COMP_URL, docComp]))[0].id;
  sOfi = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level) values ($1, $2, 'final', $3, '1', 'A') returning id`, [OFI_TITLE, OFI_ORGAN, OFI_URL]))[0].id;
  await sql(`insert into public.ch_source_watch (source_id, url, interval_days, last_checked_at, next_check_at, last_status) values ($1, $2, 30, now(), now() + interval '29 days', 'ok')`, [sOfi, OFI_URL]);
  await sql(`insert into public.ch_source_passages (source_id, page, section, text) values ($1, $2, 'Hepatite B', $3), ($4, 12, 'Hepatite B', 'Hepatite B: vacina e imunoglobulina no recém-nascido.')`,
    [sComp, COMP_PAGE, `${FRASE} hepatite B vacina imunoglobulina recém-nascido`, sOfi]);

  // ---- questão com as duas fontes: gabarito digitado na importação, evidência, análise publicada, comentário, cartão e gabarito oficial
  await grava(ADMIN, "app_admin_save_question", { p_question: questao(1, [
    { title: "Gabarito definitivo INEP 2024/1", organization: "INEP" },
    { title: COMP_TITLE, organization: COMP_ORGAN, url: COMP_URL, page: COMP_PAGE },
  ]) });
  claim = (await sql(`insert into public.ch_claims (statement) values ('Recém-nascido de mãe HBsAg reagente recebe vacina e imunoglobulina.') returning id`))[0].id;
  await sql(`insert into public.question_claims (question_id, claim_id, role) values ($1, $2, 'solves')`, [QID, claim]);
  await evidencia(claim, sOfi, 12, "vacina e imunoglobulina no recém-nascido");
  await evidencia(claim, sComp, COMP_PAGE, FRASE);
  analise = await analisePublicada(QID);
  await sql(`insert into public.question_comments (question_id, analysis_id, version, level, content, content_hash, status, published_at) values ($1, $2, 1, 'full', '{"text":"Comentário normal."}'::jsonb, 'h', 'published', now())`, [QID, analise]);
  cartao = (await sql(
    `insert into public.question_update_cards (question_id, version, temporal_status, impact_level, official_answer, current_answer, what_changed, sources, reviewed_by, official_source)
     values ($1, 1, 'UPDATED_BUT_SAME_ANSWER', 'COMMENT_ONLY', 'B', 'B', 'O PCDT manteve a conduta.', $2::jsonb, $3, $4) returning id`,
    [QID, JSON.stringify([
      { title: OFI_TITLE, organ: OFI_ORGAN, version: "1", page: 12, url: OFI_URL },
      { title: COMP_TITLE, organ: COMP_ORGAN, version: "2026", page: COMP_PAGE, url: COMP_URL },
    ]), ADMIN, `Gabarito INEP; ${COMP_TITLE}`]))[0].id;
  await sql(`insert into public.question_official_answers (question_id, version, answer, answer_status, source) values ($1, 1, 'B', 'FINAL', $2)`, [QID, `Gabarito INEP; ${COMP_TITLE} p. ${COMP_PAGE}`]);
  // o aluno fez um treino com a questão e errou (correção, diagnóstico, caderno de erros, histórico)
  treinoId = (await sql(`insert into public.practice_sessions (user_id, kind, question_ids, finished_at) values ($1, 'questoes', $2, now()) returning id`, [ALUNO, [QID]]))[0].id;
  await sql(`insert into public.question_attempts (user_id, question_id, session_id, selected_option) values ($1, $2, $3, 'A')`, [ALUNO, QID, treinoId]);

  // ---- aula publicada: diretriz = a apostila; material = arquivo da apostila e link da apostila; um material normal
  aulaId = (await sql(`insert into public.lessons (area, topic, title, summary, guideline_title, guideline_url, published) values ('PEDIATRIA', 'Hepatite B', 'Hepatite B na gestação', 'Resumo normal da aula.', $1, $2, true) returning id`,
    [COMP_TITLE, COMP_URL]))[0].id;
  await sql(`insert into public.lesson_materials (lesson_id, kind, title, url) values ($1, 'slides', 'Slides da aula', 'https://exemplo.invalid/slides')`, [aulaId]);
  matComp = (await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1, 'other', $2, $3) returning id`, [aulaId, COMP_TITLE, `lessons/${aulaId}/${COMP_FILE}`]))[0].id;
  matLink = (await sql(`insert into public.lesson_materials (lesson_id, kind, title, url) values ($1, 'other', 'Leitura complementar', $2) returning id`, [aulaId, COMP_URL]))[0].id;

  // ---- podcast publicado: fonte oficial (link), link da apostila com nome neutro, PDF da apostila marcado pela equipe
  podcastId = (await sql(`insert into public.podcasts (title, topic, area, status, script, approved_at, audio_path, published_at, lesson_id)
     values ('Hepatite B em 8 minutos', 'Hepatite B', 'PEDIATRIA', 'published', '{"lines":[]}'::jsonb, now(), 'podcasts/x.mp3', now(), $1) returning id`, [aulaId]))[0].id;
  pSrcOfi = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, url, position) values ($1, 'link', $2, $3, 1) returning id`, [podcastId, OFI_TITLE, OFI_URL]))[0].id;
  pSrcLink = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, url, position) values ($1, 'link', 'Leitura de apoio', $2, 2) returning id`, [podcastId, COMP_URL]))[0].id;
  pSrcPdf = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, pages, position) values ($1, 'pdf', 'Resumo-final.pdf', 'podcasts/a.pdf', 400, 3) returning id`, [podcastId]))[0].id;
  await grava(ADMIN, "app_admin_podcast_source_complementar", { p_source_id: pSrcPdf, p_complementar: true });
  const ch = await sql(`insert into public.podcast_chunks (podcast_id, source_id, ord, page, text) values ($1, $2, 0, 12, 'Trecho oficial.'), ($1, $3, 0, $5, $6), ($1, $4, 0, $5, $6) returning id`,
    [podcastId, pSrcOfi, pSrcLink, pSrcPdf, COMP_PAGE, FRASE]);
  await sql(`update public.podcasts set script = $2::jsonb where id = $1`, [podcastId, JSON.stringify({ lines: [
    { speaker: "ANA", text: "Vamos falar de hepatite B na gestação.", sources: [ch[0].id, ch[1].id] },
    { speaker: "BRUNO", text: "Vacina e imunoglobulina cedo.", sources: [ch[2].id] },
  ] })]);

  // ---- atualização/diretriz publicada cujo documento é a apostila
  atualizacaoId = (await sql(
    `insert into public.guideline_updates (slug, area, topic, institution, document_title, source_url, before_text, current_conduct, published, review_status, source_checked_at, reviewed_by, reviewed_at)
     values ($1, 'PEDIATRIA', 'Hepatite B perinatal', $2, $3, $4, 'Antes: só vacina.', 'Agora: vacina e imunoglobulina.', true, 'approved', now(), $5, now()) returning id`,
    [SLUG, COMP_ORGAN, COMP_TITLE, COMP_URL, ADMIN]))[0].id;

  // ---- Tutor: conversa do aluno sobre a questão, com uma resposta gravada como o servidor grava hoje (só fonte oficial)
  tutorId = (await sql(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity, question_id) values ($1, 'questao', 'Hepatite B', 'direto', 3, $2) returning id`, [ALUNO, QID]))[0].id;
  await sql(`select public.ch_worker_tutor_append($1, $2, 'Por que a B?', 'Porque protege o recém-nascido.', $3::jsonb, '{}'::jsonb)`,
    [ALUNO, tutorId, JSON.stringify({ grounding: "source", sources: [{ ref: "F1", label: `${OFI_TITLE} · ${OFI_ORGAN} · p. 12` }] })]);
}, 180_000);

// =====================================================================================================================
// (a)(c) varredura das funções
// =====================================================================================================================
interface Fn { proname: string; nargs: number; ndef: number; names: string[]; types: string[]; relids: (string | null)[]; retset: boolean; ret: string }
interface Achado { quem: string; onde: string; marcas: string[]; amostra: string }

function literal(nome: string, tipo: string, uuid: string): string | null {
  const n = nome.toLowerCase();
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  switch (tipo) {
    case "uuid": return `${q(uuid)}::uuid`;
    case "uuid[]": return `array[${q(uuid)}]::uuid[]`;
    case "text": case "character varying": case "character": {
      if (/question|^p_id$/.test(n)) return q(QID);
      if (n === "p_slug") return q(SLUG);
      if (n === "p_level") return q("full");
      if (/selected|option|first_pick|answer/.test(n)) return q("A");
      if (n === "p_area" || n === "p_subarea") return q("PEDIATRIA");
      if (n === "p_mode") return q("livre");
      if (n === "p_kind") return q("questoes");
      if (/search|query|topic|text|theme/.test(n)) return q("hepatite");
      return q("x");
    }
    case "text[]": return `array['PEDIATRIA']::text[]`;
    case "integer": case "smallint": case "bigint": return /offset/.test(n) ? "0" : /days/.test(n) ? "30" : /limit|count/.test(n) ? "20" : "1";
    case "numeric": case "double precision": return "1";
    case "boolean": return "false";
    case "jsonb": case "json": return "'{}'::jsonb";
    case "date": return "current_date";
    case "timestamp with time zone": return "now()";
    case "med_area": return "'PEDIATRIA'::public.med_area";
    default: return null;
  }
}

async function funcoes(papel: "authenticated" | "anon"): Promise<Fn[]> {
  return sql<Fn>(`
    select p.proname, p.pronargs::int nargs, p.pronargdefaults::int ndef, p.proretset retset, format_type(p.prorettype, null) ret,
           coalesce((select array_agg(u.n order by u.o) from unnest(p.proargnames, coalesce(p.proargmodes, array_fill('i'::"char", array[coalesce(array_length(p.proargnames, 1), 0)]))) with ordinality u (n, m, o)
                     where u.m in ('i', 'b', 'v')), '{}') names,
           array(select format_type(t, null) from unnest(p.proargtypes) with ordinality x (t, o) order by o) types,
           array(select (select nullif(ty.typrelid, 0)::regclass::text from pg_type ty where ty.oid = t) from unnest(p.proargtypes) with ordinality x (t, o) order by o) relids
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.prokind = 'f' and has_function_privilege($1, p.oid, 'execute')
      and p.prorettype <> 'trigger'::regtype and p.prorettype <> 'event_trigger'::regtype
    order by p.proname`, [papel]);
}

/** Chama cada função com argumentos plausíveis do mundo montado e devolve o que vazou (+ quantas chamadas responderam sem erro). */
async function varrerFuncoes(uid: string | null): Promise<{ total: number; chamadas: number; ok: number; achados: Achado[]; semArgs: string[]; respondeu: number; soErro: string[] }> {
  const papel = uid ? "authenticated" : "anon";
  const lista = await funcoes(papel);
  const uuids = [aulaId, podcastId, atualizacaoId, treinoId, tutorId, sComp, sOfi, docComp, claim, analise, cartao, matComp, matLink, pSrcLink, pSrcPdf, ALUNO, ADMIN];
  const achados: Achado[] = [];
  const semArgs: string[] = [];
  const respondeu = new Set<string>();
  let chamadas = 0;
  let ok = 0;
  for (const f of lista) {
    const obrig = f.nargs - f.ndef;
    // função que recebe linha de tabela (campo calculado do PostgREST: GET /tabela?select=*,funcao): chama sobre cada linha visível
    const comp = f.relids.findIndex((r) => r);
    const variantes: string[] = [];
    if (comp >= 0) {
      const outros = f.types.slice(0, obrig).map((t, i) => (i === comp ? "x" : literal(f.names[i] ?? "", t, uuids[0])));
      if (outros.some((o) => o === null)) { semArgs.push(f.proname); continue; }
      variantes.push(`select coalesce(json_agg(public.${f.proname}(${outros.join(", ")}))::text, '') r from ${f.relids[comp]} x`);
    } else {
      const usaUuid = f.types.slice(0, obrig).some((t) => t.startsWith("uuid"));
      for (const u of usaUuid ? uuids : [uuids[0]]) {
        const vals = f.types.slice(0, obrig).map((t, i) => literal(f.names[i] ?? "", t, u));
        if (vals.some((v) => v === null)) { semArgs.push(f.proname); break; }
        const argsSql = vals.map((v, i) => (f.names[i] ? `${f.names[i]} => ${v}` : v)).join(", ");
        // p_level/p_question_id opcionais: pede o nível mais completo
        const extra = f.names.slice(obrig).includes("p_level") ? `${argsSql ? ", " : ""}p_level => 'full'` : "";
        variantes.push(f.retset
          ? `select coalesce(json_agg(t)::text, '') r from public.${f.proname}(${argsSql}${extra}) t`
          : `select public.${f.proname}(${argsSql}${extra})::text r`);
      }
    }
    for (const v of variantes) {
      chamadas++;
      let texto: string;
      try {
        texto = String((await como(uid, (q) => q<{ r: string }>(v)))[0]?.r ?? "");
        ok++;
        respondeu.add(f.proname);
      } catch (e: any) {
        texto = `ERRO: ${e.message} ${e.detail ?? ""} ${e.hint ?? ""}`;
      }
      const m = marcasEm(texto);
      if (m.length) achados.push({ quem: papel, onde: `função ${f.proname}`, marcas: m, amostra: texto.slice(0, 240) });
    }
  }
  const soErro = lista.map((f) => f.proname).filter((n) => !respondeu.has(n));
  return { total: lista.length, chamadas, ok, achados, semArgs: [...new Set(semArgs)], respondeu: respondeu.size, soErro };
}

// =====================================================================================================================
// (b)(c) varredura das tabelas e visões
// =====================================================================================================================
async function varrerTabelas(uid: string | null): Promise<{ total: number; comLinhas: string[]; achados: Achado[] }> {
  const papel = uid ? "authenticated" : "anon";
  const rels = await sql<{ rel: string; cols: string[] }>(`
    select c.relname rel,
           array(select a.attname from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                   and (has_table_privilege($1, c.oid, 'select') or has_column_privilege($1, c.oid, a.attnum, 'select')) order by a.attnum) cols
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') order by 1`, [papel]);
  const achados: Achado[] = [];
  const comLinhas: string[] = [];
  let total = 0;
  for (const r of rels.filter((x) => x.cols.length)) {
    total++;
    let texto: string;
    try {
      const linhas = await como(uid, (q) => q(`select ${r.cols.map((c) => `"${c}"`).join(", ")} from public."${r.rel}"`));
      if (linhas.length) comLinhas.push(`${r.rel} (${linhas.length})`);
      texto = JSON.stringify(linhas);
    } catch (e: any) {
      texto = `ERRO: ${e.message}`;
    }
    const m = marcasEm(texto);
    if (m.length) achados.push({ quem: papel, onde: `tabela ${r.rel}`, marcas: m, amostra: texto.slice(0, 240) });
  }
  return { total, comLinhas, achados };
}

const resumo = (a: Achado[]) => a.map((x) => `${x.quem} · ${x.onde} · ${x.marcas.join("/")}`);
/** Vazamentos JÁ documentados (cada um tem o seu it.fails abaixo). A varredura só passa se não surgir nenhum outro. */
const CONHECIDOS = [
  "authenticated · tabela lessons",
  "authenticated · tabela guideline_updates",
  "authenticated · tabela questions",
  "authenticated · função app_tutor_session", // só se houver mensagem antiga (it.fails abaixo grava uma)
  "authenticated · função app_guideline_updates", // busca: só no teste de canal lateral
];
const conhecido = (a: Achado) => CONHECIDOS.some((k) => `${a.quem} · ${a.onde}`.startsWith(k));

let funcAluno: Awaited<ReturnType<typeof varrerFuncoes>>;
let tabAluno: Awaited<ReturnType<typeof varrerTabelas>>;

describe("varredura sistemática como ALUNO", () => {
  it("toda função que o aluno pode executar foi chamada; nenhuma devolve marca da apostila (fora os vazamentos documentados)", async () => {
    funcAluno = await varrerFuncoes(ALUNO);
    console.log(`[APOIO-T] aluno: ${funcAluno.total} funções executáveis, ${funcAluno.chamadas} chamadas (${funcAluno.ok} sem erro); sem argumento possível: ${funcAluno.semArgs.join(", ") || "nenhuma"}`);
    console.log(`[APOIO-T] aluno: ${funcAluno.respondeu} funções responderam sem erro em pelo menos uma chamada; só erro (recusa de permissão ou argumento): ${funcAluno.soErro.join(", ")}`);
    console.log(`[APOIO-T] aluno, achados nas funções: ${JSON.stringify(resumo(funcAluno.achados))}`);
    expect(funcAluno.total).toBeGreaterThan(200);
    expect(funcAluno.ok).toBeGreaterThan(80);
    expect(resumo(funcAluno.achados.filter((a) => !conhecido(a)))).toEqual([]);
  }, 600_000);

  it("toda tabela/visão que o aluno pode ler foi lida; nenhuma devolve marca da apostila (fora os vazamentos documentados)", async () => {
    tabAluno = await varrerTabelas(ALUNO);
    console.log(`[APOIO-T] aluno: ${tabAluno.total} tabelas/visões legíveis; com linhas: ${tabAluno.comLinhas.join(", ")}`);
    console.log(`[APOIO-T] aluno, achados nas tabelas: ${JSON.stringify(resumo(tabAluno.achados))}`);
    expect(tabAluno.total).toBeGreaterThan(100);
    expect(resumo(tabAluno.achados.filter((a) => !conhecido(a)))).toEqual([]);
  }, 120_000);

  it("CORRIGIDO: nenhuma tabela legível pelo aluno traz marca da apostila (falha hoje: lessons, guideline_updates, questions)", async () => {
    const t = tabAluno ?? (await varrerTabelas(ALUNO));
    expect(resumo(t.achados)).toEqual([]);
  }, 120_000);
});

describe("varredura sistemática como VISITANTE (anon)", () => {
  it("toda função e tabela que o visitante alcança: nada da apostila", async () => {
    const f = await varrerFuncoes(null);
    const t = await varrerTabelas(null);
    console.log(`[APOIO-T] visitante: ${f.total} funções (${f.chamadas} chamadas, ${f.ok} sem erro), ${t.total} tabelas/visões; com linhas: ${t.comLinhas.join(", ") || "nenhuma"}`);
    expect(resumo([...f.achados, ...t.achados])).toEqual([]);
  }, 600_000);
});

// =====================================================================================================================
// o aluno continua vendo a fonte oficial; equipe vê tudo
// =====================================================================================================================
describe("fonte oficial continua com o aluno; equipe, revisor e administrador veem a complementar", () => {
  it("aluno: comentário, cartão, correção e podcast trazem a oficial; selo e atualidade contam só a oficial", async () => {
    const c = await rpc(ALUNO, "app_question_commentary", { p_question_id: QID, p_level: "full" });
    expect(marcasEm(JSON.stringify(c))).toEqual([]);
    expect(c.sources.map((s: any) => s.title)).toEqual([OFI_TITLE]);
    expect(c.update_card.sources.map((s: any) => s.title)).toEqual([OFI_TITLE]);
    expect(c.update_card.official_source).toBeNull();
    expect(c.freshness.sources).toBe(1);
    expect(c.seal).toBe("UPDATED");
    const corr = await rpc(ALUNO, "practice_correction_view", { p_question_id: QID, p_selected: "A" });
    expect(corr.sources.map((s: any) => s.title)).toEqual(["Gabarito definitivo INEP 2024/1"]);
    const p = await rpc(ALUNO, "app_podcast", { p_id: podcastId });
    expect(marcasEm(JSON.stringify(p))).toEqual([]);
    expect(p.sources.map((s: any) => s.title)).toEqual([OFI_TITLE]);
    expect(p.sources[0].pages).toEqual([12]);
  });

  it("administrador, editora e revisor médico veem a complementar (título, página, trecho na busca)", async () => {
    for (const uid of [ADMIN, EDITORA, REVISOR]) {
      const c = await rpc(uid, "app_question_commentary", { p_question_id: QID, p_level: "full" });
      expect(JSON.stringify(c.update_card.sources), uid).toContain(COMP_TITLE);
    }
    for (const uid of [ADMIN, EDITORA]) {
      expect(JSON.stringify(await rpc(uid, "app_podcast", { p_id: podcastId }))).toContain(`${COMP_PAGE}`);
      expect(JSON.stringify(await rpc(uid, "app_lesson", { p_id: aulaId }))).toContain(COMP_TITLE);
      expect(JSON.stringify(await rpc(uid, "app_guideline_update", { p_slug: SLUG }))).toContain(COMP_TITLE);
      expect(JSON.stringify(await rpc(uid, "app_ch_sources"))).toContain(COMP_TITLE);
    }
    expect(JSON.stringify(await rpc(ADMIN, "app_ch_search_passages", { p_query: "hepatite" }))).toContain(FRASE);
  });

  it("o contexto que o servidor manda para a IA de VOZ (que fala direto com o aluno, sem conferência antes) não traz a apostila", async () => {
    for (const fn of ["ch_worker_tutor_context", "ch_worker_tutor_voice_context"]) {
      const r = (await sql(`select public.${fn}($1, $2)::text r`, [ALUNO, tutorId]))[0].r;
      expect(marcasEm(r), fn).toEqual([]);
    }
    const t = (await sql(`select public.tutor_truth($1, 'full')::text r`, [QID]))[0].r;
    expect(marcasEm(t)).toEqual([]);
    expect(t).toContain(OFI_TITLE);
  });
});

describe("as correções de Aulas (9580) e Podcasts (9593) continuam valendo depois da 9620", () => {
  it("podcast: nome dado pela equipe aparece como está; PDF sem nome da equipe vira 'Documento N' sem buraco", async () => {
    const a = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position, title_by_staff) values ($1, 'pdf', 'Guia oficial renomeado', 'podcasts/c.pdf', 5, true) returning id`, [podcastId]))[0].id;
    const b = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'arquivo sem extensao com nome longo', 'podcasts/d.pdf', 6) returning id`, [podcastId]))[0].id;
    try {
      const p = await rpc(ALUNO, "app_podcast", { p_id: podcastId });
      expect(p.sources.map((s: any) => s.title)).toEqual([OFI_TITLE, "Guia oficial renomeado", "Documento 3"]);
    } finally {
      await sql(`delete from public.podcast_sources where id in ($1, $2)`, [a, b]);
    }
  });

  it("aula: o aluno recebe rótulo neutro no material (nunca o nome do arquivo), não lê lesson_materials nem lesson_reviews direto; a equipe vê o nome real", async () => {
    const aula = await rpc(ALUNO, "app_lesson", { p_id: aulaId });
    expect(aula.materials.map((m: any) => m.title)).toEqual(["Material complementar"]);
    expect(aula.guideline_title).toBeNull();
    expect(aula.guideline_url).toBeNull();
    expect(await rpc(ALUNO, "app_lesson_material", { p_id: matComp })).toBeNull();
    expect(await rpc(ALUNO, "app_lesson_material", { p_id: matLink })).toBeNull();
    expect((await como(ALUNO, (q) => q(`select count(*)::int n from public.lesson_materials`)))[0].n).toBe(0);
    await recusa(como(ALUNO, (q) => q(`select * from public.lesson_reviews`)));
    const equipe = await rpc(ADMIN, "app_lesson", { p_id: aulaId });
    expect(equipe.materials.map((m: any) => m.file_title).sort()).toEqual(["Leitura complementar", "Slides da aula", COMP_TITLE].sort());
  });
});

// =====================================================================================================================
// 3. selos
// =====================================================================================================================
describe("selos: só fonte oficial dá 'Fontes oficiais conferidas', 'Atualizada', 'Conduta atual' e atualidade", () => {
  it("questão cuja ÚNICA fonte é a complementar: nada de selo, fonte, atualidade nem cartão publicável", async () => {
    await grava(ADMIN, "app_admin_save_question", { p_question: questao(2, []) });
    const q2 = "revalida_2024_1_q002";
    const c2 = (await sql(`insert into public.ch_claims (statement) values ('Outra afirmação da apostila.') returning id`))[0].id;
    await sql(`insert into public.question_claims (question_id, claim_id, role) values ($1, $2, 'solves')`, [q2, c2]);
    await evidencia(c2, sComp, COMP_PAGE, FRASE);
    await analisePublicada(q2);
    await sql(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, $2, 'B')`, [ALUNO, q2]);
    const c = await rpc(ALUNO, "app_question_commentary", { p_question_id: q2, p_level: "full" });
    expect(marcasEm(JSON.stringify(c))).toEqual([]);
    expect(c.sources).toEqual([]); // sem "Fontes oficiais conferidas"
    expect(c.sources_checked_at).toBeNull();
    expect(c.seal).toBeNull(); // sem "Atualizada"
    expect(c.freshness.sources).toBe(0); // sem indicador de atualidade
    expect(c.update_card).toBeNull(); // sem "Conduta atual conferida"
    // e o revisor não consegue publicar cartão ("Conduta atual") apoiado só na apostila
    await sql(`insert into public.question_updates (question_id, change_type, impact_level, status) values ($1, 'SOURCE_NEW_VERSION', 'COMMENT_ONLY', 'review_required')`, [q2]).catch(() => undefined);
    const u = (await sql(`select id from public.question_updates where question_id = $1`, [q2]))[0]?.id;
    if (u) {
      const msg = await recusa(rpc(REVISOR, "app_question_update_decide", { p_update_id: u, p_decision: "no_change", p_note: "Conferido na apostila de apoio." }));
      expect(msg).toMatch(/evid[eê]ncias|oficial/i);
    }
  });

  it("com a oficial junto (questão 1): recebe fontes, selo 'Atualizada' e atualidade — mas só a oficial é contada", async () => {
    const c = await rpc(ALUNO, "app_question_commentary", { p_question_id: QID, p_level: "full" });
    expect(c.sources).toHaveLength(1);
    expect(c.seal).toBe("UPDATED");
    expect(c.freshness.score).toBeGreaterThanOrEqual(80);
    expect(c.freshness.sources).toBe(1);
  });

  it("CORRIGIDO: VAZAMENTO DE SELO: cartão publicado quando a fonte era oficial continua mostrando 'Conduta atual conferida' depois que a ÚNICA fonte vira complementar", async () => {
    // fonte que era oficial (nível A) sustenta o cartão; depois o administrador descobre que é apostila e marca como complementar
    const sx = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ('Resumo de Hepatite (cadastrado como oficial)', 'Curso X', 'final', '1', 'A') returning id`))[0].id;
    await grava(ADMIN, "app_admin_save_question", { p_question: questao(3, []) });
    const q3 = "revalida_2024_1_q003";
    const c3 = (await sql(`insert into public.ch_claims (statement) values ('Afirmação 3.') returning id`))[0].id;
    await sql(`insert into public.question_claims (question_id, claim_id, role) values ($1, $2, 'solves')`, [q3, c3]);
    await evidencia(c3, sx, 5, "trecho");
    await analisePublicada(q3);
    await sql(`insert into public.question_update_cards (question_id, version, temporal_status, impact_level, official_answer, current_answer, what_changed, sources, reviewed_by)
               values ($1, 1, 'UPDATED_BUT_SAME_ANSWER', 'COMMENT_ONLY', 'B', 'B', 'A conduta foi mantida pela fonte revisada.', '[{"title":"Resumo de Hepatite (cadastrado como oficial)","organ":"Curso X","page":5}]'::jsonb, $2)`, [q3, ADMIN]);
    await sql(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, $2, 'B')`, [ALUNO, q3]);
    await grava(ADMIN, "app_ch_set_source_audience", { p_source_id: sx, p_audience: "complementar", p_reason: "É apostila." });
    const c = await rpc(ALUNO, "app_question_commentary", { p_question_id: q3, p_level: "full" });
    expect(c.update_card?.sources ?? []).toEqual([]); // a fonte some (ok)…
    expect(c.update_card).toBeNull(); // …mas o cartão ("Conduta atual conferida: alternativa B") continua: FALHA HOJE
  });
});

// =====================================================================================================================
// 5. ataques: brechas e caminhos laterais
// =====================================================================================================================
describe("ataque: leitura direta das tabelas pela API REST (PostgREST)", () => {
  it("CORRIGIDO: aluno não lê questions.sources direto (permissão por coluna); a fonte oficial chega pela correção", async () => {
    await expect(como(ALUNO, (q) => q(`select id, sources from public.questions where id = $1`, [QID]))).rejects.toThrow(/permission denied/);
    expect((await como(ALUNO, (q) => q(`select id, topic from public.questions where id = $1`, [QID]))).length).toBe(1);
    expect((await rpc(ALUNO, "practice_correction_view", { p_question_id: QID, p_selected: "A" })).sources.length).toBeGreaterThan(0);
  });

  it("CORRIGIDO: aluno não lê lessons.guideline_title/guideline_url/guideline_hidden direto; lê o resto", async () => {
    await expect(como(ALUNO, (q) => q(`select guideline_title from public.lessons where id = $1`, [aulaId]))).rejects.toThrow(/permission denied/);
    await expect(como(ALUNO, (q) => q(`select guideline_url from public.lessons where id = $1`, [aulaId]))).rejects.toThrow(/permission denied/);
    await expect(como(ALUNO, (q) => q(`select guideline_hidden from public.lessons where id = $1`, [aulaId]))).rejects.toThrow(/permission denied/);
    await expect(como(ALUNO, (q) => q(`select * from public.lessons`))).rejects.toThrow(/permission denied/);
    expect((await como(ALUNO, (q) => q(`select id, title, topic, summary from public.lessons where id = $1`, [aulaId]))).length).toBe(1);
  });

  it("CORRIGIDO: aluno não lê guideline_updates.institution/document_title/source_url/source_hidden direto; lê o resto", async () => {
    for (const col of ["institution", "document_title", "source_url", "source_hidden"]) {
      await expect(como(ALUNO, (q) => q(`select ${col} from public.guideline_updates where id = $1`, [atualizacaoId])), col).rejects.toThrow(/permission denied/);
    }
    expect((await como(ALUNO, (q) => q(`select id, topic, current_conduct from public.guideline_updates where id = $1`, [atualizacaoId]))).length).toBe(1);
  });

  it("as demais tabelas de fonte (ch_sources, ch_documents, ch_source_passages, ch_evidence, question_*, podcast_*, lesson_materials, lesson_reviews) não devolvem linha ao aluno", async () => {
    for (const t of ["ch_sources", "ch_documents", "ch_source_passages", "ch_evidence", "question_update_cards", "question_official_answers", "question_analysis", "question_comments", "question_claims", "podcast_sources", "podcast_chunks", "podcasts", "ch_unit_versions", "ch_renders", "ch_publications", "ch_visual_materials", "lesson_materials", "lesson_reviews"]) {
      const n = await como(ALUNO, (q) => q(`select count(*)::int n from public."${t}"`)).then((r) => r[0].n, () => 0);
      expect(n, t).toBe(0);
    }
  });
});

describe("ataque: canal lateral pela busca (a contagem revela que existe)", () => {
  it("CORRIGIDO: buscar 'Sangue nos Olhos' em Atualizações & Diretrizes devolve a atualização (a busca olha institution e document_title escondidos)", async () => {
    // causa: 20261003004100_atualizacoes_diretrizes.sql, app_guideline_updates: o filtro p_search usa u.institution e u.document_title sem olhar source_hidden
    const nada = await rpc(ALUNO, "app_guideline_updates", { p_search: "termo-que-nao-existe-xyz" });
    const sno = await rpc(ALUNO, "app_guideline_updates", { p_search: "Sangue nos Olhos" });
    expect(nada.items).toHaveLength(0);
    expect(sno.items).toHaveLength(0);
  });

  it("buscar 'Sangue nos Olhos' nas aulas não acha nada (a busca não olha a diretriz)", async () => {
    expect((await rpc(ALUNO, "app_lessons", { p_search: "Sangue nos Olhos" })).items ?? []).toHaveLength(0);
  });
});

describe("ataque: comparação por nome é textual (brecha 2 do construtor)", () => {
  async function fontesDaCorrecao(items: unknown[]) {
    await sql(`update public.questions set sources = $2::jsonb where id = $1`, [QID, JSON.stringify(items)]);
    try {
      return (await rpc(ALUNO, "practice_correction_view", { p_question_id: QID, p_selected: "A" })).sources as any[];
    } finally {
      await sql(`update public.questions set sources = $2::jsonb where id = $1`, [QID, JSON.stringify([{ title: "Gabarito definitivo INEP 2024/1", organization: "INEP" }, { title: COMP_TITLE, organization: COMP_ORGAN, url: COMP_URL, page: COMP_PAGE }])]);
    }
  }
  it("variações de grafia do nome somem: caixa, acento, hífen, só o link, só o órgão", async () => {
    for (const item of [{ title: "SANGUE NOS OLHOS" }, { title: "sangue-nos-olhos clínica" }, { url: COMP_URL }, { organization: COMP_ORGAN }, "Sangue nos Olhos p. 123", { title: "Clínica Médica", organ: "Editora Sangue nos Olhos" }]) {
      expect(await fontesDaCorrecao([item]), JSON.stringify(item)).toEqual([]);
    }
  });
  vazamento("VAZAMENTO: fonte digitada como 'Apostila SNO, p. 123' (sigla e palavra apostila) chega ao aluno", async () => {
    // causa: 20261003009620_fontes_complementares.sql:70-83 (ch_complementar_hit) só procura "sangue nos olhos" e o título/órgão da biblioteca;
    // não procura a palavra "apostila" (o servidor procura: complementarGuard.ts APOSTILA) nem a sigla SNO nem o nome do arquivo
    expect(await fontesDaCorrecao([{ title: "Apostila SNO, p. 123" }])).toEqual([]);
  });
  it("CORRIGIDO: o NOME DO ARQUIVO da apostila na biblioteca (ch_documents.name) não é comparado: 'SNO-ClinicaMedica-2026.pdf' chega ao aluno", async () => {
    // causa: ch_complementar_hit compara só ch_sources.title/organ/url; o documento ligado (ch_sources.document_id → ch_documents.name) fica de fora
    expect(await fontesDaCorrecao([{ title: COMP_FILE }])).toEqual([]);
  });
  it("CORRIGIDO: EXCESSO (fonte OFICIAL some do aluno): apostila com título genérico esconde a oficial de mesmo tema", async () => {
    // causa: ch_complementar_hit, regra "texto inteiro é parte do título" (9620:80): valor 'PCDT Hepatite B' (>= 8 letras) dentro do título de uma apostila
    const extra = (await sql(`insert into public.ch_sources (title, organ, kind, authority_level) values ('Sangue nos Olhos — Resumo do PCDT Hepatite B', 'Editora Sangue nos Olhos', 'final', 'E') returning id`))[0].id;
    try {
      const c = await rpc(ALUNO, "app_question_commentary", { p_question_id: QID, p_level: "full" });
      expect(c.sources.map((s: any) => s.title)).toEqual([OFI_TITLE]);
    } finally {
      await sql(`delete from public.ch_sources where id = $1`, [extra]);
    }
  });
});

describe("ataque: podcast com arquivo da apostila de nome neutro (brecha 3)", () => {
  it("CORRIGIDO: PDF da apostila enviado com o MESMO nome do arquivo da biblioteca e não marcado à mão aparece como 'Documento N' com a página 123", async () => {
    // causa: app_podcast (9620:382-400) só esconde por podcast_sources.complementar ou ch_complementar_hit(título, url); não compara com ch_documents.name nem sha256
    const s = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', $2, 'podcasts/b.pdf', 4) returning id`, [podcastId, COMP_FILE]))[0].id;
    const c = (await sql(`insert into public.podcast_chunks (podcast_id, source_id, ord, page, text) values ($1, $2, 0, $3, 'trecho') returning id`, [podcastId, s, COMP_PAGE]))[0].id;
    const antes = (await sql(`select script from public.podcasts where id = $1`, [podcastId]))[0].script;
    await sql(`update public.podcasts set script = $2::jsonb where id = $1`, [podcastId, JSON.stringify({ lines: [...antes.lines, { speaker: "ANA", text: "Fechando.", sources: [c] }] })]);
    try {
      const p = await rpc(ALUNO, "app_podcast", { p_id: podcastId });
      expect(p.sources.map((x: any) => x.title)).toEqual([OFI_TITLE]); // hoje: [OFI_TITLE, "Documento 2"] com pages [123]
      expect(marcasEm(JSON.stringify(p))).toEqual([]);
    } finally {
      await sql(`update public.podcasts set script = $2::jsonb where id = $1`, [podcastId, JSON.stringify(antes)]);
      await sql(`delete from public.podcast_sources where id = $1`, [s]);
    }
  });
});

describe("ataque: texto já publicado e mensagens antigas (brechas 4 e 5)", () => {
  it("texto de análise JÁ publicado que cita a apostila: o administrador acha na varredura de publicado", async () => {
    await sql(`update public.question_analysis set trap = 'Segundo a apostila Sangue nos Olhos, cuidado.' where id = $1`, [analise]);
    try {
      const achados = await rpc(ADMIN, "app_ch_complementar_mentions");
      expect(achados.map((a: any) => a.kind)).toContain("analise");
      await recusa(rpc(ALUNO, "app_ch_complementar_mentions"));
    } finally {
      await sql(`update public.question_analysis set trap = 'Não esperar o resultado do anti-HBs.' where id = $1`, [analise]);
    }
  });

  it("CORRIGIDO: texto de análise JÁ publicado que cita a apostila continua chegando ao aluno (não há filtro de saída)", async () => {
    // causa: app_question_commentary (9620:248-281) devolve trap/golden_rule/reasoning como estão; só fontes passam por ch_student_*
    await sql(`update public.question_analysis set trap = 'Segundo a apostila Sangue nos Olhos, cuidado.' where id = $1`, [analise]);
    try {
      expect(marcasEm(JSON.stringify(await rpc(ALUNO, "app_question_commentary", { p_question_id: QID, p_level: "full" })))).toEqual([]);
    } finally {
      await sql(`update public.question_analysis set trap = 'Não esperar o resultado do anti-HBs.' where id = $1`, [analise]);
    }
  });

  vazamento("VAZAMENTO: resposta antiga do Tutor (ou transcrição de voz) com o rótulo/nome da apostila volta ao aluno no histórico (app_tutor_session e tutor_messages)", async () => {
    // causa: app_tutor_session (20261003005600_tutor_nexus_conversa.sql:198) devolve m.content e m.meta->'sources' como foram gravados;
    // a transcrição da voz é gravada crua (server/tutor/realtime.ts:468-471, p_tutor: clean) mesmo com a violação cites_support_material
    await sql(`select public.ch_worker_tutor_append($1, $2, null, $3, $4::jsonb, '{}'::jsonb)`,
      [ALUNO, tutorId, "Como diz o Sangue nos Olhos, vacina e imunoglobulina.", JSON.stringify({ sources: [{ ref: "F2", label: `${COMP_TITLE} · p. ${COMP_PAGE}` }] })]);
    const s = await rpc(ALUNO, "app_tutor_session", { p_session_id: tutorId });
    const direto = await como(ALUNO, (q) => q(`select content, meta from public.tutor_messages where session_id = $1`, [tutorId]));
    expect(marcasEm(JSON.stringify(s)) .concat(marcasEm(JSON.stringify(direto)))).toEqual([]);
  });
});

describe("ataque: classe da fonte (gatilho, permissões, travas)", () => {
  it("só o administrador muda a classe: editora, revisor, aluno e visitante são recusados", async () => {
    for (const uid of [EDITORA, REVISOR, ALUNO, null]) {
      await recusa(rpc(uid, "app_ch_set_source_audience", { p_source_id: sComp, p_audience: "oficial" }));
    }
    expect((await sql(`select audience from public.ch_sources where id = $1`, [sComp]))[0].audience).toBe("complementar");
  });

  it("complementar nunca ganha nível A–D: update direto, função de nível e update que troca classe e nível juntos sem passar pelo administrador", async () => {
    expect(await recusa(sql(`update public.ch_sources set authority_level = 'A' where id = $1`, [sComp]))).toMatch(/complementar/i);
    expect(await recusa(rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: sComp, p_level: "B" }))).toMatch(/complementar/i);
    for (const uid of [EDITORA, REVISOR]) await recusa(rpc(uid, "app_ch_set_source_registry", { p_source_id: sComp, p_fields: { audience: "oficial", authority_level: "A" } }));
    expect((await sql(`select audience, authority_level from public.ch_sources where id = $1`, [sComp]))[0]).toEqual({ audience: "complementar", authority_level: "E" });
  });

  it("fonte nova cadastrada pela tela nasce oficial SEM nível (não chega ao aluno nem dá selo); ao receber nível E vira complementar", async () => {
    // app_ch_register_source (9610) não grava authority_level: a fonte nasce 'oficial' com nível nulo. Nível nulo não sai ao aluno
    // (todas as saídas exigem A-D), então o padrão 'oficial' não vaza; quando o administrador dá nível E, o gatilho a passa a complementar.
    const r = await grava<any>(ADMIN, "app_ch_register_source", { p_source: { title: "Apostila Alfa (teste)", organ: "Curso Alfa", kind: "final" } });
    const antes = (await sql(`select audience, authority_level from public.ch_sources where id = $1`, [r.id]))[0];
    expect(antes).toEqual({ audience: "oficial", authority_level: null });
    await grava(ADMIN, "app_ch_set_source_authority", { p_source_id: r.id, p_level: "E" });
    expect((await sql(`select audience, authority_level from public.ch_sources where id = $1`, [r.id]))[0]).toEqual({ audience: "complementar", authority_level: "E" });
  });

  it("CORRIGIDO: baixar uma fonte OFICIAL para nível E a transforma em complementar (lado seguro) e a troca fica registrada", async () => {
    const s = (await sql(`insert into public.ch_sources (title, organ, kind, authority_level) values ('Manual oficial qualquer (teste)', 'Ministério da Saúde', 'final', 'C') returning id`))[0].id;
    await grava(ADMIN, "app_ch_set_source_authority", { p_source_id: s, p_level: "E" });
    const r = (await sql(`select audience from public.ch_sources where id = $1`, [s]))[0];
    const log = (await sql(`select count(*)::int n from public.ch_audit where action = 'source.audience' and target = $1`, [s]))[0].n;
    console.log(`[APOIO-T] oficial C → E pela função de nível: classe = ${r.audience}; registros de classe = ${log}`);
    expect(r.audience).toBe("complementar"); // lado seguro
    expect(log).toBe(1); // e a troca fica registrada (gatilho), com o nível de antes
    const d = (await sql(`select details from public.ch_audit where action = 'source.audience' and target = $1`, [s]))[0].details;
    expect(d).toMatchObject({ from: "oficial", to: "complementar", level_before: "C", level_after: "E", auto: true });
    expect((await sql(`select count(*)::int n from public.admin_audit_log where action = 'source.audience' and target = $1`, [s]))[0].n).toBe(1);
  });
});

describe("ataque: ordem de colagem com outras frentes", () => {
  it("colar a 9610 de novo depois da 9620 não desfaz o filtro (nenhuma função do aluno é redefinida pela 9610)", async () => {
    const f9610 = fs.readFileSync(path.join(MIGRATIONS, "20261003009610_fontes_oficiais_ia.sql"), "utf8");
    for (const fn of ["app_podcast", "lesson_view", "guideline_update_view", "tutor_truth", "app_question_commentary", "practice_correction_view", "app_question_timeline"]) {
      expect(f9610.includes(`function public.${fn}(`), fn).toBe(false);
    }
    await db.exec(f9610);
    const c = await rpc(ALUNO, "app_question_commentary", { p_question_id: QID, p_level: "full" });
    expect(marcasEm(JSON.stringify(c))).toEqual([]);
  });

  /** Colar de novo uma migração ANTERIOR que redefine a mesma função do aluno (as duas dizem "pode ser colada duas vezes"). */
  async function recolar(arquivo: string, checa: () => Promise<unknown>) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, arquivo), "utf8"));
    try {
      expect(marcasEm(JSON.stringify(await checa()))).toEqual([]);
    } finally {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS, "20261003009620_fontes_complementares.sql"), "utf8"));
    }
  }
  /** Colar a 9593/9580 de novo desfaz o filtro: não dá para impedir (elas redefinem as funções com o mesmo nome). O que existe: o cabeçalho da 9620
   *  manda colar "até a última, na ordem", e app_ch_complementar_check() acusa o que perdeu o filtro. */
  async function recolarEAcusar(arquivo: string, funcao: string, checa: () => Promise<unknown>) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, arquivo), "utf8"));
    try {
      const c = await rpc(ADMIN, "app_ch_complementar_check");
      expect(c.ok).toBe(false);
      expect(c.faltando).toContain(funcao);
    } finally {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS, "20261003009620_fontes_complementares.sql"), "utf8"));
    }
    expect((await rpc(ADMIN, "app_ch_complementar_check")).ok).toBe(true);
    expect(marcasEm(JSON.stringify(await checa()))).toEqual([]);
  }
  it("COLAGEM: recolar a 9593 depois da 9620 desfaz o filtro do podcast, a conferência do administrador acusa, e colar a 9620 de novo corrige", async () => {
    await recolarEAcusar("20261003009593_podcasts_nome_da_fonte_marca.sql", "app_podcast", () => rpc(ALUNO, "app_podcast", { p_id: podcastId }));
  });
  it("COLAGEM: recolar a 9580 depois da 9620 desfaz o filtro da aula, a conferência acusa, e colar a 9620 de novo corrige", async () => {
    await recolarEAcusar("20261003009580_aulas_conferencia.sql", "lesson_materials_json", () => rpc(ALUNO, "app_lesson", { p_id: aulaId }));
  });
});
