// Prévia local para o dono: "antes x depois" das 880 correções (por prova e por tipo), as tabelas e figuras novas ao lado da página
// do PDF, a prova 2026/2 e a lista unificada das dúvidas dos relatórios da revisão. Página HTML estática (abre no navegador).
//   node scripts/carga-provas/gerar-previa.mjs --revisao <pasta revisao-questoes> [--paginas <pasta das páginas do PDF>] [--saida arquivo.html]
// As imagens são ligadas por endereço de arquivo (file://): a página só funciona neste computador.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { IMAGENS, correcoesDaProva, lerJson, manifestoImagens, provas, questoesAntes } from "./comum.mjs";
import { dados2026_2 } from "./gerar-pacote.mjs";

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const REV = arg("--revisao");
if (!REV) throw new Error("Use --revisao <pasta revisao-questoes>");
const PAG = arg("--paginas", path.join(REV, "previa-paginas"));
const SAIDA = arg("--saida", path.join(REV, "previa-correcoes.html"));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const url = (p) => pathToFileURL(p).href;
const TIPO = { lixo_ocr: "Lixo de OCR (letras trocadas ou sujeira)", sobrescrito: "Sobrescrito / subscrito (m², O₂…)", caractere: "Caractere errado", unidade: "Unidade", simbolo: "Símbolo (ºC, ×, –…)",
  texto_faltando: "Texto que faltava", texto_fora_de_ordem: "Texto fora de ordem", texto_extra: "Texto a mais", selo: "Selo (ANULADA…)", codigo: "Código (ITEM…)" };

const antes = questoesAntes();
const manifesto = manifestoImagens();
let totalTrechos = 0;
const secoes = [];
const resumo = [];
for (const p of provas()) {
  const trechos = lerJson(`patches/${p.pasta}.json`);
  totalTrechos += trechos.length;
  const { itens } = correcoesDaProva(p.pasta, antes);
  const porTipo = new Map();
  for (const t of trechos) {
    if (!porTipo.has(t.tipo)) porTipo.set(t.tipo, []);
    porTipo.get(t.tipo).push(t);
  }
  resumo.push(`<tr><td>${esc(p.rotulo)}</td><td>${trechos.length}</td><td>${itens.length}</td><td>${lerJson(`tabelas/${p.pasta}.json`).length}</td><td>${[...porTipo].map(([k, v]) => `${esc(TIPO[k] ?? k)}: ${v.length}`).join("<br>")}</td></tr>`);
  const blocos = [...porTipo].sort((a, b) => b[1].length - a[1].length).map(([tipo, lista]) => {
    const linhas = lista.map((t) => {
      const q = antes.get(t.id);
      const ev = t.evidencia ? path.join(REV, p.pasta, t.evidencia) : null;
      const campo = t.campo === "statement" ? "enunciado" : `alternativa ${t.campo.slice(-1)}`;
      return `<div class="item"><div class="ref">${esc(q.code)} · ${campo} · pág. ${esc(t.pagina)}</div>
        <div class="par"><div class="antes"><span>antes</span>${esc(t.antes) || "<i>(vazio)</i>"}</div><div class="depois"><span>depois</span>${esc(t.depois)}</div></div>
        ${ev && fs.existsSync(ev) ? `<details><summary>recorte do PDF</summary><img loading="lazy" src="${url(ev)}" alt="recorte do PDF"></details>` : ""}</div>`;
    });
    return `<details class="tipo"><summary>${esc(TIPO[tipo] ?? tipo)} <b>${lista.length}</b></summary>${linhas.join("")}</details>`;
  });
  secoes.push(`<section id="${p.pasta}"><h3>${esc(p.rotulo)} <small>${trechos.length} correções em ${itens.length} questões</small></h3>${blocos.join("")}</section>`);
}

// tabelas e figuras
const imagens = manifesto.map((q) => {
  const paginas = q.imagens.flatMap((i) => {
    const f = fs.readdirSync(PAG).filter((n) => n.startsWith(`${q.id}-p`));
    return f.map((n) => path.join(PAG, n));
  });
  const unicas = [...new Set(paginas)];
  return `<div class="img"><div class="ref">${esc(q.code)}${q.substitui ? " · <b>substitui a imagem antiga</b>" : ""}</div>
    <div class="lado">${q.imagens.map((i) => `<figure><img loading="lazy" src="${url(path.join(IMAGENS, i.arquivo))}" alt="${esc(i.alt)}"><figcaption><b>${i.tipo === "tabela" ? "Tabela" : "Figura"}</b> (pág. ${i.source_page}) — texto alternativo: ${esc(i.alt)}</figcaption></figure>`).join("")}
    ${unicas.map((u) => `<figure class="pag"><img loading="lazy" src="${url(u)}" alt="página do PDF"><figcaption>Página do PDF oficial</figcaption></figure>`).join("")}</div>
    ${q.imagens.filter((i) => i.trecho).map((i) => `<details><summary>trecho achatado que sai do enunciado</summary><p class="antes">${esc(i.trecho)}</p></details>`).join("")}
    ${q.imagens.filter((i) => i.observacao).map((i) => `<p class="obs">${esc(i.observacao)}</p>`).join("")}</div>`;
});

// 2026/2
const { entram, fora } = dados2026_2();
const lista262 = entram.map((q) => `<tr><td>Q${q.number}</td><td>${esc(q.area)}</td><td>${q.correct_option}</td><td>${q.needs_image ? "sim" : ""}</td><td>${esc(q.statement.slice(0, 140))}…</td></tr>`).join("");

