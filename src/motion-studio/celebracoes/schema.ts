import { CATEGORIAS, CENARIOS, COREOGRAFIAS, CUES, EFEITOS, FIGURINOS, INTENSIDADES, MOMENTOS, VARIAVEIS, type Catalogo, type EventoCatalogo } from './tipos';
import type { PoseName } from '../mascot/StaziMascote';

/**
 * Validacao do catalogo de celebracoes (sem dependencia nova: o Zod nao esta instalado no projeto;
 * as regras abaixo sao as mesmas de um schema Zod e podem ser portadas 1:1 se ele entrar).
 * Retorna TODOS os erros de uma vez, com o caminho do campo, para o dono/equipe corrigir o JSON.
 */
export const POSES_CONHECIDAS: readonly PoseName[] = ['base', 'agachar', 'comemorando', 'pouso', 'orgulhosa', 'acenando', 'polegar', 'pensativo', 'surpreso', 'triste', 'dormindo', 'trofeu', 'emocionado', 'livro', 'danca'];
export const MAX_FRASE = 90;
export const MIN_FRASES = 6;
/** Palavras que carregam culpa, pressao ou julgamento: proibidas em qualquer frase (tom do Stazi: acolhedor). */
export const PALAVRAS_PROIBIDAS = /preguiç|fracass|desist|falhou|vergonha|decepcion|culpad|não deixe|última chance|ruim demais|burro/i;

/** Falas: sem humilhar o aluno, sem palavrao pesado, sem ofensa de genero/raca/classe. */
export const FALA_PROIBIDA = /burro|idiota|imbecil|incompetente|in[uú]til|lixo|vergonha|fracassad|desiste|caralho|porra|merda|foda|puta|buceta|viado|preto|macaco|pobre|mulherzinha|retardad|ot[aá]rio/i;
export const MAX_PALAVRAS_FALA = 6;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function variaveisDe(texto: string): string[] {
  return Array.from(texto.matchAll(/\{(\w+)\}/g), (m) => m[1]);
}

export interface ResultadoValidacao {
  ok: boolean;
  erros: string[];
}

