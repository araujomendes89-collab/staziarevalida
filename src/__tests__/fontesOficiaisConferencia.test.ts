// @vitest-environment node
/**
 * Fontes oficiais com IA — conferência no servidor (Tarefas 4 e 5): o encaixe dos links na lista de sites oficiais, o download
 * conferido (até 50 MB, 60 s, 3 redirecionamentos, lista em cada salto) e a conferência de cada achado da IA (o arquivo existe,
 * é de um site oficial e o trecho citado está mesmo nele). Nada usa a internet, DNS nem IA de verdade.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openFontesDb, type FontesDb } from "./helpers/fontesDb";
import { chunkedStream, fakeWeb, makePdf } from "./helpers/fontesFixtures";
import { fetchBytes, fetchLink } from "../../server/podcasts/extract";
import { downloadOfficial, linkProblem, matchDomain, normalizeLink, OFFICIAL_FETCH, type OfficialDomain } from "../../server/contentHub/sources/officialDomains";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fontes-conferencia-"));
let t: FontesDb;
/** As 11 sementes da lista de sites oficiais, como o processamento as lê do banco. */
let domains: OfficialDomain[];

beforeAll(async () => {
  t = await openFontesDb(path.join(tmp, "db"));
  domains = (await t.dev.db.query<OfficialDomain>(`select id, address, institution, kind from public.ch_official_domains where active order by address`)).rows;
}, 300_000);

afterAll(async () => {
  await t?.dev.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}, 120_000);

/** Verificação de servidor que não consulta DNS. */
const noDns = async () => {};
const byAddress = (a: string) => domains.find((d) => d.address === a)!;

