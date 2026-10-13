/**
 * HTML da aula para o aluno, no estilo do modelo criativo-1 (mesmo kit de ilustrações dos cards).
 * Um único modelo de dados (montarAula) e duas saídas:
 *   - "pdf": páginas A4 fixas (794 × 1123 px) paginadas no navegador; marca com data-pdf-* os pontos de
 *     interatividade (links, caixas de marcar, campos de anotação, marcadores) que pdf_interativo.py acrescenta;
 *   - "web": prévia HTML com os mesmos recursos (flashcards que viram, questões que corrigem, checklists, anotações).
 * Nenhum texto clínico é escrito aqui: tudo vem da pasta de conteúdo. Só rótulos de interface.
 */
import { corDoCampo, esc, paletteOf, resolveSpecialty, type VisualContent } from "../../src/shared/visualMaterials/index.ts";
import { sceneSvg, spot, spotForText, heroInnerWhite, themeOf, type SpotName } from "../../src/shared/visualMaterials/kit/index.ts";

// ---------------------------------------------------------------------------- limpeza: nenhuma referência no texto do aluno
/** Trocas padrão (frases que citam documento) + as do arquivo de ajustes. */
export const SUBSTITUICOES_PADRAO: [RegExp, string][] = [
  [/\s*\[\d+(?:\s*[,–-]\s*\d+)*\]/g, ""],
  [/\s*\((?:ver|veja) (?:as )?refer[êe]ncias(?: da aula)?\)/gi, ""],
  [/\b(?:segundo|conforme|de acordo com)\s+(?:o|a|os|as)\s+(?:Guia|Manual|Nota Informativa|Nota Técnica|Protocolo|Caderno|PCDT)[^,.;:]*[,:]?\s*/gi, ""],
  [/\bNo Guia de Vigilância em Saúde(?: revisado)?(?: de (\d{4}))?,/g, "Na recomendação atual$1,"],
  [/\bno manual de (\d{4}),/gi, "em $1,"],
  [/\bo fluxo(grama)? oficial\b/g, "o fluxo$1"],
  [/\bfique com o documento oficial vigente\b/g, "fique com a recomendação vigente"],
];
/** O que ainda parecer referência depois da limpeza vira aviso (e o pipeline para). */
export const SINAIS_DE_REFERENCIA = /\[\d+|Guia de Vigil|Manual de Recomenda|\bmanual de \d{4}|Nota Informativa|Nota Técnica|p\.\s*\d+ do PDF|refer[êe]ncias da aula|\bsegundo o (?:Guia|Manual)|\bconforme o (?:Guia|Manual)|ISBN|https?:\/\//i;

export function limparTexto(t: string, extras: [RegExp, string][] = []): string {
  let s = String(t ?? "");
  for (const [re, by] of [...SUBSTITUICOES_PADRAO, ...extras]) s = s.replace(re, by);
  // "Na recomendação atual2024," → "Na recomendação atual (2024),"
  s = s.replace(/recomendação atual(\d{4}),/g, "recomendação atual ($1),");
  s = s.replace(/^\s*([a-zà-ú])/, (m, c) => m.replace(c, c.toUpperCase()));
  return s.replace(/ {2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
}

// ---------------------------------------------------------------------------- modelo de dados
export type Bloco =
  | { t: "p"; md: string }
  | { t: "sub"; titulo: string }
  | { t: "lista"; itens: string[] }
  | { t: "conceitos"; itens: { termo: string; md: string }[] }
  | { t: "objetivos"; titulo: string; itens: string[] }
  | { t: "post"; md: string }
  | { t: "peg"; md: string }
  | { t: "checks"; titulo: string; itens: string[]; tom: "conduta" | "erro" }
  | { t: "tabela"; c: VisualContent }
  | { t: "passos"; c: VisualContent }
  | { t: "mudou"; itens: { titulo: string; md: string }[] }
  | { t: "caso"; md: string }
  | { t: "aviso"; titulo: string; md: string }
  | { t: "nota"; md: string };

export interface Secao {
  id: string;
  numero: number;
  titulo: string;
  icone: SpotName;
  blocos: Bloco[];
}

export interface Questao {
  numero: number;
  dimensao: string;
  stem: string;
  options: { id: string; text: string }[];
  correct: string;
  comments: Record<string, string>;
  label: string;
}

export interface Flashcard {
  id: string;
  frente: string;
  resposta: string;
  explicacao: string;
}

export interface Imagem {
  arquivo: string;
  titulo: string;
  alt: string;
  pdf?: string;
}

export interface Aula {
  codigo: string;
  titulo: string;
  area: string;
  subarea: string;
  atualizacao: string;
  specialtyKey: string;
  mensagem: string;
  meta: string;
  icone: string;
  /** Cor do tema (GR-xxx ou #RRGGBB); vazio = cor da especialidade. */
  temaCor?: string;
  secoes: Secao[];
  questoes: Questao[];
  flashcards: Flashcard[];
  imagens: Imagem[];
  pdfAluno?: string;
}

// ---------------------------------------------------------------------------- markdown simples → blocos
interface MdSec {
  titulo: string;
  itens: ({ k: "p"; s: string } | { k: "li"; s: string } | { k: "h3"; s: string } | { k: "q"; s: string })[];
}

export function lerMarkdown(md: string): { titulo: string; meta: string; secoes: MdSec[] } {
  const linhas = md.replace(/\r\n?/g, "\n").split("\n");
  let titulo = "";
  let meta = "";
  const secoes: MdSec[] = [];
  let cur: MdSec | null = null;
  let par: string[] = [];
  const fecha = () => {
    if (par.length && cur) cur.itens.push({ k: "p", s: par.join(" ").trim() });
    par = [];
  };
  for (const raw of linhas) {
    const l = raw.trim();
    if (/^#\s+/.test(l)) {
      titulo = l.replace(/^#\s+/, "");
      continue;
    }
    if (/^##\s+/.test(l)) {
      fecha();
      cur = { titulo: l.replace(/^##\s+/, "").replace(/^\d+[.)]\s*/, ""), itens: [] };
      secoes.push(cur);
      continue;
    }
    if (!cur) {
      if (/^\*[^*].*\*$/.test(l) && !meta) meta = l.replace(/^\*|\*$/g, "");
      continue;
    }
    if (/^###\s+/.test(l)) {
      fecha();
      cur.itens.push({ k: "h3", s: l.replace(/^###\s+/, "") });
      continue;
    }
    if (/^>\s?/.test(l)) {
      fecha();
      cur.itens.push({ k: "q", s: l.replace(/^>\s?/, "") });
      continue;
    }
    // marcação de figura do roteiro: a figura é a tabela da página A4, que o montador encaixa
    if (/^[*_]?\[figura:.*\][*_]?$/i.test(l)) {
      fecha();
      cur.itens.push({ k: "p", s: "{{FIGURA_TABELA}}" });
      continue;
    }
    if (/^[-*]\s+/.test(l)) {
      fecha();
      cur.itens.push({ k: "li", s: l.replace(/^[-*]\s+/, "") });
      continue;
    }
    if (!l || /^-{3,}$/.test(l)) {
      fecha();
      continue;
    }
    par.push(l);
  }
  fecha();
  return { titulo, meta, secoes };
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const slug = (s: string) =>
  fold(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

const ICONE_SECAO: [RegExp, SpotName][] = [
  [/caso/, "pessoas"],
  [/conceit|definic/, "livro"],
  [/diagnost|investig/, "microscopio"],
  [/tratament|conduta/, "capsulas"],
  [/acompanh|seguimento|controle/, "calendario"],
  [/erro|armadilh|pegadinh/, "triangulo"],
  [/mudou|atualiz|novidade/, "lupa"],
  [/resumo|revis/, "prancheta"],
];

/** Seções que nunca vão para o aluno (ficam só nos dados internos). */
export const SECOES_INTERNAS = /refer[êe]ncias|trechos citados|fontes|bibliograf/i;

/**
 * Monta as seções do aluno a partir do pdf_aluno.md (já sem referências), encaixando as peças do A4
 * (tabela, pegadinha, passos) e transformando listas em checklists onde o aluno age.
 */
export function montarSecoes(md: MdSec[], a4: VisualContent | null, limpar: (s: string) => string): Secao[] {
  const out: Secao[] = [];
  let n = 0;
  let tabelaUsada = false;
  const temFigura = md.some((s) => s.itens.some((i) => i.s === "{{FIGURA_TABELA}}"));
  let passosUsados = false;
  for (const s of md) {
    if (SECOES_INTERNAS.test(s.titulo)) continue;
    const titulo = limpar(s.titulo);
    const f = fold(titulo);
    const icone = ICONE_SECAO.find(([re]) => re.test(f))?.[1] ?? spotForText(titulo, "prancheta");
    const blocos: Bloco[] = [];
    const itens = s.itens
      .map((i) => ({ ...i, s: limpar(i.s) }))
      .filter((i) => i.s && !/^os n[úu]meros entre colchetes/i.test(i.s) && !/^fontes?:\s*$/i.test(i.s));
    const ehErros = /erro|armadilh/.test(f);
    const ehConceitos = /conceit|definic/.test(f);
    const ehMudou = /mudou|novidade|atualiza/.test(f);
    const ehCaso = /caso/.test(f) && !out.length;
    let sub = "";
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      if (it.k === "h3") {
        sub = fold(it.s);
        // "Voltando ao caso": a conduta vira checklist (uma frase por caixa)
        if (/voltando ao caso|conduta|resumo da conduta/.test(sub)) {
          const prox = itens[i + 1];
          if (prox && prox.k === "p") {
            const frases = prox.s.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕ])/).filter(Boolean);
            blocos.push({ t: "checks", titulo: it.s, itens: frases, tom: "conduta" });
            i++;
            continue;
          }
        }
        blocos.push({ t: "sub", titulo: it.s });
        continue;
      }
      if (it.k === "q") {
        const m = /^\*\*(.+?)\*\*\s*(.*)$/.exec(it.s);
        const tit = m ? m[1].replace(/[:!.]+$/, "") : "";
        const corpo = m ? m[2] : it.s;
        if (/pegadinha/i.test(tit)) blocos.push({ t: "peg", md: corpo.replace(/^(armadilha clássica|armadilha)\s*:\s*/i, "") });
        else if (/tome nota|lembre/i.test(tit)) blocos.push({ t: "post", md: corpo });
        else blocos.push({ t: "aviso", titulo: tit || "Atenção", md: corpo });
        continue;
      }
      if (it.k === "p" && it.s === "{{FIGURA_TABELA}}") {
        if (a4?.tabela && !tabelaUsada) {
          blocos.push({ t: "tabela", c: a4 });
          tabelaUsada = true;
        }
        continue;
      }
      if (it.k === "li") {
        const lis = [it.s];
        while (itens[i + 1]?.k === "li") lis.push(itens[++i].s);
        if (ehErros) blocos.push({ t: "checks", titulo: "Marque quando tiver certeza de que não cai nesta", itens: lis, tom: "erro" });
        else if (ehConceitos) {
          blocos.push({
            t: "conceitos",
            itens: lis.map((l) => {
              const m = /^\*\*(.+?)[:：]?\*\*[:：]?\s*(.+)$/.exec(l);
              return m ? { termo: m[1].replace(/:$/, ""), md: m[2] } : { termo: "", md: l };
            }),
          });
        } else blocos.push({ t: "lista", itens: lis });
        continue;
      }
      // parágrafos
      const p = it.s;
      if (/^material staziamed\b/i.test(p)) {
        blocos.push({ t: "nota", md: p });
        continue;
      }
      if (ehCaso && /^ao final,? voc[êe] vai saber/i.test(p)) {
        const [cab, resto] = p.split(/:\s*/, 2).length === 2 ? [p.slice(0, p.indexOf(":")), p.slice(p.indexOf(":") + 1)] : [p, ""];
        blocos.push({ t: "objetivos", titulo: cab, itens: resto.split(/;\s*/).map((x) => x.replace(/\.$/, "").trim()).filter(Boolean) });
        continue;
      }
      if (ehCaso && !blocos.length) {
        blocos.push({ t: "caso", md: p });
        continue;
      }
      if (/^(armadilha|pegadinha|cuidado)\b/i.test(p)) {
        blocos.push({ t: "peg", md: p.replace(/^(armadilha clássica|armadilha|pegadinha|cuidado)\s*:\s*/i, "") });
        continue;
      }
      if (/^(atenção|e não esqueça|não esqueça|lembre)/i.test(p)) {
        blocos.push({ t: "post", md: p.replace(/^(atenção ao [^:]+|atenção|e não esqueça|não esqueça|lembre-se|lembre)\s*:\s*/i, (m) => (m.includes("ao ") ? m : "")) });
        continue;
      }
      if (ehMudou) {
        const m = /^([^:]{3,90}):\s*(.+)$/.exec(p);
        const last = blocos[blocos.length - 1];
        const item = m ? { titulo: m[1], md: m[2] } : { titulo: "", md: p };
        if (last && last.t === "mudou") last.itens.push(item);
        else blocos.push({ t: "mudou", itens: [item] });
        continue;
      }
      blocos.push({ t: "p", md: p });
      // a tabela do A4 entra logo depois do parágrafo que fala do resultado/fluxograma
      if (a4?.tabela && !tabelaUsada && !temFigura && /fluxograma|^leia o/i.test(p) && /diagnost|investig/.test(f)) {
        blocos.push({ t: "tabela", c: a4 });
        tabelaUsada = true;
      }
    }
    if (a4?.tabela && !tabelaUsada && /diagnost|investig/.test(f)) {
      blocos.push({ t: "tabela", c: a4 });
      tabelaUsada = true;
    }
    if (a4?.pegadinha && /diagnost|investig/.test(f)) blocos.push({ t: "peg", md: a4.pegadinha });
    if (a4?.bloco && !passosUsados && /tratament|conduta/.test(f)) {
      blocos.unshift({ t: "passos", c: a4 });
      passosUsados = true;
    }
    if (a4?.tome_nota && /diagnost|investig/.test(f) && !blocos.some((b) => (b.t === "post" || b.t === "peg") && fold(b.md).includes(fold(a4.tome_nota).replace(/[.!]$/, "").slice(0, 24)))) blocos.push({ t: "post", md: a4.tome_nota });
    out.push({ id: `sec-${++n}-${slug(titulo)}`, numero: n, titulo, icone, blocos });
  }
  return out;
}

// ---------------------------------------------------------------------------- HTML
const cap = (s: string) => s.replace(/^(\s*\**\s*)([a-zà-ú])/, (_m, a, c) => a + c.toUpperCase());
const inline = (md: string) =>
  esc(cap(md))
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*]+?)\*/g, "$1<i>$2</i>");

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function css(P: { p: string; s: string; d: string; glow: string }, fontCss: string, mode: "pdf" | "web") {
  return `${fontCss}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:'Barlow','Segoe UI',sans-serif;color:#142033;background:${mode === "pdf" ? "#FFFFFF" : "#DCE6EA"}}
.cond{font-family:'Barlow Condensed','Arial Narrow',sans-serif}
.cav{font-family:'Caveat','Segoe Print',cursive}
b{font-weight:700;color:#0B2545}
.hdr{background:radial-gradient(130% 150% at 88% 20%, #1A4C8A 0%, #0D2B52 42%, #071A33 100%);color:#fff;position:relative;overflow:hidden}
.ttl{font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-weight:800;text-transform:uppercase;line-height:.9;letter-spacing:-.5px}
.ttl span{color:${P.glow}}
.pill{display:inline-flex;align-items:center;gap:7px;font-family:'Barlow Condensed',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.8px;border:1.5px solid ${hexA(P.glow, 0.75)};border-radius:999px;padding:4px 13px;font-size:13px;color:#fff;white-space:nowrap}
.pill.on{background:${P.glow};color:#0B2545;border-color:${P.glow}}
.band{display:flex;align-items:center;gap:12px;background:linear-gradient(90deg, ${P.d}, ${P.p});border:2px solid ${hexA(P.glow, 0.7)};border-radius:12px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.6px;padding:9px 16px;font-size:18px;line-height:1.1;box-shadow:0 4px 14px rgba(7,26,51,.25)}
.sechead{display:flex;align-items:center;gap:0;margin:4px 0 14px}
.secnum{width:46px;height:46px;border-radius:50%;background:linear-gradient(145deg, ${P.p}, ${P.d});border:3.5px solid #fff;box-shadow:0 2px 6px rgba(11,37,69,.3);display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-style:italic;font-weight:800;font-size:27px;color:#fff;position:relative;z-index:2;flex:none}
.sectab{margin-left:-14px;background:#0B2545;color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.6px;font-size:22px;padding:7px 34px 7px 26px;clip-path:polygon(0 0,100% 0,calc(100% - 16px) 100%,0 100%)}
.secart{margin-left:auto;width:64px;height:64px;border-radius:50%;background:radial-gradient(circle at 40% 35%, ${hexA(P.glow, 0.45)}, ${hexA(P.p, 0.12)} 70%);display:flex;align-items:center;justify-content:center;flex:none;border:2px solid ${hexA(P.p, 0.35)}}
.p{font-size:14.6px;line-height:1.5;margin:0 0 10px}
.sub{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:${P.d};font-size:18px;margin:6px 0 8px;display:flex;align-items:center;gap:8px}
.card{background:#fff;border:1px solid #D6E4E7;border-radius:14px;box-shadow:0 2px 10px rgba(11,37,69,.08);padding:14px 16px;margin:0 0 12px}
.caso{display:flex;gap:16px;align-items:flex-start;background:linear-gradient(135deg,#fff 0%,${P.s} 100%)}
.lst{margin:0 0 12px;padding:0;list-style:none}.lst li{display:flex;gap:9px;align-items:flex-start;font-size:14.4px;line-height:1.45;margin-bottom:6px}
.conc{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 12px}.conc .card{margin:0;font-size:13.6px;line-height:1.42}.conc .term{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:18px;text-transform:uppercase;color:${P.d};display:flex;gap:8px;align-items:center;margin-bottom:4px}
.post{position:relative;background:linear-gradient(160deg,#FFF3AE 0%,#FFE57E 55%,#FFD95A 100%);padding:24px 18px 14px;transform:rotate(-1.2deg);box-shadow:0 6px 14px rgba(11,37,69,.2);border-radius:4px;margin:14px 26px 16px 8px}
.post:before{content:"";position:absolute;top:-9px;left:50%;width:84px;height:18px;margin-left:-42px;background:rgba(158,216,230,.85);transform:rotate(-4deg)}
.post .h{display:flex;align-items:center;gap:8px;font-family:'Caveat',cursive;font-weight:700;font-size:30px;color:#0B2545;line-height:1}
.post .t{font-family:'Caveat',cursive;font-weight:700;font-size:23px;line-height:1.12;color:#142033;margin-top:4px}
.aviso{display:flex;gap:12px;align-items:flex-start;border-left:6px solid #F2B705;background:linear-gradient(90deg,#FFF8DB,#FFFDF3);border-radius:12px;padding:12px 16px;margin:6px 0 14px;box-shadow:0 2px 8px rgba(11,37,69,.06)}
.aviso .h{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;color:#8A5A00;font-size:19px;line-height:1}.aviso .t{font-size:14.2px;line-height:1.45;margin-top:4px}
.peg{display:flex;gap:14px;align-items:center;border:2.5px solid #C8102E;border-radius:14px;background:linear-gradient(180deg,#fff,#FFF3F4);padding:12px 16px;margin:6px 0 14px}
.peg .h{font-family:'Barlow Condensed',sans-serif;font-style:italic;font-weight:800;text-transform:uppercase;color:#C8102E;font-size:24px;line-height:1}
.peg .t{font-size:14.2px;line-height:1.42;margin-top:3px}
.chk{border:2px solid ${hexA(P.p, 0.35)};border-radius:14px;background:#fff;padding:12px 16px;margin:4px 0 14px}
.chk.erro{border-color:rgba(200,16,46,.35);background:linear-gradient(180deg,#fff,#FFF8F9)}
.chk .h{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;color:${P.d};font-size:18px;display:flex;gap:8px;align-items:center;margin-bottom:8px}
.chk.erro .h{color:#C8102E}
.row{display:flex;gap:10px;align-items:flex-start;font-size:14.2px;line-height:1.42;padding:5px 0;border-top:1px dashed #D6E4E7}.row:first-of-type{border-top:0}
.box{width:17px;height:17px;flex:none;border:2px solid #0B2545;border-radius:4px;background:#fff;margin-top:2px;display:block}
.notes{margin:10px 0 4px;border:1.5px dashed ${hexA(P.p, 0.55)};border-radius:12px;padding:8px 12px 10px;background:#FBFDFD}
.notes .h{font-family:'Caveat',cursive;font-weight:700;font-size:22px;color:${P.d};display:flex;gap:6px;align-items:center}
.notes .area{height:96px;background:repeating-linear-gradient(180deg, transparent 0 23px, #D6E4E7 23px 24px)}
.tbl{border:1px solid #D6E4E7;border-radius:12px;overflow:hidden;margin:4px 0 14px;background:#fff;box-shadow:0 2px 10px rgba(11,37,69,.08)}
.tbl .th,.tbl .tr{display:grid}.tbl .th{background:#0B2545;color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:13px}
.tbl .th div,.tbl .tr>div{padding:8px 12px;display:flex;gap:9px;align-items:center}
.tbl .tr{border-top:1px solid #D6E4E7;font-size:13.6px}.tbl .tr>div+div{border-left:1px solid #D6E4E7}
.steps{border:2px solid ${hexA(P.p, 0.35)};border-radius:14px;background:#fff;padding:12px 16px;margin:0 0 14px}
.steps .h{display:flex;gap:10px;align-items:center;font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;color:${P.d};font-size:21px;margin-bottom:8px}
.steps .g{display:grid;gap:0}
.stp{display:flex;gap:9px;align-items:center;padding:6px 10px;font-size:13.4px;line-height:1.3}
.num{width:26px;height:26px;border-radius:50%;background:${P.s};border:2px solid ${P.p};display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-weight:800;color:${P.d};font-size:16px;flex:none}
.mud{display:grid;gap:10px;margin:0 0 12px}.mud .card{margin:0;display:flex;gap:12px;font-size:14px;line-height:1.45}.mud .tt{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:18px;text-transform:uppercase;color:${P.d};margin-bottom:2px}
.obj{background:#0B2545;color:#fff;border-radius:14px;padding:12px 16px;margin:0 0 12px}.obj .h{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;color:${P.glow};font-size:18px;margin-bottom:6px}.obj .it{display:flex;gap:8px;align-items:center;font-size:14px;line-height:1.35;padding:3px 0}
.btn{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:6px 16px;font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.6px;font-size:15px;text-decoration:none;cursor:pointer;border:0}
.btn.pri{background:${P.d};color:#fff}.btn.sec{background:#fff;color:${P.d};border:2px solid ${hexA(P.p, 0.5)}}.btn.glow{background:${P.glow};color:#0B2545}
.alt{display:flex;gap:12px;align-items:flex-start;border:2px solid #D6E4E7;border-radius:12px;background:#fff;padding:10px 14px;margin:0 0 9px;font-size:14.4px;line-height:1.42;color:#142033;text-decoration:none}
.alt .l{width:30px;height:30px;border-radius:50%;flex:none;background:#0B2545;color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:18px}
.fc{border-radius:20px;overflow:hidden;background:#fff;border:1px solid #D6E4E7;box-shadow:0 4px 14px rgba(11,37,69,.1);display:flex;flex-direction:column}
.fc .top{background:radial-gradient(130% 150% at 88% 20%, #1A4C8A 0%, #0D2B52 42%, #071A33 100%);color:#fff;padding:9px 14px;display:flex;justify-content:space-between;align-items:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.8px;font-size:13px}
.fc .q{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;color:#0B2545;line-height:1;padding:14px 16px}
.fc .ans{background:linear-gradient(120deg, ${P.d}, ${P.p});color:#fff;padding:14px 18px;font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;line-height:1}
.foot-ofc{font-size:11.5px;color:#5B6B80;text-align:center;margin-top:10px}
`;
}

/** Rótulo, ícone e cores do kit para a aula. */
function paleta(aula: Aula) {
  const tema = corDoCampo(aula.temaCor ?? "");
  if (tema) return { p: tema.primaria, s: tema.clara, d: tema.escura, glow: tema.brilho };
  const t = paletteOf(aula.specialtyKey);
  const glow: Record<string, string> = { clinica_medica: "#5FE6C0", pediatria: "#8EC8FF", ginecologia: "#FF9EC2", cirurgia: "#FFA59C", preventiva_mfc: "#C9B8FF", fallback: "#7FE3DE" };
  return { p: t.primary, s: t.soft, d: t.dark, glow: glow[aula.specialtyKey] ?? glow.fallback };
}

function tituloDuasCores(t: string) {
  const i = t.indexOf(":");
  if (i > 0 && i < t.length - 1) return `${esc(t.slice(0, i + 1))}<br><span>${esc(t.slice(i + 1).trim())}</span>`;
  const w = t.split(/\s+/);
  const k = Math.ceil(w.length / 2);
  return w.length > 1 ? `${esc(w.slice(0, k).join(" "))}<br><span>${esc(w.slice(k).join(" "))}</span>` : esc(t);
}

type Mode = "pdf" | "web";

const ROW_LOOK = (P: ReturnType<typeof paleta>) => ({
  alerta: { stripe: "#C8102E", bg: "#FFF3F4", text: "#C8102E", badge: "alerta" as SpotName, end: "triangulo" as SpotName, endC: "#C8102E" },
  cycle: [
    { stripe: P.p, bg: P.s, text: "#0B2545", badge: "ok" as SpotName, end: "documento" as SpotName, endC: P.d },
    { stripe: "#3A7BD5", bg: "#EAF2FC", text: "#0B2545", badge: "pergunta" as SpotName, end: "lupa" as SpotName, endC: "#3A7BD5" },
    { stripe: "#5B6B80", bg: "#F1F4F7", text: "#0B2545", badge: "neutro" as SpotName, end: "seta" as SpotName, endC: "#5B6B80" },
  ],
});

function blocoHtml(b: Bloco, P: ReturnType<typeof paleta>, mode: Mode, ctx: { sec: string; seq: () => number }): string {
  switch (b.t) {
    case "p":
      return `<p class="p blk">${inline(b.md)}</p>`;
    case "sub":
      return `<div class="sub blk">${spot("seta", 20, P.d)}${esc(b.titulo)}</div>`;
    case "caso":
      return `<div class="card caso blk">${spot("tosse", 70, "#0B2545")}<div class="p" style="margin:0">${inline(b.md)}</div></div>`;
    case "objetivos":
      return `<div class="obj blk"><div class="h">${esc(b.titulo)}</div>${b.itens.map((i) => `<div class="it">${spot("ok", 20)}<span>${inline(i)}</span></div>`).join("")}</div>`;
    case "lista":
      return `<ul class="lst blk">${b.itens.map((i) => `<li>${spot(spotForText(i, "ok"), 22)}<span>${inline(i)}</span></li>`).join("")}</ul>`;
    case "conceitos":
      return b.itens.map((i, k) => (k % 2 === 0 ? `<div class="conc blk">${[i, b.itens[k + 1]].filter(Boolean).map((x) => `<div class="card">${x!.termo ? `<div class="term">${spot(spotForText(x!.termo + " " + x!.md, "livro"), 22, P.d)}${esc(x!.termo)}</div>` : ""}${inline(x!.md)}</div>`).join("")}</div>` : "")).join("");
    case "post":
      return `<div class="blk" style="padding-top:4px"><div class="post"><div class="h">${spot("lampada", 28)}Tome nota!</div><div class="t">${inline(b.md)}</div></div></div>`;
    case "aviso":
      return `<div class="aviso blk">${spot("lampada", 34, P.d)}<div><div class="h">${esc(b.titulo)}</div><div class="t">${inline(b.md)}</div></div></div>`;
    case "nota":
      return `<div class="foot-ofc blk" style="text-align:left;margin:4px 0 12px">${inline(b.md)}</div>`;
    case "peg":
      return `<div class="peg blk">${spot("triangulo", 52, "#C8102E")}<div><div class="h">Pegadinha de prova!</div><div class="t">${inline(b.md)}</div></div></div>`;
    case "checks": {
      const rows = b.itens
        .map((i) => {
          const name = `${ctx.sec}-c${ctx.seq()}`;
          const box = mode === "pdf" ? `<span class="box" data-pdf-check="${name}" data-label="${esc(i.slice(0, 120))}"></span>` : `<input type="checkbox" class="cbx" data-store="${name}">`;
          return `<label class="row">${box}<span>${inline(i)}</span></label>`;
        })
        .join("");
      return `<div class="chk ${b.tom === "erro" ? "erro" : ""} blk"><div class="h">${spot(b.tom === "erro" ? "triangulo" : "prancheta", 24, b.tom === "erro" ? "#C8102E" : P.d)}${esc(b.titulo)}</div>${rows}</div>`;
    }
    case "tabela": {
      const tab = b.c.tabela!;
      const L = ROW_LOOK(P);
      const cols = tab.colunas.length === 2 ? "1.05fr 1.3fr" : "1.1fr 1fr 1.15fr";
      let nn = 0;
      const rows = tab.linhas
        .map((r) => {
          const look = r.tipo === "alerta" ? L.alerta : L.cycle[Math.min(r.tipo === "destaque" ? 0 : nn++, 2)];
          return `<div class="tr" style="grid-template-columns:${cols}">${r.celulas
            .map((cell, j) =>
              j === 0
                ? `<div style="border-left:5px solid ${look.stripe};background:${look.bg};font-weight:700;color:${look.text}">${spot(look.badge, 24)}<span>${esc(cell)}</span></div>`
                : `<div style="background:${j === r.celulas.length - 1 ? look.bg : "#fff"};${r.tipo === "alerta" ? "color:#C8102E;font-weight:600" : ""}">${j === r.celulas.length - 1 ? spot(look.end, 22, look.endC) : ""}<span>${esc(cell)}</span></div>`
            )
            .join("")}</div>`;
        })
        .join("");
      return `<div class="blk">${tab.titulo ? `<div class="sub">${spot("lupa", 20, P.d)}${esc(tab.titulo)}</div>` : ""}<div class="tbl"><div class="th" style="grid-template-columns:${cols}">${tab.colunas.map((c) => `<div>${esc(c)}</div>`).join("")}</div>${rows}</div></div>`;
    }
    case "passos": {
      const bl = b.c.bloco!;
      const rows = bl.itens
        .map((it, i) => {
          const name = `${ctx.sec}-p${ctx.seq()}`;
          const box = mode === "pdf" ? `<span class="box" data-pdf-check="${name}" data-label="${esc(it.slice(0, 120))}"></span>` : `<input type="checkbox" class="cbx" data-store="${name}">`;
          return `<label class="stp" style="${i ? "border-top:1px dashed #D6E4E7" : ""}">${box}<div class="num">${i + 1}</div>${spot(spotForText(it, "ok"), 30)}<span>${esc(it)}</span></label>`;
        })
        .join("");
      return `<div class="steps blk"><div class="h"><div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(145deg, ${P.p}, ${P.d});display:flex;align-items:center;justify-content:center">${spot("prancheta", 21, "#fff")}</div>${esc(bl.titulo || "Passos")}</div><div class="g">${rows}</div></div>`;
    }
    case "mudou":
      return `<div class="mud blk">${b.itens.map((i) => `<div class="card">${spot(spotForText(i.titulo + " " + i.md, "calendario"), 34, P.d)}<div>${i.titulo ? `<div class="tt">${esc(i.titulo)}</div>` : ""}${inline(i.md)}</div></div>`).join("")}</div>`;
  }
}

function notasHtml(sec: Secao, P: ReturnType<typeof paleta>, mode: Mode) {
  const name = `${sec.id}-notas`;
  return `<div class="notes blk"><div class="h">${spot("prancheta", 22, P.d)}Minhas anotações</div>${
    mode === "pdf" ? `<div class="area" data-pdf-field="${name}" data-label="Anotações: ${esc(sec.titulo)}"></div>` : `<textarea class="area" data-store="${name}" style="width:100%;border:0;resize:vertical;font:inherit;font-size:15px;line-height:24px;padding:0 4px;background-color:transparent"></textarea>`
  }</div>`;
}

function secaoHead(sec: Secao, P: ReturnType<typeof paleta>) {
  return `<div class="sechead blk" id="${sec.id}" data-pdf-dest="${sec.id}" data-pdf-bookmark="1" data-title="${esc(sec.numero + ". " + sec.titulo)}"><div class="secnum">${sec.numero}</div><div class="sectab">${esc(sec.titulo)}</div><div class="secart">${spot(sec.icone, 40, "#0B2545")}</div></div>`;
}

function capa(aula: Aula, P: ReturnType<typeof paleta>, mode: Mode) {
  const th = themeOf(aula.icone);
  const scene = sceneSvg(th.scene, `capa-${mode}`, { glow: P.glow, primary: P.p }, heroInnerWhite(th.hero), "width:100%;height:100%");
  const recursos = [
    ["seta", "Sumário e títulos clicáveis; botão para voltar ao sumário em cada página"],
    ["prancheta", "Caixas para marcar nos passos de conduta e nos erros frequentes"],
    ["pergunta", "Questões de fixação: toque na alternativa e veja a explicação dela"],
    ["virar", "Flashcards: toque em virar para ver a resposta"],
    ["lampada", "Um espaço de anotações em cada seção"],
  ] as [SpotName, string][];
  return `<div class="hdr" style="padding:44px 40px 50px;${mode === "pdf" ? "flex:1;display:flex;flex-direction:column" : "border-radius:0 0 28px 28px"}">
<div style="position:absolute;right:${mode === "pdf" ? 10 : -6}px;top:${mode === "pdf" ? 372 : 40}px;width:${mode === "pdf" ? 540 : 400}px;height:${mode === "pdf" ? 405 : 300}px">${scene}</div>
<div style="position:relative;width:${mode === "pdf" ? 470 : 440}px;display:flex;flex-direction:column;gap:14px">
<div style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill">${spot("estetoscopio", 16, P.glow)}${esc(aula.area)}${aula.subarea ? ` · ${esc(aula.subarea)}` : ""}</span></div>
<div class="ttl" style="font-size:${mode === "pdf" ? 58 : 52}px">${tituloDuasCores(aula.titulo)}</div>
<div style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill">${spot("livro", 16, P.glow)}Material StaziaMed</span><span class="pill on">${spot("calendario", 16, "#0B2545")}Atualizado ${esc(aula.atualizacao)}</span><span class="pill">${esc(aula.codigo)}</span></div>
</div>
<div style="position:relative;margin-top:${mode === "pdf" ? "auto" : "30px"};max-width:714px">${aula.mensagem ? `<div class="band">${spot("alvo", 24, "#fff")}<span>${esc(aula.mensagem)}</span></div>` : ""}</div>
<div style="position:relative;margin-top:22px;background:rgba(255,255,255,0.06);border:1.5px solid ${hexA(P.glow, 0.35)};border-radius:16px;padding:14px 18px;max-width:714px"><div class="cond" style="font-weight:800;text-transform:uppercase;letter-spacing:1px;color:${P.glow};font-size:16px;margin-bottom:8px">${mode === "pdf" ? "Como usar este PDF" : "Como usar esta prévia"}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:9px 18px">${recursos.map(([i, t]) => `<div style="display:flex;gap:9px;align-items:center;font-size:13.6px;line-height:1.3;color:#E3EAF4">${spot(i, 24, P.glow)}<span>${esc(t)}</span></div>`).join("")}</div>${mode === "pdf" ? `<div style="font-size:12px;color:#A9B8CC;margin-top:10px">Se o seu leitor de PDF não aceitar formulários, as caixas e as linhas continuam no papel: dá para imprimir e marcar à mão.</div>` : ""}</div>
${mode === "pdf" && aula.meta ? `<div style="position:relative;margin-top:16px;font-size:12.5px;color:#C3D0E2;max-width:714px">${esc(aula.meta)}</div>` : ""}
</div>`;
}

function questoesHtml(aula: Aula, P: ReturnType<typeof paleta>, mode: Mode): { perguntas: string[]; respostas: string[] } {
  const perguntas: string[] = [];
  const respostas: string[] = [];
  aula.questoes.forEach((q, qi) => {
    const qid = `q${q.numero}`;
    const head = `<div class="sechead" ${qi === 0 && mode === "pdf" ? 'id="questoes" data-pdf-dest="questoes" data-pdf-bookmark="1" data-title="Questões de fixação"' : ""}><div class="secnum">${q.numero}</div><div class="sectab">Questão ${q.numero}${q.dimensao ? ` · ${esc(q.dimensao)}` : ""}</div><div class="secart">${spot("pergunta", 40)}</div></div>`;
    const alts = q.options
      .map((o) =>
        mode === "pdf"
          ? `<div class="alt" data-pdf-link="${qid}-${o.id}"><div class="l">${o.id}</div><div>${esc(o.text)}</div></div>`
          : `<button class="alt" data-q="${qid}" data-op="${o.id}" style="width:100%;text-align:left;font:inherit;font-size:15px"><div class="l">${o.id}</div><div>${esc(o.text)}</div></button>`
      )
      .join("");
    const expl = mode === "web" ? `<div class="expl" id="${qid}-expl" hidden></div><script type="application/json" id="${qid}-data">${JSON.stringify({ correct: q.correct, comments: q.comments }).replace(/</g, "\\u003c")}</script>` : "";
    perguntas.push(
      `<div id="${qid}" data-pdf-dest="${qid}">${head}<div class="card" style="font-size:15px;line-height:1.5"><div class="cond" style="font-weight:700;text-transform:uppercase;color:${P.d};font-size:13px;letter-spacing:1px;margin-bottom:4px">${esc(q.label)}</div>${esc(q.stem)}</div>${
        mode === "pdf" ? `<div class="cond" style="font-weight:700;color:#5B6B80;font-size:14px;margin:0 0 8px;text-transform:uppercase;letter-spacing:.6px">Toque na alternativa para ver a explicação dela</div>` : ""
      }${alts}${expl}</div>`
    );
    if (mode === "pdf") {
      for (const o of q.options) {
        const ok = o.id === q.correct;
        const prox = qi + 1 < aula.questoes.length ? `q${aula.questoes[qi + 1].numero}` : aula.flashcards.length ? "flashcards" : "sumario";
        respostas.push(
          `<div data-pdf-dest="${qid}-${o.id}"><div class="sechead"><div class="secnum">${q.numero}</div><div class="sectab">Questão ${q.numero} · você marcou ${o.id}</div><div class="secart">${spot(ok ? "ok" : "alerta", 44)}</div></div>
<div class="card" style="border:3px solid ${ok ? "#2E9B67" : "#C8102E"};background:${ok ? "#EAF7F0" : "#FFF3F4"}"><div class="cond" style="font-weight:800;font-size:34px;text-transform:uppercase;color:${ok ? "#1B6B45" : "#C8102E"};display:flex;align-items:center;gap:12px">${spot(ok ? "ok" : "alerta", 40)}${ok ? "Correta!" : "Não é essa"}</div>
<div style="display:flex;gap:12px;align-items:flex-start;margin-top:10px"><div class="alt" style="margin:0;flex:1;border-color:${ok ? "#2E9B67" : "#E7A0AA"}"><div class="l">${o.id}</div><div>${esc(o.text)}</div></div></div>
<p class="p" style="margin:12px 0 0;font-size:15.2px">${inline(q.comments[o.id] ?? "")}</p></div>
<div style="display:flex;gap:10px;margin-top:6px">${ok ? "" : `<span class="btn pri" data-pdf-link="${qid}">${spot("virar", 18, "#fff")}Tentar de novo</span>`}${ok ? `<span class="btn pri" data-pdf-link="${prox}">${spot("seta", 18, "#fff")}Próxima</span><span class="btn sec" data-pdf-link="${qid}">Rever a questão</span>` : ""}</div></div>`
        );
      }
    }
  });
  return { perguntas, respostas };
}

function flashFrente(f: Flashcard, i: number, P: ReturnType<typeof paleta>, mode: Mode, total: number) {
  return `<div class="fc" ${mode === "pdf" ? `data-pdf-dest="fc-${i + 1}"` : ""} style="height:${mode === "pdf" ? 300 : 280}px"><div class="top"><span>Flashcard ${i + 1} de ${total}</span><span>${esc(f.id)}</span></div><div style="display:flex;gap:10px;align-items:center;padding:12px 16px 0">${spot("pergunta", 34)}<span class="cond" style="font-weight:800;color:${P.d};letter-spacing:3px;text-transform:uppercase;font-size:15px">Pergunta</span></div><div class="q" style="font-size:25px;flex:1">${esc(f.frente)}</div><div style="padding:0 16px 14px">${
    mode === "pdf" ? `<span class="btn glow" data-pdf-link="fc-${i + 1}-verso">${spot("virar", 18, "#0B2545")}Virar</span>` : `<button class="btn glow fc-flip">${spot("virar", 18, "#0B2545")}Virar</button>`
  }</div></div>`;
}

function flashVerso(f: Flashcard, i: number, P: ReturnType<typeof paleta>, mode: Mode, total: number, icone = "prancheta") {
  const nav =
    mode === "pdf"
      ? `<span class="btn sec" data-pdf-link="fc-${i + 1}">${spot("virar", 18, P.d)}Voltar à frente</span>${i + 1 < total ? `<span class="btn pri" data-pdf-link="fc-${i + 2}">${spot("seta", 18, "#fff")}Próximo card</span>` : `<span class="btn pri" data-pdf-link="sumario">${spot("seta", 18, "#fff")}Voltar ao sumário</span>`}`
      : `<button class="btn sec fc-flip">${spot("virar", 18, P.d)}Voltar à frente</button>`;
  const th = themeOf(icone);
  const cena = mode === "pdf" ? `<div style="background:radial-gradient(130% 150% at 88% 20%, #1A4C8A 0%, #0D2B52 42%, #071A33 100%);height:230px;display:flex;justify-content:flex-end;padding-right:20px">${sceneSvg(th.scene, `fcv-${i}`, { glow: P.glow, primary: P.p }, heroInnerWhite(th.hero), "height:230px;width:307px")}</div>` : "";
  return `<div class="fc" ${mode === "pdf" ? `data-pdf-dest="fc-${i + 1}-verso"` : ""} style="${mode === "pdf" ? "" : "height:280px"}"><div class="top"><span>Flashcard ${i + 1} de ${total} · verso</span><span>${esc(f.id)}</span></div>${cena}<div class="ans" style="font-size:${mode === "pdf" ? 34 : 24}px"><div style="font-size:14px;letter-spacing:4px;margin-bottom:6px;display:flex;gap:8px;align-items:center">${spot("ok", 20)}Resposta</div>${esc(f.resposta)}</div>${
    f.explicacao ? `<div style="padding:14px 18px;font-size:${mode === "pdf" ? 16 : 14.2}px;line-height:1.45;flex:1"><div class="cond" style="font-weight:800;text-transform:uppercase;color:${P.d};letter-spacing:2px;font-size:15px;display:flex;gap:8px;align-items:center;margin-bottom:4px">${spot("lampada", 22, P.d)}Explicação</div>${inline(f.explicacao)}</div>` : ""
  }<div style="padding:0 18px 14px;display:flex;gap:10px">${nav}</div></div>`;
}

// ---------------------------------------------------------------------------- documento do PDF
export function htmlPdf(aula: Aula, fontCss: string): string {
  const P = paleta(aula);
  let seq = 0;
  const fixed: string[] = [];
  const pageOpen = (extra = "") => `<div class="pg fixed" ${extra}>`;
  // capa
  fixed.push(`${pageOpen('data-kind="capa"')}${capa(aula, P, "pdf")}<div class="pgfoot">Material StaziaMed · não é material oficial do Inep</div></div>`);
  // sumário
  const entradas = [
    ...aula.secoes.map((s) => ({ id: s.id, t: `${s.numero}. ${s.titulo}`, icone: s.icone })),
    ...(aula.questoes.length ? [{ id: "questoes", t: "Questões de fixação", icone: "pergunta" as SpotName }] : []),
    ...(aula.flashcards.length ? [{ id: "flashcards", t: "Flashcards", icone: "virar" as SpotName }] : []),
  ];
  fixed.push(
    `${pageOpen('data-kind="sumario"')}<div class="pgtop"></div><div class="pgbody"><div class="sechead" id="sumario" data-pdf-dest="sumario" data-pdf-bookmark="1" data-title="Sumário"><div class="secnum">${spot("prancheta", 24, "#fff")}</div><div class="sectab">Sumário</div></div>${entradas
      .map((e) => `<div class="alt" data-pdf-link="${e.id}" style="align-items:center;margin-bottom:10px">${spot(e.icone, 30, P.d)}<div style="flex:1;font-weight:600;font-size:16px">${esc(e.t)}</div><div class="cond toc-pg" data-for="${e.id}" style="font-weight:800;color:${P.d};font-size:18px"></div></div>`)
      .join("")}<div class="foot-ofc" style="margin-top:18px">Toque em um item para ir até ele. Em cada página, o botão "Sumário" traz você de volta.</div></div><div class="pgfoot"></div></div>`
  );
  const front: string[] = [];
  // seções (paginadas no navegador)
  const flow = aula.secoes
    .map((s) => {
      const ctx = { sec: s.id, seq: () => ++seq };
      return `<section class="flow" data-title="${esc(s.titulo)}">${secaoHead(s, P)}${s.blocos.map((b) => blocoHtml(b, P, "pdf", ctx)).join("")}${notasHtml(s, P, "pdf")}</section>`;
    })
    .join("");
  const q = questoesHtml(aula, P, "pdf");
  const questoes = q.perguntas.map((h) => `<section class="flow" data-own-page="1" data-title="Questões de fixação">${h}</section>`).join("");
  // flashcards: frentes 2 × 3 por página, versos um por página
  const fcs = aula.flashcards;
  for (let i = 0; i < fcs.length; i += 6) {
    const grupo = fcs.slice(i, i + 6);
    front.push(
      `${pageOpen('data-kind="flash"')}<div class="pgtop"></div><div class="pgbody">${
        i === 0 ? `<div class="sechead" id="flashcards" data-pdf-dest="flashcards" data-pdf-bookmark="1" data-title="Flashcards"><div class="secnum">${spot("virar", 24, "#fff")}</div><div class="sectab">Flashcards</div></div>` : ""
      }<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">${grupo.map((f, k) => flashFrente(f, i + k, P, "pdf", fcs.length)).join("")}</div></div><div class="pgfoot"></div></div>`
    );
  }
  const versos = fcs.map((f, i) => `${pageOpen('data-kind="flash"')}<div class="pgtop"></div><div class="pgbody vers" style="display:flex;flex-direction:column;justify-content:center">${flashVerso(f, i, P, "pdf", fcs.length, aula.icone)}</div><div class="pgfoot"></div></div>`);
  const respostas = q.respostas.map((h) => `${pageOpen('data-kind="resp"')}<div class="pgtop"></div><div class="pgbody resp" style="display:flex;flex-direction:column;justify-content:center">${h}</div><div class="pgfoot"></div></div>`);
  const fim = `${pageOpen('data-kind="fim"')}<div class="pgtop"></div><div class="pgbody" style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:14px">${spot("ok", 90)}<div class="ttl" style="font-size:46px;color:#0B2545">Fim da aula</div><div class="foot-ofc" style="font-size:13px">Material StaziaMed. Não é material oficial do Inep.</div></div><div class="pgfoot"></div></div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(aula.codigo)} · ${esc(aula.titulo)}</title><style>${css(P, fontCss, "pdf")}
@page{size:210mm 297mm;margin:0}
.pg{width:794px;height:1123px;position:relative;overflow:hidden;break-after:page;background:#F4F8F9;display:flex;flex-direction:column}
.pg:last-child{break-after:auto}
.pgtop{flex:none;height:44px;background:#0B2545;display:flex;align-items:center;justify-content:space-between;padding:0 28px;color:#DCE6F2;font-family:'Barlow Condensed',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:13px}
.pgbody{flex:1;min-height:0;padding:22px 40px 10px;overflow:hidden}
.resp .p{font-size:18px!important;line-height:1.55}.resp .alt{font-size:16.5px}.resp .btn{font-size:19px;padding:9px 22px}
.vers .fc{min-height:760px}.vers .ans{font-size:48px!important;padding:26px 30px}.vers .fc>div:nth-child(4){font-size:20px!important;padding:24px 30px!important}.vers .btn{font-size:19px;padding:9px 22px}
.pgfoot{flex:none;height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 40px;font-size:11px;color:#5B6B80;border-top:1px solid #D6E4E7;background:#fff}
</style></head><body>
<div id="out"></div>
<div id="src" style="position:absolute;left:-9999px;top:0">${fixed.join("")}${flow}${questoes}${front.join("")}${versos.join("")}${respostas.join("")}${fim}</div>
<script>
(function(){
  var out=document.getElementById('out'), src=document.getElementById('src');
  var TOPO=${JSON.stringify(`${aula.codigo} · ${aula.titulo.split(":")[0]}`)};
  function topo(pg, secao){var t=pg.querySelector('.pgtop'); if(!t) return; t.innerHTML='<span>'+TOPO.replace(/[<&]/g,'')+(secao?' · '+secao.replace(/[<&]/g,''):'')+'</span><span class="btn" data-pdf-link="sumario" style="background:${P.glow};color:#0B2545;padding:4px 14px;font-size:13px">${spot("seta", 15, "#0B2545").replace(/'/g, "\\'")} Sumário</span>';}
  function nova(secao){var pg=document.createElement('div');pg.className='pg';pg.innerHTML='<div class="pgtop"></div><div class="pgbody"></div><div class="pgfoot"></div>';out.appendChild(pg);topo(pg,secao);return pg.querySelector('.pgbody');}
  var body=null;
  Array.prototype.slice.call(src.children).forEach(function(el){
    if(el.classList.contains('pg')){body=null; out.appendChild(el); if(el.getAttribute('data-kind')!=='capa' && el.getAttribute('data-kind')!=='sumario') topo(el, el.getAttribute('data-kind')==='flash'?'Flashcards':el.getAttribute('data-kind')==='resp'?'Questões de fixação':''); if(el.getAttribute('data-kind')==='sumario') topo(el,''); return;}
    var titulo=el.getAttribute('data-title')||'';
    var ult=body&&body.lastElementChild, livre=ult?body.clientHeight-(ult.offsetTop+ult.offsetHeight-body.offsetTop)-10:0;
    if(body && livre>=300 && el.getAttribute('data-own-page')!=='1'){var sp=document.createElement('div');sp.style.height='18px';body.appendChild(sp);} else body=nova(titulo);
    var blocks=el.classList.contains('flow')?Array.prototype.slice.call(el.children):[el];
    blocks.forEach(function(b){body.appendChild(b);
      // anotações: encolhem (mínimo de 2 linhas) antes de pular sozinhas para a página seguinte
      if(b.classList.contains('notes') && body.scrollHeight>body.clientHeight+1){var ar=b.querySelector('.area'); if(ar){ar.style.height='48px'; if(body.scrollHeight>body.clientHeight+1) ar.style.height='';}}
      if(body.scrollHeight>body.clientHeight+1 && body.children.length>1){
      body.removeChild(b);
      // o título da seção nunca fica sozinho no fim da página
      var prev=body.lastElementChild, junto=[];
      while(prev && (prev.classList.contains('sechead')||prev.classList.contains('sub')) ){junto.unshift(prev); var pp=prev.previousElementSibling; body.removeChild(prev); prev=pp;}
      if(prev && !prev.classList.contains('blk') && prev.style && prev.style.height==='18px') body.removeChild(prev);
      body=nova(titulo); junto.forEach(function(j){body.appendChild(j)}); body.appendChild(b);}});
  });
  var pages=Array.prototype.slice.call(out.querySelectorAll('.pg'));
  var problemas=[];
  pages.forEach(function(pg,i){var f=pg.querySelector('.pgfoot'); if(f && !f.textContent.trim()) f.innerHTML='<span>Material StaziaMed · não é material oficial do Inep</span><span>página '+(i+1)+' de '+pages.length+'</span>'; var b=pg.querySelector('.pgbody'); if(b && b.scrollHeight>b.clientHeight+1) problemas.push('página '+(i+1)+': conteúdo não coube');});
  function pos(el){var pg=el.closest('.pg'); var r=el.getBoundingClientRect(), p=pg.getBoundingClientRect(); return {page:pages.indexOf(pg), x:r.left-p.left, y:r.top-p.top, w:r.width, h:r.height};}
  var dests={}; out.querySelectorAll('[data-pdf-dest]').forEach(function(el){var q=pos(el); dests[el.getAttribute('data-pdf-dest')]={page:q.page,y:q.y};});
  var links=[]; out.querySelectorAll('[data-pdf-link]').forEach(function(el){var q=pos(el); q.to=el.getAttribute('data-pdf-link'); links.push(q);});
  var checks=[]; out.querySelectorAll('[data-pdf-check]').forEach(function(el){var q=pos(el); q.name=el.getAttribute('data-pdf-check'); q.label=el.getAttribute('data-label')||''; checks.push(q);});
  var fields=[]; out.querySelectorAll('[data-pdf-field]').forEach(function(el){var q=pos(el); q.name=el.getAttribute('data-pdf-field'); q.label=el.getAttribute('data-label')||''; fields.push(q);});
  var bookmarks=[]; out.querySelectorAll('[data-pdf-bookmark]').forEach(function(el){bookmarks.push({level:1,title:el.getAttribute('data-title'),to:el.getAttribute('data-pdf-dest')});});
  out.querySelectorAll('.toc-pg').forEach(function(el){var d=dests[el.getAttribute('data-for')]; if(d) el.textContent='p. '+(d.page+1);});
  src.remove();
  window.__aula={done:true,pages:pages.length,dests:dests,links:links,checks:checks,fields:fields,bookmarks:bookmarks,problemas:problemas};
})();
</script></body></html>`;
}

// ---------------------------------------------------------------------------- prévia HTML (mesmos recursos)
export function htmlPrevia(aula: Aula, fontCss: string): string {
  const P = paleta(aula);
  let seq = 0;
  const secoes = aula.secoes
    .map((s) => {
      const ctx = { sec: s.id, seq: () => ++seq };
      return `<section class="sheet">${secaoHead(s, P)}${s.blocos.map((b) => blocoHtml(b, P, "web", ctx)).join("")}${notasHtml(s, P, "web")}<a class="btn sec" href="#sumario" style="margin-top:8px">${spot("seta", 16, P.d)}Sumário</a></section>`;
    })
    .join("");
  const q = questoesHtml(aula, P, "web");
  const fc = aula.flashcards
    .map((f, i) => `<div class="flip"><div class="flip-in"><div class="face">${flashFrente(f, i, P, "web", aula.flashcards.length)}</div><div class="face back">${flashVerso(f, i, P, "web", aula.flashcards.length)}</div></div></div>`)
    .join("");
  const galeria = aula.imagens
    .map((im) => `<figure class="gal"><a href="${esc(im.arquivo)}" target="_blank"><img src="${esc(im.arquivo)}" alt="${esc(im.alt)}" loading="lazy"></a><figcaption>${esc(im.titulo)}${im.pdf ? ` · <a href="${esc(im.pdf)}" target="_blank">PDF</a>` : ""}</figcaption></figure>`)
    .join("");
  const entradas = [...aula.secoes.map((s) => [s.id, `${s.numero}. ${s.titulo}`]), ["questoes", "Questões de fixação"], ["flashcards", "Flashcards"], ["pecas", "Peças visuais (cards, A4, flashcards)"]];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(aula.codigo)} · prévia da aula</title><style>${css(P, fontCss, "web")}
.wrap{max-width:860px;margin:0 auto;padding:0 16px 60px}
.sheet{background:#F4F8F9;border-radius:22px;padding:24px 26px;margin:22px 0;box-shadow:0 6px 24px rgba(11,37,69,.12)}
.flip{perspective:1400px;height:340px}.flip-in{position:relative;height:100%;transition:transform .6s;transform-style:preserve-3d}.flip.on .flip-in{transform:rotateY(180deg)}
.face{position:absolute;inset:0;backface-visibility:hidden}.face .fc{height:340px!important;overflow:auto}.face.back{transform:rotateY(180deg)}
.fcg{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.expl{margin:6px 0 14px}
.alt.ok{border-color:#2E9B67;background:#EAF7F0}.alt.no{border-color:#C8102E;background:#FFF3F4}
.gal{margin:0;background:#fff;border-radius:14px;padding:10px;box-shadow:0 2px 10px rgba(11,37,69,.1)}.gal img{width:100%;display:block;border-radius:8px}.gal figcaption{font-size:13px;margin-top:6px;color:#3B4A5E}
.galg{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.cbx{width:18px;height:18px;flex:none;margin-top:2px;accent-color:${P.d}}
@media (max-width:620px){.conc{grid-template-columns:1fr}.hdr > div[style*="position:absolute"]{opacity:.35}.ttl{font-size:44px!important}}
</style></head><body>
${capa(aula, P, "web")}
<div class="wrap">
<section class="sheet" id="sumario"><div class="sechead"><div class="secnum">${spot("prancheta", 24, "#fff")}</div><div class="sectab">Sumário</div></div>${entradas.map(([id, t]) => `<a class="alt" href="#${id}" style="align-items:center">${spot("seta", 24, P.d)}<span style="font-weight:600">${esc(t)}</span></a>`).join("")}
${aula.pdfAluno ? `<a class="btn pri" href="${esc(aula.pdfAluno)}" target="_blank" style="margin-top:6px">${spot("documento", 16, "#fff")}Abrir o PDF interativo</a>` : ""}</section>
${secoes}
<section class="sheet" id="questoes">${q.perguntas.join('<hr style="border:0;border-top:2px dashed #D6E4E7;margin:22px 0">')}</section>
<section class="sheet" id="flashcards"><div class="sechead"><div class="secnum">${spot("virar", 24, "#fff")}</div><div class="sectab">Flashcards</div></div><div class="fcg">${fc}</div></section>
<section class="sheet" id="pecas"><div class="sechead"><div class="secnum">${spot("documento", 24, "#fff")}</div><div class="sectab">Peças visuais</div></div><div class="galg">${galeria}</div></section>
<p class="foot-ofc">Material StaziaMed. Não é material oficial do Inep.</p>
</div>
<script>
(function(){
  function get(k){try{return localStorage.getItem('aula:${esc(aula.codigo)}:'+k)}catch(e){return null}}
  function set(k,v){try{localStorage.setItem('aula:${esc(aula.codigo)}:'+k,v)}catch(e){}}
  document.querySelectorAll('[data-store]').forEach(function(el){var k=el.getAttribute('data-store'),v=get(k); if(el.type==='checkbox'){el.checked=v==='1'; el.addEventListener('change',function(){set(k,el.checked?'1':'0')});} else {if(v)el.value=v; el.addEventListener('input',function(){set(k,el.value)});}});
  document.querySelectorAll('.fc-flip').forEach(function(b){b.addEventListener('click',function(){b.closest('.flip').classList.toggle('on')})});
  document.querySelectorAll('button.alt[data-q]').forEach(function(b){b.addEventListener('click',function(){
    var q=b.getAttribute('data-q'), op=b.getAttribute('data-op'), d=JSON.parse(document.getElementById(q+'-data').textContent);
    document.querySelectorAll('button.alt[data-q="'+q+'"]').forEach(function(x){x.classList.remove('ok','no')});
    var ok=op===d.correct; b.classList.add(ok?'ok':'no');
    var e=document.getElementById(q+'-expl'); e.hidden=false;
    e.innerHTML='<div class="card" style="border:3px solid '+(ok?'#2E9B67':'#C8102E')+'"><div class="cond" style="font-weight:800;font-size:26px;text-transform:uppercase;color:'+(ok?'#1B6B45':'#C8102E')+'">'+(ok?'Correta!':'Não é essa: tente de novo')+'</div><p class="p" style="margin:6px 0 0"></p></div>';
    e.querySelector('p').textContent=d.comments[op]||'';
  })});
})();
</script></body></html>`;
}

export { resolveSpecialty, inline };
