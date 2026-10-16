import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './CelebracaoStazi.css';
import { hasPose, poseAlt, spriteInfo, spriteScale, spriteUrl, type PoseName } from '../mascot/StaziMascote';
import { resolverPose, type Figurino } from '../mascot/figurinos';
import { createSoundEngine, DEFAULT_VOLUME, type SoundEngine } from '../sound/soundEngine';
import { clamp } from '../physics';
import { useReducedMotion } from '../useReducedMotion';
import { CATALOGO } from './catalogo';
import { Cenario } from './cenarios/Cenario';
import { CENARIO_INFO } from './cenarios/registro';
import { DURACAO, TEMPOS, frameMascote, frameTextos, momentoMs, particulasAt, type ParticulaCz } from './coreografia';
import { montarAgenda, VOZ_PADRAO, type PreferenciaVoz } from './agendaSom';
import { escolherFigurino } from './figurino';
import { escolherFrase, preencher, semente, textoDetalhe, textoTitulo } from './frases';
import type { Catalogo, Dados, EventoCatalogo, Intensidade, Momento } from './tipos';
import type { ModoCelebracoes } from './regras';

export interface EventoCelebracao {
  /** Id do catalogo (ex.: "streak-30"). */
  id: string;
  /** Valores REAIS vindos da aplicacao. A animacao so le; nunca calcula nem altera. */
  dados: Dados;
  /** Semente da escolha da frase (padrao: estavel por evento + dados). */
  seed?: number;
  /** Texto REAL do app mostrado sob o titulo (ex.: nome da medalha, "8 de 10 questoes certas"). A animacao so le. */
  complemento?: string;
}

export interface CelebracaoStaziProps {
  evento: EventoCelebracao;
  catalogo?: Catalogo;
  /** Intensidade decidida pelo app (hook useCelebracoes); padrao = a do catalogo. */
  intensidade?: Intensidade;
  /** 0,2..1: usuarios frequentes veem menos particulas e menos overshoot. */
  fatorIntensidade?: number;
  /** Preferencia do aluno: reduzidas/silenciosas tiram o som; o visual ja chega rebaixado pela intensidade. */
  modo?: ModoCelebracoes;
  /** 0..1 relativo ao volume base. 0 = sem som. */
  volume?: number;
  /** Figurino do Stazi (padrao: sorteio pela semente entre os do evento, evitando `evitarFigurinos`). */
  figurino?: Figurino;
  /** [ultimo deste evento, ultimo de qualquer celebracao]: o sorteio foge deles. */
  evitarFigurinos?: readonly (string | undefined)[];
  /** Indices das frases ja usadas deste evento (limite de repeticao). */
  frasesRecentes?: readonly number[];
  onFraseEscolhida?: (indice: number) => void;
  onFechar: () => void;
  onContinuar?: () => void;
  onCompartilhar?: () => void;
  onPular?: () => void;
  /** Chamado uma vez quando a celebracao chega ao fim (inclusive ao pular ou com movimento reduzido). */
  onConcluir?: () => void;
  reducedMotion?: boolean;
  /** Tempo controlado em ms (captura, testes, video): desliga o relogio e o som. */
  time?: number;
  /**
   * URLs dos sons (ver ../sound: `streakSoundUrls`). So toca apos gesto do usuario; respeita mudo persistente.
   * `porEvento` (ver `somPorEvento`, sound/mapa-eventos.json): arquivo escolhido para um evento, no lugar dos sons padrao.
   */
  sound?: {
    urls: Readonly<Record<string, string>>;
    volume?: number;
    storageKey?: string;
    porEvento?: Readonly<Record<string, { url: string; momento?: string; gain?: number }>>;
    /** Falas (ver `vozSoundUrls`): chave `<pasta>/<slug>-v<k>` -> URL. Sem isto, nao ha fala (os efeitos tocam normalmente). */
    vozes?: Readonly<Record<string, string>>;
    /** Mapa do app: evento -> 'ligado' | 'desligado' (so a fala; os efeitos continuam). */
    vozPorEvento?: Readonly<Record<string, string>>;
  };
  /** Voz do aluno: estilo (durona | stazi | desligada) e nivel da Durona. Padrao: Durona, moderada. */
  voz?: PreferenciaVoz;
  /** true = ocupa o container pai (position:absolute) em vez da tela (position:fixed). */
  contido?: boolean;
  /** true = botao "Fechar" visivel desde o primeiro quadro (no app: dispensar na hora, sem esperar o fim). */
  fechavel?: boolean;
}

