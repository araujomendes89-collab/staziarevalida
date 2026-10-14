/**
 * Paleta v2 dos 100 Grandes Temas (análise profissional colada pelo dono, 2026-10-13):
 *   npx tsx scripts/aulas/paleta-temas-v2.mts <temas.json> <pasta-de-saida>
 *
 * Regras:
 *   - uma cor-base FIXA por área (BASES_V2); o 1º tema de cada área usa a cor-base exata;
 *   - cada tema varia só a luminosidade e, de leve, a saturação da cor-base (o tom não muda);
 *   - cada tema tem destaque, escura, clara (fundo suave) e brilho (sobre o azul-marinho);
 *   - contraste conferido por COMPONENTE (faixas, selos, textos coloridos, bordas, gradientes, foco e
 *     passagem do mouse, modo claro e escuro), não só pela paleta;
 *   - Ginecologia e Obstetrícia continua vermelha (decisão do dono) e a Pegadinha leva o reforço listrado.
 * Escreve:
 *   src/shared/visualMaterials/paletaTemasV2.data.ts
 *   <saida>/paleta-temas.json           (cores + resultado de cada componente)
 *   <saida>/previa-paleta.html          (os 100 cartões, claro e escuro, sem códigos de cor: para o dono ver)
 *   <saida>/validacao-contraste.html    (ferramenta de validação: códigos de cor e contraste de cada componente)
 * Código de saída 1 se algum componente reprovar ou se temas vizinhos ficarem parecidos demais.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BASES_V2, ESTRUTURA_V2, papeisV2, contraste, distancia, hexParaOklch, oklchParaHex, type CorTema, type TemaPaleta } from "../../src/shared/visualMaterials/temas.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [src, out] = process.argv.slice(2).map((p) => path.resolve(p));
if (!src || !out) throw new Error("Uso: npx tsx scripts/aulas/paleta-temas-v2.mts <temas.json> <pasta-de-saida>");
const temas: any[] = [...JSON.parse(fs.readFileSync(src, "utf8")).temas].sort((a, b) => a.ordem - b.ordem);
const E = ESTRUTURA_V2;
const ROSA_ALERTA = "#FFF3F4";

// ---------------------------------------------------------------------------- componentes e contraste exigido
type Comp = { id: string; nome: string; modo: "claro" | "escuro"; tipo: "texto" | "texto grande" | "elemento gráfico"; fg: (c: CorTema) => string; bg: (c: CorTema) => string; min: number };
const COMPONENTES: Comp[] = [
  { id: "faixa_inicio", nome: "Faixa da mensagem-chave: texto branco no início do gradiente (cor escura)", modo: "claro", tipo: "texto", fg: () => "#FFFFFF", bg: (c) => c.escura, min: 4.5 },
  { id: "faixa_fim", nome: "Faixa da mensagem-chave: texto branco no fim do gradiente (cor de destaque)", modo: "claro", tipo: "texto", fg: () => "#FFFFFF", bg: (c) => c.primaria, min: 4.5 },
  { id: "numero_secao", nome: "Número da seção e ícones de passo: branco sobre o destaque", modo: "claro", tipo: "texto", fg: () => "#FFFFFF", bg: (c) => c.primaria, min: 4.5 },
  { id: "resposta", nome: "Cartão de resposta dos flashcards: branco sobre o gradiente escura→destaque", modo: "claro", tipo: "texto", fg: () => "#FFFFFF", bg: (c) => c.primaria, min: 4.5 },
  { id: "selo_atualizado", nome: "Selo \"Atualizado\" e ID do card: azul-marinho sobre o brilho", modo: "claro", tipo: "texto", fg: () => E.azulMarinho, bg: (c) => c.brilho, min: 4.5 },
  { id: "titulo_2_linha", nome: "2ª linha do título: brilho sobre o azul-marinho", modo: "claro", tipo: "texto grande", fg: (c) => c.brilho, bg: () => E.azulMarinho, min: 4.5 },
  { id: "titulo_gradiente", nome: "2ª linha do título no ponto mais claro do cabeçalho (azul secundário)", modo: "claro", tipo: "texto grande", fg: (c) => c.brilho, bg: () => E.azulSecundario, min: 4.5 },
  { id: "borda_selo", nome: "Contorno dos selos: brilho sobre o azul-marinho", modo: "claro", tipo: "elemento gráfico", fg: (c) => c.brilho, bg: () => E.azulMarinho, min: 3 },
  { id: "texto_colorido_branco", nome: "Títulos de painel (\"Pontos-chave\"): cor escura sobre o branco", modo: "claro", tipo: "texto", fg: (c) => c.escura, bg: () => E.superficie, min: 4.5 },
  { id: "texto_colorido_fundo", nome: "Texto colorido sobre o fundo da página", modo: "claro", tipo: "texto", fg: (c) => c.escura, bg: () => E.fundo, min: 4.5 },
  { id: "linha_tabela", nome: "Texto das linhas da tabela sobre o fundo suave do tema", modo: "claro", tipo: "texto", fg: () => E.texto, bg: (c) => c.clara, min: 4.5 },
  { id: "numero_tabela", nome: "Números e textos coloridos sobre o fundo suave", modo: "claro", tipo: "texto", fg: (c) => c.escura, bg: (c) => c.clara, min: 4.5 },
  { id: "filete_branco", nome: "Filetes, bordas e ícones na cor de destaque sobre o branco", modo: "claro", tipo: "elemento gráfico", fg: (c) => c.primaria, bg: () => E.superficie, min: 3 },
  { id: "filete_suave", nome: "Filete da linha da tabela sobre o fundo suave", modo: "claro", tipo: "elemento gráfico", fg: (c) => c.primaria, bg: (c) => c.clara, min: 3 },
  { id: "botao_hover", nome: "Botão ao passar o mouse: branco sobre a cor escura", modo: "claro", tipo: "texto", fg: () => "#FFFFFF", bg: (c) => c.escura, min: 4.5 },
  { id: "foco", nome: "Anel de foco na cor de destaque sobre o fundo", modo: "claro", tipo: "elemento gráfico", fg: (c) => c.primaria, bg: () => E.fundo, min: 3 },
  { id: "escuro_texto", nome: "Modo escuro: texto no brilho sobre o azul-marinho", modo: "escuro", tipo: "texto", fg: (c) => c.brilho, bg: () => E.azulMarinho, min: 4.5 },
  { id: "escuro_superficie", nome: "Modo escuro: texto no brilho sobre a superfície escura", modo: "escuro", tipo: "texto", fg: (c) => c.brilho, bg: () => E.texto, min: 4.5 },
  { id: "escuro_botao", nome: "Modo escuro: botão (branco sobre o destaque)", modo: "escuro", tipo: "texto", fg: () => "#FFFFFF", bg: (c) => c.primaria, min: 4.5 },
  { id: "escuro_borda", nome: "Modo escuro: bordas e foco no brilho sobre o azul-marinho", modo: "escuro", tipo: "elemento gráfico", fg: (c) => c.brilho, bg: () => E.azulMarinho, min: 3 },
];
const ESTRUTURAIS = [
  { nome: "Texto principal sobre o fundo", fg: E.texto, bg: E.fundo, min: 4.5 },
  { nome: "Texto principal sobre a superfície", fg: E.texto, bg: E.superficie, min: 4.5 },
  { nome: "Branco sobre o azul-marinho", fg: "#FFFFFF", bg: E.azulMarinho, min: 4.5 },
  { nome: "Branco sobre o azul secundário", fg: "#FFFFFF", bg: E.azulSecundario, min: 4.5 },
  { nome: "Pegadinha: título no alerta crítico sobre o branco", fg: E.alerta, bg: E.superficie, min: 4.5 },
  { nome: "Pegadinha: alerta crítico sobre o rosa claro da caixa", fg: E.alerta, bg: ROSA_ALERTA, min: 4.5 },
  { nome: "Pegadinha: texto sobre o rosa claro da caixa", fg: E.texto, bg: ROSA_ALERTA, min: 4.5 },
].map((x) => ({ ...x, valor: Math.round(contraste(x.fg, x.bg) * 100) / 100, ok: contraste(x.fg, x.bg) >= x.min }));

const avaliar = (c: CorTema) => COMPONENTES.map((k) => {
  const v = contraste(k.fg(c), k.bg(c));
  return { id: k.id, valor: Math.round(v * 100) / 100, minimo: k.min, ok: v >= k.min };
});

// ---------------------------------------------------------------------------- variações da cor-base (mesmo tom)
const papeis = papeisV2;
/** Maior luminosidade com o tom e a saturação dados em que todos os componentes passam. */
function lMax(C: number, H: number) {
  let best = 0;
  for (let L = 0.3; L <= 0.75; L += 0.002) if (avaliar(papeis(L, C, H)).every((r) => r.ok)) best = L;
  return best;
}

