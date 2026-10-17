// @vitest-environment node
/**
 * Revisão do "Tutor natural, sem textos prontos" (17/10/2026): o que os revisores acharam na bancada e no código, sem rede e sem IA.
 */
import { describe, expect, it } from "vitest";
import { apelidoDirigido, languageViolations } from "../../server/tutor/safety";
import { FICHAS, fichaTexto } from "../../server/tutor/fichas";
import { personaFixedLayer, personaTurn, resolveProfile, type ExplosivaChoice } from "../../server/tutor/personalityEngine";
import { personalityLayer, type PersonalityParams } from "../../server/tutor/personality";

const P: PersonalityParams = { humor: 70, sarcasm: 80, friendliness: 20, strictness: 90, profanity: 80, patience: 20, verbosity: 30, socratic_level: 60, motivation: 50, clinical_pressure: 60 };
const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

describe("apelido para o aluno é barrado (bancada de 17/10: palhaço, engraçadinho, valentão)", () => {
  // as falas que passaram na bancada (pasta depois/) e na linha de base
  const reais = [
    "Quer CRM hoje com essa marra toda, palhaço?",
    "Engraçadinho você, né? Agora me diz a conduta.",
    "Pior que não tá mentindo não, engraçadinho!",
    "Vai, me faz chorar de orgulho, palhaço!",
    "Isso aí, valentão do internato, agora explica.",
    "Folgado você, hein? Lê de novo.",
    "Moleque, presta atenção no enunciado.",
    "Sabichão, então me diz o critério.",
  ];
  const outros = ["Seu folgado, lê o enunciado.", "Você é muito abusado.", "Que folgado!", "Tu tá muito marrento hoje.", "Desgraçado, olha o caso!"];

  it("todas as formas viram ataque pessoal, em qualquer nível de palavrão, com a correção que pede para zoar a situação", () => {
    for (const t of [...reais, ...outros]) {
      for (const nivel of ["off", "mild", "moderate"] as const) {
        const v = languageViolations(t, nivel).filter((x) => x.code === "personal_attack");
        expect(v.length, `${t} (${nivel})`).toBeGreaterThan(0);
        expect(v[0].detail).toMatch(/zoe a situação ou a resposta, sem dar nome a ele/);
      }
    }
  });

  it("não barra o uso que não é apelido: paciente de exemplo, objeto, adjetivo do caso, palavrão sobre a situação", () => {
    for (const t of [
      "Convencido? Então me diz a conduta.", "Um moleque de 12 anos chega com febre e rigidez de nuca.", "O curativo ficou folgado e sangrou.",
      "Essa mala direta não cai na prova.", "Esse vírus é safado, engana todo mundo.", "Rapaz de 25 anos com dor torácica.", "Porra, você sabia essa!",
      "Metido a besta esse enunciado, né?", "Abusado esse distrator da letra C.",
    ]) expect(languageViolations(t, "moderate"), t).toEqual([]);
  });

  it("a mesma conferência pega o apelido na fala transcrita da voz (o texto chega sem acento ou com)", () => {
    expect(apelidoDirigido(fold("bora, palhaço, me diz a dose que tá na base"))).toBe("palhaco");
    expect(apelidoDirigido(fold("bora, me diz a dose que tá na base"))).toBeNull();
  });

  it("a ficha do Durão e da Durona proíbe o apelido pelo nome e ensina a zoar a situação", () => {
    for (const id of ["durao", "durona"] as const) {
      expect(FICHAS[id].nunca).toMatch(/palhaço, engraçadinho, valentão, sabichão, espertinho, moleque/);
      expect(FICHAS[id].reacoes.brincando).toMatch(/Zoe a situação, não dê nome a ele/);
    }
  });
});

