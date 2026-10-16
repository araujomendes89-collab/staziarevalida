// Formatação das Atualizações (editor profissional, migração 013130). O texto oficial continua nas colunas/listas de sempre; a
// formatação fica em guideline_updates.formatacao (chave do campo → envelope sdoc) e só vale quando a projeção bate com o texto.
// Chaves (índice começa em 0, na ordem GRAVADA): before_text, current_conduct, clinical_impact, exam_impact, trap, timeline.N,
// flashcard.N.frente, flashcard.N.verso, questao.N.enunciado, questao.N.alt.X, questao.N.justificativa.X, questao.N.comentario.
// O aluno recebe do banco só as chaves que já pode ver: app_guideline_update_formatacao (detalhe, sem justificativas e comentários)
// e app_guideline_practice_formatacao (as da correção de uma questão, só com a resposta).
import { ricoValido, type DocRico, type Envelope } from "../docRico";
import { campoDoDoc, formatacaoValida, type Formatacao } from "../docRico/campos";

export const CAMPOS_SIMPLES = ["before_text", "current_conduct", "exam_impact", "trap", "clinical_impact"] as const;
export const chaves = {
  timeline: (i: number) => `timeline.${i}`,
  frente: (i: number) => `flashcard.${i}.frente`,
  verso: (i: number) => `flashcard.${i}.verso`,
  enunciado: (i: number) => `questao.${i}.enunciado`,
  alt: (i: number, l: string) => `questao.${i}.alt.${l}`,
  justificativa: (i: number, l: string) => `questao.${i}.justificativa.${l}`,
  comentario: (i: number) => `questao.${i}.comentario`,
};
/** Limite do banco (ch_formatacao_valida): até 64 campos formatados por atualização. */
export const MAX_CAMPOS = 64;

export type Campo = { texto: string; rico: Envelope | null };

/** btrim do banco: tira só os espaços das pontas (quebra de linha fica). */
export const btrim = (v: unknown) => String(v ?? "").replace(/^ +| +$/g, "");

// apara os espaços do começo (ini) ou do fim (fim) do documento: no primeiro/último nó de texto; nó que fica vazio sai
function apara(nos: any[], lado: "ini" | "fim"): boolean {
  const ordem = lado === "ini" ? nos.map((_, i) => i) : nos.map((_, i) => nos.length - 1 - i);
  for (const i of ordem) {
    const n = nos[i];
    if (n?.type === "text") {
      const t = lado === "ini" ? String(n.text ?? "").replace(/^ +/, "") : String(n.text ?? "").replace(/ +$/, "");
      if (t) {
        nos[i] = { ...n, text: t };
        return true;
      }
      nos.splice(i, 1);
      return apara(nos, lado);
    }
    if (n?.type === "hardBreak") return true;
    if (Array.isArray(n?.content)) {
      const filhos = [...n.content];
      const achou = apara(filhos, lado);
      nos[i] = { ...n, content: filhos };
      if (achou || filhos.length) return true;
    }
  }
  return false;
}

/** Texto e formatação aparados juntos (só espaços, como o banco). Se não der para manter os dois iguais, fica só o texto. */
export function aparaCampo(texto: string | null | undefined, rico: unknown): Campo {
  const original = String(texto ?? "");
  const t = btrim(original);
  const r = ricoValido(original, rico) ?? ricoValido(t, rico);
  if (!r) return { texto: t, rico: null };
  if (t === original) return { texto: t, rico: r };
  const conteudo = JSON.parse(JSON.stringify(r.doc.content)) as any[];
  apara(conteudo, "ini");
  apara(conteudo, "fim");
  const c = campoDoDoc({ type: "doc", content: conteudo } as DocRico);
  return c.texto === t ? c : { texto: t, rico: null };
}

const objeto = (f: unknown): Record<string, unknown> => (f && typeof f === "object" && !Array.isArray(f) ? (f as Record<string, unknown>) : {});

/**
 * Tirar o item i de uma lista (linha do tempo, flashcards, questões): a formatação dele sai e a dos seguintes sobe uma posição.
 * prefixo: "timeline", "flashcard" ou "questao".
 */
