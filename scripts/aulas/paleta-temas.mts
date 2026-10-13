/**
 * Gera a cor de cada um dos 100 Grandes Temas (estrutura da cor do GR-001, outro tom por tema):
 *   npx tsx scripts/aulas/paleta-temas.mts <temas.json> <pasta-de-saida>
 * Escreve:
 *   src/shared/visualMaterials/paletaTemas.data.ts  (o que o modelo criativo-1 e o PDF leem)
 *   <saida>/paleta-temas.json                        (arquivo único, com o contraste de cada tema)
 *   <saida>/previa-paleta.html                       (os 100 cartões para o dono ver)
 * Para o código de saída: 1 se algum tema não passar no contraste mínimo ou ficar perto demais do vermelho/amarelo de alerta.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { COR_MODELO, FAIXAS_AREA, REGRAS_CONTRASTE, tomProibido, conferirContraste, corSegura, distancia, hexParaOklch, type TemaPaleta } from "../../src/shared/visualMaterials/temas.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [src, out] = process.argv.slice(2).map((p) => path.resolve(p));
if (!src || !out) throw new Error("Uso: npx tsx scripts/aulas/paleta-temas.mts <temas.json> <pasta-de-saida>");
const dados = JSON.parse(fs.readFileSync(src, "utf8"));
const temas: any[] = [...dados.temas].sort((a, b) => a.ordem - b.ordem);
const ALERTAS = { "vermelho da Pegadinha": "#C8102E", "amarelo da Atenção": "#F2B705", "amarelo do post-it": "#FFE57E" };
const HUE_MODELO = hexParaOklch(COR_MODELO.primaria)[2];

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const paleta: Record<string, TemaPaleta> = {};
for (const [areaIdx, [area, faixa]] of Object.entries(FAIXAS_AREA).entries()) {
  const lista = temas.filter((t) => t.area === area);
  const n = lista.length;
  if (!n) continue;
  // grade tom × luminosidade (3 níveis): cada tema num ponto; temas consecutivos em pontos distantes
  const NIVEIS = [-0.06, 0, 0.03];
  const H = Math.max(1, Math.ceil(n / NIVEIS.length));
  const tons = Array.from({ length: H }, (_, j) => (H > 1 ? faixa.de + (j * (faixa.ate - faixa.de)) / (H - 1) : (faixa.de + faixa.ate) / 2));
  const grade = tons.flatMap((h, j) => NIVEIS.map((dl, q) => ({ h, dl: NIVEIS[(q + j + areaIdx) % NIVEIS.length] })));
  const pos = Array.from({ length: n }, (_, j) => grade[Math.min(grade.length - 1, Math.round((j * grade.length) / n))]);
  let k = Math.max(1, Math.round(n * 0.38));
  while (n > 1 && gcd(k, n) !== 1) k++;
  const dist0 = (q: { h: number; dl: number }) => Math.abs(q.h - HUE_MODELO) + Math.abs(q.dl) * 100;
  const s0 = pos.reduce((best, q, j) => (dist0(q) < dist0(pos[best]) ? j : best), 0);
  lista.forEach((t, i) => {
    const q = pos[n > 1 ? (s0 + i * k) % n : 0];
    const tom = t.id === "GR-001" ? HUE_MODELO : q.h;
    const dl = q.dl;
    const cor = t.id === "GR-001" ? COR_MODELO : corSegura(tom, dl, faixa.croma ?? 1);
    paleta[t.id] = { id: t.id, titulo: t.titulo, area, area_nome: t.area_nome, tom: Math.round(tom * 10) / 10, ...cor };
  });
}

// reparo: nenhum par de temas (mesmo distantes na lista) pode ficar quase igual; troca a luminosidade/tom de um deles
{
  const ids = Object.keys(paleta);
  const minDist = (id: string, cor: string) => Math.min(...ids.filter((x) => x !== id).map((x) => distancia(cor, paleta[x].primaria)));
  const viz = (id: string, cor: string) => {
    const i = temas.findIndex((t) => t.id === id);
    return Math.min(...[temas[i - 1], temas[i + 1]].filter(Boolean).map((t) => distancia(cor, paleta[t.id].primaria)));
  };
  for (let rodada = 0; rodada < 6; rodada++) {
    let mexeu = false;
    for (const id of ids) {
      if (id === "GR-001" || minDist(id, paleta[id].primaria) >= 0.02) continue;
      const f = FAIXAS_AREA[paleta[id].area];
      let melhor = { score: minDist(id, paleta[id].primaria), cor: null as any, tom: paleta[id].tom };
      for (const dh of [0, -3, 3, -6, 6])
        for (const dl of [-0.06, -0.03, 0, 0.03]) {
          const tom = Math.min(f.ate, Math.max(f.de, paleta[id].tom + dh));
          const cor = corSegura(tom, dl, f.croma ?? 1);
          const sc = Math.min(minDist(id, cor.primaria), viz(id, cor.primaria) >= 0.025 ? 1 : 0);
          if (sc > melhor.score + 0.002) melhor = { score: sc, cor, tom };
        }
      if (melhor.cor) {
        paleta[id] = { ...paleta[id], ...melhor.cor, tom: Math.round(melhor.tom * 10) / 10 };
        mexeu = true;
      }
    }
    if (!mexeu) break;
  }
}

// conferências
const problemas: string[] = [];
const relatorio = temas.map((t, i) => {
  const p = paleta[t.id];
  if (!p) {
    problemas.push(`${t.id}: área "${t.area}" sem faixa de cor.`);
    return null;
  }
  const contr = conferirContraste(p);
  for (const c of contr) if (!c.ok) problemas.push(`${t.id}: ${c.regra} = ${c.valor} (mínimo ${c.minimo}).`);
  for (const k of ["primaria", "escura"] as const) {
    const h = hexParaOklch(p[k])[2];
    const f = tomProibido(h, t.area);
    if (f) problemas.push(`${t.id}: ${k} com tom ${h.toFixed(1)}°, reservado ao ${f.motivo}.`);
  }
  const alerta = Object.entries(ALERTAS).map(([nome, hex]) => ({ nome, d: Math.min(distancia(p.primaria, hex), distancia(p.escura, hex)) }));
  // nos vermelhos de GO a proximidade com a Pegadinha é esperada: lá a caixa ganha o reforço (faixa listrada e triângulo cheio)
  for (const a of alerta) if (a.d < 0.12 && !(t.area === "go" && a.nome.startsWith("vermelho"))) problemas.push(`${t.id}: perto demais do ${a.nome} (distância ${a.d.toFixed(3)}).`);
  const viz = i > 0 && paleta[temas[i - 1].id] ? distancia(p.primaria, paleta[temas[i - 1].id].primaria) : null;
  return { ...p, contraste: contr, distancia_do_anterior: viz == null ? null : Math.round(viz * 1000) / 1000, distancia_minima_alertas: Math.round(Math.min(...alerta.map((a) => a.d)) * 1000) / 1000 };
}).filter(Boolean) as any[];
const vizinhos = relatorio.map((r) => r.distancia_do_anterior).filter((x) => x != null) as number[];
let menorPar = { d: 9, a: "", b: "" };
for (let i = 0; i < relatorio.length; i++)
  for (let j = i + 1; j < relatorio.length; j++) {
    const d = distancia(relatorio[i].primaria, relatorio[j].primaria);
    if (d < menorPar.d) menorPar = { d, a: relatorio[i].id, b: relatorio[j].id };
  }
const resumo = {
  temas: relatorio.length,
  contraste_minimo_por_regra: REGRAS_CONTRASTE.map((r, k) => ({ regra: r.nome, minimo_exigido: r.min, pior_valor: Math.min(...relatorio.map((x) => x.contraste[k].valor)) })),
  menor_distancia_entre_vizinhos: Math.round(Math.min(...vizinhos) * 1000) / 1000,
  media_distancia_entre_vizinhos: Math.round((vizinhos.reduce((a, b) => a + b, 0) / vizinhos.length) * 1000) / 1000,
  par_mais_parecido: { ...menorPar, d: Math.round(menorPar.d * 1000) / 1000 },
  menor_distancia_das_cores_de_alerta_fora_de_GO: Math.min(...relatorio.filter((x) => x.area !== "go").map((x) => x.distancia_minima_alertas)),
  menor_distancia_GO_ao_vermelho_da_Pegadinha: Math.min(...relatorio.filter((x) => x.area === "go").map((x) => Math.round(Math.min(distancia(x.primaria, "#C8102E"), distancia(x.escura, "#C8102E")) * 1000) / 1000)),
  problemas,
};

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(ROOT, "src/shared/visualMaterials/paletaTemas.data.ts"),
  `// Gerado por scripts/aulas/paleta-temas.mts em ${new Date().toISOString().slice(0, 10)}. Não editar à mão.\n// Cor-modelo: GR-001 (sem mudança). Cada tema: mesma estrutura de cor, outro tom (família por área).\nimport type { TemaPaleta } from "./temas";\nexport const PALETA_TEMAS: Record<string, TemaPaleta> = ${JSON.stringify(paleta, null, 1)};\n`
);
fs.writeFileSync(
  path.join(out, "paleta-temas.json"),
  JSON.stringify(
    {
      versao: "temas-1 (2026-10-13)",
      cor_modelo: { tema: "GR-001", ...COR_MODELO },
      como_usar: "Campo tema_cor nas peças (ex.: tema_cor: GR-043) ou #RRGGBB. Vazio = cor da especialidade (como antes).",
      papeis: { primaria: "destaque: faixas, filetes, números", escura: "texto colorido sobre branco e início dos gradientes", clara: "fundo de linhas e caixas", brilho: "2ª linha do título, selos e 'Med' sobre o azul-marinho" },
      familias_por_area: FAIXAS_AREA,
      tons_proibidos: "amarelo/laranja (Atenção e post-it) em todas as áreas; vermelho só é permitido em Ginecologia e Obstetrícia (decisão do dono)",
      pegadinha_em_tema_vermelho: "Nos temas vermelhos (GO), a caixa 'Pegadinha de prova!' ganha faixa listrada vermelho/branco na lateral e triângulo de alerta cheio; o vermelho de alerta (#C8102E), o rótulo e a borda continuam. Nos outros temas a caixa não muda.",
      resumo,
      temas: relatorio,
    },
    null,
    1
  )
);

// prévia: os 100 cartões
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const partes = (t: string) => {
  const w = t.split(/\s+/);
  const k = Math.ceil(w.length / 2);
  return [w.slice(0, k).join(" "), w.slice(k).join(" ")];
};
const cartao = (r: any) => {
  const [a, b] = partes(r.titulo);
  const pior = Math.min(...r.contraste.map((c: any) => c.valor / c.minimo));
  return `<article class="c" title="${esc(r.contraste.map((c: any) => `${c.regra}: ${c.valor} (mín. ${c.minimo})`).join("\n"))}">
<div class="h"><div class="id" style="background:${r.brilho}">${r.id}</div><div class="t">${esc(a)}<br><span style="color:${r.brilho}">${esc(b)}</span></div></div>
<div class="b" style="background:linear-gradient(90deg,${r.escura},${r.primaria});border-color:${r.brilho}">Mensagem-chave do card</div>
<div class="x"><div class="row" style="background:${r.clara};border-left:5px solid ${r.primaria}"><span class="n" style="background:${r.clara};border-color:${r.primaria};color:${r.escura}">1</span><span>Linha da tabela</span></div>
<div class="lab" style="color:${r.escura}">PONTOS-CHAVE</div>
<div class="sw">${["primaria", "escura", "clara", "brilho"].map((k) => `<span style="background:${r[k]}" title="${k} ${r[k]}"></span>`).join("")}</div>
<div class="pg${r.area === "go" ? " forte" : ""}"><b>PEGADINHA DE PROVA!</b></div>
<div class="hex">${r.primaria} · ${r.escura}</div><div class="ok">${pior >= 1 ? "Contraste AA ok" : "REVER contraste"}</div></div></article>`;
};
const secoes = Object.entries(FAIXAS_AREA)
  .map(([area, f]) => {
    const lista = relatorio.filter((r) => r.area === area);
    return lista.length ? `<section><h2>${esc(lista[0].area_nome)} <small>${lista.length} temas · família: ${f.nome}</small></h2><div class="g">${lista.map(cartao).join("")}</div></section>` : "";
  })
  .join("");
fs.writeFileSync(
  path.join(out, "previa-paleta.html"),
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cores dos 100 temas</title><style>
:root{--bg:#EEF4F5;--ink:#142033}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,Segoe UI,sans-serif}
header{background:radial-gradient(130% 150% at 88% 20%,#1A4C8A 0%,#0D2B52 42%,#071A33 100%);color:#fff;padding:28px 16px}
header .w,main{max-width:1180px;margin:0 auto}h1{font-size:34px;margin:0 0 6px;letter-spacing:-.5px}h1 span{color:#5FE6C0}header p{margin:4px 0;color:#C3D0E2;max-width:820px;line-height:1.45}
main{padding:8px 16px 40px}h2{font-size:20px;margin:26px 0 10px}h2 small{font-weight:400;color:#5B6B80;font-size:14px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:12px}
.c{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(11,37,69,.1);border:1px solid #D6E4E7}
.h{background:radial-gradient(130% 150% at 88% 20%,#1A4C8A 0%,#0D2B52 42%,#071A33 100%);padding:10px 12px 18px;color:#fff;min-height:88px}
.id{display:inline-block;color:#0B2545;font-weight:800;font-size:11px;border-radius:999px;padding:2px 8px;margin-bottom:6px}
.t{font-weight:800;text-transform:uppercase;font-size:15px;line-height:1.02;letter-spacing:-.2px}
.b{margin:-10px 8px 0;position:relative;border:2px solid;border-radius:9px;color:#fff;font-weight:800;font-size:11.5px;text-transform:uppercase;padding:6px 9px;letter-spacing:.3px}
.x{padding:9px 10px 10px;display:flex;flex-direction:column;gap:6px}.row{display:flex;gap:7px;align-items:center;font-size:12px;font-weight:600;padding:5px 7px;border-radius:6px;color:#0B2545}
.n{width:18px;height:18px;border-radius:50%;border:2px solid;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800}
.lab{font-weight:800;font-size:11.5px;letter-spacing:.8px}.sw{display:flex;gap:4px}.sw span{flex:1;height:16px;border-radius:4px;border:1px solid rgba(0,0,0,.08)}
.pg{border:2px solid #C8102E;border-radius:8px;padding:4px 8px;font-size:10.5px;color:#C8102E;background:#FFF3F4}.pg b{font-style:italic;letter-spacing:.2px}
.pg.forte{position:relative;background:#fff;padding-left:16px}.pg.forte:before{content:"";position:absolute;left:0;top:0;bottom:0;width:8px;border-radius:6px 0 0 6px;background:repeating-linear-gradient(-45deg,#C8102E 0 3px,#fff 3px 6px)}
.hex{font:11px ui-monospace,Menlo,monospace;color:#5B6B80}.ok{font-size:11px;color:#1B6B45;font-weight:700}
.sum{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px;margin-top:14px}.sum div{background:rgba(255,255,255,.07);border:1px solid rgba(95,230,192,.35);border-radius:10px;padding:8px 10px;font-size:13px;color:#E3EAF4}
</style></head><body><header><div class="w"><h1>Cores dos <span>100 temas</span></h1>
<p>Cada tema tem a sua cor, com a mesma estrutura da cor do GR-001 (tuberculose), que você aprovou: mesmo contraste e as mesmas versões escura, clara e de brilho. Cada área é uma família de tons; Ginecologia e Obstetrícia é vermelha (sua decisão). O amarelo fica só para "Atenção" e o post-it. Nos temas vermelhos, a caixa "Pegadinha de prova!" ganha faixa listrada e triângulo cheio para não se confundir com a cor do tema.</p>
<div class="sum"><div>Contraste: ${problemas.length ? `${problemas.length} problema(s)` : "todos os 100 temas passam (nível AA)"}</div><div>Pior contraste do texto branco nas faixas: ${resumo.contraste_minimo_por_regra[0].pior_valor} (mínimo 4,5)</div><div>Temas vizinhos: diferença média ${resumo.media_distancia_entre_vizinhos}, menor ${resumo.menor_distancia_entre_vizinhos}</div><div>Passe o mouse num cartão para ver o contraste de cada uso.</div></div></div></header><main>${secoes}</main></body></html>`
);
console.log(JSON.stringify(resumo, null, 1));
if (problemas.length) process.exitCode = 1;