// dúvidas dos relatórios
const duvidas = [...provas().map((p) => p.pasta), "revalida_2026_2"].map((pasta) => {
  const rel = path.join(REV, pasta, "relatorio.md");
  if (!fs.existsSync(rel)) return "";
  const partes = fs.readFileSync(rel, "utf8").split(/^## /m).slice(1).filter((s) => /revis|d[uú]vid|limite|escolhas|cuidados|NÃO foi feito/i.test(s.split("\n")[0]));
  const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const corpo = partes.map((s) => {
    const [titulo, ...linhas] = s.split("\n");
    return `<h4>${md(titulo)}</h4>${linhas.filter((l) => l.trim()).map((l) => (/^\s*(-|\d+\.)\s/.test(l) ? `<li>${md(l.replace(/^\s*(-|\d+\.)\s/, ""))}</li>` : `<p>${md(l)}</p>`)).join("")}`;
  });
  return `<details class="tipo"><summary>${esc(pasta.replace("revalida_", "Revalida ").replace("enamed_", "ENAMED ").replace(/_(\d)$/, "/$1"))}</summary>${corpo.join("")}</details>`;
});

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prévia da carga das provas</title><style>
:root{--bg:#f7f7f5;--card:#fff;--tx:#1d1d1b;--mut:#6b6b66;--bd:#e3e2dd;--red:#b42318;--redbg:#fdecea;--grn:#067647;--grnbg:#e7f6ec;--acc:#2f5bd3}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1d;--tx:#ecece8;--mut:#a3a39c;--bd:#33332f;--red:#ff8a80;--redbg:#3a1d1a;--grn:#7ee2a8;--grnbg:#173323;--acc:#8fb0ff}}
body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 80px}h1{font-size:26px;margin:0 0 4px}h2{margin:40px 0 12px;font-size:20px}h3 small,.ref{color:var(--mut);font-weight:400;font-size:13px}
table{border-collapse:collapse;width:100%;background:var(--card)}td,th{border:1px solid var(--bd);padding:6px 8px;text-align:left;vertical-align:top;font-size:13px}
details.tipo{background:var(--card);border:1px solid var(--bd);border-radius:10px;margin:8px 0;padding:8px 12px}summary{cursor:pointer}
.item{border-top:1px solid var(--bd);padding:10px 0}.par{display:grid;grid-template-columns:1fr 1fr;gap:8px}@media(max-width:700px){.par{grid-template-columns:1fr}}
.antes,.depois{padding:8px;border-radius:8px;white-space:pre-wrap;word-break:break-word}.antes{background:var(--redbg)}.depois{background:var(--grnbg)}
.antes span,.depois span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}
img{max-width:100%;border:1px solid var(--bd);border-radius:6px;background:#fff}.img{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:12px;margin:12px 0}
.lado{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;align-items:start}figure{margin:0}figcaption{font-size:12px;color:var(--mut)}.pag img{max-height:520px;object-fit:contain}
.obs{font-size:13px;color:var(--mut)}nav a{color:var(--acc);margin-right:10px}.aviso{background:var(--card);border-left:4px solid var(--acc);padding:10px 14px;border-radius:6px}
</style></head><body><main>
<h1>Prévia da carga das provas corrigidas</h1>
<p class="ref">Revisão de 12/10/2026 · ramo carga-provas · nada disto foi enviado à produção.</p>
<p class="aviso">Antes (vermelho) é o texto que está HOJE no banco; depois (verde) é o texto fiel ao caderno oficial do Inep. Clique em "recorte do PDF" para ver a prova.
As tabelas viram imagem e o trecho achatado sai do enunciado. A prova 2026/2 entra com o gabarito PRELIMINAR do Inep.</p>
<nav>${provas().map((p) => `<a href="#${p.pasta}">${esc(p.rotulo)}</a>`).join("")}<a href="#imagens">Tabelas e figuras</a><a href="#p2026">2026/2</a><a href="#duvidas">Dúvidas</a></nav>
<h2>Resumo</h2><table><tr><th>Prova</th><th>Correções</th><th>Questões</th><th>Tabelas</th><th>Por tipo</th></tr>${resumo.join("")}
<tr><td><b>Total</b></td><td><b>${totalTrechos}</b></td><td><b>${provas().reduce((s, p) => s + correcoesDaProva(p.pasta, antes).itens.length, 0)}</b></td><td><b>${provas().reduce((s, p) => s + lerJson(`tabelas/${p.pasta}.json`).length, 0)}</b></td><td></td></tr></table>
<h2>Antes x depois, por prova e por tipo</h2>${secoes.join("")}
<h2 id="imagens">Tabelas e figuras (${manifesto.reduce((s, q) => s + q.imagens.length, 0)} imagens em ${manifesto.length} questões)</h2>
<p class="ref">Imagem nova (à esquerda) ao lado da página do PDF oficial. O aluno vê a imagem depois do enunciado e antes da pergunta.</p>${imagens.join("")}
<h2 id="p2026">Revalida 2026/2 — ${entram.length} questões com gabarito PRELIMINAR</h2>
${fora.length ? `<p class="aviso">Ficam de fora até você escolher a grande área: ${fora.map((f) => `Q${f.numero}`).join(", ")}.</p>` : ""}
<details class="tipo"><summary>Ver a lista</summary><table><tr><th>Nº</th><th>Área</th><th>Gabarito preliminar</th><th>Imagem</th><th>Início do enunciado</th></tr>${lista262}</table></details>
<h2 id="duvidas">Dúvidas para revisão humana (dos relatórios)</h2>${duvidas.join("")}
</main></body></html>`;
fs.writeFileSync(SAIDA, html);
console.log(`prévia: ${SAIDA} (${(html.length / 1024).toFixed(0)} KB)`);