describe("Sites e download", () => {
  it("encaixe na lista: subdomínio, caminho inteiro, falsos e não ASCII", () => {
    expect(domains).toHaveLength(11);
    expect(matchDomain("https://www.gov.br/saude/x.pdf", domains)?.institution).toBe("Ministério da Saúde");
    expect(matchDomain("https://gov.br/saude", domains)?.address).toBe("gov.br/saude");
    expect(matchDomain("https://gov.br/saudemental/x", domains)).toBeNull();
    expect(matchDomain("https://gov.br/", domains)).toBeNull();
    expect(matchDomain("https://gov.br.exemplo.com/saude", domains)).toBeNull();
    expect(matchDomain("https://falsogov.br/saude", domains)).toBeNull();
    expect(matchDomain("https://gòv.br/saude", domains)).toBeNull();
    expect(matchDomain("https://ｇｏｖ.br/saude", domains)).toBeNull(); // letras largas: o servidor não aceita host fora do ASCII
    expect(matchDomain("https://gov.br/saude/../outro/x.pdf", domains)).toBeNull();
    expect(matchDomain("https://gov.br/saude%2f..%2foutro", domains)).toBeNull();
    expect(matchDomain("https://gov.br@exemplo.com/saude", domains)).toBeNull();
    // a linha mais longa que casa
    expect(matchDomain("https://iris.paho.org/a", domains)?.address).toBe("iris.paho.org");
    expect(matchDomain("https://www.paho.org/a", domains)?.address).toBe("paho.org");
    expect(matchDomain("https://WWW.WHO.INT/x", domains)?.institution).toBe("Organização Mundial da Saúde");
    expect(matchDomain(new URL("https://portal.cardiol.br/x"), domains)?.kind).toBe("sociedade");
  });

  it("link normalizado igual ao do banco", async () => {
    expect(normalizeLink("https://WWW.Gov.BR:443/Saude/X.pdf?utm_source=a&id=2#p3")).toBe("https://www.gov.br/Saude/X.pdf?id=2");
    const table = [
      "https://WWW.Gov.BR:443/Saude/X.pdf?utm_source=a&id=2#p3",
      "HTTPS://gov.br/a?utm_medium=x&UTM_Campaign=y",
      "https://gov.br/a?",
      "https://gov.br/a?x=1&&utm_source=a&",
      "https://gov.br/A/B?x=1&Y=%20z",
      "  https://who.int/x#",
      "https://User:Senha@GOV.br:443/p?q=1",
      "texto sem link #ancora",
    ];
    for (const link of table) {
      const db = (await t.dev.db.query<{ v: string | null }>(`select public.ch_url_norm($1) as v`, [link])).rows[0].v;
      expect(normalizeLink(link), link).toBe(db);
    }
    expect(normalizeLink("   ")).toBe("");
  });

  it("linkProblem: http, porta e usuário", () => {
    expect(linkProblem("https://www.gov.br/saude/x.pdf")).toBeNull();
    expect(linkProblem("https://www.gov.br:443/saude/x.pdf")).toBeNull();
    expect(linkProblem("http://www.gov.br/saude/x.pdf")).toBe("Link sem https.");
    expect(linkProblem("ftp://www.gov.br/x")).toBe("Link sem https.");
    expect(linkProblem("https://www.gov.br:8443/x")).toBe("Porta diferente de 443.");
    expect(linkProblem("https://usuario:senha@www.gov.br/x")).toBe("Link com usuário ou senha.");
    expect(linkProblem("https://usuario@www.gov.br/x")).toBe("Link com usuário ou senha.");
    expect(linkProblem("não é link")).toBe("Link inválido.");
    expect(linkProblem("https://www.gov.br/a b")).toBe("Link inválido.");
    expect(linkProblem("")).toBe("Link inválido.");
  });

  it("download: redirecionamento para fora da lista, endereço interno, tipo errado, 429", async () => {
    const pdf = makePdf(["Texto do PCDT sintetico."]);
    // 1) salto para fora da lista
    const out = fakeWeb({ "https://www.gov.br/saude/a.pdf": { status: 302, headers: { location: "https://exemplo.com/b.pdf" } } });
    await expect(downloadOfficial("https://www.gov.br/saude/a.pdf", domains, out, noDns)).rejects.toThrow("Redirecionamento para fora da lista de sites oficiais.");
    expect(out.calls.map((c) => c.url)).toEqual(["https://www.gov.br/saude/a.pdf"]); // o destino de fora nem foi pedido
    // o primeiro endereço também precisa estar na lista
    const never = fakeWeb({});
    await expect(downloadOfficial("https://exemplo.com/b.pdf", domains, never, noDns)).rejects.toThrow("Redirecionamento para fora da lista de sites oficiais.");
    expect(never.calls).toHaveLength(0);
    // salto para http
    const toHttp = fakeWeb({ "https://www.gov.br/saude/a.pdf": { status: 301, headers: { location: "http://www.gov.br/saude/b.pdf" } } });
    await expect(downloadOfficial("https://www.gov.br/saude/a.pdf", domains, toHttp, noDns)).rejects.toThrow(/Só links https/);
    // 2) endereço interno: o servidor do site da lista resolve para a rede privada
    const internal = fakeWeb({ "https://www.gov.br/saude/a.pdf": { body: pdf } });
    const privateHost = async () => {
      throw new Error("Endereço interno não é aceito.");
    };
    await expect(downloadOfficial("https://www.gov.br/saude/a.pdf", domains, internal, privateHost)).rejects.toThrow(/Endereço interno/);
    expect(internal.calls).toHaveLength(0);
    // sem verificação própria, o padrão recusa IP privado sem consultar DNS
    await expect(fetchBytes("https://10.0.0.5/x", never, { maxBytes: 1000, timeoutMs: 1000, userAgent: "t" })).rejects.toThrow(/Endereço interno/);
    await expect(fetchBytes("https://localhost/x", never, { maxBytes: 1000, timeoutMs: 1000, userAgent: "t" })).rejects.toThrow(/Endereço interno/);
    // 3) tipo errado
    const types = fakeWeb({
      "https://www.gov.br/saude/img.png": { headers: { "content-type": "image/png" }, body: Buffer.from([1, 2, 3]) },
      "https://www.gov.br/saude/nota.txt": { headers: { "content-type": "text/plain" }, body: "só texto" },
      "https://www.gov.br/saude/falso.pdf": { headers: { "content-type": "application/pdf" }, body: "<html>não sou pdf</html>" },
      "https://www.gov.br/saude/semtipo": { body: Buffer.from([9, 9, 9]) },
    });
    await expect(downloadOfficial("https://www.gov.br/saude/img.png", domains, types, noDns)).rejects.toThrow("O link não é uma página nem um PDF.");
    await expect(downloadOfficial("https://www.gov.br/saude/nota.txt", domains, types, noDns)).rejects.toThrow("O link não é PDF nem página HTML.");
    await expect(downloadOfficial("https://www.gov.br/saude/falso.pdf", domains, types, noDns)).rejects.toThrow("O arquivo não é um PDF (assinatura %PDF- ausente).");
    await expect(downloadOfficial("https://www.gov.br/saude/semtipo", domains, types, noDns)).rejects.toThrow("O link não é uma página nem um PDF.");
    // 4) o site pede para esperar / bloqueia / outro erro
    const status = fakeWeb({
      "https://www.gov.br/saude/a": { status: 429 },
      "https://www.gov.br/saude/b": { status: 403 },
      "https://www.gov.br/saude/c": { status: 500 },
    });
    await expect(downloadOfficial("https://www.gov.br/saude/a", domains, status, noDns)).rejects.toThrow("O site pediu para esperar (429).");
    await expect(downloadOfficial("https://www.gov.br/saude/b", domains, status, noDns)).rejects.toThrow("O site bloqueou o download (403).");
    await expect(downloadOfficial("https://www.gov.br/saude/c", domains, status, noDns)).rejects.toThrow("O link respondeu 500.");
    // 5) redireciona demais (4 saltos)
    const loop = fakeWeb({
      "https://www.gov.br/saude/1": { status: 302, headers: { location: "/saude/2" } },
      "https://www.gov.br/saude/2": { status: 302, headers: { location: "/saude/3" } },
      "https://www.gov.br/saude/3": { status: 302, headers: { location: "/saude/4" } },
      "https://www.gov.br/saude/4": { status: 302, headers: { location: "/saude/5" } },
      "https://www.gov.br/saude/5": { body: pdf, headers: { "content-type": "application/pdf" } },
    });
    await expect(downloadOfficial("https://www.gov.br/saude/1", domains, loop, noDns)).rejects.toThrow("O link redireciona demais.");
    expect(loop.calls).toHaveLength(4);
  });

  it("download: corta acima do limite mesmo sem tamanho declarado", async () => {
    expect(OFFICIAL_FETCH.maxBytes).toBe(52428800);
    expect(OFFICIAL_FETCH.timeoutMs).toBe(60000);
    const opts = { maxBytes: 1000, timeoutMs: 5000, userAgent: "teste", checkHost: noDns };
    const stream = fakeWeb({ "https://www.gov.br/saude/grande.pdf": { stream: chunkedStream(100_000), headers: { "content-type": "application/pdf" } } });
    await expect(fetchBytes("https://www.gov.br/saude/grande.pdf", stream, opts)).rejects.toThrow(/passa de/);
    // tamanho declarado acima do limite: nem lê o corpo
    const declared = fakeWeb({ "https://www.gov.br/saude/declarado.pdf": { body: Buffer.alloc(2000, 65), headers: { "content-type": "application/pdf", "content-length": "2000" } } });
    await expect(fetchBytes("https://www.gov.br/saude/declarado.pdf", declared, opts)).rejects.toThrow(/O conteúdo do link passa de .* MB\./);
    // dentro do limite passa
    const ok = fakeWeb({ "https://www.gov.br/saude/ok.html": { body: "<html><body>pequeno</body></html>", headers: { "content-type": "text/html" } } });
    const got = await fetchBytes("https://www.gov.br/saude/ok.html", ok, opts);
    expect(got.kind).toBe("html");
    expect(got.body.toString()).toContain("pequeno");
    // a mensagem usa o limite em MB
    const big = fakeWeb({ "https://www.gov.br/saude/g.pdf": { stream: chunkedStream(3 * 1024 * 1024, 65536), headers: { "content-type": "application/pdf" } } });
    await expect(fetchBytes("https://www.gov.br/saude/g.pdf", big, { ...opts, maxBytes: 2 * 1024 * 1024 })).rejects.toThrow("O conteúdo do link passa de 2 MB.");
  });

  it("download: tempo esgotado", async () => {
    // o servidor de mentira só responde quando o sinal aborta
    const hang = ((_url: string, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("abortado")));
      })) as unknown as typeof fetch;
    await expect(fetchBytes("https://www.gov.br/saude/lento.pdf", hang, { maxBytes: 1000, timeoutMs: 50, userAgent: "t", checkHost: noDns })).rejects.toThrow(/Tempo esgotado/);
    // corpo que nunca termina
    const slowBody = (async () =>
      new Response(
        new ReadableStream({
          pull() {
            return new Promise(() => {});
          },
        }),
        { status: 200, headers: { "content-type": "application/pdf" } },
      )) as unknown as typeof fetch;
    await expect(fetchBytes("https://www.gov.br/saude/lento.pdf", slowBody, { maxBytes: 1000, timeoutMs: 50, userAgent: "t", checkHost: noDns })).rejects.toThrow(/Tempo esgotado/);
    // a rede ignora o sinal e nunca responde
    const deaf = (() => new Promise(() => {})) as unknown as typeof fetch;
    await expect(fetchBytes("https://www.gov.br/saude/lento.pdf", deaf, { maxBytes: 1000, timeoutMs: 50, userAgent: "t", checkHost: noDns })).rejects.toThrow("Tempo esgotado ao baixar (1 s).");
  });

  it("download: identifica-se como StaziaMed-Fontes/1.0 e devolve o link final e a linha do site final", async () => {
    const pdf = makePdf(["Protocolo clinico sintetico de teste."]);
    const web = fakeWeb({
      "https://www.gov.br/saude/a.pdf": { status: 302, headers: { location: "https://bvsms.saude.gov.br/bvs/b.pdf" } },
      "https://bvsms.saude.gov.br/bvs/b.pdf": { body: pdf, headers: { "content-type": "application/octet-stream" } },
    });
    const got = await downloadOfficial("https://www.gov.br/saude/a.pdf", domains, web, noDns);
    expect(got.kind).toBe("pdf");
    expect(got.finalUrl).toBe("https://bvsms.saude.gov.br/bvs/b.pdf");
    expect(got.domain).toEqual(byAddress("bvsms.saude.gov.br"));
    expect(got.body.equals(pdf)).toBe(true);
    expect(web.calls.map((c) => c.headers["User-Agent"])).toEqual(["StaziaMed-Fontes/1.0", "StaziaMed-Fontes/1.0"]);
    const html = fakeWeb({ "https://www.who.int/x": { body: "<html><title>OMS</title></html>", headers: { "content-type": "text/html; charset=utf-8" } } });
    expect((await downloadOfficial("https://www.who.int/x", domains, html, noDns)).kind).toBe("html");
  });

  it("fetchLink (podcasts e assistente) segue com as mesmas frases", async () => {
    const web = fakeWeb({
      "https://exemplo.gov.br/429": { status: 429 },
      "https://exemplo.gov.br/403": { status: 403 },
      "https://exemplo.gov.br/img": { headers: { "content-type": "image/png" }, body: "x" },
      "https://exemplo.gov.br/p": { headers: { "content-type": "text/html" }, body: "<title>Página</title><p>Olá mundo</p>" },
      "https://exemplo.gov.br/f.pdf": { headers: { "content-type": "application/pdf" }, body: "nada" },
      "https://exemplo.gov.br/g": { headers: { "content-type": "text/html", "content-length": String(9 * 1024 * 1024) }, body: "x" },
    });
    await expect(fetchLink("https://exemplo.gov.br/429", web, noDns)).rejects.toThrow("O link respondeu 429.");
    await expect(fetchLink("https://exemplo.gov.br/403", web, noDns)).rejects.toThrow("O link respondeu 403.");
    await expect(fetchLink("https://exemplo.gov.br/img", web, noDns)).rejects.toThrow("O link não é uma página nem um PDF.");
    await expect(fetchLink("https://exemplo.gov.br/f.pdf", web, noDns)).rejects.toThrow(/^O arquivo não é/);
    await expect(fetchLink("https://exemplo.gov.br/g", web, noDns)).rejects.toThrow("O conteúdo do link passa de 8 MB.");
    const page = await fetchLink("https://exemplo.gov.br/p", web, noDns);
    expect(page).toMatchObject({ title: "Página", kind: "html", pages: [{ page: null, text: "Olá mundo" }] });
    expect(web.calls.find((c) => c.url.endsWith("/p"))!.headers["User-Agent"]).toMatch(/^StaziaMed-Podcast\/1\.0/);
  });
});
