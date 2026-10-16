// Adaptador Conitec: relatórios de recomendação, portarias de decisão sobre incorporação e PCDT.
// Lê o sitemap oficial do site (com data de última modificação de cada arquivo): 3 arquivos .gz pequenos, sem navegar nas páginas.
// Cada item vira { adaptador, fonte, chave (URL), titulo, versao (lastmod), data, url, hash, tipo }.
import { criarItem } from "./http.mjs";

export const SITEMAP_INDICE = "https://www.gov.br/conitec/sitemap-index.xml";

/** <loc> + <lastmod> de um sitemap (ou, no índice, só <loc>). */
export function parseSitemap(xml) {
  const itens = [];
  for (const bloco of String(xml).split(/<\/url>|<\/sitemap>/)) {
    const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(bloco)?.[1];
    if (!loc) continue;
    itens.push({ loc: loc.replace(/&amp;/g, "&"), lastmod: /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(bloco)?.[1] ?? null });
  }
  return itens;
}

/** Que tipo de documento é a URL? null = não interessa (notícia, imagem, contribuição, dossiê de empresa...). */
export function tipoConitec(url) {
  let p;
  try { p = new URL(url).pathname.toLowerCase(); } catch { return null; } // endereço malformado no sitemap: ignora o item, não derruba o adaptador
  if (/\.(png|jpe?g|gif|svg|webp|css|js|zip)(\/|$)/.test(p)) return null;
  if (/\/(\d{4}|portaria|resumidos|protocolos|relatorios)\/?$/.test(p)) return null; // pasta (ex.: /relatorios/2026), não documento
  if (p.includes("/midias/relatorios/portaria/")) return "decisao_incorporacao";   // portaria SECTICS/SCTIE que decide a incorporação (DOU)
  if (p.includes("/midias/consultas/relatorios/")) return "relatorio_preliminar";  // relatório em consulta pública (ainda não é decisão)
  if (p.includes("/midias/relatorios/")) return "relatorio_recomendacao";
  if (p.includes("/midias/protocolos/")) return "pcdt";
  return null;
}

export function tituloDeUrl(url) {
  let ult = new URL(url).pathname.split("/").filter((s) => s && !/^(file|@@display-file)$/.test(s)).pop() ?? "";
  try { ult = decodeURIComponent(ult); } catch { /* % solto no endereço: usa como veio */ }
  return ult.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

export function itensDoSitemap(entradas) {
  const vistos = new Set(), itens = [];
  for (const { loc, lastmod } of entradas) {
    const tipo = tipoConitec(loc);
    if (!tipo || vistos.has(loc)) continue;
    vistos.add(loc);
    itens.push(criarItem({ adaptador: "conitec", fonte: "Conitec", chave: loc, titulo: tituloDeUrl(loc), versao: lastmod?.slice(0, 10) ?? null, data: lastmod, url: loc, tipo }));
  }
  return itens;
}

export async function coletar(cliente) {
  const r = { adaptador: "conitec", itens: [], erros: [], bloqueado: false };
  const ind = await cliente.get(SITEMAP_INDICE, { aceita: "application/xml,text/xml,*/*" });
  if (!ind.ok) { r.erros.push(`índice do sitemap: ${ind.erro}`); r.bloqueado = !!ind.bloqueadoPorRobots; return r; }
  const entradas = [];
  for (const { loc } of parseSitemap(ind.texto())) {
    const s = await cliente.get(loc, { aceita: "application/xml,application/gzip,*/*", limiteMb: 20 });
    if (!s.ok) { r.erros.push(`${loc}: ${s.erro}`); continue; }
    const xml = s.texto();
    // sitemap truncado ou ilegível (ex.: .gz cortado) NÃO pode passar por vazio: viraria "item sumiu" ou, depois, uma enxurrada de "novos"
    if (!/<urlset[\s>]/.test(xml) || !/<\/urlset>\s*$/.test(xml)) { r.erros.push(`${loc}: sitemap ilegível ou cortado`); continue; }
    entradas.push(...parseSitemap(xml));
  }
  r.itens = itensDoSitemap(entradas);
  r.lidos = entradas.length;
  return r;
}
