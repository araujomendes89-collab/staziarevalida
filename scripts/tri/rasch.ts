/**
 * Simulado TRI (estimativa StaziaMed) — estimador de Rasch (1 parâmetro: a dificuldade b de cada questão).
 *
 * É a versão em TypeScript do protótipo em Python (scratchpad tri/prototipo/rasch_estimador.py) e faz a MESMA conta da função
 * do banco public.irt_eap (migração …9996_simulado_tri.sql): os testes conferem as duas. Serve para:
 *   - o script de calibração (scripts/tri/calibrar.ts), que estima os b com as respostas dos alunos (JMLE) e grava pelo banco;
 *   - os testes do estimador (src/__tests__/simuladoTriEstimador.test.ts).
 *
 * Não é o cálculo do Inep: o Inep não publica os b das questões. A escala exibida é a PRÓPRIA (50 + 10·θ), nunca a do Inep.
 * Resposta nula (null) = questão fora da conta (anulada, sem gabarito ou não apresentada).
 */

export type Resposta = number | null | undefined;

/** Escala StaziaMed: nota = 50 + 10·θ, de 0 a 100 (de propósito diferente da escala do Inep). */
export const ESCALA = { media: 50, porLogit: 10 } as const;
/** Prior e grade do EAP (iguais aos padrões da função do banco irt_eap). */
export const EAP_PADRAO = { mu: 0, sigma: 1, nQuad: 61, amplitude: 5 } as const;
/** Respostas mínimas para a dificuldade sair "calibrada" (abaixo disso é "provisória"). */
export const MINIMO_CALIBRADA = 100;
/** Respostas mínimas para o Rasch estimar a dificuldade do item (abaixo disso: percentual de acerto ou nível do blueprint). */
export const MINIMO_RASCH = 30;

/** P(acerto) = 1 / (1 + e^-(θ - b)). */
export function prob(theta: number, b: number): number {
  return 1 / (1 + Math.exp(-(theta - b)));
}

const arred1 = (x: number) => (Math.sign(x) * Math.round(Math.abs(x) * 10)) / 10;

/** Nota na escala StaziaMed (1 casa decimal, de 0 a 100). */
export function escalaStaziaMed(theta: number): number {
  return Math.min(100, Math.max(0, arred1(ESCALA.media + ESCALA.porLogit * theta)));
}

function pares(resp: Resposta[], b: Resposta[]): [number, number][] {
  if (resp.length !== b.length) throw new Error("respostas e dificuldades precisam ter o mesmo tamanho");
  const out: [number, number][] = [];
  resp.forEach((x, i) => {
    const bi = b[i];
    if (x === null || x === undefined || bi === null || bi === undefined || Number.isNaN(x) || Number.isNaN(bi)) return;
    out.push([x ? 1 : 0, bi]);
  });
  return out;
}

/** θ por EAP (esperança a posteriori) com prior Normal(mu, sigma), em grade regular. Funciona com 0 ou 100% de acertos. */
export function thetaEap(
  resp: Resposta[],
  b: Resposta[],
  opts: Partial<{ mu: number; sigma: number; nQuad: number; amplitude: number }> = {}
): { theta: number; se: number } {
  const { mu, sigma, nQuad, amplitude } = { ...EAP_PADRAO, ...opts };
  const itens = pares(resp, b);
  const grade: number[] = [];
  const lp: number[] = [];
  for (let k = 0; k < nQuad; k++) {
    const t = mu + sigma * amplitude * ((2 * k) / (nQuad - 1) - 1);
    let soma = -0.5 * ((t - mu) / sigma) ** 2;
    for (const [x, bi] of itens) soma += x === 1 ? -Math.log1p(Math.exp(bi - t)) : -Math.log1p(Math.exp(t - bi));
    grade.push(t);
    lp.push(soma);
  }
  const max = Math.max(...lp);
  const w = lp.map((v) => Math.exp(v - max));
  const total = w.reduce((s, v) => s + v, 0);
  const theta = grade.reduce((s, t, k) => s + t * w[k], 0) / total;
  const se = Math.sqrt(grade.reduce((s, t, k) => s + (t - theta) ** 2 * w[k], 0) / total);
  return { theta, se };
}

