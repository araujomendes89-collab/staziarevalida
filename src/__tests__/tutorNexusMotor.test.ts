// @vitest-environment node
/**
 * Motor do Tutor Nexus (spec §16 "Motor"): a Durona fica firme no 1º erro (irritação entre 25 e 40, sem sorteio), sobe no
 * 2º e no 3º, e mostra alívio quando o aluno acerta logo depois de errar; o Direto comemora com palavrão; o Tranquilo nunca
 * xinga. O palavrão é sobre a situação, nunca contra o aluno, e respeita o teto do painel. O prompt proíbe marcações entre
 * colchetes. A resposta guarda o estado com que foi escrita (a voz fala com esse estado), e o turno da Nexus pode gastar
 * uma interação de texto mesmo vindo pela voz.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { avatarOf, engineFor, languageIntensity, normalize, profanityForIntensity, stateLayer, step, type DuronaLevel, type Happening, type TutorState } from "../../server/tutor/emotion";
import { languageViolations } from "../../server/tutor/safety";
import { composeSystem, NO_EVALUATION, TUTOR_VERSION, type TutorOutput } from "../../server/tutor/prompts";
import { tutorTurn } from "../../server/tutor/engine";
import { runTutorTool } from "../../server/tutor/tools";
import { aceitarTermos } from "./helpers/aceites";

const wrong = (over: Partial<Happening> = {}): Happening => ({ kind: "answer", correct: false, severity: 3, ...over });
const right = (over: Partial<Happening> = {}): Happening => ({ kind: "answer", correct: true, ...over });
const run = (persona: string, hs: Happening[], noise = 0.5, level?: DuronaLevel, start: Record<string, unknown> = { session_mood: "neutral", frustration: 5 }) => {
  const engine = engineFor(persona, null, level);
  let st: TutorState = normalize(start, engine);
  const trail: number[] = [];
  const events: string[][] = [];
  for (const h of hs) {
    const r = step(st, engine, h, () => noise);
    st = r.state;
    trail.push(st.frustration);
    events.push(r.events);
  }
  return { st, trail, events, engine };
};

describe("Motor do Nexus: escalada e alívio", () => {
  it("Durona: 1º erro firme entre 0,25 e 0,40, sem sorteio (rand 0 e 0,999 dão o mesmo), nos três níveis", () => {
    for (const level of ["moderada", "forte", "sem_filtro"] as const) {
      const lo = run("durona", [wrong()], 0, level);
      const hi = run("durona", [wrong()], 0.999, level);
      expect(lo.trail[0], level).toBe(25);
      expect(hi.trail[0], level).toBe(25);
      expect(lo.st.mood, level).toBe("firm");
      // erro pesado logo de cara continua dentro da faixa do 1º erro
      const heavy = run("durona", [wrong({ severity: 5, unsafe: true, repeated: true })], 0.999, level);
      expect(heavy.trail[0], level).toBe(40);
      expect(heavy.st.mood, level).toBe("firm");
      // vindo de uma frustração já alta (humor do dia), o 1º erro desce para o teto da faixa
      expect(run("durona", [wrong()], 0.5, level, { frustration: 70 }).trail[0], level).toBe(40);
    }
    // o que subiu pelos fatos continua sendo o delta (a voz e o registro usam)
    const e = engineFor("durona");
    expect(step(normalize({ frustration: 5 }, e), e, wrong(), () => 0.999).frustrationDelta).toBe(11);
    expect(avatarOf("durona", run("durona", [wrong()]).st)).toMatchObject({ emotion: "firm", animation: "skeptical", facialExpression: "skeptical", voiceStyle: "firm" });
  });

  it("Durona: 2º erro seguido no mesmo ponto (repetido) impaciente (41–60) e 3º irritada ou mais (≥ 61), com DETERMINISTIC_TUTOR", () => {
    process.env.DETERMINISTIC_TUTOR = "true";
    try {
      const at = (level: DuronaLevel) => {
        const e = engineFor("durona", null, level);
        let st = normalize({ session_mood: "neutral" }, e);
        const out: { f: number; mood: string }[] = [];
        for (const h of [wrong(), wrong({ repeated: true }), wrong({ repeated: true })]) {
          st = step(st, e, h).state;
          out.push({ f: st.frustration, mood: st.mood });
        }
        return out;
      };
      // os números de 2º e 3º erro são os de hoje (ajustáveis na audição)
      expect(at("forte")).toEqual([{ f: 25, mood: "firm" }, { f: 51, mood: "impatient" }, { f: 77, mood: "irritated" }]);
      expect(at("sem_filtro")).toEqual([{ f: 25, mood: "firm" }, { f: 54, mood: "impatient" }, { f: 83, mood: "angry" }]);
      const mod = at("moderada");
      expect(mod[1].f).toBeGreaterThanOrEqual(41);
      expect(mod[1].f).toBeLessThanOrEqual(60);
      expect(mod[2].f).toBeGreaterThanOrEqual(61);
    } finally {
      delete process.env.DETERMINISTIC_TUTOR;
    }
  });

  it("Durona: acerto logo depois de 1 erro vira alívio (≤ 40), mesmo vindo de irritação alta; sem 'recovering'; acerto sem erro antes como hoje", () => {
    const one = run("durona", [wrong(), right()]);
    expect(one.events[1]).toContain("relieved");
    expect(one.events[1]).not.toContain("recovering");
    expect(one.st.mood).toBe("relieved");
    expect(one.trail[1]).toBeLessThanOrEqual(40);
    // irritação alta (quatro erros repetidos) e um acerto: alívio, e a irritação cai para 40
    const high = run("durona", [wrong(), wrong({ repeated: true }), wrong({ repeated: true }), wrong({ repeated: true }), right()]);
    expect(high.trail[3]).toBeGreaterThan(80);
    expect(high.events[4]).toEqual(expect.arrayContaining(["relieved"]));
    expect(high.trail[4]).toBe(40);
    expect(high.st.mood).toBe("relieved");
    expect(languageIntensity(high.st, high.engine)).toBe(3);
    expect(avatarOf("durona", high.st)).toMatchObject({ emotion: "relieved", animation: "happy", facialExpression: "smile", voiceStyle: "warm" });
    // acerto sem erro antes: como hoje (sem alívio)
    const clean = run("durona", [right()]);
    expect(clean.events[0]).not.toContain("relieved");
    expect(clean.st.mood).toBe("pleased");
    // o pedido de alívio vale só para a fala do acerto; a conversa seguinte não repete
    const txt = stateLayer("durona", high.st, high.engine, "moderate");
    expect(txt).toContain('acertou logo depois de errar: mostre alívio agora, com um palavrão sobre a situação, nunca contra o aluno (ex.: "Ufa, porra, até que enfim!")');
    expect(txt).toContain("obrigatório só no alívio ou na comemoração pedidos acima");
    const later = step(high.st, high.engine, { kind: "message" }, () => 0.5).state;
    const next = stateLayer("durona", later, high.engine, "moderate");
    expect(next).not.toContain("mostre alívio agora");
    expect(next).toContain("nunca obrigatório");
    // relido do banco (nova fala), o estado não traz o pedido de alívio de volta
    expect(stateLayer("durona", normalize(JSON.parse(JSON.stringify(high.st)), high.engine), high.engine, "moderate")).not.toContain("mostre alívio agora");
  });

  it("Direto: solto desde a 1ª fala (intensidade 2); acerto depois de erro comemora com palavrão dentro do teto", () => {
    const e = engineFor("direto");
    expect(languageIntensity(normalize({}, e), e)).toBe(2);
    const r = run("direto", [wrong(), right()]);
    expect(r.events[1]).toContain("celebrate");
    expect(r.events[1]).not.toContain("recovering");
    expect(r.st.mood).toBe("pleased");
    expect(r.trail[1]).toBeLessThanOrEqual(40);
    const li = languageIntensity(r.st, r.engine);
    expect(profanityForIntensity(li)).toBe("moderate");
    const txt = stateLayer("direto", r.st, r.engine, "moderate");
    expect(txt).toContain('acertou logo depois de errar: comemore com um palavrão sobre a situação, nunca contra o aluno (ex.: "Isso, porra. Essa era difícil.")');
    expect(txt).toContain("Comemoração (acerto difícil, sequência de acertos ou acerto depois de errar): palavrão de alegria sobre a situação");
    // raciocínio excelente depois do erro: impressionado (o piso é "satisfeito")
    expect(run("direto", [wrong(), right({ excellent: true })]).st.mood).toBe("impressed");
  });

  it("teto abaixo de moderado: Durona aliviada e Direto comemorando pedem palavras leves", () => {
    const d = run("durona", [wrong(), right()]);
    const dt = stateLayer("durona", d.st, d.engine, "mild");
    expect(dt).toContain('acertou logo depois de errar: mostre alívio agora, com palavras leves, sem palavrão (ex.: "Ufa, até que enfim!")');
    expect(dt).not.toMatch(/porra|caralho|merda/i); // os exemplos de escalada também ficam leves (mesma emoção)
    expect(dt).toContain("PÔ, de novo?!");
    expect(dt).toContain("nunca obrigatório");
    const r = run("direto", [wrong(), right()]);
    const rt = stateLayer("direto", r.st, r.engine, "off");
    expect(rt).toContain('acertou logo depois de errar: comemore com palavras leves, sem palavrão (ex.: "Isso! Essa era difícil.")');
    expect(rt).not.toMatch(/porra|caralho|merda/i);
    // no teto moderado, os exemplos continuam como são
    expect(stateLayer("durona", d.st, d.engine, "moderate")).toContain("PORRA, de novo?!");
  });

  it("Tranquilo nunca xinga: intensidade ≤ 1; acerto depois de 2 erros continua 'recovering'", () => {
    const r = run("acolhedor", [wrong(), wrong({ repeated: true }), right()]);
    expect(r.events[2]).toContain("recovering");
    expect(r.events[2]).not.toContain("relieved");
    expect(r.events[2]).not.toContain("celebrate");
    expect(r.st.mood).not.toBe("relieved");
    expect(run("acolhedor", [wrong()]).st.mood).not.toBe("firm");
    for (const st of [r.st, run("acolhedor", Array.from({ length: 6 }, () => wrong({ repeated: true }))).st, run("acolhedor", [right({ excellent: true })]).st]) {
      expect(languageIntensity(st, r.engine)).toBeLessThanOrEqual(1);
    }
  });

  it("conferência: palavrão de alívio sobre a situação passa; ofensa ao aluno é barrada mesmo no alívio", () => {
    expect(languageViolations("Ufa, porra, até que enfim!", "moderate")).toEqual([]);
    expect(languageViolations("Isso, porra. Essa era difícil.", "moderate")).toEqual([]);
    expect(languageViolations("Ufa, porra, até que enfim, seu burro!", "moderate").map((v) => v.code)).toContain("personal_attack");
    expect(languageViolations("Ufa, porra, até que enfim!", "mild").map((v) => v.code)).toContain("profanity");
  });

  it("prompt proíbe marcações entre colchetes e não traz nenhuma", () => {
    for (const browserVoice of [false, true]) {
      const sys = composeSystem({ mode: "livre", browserVoice, persona: "x" });
      expect(sys).toContain("- Nunca escreva marcações entre colchetes nem indicações de som ou de tom (risada, suspiro, grito): a atuação da voz é decidida pelo sistema.");
      expect(sys).not.toMatch(/\[(angry|laughs|sighs|frustrated|encouraging|risos)\]/i);
    }
    expect(TUTOR_VERSION).toBe("2.8.0");
  });
});

describe("Motor do Nexus: o turno", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-nexus-motor-"));
  let dev: DevDatabase;
  let db: ContentDb;
  const ADMIN = "00000000-0000-4000-8000-0000000000a1";
  const ALUNA = "00000000-0000-4000-8000-0000000000e1";
  const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
  const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
    (await dev.db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
      return (await tx.query<any>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))).rows;
    }))[0].r;
  const reply = (text: string, over: Partial<TutorOutput> = {}): TutorOutput => ({ reply: text, grounding: "GENERAL", citations: [], evaluation: NO_EVALUATION, justification: "NONE", reveals_answer: false, suggested_replies: [], ...over });
  const lastMeta = async (sid: string) => (await sql(`select meta from public.tutor_messages where session_id = $1 and role = 'tutor' order by id desc limit 1`, [sid]))[0].meta;
  const requests = async () => (await sql(`select coalesce(sum(requests), 0)::int n from public.ai_usage where user_id = $1`, [ALUNA]))[0].n as number;

  beforeAll(async () => {
    dev = await openDevDatabaseForTests(path.join(tmp, "db"));
    db = devContentDb(async () => dev);
    for (const st of buildEngineStatements()) await dev.db.exec(st);
    await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'aluna@t.dev')`, [ADMIN, ALUNA]);
    await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
    await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`, [ALUNA]);
    await aceitarTermos(dev.db, ALUNA);
    await rpc(ADMIN, "app_admin_tutor_save_config", { enabled: true, requires_pro: true }, "Ligar o Tutor para os testes do motor do Nexus.");
    process.env.TUTOR_AI_PROVIDER = "mock";
    process.env.DETERMINISTIC_TUTOR = "true";
  }, 300_000);
  afterAll(async () => {
    delete process.env.DETERMINISTIC_TUTOR;
    await dev?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("meta.personality guarda humor, frustração e entusiasmo com que a resposta foi escrita; voice_avatar usa esse estado", async () => {
    const s = (await rpc(ALUNA, "app_tutor_start", "livre", null, null, null, "durona")).id;
    await sql(`update public.tutor_sessions set emotion = '{"session_mood": "neutral", "frustration": 62, "enthusiasm": 33}'::jsonb where id = $1`, [s]);
    // a avaliação acalma (tentativa séria e o aluno se corrigiu): o estado depois do turno é outro
    const r = await tutorTurn({ db, mockRespond: () => reply("Tá. Agora pensa de novo no comando.", { evaluation: { ...NO_EVALUATION, reasoning_quality: "high", self_corrected: true } }) }, ALUNA, s, { type: "message", text: "errei, era a conduta da gestante" });
    const meta = await lastMeta(s);
    expect(meta.personality).toMatchObject({ id: "durona", mood: "irritated", frustration: 62, enthusiasm: 33 });
    expect((await sql(`select emotion from public.tutor_sessions where id = $1`, [s]))[0].emotion.mood).toBe("impatient");
    expect(r.message.voice_avatar).toEqual(avatarOf("durona", normalize({ frustration: 62, enthusiasm: 33, mood: "irritated" }, engineFor("durona"))));
    expect(r.message.voice_avatar.emotion).toBe("irritated");
    expect(r.message.avatar.emotion).toBe("impatient"); // o avatar continua como hoje (depois da avaliação)
  });

  it("turno com chargeText gasta 1 interação mesmo com voiceCallId; a delegação do GPT-Live continua sem gastar", async () => {
    const s = (await rpc(ALUNA, "app_tutor_start", "livre", null, null, null, "durao")).id;
    const call = "00000000-0000-4000-8000-00000000c0de";
    const deps = { db, mockRespond: () => reply("Isso. Segue.") };
    const n0 = await requests();
    await tutorTurn(deps, ALUNA, s, { type: "message", text: "pela voz da Nexus", voice: true, voiceCallId: call, chargeText: true });
    expect(await requests()).toBe(n0 + 1);
    let ledger = await sql(`select feature, interactions from public.ai_usage_ledger where session_id = $1 order by id`, [s]);
    expect(ledger.map((l) => l.feature)).toEqual(["tutor_text", "tutor_text"]);
    expect(ledger[0].interactions).toBe(1);
    await tutorTurn(deps, ALUNA, s, { type: "message", text: "pela voz ao vivo", voice: true, voiceCallId: call });
    expect(await requests()).toBe(n0 + 1);
    ledger = await sql(`select feature from public.ai_usage_ledger where session_id = $1 order by id`, [s]);
    expect(ledger.at(-1)!.feature).toBe("tutor_voice_backend");
    // sem cota de texto: a Nexus recusa (gasta texto); a voz ao vivo segue
    await rpc(ADMIN, "app_admin_tutor_save_config", { daily_message_limit: 1 }, "Limite baixo para o teste do motor do Nexus.");
    await expect(tutorTurn(deps, ALUNA, s, { type: "message", text: "mais uma", voiceCallId: call, chargeText: true })).rejects.toMatchObject({ status: 429 });
    await expect(tutorTurn(deps, ALUNA, s, { type: "message", text: "mais uma ao vivo", voiceCallId: call })).resolves.toBeTruthy();
    await rpc(ADMIN, "app_admin_tutor_save_config", { daily_message_limit: 40 }, "Volta o limite do teste do motor do Nexus.");
  });

  it("voz ao vivo (reserva): o tom depois da resposta segue o teto de palavrão da conversa", async () => {
    for (const [cap, expected] of [["mild", "mostre alívio agora, com palavras leves, sem palavrão"], ["moderate", "Ufa, porra, até que enfim!"]] as const) {
      const s = (await rpc(ALUNA, "app_tutor_start", "questao", null, null, null, "durona")).id;
      await sql(`update public.tutor_sessions set settings = settings || jsonb_build_object('profanity', $2::text), emotion = '{"session_mood": "neutral", "frustration": 30, "consecutiveErrors": 1}'::jsonb where id = $1`, [s, cap]);
      const option = (await sql(`select q.correct_option o from public.tutor_sessions s join public.questions q on q.id = s.question_id where s.id = $1`, [s]))[0].o;
      const r = await runTutorTool({ deps: { db }, userId: ALUNA, sessionId: s, personaId: "durona" }, "submit_answer", { option });
      expect((r.result as any).is_correct, cap).toBe(true);
      expect(r.tone as string, cap).toContain(expected);
      if (cap === "mild") expect(r.tone as string).not.toMatch(/porra|caralho|merda/i);
    }
  });

  it("texto do jeito da Durona no banco pede alívio no acerto depois de erro", async () => {
    const notes = (await sql(`select style_notes from public.tutor_personalities where id = 'durona'`))[0].style_notes as string;
    expect(notes).toContain("Ufa, porra, até que enfim!");
    expect(notes).toContain("Quando o aluno acerta logo depois de errar");
    expect(notes).not.toContain("Quando o aluno melhora");
  });
});
