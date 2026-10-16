import type { PoseName } from '../mascot/StaziMascote';
import { clamp, easeInOutCubic, easeOutCubic, lerp, seededRandom, spring, springStep, windowProgress } from '../physics';
import { organicIdle, softBounce } from '../presets';
import type { CoreografiaId, EfeitoId, Intensidade, Momento } from './tipos';

/** Duracao ate o estado final (ms). Micro e pequena fecham sozinhas; media ou mais ficam ate o aluno continuar. */
export const DURACAO: Record<Intensidade, number> = { micro: 2400, pequena: 3400, media: 4800, grande: 7200, epica: 9000 };

export interface Tempos {
  entrada: number;
  antecipacao: number;
  climax: number;
  pouso: number;
  numero: number;
  titulo: number;
  frase: number;
  botoes: number;
  fim: number;
}
/** Instantes (ms) de cada momento por intensidade; o som do catalogo se prende a eles. */
export const TEMPOS: Record<Intensidade, Tempos> = {
  micro: { entrada: 0, antecipacao: 0, climax: 160, pouso: 520, numero: 220, titulo: 120, frase: 200, botoes: Infinity, fim: DURACAO.micro },
  pequena: { entrada: 0, antecipacao: 260, climax: 560, pouso: 1080, numero: 900, titulo: 420, frase: 800, botoes: Infinity, fim: DURACAO.pequena },
  media: { entrada: 0, antecipacao: 520, climax: 900, pouso: 1550, numero: 1900, titulo: 700, frase: 2300, botoes: 3300, fim: DURACAO.media },
  grande: { entrada: 0, antecipacao: 1000, climax: 1500, pouso: 2250, numero: 2800, titulo: 1100, frase: 3700, botoes: 4900, fim: DURACAO.grande },
  epica: { entrada: 0, antecipacao: 1200, climax: 1900, pouso: 2800, numero: 3500, titulo: 1400, frase: 4800, botoes: 6300, fim: DURACAO.epica },
};
export const momentoMs = (i: Intensidade, m: Momento): number => (m === 'botoes' && !Number.isFinite(TEMPOS[i].botoes) ? TEMPOS[i].frase : TEMPOS[i][m]);

/** Como cada coreografia se move: tudo contido e seco (sem saltos); entrada de camera, hold, impacto, aceno de cabeca. */
interface Cfg {
  entrada: 'camera' | 'deslizar-x' | 'deslizar-y';
  /** Aceno de cabeca (graus) no climax. */
  nod: number;
  /** Tremor seco (px) no climax, decai em ~300 ms. */
  shake: number;
  /** Soco de escala no climax (fracao). */
  punch: number;
  /** Empurrao lento (fracao de escala) do pouso ate o fim. */
  push: number;
  /** Balanco lento (graus) e respiracao. */
  balanco: number;
  respira: number;
  /** Dormindo ate o climax. */
  dorme: boolean;
  /** Recuo de susto antes do climax. */
  recuo: boolean;
}
const CFG: Record<CoreografiaId, Cfg> = {
  toque: { entrada: 'deslizar-y', nod: 1.4, shake: 0, punch: 0.03, push: 0, balanco: 0.6, respira: 0.8, dorme: false, recuo: false },
  impacto: { entrada: 'camera', nod: 2.2, shake: 4, punch: 0.06, push: 0.035, balanco: 0.5, respira: 0.8, dorme: false, recuo: false },
  cumprimento: { entrada: 'deslizar-x', nod: 3.4, shake: 0, punch: 0.02, push: 0.02, balanco: 0.5, respira: 0.8, dorme: false, recuo: false },
  pensar: { entrada: 'camera', nod: 0, shake: 0, punch: 0.015, push: 0.015, balanco: 2.2, respira: 1.4, dorme: false, recuo: false },
  encorajar: { entrada: 'deslizar-y', nod: 1.6, shake: 0, punch: 0.015, push: 0.01, balanco: 0.6, respira: 1.8, dorme: false, recuo: false },
  despertar: { entrada: 'camera', nod: 2.6, shake: 1.6, punch: 0.04, push: 0.02, balanco: 0.5, respira: 2.2, dorme: true, recuo: false },
  espanto: { entrada: 'camera', nod: 1.2, shake: 5, punch: 0.04, push: 0.025, balanco: 0.4, respira: 0.8, dorme: false, recuo: true },
};

export interface SpecCoreografia {
  coreografia: CoreografiaId;
  poses: { inicio: PoseName; climax: PoseName; final: PoseName };
  intensidade: Intensidade;
  /** 0,2..1: menos tremor e menos soco para quem celebra com frequencia. */
  fator?: number;
}

export interface MascoteFrame {
  scale: number;
  sx: number;
  sy: number;
  x: number;
  y: number;
  rotate: number;
  opacity: number;
}

