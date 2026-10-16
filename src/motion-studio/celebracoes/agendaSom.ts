import { CATALOGO } from './catalogo';
import { momentoMs } from './coreografia';
import type { EstiloVoz, EventoCatalogo, Intensidade, Momento, NivelDurona } from './tipos';
import { prng } from './frases';
import manifestLyria from '../sound/efeitos/manifest.json';
import manifestVeo from '../sound/veo/manifest.json';

/** Preferencia de voz do aluno: estilo + nivel da Durona (tutor_config.durona_level). Padrao do app: Durona, nivel moderada. */
export interface PreferenciaVoz {
  estilo?: EstiloVoz;
  duronaNivel?: NivelDurona;
}
export const VOZ_PADRAO: Required<PreferenciaVoz> = { estilo: 'durona', duronaNivel: 'moderada' };

/** Duracao (s) dos sons de efeito, para abaixar (duck) os efeitos sob a fala. */
const DUR: Record<string, number> = { ...Object.fromEntries(Object.entries({ ...(manifestLyria as object), ...(manifestVeo as object) } as unknown as Record<string, { dur_s: number }>).map(([k, v]) => [k, v.dur_s])), 'hee-hee': 0.93, 'hee-hee-2': 0.78, 'hee-hee-3': 1.11 };

/** slug do texto da fala (mesmo do gerador de voz): sem acento, minusculo, hifens. */
export function slugFala(t: string): string {
  return t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export interface FalaEscolhida {
  /** Pasta de estilo no disco: durona (moderada) | durona_forte | stazi. */
  pasta: 'durona' | 'durona_forte' | 'stazi';
  texto: string;
  slug: string;
  /** Chave do arquivo (sem variacao): `<pasta>/<slug>`; o motor sorteia -v1..-vN entre as que existem. */
  chave: string;
}

/**
 * Escolhe a fala do evento para a preferencia do aluno. Durona e o padrao; sem_filtro usa as falas "forte" (nenhum limite de respeito muda);
 * "desligada" ou evento marcado "desligado" no mapa = sem fala (os efeitos continuam). Micro-eventos falam so de vez em quando (1 em 4, por semente).
 */
export function escolherFala(def: EventoCatalogo, pref: PreferenciaVoz | undefined, seed: number, porEvento: Readonly<Record<string, string>> = {}): FalaEscolhida | null {
  const v = def.voz;
  if (!v) return null;
  const estilo = pref?.estilo ?? VOZ_PADRAO.estilo;
  if (estilo === 'desligada') return null;
  if (porEvento[def.id] === 'desligado') return null;
  if (v.ocasional && Math.floor(prng(seed ^ 0x2f6b)() * 4) !== 0) return null;
  const nivel = pref?.duronaNivel ?? VOZ_PADRAO.duronaNivel;
  const pasta = estilo === 'stazi' ? 'stazi' : nivel === 'moderada' ? 'durona' : 'durona_forte';
  const texto = pasta === 'stazi' ? v.stazi : pasta === 'durona' ? v.durona : v.durona_forte;
  const slug = slugFala(texto);
  return { pasta, texto, slug, chave: `${pasta}/${slug}` };
}

export interface CueAgendado {
  cue: string;
  at: number;
  gain: number;
}

export interface OpcoesAgenda {
  intensidade?: Intensidade;
  /** Rodizio (indice) das variantes de efeito: deterministico (video, folha de escuta, testes). Ignorado quando ha `sortear`. */
  rodizio?: number;
  /** No app: sorteia um dos sons aprovados de cada momento, sem repetir o ultimo (ver sorteioSom.ts). */
  sortear?: (variantes: readonly string[]) => string;
  rebaixada?: boolean;
  voz?: PreferenciaVoz;
  seed?: number;
  /** Arquivos de fala existentes (chave `<pasta>/<slug>-v<k>`): escolhe a variacao pela semente. */
  vozesDisponiveis?: readonly string[];
  vozPorEvento?: Readonly<Record<string, string>>;
}

/** Fracao do ganho dos efeitos que se sobrepoem a fala (duck), para a fala ficar inteligivel. */
export const DUCK = 0.45;

/** Agenda completa (efeitos + fala) de um evento: a MESMA usada pelo componente, pela folha de escuta e pelo video. */
export function montarAgenda(def: EventoCatalogo, o: OpcoesAgenda = {}): { agenda: CueAgendado[]; fala: (FalaEscolhida & { arquivo: string; variacao: number }) | null } {
  const inten = o.intensidade ?? def.intensidade;
  const rodizio = o.rodizio ?? 0;
  const agenda: CueAgendado[] = def.som
    .map((x) => {
      const cue = o.rebaixada && x.curta ? x.curta : x.variantes && x.variantes.length > 1 ? (o.sortear ? o.sortear(x.variantes) : x.variantes[rodizio % x.variantes.length]) : x.cue;
      return { cue, at: momentoMs(inten, x.momento) + x.delta, gain: x.gain };
    })
    .sort((a, b) => a.at - b.at);
  const f = escolherFala(def, o.voz, o.seed ?? 0, o.vozPorEvento);
  if (!f) return { agenda, fala: null };
  const livres = (o.vozesDisponiveis ?? []).filter((k) => k.startsWith(`${f.chave}-v`));
  if (livres.length === 0) return { agenda, fala: null };
  const variacao = Math.floor(prng((o.seed ?? 0) ^ 0x9e37)() * livres.length);
  const arquivo = [...livres].sort()[variacao];
  const at = momentoMs(inten, def.voz!.momento as Momento) + def.voz!.delta;
  const fim = at + 1500;
  const ducked = agenda.map((c) => {
    const d = (DUR[c.cue] ?? 2.5) * 1000;
    return c.at < fim && c.at + d > at ? { ...c, gain: c.gain * DUCK } : c;
  });
  return { agenda: [...ducked, { cue: `voz:${arquivo}`, at, gain: 1 }].sort((a, b) => a.at - b.at), fala: { ...f, arquivo, variacao: variacao + 1 } };
}

export { CATALOGO };
