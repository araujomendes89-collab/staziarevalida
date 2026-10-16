// Adaptador "Diário Oficial da União" (portarias novas e normas de saúde).
//
// A Imprensa Nacional (in.gov.br) PROÍBE robôs no robots.txt ("User-agent: *  Disallow: /"). O Radar respeita: este adaptador
// pergunta ao cliente se o endereço é permitido e, não sendo, só REGISTRA o bloqueio (nenhum pedido de conteúdo é feito ali).
// Canal alternativo permitido (robots do gov.br/saude libera): as notícias do Ministério da Saúde, que anunciam as portarias e
// normas publicadas no DOU, filtradas por termos de saúde relevantes. As portarias de decisão da Conitec (SECTICS) já entram pelo
// adaptador da Conitec. Caminho oficial para o DOU completo: INLABS (XML diário da Imprensa Nacional, exige cadastro do dono):
// ver docs/radar-evidencias.md.
import { criarItem } from "./http.mjs";
import { extrairLinks } from "./vacinacao.mjs";

export const DOU_BUSCA = "https://www.in.gov.br/consulta/-/buscar/dou?q=portaria+saude&s=do2";
export const NOTICIAS_MS = "https://www.gov.br/saude/pt-br/assuntos/noticias";
export const PREFIXO_NOTICIAS = "https://www.gov.br/saude/pt-br/assuntos/noticias-ms/";

/** Termos de saúde que interessam ao Revalida (norma, protocolo, calendário, incorporação, revogação). */
export const TERMOS_RELEVANTES = /di[aá]rio oficial|\bDOU\b|portaria|resolu[cç][aã]o|instru[cç][aã]o normativa|protocolo cl[ií]nico|diretriz|incorpor|calend[aá]rio|vacin|regulament|institui|revog|pcdt|norma t[eé]cnica|nota t[eé]cnica|rede alyne|linha de cuidado/i;

export function itensDeNoticias(html) {
  return extrairLinks(html, NOTICIAS_MS, PREFIXO_NOTICIAS)
    .filter((l) => l.titulo.length > 25 && TERMOS_RELEVANTES.test(l.titulo))
    .map((l) => criarItem({ adaptador: "dou", fonte: "Ministério da Saúde (notícias de atos do DOU)", chave: l.url, titulo: l.titulo, url: l.url, tipo: "ato_normativo" }));
}

export async function coletar(cliente) {
  const r = { adaptador: "dou", itens: [], erros: [], bloqueado: false, canais: [] };
  // 1. canal oficial: só confere a permissão, nunca faz o pedido se o robots.txt proíbe
  const permitido = await cliente.permitido(DOU_BUSCA);
  r.canais.push({ canal: "imprensa-nacional (in.gov.br)", permitido, nota: permitido ? "leitura habilitada" : "robots.txt do site proíbe robôs (Disallow: /): nenhum pedido feito" });
  if (!permitido) r.bloqueado = true;
  // 2. canal permitido: notícias do Ministério da Saúde sobre atos publicados
  const g = await cliente.get(NOTICIAS_MS, { aceita: "text/html", limiteMb: 5 });
  if (!g.ok) { r.erros.push(`notícias do MS: ${g.erro}`); return r; }
  const itens = itensDeNoticias(g.texto());
  r.canais.push({ canal: "gov.br/saude notícias (atos do DOU)", permitido: true, relevantes: itens.length });
  r.itens = itens;
  return r;
}
