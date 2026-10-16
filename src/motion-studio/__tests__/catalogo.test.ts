import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATALOGO } from '../celebracoes/catalogo';
import { DADOS_DEMO } from '../celebracoes/demoDados';
import { preencher } from '../celebracoes/frases';
import { MAX_FRASE, MIN_FRASES, validarCatalogo } from '../celebracoes/schema';
import { CENARIOS, CUES, type Catalogo } from '../celebracoes/tipos';
import { CENARIO_INFO } from '../celebracoes/cenarios/registro';
import { ALIAS_LEGADO } from '../sound';

const clone = (): Catalogo => JSON.parse(JSON.stringify(CATALOGO));
const ids = CATALOGO.eventos.map((e) => e.id);

describe('catalogo de celebracoes', () => {
  it('e valido pelo schema', () => {
    const r = validarCatalogo(CATALOGO);
    expect(r.erros).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it('cobre todos os eventos minimos pedidos', () => {
    const minimos = [
      'primeiro-dia', 'dia-2', 'dia-3', 'streak-7', 'streak-14', 'streak-30', 'streak-60', 'streak-100', 'streak-365', 'meta-diaria', 'questao-correta',
      'serie-acertos-5', 'serie-acertos-10', 'serie-acertos-20', 'erro-encorajador', 'flashcards-dia', 'aula-concluida', 'missao-cumprida', 'conquista-desbloqueada',
      'novo-nivel', 'xp-ganho', 'ranking-subiu', 'novo-recorde', 'simulado-alto', 'simulado-medio', 'simulado-baixo', 'volta-apos-pausa', 'congelamento-usado', 'plano-finalizado', 'dica-disponivel',
      'desafio-acertado', 'liga-promocao-prata', 'liga-promocao-ouro', 'liga-promocao-platina', 'liga-promocao-diamante', 'liga-promocao-elite', 'liga-promocao-master', 'liga-permanencia', 'liga-rebaixamento', 'liga-primeiro-lugar', 'liga-podio',
    ];
    for (const id of minimos) expect(ids).toContain(id);
  });
  it('tem as 5 intensidades em uso e as regras de intensidade por tipo', () => {
    const usadas = new Set(CATALOGO.eventos.map((e) => e.intensidade));
    for (const i of ['micro', 'pequena', 'media', 'grande', 'epica']) expect(usadas.has(i as never)).toBe(true);
    const por = (id: string) => CATALOGO.eventos.find((e) => e.id === id)!;
    expect(por('dia-2').intensidade).toBe('micro');
    expect(por('dia-3').intensidade).toBe('micro');
    expect(por('questao-correta').intensidade).toBe('micro');
    expect(por('streak-100').intensidade).toBe('epica');
    expect(por('streak-365').intensidade).toBe('epica');
    expect(['grande', 'epica']).toContain(por('streak-30').intensidade);
  });
  it('cada evento tem >= 6 frases, todas com ate 90 caracteres, sem repeticao', () => {
    let total = 0;
    for (const e of CATALOGO.eventos) {
      expect(e.frases.length).toBeGreaterThanOrEqual(MIN_FRASES);
      expect(new Set(e.frases).size).toBe(e.frases.length);
      for (const f of [...e.frases, e.titulo, e.detalhe ?? '']) expect(f.length).toBeLessThanOrEqual(MAX_FRASE);
      total += e.frases.length;
    }
    expect(total).toBeGreaterThanOrEqual(200);
  });
  it('as frases preenchidas com os dados simulados nao deixam chaves soltas e cabem em 90 caracteres', () => {
    for (const e of CATALOGO.eventos) {
      const dados = DADOS_DEMO[e.id];
      expect(dados, `dados demo de ${e.id}`).toBeDefined();
      let usaveis = 0;
      for (const f of [...e.frases, e.titulo]) {
        const t = preencher(f, dados);
        if (t === null) continue;
        usaveis += 1;
        expect(t).not.toMatch(/[{}]/);
        expect(t.length).toBeLessThanOrEqual(MAX_FRASE);
      }
      expect(usaveis).toBeGreaterThanOrEqual(MIN_FRASES);
    }
  });
  it('frases de marcos de sequencia trazem o numero real e a frase-exemplo existe', () => {
    const e = CATALOGO.eventos.find((x) => x.id === 'streak-30')!;
    expect(e.frases).toContain('30 dias. Constância é o melhor diagnóstico.');
    expect(e.frases.some((f) => f.includes('{n}'))).toBe(true);
  });
  it('erro: micro, encorajador, sem particulas e nunca em prova/simulado', () => {
    const e = CATALOGO.eventos.find((x) => x.id === 'erro-encorajador')!;
    expect(e.intensidade).toBe('micro');
    expect(e.efeito.tipo).toBe('nenhum');
    expect(e.bloqueado_em).toEqual(expect.arrayContaining(['prova', 'simulado']));
    expect(e.reacao.coreografia).toBe('encorajar');
  });
  it('cenarios sobrios: todos escuros e cada um tem identidade', () => {
    for (const c of CENARIOS) expect(CENARIO_INFO[c].tinta, c).toBe('escura');
  });
  it('cada cenario registrado e usado e tem identidade', () => {
    const usados = new Set(CATALOGO.eventos.map((e) => e.cenario));
    for (const c of CENARIOS) {
      expect(usados.has(c), `cenario ${c} sem uso`).toBe(true);
      expect(CENARIO_INFO[c].nome.length).toBeGreaterThan(2);
    }
  });
  it('as reacoes variam: pelo menos 5 coreografias e os 9 figurinos em uso', () => {
    expect(new Set(CATALOGO.eventos.map((e) => e.reacao.coreografia)).size).toBeGreaterThanOrEqual(5);
    const figs = new Set(CATALOGO.eventos.flatMap((e) => e.reacao.figurinos));
    for (const f of ['casual', 'bone', 'bomber', 'doutor', 'fone', 'social', 'esports', 'plantao', 'varsity']) expect(figs.has(f as never), f).toBe(true);
    // marcos grandes tem mais de um figurino para o rodizio
    for (const id of ['streak-7', 'streak-14', 'streak-30', 'streak-60', 'streak-100', 'liga-promocao-ouro']) expect(CATALOGO.eventos.find((e) => e.id === id)!.reacao.figurinos.length).toBeGreaterThanOrEqual(2);
  });
  it('tom adulto: poucas exclamacoes, sem palavras infantis, e humor de plantao/residencia aparece', () => {
    const frases = CATALOGO.eventos.flatMap((e) => e.frases);
    const exclam = frases.filter((f) => f.includes('!')).length;
    expect(exclam / frases.length).toBeLessThan(0.08);
    const infantil = /fofo|bonitinho|amiguinho|uhuul|oba!|yay|super-herói|vamos lá, campeão/i;
    for (const f of frases) expect(infantil.test(f), f).toBe(false);
    const texto = frases.join(' ').toLowerCase();
    for (const palavra of ['plantão', 'residência', 'café', 'revalida', 'diagnóstico', 'prontuário']) expect(texto).toContain(palavra);
  });
  it('erro: figurinos acolhedores (nunca oculos escuros) e titulo de recuo tatico', () => {
    const e = CATALOGO.eventos.find((x) => x.id === 'erro-encorajador')!;
    expect(e.reacao.figurinos.every((f) => ['casual', 'plantao'].includes(f))).toBe(true);
    expect(e.titulo).toBe('Recuo tático');
  });
  it('todo cue de som usado (e variantes/curtas) existe como arquivo: efeitos (efeitos/), do dono (dono/) ou legado (legado/wav)', () => {
    const existe = (c: string) => ['efeitos', 'veo', 'dono'].some((d) => existsSync(resolve(__dirname, `../sound/${d}/${c}.mp3`))) || existsSync(resolve(__dirname, `../sound/legado/wav/${c}.wav`));
    for (const e of CATALOGO.eventos) for (const s of e.som) for (const c of [s.cue, ...(s.variantes ?? []), ...(s.curta ? [s.curta] : [])]) expect(existe(c), `${e.id}: ${c}`).toBe(true);
    // no app os WAV antigos (legado/wav) nao entram: o nome antigo toca o arquivo novo equivalente (ALIAS_LEGADO)
    for (const c of CUES) expect(existe(c) || existe(ALIAS_LEGADO[c] ?? ''), c).toBe(true);
  });
});

describe('schema rejeita catalogos ruins (com o caminho do campo)', () => {
  it('frase longa demais', () => {
    const c = clone();
    c.eventos[0].frases[0] = 'x'.repeat(91);
    expect(validarCatalogo(c).erros.join('\n')).toMatch(/frases\[0\].*91 caracteres/);
  });
  it('menos de 6 frases', () => {
    const c = clone();
    c.eventos[1].frases = c.eventos[1].frases.slice(0, 5);
    expect(validarCatalogo(c).erros.join('\n')).toMatch(/minimo de 6 frases/);
  });
  it('pose, cenario, intensidade e cue desconhecidos', () => {
    const c = clone();
    (c.eventos[2].reacao.poses as { climax: string }).climax = 'voando';
    (c.eventos[3] as { cenario: string }).cenario = 'praia';
    (c.eventos[4] as { intensidade: string }).intensidade = 'gigante';
    (c.eventos[6].reacao as { figurinos: string[] }).figurinos = ['astronauta'];
    (c.eventos[5].som[0] as { cue: string }).cue = 'buzina';
    const t = validarCatalogo(c).erros.join('\n');
    expect(t).toMatch(/pose desconhecida: voando/);
    expect(t).toMatch(/cenario desconhecido: praia/);
    expect(t).toMatch(/intensidade/);
    expect(t).toMatch(/cue desconhecido: buzina/);
    expect(t).toMatch(/figurinos/);
  });
  it('tom com culpa ou pressao', () => {
    const c = clone();
    c.eventos[0].frases[0] = 'Você foi preguiçoso, tente de novo.';
    expect(validarCatalogo(c).erros.join('\n')).toMatch(/tom inadequado/);
  });
  it('variavel desconhecida e id repetido', () => {
    const c = clone();
    c.eventos[0].frases[0] = 'Olá {nome}!';
    c.eventos[1].id = c.eventos[0].id;
    const t = validarCatalogo(c).erros.join('\n');
    expect(t).toMatch(/variavel desconhecida \{nome\}/);
    expect(t).toMatch(/id repetido/);
  });
  it('erro com oculos escuros e recusado', () => {
    const c = clone();
    c.eventos.find((x) => x.id === 'erro-encorajador')!.reacao.figurinos = ['bone'];
    expect(validarCatalogo(c).erros.join('\n')).toMatch(/figurinos acolhedores/);
  });
  it('erro nao pode celebrar', () => {
    const c = clone();
    const e = c.eventos.find((x) => x.id === 'erro-encorajador')!;
    e.intensidade = 'grande';
    e.efeito.tipo = 'faiscas';
    e.bloqueado_em = [];
    const t = validarCatalogo(c).erros.join('\n');
    expect(t).toMatch(/nunca celebrar/);
    expect(t).toMatch(/nao tem particulas/);
    expect(t).toMatch(/nunca aparece em prova/);
  });
  it('entrada que nao e objeto', () => {
    expect(validarCatalogo(null).ok).toBe(false);
    expect(validarCatalogo({ versao: 1, eventos: [] }).ok).toBe(false);
  });
});