export interface FrameMascote {
  mascote: MascoteFrame;
  poseWeights: Partial<Record<PoseName, number>>;
  pose: PoseName;
  sombra: { opacity: number; scale: number };
  /** 0..1: pico do brilho/flash no climax. */
  flash: number;
}

const CF = 90; // fusao entre poses (ms): troca mais seca e cinematografica
const easeOutQuint = (x: number) => 1 - Math.pow(1 - clamp(x), 5);

function pesosDePoses(ms: number, seq: { pose: PoseName; at: number }[]): { w: Partial<Record<PoseName, number>>; dom: PoseName } {
  const w: Partial<Record<PoseName, number>> = {};
  let dom = seq[0].pose;
  seq.forEach((s, k) => {
    const entra = k === 0 ? 1 : windowProgress(ms, s.at, s.at + CF);
    const sai = k < seq.length - 1 ? 1 - windowProgress(ms, seq[k + 1].at, seq[k + 1].at + CF) : 1;
    const v = entra * sai;
    if (v > 0) w[s.pose] = (w[s.pose] ?? 0) + v;
    if (ms >= s.at) dom = s.pose;
  });
  return { w, dom };
}

export function frameMascote(ms: number, spec: SpecCoreografia): FrameMascote {
  const T = TEMPOS[spec.intensidade];
  const c = CFG[spec.coreografia];
  const I = clamp(spec.fator ?? 1, 0.2, 1);
  const { inicio, climax, final } = spec.poses;
  const t0 = spec.intensidade === 'epica' ? 350 : spec.intensidade === 'grande' ? 200 : 40;

  /* poses: inicio -> climax (no ataque) -> final */
  const seq: { pose: PoseName; at: number }[] = [{ pose: inicio, at: 0 }, { pose: climax, at: T.climax - 20 }, { pose: final, at: T.pouso }];
  const dedup = seq.filter((p, i) => i === 0 || p.pose !== seq[i - 1].pose);
  const { w, dom } = pesosDePoses(ms, dedup);

  /* entrada */
  const te = Math.max(0, ms - t0);
  let scale = 1;
  let x = 0;
  let y = 0;
  let opacity = 1;
  if (c.entrada === 'camera') {
    const k = easeOutQuint(te / 800);
    scale = ms < t0 ? 0.001 : 0.9 + 0.1 * k;
    y = (1 - k) * 14;
    opacity = ms < t0 ? 0 : clamp(te / 260);
  } else if (c.entrada === 'deslizar-x') {
    const k = easeOutQuint(te / 700);
    x = (1 - k) * -90;
    opacity = ms < t0 ? 0 : clamp(te / 220);
  } else {
    const k = easeOutQuint(te / 650);
    y = (1 - k) * 34;
    opacity = ms < t0 ? 0 : clamp(te / 300);
  }
  let sx = 1;
  let sy = 1;
  let rotate = 0;

  /* respiracao e balanco lentos (periodo fixo) */
  const idle = organicIdle(ms, 0.7 * c.respira);
  sx *= idle.sx;
  sy *= idle.sy;
  y += idle.y * 0.5;
  rotate += idle.rotate * c.balanco * 0.7;

  /* dormindo: respiracao lenta; espreguica antes de acordar */
  if (c.dorme && ms < T.climax) {
    const s = ms / 1000;
    sy *= 1 + Math.sin(s * 2 * Math.PI * 0.32) * 0.014;
    rotate += Math.sin(s * 2 * Math.PI * 0.16) * 1.2;
    if (ms > T.antecipacao) x += Math.sin((ms - T.antecipacao) * 0.04) * c.shake * (1 - windowProgress(ms, T.antecipacao, T.climax));
  }
  /* recuo de susto */
  if (c.recuo && ms < T.climax && ms > t0) {
    const r = Math.exp(-(ms - t0) / 240);
    scale *= 1 + 0.07 * r * I;
    x += Math.sin(ms * 0.05) * c.shake * r * I;
  }

  /* impacto no climax: soco de escala, tremor seco e aceno de cabeca (sem pulo) */
  if (ms >= T.climax) {
    const dt = ms - T.climax;
    scale *= 1 + c.punch * I * Math.exp(-dt / 230);
    x += Math.sin(dt * 0.09) * c.shake * I * Math.exp(-dt / 130);
    if (dt < 420) rotate += c.nod * Math.sin((dt / 420) * Math.PI) * (0.5 + 0.5 * I);
    const sq = 0.012 * I * Math.exp(-dt / 160);
    sy *= 1 - sq;
    sx *= 1 + sq;
  }
  /* empurrao lento de camera ate o fim (hold com vida) */
  if (c.push > 0) scale *= 1 + c.push * easeInOutCubic(windowProgress(ms, T.pouso, T.fim));

  const flash = ms >= T.climax - 40 ? Math.exp(-(ms - T.climax) / 150) * (ms >= T.climax ? 1 : 0.35) : 0;
  const sombra = { opacity: clamp(opacity) * 0.3 * windowProgress(ms, t0, t0 + 250), scale };
  return { mascote: { scale, sx, sy, x, y, rotate, opacity }, poseWeights: w, pose: dom, sombra, flash };
}

