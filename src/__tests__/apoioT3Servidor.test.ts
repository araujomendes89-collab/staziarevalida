// @vitest-environment node
/**
 * APOIO-T3 — teste ADVERSARIAL do lado do SERVIDOR para a regra do dono:
 *   o material "Sangue nos Olhos" (apostilas) é FONTE COMPLEMENTAR na biblioteca, mas NADA que o identifique chega ao ALUNO
 *   (título, órgão/autor, link, nome de arquivo, trecho, página, contagem). As fontes OFICIAIS continuam aparecendo.
 *
 * Ângulo deste arquivo: as ROTAS HTTP que o aluno alcança (/api/tutor texto, voz em tempo real e ferramentas; /api/lessons;
 * /api/podcasts; /api/content-hub; /api/admin-assistant) e o que o servidor devolve ou grava para o aluno reler depois.
 * Banco de desenvolvimento em memória com TODAS as migrações; IA, voz e depósito SIMULADOS (nada de rede nem IA real).
 *
 * Convenção: `it` = comportamento que tem de valer e vale; `it.fails` = VAZAMENTO demonstrado (o teste descreve o que DEVERIA
 * acontecer; ele falha hoje, e por isso `it.fails` passa). Quando o vazamento for corrigido, o `it.fails` passa a acusar e deve
 * virar `it`. Cada vazamento traz a causa (arquivo:linha) e a severidade:
 *   CRÍTICO = nome/arquivo/trecho da apostila chega ao aluno · IMPORTANTE = indício que revela a existência · MENOR.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb, type Storage } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { NO_EVALUATION, type TutorOutput } from "../../server/tutor/prompts";
import { createTutorRouter } from "../../server/tutor/router";
import { searchSources } from "../../server/tutor/engine";
import type { RealtimeConfig } from "../../server/tutor/realtime";
import { createLessonsRouter } from "../../server/lessons/router";
import { createPodcastsRouter } from "../../server/podcasts/router";
import { checkScript, type PodcastScript, type SourceChunk } from "../../server/podcasts/script";
import { createAdminAssistantRouter } from "../../server/adminAssistant/router";
import { createContentHubRouter } from "../../server/contentHub/router";
import { loadComplementarTerms, resetComplementarTermsCache } from "../../server/contentHub/complementarGuard";
import { lessonReferences } from "../../server/contentHub/pipeline";
import { lessonHtml } from "../../server/contentHub/render";
import { aceitarTermos } from "./helpers/aceites";

/**
 * Vazamento demonstrado: `it.fails` (passa enquanto o vazamento existir). Com APOIO_T3_MOSTRAR=1 vira `it` comum, para ver em que
 * linha e com que valor cada um falha.
 */
const vaza = process.env.APOIO_T3_MOSTRAR ? it : it.fails;

// ------------------------------------------------------------------ o mundo de teste
const COMP_TITLE = "Sangue nos Olhos — Clínica Médica";
const COMP_ORGAN = "Editora Sangue nos Olhos";
const COMP_URL = "https://apostila.exemplo/sno.pdf";
const COMP_FILE = "SNO-ClinicaMedica-2026.pdf";
const COMP_TRECHO = "FRASE-SECRETA-SNO";
const COMP_PAGE = 123;
const OFI_TITLE = "PCDT Hepatite B";
const OFI_ORGAN = "Ministério da Saúde";
const OFI_URL = "https://www.gov.br/saude/pcdt-hepatite-b";
/** Nada disto pode aparecer em resposta ao aluno. */
const MARCAS = ["Sangue nos Olhos", "Sangue", "apostila.exemplo", "sno.pdf", "SNO-ClinicaMedica", COMP_TRECHO];
const marcasEm = (x: unknown) => {
  const t = typeof x === "string" ? x : JSON.stringify(x ?? null);
  return MARCAS.filter((m) => t.toLowerCase().includes(m.toLowerCase()));
};

const P = "00000000-0000-4000-8000-";
const ADMIN = `${P}0000000000ad`;
const EDITOR = `${P}0000000000e1`;
const ALUNO = `${P}0000000000b1`;
const KEY = "sk-servidor-" + "x".repeat(40);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apoio-t3-"));
let dev: DevDatabase;
let db: ContentDb;
let server: Server;
let base: string;
const tk = { admin: "", editor: "", aluno: "" };
const ids = { sComp: "", sOfi: "", docComp: "", lesson: "", mOfi: "", mComp: "", mUrl: "", mFile: "", podcast: "", psFile: "", draft: "" };

const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const as = <T>(uid: string, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
  });
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await as(uid, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))))[0].r;
async function recusa(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e: any) {
    return String(e.message);
  }
  throw new Error("Era para recusar, mas passou.");
}

