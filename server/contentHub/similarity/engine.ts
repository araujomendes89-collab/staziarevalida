/**
 * Motor de similaridade clínica e pedagógica (migração 20261003009910; spec docs/superpowers/specs/2026-10-12-similaridade-clinica.md).
 * Funções PURAS (sem banco, sem rede, sem IA): pontuam e classificam o par "questão × candidata" a partir do perfil efetivo
 * (perfil da revisão; sem ele, o question_dna) e dos sinais que o banco já juntou (texto igual, grupo de equivalentes, palavras,
 * taxonomia ou tema, vetores).
 *
 * Pesos iniciais da proposta do dono (2026-10-12). NÃO são precisão comprovada: calibrar com pares revisados por médico
 * (scripts/similaridade/avaliar.mjs). Cosseno 0,85 não quer dizer 85% de equivalência.
 *   raciocínio clínico 40 · conceitos e subtema 30 · competência 20 · achados discriminatórios 10
 *
 * Regras (MESMO TEMA NÃO É EQUIVALENTE):
 *   - duplicada_exata: enunciado e alternativas iguais depois de normalizar (impressão digital do banco);
 *   - duplicada_semantica: o mesmo enunciado reescrito (texto ≥ 85%, ou o grupo de equivalentes do pacote do motor); entre 70% e
 *     85%, ou só pelo vetor clínico, fica como proposta de confiança baixa para conferir;
 *   - mesmo_raciocinio: exige a MESMA competência e o MESMO problema central (ou, sem problema no perfil, o mesmo raciocínio
 *     cobrado), além da pontuação mínima;
 *   - complementar: o mesmo problema ou subtema cobrado em outra etapa (competência diferente: diagnóstico × tratamento ×
 *     complicação);
 *   - mesmo_subtema e mesmo_tema: só o assunto em comum.
 * Taxonomia Médica Oficial (decisão do dono de 2026-10-12): o "subtema" do peso de 30% é o nó da taxonomia (mesmo nó = 1, mesmo
 * pai = 0,6). Enquanto uma das duas questões não tiver o nó (taxonomia ainda não aprovada ou questão não reclassificada), o par
 * NÃO vira relação definitiva: só a duplicata exata e as candidatas achadas pelo vetor são gravadas, como proposta de
 * confiança BAIXA (o resto não é gravado).
 */
import { charRatio, normalizeForSimilarity, tokenSetRatio } from "../questoes/similarity";

/**
 * Versão do motor: mudar faz o banco recalcular todos os pares (fica em relations_basis). Precisa ser igual a
 * public.similarity_engine_version() (migração 20261003009910): trocar aqui exige uma migração que troque lá (um teste confere).
 */
export const ENGINE_VERSION = "sim-1";
export const WEIGHTS = { raciocinio: 0.4, conceitos: 0.3, competencia: 0.2, achados: 0.1 } as const;
/** Confiança: alta ≥ 0,8 (o aluno pode ver sem revisão), média ≥ 0,6, baixa abaixo disso (duvidosa: vai para a IA, se pedida). */
export const CONFIDENCE = { alta: 0.8, media: 0.6 } as const;
/** Teto da confiança quando falta o nó da taxonomia em uma das questões. */
export const NO_TAXONOMY_CAP = 0.45;
/** Quantas relações "mesmo tema" no máximo por questão (as de assunto mais forte vêm antes). */
export const MAX_SAME_TOPIC = 8;

export type Relation = "duplicada_exata" | "duplicada_semantica" | "mesmo_raciocinio" | "mesmo_subtema" | "mesmo_tema" | "complementar" | "nao_relacionada";

export interface Profile {
  id: string;
  area: string | null;
  topic: string | null;
  subtopic: string | null;
  tema: string | null;
  subtema: string | null;
  taxonomy_node_id: string | null;
  taxonomy_parent_id: string | null;
  competencia: string | null;
  cenario: string | null;
  problema_central: string | null;
  conceitos: string[];
  achados: string[];
  raciocinio: string | null;
  tipo: string | null;
  complexidade: number | null;
  confianca: number | null;
  fonte: "perfil" | "dna" | "questao";
  perfil_desatualizado: boolean;
}

