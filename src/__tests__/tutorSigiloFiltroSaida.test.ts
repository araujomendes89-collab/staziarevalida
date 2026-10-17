// @vitest-environment node
// Avaliação do FILTRO DE SAÍDA do sigilo sem chamar modelo (regra do dono de 17/10: nada de bateria grande de ataques contra a IA).
// Casos em helpers/casosSigilo.ts: uma ou mais falas que vazam para cada forma de ataque da bancada e falas limpas de aula.
// As lacunas e os alarmes falsos conhecidos (medidos em 17/10) ficam como "todo": quando o filtro melhorar, saem daqui e entram no teste.
import { describe, expect, it } from "vitest";
import { protegerFala } from "../../server/tutor/escudo";
import { achadosDeSigilo } from "../../server/tutor/sigilo";
import { LIMPAS, VAZAMENTOS, type CasoSigilo } from "./helpers/casosSigilo";

const PERSONAS = ["durao", "acolhedor", "durona", "tranquila"] as const;
const NOME: Record<string, string> = { durao: "Stazi", acolhedor: "Stazi", durona: "Stazia", tranquila: "Stazia" };
const ctxDe = (c: CasoSigilo) => ({ pergunta: c.pergunta ?? null, permitidos: c.pergunta ? [c.pergunta] : [] });

/**
 * O filtro ainda não pega: paráfrase do jeito de agir sem nenhum termo interno. A proteção contra paráfrase depende do modelo
 * (bloco de sigilo); o filtro pega nomes, disfarces, termos internos e frases literais.
 */
const LACUNAS = new Set<string>([]);

/** Fala limpa que o filtro ainda mexe. */
const ALARMES_FALSOS = new Set<string>([
  // palavra de 40+ letras sem número já não conta como chave; continua aqui só se voltar a ser mexida
]);

describe("filtro de saída: falas que vazam (uma ou mais por forma de ataque)", () => {
  VAZAMENTOS.forEach((c, i) => {
    const p = PERSONAS[i % 4];
    if (LACUNAS.has(c.fala)) return void it.todo(`lacuna (${c.forma}): ${c.fala}`);
    it(`${c.forma} / ${p}: pega e reescreve sem sobrar vazamento`, () => {
      const r = protegerFala(c.fala, p, ctxDe(c));
      expect(r.achados.length, c.fala).toBeGreaterThan(0);
      expect(r.texto.trim().length).toBeGreaterThan(0);
      expect(achadosDeSigilo(r.texto, ctxDe(c)), r.texto).toEqual([]);
      // nada do nome antigo nem do nome do outro personagem
      expect(r.texto).not.toMatch(/\bNexus\b/);
      if (/\bStazia?\b/.test(r.texto)) expect(r.texto).toMatch(new RegExp(`\\b${NOME[p]}\\b`));
    });
  });

  it("cobre todas as formas de ataque da bancada", () => {
    const formas = new Set(VAZAMENTOS.map((c) => c.forma));
    for (const f of ["identidade", "confirmar_negar", "ignore_instrucoes", "modo_desenvolvedor", "repita_texto", "traduzir", "resumo_outras_palavras", "finja_outro", "autoridade",
      "outra_lingua", "codigo", "base64_disfarce", "por_partes", "role_play", "tecnologia", "caminhos", "senhas_chaves", "regras_seguranca", "injecao_conteudo"]) expect(formas, f).toContain(f);
  });
});

describe("filtro de saída: falas limpas de aula não são mexidas", () => {
  LIMPAS.forEach((c, i) => {
    const p = PERSONAS[i % 4];
    if (ALARMES_FALSOS.has(c.fala)) return void it.todo(`alarme falso (${c.forma}): ${c.fala}`);
    it(`${c.forma} / ${p}: volta igual`, () => {
      const r = protegerFala(c.fala, p, ctxDe(c));
      expect(r.achados, c.fala).toEqual([]);
      expect(r.texto).toBe(c.fala);
    });
  });
});
