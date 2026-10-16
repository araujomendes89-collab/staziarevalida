import type { PoseName } from './StaziMascote';

/** Figurinos do Stazi (mesma lontra, mesma identidade; so a roupa muda). `casual` = moletom azul-marinho com o S (original). */
export const FIGURINOS = ['casual', 'bone', 'bomber', 'doutor', 'fone', 'social', 'esports', 'plantao', 'varsity'] as const;
export type Figurino = (typeof FIGURINOS)[number];
/** Papeis de pose em todo figurino: cruzado (bracos cruzados, sorriso de canto), acao (ajeita oculos, maos nos bolsos, aponta), celebra (comemoracao contida). */
export const PAPEIS = ['cruzado', 'acao', 'celebra'] as const;
export type Papel = (typeof PAPEIS)[number];

export const ROTULO_FIGURINO: Record<Figurino, string> = {
  casual: 'Moletom com o S (original)',
  bone: 'Boné, óculos escuros e corrente',
  bomber: 'Jaqueta bomber e óculos',
  doutor: 'Jaleco, estetoscópio e óculos de aviador',
  fone: 'Fone grande e moletom preto',
  social: 'Camisa social, blazer e óculos escuros',
  esports: 'Jaqueta de e-sports com o S',
  plantao: 'Uniforme de plantão, estetoscópio e café',
  varsity: 'Jaqueta varsity e óculos',
};

/** Pose do figurino `casual` para cada papel (as demais poses casuais continuam disponiveis por nome). */
export const CASUAL_DO_PAPEL: Record<Papel, PoseName> = { cruzado: 'base', acao: 'orgulhosa', celebra: 'polegar' };

/** Pose casual (nome antigo) -> papel equivalente, para vestir o mesmo evento com outro figurino sem trocar a intencao. */
export const PAPEL_DA_POSE: Record<string, Papel> = {
  base: 'cruzado', orgulhosa: 'acao', dormindo: 'cruzado', triste: 'cruzado', agachar: 'cruzado', pouso: 'cruzado',
  pensativo: 'acao', acenando: 'acao', surpreso: 'acao',
  polegar: 'celebra', trofeu: 'celebra', comemorando: 'celebra', emocionado: 'celebra', livro: 'celebra', danca: 'celebra',
};

/** Resolve a pose pedida pelo catalogo (papel ou pose casual) para o sprite do figurino; cai na pose casual se o sprite nao existir. */
export function resolverPose(pose: string, figurino: Figurino, existe: (p: string) => boolean): PoseName {
  const papel = (PAPEIS as readonly string[]).includes(pose) ? (pose as Papel) : PAPEL_DA_POSE[pose];
  if (figurino === 'casual') return ((papel && (PAPEIS as readonly string[]).includes(pose) ? CASUAL_DO_PAPEL[papel] : pose) as PoseName);
  const nome = papel ? `${figurino}-${papel}` : pose;
  return (existe(nome) ? nome : papel ? CASUAL_DO_PAPEL[papel] : pose) as PoseName;
}
