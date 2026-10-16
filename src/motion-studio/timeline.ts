import { clamp, easeInOutCubic, easeOutCubic, lerp, seededRandom, spring, springStep, windowProgress } from './physics';
import { elasticPop, organicIdle, softBounce } from './presets';

/** Cores copiadas de src/novo/ds/tokens/colors.css (um teste confere que continuam iguais). */
/** Copia dos tokens do design system do app (src/novo/ds/tokens/colors.css; "teal-*" virou azul em 9996162d). */
export const TOKENS = {
  navy950: '#08122B',
  navy900: '#0D1C42',
  navy700: '#1A346E',
  teal50: '#EBF5FF',
  teal200: '#B3DCFF',
  teal300: '#7AC2FF',
  teal400: '#3DA5FF',
  teal500: '#1B8CF0',
  teal600: '#0F7DE4',
  teal700: '#0A6FD8',
  teal800: '#0B5FC4',
  gray: '#8693A8',
} as const;

/** Paleta da NOVA logo (public/brand): azul vivo + azul-marinho; laranja = acento do pelo da lontra. */
export const BRAND = {
  blue: '#008FFE',
  blue600: '#0B63D6',
  blue800: '#0847A8',
  blue100: '#CFE8FF',
  blue300: '#6CC1FF',
  navy: '#06244E',
  orange: '#FF9A3D',
  gold: '#F5C451',
} as const;

/**
 * Roteiro (ms). Ritmo calibrado pela analise de um video de referencia (so principios de tempo):
 * ~6,7 s no total, flood de cor em ~3 quadros, rolagem do numero em ~4 quadros, cascata da semana.
 */
export const T = {
  morphStart: 300,
  faceOpen: 780,
  /** a lontra surge dentro do disco */
  mascotIn: [640, 800],
  /** troca de pose: antecipacao (agachar), pouso, pose final */
  toCrouch: 1230,
  land: 2660,
  toProud: 2790,
  numberOut: [1000, 1300],
  contract: [1200, 1560],
  ringHold: [1560, 1990],
  floodLight: [1820, 1900],
  flood: [1840, 1960],
  burst: 2000,
  settle: [2700, 3100],
  numberIn: [2750, 3050],
  roll: 3300,
  sparkle: [3950, 4400],
  shift: [4200, 4800],
  label: [4300, 4700],
  weekStart: 5000,
  weekStep: 55,
  todayStretch: [5400, 5600],
  todayLand: [5600, 5780],
  todayCheck: [5780, 5960],
  confetti: 5650,
  buttons: [6000, 6080],
  ready: 6400,
  total: 6800,
} as const;

export const TOTAL_MS = T.total;

/** Geometria do disco-emblema e do pulo (px). */
export const CIRCLE = { symbolR: 36, discR: 86, /** escala da lontra dentro do disco */ scale: 0.6 } as const;
export const JUMP = { /** altura do pulo */ height: 70, /** instante do apice (s apos o climax) */ apex: 0.33 } as const;

/** Compatibilidade: fases nomeadas (inicio/fim) para rotulos e testes. */
export const PHASES = {
  neutral: { start: 0, end: 300 },
  transform: { start: 300, end: 1200 },
  anticipation: { start: 1200, end: 1990 },
  burst: { start: 2000, end: 2700 },
  counter: { start: 3300, end: 3500 },
  celebrate: { start: 2700, end: 4300 },
  calendar: { start: 5000, end: 6000 },
  ready: { start: 6400, end: 6800 },
} as const;
export type PhaseName = keyof typeof PHASES;
export function phaseAt(ms: number): PhaseName {
  if (ms >= T.ready) return 'ready';
  if (ms >= T.weekStart) return 'calendar';
  if (ms >= T.settle[0]) return 'celebrate';
  if (ms >= T.burst) return 'burst';
  if (ms >= T.contract[0]) return 'anticipation';
  if (ms >= T.morphStart) return 'transform';
  return 'neutral';
}

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export function mixColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const k = clamp(t);
  const to = (x: number, y: number) => Math.round(lerp(x, y, k)).toString(16).padStart(2, '0');
  return `#${to(ar, br)}${to(ag, bg)}${to(ab, bb)}`.toUpperCase();
}

