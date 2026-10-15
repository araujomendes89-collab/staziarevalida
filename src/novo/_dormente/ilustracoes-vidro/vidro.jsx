// Peças do estilo "vidro translúcido" (docs/temas-card.md): paleta por camada, definições SVG (halo, vidro, rosa, brilho,
// desfoque), corpo de vidro, tubo de vidro e gerador de ramos. Os motivos (motivos.jsx) são montados só com estas peças.
import React from "react";

/** Paleta do vidro (camadas): corpo claro azul-esverdeado, rosa por dentro, contorno branco e definição azul. */
export const VIDRO = {
  corpo: ["#FFFFFF", "#E8F6FB", "#C4E5F3", "#8EC5DF"],
  corpoOpac: [0.78, 0.5, 0.4, 0.5],
  fundo: ["#F4FBFE", "#CBE7F3", "#9ACBE2"],
  rosa: ["#EE6F87", "#F6A9B7"],
  ramo: ["#D24E69", "#F3A2B1"],
  azul: ["#5B98C0", "#9CCBE3"],
  sombra: "#2F6F98",
  contorno: "#FFFFFF",
  definicao: "#4E8FB8",
};

/** Contexto com o prefixo único das definições (vários cartões na mesma página). */
export const Ctx = React.createContext("il");
export const useU = () => React.useContext(Ctx);

