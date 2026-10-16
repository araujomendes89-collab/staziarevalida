import type { CSSProperties } from 'react';
import manifest from './sprites/manifest.json';
import type { Figurino, Papel } from './figurinos';
import './StaziMascote.css';

/**
 * Stazi, o mascote OFICIAL do StaziaMed: a lontra (pelagem castanha, barriga creme, moletom azul-marinho com o "S" da logo).
 * A figura vem de sprites WebP com transparencia (recortados das artes aprovadas pelo dono, ver docs/motion-studio.md);
 * a animacao e feita por transform (CSS/rAF), nunca redesenhando o personagem.
 */
export type PoseName = 'base' | 'agachar' | 'comemorando' | 'pouso' | 'orgulhosa' | 'acenando' | 'polegar' | 'pensativo' | 'surpreso' | 'triste' | 'dormindo' | 'trofeu' | 'emocionado' | 'livro' | 'danca' | `${Exclude<Figurino, 'casual'>}-${Papel}`;

export interface SpriteInfo {
  file: string;
  w: number;
  h: number;
  /** Ancora = centro dos pes no chao (px do sprite). Pivo de escala/rotacao/pulo. */
  ax: number;
  ay: number;
}

const M = manifest as unknown as Record<string, SpriteInfo>;
const URLS = import.meta.glob('./sprites/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Poses realmente disponiveis (as que passaram na conferencia de consistencia). */
export const AVAILABLE_POSES = Object.keys(M) as PoseName[];
export const hasPose = (p: string): p is PoseName => p in M;
export const spriteInfo = (p: PoseName): SpriteInfo => M[p];
export const spriteUrl = (p: PoseName): string => URLS[`./sprites/${M[p].file}`];

/** Altura do sprite em pe (px do arquivo) e altura CSS em pe: converte px de arquivo em px de tela. */
export const SPRITE_STAND_PX = 720;
export const spriteScale = (standCssH: number) => standCssH / SPRITE_STAND_PX;

/** Textos alternativos (acessibilidade). */
export const POSE_ALT_BASE: Record<string, string> = {
  base: 'Stazi, o mascote do StaziaMed, de braços cruzados e sorrindo',
  agachar: 'Stazi, o mascote do StaziaMed, se agachando para dar um pulo',
  comemorando: 'Stazi, o mascote do StaziaMed, comemorando',
  pouso: 'Stazi, o mascote do StaziaMed, pousando de braços abertos',
  orgulhosa: 'Stazi, o mascote do StaziaMed, orgulhoso, com as mãos na cintura',
  acenando: 'Stazi, o mascote do StaziaMed, acenando',
  polegar: 'Stazi, o mascote do StaziaMed, com o polegar para cima',
  pensativo: 'Stazi, o mascote do StaziaMed, pensativo',
  surpreso: 'Stazi, o mascote do StaziaMed, surpreso',
  triste: 'Stazi, o mascote do StaziaMed, animando você a tentar de novo',
  dormindo: 'Stazi, o mascote do StaziaMed, descansando',
  trofeu: 'Stazi, o mascote do StaziaMed, erguendo um troféu',
  emocionado: 'Stazi, o mascote do StaziaMed, emocionado, com as mãos no peito',
  livro: 'Stazi, o mascote do StaziaMed, com um livro e o polegar para cima',
  danca: 'Stazi, o mascote do StaziaMed, dançando de alegria',
};

export interface StaziMascoteProps {
  pose?: PoseName;
  /** Altura (px CSS) da lontra em pe. Padrao 160. */
  size?: number;
  alt?: string;
  /** Carrega so quando perto da tela (padrao true; use false na animacao principal). */
  lazy?: boolean;
  /** Respiracao sutil (desligada com movimento reduzido). */
  idle?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Stazi estatico/idle para o app (acerto, erro, conquista, vazio...). A celebracao usa MascoteSprites. */
export function StaziMascote({ pose = 'base', size = 160, alt, lazy = true, idle = true, className, style }: StaziMascoteProps) {
  const name = hasPose(pose) ? pose : AVAILABLE_POSES[0];
  if (!name) return null;
  const k = spriteScale(size);
  const s = M[name];
  return (
    <img
      src={spriteUrl(name)}
      alt={alt ?? POSE_ALT[name]}
      width={Math.round(s.w * k)}
      height={Math.round(s.h * k)}
      loading={lazy ? 'lazy' : 'eager'}
      decoding="async"
      draggable={false}
      className={['ms-stazi', idle ? 'ms-stazi--idle' : '', className].filter(Boolean).join(' ')}
      style={{ transformOrigin: `${(s.ax / s.w) * 100}% ${(s.ay / s.h) * 100}%`, ...style }}
    />
  );
}

const FIG_ALT: Record<string, string> = { bone: 'de boné, óculos escuros e corrente', bomber: 'de jaqueta bomber e óculos escuros', doutor: 'de jaleco e óculos de aviador', fone: 'de fone de ouvido e moletom preto', social: 'de camisa social e blazer', esports: 'de jaqueta de e-sports', plantao: 'de uniforme de plantão com estetoscópio', varsity: 'de jaqueta varsity' };
const PAPEL_ALT: Record<string, string> = { cruzado: 'de braços cruzados', acao: 'ajeitando a pose', celebra: 'comemorando com calma' };
/** Texto alternativo de qualquer pose (inclusive de figurino): "Stazi, o mascote do StaziaMed, ...". */
export function poseAlt(p: string): string {
  if (typeof p !== 'string') return '';
  if (POSE_ALT_BASE[p]) return POSE_ALT_BASE[p];
  const [fig, papel] = p.split('-');
  return `Stazi, o mascote do StaziaMed, ${FIG_ALT[fig] ?? ''} ${PAPEL_ALT[papel] ?? ''}`.replace(/\s+/g, ' ').trim();
}
export const POSE_ALT: Record<string, string> = new Proxy(POSE_ALT_BASE, { get: (t, k) => (typeof k === 'string' ? (t[k] ?? poseAlt(k)) : Reflect.get(t, k)) });
