// Registro de nós, marcas, atributos e configurações do documento rico (sdoc v1).

export type Valor = string | number | boolean | null;
export type Saneador = (v: unknown) => Valor | undefined;
export type Css = Record<string, string>;

export interface MarcaDoc {
  type: string;
  attrs?: Record<string, Valor>;
}

export interface NoDoc {
  type: string;
  text?: string;
  attrs?: Record<string, Valor>;
  marks?: MarcaDoc[];
  content?: NoDoc[];
}

export interface CtxHtml {
  esc: (s: string) => string;
}

export interface DefNo {
  nome: string;
  grupo: "bloco" | "inline";
  conteudo: "inline" | "blocos" | "nenhum" | string[];
  tag?: string;
  classe?: string;
  texto?: (no: NoDoc, filhos: string) => string;
  html?: (no: NoDoc, filhos: string, ctx: CtxHtml) => string;
}

export interface DefMarca {
  nome: string;
  tag?: string;
  classe?: string;
  html?: (dentro: string, marca: MarcaDoc) => string;
}

export interface DefAtributo {
  alvo: string;
  nome: string;
  sanear: Saneador;
  css?: (v: Valor) => Css;
  padrao?: Valor;
}

const nos = new Map<string, DefNo>();
const marcas = new Map<string, DefMarca>();
const atributos = new Map<string, DefAtributo[]>();
const chavesAtributos = new Set<string>();
const documentConfigs = new Map<string, (v: unknown) => unknown>();

/** Registra um nó do documento. Lança erro se o nome já estiver registrado. */
export function registrarNo(d: DefNo): void {
  if (nos.has(d.nome)) {
    throw new Error(`Nó já registrado: ${d.nome}`);
  }
  nos.set(d.nome, d);
}

/** Registra uma marca tipográfica. Lança erro se o nome já estiver registrado. */
export function registrarMarca(d: DefMarca): void {
  if (marcas.has(d.nome)) {
    throw new Error(`Marca já registrada: ${d.nome}`);
  }
  marcas.set(d.nome, d);
}

/** Registra um atributo de nó ou marca. Lança erro se (alvo, nome) já existir. */
export function registrarAtributo(d: DefAtributo): void {
  const chave = `${d.alvo}:${d.nome}`;
  if (chavesAtributos.has(chave)) {
    throw new Error(`Atributo já registrado para ${d.alvo}: ${d.nome}`);
  }
  chavesAtributos.add(chave);
  const lista = atributos.get(d.alvo) ?? [];
  lista.push(d);
  atributos.set(d.alvo, lista);
}

/** Registra uma configuração de nível de documento. */
export function registrarConfig(chave: string, sanear: (v: unknown) => unknown): void {
  if (documentConfigs.has(chave)) {
    throw new Error(`Configuração já registrada: ${chave}`);
  }
  documentConfigs.set(chave, sanear);
}

/** Retorna a definição do nó registrado. */
export function defNo(nome: string): DefNo | undefined {
  return nos.get(nome);
}

/** Retorna a definição da marca registrada. */
export function defMarca(nome: string): DefMarca | undefined {
  return marcas.get(nome);
}

/** Retorna os atributos registrados para o nó ou marca alvo. */
export function atributosDe(alvo: string): DefAtributo[] {
  return atributos.get(alvo) ?? [];
}

/** Retorna todas as configurações registradas para o documento. */
export function configs(): [string, (v: unknown) => unknown][] {
  return Array.from(documentConfigs.entries());
}

/** Nomes dos nós registrados (opcionalmente só de um grupo), na ordem de registro. Usado pelo editor (atributo "ref" nos blocos). */
export function listarNos(grupo?: "bloco" | "inline"): string[] {
  return Array.from(nos.values())
    .filter((d) => d.nome !== "doc" && (!grupo || d.grupo === grupo))
    .map((d) => d.nome);
}

/** Ordem de inserção de todas as marcas registradas. */
export function nomesMarcasRegistradas(): string[] {
  return Array.from(marcas.keys());
}