/** θ por máxima verossimilhança (Newton). 0 ou 100% de acertos: ±Infinity e erro padrão NaN. */
export function thetaMle(resp: Resposta[], b: Resposta[]): { theta: number; se: number } {
  const itens = pares(resp, b);
  if (!itens.length) return { theta: NaN, se: NaN };
  const r = itens.reduce((s, [x]) => s + x, 0);
  if (r === 0) return { theta: -Infinity, se: NaN };
  if (r === itens.length) return { theta: Infinity, se: NaN };
  let th = Math.log(r / (itens.length - r)) + itens.reduce((s, [, bi]) => s + bi, 0) / itens.length;
  for (let i = 0; i < 100; i++) {
    let esperado = 0;
    let info = 0;
    for (const [, bi] of itens) {
      const p = prob(th, bi);
      esperado += p;
      info += p * (1 - p);
    }
    const passo = Math.max(-1, Math.min(1, (r - esperado) / Math.max(info, 1e-9)));
    th += passo;
    if (Math.abs(passo) < 1e-10) break;
  }
  const info = itens.reduce((s, [, bi]) => s + prob(th, bi) * (1 - prob(th, bi)), 0);
  return { theta: th, se: 1 / Math.sqrt(info) };
}

export interface Estimativa {
  theta: number;
  se: number;
  thetaLo: number;
  thetaHi: number;
  nota: number;
  notaLo: number;
  notaHi: number;
  nItens: number;
  acertos: number;
}

/** θ (EAP), erro padrão, nota StaziaMed e intervalo de 95% (θ ± 1,96·EP) — o mesmo que irt_estimar_theta no banco. */
export function estimarTheta(resp: Resposta[], b: Resposta[]): Estimativa {
  const itens = pares(resp, b);
  const { theta, se } = thetaEap(resp, b);
  const thetaLo = theta - 1.96 * se;
  const thetaHi = theta + 1.96 * se;
  return {
    theta,
    se,
    thetaLo,
    thetaHi,
    nota: escalaStaziaMed(theta),
    notaLo: escalaStaziaMed(thetaLo),
    notaHi: escalaStaziaMed(thetaHi),
    nItens: itens.length,
    acertos: itens.reduce((s, [x]) => s + x, 0),
  };
}

/** Estado da dificuldade pela quantidade de respostas válidas. */
export function estadoDoItem(nRespostas: number): "provisoria" | "calibrada" {
  return nRespostas >= MINIMO_CALIBRADA ? "calibrada" : "provisoria";
}

/** Dificuldade provisória pelo percentual de acerto (logit com meio acerto de correção: nunca infinita). */
export function bProvisorioPorPercentual(acertos: number, n: number): number {
  const p = (acertos + 0.5) / (n + 1);
  return Math.log((1 - p) / p);
}

/** Dificuldade provisória pelo nível do blueprint (question_dna.difficulty_estimate). Sem nível: 0 (o meio da régua). */
export function bPorNivel(nivel: string | null | undefined): number {
  return nivel === "LOW" ? -1 : nivel === "HIGH" ? 1 : 0;
}

export interface Calibracao {
  /** b por item (média 0 entre os itens estimados); null = sem estimativa (todos acertaram ou todos erraram). */
  b: (number | null)[];
  /** erro padrão de b (1/√informação). */
  se: (number | null)[];
  /** θ por pessoa (JMLE); null = pessoa fora (0 ou 100% de acertos). */
  theta: (number | null)[];
  /** respostas válidas e acertos por item (das pessoas que ficaram na conta). */
  nResp: number[];
  nAcertos: number[];
  infit: (number | null)[];
  outfit: (number | null)[];
  iteracoes: number;
}

/**
 * Calibração por máxima verossimilhança conjunta (JMLE), com Newton alternado entre itens e pessoas, para matriz INCOMPLETA
 * (cada aluno respondeu um simulado diferente). Tira, até estabilizar, itens com 0% ou 100% de acerto e pessoas com 0 ou 100%.
 * b centrado em média 0. Correção de viés de Wright: b·(L−1)/L, com L = média de itens respondidos por pessoa.
 */
