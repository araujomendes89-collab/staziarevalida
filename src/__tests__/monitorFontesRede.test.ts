// @vitest-environment node
/**
 * Monitor de fontes (worker.checkSources): proteções de rede do download. Tudo com falsos, sem rede e sem banco:
 * endereço interno/privado em qualquer grafia, redirecionamentos conferidos (máx. 3, só https, porta 443, sem usuário),
 * corpo limitado a 50 MB, e um endereço ruim não derruba os outros da mesma rodada.
 */
import { describe, expect, it } from "vitest";
import { createContentHubWorker, publicationHash } from "../../server/contentHub/worker";
import { snapshotPassages } from "../../server/contentHub/sourceDiff";
import type { PipelineDeps } from "../../server/contentHub/pipeline";

const PUBLIC_IP = "93.184.216.34";

function setup(urls: string[], fetchImpl: typeof fetch, extra: { resolver?: (h: string) => Promise<string[]> } = {}) {
  const results: { source_id: string; hash: string | null; status: string }[] = [];
  const snapshots: { source_id: string; passages: unknown[] }[] = [];
  const logs: string[] = [];
  const db = {
    service: async (name: string, p: any) => {
      if (name === "ch_worker_watch_due") return urls.map((url, i) => ({ source_id: `s${i}`, url }));
      if (name === "ch_worker_watch_result") {
        results.push({ source_id: p.p_source_id, hash: p.p_hash, status: p.p_status });
        return { changed: false };
      }
      if (name === "ch_worker_watch_snapshot") {
        snapshots.push({ source_id: p.p_source_id, passages: p.p_passages });
        return null;
      }
      throw new Error(`chamada inesperada: ${name}`);
    },
  };
  const deps = { db, log: (m: string) => logs.push(m) } as unknown as PipelineDeps;
  const worker = createContentHubWorker(deps, { fetchImpl, resolver: extra.resolver ?? (async () => [PUBLIC_IP]) });
  return { worker, results, snapshots, logs };
}

