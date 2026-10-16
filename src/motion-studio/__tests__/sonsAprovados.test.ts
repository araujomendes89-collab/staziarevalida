import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATALOGO } from '../celebracoes/catalogo';
import { montarAgenda } from '../celebracoes/agendaSom';
import { validarCatalogo } from '../celebracoes/schema';
import { chaveDoConjunto, criarSorteio, memoriaLocal, sortearVariante, type MemoriaSorteio } from '../celebracoes/sorteioSom';
import veo from '../sound/veo/manifest.json';
import { lyriaSoundUrls } from '../sound';

/** Escolhas do dono de 16/10/2026: rodada 7 (20h23) e sons de batalha das ligas (20h26). */
const ev = (id: string) => CATALOGO.eventos.find((e) => e.id === id)!;
const sonsDe = (id: string) => ev(id).som.filter((s) => !s.cue.startsWith('hee-hee')).map((s) => (s.variantes && s.variantes.length > 1 ? s.variantes : [s.cue]));
const SOBE = ['veo-liga-sobe-1', 'veo-liga-sobe-2', 'veo-liga-sobe-3'];

const APROVADOS: Record<string, string[]> = {
  'missao-cumprida': ['veo-r7-missao-1', 'veo-r7-missao-2'],
  'novo-nivel': ['veo-r7-nivel-1', 'veo-r7-nivel-2'],
  'streak-100': ['veo-r7-lendaria-1', 'veo-r7-lendaria-2'],
  'streak-365': ['veo-r7-lendaria-1', 'veo-r7-lendaria-2'],
  'primeiro-dia': ['veo-r7-sequencia-1', 'veo-r7-sequencia-2'],
  'dia-2': ['veo-r7-sequencia-1', 'veo-r7-sequencia-2'],
  'dia-3': ['veo-r7-sequencia-1', 'veo-r7-sequencia-2'],
  'streak-dia-comum': ['veo-r7-sequencia-1', 'veo-r7-sequencia-2'],
  'streak-7': ['veo-r7-streak7-1'],
  // simulado: os 4 aprovados divididos pelo resultado (festa no alto, "ka-ching" no medio, "wah-wah" gentil no baixo)
  'simulado-alto': ['veo-r7-conquista-1', 'veo-r7-conquista-2'],
  'simulado-medio': ['veo-r7-missao-2'],
  'simulado-baixo': ['veo-r7-erro-1'],
  // ligas
  'liga-inicio-semana': ['veo-liga-batalha-2'],
  'liga-promocao-prata': SOBE,
  'liga-promocao-ouro': SOBE,
  'liga-promocao-platina': SOBE,
  'liga-promocao-diamante': SOBE,
  'liga-promocao-elite': SOBE,
  'liga-rebaixamento': ['veo-liga-desce-1', 'veo-liga-desce-2', 'veo-liga-desce-3'],
  'liga-permanencia': ['veo-liga-manteve-1', 'veo-liga-manteve-1b', 'veo-liga-manteve-2', 'veo-liga-manteve-2b'],
  'ranking-subiu': ['veo-liga-ultrapassa-1'],
  'liga-podio': ['veo-liga-resultado-3'],
  'liga-promocao-master': ['veo-liga-lendaria-3'],
  'liga-primeiro-lugar': ['veo-liga-lendaria-3'],
};

/** "Manter o atual": acerto, erro, XP, moeda, conquista desbloqueada, flashcards e plano do dia nao mudam. */
const MANTIDOS: Record<string, string[][]> = {
  'questao-correta': [['veo-xp-1', 'veo-xp-2', 'veo-xp-3']],
  'erro-encorajador': [['veo-erro-2', 'veo-erro-1']],
  'xp-ganho': [['veo-xp-3', 'veo-xp-2', 'veo-xp-1']],
  'congelamento-usado': [['coins-cascata', 'coins-grande']],
  'conquista-desbloqueada': [['veo-conquista-2']],
  'flashcards-dia': [['coins-grande']],
  'plano-finalizado': [['veo-nivel-1']],
  'meta-diaria': [['veo-missao-2', 'missao-op3'], ['coins-grande', 'veo-moeda-1']],
};