const paleta: Record<string, TemaPaleta & { variacao: string }> = {};
const areasInfo: Record<string, any> = {};
for (const [area, base] of Object.entries(BASES_V2)) {
  const lista = temas.filter((t) => t.area === area);
  const n = lista.length;
  if (!n) continue;
  const [L0, C0, H0] = hexParaOklch(base.cor);
  const SATS = [1, 0.8];
  const top = Math.min(...SATS.map((s) => lMax(C0 * s, H0)), L0 + 0.1) - 0.004;
  const bot = L0 - 0.11;
  const nivL = Math.ceil(n / SATS.length);
  const Ls = Array.from({ length: nivL }, (_, j) => (nivL > 1 ? bot + (j * (top - bot)) / (nivL - 1) : L0));
  // pontos da grade (luminosidade × saturação); o mais perto da cor-base vira a própria cor-base
  const pontos = Ls.flatMap((L, j) => SATS.map((s, q) => ({ L, s: SATS[(q + j) % 2] }))).slice(0, n);
  const iBase = pontos.reduce((b, p, j) => (Math.abs(p.L - L0) + (p.s === 1 ? 0 : 0.5) < Math.abs(pontos[b].L - L0) + (pontos[b].s === 1 ? 0 : 0.5) ? j : b), 0);
  const cores = pontos.map((p, j) => (j === iBase ? papeis(L0, C0, H0, base.cor) : papeis(p.L, C0 * p.s, H0)));
  // ordem dos temas: pulo na grade que deixa os vizinhos mais diferentes (o 1º tema = cor-base)
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  let melhor = { k: 1, min: -1 };
  for (let k = 1; k < Math.max(2, n); k++) {
    if (n > 1 && gcd(k, n) !== 1) continue;
    let min = 9;
    for (let i = 1; i < n; i++) min = Math.min(min, distancia(cores[(iBase + i * k) % n].primaria, cores[(iBase + (i - 1) * k) % n].primaria));
    if (min > melhor.min) melhor = { k, min };
  }
  lista.forEach((t, i) => {
    const j = (iBase + i * melhor.k) % n;
    const p = pontos[j];
    paleta[t.id] = {
      id: t.id, titulo: t.titulo, area, area_nome: t.area_nome, tom: Math.round(H0 * 10) / 10, ...cores[j],
      variacao: j === iBase ? "cor-base da área" : `${p.L > L0 + 0.005 ? "mais clara" : p.L < L0 - 0.005 ? "mais escura" : "mesma luz"}${p.s < 1 ? ", menos saturada" : ""}`,
    };
  });
  const b = papeis(L0, C0, H0, base.cor);
  areasInfo[area] = { nome: base.nome, principal: base.cor, escura: b.escura, fundo_suave: b.clara, brilho: b.brilho, temas: n, menor_distancia_entre_vizinhos: Math.round(melhor.min * 1000) / 1000 };
}

