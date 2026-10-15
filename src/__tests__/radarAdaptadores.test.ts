// @vitest-environment node
// Radar de Evidências: adaptadores (Conitec, DOU, vacinação, Febrasgo), cliente educado, linha de base, gravidade, teto de custo e mapa por trecho.
// As amostras em fixtures/radar são respostas REAIS gravadas dos sites em 15/10/2026 (cortadas); nenhum teste acessa a internet.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error módulos .mjs sem tipos (scripts do Radar de Evidências)
import * as http from "../../scripts/radar/adaptadores/http.mjs";
// @ts-expect-error módulo .mjs sem tipos
import * as conitec from "../../scripts/radar/adaptadores/conitec.mjs";
// @ts-expect-error módulo .mjs sem tipos
import * as dou from "../../scripts/radar/adaptadores/dou.mjs";
// @ts-expect-error módulo .mjs sem tipos
import * as vacinacao from "../../scripts/radar/adaptadores/vacinacao.mjs";
// @ts-expect-error módulo .mjs sem tipos
import * as febrasgo from "../../scripts/radar/adaptadores/febrasgo.mjs";
// @ts-expect-error módulo .mjs sem tipos
import { coletarTodos } from "../../scripts/radar/adaptadores/index.mjs";
// @ts-expect-error módulo .mjs sem tipos
import * as lib from "../../scripts/radar/lib.mjs";
// @ts-expect-error módulo .mjs sem tipos
import * as custo from "../../scripts/radar/custo.mjs";
// @ts-expect-error módulo .mjs sem tipos
import * as ia from "../../scripts/radar/ia.mjs";
// @ts-expect-error módulo .mjs sem tipos
import * as mapaT from "../../scripts/radar/mapa-trechos.mjs";
// @ts-expect-error módulo .mjs sem tipos
import { vigiarAdaptadores } from "../../scripts/radar/nucleo.mjs";
// @ts-expect-error módulo .mjs sem tipos
import { EstadoMemoria, EstadoArquivo } from "../../scripts/radar/estado.mjs";

const fx = (n: string) => fs.readFileSync(path.join(__dirname, "fixtures/radar", n), "utf8");
const resp = (corpo: string | Buffer, init: { status?: number; tipo?: string; headers?: Record<string, string> } = {}) =>
  new Response(corpo as BodyInit, { status: init.status ?? 200, headers: { "content-type": init.tipo ?? "text/html", ...(init.headers ?? {}) } });

/** fetch falso: tabela endereço → resposta (função para respostas dinâmicas). Registra os pedidos. */
function falso(rotas: Record<string, (() => Response) | Response>) {
  const pedidos: { url: string; ua: string | null }[] = [];
  const fn = async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    pedidos.push({ url: u, ua: new Headers(init?.headers).get("user-agent") });
    const r = rotas[u];
    if (!r) return resp("não existe", { status: 404 });
    return typeof r === "function" ? r() : r.clone();
  };
  return { fn: fn as unknown as typeof fetch, pedidos };
}
const ROBOTS_LIVRE = { "https://www.gov.br/robots.txt": resp("User-agent: *\nDisallow:\n", { tipo: "text/plain" }), "https://www.febrasgo.org.br/robots.txt": resp("User-agent: *\nDisallow:\n", { tipo: "text/plain" }) };