// ------------------------------------------------------------------ IA, voz e depósito simulados
const out = (text: string, over: Partial<TutorOutput> = {}): TutorOutput => ({ reply: text, grounding: "GENERAL", citations: [], evaluation: NO_EVALUATION, justification: "NONE", reveals_answer: false, suggested_replies: [], ...over });
let responder: (input: string) => TutorOutput = () => out("Por onde você começaria?");
const prompts: string[] = [];
const mockRespond = (req: any) => {
  if (req.schemaName === "staziamed_tutor_eval") return { ...NO_EVALUATION, error_type: "unknown", reasoning_quality: "low", recommended_action: "socratic_question" };
  prompts.push(String(req.input));
  return responder(String(req.input));
};
const fakeFetch = (async (url: string) => {
  if (String(url).endsWith("/realtime/client_secrets")) return new Response(JSON.stringify({ value: "ek_teste", expires_at: 1_900_000_000 }), { status: 200 });
  if (/\/realtime\/calls\/[^/]+\/hangup$/.test(String(url))) return new Response("", { status: 200 });
  return new Response("?", { status: 404 });
}) as typeof fetch;
const RT: RealtimeConfig = { ready: true, model: "gpt-realtime-2.1", pending: null, key: KEY, transcribeModel: null };

const store = new Map<string, Buffer>();
const storage: Storage = {
  async put(k, d) {
    store.set(k, d);
    return k;
  },
  async get(k) {
    const d = store.get(k);
    if (!d) throw new Error(`Arquivo não encontrado: ${k}`);
    return d;
  },
  async exists(k) {
    return store.has(k);
  },
  async signedUrl(k, s) {
    return `https://deposito.test/${k}?expira=${s}`;
  },
  async signedUpload(k) {
    return { path: k, token: "t" };
  },
} as Storage;