// ---------------------------------------------------------------------------- conferências
const problemas: string[] = [];
const relatorio = temas.map((t, i) => {
  const p = paleta[t.id];
  const comp = avaliar(p);
  for (const c of comp) if (!c.ok) problemas.push(`${t.id}: ${COMPONENTES.find((k) => k.id === c.id)!.nome} = ${c.valor} (mínimo ${c.minimo}).`);
  const h = hexParaOklch(p.primaria)[2];
  const hb = hexParaOklch(BASES_V2[t.area].cor)[2];
  const dh = Math.min(Math.abs(h - hb), 360 - Math.abs(h - hb));
  if (dh > 4) problemas.push(`${t.id}: tom saiu da cor-base da área (${dh.toFixed(1)}°).`);
  const viz = i > 0 ? distancia(p.primaria, paleta[temas[i - 1].id].primaria) : null;
  if (viz != null && temas[i - 1].area === t.area && viz < 0.02) problemas.push(`${t.id}: parecido demais com ${temas[i - 1].id} (${viz.toFixed(3)}).`);
  return { ...p, componentes: comp, distancia_do_anterior: viz == null ? null : Math.round(viz * 1000) / 1000 };
});
for (const x of ESTRUTURAIS) if (!x.ok) problemas.push(`Estrutura: ${x.nome} = ${x.valor} (mínimo ${x.min}).`);
const vizMesmaArea = relatorio.filter((r, i) => i > 0 && temas[i - 1].area === r.area).map((r) => r.distancia_do_anterior as number);
const resumo = {
  temas: relatorio.length,
  componentes_conferidos: COMPONENTES.length * relatorio.length + ESTRUTURAIS.length,
  componentes_reprovados: problemas.length,
  pior_por_componente: COMPONENTES.map((k, j) => ({ componente: k.nome, modo: k.modo, tipo: k.tipo, minimo: k.min, pior_valor: Math.min(...relatorio.map((r) => r.componentes[j].valor)) })),
  estruturais: ESTRUTURAIS.map(({ nome, valor, min, ok }) => ({ nome, valor, min, ok })),
  vizinhos_mesma_area: { menor: Math.round(Math.min(...vizMesmaArea) * 1000) / 1000, media: Math.round((vizMesmaArea.reduce((a, b) => a + b, 0) / vizMesmaArea.length) * 1000) / 1000 },
  go_vs_alerta_critico: Math.round(Math.min(...relatorio.filter((r) => r.area === "go").map((r) => distancia(r.primaria, E.alerta))) * 1000) / 1000,
  problemas,
};

