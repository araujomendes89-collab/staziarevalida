// Adaptador Febrasgo: API pública wp-json (robots.txt permite). Tipos: fps (Femina/Posicionamentos), diretriz, protocolo-assistenci
// e a biblioteca de mídia (PDFs; "mediateca" não existe como tipo, a mediateca do site é a biblioteca de mídia do WordPress).
// Diretriz de sociedade é evidência COMPLEMENTAR: nunca vira "norma do SUS" (a classificação é feita por classificarReferenciaAdaptador).
import { criarItem } from "./http.mjs";
import { textoDeHtml } from "../lib.mjs";

export const BASE = "https://www.febrasgo.org.br/wp-json/wp/v2";
export const TIPOS = [
  { rest: "fps", rotulo: "FPS (posicionamento)" },
  { rest: "diretriz", rotulo: "Diretriz" },
  { rest: "protocolo-assistenci", rotulo: "Protocolo assistencial" },
  { rest: "media", rotulo: "Mediateca (PDF)", extra: "&media_type=application&mime_type=application/pdf", maxPaginas: 3 },
];

export function itensDeFebrasgo(lista, tipo) {
  const itens = [];
  for (const p of Array.isArray(lista) ? lista : []) {
    const titulo = textoDeHtml(p?.title?.rendered ?? "");
    const url = p?.source_url || p?.link;
    if (!p?.id || !url || !titulo) continue;
    itens.push(criarItem({ adaptador: "febrasgo", fonte: `Febrasgo: ${tipo.rotulo}`, chave: `febrasgo:${tipo.rest}:${p.id}`, titulo, versao: (p.modified ?? p.date ?? "").slice(0, 10), data: p.modified ?? p.date, url, tipo: tipo.rest }));
  }
  return itens;
}

export async function coletar(cliente, { maxPaginas = 5 } = {}) {
  const r = { adaptador: "febrasgo", itens: [], erros: [], bloqueado: false, porTipo: {} };
  for (const tipo of TIPOS) {
    const limite = tipo.maxPaginas ?? maxPaginas;
    let pagina = 1, totalPaginas = 1;
    r.porTipo[tipo.rest] = 0;
    while (pagina <= Math.min(totalPaginas, limite)) {
      const url = `${BASE}/${tipo.rest}?per_page=100&page=${pagina}&orderby=modified&order=desc&_fields=id,date,modified,link,title,slug,source_url${tipo.extra ?? ""}`;
      const g = await cliente.get(url, { aceita: "application/json" });
      if (!g.ok) { r.erros.push(`${tipo.rest} p.${pagina}: ${g.erro}`); r.bloqueado ||= !!g.bloqueadoPorRobots; break; }
      let lista;
      try { lista = JSON.parse(g.texto()); } catch { r.erros.push(`${tipo.rest}: resposta que não é JSON`); break; }
      totalPaginas = Number(g.headers?.["x-wp-totalpages"] ?? 1) || 1;
      const itens = itensDeFebrasgo(lista, tipo);
      r.itens.push(...itens);
      r.porTipo[tipo.rest] += itens.length;
      pagina++;
    }
  }
  return r;
}