export interface QuestionSide extends Profile {
  text_hash: string | null;
  group_id: string | null;
  /** Enunciado normalizado (minúsculas, sem acento). */
  statement: string;
}

export interface Candidate extends QuestionSide {
  via: string[];
  lex: number | null;
  cos_t: number | null;
  cos_c: number | null;
}

export interface Decision {
  other: string;
  relation: Exclude<Relation, "nao_relacionada">;
  score: number;
  confidence: number;
  reason: string;
  origin: "regra" | "vetor";
  signals: Record<string, unknown>;
}

// ---------------------------------------------------------------- texto
const STOP = new Set(
  ("para pela pelo pelas pelos com sem que uma umas uns das dos nas nos aos sua seu suas seus mais menos como entre apos sobre ate " +
    "este esta estes estas esse essa esses essas isso isto qual quais pois tem ter foi ser sao era sua the and").split(" ")
);
const stem = (w: string) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);
export const norm = (s: string | null | undefined) => normalizeForSimilarity(s ?? "");
export function words(s: string | null | undefined): Set<string> {
  return new Set(norm(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)).map(stem));
}
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
/** Semelhança de dois textos curtos (0 a 1); null quando falta um dos dois. */
export function textSim(a: string | null | undefined, b: string | null | undefined): number | null {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return null;
  if (na === nb) return 1;
  return jaccard(words(na), words(nb));
}
/** Semelhança de duas listas de termos (conceitos, achados): cada termo acha o melhor par da outra lista; null sem dado. */
export function termListSim(a: string[] | null | undefined, b: string[] | null | undefined): number | null {
  const A = (a ?? []).map(norm).filter(Boolean);
  const B = (b ?? []).map(norm).filter(Boolean);
  if (!A.length || !B.length) return null;
  const best = (x: string, list: string[]) => {
    let m = 0;
    const wx = words(x);
    for (const y of list) {
      if (x === y) return 1;
      const v = x.includes(y) || y.includes(x) ? 0.8 : jaccard(wx, words(y));
      if (v > m) m = v;
    }
    return m;
  };
  let sum = 0;
  for (const x of A) sum += best(x, B);
  for (const y of B) sum += best(y, A);
  return sum / (A.length + B.length);
}
/** Semelhança dos enunciados (0 a 100): palavras em comum; a conta cara (caracteres) só quando já são bem parecidos. */
export function statementSim(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const wj = jaccard(new Set(a.split(" ")), new Set(b.split(" ")));
  if (wj < 0.5) return Math.round(wj * 1000) / 10;
  return Math.round(Math.max(charRatio(a, b), tokenSetRatio(a, b)) * 10) / 10;
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** Cosseno → 0 a 1 (0,70 vira 0; 0,95 vira 1). Faixa inicial, a calibrar. */
export const cosToUnit = (c: number | null | undefined) => (c == null ? null : clamp((Number(c) - 0.7) / 0.25));
const r3 = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 1000);
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Média ponderada só do que existe; cobertura = peso disponível ÷ peso total. */
function avg(parts: [number | null, number][]): { value: number | null; coverage: number } {
  let s = 0;
  let w = 0;
  let total = 0;
  for (const [v, wt] of parts) {
    total += wt;
    if (v == null) continue;
    s += v * wt;
    w += wt;
  }
  return { value: w ? s / w : null, coverage: total ? w / total : 0 };
}

/**
 * Os dois têm nó da taxonomia? Mesmo nó = 1; um é pai do outro ou os dois têm o mesmo pai = 0,6; diferentes = 0. O pai só conta
 * quando NÃO é a raiz (a área, nível 1: id sem ponto): estar na mesma área não é estar no mesmo tema. null = falta o nó em uma.
 */