// ---------------------------------------------------------------------------- arquivos
fs.mkdirSync(out, { recursive: true });
const dados = Object.fromEntries(Object.entries(paleta).map(([k, v]) => {
  const { variacao, ...rest } = v;
  return [k, rest];
}));
fs.writeFileSync(
  path.join(ROOT, "src/shared/visualMaterials/paletaTemasV2.data.ts"),
  `// Gerado por scripts/aulas/paleta-temas-v2.mts em ${new Date().toISOString().slice(0, 10)}. Não editar à mão.\n// Paleta v2: cor-base fixa por área (valores do dono); cada tema varia só luz e saturação. Uso: tema_cor "GR-xxx@v2".\nimport type { TemaPaleta } from "./temas";\nexport const PALETA_TEMAS_V2: Record<string, TemaPaleta> = ${JSON.stringify(dados, null, 1)};\n`
);
fs.writeFileSync(
  path.join(out, "paleta-temas.json"),
  JSON.stringify(
    {
      versao: "temas-2 (2026-10-13; principal desde 2026-10-14)",
      como_usar: 'Paleta PRINCIPAL (única) desde 14/10/2026 ("V2 aprovado"). Campo tema_cor: "GR-043" (ou "GR-043@v2"). "GR-043@v1" = paleta antiga, só legado. Vazio = cor-base da área da especialidade.',
      atencao: "O GR-001 passou de #2E9B67 (v1) para #087A63 (cor-base da Clínica Médica).",
      estrutura: E,
      areas: areasInfo,
      papeis: { primaria: "destaque: faixas, filetes, números (texto sobre ela: só branco)", escura: "texto colorido sobre branco/fundo; início dos gradientes; passar o mouse", clara: "fundo suave de linhas e caixas", brilho: "2ª linha do título, selos e bordas sobre o azul-marinho; acento no modo escuro" },
      regra_texto: "Texto pequeno nunca vai sobre a cor de destaque em tom de cor: sobre ela só texto branco (≥ 4,5:1). Texto colorido usa a cor escura.",
      pegadinha: "Só aparece quando o conteúdo tiver advertência relevante (campo pegadinha preenchido). Nos temas vermelhos (Ginecologia e Obstetrícia) ganha faixa listrada e triângulo cheio. Alerta crítico da v2: #B42336.",
      componentes: COMPONENTES.map(({ id, nome, modo, tipo, min }) => ({ id, nome, modo, tipo, minimo: min })),
      resumo,
      temas: relatorio,
    },
    null,
    1
  )
);

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const partes = (t: string) => {
  const w = t.split(/\s+/);
  const k = Math.ceil(w.length / 2);
  return [w.slice(0, k).join(" "), w.slice(k).join(" ")];
};
const NOMES_AREA = Object.fromEntries(Object.entries(BASES_V2).map(([k, v]) => [k, v.nome]));
// cartão sem nenhum código de cor nem resultado de contraste (é o que o dono e o aluno veem)
const cartao = (r: any) => {
  const [a, b] = partes(r.titulo);
  return `<article class="c" style="--p:${r.primaria};--e:${r.escura};--s:${r.clara};--g:${r.brilho}">
<div class="h"><span class="id">${r.id}</span><div class="t">${esc(a)}<br><span>${esc(b)}</span></div></div>
<div class="b">Mensagem-chave do card</div>
<div class="x"><div class="row"><span class="n">1</span><span>Linha da tabela</span></div><div class="lab">Pontos-chave</div><div class="chip">Atualizado 10/2026</div></div></article>`;
};
const secoes = Object.keys(BASES_V2)
  .map((area) => {
    const lista = relatorio.filter((r) => r.area === area);
    return lista.length ? `<section><h2><i style="background:${BASES_V2[area].cor}"></i>${esc(NOMES_AREA[area])} <small>${lista.length} temas</small></h2><div class="g">${lista.map(cartao).join("")}</div></section>` : "";
  })
  .join("");
