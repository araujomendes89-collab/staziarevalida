import { FIGURINOS, type Figurino } from '../mascot/figurinos';
import { prng } from './frases';
import type { EventoCatalogo } from './tipos';

/**
 * Figurino do Stazi para uma celebracao: sorteio com semente estavel entre os figurinos permitidos do evento,
 * evitando os "recentes" (o ultimo usado neste evento e o ultimo de qualquer celebracao). Quando so ha um
 * figurino possivel, usa ele; o mesmo evento nunca repete o mesmo figurino em sequencia se houver alternativa.
 */
export function escolherFigurino(def: EventoCatalogo, seed: number, evitar: readonly (string | undefined)[] = []): Figurino {
  const pool = def.reacao.figurinos.length > 0 ? def.reacao.figurinos : (['casual'] as Figurino[]);
  const [noEvento, global] = [evitar[0], evitar[1]];
  let livres = pool.filter((f) => f !== noEvento && f !== global);
  if (livres.length === 0) livres = pool.filter((f) => f !== noEvento);
  if (livres.length === 0) livres = pool;
  return livres[Math.floor(prng(seed ^ 0x51ed270b)() * livres.length)];
}

export const ehFigurino = (v: string): v is Figurino => (FIGURINOS as readonly string[]).includes(v);