describe("grito e palavrão da ficha seguem o limite que vale (18+, painel, escolha do aluno)", () => {
  const voz = (choice: ExplosivaChoice | null, maxProfanity: "off" | "mild" | "moderate" = "moderate", personality = "durona") => {
    const resolved = resolveProfile({ personality, explosiva: choice, platform: { maxProfanity, explosivaEnabled: true } });
    const d = personaTurn({ resolved, memory: null, rules: [], provider: "gemini_live" });
    return personaFixedLayer(d, { personalityId: personality, examples: [], limites: { palavrao: resolved.profanityCap, gritos: resolved.shoutsAllowed } });
  };

  it("voz ao vivo sem a declaração de 18+ e médico: fica no N2 e as instruções não mandam gritar nem xingar pesado", () => {
    for (const p of ["durona", "durao"]) {
      const t = voz({ level: "n3", shouts: true, profanity: true, adultDeclared: false }, "moderate", p);
      expect(t).not.toMatch(/nível 3|grito e palavrão estão liberados|MAIÚSCULA curtinha/);
      expect(t).toMatch(/sem grito \(nada de frase em maiúscula\); só palavrão leve/);
    }
  });

  it("voz ao vivo com palavrão desligado pelo aluno ou pelo painel: sem palavrão nenhum", () => {
    expect(voz({ level: "n3", shouts: false, profanity: false, adultDeclared: true })).toMatch(/sem grito \(nada de frase em maiúscula\); sem palavrão nenhum/);
    expect(voz({ level: "n3", shouts: true, profanity: true, adultDeclared: true }, "off")).toMatch(/sem palavrão nenhum/);
  });

  it("voz ao vivo com 18+ e tudo ligado: liberado, na dose do ESTADO", () => {
    expect(voz({ level: "n3", shouts: true, profanity: true, adultDeclared: true })).toMatch(/grito e palavrão estão liberados, na dose que o ESTADO pede/);
  });

  it("texto: a ficha usa o teto da conversa; aluno mal fica sem grito e sem palavrão", () => {
    const base = { id: "durona", name: "Durona", params: P, style_notes: "" };
    expect(personalityLayer(base, P, "off", 3, null, null, { limites: { palavrao: "off", gritos: false } })).toMatch(/sem grito \(nada de frase em maiúscula\); sem palavrão nenhum/);
    expect(personalityLayer(base, P, "moderate", 3, null, null, { limites: { palavrao: "moderate", gritos: true } })).toMatch(/grito e palavrão estão liberados/);
    expect(fichaTexto(FICHAS.durona)).toMatch(/Grito e palavrão só no nível que vale nesta conversa/);
  });
});

describe("no texto o humor muda a cada fala do aluno, não só na resposta da questão", () => {
  it("brincadeira deixa satisfeito, aflição acolhe, provocação e pedido de seriedade deixam firme; resposta oral certa fora do Me teste anima", async () => {
    const { engineFor, normalize, step, leituraDoRegistro } = await import("../../server/tutor/emotion");
    const { lerRegistro } = await import("../../server/tutor/leituraDoAluno");
    const humor = (id: string, fala: string, extra: Record<string, unknown> = {}) => {
      const e = engineFor(id);
      return step(normalize(null, e), e, { kind: "message", leitura: leituraDoRegistro(lerRegistro(fala).registro), ...extra }, () => 0.5).state.mood;
    };
    for (const id of ["durona", "durao", "acolhedor", "tranquila"]) {
      expect(humor(id, "kkkkk professor, essa eu chutei bonito")).toBe("pleased");
      expect(humor(id, "tô muito nervoso, acho que vou reprovar")).toBe("encouraged");
      expect(humor(id, "me dá logo a resposta senão vou cancelar a assinatura")).toBe("firm");
      expect(humor(id, "acho que é cetoacidose", { oralLeve: true })).toBe("pleased");
      expect(humor(id, "acho que é cetoacidose")).toBe("neutral");
    }
  });
});

describe("reserva fixa por situação (a frase do dado sem fonte não responde mais a «manda uma questão» nem à letra marcada)", () => {
  it("pedido de caso, reação à letra e dado sem fonte têm reservas próprias, que variam pela conversa", async () => {
    const { fallbackReply, pedeCaso } = await import("../../server/tutor/safety");
    const num = [{ code: "ungrounded_number", detail: "" }];
    for (const t of ["Manda uma questão de tuberculose", "Pode soltar o caso clínico da dengue", "bora, me dá um caso de sepse"]) expect(pedeCaso(t), t).toBe(true);
    for (const t of ["acho que é dengue grave", "o caso fala de febre"]) expect(pedeCaso(t), t).toBe(false);
    const caso = fallbackReply(num, { pedidoDeCaso: true, tema: "tuberculose" });
    expect(caso).not.toMatch(/não tenho confirmado aqui/);
    expect(caso).toMatch(/questão oficial de tuberculose/);
    expect(fallbackReply(num, { reacao: { letra: "B", acertou: true } })).toMatch(/Marcou a B e acertou/);
    expect(fallbackReply(num, { reacao: { letra: "C", acertou: false }, semente: 1 })).toMatch(/A C não é a certa/);
    const dados = new Set([0, 1, 2].map((semente) => fallbackReply(num, { semente })));
    expect(dados.size).toBe(3);
  });
});