/** Contraste WCAG entre duas cores #RRGGBB. */
export function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = hex(h).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/* ---------- dados da semana (controlados pelo app) ---------- */
export interface WeekDay {
  /** Letra curta exibida (D S T Q Q S S). */
  label: string;
  /** Nome para leitor de tela. */
  name: string;
  done: boolean;
  isToday?: boolean;
}

/* ---------- particulas ---------- */
export type ParticleShape = 'dot' | 'star' | 'bar' | 'streak';
export interface ParticleFrame {
  id: string;
  origin: 'mascot' | 'today';
  x: number;
  y: number;
  size: number;
  opacity: number;
  rotate: number;
  /** Alongamento na direcao do movimento (so streak). */
  stretch: number;
  color: string;
  shape: ParticleShape;
}

interface Emitter {
  key: string;
  at: number;
  count: number;
  origin: 'mascot' | 'today';
  speed: [number, number];
  angle: [number, number];
  gravity: number;
  drag: number;
  life: number;
  size: [number, number];
  shapes: ParticleShape[];
  colors: string[];
  spin?: number;
}

const FULL: [number, number] = [0, Math.PI * 2];
const CONFETTI_COLORS = [BRAND.blue300, BRAND.blue100, '#FFFFFF', BRAND.gold, BRAND.orange, BRAND.blue];
const EMITTERS: Emitter[] = [
  { key: 'emerge', at: 790, count: 10, origin: 'mascot', speed: [70, 150], angle: FULL, gravity: 0, drag: 3.2, life: 650, size: [3, 6], shapes: ['dot', 'star'], colors: [BRAND.blue300, '#FFFFFF', BRAND.gold, BRAND.orange] },
  { key: 'streaks', at: 1560, count: 14, origin: 'mascot', speed: [260, 380], angle: FULL, gravity: 0, drag: 2.4, life: 480, size: [4, 7], shapes: ['streak', 'dot'], colors: [BRAND.blue300, BRAND.blue100, '#FFFFFF'] },
  { key: 'burst', at: 2000, count: 36, origin: 'mascot', speed: [260, 560], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 640, drag: 1.4, life: 1300, size: [5, 12], shapes: ['star', 'dot', 'bar', 'streak'], colors: CONFETTI_COLORS, spin: 720 },
  { key: 'debris', at: 2080, count: 18, origin: 'mascot', speed: [50, 200], angle: [-Math.PI * 0.8, -Math.PI * 0.2], gravity: 300, drag: 0.8, life: 1500, size: [3, 7], shapes: ['dot', 'bar'], colors: CONFETTI_COLORS, spin: 360 },
  { key: 'confetti', at: 5650, count: 12, origin: 'today', speed: [120, 280], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 520, drag: 1.6, life: 850, size: [4, 8], shapes: ['bar', 'dot', 'star'], colors: CONFETTI_COLORS, spin: 540 },
];

function emitterSeeds(e: Emitter, idx: number) {
  const rnd = seededRandom(9000 + idx * 131);
  return Array.from({ length: e.count }, (_, i) => ({
    angle: lerp(e.angle[0], e.angle[1], rnd()),
    speed: lerp(e.speed[0], e.speed[1], rnd()),
    size: lerp(e.size[0], e.size[1], rnd()),
    spin: (rnd() - 0.5) * 2 * (e.spin ?? 0),
    delay: rnd() * 110,
    color: e.colors[(i + Math.floor(rnd() * 3)) % e.colors.length],
    shape: e.shapes[i % e.shapes.length],
  }));
}
const SEEDS = EMITTERS.map(emitterSeeds);
export const MAX_PARTICLES = EMITTERS.reduce((s, e) => s + e.count, 0);

