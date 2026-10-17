// @vitest-environment node
/**
 * Tutor natural, parte 2 (voz ao vivo, decisão do dono de 17/10/2026):
 *  - humor que muda a cada fala na voz ao vivo (humorVoz.ts e ponte): a transcrição do aluno muda o estado e só o bloco do estado é
 *    trocado nas instruções (contextUpdate), sem pedir resposta; com o professor falando, a troca espera ele terminar; a correção de
 *    submit_answer anda com a memória da ligação (erro repetido) e o tom que volta ao Google é o da ligação; crise trava a calma;
 *  - bilhete sem humor (app antigo): tudo como antes, nenhuma troca;
 *  - instruções da voz: ficha do personagem no lugar das falas fixas do perfil, falas de tom sorteadas, aberturas já ouvidas e jeito
 *    de começar na abertura da ligação.
 */
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { NoncesUsados, selarBilhete, abrirBilhete, type ConteudoBilhete } from "../../server/vozPonte/bilhete";
import { atenderPonte } from "../../server/vozPonte/ponte";
import { acertoDaFerramenta, HumorDaLigacao, humorParaBilhete, humorValido, instrucoesComEstado, linhaComecos, type HumorBilhete } from "../../server/tutor/humorVoz";
import { DEFAULT_EXPLOSIVA, PROFILES, personaFixedLayer, personaPromptLayer, personaStateLayer, personaTurn, resolveProfile } from "../../server/tutor/personalityEngine";
import { sessionContext, voiceTranscript } from "../../server/tutor/realtime";
import { fichaDe, fichaTexto } from "../../server/tutor/fichas";

const SEG = "h".repeat(48);
const PLATFORM = { maxProfanity: "moderate" as const, explosivaEnabled: true };

function humorDe(personality: string, adult = true): HumorBilhete {
  const resolved = resolveProfile({ personality, explosiva: personality.startsWith("dur") ? { ...DEFAULT_EXPLOSIVA, adultDeclared: adult } : null, platform: PLATFORM });
  const directive = personaTurn({ resolved, memory: null, rules: [], provider: "gemini_live" });
  return humorParaBilhete({ directive, resolved, rules: [], estado: personaStateLayer(directive) });
}

class FalsoWs extends EventEmitter {
  readyState = 1;
  enviados: any[] = [];
  fechado = false;
  send(d: string) { this.enviados.push(JSON.parse(d)); }
  close() { if (this.fechado) return; this.fechado = true; this.readyState = 3; this.emit("close", 1000, Buffer.from("")); }
  receber(o: unknown) { this.emit("message", Buffer.from(JSON.stringify(o)), false); }
}
const esperar = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function montar(c: ConteudoBilhete) {
  const cliente = new FalsoWs();
  const googles: FalsoWs[] = [];
  const logs: any[] = [];
  atenderPonte(cliente as never, {
    segredo: SEG, usados: new NoncesUsados(), projeto: "proj", regiao: "us-central1", tokenGoogle: async () => "tok", log: (o) => logs.push(o),
    abrirGoogle: () => { const g = new FalsoWs(); googles.push(g); queueMicrotask(() => g.emit("open")); return g as never; },
  });
  cliente.receber({ t: "abrir", bilhete: selarBilhete(c, SEG).bilhete });
  return { cliente, googles, logs };
}
const trocas = (g: FalsoWs) => g.enviados.filter((m) => m.contextUpdate).map((m) => m.contextUpdate.systemInstruction.parts[0].text as string);

function bilheteCom(h: HumorBilhete | undefined): ConteudoBilhete {
  return {
    vc: "11111111-1111-4111-8111-111111111111", u: "22222222-2222-4222-8222-222222222222", modelo: "gemini-3.8-live", voz: "Kore",
    instrucoes: h ? `NÚCLEO\n\n${h.estado}\n\nFIM` : "NÚCLEO\n\nFIM", ferramentas: [], maxSegundos: 600, ...(h ? { humor: h } : {}),
  };
}

