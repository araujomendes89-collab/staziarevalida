// @vitest-environment node
/**
 * Fontes complementares, rodada de correções (C): a lista de termos das fontes complementares indisponível.
 *  - loadComplementarTerms nunca guarda falha nem resposta inválida no cache; sem lista conhecida LANÇA ComplementarTermsUnavailable (503);
 *    dentro dos 60 s vale o cache; depois disso a falha tenta de novo uma vez e, se continuar, lança (nunca usa lista vencida, nem vazia).
 *  - Cada chamador age do lado seguro: Tutor (texto, voz, ferramentas), roteiro de podcast, assistente de aula, análise e reanálise
 *    de questões. Banco normal: tudo como antes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { createTutorRouter } from "../../server/tutor/router";
import { voiceTranscript } from "../../server/tutor/realtime";
import { NO_EVALUATION, type TutorOutput } from "../../server/tutor/prompts";
import { ComplementarTermsUnavailable, loadComplementarTerms, resetComplementarTermsCache, TERMS_UNAVAILABLE_MESSAGE } from "../../server/contentHub/complementarGuard";
import { runQuestionAnalysis } from "../../server/contentHub/questionAnalysis";
import { runQuestionReanalysis } from "../../server/contentHub/questionReanalysis";
import { createLessonsRouter } from "../../server/lessons/router";
import { createPodcastsRouter } from "../../server/podcasts/router";
import { aceitarTermos } from "./helpers/aceites";

const TITULO = "Livro Delta de Clínica Médica 2026";

/** Banco falso só para a lista: devolve o que `resposta` mandar e conta as chamadas. */
function listaFalsa(resposta: () => unknown) {
  const f = { chamadas: 0, logs: [] as string[] };
  const db = {
    service: async (fn: string) => {
      if (fn !== "ch_worker_complementar_terms") throw new Error(`função inesperada: ${fn}`);
      f.chamadas++;
      return resposta();
    },
  };
  return { db, f, log: (m: string) => f.logs.push(m) };
}