/** Valida se o valor de uma propriedade CSS é seguro para injeção inline. */
function valorCssSeguro(v: unknown): boolean {
  if (typeof v !== "string" && typeof v !== "number") return false;
  const s = String(v).trim();
  if (!s) return false;
  if (/[;{}<>"'\\]/.test(s)) return false;
  if (/url\s*\(/i.test(s) || /expression/i.test(s)) return false;
  if (!/[()]/.test(s)) return true;

  // Apenas funções permitidas com parênteses balanceados
  let temp = s.replace(/var\(\s*--[a-zA-Z0-9_-]+\s*\)/g, "X");
  const reColor = /(?:rgb|rgba|hsl|hsla)\(\s*[\d.%\s,+-/]+\s*\)/gi;
  let prev = "";
  while (prev !== temp) {
    prev = temp;
    temp = temp.replace(reColor, "X");
  }
  return !/[()]/.test(temp);
}

/** Serializa propriedades CSS seguras em formato string 'k:v;'. */
export function cssSeguro(css: Css): string {
  let out = "";
  for (const [k, v] of Object.entries(css)) {
    if (!/^-?[a-z][a-z-]*$/.test(k)) continue;
    if (!valorCssSeguro(v)) continue;
    out += `${k}:${String(v).trim()};`;
  }
  return out;
}

/** Converte propriedades CSS em kebab-case para camelCase seguro para React. */
export function estiloReact(css: Css): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(css)) {
    if (!/^-?[a-z][a-z-]*$/.test(k)) continue;
    if (!valorCssSeguro(v)) continue;
    const semHifen = k.startsWith("-") ? k.slice(1) : k;
    const camel = semHifen.replace(/-([a-z])/g, (_, l: string) => l.toUpperCase());
    const prop = k.startsWith("-") ? camel.charAt(0).toUpperCase() + camel.slice(1) : camel;
    out[prop] = String(v).trim();
  }
  return out;
}

// ---------------------------------------------------------------------------- Helpers de Saneamento

/** Saneador: aceita apenas valores presentes na lista especificada. */
export function umDe(lista: readonly Valor[] | Valor[]): Saneador {
  const set = new Set(lista);
  return (v: unknown) => (set.has(v as Valor) ? (v as Valor) : undefined);
}

/** Saneador: aceita inteiros entre min e max inclusivos. */
export function inteiroEntre(min: number, max: number): Saneador {
  return (v: unknown) => {
    let n: number;
    if (typeof v === "number") n = v;
    else if (typeof v === "string" && /^-?\d+$/.test(v.trim())) n = Number(v.trim());
    else return undefined;
    if (Number.isInteger(n) && n >= min && n <= max) return n;
    return undefined;
  };
}

/** Saneador: aceita números finitos entre min e max inclusivos. */
export function numeroEntre(min: number, max: number): Saneador {
  return (v: unknown) => {
    let n: number;
    if (typeof v === "number") n = v;
    else if (typeof v === "string" && /^-?\d+(?:\.\d+)?$/.test(v.trim())) n = Number(v.trim());
    else return undefined;
    if (Number.isFinite(n) && n >= min && n <= max) return n;
    return undefined;
  };
}

const RE_HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RE_RGB_SIMPLE = /^rgba?\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?(?:\s*,\s*(?:0|1|0?\.\d+|\d{1,3}%)\s*)?\)$/i;

/** Saneador: aceita #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() simples, ou 'inherit'. */
export function corCss(): Saneador {
  return (v: unknown) => {
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    if (s === "inherit") return s;
    if (RE_HEX_COLOR.test(s)) return s;
    if (RE_RGB_SIMPLE.test(s)) return s;
    return undefined;
  };
}

/** Saneador: aceita texto com comprimento até max caracteres. */
export function textoCurto(max: number): Saneador {
  return (v: unknown) => {
    if (typeof v === "string" && v.length <= max) return v;
    return undefined;
  };
}

/** Saneador: aceita booleanos literais ou representações string 'true'/'false'. */
export function booleano(): Saneador {
  return (v: unknown) => {
    if (typeof v === "boolean") return v;
    if (v === "true") return true;
    if (v === "false") return false;
    return undefined;
  };
}