describe("humor da ligação (humorVoz.ts)", () => {
  it("brincadeira muda o estado na hora; a fala inteira do aluno é um turno só (recalculado do começo)", () => {
    const h = new HumorDaLigacao(humorDe("durona"));
    const antes = h.bloco;
    expect(h.ouvirAluno("kkkkk professora")).toMatch(/brincalhona/);
    expect(h.estadoAtual).not.toBe("playful"); // ainda não fechou
    h.ouvirAluno("kkkkk professora, essa foi boa, hahaha");
    h.fecharFalaDoAluno();
    expect(h.estadoAtual).toBe("playful");
    expect(h.bloco).not.toBe(antes);
    expect(h.trocas).toBeGreaterThan(0);
  });

  it("erros seguidos pela correção levam a cobrança para cima, com a memória da ligação", () => {
    const h = new HumorDaLigacao(humorDe("durao"));
    h.fatos(["wrong"]);
    const um = h.estadoAtual;
    h.fatos(["wrong"]);
    h.fatos(["wrong"]);
    expect(["irritated", "frustrated"]).toContain(h.estadoAtual);
    expect(h.estadoAtual).not.toBe(um);
  });

  it("crise: calma e CVV até o fim da ligação, sem palavrão, mesmo errando depois", () => {
    const h = new HumorDaLigacao(humorDe("durona"));
    h.ouvirAluno("sinceramente às vezes quero morrer");
    h.fecharFalaDoAluno();
    expect(h.bloco).toMatch(/CVV/);
    const tom = h.fatos(["wrong"]);
    expect(tom).toMatch(/Sem palavrão/);
    expect(tom).toMatch(/CVV/);
  });

  it("a Tranquila nunca recebe palavrão liberado, nem brincando nem errando", () => {
    const h = new HumorDaLigacao(humorDe("tranquila"));
    for (const t of ["kkkk", "porra, errei de novo", "tô muito ansiosa"]) { h.ouvirAluno(t); h.fecharFalaDoAluno(); expect(h.bloco).not.toMatch(/Palavrão liberado/); }
    expect(h.fatos(["wrong"])).not.toMatch(/Palavrão liberado/);
  });

  it("começos já usados na ligação entram no bloco; nada muda se as falas não mudaram", () => {
    const h = new HumorDaLigacao(humorDe("acolhedor"));
    expect(h.falasDoProfessor(["Olha só, sepse de novo.", "Boa pergunta: o que pesa mais?"])).toMatch(/«Boa pergunta», «Olha só»/);
    expect(h.falasDoProfessor(["Olha só, sepse de novo.", "Boa pergunta: o que pesa mais?"])).toBeNull();
    expect(linhaComecos([])).toBe("");
  });

  it("bilhete com perfil desconhecido não liga o humor; a troca nas instruções acha o bloco inicial", () => {
    expect(humorValido({ ...humorDe("durona"), perfil: "nao_existe" })).toBe(false);
    expect(humorValido(undefined)).toBe(false);
    expect(instrucoesComEstado("A\n\nESTADO1\n\nB", "ESTADO1", "ESTADO2")).toBe("A\n\nESTADO2\n\nB");
    expect(instrucoesComEstado("A", "NAO_TEM", "ESTADO2")).toBe("A\n\nESTADO2");
    expect(acertoDaFerramenta({ output: { result: { is_correct: false } } })).toBe(false);
    expect(acertoDaFerramenta({ output: { error: "x" } })).toBeNull();
  });
});

