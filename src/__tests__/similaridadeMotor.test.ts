// @vitest-environment node
/**
 * Motor de questões parecidas (server/contentHub/similarity/engine.ts), só as regras, sem banco e sem IA. Os perfis são os REAIS
 * da revisão local (cópia em fixtures/similaridade; Revalida 2021 e 2022/2): nenhum caso foi escrito para o teste. O nó da
 * taxonomia, onde aparece, é derivado do tema e do subtema reais (prefixo "teste-"), porque a taxonomia oficial ainda não existe.
 *   - os pesos são os da proposta (40/30/20/10);
 *   - MESMO TEMA NÃO É EQUIVALENTE: em todos os pares possíveis dos perfis reais, "mesmo raciocínio" só sai com a mesma
 *     competência e o mesmo problema central (ou o mesmo raciocínio cobrado), e nunca sai "duplicada" sem texto igual;
 *   - sem o nó da taxonomia nas duas questões nada vira relação definitiva: só a duplicata exata e a candidata achada pelo
 *     vetor ficam, com confiança baixa;
 *   - duplicata exata pela impressão digital do texto; níveis de confiança.
 */
import { describe, expect, it } from "vitest";
import {
  CONFIDENCE, confidenceLevel, decide, decideAll, MAX_SAME_TOPIC, NO_TAXONOMY_CAP, scorePair, statementSim, taxonomySim, termListSim, textSim, WEIGHTS, norm,
} from "../../server/contentHub/similarity/engine";
import { cosseno, ladoDoPerfil, perfisReais, vetorDoTexto } from "./helpers/similaridade";

const reais = perfisReais();
const comTax = reais.map((e) => ladoDoPerfil(e, { taxonomia: true }));
const semTax = reais.map((e) => ladoDoPerfil(e));

