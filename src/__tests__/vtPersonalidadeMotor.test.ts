// @vitest-environment node
/**
 * Voice Tutor — Personality Engine (server/tutor/personalityEngine.ts, voiceReactionFilter.ts, voiceReactions.ts).
 * Pedidos do dono (15/10): 3 professores públicos; Durona Explosiva N1–N4; reações de voz SÓ da lista do dono; desligar gritos;
 * calma em sofrimento/crise; nunca ofensa pessoal, discriminação ou ameaça; gabarito escondido e simulado sem ajuda intactos.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  BASE_NO_TAGS_LINE, DEFAULT_EXPLOSIVA, EMOTIONAL_STATES, PROFILES, freshMemory, personaPromptLayer, personaTurn, recordReactions, resolveProfile, signalsFromText,
  transition, withReactionPolicy, type ExplosivaChoice, type PersonaMemory, type Signal,
} from "../../server/tutor/personalityEngine";
import { personaLanguageViolations, renderReply, unshout } from "../../server/tutor/voiceReactionFilter";
import { planPersonaTurn, sanitizeRules, forgetReactionConfig } from "../../server/tutor/voiceReactions";
import { safetyCheck } from "../../server/tutor/safety";
import { hintLeak } from "../../server/tutor/questionHint";
import { BASE_TUTOR_PROMPT } from "../../server/tutor/prompts";
import { forgetTutorSettings } from "../../server/tutor/settings";
import { REACTIONS, REACTION_IDS, REACTION_PROFILES, type ReactionId, type ReactionRule, type VoiceProviderId } from "../shared/tutor/voiceReactions";

const ROOT = path.resolve(__dirname, "../..");
const PLATFORM: { maxProfanity: "off" | "mild" | "moderate"; explosivaEnabled: boolean } = { maxProfanity: "moderate", explosivaEnabled: true };
const adult = (level: ExplosivaChoice["level"], over: Partial<ExplosivaChoice> = {}): ExplosivaChoice => ({ level, shouts: true, profanity: true, adultDeclared: true, ...over });
const profileOf = (personality: string, explosiva: ExplosivaChoice | null = null, platform = PLATFORM) => resolveProfile({ personality, explosiva, platform });
/** O dono marcou TODAS as reações para todos os perfis (pior caso para o filtro). */
const ALL_RULES: ReactionRule[] = REACTION_PROFILES.flatMap((p) => REACTION_IDS.map((reaction) => ({ personality: p.personality, level: p.level, reaction, allowed: true, max_per_reply: 3, max_per_10: 10 })));
const rule = (personality: ReactionRule["personality"], level: ReactionRule["level"], reaction: ReactionId, over: Partial<ReactionRule> = {}): ReactionRule =>
  ({ personality, level, reaction, allowed: true, max_per_reply: 1, max_per_10: 10, ...over });

/** Leva a memória até um estado: uma sequência de turnos com fatos e falas. */
function play(personality: string, explosiva: ExplosivaChoice | null, turns: { facts?: Signal[]; text?: string }[], rules = ALL_RULES, provider: VoiceProviderId = "elevenlabs") {
  const resolved = profileOf(personality, explosiva);
  let memory: PersonaMemory | null = null;
  let d = null as ReturnType<typeof personaTurn> | null;
  for (const t of turns) {
    d = personaTurn({ resolved, memory, facts: t.facts, studentText: t.text, rules, provider });
    memory = d.memory;
  }
  return d!;
}