const pegDemo = (forte: boolean) =>
  `<div class="peg${forte ? " forte" : ""}"><svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true">${forte ? `<path d="M24 3.5L46 42.5H2z" fill="${E.alerta}"/><path d="M24 16.5v13" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="36" r="3" fill="#fff"/>` : `<path d="M24 4.5L45 41.5H3z" fill="#fff" stroke="${E.alerta}" stroke-width="3.8" stroke-linejoin="round"/><path d="M24 17v12" stroke="${E.alerta}" stroke-width="4.6" stroke-linecap="round"/><circle cx="24" cy="35" r="2.8" fill="${E.alerta}"/>`}</svg><div><b>Pegadinha de prova!</b><span>${forte ? "Em Ginecologia e Obstetrícia: faixa listrada e triângulo cheio." : "Nas outras áreas."}</span></div></div>`;
fs.writeFileSync(
  path.join(out, "previa-paleta.html"),
  `<!doctype html><html lang="pt-BR" data-theme="claro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cores dos 100 temas (v2)</title><style>
:root{--fundo:${E.fundo};--sup:#FFFFFF;--txt:${E.texto};--mut:#4A5B72;--linha:#D6E1EA}
[data-theme="escuro"]{--fundo:#0B1D33;--sup:${E.texto};--txt:#EAF0F7;--mut:#B6C3D3;--linha:#2A3E5A}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--txt);font-family:system-ui,-apple-system,Segoe UI,sans-serif}
header{background:${E.cabecalho};color:#fff;padding:26px 16px}.w,main{max-width:1180px;margin:0 auto}
h1{font-size:32px;margin:0 0 6px}header p{margin:4px 0;color:#D5DFEA;max-width:860px;line-height:1.45}
.tg{display:inline-flex;gap:6px;margin-top:12px;background:rgba(255,255,255,.08);border-radius:999px;padding:4px}.tg button{border:0;border-radius:999px;padding:7px 16px;font:600 14px system-ui;background:transparent;color:#fff;cursor:pointer}.tg button[aria-pressed="true"]{background:#fff;color:${E.azulMarinho}}
.tg button:focus-visible{outline:3px solid #9CC3F0;outline-offset:2px}
main{padding:6px 16px 40px}h2{font-size:20px;margin:26px 0 10px;display:flex;align-items:center;gap:8px}h2 i{width:16px;height:16px;border-radius:5px;display:inline-block}h2 small{font-weight:400;color:var(--mut);font-size:14px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.c{background:var(--sup);border-radius:14px;overflow:hidden;border:1px solid var(--linha);box-shadow:0 2px 8px rgba(16,43,76,.08)}
.h{background:${E.cabecalho};padding:10px 12px 18px;color:#fff;min-height:86px}
.id{display:inline-block;background:var(--g);color:${E.azulMarinho};font-weight:800;font-size:11px;border-radius:999px;padding:2px 8px;margin-bottom:6px}
.t{font-weight:800;text-transform:uppercase;font-size:14.5px;line-height:1.04}.t span{color:var(--g)}
.b{margin:-10px 8px 0;position:relative;border:2px solid var(--g);border-radius:9px;color:#fff;font-weight:800;font-size:11.5px;text-transform:uppercase;padding:6px 9px;background:linear-gradient(90deg,var(--e),var(--p))}
.x{padding:9px 10px 11px;display:flex;flex-direction:column;gap:7px}.row{display:flex;gap:7px;align-items:center;font-size:12px;font-weight:600;padding:5px 7px;border-radius:6px;background:var(--s);border-left:5px solid var(--p);color:${E.texto}}
.n{width:18px;height:18px;border-radius:50%;border:2px solid var(--p);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:var(--e);background:#fff}
.lab{font-weight:800;font-size:11.5px;letter-spacing:.8px;text-transform:uppercase;color:var(--e)}
.chip{align-self:flex-start;font-weight:700;font-size:11px;border-radius:999px;padding:3px 9px;background:var(--p);color:#fff}
[data-theme="escuro"] .lab{color:var(--g)}[data-theme="escuro"] .row{background:rgba(255,255,255,.06);color:#EAF0F7;border-left-color:var(--g)}[data-theme="escuro"] .n{background:transparent;color:var(--g);border-color:var(--g)}
.leg{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:14px}
.peg{display:flex;gap:10px;align-items:center;background:#fff;border:2.5px solid ${E.alerta};border-radius:12px;padding:9px 12px;position:relative;overflow:hidden;color:${E.texto}}
.peg b{display:block;color:${E.alerta};font-style:italic;text-transform:uppercase;font-size:15px}.peg span{font-size:12.5px}
.peg.forte{padding-left:22px}.peg.forte:before{content:"";position:absolute;left:0;top:0;bottom:0;width:10px;background:repeating-linear-gradient(-45deg,${E.alerta} 0 4px,#fff 4px 7px)}
.nota{font-size:13px;color:#D5DFEA;margin-top:10px}
</style></head><body><header><div class="w"><h1>Cores dos 100 temas · v2</h1>
<p>Cada área tem uma cor-base fixa; cada tema é uma variação de luz e saturação dessa cor, sem mudar o tom. Ginecologia e Obstetrícia continua vermelha. Texto sobre a cor de destaque é sempre branco.</p>
<p><b>Atenção:</b> na v2 o verde do GR-001 (tuberculose) muda para a cor-base da Clínica Médica.</p>
<div class="tg" role="group" aria-label="Modo de cor"><button type="button" data-m="claro" aria-pressed="true">Modo claro</button><button type="button" data-m="escuro" aria-pressed="false">Modo escuro</button></div>
<div class="leg">${pegDemo(false)}${pegDemo(true)}</div>
<div class="nota">A caixa "Pegadinha de prova!" só aparece quando o conteúdo tem uma advertência importante; por isso ela não está nos cartões abaixo.</div>
</div></header><main>${secoes}</main>
<script>document.querySelectorAll('[data-m]').forEach(function(b){b.addEventListener('click',function(){document.documentElement.setAttribute('data-theme',b.getAttribute('data-m'));document.querySelectorAll('[data-m]').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});})});</script>
</body></html>`
);

