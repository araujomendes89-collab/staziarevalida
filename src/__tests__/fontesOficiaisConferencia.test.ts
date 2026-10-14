// @vitest-environment node
/**
 * Fontes oficiais com IA — conferência no servidor (Tarefas 4 e 5): o encaixe dos links na lista de sites oficiais, o download
 * conferido (até 50 MB, 60 s, 3 redirecionamentos, lista em cada salto) e a conferência de cada achado da IA (o arquivo existe,
 * é de um site oficial e o trecho citado está mesmo nele). Nada usa a internet, DNS nem IA de verdade.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { openFontesDb, type FontesDb } from "./helpers/fontesDb";
import { chunkedStream, fakeWeb, makePdf } from "./helpers/fontesFixtures";
import { fetchBytes, fetchLink } from "../../server/podcasts/extract";
import { localStorageDir, type Storage } from "../../server/contentHub/infra";
import {
  candidateKey,
  findQuote,
  FINDING_SCHEMA,
  foldForQuote,
  LEVEL_BY_KIND,
  natureToSourceType,
  previewText,
  readFileText,
  verifyFinding,
  type Finding,
  type VerifyContext,
} from "../../server/contentHub/sources/verify";
import { validate } from "../../server/contentHub/ai/schema";
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
    expect(domains).toHaveLength(21); // 11 sementes + 10 sites da Vigilância científica (9940)
    expect(matchDomain("https://www.gov.br/saude/x.pdf", domains)?.institution).toBe("Ministério da Saúde");
    expect(matchDomain("https://www.gov.br/saude", domains)?.address).toBe("www.gov.br/saude");
    // o site do ministério é o www.gov.br: prefeitura e estado (qualquer *.gov.br com /saude) NÃO são o Ministério da Saúde
    expect(matchDomain("https://prefeitura.sp.gov.br/saude/x.pdf", domains)).toBeNull();
    expect(matchDomain("https://saude.sp.gov.br/saude", domains)).toBeNull();
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

describe("Conferência", () => {
  const storageDir = path.join(tmp, "storage");
  const storage = localStorageDir(storageDir);
  const sql = async (q: string, params: unknown[] = []) => (await t.dev.db.query<any>(q, params)).rows;
  let seq = 0;
  /** Texto de PDF de mentira com mais de 100 caracteres, sem acentos (a fonte do PDF de teste não os declara). */
  // uma linha por frase: texto que passa da margem da página de teste é cortado na leitura
  const LONG = "Gestantes com pre-eclampsia grave devem receber\nsulfato de magnesio no ataque e na manutencao,\ncom vigilancia da diurese.";
  const QUOTE = "sulfato de magnesio no ataque e na manutencao";

  async function newSearch(): Promise<string> {
    const r = await t.db.asUser<any>(t.adminUser, "app_ch_source_search_start", { p_request: { area: "GINECOLOGIA_OBSTETRICIA", theme: `Tema da conferencia ${++seq}` } });
    return r.searches[0].id;
  }
  const finding = (over: Partial<Finding> = {}): Finding => ({
    titulo: "PCDT sintetico de pre-eclampsia",
    instituicao: "Ministerio da Saude",
    link: "https://www.gov.br/saude/pcdt.pdf",
    data_publicacao: "2025-03-14",
    natureza: "Protocolo Clinico e Diretrizes Terapeuticas",
    tipo: "final",
    nivel_sugerido: "A",
    motivo: "Documento oficial sobre o tema.",
    trecho: QUOTE,
    ...over,
  });
  async function ctx(over: Partial<VerifyContext> = {}): Promise<VerifyContext> {
    return { db: t.db, storage, searchId: await newSearch(), domains, seenUrls: [], fetchImpl: fakeWeb({}), checkHost: noDns, ...over };
  }
  const pdfRoute = (pdf: Buffer) => ({ body: pdf, headers: { "content-type": "application/pdf" } });

  it("trecho normalizado: caixa, acentos, espaços e hífen de quebra de linha", () => {
    const pages = [
      { page: 1, text: "Outra página sem relação com o trecho procurado." },
      { page: 2, text: "Gestantes com PRÉ-\neclâmpsia grave  devem" },
    ];
    expect(findQuote("gestantes com pre-eclampsia grave devem", pages)).toEqual({ found: true, page: 2 });
    expect(foldForQuote("  Pré-eclâmpsia\u00A0GRAVE ")).toBe("preeclampsia grave");
  });

  it("trecho com tipografia de PDF continua conferido", () => {
    const pages = [{ page: 1, text: "Cabeçalho do documento.\nA con\uFB01rmação “laboratorial”\u00A0– em até 48 h depois da coleta." }];
    expect(findQuote('A confirmação "laboratorial" - em até 48 h', pages)).toEqual({ found: true, page: 1 });
    // palavra com hífen de quebra de linha ('-', hífen U+2010 e hífen suave) e trecho que atravessa a quebra de página
    expect(findQuote("anti-hipertensivo oral de primeira linha", [{ page: 3, text: "usa-se anti\u2010\nhipertensivo oral de pri\u00ADmeira linha" }])).toEqual({ found: true, page: 3 });
    expect(findQuote("termina na pagina um e segue na dois", [{ page: 1, text: "Este trecho termina na pagina um" }, { page: 2, text: "e segue na dois." }])).toEqual({ found: true, page: 1 });
  });

  it("trecho curto ou ausente é recusado; página web devolve página nula", () => {
    const pages = [{ page: 1, text: "Texto qualquer do documento oficial." }];
    expect(findQuote("", pages)).toEqual({ found: false, page: null });
    expect(findQuote("   ", pages)).toEqual({ found: false, page: null });
    expect(findQuote("trecho que não existe neste documento", pages)).toEqual({ found: false, page: null });
    expect(findQuote("documento oficial", [{ page: null, text: "Texto da página: documento oficial." }])).toEqual({ found: true, page: null });
  });

  it("título e data do arquivo", async () => {
    const pdf = makePdf(["Primeira linha da pagina um.\n" + LONG], { title: "PCDT Sintético", creationDate: "D:20250314" });
    expect(await readFileText("pdf", pdf)).toMatchObject({ title: "PCDT Sintético", date: "2025-03-14", pages: [{ page: 1 }] });
    // sem metadados: a primeira linha da primeira página; data só com ano
    const bare = await readFileText("pdf", makePdf(["Titulo na primeira linha\n" + LONG]));
    expect(bare).toMatchObject({ title: "Titulo na primeira linha", date: null });
    expect((await readFileText("pdf", makePdf([LONG], { creationDate: "D:2024" }))).date).toBe("2024");
    expect((await readFileText("pdf", makePdf([LONG], { creationDate: "D:20251345" }))).date).toBeNull();

    const html = `<html><head><title>Diretriz &amp; Cia</title><meta property="article:published_time" content="2024-11-02T10:00:00Z"></head><body><nav>Menu</nav><p>${LONG}</p></body></html>`;
    expect(await readFileText("html", Buffer.from(html))).toMatchObject({ title: "Diretriz & Cia", date: "2024-11-02", pages: [{ page: null, text: expect.stringContaining("sulfato de magnesio") }] });
    // sem <title>: o primeiro <h1>; outras datas aceitas, na ordem de prioridade
    const h1 = `<html><head><meta name="DC.date" content="2023/05/09"><meta name="date" content="2020-01-01"></head><body><h1>Título <b>da página</b></h1><p>${LONG}</p></body></html>`;
    expect(await readFileText("html", Buffer.from(h1))).toMatchObject({ title: "Título da página", date: "2023-05-09" });
    // página antiga em Latin-1 com o charset declarado
    const latin = Buffer.concat([Buffer.from('<html><head><meta charset="iso-8859-1"><title>', "latin1"), Buffer.from("Proteção", "latin1"), Buffer.from("</title></head><body>x</body></html>", "latin1")]);
    expect((await readFileText("html", latin)).title).toBe("Proteção");
  });

  it("apoio: natureza, chave do arquivo, prévia e esquema", () => {
    expect(natureToSourceType("Protocolo Clínico e Diretrizes Terapêuticas")).toBe("PCDT");
    expect(natureToSourceType("PCDT")).toBe("PCDT");
    expect(natureToSourceType("Diretriz brasileira")).toBe("GUIDELINE");
    expect(natureToSourceType("Clinical Guideline")).toBe("GUIDELINE");
    expect(natureToSourceType("Manual técnico")).toBe("MANUAL");
    expect(natureToSourceType("Consenso de especialistas")).toBe("CONSENSUS");
    expect(natureToSourceType("Portaria ministerial")).toBe("LAW");
    expect(natureToSourceType("Nota informativa")).toBe("DOCUMENT");
    expect(natureToSourceType("")).toBe("DOCUMENT");
    expect(candidateKey("a".repeat(64), "pdf")).toBe(`source-candidates/${"a".repeat(64)}.pdf`);
    expect(candidateKey("b".repeat(64), "html")).toBe(`source-candidates/${"b".repeat(64)}.html`);
    expect(LEVEL_BY_KIND).toEqual({ governo: "A", sociedade: "B", internacional: "C" });
    const pages = [1, 2, 3, 4].map((n) => ({ page: n, text: `P${n} ` + "x".repeat(2500) }));
    expect(previewText(pages)).toHaveLength(6000);
    expect(previewText(pages)).toContain("P3 ");
    expect(previewText(pages)).not.toContain("P4 ");
    // esquema: nível E nunca entra, tipo fora da lista, trecho curto, campo a mais
    expect(validate(FINDING_SCHEMA, finding())).toEqual([]);
    expect(validate(FINDING_SCHEMA, finding({ data_publicacao: null }))).toEqual([]);
    expect(validate(FINDING_SCHEMA, { ...finding(), nivel_sugerido: "E" })).not.toEqual([]);
    expect(validate(FINDING_SCHEMA, { ...finding(), tipo: "outro" })).not.toEqual([]);
    expect(validate(FINDING_SCHEMA, { ...finding(), trecho: "curto" })).not.toEqual([]);
    expect(validate(FINDING_SCHEMA, { ...finding(), extra: 1 })).not.toEqual([]);
  });

  it("achado bom vira candidato aguardando com arquivo guardado", async () => {
    const pdf = makePdf([LONG, "Segunda pagina com outro assunto."], { title: "PCDT Sintetico", creationDate: "D:20250314" });
    const web = fakeWeb({ "https://www.gov.br/saude/pcdt.pdf": pdfRoute(pdf) });
    const c = await ctx({ fetchImpl: web, seenUrls: ["https://WWW.gov.br/saude/pcdt.pdf?utm_source=busca#x"] });
    const out = await verifyFinding(finding(), c);
    expect(out.ok).toBe(true);
    const sha = crypto.createHash("sha256").update(pdf).digest("hex");
    const [row] = await sql(`select * from public.ch_source_candidates where id = $1`, [(out as { candidateId: string }).candidateId]);
    expect(row).toMatchObject({
      status: "aguardando",
      search_id: c.searchId,
      domain_id: byAddress("www.gov.br/saude").id,
      site_address: "www.gov.br/saude",
      site_kind: "governo",
      requested_url: "https://www.gov.br/saude/pcdt.pdf",
      final_url: "https://www.gov.br/saude/pcdt.pdf",
      ai_title: "PCDT sintetico de pre-eclampsia",
      ai_published: "2025-03-14",
      ai_kind: "final",
      ai_level: "A",
      file_title: "PCDT Sintetico",
      file_date: "2025-03-14",
      quote: QUOTE,
      quote_page: 1,
      seen_in_search: true,
      file_kind: "pdf",
      sha256: sha,
      size_bytes: pdf.length,
      page_count: 2,
      storage_path: `source-candidates/${sha}.pdf`,
      suggested_level: "A",
      suggested_kind: "final",
      suggested_nature: "PCDT",
    });
    expect(row.preview.length).toBeGreaterThan(50);
    expect(row.preview.length).toBeLessThanOrEqual(6000);
    expect(row.preview).toContain("sulfato de magnesio");
    expect(await storage.exists(`source-candidates/${sha}.pdf`)).toBe(true);
    expect((await storage.get(`source-candidates/${sha}.pdf`)).equals(pdf)).toBe(true);
    // a segunda tentativa do mesmo achado é repetida
    expect(await verifyFinding(finding(), await ctx({ fetchImpl: web }))).toEqual({ ok: false, motivo: "Repetido: candidato aguardando sua conferência." });
  });

  it("achado de página web e de site internacional: página nula, nível do tipo de site, link visto só pelo link final", async () => {
    const html = `<html><head><title>Guia da OMS</title></head><body><p>${LONG}</p></body></html>`;
    const web = fakeWeb({
      "https://www.who.int/pt/guia": { status: 302, headers: { location: "https://www.who.int/pt/guia-final" } },
      "https://www.who.int/pt/guia-final": { body: html, headers: { "content-type": "text/html; charset=utf-8" } },
    });
    const c = await ctx({ fetchImpl: web, seenUrls: ["https://www.who.int/pt/guia-final"] });
    const out = await verifyFinding(finding({ link: "https://www.who.int/pt/guia", tipo: "society_guideline", natureza: "Guideline", nivel_sugerido: "B" }), c);
    expect(out.ok).toBe(true);
    const [row] = await sql(`select * from public.ch_source_candidates where id = $1`, [(out as { candidateId: string }).candidateId]);
    expect(row).toMatchObject({
      file_kind: "html",
      quote_page: null,
      page_count: null,
      file_title: "Guia da OMS",
      requested_url: "https://www.who.int/pt/guia",
      final_url: "https://www.who.int/pt/guia-final",
      seen_in_search: true,
      site_kind: "internacional",
      ai_level: "B",
      suggested_level: "C",
      suggested_kind: "society_guideline",
      suggested_nature: "GUIDELINE",
    });
    expect(row.storage_path).toMatch(/^source-candidates\/[0-9a-f]{64}\.html$/);
    // link que a IA não viu na busca: ainda vale (o que prova é o trecho), mas fica marcado
    const unseen = await verifyFinding(
      finding({ link: "https://www.who.int/pt/outro" }),
      await ctx({ fetchImpl: fakeWeb({ "https://www.who.int/pt/outro": { body: html.replace("Guia da OMS", "Outro guia") + "<!-- outro -->", headers: { "content-type": "text/html" } } }), seenUrls: [] }),
    );
    expect(unseen.ok).toBe(true);
    const [row2] = await sql(`select seen_in_search from public.ch_source_candidates where id = $1`, [(unseen as { candidateId: string }).candidateId]);
    expect(row2.seen_in_search).toBe(false);
  });

  it("motivos de descarte", async () => {
    const pdf = makePdf([LONG]);
    const web = fakeWeb({
      "https://www.gov.br/saude/ok.pdf": pdfRoute(pdf),
      "https://www.gov.br/saude/vazio.pdf": pdfRoute(makePdf([""])),
      "https://www.gov.br/saude/quebrado.pdf": { body: "%PDF-1.4\nlixo sem estrutura nenhuma", headers: { "content-type": "application/pdf" } },
      "https://www.gov.br/saude/404.pdf": { status: 404 },
      "https://www.gov.br/saude/vai.pdf": { status: 302, headers: { location: "https://exemplo.com/x.pdf" } },
    });
    const c = await ctx({ fetchImpl: web });
    const descarte = async (item: unknown) => {
      const r = await verifyFinding(item, c);
      expect(r.ok).toBe(false);
      return (r as { motivo: string }).motivo;
    };
    const motivo = (over: Partial<Finding>) => descarte(finding(over));
    expect(await motivo({ titulo: "ab" })).toMatch(/^Fora do formato: \$\.titulo: .*\.$/);
    expect(await descarte({ titulo: "Só isto" })).toMatch(/^Fora do formato: \$\.instituicao: obrigatório; \$\.link: obrigatório\.$/);
    expect(await descarte({ ...finding(), nivel_sugerido: "E" })).toMatch(/^Fora do formato: /);
    expect(await descarte("isto não é um objeto")).toMatch(/^Fora do formato: /);
    expect((await descarte({ ...finding(), nivel_sugerido: "Z", tipo: "q", motivo: "m".repeat(400) })).split(";")).toHaveLength(2); // até 2 erros, de 3
    expect(await motivo({ link: "http://www.gov.br/saude/ok.pdf" })).toBe("Link sem https.");
    expect(await motivo({ link: "https://www.gov.br:8443/saude/ok.pdf" })).toBe("Porta diferente de 443.");
    expect(await motivo({ link: "https://u:s@www.gov.br/saude/ok.pdf" })).toBe("Link com usuário ou senha.");
    expect(await motivo({ link: "https://exemplo.com/x.pdf" })).toBe("Site fora da lista de sites oficiais.");
    expect(await motivo({ link: "https://gov.br/saudemental/x.pdf" })).toBe("Site fora da lista de sites oficiais.");
    expect(await motivo({ link: "https://www.gov.br/saude/vai.pdf" })).toBe("Download: Redirecionamento para fora da lista de sites oficiais.");
    expect(await motivo({ link: "https://www.gov.br/saude/404.pdf" })).toBe("Download: O link respondeu 404.");
    expect(await motivo({ link: "https://www.gov.br/saude/vazio.pdf" })).toMatch(/^Sem texto/);
    expect(await motivo({ link: "https://www.gov.br/saude/quebrado.pdf" })).toBe("Arquivo PDF ilegível.");
    expect(await motivo({ link: "https://www.gov.br/saude/ok.pdf", trecho: "este trecho a IA inventou e não está no documento" })).toBe("O trecho citado pela IA não está no arquivo.");
    // trecho com 20 caracteres, mas curto demais depois de dobrado (Ruling F9)
    expect(await motivo({ link: "https://www.gov.br/saude/ok.pdf", trecho: "Sulfato de magnesio!" })).toBe("Trecho curto demais para conferir.");
    expect(web.calls.filter((x) => x.url.endsWith("/ok.pdf")).length).toBe(1); // o curto nem foi baixado
  });

  it("repetido pelo link (segunda vez) e pelo arquivo (outro link)", async () => {
    const pdf = makePdf([LONG + "\nTexto exclusivo desta copia para o teste de repetidos."]);
    const web = fakeWeb({
      "https://www.gov.br/saude/copia-a.pdf": pdfRoute(pdf),
      "https://bvsms.saude.gov.br/bvs/copia-b.pdf": pdfRoute(pdf),
    });
    const c = await ctx({ fetchImpl: web });
    expect((await verifyFinding(finding({ link: "https://www.gov.br/saude/copia-a.pdf" }), c)).ok).toBe(true);
    const again = await verifyFinding(finding({ link: "https://www.gov.br/saude/copia-a.pdf?utm_source=x" }), c);
    expect(again).toEqual({ ok: false, motivo: "Repetido: candidato aguardando sua conferência." });
    expect(web.calls.filter((x) => x.url.includes("copia-a")).length).toBe(1);
    // o mesmo arquivo por outro link (espelho): baixa, vê que o SHA-256 já existe e descarta
    const mirror = await verifyFinding(finding({ link: "https://bvsms.saude.gov.br/bvs/copia-b.pdf" }), c);
    expect(mirror).toEqual({ ok: false, motivo: "Repetido: candidato aguardando sua conferência." });
    expect(web.calls.filter((x) => x.url.includes("copia-b")).length).toBe(1);
    const count = (await sql(`select count(*)::int as n from public.ch_source_candidates where sha256 = $1`, [crypto.createHash("sha256").update(pdf).digest("hex")]))[0].n;
    expect(count).toBe(1);
    // fonte já cadastrada pelo ARQUIVO: repetida, mesmo por outro endereço
    const dupPdf = makePdf([LONG + "\nTexto exclusivo da fonte cadastrada para o teste."]);
    await t.db.asUser(t.adminUser, "app_ch_register_source", { p_source: { title: "Manual já cadastrado", organ: "Ministério da Saúde", url: "https://www.gov.br/saude/cadastrada.pdf", sha256: crypto.createHash("sha256").update(dupPdf).digest("hex") } });
    const web2 = fakeWeb({ "https://www.gov.br/saude/cadastrada.pdf": pdfRoute(dupPdf), "https://www.gov.br/saude/espelho.pdf": pdfRoute(dupPdf) });
    expect(await verifyFinding(finding({ link: "https://www.gov.br/saude/cadastrada.pdf" }), await ctx({ fetchImpl: web2 }))).toEqual({ ok: false, motivo: "Repetido: fonte já cadastrada." });
    expect(await verifyFinding(finding({ link: "https://www.gov.br/saude/espelho.pdf" }), await ctx({ fetchImpl: web2 }))).toEqual({ ok: false, motivo: "Repetido: fonte já cadastrada." });
    // fonte cadastrada pelo endereço, mas o arquivo daquele endereço MUDOU (edição nova no mesmo endereço): vira candidato
    const newer = makePdf([LONG + "\nTexto da edicao nova publicada no mesmo endereco da fonte cadastrada."]);
    const webNew = fakeWeb({ "https://www.gov.br/saude/cadastrada.pdf": pdfRoute(newer) });
    expect((await verifyFinding(finding({ link: "https://www.gov.br/saude/cadastrada.pdf" }), await ctx({ fetchImpl: webNew }))).ok).toBe(true);
  });

  it("data inválida da IA vira nula e não descarta", async () => {
    const dates: [string | null, string | null][] = [
      ["14/03/2025", null],
      ["2025-13-45", null],
      ["março de 2025", null],
      ["2025-03-14T10:00:00Z", null],
      ["2025", "2025"],
      ["2025-03-14", "2025-03-14"],
      [null, null],
    ];
    let n = 0;
    for (const [given, saved] of dates) {
      const pdf = makePdf([LONG + `\nVariante numero ${++n} do arquivo de teste de datas.`]);
      const link = `https://www.gov.br/saude/data-${n}.pdf`;
      const out = await verifyFinding(finding({ link, data_publicacao: given }), await ctx({ fetchImpl: fakeWeb({ [link]: pdfRoute(pdf) }) }));
      expect(out.ok, String(given)).toBe(true);
      const [row] = await sql(`select ai_published from public.ch_source_candidates where id = $1`, [(out as { candidateId: string }).candidateId]);
      expect(row.ai_published, String(given)).toBe(saved);
    }
  });

  it("erro de armazenamento sobe para a fila e não vira descarte nem candidato", async () => {
    const pdf = makePdf([LONG + "\nArquivo do teste de falha de armazenamento."]);
    const link = "https://www.gov.br/saude/falha-armazenamento.pdf";
    const broken: Storage = { ...storage, put: async () => Promise.reject(new Error("depósito fora do ar")) };
    const c = await ctx({ storage: broken, fetchImpl: fakeWeb({ [link]: pdfRoute(pdf) }) });
    await expect(verifyFinding(finding({ link }), c)).rejects.toThrow("depósito fora do ar");
    expect(await sql(`select 1 from public.ch_source_candidates where requested_url = $1`, [link])).toHaveLength(0);
    // a nova rodada, com o depósito de volta, termina sem repetir nada
    const ok = await verifyFinding(finding({ link }), { ...c, storage });
    expect(ok.ok).toBe(true);
  });
});
