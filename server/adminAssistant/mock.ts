/**
 * Assistente das abas — SIMULAÇÃO (testes e banco de desenvolvimento; nunca em produção, onde resolveProviderKind("mock")
 * volta sem provedor). Como `mockAssistFromInput` das Aulas: a resposta é montada só com frases das próprias marcas do pedido,
 * sem conteúdo novo, e sai no esquema do modo (lido de `schemaName`).
 */
import type { StructuredRequest } from "../contentHub/ai/provider";

const value = (text: string) => ({ text, items: null, timeline: null, flashcards: null });
/** Primeira frase do trecho (até 200 caracteres, o menor campo de texto que o assistente muda). */
const firstSentence = (t: string) => (t.replace(/\s+/g, " ").match(/[^.!?]+[.!?]/)?.[0] ?? t).trim().slice(0, 200);

/** Trechos de uma marca ("I", "T" ou "F") dentro do bloco: código e texto, na ordem do pedido. */
function marks(input: string, letter: "I" | "T" | "F", tag: string): { code: string; head: string; text: string }[] {
  const block = new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(input)?.[1] ?? "";
  const re = new RegExp(`\\[(${letter}\\d+)\\]([^\\n]*)\\n([\\s\\S]*?)(?=\\n\\n\\[${letter}\\d+\\]|\\n(?:\\n)?Somente leitura: |$)`, "g");
  return [...block.matchAll(re)].map((m) => ({ code: m[1], head: m[2].trim(), text: m[3].trim() }));
}

/** Campos da linha "Campos permitidos" e, pelo sistema, quais são de texto (sem a linha de formato, todos contam como texto). */
function allowedTextFields(req: StructuredRequest): string[] {
  const line = /^Campos permitidos: (.*)$/m.exec(req.input ?? "")?.[1] ?? "";
  const names = [...line.matchAll(/(?:^|, )([a-z][a-z0-9_]*) \(/g)].map((m) => m[1]);
  const formats = new Map([...String(req.system ?? "").matchAll(/^- ([a-z][a-z0-9_]*) \([^\n]*?\): (texto|lista)/gm)].map((m) => [m[1], m[2]]));
  return names.filter((n) => (formats.get(n) ?? "texto") === "texto");
}

export function mockAdminAssist(req: StructuredRequest): unknown {
  const mode = /^staziamed_assistente_(preencher|conferir|conversar)$/.exec(req.schemaName)?.[1];
  const input = req.input ?? "";
  const item = marks(input, "I", "item");
  const sources = [...marks(input, "T", "material"), ...marks(input, "F", "fontes_oficiais")];
  const fields = allowedTextFields(req);
  const first = sources[0];
  if (mode === "preencher") {
    if (!first) return { suggestions: [], missing: fields.slice(0, 20).map((field) => ({ field, reason: "Simulação (sem IA): sem trecho para citar." })) };
    return { suggestions: fields.slice(0, 30).map((field) => ({ field, value: value(firstSentence(first.text)), sources: [first.code] })), missing: [] };
  }
  if (mode === "conferir") {
    const i1 = item.find((m) => m.code === "I1");
    const field = /^([a-z][a-z0-9_]*) \(/.exec(i1?.head ?? "")?.[1] ?? null;
    return { findings: [{ field, kind: "pouco_claro", detail: "Simulação (sem IA): confira se este campo está claro.", sources: i1 ? ["I1"] : [] }] };
  }
  if (mode === "conversar") {
    const t1 = sources.find((m) => m.code === "T1");
    const changes = t1 && fields[0] ? [{ field: fields[0], after: value(firstSentence(t1.text)), sources: ["T1"], reason: "Simulação (sem IA): frase do material." }] : [];
    return { reply: `Simulação: ${changes.length ? "proposta montada com a primeira frase do material." : "sem material, nada a mudar."}`, changes };
  }
  throw new Error(`Simulação sem modo conhecido: ${req.schemaName}`);
}