export function calibrarJmle(X: Resposta[][], opts: { maxIter?: number; tol?: number } = {}): Calibracao {
  const maxIter = opts.maxIter ?? 500;
  const tol = opts.tol ?? 1e-7;
  const n = X.length;
  const L = n ? X[0].length : 0;
  const val = (i: number, j: number): number | null => {
    const v = X[i][j];
    return v === null || v === undefined || Number.isNaN(v) ? null : v ? 1 : 0;
  };
  let itensOk = Array(L).fill(true) as boolean[];
  let pessoasOk = Array(n).fill(true) as boolean[];
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (let j = 0; j < L; j++) {
      if (!itensOk[j]) continue;
      let s = 0, m = 0;
      for (let i = 0; i < n; i++) {
        const v = pessoasOk[i] ? val(i, j) : null;
        if (v !== null) {
          s += v;
          m++;
        }
      }
      if (m === 0 || s === 0 || s === m) {
        itensOk[j] = false;
        mudou = true;
      }
    }
    for (let i = 0; i < n; i++) {
      if (!pessoasOk[i]) continue;
      let s = 0, m = 0;
      for (let j = 0; j < L; j++) {
        const v = itensOk[j] ? val(i, j) : null;
        if (v !== null) {
          s += v;
          m++;
        }
      }
      if (m === 0 || s === 0 || s === m) {
        pessoasOk[i] = false;
        mudou = true;
      }
    }
  }
  const nResp = Array(L).fill(0) as number[];
  const nAcertos = Array(L).fill(0) as number[];
  const r = Array(n).fill(0) as number[];
  const m = Array(n).fill(0) as number[];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < L; j++) {
      const v = val(i, j);
      if (!pessoasOk[i] || !itensOk[j] || v === null) continue;
      nResp[j]++;
      nAcertos[j] += v;
      r[i] += v;
      m[i]++;
    }
  const b = Array(L).fill(0) as number[];
  const th = Array(n).fill(0) as number[];
  for (let j = 0; j < L; j++) if (itensOk[j]) b[j] = Math.log((nResp[j] - nAcertos[j]) / nAcertos[j]);
  const centrar = () => {
    const ids = b.map((_, j) => j).filter((j) => itensOk[j]);
    const media = ids.reduce((s, j) => s + b[j], 0) / Math.max(ids.length, 1);
    ids.forEach((j) => (b[j] -= media));
  };
  centrar();
  for (let i = 0; i < n; i++) if (pessoasOk[i]) th[i] = Math.log(r[i] / (m[i] - r[i]));

  let iteracoes = 0;
  for (; iteracoes < maxIter; iteracoes++) {
    let delta = 0;
    // itens
    const esp = Array(L).fill(0) as number[];
    const inf = Array(L).fill(0) as number[];
    for (let i = 0; i < n; i++) {
      if (!pessoasOk[i]) continue;
      for (let j = 0; j < L; j++) {
        if (!itensOk[j] || val(i, j) === null) continue;
        const p = prob(th[i], b[j]);
        esp[j] += p;
        inf[j] += p * (1 - p);
      }
    }
    for (let j = 0; j < L; j++) {
      if (!itensOk[j]) continue;
      const passo = Math.max(-1, Math.min(1, (esp[j] - nAcertos[j]) / Math.max(inf[j], 1e-9)));
      b[j] += passo;
      delta = Math.max(delta, Math.abs(passo));
    }
    centrar();
    // pessoas
    for (let i = 0; i < n; i++) {
      if (!pessoasOk[i]) continue;
      let e = 0, w = 0;
      for (let j = 0; j < L; j++) {
        if (!itensOk[j] || val(i, j) === null) continue;
        const p = prob(th[i], b[j]);
        e += p;
        w += p * (1 - p);
      }
      const passo = Math.max(-1, Math.min(1, (r[i] - e) / Math.max(w, 1e-9)));
      th[i] += passo;
      delta = Math.max(delta, Math.abs(passo));
    }
    if (delta < tol) break;
  }

  const pessoasNaConta = pessoasOk.filter(Boolean).length;
  const Lmedio = pessoasNaConta ? m.reduce((s, v, i) => s + (pessoasOk[i] ? v : 0), 0) / pessoasNaConta : 0;
  const fator = Lmedio > 1 ? (Lmedio - 1) / Lmedio : 1;

  // erro padrão e ajuste (infit/outfit) com os b sem a correção de viés (é onde a verossimilhança foi maximizada)
  const se: (number | null)[] = Array(L).fill(null);
  const infit: (number | null)[] = Array(L).fill(null);
  const outfit: (number | null)[] = Array(L).fill(null);
  for (let j = 0; j < L; j++) {
    if (!itensOk[j]) continue;
    let w = 0, z2 = 0, r2 = 0, k = 0;
    for (let i = 0; i < n; i++) {
      const v = val(i, j);
      if (!pessoasOk[i] || v === null) continue;
      const p = prob(th[i], b[j]);
      const wi = p * (1 - p);
      w += wi;
      r2 += (v - p) ** 2;
      z2 += (v - p) ** 2 / Math.max(wi, 1e-9);
      k++;
    }
    se[j] = 1 / Math.sqrt(Math.max(w, 1e-9));
    infit[j] = r2 / Math.max(w, 1e-9);
    outfit[j] = z2 / Math.max(k, 1);
  }

  return {
    b: b.map((v, j) => (itensOk[j] ? v * fator : null)),
    se,
    theta: th.map((v, i) => (pessoasOk[i] ? v : null)),
    nResp,
    nAcertos,
    infit,
    outfit,
    iteracoes,
  };
}

/** Gerador de números com semente (mulberry32) — para as simulações dos testes serem sempre iguais. */
export function sorteador(semente: number) {
  let a = semente >>> 0;
  const uniforme = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(uniforme(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniforme());
  };
  return { uniforme, normal };
}
