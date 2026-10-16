// Adaptador Calendário de Vacinação (gov.br/saude): páginas do calendário nacional e técnico (comparadas pelo TEXTO),
// listas de legislação e de notas técnicas/informativas do PNI (comparadas pelos LINKS: documento novo = item novo)
// e a Instrução Normativa que institui o calendário (PDF, comparado pelo hash do arquivo).
import { criarItem, sha } from "./http.mjs";
import { esqueleto, textoDeHtml } from "../lib.mjs";
import { ehPdf, extrairPdfComPython, juntarPaginas } from "./pdf.mjs";

const SAUDE = "https://www.gov.br/saude/pt-br";
export const PAGINAS_DE_CONTEUDO = [
  { chave: "vacinacao:calendario", titulo: "Calendário Nacional de Vacinação (página)", url: `${SAUDE}/vacinacao/calendario` },
  ...["crianca", "adolescentes-jovens", "adulto", "idoso", "gestante"].map((g) => ({
    chave: `vacinacao:calendario-tecnico-${g}`, titulo: `Calendário Técnico Nacional de Vacinação: ${g.replace("-", " e ")}`,
    url: `${SAUDE}/composicao/svsa/pni/calendario-tecnico/calendario-tecnico-nacional-de-vacinacao-${g}`,
  })),
];
export function listasDeLinks(ano = new Date().getFullYear()) {
  return [
    { chave: "vacinacao:legislacao", titulo: "Legislação da vacinação", url: `${SAUDE}/vacinacao/legislacao`, prefixo: `${SAUDE}/vacinacao/legislacao/`, tipo: "norma" },
    ...[ano, ano - 1].map((a) => ({ chave: `vacinacao:notas-tecnicas-${a}`, titulo: `Notas técnicas e informativas do PNI ${a}`, url: `${SAUDE}/composicao/svsa/pni/notas-tecnicas/${a}`, prefixo: `${SAUDE}/composicao/svsa/pni/notas-tecnicas/${a}/`, tipo: "nota_tecnica" })),
  ];
}

/** Só o miolo da página (sem menu, rodapé e scripts), para o hash não mudar por moldura. */
export function mioloDaPagina(html) {
  const m = /<main[\s\S]*?<\/main>/i.exec(html) ?? /<div[^>]+id="content"[\s\S]*?<div[^>]+id="viewlet-below-content"/i.exec(html);
  return textoDeHtml(m ? m[0] : html);
}

/** Links (absolutos) cujo endereço começa com o prefixo, com o texto do link como título. */
export function extrairLinks(html, base, prefixo) {
  const vistos = new Map();
  for (const m of String(html).matchAll(/<a\s[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let url;
    try { url = new URL(m[1].replace(/&amp;/g, "&"), base).href.replace(/\/view$/, ""); } catch { continue; }
    if (!url.startsWith(prefixo) || url === prefixo.replace(/\/$/, "")) continue;
    const seg = new URL(url).pathname.split("/").filter(Boolean);
    if (seg.length > 1 && seg.at(-1) === seg.at(-2)) continue; // atalho que repete a pasta (ex.: /legislacao/legislacao)
    const titulo = textoDeHtml(m[2]).replace(/\s+/g, " ").trim();
    if (!vistos.has(url) || (titulo && !vistos.get(url))) vistos.set(url, titulo);
  }
  return [...vistos].map(([url, titulo]) => ({ url, titulo }));
}

/** A Instrução Normativa do calendário aparece como link .pdf na página principal da vacinação. */
export function acharInstrucaoNormativa(html, base = SAUDE) {
  return extrairLinks(html, base, `${SAUDE}/vacinacao/publicacoes/`).find((l) => /instrucao-normativa/i.test(l.url) || /instru[cç][aã]o normativa/i.test(l.titulo)) ?? null;
}

/** Arquivo (PDF) vira item pelo TEXTO por página (quando dá para ler), senão pelo hash dos bytes. */
function itemDePdf(g, base, extrair, aviso) {
  const paginas = extrair(g.buf);
  if (paginas) {
    const texto = juntarPaginas(paginas);
    return criarItem({ ...base, conteudo: esqueleto(texto), texto: texto.length <= 1_500_000 ? texto : undefined });
  }
  aviso(`${base.chave}: PDF sem texto legível aqui; comparado só pelo hash do arquivo (pode mudar por metadado)`);
  return criarItem({ ...base, conteudo: sha(g.buf) });
}

export async function coletar(cliente, { ano, extrairPdf = extrairPdfComPython } = {}) {
  const r = { adaptador: "vacinacao", itens: [], erros: [], bloqueado: false };
  const fonte = "Ministério da Saúde / PNI";
  for (const p of PAGINAS_DE_CONTEUDO) {
    const g = await cliente.get(p.url, { aceita: "text/html", limiteMb: 5 });
    if (!g.ok) { r.erros.push(`${p.chave}: ${g.erro}`); r.bloqueado ||= !!g.bloqueadoPorRobots; continue; }
    if (ehPdf(g)) { r.itens.push(itemDePdf(g, { adaptador: "vacinacao", fonte, chave: p.chave, titulo: p.titulo, url: p.url, tipo: "arquivo_calendario" }, extrairPdf, (m) => r.erros.push(m))); continue; }
    const texto = mioloDaPagina(g.texto());
    if (texto.length < 200) { r.erros.push(`${p.chave}: miolo da página vazio (layout mudou?)`); continue; }
    r.itens.push(criarItem({ adaptador: "vacinacao", fonte, chave: p.chave, titulo: p.titulo, url: p.url, tipo: "pagina_calendario", conteudo: esqueleto(texto), texto, data: null }));
  }
  for (const l of listasDeLinks(ano)) {
    const g = await cliente.get(l.url, { aceita: "text/html", limiteMb: 5 });
    if (!g.ok) { r.erros.push(`${l.chave}: ${g.erro}`); r.bloqueado ||= !!g.bloqueadoPorRobots; continue; }
    const links = extrairLinks(g.texto(), l.url, l.prefixo);
    for (const k of links) r.itens.push(criarItem({ adaptador: "vacinacao", fonte, chave: k.url, titulo: k.titulo || k.url.split("/").pop(), url: k.url, tipo: l.tipo }));
  }
  // Instrução Normativa do calendário (PDF): hash do arquivo
  const home = await cliente.get(`${SAUDE}/vacinacao`, { aceita: "text/html", limiteMb: 5 });
  const inn = home.ok ? acharInstrucaoNormativa(home.texto()) : null;
  if (inn) {
    const pdf = await cliente.get(inn.url, { limiteMb: 25 });
    if (pdf.ok && ehPdf(pdf)) r.itens.push(itemDePdf(pdf, { adaptador: "vacinacao", fonte, chave: "vacinacao:instrucao-normativa-calendario", titulo: inn.titulo || "Instrução Normativa do Calendário Nacional de Vacinação", url: inn.url, tipo: "instrucao_normativa" }, extrairPdf, (m) => r.erros.push(m)));
    else if (pdf.ok) r.erros.push("instrução normativa: o endereço não devolveu um PDF");
    else r.erros.push(`instrução normativa: ${pdf.erro}`);
  } else if (!home.ok) r.erros.push(`página de vacinação: ${home.erro}`);
  return r;
}