const call = async (method: string, p: string, token: string, body?: unknown) => {
  const r = await fetch(`${base}${p}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, headers: r.headers, body: type.includes("json") ? await r.json() : (await r.arrayBuffer()).byteLength };
};
const post = (p: string, token: string, body: unknown) => call("POST", p, token, body);
const get = (p: string, token: string) => call("GET", p, token);

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await sql(`insert into auth.users (id, email) values ($1, 'ad@t.dev'), ($2, 'ed@t.dev'), ($3, 'al@t.dev')`, [ADMIN, EDITOR, ALUNO]);
  await sql(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await sql(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await sql(`update public.subscriptions set plan = 'pro', status = 'active' where user_id = $1`, [ALUNO]);
  await aceitarTermos(dev.db, ALUNO);
  process.env.TUTOR_AI_PROVIDER = "mock";
  await rpc(ADMIN, "app_admin_tutor_save_config", { enabled: true, requires_pro: true }, "Tutor ligado para o teste adversarial.");

  // biblioteca: a apostila (nível E nasce complementar, com o documento de nome de arquivo) e a fonte oficial
  ids.docComp = (await sql(`insert into public.ch_documents (owner_id, name, sha256, storage_path, author) values ($1, $2, $3, 'documents/apostila-original.pdf', 'Dr. Fulano de Tal') returning id`, [ADMIN, COMP_FILE, "a".repeat(64)]))[0].id;
  store.set("documents/apostila-original.pdf", Buffer.from("%PDF-1.4 apostila"));
  ids.sComp = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level, document_id, authors) values ($1, $2, 'final', $3, '2026', 'E', $4, 'Dr. Fulano de Tal') returning id`, [COMP_TITLE, COMP_ORGAN, COMP_URL, ids.docComp]))[0].id;
  ids.sOfi = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level) values ($1, $2, 'final', $3, '2024', 'A') returning id`, [OFI_TITLE, OFI_ORGAN, OFI_URL]))[0].id;
  await sql(`insert into public.ch_source_passages (source_id, page, text) values ($1, 12, 'Hepatite B crônica: tratamento com tenofovir conforme o protocolo oficial.'), ($2, $3, $4)`,
    [ids.sOfi, ids.sComp, COMP_PAGE, `Hepatite B crônica: tratamento com tenofovir, macete da apostila ${COMP_TRECHO}.`]);

  // aula publicada com materiais: oficial, apostila pelo título, apostila pelo link e apostila pelo NOME DO ARQUIVO
  ids.lesson = (await sql(`insert into public.lessons (area, topic, title, published) values ('CLINICA_MEDICA', 'Hepatite B', 'Hepatite B na prova', true) returning id`))[0].id;
  const mat = async (title: string, extra: { storage_path?: string; url?: string }) =>
    (await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path, url, content_type) values ($1, 'other', $2, $3, $4, 'application/pdf') returning id`, [ids.lesson, title, extra.storage_path ?? null, extra.url ?? null]))[0].id;
  ids.mOfi = await mat("Resumo do PCDT Hepatite B", { storage_path: `lessons/${ids.lesson}/other-aaaaaaaaaaaaaaaa.pdf` });
  ids.mComp = await mat(COMP_TITLE, { storage_path: `lessons/${ids.lesson}/other-bbbbbbbbbbbbbbbb.pdf` });
  ids.mUrl = await mat("Leitura extra", { url: COMP_URL });
  ids.mFile = await mat(COMP_FILE, { storage_path: `lessons/${ids.lesson}/other-cccccccccccccccc.pdf` });
  for (const k of ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb", "cccccccccccccccc"]) store.set(`lessons/${ids.lesson}/other-${k}.pdf`, Buffer.from("%PDF-1.4 x"));

  // podcast publicado: fonte oficial (link), PDF da apostila com o nome do arquivo (não marcado), PDF marcado como complementar e outro PDF
  ids.podcast = (await sql(`insert into public.podcasts (title, topic, area, status) values ('Hepatite B em 8 minutos', 'Hepatite B', 'CLINICA_MEDICA', 'draft') returning id`))[0].id;
  const ps = async (kind: string, title: string, pos: number, url: string | null = null) =>
    (await sql(`insert into public.podcast_sources (podcast_id, kind, title, url, storage_path, position) values ($1, $2, $3, $4, $5, $6) returning id`, [ids.podcast, kind, title, url, kind === "pdf" ? `podcasts/${ids.podcast}/f${pos}.pdf` : null, pos]))[0].id;
  const s1 = await ps("link", OFI_TITLE, 1, OFI_URL);
  ids.psFile = await ps("pdf", COMP_FILE, 2);
  const s3 = await ps("pdf", "Resumo-neutro.pdf", 3);
  const s4 = await ps("pdf", "Outro-oficial.pdf", 4);
  await sql(`update public.podcast_sources set complementar = true where id = $1`, [s3]);
  const chunk = async (src: string, page: number, text: string) => (await sql(`insert into public.podcast_chunks (podcast_id, source_id, ord, page, text) values ($1, $2, 0, $3, $4) returning id`, [ids.podcast, src, page, text]))[0].id;
  const c1 = await chunk(s1, 12, "Tratamento com tenofovir.");
  const c2 = await chunk(ids.psFile, COMP_PAGE, `Macete ${COMP_TRECHO}.`);
  const c3 = await chunk(s3, 77, "Outro macete.");
  const c4 = await chunk(s4, 5, "Seguimento.");
  const script = { lines: [
    { speaker: "ANA", text: "Vamos falar de hepatite B.", sources: [c1] },
    { speaker: "BRUNO", text: "E o macete?", sources: [c2, c3] },
    { speaker: "ANA", text: "Como diz a Sangue nos Olhos, decore o tenofovir.", sources: [c4] },
  ] };
  await sql(`update public.podcasts set script = $2::jsonb, approved_at = now(), audio_path = $3, published_at = now(), status = 'published' where id = $1`, [ids.podcast, JSON.stringify(script), `podcasts/${ids.podcast}/audio.mp3`]);
  store.set(`podcasts/${ids.podcast}/audio.mp3`, Buffer.from("ID3"));
  ids.draft = (await sql(`insert into public.podcasts (title, status, audio_path) values ('Rascunho com áudio', 'draft', 'podcasts/rascunho.mp3') returning id`))[0].id;

  const app = express();
  app.use(express.json());
  app.use("/api/tutor", createTutorRouter({ db, mockRespond, realtime: RT, fetch: fakeFetch } as any));
  app.use("/api/lessons", createLessonsRouter({ db, storage }));
  app.use("/api/podcasts", createPodcastsRouter({ db, storage, lessons: storage }));
  app.use("/api/admin-assistant", createAdminAssistantRouter({ db } as any));
  app.use("/api/content-hub", createContentHubRouter({ db, storage, ai: { provider: null, status: { ready: false } } } as any));
  server = await new Promise((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  tk.admin = await dev.createSession(ADMIN);
  tk.editor = await dev.createSession(EDITOR);
  tk.aluno = await dev.createSession(ALUNO);
}, 300_000);

afterAll(async () => {
  await new Promise((r) => server?.close(r));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  resetComplementarTermsCache();
  responder = () => out("Por onde você começaria?");
  prompts.length = 0;
});

const sessaoLivre = async () => (await rpc(ALUNO, "app_tutor_start", "livre", "Hepatite B", null, null, null)).id as string;
const turno = (sid: string, text: string) => post("/api/tutor/turn", tk.aluno, { session_id: sid, action: "message", text });
const releitura = (sid: string) => rpc(ALUNO, "app_tutor_session", sid);

// =============================================================================================== 1. TUTOR POR TEXTO
describe("Tutor por texto (/api/tutor/turn) e a releitura da conversa (app_tutor_session)", () => {
  it("a fonte OFICIAL vai ao modelo e volta ao aluno no campo sources; a apostila nem entra no contexto (ch_worker_search_official_passages só A-D)", async () => {
    const sid = await sessaoLivre();
    responder = () => out("O PCDT traz o tratamento com tenofovir.", { grounding: "SOURCE" as any, citations: [{ ref: "F1", quote: "tratamento com tenofovir" }] });
    const r = await turno(sid, "Qual o tratamento da hepatite B crônica com tenofovir?");
    expect(r.status).toBe(200);
    expect(prompts[0]).toContain(OFI_TITLE);
    expect(marcasEm(prompts[0])).toEqual([]); // hoje a apostila não chega ao Tutor (seria permitido, mas não acontece)
    expect(r.body.message.sources).toEqual([expect.objectContaining({ ref: "F1", label: expect.stringContaining(OFI_TITLE) })]);
    expect(marcasEm(r.body)).toEqual([]);
    const s = await releitura(sid);
    expect(s.messages.at(-1).sources[0].label).toContain(OFI_TITLE);
    expect(marcasEm(s)).toEqual([]);
  });

  it("modelo que cita 'Sangue nos Olhos', o órgão e o arquivo nas duas tentativas: a resposta é trocada pela fixa, sem o nome, na hora e na releitura", async () => {
    const sid = await sessaoLivre();
    responder = () => out(`Segundo a ${COMP_TITLE} (${COMP_ORGAN}), arquivo ${COMP_FILE}, página ${COMP_PAGE}: ${COMP_TRECHO}.`);
    const r = await turno(sid, "Me explica hepatite B crônica");
    expect(r.status).toBe(200);
    expect(prompts).toHaveLength(2); // segunda tentativa com a correção
    expect(prompts[1]).toMatch(/correcao_obrigatoria/);
    expect(marcasEm(r.body)).toEqual([]);
    expect(r.body.message.sources).toEqual([]);
    expect(marcasEm(await releitura(sid))).toEqual([]);
    const meta = (await sql(`select meta from public.tutor_messages where session_id = $1 and role = 'tutor' order by id desc limit 1`, [sid]))[0].meta;
    expect(meta.violations).toContain("cites_support_material");
  });

  it("a mensagem de erro do Tutor ao aluno não traz nome de fonte (provedor falhando)", async () => {
    const sid = await sessaoLivre();
    responder = () => {
      throw new Error(`falha lendo ${COMP_FILE} de ${COMP_TITLE}`);
    };
    const r = await turno(sid, "hepatite B crônica");
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(marcasEm(r.body)).toEqual([]);
  });

  /**
   * VAZAMENTO T1 — CRÍTICO (quando o modelo escreve o nome). As "respostas sugeridas" (botões abaixo da fala) vão ao aluno sem
   * nenhuma conferência: safetyCheck só olha `out.reply` (server/tutor/safety.ts:208 e :237) e o motor copia
   * `out.suggested_replies` para a resposta e para o histórico (server/tutor/engine.ts:452 `suggested: ... out!.suggested_replies`;
   * app_tutor_session devolve meta->'suggested', 20261003005600_tutor_nexus_conversa.sql).
   */
  it("CORRIGIDO T1: resposta limpa com SUGESTÕES que citam a apostila — as sugestões não chegam ao aluno", async () => {
    const sid = await sessaoLivre();
    responder = () => out("Pensa no quadro: o que muda a conduta?", { suggested_replies: ["O que a Sangue nos Olhos diz disso?", `Abre o ${COMP_FILE} na página ${COMP_PAGE}`] });
    const r = await turno(sid, "hepatite B crônica");
    expect(r.status).toBe(200);
    expect(marcasEm(r.body.message.suggested)).toEqual([]); // FALHA AQUI: as duas sugestões chegam como vieram do modelo
    expect(marcasEm(await releitura(sid))).toEqual([]);
  });

  /**
   * VAZAMENTO T2 — MENOR no Tutor (o modelo do Tutor não recebe o nome do arquivo), mas é a mesma causa do P3 (podcast, CRÍTICO):
   * os termos conferidos são só título e órgão das fontes complementares e a palavra "apostila"
   * (ch_worker_complementar_terms, 20261003009620_fontes_complementares.sql:120-129; complementarGuard.ts:33-41). Nome do arquivo
   * (ch_documents.name), autor (ch_sources.authors) e página não são termos.
   */
  it("CORRIGIDO T2: resposta que cita só o NOME DO ARQUIVO, o autor e a página da apostila é barrada", async () => {
    const sid = await sessaoLivre();
    responder = () => out(`Isso está no ${COMP_FILE}, do Dr. Fulano de Tal, página ${COMP_PAGE}. Pensa no quadro.`);
    const r = await turno(sid, "hepatite B crônica");
    expect(marcasEm(r.body)).toEqual([]); // FALHA AQUI: a resposta passa inteira
  });
});

// =============================================================================================== 2. TUTOR POR VOZ
describe("Tutor por voz em tempo real (/api/tutor/voice/*): ferramentas, conferência do que foi dito e o histórico", () => {
  let sid = "";
  let call = "";
  beforeAll(async () => {
    sid = (await rpc(ALUNO, "app_tutor_start", "questao", null, null, null, null)).id;
    const r = await post("/api/tutor/voice/start", tk.aluno, { session_id: sid, force: true });
    expect(r.status).toBe(200);
    call = r.body.voice_call_id;
  });
  const tool = (name: string, args: unknown = {}) => post("/api/tutor/voice/tool", tk.aluno, { voice_call_id: call, name, arguments: JSON.stringify(args) });
  const fala = (text: string) => post("/api/tutor/voice/transcript", tk.aluno, { voice_call_id: call, role: "tutor", text });

  it("get_topic_context (a saída vai ao NAVEGADOR do aluno): traz o PCDT, nunca a apostila nem o trecho dela", async () => {
    const r = await tool("get_topic_context", { topic: "hepatite B crônica tenofovir" });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body.output)).toContain(OFI_TITLE);
    expect(marcasEm(r.body)).toEqual([]);
  });

  it("get_question_context depois de responder: a lista de fontes da questão sai sem a apostila e com a oficial", async () => {
    const s = await releitura(sid);
    const qid = s.question.id;
    await sql(`update public.questions set sources = $2::jsonb where id = $1`, [qid, JSON.stringify([{ title: COMP_TITLE, organization: COMP_ORGAN, url: COMP_URL }, { title: OFI_TITLE, organization: OFI_ORGAN }])]);
    const sub = await tool("submit_answer", { option: "A" });
    expect(sub.status).toBe(200);
    const r = await tool("get_question_context");
    expect(JSON.stringify(r.body.output.question.sources)).toContain(OFI_TITLE);
    expect(marcasEm(r.body.output.question.sources)).toEqual([]);
  });

  /**
   * VAZAMENTO V1 — IMPORTANTE (precisa de texto já contaminado na questão; a análise publicada, a explicação da alternativa e o
   * "o que mudou" do cartão vêm do banco sem filtro de texto). tutor_truth (20261003009620:322-347) filtra só as LISTAS de fontes
   * (ch_student_sources); explicação/análise/what_changed saem cruas, e a ferramenta devolve tudo ao navegador
   * (server/tutor/tools.ts:121-122 → server/tutor/router.ts:309).
   */
  it("CORRIGIDO V1: explicação da alternativa que cita a apostila não sai na saída da ferramenta (que o navegador do aluno recebe)", async () => {
    const qid = (await releitura(sid)).question.id;
    await sql(`update public.questions set options = (select jsonb_agg(o || jsonb_build_object('explanation', 'Conforme a Sangue nos Olhos p. 123, é a correta.') order by o ->> 'id') from jsonb_array_elements(options) o) where id = $1`, [qid]);
    const r = await tool("get_question_context");
    expect(r.status).toBe(200);
    expect(marcasEm(r.body)).toEqual([]); // FALHA AQUI: a explicação chega inteira
  });

  it("a fala do professor que cita a apostila é conferida DEPOIS e o servidor devolve uma correção (sem o nome dentro da correção)", async () => {
    const r = await fala(`Como diz a apostila ${COMP_TITLE}, página ${COMP_PAGE}, decore o tenofovir.`);
    expect(r.status).toBe(200);
    expect(r.body.correction).toBeTruthy();
    expect(marcasEm(r.body)).toEqual([]);
    const saved = (await sql(`select meta from public.tutor_messages where session_id = $1 and role = 'tutor' order by id desc limit 1`, [sid]))[0].meta;
    expect(saved.violations).toContain("cites_support_material");
  });

  /**
   * VAZAMENTO V2 — CRÍTICO. O que a voz disse é GRAVADO como veio, mesmo com a violação "cites_support_material"
   * (server/tutor/realtime.ts:469-472: `p_tutor: clean` sempre; a violação vai só para meta). app_tutor_session devolve
   * `m.content` cru (20261003005600_tutor_nexus_conversa.sql, campo messages) e o aluno relê o nome da apostila na conversa
   * (e o "Ouvir" da mensagem — /api/tutor/speech, ch_worker_tutor_speech — fala de novo o texto gravado).
   */
  it("CORRIGIDO V2: a fala barrada não fica gravada com o nome para o aluno reler", async () => {
    await fala(`Segundo a ${COMP_TITLE}, ${COMP_ORGAN}, isso cai sempre.`);
    const s = await releitura(sid);
    expect(marcasEm(s.messages)).toEqual([]); // FALHA AQUI: a fala aparece inteira na releitura
  });

  /**
   * VAZAMENTO V3 — MENOR. A correção devolvida à voz não diz O QUE retirar quando o problema é citar a apostila: só o cabeçalho
   * genérico (server/tutor/realtime.ts:476-484 não tem linha para "cites_support_material"), então a voz não sabe que deve
   * deixar de citar o material e tende a repetir.
   */
  it("CORRIGIDO V3: a correção da voz pede para não citar o material", async () => {
    const r = await fala("Isso está na Sangue nos Olhos, viu?");
    expect(r.body.correction).toMatch(/material|apostila|fonte/i); // FALHA AQUI: só "CORREÇÃO OBRIGATÓRIA, diga já..."
  });

  /**
   * VAZAMENTO V4 — IMPORTANTE (CRÍTICO se o modelo usar). Ferramentas que gravam TEXTO LIVRE do modelo sem conferência:
   * save_tutor_memory (concept/note → tutor_memories, que o aluno LÊ pela política "memórias do tutor: ler as próprias",
   * 20261003004400_tutor_voice_mode.sql:63) e register_learning_event (knowledge_gap → student_error_events, política
   * "erros do aluno: ler os próprios", 20261003003500_tutor_v2.sql:151). Causa: server/tutor/tools.ts:170-180 sem
   * mentionsSupportMaterial. As memórias também voltam ao modelo nas próximas ligações (realtime.ts sessionContext).
   */
  it("CORRIGIDO V4: memória e evento de aprendizagem gravados pela voz não guardam o nome da apostila para o aluno ler", async () => {
    await tool("save_tutor_memory", { kind: "fact", concept: "Sangue nos Olhos", note: `Estuda pelo ${COMP_FILE}` });
    await tool("register_learning_event", { kind: "error", error_type: "knowledge_gap", knowledge_gap: "revisar a Sangue nos Olhos p. 123" });
    const mem = await as(ALUNO, (q) => q(`select concept, note from public.tutor_memories`));
    const err = await as(ALUNO, (q) => q(`select knowledge_gap from public.student_error_events`));
    expect(marcasEm([mem, err])).toEqual([]); // FALHA AQUI: o aluno lê as duas gravações
  });

  it("a ligação de outro usuário e ferramenta fora da lista continuam recusadas", async () => {
    expect((await post("/api/tutor/voice/tool", tk.aluno, { voice_call_id: call, name: "ch_worker_complementar_terms", arguments: "{}" })).status).toBe(400);
    expect((await post("/api/tutor/voice/tool", tk.editor, { voice_call_id: call, name: "get_topic_context", arguments: "{}" })).status).toBe(404);
  });
});