describe("loadComplementarTerms: nunca finge que a biblioteca está vazia", () => {
  beforeEach(() => resetComplementarTermsCache());

  it("banco normal: devolve os termos e guarda por 60 s (como antes)", async () => {
    const { db, f } = listaFalsa(() => [TITULO, "Editora Delta de Medicina"]);
    expect(await loadComplementarTerms(db as any, 1000)).toEqual([TITULO, "Editora Delta de Medicina"]);
    expect(await loadComplementarTerms(db as any, 30_000)).toEqual([TITULO, "Editora Delta de Medicina"]);
    expect(f.chamadas).toBe(1);
    await loadComplementarTerms(db as any, 62_000);
    expect(f.chamadas).toBe(2);
  });

  it("biblioteca sem nenhuma fonte complementar: lista vazia VÁLIDA (é guardada)", async () => {
    const { db, f } = listaFalsa(() => []);
    expect(await loadComplementarTerms(db as any, 1000)).toEqual([]);
    expect(await loadComplementarTerms(db as any, 2000)).toEqual([]);
    expect(f.chamadas).toBe(1);
  });

  it("sem banco (desenvolvimento sem biblioteca): sem termos, sem erro", async () => {
    expect(await loadComplementarTerms(null)).toEqual([]);
  });

  it("falha do banco e nenhuma lista anterior: LANÇA erro 503 em português e avisa no log", async () => {
    const { db, log, f } = listaFalsa(() => {
      throw new Error("conexão recusada");
    });
    const erro = await loadComplementarTerms(db as any, 1000, log).catch((e) => e);
    expect(erro).toBeInstanceOf(ComplementarTermsUnavailable);
    expect(erro.status).toBe(503);
    expect(erro.message).toBe(TERMS_UNAVAILABLE_MESSAGE);
    expect(f.logs.join("\n")).toMatch(/lista de termos indisponível/);
    expect(f.logs.join("\n")).toMatch(/conexão recusada/);
  });

  it.each([[null], [undefined], [{}], ["texto"], [42], [{ erro: "x" }]])("resposta que não é lista (%j): lança e NÃO é guardada no cache", async (invalida) => {
    let resposta: unknown = invalida;
    const { db, log, f } = listaFalsa(() => resposta);
    await expect(loadComplementarTerms(db as any, 1000, log)).rejects.toBeInstanceOf(ComplementarTermsUnavailable);
    // o banco volta ao normal logo em seguida (dentro dos 60 s): a próxima chamada pergunta de novo e recebe a lista boa
    resposta = [TITULO];
    expect(await loadComplementarTerms(db as any, 5000, log)).toEqual([TITULO]);
    expect(f.chamadas).toBe(3); // 2 tentativas que falharam (nada guardado) + a seguinte, que pergunta de novo
  });

  it("falha DENTRO dos 60 s: continua usando a lista em cache (nem pergunta ao banco)", async () => {
    let falhar = false;
    const { db, log, f } = listaFalsa(() => {
      if (falhar) throw new Error("banco fora do ar");
      return [TITULO];
    });
    await loadComplementarTerms(db as any, 0, log);
    falhar = true;
    expect(await loadComplementarTerms(db as any, 59_000, log)).toEqual([TITULO]);
    expect(f.chamadas).toBe(1);
  });

  it("falha DEPOIS dos 60 s, nas duas tentativas: LANÇA (não usa lista vencida), com aviso em português no log", async () => {
    let falhar = false;
    const { db, log, f } = listaFalsa(() => {
      if (falhar) throw new Error("banco fora do ar");
      return [TITULO];
    });
    await loadComplementarTerms(db as any, 0, log);
    falhar = true;
    const antes = f.chamadas;
    const erro = await loadComplementarTerms(db as any, 61_000, log).catch((e) => e);
    expect(erro).toBeInstanceOf(ComplementarTermsUnavailable);
    expect(f.chamadas - antes).toBe(2); // pergunta e tenta de novo uma vez
    expect(f.logs.join("\n")).toMatch(/lista vencida não é usada|conferência foi suspensa/);
  });

  it("lista VAZIA em cache + falha depois dos 60 s = indisponível (a equipe pode ter cadastrado uma fonte nesse tempo)", async () => {
    let falhar = false;
    const { db, log } = listaFalsa(() => {
      if (falhar) throw new Error("banco fora do ar");
      return [];
    });
    expect(await loadComplementarTerms(db as any, 0, log)).toEqual([]);
    falhar = true;
    expect(await loadComplementarTerms(db as any, 30_000, log)).toEqual([]); // dentro do prazo: lista vazia em cache vale
    await expect(loadComplementarTerms(db as any, 90_000, log)).rejects.toBeInstanceOf(ComplementarTermsUnavailable);
    await expect(loadComplementarTerms(db as any, 7 * 3600_000, log)).rejects.toBeInstanceOf(ComplementarTermsUnavailable);
  });

  it("depois dos 60 s a primeira tentativa falha e a segunda dá certo: devolve a lista NOVA e a guarda", async () => {
    let n = 0;
    let atual: string[] = [];
    const { db, log, f } = listaFalsa(() => {
      n++;
      if (n === 2) throw new Error("falha passageira");
      return atual;
    });
    expect(await loadComplementarTerms(db as any, 0, log)).toEqual([]); // chamada 1
    atual = [TITULO]; // a equipe cadastrou a fonte
    expect(await loadComplementarTerms(db as any, 61_000, log)).toEqual([TITULO]); // chamada 2 falha, chamada 3 traz a lista nova
    expect(f.chamadas).toBe(3);
    expect(await loadComplementarTerms(db as any, 70_000, log)).toEqual([TITULO]); // guardada
    expect(f.chamadas).toBe(3);
  });

  it("resposta inválida depois dos 60 s também é tentada de novo uma vez e, se continuar, lança", async () => {
    let boa = true;
    const { db, log, f } = listaFalsa(() => (boa ? [TITULO] : { erro: "x" }));
    await loadComplementarTerms(db as any, 0, log);
    boa = false;
    const antes = f.chamadas;
    await expect(loadComplementarTerms(db as any, 61_000, log)).rejects.toBeInstanceOf(ComplementarTermsUnavailable);
    expect(f.chamadas - antes).toBe(2);
  });
});

