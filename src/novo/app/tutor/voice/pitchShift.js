// Afinador da voz ao vivo (decisão do dono, 17/10/2026): o Stazi fala com a voz Gemini "Zubenelgenubi" afinada +3 semitons, no
// mesmo ritmo. Reproduz, em pedaços que chegam um atrás do outro, o efeito da referência aprovada feita no ffmpeg:
//   asetrate=24000*2^(3/12),aresample=24000,atempo=1/2^(3/12)
// ou seja: (1) toca o som mais rápido — tom E formantes sobem juntos (o efeito "desenho"), a duração encolhe; (2) estica o tempo de
// volta sem mexer no tom, e a duração volta a ser a original.
//
// Como faz, em JavaScript puro e sem dependências:
//  1. Reamostragem fracionária contínua: cada amostra de saída m lê a entrada no instante m·r (r = 2^(semitons/12)) com um núcleo
//     sinc de janela Kaiser (16 cruzamentos, 256 fases), com passa-baixa em 0,97/r para não dobrar agudos ao subir o tom.
//  2. Esticamento de tempo WSOLA: janelas Hann de 20 ms com metade sobreposta; cada janela é procurada até ±6 ms do lugar nominal,
//     no ponto que melhor continua a anterior (correlação normalizada), e somada na saída. Fator de esticar = r.
// O estado (amostras guardadas, posições, a metade da janela que ainda vai somar) passa de um pedaço para o outro, então não há
// estalo na emenda e o resultado é IGUAL qualquer que seja o tamanho dos pedaços (100 ms, 40 ms ou o áudio inteiro).
//
// Latência: o afinador segura o fim do que já recebeu até ter amostras para a próxima janela. Com +3 semitons a 24 kHz, ele segura
// no máximo `latenciaMax` (~34 ms). Quanto ele segura varia de um pedaço para o outro (de ~10 a ~34 ms); por isso o tocador agenda
// a fala afinada com essa folga fixa a mais (audioPlayer.js): a voz sai ~34 ms depois e, a partir daí, os pedaços emendam sem
// buraco mesmo chegando no ritmo da fala. `finalizar()` solta o fim (completando com silêncio) e deixa a duração total exatamente
// igual à da entrada; o tocador chama no fim da geração/turno.
// semitons = 0: `processar` devolve a própria entrada, sem tocar em nada (a Stazia segue bit a bit igual ao caminho de hoje).

const ZEROS_SINC = 16;
const FASES_SINC = 256;
const BETA_KAISER = 8;
const MARGEM_PASSA_BAIXA = 0.97;

function bessel0(x) {
  let soma = 1;
  let termo = 1;
  for (let k = 1; k < 60; k++) {
    const q = x / (2 * k);
    termo *= q * q;
    soma += termo;
    if (termo < 1e-14 * soma) break;
  }
  return soma;
}

/** Núcleo sinc com janela Kaiser, tabelado: h(t) para t em [−W, W] (amostras de entrada), índice (t + W)·FASES. */
function nucleoSinc(fc) {
  const W = Math.ceil(ZEROS_SINC / fc);
  const n = 2 * W * FASES_SINC + 1;
  const tab = new Float64Array(n + 1);
  const i0b = bessel0(BETA_KAISER);
  for (let i = 0; i < n; i++) {
    const t = i / FASES_SINC - W;
    const x = Math.PI * fc * t;
    const s = x === 0 ? 1 : Math.sin(x) / x;
    const u = t / W;
    const w = Math.abs(u) <= 1 ? bessel0(BETA_KAISER * Math.sqrt(Math.max(0, 1 - u * u))) / i0b : 0;
    tab[i] = fc * s * w;
  }
  return { tab, W };
}

/** Fila de amostras com índice absoluto (base = índice da primeira guardada); descarta o que não vai mais ser lido. */
class Faixa {
  constructor(zerosAntes) {
    this.buf = new Float64Array(Math.max(4096, zerosAntes * 4));
    this.base = -zerosAntes; // começa com silêncio antes do 0: as primeiras janelas leem zeros, sem caso especial
    this.n = zerosAntes;
  }
  get fim() {
    return this.base + this.n; // primeiro índice absoluto que ainda não chegou
  }
  _cabe(extra) {
    if (this.n + extra <= this.buf.length) return;
    const novo = new Float64Array(Math.max(this.buf.length * 2, this.n + extra));
    novo.set(this.buf.subarray(0, this.n));
    this.buf = novo;
  }
  empurrar(arr) {
    this._cabe(arr.length);
    this.buf.set(arr, this.n);
    this.n += arr.length;
  }
  empurrarUm(v) {
    this._cabe(1);
    this.buf[this.n++] = v;
  }
  /** Esquece tudo antes do índice absoluto `abs` (só copia quando o desperdício passa da metade). */
  descartarAte(abs) {
    const k = abs - this.base;
    if (k <= 0 || k < this.buf.length / 2) return;
    this.buf.copyWithin(0, k, this.n);
    this.n -= k;
    this.base = abs;
  }
}