export function taxonomySim(q: Profile, c: Profile): number | null {
  if (!q.taxonomy_node_id || !c.taxonomy_node_id) return null;
  if (q.taxonomy_node_id === c.taxonomy_node_id) return 1;
  const notRoot = (id: string | null) => Boolean(id && id.includes("."));
  if (notRoot(c.taxonomy_node_id) && q.taxonomy_parent_id === c.taxonomy_node_id) return 0.6;
  if (notRoot(q.taxonomy_node_id) && c.taxonomy_parent_id === q.taxonomy_node_id) return 0.6;
  if (notRoot(q.taxonomy_parent_id) && q.taxonomy_parent_id === c.taxonomy_parent_id) return 0.6;
  return 0;
}

/** Qualidade do perfil: perfil da revisão 1 (0,85 se a questão mudou depois), question_dna 0,8, só a questão 0,5. */
function quality(p: Profile): number {
  const base = p.fonte === "perfil" ? (p.perfil_desatualizado ? 0.85 : 1) : p.fonte === "dna" ? 0.8 : 0.5;
  return p.confianca == null ? base : base * (0.7 + 0.3 * clamp(Number(p.confianca)));
}

export interface PairScore {
  score: number;
  coverage: number;
  texto: number;
  problema: number | null;
  raciocinioTexto: number | null;
  raciocinio: number | null;
  subtema: number | null;
  taxonomia: number | null;
  conceitos: number | null;
  conceitosSubtema: number | null;
  competencia: number | null;
  achados: number | null;
  clinico: number | null;
  tematico: number | null;
  mesmoTema: boolean;
}

export function scorePair(q: QuestionSide, c: Candidate): PairScore {
  const problema = textSim(q.problema_central, c.problema_central);
  const raciocinioTexto = textSim(q.raciocinio, c.raciocinio);
  const clinico = cosToUnit(c.cos_c);
  const rac = avg([[problema, 0.45], [raciocinioTexto, 0.25], [clinico, 0.3]]);
  const taxonomia = taxonomySim(q, c);
  // o subtema do peso de 30% é o nó da taxonomia; sem nó em uma das duas, o texto do subtema (e o par fica com confiança baixa)
  const subtema = taxonomia ?? textSim(q.subtema, c.subtema);
  const conceitos = termListSim(q.conceitos, c.conceitos);
  const tematico = cosToUnit(c.cos_t);
  const conc = avg([[subtema, 0.4], [conceitos, 0.4], [tematico, 0.2]]);
  const competencia = q.competencia && c.competencia ? (q.competencia === c.competencia ? 1 : 0) : null;
  const achados = termListSim(q.achados, c.achados);
  const total = avg([[rac.value, WEIGHTS.raciocinio], [conc.value, WEIGHTS.conceitos], [competencia, WEIGHTS.competencia], [achados, WEIGHTS.achados]]);
  const coverage =
    WEIGHTS.raciocinio * rac.coverage + WEIGHTS.conceitos * conc.coverage + WEIGHTS.competencia * (competencia == null ? 0 : 1) + WEIGHTS.achados * (achados == null ? 0 : 1);
  const mesmoTema =
    taxonomia != null
      ? taxonomia > 0
      : Boolean((q.topic && q.topic === c.topic) || (norm(q.tema) && norm(q.tema) === norm(c.tema)));
  return {
    score: total.value ?? 0, coverage, texto: statementSim(q.statement, c.statement), problema, raciocinioTexto, raciocinio: rac.value,
    subtema, taxonomia, conceitos, conceitosSubtema: conc.value, competencia, achados, clinico, tematico, mesmoTema,
  };
}

function reasonOf(s: PairScore, q: Profile, c: Profile): string {
  const out: string[] = [];
  if (s.competencia === 1) out.push(`mesma competência (${q.competencia})`);
  else if (s.competencia === 0) out.push(`competências diferentes (${q.competencia} × ${c.competencia})`);
  if (s.problema != null) out.push(`problema central ${pct(s.problema)}`);
  if (s.raciocinioTexto != null) out.push(`raciocínio cobrado ${pct(s.raciocinioTexto)}`);
  if (s.taxonomia != null) out.push(s.taxonomia === 1 ? "mesmo nó da taxonomia" : s.taxonomia > 0 ? "mesmo ramo da taxonomia" : "nós da taxonomia diferentes");
  else if (s.subtema != null) out.push(`subtema (texto) ${pct(s.subtema)}`);
  if (s.conceitos != null) out.push(`conceitos ${pct(s.conceitos)}`);
  if (s.achados != null) out.push(`achados ${pct(s.achados)}`);
  if (s.clinico != null) out.push(`vetor clínico ${pct(s.clinico)}`);
  if (s.tematico != null) out.push(`vetor temático ${pct(s.tematico)}`);
  if (s.texto >= 50) out.push(`enunciados ${Math.round(s.texto)}% parecidos`);
  return `Pontuação ${pct(s.score)}: ${out.join("; ") || "poucos dados no perfil"}.`;
}