describe("searchSources (dupla checagem do servidor)", () => {
  it("se o banco devolvesse um trecho de fonte complementar, o servidor tira pelo nome; o oficial fica", async () => {
    const fake = {
      service: async (fn: string) =>
        fn === "ch_worker_complementar_terms"
          ? [COMP_TITLE, COMP_ORGAN]
          : [
              { source: COMP_TITLE, organ: COMP_ORGAN, text: COMP_TRECHO, page: COMP_PAGE },
              { source: OFI_TITLE, organ: OFI_ORGAN, text: "oficial", page: 12 },
            ],
    } as any;
    const r = await searchSources({ db: fake }, "hepatite");
    expect(r.map((p) => p.source)).toEqual([OFI_TITLE]);
  });
});

// =============================================================================================== 3. AULAS
describe("Aulas (/api/lessons/materials/:id/link e /file)", () => {
  it("material oficial: o aluno recebe o link assinado (caminho aleatório, sem nome de arquivo) e o /file com nome neutro", async () => {
    const r = await get(`/api/lessons/materials/${ids.mOfi}/link`, tk.aluno);
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/^https:\/\/deposito\.test\/lessons\/.+\/other-a+\.pdf/);
    const f = await get(`/api/lessons/materials/${ids.mOfi}/file`, tk.aluno);
    expect(f.status).toBe(200);
    expect(decodeURIComponent(f.headers.get("content-disposition") ?? "")).not.toContain("PCDT");
  });

  it("material com o TÍTULO da apostila e material com o LINK da apostila: o aluno recebe 404 sem nome; a equipe abre", async () => {
    for (const id of [ids.mComp, ids.mUrl]) {
      const r = await get(`/api/lessons/materials/${id}/link`, tk.aluno);
      expect(r.status).toBe(404);
      expect(marcasEm(r.body)).toEqual([]);
      expect((await get(`/api/lessons/materials/${id}/file`, tk.aluno)).status).toBe(404);
      expect((await get(`/api/lessons/materials/${id}/link`, tk.editor)).status).toBe(200);
    }
  });

  /**
   * VAZAMENTO L1 — CRÍTICO. O PDF da apostila anexado à aula com o NOME DO ARQUIVO como título (é o padrão: o envio pelo
   * servidor usa X-File-Name como título — server/lessons/router.ts:136 — e a confirmação usa o título digitado) não é
   * reconhecido: a marca hidden_from_student compara só título/órgão/link da biblioteca (ch_complementar_hit,
   * 20261003009620:70-83), e não o nome do arquivo do documento da fonte (ch_documents.name) nem o sha256. O aluno baixa a
   * apostila inteira por /api/lessons/materials/:id/link (router.ts:153-160) e /file.
   */
  it("CORRIGIDO L1: material com o NOME DO ARQUIVO da apostila (que a biblioteca conhece) não é entregue ao aluno", async () => {
    const r = await get(`/api/lessons/materials/${ids.mFile}/link`, tk.aluno);
    expect(r.status).toBe(404); // FALHA AQUI: 200 com o link assinado do PDF da apostila
  });

  it("rotas de envio de material são só da equipe (o aluno recebe 403)", async () => {
    expect((await post(`/api/lessons/${ids.lesson}/upload`, tk.aluno, { kind: "slides", content_type: "application/pdf", size_bytes: 10 })).status).toBe(403);
  });
});