describe('mapa de sons: escolhas do dono de 16/10 (rodada 7 e ligas)', () => {
  it('o catalogo continua valido', () => {
    expect(validarCatalogo(CATALOGO).erros).toEqual([]);
  });
  it('cada evento trocado toca so os sons aprovados', () => {
    for (const [id, sons] of Object.entries(APROVADOS)) expect(sonsDe(id), id).toEqual([sons]);
  });
  it('"manter o atual": os eventos que o dono nao trocou continuam com os mesmos sons', () => {
    for (const [id, sons] of Object.entries(MANTIDOS)) expect(sonsDe(id), id).toEqual(sons);
  });
  it('o hee hee do dono continua fechando missao, nivel e ligas, sempre depois do som novo terminar', () => {
    const M = veo as unknown as Record<string, { dur_s: number }>;
    for (const id of ['missao-cumprida', 'novo-nivel', 'ranking-subiu', 'liga-podio', 'liga-promocao-master', 'liga-primeiro-lugar', ...['prata', 'ouro', 'platina', 'diamante', 'elite'].map((l) => `liga-promocao-${l}`)]) {
      const hee = ev(id).som.find((s) => s.cue.startsWith('hee-hee'));
      expect(hee, id).toBeDefined();
      const maior = Math.max(...sonsDe(id)[0].map((c) => M[c].dur_s));
      expect(hee!.delta / 1000, id).toBeGreaterThanOrEqual(maior);
      expect(hee!.delta / 1000 - maior, id).toBeLessThan(0.2); // sem buraco de silencio antes do hee hee
    }
  });
  it('todo som aprovado tem arquivo no app (veo/), entra nas URLs do motor e esta registrado com os eventos onde toca', () => {
    const M = veo as unknown as Record<string, { rodada?: number | string; eventos_app?: string[]; aprovado_pelo_dono: boolean; kb: number }>;
    const usados = new Map<string, Set<string>>();
    for (const [id, sons] of Object.entries(APROVADOS)) for (const c of sons) (usados.get(c) ?? usados.set(c, new Set()).get(c)!).add(id);
    for (const [c, eventos] of usados) {
      const f = resolve(__dirname, `../sound/veo/${c}.mp3`);
      expect(existsSync(f), c).toBe(true);
      expect(Math.abs(statSync(f).size / 1024 - M[c].kb), c).toBeLessThan(0.11);
      expect(lyriaSoundUrls[c], c).toBeTruthy();
      expect(M[c].aprovado_pelo_dono, c).toBe(true);
      expect([...eventos].sort(), c).toEqual([...(M[c].eventos_app ?? [])].sort());
    }
    // nada da rodada 7 / ligas ficou registrado sem estar ligado a um evento
    for (const [c, v] of Object.entries(M)) if (v.rodada === 7 || v.rodada === 'ligas') expect(usados.has(c), c).toBe(true);
  });
  it('sons de liga so nos eventos de liga/ranking; sons da rodada 7 nunca nas ligas', () => {
    for (const e of CATALOGO.eventos) {
      const todos = e.som.flatMap((s) => [s.cue, ...(s.variantes ?? [])]);
      const deLiga = /^liga-|^ranking-subiu$/.test(e.id);
      if (!deLiga) expect(todos.filter((c) => /^veo-liga-(batalha|sobe|desce|manteve|ultrapassa|resultado|lendaria)/.test(c)), e.id).toEqual([]);
      else expect(todos.filter((c) => c.startsWith('veo-r7-')), e.id).toEqual([]);
    }
  });
});

const memoria = (): MemoriaSorteio & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return { dados, ler: (k) => dados.get(k), gravar: (k, c) => void dados.set(k, c) };
};
/** Gerador previsivel (testes): LCG simples em [0, 1). */
const gerador = (s = 7) => () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);