export class AfinadorStream {
  /**
   * semitons: quanto afinar (+3 = Stazi; 0 = sem afinar). taxa: amostras por segundo da voz (24 kHz no Gemini).
   * janelaMs / buscaMs: janela do WSOLA e quanto ela pode andar para achar a melhor emenda.
   */
  constructor({ semitons = 0, taxa = 24000, janelaMs = 20, buscaMs = 6 } = {}) {
    this.semitons = normalizarSemitons(semitons);
    this.taxa = taxa;
    this.ativo = this.semitons !== 0;
    if (!this.ativo) return;
    this.r = 2 ** (this.semitons / 12);
    const fc = Math.min(1, 1 / this.r) * MARGEM_PASSA_BAIXA;
    const { tab, W } = nucleoSinc(fc);
    this.tab = tab;
    this.W = W;
    let N = Math.round((janelaMs * taxa) / 1000);
    N += N % 2;
    this.N = N;
    this.Hs = N / 2;
    this.busca = Math.max(1, Math.round((buscaMs * taxa) / 1000));
    this.janela = new Float64Array(N);
    for (let i = 0; i < N; i++) this.janela[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); // Hann periódica: metade sobreposta soma 1
    this.reiniciar();
  }

  /** Esquece tudo (barge-in, fim de fala): o próximo pedaço começa do zero, como se antes dele houvesse silêncio. */
  reiniciar() {
    if (!this.ativo) return;
    this.x = new Faixa(this.W + 1);
    this.m = 0;
    this.y = new Faixa(this.busca + this.N + this.Hs + 2);
    this.k = -1;
    this.pAnt = 0;
    this.acc = new Float64Array(this.N);
    this.totalEntrada = 0;
    this.totalSaida = 0;
  }

  /** Quantas amostras de entrada ainda estão seguras aqui dentro (entrada recebida − saída entregue). */
  get retidas() {
    return this.ativo ? this.totalEntrada - this.totalSaida : 0;
  }

  /**
   * O máximo que `retidas` pode chegar, em amostras de entrada (qualquer tamanho de pedaço). Conta: a próxima janela do WSOLA só
   * sai quando a reamostragem tem até a + busca + max(Hs, Hs/r) + N amostras; isso pede r·(…) + W de entrada, e Hs já saíram.
   */
  get latenciaMax() {
    if (!this.ativo) return 0;
    const { r, busca, Hs, N, W } = this;
    return Math.ceil(r * (busca + Math.max(Hs, Hs / r) + N + 1)) + W - Hs + 2;
  }

  /** Pedaço de voz (Float32, −1..1) → pedaço afinado (pode vir mais curto: o fim fica guardado até o próximo). */
  processar(entrada) {
    if (!this.ativo) return entrada;
    this.totalEntrada += entrada.length;
    const saida = this._rodar(entrada);
    this.totalSaida += saida.length;
    return saida;
  }

  /** Solta o que ficou guardado (completando com silêncio): a saída total fica com a mesma duração da entrada. Depois reinicia. */
  finalizar() {
    if (!this.ativo) return new Float32Array(0);
    const falta = this.totalEntrada - this.totalSaida;
    const partes = [];
    let tem = 0;
    if (falta > 0) {
      const zeros = new Float32Array(this.N * 2 + this.busca * 2 + this.W * 2);
      for (let voltas = 0; tem < falta && voltas < 64; voltas++) {
        const p = this._rodar(zeros);
        partes.push(p);
        tem += p.length;
      }
    }
    const saida = juntar(partes, Math.max(0, falta));
    this.reiniciar();
    return saida;
  }

  _rodar(entrada) {
    this.x.empurrar(entrada);
    this._reamostrar();
    return this._esticar();
  }

  // 1) reamostragem: y[m] = Σ x[k]·h(m·r − k), enquanto houver entrada até floor(m·r) + W
  _reamostrar() {
    const { x, y, r, W, tab } = this;
    const F = FASES_SINC;
    const fimX = x.fim;
    const buf = x.buf;
    for (;;) {
      const tau = this.m * r;
      const i0 = Math.floor(tau);
      if (i0 + W >= fimX) break;
      const fase = (tau - i0) * F;
      const j0 = Math.floor(fase);
      const f = fase - j0;
      let soma = 0;
      let ix = i0 + W - x.base;
      let j = j0;
      for (let q = 0; q < 2 * W; q++) {
        const h = tab[j] + f * (tab[j + 1] - tab[j]);
        soma += buf[ix] * h;
        ix--;
        j += F;
      }
      y.empurrarUm(soma);
      this.m++;
    }
    x.descartarAte(Math.floor(this.m * r) - W);
  }