// =====================================================================================================================
// chamadores, com o banco real e a lista falhando de propósito
// =====================================================================================================================
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rodada2-termos-"));
const ADMIN = "00000000-0000-4000-8000-0000000000a8";
const EDITOR = "00000000-0000-4000-8000-0000000000e8";
const ALUNA = "00000000-0000-4000-8000-0000000000c8";
let dev: DevDatabase;
let real: ContentDb;
let listaFora = false;
const logs: string[] = [];
const dbComLista = (): ContentDb => ({
  ...real,
  async service<T>(fn: string, args: Record<string, unknown> = {}) {
    if (fn === "ch_worker_complementar_terms" && listaFora) throw new Error("banco indisponível (teste)");
    return real.service<T>(fn, args);
  },
});
const reply = (text: string): TutorOutput => ({ reply: text, grounding: "GENERAL", citations: [], evaluation: NO_EVALUATION, justification: "NONE", reveals_answer: false, suggested_replies: [] });
const servers: Server[] = [];
const listen = (mount: string, router: express.Router) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json({ limit: "10mb" }));
    app.use(mount, router);
    const srv = app.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(srv.address() as any).port}${mount}`));
    servers.push(srv);
  });
const http = async (url: string, token: string, body?: unknown, method = body === undefined ? "GET" : "POST") => {
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
};
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const sqlAs = (uid: string, q: string, p: unknown[] = []) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(q, p)).rows;
  });
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await sqlAs(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" && !Array.isArray(a) ? JSON.stringify(a) : a))))[0].r;

let proxima: (input: string) => TutorOutput = () => reply("Oi.");
const deps: any = { mockRespond: (req: any) => proxima(String(req.input ?? "")), fetch: (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch };
let tutor: string, lessons: string, podcasts: string;
let tAluna: string, tEditor: string;
let sessao: string, podcastId: string;

beforeAll(async () => {
  process.env.TUTOR_SETTINGS_TTL_MS = "0";
  process.env.TUTOR_AI_PROVIDER = "mock";
  resetComplementarTermsCache();
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  real = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'ed@t.dev'), ($3, 'al@t.dev')`, [ADMIN, EDITOR, ALUNA]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`, [ALUNA]);
  await aceitarTermos(dev.db, ALUNA);
  await rpc(ADMIN, "app_admin_tutor_save_config", { enabled: true, requires_pro: true }, "Tutor ligado para o teste da lista de termos indisponível.");
  await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ($1, 'Editora Delta de Medicina (teste)', 'final', '2026', 'E')`, [TITULO]);
  const db = dbComLista();
  deps.db = db;
  deps.log = (m: string) => logs.push(m);
  tutor = await listen("/api/tutor", createTutorRouter(deps));
  lessons = await listen("/api/lessons", createLessonsRouter({ db, storage: { async put() { return ""; }, async get() { return Buffer.alloc(0); }, async exists() { return false; } }, log: (m) => logs.push(m)}));
  podcasts = await listen("/api/podcasts", createPodcastsRouter({ db, storage: { async put() { return ""; }, async get() { return Buffer.alloc(0); }, async exists() { return false; } }, log: (m) => logs.push(m), mockScript: () => ({ title_suggestion: "T", lines: [{ speaker: "ANA", text: "Oi.", style: "", sources: [] }], missing: [] }) }));
  tAluna = await dev.createSession(ALUNA);
  tEditor = await dev.createSession(EDITOR);
  sessao = (await rpc(ALUNA, "app_tutor_start", "livre", "Hepatite perinatal", null, { type: "free" }, "direto")).id;
  podcastId = (await rpc(EDITOR, "app_admin_save_podcast", { title: "Episódio", topic: "Hepatite", area: "PEDIATRIA", target_minutes: 5 })).id;
  await sql(`insert into public.podcast_sources (podcast_id, kind, title, position) values ($1, 'text', 'Texto', 0)`, [podcastId]);
  await sql(`insert into public.podcast_chunks (podcast_id, source_id, ord, page, text) select $1, id, 0, null, 'Hepatite B perinatal: vacina e imunoglobulina nas primeiras horas.' from public.podcast_sources where podcast_id = $1`, [podcastId]);
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.TUTOR_SETTINGS_TTL_MS;
  delete process.env.TUTOR_AI_PROVIDER;
});
beforeEach(() => {
  resetComplementarTermsCache();
  listaFora = false;
  logs.length = 0;
});

