/**
 * SIMULAÇÃO de respostas da IA — só para desenvolvimento e testes automatizados.
 *
 * Não é IA e não faz julgamento clínico: escolhe trechos por sobreposição de palavras e copia
 * frases do próprio material. Tudo o que sai daqui fica marcado com o modelo
 * "mock-dev (simulação, não é IA)", e o banco recusa publicar versão, material ou evidência
 * produzidos pela simulação. Em produção este módulo nem é aceito (resolveProvider).
 */
import { negations, normalize, numbers } from "../checks";
import type { StructuredRequest } from "./provider";

const STOP = new Set(
  "a o e de da do das dos em no na nos nas um uma para por com sem que se ou ao aos as os é são ser foi como mais menos deve devem pode podem quando entre sobre após até".split(" ")
);
const fold = (s: string) => normalize(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
const overlap = (a: string, b: string) => {
  const set = new Set(words(b));
  return words(a).filter((w) => set.has(w)).length;
};
const sentences = (text: string) =>
  normalize(text)
    .split(/(?<=[.;!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

function payloadOf(req: StructuredRequest): any {
  const m = req.input.match(/<documento>\n([\s\S]*)\n<\/documento>/);
  return m ? JSON.parse(m[1]) : {};
}

const CLINICAL = /(deve|devem|indicad|recomend|contraindicad|tratamento|dose|administrar|iniciar|suspender|rastreamento|diagn[óo]stico|crit[ée]rio|encaminh|urg[êe]ncia)/i;
const DOSE = /\d\s*(mg|mcg|µg|g|ml|ui)(\/|\b)/i;
const DURATION = /\d\s*(dias?|semanas?|meses|horas?|h)\b/i;

/** Quebra sequências longas copiadas inserindo um marcador visível de simulação. */
function marked(text: string): string {
  const unit = /^(mg|mcg|µg|g|ml|ui|%|mmhg|h|dias?|horas?|semanas?|meses|anos?|min|kg|vezes)\b/i;
  const tokens = normalize(text).split(" ");
  const out: string[] = [];
  let run = 0;
  tokens.forEach((t, i) => {
    out.push(t);
    run++;
    const next = tokens[i + 1];
    if (run >= 4 && next && !/\d/.test(t) && !unit.test(next) && !/\d/.test(next)) {
      out.push("[simulação]");
      run = 0;
    }
  });
  return out.join(" ");
}

export function mockRespond(req: StructuredRequest): unknown {
  const p = payloadOf(req);
  switch (req.promptId) {
    case "classify": {
      const text = (p.trechos ?? []).map((t: any) => t.text).join(" ");
      const scored = (p.catalogo ?? [])
        .filter((n: any) => n.level === "theme" || n.level === "subtheme")
        .map((n: any) => {
          const name = String(n.path).split(" > ").pop() ?? "";
          return { n, score: overlap(name, text) / Math.max(words(name).length, 1) };
        })
        .filter((x: any) => x.score >= 0.6)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 3);
      return {
        area_codes: [...new Set(scored.map((x: any) => x.n.area_code))],
        node_ids: scored.map((x: any) => x.n.id),
        suggestions: [],
        population: "",
        care_setting: "",
      };
    }
    case "claims": {
      const claims: any[] = [];
      (p.trechos ?? []).forEach((t: any) => {
        sentences(t.text)
          .filter((s) => s.length >= 25 && (CLINICAL.test(s) || numbers(s).length > 0))
          .slice(0, 3)
          .forEach((s) =>
            claims.push({
              block_idx: t.block_idx,
              quote: s.slice(0, 1200),
              critical_kinds: [...(DOSE.test(s) ? ["dose"] : []), ...(DURATION.test(s) ? ["duration"] : []), ...(/contraindicad/i.test(s) ? ["contraindication"] : [])],
              population: "",
              care_setting: "",
              conditions: "",
            })
          );
      });
      return { claims: claims.slice(0, 40) };
    }
    case "evidence": {
      const claim = String(p.afirmacao?.text ?? "");
      let best: { passage: any; sentence: string; score: number } | null = null;
      for (const passage of p.trechos ?? []) {
        for (const s of sentences(passage.text)) {
          const score = overlap(claim, s);
          if (!best || score > best.score) best = { passage, sentence: s, score };
        }
      }
      if (!best || best.score === 0) {
        const first = p.trechos?.[0];
        return { verdict: "insufficient", passage_id: first?.passage_id ?? "", quote: first ? sentences(first.text)[0] ?? "" : "", rationale: "Simulação: nenhuma sobreposição de palavras." };
      }
      const sameNumbers = numbers(claim).every((n) => numbers(best!.sentence).includes(n));
      const sameNegations = negations(claim).every((n) => negations(best!.sentence).includes(n));
      return {
        verdict: sameNumbers && sameNegations ? "compatible" : "insufficient",
        passage_id: best.passage.passage_id,
        quote: best.sentence,
        rationale: "Simulação: trecho escolhido por sobreposição de palavras, sem julgamento clínico.",
      };
    }
    case "draft": {
      const claims = p.afirmacoes ?? [];
      return {
        title: `[Simulação] ${String(p.tema ?? "Tema").split(" > ").pop()}`.slice(0, 160),
        sections: [
          { heading: "Aviso", paragraphs: [{ text: "Rascunho produzido pela simulação de desenvolvimento, não por IA nem por revisor.", clinical: false, claim_ids: [] }] },
          {
            heading: "Conceitos essenciais",
            paragraphs: claims.slice(0, 12).map((c: any) => ({ text: marked(c.text).slice(0, 1500), clinical: true, claim_ids: [c.id] })),
          },
        ],
      };
    }
    case "summary":
      return { items: (p.afirmacoes ?? []).slice(0, 20).map((c: any) => ({ text: marked(c.text).slice(0, 400), claim_ids: [c.id] })) };
    case "flashcards":
      return {
        cards: (p.afirmacoes ?? []).slice(0, 30).map((c: any) => ({
          front: `[Simulação] O que a base afirma sobre "${words(c.text).slice(0, 4).join(" ")}"?`.slice(0, 220),
          back: normalize(c.text).slice(0, 320),
          claim_ids: [c.id],
        })),
      };
    case "questions": {
      const c = (p.afirmacoes ?? [])[0];
      if (!c) return { items: [] };
      const ids = ["A", "B", "C", "D"] as const;
      return {
        items: [
          {
            stem: "[Simulação — não é IA] Qual alternativa reproduz a afirmação da base revisada sobre este tema?",
            options: ids.map((id, i) => ({ id, text: i === 0 ? normalize(c.text).slice(0, 400) : `Alternativa simulada ${id}.` })),
            correct: "A",
            comments: ids.map((id, i) => ({ id, text: i === 0 ? "Reproduz a afirmação da base (simulação)." : "Texto de preenchimento da simulação." })),
            claim_ids: [c.id],
          },
        ],
      };
    }
    case "staziamed_questao":
    case "staziamed_reescrita":
      // a simulação nunca escreve questão: ninguém pode confundir texto de teste com conteúdo médico
      return { status: "evidencia_insuficiente", reason: "Simulação: sem IA real, nenhuma questão é escrita.", question: null };
    case "staziamed_pedagogia":
      return {
        verdict: "revisar", single_best_answer: false, stem_clear_and_sufficient: false, distractors_plausible: false, no_unintended_clues: false, competency_aligned: false,
        issues: [{ severity: "minor", where: "questão", detail: "Simulação: sem revisão pedagógica real." }],
      };
    case "review":
      return { issues: [] };
    default:
      throw new Error(`Simulação sem resposta para ${req.promptId}`);
  }
}