// =============================================================================================== 4. PODCASTS
describe("Podcasts (/api/podcasts) e o episódio que o aluno lê (app_podcast)", () => {
  it("link do áudio: o aluno recebe só o endereço do MP3 do episódio publicado; id de FONTE ou rascunho dão 404 sem nome", async () => {
    const r = await get(`/api/podcasts/${ids.podcast}/audio/link`, tk.aluno);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body)).toEqual(["url"]);
    expect(r.body.url).toContain("audio.mp3");
    for (const id of [ids.psFile, ids.draft, ids.sComp, ids.docComp]) {
      const x = await get(`/api/podcasts/${id}/audio/link`, tk.aluno);
      expect(x.status).toBe(404);
      expect(marcasEm(x.body)).toEqual([]);
      expect((await get(`/api/podcasts/${id}/audio/file`, tk.aluno)).status).toBe(404);
    }
  });

  it("rotas de fonte, roteiro e checagem são só da equipe: o aluno recebe 403 sem nome de fonte", async () => {
    const tries = [
      await post(`/api/podcasts/${ids.podcast}/sources/text`, tk.aluno, { title: "x", text: "y".repeat(100) }),
      await get(`/api/podcasts/${ids.podcast}/script/check`, tk.aluno),
      await call("PATCH", `/api/podcasts/${ids.podcast}/sources/${ids.psFile}`, tk.aluno, { title: "x" }),
      await call("DELETE", `/api/podcasts/${ids.podcast}/sources/${ids.psFile}`, tk.aluno),
      await get(`/api/podcasts/providers`, tk.aluno),
    ];
    for (const t of tries) {
      expect(t.status).toBe(403);
      expect(marcasEm(t.body)).toEqual([]);
    }
  });

  it("fonte marcada como complementar some e a numeração 'Documento N' fica sem buraco; a oficial continua", async () => {
    const ep = await rpc(ALUNO, "app_podcast", ids.podcast);
    const titles = ep.sources.map((s: any) => s.title);
    expect(titles[0]).toBe(OFI_TITLE);
    expect(titles).not.toContain("Resumo-neutro.pdf");
    expect(ep.sources.flatMap((s: any) => s.pages ?? [])).not.toContain(77);
    const docs = titles.filter((t: string) => /^Documento \d+$/.test(t)).map((t: string) => Number(t.split(" ")[1]));
    expect(docs).toEqual(docs.map((_: number, i: number) => i + 2)); // 2, 3… sem pular
  });

  /**
   * VAZAMENTO P1 — IMPORTANTE. O PDF da apostila enviado ao podcast com o nome do arquivo e não marcado à mão aparece ao aluno
   * como "Documento 2" COM A PÁGINA 123 da apostila (e conta na lista). Causa: app_podcast (20261003009620:380-398) usa
   * ch_complementar_hit(título, link), que não conhece o nome do arquivo da biblioteca (ch_documents.name) nem o sha256.
   */
  it("CORRIGIDO P1: PDF da apostila (nome de arquivo conhecido pela biblioteca) não aparece ao aluno nem com a página", async () => {
    const ep = await rpc(ALUNO, "app_podcast", ids.podcast);
    expect(ep.sources.flatMap((s: any) => s.pages ?? [])).not.toContain(COMP_PAGE); // FALHA AQUI: pages [123]
  });

  /**
   * VAZAMENTO P2 — CRÍTICO (com o roteiro aprovado por alguém da equipe). A transcrição do episódio publicado sai ao aluno
   * CRUA (app_podcast, 20261003009620:383 `'lines', ... l ->> 'text'`), e nada impede aprovar/publicar um roteiro com o aviso
   * "cites_material": app_admin_podcast_approve (20261003004700_podcasts.sql) não olha os avisos e app_podcast não filtra o
   * texto. O mesmo texto vira o MP3 que o aluno ouve.
   */
  it("CORRIGIDO P2: a transcrição do episódio publicado não traz o nome da apostila", async () => {
    const ep = await rpc(ALUNO, "app_podcast", ids.podcast);
    expect(marcasEm(ep.lines)).toEqual([]); // FALHA AQUI: "Como diz a Sangue nos Olhos, decore o tenofovir."
  });

  /**
   * VAZAMENTO P3 — CRÍTICO. A IA do roteiro RECEBE o nome do arquivo e a página de cada trecho
   * (server/podcasts/script.ts:97 `(Documento N – <título da fonte>, página X)`, e o título de um PDF é o nome do arquivo), mas a
   * conferência só conhece título/órgão da biblioteca e "apostila" (router.ts:381 loadComplementarTerms; complementarGuard.ts:33).
   * Fala que cita "SNO-ClinicaMedica-2026.pdf, página 123" ou a fonte do episódio marcada como complementar passa SEM aviso,
   * vai para aprovação limpa e chega ao aluno (texto e áudio).
   */
  it("CORRIGIDO P3: roteiro que cita o nome do arquivo e a página da apostila recebe o aviso cites_material", async () => {
    const terms = await loadComplementarTerms(db);
    const chunks = new Map<number, SourceChunk>([[1, { id: 1, source: COMP_FILE, doc: 2, page: COMP_PAGE, text: "Macete." } as SourceChunk]]);
    const script: PodcastScript = { lines: [{ speaker: "ANA", text: `Lá no ${COMP_FILE}, página ${COMP_PAGE}, tem o macete.`, style: "", sources: [1] }], missing: [] };
    expect(checkScript(script, chunks, undefined, terms).map((w) => w.kind)).toContain("cites_material"); // FALHA AQUI: nenhum aviso
  });
});