  // 2) WSOLA: janela k na saída começa em k·Hs; na entrada (y), perto de k·Hs/r, onde melhor continua a janela anterior
  _esticar() {
    const { y, N, Hs, busca, janela, acc, r } = this;
    const partes = [];
    for (;;) {
      const k = this.k;
      const a = Math.round((k * Hs) / r);
      const natural = this.pAnt + Hs;
      if ((k < 0 ? a : Math.max(a + busca, natural)) + N > y.fim) break;
      const p = k < 0 ? a : this._melhorInicio(a, natural);
      const buf = y.buf;
      const o = p - y.base;
      for (let i = 0; i < N; i++) acc[i] += janela[i] * buf[o + i];
      if (k >= 0) {
        const seg = new Float32Array(Hs);
        for (let i = 0; i < Hs; i++) {
          const v = acc[i];
          seg[i] = v > 1 ? 1 : v < -1 ? -1 : v;
        }
        partes.push(seg);
      }
      acc.copyWithin(0, Hs, N);
      acc.fill(0, N - Hs);
      this.pAnt = p;
      this.k = k + 1;
    }
    const proxA = Math.round((this.k * Hs) / r);
    y.descartarAte(Math.min(proxA - busca, this.pAnt + Hs));
    return juntar(partes);
  }

  /** Início da janela, até ±busca de `a`, cuja forma mais parece a continuação natural da anterior (correlação normalizada). */
  _melhorInicio(a, natural) {
    const { y, N, busca } = this;
    const buf = y.buf;
    const on = natural - y.base;
    let eNat = 0;
    for (let i = 0; i < N; i += 2) eNat += buf[on + i] * buf[on + i];
    if (eNat < 1e-10 * N) return a; // silêncio: fica no lugar nominal
    const nota = (c, passo) => {
      const oc = c - y.base;
      let xy = 0;
      let e = 0;
      for (let i = 0; i < N; i += passo) {
        const v = buf[oc + i];
        xy += v * buf[on + i];
        e += v * v;
      }
      return xy / Math.sqrt(e + 1e-9 * N);
    };
    // busca grossa (de 2 em 2, metade das amostras) e depois o ajuste fino de ±1 com todas
    let melhor = 0;
    let melhorNota = nota(a, 2);
    for (let d = -busca; d <= busca; d += 2) {
      if (d === 0) continue;
      const n = nota(a + d, 2);
      if (n > melhorNota + 1e-12) {
        melhorNota = n;
        melhor = d;
      }
    }
    let fino = melhor;
    let notaFina = nota(a + melhor, 1);
    for (const d of [melhor - 1, melhor + 1]) {
      if (d < -busca || d > busca) continue;
      const n = nota(a + d, 1);
      if (n > notaFina + 1e-12) {
        notaFina = n;
        fino = d;
      }
    }
    return a + fino;
  }
}

function juntar(partes, limite = Infinity) {
  let total = 0;
  for (const p of partes) total += p.length;
  total = Math.min(total, limite);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of partes) {
    if (o >= total) break;
    const n = Math.min(p.length, total - o);
    out.set(n === p.length ? p : p.subarray(0, n), o);
    o += n;
  }
  return out;
}

/** Semitons válidos para a voz (número finito entre −12 e 12; o resto vira 0). */
export function normalizarSemitons(n) {
  const s = Number(n);
  return Number.isFinite(s) ? Math.max(-12, Math.min(12, s)) : 0;
}

// Quanto a tela de voz pede para afinar a voz ao vivo (o personagem da conversa: manifest `voz.semitons`). Os tocadores da voz ao
// vivo abertos sem um valor próprio seguem este valor, inclusive se a tela mudar depois de a ligação abrir.
let semitonsDaTela = 0;
const ouvintesDaTela = new Set();

/** A tela de voz diz quanto afinar a voz ao vivo do personagem (0 = sem afinar). Vale para os tocadores abertos e os próximos. */
export function definirSemitonsDaVoz(n) {
  semitonsDaTela = normalizarSemitons(n);
  for (const f of [...ouvintesDaTela]) f(semitonsDaTela);
}
export const semitonsDaVoz = () => semitonsDaTela;
/** Segue as mudanças de definirSemitonsDaVoz; devolve a função que para de seguir. */
export function seguirSemitonsDaVoz(f) {
  ouvintesDaTela.add(f);
  return () => ouvintesDaTela.delete(f);
}

/** Afina um áudio inteiro de uma vez (scripts e testes): mesma conta do streaming, já com o fim solto. */
export function afinarTudo(amostras, { semitons = 0, taxa = 24000 } = {}) {
  const a = new AfinadorStream({ semitons, taxa });
  if (!a.ativo) return amostras;
  const corpo = a.processar(amostras);
  const fim = a.finalizar();
  const out = new Float32Array(corpo.length + fim.length);
  out.set(corpo);
  out.set(fim, corpo.length);
  return out;
}
