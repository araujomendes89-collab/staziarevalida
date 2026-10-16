import type { Dados } from './tipos';

/**
 * Traduz o que o app JA tem (linhas de gamification_events e user_gamification_stats) em ids do catalogo.
 * Funcoes puras: nao chamam banco, nao gravam nada. O app le os dados como ja faz hoje (usePlay) e passa para ca.
 */
export interface LinhaEvento {
  event_type: string;
  source_id?: string;
  xp_awarded?: number;
  metadata?: Record<string, unknown> | null;
}
export interface StatsGamificacao {
  current_streak: number;
  longest_streak: number;
  streak_freezes?: number;
  /** AAAA-MM-DD */
  last_qualified_date?: string | null;
  /** Rotulo do nivel ja legivel (ex.: "Residente"), se o app tiver. */
  nivel_nome?: string;
}
export interface EventoApp {
  id: string;
  dados: Dados;
  /** Texto real do app mostrado sob o titulo (ex.: nome da medalha). Opcional. */
  complemento?: string;
}

export const MARCOS_SEQUENCIA = [7, 14, 30, 60, 100, 365] as const;
/** Recorde so conta quando o recorde anterior ja era uma sequencia de verdade. */
export const RECORDE_MINIMO_ANTERIOR = 3;
/** Dias sem estudar a partir dos quais a volta e acolhida. */
export const DIAS_PARA_VOLTA = 3;

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function diasEntre(deIso: string, ateIso: string): number {
  const a = Date.parse(`${deIso}T00:00:00Z`);
  const b = Date.parse(`${ateIso}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function mapearSequencia(antes: StatsGamificacao | undefined, depois: StatsGamificacao): EventoApp[] {
  const n = depois.current_streak;
  if (!(n > (antes?.current_streak ?? 0))) return [];
  const out: EventoApp[] = [];
  const recorde = antes?.longest_streak ?? 0;
  const dados: Dados = { n, recorde: Math.max(recorde, n) };
  if ((MARCOS_SEQUENCIA as readonly number[]).includes(n)) out.push({ id: `streak-${n}`, dados });
  else if (n === 1) out.push({ id: 'primeiro-dia', dados });
  else if (n === 2 || n === 3) out.push({ id: `dia-${n}`, dados });
  else out.push({ id: 'streak-dia-comum', dados });
  if (n > recorde && recorde >= RECORDE_MINIMO_ANTERIOR && !(MARCOS_SEQUENCIA as readonly number[]).includes(n)) out.push({ id: 'novo-recorde', dados: { n, recorde } });
  return out;
}

/** Volta depois de pausa: chamar no primeiro estudo do dia, com last_qualified_date de ANTES. */
export function mapearVolta(antes: StatsGamificacao | undefined, hoje: string): EventoApp[] {
  if (!antes?.last_qualified_date) return [];
  const dias = diasEntre(antes.last_qualified_date, hoje);
  return dias >= DIAS_PARA_VOLTA ? [{ id: 'volta-apos-pausa', dados: { dias } }] : [];
}

export function faixaSimulado(pct: number | undefined): 'alto' | 'medio' | 'baixo' {
  if (pct === undefined) return 'medio';
  return pct >= 70 ? 'alto' : pct >= 40 ? 'medio' : 'baixo';
}

/** Uma linha de gamification_events (+ stats antes/depois, quando o app tiver) vira zero ou mais eventos do catalogo. */
export function mapearLinha(linha: LinhaEvento, ctx: { antes?: StatsGamificacao; depois?: StatsGamificacao; hoje: string }): EventoApp[] {
  const m = linha.metadata ?? {};
  const xp = linha.xp_awarded && linha.xp_awarded > 0 ? linha.xp_awarded : undefined;
  switch (linha.event_type) {
    case 'STREAK_INCREMENTED':
      return ctx.depois ? [...mapearVolta(ctx.antes, ctx.hoje), ...mapearSequencia(ctx.antes, ctx.depois)] : [];
    case 'STREAK_FREEZE_USED':
      return [{ id: 'congelamento-usado', dados: { n: ctx.depois?.current_streak ?? ctx.antes?.current_streak ?? undefined, restantes: ctx.depois?.streak_freezes } as Dados }];
    case 'DAILY_GOAL_COMPLETED':
      return [{ id: 'meta-diaria', dados: {} }];
    case 'LESSON_COMPLETED':
      return [{ id: 'aula-concluida', dados: xp ? { xp } : {} }];
    case 'QUESTION_CORRECT':
      return [{ id: 'questao-correta', dados: {} }];
    case 'MISSION_COMPLETED':
    case 'DAILY_MISSIONS_COMPLETED':
      return [{ id: 'missao-cumprida', dados: xp ? { xp } : {} }];
    case 'ACHIEVEMENT_UNLOCKED':
      return [{ id: 'conquista-desbloqueada', dados: xp ? { xp } : {} }];
    case 'LEVEL_UP': {
      const nivel = (typeof m.level_name === 'string' ? m.level_name : undefined) ?? ctx.depois?.nivel_nome;
      return [{ id: 'novo-nivel', dados: { ...(xp ? { xp } : {}), ...(nivel ? { nivel } : {}) } }];
    }
    case 'SIMULATION_COMPLETED': {
      const pct = num(m.percentual) ?? num(m.pct) ?? num(m.accuracy);
      return [{ id: `simulado-${faixaSimulado(pct)}`, dados: pct === undefined ? {} : { pct: Math.round(pct) } }];
    }
    default:
      return [];
  }
}

/** Serie de acertos no cliente: conta respostas corretas seguidas e devolve o evento quando chega em 5/10/20. */
export const SERIES_ACERTOS = [5, 10, 20] as const;
export function proximaSerie(seguidas: number, acertou: boolean): { seguidas: number; evento?: EventoApp } {
  if (!acertou) return { seguidas: 0 };
  const n = seguidas + 1;
  return (SERIES_ACERTOS as readonly number[]).includes(n) ? { seguidas: n, evento: { id: `serie-acertos-${n}`, dados: { n } } } : { seguidas: n };
}

/** Bloco `play` que o banco devolve junto de cada resposta/aula (app_gamification_apply... em 20261003008100_arena_regras_conferidas.sql). */
export interface BlocoPlay {
  xp?: { total?: number; valid?: boolean } | null;
  streak_incremented?: boolean;
  stats?: { streak?: number; longest_streak?: number; level?: string } | null;
  level_up?: { from?: string; to?: string; name?: string } | null;
  achievements_unlocked?: { slug?: string; name?: string; xp?: number }[] | null;
}

/**
 * Transforma o bloco `play` de uma resposta no que celebrar. Os valores (sequencia, XP, nivel) sao os do banco, sem recalcular.
 * `recordeAnterior`: streak.longest do resumo lido ANTES desta resposta (para "novo recorde"); `nivelNome`: nome legivel do nivel.
 */
export function mapearBlocoPlay(play: BlocoPlay | null | undefined, ctx: { hoje: string; recordeAnterior?: number; nivelNome?: (slug: string) => string | undefined; antes?: StatsGamificacao }): EventoApp[] {
  if (!play) return [];
  const out: EventoApp[] = [];
  const n = play.stats?.streak;
  if (play.streak_incremented && typeof n === 'number' && n > 0) {
    const antes = ctx.antes ?? { current_streak: n - 1, longest_streak: ctx.recordeAnterior ?? 0 };
    out.push(...mapearVolta(antes, ctx.hoje), ...mapearSequencia(antes, { current_streak: n, longest_streak: Math.max(n, play.stats?.longest_streak ?? 0) }));
  }
  if (play.level_up?.to) {
    const nivel = play.level_up.name ?? ctx.nivelNome?.(play.level_up.to);
    out.push({ id: 'novo-nivel', dados: nivel ? { nivel } : {} });
  }
  for (const a of play.achievements_unlocked ?? []) out.push({ id: 'conquista-desbloqueada', dados: typeof a.xp === 'number' && a.xp > 0 ? { xp: a.xp } : {} });
  return out;
}