describe("robots.txt e cliente educado", () => {
  it("respeita Disallow: / da Imprensa Nacional e as regras da Conitec", () => {
    expect(http.robotsPermite(fx("robots-in-gov-br.txt"), "/consulta/-/buscar/dou")).toBe(false);
    expect(http.robotsPermite(fx("robots-conitec.txt"), "/conitec/pt-br/midias/protocolos/x.pdf")).toBe(true);
    expect(http.robotsPermite(fx("robots-conitec.txt"), "/search?q=x")).toBe(false);
    expect(http.robotsPermite("User-agent: *\nDisallow: /privado/\nAllow: /privado/aberto/", "/privado/aberto/a.html")).toBe(true);
    expect(http.robotsPermite("User-agent: StaziaMed-Radar\nDisallow: /\n\nUser-agent: *\nDisallow:\n", "/qualquer")).toBe(false);
    expect(http.robotsPermite("", "/x")).toBe(true);
  });

  it("não faz pedido de conteúdo quando o robots proíbe e identifica o robô no user-agent", async () => {
    const f = falso({ "https://www.in.gov.br/robots.txt": resp(fx("robots-in-gov-br.txt"), { tipo: "text/plain" }), "https://www.gov.br/robots.txt": resp("", { tipo: "text/plain" }), "https://www.gov.br/pagina": resp("oi") });
    const c = http.criarCliente({ fetchImpl: f.fn, pausaMs: 0 });
    const bloqueado = await c.get("https://www.in.gov.br/consulta/x");
    expect(bloqueado.ok).toBe(false);
    expect(bloqueado.bloqueadoPorRobots).toBe(true);
    expect(f.pedidos.map((p) => p.url)).not.toContain("https://www.in.gov.br/consulta/x");
    const ok = await c.get("https://www.gov.br/pagina");
    expect(ok.ok).toBe(true);
    for (const p of f.pedidos) expect(p.ua).toMatch(/StaziaMed-Radar.*contato@staziamed\.com\.br/);
  });

  it("espera entre pedidos (pausa) e nunca lança erro quando o site falha", async () => {
    let t = 0;
    const f = falso({ ...ROBOTS_LIVRE, "https://www.gov.br/a": resp("a"), "https://www.gov.br/b": resp("b") });
    const c = http.criarCliente({ fetchImpl: f.fn, pausaMs: 60, relogio: () => (t += 20) });
    const antes = Date.now();
    await c.get("https://www.gov.br/a"); await c.get("https://www.gov.br/b");
    expect(Date.now() - antes).toBeGreaterThanOrEqual(30);
    const quebrado = http.criarCliente({ fetchImpl: (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch, pausaMs: 0 });
    const r = await quebrado.get("https://www.gov.br/x");
    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
    const lento = http.criarCliente({ fetchImpl: (async () => resp("erro", { status: 503 })) as unknown as typeof fetch, pausaMs: 0, respeitarRobots: false });
    expect((await lento.get("https://www.gov.br/x")).erro).toBe("HTTP 503");
  });
});

describe("adaptador Conitec", () => {
  const rotas = () => ({
    ...ROBOTS_LIVRE,
    [conitec.SITEMAP_INDICE]: resp(fx("conitec-sitemap-index.xml"), { tipo: "application/xml" }),
    "https://www.gov.br/conitec/sitemap1.xml.gz": resp(fx("conitec-sitemap1.xml"), { tipo: "application/xml" }),
    "https://www.gov.br/conitec/sitemap2.xml.gz": resp('<urlset></urlset>', { tipo: "application/xml" }),
    "https://www.gov.br/conitec/sitemap3.xml.gz": resp("erro", { status: 500 }),
  });
  it("normaliza relatórios, decisões e PCDT para {fonte, versão, data, URL, hash} e ignora notícia, imagem e institucional", async () => {
    const f = falso(rotas());
    const r = await conitec.coletar(http.criarCliente({ fetchImpl: f.fn, pausaMs: 0 }));
    expect(r.itens.length).toBeGreaterThanOrEqual(7);
    const tipos = new Set(r.itens.map((i: { tipo: string }) => i.tipo));
    expect([...tipos].every((t) => ["decisao_incorporacao", "relatorio_preliminar", "relatorio_recomendacao", "pcdt"].includes(t as string))).toBe(true);
    expect(r.itens.some((i: { url: string }) => /\.png|noticias|composicao/.test(i.url))).toBe(false);
    expect(conitec.tipoConitec("https://www.gov.br/conitec/pt-br/midias/relatorios/2026")).toBeNull(); // pasta, não documento
    expect(conitec.tipoConitec("https://www.gov.br/conitec/pt-br/midias/relatorios/portaria/2026/portaria-x.pdf")).toBe("decisao_incorporacao");
    for (const i of r.itens) {
      expect(i).toMatchObject({ adaptador: "conitec", fonte: "Conitec" });
      expect(i.url).toMatch(/^https:\/\/www\.gov\.br\/conitec\//);
      expect(i.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(i.data === null || /^\d{4}-\d{2}-\d{2}$/.test(i.data)).toBe(true);
    }
    expect(r.erros.join()).toContain("sitemap3"); // um sitemap com erro 500 vira erro do adaptador, não derruba os outros
  });
  it("hash muda quando a data de modificação muda (item alterado) e fica igual sem mudança", () => {
    const a = conitec.itensDoSitemap([{ loc: "https://www.gov.br/conitec/pt-br/midias/protocolos/pcdt_x.pdf", lastmod: "2026-01-01T00:00:00+00:00" }]);
    const b = conitec.itensDoSitemap([{ loc: "https://www.gov.br/conitec/pt-br/midias/protocolos/pcdt_x.pdf", lastmod: "2026-01-01T09:00:00+00:00" }]);
    const c = conitec.itensDoSitemap([{ loc: "https://www.gov.br/conitec/pt-br/midias/protocolos/pcdt_x.pdf", lastmod: "2026-09-01T00:00:00+00:00" }]);
    expect(a[0].hash).toBe(b[0].hash);
    expect(a[0].hash).not.toBe(c[0].hash);
  });
  it("sitemap cortado/ilegível vira erro (nunca passa por vazio) e leitura parcial sem base não vira linha de base", async () => {
    const f = falso({ ...ROBOTS_LIVRE, [conitec.SITEMAP_INDICE]: resp('<sitemapindex><sitemap><loc>https://www.gov.br/conitec/s1.xml</loc></sitemap><sitemap><loc>https://www.gov.br/conitec/s2.xml</loc></sitemap></sitemapindex>'),
      "https://www.gov.br/conitec/s1.xml": resp('<urlset><url><loc>https://www.gov.br/conitec/pt-br/midias/protocolos/a.pdf</loc><lastmod>2026-01-01T00:00:00+00:00</lastmod></url></urlset>'),
      "https://www.gov.br/conitec/s2.xml": resp('<urlset><url><loc>https://www.gov.br/conitec/pt-br/midias/protocolos/b.pdf</loc><lastmo') });
    const r = await conitec.coletar(http.criarCliente({ fetchImpl: f.fn, pausaMs: 0 }));
    expect(r.itens).toHaveLength(1);
    expect(r.erros.join()).toMatch(/ilegível ou cortado/);
    const v = await vigiarAdaptadores({ cliente: http.criarCliente({ fetchImpl: f.fn, pausaMs: 0 }), estado: new EstadoMemoria(), quais: ["conitec"] });
    expect(v.porAdaptador[0].base_incompleta).toBe(true);
    expect(v.baseParaSalvar).toHaveLength(0);
  });
  it("site fora do ar: devolve erro e nenhum item, sem lançar", async () => {
    const r = await conitec.coletar(http.criarCliente({ fetchImpl: falso({ ...ROBOTS_LIVRE }).fn, pausaMs: 0 }));
    expect(r.itens).toEqual([]);
    expect(r.erros.length).toBeGreaterThan(0);
  });
});

describe("adaptador Diário Oficial da União", () => {
  it("respeita o robots da Imprensa Nacional (não faz pedido) e lê o canal permitido filtrando termos de saúde", async () => {
    const f = falso({
      "https://www.in.gov.br/robots.txt": resp(fx("robots-in-gov-br.txt"), { tipo: "text/plain" }),
      "https://www.gov.br/robots.txt": resp("User-agent: *\nDisallow:\n", { tipo: "text/plain" }),
      [dou.NOTICIAS_MS]: resp(fx("ms-noticias.html")),
    });
    const r = await dou.coletar(http.criarCliente({ fetchImpl: f.fn, pausaMs: 0 }));
    expect(r.bloqueado).toBe(true);
    expect(r.canais[0]).toMatchObject({ permitido: false });
    expect(f.pedidos.some((p) => p.url.includes("in.gov.br/consulta"))).toBe(false);
    expect(r.itens.length).toBeGreaterThanOrEqual(1);
    expect(r.itens.some((i: { titulo: string }) => /protocolo cl[ií]nico/i.test(i.titulo))).toBe(true);
    for (const i of r.itens) expect(dou.TERMOS_RELEVANTES.test(i.titulo)).toBe(true);
  });
});

describe("adaptador calendário de vacinação", () => {
  it("lista de links: documento novo vira item; título vem do texto do link", () => {
    const links = vacinacao.extrairLinks(fx("vac-legislacao.html"), "https://www.gov.br/saude/pt-br/vacinacao/legislacao", "https://www.gov.br/saude/pt-br/vacinacao/legislacao/");
    expect(links.length).toBeGreaterThanOrEqual(3);
    expect(links[0].titulo).toMatch(/Portaria|Lei/);
    const notas = vacinacao.extrairLinks(fx("pni-notas-2026.html"), "https://www.gov.br/saude/pt-br/composicao/svsa/pni/notas-tecnicas/2026", "https://www.gov.br/saude/pt-br/composicao/svsa/pni/notas-tecnicas/2026/");
    expect(notas.every((n: { titulo: string }) => /Nota T[eé]cnica/i.test(n.titulo))).toBe(true);
  });
  it("acha a Instrução Normativa do calendário e lê o miolo da página sem menu", () => {
    expect(vacinacao.acharInstrucaoNormativa(fx("vac-home.html"))?.url).toMatch(/instrucao-normativa.*\.pdf$/);
    const miolo = vacinacao.mioloDaPagina(fx("vac-calendario.html"));
    expect(miolo).not.toContain("menu");
    expect(miolo.length).toBeGreaterThan(50);
  });
  it("coletar: páginas por texto, listas por links e a IN por hash do arquivo; uma página fora do ar não derruba o resto", async () => {
    const S = "https://www.gov.br/saude/pt-br";
    const rotas: Record<string, Response> = { ...ROBOTS_LIVRE };
    rotas[`${S}/vacinacao/calendario`] = resp(fx("vac-calendario.html"));
    // o calendário técnico do adulto é um PDF (descoberto no ensaio real): lido pelo texto das páginas; o da criança, PDF sem texto: cai no hash do arquivo, avisando
    rotas[`${S}/composicao/svsa/pni/calendario-tecnico/calendario-tecnico-nacional-de-vacinacao-adulto`] = resp(Buffer.from("%PDF-1.7 adulto"), { tipo: "application/pdf" });
    rotas[`${S}/composicao/svsa/pni/calendario-tecnico/calendario-tecnico-nacional-de-vacinacao-crianca`] = resp(Buffer.from("%PDF-1.7 crianca"), { tipo: "application/pdf" });
    rotas[`${S}/vacinacao/legislacao`] = resp(fx("vac-legislacao.html"));
    rotas[`${S}/composicao/svsa/pni/notas-tecnicas/${new Date().getFullYear()}`] = resp(fx("pni-notas-2026.html").replaceAll("/2026/", `/${new Date().getFullYear()}/`));
    rotas[`${S}/vacinacao`] = resp(fx("vac-home.html"));
    rotas[`${S}/vacinacao/publicacoes/instrucao-normativa-que-instrui-o-calendario-nacional-de-vacinacao-2026.pdf`] = resp(Buffer.from("%PDF-1.4 conteudo"), { tipo: "application/pdf" });
    const extrairPdf = (buf: Buffer) => (buf.toString().includes("adulto") ? [{ pagina: 1, texto: "Hepatite B: três doses aos 0, 1 e 6 meses para todos os adultos não vacinados. ".repeat(4) }, { pagina: 2, texto: "Segunda página do calendário do adulto com recomendações de vacinação. ".repeat(4) }] : null);
    const r = await vacinacao.coletar(http.criarCliente({ fetchImpl: falso(rotas).fn, pausaMs: 0 }), { extrairPdf });
    const adulto = r.itens.find((i: { chave: string }) => i.chave === "vacinacao:calendario-tecnico-adulto");
    expect(adulto).toMatchObject({ tipo: "arquivo_calendario" });
    expect(adulto.texto.split("\f")).toHaveLength(2); // páginas separadas por \f
    const crianca = r.itens.find((i: { chave: string }) => i.chave === "vacinacao:calendario-tecnico-crianca");
    expect(crianca.texto).toBeUndefined();
    expect(r.erros.some((e: string) => e.includes("calendario-tecnico-crianca") && e.includes("hash do arquivo"))).toBe(true);
    expect(r.itens.some((i: { chave: string }) => i.chave === "vacinacao:calendario")).toBe(true);
    expect(r.itens.some((i: { tipo: string }) => i.tipo === "norma")).toBe(true);
    expect(r.itens.some((i: { tipo: string }) => i.tipo === "instrucao_normativa")).toBe(true);
    expect(r.erros.length).toBeGreaterThan(0); // as páginas do calendário técnico não estavam nas rotas (404): viraram erros
  });
});

describe("adaptador Febrasgo (wp-json)", () => {
  it("normaliza diretrizes e decodifica entidades do título", () => {
    const it = febrasgo.itensDeFebrasgo(JSON.parse(fx("febrasgo-diretriz.json")), febrasgo.TIPOS[1]);
    expect(it.length).toBe(JSON.parse(fx("febrasgo-diretriz.json")).length);
    expect(it[0].titulo).not.toMatch(/&#8211;|&amp;/);
    expect(it[0]).toMatchObject({ adaptador: "febrasgo", tipo: "diretriz" });
    expect(it[0].versao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("pagina pelo cabeçalho x-wp-totalpages e limita as páginas; tipo com erro não derruba os outros", async () => {
    const base = febrasgo.BASE;
    const q = (rest: string, pag: number, extra = "") => `${base}/${rest}?per_page=100&page=${pag}&orderby=modified&order=desc&_fields=id,date,modified,link,title,slug,source_url${extra}`;
    const rotas: Record<string, Response> = { ...ROBOTS_LIVRE };
    rotas[q("fps", 1)] = resp(fx("febrasgo-fps.json"), { tipo: "application/json", headers: { "x-wp-totalpages": "2" } });
    rotas[q("fps", 2)] = resp("[]", { tipo: "application/json", headers: { "x-wp-totalpages": "2" } });
    rotas[q("diretriz", 1)] = resp(fx("febrasgo-diretriz.json"), { tipo: "application/json", headers: { "x-wp-totalpages": "1" } });
    // protocolo-assistenci fora do ar (404) e media sem rota: erros, não exceção
    const r = await febrasgo.coletar(http.criarCliente({ fetchImpl: falso(rotas).fn, pausaMs: 0 }));
    expect(r.porTipo.fps).toBe(JSON.parse(fx("febrasgo-fps.json")).length);
    expect(r.porTipo.diretriz).toBeGreaterThan(0);
    expect(r.erros.some((e: string) => e.startsWith("protocolo-assistenci"))).toBe(true);
  });
  it("sociedade médica nunca vira norma do SUS", () => {
    const [i] = febrasgo.itensDeFebrasgo(JSON.parse(fx("febrasgo-diretriz.json")), febrasgo.TIPOS[1]);
    expect(lib.classificarItemAdaptador(i)).toMatchObject({ referencia: "evidencia_complementar", esfera: "sociedade", norma_sus: false });
  });
});

describe("falha de um site não quebra o vigia", () => {
  it("coletarTodos com internet fora do ar devolve os 4 adaptadores com erro", async () => {
    const cliente = http.criarCliente({ fetchImpl: (async () => { throw new Error("sem rede"); }) as unknown as typeof fetch, pausaMs: 0 });
    const r = await coletarTodos(cliente);
    expect(r.map((x: { adaptador: string }) => x.adaptador)).toEqual(["conitec", "dou", "vacinacao", "febrasgo"]);
    for (const x of r) expect(x.itens).toEqual([]);
  });
  it("um adaptador que lança exceção vira erro daquele adaptador", async () => {
    const cliente = { get: async () => { throw new Error("boom"); }, permitido: async () => { throw new Error("boom"); }, contagem: {} };
    const r = await coletarTodos(cliente, { quais: ["conitec", "dou"] });
    expect(r).toHaveLength(2);
    expect(r[0].erros[0]).toMatch(/falha inesperada/);
  });
});

describe("linha de base, gravidade e relevância", () => {
  const item = (chave: string, hash: string, extra: Record<string, unknown> = {}) => ({ adaptador: "conitec", chave, hash, titulo: chave, url: `https://x/${chave}`, versao: null, data: null, tipo: "pcdt", ...extra });
  it("primeira leitura vira base; depois acha novos e alterados; leitura com menos da metade é suspeita", () => {
    expect(lib.diffItens(new Map(), [item("a", "1")])).toMatchObject({ primeira_leitura: true, novos: [] });
    const base = new Map([["a", { hash: "1" }], ["b", { hash: "2" }], ["c", { hash: "3" }], ["d", { hash: "4" }]]);
    const d = lib.diffItens(base, [item("a", "1"), item("b", "2x"), item("c", "3"), item("d", "4"), item("e", "5")]);
    expect(d.novos.map((n: { chave: string }) => n.chave)).toEqual(["e"]);
    expect(d.alterados.map((n: { agora: { chave: string } }) => n.agora.chave)).toEqual(["b"]);
    expect(lib.diffItens(base, [item("a", "1")]).suspeita).toBe(true);
    // 60 itens novos de uma vez sobre uma base de 4: base antiga incompleta, não 60 publicações -> sem eventos
    const enxurrada = lib.diffItens(base, [...["a", "b", "c", "d"].map((k, i) => item(k, String(i + 1))), ...Array.from({ length: 60 }, (_, i) => item(`n${i}`, `h${i}`))]);
    expect(enxurrada.inundacao).toBe(60);
    expect(enxurrada.novos).toEqual([]);
  });
  it("grave = revogação ou mudança de conduta; leve = redação, numeração, proposta e sociedade", () => {
    const g = (o: Record<string, unknown>) => lib.classificarGravidade({ referencia: "vigente", novo: false, temasAfetados: 0, ...o }).gravidade;
    expect(g({ referencia: "revogada", item: { titulo: "x" } })).toBe("grave");
    expect(g({ item: { titulo: "Portaria revoga o PCDT de asma" } })).toBe("grave");
    expect(g({ item: { titulo: "x", adaptador: "vacinacao", tipo: "pagina_calendario" }, diff: { itens: [{ kind: "NUMERIC", critical: true, texto_antigo: "duas doses aos 2 meses", texto_novo: "três doses aos 2 meses" }] } })).toBe("grave");
    expect(g({ item: { titulo: "x", tipo: "biblioteca" }, diff: { itens: [{ kind: "NUMERIC", critical: true, texto_antigo: "conforme o art. 5", texto_novo: "conforme o art. 6" }] } })).toBe("leve"); // numeração de artigo
    expect(g({ item: { titulo: "x", tipo: "biblioteca" }, diff: { itens: [{ kind: "NEGATION", critical: true, texto_antigo: "recomenda-se", texto_novo: "não se recomenda" }] } })).toBe("grave");
    // linha de tabela longa (não vira NUMERIC): par parecido com número diferente em calendário é grave
    expect(g({ item: { titulo: "x", tipo: "arquivo_calendario" }, diff: { itens: [{ kind: "SUBSTANTIVE", critical: false, similarity: 0.9, texto_antigo: "LG/Butantan a partir de 17 anos de idade", texto_novo: "LG/Butantan a partir de 16 anos de idade" }] } })).toBe("grave");
    expect(g({ item: { titulo: "x", tipo: "arquivo_calendario" }, diff: { itens: [{ kind: "MINOR_WORDING", critical: false, similarity: 0.9, texto_antigo: "vacina contra a hepatite B esquema", texto_novo: "vacina contra hepatite B no esquema" }] } })).toBe("leve");
    expect(g({ item: { titulo: "x", tipo: "arquivo_calendario" }, diff: null })).toBe("grave"); // arquivo mudou e o texto não pôde ser comparado
    expect(g({ item: { titulo: "x", adaptador: "vacinacao", tipo: "pagina_calendario" }, diff: { itens: [{ kind: "MINOR_WORDING", critical: false }] } })).toBe("leve");
    expect(g({ item: { titulo: "x", adaptador: "febrasgo", tipo: "diretriz" } })).toBe("leve");
    expect(g({ item: { titulo: "Relatório preliminar", tipo: "relatorio_preliminar" } })).toBe("leve");
    expect(g({ item: { titulo: "pcdt asma", tipo: "pcdt" }, temasAfetados: 1 })).toBe("grave");
    expect(g({ item: { titulo: "pcdt raro", tipo: "pcdt" }, temasAfetados: 0 })).toBe("leve");
    expect(g({ item: { titulo: "x", tipo: "instrucao_normativa" } })).toBe("grave");
    // notícia de campanha que só cita vacinação não é mudança de conduta; portaria nova que toca tema do app é
    expect(g({ item: { titulo: "Ministério leva exames e vacinação a romeiros", tipo: "ato_normativo", adaptador: "dou" }, novo: true, temasAfetados: 1 })).toBe("leve");
    expect(g({ item: { titulo: "Portaria institui novo protocolo clínico de hipertensão", tipo: "ato_normativo", adaptador: "dou" }, novo: true, temasAfetados: 1 })).toBe("grave");
  });
  it("a IA nunca rebaixa a gravidade, só avisa o revisor", () => {
    expect(lib.observacaoDaIA("grave", { certeza: "alta", recomendacao_alterada: "nenhuma recomendação clara" })).toMatch(/rebaixar/);
    expect(lib.observacaoDaIA("grave", { certeza: "baixa", recomendacao_alterada: "nenhuma recomendação clara" })).toBeNull();
    expect(lib.observacaoDaIA("leve", { certeza: "alta", recomendacao_alterada: "nenhuma recomendação clara" })).toBeNull();
  });
  it("tema do app só por palavra-chave do dossiê (palavra curta exige palavra inteira)", () => {
    const dossies = { temas: [{ tema: "GR-001", titulo: "Tuberculose", palavras: ["tuberculose", "TB"] }, { tema: "GR-002", titulo: "Asma", palavras: ["asma"] }] };
    expect(lib.temasDoTitulo("PCDT da Tuberculose 2026", dossies).map((t: { tema: string }) => t.tema)).toEqual(["GR-001"]);
    expect(lib.temasDoTitulo("Tabela de objetivos", dossies)).toEqual([]);
    expect(lib.temasDoTitulo("tb latente", dossies)).toHaveLength(1);
  });
});

describe("teto mensal de custo da IA (US$ 5)", () => {
  it("soma o custo, bloqueia a IA no teto e o teto do ambiente só pode diminuir", async () => {
    expect(custo.TETO_MENSAL_USD).toBe(5);
    expect(custo.tetoEfetivo("100")).toBe(5);
    expect(custo.tetoEfetivo("2")).toBe(2);
    expect(custo.tetoEfetivo(undefined)).toBe(5);
    const store = new custo.StoreCustoMemoria();
    const c = new custo.ContadorCusto({ store, tetoUsd: 1, agora: () => new Date("2026-10-15T12:00:00Z") });
    expect(await c.podeChamar(0.01)).toBe(true);
    await c.registrar({ modelo: "gemini-3.8-flash", tokensEntrada: 1_000_000, tokensSaida: 100_000 }); // 0,75 + 0,375 = 1,125
    const e = await c.estado();
    expect(e.usd).toBeCloseTo(1.125, 3);
    expect(e.atingiu_teto).toBe(true);
    expect(await c.podeChamar(0.0001)).toBe(false);
    const outroMes = new custo.ContadorCusto({ store, tetoUsd: 1, agora: () => new Date("2026-11-02T12:00:00Z") });
    expect(await outroMes.podeChamar(0.01)).toBe(true); // o contador é mensal
  });
  it("persiste em arquivo entre execuções", async () => {
    const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "radar-")), "custo.json");
    await new custo.ContadorCusto({ store: new custo.StoreCustoArquivo(arq) }).registrar({ modelo: "gemini-3.8-flash", tokensEntrada: 1300, tokensSaida: 1000 });
    const e = await new custo.ContadorCusto({ store: new custo.StoreCustoArquivo(arq) }).estado();
    expect(e.chamadas).toBe(1);
    expect(e.usd).toBeGreaterThan(0);
  });
  it("a tarifa do gemini-3.8-flash muda em 01/01/2027", () => {
    expect(lib.custoEstimadoUsd("gemini-3.8-flash", 1e6, 1e6, new Date("2026-12-31T12:00:00Z"))).toBeCloseTo(4.5, 3);
    expect(lib.custoEstimadoUsd("gemini-3.8-flash", 1e6, 1e6, new Date("2027-01-01T12:00:00Z"))).toBeCloseTo(9, 3);
  });
  it("429 do Google: espera e tenta de novo; a chave nunca aparece no erro", async () => {
    let n = 0;
    const f = (async () => (++n < 3 ? new Response("limite", { status: 429 }) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"o_que_mudou":"ok"}' }] } }], usageMetadata: {} }), { status: 200 }))) as unknown as typeof fetch;
    expect((await ia.perguntarGemini({ chave: "SEGREDO", prompt: "p", fetchImpl: f, esperasMs: [1, 1] })).analise.o_que_mudou).toBe("ok");
    expect(n).toBe(3);
    const sempre = (async () => new Response("x", { status: 429 })) as unknown as typeof fetch;
    await expect(ia.perguntarGemini({ chave: "SEGREDO", prompt: "p", fetchImpl: sempre, esperasMs: [1] })).rejects.toThrow(/^HTTP 429$/);
  });
  it("sem orçamento NÃO chama o Gemini (só registra a mudança); com orçamento chama, soma e marca revisão médica", async () => {
    let chamadas = 0;
    const gemini = (async () => { chamadas++; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ o_que_mudou: "Mudou a dose", certeza: "alta" }) }] } }], usageMetadata: { promptTokenCount: 1300, candidatesTokenCount: 400 } }), { status: 200 }); }) as unknown as typeof fetch;
    const cheio = new custo.ContadorCusto({ store: new custo.StoreCustoMemoria(), tetoUsd: 0 });
    expect((await ia.analisarComTeto({ contador: cheio, chave: "k", prompt: "p", fetchImpl: gemini })).pulada).toBe("teto_mensal");
    expect(chamadas).toBe(0);
    const c = new custo.ContadorCusto({ store: new custo.StoreCustoMemoria() });
    const r = await ia.analisarComTeto({ contador: c, chave: "k", prompt: "p", fetchImpl: gemini });
    expect(chamadas).toBe(1);
    expect(r.analise.precisa_revisao_medica).toBe(true);
    expect((await c.estado()).usd).toBeGreaterThan(0);
    expect((await ia.analisarComTeto({ contador: c, chave: "", prompt: "p", fetchImpl: gemini })).pulada).toBe("sem_chave");
  });
});