/* ------------------------------------------------------------------ particulas */
export interface ParticulaCz {
  id: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
  rotate: number;
  stretch: number;
  color: string;
  shape: 'dot' | 'streak' | 'glow' | 'ring' | 'flare';
}

interface Emissor {
  key: string;
  at: number;
  count: number;
  speed: [number, number];
  angle: [number, number];
  gravity: number;
  drag: number;
  life: number;
  size: [number, number];
  shapes: ParticulaCz['shape'][];
  /** Deslocamento da origem (px) em relacao ao peito do Stazi. */
  from?: [number, number];
  /** Emite uma unica forma fixa (anel/flare) em vez de particulas com fisica. */
  fixa?: boolean;
}
const TODOS: [number, number] = [0, Math.PI * 2];
const CIMA: [number, number] = [-Math.PI * 0.95, -Math.PI * 0.05];

function emissores(tipo: EfeitoId, T: Tempos): Emissor[] {
  const anel = (key: string, at: number, life = 800): Emissor => ({ key, at, count: 1, speed: [0, 0], angle: [0, 0], gravity: 0, drag: 0, life, size: [260, 260], shapes: ['ring'], fixa: true });
  const flare: Emissor = { key: 'flare', at: T.climax, count: 1, speed: [0, 0], angle: [0, 0], gravity: 0, drag: 0, life: 420, size: [300, 300], shapes: ['flare'], fixa: true };
  switch (tipo) {
    case 'faiscas':
      return [
        anel('onda', T.climax, 700),
        { key: 'faisca', at: T.climax, count: 26, speed: [240, 520], angle: CIMA, gravity: 520, drag: 1.7, life: 1000, size: [3, 6], shapes: ['streak', 'dot'] },
        { key: 'faisca2', at: T.climax + 90, count: 12, speed: [80, 220], angle: TODOS, gravity: 200, drag: 2.2, life: 800, size: [2, 4], shapes: ['dot'] },
      ];
    case 'onda':
      return [anel('onda', T.climax, 800), { ...anel('onda2', T.climax + 160, 900), size: [340, 340] }, flare, { key: 'faisca', at: T.climax, count: 12, speed: [200, 420], angle: CIMA, gravity: 500, drag: 1.8, life: 900, size: [3, 5], shapes: ['streak'] }];
    case 'poeira':
      return [{ key: 'poeira', at: Math.max(T.entrada, 150), count: 18, speed: [10, 30], angle: [-Math.PI * 0.85, -Math.PI * 0.15], gravity: -6, drag: 0.3, life: 3600, size: [5, 12], shapes: ['glow'], from: [0, 60] }, anel('onda', T.climax, 900)];
    case 'brasas':
      return [
        { key: 'brasa', at: T.climax - 100, count: 18, speed: [30, 90], angle: [-Math.PI * 0.8, -Math.PI * 0.2], gravity: -60, drag: 0.55, life: 2400, size: [2, 5], shapes: ['dot', 'glow'], from: [0, 80] },
        { key: 'faisca', at: T.climax, count: 14, speed: [200, 420], angle: CIMA, gravity: 480, drag: 1.8, life: 900, size: [3, 5], shapes: ['streak'] },
        anel('onda', T.climax, 800),
      ];
    default:
      return [];
  }
}

export function maxParticulas(tipo: EfeitoId, intensidade: Intensidade): number {
  return emissores(tipo, TEMPOS[intensidade]).reduce((s, e) => s + e.count, 0);
}