describe("ponte: humor a cada fala na voz ao vivo", () => {
  it("o humor vai cifrado no bilhete e volta inteiro", () => {
    const c = bilheteCom(humorDe("durona"));
    const a = abrirBilhete(selarBilhete(c, SEG).bilhete, SEG, new NoncesUsados());
    expect(a.ok && a.conteudo.humor).toEqual(c.humor);
  });

  it("aluno brinca: a troca (só o bloco do estado, sem pedir resposta) vai quando o professor termina; o resto das instruções fica igual", async () => {
    const h = humorDe("durona");
    const { googles } = montar(bilheteCom(h));
    await esperar();
    const g = googles[0];
    expect(g.enviados[0].setup.systemInstruction.parts[0].text).toBe(`NÚCLEO\n\n${h.estado}\n\nFIM`);
    g.receber({ setupComplete: {} });
    // como o Google faz: a transcrição do aluno chega junto com o começo da resposta
    g.receber({ serverContent: { inputTranscription: { text: "tô brincando professora, é zoeira" } } });
    g.receber({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] }, outputTranscription: { text: "Olha só quem apareceu." } } });
    g.receber({ serverContent: { inputTranscription: { text: " kkkk" } } }); // finzinho atrasado da mesma fala
    expect(trocas(g)).toHaveLength(0); // geração em andamento: não mexe
    g.receber({ serverContent: { turnComplete: true } });
    const t = trocas(g);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatch(/^NÚCLEO\n\nESTADO AGORA \(interno, nunca diga\): brincalhona/);
    expect(t[0]).toMatch(/já começou falas com: «Olha só»/);
    expect(t[0].endsWith("\n\nFIM")).toBe(true);
    expect(g.enviados.filter((m) => m.clientContent || m.realtimeInput)).toHaveLength(0);
    // nada mudou na fala seguinte do professor (mesmos começos, mesmo humor): nenhuma troca nova
    g.receber({ serverContent: { turnComplete: true } });
    expect(trocas(g)).toHaveLength(1);
  });

  it("aluno interrompe o professor: a troca pendente vai na hora (a geração parou)", async () => {
    const { googles } = montar(bilheteCom(humorDe("durona")));
    await esperar();
    const g = googles[0];
    g.receber({ setupComplete: {} });
    g.receber({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] } } });
    g.receber({ serverContent: { inputTranscription: { text: "tô muito ansiosa, não consigo entender nada" } } });
    expect(trocas(g)).toHaveLength(0);
    g.receber({ serverContent: { interrupted: true } });
    expect(trocas(g)).toHaveLength(1);
    expect(trocas(g)[0]).toMatch(/acolhedora|calma/);
  });

  it("correção: o tom que vai ao Google é o da ligação (memória de erros) e a troca vem quando o professor termina", async () => {
    const { cliente, googles, logs } = montar(bilheteCom(humorDe("durao")));
    await esperar();
    const g = googles[0];
    g.receber({ setupComplete: {} });
    const responder = (id: string) => {
      g.receber({ toolCall: { functionCalls: [{ id, name: "submit_answer", args: { option: "A" } }] } });
      cliente.receber({ t: "ferramentas", respostas: [{ id, name: "submit_answer", response: { output: { result: { is_correct: false }, tom_do_professor: "TOM DO SERVIDOR" } } }] });
    };
    responder("a1");
    const r1 = g.enviados.find((m) => m.toolResponse).toolResponse.functionResponses[0].response.output.tom_do_professor;
    expect(r1).toMatch(/^ESTADO AGORA/);
    expect(trocas(g)).toHaveLength(0); // geração em andamento: não mexe
    g.receber({ serverContent: { turnComplete: true } });
    expect(trocas(g)).toHaveLength(1);
    responder("a2");
    responder("a3");
    const r3 = g.enviados.filter((m) => m.toolResponse).at(-1).toolResponse.functionResponses[0].response.output.tom_do_professor;
    expect(r3).toMatch(/irritad|frustrad/);
    cliente.receber({ t: "fim" });
    expect(logs.find((l) => l.ponte === "fim")).toMatchObject({ humor_final: expect.any(String), humor_trocas: expect.any(Number) });
  });

  it("bilhete sem humor (app de antes): nenhuma troca, o tom do servidor passa como veio", async () => {
    const { cliente, googles } = montar(bilheteCom(undefined));
    await esperar();
    const g = googles[0];
    g.receber({ setupComplete: {} });
    g.receber({ serverContent: { inputTranscription: { text: "kkkkk" } } });
    g.receber({ toolCall: { functionCalls: [{ id: "b1", name: "submit_answer", args: {} }] } });
    cliente.receber({ t: "ferramentas", respostas: [{ id: "b1", name: "submit_answer", response: { output: { result: { is_correct: true }, tom_do_professor: "TOM DO SERVIDOR" } } }] });
    g.receber({ serverContent: { turnComplete: true } });
    expect(trocas(g)).toHaveLength(0);
    expect(g.enviados.find((m) => m.toolResponse).toolResponse.functionResponses[0].response.output.tom_do_professor).toBe("TOM DO SERVIDOR");
  });
});