describe("perfis e parâmetros estruturados", () => {
  it("3 professores públicos + 4 níveis da Durona Explosiva, com os 9 parâmetros entre 0 e 100", () => {
    expect(Object.keys(PROFILES).sort()).toEqual(["direto", "durona", "durona:n1", "durona:n2", "durona:n3", "durona:n4", "tranquilo"]);
    for (const p of Object.values(PROFILES)) {
      expect(Object.keys(p.params).sort()).toEqual(["formality", "intensity", "length", "profanity_frequency", "provocation", "reaction_frequency", "sarcasm", "socratic", "impatience"].sort());
      for (const v of Object.values(p.params)) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(100);
    }
    // a intensidade sobe do N1 ao N4
    const i = ["n1", "n2", "n3", "n4"].map((l) => PROFILES[`durona:${l}`].params.intensity);
    expect([...i].sort((a, b) => a - b)).toEqual(i);
  });

  it("ids antigos (acolhedor, preguicoso) viram Tranquilo; outros, Direto", () => {
    expect(profileOf("acolhedor").profile.key).toBe("tranquilo");
    expect(profileOf("preguicoso").profile.key).toBe("tranquilo");
    expect(profileOf("qualquer").profile.key).toBe("direto");
  });

  it("N3/N4 dependem da declaração de 18+ e médico do aceite do Termo; sem ela caem para N2", () => {
    expect(profileOf("durona", adult("n4", { adultDeclared: false })).profile.key).toBe("durona:n2");
    expect(profileOf("durona", adult("n3", { adultDeclared: false })).note).toMatch(/Termo/);
    expect(profileOf("durona", adult("n4")).profile.key).toBe("durona:n4");
    expect(profileOf("durona", adult("n1")).profile.key).toBe("durona:n1");
  });

  it("padrão do dono (16/10): quem escolhe a Durona e não mexeu nas preferências recebe o N3 com gritos e palavrões", () => {
    expect(DEFAULT_EXPLOSIVA).toEqual({ level: "n3", shouts: true, profanity: true });
    const r = profileOf("durona", { ...DEFAULT_EXPLOSIVA, adultDeclared: true });
    expect(r.profile.key).toBe("durona:n3");
    expect(r.profanityCap).toBe("moderate");
    expect(r.shoutsAllowed).toBe(true);
    // sem escolha nenhuma vinda do banco (ex.: banco fora do ar), o padrão vale mas sem maioridade comprovada: N2
    expect(profileOf("durona", null).profile.key).toBe("durona:n2");
  });

  it("o aluno desliga palavrões e/ou gritos sem mudar o nível", () => {
    const semPalavrao = profileOf("durona", adult("n4", { profanity: false }));
    expect(semPalavrao.profile.key).toBe("durona:n4");
    expect(semPalavrao.profanityCap).toBe("off");
    expect(semPalavrao.shoutsAllowed).toBe(true);
    const semGrito = profileOf("durona", adult("n4", { shouts: false }));
    expect(semGrito.shoutsAllowed).toBe(false);
    expect(semGrito.profanityCap).toBe("moderate");
    const d = play("durona", adult("n4", { profanity: false }), [{ facts: ["wrong"] }, { facts: ["repeated_error"] }]);
    expect(d.policy.profanity).toBe("off");
    expect(personaLanguageViolations("Porra, de novo?", d).map((v) => v.code)).toContain("profanity");
  });

  it("Explosiva desligada no painel: vale a Durona de sempre; a escolha do aluno não muda Tranquilo nem Direto", () => {
    expect(profileOf("durona", adult("n4"), { ...PLATFORM, explosivaEnabled: false }).profile.key).toBe("durona");
    expect(profileOf("tranquilo", adult("n4")).profile.key).toBe("tranquilo");
    expect(profileOf("direto", adult("n4")).profile.key).toBe("direto");
  });

  it("o teto do painel (max_profanity) manda sobre o perfil", () => {
    expect(profileOf("durona", adult("n4"), { maxProfanity: "off", explosivaEnabled: true }).profanityCap).toBe("off");
    expect(profileOf("durona", adult("n4"), { maxProfanity: "mild", explosivaEnabled: true }).profanityCap).toBe("mild");
  });
});

