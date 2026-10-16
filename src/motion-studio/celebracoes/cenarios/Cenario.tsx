import { useId } from 'react';
import { seededRandom } from '../../physics';
import type { CenarioId } from '../tipos';

export interface CenarioProps {
  id: CenarioId;
  /** Tempo da celebracao (ms): todo movimento do cenario e funcao deste valor. */
  t: number;
  /** 0..1 entrada do ambiente. */
  entrada: number;
  /** 0..1 pulso de luz no climax. */
  brilho?: number;
  /** Variante do cenario (liga: 1 = Bronze ... 7 = Revalida Master). */
  variante?: number;
  /** Instante do climax (ms) para o emblema da liga entrar no tempo certo. */
  tClimax?: number;
}

const W = 390;
const H = 844;
const mod = (a: number, b: number) => ((a % b) + b) % b;
const OURO = '#F5C451';

function estrelas(seed: number, n: number, yMax: number) {
  const r = seededRandom(seed);
  return Array.from({ length: n }, () => ({ x: r() * W, y: r() * yMax, r: 0.5 + r() * 1.1, f: 0.6 + r() * 1.6, p: r() * 6.28 }));
}
const ESTRELAS = estrelas(11, 46, 430);
const POEIRA = (() => { const r = seededRandom(77); return Array.from({ length: 34 }, () => ({ x: r() * W, y: r() * H, r: 0.7 + r() * 1.5, v: 0.004 + r() * 0.01, f: 0.6 + r() * 1.4, p: r() })); })();
const PREDIOS = (() => {
  const r = seededRandom(5);
  let x = -10;
  const out: { x: number; w: number; h: number; j: { x: number; y: number; on: number }[] }[] = [];
  while (x < W + 10) {
    const w = 22 + r() * 34;
    const h = 60 + r() * 190;
    out.push({ x, w, h, j: Array.from({ length: 16 }, () => ({ x: 4 + r() * (w - 11), y: 8 + r() * (h - 22), on: r() })) });
    x += w + 2;
  }
  return out;
})();

function Estrelas({ t, n = 46, o = 1 }: { t: number; n?: number; o?: number }) {
  return (
    <g fill="#fff" opacity={o}>
      {ESTRELAS.slice(0, n).map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={0.25 + 0.6 * (0.5 + 0.5 * Math.sin((t / 1000) * s.f + s.p))} />)}
    </g>
  );
}
/** Poeira de luz flutuando (motes). */
function Poeira({ t, cor = '#FFE9B8', o = 0.5, y0 = 0, y1 = H }: { t: number; cor?: string; o?: number; y0?: number; y1?: number }) {
  return (
    <g fill={cor}>
      {POEIRA.map((p, i) => {
        const py = y1 - mod(p.p * (y1 - y0) + t * p.v, y1 - y0);
        return <circle key={i} cx={p.x + Math.sin(t / 1400 + i) * 6} cy={py} r={p.r} opacity={o * (0.3 + 0.7 * Math.abs(Math.sin(t / 900 * p.f + i)))} />;
      })}
    </g>
  );
}
function Skyline({ t, cor = '#030A1C', base = H, neon = '#008FFE', luzes = true }: { t: number; cor?: string; base?: number; neon?: string; luzes?: boolean }) {
  return (
    <g>
      {PREDIOS.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={base - 70 - b.h} width={b.w} height={b.h + 70} fill={cor} />
          {i % 5 === 2 && <rect x={b.x + b.w - 2} y={base - 70 - b.h} width="1.6" height={b.h * 0.6} fill={neon} opacity={0.55 + 0.25 * Math.sin(t / 1200 + i)} />}
          {luzes && b.j.map((j, k) => (j.on > 0.6 ? <rect key={k} x={b.x + j.x} y={base - 70 - b.h + j.y} width="3" height="4" fill={j.on > 0.88 ? '#FFD28A' : '#7FB8F0'} opacity={0.35 + 0.35 * Math.sin(t / 1500 + k + i)} /> : null))}
        </g>
      ))}
    </g>
  );
}
function Feixe({ id, x0, y0, x1, x2, y1, cor = '#FFFFFF', o = 0.18 }: { id: string; x0: number; y0: number; x1: number; x2: number; y1: number; cor?: string; o?: number }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={cor} stopOpacity={o} />
          <stop offset="1" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${x0 - 6},${y0} ${x0 + 6},${y0} ${x2},${y1} ${x1},${y1}`} fill={`url(#${id})`} />
    </>
  );
}