const never = (calls: string[]) =>
  (async (url: any) => {
    calls.push(String(url));
    return new Response("<p>oi</p>", { status: 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;

describe("monitor de fontes: rede", () => {
  it("endereço https normal: hash e snapshot iguais aos de antes (HTML e PDF)", async () => {
    const html = "<html><body><p>Primeiro parágrafo da página oficial.</p><p>Segundo parágrafo.</p></body></html>";
    const pdf = "%PDF-1.7 conteúdo";
    const fetchImpl = (async (url: any) => {
      expect(String(url)).toMatch(/^https:\/\//);
      return String(url).endsWith(".pdf")
        ? new Response(pdf, { status: 200, headers: { "content-type": "application/pdf" } })
        : new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }) as unknown as typeof fetch;
    const { worker, results, snapshots, logs } = setup(["https://exemplo.gov.br/pagina", "https://exemplo.gov.br/doc.pdf"], fetchImpl);
    expect(await worker.checkSources()).toEqual({ checked: 2, changed: 0, unreachable: 0 });
    expect(results).toEqual([
      { source_id: "s0", hash: publicationHash(Buffer.from(html), "text/html; charset=utf-8"), status: "ok" },
      { source_id: "s1", hash: publicationHash(Buffer.from(pdf), "application/pdf"), status: "ok" },
    ]);
    expect(snapshots).toEqual([{ source_id: "s0", passages: snapshotPassages(html, "text/html; charset=utf-8") }]);
    expect(logs).toEqual([]);
  });

  it("tipo de conteúdo qualquer (xml, json, sem tipo) continua valendo, como antes", async () => {
    const fetchImpl = (async () => new Response('{"a":1}', { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const { worker, results } = setup(["https://exemplo.gov.br/dados"], fetchImpl);
    expect(await worker.checkSources()).toMatchObject({ unreachable: 0 });
    expect(results[0]).toEqual({ source_id: "s0", hash: publicationHash(Buffer.from('{"a":1}'), "application/json"), status: "ok" });
  });

  it("status de erro mantém a mensagem 'HTTP N' e vira inacessível", async () => {
    const fetchImpl = (async () => new Response("não achei", { status: 404 })) as unknown as typeof fetch;
    const { worker, results, logs } = setup(["https://exemplo.gov.br/x"], fetchImpl);
    expect(await worker.checkSources()).toEqual({ checked: 1, changed: 0, unreachable: 1 });
    expect(results[0]).toEqual({ source_id: "s0", hash: null, status: "unreachable" });
    expect(logs).toEqual(["[central] fonte inacessível (https://exemplo.gov.br/x): HTTP 404"]);
  });

  const BLOCKED = [
    "https://127.0.0.1/x",
    "https://[::1]/x",
    "https://169.254.169.254/x",
    "https://10.0.0.5/x",
    "https://[::ffff:169.254.169.254]/x",
    "https://[::ffff:a9fe:a9fe]/x",
    "https://2130706433/",
    "https://0x7f000001/",
    "https://0177.0.0.1/",
    "https://127.1/",
    "https://192.168.1.1/",
    "https://172.16.0.1/",
    "https://[fd00::1]/x",
    "https://[fe80::1]/x",
    "https://localhost/x",
    "https://servico.internal/x",
    "http://exemplo.gov.br/x",
    "https://exemplo.gov.br:8443/x",
    "https://usuario:senha@exemplo.gov.br/x",
  ];
  for (const url of BLOCKED) {
    it(`recusa ${url} como fonte inacessível, sem nenhuma requisição`, async () => {
      const calls: string[] = [];
      const { worker, results, logs } = setup([url], never(calls));
      expect(await worker.checkSources()).toEqual({ checked: 1, changed: 0, unreachable: 1 });
      expect(results).toEqual([{ source_id: "s0", hash: null, status: "unreachable" }]);
      expect(calls).toEqual([]);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain(`fonte inacessível (${url})`);
    });
  }

  it("nome que resolve para endereço interno (DNS rebinding na conferência) é recusado", async () => {
    const calls: string[] = [];
    const { worker, results, logs } = setup(["https://malicioso.exemplo.gov.br/x"], never(calls), { resolver: async () => [PUBLIC_IP, "10.0.0.7"] });
    expect(await worker.checkSources()).toMatchObject({ unreachable: 1 });
    expect(results[0].status).toBe("unreachable");
    expect(calls).toEqual([]);
    expect(logs[0]).toContain("Endereço interno não é aceito.");
  });

  it("mensagem de bloqueio vem em português", async () => {
    const { worker, logs } = setup(["https://127.0.0.1/x"], never([]));
    await worker.checkSources();
    expect(logs[0]).toBe("[central] fonte inacessível (https://127.0.0.1/x): Endereço interno não é aceito.");
  });

  const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

  it("redirecionamento válido (até 3) é seguido", async () => {
    const hops: string[] = [];
    const fetchImpl = (async (url: any) => {
      hops.push(String(url));
      if (hops.length <= 3) return redirect(`https://exemplo.gov.br/${hops.length}`);
      return new Response("%PDF-1.7 fim", { status: 200, headers: { "content-type": "application/pdf" } });
    }) as unknown as typeof fetch;
    const { worker, results } = setup(["https://exemplo.gov.br/0"], fetchImpl);
    expect(await worker.checkSources()).toMatchObject({ unreachable: 0 });
    expect(results[0].status).toBe("ok");
    expect(hops).toHaveLength(4);
  });

  it("mais de 3 redirecionamentos é recusado", async () => {
    let n = 0;
    const fetchImpl = (async () => redirect(`https://exemplo.gov.br/${++n}`)) as unknown as typeof fetch;
    const { worker, results, logs } = setup(["https://exemplo.gov.br/0"], fetchImpl);
    expect(await worker.checkSources()).toMatchObject({ unreachable: 1 });
    expect(results[0].status).toBe("unreachable");
    expect(n).toBe(4);
    expect(logs[0]).toContain("O link redireciona demais.");
  });

  for (const [nome, destino] of [
    ["host interno (metadados da nuvem)", "https://169.254.169.254/latest/meta-data"],
    ["loopback IPv6", "https://[::1]/"],
    ["IPv4 em decimal", "https://2130706433/"],
    ["http sem criptografia", "http://exemplo.gov.br/x"],
    ["porta diferente de 443", "https://exemplo.gov.br:8443/x"],
    ["usuário e senha", "https://u:p@exemplo.gov.br/x"],
    ["localhost", "https://localhost/x"],
  ] as const) {
    it(`redirecionamento para ${nome} é recusado e o destino nunca é buscado`, async () => {
      const calls: string[] = [];
      const fetchImpl = (async (url: any) => {
        calls.push(String(url));
        return redirect(destino);
      }) as unknown as typeof fetch;
      const { worker, results } = setup(["https://exemplo.gov.br/0"], fetchImpl);
      expect(await worker.checkSources()).toMatchObject({ unreachable: 1 });
      expect(results[0].status).toBe("unreachable");
      expect(calls).toEqual(["https://exemplo.gov.br/0"]);
    });
  }

  it("redirecionamento cujo nome resolve para endereço interno é recusado", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: any) => {
      calls.push(String(url));
      return redirect("https://interno.exemplo.gov.br/x");
    }) as unknown as typeof fetch;
    const resolver = async (h: string) => (h.startsWith("interno.") ? ["10.1.2.3"] : [PUBLIC_IP]);
    const { worker, results } = setup(["https://exemplo.gov.br/0"], fetchImpl, { resolver });
    expect(await worker.checkSources()).toMatchObject({ unreachable: 1 });
    expect(results[0].status).toBe("unreachable");
    expect(calls).toEqual(["https://exemplo.gov.br/0"]);
  });

  it("corpo acima de 50 MB é cortado sem ler tudo (memória limitada)", async () => {
    const MB = 1024 * 1024;
    let pulled = 0;
    const fetchImpl = (async () => {
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled++;
          if (pulled > 500) return controller.close();
          controller.enqueue(new Uint8Array(MB));
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/html" } }); // sem content-length
    }) as unknown as typeof fetch;
    const { worker, results, logs } = setup(["https://exemplo.gov.br/enorme"], fetchImpl);
    expect(await worker.checkSources()).toMatchObject({ unreachable: 1 });
    expect(results[0]).toEqual({ source_id: "s0", hash: null, status: "unreachable" });
    expect(pulled).toBeLessThan(60);
    expect(logs[0]).toContain("passa de 50 MB");
  });

  it("tamanho declarado acima de 50 MB é recusado antes de ler", async () => {
    const fetchImpl = (async () => new Response("x", { status: 200, headers: { "content-type": "text/html", "content-length": String(60 * 1024 * 1024) } })) as unknown as typeof fetch;
    const { worker, results, logs } = setup(["https://exemplo.gov.br/enorme"], fetchImpl);
    expect(await worker.checkSources()).toMatchObject({ unreachable: 1 });
    expect(results[0].status).toBe("unreachable");
    expect(logs[0]).toContain("passa de 50 MB");
  });

  it("um endereço ruim não impede os outros da mesma rodada", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: any) => {
      calls.push(String(url));
      return new Response("<p>pagina boa</p>", { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;
    const urls = ["https://127.0.0.1/x", "https://exemplo.gov.br/a", "http://exemplo.gov.br/b", "https://[::ffff:169.254.169.254]/x", "https://exemplo.gov.br/c"];
    const { worker, results } = setup(urls, fetchImpl);
    expect(await worker.checkSources()).toEqual({ checked: 5, changed: 0, unreachable: 3 });
    expect(results.map((r) => r.status)).toEqual(["unreachable", "ok", "unreachable", "unreachable", "ok"]);
    expect(calls).toEqual(["https://exemplo.gov.br/a", "https://exemplo.gov.br/c"]);
  });
});