describe("13 estados emocionais e transições pela conversa (sem sorteio)", () => {
  it("os 13 estados do bloco 7 existem", () => {
    expect(EMOTIONAL_STATES).toEqual(["neutral", "curious", "skeptical", "sarcastic", "irritated", "frustrated", "surprised", "excited", "proud", "playful", "focused", "calm", "empathetic"]);
  });

  it("mesma conversa, mesmo humor (determinístico)", () => {
    const turns = [{ facts: ["wrong"] as Signal[] }, { facts: ["repeated_error"] as Signal[] }, { text: "kkkk tô brincando" }, { facts: ["correct"] as Signal[] }];
    const a = play("durona", adult("n4"), turns);
    const b = play("durona", adult("n4"), turns);
    expect(a.state).toBe(b.state);
    expect(a.memory).toEqual(b.memory);
  });

  it("erro → erro repetido → três erros sobem a irritação (Durona N3)", () => {
    expect(play("durona", adult("n3"), [{ facts: ["wrong"] }]).state).toBe("irritated");
    expect(play("durona", adult("n3"), [{ facts: ["wrong"] }, { facts: ["repeated_error"] }]).state).toBe("frustrated");
  });

  it("acerto logo depois de errar: alívio/comemoração; bom raciocínio: surpresa ou orgulho", () => {
    expect(play("durona", adult("n4"), [{ facts: ["wrong"] }, { facts: ["correct"] }]).state).toBe("excited");
    expect(play("tranquilo", null, [{ facts: ["wrong"] }, { facts: ["correct"] }]).state).toBe("proud");
    expect(play("durona", adult("n2"), [{ facts: ["correct", "good_reasoning"] }]).state).toBe("surprised");
    expect(play("direto", null, [{ facts: ["correct", "good_reasoning"] }]).state).toBe("proud");
  });

  it("brincadeira → brincalhona; conduta perigosa → surpresa (indignação)", () => {
    expect(play("durona", adult("n4"), [{ text: "kkkkk relaxa professora, tô brincando" }]).state).toBe("playful");
    expect(play("durona", adult("n4"), [{ facts: ["wrong", "unsafe_answer"] }]).state).toBe("surprised");
  });

  it("pedido de seriedade: concentrada por 5 falas, sem palavrão, sem grito, sem reação de voz", () => {
    const d = play("durona", adult("n4"), [{ facts: ["wrong"] }, { text: "para de xingar, fala sério comigo" }]);
    expect(d.state).toBe("focused");
    expect(d.policy).toMatchObject({ profanity: "off", shouts: false, mockery: "none" });
    expect(d.policy.reactions.map((r) => r.id)).toEqual(["slow"]);
    // o erro seguinte, ainda no período sério, não volta a xingar
    const next = play("durona", adult("n4"), [{ facts: ["wrong"] }, { text: "para de xingar, fala sério comigo" }, { facts: ["wrong"] }]);
    expect(next.state).toBe("focused");
    expect(next.policy.profanity).toBe("off");
  });

  it("assunto sensível → calma; frustração do aluno → acolhimento", () => {
    expect(play("durona", adult("n4"), [{ text: "perdi um paciente ontem no plantão" }]).state).toBe("calm");
    const d = play("durona", adult("n4"), [{ facts: ["wrong"] }, { text: "não aguento mais, sou um fracasso" }]);
    expect(d.state).toBe("empathetic");
    expect(d.policy).toMatchObject({ profanity: "off", shouts: false });
  });

  it("sinais do texto do aluno", () => {
    expect(signalsFromText("tô pensando em me matar")).toContain("crisis");
    expect(signalsFromText("Tô muito ansiosa com a prova")).toContain("student_frustration");
    expect(signalsFromText("dá pra explicar sério?")).toEqual(expect.arrayContaining(["seriousness_request", "question"]));
    expect(signalsFromText("hahaha")).toContain("joke");
    expect(signalsFromText("qual a dose de adrenalina?")).toEqual(["question"]);
  });
});

