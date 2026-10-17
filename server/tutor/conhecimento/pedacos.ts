/**
 * CÉREBRO DO TUTOR — corte do texto em trechos de 600 a 1.100 caracteres (nunca acima de 1.200, o limite do banco), quebrando por
 * parágrafo e frase, com 1 frase de sobreposição entre trechos vizinhos (a ideia que cruza a fronteira fica inteira num deles).
 * O prefixo "Título — Seção" entra só no texto que vira vetor (paraVetor), não no texto devolvido ao Tutor.
 */
import { createHash } from "node:crypto";
import type { TrechoNovo } from "./tipos";

export const MIN = 600;
export const MAX = 1100;
export const TETO = 1200;
const MINIMO_BANCO = 20;

/** Frases de um parágrafo (sem perder o ponto final). Frase maior que o máximo vira pedaços por palavra. */
function frasesDe(par: string): string[] {
  const out: string[] = [];
  for (const f of par.split(/(?<=[.!?…;:])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9"“(•\-–])/)) {
    const s = f.trim();
    if (!s) continue;
    if (s.length <= MAX) { out.push(s); continue; }
    let atual = "";
    for (const w of s.split(/\s+/)) {
      if ((atual ? atual.length + 1 : 0) + w.length > MAX) { if (atual) out.push(atual); atual = w.slice(0, MAX); }
      else atual = atual ? `${atual} ${w}` : w;
    }
    if (atual) out.push(atual);
  }
  return out;
}

/** Divide um texto em pedaços de MIN a MAX caracteres (o último pode ser menor), com 1 frase de sobreposição. */
export function dividir(texto: string): string[] {
  const t = String(texto ?? "").trim();
  if (!t) return [];
  if (t.length <= MAX) return t.length >= MINIMO_BANCO ? [t] : [];
  // unidades: frases, marcando onde começa parágrafo (para juntar com "\n")
  const unidades: { s: string; novoPar: boolean }[] = [];
  for (const par of t.split(/\n+/)) {
    frasesDe(par).forEach((s, i) => unidades.push({ s, novoPar: i === 0 }));
  }
  const pedacos: string[] = [];
  let atual: { s: string; novoPar: boolean }[] = [];
  const tam = (xs: { s: string }[]) => xs.reduce((n, x, i) => n + x.s.length + (i ? 1 : 0), 0);
  const fechar = () => {
    if (!atual.length) return;
    pedacos.push(atual.map((x, i) => (i === 0 ? x.s : `${x.novoPar ? "\n" : " "}${x.s}`)).join(""));
  };
  for (const u of unidades) {
    if (atual.length && tam(atual) + 1 + u.s.length > MAX && tam(atual) >= Math.min(MIN, MAX - u.s.length)) {
      fechar();
      // sobreposição: a última frase do pedaço anterior, se couber com folga
      const ultima = atual[atual.length - 1];
      atual = ultima && ultima.s.length + 1 + u.s.length <= MAX && ultima.s.length <= 300 ? [{ s: ultima.s, novoPar: false }] : [];
    } else if (atual.length && tam(atual) + 1 + u.s.length > MAX) {
      fechar();
      atual = [];
    }
    atual.push(u);
  }
  // o resto pequeno junta com o anterior se couber; senão fica sozinho
  if (atual.length) {
    const resto = atual.map((x, i) => (i === 0 ? x.s : `${x.novoPar ? "\n" : " "}${x.s}`)).join("");
    const ant = pedacos[pedacos.length - 1];
    if (ant && resto.length < MIN / 2 && ant.length + 1 + resto.length <= TETO && !ant.endsWith(resto)) pedacos[pedacos.length - 1] = `${ant} ${resto}`;
    else if (!ant || !ant.endsWith(resto)) pedacos.push(resto);
  }
  return pedacos.map((p) => p.slice(0, TETO).trim()).filter((p) => p.length >= MINIMO_BANCO);
}

export const hashTrecho = (titulo: string, secao: string | null | undefined, texto: string) =>
  createHash("sha256").update(`${titulo}\u0000${secao ?? ""}\u0000${texto}`).digest("hex");

/** Trechos prontos de um texto: corte, hash e o texto que vira vetor (com o prefixo "Título — Seção"). */
export function trechosDe(titulo: string, secao: string | null | undefined, texto: string, pagina: number | null = null): TrechoNovo[] {
  const prefixo = [titulo, secao].filter(Boolean).join(" — ");
  return dividir(texto).map((p) => ({
    texto: p,
    secao: secao ?? null,
    pagina,
    hash: hashTrecho(titulo, secao, p),
    paraVetor: prefixo ? `${prefixo}\n${p}` : p,
  }));
}