export function Defs({ u }) {
  const v = VIDRO;
  return (
    <defs>
      <radialGradient id={`${u}-halo`} cx="58%" cy="46%" r="52%">
        <stop offset="0" style={{ stopColor: "var(--il-halo)", stopOpacity: 0.85 }} />
        <stop offset="0.55" style={{ stopColor: "var(--il-halo)", stopOpacity: 0.32 }} />
        <stop offset="1" style={{ stopColor: "var(--il-halo)", stopOpacity: 0 }} />
      </radialGradient>
      <linearGradient id={`${u}-vidro`} x1="0.1" y1="0" x2="0.9" y2="1">
        {v.corpo.map((c, i) => <stop key={i} offset={[0, 0.32, 0.68, 1][i]} stopColor={c} stopOpacity={v.corpoOpac[i]} />)}
      </linearGradient>
      <linearGradient id={`${u}-vidroFundo`} x1="0" y1="0" x2="1" y2="1">
        {v.fundo.map((c, i) => <stop key={i} offset={[0, 0.55, 1][i]} stopColor={c} stopOpacity={[0.7, 0.45, 0.4][i]} />)}
      </linearGradient>
      <linearGradient id={`${u}-tinta`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" style={{ stopColor: "var(--il-halo)", stopOpacity: 0 }} />
        <stop offset="1" style={{ stopColor: "var(--il-halo)", stopOpacity: 0.55 }} />
      </linearGradient>
      <radialGradient id={`${u}-rosa`}>
        <stop offset="0" stopColor={v.rosa[0]} stopOpacity="0.62" />
        <stop offset="0.55" stopColor={v.rosa[1]} stopOpacity="0.3" />
        <stop offset="1" stopColor={v.rosa[1]} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${u}-brilho`}>
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
        <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0.35" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
      <filter id={`${u}-blur`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" /></filter>
      <filter id={`${u}-blurLeve`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.1" /></filter>
    </defs>
  );
}

/**
 * Corpo de vidro: preenchimento em degradê, conteúdo interno recortado pela forma (ramos, rosa), sombra interna,
 * brilho especular e contorno claro. `brilho`: [cx, cy, rx, ry] do reflexo; `rosa`: lista de [cx, cy, rx, ry].
 */
export function Vidro({ d, k, brilho, rosa = [], fundo = false, children, opacidade = 1 }) {
  const u = useU();
  const id = `${u}-c-${k}`;
  return (
    <g opacity={opacidade}>
      <clipPath id={id}><path d={d} /></clipPath>
      <path d={d} fill={`url(#${u}-${fundo ? "vidroFundo" : "vidro"})`} />
      <g clipPath={`url(#${id})`}>
        <path d={d} fill={`url(#${u}-tinta)`} opacity="0.3" />
        {rosa.map(([cx, cy, rx, ry], i) => <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${u}-rosa)`} />)}
        {children}
        <path d={d} fill="none" stroke={VIDRO.sombra} strokeOpacity="0.42" strokeWidth="13" filter={`url(#${u}-blur)`} />
        <path d={d} fill="none" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="3.2" filter={`url(#${u}-blurLeve)`} />
        {brilho && <ellipse cx={brilho[0]} cy={brilho[1]} rx={brilho[2]} ry={brilho[3]} fill={`url(#${u}-brilho)`} opacity="0.85" />}
      </g>
      <path d={d} fill="none" stroke={VIDRO.definicao} strokeOpacity="0.32" strokeWidth="2.2" />
      <path d={d} fill="none" stroke={VIDRO.contorno} strokeOpacity="0.92" strokeWidth="1.2" />
    </g>
  );
}

/** Tubo de vidro (traqueia, vasos, ureter): camadas de traço do mais escuro e largo ao reflexo fino. */
export function Tubo({ d, w = 10, cor = "azul", opacidade = 1 }) {
  const c = cor === "rosa" ? ["#C9546C", "#F0A0AF", "#FBE3E8"] : ["#4F8DB6", "#BFE2F2", "#FFFFFF"];
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={opacidade}>
      <path d={d} stroke={c[0]} strokeOpacity="0.5" strokeWidth={w + 1.6} />
      <path d={d} stroke={c[1]} strokeOpacity="0.92" strokeWidth={w} />
      <path d={d} stroke={c[0]} strokeOpacity="0.18" strokeWidth={w * 0.55} />
      <path d={d} stroke={c[2]} strokeOpacity="0.85" strokeWidth={Math.max(1, w * 0.16)} />
    </g>
  );
}

/** Gerador de árvore (brônquios, artérias): ramos curvos determinísticos. Ângulo em graus, 0 = para cima, horário. */
export function arvore({ x, y, ang, len, w, prof, abertura = 28, semente = 7, encolhe = 0.76 }) {
  let s = semente;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const segs = [];
  const pontas = [];
  const ramo = (x0, y0, a, l, wd, n) => {
    const r = (a * Math.PI) / 180;
    const x1 = x0 + Math.sin(r) * l;
    const y1 = y0 - Math.cos(r) * l;
    const curva = (rnd() - 0.5) * l * 0.35;
    const cx = (x0 + x1) / 2 + Math.cos(r) * curva;
    const cy = (y0 + y1) / 2 + Math.sin(r) * curva;
    segs.push({ d: `M${x0.toFixed(1)} ${y0.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`, w: wd, n });
    if (n >= prof) {
      pontas.push([x1, y1]);
      return;
    }
    const ab = abertura * (0.75 + rnd() * 0.5);
    ramo(x1, y1, a - ab, l * (encolhe + rnd() * 0.1), wd * 0.68, n + 1);
    ramo(x1, y1, a + ab * (0.8 + rnd() * 0.4), l * (encolhe - 0.04 + rnd() * 0.1), wd * 0.64, n + 1);
  };
  ramo(x, y, ang, len, w, 0);
  return { segs, pontas };
}

/** Desenha uma árvore em rosa (ou azul), mais escura no tronco e clara nas pontas, com pontinhos nas terminações. */
export function Ramos({ arv, cor = "rosa", opacidade = 0.9, pontos = true }) {
  const [a, b] = cor === "rosa" ? VIDRO.ramo : VIDRO.azul;
  const max = Math.max(1, ...arv.segs.map((s) => s.n));
  const mix = (t) => {
    const h = (c, i) => parseInt(c.slice(i, i + 2), 16);
    return `rgb(${[1, 3, 5].map((i) => Math.round(h(a, i) * (1 - t) + h(b, i) * t)).join(",")})`;
  };
  return (
    <g fill="none" strokeLinecap="round" opacity={opacidade}>
      {arv.segs.map((s, i) => <path key={i} d={s.d} stroke={mix(s.n / max)} strokeWidth={Math.max(0.5, s.w)} strokeOpacity={1 - (s.n / max) * 0.35} />)}
      {pontos && arv.pontas.map(([x, y], i) => <circle key={`p${i}`} cx={x} cy={y} r={1.7} fill={b} fillOpacity="0.55" />)}
    </g>
  );
}

/** Reflexo solto (brilho especular fora de um corpo). */
export const Brilho = ({ cx, cy, rx, ry, o = 0.8 }) => {
  const u = useU();
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${u}-brilho)`} opacity={o} />;
};


/** Curva suave (Catmull-Rom → Bézier) passando pelos pontos; `fechada` fecha a forma. */
export function suave(pts, fechada = false) {
  const n = pts.length;
  if (n < 2) return "";
  const P = (i) => (fechada ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const f = (v) => v.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const fim = fechada ? n : n - 1;
  for (let i = 0; i < fim; i += 1) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return fechada ? `${d}Z` : d;
}