// =============================================================================================== 5. CENTRAL DE CONTEÚDO
describe("Central de Conteúdo (/api/content-hub) e o material renderizado", () => {
  it("o PDF original da apostila no depósito (documento da fonte): aluno e editor sem acesso ao documento recebem recusa sem nome; o administrador abre", async () => {
    for (const t of [tk.aluno]) {
      for (const p of [`/api/content-hub/documents/${ids.docComp}/link`, `/api/content-hub/documents/${ids.docComp}/file`]) {
        const r = await get(p, t);
        expect([403, 404]).toContain(r.status);
        expect(marcasEm(r.body)).toEqual([]);
      }
    }
    expect((await get(`/api/content-hub/documents/${ids.docComp}/link`, tk.admin)).status).toBe(200);
  });

  it("busca na biblioteca (/search, que devolve a apostila para a equipe): o aluno recebe 403", async () => {
    const r = await post(`/api/content-hub/search`, tk.aluno, { query: "hepatite" });
    expect(r.status).toBe(403);
    expect(marcasEm(r.body)).toEqual([]);
  });

  /**
   * VAZAMENTO R1 — CRÍTICO. O material "Aula StaziaMed" renderizado (PDF/HTML) tem a seção "Referências" montada de TODAS as
   * evidências "compatible" da afirmação, sem olhar a classe da fonte: ch_worker_claims_by_ids
   * (20261003001500_content_hub_worker.sql:487-497) devolve a apostila (título, órgão, link, página) e lessonReferences
   * (server/contentHub/pipeline.ts:914-924) → referenceLine/lessonHtml (server/contentHub/render.ts:93-103) a imprimem. Pelo desenho
   * do construtor a complementar CONTA como evidência ligada pela equipe/IA, e a afirmação com evidência oficial + apostila
   * é publicável. O aluno baixa o arquivo publicado por GET /api/content-hub/renders/:id (app_ch_render libera render corrente de
   * publicação ativa a qualquer usuário logado, 20261003001500_content_hub_worker.sql).
   */
  it("CORRIGIDO R1: as Referências do material renderizado não citam a apostila (só a oficial)", async () => {
    const claim = (await sql(`insert into public.ch_claims (statement) values ('Tenofovir trata hepatite B crônica.') returning id`))[0].id;
    for (const [src, page] of [[ids.sOfi, 12], [ids.sComp, COMP_PAGE]] as const) {
      await sql(`insert into public.ch_evidence (claim_id, source_id, section, page, source_version, quote, verdict, checked_by) values ($1, $2, 'Tratamento', $3, '1', $4, 'compatible', $5)`, [claim, src, page, src === ids.sComp ? COMP_TRECHO : "tenofovir", ADMIN]);
    }
    const claims = await db.service<any[]>("ch_worker_claims_by_ids", { p_ids: [claim] });
    const refs = lessonReferences(claims);
    const html = lessonHtml({ title: "Hepatite B", sections: [], references: refs }, { title: "Hepatite B", version: 1, revisedAt: "2026-10-11", contentHash: "x" }, { version: "1", logo: null, fontFaces: "", pending: [] });
    expect(html).toContain(OFI_TITLE);
    expect(marcasEm(html)).toEqual([]); // FALHA AQUI: "Sangue nos Olhos — Clínica Médica · Editora Sangue nos Olhos · ... · p. 123 · https://apostila.exemplo/sno.pdf"
  });
});