describe("crise → calma (vale em qualquer professor e nível)", () => {
  for (const [who, choice] of [["durona", adult("n4")], ["direto", null], ["tranquilo", null], ["durona", null]] as const) {
    it(`${who}${choice ? ` ${choice.level}` : ""}: acolhe, sem palavrão, sem grito, sem reação, com CVV 188 — e continua calmo depois`, () => {
      const d = play(who, choice, [{ facts: ["wrong"] }, { text: "sinceramente às vezes quero morrer" }]);
      expect(d.state).toBe("empathetic");
      expect(d.crisisCare).toBe(true);
      expect(d.policy).toMatchObject({ profanity: "off", shouts: false, mockery: "none" });
      expect(d.policy.reactions.filter((r) => r.id !== "slow")).toEqual([]);
      const layer = personaPromptLayer(d);
      expect(layer).toMatch(/CVV/);
      expect(layer).toMatch(/188/);
      // turnos seguintes: erro de questão não faz voltar a bronca
      const after = play(who, choice, [{ facts: ["wrong"] }, { text: "sinceramente às vezes quero morrer" }, { facts: ["wrong"] }, { facts: ["repeated_error"] }]);
      expect(["calm", "empathetic"]).toContain(after.state);
      expect(after.policy.profanity).toBe("off");
      // a fala com palavrão é barrada pela conferência
      expect(personaLanguageViolations("Porra, calma.", after).map((v) => v.code)).toContain("profanity");
    });
  }
});

describe("limites de linguagem por nível", () => {
  const hot = (level: ExplosivaChoice["level"]) => play("durona", adult(level), [{ facts: ["wrong"] }, { facts: ["repeated_error"] }, { facts: ["wrong"] }]);
  it("N1 nunca libera palavrão nem grito, mesmo frustrada", () => {
    const d = hot("n1");
    expect(d.state).toBe("frustrated");
    expect(d.policy.profanity).toBe("off");
    expect(d.policy.shouts).toBe(false);
    expect(personaLanguageViolations("Que merda de raciocínio é esse?", d).map((v) => v.code)).toContain("profanity");
    expect(personaLanguageViolations("Putz, de novo.", d).map((v) => v.code)).toContain("profanity");
  });
  it("N2: no máximo palavrão leve", () => {
    const d = hot("n2");
    expect(d.policy.profanity).toBe("mild");
    expect(personaLanguageViolations("Putz. Lê de novo.", d)).toEqual([]);
    expect(personaLanguageViolations("Porra, de novo?", d).map((v) => v.code)).toContain("profanity");
  });
  it("N3/N4: palavrão do pedido do dono passa (sobre o erro)", () => {
    for (const lv of ["n3", "n4"] as const) {
      const d = hot(lv);
      expect(d.policy.profanity).toBe("moderate");
      for (const fala of ["Porra!", "Caralho! Corticoide?!", "Puta que pariu, de novo isso?", "Que merda de raciocínio é esse?", "Pelo amor de Deus!", "Meu Deus do céu!"]) {
        expect(personaLanguageViolations(fala, d).filter((v) => v.code !== "shout_not_allowed")).toEqual([]);
      }
    }
  });
  it("N3 sem a declaração do Termo vira N2 e não xinga", () => {
    const d = play("durona", adult("n3", { adultDeclared: false }), [{ facts: ["wrong"] }, { facts: ["repeated_error"] }]);
    expect(d.profileKey).toBe("durona:n2");
    expect(personaLanguageViolations("Porra, de novo?", d).map((v) => v.code)).toContain("profanity");
  });
  it("Tranquilo nunca xinga", () => {
    const d = play("tranquilo", null, [{ facts: ["wrong"] }, { facts: ["repeated_error"] }, { facts: ["wrong"] }]);
    expect(d.policy.profanity).toBe("off");
  });
  it("a camada de prompt diz o nível de linguagem certo", () => {
    expect(personaPromptLayer(hot("n1"))).toMatch(/Sem palavrão/);
    expect(personaPromptLayer(hot("n4"))).toMatch(/Palavrão liberado/);
  });
});

