// Central de Conteúdo + Aulas (editor profissional, migração 013160): campos com formatação fora do texto da aula.
//   * Materiais da unidade (ch_unit_materials.content): legenda e transcrição de áudio/vídeo. O texto continua em content.legenda e
//     content.transcricao; a formatação fica em content.formatacao ({ legenda?: envelope, transcricao?: envelope }).
//   * Pontos-chave da aula (lessons.key_points + lessons.key_points_rico): a lista de envelopes é ALINHADA aos pontos (mesma posição;
//     null quando o ponto não tem formatação). Cada entrada só vale quando a projeção dela é igual ao texto do ponto.
// O banco faz btrim nos textos: aqui o texto e o documento são aparados juntos, para a projeção continuar batendo.
// (aparaDoc/aparaCampo são a mesma regra de src/shared/questions/formatacao.ts do ramo de Questões; o coordenador pode unir.)
import { blocoDeTexto, envelope, precisaRico, ricoValido, textoDoBloco, type Bloco, type DocRico, type Envelope } from "../docRico";
import { campoDoDoc, formatacaoValida, type Formatacao } from "../docRico/campos";

export type Campo = { texto: string; rico: Envelope | null };

const vazio = (b: Bloco) => b.type === "paragraph" && !(b.content ?? []).length;

// apara o começo (lado "ini") ou o fim (lado "fim") do primeiro/último nó de texto do bloco; nó que fica vazio sai
function aparaBloco(b: Bloco, lado: "ini" | "fim"): Bloco {
  const filhos = [...(b.content ?? [])];
  if (!filhos.length) return b;
  const i = lado === "ini" ? 0 : filhos.length - 1;
  const f = filhos[i];
  if (f.type === "text") {
    const t = lado === "ini" ? (f.text ?? "").replace(/^\s+/, "") : (f.text ?? "").replace(/\s+$/, "");
    if (t) filhos[i] = { ...f, text: t };
    else filhos.splice(i, 1);
    const novo = { ...b, content: filhos };
    return filhos.length && t === "" ? aparaBloco(novo, lado) : novo;
  }
  if (f.type === "hardBreak") {
    filhos.splice(i, 1);
    return aparaBloco({ ...b, content: filhos }, lado);
  }
  if (f.content) filhos[i] = aparaBloco(f, lado);
  return { ...b, content: filhos };
}

/** O documento sem espaços e parágrafos vazios nas pontas. */
export function aparaDoc(doc: DocRico): DocRico {
  let blocos = [...(doc.content ?? [])];
  while (blocos.length && vazio(blocos[0])) blocos.shift();
  while (blocos.length && vazio(blocos[blocos.length - 1])) blocos.pop();
  if (blocos.length) blocos[0] = aparaBloco(blocos[0], "ini");
  if (blocos.length) blocos[blocos.length - 1] = aparaBloco(blocos[blocos.length - 1], "fim");
  blocos = blocos.filter((b, i) => !(vazio(b) && (i === 0 || i === blocos.length - 1)));
  return { type: "doc", content: blocos };
}

/** Texto e formatação aparados juntos. Se não der para manter os dois iguais, fica só o texto (nunca grava rico que não bate). */
export function aparaCampo(texto: string | null | undefined, rico: unknown): Campo {
  const t = String(texto ?? "").trim();
  const r = ricoValido(String(texto ?? ""), rico) ?? ricoValido(t, rico);
  if (!r) return { texto: t, rico: null };
  const c = campoDoDoc(aparaDoc(r.doc));
  return c.texto === t ? c : { texto: t, rico: null };
}

// ---------------------------------------------------------------------------------------------------------- materiais da unidade

export const CAMPOS_MATERIAL = ["legenda", "transcricao"] as const;
export type CampoMaterial = (typeof CAMPOS_MATERIAL)[number];

/** O rico de um campo do material para mostrar (null = mostre o texto como sempre). */
export function ricoDoMaterial(formatacao: unknown, campo: string, texto: string | null | undefined): Envelope | null {
  if (!formatacao || typeof formatacao !== "object" || Array.isArray(formatacao)) return null;
  return ricoValido(String(texto ?? ""), (formatacao as Record<string, unknown>)[campo]);
}

/**
 * O que vai para o banco: legenda e transcrição aparadas e só a formatação válida (rico cuja projeção bate com o texto aparado).
 * formatacao = null quando nenhum campo tem formatação.
 */