describe("mapa por trecho (produção em somente leitura)", () => {
  it("o leitor só faz GET (nenhuma escrita existe) e o código não contém outro método HTTP", async () => {
    const metodos: string[] = [];
    const f = (async (_u: string, init?: RequestInit) => { metodos.push(init?.method ?? "GET"); return new Response("[]", { status: 200 }); }) as unknown as typeof fetch;
    const leitor = mapaT.criarLeitorSomenteLeitura({ url: "https://x.supabase.co", chave: "k", fetchImpl: f });
    await mapaT.lerDadosDeProducao(leitor);
    expect(metodos.length).toBeGreaterThan(3);
    expect(new Set(metodos)).toEqual(new Set(["GET"]));
    const codigo = fs.readFileSync(path.join(__dirname, "../../scripts/radar/mapa-trechos.mjs"), "utf8");
    expect(codigo).not.toMatch(/method:\s*["'](POST|PATCH|PUT|DELETE)["']/);
  });
  const dados = {
    gtFontes: [{ tema_id: "GR-001", catalogo_id: "doc-a", url: "https://x/a.pdf", papel: "principal", evidencia: [{ tipo: "texto", exemplos: [3, 4] }], source_id: null }],
    chSources: [{ id: "s1", title: "A", url: "https://x/a.pdf/view", status: "current" }],
    links: [
      { question_id: "q1", source_id: "s1", page: 10, quote: "dose X", status: "confirmada", temporal: "vigente" },
      { question_id: "q2", source_id: "s1", page: 55, quote: "outro", status: "em_revisao", temporal: "vigente" },
      { question_id: "q3", source_id: "s1", page: 10, status: "confirmada", temporal: "historica" },
      { question_id: "q4", source_id: "s1", page: 10, status: "nao_confirmada", temporal: "vigente" },
      { question_id: "q5", source_id: "s1", page: 10, status: "confirmada", temporal: "vigente" },
    ],
    updates: [{ id: "u1", slug: "u", source_url: "https://x/a.pdf", published: true }],
    lessons: [{ id: "l1", guideline_url: "https://x/a.pdf" }],
    questoes: new Map([["q5", { id: "q5", status: "annulled", retired_at: null }]]),
  };
  const ligacao = { questoes: [{ question_id: "q9", tema_id: "GR-001", status: "valid" }, { question_id: "q8", tema_id: "GR-001", status: "annulled" }] };
  it("questão com vínculo de trecho só é afetada se a página mudou; histórica, não confirmada e anulada ficam de fora", () => {
    const mapa = mapaT.montarMapaTrechos(dados, null, ligacao);
    const a = mapaT.itensAfetadosPorTrecho("doc-a", mapa, [10, 11]);
    const questoes = a.itens.filter((i: { tipo: string }) => i.tipo === "questao");
    expect(questoes.map((q: { ref: string }) => q.ref).sort()).toEqual(["q1"]);
    expect(questoes[0]).toMatchObject({ nivel: "trecho", paginas: [10], citacao: "dose X" });
    expect(a.resumo.questoes_fora_do_trecho).toBe(1); // q2 está na p.55
    expect(a.itens.some((i: { tipo: string; ref: string }) => i.tipo === "atualizacao" && i.ref === "u1")).toBe(true);
    expect(a.itens.some((i: { tipo: string; ref: string }) => i.tipo === "aula" && i.ref === "l1")).toBe(true);
    expect(a.itens.every((i: { acao: string }) => i.acao === "revalidar")).toBe(true);
  });
  it("sem vínculos de trecho, cai para o tema (anulada fora) e acha pelo endereço ou pelo identificador", () => {
    const mapa = mapaT.montarMapaTrechos({ gtFontes: dados.gtFontes }, null, ligacao);
    // a base por tema vem dos dossiês; sem dossiê só aparece a aula do tema
    expect(mapaT.itensAfetadosPorTrecho("https://x/a.pdf", mapa).itens.map((i: { tipo: string }) => i.tipo)).toEqual(["aula"]);
    expect(mapaT.itensAfetadosPorTrecho("não existe", mapa).itens).toEqual([]);
    const comDossie = mapaT.montarMapaTrechos({ gtFontes: dados.gtFontes }, { temas: [{ tema: "GR-001", titulo: "T", fontes: [{ id: "doc-a", papel: "principal" }] }] }, ligacao);
    const r = mapaT.itensAfetadosPorTrecho("doc-a", comDossie, [3]);
    expect(r.itens.filter((i: { tipo: string }) => i.tipo === "questao").map((q: { ref: string }) => q.ref)).toEqual(["q9"]);
    expect(r.itens.find((i: { tipo: string }) => i.tipo === "questao").nivel).toBe("tema");
  });
});

describe("núcleo: base antiga -> eventos com gravidade, temas e IA só quando há mudança", () => {
  const dossies = { temas: [{ tema: "GR-002", titulo: "Asma", palavras: ["asma"] }] };
  const ligacao = { questoes: [{ question_id: "qa", tema_id: "GR-002", status: "valid" }] };
  const cliente = (itens: unknown[], extra: Record<string, unknown> = {}) => ({}) as never && ({ get: async () => ({ ok: false }), permitido: async () => true, contagem: {}, __itens: itens, ...extra });
  it("detecta item novo de PCDT que toca tema do app como GRAVE, com aula e questão para revalidar; item sem tema é leve", async () => {
    const f = falso({
      ...ROBOTS_LIVRE,
      [conitec.SITEMAP_INDICE]: resp('<sitemapindex><sitemap><loc>https://www.gov.br/conitec/s1.xml</loc></sitemap></sitemapindex>', { tipo: "application/xml" }),
      "https://www.gov.br/conitec/s1.xml": resp(`<urlset>
        <url><loc>https://www.gov.br/conitec/pt-br/midias/protocolos/pcdt-asma.pdf</loc><lastmod>2026-10-01T00:00:00+00:00</lastmod></url>
        <url><loc>https://www.gov.br/conitec/pt-br/midias/protocolos/pcdt-raro.pdf</loc><lastmod>2026-10-02T00:00:00+00:00</lastmod></url>
        <url><loc>https://www.gov.br/conitec/pt-br/midias/protocolos/pcdt-velho.pdf</loc><lastmod>2026-02-02T00:00:00+00:00</lastmod></url></urlset>`, { tipo: "application/xml" }),
    });
    const estado = new EstadoMemoria();
    await estado.salvar("conitec", conitec.itensDoSitemap([{ loc: "https://www.gov.br/conitec/pt-br/midias/protocolos/pcdt-velho.pdf", lastmod: "2026-02-02T00:00:00+00:00" }, { loc: "https://www.gov.br/conitec/pt-br/midias/protocolos/pcdt-velho2.pdf", lastmod: "2026-02-02T00:00:00+00:00" }, { loc: "https://www.gov.br/conitec/pt-br/midias/protocolos/pcdt-velho3.pdf", lastmod: "2026-02-02T00:00:00+00:00" }]));
    const c = http.criarCliente({ fetchImpl: f.fn, pausaMs: 0 });
    // base com 3 itens e leitura com 3: não é suspeita (3 >= 1,5)
    const r = await vigiarAdaptadores({ cliente: c, estado, quais: ["conitec"], dossies, ligacao });
    const asma = r.eventos.find((e: { titulo: string }) => /asma/.test(e.titulo));
    const raro = r.eventos.find((e: { titulo: string }) => /raro/.test(e.titulo));
    expect(asma).toMatchObject({ origem: "adaptador_novo", gravidade: "grave", referencia: "vigente" });
    expect(asma.afetados.map((a: { tipo: string; ref: string }) => `${a.tipo}:${a.ref}`).sort()).toEqual(["aula:GR-002", "questao:qa"]);
    expect(asma.afetados.every((a: { acao: string }) => a.acao === "revalidar")).toBe(true);
    expect(raro.gravidade).toBe("leve");
    expect(r.chamadasIA).toBe(0); // sem contador/chave, a IA nem é considerada
    // a base avançou: nova rodada sem mudança não gera evento
    const r2 = await vigiarAdaptadores({ cliente: http.criarCliente({ fetchImpl: f.fn, pausaMs: 0 }), estado, quais: ["conitec"], dossies, ligacao });
    expect(r2.eventos).toHaveLength(0);
  });
  it("primeira leitura não gera evento; EstadoArquivo guarda e relê a base", async () => {
    const f = falso({ ...ROBOTS_LIVRE, [conitec.SITEMAP_INDICE]: resp('<sitemapindex><sitemap><loc>https://www.gov.br/conitec/s1.xml</loc></sitemap></sitemapindex>'), "https://www.gov.br/conitec/s1.xml": resp('<urlset><url><loc>https://www.gov.br/conitec/pt-br/midias/protocolos/a.pdf</loc><lastmod>2026-01-01T00:00:00+00:00</lastmod></url></urlset>') });
    const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "radar-")), "base.json");
    const r = await vigiarAdaptadores({ cliente: http.criarCliente({ fetchImpl: f.fn, pausaMs: 0 }), estado: new EstadoArquivo(arq), quais: ["conitec"] });
    expect(r.eventos).toHaveLength(0);
    expect(r.porAdaptador[0]).toMatchObject({ primeira_leitura: true, lidos: 1 });
    expect((await new EstadoArquivo(arq).carregar("conitec")).size).toBe(1);
  });
  it("página de calendário alterada: o diff de texto vira evento; a IA só é chamada com orçamento", async () => {
    const S = "https://www.gov.br/saude/pt-br";
    const pagina = (n: string) => `<html><body><main><p>O esquema de vacinação contra a hepatite B é aplicado em ${n} doses ao longo de seis meses para todos os adultos não vacinados do território nacional.</p><p>${"Texto fixo da página do calendário nacional de vacinação para completar o miolo mínimo. ".repeat(4)}</p></main></body></html>`;
    const rotas: Record<string, Response> = { ...ROBOTS_LIVRE, [`${S}/vacinacao/calendario`]: resp(pagina("três")) };
    const antigo = vacinacao.mioloDaPagina(pagina("duas"));
    const estado = new EstadoMemoria();
    await estado.salvar("vacinacao", [{ adaptador: "vacinacao", chave: "vacinacao:calendario", hash: "0".repeat(64), titulo: "Calendário", url: `${S}/vacinacao/calendario`, tipo: "pagina_calendario", texto: antigo, versao: null, data: null }, { adaptador: "vacinacao", chave: "vacinacao:outra", hash: "1".repeat(64), titulo: "x", url: "https://x", tipo: "pagina_calendario", versao: null, data: null }]);
    let geminis = 0;
    const gemini = (async () => { geminis++; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ o_que_mudou: "de duas para três doses", certeza: "media" }) }] } }], usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 200 } }), { status: 200 }); }) as unknown as typeof fetch;
    const com = new custo.ContadorCusto({ store: new custo.StoreCustoMemoria() });
    const r = await vigiarAdaptadores({ cliente: http.criarCliente({ fetchImpl: falso(rotas).fn, pausaMs: 0 }), estado, quais: ["vacinacao"], contador: com, chaveIA: "k", fetchIA: gemini });
    const ev = r.eventos.find((e: { tipo: string }) => e.tipo === "pagina_calendario");
    expect(ev).toBeTruthy();
    expect(ev.origem).toBe("adaptador_mudou");
    expect(ev.itens.length).toBeGreaterThan(0);
    expect(ev.gravidade).toBe("grave"); // número mudou (duas -> três doses)
    expect(ev.analise_ia.precisa_revisao_medica).toBe(true);
    expect(geminis).toBe(1);
    // teto zerado: a mudança continua registrada, sem chamar a IA
    await estado.salvar("vacinacao", [{ adaptador: "vacinacao", chave: "vacinacao:calendario", hash: "0".repeat(64), titulo: "Calendário", url: `${S}/vacinacao/calendario`, tipo: "pagina_calendario", texto: antigo, versao: null, data: null }]);
    const r2 = await vigiarAdaptadores({ cliente: http.criarCliente({ fetchImpl: falso(rotas).fn, pausaMs: 0 }), estado, quais: ["vacinacao"], contador: new custo.ContadorCusto({ store: new custo.StoreCustoMemoria(), tetoUsd: 0 }), chaveIA: "k", fetchIA: gemini });
    const ev2 = r2.eventos.find((e: { tipo: string }) => e.tipo === "pagina_calendario");
    expect(ev2.analise_ia).toBeUndefined();
    expect(ev2.ia_pulada).toBe("teto_mensal");
    expect(geminis).toBe(1);
  });
});