export function tirarItem(formatacao: unknown, prefixo: string, i: number): Formatacao {
  const out: Formatacao = {};
  const re = new RegExp(`^${prefixo}\\.(\\d+)(\\..*)?$`);
  for (const [k, v] of Object.entries(objeto(formatacao))) {
    const m = re.exec(k);
    if (!m) {
      out[k] = v as Envelope;
      continue;
    }
    const n = Number(m[1]);
    if (n === i) continue;
    out[n > i ? `${prefixo}.${n - 1}${m[2] ?? ""}` : k] = v as Envelope;
  }
  return out;
}

type Linha = { year?: unknown; text?: unknown };
type Cartao = { type?: unknown; front?: unknown; back?: unknown };
type Opcao = { id?: string; text?: unknown; justification?: unknown; [k: string]: unknown };
type Questao = { statement?: unknown; options?: Opcao[]; commentary?: unknown; [k: string]: unknown };

/**
 * O que vai para o banco, a partir do formulário (chaves da linha do tempo na ordem do FORMULÁRIO) e da formatação:
 * textos aparados como o banco apara, linha do tempo filtrada e em ordem de ano (empate: ordem do formulário, igual ao banco),
 * e a formatação com as chaves na ordem GRAVADA e só as entradas válidas. formatacao = null quando não sobra nenhuma.
 * Questões de treino: o banco grava como chegam (sem aparar), então os textos delas não mudam aqui.
 */
export function paraSalvar(
  form: Record<string, unknown> & { timeline?: Linha[]; flashcards?: Cartao[] },
  questoes: Questao[],
  formatacao: unknown,
) {
  const f = objeto(formatacao);
  const textos: Record<string, string> = {};
  const saida: Formatacao = {};
  const guarda = (chave: string, c: Campo) => {
    textos[chave] = c.texto;
    if (c.rico) saida[chave] = c.rico;
  };
  const campos: Record<string, string> = {};
  for (const k of CAMPOS_SIMPLES) {
    const c = aparaCampo(form[k] as string, f[k]);
    campos[k] = c.texto;
    guarda(k, c);
  }
  const timeline = (form.timeline ?? [])
    .map((t, i) => ({ year: Number(t.year), campo: aparaCampo(t.text as string, f[chaves.timeline(i)]) }))
    .filter((t) => Number.isInteger(t.year) && t.year >= 2000 && t.year <= 2100 && t.campo.texto)
    .map((t, i) => ({ ...t, i }))
    .sort((a, b) => a.year - b.year || a.i - b.i);
  timeline.forEach((t, j) => guarda(chaves.timeline(j), t.campo));
  const flashcards = (form.flashcards ?? []).map((c, i) => {
    const frente = aparaCampo(c.front as string, f[chaves.frente(i)]);
    const verso = aparaCampo(c.back as string, f[chaves.verso(i)]);
    guarda(chaves.frente(i), frente);
    guarda(chaves.verso(i), verso);
    return { ...(c.type == null ? {} : { type: c.type }), front: frente.texto, back: verso.texto };
  });
  (questoes ?? []).forEach((q, i) => {
    const exato = (chave: string, texto: unknown) => guarda(chave, { texto: String(texto ?? ""), rico: ricoValido(String(texto ?? ""), f[chave]) });
    exato(chaves.enunciado(i), q.statement);
    exato(chaves.comentario(i), q.commentary);
    for (const o of q.options ?? []) {
      if (!o?.id) continue;
      exato(chaves.alt(i, o.id), o.text);
      exato(chaves.justificativa(i, o.id), o.justification);
    }
  });
  const valida = formatacaoValida(textos, saida);
  const n = Object.keys(valida).length;
  return {
    campos,
    timeline: timeline.map((t) => ({ year: t.year, text: t.campo.texto })),
    flashcards,
    formatacao: n ? valida : null,
    problema: n > MAX_CAMPOS ? `A formatação está em ${n} campos; o limite é ${MAX_CAMPOS}. Tire a formatação de alguns campos e salve de novo.` : null,
  };
}

/** O rico de um campo para mostrar (null = mostre o texto como sempre). */
export function ricoDoCampo(formatacao: unknown, chave: string, texto: unknown): Envelope | null {
  const r = objeto(formatacao)[chave];
  return r ? ricoValido(String(texto ?? ""), r) : null;
}