describe("nunca ofensa pessoal, discriminação ou ameaça (nem no N4)", () => {
  const n4 = play("durona", adult("n4"), [{ facts: ["wrong"] }, { facts: ["repeated_error"] }]);
  it.each([
    ["Você é burro demais.", "personal_attack"],
    ["Seu merda, presta atenção.", "personal_attack"],
    ["Você é um caso perdido.", "personal_attack"],
    ["Você nunca vai passar no Revalida.", "personal_attack"],
    ["Que vergonha de aluno.", "personal_attack"],
    ["Sua cara de quem não estudou.", "personal_attack"],
    ["Vou te matar se errar de novo.", "threat"],
    ["Cuidado comigo, hein.", "threat"],
    ["Isso é coisa de viado.", "personal_attack"],
    ["Vai se foder.", "personal_attack"],
  ])("barra: %s", (fala, code) => {
    expect(personaLanguageViolations(fala, n4).map((v) => v.code)).toContain(code);
  });
  it("zombaria do ERRO passa", () => {
    for (const fala of ["Porra, corticoide primeiro? É tipo apagar incêndio com regador!", "Essa alternativa é uma piada.", "Que merda de raciocínio é esse? Adrenalina, intramuscular!"]) {
      expect(personaLanguageViolations(fala, n4).filter((v) => v.code !== "shout_not_allowed")).toEqual([]);
    }
  });
  it("a camada de prompt carrega os limites de respeito em todo perfil", () => {
    for (const key of Object.keys(PROFILES)) {
      const [personality, level] = key.split(":");
      const d = play(personality, level ? adult(level as ExplosivaChoice["level"]) : null, [{ facts: ["wrong"] }]);
      const layer = personaPromptLayer(d);
      expect(layer).toMatch(/nunca para a pessoa/);
      expect(layer).toMatch(/ameaça, discriminação/);
    }
  });
});