const HERO_W = 390;
const HERO_H = 320;
const GROUND = 150;
const STAND: Record<Intensidade, number> = { micro: 56, pequena: 168, media: 236, grande: 266, epica: 280 };
const REDUZIDO_MICRO_MS = 4000;

/** Rodizio das variantes de um evento micro (contador por evento, na sessao): nao repete o mesmo som em seguida. */
const contadorRodizio = new Map<string, number>();
function rodizio(id: string): number {
  const n = contadorRodizio.get(id) ?? 0;
  contadorRodizio.set(id, n + 1);
  return n;
}

/* ---------------------------------------------------------------- relogio */
function useRelogio(fim: number, parado: boolean, inicial: number): [number, (ms: number) => void] {
  const [clock, setClock] = useState<number>(inicial);
  useEffect(() => {
    if (parado) return;
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(now - last, 50);
      last = now;
      let done = false;
      setClock((c) => {
        const n = Math.min(fim, c + dt);
        done = n >= fim;
        return n;
      });
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onVis = () => {
      last = null;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fim, parado]);
  return [clock, setClock];
}

/* ---------------------------------------------------------------- pecas */
function Particula({ p }: { p: ParticulaCz }) {
  const sz = p.size;
  let forma;
  if (p.shape === 'dot') forma = <circle r={sz / 2} fill={p.color} />;
  else if (p.shape === 'glow') forma = <circle r={sz} fill={p.color} opacity=".4" />;
  else if (p.shape === 'ring') forma = <circle r={sz} fill="none" stroke={p.color} strokeWidth={Math.max(1.5, 5 * p.opacity)} />;
  else if (p.shape === 'flare') forma = <rect x={-sz / 2} y={-1.5} width={sz * p.stretch} height="3" rx="1.5" fill={p.color} transform={`translate(${(-(sz * p.stretch - sz) / 2).toFixed(1)} 0)`} />;
  else forma = <rect x={-sz * 0.5} y={-sz * 0.14} width={sz * 2.4 * p.stretch} height={sz * 0.28} rx={sz * 0.14} fill={p.color} />;
  return (
    <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rotate.toFixed(0)})`} opacity={p.opacity}>
      {forma}
    </g>
  );
}

/** Pilha de sprites: cada pose e uma imagem; a troca e uma fusao curta com o movimento do corpo. */
function SpritesStazi({ poses, pesos, standH, className }: { poses: readonly PoseName[]; pesos: Partial<Record<PoseName, number>>; standH: number; className?: string }) {
  const k = spriteScale(standH);
  return (
    <>
      {poses.map((p) => {
        const sp = spriteInfo(p);
        const w = pesos[p] ?? 0;
        return <img key={p} className={className ?? 'cz-sprite'} src={spriteUrl(p)} alt="" decoding="async" loading="eager" draggable={false} style={{ width: sp.w * k, height: sp.h * k, left: -sp.ax * k, top: -sp.ay * k, opacity: w, visibility: w > 0.002 ? 'visible' : 'hidden' }} />;
      })}
    </>
  );
}

/** Poses do evento ja vestidas no figurino escolhido (pose casual do catalogo -> sprite do figurino; sem pose = nao existe). */
function posesVestidas(ev: EventoCatalogo, figurino: Figurino): { inicio: PoseName; climax: PoseName; final: PoseName; lista: PoseName[] } {
  const r = (p: string) => resolverPose(p, figurino, hasPose);
  const inicio = r(ev.reacao.poses.inicio);
  const climax = r(ev.reacao.poses.climax);
  const final = r(ev.reacao.poses.final);
  return { inicio, climax, final, lista: Array.from(new Set([inicio, climax, final])).filter(hasPose) };
}

/* ---------------------------------------------------------------- componente */
export function CelebracaoStazi({
  evento,
  catalogo = CATALOGO,
  intensidade,
  fatorIntensidade = 1,
  modo = 'normal',
  volume = 1,
  frasesRecentes = [],
  figurino: figurinoProp,
  evitarFigurinos = [],
  onFraseEscolhida,
  onFechar,
  onContinuar,
  onCompartilhar,
  onPular,
  onConcluir,
  reducedMotion,
  time,
  sound,
  voz,
  contido = false,
  fechavel = false,
}: CelebracaoStaziProps) {
  const def = useMemo(() => catalogo.eventos.find((e) => e.id === evento.id), [catalogo, evento.id]);
  const reduced = useReducedMotion(reducedMotion);
  const controlado = typeof time === 'number';
  const inten: Intensidade = intensidade ?? def?.intensidade ?? 'micro';
  const fim = DURACAO[inten];
  const T = TEMPOS[inten];
  const [clock, setClock] = useRelogio(fim, controlado || reduced || !def, reduced || !def ? fim : 0);
  const ms = controlado ? (time as number) : clock;
  const concluidoRef = useRef(false);
  const continuarRef = useRef<HTMLButtonElement>(null);

  /* frase (semente estavel) */
  const escolha = useMemo(() => {
    if (!def) return null;
    return escolherFrase(def, evento.dados, evento.seed ?? semente(def.id, JSON.stringify(evento.dados)), frasesRecentes);
    // frasesRecentes entra so na primeira escolha: a frase nao muda no meio da animacao
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, evento.id, evento.seed, JSON.stringify(evento.dados)]);
  useEffect(() => {
    if (escolha) onFraseEscolhida?.(escolha.indice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolha?.indice, evento.id]);

  /* quadros */
  const figurino: Figurino = useMemo(() => figurinoProp ?? (def ? escolherFigurino(def, evento.seed ?? semente(def.id, JSON.stringify(evento.dados)), evitarFigurinos) : 'casual'), 
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [figurinoProp, def, evento.seed, evento.id]);
  const vestidas = useMemo(() => (def ? posesVestidas(def, figurino) : null), [def, figurino]);
  const fm = useMemo(() => (def ? frameMascote(ms, { coreografia: def.reacao.coreografia, poses: vestidas ? { inicio: vestidas.inicio, climax: vestidas.climax, final: vestidas.final } : def.reacao.poses, intensidade: inten, fator: fatorIntensidade }) : null), [def, vestidas, ms, inten, fatorIntensidade]);
  const modoNumero = def?.numero.modo ?? 'nenhum';
  const valorNumero = def ? evento.dados[def.numero.variavel] : undefined;
  const temNumero = modoNumero !== 'nenhum' && valorNumero !== undefined && valorNumero !== '';
  const ft = useMemo(() => frameTextos(ms, inten, temNumero ? modoNumero : 'nenhum', fatorIntensidade), [ms, inten, temNumero, modoNumero, fatorIntensidade]);
  const info = def ? CENARIO_INFO[def.cenario] : CENARIO_INFO.nevoa;
  const particulas = useMemo(() => (def && !reduced ? particulasAt(ms, def.efeito.tipo, def.efeito.densidade, inten, info.paleta, fatorIntensidade) : []), [def, ms, inten, info, fatorIntensidade, reduced]);
  const finalizado = ms >= fim;
  const poses = vestidas?.lista ?? [];

  /* som (so apos gesto; nunca com movimento reduzido, relogio controlado, mudo ou volume 0) */
  const somLigado = !!sound && !!def && !reduced && !controlado && modo !== 'silenciosas' && modo !== 'desligadas' && volume > 0;
  const [engine, setEngine] = useState<SoundEngine | null>(null);
  const [mudo, setMudo] = useState(false);
  useEffect(() => {
    if (!somLigado || !sound) return;
    // carrega so os sons deste evento (3 a 8 arquivos), nao a biblioteca inteira
    const e = createSoundEngine({ urls: urlsDoEvento, volume: (sound.volume ?? DEFAULT_VOLUME) * clamp(volume), storageKey: sound.storageKey });
    setEngine(e);
    setMudo(e.isMuted());
    const ua = typeof navigator !== 'undefined' ? (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation : undefined;
    if (ua?.hasBeenActive) void e.unlock();
    return () => {
      e.dispose();
      setEngine(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [somLigado]);
  const seedSom = evento.seed ?? semente(evento.id, JSON.stringify(evento.dados));
  const montada = useMemo(() => {
    if (!def) return { agenda: [], fala: null };
    const rebaixada = !!intensidade && intensidade !== def.intensidade;
    const m = montarAgenda(def, { intensidade: inten, rodizio: rodizio(def.id), rebaixada, voz: voz ?? VOZ_PADRAO, seed: seedSom, vozesDisponiveis: Object.keys(sound?.vozes ?? {}), vozPorEvento: sound?.vozPorEvento });
    const dono = sound?.porEvento?.[def.id];
    if (dono?.url) return { agenda: [...m.agenda.filter((c) => c.cue.startsWith('voz:')), { cue: '__dono', at: momentoMs(inten, (dono.momento as Momento) ?? 'climax'), gain: dono.gain ?? 1 }].sort((a, b) => a.at - b.at), fala: m.fala };
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, inten, intensidade, sound?.porEvento, sound?.vozes, sound?.vozPorEvento, voz?.estilo, voz?.duronaNivel, seedSom]);
  const agenda = montada.agenda;
  const urlsDoEvento = useMemo(() => {
    const out: Record<string, string> = {};
    const base = sound?.urls ?? {};
    for (const c of agenda) {
      if (c.cue === '__dono') out.__dono = sound?.porEvento?.[def?.id ?? '']?.url ?? '';
      else if (c.cue.startsWith('voz:')) {
        const u = sound?.vozes?.[c.cue.slice(4)];
        if (u) out[c.cue] = u;
      } else if (base[c.cue]) out[c.cue] = base[c.cue];
    }
    return out;
  }, [agenda, sound, def]);
  const anterior = useRef(0);
  useEffect(() => {
    const prev = anterior.current;
    anterior.current = ms;
    if (!engine || controlado || ms <= prev) return;
    for (const c of agenda) if (c.at > prev && c.at <= ms && ms - c.at < 150) engine.play(c.cue, c.gain);
  }, [ms, engine, controlado, agenda]);
  const desbloquear = useCallback(() => {
    void engine?.unlock();
  }, [engine]);

  /* fim: avisa uma vez; micro/pequena fecham sozinhas */
  useEffect(() => {
    if (!finalizado || concluidoRef.current || !def) return;
    concluidoRef.current = true;
    onConcluir?.();
    if (inten === 'micro' || inten === 'pequena') {
      if (controlado) return;
      const id = setTimeout(onFechar, reduced ? REDUZIDO_MICRO_MS : 150);
      return () => clearTimeout(id);
    }
    continuarRef.current?.focus({ preventScroll: true });
  }, [finalizado, def, inten, onConcluir, onFechar, reduced, controlado]);
  useEffect(() => {
    if (ft.botoes.ativos) continuarRef.current?.focus({ preventScroll: true });
  }, [ft.botoes.ativos]);

  const pular = useCallback(() => {
    engine?.stopAll();
    setClock(fim);
    onPular?.();
  }, [engine, fim, onPular, setClock]);
  const fecharJa = useCallback(() => {
    engine?.stopAll();
    onFechar();
  }, [engine, onFechar]);
  const alternarMudo = useCallback(() => {
    if (!engine) return;
    const n = !engine.isMuted();
    engine.setMuted(n);
    setMudo(n);
    if (!n) void engine.unlock();
  }, [engine]);

  if (!def || !fm || !escolha) return null;

  const titulo = textoTitulo(def, evento.dados);
  const detalhe = textoDetalhe(def, evento.dados);
  const complemento = evento.complemento?.trim() || null;
  const anteriorN = typeof valorNumero === 'number' ? valorNumero - 1 : 0;
  const un = def.numero.unidade.trim();
  const sufixo = un.startsWith('º') ? 'º' : un === '%' ? '%' : '';
  const rotuloNum = un.startsWith('º') ? un.slice(1).trim() : un === '%' ? '' : un;
  const mostraAntes = def.numero.modo === 'rolar' && typeof valorNumero === 'number';
  const textoSr = [titulo, complemento, escolha.frase, detalhe].filter(Boolean).join('. ').replace(/([.!?…])\. /g, '$1 ');
  const altStazi = poseAlt(finalizado ? (vestidas?.final ?? fm.pose) : fm.pose);
  const cheio = inten === 'media' || inten === 'grande' || inten === 'epica';
  const m = fm.mascote;
  const stand = STAND[inten];
  const transformStazi = `translate(${m.x.toFixed(2)}px, ${(GROUND + m.y).toFixed(2)}px) rotate(${m.rotate.toFixed(2)}deg) scale(${(m.sx * m.scale).toFixed(4)}, ${(m.sy * m.scale).toFixed(4)})`;
  const digitos = temNumero ? String(valorNumero).length : 0;
  const raiz = ['cz', `cz--${inten}`, `cz-tinta-${info.tinta}`, digitos >= 3 ? 'cz-d3' : '', contido ? 'cz--contido' : ''].filter(Boolean).join(' ');
  const sr = (
    <>
      <p role="status" aria-live="polite" className="cz-sr" data-testid="cz-status">
        {textoSr}
      </p>
      <p className="cz-sr" data-testid="cz-alt">
        {altStazi}
      </p>
    </>
  );

  /* ---------- micro: faixa curta no rodape ---------- */
  if (inten === 'micro') {
    const sai = windowOut(ms, fim);
    const posesMicro = poses.length > 0 ? poses : (['base'] as PoseName[]);
    return (
      <div className={raiz} data-evento={def.id} data-cenario={def.cenario} data-intensidade={inten} data-figurino={figurino} data-fala={montada.fala?.texto ?? ''} data-finished={finalizado ? 'true' : 'false'} style={{ ['--cz-fundo' as string]: info.fundo }} onClick={onFechar}>
        {sr}
        <div className="cz-chip" aria-hidden="true" style={{ opacity: ft.cena * (1 - sai), transform: `translateY(${((1 - ft.cena) * 40 + sai * 30).toFixed(1)}px) scale(${(0.96 + 0.04 * ft.cena).toFixed(3)})` }}>
          <div className="cz-chip-avatar" style={{ transform: `scale(${(m.scale * (m.sx + m.sy) * 0.5).toFixed(3)}) translateY(${m.y.toFixed(1)}px)` }}>
            {posesMicro.map((p) => (
              <img key={p} src={spriteUrl(p)} alt="" draggable={false} decoding="async" style={{ opacity: fm.poseWeights[p] ?? 0 }} />
            ))}
          </div>
          <div className="cz-chip-texto">
            <strong style={{ opacity: ft.titulo.opacity }}>{titulo}</strong>
            <span style={{ opacity: ft.frase.opacity }}>{escolha.frase}</span>
          </div>
        </div>
        <div className="cz-fx" aria-hidden="true">
          <svg width="390" height="120" viewBox="-195 -90 390 120" overflow="visible">
            {particulas.map((p) => (
              <Particula key={p.id} p={p} />
            ))}
          </svg>
        </div>
      </div>
    );
  }

  /* ---------- pequena: cartao com cenario ---------- */
  if (inten === 'pequena') {
    const sai = windowOut(ms, fim);
    return (
      <div className={raiz} data-evento={def.id} data-cenario={def.cenario} data-intensidade={inten} data-figurino={figurino} data-fala={montada.fala?.texto ?? ''} data-finished={finalizado ? 'true' : 'false'} onClick={onFechar}>
        {sr}
        <div className="cz-cartao" aria-hidden="true" style={{ opacity: ft.cena * (1 - sai), transform: `translateY(${((1 - ft.cena) * 60 + sai * 40).toFixed(1)}px)` }}>
          <div className="cz-cartao-cena">
            <Cenario id={def.cenario} t={reduced ? fim : ms} entrada={ft.cena} brilho={fm.flash} />
          </div>
          <div className="cz-cartao-stazi" style={{ transform: `translate(${(m.x + 76).toFixed(1)}px, 0)` }}>
            <div className="cz-cartao-pivo" style={{ transform: `translateY(${(m.y - 14).toFixed(2)}px) rotate(${m.rotate.toFixed(2)}deg) scale(${(m.sx * m.scale).toFixed(4)}, ${(m.sy * m.scale).toFixed(4)})` }}>
              <SpritesStazi poses={poses} pesos={fm.poseWeights} standH={stand} />
            </div>
          </div>
          <div className="cz-cartao-texto">
            <strong style={{ opacity: ft.titulo.opacity, transform: `translateY(${ft.titulo.y}px)` }}>{complemento ? `${titulo} · ${complemento}` : titulo}</strong>
            <span style={{ opacity: ft.frase.opacity, transform: `translateY(${ft.frase.y}px)` }}>{escolha.frase}</span>
            {temNumero && (
              <em style={{ opacity: ft.numero.opacity }}>
                {String(valorNumero)}
                {sufixo} {rotuloNum}
              </em>
            )}
          </div>
          <svg className="cz-cartao-fx" width="358" height="200" viewBox="-179 -150 358 200" overflow="visible">
            {particulas.map((p) => (
              <Particula key={p.id} p={p} />
            ))}
          </svg>
        </div>
      </div>
    );
  }

  /* ---------- media, grande, epica: tela cheia ---------- */
  const rolagem = ft.numero.roll * 100;
  const peito = GROUND - stand * 0.5 * m.scale;
  return (
    <section
      className={raiz}
      data-evento={def.id}
      data-cenario={def.cenario}
      data-intensidade={inten}
      data-figurino={figurino}
      data-fala={montada.fala?.texto ?? ''}
      data-finished={finalizado ? 'true' : 'false'}
      data-sound={engine ? (mudo ? 'mudo' : 'ligado') : 'desligado'}
      aria-label={`Celebração: ${titulo}`}
      style={{ ['--cz-brilho' as string]: info.brilho }}
      onPointerDownCapture={desbloquear}
      onKeyDownCapture={(e) => {
        desbloquear();
        if (e.key === 'Escape') onFechar();
      }}
    >
      {sr}
      <div className="cz-bg" aria-hidden="true">
        <Cenario id={def.cenario} t={reduced ? fim : ms} entrada={ft.cena} brilho={fm.flash} variante={nivelLiga(def.id, evento.dados)} tClimax={T.climax} />
      </div>
      <div className="cz-glow" aria-hidden="true" style={{ opacity: clamp(0.35 * ft.cena + fm.flash * 0.6) }} />
      {fm.flash > 0.02 && <div className="cz-flash" aria-hidden="true" style={{ opacity: fm.flash * 0.28 }} />}

      <div className="cz-top">
        {engine ? (
          <button type="button" className="cz-icone" onClick={alternarMudo} aria-pressed={mudo} aria-label={mudo ? 'Ligar som' : 'Desligar som'}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
              {mudo ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.5 7.5 0 0 1 0 10.4" />}
            </svg>
          </button>
        ) : (
          <span />
        )}
        <div className="cz-top-dir">
          {!finalizado && !reduced && (
            <button type="button" className="cz-pular" onClick={pular}>
              Pular
            </button>
          )}
          {fechavel && (
            <button type="button" className="cz-icone cz-fechar" onClick={fecharJa} aria-label="Fechar comemoração">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="cz-palco" aria-hidden="true">
        <div className="cz-titulo" style={{ opacity: ft.titulo.opacity, transform: `translateY(${ft.titulo.y}px)` }}>
          {titulo}
        </div>
        {complemento && (
          <div className="cz-complemento" style={{ opacity: ft.titulo.opacity, transform: `translateY(${ft.titulo.y}px)` }}>
            {complemento}
          </div>
        )}
        <div className="cz-hero" style={{ width: HERO_W, height: HERO_H }}>
          <svg className="cz-fx" width={HERO_W} height={HERO_H} viewBox={`${-HERO_W / 2} ${-HERO_H / 2} ${HERO_W} ${HERO_H}`} overflow="visible">
            {fm.sombra.opacity > 0.005 && <ellipse cx="0" cy={GROUND + 4} rx={66 * fm.sombra.scale * (stand / 230)} ry={9 * fm.sombra.scale} fill="#06244E" opacity={fm.sombra.opacity} />}
          </svg>
          <div className="cz-stazi">
            <div className="cz-pivo" style={{ transform: transformStazi, opacity: m.opacity }}>
              <SpritesStazi poses={poses} pesos={fm.poseWeights} standH={stand} />
            </div>
          </div>
          <svg className="cz-fx cz-fx-top" width={HERO_W} height={HERO_H} viewBox={`${-HERO_W / 2} ${-HERO_H / 2} ${HERO_W} ${HERO_H}`} overflow="visible">
            <g transform={`translate(0 ${peito.toFixed(1)})`}>
              {particulas.map((p) => (
                <Particula key={p.id} p={p} />
              ))}
            </g>
          </svg>
        </div>
        {temNumero && (
          <div className="cz-numero" style={{ opacity: ft.numero.opacity, transform: `scale(${ft.numero.pop.toFixed(3)})` }}>
            <div className="cz-numero-janela">
              {mostraAntes ? (
                <>
                  <span className="cz-numero-n" style={{ transform: `translateY(${-rolagem}%)`, opacity: 1 - Math.min(1, ft.numero.roll) * 0.85 }}>
                    {anteriorN}
                  </span>
                  <span className="cz-numero-n" style={{ transform: `translateY(${100 - rolagem}%)`, opacity: 0.15 + Math.min(1, ft.numero.roll) * 0.85 }}>
                    {String(valorNumero)}
                  </span>
                </>
              ) : (
                <span className="cz-numero-n">
                  {String(valorNumero)}
                  {sufixo}
                </span>
              )}
            </div>
            {rotuloNum && <div className="cz-numero-un">{rotuloNum}</div>}
          </div>
        )}
        <p className="cz-frase" style={{ opacity: ft.frase.opacity, transform: `translateY(${ft.frase.y}px)` }}>
          {escolha.frase}
        </p>
        {detalhe && (
          <p className="cz-detalhe" style={{ opacity: ft.detalhe.opacity }}>
            {detalhe}
          </p>
        )}
      </div>

      <div className="cz-acoes">
        {ft.botoes.ativos && def.compartilhavel && onCompartilhar && (
          <button type="button" className="cz-compartilhar" style={{ opacity: ft.botoes.opacity, transform: `translateY(${ft.botoes.y}px)` }} onClick={onCompartilhar}>
            Compartilhar marco
          </button>
        )}
        {ft.botoes.ativos && (
          <button
            ref={continuarRef}
            type="button"
            className="cz-continuar"
            style={{ opacity: ft.botoes.opacity, transform: `translateY(${ft.botoes.y}px)` }}
            onClick={() => {
              (onContinuar ?? onFechar)();
            }}
          >
            Continuar
          </button>
        )}
      </div>
    </section>
  );
}

/** Nivel da liga (1 = Bronze ... 7 = Revalida Master) para o emblema: vem dos dados do app ou do id do evento de promocao. */
const NIVEL_POR_ID: Record<string, number> = { 'liga-promocao-prata': 2, 'liga-promocao-ouro': 3, 'liga-promocao-platina': 4, 'liga-promocao-diamante': 5, 'liga-promocao-elite': 6, 'liga-promocao-master': 7 };
function nivelLiga(id: string, dados: Dados): number {
  const n = Number(dados.nivel_liga);
  return Number.isFinite(n) && n > 0 ? n : (NIVEL_POR_ID[id] ?? 1);
}

/** Saida suave dos ultimos 300 ms (micro e pequena). */
function windowOut(ms: number, fim: number): number {
  return clamp((ms - (fim - 300)) / 300);
}

export { preencher };