export function Cenario({ id, t, entrada, brilho = 0, variante = 0, tClimax = 1500 }: CenarioProps) {
  const uid = useId().replace(/:/g, '');
  const s = (n: string) => `cz${uid}${n}`;
  const e = entrada;
  const svg = (children: React.ReactNode) => (
    <svg className="cz-cenario" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" style={{ opacity: 0.001 + 0.999 * e }}>
      {children}
      <rect width={W} height={H} fill={`url(#${s('vig')})`} />
      <defs>
        <radialGradient id={s('vig')} cx="0.5" cy="0.45" r="0.8">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".55" />
        </radialGradient>
      </defs>
    </svg>
  );
  const grad = (a: string, b: string, c?: string) => (
    <linearGradient id={s('g')} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={a} />
      {c && <stop offset="0.62" stopColor={b} />}
      <stop offset="1" stopColor={c ?? b} />
    </linearGradient>
  );

  switch (id) {
    case 'madrugada': {
      const sobe = e * 40 + Math.min(1, t / 8000) * 30;
      return svg(
        <>
          <defs>{grad('#030B1F', '#0B2A5C', '#6B4A3E')}
            <radialGradient id={s('h')} cx="0.5" cy="1"><stop offset="0" stopColor="#FF9A3D" stopOpacity=".55" /><stop offset="1" stopColor="#FF9A3D" stopOpacity="0" /></radialGradient>
          </defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          <Estrelas t={t} n={26} o={1 - e * 0.6} />
          <ellipse cx="195" cy={H - 150 - sobe} rx="330" ry={170 + brilho * 40} fill={`url(#${s('h')})`} />
          <Skyline t={t} cor="#030A1C" />
          <rect y={H - 160} width={W} height="160" fill="#030A1C" opacity=".55" />
          <Poeira t={t} o={0.25} />
        </>,
      );
    }
    case 'estudio-escuro': {
      return svg(
        <>
          <defs>{grad('#040E26', '#0A2250')}</defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          <Feixe id={s('f1')} x0={195} y0={-10} x1={20} x2={370} y1={H - 150} cor="#FFD9A0" o={0.3 + brilho * 0.15} />
          <rect x="12" y="150" width="110" height="420" fill="#020817" opacity=".8" />
          {[0, 1, 2, 3].map((r) => <g key={r}><rect x="18" y={178 + r * 100} width="98" height="3" fill="#123A78" />{Array.from({ length: 7 }, (_, i) => <rect key={i} x={22 + i * 13} y={118 + r * 100 + (i % 3) * 5} width="9" height={58 - (i % 3) * 5} fill={i % 4 === 0 ? '#3A2E20' : '#0E2A5C'} opacity=".85" />)}</g>)}
          <rect x="262" y="140" width="116" height="210" fill="#081C3E" stroke="#1C4A8A" strokeWidth="3" />
          {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={282 + (i % 3) * 36} cy={190 + Math.floor(i / 3) * 70} r={8 + (i % 2) * 4} fill={i % 2 ? '#FF9A3D' : '#008FFE'} opacity=".35" />)}
          <path d={`M0 ${H - 140} H${W} V${H} H0Z`} fill="#02060F" />
          <rect y={H - 140} width={W} height="3" fill="#F5C451" opacity=".35" />
          <ellipse cx="195" cy={H - 140} rx="170" ry="14" fill="#FFD9A0" opacity=".12" />
          <Poeira t={t} o={0.55} y0={60} y1={H - 140} />
        </>,
      );
    }
    case 'noite-urbana': {
      return svg(
        <>
          <defs>{grad('#020817', '#0A2250')}</defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          <Estrelas t={t} n={30} />
          <circle cx="86" cy="150" r="26" fill="#DDE8FF" opacity=".85" /><circle cx="95" cy="144" r="24" fill="#0A1E48" />
          <Skyline t={t} cor="#020A1A" neon="#008FFE" />
          <rect y={H - 120} width={W} height="120" fill="#020A1A" />
          <rect y={H - 120} width={W} height="2" fill="#008FFE" opacity=".5" />
          {PREDIOS.slice(0, 8).map((b, i) => <rect key={i} x={b.x} y={H - 118} width={b.w} height={Math.min(b.h * 0.5, 100)} fill="#008FFE" opacity={0.05 + brilho * 0.03} />)}
          <Poeira t={t} o={0.25} cor="#9CC8FF" />
        </>,
      );
    }
    case 'skyline': {
      const ang = Math.sin(t / 1800) * 16;
      return svg(
        <>
          <defs>{grad('#02060F', '#0A1E4A')}</defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          <Estrelas t={t} n={20} />
          <g transform={`translate(70 ${H - 70}) rotate(${-18 + ang})`}><polygon points="-8,0 8,0 70,-760 -70,-760" fill="#FFFFFF" opacity=".08" /></g>
          <g transform={`translate(320 ${H - 70}) rotate(${18 - ang})`}><polygon points="-8,0 8,0 70,-760 -70,-760" fill="#F5D98A" opacity=".08" /></g>
          {[0, 1, 2].map((k) => {
            const t0 = 700 + k * 1900; const lt = t - t0;
            if (lt < 0 || lt > 1800) return null;
            const p = lt / 1800; const r = 10 + 80 * (1 - Math.pow(1 - p, 3));
            const cx = [110, 280, 195][k]; const cy = [210, 170, 260][k];
            return <g key={k} transform={`translate(${cx} ${cy})`} opacity={1 - p * p}>{Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return <line key={i} x1={Math.cos(a) * r * 0.75} y1={Math.sin(a) * r * 0.75 + p * 18} x2={Math.cos(a) * r} y2={Math.sin(a) * r + p * 30} stroke={OURO} strokeWidth="1.6" strokeLinecap="round" />; })}</g>;
          })}
          <Skyline t={t} cor="#02060F" neon="#F5C451" />
          <rect y={H - 90} width={W} height="90" fill="#02060F" />
        </>,
      );
    }
    case 'palco': {
      const luz = 0.2 + brilho * 0.12 + 0.03 * Math.sin(t / 800);
      return svg(
        <>
          <defs>{grad('#02060F', '#0A2250')}</defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          <Feixe id={s('a')} x0={60} y0={-10} x1={110} x2={300} y1={H - 150} o={luz} />
          <Feixe id={s('b')} x0={330} y0={-10} x1={90} x2={280} y1={H - 150} o={luz} />
          <Feixe id={s('c')} x0={195} y0={-10} x1={120} x2={270} y1={H - 150} cor="#F5D98A" o={luz * 0.8} />
          <ellipse cx="195" cy={H - 150} rx="190" ry="28" fill="#fff" opacity=".1" />
          <rect y={H - 150} width={W} height="150" fill="#02060F" opacity=".85" />
          <g transform={`translate(0 ${H - 128})`}>
            <rect x="60" y="30" width="84" height="56" fill="#0A2250" /><rect x="156" y="0" width="84" height="86" fill="#0E2E66" /><rect x="252" y="46" width="84" height="40" fill="#0A2250" />
            {[60, 156, 252].map((x, i) => <rect key={i} x={x} y={[30, 0, 46][i]} width="84" height="3" fill={OURO} opacity=".85" />)}
          </g>
          <Poeira t={t} o={0.45} y0={0} y1={H - 150} cor="#FFFFFF" />
        </>,
      );
    }
    case 'hospital-noite': {
      const ecg = 'M0 0 H40 L52 -4 L60 0 H84 L92 -6 L102 34 L114 -52 L124 18 L132 0 H170 L182 -8 L194 0 H280';
      return svg(
        <>
          <defs>{grad('#06182E', '#0B2F52')}</defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          {[0, 1, 2, 3].map((i) => <rect key={i} x={40 + i * 90} y={14 + i * 4} width="62" height="5" rx="2" fill="#CFF3FF" opacity={0.5 - i * 0.06} />)}
          <rect x="30" y="90" width="330" height="330" fill="#04122A" stroke="#1B4A7C" strokeWidth="3" />
          {Array.from({ length: 22 }, (_, i) => <circle key={i} cx={52 + ((i * 53) % 290)} cy={120 + ((i * 37) % 280)} r={2 + (i % 3)} fill={i % 3 ? '#FFD28A' : '#7FD6FF'} opacity={0.3 + 0.3 * Math.sin(t / 1300 + i)} />)}
          <path d="M195 90v330M30 255h330" stroke="#1B4A7C" strokeWidth="3" />
          <g transform="translate(60 520)" fill="none" stroke="#38E0F0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity=".7">
            <path d={ecg} pathLength={1} strokeDasharray="0.3 1" strokeDashoffset={-mod(t / 2800, 1.3) + 0.3} />
            <path d={ecg} stroke="#7FB8F0" strokeWidth="1" opacity=".35" />
          </g>
          <g transform="translate(330 60)" opacity=".5"><rect x="-4" y="-14" width="8" height="28" fill="#38E0F0" /><rect x="-14" y="-4" width="28" height="8" fill="#38E0F0" /></g>
          <rect y={H - 140} width={W} height="140" fill="#04122A" />
          <rect y={H - 140} width={W} height="2" fill="#38E0F0" opacity=".4" />
          <polygon points={`60,${H - 138} 330,${H - 138} 390,${H} 0,${H}`} fill="#7FD6FF" opacity=".05" />
        </>,
      );
    }
    case 'arena-esports': {
      const linhas = Array.from({ length: 12 }, (_, i) => i);
      return svg(
        <>
          <defs>{grad('#030A1E', '#0A2A6A')}</defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          {[40, 130, 260, 350].map((x, i) => <Feixe key={i} id={s('t' + i)} x0={x} y0={-10} x1={x - 70} x2={x + 70} y1={560} cor={i % 2 ? '#F5D98A' : '#5AB4FF'} o={0.16 + brilho * 0.08} />)}
          <rect y="430" width={W} height="2" fill="#5AB4FF" opacity=".5" />
          {linhas.map((i) => { const k = i / 11; const y = 430 + Math.pow(mod(k + t * 0.00008, 1), 2.2) * (H - 430); return <line key={i} x1="0" y1={y} x2={W} y2={y} stroke="#008FFE" strokeOpacity={0.12 + 0.3 * (y - 430) / (H - 430)} />; })}
          {Array.from({ length: 13 }, (_, i) => <line key={i} x1={195 + (i - 6) * 6} y1="430" x2={195 + (i - 6) * 70} y2={H} stroke="#008FFE" strokeOpacity=".28" />)}
          <ellipse cx="195" cy="470" rx="230" ry="60" fill="#5AB4FF" opacity={0.1 + brilho * 0.1} />
          <Poeira t={t} o={0.3} cor="#9CC8FF" y0={100} y1={620} />
        </>,
      );
    }
    case 'aurora': {
      const onda = (k: number, dy: number, cor: string, o: number) => {
        const a = Math.sin(t / 1800 + k) * 30; const b = Math.cos(t / 2100 + k * 2) * 36;
        return <path d={`M-20 ${220 + dy} C 80 ${140 + dy + a} 160 ${300 + dy + b} 260 ${200 + dy - a} S 380 ${160 + dy + b} 420 ${240 + dy} L420 ${540 + dy} L-20 ${540 + dy} Z`} fill={`url(#${s(cor)})`} opacity={o} />;
      };
      return svg(
        <>
          <defs>{grad('#020B24', '#08275A')}
            {[['a', '#2DE2E6'], ['b', '#008FFE'], ['c', '#6CC1FF']].map(([k, c]) => (<linearGradient key={k} id={s(k)} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".8" /><stop offset="0.5" stopColor={c} stopOpacity=".2" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient>))}</defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          <Estrelas t={t} n={34} />
          {onda(0, 0, 'a', 0.45 + brilho * 0.15)}{onda(1.7, 70, 'b', 0.4)}{onda(3.1, 150, 'c', 0.3)}
          <path d={`M0 ${H - 110} L60 ${H - 170} L110 ${H - 120} L190 ${H - 210} L260 ${H - 130} L320 ${H - 180} L390 ${H - 120} L390 ${H} L0 ${H} Z`} fill="#01040D" />
        </>,
      );
    }
    case 'nevoa': {
      return svg(
        <>
          <defs>{grad('#0B1B38', '#16325C')}</defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          {[0, 1, 2, 3].map((i) => <ellipse key={i} cx={100 + i * 90 + Math.sin(t / 3000 + i) * 24} cy={320 + i * 110} rx={230} ry={46} fill="#9CC0F0" opacity={0.07 + 0.02 * i} />)}
          <ellipse cx="195" cy="420" rx="220" ry="260" fill="#6CA0E8" opacity=".08" />
          <path d={`M0 ${H - 150} C 120 ${H - 190} 260 ${H - 130} 390 ${H - 180} L390 ${H} L0 ${H} Z`} fill="#081528" opacity=".8" />
          <Poeira t={t} o={0.2} cor="#BFD8FF" />
        </>,
      );
    }
    case 'mesa-prova': {
      return svg(
        <>
          <defs>{grad('#071429', '#0E2A52')}
            <radialGradient id={s('p')} cx="0.5" cy="0.4"><stop offset="0" stopColor="#5AB4FF" stopOpacity=".25" /><stop offset="1" stopColor="#5AB4FF" stopOpacity="0" /></radialGradient></defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          <ellipse cx="195" cy="360" rx="230" ry="260" fill={`url(#${s('p')})`} />
          {Array.from({ length: 24 }, (_, i) => <line key={i} x1="0" y1={30 + i * 36} x2={W} y2={30 + i * 36} stroke="#5AB4FF" strokeOpacity=".07" />)}
          <circle cx="195" cy="340" r="150" fill="none" stroke="#5AB4FF" strokeOpacity=".15" strokeWidth="14" />
          <circle cx="195" cy="340" r="150" fill="none" stroke={OURO} strokeOpacity=".55" strokeWidth="5" strokeLinecap="round" pathLength={1} strokeDasharray={`${0.72 * e} 1`} transform="rotate(-90 195 340)" />
          {Array.from({ length: 4 }, (_, r) => <g key={r} transform={`translate(96 ${H - 190 + r * 34})`}>{Array.from({ length: 5 }, (_, c) => <circle key={c} cx={c * 42} cy="0" r="10" fill={(r * 5 + c * 3) % 4 === 0 ? '#5AB4FF' : 'none'} fillOpacity=".4" stroke="#5AB4FF" strokeOpacity=".3" strokeWidth="2" />)}</g>)}
        </>,
      );
    }
    case 'ambar': {
      return svg(
        <>
          <defs>{grad('#0B1530', '#2B2338', '#7A4A2E')}
            <radialGradient id={s('w')}><stop offset="0" stopColor="#FFC98A" stopOpacity=".5" /><stop offset="1" stopColor="#FFC98A" stopOpacity="0" /></radialGradient></defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          <rect x="106" y="120" width="178" height="250" fill="#FFC98A" opacity={0.22 + 0.05 * Math.sin(t / 1200)} />
          <path d="M195 120v250M106 245h178" stroke="#0B1530" strokeWidth="6" opacity=".8" /><rect x="106" y="120" width="178" height="250" fill="none" stroke="#0B1530" strokeWidth="9" opacity=".85" />
          <circle cx="195" cy="420" r="280" fill={`url(#${s('w')})`} opacity={0.55 + brilho * 0.25} />
          {Array.from({ length: 14 }, (_, i) => <circle key={i} cx={(i * 71) % 390} cy={440 + ((i * 53) % 360)} r={10 + (i % 4) * 7} fill="#FFC98A" opacity={0.05 + 0.04 * Math.abs(Math.sin(t / 1800 + i))} />)}
          <path d={`M0 ${H - 120} H${W} V${H} H0Z`} fill="#0A0F20" opacity=".9" />
          <Poeira t={t} o={0.4} />
        </>,
      );
    }
    case 'ideia': {
      const lit = Math.max(0, Math.min(1, brilho * 1.25));
      return svg(
        <>
          <defs>{grad('#050F26', '#0B2A5C')}
            <radialGradient id={s('b')}><stop offset="0" stopColor="#FFE9B8" stopOpacity=".9" /><stop offset="1" stopColor="#FFE9B8" stopOpacity="0" /></radialGradient></defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          <g transform="translate(195 180)">
            <circle r={170 * (0.2 + 0.8 * lit)} fill={`url(#${s('b')})`} opacity={lit} />
            {Array.from({ length: 16 }, (_, i) => <line key={i} x1="0" y1="-66" x2="0" y2={-66 - 40 * lit} stroke="#F5D98A" strokeWidth="2" strokeLinecap="round" transform={`rotate(${i * 22.5 + t * 0.006})`} opacity={lit * 0.8} />)}
            <circle r="46" fill="none" stroke={lit > 0.1 ? '#FFE9B8' : '#5AB4FF'} strokeWidth="3" opacity={0.5 + 0.5 * lit} />
            <rect x="-15" y="46" width="30" height="18" rx="4" fill="none" stroke="#5AB4FF" strokeWidth="3" opacity=".7" />
            <path d="M-12 -4 q12 22 24 0" fill="none" stroke="#F5C451" strokeWidth="2.6" strokeLinecap="round" opacity={0.3 + 0.7 * lit} />
          </g>
          <Poeira t={t} o={0.4 * (0.3 + lit)} />
        </>,
      );
    }
    case 'horizonte': {
      return svg(
        <>
          <defs>{grad('#040E26', '#0B3F8F', '#1B6FB8')}</defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          <Estrelas t={t} n={30} o={0.8} />
          <ellipse cx="195" cy="470" rx="260" ry="70" fill="#8FD0FF" opacity={0.2 + brilho * 0.1} />
          <path d={`M60 ${H - 20} C 120 ${H - 220} 330 ${H - 180} 220 ${H - 380} S 150 ${H - 360} 195 470`} fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="14" strokeLinecap="round" />
          <path d={`M60 ${H - 20} C 120 ${H - 220} 330 ${H - 180} 220 ${H - 380} S 150 ${H - 360} 195 470`} fill="none" stroke="#F5D98A" strokeWidth="2.4" strokeDasharray="3 14" strokeLinecap="round" strokeDashoffset={-t * 0.03} />
          <path d={`M0 ${H - 110} C 120 ${H - 150} 250 ${H - 90} 390 ${H - 130} L390 ${H} L0 ${H} Z`} fill="#020817" opacity=".9" />
          <Poeira t={t} o={0.35} cor="#BFE0FF" />
        </>,
      );
    }
    case 'liga': {
      const nivel = Math.max(1, Math.min(7, variante || 1));
      const COR = ['#CD7F32', '#C8D0DC', '#F5C451', '#9FE3F2', '#6CC1FF', '#B48CFF', '#FF9A3D'][nivel - 1];
      const k = Math.max(0, Math.min(1, (t - tClimax - 200) / 700));
      const sobe = k === 0 ? 0 : 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
      const icone = nivel <= 3 ? 'medalha' : nivel <= 5 ? 'gema' : nivel === 6 ? 'coroa' : 'taca';
      return svg(
        <>
          <defs>{grad('#030A1E', '#0B3F8F')}
            <linearGradient id={s('e')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="0.45" stopColor={COR} /><stop offset="1" stopColor={COR} stopOpacity=".7" /></linearGradient>
            <radialGradient id={s('h')}><stop offset="0" stopColor={COR} stopOpacity=".55" /><stop offset="1" stopColor={COR} stopOpacity="0" /></radialGradient></defs>
          <rect width={W} height={H} fill={`url(#${s('g')})`} />
          <g transform="translate(195 300)">{Array.from({ length: 14 }, (_, i) => <polygon key={i} points="0,0 -26,-420 26,-420" fill="#fff" opacity=".05" transform={`rotate(${i * (360 / 14) + t * 0.005})`} />)}</g>
          <Estrelas t={t} n={30} o={0.7} />
          <circle cx="195" cy="300" r={170 * (0.4 + 0.6 * sobe) + brilho * 40} fill={`url(#${s('h')})`} opacity={sobe > 0 ? 1 : 0} />
          <g transform={`translate(195 305) scale(${(1.0 * Math.max(0.0001, sobe)).toFixed(3)})`} opacity={sobe > 0 ? 0.96 : 0}>
            <path d="M0 -105 L84 -74 L84 18 C84 70 42 102 0 124 C-42 102 -84 70 -84 18 L-84 -74 Z" fill={`url(#${s('e')})`} stroke="#fff" strokeWidth="4" />
            <path d="M0 -86 L68 -61 L68 16 C68 58 34 84 0 102 C-34 84 -68 58 -68 16 L-68 -61 Z" fill="none" stroke="#06244E" strokeOpacity=".4" strokeWidth="3" />
            {icone === 'medalha' && (<g><circle cy="-6" r="30" fill="#fff" opacity=".85" /><circle cy="-6" r="20" fill={COR} /><path d="M-16 24 L-26 62 L0 50 L26 62 L16 24" fill={COR} stroke="#fff" strokeWidth="3" /></g>)}
            {icone === 'gema' && (<g><polygon points="0,-44 34,-12 0,52 -34,-12" fill="#fff" opacity=".9" /><polygon points="0,-44 34,-12 0,-4 -34,-12" fill={COR} /><path d="M-34 -12 L0 -4 L34 -12 M0 -4 L0 52" stroke="#06244E" strokeOpacity=".3" strokeWidth="3" fill="none" /></g>)}
            {icone === 'coroa' && (<g><path d="M-40 34 L-46 -26 L-20 0 L0 -40 L20 0 L46 -26 L40 34 Z" fill="#fff" opacity=".92" /><rect x="-40" y="34" width="80" height="12" rx="4" fill={COR} /></g>)}
            {icone === 'taca' && (<g><path d="M-30 -40 H30 V-6 C30 22 14 32 0 32 C-14 32 -30 22 -30 -6 Z" fill="#fff" opacity=".92" /><path d="M-30 -30 C-56 -30 -52 0 -26 6 M30 -30 C56 -30 52 0 26 6" fill="none" stroke="#fff" strokeWidth="6" /><rect x="-6" y="30" width="12" height="22" fill="#fff" /><rect x="-26" y="52" width="52" height="10" rx="4" fill={COR} /></g>)}
          </g>
          <Poeira t={t} o={0.5} cor="#FFE9B8" />
          <path d={`M0 ${H - 120} C 100 ${H - 160} 250 ${H - 90} 390 ${H - 140} L390 ${H} L0 ${H} Z`} fill="#02060F" opacity=".92" />
        </>,
      );
    }
  }
}