export function validarCatalogo(c: unknown): ResultadoValidacao {
  const erros: string[] = [];
  const err = (caminho: string, msg: string) => erros.push(`${caminho}: ${msg}`);
  if (typeof c !== 'object' || c === null) return { ok: false, erros: ['catalogo: precisa ser um objeto'] };
  const cat = c as Partial<Catalogo>;
  if (!Number.isInteger(cat.versao)) err('versao', 'inteiro obrigatorio');
  if (!Array.isArray(cat.eventos) || cat.eventos.length === 0) return { ok: false, erros: [...erros, 'eventos: lista obrigatoria'] };
  const ids = new Set<string>();
  cat.eventos.forEach((e: EventoCatalogo, i) => {
    const p = `eventos[${i}${e?.id ? `:${e.id}` : ''}]`;
    if (typeof e !== 'object' || e === null) return err(p, 'objeto obrigatorio');
    if (typeof e.id !== 'string' || !KEBAB.test(e.id)) err(`${p}.id`, 'kebab-case obrigatorio');
    else if (ids.has(e.id)) err(`${p}.id`, 'id repetido');
    else ids.add(e.id);
    if (!e.rotulo) err(`${p}.rotulo`, 'obrigatorio');
    if (!(CATEGORIAS as readonly string[]).includes(e.categoria)) err(`${p}.categoria`, `use um de ${CATEGORIAS.join(', ')}`);
    if (!e.gatilho || !e.gatilho.tipo || !e.gatilho.condicao || !e.gatilho.fonte) err(`${p}.gatilho`, 'tipo, condicao e fonte obrigatorios');
    if (!(INTENSIDADES as readonly string[]).includes(e.intensidade)) err(`${p}.intensidade`, `use um de ${INTENSIDADES.join(', ')}`);
    if (!(CENARIOS as readonly string[]).includes(e.cenario)) err(`${p}.cenario`, `cenario desconhecido: ${e.cenario}`);
    if (!e.reacao || !(COREOGRAFIAS as readonly string[]).includes(e.reacao.coreografia)) err(`${p}.reacao.coreografia`, `use um de ${COREOGRAFIAS.join(', ')}`);
    for (const k of ['inicio', 'climax', 'final'] as const) {
      if (!e.reacao?.poses || !(POSES_CONHECIDAS as readonly string[]).includes(e.reacao.poses[k])) err(`${p}.reacao.poses.${k}`, `pose desconhecida: ${e.reacao?.poses?.[k]}`);
    }
    if (!Array.isArray(e.reacao?.figurinos) || e.reacao.figurinos.length === 0 || !e.reacao.figurinos.every((f) => (FIGURINOS as readonly string[]).includes(f))) err(`${p}.reacao.figurinos`, `lista de figurinos validos (${FIGURINOS.join(', ')})`);
    else if (e.categoria === 'erro' && e.reacao.figurinos.some((f) => !['casual', 'plantao'].includes(f))) err(`${p}.reacao.figurinos`, 'erro so usa figurinos acolhedores (casual, plantao), nunca oculos escuros');
    if (!e.efeito || !(EFEITOS as readonly string[]).includes(e.efeito.tipo)) err(`${p}.efeito.tipo`, `use um de ${EFEITOS.join(', ')}`);
    else if (typeof e.efeito.densidade !== 'number' || e.efeito.densidade < 0 || e.efeito.densidade > 1) err(`${p}.efeito.densidade`, 'numero de 0 a 1');
    if (!Array.isArray(e.som)) err(`${p}.som`, 'lista obrigatoria');
    else
      e.som.forEach((s, j) => {
        if (!(CUES as readonly string[]).includes(s.cue)) err(`${p}.som[${j}].cue`, `cue desconhecido: ${s.cue}`);
        for (const v of [...(s.variantes ?? []), ...(s.curta ? [s.curta] : [])]) if (!(CUES as readonly string[]).includes(v)) err(`${p}.som[${j}]`, `cue desconhecido: ${v}`);
        if (!(MOMENTOS as readonly string[]).includes(s.momento)) err(`${p}.som[${j}].momento`, `use um de ${MOMENTOS.join(', ')}`);
        if (typeof s.gain !== 'number' || s.gain <= 0 || s.gain > 1) err(`${p}.som[${j}].gain`, 'entre 0 e 1');
        if (typeof s.delta !== 'number') err(`${p}.som[${j}].delta`, 'numero (ms)');
      });
    if (!e.numero || !['rolar', 'fixo', 'nenhum'].includes(e.numero.modo) || !(VARIAVEIS as readonly string[]).includes(e.numero.variavel)) err(`${p}.numero`, 'modo (rolar|fixo|nenhum) e variavel valida obrigatorios');
    if (!e.titulo || e.titulo.length > MAX_FRASE) err(`${p}.titulo`, `obrigatorio e ate ${MAX_FRASE} caracteres`);
    if (e.detalhe !== undefined && e.detalhe.length > MAX_FRASE) err(`${p}.detalhe`, `ate ${MAX_FRASE} caracteres`);
    const textos = [e.titulo, e.detalhe ?? '', ...(e.frases ?? [])];
    textos.forEach((t) => variaveisDe(t).forEach((v) => !(VARIAVEIS as readonly string[]).includes(v) && err(p, `variavel desconhecida {${v}} em "${t}"`)));
    if (!Array.isArray(e.frases) || e.frases.length < MIN_FRASES) err(`${p}.frases`, `minimo de ${MIN_FRASES} frases`);
    else {
      const vistas = new Set<string>();
      e.frases.forEach((f, j) => {
        if (typeof f !== 'string' || f.trim() === '') return err(`${p}.frases[${j}]`, 'texto vazio');
        if (f.length > MAX_FRASE) err(`${p}.frases[${j}]`, `${f.length} caracteres (maximo ${MAX_FRASE})`);
        if (PALAVRAS_PROIBIDAS.test(f)) err(`${p}.frases[${j}]`, `tom inadequado (culpa/pressao): "${f}"`);
        if (vistas.has(f)) err(`${p}.frases[${j}]`, 'frase repetida');
        vistas.add(f);
      });
      // pelo menos 6 frases que funcionam SEM nenhuma variavel opcional alem do numero principal
      const semVars = e.frases.filter((f) => variaveisDe(f).every((v) => v === e.numero?.variavel));
      if (semVars.length < MIN_FRASES) err(`${p}.frases`, `precisa de ${MIN_FRASES}+ frases que so dependam de {${e.numero?.variavel}}`);
    }
    if (e.voz !== undefined) {
      const v = e.voz;
      if (!(MOMENTOS as readonly string[]).includes(v.momento) || typeof v.delta !== 'number' || typeof v.ocasional !== 'boolean') err(`${p}.voz`, 'momento, delta (ms) e ocasional obrigatorios');
      for (const k of ['stazi', 'durona', 'durona_forte'] as const) {
        const t = v[k];
        const palavras = typeof t === 'string' ? t.replace(/[.!?,]/g, ' ').trim().split(/\s+/).filter(Boolean).length : 0;
        if (typeof t !== 'string' || palavras < 2 || palavras > MAX_PALAVRAS_FALA || t.length > 40) err(`${p}.voz.${k}`, `fala de 2 a ${MAX_PALAVRAS_FALA} palavras e ate 40 caracteres: "${t}"`);
        else if (FALA_PROIBIDA.test(t)) err(`${p}.voz.${k}`, `fala inadequada (humilha, palavrao ou ofensa): "${t}"`);
      }
      if (e.categoria === 'erro' && e.voz.ocasional === false && false) err(p, 'x');
    }
    if (!Array.isArray(e.bloqueado_em)) err(`${p}.bloqueado_em`, 'lista obrigatoria');
    if (e.categoria === 'erro') {
      if (e.intensidade !== 'micro') err(`${p}`, 'erro so pode ser micro (nunca celebrar)');
      if (e.efeito?.tipo !== 'nenhum') err(`${p}.efeito`, 'erro nao tem particulas');
      if (!e.bloqueado_em?.includes('prova') || !e.bloqueado_em?.includes('simulado')) err(`${p}.bloqueado_em`, 'erro nunca aparece em prova/simulado');
    }
    if (typeof e.compartilhavel !== 'boolean' || typeof e.requer_show_streak !== 'boolean') err(p, 'compartilhavel e requer_show_streak (booleanos) obrigatorios');
    if (typeof e.prioridade !== 'number') err(`${p}.prioridade`, 'numero obrigatorio');
  });
  return { ok: erros.length === 0, erros };
}

export function assertCatalogo(c: unknown): asserts c is Catalogo {
  const r = validarCatalogo(c);
  if (!r.ok) throw new Error(`Catalogo de celebracoes invalido:\n${r.erros.join('\n')}`);
}
