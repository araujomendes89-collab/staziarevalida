import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { CUES_NOVOS } from '../celebracoes/tipos';
import { CATALOGO } from '../celebracoes/catalogo';
import mapa from '../sound/mapa-eventos.json';
import manifest from '../sound/efeitos/manifest.json';
import creditos from '../sound/efeitos/creditos.json';

const dir = resolve(__dirname, '../sound');
const SHA256_HEE_HEE_ORIGINAL = 'cc34c2224f38824311ac06c76b499823e6a480ede704da76274e3ce89c0e473b';
interface Cred { chave: string; fonte: string; licenca: string; url: string; autor: string; titulo: string }
interface Info { descricao: string; dur_s: number; pico_db: number; kb: number; fontes: string[]; tchan: boolean; origem: string; creditos: Cred[]; escolhida_pelo_dono?: boolean }
const M = manifest as unknown as Record<string, Info>;
const ev = (id: string) => CATALOGO.eventos.find((e) => e.id === id)!;
const LONGOS = /^(liga|lendaria)/;
const GRUPOS = ['conquista', 'missao', 'nivel', 'liga', 'lendaria'];

describe('efeitos gravados de bancos livres (rodada 5, agora alternativas)', () => {
  it('todo cue existe como mp3 em efeitos/ (ou dono/ para o hee hee) e tem manifest', () => {
    for (const c of CUES_NOVOS) {
      if (c.startsWith('veo-')) continue; // ver sonsVeo.test.ts
      if (c.startsWith('hee-hee')) { expect(existsSync(resolve(dir, `dono/${c}.mp3`)), c).toBe(true); continue; }
      expect(existsSync(resolve(dir, `efeitos/${c}.mp3`)), c).toBe(true);
      expect(M[c], c).toBeDefined();
    }
  });
  it('licenca: toda gravacao usada e CC0 ou dominio publico, de Kenney, OpenGameArt ou Wikimedia Commons, com autor e URL', () => {
    const fontes = (creditos as unknown as { fontes: Record<string, Cred> }).fontes;
    for (const [cue, m] of Object.entries(M)) {
      if (m.fontes.includes('proprio')) continue; // coins-grande/coins-cascata: montagem propria (escolhida pelo dono)
      expect(m.creditos.length, cue).toBeGreaterThan(0);
      for (const c of m.creditos) {
        expect(c.licenca, `${cue}: ${c.titulo}`).toMatch(/^(CC0|Public domain)/i);
        expect(['Kenney.nl', 'OpenGameArt.org', 'Wikimedia Commons']).toContain(c.fonte);
        expect(c.url, cue).toMatch(/^https:\/\/(kenney\.nl|opengameart\.org|commons\.wikimedia\.org)\//);
        expect(c.autor.length).toBeGreaterThan(0);
        expect(fontes[c.chave], c.chave).toBeDefined();
      }
      expect(m.origem).toMatch(/GRAVADOS/);
      expect(m.origem).toMatch(/nenhum som gerado por IA/);
    }
    // nada de Freesound com atribuicao, nada de Nintendo/Duolingo
    const txt = JSON.stringify(creditos).toLowerCase();
    for (const proibido of ['nintendo', 'duolingo', 'mario', 'cc-by', 'cc by-nc', 'freesound.org']) expect(txt.includes(proibido), proibido).toBe(false);
  });
  it('efeitos curtos, nunca trecho musical: <= 1,5 s (liga e lendaria <= 2,5 s), >= 0,25 s, pico <= -3 dBFS, mp3 pequeno', () => {
    for (const [cue, m] of Object.entries(M)) {
      const max = LONGOS.test(cue) ? 2.5 : cue === 'coins-grande' ? 1.5 : 1.5;
      expect(m.dur_s, cue).toBeLessThanOrEqual(max);
      expect(m.dur_s, cue).toBeGreaterThanOrEqual(0.25);
      expect(m.pico_db, cue).toBeLessThanOrEqual(-2.9);
      const kb = statSync(resolve(dir, `efeitos/${cue}.mp3`)).size / 1024;
      expect(kb, cue).toBeLessThanOrEqual(25);
      const b = readFileSync(resolve(dir, `efeitos/${cue}.mp3`));
      expect(b[0] === 0x49 || b[0] === 0xff, `${cue}: mp3`).toBe(true);
    }
  });
  it('so o hee hee do dono entra: os outros arquivos da pasta Sons nao estao em lugar nenhum; nada da rodada Lyria no repositorio', () => {
    const todos: string[] = [];
    const varrer = (d: string) => readdirSync(d, { withFileTypes: true }).forEach((x) => (x.isDirectory() ? varrer(resolve(d, x.name)) : todos.push(x.name.toLowerCase())));
    varrer(dir);
    for (const p of ['dexter', 'dun-dun', 'nemesis', 'tf_']) expect(todos.some((n) => n.includes(p)), p).toBe(false);
    expect(existsSync(resolve(dir, 'lyria'))).toBe(false);
    expect(existsSync(resolve(dir, 'legado'))).toBe(false); // no app os WAV sinteticos antigos nao entram
  });
});
