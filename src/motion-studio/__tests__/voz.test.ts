import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATALOGO } from '../celebracoes/catalogo';
import { escolherFala, montarAgenda, slugFala, VOZ_PADRAO } from '../celebracoes/agendaSom';
import { FALA_PROIBIDA, validarCatalogo } from '../celebracoes/schema';
import mapa from '../sound/mapa-eventos.json';
import liberadasJson from '../sound/voz/liberadas.json';
import manifest from '../sound/voz/manifest.json';

const dir = resolve(__dirname, '../sound/voz');
const ARQS = Object.values(manifest as unknown as Record<string, unknown>).find((v) => Array.isArray(v)) as { arquivo: string; texto: string; estilo: string; dur_s: number; dentro_do_limite_1_5s: boolean; eventos: string[] }[];
const LIB = new Set((liberadasJson as { liberadas: string[] }).liberadas);
const ev = (id: string) => CATALOGO.eventos.find((e) => e.id === id)!;

describe('voz da Stazia (Charon): Durona padrao | Stazi | desligada', () => {
  it('todo evento tem fala nos 3 estilos (2 a 6 palavras, sem humilhar) e o catalogo continua valido', () => {
    expect(validarCatalogo(CATALOGO).erros).toEqual([]);
    for (const e of CATALOGO.eventos) {
      expect(e.voz, e.id).toBeDefined();
      for (const t of [e.voz!.stazi, e.voz!.durona, e.voz!.durona_forte]) expect(FALA_PROIBIDA.test(t), t).toBe(false);
    }
  });
  it('arquivos existem; so tocam os <= 1,5 s (liberadas); as longas ficam desligadas e listadas como pendentes', () => {
    // No app so entram os arquivos das falas liberadas; as longas ficam fora do pacote.
    for (const a of ARQS) expect(existsSync(resolve(dir, a.arquivo)), a.arquivo).toBe(a.dentro_do_limite_1_5s);
    for (const a of ARQS) expect(LIB.has(a.arquivo.replace(/\.mp3$/, '')), a.arquivo).toBe(a.dentro_do_limite_1_5s);
    for (const k of LIB) expect(ARQS.find((a) => a.arquivo === `${k}.mp3`)!.dur_s, k).toBeLessThanOrEqual(1.5);
    const pend = (liberadasJson as { pendentes: { texto: string }[] }).pendentes;
    expect(pend.length).toBeGreaterThan(0);
    for (const p of pend) expect(ARQS.filter((a) => a.texto === p.texto).every((a) => !a.dentro_do_limite_1_5s), p.texto).toBe(true);
  });
  it('o slug do texto bate com o nome do arquivo (o motor acha o audio pelo texto)', () => {
    for (const a of ARQS) expect(a.arquivo.split('/')[1].startsWith(`${slugFala(a.texto)}-v`), a.arquivo).toBe(true);
  });
  it('padrao: Durona moderada; forte/sem_filtro usam durona_forte; stazi usa a malandra; desligada = sem fala', () => {
    expect(VOZ_PADRAO).toEqual({ estilo: 'durona', duronaNivel: 'moderada' });
    const m = (mapa as unknown as { _voz: { estilo_padrao: string; durona_nivel_padrao: string } })._voz;
    expect(m.estilo_padrao).toBe('durona');
    expect(m.durona_nivel_padrao).toBe('moderada');
    const e = ev('streak-30');
    expect(escolherFala(e, undefined, 1)!.pasta).toBe('durona');
    expect(escolherFala(e, { estilo: 'durona', duronaNivel: 'forte' }, 1)!.pasta).toBe('durona_forte');
    expect(escolherFala(e, { estilo: 'durona', duronaNivel: 'sem_filtro' }, 1)!.texto).toBe(e.voz!.durona_forte);
    expect(escolherFala(e, { estilo: 'stazi' }, 1)!.texto).toBe(e.voz!.stazi);
    expect(escolherFala(e, { estilo: 'desligada' }, 1)).toBeNull();
    expect(escolherFala(e, undefined, 1, { 'streak-30': 'desligado' })).toBeNull();
  });
  it('micro-eventos so falam de vez em quando (cerca de 1 em 4); eventos de impacto sempre', () => {
    const q = ev('questao-correta');
    let n = 0;
    for (let s = 0; s < 400; s++) if (escolherFala(q, undefined, s)) n++;
    expect(n).toBeGreaterThan(50);
    expect(n).toBeLessThan(160);
    for (let s = 0; s < 50; s++) expect(escolherFala(ev('novo-nivel'), undefined, s)).not.toBeNull();
  });
  it('agenda: a fala so entra se houver audio liberado; efeitos abaixam sob a fala e hee hee/efeitos continuam sem voz', () => {
    const todas = [...LIB];
    const e = ev('desafio-acertado');
    const sem = montarAgenda(e, { voz: { estilo: 'desligada' }, seed: 1, vozesDisponiveis: todas });
    expect(sem.fala).toBeNull();
    expect(sem.agenda.some((c) => c.cue === 'hee-hee')).toBe(true);
    // evento com fala liberada (stazi, curta)
    const com = montarAgenda(e, { voz: { estilo: 'stazi' }, seed: 1, vozesDisponiveis: todas });
    expect(com.fala).not.toBeNull();
    const vc = com.agenda.find((c) => c.cue.startsWith('voz:'))!;
    expect(todas).toContain(vc.cue.slice(4));
    const hh = com.agenda.find((c) => c.cue === 'hee-hee')!;
    const hh0 = sem.agenda.find((c) => c.cue === 'hee-hee')!;
    expect(hh.gain).toBeLessThanOrEqual(hh0.gain); // abaixa sob a fala
    // texto pendente (longo) = sem fala, so efeitos
    const longo = (liberadasJson as { pendentes: { estilo: string; eventos: string[] }[] }).pendentes.find((p) => p.estilo === 'durona' && p.eventos.length === 1)!;
    const sl = montarAgenda(ev(longo.eventos[0]), { voz: { estilo: 'durona', duronaNivel: 'moderada' }, seed: 1, vozesDisponiveis: todas });
    expect(sl.fala).toBeNull();
    expect(sl.agenda.length).toBeGreaterThan(0);
  });
  it('o hee hee do dono nao foi alterado e os efeitos nao dependem da voz', () => {
    for (const e of CATALOGO.eventos) {
      const a = montarAgenda(e, { voz: { estilo: 'desligada' }, seed: 3, vozesDisponiveis: [...LIB] }).agenda.map((c) => c.cue);
      const b = montarAgenda(e, { voz: { estilo: 'stazi' }, seed: 3, vozesDisponiveis: [...LIB] }).agenda.filter((c) => !c.cue.startsWith('voz:')).map((c) => c.cue);
      expect(b, e.id).toEqual(a);
    }
    expect(readFileSync(resolve(__dirname, '../sound/dono/hee-hee.mp3')).length).toBeGreaterThan(1000);
  });
});
