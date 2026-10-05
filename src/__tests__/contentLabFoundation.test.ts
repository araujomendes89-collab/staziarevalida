// @vitest-environment node
/**
 * Content Lab, fundação: sinalizadores com trava no banco, aliases de tema, natureza da fonte, prompts guardados,
 * conflitos com decisão registrada, confiança composta, provedor OpenAI e fallback. Fontes e textos sintéticos.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { OpenAIProvider } from "../../server/contentHub/ai/openai";
import { FallbackProvider } from "../../server/contentHub/ai/fallback";
import { AiInvalidOutput, MockProvider, resolveCreatorProvider, resolveRoleProvider, type AiProvider, type StructuredRequest } from "../../server/contentHub/ai/provider";
import { aiAllowed, promptHash, registerPrompts } from "../../server/contentHub/ai/registry";
import { PROMPTS } from "../../server/contentHub/ai/prompts";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { runQuestionAnalysis } from "../../server/contentHub/questionAnalysis";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lab1-"));
let dev: DevDatabase;
let db: ContentDb;
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000ed";
const STUDENT = "00000000-0000-4000-8000-00000000000a";
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const as = <T>(uid: string, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
  });
const rpc = async (uid: string, fn: string, ...args: unknown[]) => (await as(uid, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))))[0].r;

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'a@t.dev'), ($2, 'e@t.dev'), ($3, 's@t.dev')`, [ADMIN, EDITOR, STUDENT]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 300_000);
afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Sinalizadores (trava no banco)", () => {
  it("padrão seguro: módulo e IA ligados, publicação desligada, modo sombra ligado", async () => {
    expect(await rpc(EDITOR, "app_ch_flags")).toEqual({ enabled: true, ai_enabled: true, publish_enabled: false, notebook_provider_enabled: false, auto_analysis_enabled: false, shadow_mode: true });
    await expect(rpc(STUDENT, "app_ch_flags")).rejects.toThrow(/restrito/);
  });

  it("só administrador muda, com motivo; a mudança fica na auditoria", async () => {
    await expect(rpc(EDITOR, "app_ch_set_flag", "ai_enabled", false, "motivo qualquer longo")).rejects.toThrow(/administradores/);
    await expect(rpc(ADMIN, "app_ch_set_flag", "ai_enabled", false, "curto")).rejects.toThrow(/motivo/);
    await expect(rpc(ADMIN, "app_ch_set_flag", "inexistente", true, "motivo qualquer longo")).rejects.toThrow(/desconhecido/);
    await rpc(ADMIN, "app_ch_set_flag", "ai_enabled", false, "Pausa para revisar custos do mês.");
    expect((await sql(`select details from public.ch_audit where action = 'flag.set' order by id desc limit 1`))[0].details).toMatchObject({ from: true, to: false });
  });

  it("IA desligada: o servidor recusa antes de chamar qualquer provedor (banco e ambiente)", async () => {
    expect(await aiAllowed(db)).toMatchObject({ ok: false, why: expect.stringMatching(/ai_enabled/) });
    let called = 0;
    process.env.CONTENT_HUB_AI_PROVIDER_CREATE = "mock";
    const r = await runQuestionAnalysis({ db, mockRespond: () => (called++, {}) }, { limit: 3 });
    expect(called).toBe(0);
    expect(r.pending).toMatch(/desligada/);
    await rpc(ADMIN, "app_ch_set_flag", "ai_enabled", true, "Custos revisados, religando a IA.");
    expect((await aiAllowed(db)).ok).toBe(true);
    process.env.CONTENT_LAB_AI_ENABLED = "false";
    expect(await aiAllowed(db)).toMatchObject({ ok: false, why: expect.stringMatching(/servidor/) });
    delete process.env.CONTENT_LAB_AI_ENABLED;
  });

  it("publicação: bloqueada pelo modo sombra e pela chave desligada; liberada só com as duas chaves certas", async () => {
    const unit = (await sql(`insert into public.ch_units (theme_node_id, title) select id, 'Unidade de teste' from public.ch_taxonomy_nodes where level = 'theme' limit 1 returning id`))[0].id;
    const v = (await sql(`insert into public.ch_unit_versions (unit_id, version, status, content, content_hash) values ($1, 1, 'approved', '{}'::jsonb, 'h') returning id`, [unit]))[0].id;
    await expect(rpc(ADMIN, "app_ch_publish", v)).rejects.toThrow(/Modo sombra ligado/);
    await rpc(ADMIN, "app_ch_set_flag", "shadow_mode", false, "Fim da fase de testes em modo sombra.");
    await expect(rpc(ADMIN, "app_ch_publish", v)).rejects.toThrow(/Publicação desligada/);
    await rpc(ADMIN, "app_ch_set_flag", "publish_enabled", true, "Publicação autorizada pelo dono.");
    await expect(rpc(ADMIN, "app_ch_publish", v)).rejects.not.toThrow(/Modo sombra|Publicação desligada/); // passa a trava; as regras editoriais seguem valendo
    await rpc(ADMIN, "app_ch_set_flag", "shadow_mode", true, "Voltando ao modo sombra por segurança.");
    await rpc(ADMIN, "app_ch_set_flag", "publish_enabled", false, "Voltando ao modo sombra por segurança.");
  });

  it("módulo desligado: as funções da equipe param de responder; o aluno não é afetado", async () => {
    await rpc(ADMIN, "app_ch_set_flag", "enabled", false, "Desligando o Content Lab para manutenção.");
    await expect(rpc(EDITOR, "app_ch_sources")).rejects.toThrow(/desligado/);
    await expect(rpc(EDITOR, "app_question_update_summary")).rejects.toThrow(/desligado/);
    expect((await rpc(ADMIN, "app_ch_flags")).enabled).toBe(false); // o administrador ainda vê e religa
    expect(await rpc(STUDENT, "app_performance", 30)).toBeTruthy();
    await rpc(ADMIN, "app_ch_set_flag", "enabled", true, "Manutenção concluída, religando.");
    expect(await rpc(EDITOR, "app_ch_sources")).toEqual([]);
  });
});

describe("Aliases de tema", () => {
  let node: string;
  it("busca equivalentes por nome, alias e palavras antes de criar tema novo", async () => {
    const t = (await sql(`select n.id, n.name from public.ch_taxonomy_nodes n join public.ch_taxonomy_versions v on v.id = n.version_id and v.status = 'published' where n.level = 'theme' order by n.name limit 1`))[0];
    node = t.id;
    const found = await rpc(EDITOR, "app_ch_taxonomy_find", t.name.toUpperCase(), 5);
    expect(found[0]).toMatchObject({ node_id: node, via: "name", score: 1 });
    expect(await rpc(EDITOR, "app_ch_taxonomy_find", "zzzz inexistente qqq", 5)).toEqual([]);
  });

  it("alias aponta para o tema; é único; não pode repetir nome de outro tema; só a equipe mexe", async () => {
    const r = await rpc(EDITOR, "app_ch_taxonomy_add_alias", node, "HAS");
    expect(r.path).toBeTruthy();
    const f = await rpc(EDITOR, "app_ch_taxonomy_find", "has", 5);
    expect(f[0]).toMatchObject({ node_id: node, via: "alias", alias: "HAS", score: 1 });
    await expect(rpc(EDITOR, "app_ch_taxonomy_add_alias", node, "  has ")).rejects.toThrow(/já pertence/);
    const other = (await sql(`select n.id, n.name from public.ch_taxonomy_nodes n join public.ch_taxonomy_versions v on v.id = n.version_id and v.status = 'published' where n.level = 'theme' and n.id <> $1 limit 1`, [node]))[0];
    await expect(rpc(EDITOR, "app_ch_taxonomy_add_alias", node, other.name)).rejects.toThrow(/Já existe um tema/);
    await expect(rpc(STUDENT, "app_ch_taxonomy_add_alias", node, "xyz")).rejects.toThrow();
    const list = await rpc(EDITOR, "app_ch_taxonomy_aliases");
    expect(list).toEqual([expect.objectContaining({ alias: "HAS", node_id: node, orphan: false })]);
  });

  it("o alias sobrevive à nova versão da taxonomia (chave por caminho, não por id)", async () => {
    await rpc(EDITOR, "app_ch_taxonomy_draft");
    await rpc(ADMIN, "app_ch_taxonomy_publish", "Mesma taxonomia, só para testar aliases.").catch(() => null);
    const list = await rpc(EDITOR, "app_ch_taxonomy_aliases");
    expect(list[0].alias).toBe("HAS");
    const id = list[0].id;
    expect(await rpc(EDITOR, "app_ch_taxonomy_remove_alias", id)).toBe(true);
    expect(await rpc(EDITOR, "app_ch_taxonomy_aliases")).toEqual([]);
  });
});

describe("Natureza da fonte, prompts e conflitos", () => {
  it("fonte ganha tipo, autores, idioma e 'fonte primária'; tipo inválido é recusado", async () => {
    const s = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ('Fonte SINTÉTICA lab', 'Órgão de teste', 'final', '1', 'A') returning id`))[0].id;
    await rpc(ADMIN, "app_ch_set_source_registry", s, { source_type: "PCDT", authors: "Equipe de teste", language: "pt", is_primary_source: true });
    expect((await sql(`select source_type, authors, language, is_primary_source from public.ch_sources where id = $1`, [s]))[0]).toEqual({ source_type: "PCDT", authors: "Equipe de teste", language: "pt", is_primary_source: true });
    await expect(rpc(ADMIN, "app_ch_set_source_registry", s, { source_type: "INVENTADO" })).rejects.toThrow();
  });

  it("os prompts em uso ficam guardados com texto e hash, sem duplicar", async () => {
    const n = await registerPrompts(db);
    expect(n).toBe(Object.keys(PROMPTS).length);
    expect(await registerPrompts(db)).toBe(0);
    const q = (await sql(`select content_hash, system from public.ch_prompt_versions where prompt_id = 'qanalysis'`))[0];
    expect(q.content_hash).toBe(promptHash(PROMPTS.qanalysis.system, PROMPTS.qanalysis.schema));
    expect(q.system).toContain("GABARITO OFICIAL");
    const list = await rpc(EDITOR, "app_ch_prompt_versions", "qanalysis");
    expect(list).toEqual([expect.objectContaining({ prompt_id: "qanalysis", version: PROMPTS.qanalysis.version })]);
  });

  let claim: string, sa: string, sb: string, conflict: string;
  it("conflito entre duas fontes oficiais vigentes é detectado e mostra os dois lados; ninguém escolhe em silêncio", async () => {
    claim = (await sql(`select claim_id from public.question_claims where role = 'solves' limit 1`))[0].claim_id;
    const text = (await sql(`select statement from public.ch_claims where id = $1`, [claim]))[0].statement;
    sa = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level, published_on) values ('PCDT SINTÉTICO 2024', 'Ministério de teste', 'final', '1', 'A', '2024-01-01') returning id`))[0].id;
    sb = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level, published_on) values ('Diretriz SINTÉTICA 2026', 'Sociedade de teste', 'final', '1', 'A', '2026-01-01') returning id`))[0].id;
    await sql(`update public.ch_sources set kind = 'final' where id in ($1, $2)`, [sa, sb]);
    await rpc(ADMIN, "app_ch_link_evidence", claim, { source_id: sa, quote: text, verdict: "compatible", page: 3 });
    await rpc(ADMIN, "app_ch_link_evidence", claim, { source_id: sb, quote: `${text} Em outra orientação, a conduta é diferente.`, verdict: "conflicting", page: 9 });
    expect(await rpc(ADMIN, "app_ch_conflicts_detect")).toBe(1);
    expect(await rpc(ADMIN, "app_ch_conflicts_detect")).toBe(0); // não duplica
    const [k] = await rpc(EDITOR, "app_ch_conflicts", "open");
    conflict = k.id;
    expect(k).toMatchObject({ status: "open", nature: "Recomendação divergente" });
    expect(k.a).toMatchObject({ title: "PCDT SINTÉTICO 2024" });
    expect(k.b).toMatchObject({ title: "Diretriz SINTÉTICA 2026" });
    expect(k.a.quote).toBeTruthy();
    expect(k.b.quote).toContain("outra orientação");
    // com conflito aberto a confiança da afirmação exige revisão
    expect((await rpc(EDITOR, "app_ch_claim_confidence", claim)).level).toBe("REVIEW_REQUIRED");
  });

  it("decisão só de administrador, com motivo e uma das duas fontes; fica registrada; evidência não é apagada", async () => {
    await expect(rpc(EDITOR, "app_ch_conflict_decide", conflict, "resolved", sa, "Escolho a fonte oficial do Ministério.")).rejects.toThrow(/administradores/);
    await expect(rpc(ADMIN, "app_ch_conflict_decide", conflict, "resolved", sa, "curto")).rejects.toThrow(/motivo/);
    await expect(rpc(ADMIN, "app_ch_conflict_decide", conflict, "resolved", STUDENT, "Escolho uma fonte que nem é do conflito.")).rejects.toThrow(/uma das duas fontes/);
    await rpc(ADMIN, "app_ch_conflict_decide", conflict, "resolved", sa, "Vale a norma oficial brasileira vigente para o SUS.");
    const row = (await sql(`select status, chosen_source, resolution, decided_by from public.ch_conflicts where id = $1`, [conflict]))[0];
    expect(row).toMatchObject({ status: "resolved", chosen_source: sa, decided_by: ADMIN });
    expect((await sql(`select count(*)::int n from public.ch_evidence where claim_id = $1`, [claim]))[0].n).toBe(2);
    expect((await sql(`select count(*)::int n from public.ch_audit where action = 'conflict.resolved'`))[0].n).toBe(1);
    expect(await rpc(EDITOR, "app_ch_conflicts", "open")).toEqual([]);
  });

  it("confiança composta mostra os componentes; sem conferência humana nunca é 'alta'", async () => {
    const c = await rpc(EDITOR, "app_ch_claim_confidence", claim);
    expect(c.components).toMatchObject({ best_authority: "A", official_sources: 1, cited_with_page: true, human_checked: true, numbers_supported: true });
    expect(["HIGH", "MODERATE", "REVIEW_REQUIRED"]).toContain(c.level);
    const lone = (await sql(`select id from public.ch_claims where id <> $1 limit 1`, [claim]))[0].id;
    expect((await rpc(EDITOR, "app_ch_claim_confidence", lone))).toMatchObject({ level: "REVIEW_REQUIRED", components: { official_sources: 0 } });
    expect(await rpc(EDITOR, "app_ch_claim_confidence", "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("Provedores: OpenAI e fallback", () => {
  const schema = { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } } as const;
  const req: StructuredRequest = { promptId: "t", promptVersion: "1", system: "sys", input: "in", schema: schema as any, schemaName: "t" };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("OpenAI: manda schema e instruções, valida a resposta e informa modelo e tokens", async () => {
    let sent: any;
    const f = (async (url: string, init: any) => {
      sent = { url, headers: init.headers, body: JSON.parse(init.body) };
      return reply({ model: "modelo-x-2026", choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 120, completion_tokens: 30 } });
    }) as unknown as typeof fetch;
    const r = await new OpenAIProvider("chave-teste", "modelo-x", f).generate<{ ok: boolean }>(req);
    expect(r).toMatchObject({ output: { ok: true }, provider: "openai", model: "modelo-x-2026", inputTokens: 120, outputTokens: 30 });
    expect(sent.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(sent.headers.Authorization).toBe("Bearer chave-teste");
    expect(sent.body.messages).toEqual([{ role: "system", content: "sys" }, { role: "user", content: "in" }]);
    expect(sent.body.response_format.json_schema.schema).toMatchObject({ type: "object", required: ["ok"] });
  });

  it("OpenAI: resposta fora do formato, cortada, não JSON, recusa e erro HTTP viram erro (nunca são consertadas)", async () => {
    const make = (body: unknown, status = 200) => new OpenAIProvider("k", "m", (async () => reply(body, status)) as unknown as typeof fetch);
    await expect(make({ choices: [{ message: { content: '{"ok":"sim"}' } }] }).generate(req)).rejects.toBeInstanceOf(AiInvalidOutput);
    await expect(make({ choices: [{ finish_reason: "length", message: { content: "{" } }] }).generate(req)).rejects.toBeInstanceOf(AiInvalidOutput);
    await expect(make({ choices: [{ message: { content: "não é json" } }] }).generate(req)).rejects.toBeInstanceOf(AiInvalidOutput);
    await expect(make({ choices: [{ message: { refusal: "não posso", content: null } }] }).generate(req)).rejects.toThrow(/recusou/);
    await expect(make({ error: { message: "limite" } }, 429).generate(req)).rejects.toThrow(/429/);
  });

  it("resolve só com chave E modelo definidos (o modelo nunca é adivinhado)", async () => {
    const keep = { ...process.env };
    try {
      Object.assign(process.env, { CONTENT_HUB_AI_ALLOW_EXTERNAL: "1", CONTENT_HUB_AI_PROVIDER_CREATE: "openai" });
      delete process.env.OPENAI_API_KEY;
      delete process.env.CONTENT_HUB_OPENAI_MODEL;
      expect(resolveCreatorProvider().status.pending).toMatch(/OPENAI_API_KEY/);
      process.env.OPENAI_API_KEY = "chave";
      expect(resolveCreatorProvider().status.pending).toMatch(/CONTENT_HUB_OPENAI_MODEL/);
      process.env.CONTENT_HUB_OPENAI_MODEL = "modelo-x";
      expect(resolveCreatorProvider().status).toMatchObject({ ready: true, provider: "openai", model: "modelo-x" });
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
      Object.assign(process.env, keep);
    }
  });

  const fake = (name: string, model: string, impl: () => Promise<any>): AiProvider => ({ name, model, isMock: false, generate: impl as any });
  const ok = (provider: string, model: string) => async () => ({ output: { ok: true }, provider, model, inputTokens: 1, outputTokens: 1, latencyMs: 1, costUsd: null });
  const noSleep = async () => {};

  it("fallback: repete o principal e só então usa o secundário; o resultado diz quem produziu", async () => {
    let calls = 0;
    const events: any[] = [];
    const p = new FallbackProvider(fake("anthropic", "claude-x", async () => (calls++, Promise.reject(new Error("503 indisponível")))), fake("openai", "gpt-x", ok("openai", "gpt-x")), { sleep: noSleep, onFallback: (i) => events.push(i) });
    const r = await p.generate<{ ok: boolean }>(req);
    expect(calls).toBe(2); // tentativa + 1 repetição
    expect(r).toMatchObject({ provider: "openai", model: "gpt-x" });
    expect(events).toEqual([expect.objectContaining({ from: "anthropic/claude-x", to: "openai/gpt-x" })]);
  });

  it("fallback: principal que funciona nunca chama o secundário; falha 'final' (recusa/chave) pula a repetição; saída inválida é repetida", async () => {
    let secondary = 0;
    const sec = fake("openai", "gpt-x", async () => (secondary++, ok("openai", "gpt-x")()));
    expect((await new FallbackProvider(fake("anthropic", "c", ok("anthropic", "c")), sec, { sleep: noSleep }).generate(req)).provider).toBe("anthropic");
    expect(secondary).toBe(0);
    let n = 0;
    await new FallbackProvider(fake("anthropic", "c", async () => (n++, Promise.reject(new Error("O provedor recusou a solicitação")))), sec, { sleep: noSleep }).generate(req);
    expect(n).toBe(1);
    let m = 0;
    const flaky = fake("anthropic", "c", async () => (++m === 1 ? Promise.reject(new AiInvalidOutput("fora do formato", {})) : ok("anthropic", "c")()));
    expect((await new FallbackProvider(flaky, sec, { sleep: noSleep }).generate(req)).provider).toBe("anthropic");
    expect(m).toBe(2);
    await expect(new FallbackProvider(fake("a", "c", () => Promise.reject(new Error("falha 1"))), fake("b", "d", () => Promise.reject(new Error("falha 2"))), { sleep: noSleep }).generate(req)).rejects.toThrow(/falha 2/);
  });

  it("o secundário de um CONFERENTE só entra se for de outra família que a do criador", async () => {
    const keep = { ...process.env };
    try {
      Object.assign(process.env, { CONTENT_HUB_AI_ALLOW_EXTERNAL: "1", CONTENT_HUB_AI_PROVIDER_SOURCES: "anthropic", ANTHROPIC_API_KEY: "k", CONTENT_HUB_AI_FALLBACK_PROVIDER: "openai", OPENAI_API_KEY: "k", CONTENT_HUB_OPENAI_MODEL: "gpt-x" });
      // criador gpt: o principal (anthropic) é independente, mas o secundário (openai) é da MESMA família do criador → não entra
      const gptCreator = resolveRoleProvider("sources", "gpt-x");
      expect(gptCreator.provider?.name).toBe("anthropic");
      expect(gptCreator.provider).not.toBeInstanceOf(FallbackProvider);
      // criador claude: principal gemini e secundário openai são ambos independentes → o fallback entra
      process.env.CONTENT_HUB_AI_PROVIDER_SOURCES = "gemini";
      process.env.GEMINI_API_KEY = "g".repeat(40);
      const claudeCreator = resolveRoleProvider("sources", "claude-sonnet-5-5");
      expect(claudeCreator.provider).toBeInstanceOf(FallbackProvider);
      expect(claudeCreator.provider?.name).toBe("gemini");
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
      Object.assign(process.env, keep);
    }
  });
});