describe("reações de voz: só as da lista do dono", () => {
  it("sem nenhuma regra marcada, nenhuma reação passa (nem pedida pela IA)", () => {
    const d = play("durona", adult("n4"), [{ facts: ["wrong"] }], []);
    expect(d.policy.reactions).toEqual([]);
    const r = renderReply("[shouts] CARALHO! CORTICOIDE?! [sighs] Adrenalina intramuscular, porra! [laughs]", d);
    expect(r.spoken).not.toMatch(/\[/);
    expect(r.used).toEqual([]);
    expect(r.removed.map((x) => x.reason)).toEqual(["nao_liberada", "nao_liberada", "nao_liberada"]);
  });

  it("marcada só no N4: o N3 não usa", () => {
    const rules = [rule("durona", "n4", "laughs")];
    const n4 = play("durona", adult("n4"), [{ text: "kkkk brincadeira" }], rules);
    const n3 = play("durona", adult("n3"), [{ text: "kkkk brincadeira" }], rules);
    expect(n4.policy.reactions.map((r) => r.id)).toEqual(["laughs"]);
    expect(n3.policy.reactions).toEqual([]);
    expect(renderReply("[laughs] Boa.", n3).used).toEqual([]);
  });

  it("marcação inventada, fora do catálogo ou de cena é tirada; a transcrição nunca mostra marcação", () => {
    const d = play("durona", adult("n4"), [{ facts: ["wrong"] }, { facts: ["repeated_error"] }], ALL_RULES);
    const r = renderReply("[angry] *gargalhada de deboche* (risos) [sighs] Adrenalina IM, porra! </td>", d);
    expect(r.removed.map((x) => x.raw)).toEqual(expect.arrayContaining(["[angry]", "*gargalhada de deboche*", "</td>"]));
    expect(r.display).toBe("Adrenalina IM, porra!");
    expect(r.display).not.toMatch(/[[\]<>*]/);
    expect(r.spoken).toContain("[sighs]");
    expect(r.emotion.state).toBe("irritated");
    expect(r.emotion.reactions.map((x) => x.id)).toEqual(r.used);
  });

  it("parênteses comuns e ênfase de texto ficam (não são cena)", () => {
    const d = play("tranquilo", null, [{ facts: ["wrong"] }], []);
    expect(renderReply("Olha o comando (a última frase) e o *tempo* de evolução.", d).display).toBe("Olha o comando (a última frase) e o tempo de evolução.");
  });

  it("limite por fala e orçamento da fala", () => {
    const rules = [rule("durona", "n4", "laughs", { max_per_reply: 1 }), rule("durona", "n4", "snorts")];
    const d = play("durona", adult("n4"), [{ text: "kkkk" }], rules);
    const r = renderReply("[laughs] Isso. [laughs] Sério? [snorts] Tá.", d);
    expect(r.used).toEqual(["laughs", "snorts"]);
    expect(r.removed).toEqual([{ raw: "[laughs]", reason: "limite_da_fala" }]);
  });

  it("frequência máxima a cada 10 falas", () => {
    const rules = [rule("durona", "n4", "laughs", { max_per_10: 2 })];
    const resolved = profileOf("durona", adult("n4"));
    let memory: PersonaMemory | null = null;
    const passed: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const d = personaTurn({ resolved, memory, studentText: "kkkk", rules, provider: "elevenlabs" });
      const r = renderReply("[laughs] Boa.", d);
      passed.push(r.used.includes("laughs"));
      memory = recordReactions(d.memory, r.used);
    }
    expect(passed).toEqual([true, true, false, false]);
  });

  it("reação que não combina com o estado sai (risada no acolhimento)", () => {
    const d = play("durona", adult("n4"), [{ text: "tô desesperada, não aguento mais" }], ALL_RULES);
    expect(renderReply("[laughs] Calma.", d).used).toEqual([]);
  });

  it("provedor ativo: Gemini voz entende só risada e suspiro (<laugh>, <sigh>); Gemini ao vivo não usa marcação", () => {
    const d = play("durona", adult("n4"), [{ text: "kkkk" }], ALL_RULES, "gemini_tts");
    expect(d.policy.reactions.map((r) => r.id).sort()).toEqual(["laughs"]);
    expect(renderReply("[laughs] Boa. [mischievously] Vai.", d).spoken).toBe("<laugh> Boa. Vai.");
    const live = play("durona", adult("n4"), [{ text: "kkkk" }], ALL_RULES, "gemini_live");
    expect(live.policy.tagged).toBe(false);
    expect(renderReply("[laughs] Boa.", live).spoken).toBe("Boa.");
    expect(personaPromptLayer(live)).toMatch(/Não escreva marcações/);
  });

  it("o catálogo só tem reações citadas pela documentação, cada uma com fonte; o banco aceita exatamente as mesmas", () => {
    for (const r of REACTIONS) expect(r.source.length).toBeGreaterThan(10);
    const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003011900_tutor_reacoes_de_voz.sql"), "utf8");
    const list = sql.match(/reaction in \(([\s\S]*?)\)\)/)![1].match(/'([a-z_]+)'/g)!.map((x) => x.slice(1, -1));
    expect(list.sort()).toEqual([...REACTION_IDS].sort());
  });

  it("regras vindas do banco são saneadas (nível só na Durona; reação fora do catálogo sai)", () => {
    expect(sanitizeRules([
      { personality: "durona", level: "n4", reaction: "laughs", allowed: true, max_per_reply: 9, max_per_10: 0 },
      { personality: "direto", level: "n4", reaction: "laughs", allowed: true, max_per_reply: 1, max_per_10: 1 },
      { personality: "durona", level: "n4", reaction: "angry", allowed: true, max_per_reply: 1, max_per_10: 1 },
      "lixo",
    ])).toEqual([{ personality: "durona", level: "n4", reaction: "laughs", allowed: true, max_per_reply: 1, max_per_10: 2 }]);
  });
});