describe("o jeito de passar a vez não vira bordão («Agora me diz: …?» no fim de toda fala)", () => {
  it("as formas já usadas na conversa vão ao professor e a regra de não repetir cobre o fim da fala", async () => {
    const { transitionsUsed, passaComAgora, recentExpressions } = await import("../../server/tutor/emotion");
    const { NO_REPEAT_RULE } = await import("../../server/tutor/personality");
    const falas = ["Isso! Agora me diz: qual a conduta?", "Boa. Agora me responde o critério.", "Me conta o que você viu.", "Pra fechar com chave de ouro: e o tratamento?"];
    expect(transitionsUsed(falas)).toEqual(expect.arrayContaining(["agora me diz", "agora me responde", "fechar com chave de ouro"]));
    expect(passaComAgora("Agora me diz: e daí?")).toBe(true);
    expect(passaComAgora("Agora sim, cravou.")).toBe(false);
    expect(recentExpressions(["Fecha com chave de ouro, vai.", "Me conta, o que você faz aqui?"])).toEqual(expect.arrayContaining(["chave de ouro", "o que você faz"]));
    expect(NO_REPEAT_RULE).toMatch(/transicoes_ja_usadas/);
    for (const v of ["agora me diz", "me conta", "mandou bem", "fecha com chave de ouro", "o que você faz"]) expect(NO_REPEAT_RULE).toContain(`«${v}»`);
  });
});

describe("abertura e passagem sem fórmula e sem passado inventado", () => {
  it("1ª conversa sem dado do aluno: o contexto marca isso, o jeito «comece pelo aluno» não sai e «de novo» é barrado", async () => {
    const { openingInput, openingViolations, anguloDe } = await import("../../server/tutor/opening");
    const st: any = { message: { id: 9, content: "Reserva.", kind: "abertura" }, session: { mode: "livre", topic: "Tuberculose", title: null, context_type: null, context_label: null, area: null, question_state: "none", personality_id: "acolhedor", session_mood: "neutral", discuss_letter: null, previous_correct: null }, recent: [], previous_session: null, local_hour: 15 };
    const ctx: any = { config: { max_profanity: "off" }, session: { settings: {}, emotion: null }, personality: { id: "acolhedor" }, memory: null, student: { first_name: null, days_to_exam: null }, question: null };
    for (let i = 0; i < 40; i++) {
      const input = openingInput({ ...st, message: { ...st.message, id: i } }, ctx);
      expect(input).toMatch(/"primeira_conversa":true/);
      expect(input).toMatch(/"sem_historico":true/);
      expect(input).not.toMatch(/comece pelo aluno/);
      expect(input).not.toMatch(/neutro/);
    }
    expect(anguloDe("x", "abertura", { semDadosDoAluno: true })).not.toMatch(/comece pelo aluno/);
    const v = openingViolations("Tuberculose de novo na sua mira, e tem detalhe aí que sempre tenta te derrubar.", [], [], "Tuberculose", { semHistorico: true });
    expect(v.map((x) => x.code)).toContain("passado_inventado");
    expect(openingViolations("Tuberculose na sua mira: qual sinal você caça primeiro?", [], [], "Tuberculose", { semHistorico: true })).toEqual([]);
  });

  it("humor anunciado, rótulo «neutro», fórmulas e a mesma estrutura de uma fala já ouvida são barrados", async () => {
    const { openingViolations } = await import("../../server/tutor/opening");
    expect(openingViolations("Tô num dia bem neutro, então escolhe o tema.", []).map((x) => x.code)).toContain("humor_anunciado");
    expect(openingViolations("Tô de bom humor hoje: escolhe o tema.", []).map((x) => x.code)).toContain("humor_anunciado");
    expect(openingViolations("Hoje a meta é sair daqui sem errar besteira.", []).map((x) => x.code)).toContain("formula");
    const ouvida = "Hoje a gente vai sair daqui sem errar besteira por afobação, porra. Escolhe logo o assunto que a gente vai encarar.";
    expect(openingViolations("A gente vai sair daqui sem errar besteira por pressa hoje, PORRA. Escolhe logo o assunto.", [ouvida]).map((x) => x.code)).toContain("repeat");
  });
});
