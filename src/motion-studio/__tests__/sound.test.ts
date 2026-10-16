import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { ALIAS_LEGADO } from '../sound';
import { resolve } from 'node:path';
import { buildCueSchedule, createSoundEngine, MUTE_KEY, type AudioContextLike } from '../sound/soundEngine';
import { DEMO_WEEK } from '../demoData';
import cues from '../sound/cues.json';
import { T, TOTAL_MS } from '../timeline';

function fakeContext(state = 'suspended') {
  const started: { buffer: unknown; gain: number }[] = [];
  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    close: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async (b: ArrayBuffer) => ({ len: b.byteLength })),
    createGain: () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }),
    createBufferSource() {
      let rec: { buffer: unknown; gain: number } | null = null;
      const src = {
        buffer: null as unknown,
        connect() {},
        start() {
          rec = { buffer: src.buffer, gain: 1 };
          started.push(rec);
        },
        stop() {},
        onended: null as null | (() => void),
      };
      return src;
    },
  } as unknown as AudioContextLike & { resume: ReturnType<typeof vi.fn> };
  return { ctx, started };
}
const fetchOk = async () => ({ arrayBuffer: async () => new ArrayBuffer(8) });

describe('motor de som', () => {
  beforeEach(() => localStorage.clear());

  it('nao toca antes do gesto (unlock) e toca depois', async () => {
    const { ctx, started } = fakeContext();
    const e = createSoundEngine({ urls: { pop: 'pop.wav' }, createContext: () => ctx, fetchImpl: fetchOk });
    expect(e.play('pop')).toBe(false);
    expect(started).toHaveLength(0);
    expect(await e.unlock()).toBe(true);
    expect(e.play('pop')).toBe(true);
    expect(started).toHaveLength(1);
  });
  it('mudo persiste e silencia', async () => {
    const { ctx, started } = fakeContext();
    const e = createSoundEngine({ urls: { pop: 'p' }, createContext: () => ctx, fetchImpl: fetchOk });
    await e.unlock();
    e.setMuted(true);
    expect(localStorage.getItem(MUTE_KEY)).toBe('1');
    expect(e.play('pop')).toBe(false);
    expect(started).toHaveLength(0);
    const e2 = createSoundEngine({ urls: { pop: 'p' }, createContext: () => fakeContext().ctx, fetchImpl: fetchOk });
    expect(e2.isMuted()).toBe(true);
    expect(await e2.unlock()).toBe(false);
  });
  it('volume padrao e baixo', async () => {
    const { ctx } = fakeContext();
    let master = 0;
    const orig = ctx.createGain.bind(ctx);
    let n = 0;
    ctx.createGain = () => {
      const g = orig();
      if (n++ === 0) Object.defineProperty(g.gain, 'value', { set: (v) => (master = v), get: () => master });
      return g;
    };
    const e = createSoundEngine({ urls: {}, createContext: () => ctx, fetchImpl: fetchOk });
    await e.unlock();
    expect(master).toBeLessThanOrEqual(0.4);
  });
  it('cue sem arquivo carregado nao toca e nao quebra', async () => {
    const { ctx } = fakeContext();
    const e = createSoundEngine({ urls: { a: 'a' }, createContext: () => ctx, fetchImpl: async () => { throw new Error('404'); } });
    await e.unlock();
    expect(e.play('a')).toBe(false);
  });
});

describe('agenda de sons (cues.json)', () => {
  it('um tique por dia aceso (exceto hoje), em cascata, antes do marcador de hoje', () => {
    const s = buildCueSchedule(DEMO_WEEK);
    const ticks = s.filter((c) => c.cue.startsWith('tick-'));
    expect(ticks).toHaveLength(4);
    expect(ticks.map((t) => t.cue)).toEqual(['tick-1', 'tick-2', 'tick-3', 'tick-4']);
    expect(ticks[1].at - ticks[0].at).toBe(55);
    expect(s.find((c) => c.cue === 'marker-pop')!.at).toBeGreaterThan(ticks[3].at);
  });
  it('sem dia estudado nao ha tiques', () => {
    expect(buildCueSchedule(DEMO_WEEK.map((d) => ({ ...d, done: false })) ).filter((c) => c.cue.startsWith('tick-'))).toHaveLength(0);
  });
  it('instantes de som casam com o roteiro visual', () => {
    const at = (c: string) => cues.static.find((x) => x.cue === c)!.at;
    expect(Math.abs(at('boom') - (T.burst - 10))).toBeLessThanOrEqual(30);
    expect(Math.abs(at('roll') - T.roll)).toBeLessThanOrEqual(30);
    expect(at('ding')).toBeGreaterThanOrEqual(T.roll);
    expect(at('check')).toBeGreaterThanOrEqual(T.todayCheck[0] - 50);
    expect(Math.max(...cues.static.map((c) => c.at))).toBeLessThan(TOTAL_MS);
  });
  it('no app os WAV antigos nao entram: todo cue antigo agendado toca o arquivo novo equivalente (apelido)', () => {
    const need = [...cues.static.map((c) => c.cue), ...cues.weekTicks.cues, cues.uiTap.cue];
    expect(existsSync(resolve(__dirname, '../sound/legado'))).toBe(false);
    for (const c of need) {
      const novo = ALIAS_LEGADO[c];
      expect(novo, c).toBeTruthy();
      expect(['veo', 'efeitos'].some((d) => existsSync(resolve(__dirname, `../sound/${d}/${novo}.mp3`))), `${c} -> ${novo}`).toBe(true);
    }
  });
});