export function materialParaSalvar(textos: Partial<Record<CampoMaterial, string | null | undefined>>, formatacao: unknown): { textos: Record<CampoMaterial, string>; formatacao: Formatacao | null } {
  const f = formatacao && typeof formatacao === "object" && !Array.isArray(formatacao) ? (formatacao as Record<string, unknown>) : {};
  const outT = {} as Record<CampoMaterial, string>;
  const outF: Formatacao = {};
  for (const k of CAMPOS_MATERIAL) {
    const c = aparaCampo(textos[k], f[k]);
    outT[k] = c.texto;
    if (c.rico && c.texto) outF[k] = c.rico;
  }
  const valida = formatacaoValida(outT, outF);
  return { textos: outT, formatacao: Object.keys(valida).length ? valida : null };
}

// ---------------------------------------------------------------------------------------------------------- pontos-chave

const docDe = (blocos: Bloco[]): DocRico => ({ type: "doc", content: blocos });

/**
 * Pontos-chave (um por linha) + formatação alinhada → o campo do editor: um parágrafo por ponto. Ponto com rico válido entra com a
 * formatação dele; os outros entram como texto. Um ponto só, sem formatação → rico null (o editor abre o texto como sempre).
 */
export function campoDosPontos(pontos: string, ricos: unknown): Campo {
  const linhas = String(pontos ?? "").split("\n");
  const lista = Array.isArray(ricos) ? ricos : [];
  let algum = false;
  const blocos = linhas.map((p, i) => {
    const r = ricoValido(p, lista[i]);
    if (r && r.doc.content.length === 1) {
      algum = true;
      return r.doc.content[0];
    }
    return blocoDeTexto(p);
  });
  // um ponto só e sem formatação: o texto basta. Mais de um: um parágrafo por ponto (o editor não junta pontos numa linha só)
  if (!algum && linhas.length <= 1) return { texto: linhas.join("\n"), rico: null };
  return campoDoDoc(docDe(blocos));
}

/**
 * Do editor para o formulário: cada parágrafo é um ponto (texto = projeção) e, quando ele tem formatação que o texto não guarda,
 * a entrada alinhada ganha o envelope. Bloco cuja projeção tem quebra de linha (lista, tabela, Shift+Enter) vira um ponto por
 * linha, sem formatação (a regra "um por linha" continua valendo).
 */
export function pontosDoCampo(campo: Campo): { pontos: string; ricos: (Envelope | null)[] } {
  if (!campo.rico) {
    const linhas = String(campo.texto ?? "").split("\n");
    return { pontos: linhas.join("\n"), ricos: linhas.map(() => null) };
  }
  const linhas: string[] = [];
  const ricos: (Envelope | null)[] = [];
  for (const b of campo.rico.doc.content ?? []) {
    const t = textoDoBloco(b);
    if (t.includes("\n")) {
      for (const l of t.split("\n")) {
        linhas.push(l);
        ricos.push(null);
      }
      continue;
    }
    linhas.push(t);
    ricos.push(precisaRico(b) ? envelope(docDe([b])) : null);
  }
  return { pontos: linhas.join("\n"), ricos };
}

/**
 * O que vai para o banco: só os pontos com texto (aparados) e a formatação alinhada a ELES (null quando nenhum tem formatação).
 * Mesma regra do banco (app_admin_save_lesson, 013160): ponto vazio sai junto com a entrada dele.
 */
export function pontosParaSalvar(pontos: string, ricos: unknown): { key_points: string[]; key_points_rico: (Envelope | null)[] | null } {
  const linhas = String(pontos ?? "").split("\n");
  const lista = Array.isArray(ricos) ? ricos : [];
  const key_points: string[] = [];
  const out: (Envelope | null)[] = [];
  linhas.forEach((p, i) => {
    const c = aparaCampo(p, lista[i]);
    if (!c.texto) return;
    key_points.push(c.texto);
    out.push(c.rico);
  });
  return { key_points, key_points_rico: out.some(Boolean) ? out : null };
}

/** O rico de um ponto para o aluno (null = o texto com marcas, como sempre). */
export function ricoDoPonto(ricos: unknown, i: number, texto: string): Envelope | null {
  return Array.isArray(ricos) ? ricoValido(String(texto ?? ""), ricos[i]) : null;
}