// ferramenta de validação (equipe): aqui sim aparecem os códigos de cor e os números de contraste
const linhaTema = (r: any) =>
  `<tr><td><b>${r.id}</b><br><small>${esc(r.titulo)}</small><br><small>${esc(paleta[r.id].variacao)}</small></td><td>${["primaria", "escura", "clara", "brilho"].map((k) => `<span class="sw" style="background:${r[k]}"></span><code>${r[k]}</code>`).join("<br>")}</td>${r.componentes.map((c: any) => `<td class="${c.ok ? "ok" : "no"}">${c.valor.toFixed(2)}</td>`).join("")}</tr>`;
fs.writeFileSync(
  path.join(out, "validacao-contraste.html"),
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Validação de contraste (v2)</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#F3F7FA;color:#15263D}main{padding:16px;max-width:100%;overflow-x:auto}h1{font-size:24px}
table{border-collapse:collapse;font-size:12px;background:#fff}th,td{border:1px solid #D6E1EA;padding:4px 6px;vertical-align:top}th{background:#102B4C;color:#fff;font-weight:600;max-width:120px}
td.ok{background:#EAF7F0;color:#14532D;text-align:right}td.no{background:#FDE8EB;color:#8A1023;font-weight:700;text-align:right}.sw{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:4px;vertical-align:middle;border:1px solid #0002}code{font-size:11px}
.res{background:#fff;border:1px solid #D6E1EA;border-radius:10px;padding:10px 14px;margin-bottom:14px;line-height:1.5}
</style></head><body><main><h1>Validação de contraste por componente · paleta v2</h1>
<div class="res">Componentes conferidos: ${resumo.componentes_conferidos}. Reprovados: <b>${problemas.length}</b>.<br>Temas vizinhos da mesma área: diferença menor ${resumo.vizinhos_mesma_area.menor}, média ${resumo.vizinhos_mesma_area.media} (0,02 já se percebe).<br>Estrutura: ${ESTRUTURAIS.map((x) => `${esc(x.nome)} ${x.valor.toFixed(2)} (mín. ${x.min})`).join(" · ")}<br>${problemas.map(esc).join("<br>")}</div>
<table><thead><tr><th>Tema</th><th>Cores</th>${COMPONENTES.map((k) => `<th title="${esc(k.nome)}">${esc(k.nome.split(":")[0])}<br><small>${k.modo} · mín. ${k.min}</small></th>`).join("")}</tr></thead><tbody>${relatorio.map(linhaTema).join("")}</tbody></table></main></body></html>`
);
console.log(JSON.stringify({ ...resumo, pior_por_componente: resumo.pior_por_componente.map((x) => `${x.pior_valor} (mín ${x.minimo}) ${x.componente.slice(0, 60)}`), areas: areasInfo }, null, 1));
if (problemas.length) process.exitCode = 1;