function particlesAt(ms: number, intensity: number): ParticleFrame[] {
  const out: ParticleFrame[] = [];
  EMITTERS.forEach((e, ei) => {
    if (ms < e.at || ms > e.at + e.life + 150) return;
    const keep = Math.max(4, Math.round(e.count * (0.35 + 0.65 * intensity)));
    SEEDS[ei].slice(0, keep).forEach((p, i) => {
      const local = ms - e.at - p.delay;
      if (local < 0) return;
      const s = local / 1000;
      const sp = p.speed * (0.6 + 0.4 * intensity);
      const k = (1 - Math.exp(-e.drag * s)) / e.drag;
      const vx = Math.cos(p.angle) * sp;
      const vy = Math.sin(p.angle) * sp;
      const x = vx * k;
      const y = vy * k + 0.5 * e.gravity * s * s;
      const speedNow = Math.hypot(vx * Math.exp(-e.drag * s), vy * Math.exp(-e.drag * s) + e.gravity * s);
      const fade = 1 - windowProgress(local, e.life * 0.55, e.life);
      const dirY = vy * Math.exp(-e.drag * s) + e.gravity * s;
      const dirX = vx * Math.exp(-e.drag * s);
      out.push({
        id: `${e.key}${i}`,
        origin: e.origin,
        x,
        y,
        size: p.size,
        opacity: clamp(fade),
        rotate: p.shape === 'streak' ? (Math.atan2(dirY, dirX) * 180) / Math.PI : p.spin * s,
        stretch: p.shape === 'streak' ? clamp(speedNow / 260, 0.5, 3.4) : 1,
        color: p.color,
        shape: p.shape,
      });
    });
  });
  return out;
}

/* ---------- quadro ---------- */
/** Poses (sprites) do mascote usadas pela celebracao. Veja src/motion-studio/mascot. */
export type CelebrationPose = 'base' | 'agachar' | 'comemorando' | 'pouso' | 'orgulhosa';
export const CELEBRATION_POSES: readonly CelebrationPose[] = ['base', 'agachar', 'comemorando', 'pouso', 'orgulhosa'];

export interface MarkerFrame {
  /** 0..1+ (com overshoot) escala de entrada. */
  scale: number;
  opacity: number;
  /** 0..1 preenchimento aceso. */
  lit: number;
  /** Marcador de hoje: alongamento (sx, sy) do blob branco. */
  blobSx: number;
  blobSy: number;
  blob: number;
  /** 0..1 traco do check. */
  check: number;
}

export interface Frame {
  ms: number;
  phase: PhaseName;
  /** Pose dominante (rotulo/teste/atributo de dados). */
  pose: CelebrationPose;
  /** Peso (opacidade) de cada sprite: troca de pose com fusao curta de ~70 ms. */
  poseWeights: Record<CelebrationPose, number>;
  /** Disco-simbolo: 0 = simbolo neutro pequeno ... 1 = disco do emblema (passa de 1 no elastico). */
  shape: number;
  /** Cor do disco: 0 cinza ... 1 azul claro da marca. */
  morph: number;
  disc: { radius: number; opacity: number };
  /** Opacidade do simbolo neutro (S da marca) no centro do disco. */
  symbol: number;
  /** Lontra: escala relativa ao tamanho em pe (1), squash/stretch, y = deslocamento do pulo (px, negativo = sobe), footY = chao do pe no palco (px a partir do centro). */
  mascot: { scale: number; sx: number; sy: number; y: number; rotate: number; footY: number; opacity: number };
  /** Sombra de contato no chao. */
  shadow: { opacity: number; scale: number };
  ring: { opacity: number; progress: number; rotate: number; radius: number };
  shockwave: { radius: number; opacity: number; width: number };
  sparkle: number;
  flood: { dark: number; light: number; cx: number; cy: number };
  glow: number;
  ink: string;
  numberColor: string;
  /** Numero mostrado (logico): sempre previousStreak ou newStreak. */
  displayedStreak: number;
  number: { opacity: number; roll: number; pop: number };
  label: { opacity: number; y: number };
  stageShift: number;
  week: { opacity: number; marker: (i: number) => MarkerFrame; letterOpacity: (i: number) => number };
  particles: ParticleFrame[];
  buttons: { share: { opacity: number; y: number }; cont: { opacity: number; y: number } };
  buttonsEnabled: boolean;
  caption: 'before' | 'after';
  finished: boolean;
}

export interface TimelineInput {
  previousStreak: number;
  newStreak: number;
  week: readonly WeekDay[];
  intensity?: number;
}

