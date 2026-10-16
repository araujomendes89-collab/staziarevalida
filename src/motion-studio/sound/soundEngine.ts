import cuesJson from './cues.json';
import type { WeekDay } from '../timeline';

/**
 * Motor de som da celebracao (Web Audio API). Regras:
 *  - nada toca antes de um gesto do usuario (AudioContext so e criado/retomado apos interacao ou
 *    quando o navegador ja registrou ativacao do usuario na pagina);
 *  - volume baixo por padrao (0.35) e mudo persistente (localStorage, com try/catch);
 *  - nao toca com prefers-reduced-motion nem quando mudo (o componente nem cria o motor);
 *  - cues atrasados (apos pular ou travar) sao descartados, nunca tocam fora de hora.
 * Os sons sao WAV sintetizados por scripts/synth-sounds.py da skill stazia-motion-studio.
 */
export interface SoundCue {
  cue: string;
  at: number;
  gain: number;
}

/** Agenda de sons: cues fixos + um tique por marcador aceso (a quantidade vem dos dados da semana). */
export function buildCueSchedule(week: readonly WeekDay[]): SoundCue[] {
  const list: SoundCue[] = cuesJson.static.map((c) => ({ ...c }));
  const wt = cuesJson.weekTicks;
  let n = 0;
  week.forEach((d, i) => {
    if (d.done && !d.isToday) {
      list.push({ cue: wt.cues[Math.min(n, wt.cues.length - 1)], at: wt.start + i * wt.step, gain: wt.gain });
      n += 1;
    }
  });
  return list.sort((a, b) => a.at - b.at);
}

export const UI_TAP = cuesJson.uiTap;

export interface SoundEngineOptions {
  urls: Readonly<Record<string, string>>;
  /** Volume mestre 0..1 (padrao baixo). */
  volume?: number;
  storageKey?: string;
  /** Injecao para testes. */
  createContext?: () => AudioContextLike;
  fetchImpl?: (url: string) => Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
}

/** Subconjunto da AudioContext usado aqui (permite simular em teste). */
export interface AudioContextLike {
  state: string;
  currentTime: number;
  destination: unknown;
  resume(): Promise<void>;
  close?(): Promise<void>;
  decodeAudioData(b: ArrayBuffer): Promise<unknown>;
  createGain(): { gain: { value: number; setValueAtTime(v: number, t: number): void; linearRampToValueAtTime(v: number, t: number): void; cancelScheduledValues?(t: number): void }; connect(n: unknown): void; disconnect?(): void };
  createBufferSource(): { buffer: unknown; connect(n: unknown): void; start(t?: number): void; stop(t?: number): void; onended: null | (() => void) };
}

export interface SoundEngine {
  unlock(): Promise<boolean>;
  /** true se o contexto esta rodando e ha buffers. */
  ready(): boolean;
  play(cue: string, gain?: number): boolean;
  stopAll(): void;
  setMuted(m: boolean): void;
  isMuted(): boolean;
  setVolume(v: number): void;
  dispose(): void;
}

export const DEFAULT_VOLUME = 0.35;
export const MUTE_KEY = 'stazia-motion-muted';

function readMuted(key: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeMuted(key: string, m: boolean) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, m ? '1' : '0');
  } catch {
    /* armazenamento indisponivel: segue sem persistir */
  }
}

export function createSoundEngine(opts: SoundEngineOptions): SoundEngine {
  const key = opts.storageKey ?? MUTE_KEY;
  let muted = readMuted(key);
  let volume = opts.volume ?? DEFAULT_VOLUME;
  let ctx: AudioContextLike | null = null;
  let master: ReturnType<AudioContextLike['createGain']> | null = null;
  const buffers = new Map<string, unknown>();
  const active = new Set<{ src: ReturnType<AudioContextLike['createBufferSource']>; g: ReturnType<AudioContextLike['createGain']> }>();
  let loading: Promise<void> | null = null;

  const make = (): AudioContextLike | null => {
    if (opts.createContext) return opts.createContext();
    const C = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    return C ? (new C() as unknown as AudioContextLike) : null;
  };

  async function load() {
    if (!ctx) return;
    const f = opts.fetchImpl ?? ((u: string) => fetch(u));
    await Promise.all(
      Object.entries(opts.urls).map(async ([name, url]) => {
        try {
          const res = await f(url);
          buffers.set(name, await ctx!.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* cue indisponivel: simplesmente nao toca */
        }
      }),
    );
  }

  return {
    async unlock() {
      if (muted) return false;
      if (!ctx) {
        ctx = make();
        if (!ctx) return false;
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);
      }
      try {
        if (ctx.state !== 'running') await ctx.resume();
      } catch {
        return false;
      }
      if (!loading) loading = load();
      await loading;
      return ctx.state === 'running';
    },
    ready: () => !!ctx && ctx.state === 'running' && buffers.size > 0,
    play(cue, gain = 1) {
      if (muted || !ctx || ctx.state !== 'running' || !master) return false;
      const buf = buffers.get(cue);
      if (!buf) return false;
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = Math.max(0, Math.min(1, gain));
      src.buffer = buf;
      src.connect(g);
      g.connect(master);
      const rec = { src, g };
      active.add(rec);
      src.onended = () => active.delete(rec);
      src.start();
      return true;
    },
    stopAll() {
      if (!ctx) return;
      const t = ctx.currentTime;
      active.forEach(({ src, g }) => {
        try {
          // fade curto (30 ms) para nao estalar
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(0, t + 0.03);
          src.stop(t + 0.04);
        } catch {
          /* ja parou */
        }
      });
      active.clear();
    },
    setMuted(m) {
      muted = m;
      writeMuted(key, m);
      if (m) this.stopAll();
    },
    isMuted: () => muted,
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.value = volume;
    },
    dispose() {
      this.stopAll();
      void ctx?.close?.();
      ctx = null;
      master = null;
      buffers.clear();
    },
  };
}
