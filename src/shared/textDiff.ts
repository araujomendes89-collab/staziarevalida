/** Diferença por palavra (e por item) para mostrar o que uma proposta muda. Sem dependências. */
export type DiffPart = { op: "same" | "del" | "add"; text: string };

function merge(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last.op === p.op) last.text += p.text;
    else out.push({ ...p });
  }
  return out;
}

/** LCS por programação dinâmica; `join` é o que une as peças de uma parte vizinha. */
function lcsDiff(a: string[], b: string[], join: string): DiffPart[] {
  const n = a.length;
  const m = b.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      parts.push({ op: "same", text: a[i] });
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) parts.push({ op: "del", text: a[i++] });
    else parts.push({ op: "add", text: b[j++] });
  }
  while (i < n) parts.push({ op: "del", text: a[i++] });
  while (j < m) parts.push({ op: "add", text: b[j++] });
  if (join === "") return merge(parts);
  return parts;
}

const words = (s: string) => s.match(/\S+\s*|\s+/g) ?? [];

/** Palavras com o espaço seguinte; `same`+`del` refaz o antes e `same`+`add` o depois. */
export function wordDiff(before: string, after: string): DiffPart[] {
  return lcsDiff(words(before), words(after), "");
}

/** Mesmo formato, um item por parte (sem unir vizinhos). */
export function itemDiff(before: string[], after: string[]): DiffPart[] {
  return lcsDiff(before, after, "\n");
}