/** Posicao do centro do mascote na cena (px), usada pelo flood radial. */
export const LAYOUT = { headerH: 56, mascotCy: 140, shift0: 56, /** altura da lontra em pe (px CSS) */ standH: 230, /** chao dos pes a partir do centro do palco */ ground: 118 };

export function frameAt(msRaw: number, input: TimelineInput): Frame {
  const ms = clamp(msRaw, 0, T.total);
  const I = clamp(input.intensity ?? 1, 0.2, 1);
  const { previousStreak, newStreak, week } = input;

  /* --- disco-simbolo: forma elastica (neutro -> emblema), cor e simbolo --- */
  const shapeRaw = ms < T.morphStart ? 0 : spring(ms - T.morphStart, 0, 1, { omega: 17, zeta: 0.36 });
  const shape = clamp(shapeRaw, -0.15, 1 + 0.3 * I);
  const morph = easeInOutCubic(windowProgress(ms, 380, 880));
  const symbol = 1 - easeInOutCubic(windowProgress(ms, 420, 800));
  const discOut = ms >= T.burst ? 1 - windowProgress(ms, T.burst, T.burst + 120) : 1;
  const disc = { radius: Math.max(24, lerp(CIRCLE.symbolR, CIRCLE.discR, shape)), opacity: discOut };

  /* --- lontra: poses (sprites) + movimento --- */
  const appear = easeOutCubic(windowProgress(ms, T.mascotIn[0], T.mascotIn[1]));
  const kCrouch = windowProgress(ms, T.toCrouch, T.toCrouch + 70);
  const kCelebrate = windowProgress(ms, T.burst - 10, T.burst + 30);
  const kLand = windowProgress(ms, T.land, T.land + 40);
  const kProud = windowProgress(ms, T.toProud, T.toProud + 90);
  const poseWeights: Record<CelebrationPose, number> = {
    base: appear * (1 - kCrouch),
    agachar: kCrouch * (1 - kCelebrate),
    comemorando: kCelebrate * (1 - kLand),
    pouso: kLand * (1 - kProud),
    orgulhosa: kProud,
  };
  const pose: CelebrationPose = ms < T.toCrouch ? 'base' : ms < T.burst ? 'agachar' : ms < T.land ? 'comemorando' : ms < T.toProud ? 'pouso' : 'orgulhosa';

  let scale = 1;
  let sx = 1;
  let sy = 1;
  let y = 0;
  let rotate = 0;
  if (ms < T.mascotIn[0]) {
    scale = 0;
  } else if (ms < T.contract[0]) {
    // surge pequena no disco com pop elastico (overshoot)
    const pop = spring(ms - T.mascotIn[0], 0, 1, { omega: 19, zeta: 0.42 });
    scale = CIRCLE.scale * lerp(1, clamp(pop, 0, 1.3), I);
    const o = organicIdle(ms, 0.8);
    sx = o.sx;
    sy = o.sy;
    y = o.y * 0.5;
    rotate = o.rotate;
  } else if (ms < T.burst) {
    // contracao: agacha (squash) e encolhe dentro do anel; leve pulsar do anel
    const a = windowProgress(ms, T.contract[0], T.contract[1]);
    const windUp = a < 0.22 ? Math.sin((a / 0.22) * (Math.PI / 2)) * 0.07 : 0.07 * (1 - windowProgress(a, 0.22, 0.45));
    const shrink = easeInOutCubic(windowProgress(a, 0.18, 1));
    scale = CIRCLE.scale * (1 + windUp * I) * lerp(1, 0.58, shrink);
    const squash = Math.sin(shrink * Math.PI) * 0.1 * I + shrink * 0.04;
    sx = 1 + squash * 0.8;
    sy = 1 - squash;
    if (ms >= T.ringHold[0]) {
      const beat = Math.sin(((ms - T.ringHold[0]) / 1000) * Math.PI * 7) * 0.03 * I;
      scale *= 1 + beat;
      sy *= 1 - beat * 0.8;
    }
  } else {
    const t = ms - T.burst;
    // pop do climax: escala elastica ate 1 com overshoot; pulo em parabola com stretch; pouso com squash
    const big = spring(t, CIRCLE.scale * 0.58, 1, { omega: 21, zeta: 0.42 });
    const settleK = easeInOutCubic(windowProgress(ms, T.settle[0], T.settle[1]));
    scale = lerp(1, big, I) * (1 - 0.14 * settleK);
    const hj = JUMP.height * (0.45 + 0.55 * I);
    const u = clamp((t / 1000 - JUMP.apex) / JUMP.apex, -1, 1);
    const airborne = ms < T.land;
    y = airborne ? -hj * (1 - u * u) : 0;
    if (airborne) {
      const stretch = 0.12 * I * Math.pow(Math.abs(u), 1.2);
      sy = 1 + stretch;
      sx = 1 - stretch * 0.8;
      rotate = Math.sin(((ms - T.burst) / 1000) * Math.PI * 2.4) * 2.2 * I;
    } else {
      const landK = springStep(Math.max(0, ms - T.land) / 1000, { omega: 24, zeta: 0.38 });
      const sq = 0.17 * I * (1 - clamp(landK, 0, 1.4));
      sy = 1 - sq;
      sx = 1 + sq * 0.8;
      const o = organicIdle(ms, 1);
      sx *= o.sx;
      sy *= o.sy;
      rotate = o.rotate;
    }
    if (ms >= T.roll) {
      const b = softBounce(ms - T.roll, 18 * I);
      sx *= b.sx;
      sy *= b.sy;
      y += b.y * 0.6;
    }
  }
  // Ate o climax o corpo fica CENTRADO no disco; no pulo o apoio passa para o chao.
  const footK = ms < T.burst ? 0 : easeInOutCubic(windowProgress(ms, T.burst, T.burst + 90));
  const footY = lerp((LAYOUT.standH * scale) / 2, LAYOUT.ground, footK);
  const mascot = { scale, sx, sy, y, rotate, footY, opacity: 1 };
  const shadowH = Math.max(0, -y);
  const shadow = {
    opacity: ms < T.burst ? 0 : windowProgress(ms, T.burst, T.burst + 120) * 0.24 * (1 - clamp(shadowH / (JUMP.height * 1.6))),
    scale: scale * (1 - 0.3 * clamp(shadowH / JUMP.height)) * (ms >= T.land ? 1 + (1 - sy) * 0.8 : 1),
  };

  /* --- anel de energia + disco (mascote em circulo) --- */
  const ringIn = windowProgress(ms, T.contract[0] + 80, T.contract[1] + 60);
  const ringOut = discOut;
  const ring = {
    opacity: ringIn * ringOut,
    progress: ringIn,
    rotate: ((ms - T.contract[0]) / 1000) * 220,
    radius: 86,
  };

  /* --- onda de choque --- */
  const swT = windowProgress(ms, T.burst, T.burst + 650);
  const shockwave = { radius: easeOutCubic(swT) * 300 * (0.6 + 0.4 * I), opacity: ms >= T.burst && swT < 1 ? (1 - swT) * 0.9 * I : 0, width: lerp(14, 2, swT) };

  /* --- flood radial: claro e depois escuro --- */
  const floodDark = easeInOutCubic(windowProgress(ms, T.flood[0], T.flood[1]));
  const floodLight = easeInOutCubic(windowProgress(ms, T.floodLight[0], T.floodLight[1]));
  const cy = LAYOUT.headerH + LAYOUT.mascotCy + LAYOUT.shift0;
  const glow = ms >= T.burst ? lerp(0.9, 0.4, windowProgress(ms, T.burst, T.burst + 900)) * (1 + 0.15 * Math.sin(ms / 400)) : 0;
  const ink = floodDark > 0.5 ? '#FFFFFF' : mixColor('#4B5870', '#FFFFFF', windowProgress(floodDark, 0.15, 0.5));
  const numberColor = ms < T.flood[0] ? TOKENS.gray : '#FFFFFF';

  /* --- numero --- */
  const numOut = 1 - windowProgress(ms, T.numberOut[0], T.numberOut[1]);
  const numIn = windowProgress(ms, T.numberIn[0], T.numberIn[1]);
  const numOpacity = ms < T.numberOut[0] ? 1 : ms < T.numberIn[0] ? numOut : numIn;
  const rollRaw = ms < T.roll ? 0 : spring(ms - T.roll, 0, 1, { omega: 30, zeta: 0.5 });
  const roll = clamp(rollRaw, 0, 1 + 0.12 * I);
  const rt = Math.max(0, (ms - T.roll) / 1000);
  const pop = ms < T.roll ? 1 : 1 + 0.26 * I * Math.exp(-7 * rt) * Math.sin(22 * rt);
  const displayedStreak = ms >= T.roll + 60 ? newStreak : previousStreak;

  /* --- rotulo e deslocamento do palco --- */
  const labelP = easeOutCubic(windowProgress(ms, T.label[0], T.label[1]));
  const shiftP = springStep(Math.max(0, ms - T.shift[0]) / 1000, { omega: 11, zeta: 0.85 });
  const stageShift = ms < T.shift[0] ? LAYOUT.shift0 : LAYOUT.shift0 * (1 - clamp(shiftP, 0, 1.05));

  /* --- sparkle (brilho de orgulho) --- */
  const sparkle = ms < T.sparkle[0] ? 0 : Math.sin(windowProgress(ms, T.sparkle[0], T.sparkle[1]) * Math.PI);

  /* --- semana --- */
  const todayIdx = week.findIndex((d) => d.isToday);
  const marker = (i: number): MarkerFrame => {
    const d = week[i];
    const start = T.weekStart + i * T.weekStep;
    const sc = ms < start ? 0 : spring(ms - start, 0, 1, { omega: 24, zeta: 0.5 });
    const lit = d?.done && i !== todayIdx ? easeOutCubic(windowProgress(ms, start + 60, start + 240)) : 0;
    const base: MarkerFrame = { scale: clamp(sc, 0, 1.25), opacity: clamp(sc * 3), lit, blobSx: 1, blobSy: 1, blob: 0, check: 0 };
    if (i === todayIdx && d?.done) {
      const stretch = windowProgress(ms, T.todayStretch[0], T.todayStretch[1]);
      const land = springStep(Math.max(0, ms - T.todayLand[0]) / 1000, { omega: 26, zeta: 0.42 });
      base.blob = ms < T.todayStretch[0] ? 0 : 1;
      if (ms >= T.todayStretch[0] && ms < T.todayLand[0]) {
        base.blobSx = lerp(0.4, 2.0, easeOutCubic(stretch));
        base.blobSy = lerp(0.4, 0.55, easeOutCubic(stretch));
      } else if (ms >= T.todayLand[0]) {
        base.blobSx = lerp(2.0, 1, clamp(land, 0, 1.2));
        base.blobSy = lerp(0.55, 1, clamp(land, 0, 1.3));
      }
      base.lit = windowProgress(ms, T.todayLand[0], T.todayLand[0] + 120);
      base.check = easeOutCubic(windowProgress(ms, T.todayCheck[0], T.todayCheck[1]));
    }
    return base;
  };

  /* --- botoes --- */
  const bt = (start: number) => {
    const k = spring(Math.max(0, ms - start), 0, 1, { omega: 18, zeta: 0.8 });
    return { opacity: clamp(windowProgress(ms, start, start + 220)), y: (1 - clamp(k, 0, 1.1)) * 22 };
  };

  return {
    ms,
    phase: phaseAt(ms),
    pose,
    poseWeights,
    shape,
    morph,
    disc,
    symbol,
    mascot,
    shadow,
    ring,
    shockwave,
    sparkle,
    flood: { dark: floodDark, light: floodLight, cx: 50, cy },
    glow,
    ink,
    numberColor,
    displayedStreak,
    number: { opacity: numOpacity, roll, pop },
    label: { opacity: labelP, y: (1 - labelP) * 10 },
    stageShift,
    week: { opacity: windowProgress(ms, T.weekStart - 20, T.weekStart + 120), marker, letterOpacity: (i) => clamp((ms - (T.weekStart + i * T.weekStep)) / 160) },
    particles: particlesAt(ms, I),
    buttons: { share: bt(T.buttons[0]), cont: bt(T.buttons[1]) },
    buttonsEnabled: ms >= T.buttons[0] + 120,
    caption: ms >= T.roll ? 'after' : 'before',
    finished: ms >= T.total,
  };
}
