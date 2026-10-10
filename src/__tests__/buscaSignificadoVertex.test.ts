// @vitest-environment node
/**
 * Busca por significado e o modo expresso do Vertex AI (falha vista em produção, 2026-10-09): dezenas de "Busca por significado: o
 * Google recusou (404)". A VERTEX_API_KEY é do modo expresso do Vertex AI, que só aceita 8 modelos de texto e imagem e nenhum de
 * busca por significado; o pedido ia para o endereço do modo expresso, sem projeto, e o Google respondia 404. Além disso, no
 * Vertex a biblioteca do Google aceita só 1 texto por pedido de vetor, e o lote de 50 trechos falhava antes de sair do servidor.
 * Agora a busca por significado escolhe o próprio caminho: Vertex AI completo pela conta de serviço (projeto e local) ou a chave do
 * AI Studio; só com a chave do modo expresso fica parada, com o motivo. Sem rede: fetch e autenticação simulados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { googleAiAccess, googleEmbeddingsAccess } from "../../server/ai/googleKey";
import {
  createEmbedder,
  EMBEDDING_DIMS,
  embeddingsClientOptions,
  embeddingsConfig,
  EmbeddingsError,
  queryEmbedding,
  type EmbedClient,
} from "../../server/contentHub/embeddings";

vi.setConfig({ testTimeout: 60_000 });

const VERTEX = "AQ.Ab8RN6" + "v".repeat(44); // chave do modo expresso (formato novo, com ponto)
const STUDIO = "AIza" + "s".repeat(35);
const ALLOW = { CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL: "1" };
const env = (e: Record<string, string>) => ({ ...ALLOW, ...e }) as NodeJS.ProcessEnv;
const vec = (seed = 1) => Array.from({ length: EMBEDDING_DIMS }, (_, i) => (i === 0 ? seed : 0.5));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("qual caminho do Google a busca por significado usa", () => {
  it("só com a chave do modo expresso (VERTEX_API_KEY): parada, com o motivo em português simples", () => {
    expect(googleEmbeddingsAccess({ VERTEX_API_KEY: VERTEX } as NodeJS.ProcessEnv)).toBeNull();
    const cfg = embeddingsConfig(env({ VERTEX_API_KEY: VERTEX }));
    expect(cfg.ready).toBe(false);
    expect(cfg.pending).toMatch(/modo expresso/);
    expect(cfg.pending).toMatch(/usa palavras/);
    expect(cfg.pending).not.toContain(VERTEX);
    expect(createEmbedder(cfg)).toBeNull();
  });

  it("VERTEX_API_KEY junto com a chave do AI Studio: a busca vai pelo AI Studio; a Central de IAs continua no Vertex", () => {
    const e = env({ VERTEX_API_KEY: VERTEX, GEMINI_API_KEY: STUDIO });
    expect(googleEmbeddingsAccess(e)).toEqual({ mode: "studio", key: STUDIO });
    expect(embeddingsConfig(e)).toMatchObject({ ready: true, mode: "studio", key: STUDIO, model: "gemini-embedding-2" });
    expect(googleAiAccess(e)).toEqual({ mode: "vertex", key: VERTEX });
  });

  it("com o projeto do Vertex AI completo: conta de serviço, sem chave, no local global (ou o escolhido)", () => {
    const e = env({ CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT: "staziamed-revalida-prod", VERTEX_API_KEY: VERTEX, GEMINI_API_KEY: STUDIO });
    expect(googleEmbeddingsAccess(e)).toEqual({ mode: "vertex_project", project: "staziamed-revalida-prod", location: "global" });
    const cfg = embeddingsConfig(e);
    expect(cfg).toMatchObject({ ready: true, mode: "vertex_project", key: null, pending: null });
    expect(embeddingsClientOptions(cfg)).toEqual({ vertexai: true, project: "staziamed-revalida-prod", location: "global" });
    const us = embeddingsConfig(env({ CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT: "p", CONTENT_HUB_EMBEDDINGS_VERTEX_LOCATION: "us" }));
    expect(embeddingsClientOptions(us)).toEqual({ vertexai: true, project: "p", location: "us" });
    // local fora da lista: volta para global
    expect(googleEmbeddingsAccess({ CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT: "p", CONTENT_HUB_EMBEDDINGS_VERTEX_LOCATION: "marte" } as NodeJS.ProcessEnv)).toMatchObject({ location: "global" });
  });

  it("AI Studio: o cliente nasce só com a chave", () => {
    expect(embeddingsClientOptions(embeddingsConfig(env({ GEMINI_API_KEY: STUDIO })))).toEqual({ apiKey: STUDIO });
  });

  it("sem acesso nenhum: a pendência diz as duas saídas", () => {
    const p = embeddingsConfig(env({})).pending!;
    expect(p).toMatch(/CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT/);
    expect(p).toMatch(/GEMINI_API_KEY/);
  });
});

describe("endereço que a biblioteca do Google monta (fetch simulado, sem rede)", () => {
  const seen: { url: string; body: any }[] = [];
  beforeEach(() => {
    seen.length = 0;
    vi.stubGlobal("fetch", async (url: unknown, init?: { body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      seen.push({ url: String(url), body });
      const payload = String(url).includes(":batchEmbedContents")
        ? { embeddings: (body?.requests ?? []).map(() => ({ values: vec() })) }
        : { embedding: { values: vec() } };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    });
  });

  it("AI Studio: um pedido em lote (batchEmbedContents) no endereço do AI Studio", async () => {
    const cfg = embeddingsConfig(env({ GEMINI_API_KEY: STUDIO }));
    const client = new GoogleGenAI(embeddingsClientOptions(cfg) as any) as unknown as EmbedClient;
    const r = await createEmbedder(cfg, client)!.embedDocuments([{ text: "a" }, { text: "b" }, { text: "c" }]);
    expect(r.vectors).toHaveLength(3);
    expect(seen.map((s) => s.url)).toEqual(["https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents"]);
  });

  it("Vertex AI completo: um texto por pedido, sempre com projeto e local no endereço", async () => {
    const cfg = embeddingsConfig(env({ CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT: "P" }));
    const authClient = { getRequestHeaders: async () => new Headers({ Authorization: "Bearer falso" }) };
    const client = new GoogleGenAI({ ...(embeddingsClientOptions(cfg) as any), googleAuthOptions: { authClient } }) as unknown as EmbedClient;
    const e = createEmbedder(cfg, client)!;
    const r = await e.embedDocuments([{ text: "a" }, { text: "b" }, { text: "c" }]);
    expect(r.vectors).toHaveLength(3);
    expect(seen).toHaveLength(3);
    for (const s of seen) {
      expect(s.url).toMatch(/^https:\/\/aiplatform\.googleapis\.com\/v1beta1\/projects\/P\/locations\/global\/publishers\/google\/models\/gemini-embedding-2:embedContent/);
    }
    expect(await e.embedQuery("dor torácica")).toHaveLength(EMBEDDING_DIMS);
    expect(seen.every((s) => s.url.includes("/projects/"))).toBe(true);
  });
});

describe("vetores no Vertex AI: um texto por pedido, poucos ao mesmo tempo", () => {
  it("3 textos viram 3 pedidos de 1 texto, na ordem, normalizados, com no máximo 4 ao mesmo tempo", async () => {
    let live = 0;
    let peak = 0;
    const sizes: number[] = [];
    const client: EmbedClient = {
      models: {
        embedContent: async (p: any) => {
          sizes.push(p.contents.length);
          live++;
          peak = Math.max(peak, live);
          await new Promise((r) => setTimeout(r, 5));
          live--;
          const n = Number(/Trecho (\d+)/.exec(p.contents[0].parts[0].text)?.[1] ?? 0);
          return { embeddings: [{ values: vec(n + 1) }] };
        },
      },
    };
    const cfg = embeddingsConfig(env({ CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT: "P" }));
    const items = Array.from({ length: 10 }, (_, i) => ({ text: `Trecho ${i}` }));
    const r = await createEmbedder(cfg, client)!.embedDocuments(items);
    expect(sizes).toEqual(new Array(10).fill(1));
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
    expect(r.vectors).toHaveLength(10);
    // na ordem: o primeiro componente cresce com o número do trecho
    const firsts = r.vectors.map((v) => v[0]);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
    for (const v of r.vectors) expect(Math.hypot(...v)).toBeCloseTo(1, 6);
  });
});

describe("erro de configuração (400, 402, 403, 404): sem nova tentativa e a busca para na rodada", () => {
  it("404: uma chamada só, as seguintes nem saem, o motivo fica guardado e a mensagem não leva a chave", async () => {
    let n = 0;
    const client: EmbedClient = {
      models: {
        embedContent: async () => {
          n++;
          throw Object.assign(new Error(`Not Found ${STUDIO}`), { status: 404 });
        },
      },
    };
    const cfg = embeddingsConfig(env({ GEMINI_API_KEY: STUDIO }));
    const e = createEmbedder(cfg, client)!;
    const err = await e.embedQuery("x").catch((x) => x);
    expect(err).toBeInstanceOf(EmbeddingsError);
    expect(err.status).toBe(404);
    expect(err.message).not.toContain(STUDIO);
    expect(n).toBe(1);
    await expect(e.embedDocuments([{ text: "a" }])).rejects.toBeInstanceOf(EmbeddingsError);
    expect(n).toBe(1);
    expect(e.problem).toMatch(/404/);
    expect(e.problem).not.toContain(STUDIO);
    // a busca segue por palavras e o aviso no log sai uma vez só
    const logs: string[] = [];
    expect(await queryEmbedding(e, "y", (m) => logs.push(m))).toBeNull();
    expect(await queryEmbedding(e, "z", (m) => logs.push(m))).toBeNull();
    expect(logs).toHaveLength(0);
  });

  it("402 (sem crédito) também para; 429 e 5xx continuam tentando de novo", async () => {
    let n = 0;
    const noCredit: EmbedClient = { models: { embedContent: async () => { n++; throw Object.assign(new Error("Payment Required"), { status: 402 }); } } };
    const cfg = embeddingsConfig(env({ GEMINI_API_KEY: STUDIO }));
    const e = createEmbedder(cfg, noCredit)!;
    await expect(e.embedQuery("x")).rejects.toBeInstanceOf(EmbeddingsError);
    await expect(e.embedQuery("x")).rejects.toBeInstanceOf(EmbeddingsError);
    expect(n).toBe(1);
    let m = 0;
    const flaky: EmbedClient = {
      models: {
        embedContent: async (p: any) => {
          if (m++ === 0) throw Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });
          return { embeddings: p.contents.map(() => ({ values: vec() })) };
        },
      },
    };
    const f = createEmbedder(cfg, flaky)!;
    expect(await f.embedQuery("x")).toHaveLength(EMBEDDING_DIMS);
    expect(m).toBe(2);
    expect(f.problem).toBeNull();
  });

  // revisão, rodada 1: no site (Vercel) não há conta de serviço do Google. Com o Vertex AI por projeto, a biblioteca de autenticação
  // lança um Error comum, sem status; o código tratava como instabilidade (502): 3 chamadas e 4,5 s de espera por busca, aviso no log
  // a cada busca e a busca por significado aparecendo como pronta no painel
  it("Vertex por projeto sem credencial do Google neste ambiente: sem nova tentativa, busca parada e o motivo no painel", async () => {
    const NO_ADC = "Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information.";
    let n = 0;
    const client: EmbedClient = {
      models: {
        embedContent: async () => {
          n++;
          throw new Error(NO_ADC);
        },
      },
    };
    const e = createEmbedder(embeddingsConfig(env({ CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT: "staziamed-revalida-prod" })), client)!;
    const logs: string[] = [];
    const t0 = Date.now();
    expect(await queryEmbedding(e, "dor torácica", (m) => logs.push(m))).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(n).toBe(1);
    expect(e.problem).toMatch(/sem credencial do Google/);
    expect(e.problem).toMatch(/GEMINI_API_KEY/);
    // a seguinte nem sai e não repete o aviso
    expect(await queryEmbedding(e, "febre", (m) => logs.push(m))).toBeNull();
    expect(n).toBe(1);
    expect(logs).toHaveLength(1);
    expect(e.problem).toMatch(/sem credencial do Google/);
    // o relato (e o painel, que lê embedder.problem) mostra a busca parada com o motivo
    const { probeProcessing } = await import("../../server/contentHub/capabilities");
    const mock = { provider: { name: "mock", model: "mock-dev", isMock: true }, status: { ready: true, provider: "mock", model: "mock-dev", isMock: true, pending: null } };
    const report = await probeProcessing({ db: null, ai: mock, embedder: e, renderer: null } as any);
    expect(report.embeddings.ready).toBe(false);
    expect(report.embeddings.pending).toMatch(/sem credencial do Google/);
  });

  it("a pendência sem acesso não manda pôr o projeto do Vertex AI no site (lá não há conta de serviço)", () => {
    const p = embeddingsConfig(env({})).pending!;
    expect(p).not.toMatch(/servidor e no processamento/);
    expect(p).toMatch(/no site, .*GEMINI_API_KEY/i);
    expect(p).toMatch(/processamento \(Cloud Run\).*CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT/);
  });

  it("o relato do processamento mostra a busca parada com o motivo", async () => {
    const { probeProcessing } = await import("../../server/contentHub/capabilities");
    const client: EmbedClient = { models: { embedContent: async () => { throw Object.assign(new Error("Not Found"), { status: 404 }); } } };
    const e = createEmbedder(embeddingsConfig(env({ GEMINI_API_KEY: STUDIO })), client)!;
    await e.embedQuery("x").catch(() => undefined);
    const mock = { provider: { name: "mock", model: "mock-dev", isMock: true }, status: { ready: true, provider: "mock", model: "mock-dev", isMock: true, pending: null } };
    const report = await probeProcessing({ db: null, ai: mock, embedder: e, renderer: null } as any);
    expect(report.embeddings.ready).toBe(false);
    expect(report.embeddings.pending).toMatch(/404/);
    expect(report.pending.some((p) => p.startsWith("Busca por significado no processamento:") && /404/.test(p))).toBe(true);
  });
});

// revisão, rodada 2: o motivo guardado em `problem` levava a mensagem crua da biblioteca do Google (inglês e JSON), e ele vai para
// as pendências do painel (/status) e para o relato do processamento. Agora o painel mostra o motivo pelo código, em português
// simples; a mensagem crua fica só no registro (log)
describe("motivo da busca parada: português simples no painel, mensagem crua do Google só no log", () => {
  const googleError = (status: number, body: unknown) => Object.assign(new Error(JSON.stringify(body)), { status });
  const stopped = async (status: number, body: unknown, e: Record<string, string> = { GEMINI_API_KEY: STUDIO }) => {
    const client: EmbedClient = { models: { embedContent: async () => { throw googleError(status, body); } } };
    const embedder = createEmbedder(embeddingsConfig(env(e)), client)!;
    const logs: string[] = [];
    expect(await queryEmbedding(embedder, "dor torácica", (m) => logs.push(m))).toBeNull();
    return { embedder, logs, problem: embedder.problem! };
  };
  const plain = (p: string) => {
    expect(p).not.toMatch(/[{}"]/);
    expect(p).not.toMatch(/\b(error|message|status|code|credits|depleted|prepayment|not found|permission|denied|invalid)\b/i);
    expect(p).not.toContain(STUDIO);
  };

  it("402 (cenário deste ramo: chave do AI Studio sem crédito): 'sem crédito', sem o JSON em inglês", async () => {
    const body = { error: { code: 402, message: "Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.", status: "FAILED_PRECONDITION" } };
    const { problem, logs, embedder } = await stopped(402, body);
    plain(problem);
    expect(problem).toMatch(/sem crédito/);
    expect(problem).toMatch(/402/);
    expect(problem).toMatch(/GEMINI_API_KEY/);
    // a mensagem crua continua no log (uma vez), para quem for investigar
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/prepayment credits are depleted/);
    // o relato do processamento (e o painel, que lê o mesmo `problem`) mostra o texto simples
    const { probeProcessing } = await import("../../server/contentHub/capabilities");
    const mock = { provider: { name: "mock", model: "mock-dev", isMock: true }, status: { ready: true, provider: "mock", model: "mock-dev", isMock: true, pending: null } };
    const report = await probeProcessing({ db: null, ai: mock, embedder, renderer: null } as any);
    expect(report.embeddings.pending).toBe(problem);
    const line = report.pending.find((p) => p.startsWith("Busca por significado no processamento:"))!;
    plain(line.replace("Busca por significado no processamento:", ""));
  });

  it("404 (o de produção, com a mensagem vazia): 'modelo não encontrado nesse acesso'", async () => {
    const { problem } = await stopped(404, { error: { message: "", code: 404, status: "Not Found" } });
    plain(problem);
    expect(problem).toMatch(/404/);
    expect(problem).toMatch(/modelo gemini-embedding-2 não foi encontrado/);
  });

  it("400, 401 e 403 também em português simples, cada um com o seu motivo", async () => {
    const p400 = (await stopped(400, { error: { code: 400, message: "Invalid value at 'requests[0]'", status: "INVALID_ARGUMENT" } })).problem;
    plain(p400);
    expect(p400).toMatch(/recusou o pedido/);
    const p401 = (await stopped(401, { error: { code: 401, message: "API key not valid. Please pass a valid API key.", status: "UNAUTHENTICATED" } })).problem;
    plain(p401);
    expect(p401).toMatch(/chave .*recusada|sem permissão/);
    const p403 = (await stopped(403, { error: { code: 403, message: "Permission denied on resource project.", status: "PERMISSION_DENIED" } })).problem;
    plain(p403);
    expect(p403).toMatch(/sem permissão/);
  });

  it("Vertex AI pelo projeto: o 403 aponta a permissão da conta de serviço da tarefa", async () => {
    const body = { error: { code: 403, message: "Permission 'aiplatform.endpoints.predict' denied on resource", status: "PERMISSION_DENIED" } };
    const { problem } = await stopped(403, body, { CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT: "staziamed-revalida-prod" });
    plain(problem);
    expect(problem).toMatch(/sem permissão/);
    expect(problem).toMatch(/conta de serviço/);
    expect(problem).toMatch(/roles\/aiplatform\.user/);
    expect(problem).toMatch(/staziamed-revalida-prod/);
  });
});

// revisão, rodada 2: o script do Cloud Run troca a lista inteira de variáveis da tarefa (--set-env-vars). Quem ligou a busca pelo
// Vertex AI (EMBEDDINGS_VERTEX=1) e depois rodava o script sem ela perdia CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT sem aviso. Sem
// rede: gcloud e git simulados, numa cópia do script numa pasta temporária, com um .env falso
describe("script do Cloud Run: o próximo deploy não apaga o Vertex AI da busca por significado", () => {
  const JOB_ON_VERTEX = {
    apiVersion: "run.googleapis.com/v1",
    kind: "Job",
    metadata: { name: "stazia-pdf-worker" },
    spec: { template: { spec: { template: { spec: { containers: [{ image: "x", env: [
      { name: "NODE_ENV", value: "production" },
      { name: "CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL", value: "1" },
      { name: "CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT", value: "staziamed-revalida-prod" },
      { name: "GEMINI_API_KEY", valueFrom: { secretKeyRef: { name: "stazia-gemini-api-key", key: "latest" } } },
    ] }] } } } } },
  };
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
  });
  const deploy = (job: unknown | null, extra: Record<string, string> = {}) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-worker-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "scripts/cloudrun"), { recursive: true });
    fs.copyFileSync("scripts/cloudrun/deploy-pdf-worker.sh", path.join(root, "scripts/cloudrun/deploy-pdf-worker.sh"));
    // .env falso (valores inventados): o mesmo formato do .env do Mac, com a chave do AI Studio, como em produção
    fs.writeFileSync(path.join(root, ".env"), "SUPABASE_URL=https://exemplo.supabase.co\nVITE_SUPABASE_ANON_KEY=anon-falsa\nSUPABASE_SERVICE_ROLE_KEY=servico-falsa\nGEMINI_API_KEY=estudio-falsa\n");
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    const log = path.join(root, "gcloud.log");
    if (job) fs.writeFileSync(path.join(root, "job.json"), JSON.stringify(job));
    fs.writeFileSync(
      path.join(bin, "gcloud"),
      [
        "#!/usr/bin/env bash",
        'printf "%s\\n" "$*" >> "$FAKE_LOG"',
        'case "$*" in',
        '  *"--data-file=-"*) cat >/dev/null ;;',
        '  *"secrets versions access"*) exit 1 ;;',
        '  *"run jobs describe"*) if [ -f "$FAKE_JOB" ]; then cat "$FAKE_JOB"; else echo "not found" >&2; exit 1; fi ;;',
        "esac",
        "exit 0",
      ].join("\n"),
      { mode: 0o755 }
    );
    fs.writeFileSync(path.join(bin, "git"), "#!/usr/bin/env bash\necho abc1234\n", { mode: 0o755 });
    const r = spawnSync("bash", [path.join(root, "scripts/cloudrun/deploy-pdf-worker.sh")], {
      encoding: "utf8",
      env: { PATH: `${bin}:${process.env.PATH}`, HOME: root, TMPDIR: root, PROJECT: "staziamed-revalida-prod", FAKE_LOG: log, FAKE_JOB: path.join(root, "job.json"), ...extra },
    });
    const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n") : [];
    return { status: r.status, out: `${r.stdout}${r.stderr}`, calls, deployLine: calls.find((c) => c.includes("run jobs deploy")) ?? "" };
  };

  it("a tarefa já usa o Vertex AI e o deploy veio sem EMBEDDINGS_VERTEX: mantém a variável, o papel e a API", () => {
    const r = deploy(JOB_ON_VERTEX);
    expect(r.status).toBe(0);
    expect(r.deployLine).toContain("CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT=staziamed-revalida-prod");
    expect(r.deployLine).toContain("CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL=1");
    expect(r.calls.some((c) => c.includes("services enable aiplatform.googleapis.com"))).toBe(true);
    expect(r.calls.some((c) => c.includes("add-iam-policy-binding staziamed-revalida-prod") && c.includes("roles/aiplatform.user"))).toBe(true);
    expect(r.out).toMatch(/já usa o Vertex AI/);
    expect(r.out).not.toMatch(/estudio-falsa|servico-falsa|anon-falsa/);
  });

  it("EMBEDDINGS_VERTEX=0 tira de propósito; tarefa nova (sem Vertex) segue como antes", () => {
    const off = deploy(JOB_ON_VERTEX, { EMBEDDINGS_VERTEX: "0" });
    expect(off.status).toBe(0);
    expect(off.deployLine).not.toContain("CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT");
    expect(off.calls.some((c) => c.includes("roles/aiplatform.user"))).toBe(false);
    const fresh = deploy(null);
    expect(fresh.status).toBe(0);
    expect(fresh.deployLine).not.toContain("CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT");
    expect(fresh.deployLine).toContain("CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL=1"); // pela chave do AI Studio do .env
    expect(fresh.calls.some((c) => c.includes("roles/aiplatform.user"))).toBe(false);
    const on = deploy(null, { EMBEDDINGS_VERTEX: "1" });
    expect(on.deployLine).toContain("CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT=staziamed-revalida-prod");
    expect(on.calls.some((c) => c.includes("roles/aiplatform.user"))).toBe(true);
  });

  it("EMBEDDINGS=0 desliga tudo, mesmo com a tarefa no Vertex AI", () => {
    const r = deploy(JOB_ON_VERTEX, { EMBEDDINGS: "0" });
    expect(r.status).toBe(0);
    expect(r.deployLine).not.toContain("CONTENT_HUB_EMBEDDINGS_");
  });
});