export function particulasAt(ms: number, tipo: EfeitoId, densidade: number, intensidade: Intensidade, paleta: readonly string[], fator = 1): ParticulaCz[] {
  const out: ParticulaCz[] = [];
  const T = TEMPOS[intensidade];
  const I = clamp(fator, 0.2, 1);
  emissores(tipo, T).forEach((e, ei) => {
    if (ms < e.at || ms > e.at + e.life + 150) return;
    if (e.fixa) {
      const p = clamp((ms - e.at) / e.life);
      if (e.shapes[0] === 'ring') out.push({ id: e.key, x: 0, y: 0, size: e.size[0] * (0.6 + 0.4 * I) * easeOutCubic(p), opacity: (1 - p) * 0.9 * clamp(densidade + 0.3), rotate: 0, stretch: 1, color: paleta[0], shape: 'ring' });
      else out.push({ id: e.key, x: 0, y: 0, size: e.size[0], opacity: (1 - p) * 0.85, rotate: 0, stretch: 1 + p * 0.4, color: paleta[1] ?? paleta[0], shape: 'flare' });
      return;
    }
    const rnd = seededRandom(7000 + ei * 131 + tipo.length * 17);
    const total = Array.from({ length: e.count }, (_, i) => ({
      angle: lerp(e.angle[0], e.angle[1], rnd()),
      speed: lerp(e.speed[0], e.speed[1], rnd()),
      size: lerp(e.size[0], e.size[1], rnd()),
      delay: rnd() * (e.key === 'poeira' || e.key === 'brasa' ? 1400 : 90),
      color: paleta[(i + Math.floor(rnd() * 3)) % paleta.length],
      shape: e.shapes[i % e.shapes.length],
    }));
    const keep = Math.max(3, Math.round(e.count * clamp(densidade) * (0.35 + 0.65 * I)));
    total.slice(0, keep).forEach((p, i) => {
      const local = ms - e.at - p.delay;
      if (local < 0) return;
      const s = local / 1000;
      const sp = p.speed * (0.6 + 0.4 * I);
      const k = (1 - Math.exp(-e.drag * s)) / e.drag;
      const vx = Math.cos(p.angle) * sp;
      const vy = Math.sin(p.angle) * sp;
      const dx = vx * Math.exp(-e.drag * s);
      const dy = vy * Math.exp(-e.drag * s) + e.gravity * s;
      const fadeIn = e.shapes[0] === 'glow' ? windowProgress(local, 0, 600) : 1;
      out.push({
        id: `${e.key}${i}`,
        x: (e.from?.[0] ?? 0) + vx * k,
        y: (e.from?.[1] ?? 0) + vy * k + 0.5 * e.gravity * s * s,
        size: p.size,
        opacity: clamp((1 - windowProgress(local, e.life * 0.5, e.life)) * fadeIn),
        rotate: p.shape === 'streak' ? (Math.atan2(dy, dx) * 180) / Math.PI : 0,
        stretch: p.shape === 'streak' ? clamp(Math.hypot(dx, dy) / 200, 0.6, 3.4) : 1,
        color: p.color,
        shape: p.shape,
      });
    });
  });
  return out;
}

/* ------------------------------------------------------------------ textos e botoes */
export interface FrameTextos {
  titulo: { opacity: number; y: number };
  numero: { opacity: number; roll: number; pop: number; mostrar: 'antes' | 'depois' };
  frase: { opacity: number; y: number };
  detalhe: { opacity: number };
  botoes: { opacity: number; y: number; ativos: boolean };
  /** 0..1 entrada da cena (fundo/ambiente). */
  cena: number;
  finalizado: boolean;
}

export function frameTextos(ms: number, intensidade: Intensidade, modoNumero: 'rolar' | 'fixo' | 'nenhum', fator = 1): FrameTextos {
  const T = TEMPOS[intensidade];
  const I = clamp(fator, 0.2, 1);
  const ate = (t: number, dur: number) => easeOutCubic(windowProgress(ms, t, t + dur));
  const rollRaw = ms < T.numero ? 0 : spring(ms - T.numero, 0, 1, { omega: 30, zeta: 0.5 });
  const roll = modoNumero === 'rolar' ? clamp(rollRaw, 0, 1 + 0.12 * I) : 1;
  const rt = Math.max(0, (ms - T.numero) / 1000);
  const pop = ms < T.numero ? 1 : 1 + 0.26 * I * Math.exp(-7 * rt) * Math.sin(22 * rt);
  const bt = Math.max(0, ms - T.botoes);
  return {
    titulo: { opacity: ate(T.titulo, 300), y: (1 - ate(T.titulo, 300)) * 12 },
    numero: { opacity: modoNumero === 'nenhum' ? 0 : ate(Math.max(0, T.numero - 220), 220), roll, pop, mostrar: modoNumero === 'rolar' && ms < T.numero + 60 ? 'antes' : 'depois' },
    frase: { opacity: ate(T.frase, 320), y: (1 - ate(T.frase, 320)) * 14 },
    detalhe: { opacity: ate(T.frase + 260, 300) },
    botoes: { opacity: Number.isFinite(T.botoes) ? clamp(bt / 220) : 0, y: Number.isFinite(T.botoes) ? (1 - clamp(spring(bt, 0, 1, { omega: 18, zeta: 0.8 }), 0, 1.1)) * 22 : 22, ativos: Number.isFinite(T.botoes) && ms >= T.botoes + 120 },
    cena: ate(0, intensidade === 'micro' ? 150 : 500),
    finalizado: ms >= T.fim,
  };
}
