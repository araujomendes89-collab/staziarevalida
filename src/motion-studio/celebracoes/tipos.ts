import type { PoseName } from '../mascot/StaziMascote';
import type { Figurino } from '../mascot/figurinos';

/** Escala de celebracao (references/gamification.md): nunca transformar pequena acao em festa. */
export const INTENSIDADES = ['micro', 'pequena', 'media', 'grande', 'epica'] as const;
export type Intensidade = (typeof INTENSIDADES)[number];

export const CATEGORIAS = ['sequencia', 'estudo', 'pratica', 'erro', 'progresso', 'social', 'retorno', 'dica'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

/** Cenarios sobrios e cinematograficos (publico adulto: medicos e residentes). Tinta sempre clara sobre fundo escuro. */
export const CENARIOS = ['madrugada', 'estudio-escuro', 'noite-urbana', 'skyline', 'palco', 'hospital-noite', 'arena-esports', 'aurora', 'nevoa', 'mesa-prova', 'ambar', 'ideia', 'horizonte', 'liga'] as const;
export type CenarioId = (typeof CENARIOS)[number];

/** Movimentos contidos e carismaticos (sem saltos): entrada de camera, hold, impacto seco, aceno de cabeca. */
export const COREOGRAFIAS = ['toque', 'impacto', 'cumprimento', 'pensar', 'encorajar', 'despertar', 'espanto'] as const;
export type CoreografiaId = (typeof COREOGRAFIAS)[number];

/** Particulas refinadas: faiscas e ondas de choque (sem confete), poeira de luz e brasas. */
export const EFEITOS = ['nenhum', 'faiscas', 'poeira', 'onda', 'brasas'] as const;
export type EfeitoId = (typeof EFEITOS)[number];

export { FIGURINOS, PAPEIS } from '../mascot/figurinos';
export type { Figurino, Papel } from '../mascot/figurinos';

/** Momentos da coreografia aos quais o som se prende (o tempo de cada um depende da intensidade). */
export const MOMENTOS = ['entrada', 'antecipacao', 'climax', 'pouso', 'numero', 'frase', 'botoes'] as const;
export type Momento = (typeof MOMENTOS)[number];

/**
 * Efeitos da rodada 5: sons GRAVADOS de bancos livres (Kenney CC0, OpenGameArt CC0, Wikimedia Commons CC0/dominio publico), curtos e engracados, sem musica.
 * Arquivos em ../sound/efeitos/<id>.mp3 (creditos em efeitos/creditos.json). Opcoes "-op2/-op3" sao alternativas para o dono escolher.
 * Coins = coins-grande (escolhida pelo dono) e coins-cascata; hee hee do dono e derivados em ../sound/dono/.
 */
export const CUES_NOVOS = [
  /* aprovados pelo dono (bancos livres + moedas) */ 'coins-cascata', 'coins-grande', 'conquista-op2', 'lendaria', 'liga-op3', 'missao-op3', 'nivel-op3', 'recuo-3', 'sequencia-3', 'xp-3',
  /* Veo 3.1 aprovados (rodada 6) */ 'veo-conquista-1', 'veo-conquista-2', 'veo-erro-1', 'veo-erro-2', 'veo-lendaria-1', 'veo-lendaria-2', 'veo-liga-1', 'veo-liga-2', 'veo-missao-1', 'veo-missao-2', 'veo-moeda-1', 'veo-nivel-1', 'veo-nivel-2', 'veo-sequencia-1', 'veo-sequencia-2', 'veo-xp-1', 'veo-xp-2', 'veo-xp-3',
  /* Veo 3.1, rodada 7 (escolhas do dono em 16/10/2026, 20h23) */ 'veo-r7-missao-1', 'veo-r7-missao-2', 'veo-r7-nivel-1', 'veo-r7-nivel-2', 'veo-r7-lendaria-1', 'veo-r7-lendaria-2', 'veo-r7-sequencia-1', 'veo-r7-sequencia-2', 'veo-r7-streak7-1', 'veo-r7-conquista-1', 'veo-r7-conquista-2', 'veo-r7-erro-1',
  /* Veo 3.1, sons de batalha das ligas (escolhas do dono em 16/10/2026, 20h26) */ 'veo-liga-batalha-2', 'veo-liga-sobe-1', 'veo-liga-sobe-2', 'veo-liga-sobe-3', 'veo-liga-desce-1', 'veo-liga-desce-2', 'veo-liga-desce-3', 'veo-liga-manteve-1', 'veo-liga-manteve-1b', 'veo-liga-manteve-2', 'veo-liga-manteve-2b', 'veo-liga-ultrapassa-1', 'veo-liga-resultado-3', 'veo-liga-lendaria-3',
  /* arquivo do dono (direitos confirmados por ele em 15/10/2026) e derivados */ 'hee-hee', 'hee-hee-2', 'hee-hee-3',
] as const;
/** Sons sintetizados por codigo (LEGADO v1): so reserva/comparacao. (As rodadas Lyria infantil e gamer adulto foram arquivadas fora do repositorio.) */
export const CUES_LEGADO = [
  'whoosh-morph', 'pop', 'whoosh-in', 'riser', 'boom', 'sparkle-burst', 'roll', 'ding', 'marker-pop', 'check', 'button-in', 'tap',
  'tick-1', 'tick-2', 'tick-3', 'tick-4', 'tick-5', 'tick-6', 'tick-7', 'fanfare', 'chime-suave', 'swell', 'bubble',
] as const;
export const CUES = [...CUES_NOVOS, ...CUES_LEGADO] as const;
export type CueId = (typeof CUES)[number];

/** Variaveis que as frases e titulos podem usar; os VALORES vem sempre da aplicacao. */
export const VARIAVEIS = ['n', 'xp', 'nivel', 'posicao', 'pct', 'dias', 'acertos', 'total', 'recorde', 'restantes', 'liga', 'coins', 'nivel_liga'] as const;
export type Variavel = (typeof VARIAVEIS)[number];
export type Dados = Partial<Record<Variavel, number | string>>;

export interface SomCue {
  cue: CueId;
  /** Sons aprovados para o mesmo momento: no app, um sorteado por vez, sem repetir o ultimo (ver sorteioSom.ts). A primeira e a padrao da agenda/video. */
  variantes?: CueId[];
  /** Versao curta (2 a 3 s) usada quando a celebracao vem rebaixada (varios eventos juntos). */
  curta?: CueId;
  momento: Momento;
  /** Ajuste fino em ms depois do momento. */
  delta: number;
  gain: number;
}

/** Estilo da voz das falas: Durona (padrao; persona dura do Tutor) | Stazi (malandro) | desligada. */
export const ESTILOS_VOZ = ['durona', 'stazi', 'desligada'] as const;
export type EstiloVoz = (typeof ESTILOS_VOZ)[number];
/** Nivel da Durona (tutor_config.durona_level). moderada = ironia firme (padrao); forte = mais seca; sem_filtro so se o aluno/Administracao ligarem (usa as falas "forte": os limites de respeito nunca mudam). */
export const NIVEIS_DURONA = ['moderada', 'forte', 'sem_filtro'] as const;
export type NivelDurona = (typeof NIVEIS_DURONA)[number];

/** Fala curta (2 a 6 palavras, <= 1,5 s) dita pela voz da Stazi em um evento. */
export interface FalaEvento {
  momento: Momento;
  /** Atraso em ms depois do momento. */
  delta: number;
  /** Micro-eventos: fala so de vez em quando (1 em 4, por semente). */
  ocasional: boolean;
  stazi: string;
  durona: string;
  durona_forte: string;
}

export interface EventoCatalogo {
  id: string;
  rotulo: string;
  categoria: Categoria;
  gatilho: {
    /** Tipo de evento do app (gamification_events.event_type) ou "calculado" quando vem de comparar estados. */
    tipo: string;
    /** Condicao legivel (documentacao) em cima dos dados reais. */
    condicao: string;
    /** De onde ler: tabela/coluna/tela. */
    fonte: string;
  };
  intensidade: Intensidade;
  cenario: CenarioId;
  reacao: {
    coreografia: CoreografiaId;
    poses: { inicio: PoseName; climax: PoseName; final: PoseName };
    /** Figurinos permitidos; a celebracao escolhe um por semente e nunca repete o ultimo usado no mesmo evento. */
    figurinos: Figurino[];
  };
  efeito: { tipo: EfeitoId; densidade: number };
  som: SomCue[];
  /** Numero grande exibido: "rolar" de (n-1) para n, "fixo" mostra o valor, "nenhum". */
  numero: { modo: 'rolar' | 'fixo' | 'nenhum'; variavel: Variavel; unidade: string };
  titulo: string;
  /** Fala da voz (opcional). Audio em ../sound/voz/<estilo>/<slug>-v<k>.mp3. */
  voz?: FalaEvento;
  detalhe?: string;
  frases: string[];
  /** Contextos onde NUNCA aparece (ex.: prova, simulado em andamento). */
  bloqueado_em: ('prova' | 'simulado')[];
  /** Mostra Compartilhar marco quando o app fornece onCompartilhar. */
  compartilhavel: boolean;
  /** Se verdadeiro, so aparece quando gamification_preferences.show_streak = true. */
  requer_show_streak: boolean;
  /** Prioridade quando varios eventos chegam juntos (maior = primeiro). */
  prioridade: number;
}

export interface Catalogo {
  versao: number;
  comentario?: string;
  eventos: EventoCatalogo[];
}

/** Ordem numerica das intensidades. */
export const nivelIntensidade = (i: Intensidade) => INTENSIDADES.indexOf(i);