const viaVector = (c: Candidate) => c.via.some((v) => v.startsWith("vetor"));

/**
 * Decide a relação do par (ou null: não relacionada, nada é gravado). Sem nó da taxonomia em uma das duas questões, só a
 * duplicata exata e a candidata achada pelo vetor viram proposta (com a confiança no teto baixo).
 */
export function decide(q: QuestionSide, c: Candidate): Decision | null {
  const qual = Math.min(quality(q), quality(c));
  const hasTaxonomy = Boolean(q.taxonomy_node_id && c.taxonomy_node_id);
  // 1) duplicata exata: fato do texto, não depende de classificação
  if (q.text_hash && q.text_hash === c.text_hash) {
    return {
      other: c.id, relation: "duplicada_exata", score: 1, confidence: 1, origin: "regra",
      reason: "Enunciado e alternativas iguais depois de tirar acentos, pontuação e a ordem das letras.",
      signals: { texto: 100, via: c.via, regra: "texto_igual", taxonomia: hasTaxonomy },
    };
  }
  const s = scorePair(q, c);
  const usedVector = s.clinico != null || s.tematico != null;
  const signals = {
    pontuacao: r3(s.score), cobertura: r3(s.coverage), texto: s.texto, problema: r3(s.problema), raciocinio_texto: r3(s.raciocinioTexto),
    raciocinio: r3(s.raciocinio), subtema: r3(s.subtema), taxonomia: r3(s.taxonomia), conceitos: r3(s.conceitos),
    conceitos_subtema: r3(s.conceitosSubtema), competencia: s.competencia, achados: r3(s.achados), cos_c: c.cos_c, cos_t: c.cos_t,
    lex: c.lex, via: c.via, fonte_a: q.fonte, fonte_b: c.fonte, mesmo_tema: s.mesmoTema, com_taxonomia: hasTaxonomy,
  };
  const base = (relation: Decision["relation"], confidence: number, reason: string, origin: Decision["origin"] = usedVector ? "vetor" : "regra"): Decision => ({
    other: c.id, relation, score: Math.round(clamp(s.score) * 10000) / 10000, confidence: Math.round(clamp(confidence) * 1000) / 1000, reason, origin, signals,
  });
  const cap = (d: Decision | null): Decision | null => {
    if (!d || hasTaxonomy) return d;
    // sem taxonomia: só o que veio pelo vetor (ou o texto quase igual) fica, e sempre como confiança baixa
    if (d.relation !== "duplicada_semantica" && !viaVector(c)) return null;
    return { ...d, confidence: Math.min(d.confidence, NO_TAXONOMY_CAP), reason: `${d.reason} Sem a taxonomia nas duas questões: proposta de confiança baixa.` };
  };

  // 2) duplicada semântica pelo texto ou pelo grupo de equivalentes
  if (q.group_id && q.group_id === c.group_id) {
    return cap(base("duplicada_semantica", 0.95, `Mesma questão em duas provas (grupo de equivalentes do pacote do motor); enunciados ${Math.round(s.texto)}% parecidos.`, "regra"));
  }
  if (s.texto >= 85) return cap(base("duplicada_semantica", 0.9, `Enunciados ${Math.round(s.texto)}% parecidos: a mesma questão reescrita.`, "regra"));
  if (s.texto >= 70) return cap(base("duplicada_semantica", 0.5, `Enunciados ${Math.round(s.texto)}% parecidos: conferir se é a mesma questão.`, "regra"));
  if (c.cos_c != null && c.cos_c >= 0.96 && (s.problema ?? 0) >= 0.8 && s.competencia === 1) {
    return cap(base("duplicada_semantica", 0.45, `Possível duplicada pelo significado do caso clínico (cosseno ${Number(c.cos_c).toFixed(2)}): conferir.`, "vetor"));
  }

  const reason = reasonOf(s, q, c);
  const coverageF = 0.6 + 0.4 * s.coverage;
  // 3) mesmo raciocínio: mesma competência E mesmo problema (ou, sem problema no perfil, mesmo raciocínio cobrado)
  const sameProblem = s.problema != null ? s.problema >= 0.5 : (s.raciocinioTexto ?? 0) >= 0.5;
  const sameSubject = (s.subtema ?? 0) >= 0.5 || (s.conceitos ?? 0) >= 0.3 || (s.clinico ?? 0) >= 0.6;
  if (s.competencia === 1 && sameProblem && s.score >= 0.6 && sameSubject) {
    return cap(base("mesmo_raciocinio", qual * (0.6 + 0.4 * clamp((s.score - 0.6) / 0.3)) * coverageF, `Mesmo raciocínio. ${reason}`));
  }
  // 4) complementar: o mesmo problema ou subtema, cobrado em outra etapa (competência diferente)
  const strongSubject = Math.max(s.problema ?? 0, s.subtema ?? 0, s.mesmoTema ? s.conceitos ?? 0 : 0);
  if (s.competencia === 0 && ((s.problema ?? 0) >= 0.5 || (s.subtema ?? 0) >= 0.8 || (s.mesmoTema && (s.conceitos ?? 0) >= 0.5))) {
    return cap(base("complementar", qual * (0.55 + 0.45 * strongSubject) * coverageF, `Complementar (outra etapa do mesmo assunto). ${reason}`));
  }
  // 5) mesmo subtema
  if ((s.subtema ?? 0) >= 0.8 || (s.problema ?? 0) >= 0.5 || (s.mesmoTema && (c.cos_t ?? 0) >= 0.9)) {
    return cap(base("mesmo_subtema", qual * 0.8 * coverageF, `Mesmo subtema. ${reason}`));
  }
  // 6) mesmo tema: só o assunto amplo em comum
  if (s.mesmoTema) {
    const exact = s.taxonomia != null ? s.taxonomia >= 0.6 : Boolean(q.topic && q.topic === c.topic);
    return cap(base("mesmo_tema", exact ? 0.85 : 0.7 * qual, `Mesmo tema. ${reason}`));
  }
  // 7) achada só pelo vetor, sem nada em comum no perfil: proposta duvidosa (a IA ou a equipe decidem)
  if (viaVector(c) && (s.clinico ?? 0) >= 0.8) {
    return cap(base("mesmo_subtema", 0.4, `Achada pelo vetor (${reason}); o perfil não confirma: conferir.`, "vetor"));
  }
  return null;
}

const ORDER: Record<Decision["relation"], number> = { duplicada_exata: 0, duplicada_semantica: 1, mesmo_raciocinio: 2, complementar: 3, mesmo_subtema: 4, mesmo_tema: 5 };

/** Todas as decisões de uma questão, sem repetir candidata, com no máximo MAX_SAME_TOPIC relações "mesmo tema". */
export function decideAll(q: QuestionSide, candidates: Candidate[]): Decision[] {
  const seen = new Set<string>();
  const out: Decision[] = [];
  for (const c of candidates) {
    if (c.id === q.id || seen.has(c.id)) continue;
    seen.add(c.id);
    const d = decide(q, c);
    if (d) out.push(d);
  }
  out.sort((a, b) => ORDER[a.relation] - ORDER[b.relation] || b.score - a.score || a.other.localeCompare(b.other));
  let sameTopic = 0;
  return out.filter((d) => d.relation !== "mesmo_tema" || ++sameTopic <= MAX_SAME_TOPIC);
}

/** Nível da confiança para as telas. */
export const confidenceLevel = (c: number): "alta" | "media" | "baixa" => (c >= CONFIDENCE.alta ? "alta" : c >= CONFIDENCE.media ? "media" : "baixa");
