/**
 * URLs dos sons (Vite). Tres origens:
 *  - efeitos/: efeitos GRAVADOS de bancos livres (Kenney CC0, OpenGameArt CC0, Wikimedia Commons CC0/dominio publico), montados localmente; ver efeitos/manifest.json e creditos.json (prompt, seed, corte, LUFS);
 *  - dono/: arquivo(s) fornecido(s) pelo dono, com direitos confirmados (ver dono/LEIAME.md);
 *  - veo/: efeitos do Veo aprovados pelo dono; voz/: so as falas liberadas (<= 1,5 s).
 * No app (ramo celebracoes-app) os sons sinteticos antigos (legado/wav) NAO entram: os nomes antigos de cue
 * so existem como apelido (ALIAS_LEGADO) para os arquivos novos equivalentes.
 */
import mapa from './mapa-eventos.json';
import vozLiberadas from './voz/liberadas.json';

const veo = import.meta.glob('./veo/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const lyria = import.meta.glob('./efeitos/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const dono = import.meta.glob('./dono/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const nome = (p: string) => p.replace(/^.*\//, '').replace(/\.(wav|mp3)$/, '');
const tabela = (g: Record<string, string>) => Object.fromEntries(Object.entries(g).map(([p, u]) => [nome(p), u]));

const voz = import.meta.glob('./voz/*/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

/** Sons sinteticos antigos: fora do app (vazio). */
export const legacySoundUrls: Record<string, string> = {};
/** Falas da voz da Stazi: chave `<pasta>/<slug>-v<k>` (pasta = durona | durona_forte | stazi) -> URL. Vazio se as falas ainda nao foram geradas. */
export const vozTodasUrls: Record<string, string> = Object.fromEntries(Object.entries(voz).map(([p, u]) => [p.replace('./voz/', '').replace(/\.mp3$/, ''), u]));
/** So as falas liberadas (<= 1,5 s, ver voz/liberadas.json); as longas ficam desligadas ate serem encurtadas e aprovadas pelo dono. */
const liberadas = new Set<string>((vozLiberadas as { liberadas: string[] }).liberadas);
export const vozSoundUrls: Record<string, string> = Object.fromEntries(Object.entries(vozTodasUrls).filter(([k]) => liberadas.has(k)));
export const vozPendentes = (vozLiberadas as { pendentes: { estilo: string; texto: string; menor_dur_s: number; eventos: string[] }[] }).pendentes;

/** Efeitos (efeitos/) + arquivos do dono (dono/). Nome historico mantido por compatibilidade. */
export const lyriaSoundUrls: Record<string, string> = { ...tabela(lyria), ...tabela(veo), ...tabela(dono) };
export const donoSoundUrls: Record<string, string> = tabela(dono);

/** Nome antigo -> arquivo novo equivalente (a celebracao da sequencia diaria v1 passa a soar com os sons novos sem mudar de codigo). */
export const ALIAS_LEGADO: Record<string, string> = {
  pop: 'veo-xp-1', 'marker-pop': 'veo-xp-2', bubble: 'veo-xp-3', tap: 'veo-xp-1', 'button-in': 'veo-xp-2', check: 'coins-cascata', ding: 'veo-xp-3', roll: 'veo-sequencia-2',
  riser: 'veo-sequencia-1', boom: 'veo-nivel-1', 'sparkle-burst': 'coins-cascata', 'whoosh-in': 'veo-erro-1', 'whoosh-morph': 'veo-sequencia-2', fanfare: 'veo-conquista-2',
  'chime-suave': 'veo-erro-2', swell: 'veo-sequencia-1', 'tick-1': 'veo-xp-1', 'tick-2': 'veo-xp-2', 'tick-3': 'veo-xp-3', 'tick-4': 'veo-xp-1', 'tick-5': 'veo-xp-2', 'tick-6': 'veo-xp-3', 'tick-7': 'veo-xp-1',
};

function resolver(): Record<string, string> {
  const out: Record<string, string> = { ...legacySoundUrls };
  for (const [antigo, novo] of Object.entries(ALIAS_LEGADO)) if (lyriaSoundUrls[novo]) out[antigo] = lyriaSoundUrls[novo];
  return { ...out, ...lyriaSoundUrls };
}
/** Todos os cues (novos + antigos por alias). Padrao do componente. */
export const streakSoundUrls: Record<string, string> = resolver();
/** So os sons originais (sem alias): usado pela folha de escuta. */
export const soundUrls = streakSoundUrls;

export interface SomDeEvento {
  url: string;
  momento: string;
  gain: number;
}
/** Mapa evento -> arquivo configuravel (sound/mapa-eventos.json), ja com a URL resolvida. */
export const somPorEvento: Record<string, SomDeEvento> = Object.fromEntries(
  Object.entries(mapa as Record<string, unknown>)
    .filter(([k, v]) => !k.startsWith('_') && typeof v === 'object' && v !== null)
    .map(([k, v]) => {
      const m = v as { arquivo: string; momento?: string; gain?: number };
      const base = nome(m.arquivo);
      return [k, { url: lyriaSoundUrls[base] ?? '', momento: m.momento ?? 'climax', gain: m.gain ?? 1 }];
    })
    .filter(([, v]) => (v as SomDeEvento).url),
);

/** Configuracao de voz do mapa (sound/mapa-eventos.json): estilo padrao, nivel padrao da Durona e liga/desliga por evento. */
const cfgVoz = (mapa as unknown as { _voz?: { estilo_padrao?: string; durona_nivel_padrao?: string }; _voz_por_evento?: Record<string, string> });
export const VOZ_CONFIG = {
  estilo: (cfgVoz._voz?.estilo_padrao ?? 'durona') as 'durona' | 'stazi' | 'desligada',
  duronaNivel: (cfgVoz._voz?.durona_nivel_padrao ?? 'moderada') as 'moderada' | 'forte' | 'sem_filtro',
};
export const vozPorEvento: Record<string, string> = cfgVoz._voz_por_evento ?? {};

export { buildCueSchedule, createSoundEngine, DEFAULT_VOLUME, MUTE_KEY, UI_TAP } from './soundEngine';
export type { SoundEngine, SoundCue } from './soundEngine';

export const efeitoSoundUrls = lyriaSoundUrls;