describe("instruções da voz ao vivo: ficha, sem falas fixas, aberturas variadas", () => {
  const d = (personality: string) => personaTurn({ resolved: resolveProfile({ personality, explosiva: { ...DEFAULT_EXPLOSIVA, adultDeclared: true }, platform: PLATFORM }), memory: null, rules: [], provider: "gemini_live" });

  it("com ficha: entra a ficha do personagem e só as falas de tom dadas (sorteadas), nunca as fixas do perfil", () => {
    for (const id of ["durao", "durona", "acolhedor", "tranquila"]) {
      const dir = d(id);
      const fixa = personaFixedLayer(dir, { personalityId: id, examples: ["fala sorteada"] });
      expect(fixa).toContain(fichaTexto(fichaDe(id)!));
      expect(fixa).toContain("«fala sorteada»");
      for (const e of PROFILES[dir.profileKey].examples) expect(fixa).not.toContain(e);
      expect(fixa).not.toMatch(/ESTADO AGORA \(interno/);
      expect(personaFixedLayer(dir, { personalityId: id, examples: [] })).not.toMatch(/Como você soa/);
    }
  });

  it("sem ficha (perfil antigo): como antes, com o resumo e as falas do perfil", () => {
    const dir = d("direto");
    expect(personaPromptLayer(dir)).toContain(PROFILES[dir.profileKey].examples[0]);
    expect(personaPromptLayer(dir)).toMatch(/ESTADO AGORA/);
  });

  it("a abertura da ligação recebe as aberturas já ouvidas, o período do dia e o jeito de começar", () => {
    const ctx = {
      entitlement: {} as never, config: { max_profanity: "moderate" as const },
      session: { id: "s", mode: "livre" as const, title: "Sepse", topic: "Sepse", status: "active", question_state: "none", settings: {} as never, emotion: null, context: { type: null, label: null } },
      personality: { id: "durona" } as never, student: null, memory: null, question: null,
    };
    const txt = sessionContext(ctx as never, null, { live: false, continuity: false, openings: { recent: ["Sepse de novo? Vamos ver.", "Bom dia, guerreiro."], local_hour: 21, angle: "comece lançando um desafio" } });
    expect(txt).toMatch(/Aberturas que este aluno já ouviu de você.*«Sepse de novo\? Vamos ver\.» · «Bom dia, guerreiro\.»/);
    expect(txt).toMatch(/Agora é noite/);
    expect(txt).toMatch(/Jeito de começar desta vez: comece lançando um desafio\./);
    expect(txt).toMatch(/entradas batidas/);
    const sem = sessionContext(ctx as never, null, { live: false, continuity: false });
    expect(sem).not.toMatch(/já ouviu/);
    expect(sem).toMatch(/ABERTURA DESTA LIGAÇÃO/);
  });
});

describe("transcrição da voz: abertura guardada e humor da reserva da OpenAI", () => {
  const SID = "00000000-0000-4000-8000-00000000abcd";
  const ctxVoz = (history: { role: string; content: string }[]) => ({
    config: { max_profanity: "moderate" }, question: null, history,
    session: { id: SID, mode: "livre", question_state: "none", settings: { profanity: "moderate" }, emotion: null },
    personality: { id: "durona", name: "Stazia Durona", style_notes: "", examples: [], params: { humor: 50, sarcasm: 50, friendliness: 40, strictness: 70, profanity: 60, patience: 40, verbosity: 40, socratic_level: 60, motivation: 50, clinical_pressure: 60 } },
  });
  const fake = (provider: string, history: { role: string; content: string }[] = []) => {
    const chamadas: { fn: string; args: any }[] = [];
    const deps: any = {
      db: {
        service: async (fn: string, args: any) => {
          chamadas.push({ fn, args });
          if (fn === "ch_worker_tutor_voice_call") return { id: args.p_voice_call, session_id: SID, status: "active", model: "x", call_id: "c", provider };
          if (fn === "ch_worker_tutor_context") return ctxVoz(history);
          if (fn === "ch_worker_complementar_terms") return [];
          if (fn === "ch_worker_tutor_settings") return { emotion_engine: true };
          if (fn === "ch_worker_tutor_voice_opening_save") return chamadas.filter((c) => c.fn === fn).length === 1;
          if (fn === "ch_worker_tutor_append") return { id: 1 };
          return null;
        },
      },
    };
    return { deps, chamadas, de: (fn: string) => chamadas.filter((c) => c.fn === fn) };
  };

  it("a primeira fala do professor na ligação vai para a memória das aberturas, uma vez só", async () => {
    const f = fake("gemini");
    await voiceTranscript(f.deps, "u1", "vc-abertura-1", "tutor", "Noite de sepse. Me conta o que você já sabe.");
    await voiceTranscript(f.deps, "u1", "vc-abertura-1", "tutor", "E o lactato, quando entra?");
    expect(f.de("ch_worker_tutor_voice_opening_save")).toEqual([{ fn: "ch_worker_tutor_voice_opening_save", args: { p_user: "u1", p_voice_call: "vc-abertura-1", p_text: "Noite de sepse. Me conta o que você já sabe." } }]);
  });

  it("Realtime: a fala do aluno anda o estado (gravado na sessão) e o bloco volta para o aplicativo; Gemini: nada volta (a ponte cuida)", async () => {
    const rt = fake("realtime", [{ role: "tutor", content: "Olha só, sepse de novo." }]);
    const r = await voiceTranscript(rt.deps, "u2", "vc-rt-1", "student", "acho que é choque séptico");
    expect(r.humor).toMatch(/«Olha só»/);
    expect(rt.de("ch_worker_tutor_set_emotion")).toHaveLength(1);
    // o mesmo bloco não vai de novo
    const again = await voiceTranscript(rt.deps, "u2", "vc-rt-1", "student", "e agora?");
    if (again.humor) expect(again.humor).not.toBe(r.humor);
    const g = fake("gemini");
    expect((await voiceTranscript(g.deps, "u3", "vc-g-1", "student", "kkkk")).humor).toBeUndefined();
    expect(g.de("ch_worker_tutor_set_emotion")).toHaveLength(0);
  });
});