describe("gritos", () => {
  const indignada = (shouts: boolean, rules = ALL_RULES) => play("durona", adult("n4", { shouts }), [{ facts: ["wrong", "unsafe_answer"] }], rules);
  it("N4 indignada com gritos ligados: [shouts] e MAIÚSCULAS passam", () => {
    const d = indignada(true);
    expect(d.policy.shouts).toBe(true);
    const r = renderReply("[shouts] CARALHO! CORTICOIDE?! Adrenalina IM.", d);
    expect(r.used).toContain("shouts");
    expect(r.display).toBe("CARALHO! CORTICOIDE?! Adrenalina IM.");
  });
  it("aluno desligou os gritos: some o [shouts] e o grito em maiúsculas volta ao normal (siglas ficam)", () => {
    const d = indignada(false);
    expect(d.policy.shouts).toBe(false);
    expect(d.policy.reactions.map((r) => r.id)).not.toContain("shouts");
    const r = renderReply("[shouts] CARALHO! CORTICOIDE?! AVC, HELLP e IAM não são isso. AGORA SIM!", d);
    expect(r.used).not.toContain("shouts");
    expect(r.display).toBe("Caralho! Corticoide?! AVC, HELLP e IAM não são isso. Agora sim!");
    expect(r.spoken).not.toMatch(/\[shouts\]|CARALHO/);
    expect(personaLanguageViolations("CARALHO!", d).map((v) => v.code)).toContain("shout_not_allowed");
  });
  it("N1 e N2 nunca gritam", () => {
    for (const lv of ["n1", "n2"] as const) expect(play("durona", adult(lv), [{ facts: ["wrong", "unsafe_answer"] }]).policy.shouts).toBe(false);
  });
  it("unshout preserva siglas e números", () => {
    expect(unshout("PA 90x60, ECG e TSH; NÃO!").text).toBe("PA 90x60, ECG e TSH; não!");
  });
});

describe("gabarito escondido e simulado sem ajuda continuam valendo", () => {
  const question = { open: true, officialLetter: "C", officialText: "Adrenalina intramuscular na face anterolateral da coxa" };
  const ctx = { blocks: [], conversationTexts: [], question, hintLevel: null, hasUpdateCard: false, profanity: "moderate" as const };
  const out = (reply: string) => ({ reply, grounding: "GENERAL" as const, citations: [], evaluation: { error_type: "none" as const, knowledge_gap: "", severity: 1 as const, unsafe: false, reasoning_quality: "na" as const, recommended_action: "none" as const, answer_correct: "na" as const, self_corrected: false }, justification: "NONE" as const, reveals_answer: false, suggested_replies: [] });

  it("a camada de personalidade nunca carrega gabarito (só recebe a diretiva)", () => {
    const d = play("durona", adult("n4"), [{ facts: ["wrong"] }]);
    const layer = personaPromptLayer(d);
    expect(layer).not.toMatch(/gabarito oficial|alternativa correta/i);
  });

  it("Durona N4 que entrega a letra com a questão aberta continua barrada pela conferência, mesmo depois do filtro de reações", () => {
    const d = play("durona", adult("n4"), [{ facts: ["wrong"] }, { facts: ["repeated_error"] }]);
    const r = renderReply("[shouts] PORRA! A resposta é a letra C, caralho!", d);
    expect(safetyCheck(out(r.display), ctx).violations.map((v) => v.code)).toContain("answer_leak");
    const t = renderReply("[laughs] Marque C e para de sofrer.", d);
    expect(safetyCheck(out(t.display), ctx).violations.map((v) => v.code)).toContain("answer_leak");
  });

  it("simulado que proíbe ajuda: todo perfil fica sem ajuda (socrático 0) e o prompt proíbe dica, pista e letra", () => {
    for (const key of Object.keys(PROFILES)) {
      const [personality, level] = key.split(":");
      const resolved = profileOf(personality, level ? adult(level as ExplosivaChoice["level"]) : null);
      const d = personaTurn({ resolved, memory: null, facts: ["wrong"], studentText: "me dá uma dica, por favor?", rules: ALL_RULES, provider: "elevenlabs", exam: { helpLocked: true } });
      expect(d.pedagogy).toMatchObject({ help: "none", socratic: 0 });
      expect(personaPromptLayer(d)).toMatch(/SIMULADO SEM AJUDA: não dê dica, pista, eliminação de alternativa, letra nem resolução/);
    }
  });

  it("dica com a cara da Durona que cita letra continua barrada pelo conferidor da dica", () => {
    expect(hintLeak("Porra, elimina a alternativa B que sobra pouco.")).toBe("citou a letra de uma alternativa");
  });
});