describe('sorteio dos sons aprovados (um por vez, sem repetir o ultimo)', () => {
  it('um so som: sempre ele; lista vazia: erro claro', () => {
    expect(sortearVariante(['a'], 'a')).toBe('a');
    expect(() => sortearVariante([], undefined)).toThrow(/lista vazia/);
  });
  it('nunca repete o ultimo e, com o tempo, usa todos os aprovados (2, 3 e 4 sons)', () => {
    for (const lista of [APROVADOS['novo-nivel'], APROVADOS['liga-rebaixamento'], APROVADOS['liga-permanencia']]) {
      const s = criarSorteio(memoria(), gerador());
      const saidas = Array.from({ length: 200 }, () => s(lista));
      for (let i = 1; i < saidas.length; i++) expect(saidas[i]).not.toBe(saidas[i - 1]);
      expect(new Set(saidas)).toEqual(new Set(lista));
      for (const c of lista) expect(saidas.filter((x) => x === c).length).toBeGreaterThan(200 / lista.length / 3); // sem som esquecido
    }
  });
  it('com 2 sons alterna; o primeiro da sessao e sorteado (nao e sempre o mesmo)', () => {
    const primeiros = new Set(Array.from({ length: 40 }, (_, k) => criarSorteio(memoria(), gerador(k + 1))(APROVADOS['missao-cumprida'])));
    expect(primeiros.size).toBe(2);
  });
  it('a memoria e do conjunto de sons: dia 2, dia 3 e dia comum (mesmos sons) nao repetem entre si; a ordem da lista nao importa', () => {
    const m = memoria();
    const s = criarSorteio(m, gerador(3));
    const a = s(sonsDe('dia-2')[0]);
    const b = s(sonsDe('dia-3')[0]);
    const c = s([...sonsDe('streak-dia-comum')[0]].reverse());
    expect(b).not.toBe(a);
    expect(c).not.toBe(b);
    expect(chaveDoConjunto(['b', 'a'])).toBe(chaveDoConjunto(['a', 'b']));
    expect(m.dados.size).toBe(1);
  });
  it('a memoria fica no aparelho (vale de um dia para o outro) e sem localStorage o sorteio segue funcionando', () => {
    localStorage.clear();
    const lista = APROVADOS['liga-rebaixamento'];
    const ultimo = criarSorteio(memoriaLocal('teste:sorteio'))(lista);
    // "outro dia": memoria nova lendo o mesmo aparelho
    for (let i = 0; i < 20; i++) {
      const m = memoriaLocal('teste:sorteio');
      const antes = m.ler(chaveDoConjunto(lista));
      const agora = criarSorteio(m)(lista);
      expect(agora).not.toBe(antes);
    }
    expect(ultimo).toBeTruthy();
    localStorage.setItem('teste:quebrado', '{nao e json');
    expect(criarSorteio(memoriaLocal('teste:quebrado'))(lista)).toMatch(/^veo-liga-desce-/);
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('cheio');
    };
    try {
      const m = memoriaLocal('teste:cheio');
      const s = criarSorteio(m, gerador(5));
      const x = s(lista);
      expect(s(lista)).not.toBe(x); // sem gravar no aparelho, a memoria da sessao ainda evita repetir
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
  it('agenda: no app usa o sorteio; video/escuta (sem sorteio) ficam no primeiro som, como antes', () => {
    const e = ev('liga-promocao-ouro');
    const pedidos: string[][] = [];
    const a = montarAgenda(e, { voz: { estilo: 'desligada' }, sortear: (l) => (pedidos.push([...l]), l[2]) });
    expect(pedidos).toEqual([SOBE]);
    expect(a.agenda.map((c) => c.cue)).toContain('veo-liga-sobe-3');
    expect(montarAgenda(e, { voz: { estilo: 'desligada' } }).agenda.map((c) => c.cue)).toContain('veo-liga-sobe-1');
    // evento de um som so nao chama o sorteio
    montarAgenda(ev('streak-7'), { voz: { estilo: 'desligada' }, sortear: () => { throw new Error('nao devia sortear'); } });
  });
});
