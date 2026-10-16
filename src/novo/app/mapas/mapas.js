// Dados e regras dos Mapas Mentais. Os mapas ficam em ./dados/GR-xxx.json (um por tema com aula publicada).
// O aluno NUNCA vê códigos GR, referências, links ou páginas: o endereço do mapa usa o "slug" do tema.
import { AREA_CORES } from "../study/temaCores.js";

const arquivos = import.meta.glob("./dados/GR-*.json", { eager: true, import: "default" });

/** Todos os mapas disponíveis (ordem do código do tema). */
export const MAPAS = Object.keys(arquivos)
  .sort()
  .map((k) => arquivos[k])
  .filter((m) => m && m.slug && Array.isArray(m.ramos));

export const mapaPorSlug = (slug) => MAPAS.find((m) => m.slug === slug) ?? null;
export const mapaPorCodigo = (codigo) => MAPAS.find((m) => m.codigo === codigo) ?? null;

export const AREAS_MAPA = [
  ["cm", "Clínica Médica"],
  ["cir", "Cirurgia"],
  ["ped", "Pediatria"],
  ["go", "Ginecologia e Obstetrícia"],
  ["mfc", "Medicina de Família e Comunidade"],
  ["sc", "Saúde Coletiva"],
  ["sm", "Saúde Mental"],
];
export const nomeDaArea = (k) => (AREAS_MAPA.find(([a]) => a === k) ?? [k, ""])[1];

/** Cores semânticas: azul = diagnóstico, verde = conduta, laranja = atenção, vermelho = alerta/erro. [principal, escura, claro p/ tema escuro]. */
export const CORES = {
  azul: ["#2F6FD0", "#1D4F9E", "#8DB5F5"],
  "azul-forte": ["#1565C0", "#0D47A1", "#7DB4F5"],
  ciano: ["#0E8FB0", "#0B6A84", "#78D3EB"],
  verde: ["#1E9E6A", "#12724C", "#7FDDB5"],
  laranja: ["#F0801E", "#B45A07", "#FFB877"],
  vermelho: ["#D6354B", "#A11F33", "#FF8F9F"],
  roxo: ["#7E4FC1", "#54309A", "#C4A3F2"],
  amarelo: ["#E5A317", "#8F6606", "#F6CC6B"],
};
export const corDe = (nome) => CORES[nome] ?? CORES.azul;

/** Cor do tema (área) para o cartão da lista. */
export const corDaArea = (area) => (AREA_CORES[area] ?? AREA_CORES.cm);

/** Sem acento e em minúsculas, para a busca achar "clinica" em "Clínica". */
export const dobrar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Peso aproximado (altura) do cartão na visão de Revisão, para equilibrar as duas colunas. */
export function pesoDoRamo(r) {
  const v = r.revisao ?? {};
  const len = (arr) => (arr ?? []).reduce((n, i) => n + 22 + Math.ceil(itemDe(i).t.length / 48) * 18, 0);
  let h = 70 + len(v.itens) + (v.fluxo?.length ?? 0) * 66 + (v.faixas?.length ?? 0) * 56;
  (v.linhas ?? []).forEach((l) => { h += 24 + len(l.itens); });
  return h;
}

/** Distribui os ramos em esquerda / direita / centro (abaixo do cartão central). `lado` explícito manda ("esq", "dir", "centro", "topo");
 *  os demais vão para a coluna mais baixa naquele momento (o centro só aceita cartões estreitos, sem tabela de linhas).
 *  A ordem dos dados é mantida dentro de cada coluna; no celular a ordem é sempre a dos dados. */
export function distribuir(ramos) {
  const col = { esq: [], dir: [], centro: [], topo: [] };
  const alt = { esq: 0, dir: 0, centro: 430, topo: 0 };
  const por = (lado, r) => { col[lado].push(r); alt[lado] += pesoDoRamo(r) + 18; };
  ramos.forEach((r) => { if (["centro", "esq", "dir", "topo"].includes(r.lado)) por(r.lado, r); });
  ramos.forEach((r) => {
    if (["centro", "esq", "dir", "topo"].includes(r.lado)) return;
    const cabeCentro = !(r.revisao?.linhas?.length) && pesoDoRamo(r) <= 520 && col.centro.length < 3;
    const opcoes = ["esq", "dir", ...(cabeCentro ? ["centro"] : [])];
    por(opcoes.reduce((m, o) => (alt[o] < alt[m] ? o : m), opcoes[0]), r);
  });
  const ordem = (lista) => lista.sort((x, y) => ramos.indexOf(x) - ramos.indexOf(y));
  return { esq: ordem(col.esq), dir: ordem(col.dir), centro: ordem(col.centro), topo: ordem(col.topo) };
}

/** Texto e tom de um item: aceita string ou { t, tom }. */
export const itemDe = (i) => (typeof i === "string" ? { t: i, tom: null } : { t: i?.t ?? "", tom: i?.tom ?? null });

/** Todo o texto que o aluno enxerga num mapa (usado nos testes de "sem código, link ou página"). */
export function textoVisivel(m) {
  const out = [m.titulo, m.subtitulo];
  const itens = (arr) => (arr ?? []).forEach((i) => out.push(itemDe(i).t));
  for (const r of m.ramos) {
    out.push(r.titulo);
    const v = r.revisao ?? {};
    itens(v.itens);
    itens(v.fluxo);
    (v.linhas ?? []).forEach((l) => { out.push(l.rotulo); itens(l.itens); });
    (v.faixas ?? []).forEach((f) => out.push(f.rotulo, f.chip, f.texto));
    (r.aprofundado ?? []).forEach((b) => { out.push(b.titulo); itens(b.itens); itens(b.fluxo); });
  }
  itens(m.pontos_chave);
  itens(m.atencao);
  return out.filter(Boolean).join("\n");
}