describe("Regras do motor com os perfis reais da revisão", () => {
  it("a cópia traz os perfis reais das duas provas e os pesos são os da proposta", () => {
    expect(reais.length).toBeGreaterThan(150);
    expect(reais.every((e) => /^revalida_(2021_1|2022_2)_q\d{3}$/.test(e.id))).toBe(true);
    expect(WEIGHTS).toEqual({ raciocinio: 0.4, conceitos: 0.3, competencia: 0.2, achados: 0.1 });
    expect(Object.values(WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1);
  });

  it("mesmo tema não vira equivalente: em todos os pares reais, mesmo raciocínio exige mesma competência e mesmo problema", () => {
    const conta: Record<string, number> = {};
    let mesmoRamoOutraCompetencia = 0;
    for (let i = 0; i < comTax.length; i++) {
      for (let j = i + 1; j < comTax.length; j++) {
        const q = comTax[i];
        const c = comTax[j];
        const d = decide(q, c);
        const s = scorePair(q, c);
        if (d) conta[d.relation] = (conta[d.relation] ?? 0) + 1;
        // sem texto igual não existe duplicada (aqui não há enunciado nem impressão digital)
        expect(d?.relation, `${q.id} × ${c.id}`).not.toBe("duplicada_exata");
        expect(d?.relation, `${q.id} × ${c.id}`).not.toBe("duplicada_semantica");
        if (d?.relation === "mesmo_raciocinio") {
          expect(q.competencia, `${q.id} × ${c.id}`).toBe(c.competencia);
          expect(s.problema != null ? s.problema >= 0.5 : (s.raciocinioTexto ?? 0) >= 0.5, `${q.id} × ${c.id}`).toBe(true);
          expect(s.score).toBeGreaterThanOrEqual(0.6);
        }
        // mesmo ramo da taxonomia e competências diferentes: no máximo complementar, mesmo subtema ou mesmo tema
        if ((taxonomySim(q, c) ?? 0) > 0 && q.competencia && c.competencia && q.competencia !== c.competencia) {
          mesmoRamoOutraCompetencia++;
          expect(["complementar", "mesmo_subtema", "mesmo_tema"], `${q.id} × ${c.id}`).toContain(d?.relation);
        }
        // nós diferentes, sem o mesmo pai: o tema em texto não conta mais (a taxonomia manda)
        if (taxonomySim(q, c) === 0) expect(d?.relation ?? null, `${q.id} × ${c.id}`).not.toBe("mesmo_tema");
      }
    }
    // os perfis reais têm muitos pares do mesmo tema com competências diferentes: a regra foi exercitada de verdade
    expect(mesmoRamoOutraCompetencia).toBeGreaterThan(50);
    expect(conta.mesmo_tema ?? 0).toBeGreaterThan(0);
  });

  it("sem o nó da taxonomia nas duas questões, nada vira relação definitiva (nem pelo tema em texto)", () => {
    let gravados = 0;
    for (let i = 0; i < semTax.length; i++) for (let j = i + 1; j < semTax.length; j++) if (decide(semTax[i], semTax[j])) gravados++;
    expect(gravados).toBe(0);
    // com a taxonomia só em UMA das duas, também não
    expect(decide(comTax[0], semTax[1])).toBeNull();
  });

  it("sem taxonomia, a candidata achada pelo vetor (derivado do texto real) fica só como proposta de confiança baixa", () => {
    const texto = (e: (typeof reais)[number]) => [e.tema, e.subtema, e.perfil.problema_central, ...(e.perfil.conceitos ?? []), e.perfil.raciocinio_cobrado].filter(Boolean).join(" ");
    const vet = reais.map((e) => vetorDoTexto(texto(e)));
    let achados = 0;
    for (let i = 0; i < reais.length; i++) {
      for (let j = i + 1; j < reais.length; j++) {
        const cos = cosseno(vet[i], vet[j]);
        const d = decide(semTax[i], { ...semTax[j], via: ["vetor_clinico"], cos_c: cos, cos_t: cos });
        if (!d) continue;
        achados++;
        expect(d.confidence, `${reais[i].id} × ${reais[j].id}`).toBeLessThanOrEqual(NO_TAXONOMY_CAP);
        expect(confidenceLevel(d.confidence)).toBe("baixa");
        expect(d.reason).toMatch(/confiança baixa/);
        expect(d.signals.com_taxonomia).toBe(false);
      }
    }
    expect(achados).toBeGreaterThan(0);
  });

  it("duplicata exata: a mesma impressão digital do texto, com ou sem taxonomia; e a questão nunca é par dela mesma", () => {
    const q = { ...semTax[0], text_hash: "impressao-igual" };
    const c = { ...semTax[1], text_hash: "impressao-igual" };
    expect(decide(q, c)).toMatchObject({ relation: "duplicada_exata", confidence: 1, score: 1, origin: "regra" });
    expect(decideAll(q, [c, c, { ...q }]).map((d) => d.other)).toEqual([c.id]);
    expect(decide({ ...q, text_hash: null }, { ...c, text_hash: null })).toBeNull();
  });

  it("uma questão recebe no máximo algumas relações de mesmo tema, e as de assunto mais forte vêm antes", () => {
    for (const q of comTax.slice(0, 40)) {
      const ds = decideAll(q, comTax);
      expect(ds.filter((d) => d.relation === "mesmo_tema").length).toBeLessThanOrEqual(MAX_SAME_TOPIC);
      const ordem = ds.map((d) => ["duplicada_exata", "duplicada_semantica", "mesmo_raciocinio", "complementar", "mesmo_subtema", "mesmo_tema"].indexOf(d.relation));
      expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
    }
  });
});

describe("Contas de texto (com os textos reais dos perfis)", () => {
  it("texto igual vale 1, lista vazia não conta, e a comparação é simétrica", () => {
    const a = reais[0];
    const b = reais[1];
    expect(textSim(a.subtema, a.subtema)).toBe(1);
    expect(textSim(a.subtema, null)).toBeNull();
    expect(termListSim(a.perfil.conceitos, a.perfil.conceitos)).toBe(1);
    expect(termListSim(a.perfil.conceitos, [])).toBeNull();
    expect(termListSim(a.perfil.conceitos, b.perfil.conceitos)).toBeCloseTo(termListSim(b.perfil.conceitos, a.perfil.conceitos)!);
    expect(statementSim(norm(a.perfil.raciocinio_cobrado), norm(a.perfil.raciocinio_cobrado))).toBe(100);
    expect(statementSim(norm(a.perfil.raciocinio_cobrado), norm(b.perfil.raciocinio_cobrado))).toBeLessThan(70);
  });

  it("taxonomia: mesmo nó 1, mesmo pai 0,6, a raiz (área) não conta como mesmo tema, sem nó não há conta", () => {
    const [x, y] = comTax;
    expect(taxonomySim(x, x)).toBe(1);
    expect(taxonomySim(x, { ...y, taxonomy_node_id: `${x.taxonomy_parent_id}.outro`, taxonomy_parent_id: x.taxonomy_parent_id })).toBe(0.6);
    expect(taxonomySim({ ...x, taxonomy_node_id: "raiz.a", taxonomy_parent_id: "raiz" }, { ...y, taxonomy_node_id: "raiz.b", taxonomy_parent_id: "raiz" })).toBe(0);
    expect(taxonomySim(x, semTax[1])).toBeNull();
  });

  it("níveis de confiança: alta a partir de 0,8, média a partir de 0,6", () => {
    expect(CONFIDENCE).toEqual({ alta: 0.8, media: 0.6 });
    expect([0.8, 0.79, 0.6, 0.59].map(confidenceLevel)).toEqual(["alta", "media", "media", "baixa"]);
  });
});