describe("Tutor (texto): sem a lista, não responde nem grava; com o banco normal, responde", () => {
  const mensagens = async () => (await sql<{ n: number }>(`select count(*)::int n from public.tutor_messages where session_id = $1`, [sessao]))[0].n;

  it("lista indisponível: 503 em português, nenhuma mensagem gravada, IA nem chamada", async () => {
    let chamadas = 0;
    proxima = () => (chamadas++, reply("Resposta."));
    listaFora = true;
    const antes = await mensagens();
    const r = await http(`${tutor}/turn`, tAluna, { session_id: sessao, action: "message", text: "Como fica a hepatite perinatal?" });
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/conferência de segurança/);
    expect(chamadas).toBe(0);
    expect(await mensagens()).toBe(antes);
    expect(logs.join("\n")).toMatch(/lista de termos indisponível/);
  });

  it("banco normal: responde", async () => {
    proxima = () => reply("Na hepatite perinatal o recém-nascido recebe vacina e imunoglobulina.");
    const r = await http(`${tutor}/turn`, tAluna, { session_id: sessao, action: "message", text: "Como fica a hepatite perinatal?" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  });
});

describe("Tutor (voz): fala do professor sem a lista", () => {
  it("lista indisponível: a fala NÃO é gravada no histórico (503)", async () => {
    const gravado: any[] = [];
    const fake: any = {
      db: {
        service: async (fn: string, args: any) => {
          if (fn === "ch_worker_tutor_voice_call") return { id: "c1", session_id: sessao, user_id: ALUNA, status: "open", model: "x", call_id: "c" };
          if (fn === "ch_worker_tutor_context") return null;
          if (fn === "ch_worker_complementar_terms") throw new Error("banco indisponível (teste)");
          if (fn === "ch_worker_tutor_settings") return {};
          if (fn === "ch_worker_tutor_append") { gravado.push(args); return { id: 1 }; }
          return null;
        },
      },
      log: (m: string) => logs.push(m),
    };
    const erro: any = await voiceTranscript(fake, ALUNA, "c1", "tutor", `Segundo o ${TITULO}, vacina e imunoglobulina.`).catch((e) => e);
    expect(erro.status).toBe(503);
    expect(erro.message).toMatch(/conferência de segurança/);
    expect(gravado).toEqual([]);
  });
});

describe("roteiro de podcast e assistente de aula: sem a lista, 503 e nada é gerado", () => {
  it("roteiro: 503 em português, sem IA e sem gravar", async () => {
    listaFora = true;
    const antes = (await sql(`select script from public.podcasts where id = $1`, [podcastId]))[0].script;
    const r = await http(`${podcasts}/${podcastId}/script`, tEditor, { provider: "mock" });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe(TERMS_UNAVAILABLE_MESSAGE);
    expect((await sql(`select script from public.podcasts where id = $1`, [podcastId]))[0].script).toEqual(antes);
  });

  it("conferência do roteiro (script/check): 503, em vez de devolver 'sem avisos'", async () => {
    await sql(`update public.podcasts set script = '{"lines":[{"speaker":"ANA","text":"Oi, vamos falar de hepatite B.","sources":[]}]}'::jsonb where id = $1`, [podcastId]);
    listaFora = true;
    const r = await http(`${podcasts}/${podcastId}/script/check`, tEditor);
    expect(r.status).toBe(503);
    expect(r.body.error).toBe(TERMS_UNAVAILABLE_MESSAGE);
  });

  it("assistente de aula: 503 em português", async () => {
    listaFora = true;
    const r = await http(`${lessons}/assist`, tEditor, { provider: "mock", text: "Hepatite B perinatal: vacina e imunoglobulina nas primeiras horas. ".repeat(5) });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe(TERMS_UNAVAILABLE_MESSAGE);
  });

  it("banco normal: o assistente e a conferência funcionam", async () => {
    expect((await http(`${lessons}/assist`, tEditor, { provider: "mock", pages: [{ page: 3, text: "Hepatite B perinatal: vacina e imunoglobulina nas primeiras horas de vida do recém-nascido, com conduta completa." }], topic: "Hepatite", area: "PEDIATRIA" })).status).toBe(200);
    expect((await http(`${podcasts}/${podcastId}/script/check`, tEditor)).status).toBe(200);
  });
});

describe("análise e reanálise de questões: sem a lista, nada é gerado", () => {
  const faltando = (chamadas: string[]): ContentDb =>
    ({
      mode: "dev",
      async service<T>(fn: string) {
        chamadas.push(fn);
        if (fn === "ch_worker_questions_for_analysis") return [{ id: "q1" }] as T;
        if (fn === "ch_worker_updates_for_reanalysis") return [{ question_id: "q1", changes: [] }] as T;
        if (fn === "ch_worker_flag") return true as T;
        if (fn === "ch_worker_complementar_terms") throw new Error("banco indisponível (teste)");
        return null as T;
      },
      async asUser() { throw new Error("não usado"); },
      async authenticate() { return null; },
    }) as ContentDb;

  it("análise: devolve o aviso em português em `pending`, não chama a IA e não grava nada", async () => {
    resetComplementarTermsCache();
    const chamadas: string[] = [];
    let ia = 0;
    const r = await runQuestionAnalysis({ db: faltando(chamadas), mockRespond: () => (ia++, {}), log: (m) => logs.push(m) } as any, { limit: 3 });
    expect(r.pending).toBe(TERMS_UNAVAILABLE_MESSAGE);
    expect(r.saved).toBe(0);
    expect(ia).toBe(0);
    expect(chamadas.filter((f) => /save|log_ai/.test(f))).toEqual([]);
  });

  it("reanálise: idem", async () => {
    resetComplementarTermsCache();
    const chamadas: string[] = [];
    let ia = 0;
    const r = await runQuestionReanalysis({ db: faltando(chamadas), mockRespond: () => (ia++, {}), log: (m) => logs.push(m) } as any, { limit: 3 });
    expect(r.pending).toBe(TERMS_UNAVAILABLE_MESSAGE);
    expect(ia).toBe(0);
    expect(chamadas.filter((f) => /save|log_ai|started/.test(f))).toEqual([]);
  });
});