describe("encaixe no prompt e no servidor", () => {
  it("o núcleo atual do Tutor (prompts.ts) continua proibindo marcações; com o motor, a linha vira a política do dono", () => {
    expect(BASE_TUTOR_PROMPT).toContain(BASE_NO_TAGS_LINE);
    const d = play("durona", adult("n4"), [{ text: "kkkk" }], [rule("durona", "n4", "laughs")]);
    const prompt = withReactionPolicy(BASE_TUTOR_PROMPT, d.policy);
    expect(prompt).not.toContain(BASE_NO_TAGS_LINE);
    expect(prompt).toMatch(/Reações de voz liberadas NESTA fala \(só estas, escritas exatamente assim, onde a reação acontece\): \[laughs\]/);
  });

  it("o Tutor atual não usa o motor novo (Durona de hoje segue igual até o dono aprovar)", () => {
    for (const f of ["engine.ts", "speech.ts", "elevenlabsTts.ts", "speechDirector.ts", "officialVoices.ts", "realtime.ts", "router.ts"]) {
      expect(fs.readFileSync(path.join(ROOT, "server/tutor", f), "utf8")).not.toMatch(/personalityEngine|voiceReactionFilter/);
    }
  });

  it("planPersonaTurn lê o banco (painel, regras, escolha do aluno); banco fora do ar = nenhuma reação e Explosiva desligada", async () => {
    const calls: string[] = [];
    const db = {
      service: async (fn: string) => {
        calls.push(fn);
        if (fn === "ch_worker_tutor_settings") return { max_profanity: "moderate" };
        if (fn === "ch_worker_tutor_voice_reactions") return { explosiva_enabled: true, rules: [rule("durona", "n4", "laughs")] };
        if (fn === "ch_worker_tutor_explosiva") return { level: "n4", shouts: true, profanity: true, is_default: false, adult_declared: true };
        return null;
      },
    } as never;
    const d = await planPersonaTurn({ db }, { userId: "u1", personality: "durona", provider: "elevenlabs", memory: null, studentText: "kkkk" });
    expect(d.profileKey).toBe("durona:n4");
    expect(d.policy.reactions.map((r) => r.id)).toEqual(["laughs"]);
    expect(calls).toEqual(expect.arrayContaining(["ch_worker_tutor_settings", "ch_worker_tutor_voice_reactions", "ch_worker_tutor_explosiva"]));
    forgetReactionConfig({ db });
    forgetTutorSettings({ db });

    const broken = { service: async () => { throw new Error("banco fora"); } } as never;
    const b = await planPersonaTurn({ db: broken }, { userId: "u1", personality: "durona", provider: "elevenlabs", memory: null, studentText: "kkkk" });
    expect(b.profileKey).toBe("durona");
    expect(b.policy.reactions).toEqual([]);
    forgetReactionConfig({ db: broken });
    forgetTutorSettings({ db: broken });

    // aluno sem escolha gravada: o banco devolve o padrão (N3) e a maioridade do Termo
    const padrao = {
      service: async (fn: string) =>
        fn === "ch_worker_tutor_voice_reactions" ? { explosiva_enabled: true, rules: [] }
          : fn === "ch_worker_tutor_explosiva" ? { level: "n3", shouts: true, profanity: true, is_default: true, adult_declared: true }
            : { max_profanity: "moderate" },
    } as never;
    expect((await planPersonaTurn({ db: padrao }, { userId: "u2", personality: "durona", provider: "elevenlabs", memory: null })).profileKey).toBe("durona:n3");
  });

  it("estado inicial e memória limpa", () => {
    expect(freshMemory()).toMatchObject({ state: "neutral", turn: 0, crisis: false });
    const t = transition(freshMemory(), [], PROFILES["durona:n1"]);
    expect(t.memory.state).toBe("neutral");
    expect(t.cause).toBe("rest");
  });
});