// =============================================================================================== 6. PERMISSÕES
describe("Permissões: rotas e funções da equipe recusam o aluno (e o editor onde é só administrador)", () => {
  it("/api/admin-assistant: aluno recebe 403 no status e na execução", async () => {
    const s = await get(`/api/admin-assistant/status?tab=questoes`, tk.aluno);
    expect(s.status).toBe(403);
    const r = await post(`/api/admin-assistant/run`, tk.aluno, { tab: "questoes", mode: "preencher", form: {} });
    expect(r.status).toBe(403);
    expect(marcasEm([s.body, r.body])).toEqual([]);
  });

  it("sem login: 401 em todas as rotas do aluno", async () => {
    for (const p of ["/api/tutor/status", `/api/lessons/materials/${ids.mOfi}/link`, `/api/podcasts/${ids.podcast}/audio/link`, "/api/admin-assistant/status?tab=questoes", `/api/content-hub/documents/${ids.docComp}/link`]) {
      expect((await call("GET", p, "token-invalido")).status).toBe(401);
    }
  });

  it("app_ch_set_source_audience só administrador; aluno e editor recusados; leitura das classes e marcação de podcast só equipe", async () => {
    const outra = (await sql(`insert into public.ch_sources (title, organ, kind, authority_level) values ('Fonte para trocar a classe', 'Órgão X', 'final', 'B') returning id`))[0].id;
    expect(await recusa(rpc(ALUNO, "app_ch_set_source_audience", outra, "complementar", "teste"))).toMatch(/administrador|restrit|permiss/i);
    expect(await recusa(rpc(EDITOR, "app_ch_set_source_audience", outra, "complementar", "teste"))).toMatch(/administrador|restrit|permiss/i);
    expect((await sql(`select audience from public.ch_sources where id = $1`, [outra]))[0].audience).toBe("oficial");
    await rpc(ADMIN, "app_ch_set_source_audience", outra, "complementar", "teste adversarial");
    expect((await sql(`select audience, authority_level from public.ch_sources where id = $1`, [outra]))[0]).toEqual({ audience: "complementar", authority_level: "E" });
    expect(await recusa(rpc(ALUNO, "app_ch_source_audiences"))).toBeTruthy();
    expect(await recusa(rpc(ALUNO, "app_admin_podcast_source_complementar", ids.psFile, true))).toBeTruthy();
    // as funções internas não servem de "oráculo" para o aluno descobrir títulos de apostila
    for (const q of [`select public.ch_worker_complementar_terms()`, `select public.ch_complementar_hit('Sangue nos Olhos', null)`, `select public.ch_student_text('x', null)`]) {
      expect(await recusa(as(ALUNO, (x) => x(q)))).toMatch(/permission|permissão/i);
    }
  });
});
