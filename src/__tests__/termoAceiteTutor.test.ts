// @vitest-environment node
/**
 * Aceite dos Tutores de IA (§34 do Termo) no banco (supabase/migrations/…5400_tutor_aceite.sql): sem o aceite da versão vigente o
 * aluno não começa, não abre, não responde e não pede a próxima; a lista de conversas vem vazia; o status pede o aceite; e o servidor
 * recebe `consent_pending` no contexto da conversa e na leitura de voz. Administrador, editor e revisor médico usam sem aceitar.
 * No servidor (/api/tutor): turno, voz (abrir e delegar) e voz natural recusam com 403 e o código tutor_consent, antes de gastar IA ou voz.
 * Spec: docs/superpowers/specs/2026-10-07-termo-aceite-cadastro-design.md (seção 8).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { NO_EVALUATION, type TutorOutput } from "../../server/tutor/prompts";
import { createTutorRouter } from "../../server/tutor/router";
import { MockSpeech } from "../../server/tutor/speech";
import type { RealtimeConfig } from "../../server/tutor/realtime";
import { setLiveSidebandFactory, type GeminiVoiceConfig, type LiveConfig } from "../../server/tutor/voiceProviders";
import { aceitarTermos } from "./helpers/aceites";
import { voiceFingerprint } from "../../server/tutor/officialVoices";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-aceite-"));
let dev: DevDatabase;
let db: ContentDb;
let seq = 0;
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const PENDENTE = "Aceite do Tutor pendente.";
const SEM_LOGIN = "Entre na sua conta.";
const SEM_ACEITE_CODE = "42501";

const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
/** Voz do professor nos testes: ambiente falso (sem rede) e as três vozes aprovadas nesta versão. */
const VOZ_ENV = {
  ELEVENLABS_API_KEY: "chave-falsa-de-teste-" + "x".repeat(40), TUTOR_VOICE_ALLOW_EXTERNAL: "1",
  ELEVENLABS_VOICE_TRANQUILO: "vozTranquiloTeste01", ELEVENLABS_VOICE_DURONA: "vozDuronaTeste0001", ELEVENLABS_VOICE_DIRETO: "vozDiretoTeste0001",
};
const aprovarVozes = (q: (s: string, p?: unknown[]) => Promise<unknown>) =>
  Promise.all((["tranquilo", "durona", "direto"] as const).map((v) => q(`insert into public.tutor_voice_approvals (voice, fingerprint) values ($1, $2) on conflict (voice) do update set fingerprint = excluded.fingerprint, revoked_at = null`, [v, voiceFingerprint(v, VOZ_ENV)])));
/** Roda como o navegador (papel authenticated) de um aluno logado, ou sem sessão (uid nulo, como um token sem usuário). */
const as = <T>(uid: string | null, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
  });
const rpc = async (uid: string | null, fn: string, ...args: unknown[]) =>
  (await as(uid, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))))[0].r;
/** Roda como o servidor (papel service_role): é quem chama as funções ch_worker_*. */
const asService = <T>(fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
  });
/** A chamada tem que ser recusada: devolve a mensagem e o código SQLSTATE do erro. */
async function recusa(p: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await p;
  } catch (e: any) {
    return { message: e.message, code: e.code };
  }
  throw new Error("Era para recusar, mas passou.");
}
const pendente = { message: PENDENTE, code: SEM_ACEITE_CODE };

const certa: Record<string, string> = {};
const status = (uid: string) => rpc(uid, "app_tutor_status");
const sessoes = (uid: string) => rpc(uid, "app_tutor_sessions", 20);
const contar = async (q: string, p: unknown[]) => Number((await sql<{ n: number }>(q, p))[0].n);
/** Conta nova no banco (o gatilho cria perfil, papel de aluno e período de teste). */
async function novoAluno(): Promise<string> {
  const uid = `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`;
  await sql(`insert into auth.users (id, email) values ($1, $2)`, [uid, `aluno${seq}@teste.dev`]);
  return uid;
}
/** Tira só o aceite dos Tutores (as conversas ficam): é o estado de quem aceitou antes e precisa aceitar de novo. */
const termoVigente = async () => (await sql(`select version from public.legal_versions where document = 'termo_uso'`))[0].version as string;
// a prova do aceite não se apaga (013740): só com a chave de expurgo ligada, como a rotina dos 5 anos
const perderAceiteTutor = async (uid: string) => {
  await sql(`select set_config('app.legal_expurgo', 'on', false)`);
  await sql(`delete from public.legal_acceptances where user_id = $1 and document = 'tutor_ia'`, [uid]);
  await sql(`select set_config('app.legal_expurgo', '', false)`);
};
/** Resposta da IA simulada no formato que o motor do Tutor espera. */
const reply = (text: string, over: Partial<TutorOutput> = {}): TutorOutput => ({ reply: text, grounding: "GENERAL", citations: [], evaluation: NO_EVALUATION, justification: "NONE", reveals_answer: false, suggested_replies: [], ...over });

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev')`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  for (const r of await sql(`select id, correct_option from public.questions`)) certa[r.id] = r.correct_option;
  process.env.TUTOR_AI_PROVIDER = "mock";
  await rpc(ADMIN, "app_admin_tutor_save_config", { enabled: true, requires_pro: true }, "Tutor ligado com teste grátis para os testes.");
}, 300_000);
afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Aceite dos Tutores — permissões e formato", () => {
  it("o apoio tutor_consent_pending só abre para o servidor e as funções do Tutor mantêm as permissões de antes", async () => {
    const privilegios = await sql<{ proname: string; anon: boolean; authenticated: boolean; service_role: boolean }>(
      `select p.proname,
              bool_or(has_function_privilege('anon', p.oid, 'execute')) as anon,
              bool_or(has_function_privilege('authenticated', p.oid, 'execute')) as authenticated,
              bool_and(has_function_privilege('service_role', p.oid, 'execute')) as service_role
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any($1)
       group by p.proname order by p.proname`,
      [
        [
          "tutor_consent_pending", "tutor_next_for", "tutor_answer_for", "ch_worker_tutor_context", "ch_worker_tutor_speech",
          "app_tutor_status", "app_tutor_start", "app_tutor_session", "app_tutor_sessions", "app_tutor_answer", "app_tutor_next_question",
        ],
      ]
    );
    const soServidor = { anon: false, authenticated: false, service_role: true };
    const aberta = { anon: false, authenticated: true, service_role: true };
    expect(Object.fromEntries(privilegios.map(({ proname, ...p }) => [proname, p]))).toEqual({
      tutor_consent_pending: soServidor,
      tutor_next_for: soServidor,
      tutor_answer_for: soServidor,
      ch_worker_tutor_context: soServidor,
      ch_worker_tutor_speech: soServidor,
      app_tutor_status: aberta,
      app_tutor_start: aberta,
      app_tutor_session: aberta,
      app_tutor_sessions: aberta,
      app_tutor_answer: aberta,
      app_tutor_next_question: aberta,
    });
    // o navegador (mesmo logado como administrador) não chama o apoio
    expect((await recusa(rpc(ADMIN, "tutor_consent_pending", ADMIN))).message).toMatch(/permission denied/i);
    // o servidor chama: só aluno sem o aceite dos Tutores vale como pendente
    const aluno = await novoAluno();
    expect((await asService((q) => q(`select public.tutor_consent_pending($1) r`, [aluno])))[0].r).toBe(true);
    expect((await asService((q) => q(`select public.tutor_consent_pending($1) r`, [ADMIN])))[0].r).toBe(false);
    expect((await asService((q) => q(`select public.tutor_consent_pending(null) r`)))[0].r).toBe(false);
  });

  it("o status ganha consent_required e consent_version e mantém as chaves de antes", async () => {
    const aluno = await novoAluno();
    const antes = await status(aluno);
    expect(Object.keys(antes)).toEqual(
      expect.arrayContaining([
        "enabled", "available", "requires_pro", "entitlement", "daily_limit", "used_today", "max_profanity", "voice_enabled", "preferences", "personalities", "reviews_due",
      ])
    );
    expect(antes).toMatchObject({
      enabled: true, available: true, requires_pro: true, voice_enabled: true, reviews_due: 0, daily_limit: 40, used_today: 0,
      preferences: { personality_id: "acolhedor", profanity: "off", chosen: false },
      consent_required: true, consent_version: "2.0",
    });
    expect(antes.entitlement).toMatchObject({ mode: "trial", can_use: true });
    expect(antes.personalities.length).toBeGreaterThan(0);
    await aceitarTermos(dev.db, aluno);
    const depois = await status(aluno);
    expect(depois).toMatchObject({ consent_required: false, consent_version: "2.0" });
    expect({ ...depois, consent_required: true }).toEqual(antes);
    // sem login o status continua pedindo o login
    expect((await recusa(rpc(null, "app_tutor_status"))).message).toBe(SEM_LOGIN);
  });
});

describe("Aceite dos Tutores — aluno sem o aceite", () => {
  it("aluno sem aceite: status pede o aceite, lista vazia, começar/abrir/responder/próxima recusam", async () => {
    // aluno que já tinha conversas (aceitou antes) e agora está sem o aceite vigente
    const aluno = await novoAluno();
    await aceitarTermos(dev.db, aluno);
    const aberta = await rpc(aluno, "app_tutor_start", "questao", null, null); // questão aberta: dá para responder
    const respondida = await rpc(aluno, "app_tutor_start", "questao", null, null);
    await rpc(aluno, "app_tutor_answer", respondida.id, certa[respondida.question.id], 4); // respondida: dá para pedir a próxima
    const livre = await rpc(aluno, "app_tutor_start", "livre", null, null);
    expect((await sessoes(aluno)).map((s: any) => s.id).sort()).toEqual([aberta.id, respondida.id, livre.id].sort());
    const questaoAntes = (await sql(`select question_id from public.tutor_sessions where id = $1`, [respondida.id]))[0].question_id;
    const respostasAntes = await contar(`select count(*) n from public.tutor_answers where user_id = $1`, [aluno]);
    const conversasAntes = await contar(`select count(*) n from public.tutor_sessions where user_id = $1`, [aluno]);
    expect(conversasAntes).toBe(3);

    await perderAceiteTutor(aluno);

    expect(await status(aluno)).toMatchObject({ consent_required: true, consent_version: "2.0" });
    expect(await sessoes(aluno)).toEqual([]); // as conversas existem, mas a lista vem vazia
    expect(await rpc(aluno, "app_tutor_sessions")).toEqual([]);
    expect(await recusa(rpc(aluno, "app_tutor_start", "livre", null, null))).toEqual(pendente);
    expect(await recusa(rpc(aluno, "app_tutor_start", "questao", null, null))).toEqual(pendente);
    expect(await recusa(rpc(aluno, "app_tutor_session", aberta.id))).toEqual(pendente);
    expect(await recusa(rpc(aluno, "app_tutor_answer", aberta.id, certa[aberta.question.id], 4))).toEqual(pendente);
    expect(await recusa(rpc(aluno, "app_tutor_next_question", respondida.id))).toEqual(pendente);
    // nada mudou por baixo: nenhuma conversa nova, nenhuma resposta nova, a questão da conversa é a mesma
    expect(await contar(`select count(*) n from public.tutor_sessions where user_id = $1`, [aluno])).toBe(conversasAntes);
    expect(await contar(`select count(*) n from public.tutor_answers where user_id = $1`, [aluno])).toBe(respostasAntes);
    expect((await sql(`select question_id from public.tutor_sessions where id = $1`, [respondida.id]))[0].question_id).toBe(questaoAntes);
    // as funções do servidor que o Tutor usa por dentro também recusam (voz e ferramentas chamam estas)
    expect(await recusa(asService((q) => q(`select public.tutor_next_for($1, $2)`, [aluno, respondida.id])))).toEqual(pendente);
    expect(await recusa(asService((q) => q(`select public.tutor_answer_for($1, $2, $3, $4)`, [aluno, aberta.id, certa[aberta.question.id], 4])))).toEqual(pendente);
    expect(await recusa(db.service("ch_worker_tutor_answer_as", { p_user: aluno, p_session_id: aberta.id, p_option: certa[aberta.question.id], p_confidence: 4 }))).toMatchObject(pendente);
    expect(await recusa(db.service("ch_worker_tutor_next_as", { p_user: aluno, p_session_id: respondida.id }))).toMatchObject(pendente);

    // com o aceite de volta as mesmas chamadas passam: a recusa era só o aceite
    await rpc(aluno, "app_accept_terms", "tutor_ia", "2.0", "tutor");
    expect((await sessoes(aluno)).length).toBe(3);
    expect((await rpc(aluno, "app_tutor_session", aberta.id)).id).toBe(aberta.id);
    expect(await rpc(aluno, "app_tutor_answer", aberta.id, certa[aberta.question.id], 4)).toMatchObject({ is_correct: true });
    expect((await rpc(aluno, "app_tutor_next_question", respondida.id)).question_state).toBe("open");
    expect((await rpc(aluno, "app_tutor_start", "livre", null, null)).status).toBe("active");

    // aluna que nunca aceitou nada: também sem conversa nova
    const nova = await novoAluno();
    expect(await status(nova)).toMatchObject({ consent_required: true, consent_version: "2.0" });
    expect(await sessoes(nova)).toEqual([]);
    expect(await recusa(rpc(nova, "app_tutor_start", "livre", null, null))).toEqual(pendente);
    expect(await recusa(rpc(nova, "app_tutor_start", "questao", null, null))).toEqual(pendente);
    expect(await contar(`select count(*) n from public.tutor_sessions where user_id = $1`, [nova])).toBe(0);
    expect(await contar(`select count(*) n from public.tutor_preferences where user_id = $1`, [nova])).toBe(0);
    // pendente mesmo para uma conversa que nem existe: o aceite vem antes de procurar
    expect(await recusa(rpc(nova, "app_tutor_session", "00000000-0000-4000-8000-00000000ffff"))).toEqual(pendente);
  });

  it("o aceite vem logo depois do login e antes das outras recusas (plano, modo, questão)", async () => {
    // sem login: continua pedindo o login
    expect((await recusa(rpc(null, "app_tutor_start", "livre", null, null))).message).toBe(SEM_LOGIN);
    expect((await recusa(rpc(null, "app_tutor_answer", "00000000-0000-4000-8000-00000000ffff", "A", 3))).message).toBe(SEM_LOGIN);
    expect((await recusa(rpc(null, "app_tutor_next_question", "00000000-0000-4000-8000-00000000ffff"))).message).toBe(SEM_LOGIN);

    const aluna = await novoAluno();
    // teste grátis terminado: sem o aceite aparece o cartão do aceite, não a mensagem de plano pago
    await sql(`update public.subscriptions set tutor_trial_started_at = now() - interval '8 days' where user_id = $1`, [aluna]);
    expect((await status(aluna)).entitlement).toMatchObject({ mode: "blocked", can_use: false });
    expect(await recusa(rpc(aluna, "app_tutor_start", "livre", null, null))).toEqual(pendente);
    expect(await recusa(rpc(aluna, "app_tutor_start", "modo-que-nao-existe", null, null))).toEqual(pendente);
    expect(await recusa(rpc(aluna, "app_tutor_start", "questao", null, "Q-QUE-NAO-EXISTE"))).toEqual(pendente);
    // com o aceite, as regras de antes voltam a valer (aqui, o teste grátis terminado)
    await rpc(aluna, "app_accept_terms", "tutor_ia", "2.0", "tutor");
    await expect(rpc(aluna, "app_tutor_start", "livre", null, null)).rejects.toThrow(/teste grátis do Tutor terminou/);
    await expect(rpc(aluna, "app_tutor_start", "modo-que-nao-existe", null, null)).rejects.toThrow(/teste grátis do Tutor terminou/);
  });

  it("depois do app_accept_terms('tutor_ia','2.0','tutor') o Tutor abre", async () => {
    const aluna = await novoAluno();
    expect(await recusa(rpc(aluna, "app_tutor_start", "livre", null, null))).toEqual(pendente);
    // aceitar só o Termo (tela de aceite) não libera o Tutor: são dois aceites
    // o aceite do Termo vigente (3.0 desde a 013740) vai com a declaração de maioridade
    await rpc(aluna, "app_accept_terms_declared", "termo_uso", await termoVigente(), true, true, "tela_aceite", "+5541999998888");
    expect(await status(aluna)).toMatchObject({ consent_required: true });
    expect(await recusa(rpc(aluna, "app_tutor_start", "livre", null, null))).toEqual(pendente);
    // aceitar uma versão velha também não
    expect((await recusa(rpc(aluna, "app_accept_terms", "tutor_ia", "0.9", "tutor"))).message).toBe("Versão desatualizada do termo.");
    expect(await status(aluna)).toMatchObject({ consent_required: true });

    const boot = await rpc(aluna, "app_accept_terms", "tutor_ia", "2.0", "tutor");
    expect(boot.legal.tutor_ia).toMatchObject({ current: "2.0", accepted: "2.0" });
    expect(await status(aluna)).toMatchObject({ consent_required: false, consent_version: "2.0" });
    const prova = (await sql(`select origin, version from public.legal_acceptances where user_id = $1 and document = 'tutor_ia'`, [aluna]))[0];
    expect(prova).toEqual({ origin: "tutor", version: "2.0" });

    // conversa solta
    const livre = await rpc(aluna, "app_tutor_start", "livre", null, null);
    expect(livre).toMatchObject({ mode: "livre", status: "active" });
    expect((await rpc(aluna, "app_tutor_session", livre.id)).id).toBe(livre.id);
    expect((await sessoes(aluna)).map((s: any) => s.id)).toEqual([livre.id]);
    // questões: responder e pedir a próxima
    const q = await rpc(aluna, "app_tutor_start", "questao", null, null);
    const r = await rpc(aluna, "app_tutor_answer", q.id, certa[q.question.id], 4);
    expect(r).toMatchObject({ is_correct: true, question_id: q.question.id });
    const prox = await rpc(aluna, "app_tutor_next_question", q.id);
    expect(prox.question.id).not.toBe(q.question.id);
    expect(prox.question_state).toBe("open");
    expect((await sessoes(aluna)).length).toBe(2);
    // a conversa de outro aluno continua não sendo dela (a regra de antes)
    const outro = await novoAluno();
    await rpc(outro, "app_accept_terms", "tutor_ia", "2.0", "tutor");
    expect((await recusa(rpc(outro, "app_tutor_session", livre.id))).message).toBe("Conversa não encontrada.");
  });

  it("o apoio aceitarTermos grava os dois aceites vigentes (origens cadastro e tutor), sem duplicar, e o Tutor abre", async () => {
    const aluno = await novoAluno();
    await aceitarTermos(dev.db, aluno);
    expect((await sql(`select document, origin from public.legal_acceptances where user_id = $1 order by document`, [aluno]))).toEqual([
      { document: "termo_uso", origin: "cadastro" },
      { document: "tutor_ia", origin: "tutor" },
    ]);
    expect((await sql(`select email_hash <> '' ok from public.legal_acceptances where user_id = $1`, [aluno])).every((l) => l.ok)).toBe(true);
    await aceitarTermos(dev.db, aluno); // repetir não duplica nem falha
    expect(await contar(`select count(*) n from public.legal_acceptances where user_id = $1`, [aluno])).toBe(2);
    expect(await status(aluno)).toMatchObject({ consent_required: false });
    expect((await rpc(aluno, "app_tutor_start", "livre", null, null)).status).toBe("active");
  });
});

describe("Aceite dos Tutores — equipe, revisor médico e mudança de papel", () => {
  it("equipe e revisor médico usam sem aceitar", async () => {
    const editor = await novoAluno();
    await sql(`update public.user_roles set role = 'editor' where user_id = $1`, [editor]);
    const revisor = await novoAluno();
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [revisor]);
    for (const uid of [ADMIN, editor, revisor]) {
      expect(await status(uid)).toMatchObject({ consent_required: false, consent_version: "2.0" });
      expect(await contar(`select count(*) n from public.legal_acceptances where user_id = $1`, [uid])).toBe(0); // sem aceite nenhum
      const livre = await rpc(uid, "app_tutor_start", "livre", null, null);
      expect((await rpc(uid, "app_tutor_session", livre.id)).id).toBe(livre.id);
      const q = await rpc(uid, "app_tutor_start", "questao", null, null);
      await rpc(uid, "app_tutor_answer", q.id, certa[q.question.id], 4);
      expect((await rpc(uid, "app_tutor_next_question", q.id)).question_state).toBe("open");
      expect((await sessoes(uid)).map((s: any) => s.id)).toEqual(expect.arrayContaining([livre.id, q.id]));
    }
  });

  it("o papel é lido a cada chamada: editor que volta a ser aluno e revisor que perde as áreas passam a precisar do aceite", async () => {
    const pessoa = await novoAluno();
    expect(await status(pessoa)).toMatchObject({ consent_required: true });
    // vira editor: libera, usa
    await sql(`update public.user_roles set role = 'editor' where user_id = $1`, [pessoa]);
    expect(await status(pessoa)).toMatchObject({ consent_required: false });
    const conversa = await rpc(pessoa, "app_tutor_start", "livre", null, null);
    expect((await sessoes(pessoa)).length).toBe(1);
    // volta a ser aluno: a conversa que já tinha fica atrás do aceite
    await sql(`update public.user_roles set role = 'student' where user_id = $1`, [pessoa]);
    expect(await status(pessoa)).toMatchObject({ consent_required: true });
    expect(await sessoes(pessoa)).toEqual([]);
    expect(await recusa(rpc(pessoa, "app_tutor_session", conversa.id))).toEqual(pendente);
    // vira revisor médico (aluno com área): libera
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CIRURGIA')`, [pessoa]);
    expect(await status(pessoa)).toMatchObject({ consent_required: false });
    expect((await rpc(pessoa, "app_tutor_session", conversa.id)).id).toBe(conversa.id);
    // perde a área: precisa aceitar
    await sql(`delete from public.ch_reviewer_areas where user_id = $1`, [pessoa]);
    expect(await status(pessoa)).toMatchObject({ consent_required: true });
    expect(await recusa(rpc(pessoa, "app_tutor_start", "livre", null, null))).toEqual(pendente);
    // aceitou: abre e a conversa antiga volta à lista
    await rpc(pessoa, "app_accept_terms", "tutor_ia", "2.0", "tutor");
    expect((await sessoes(pessoa)).map((s: any) => s.id)).toEqual([conversa.id]);
  });
});

describe("Aceite dos Tutores — versão nova", () => {
  it("versão nova do aceite dos Tutores: quem aceitou a antiga volta a ver o cartão; desfazer a troca não prende ninguém", async () => {
    const aluna = await novoAluno();
    await aceitarTermos(dev.db, aluna);
    const conversa = await rpc(aluna, "app_tutor_start", "livre", null, null);
    const so11 = await novoAluno(); // vai aceitar só a 2.1
    try {
      await sql(`update public.legal_versions set version = '2.1' where document = 'tutor_ia'`);
      expect(await status(aluna)).toMatchObject({ consent_required: true, consent_version: "2.1" });
      expect(await sessoes(aluna)).toEqual([]);
      expect(await recusa(rpc(aluna, "app_tutor_session", conversa.id))).toEqual(pendente);
      expect(await recusa(rpc(aluna, "app_tutor_start", "livre", null, null))).toEqual(pendente);
      expect((await recusa(rpc(aluna, "app_accept_terms", "tutor_ia", "2.0", "tutor"))).message).toBe("Versão desatualizada do termo.");
      expect(await recusa(rpc(aluna, "app_tutor_start", "livre", null, null))).toEqual(pendente);
      // o Termo não mudou: só o cartão do Tutor volta
      const termo = await termoVigente();
      expect((await rpc(aluna, "app_bootstrap")).legal).toMatchObject({ termo_uso: { current: termo, accepted: termo }, tutor_ia: { current: "2.1", accepted: "2.0" } });
      await rpc(aluna, "app_accept_terms", "tutor_ia", "2.1", "tutor");
      expect(await status(aluna)).toMatchObject({ consent_required: false, consent_version: "2.1" });
      expect((await sessoes(aluna)).map((s: any) => s.id)).toEqual([conversa.id]);
      expect((await rpc(aluna, "app_tutor_start", "livre", null, null)).status).toBe("active");

      await rpc(so11, "app_accept_terms", "tutor_ia", "2.1", "tutor");
      expect(await status(so11)).toMatchObject({ consent_required: false });

      // a troca é desfeita (2.1 voltou a 2.0): quem aceitou as duas continua liberada; quem só tem a 2.1 precisa da 2.0
      await sql(`update public.legal_versions set version = '2.0' where document = 'tutor_ia'`);
      expect(await status(aluna)).toMatchObject({ consent_required: false, consent_version: "2.0" });
      expect((await rpc(aluna, "app_tutor_start", "livre", null, null)).status).toBe("active");
      expect(await status(so11)).toMatchObject({ consent_required: true, consent_version: "2.0" });
      await rpc(so11, "app_accept_terms", "tutor_ia", "2.0", "tutor");
      expect(await status(so11)).toMatchObject({ consent_required: false });
    } finally {
      await sql(`update public.legal_versions set version = '2.0' where document = 'tutor_ia'`);
    }
  });
});

describe("Aceite dos Tutores — o que o servidor recebe", () => {
  it("contexto do servidor e leitura de voz trazem consent_pending", async () => {
    const aluno = await novoAluno();
    await aceitarTermos(dev.db, aluno);
    const conversa = await rpc(aluno, "app_tutor_start", "questao", null, null);
    const fala = (await sql<{ id: string }>(`select id from public.tutor_messages where session_id = $1 and role = 'tutor' order by id limit 1`, [conversa.id]))[0].id;
    const contexto = () => db.service<any>("ch_worker_tutor_context", { p_user: aluno, p_session_id: conversa.id });
    const voz = (kind: string, over: Record<string, unknown> = {}) =>
      db.service<any>("ch_worker_tutor_speech", { p_user: aluno, p_session_id: conversa.id, p_kind: kind, p_message_id: fala, p_personality: "acolhedor", ...over });

    // com o aceite: false, e o resto do que o servidor lê continua igual
    const ctxAceito = await contexto();
    expect(ctxAceito.consent_pending).toBe(false);
    expect(Object.keys(ctxAceito)).toEqual(
      expect.arrayContaining(["config", "entitlement", "is_pro", "used_today", "session", "personality", "student", "mastery", "memory", "recent_results", "session_errors", "history", "question"])
    );
    expect(ctxAceito.session).toMatchObject({ id: conversa.id, mode: "questao", status: "active", question_state: "open" });
    for (const kind of ["message", "question", "phrase"]) {
      expect(await voz(kind)).toMatchObject({ found: true, consent_pending: false });
    }
    expect(await voz("message")).toMatchObject({ found: true, personality: expect.any(String), text: expect.any(String) });

    await perderAceiteTutor(aluno);

    // sem o aceite: true. O servidor ainda lê a conversa (é ele que decide recusar), mas recebe o aviso
    const ctxPendente = await contexto();
    expect(ctxPendente.consent_pending).toBe(true);
    expect({ ...ctxPendente, consent_pending: false }).toEqual(ctxAceito);
    for (const kind of ["message", "question", "phrase"]) {
      expect(await voz(kind)).toMatchObject({ found: true, consent_pending: true });
    }
    // quando não acha a fala nem a conversa, o aviso também vem (o servidor pode conferir o aceite primeiro)
    expect(await voz("message", { p_session_id: "00000000-0000-4000-8000-00000000ffff" })).toEqual({ found: false, consent_pending: true });
    expect(await voz("phrase", { p_personality: "professor-que-nao-existe" })).toEqual({ found: false, consent_pending: true });
    // conversa que não existe: continua nulo (o servidor responde 404)
    expect(await db.service("ch_worker_tutor_context", { p_user: aluno, p_session_id: "00000000-0000-4000-8000-00000000ffff" })).toBeNull();

    // aceitou: volta a false
    await rpc(aluno, "app_accept_terms", "tutor_ia", "2.0", "tutor");
    expect((await contexto()).consent_pending).toBe(false);
    expect(await voz("message")).toMatchObject({ found: true, consent_pending: false });

    // equipe: sempre false, sem nenhum aceite
    const conversaAdmin = await rpc(ADMIN, "app_tutor_start", "livre", null, null);
    expect((await db.service<any>("ch_worker_tutor_context", { p_user: ADMIN, p_session_id: conversaAdmin.id })).consent_pending).toBe(false);
    expect(await db.service<any>("ch_worker_tutor_speech", { p_user: ADMIN, p_session_id: null, p_kind: "phrase", p_message_id: null, p_personality: "acolhedor" })).toMatchObject({ found: true, consent_pending: false });

    // só o servidor lê (o navegador do aluno não chama as funções ch_worker_*)
    const q = (s: string, p: unknown[]) => as(aluno, (run) => run(s, p));
    expect((await recusa(q(`select public.ch_worker_tutor_context($1, $2)`, [aluno, conversa.id]))).message).toMatch(/permission denied/i);
    expect((await recusa(q(`select public.ch_worker_tutor_speech($1, $2, 'phrase', null, 'acolhedor')`, [aluno, conversa.id]))).message).toMatch(/permission denied/i);
  });
});

describe("Aceite dos Tutores — rotas do servidor (/api/tutor)", () => {
  // O servidor de verdade (Express + createTutorRouter) sobre o mesmo banco. IA, voz natural e OpenAI SIMULADAS: nenhuma chamada externa.
  const KEY = "sk-servidor-" + "z".repeat(40);
  const RT: RealtimeConfig = { ready: true, model: "gpt-realtime-2.1", pending: null, key: KEY, transcribeModel: null };
  const LIVE: LiveConfig = { ready: true, model: "gpt-live-1", key: KEY, pending: null };
  const SEM_GEMINI: GeminiVoiceConfig = { ready: false, model: "gemini-teste", key: null, pending: "Gemini desligado no teste." };
  const RECUSA = { error: PENDENTE, code: "tutor_consent" };
  const SDP = "v=0 oferta-do-navegador";
  const SEM_CONVERSA = "00000000-0000-4000-8000-00000000ffff";
  const openai: string[] = [];
  const fakeFetch = (async (url: string) => {
    openai.push(url);
    if (url.endsWith("/live/sessions")) return new Response(JSON.stringify({ session: { id: "live_teste" }, transport: { type: "webrtc", sdp: "v=0 resposta-live" } }), { status: 201 });
    if (url.endsWith("/realtime/client_secrets")) return new Response(JSON.stringify({ value: "ek_temporario_teste", expires_at: 1_900_000_000 }), { status: 200 });
    if (/\/realtime\/calls\/[^/]+\/hangup$/.test(url)) return new Response("", { status: 200 });
    return new Response("?", { status: 404 });
  }) as typeof fetch;
  const speech = new MockSpeech();
  const deps: any = { mockRespond: () => reply("Por onde você começaria?"), speech, realtime: RT, live: LIVE, gemini: SEM_GEMINI, fetch: fakeFetch, elevenEnv: VOZ_ENV };
  let server: Server;
  let base: string;

  beforeAll(async () => {
    deps.db = db;
    const app = express();
    app.use(express.json());
    app.use("/api/tutor", createTutorRouter(deps));
    server = await new Promise<Server>((resolve) => {
      const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
    });
    base = `http://127.0.0.1:${(server.address() as any).port}/api/tutor`;
    // sem rede: se alguma ligação do GPT-Live precisar ser desligada, o canal lateral não abre
    setLiveSidebandFactory(() => {
      throw new Error("sem rede nos testes");
    });
  });
  afterAll(async () => {
    setLiveSidebandFactory(null);
    await new Promise((r) => server?.close(r));
  });

  /** POST na rota do Tutor com o token do aluno: devolve o status e o corpo (JSON, ou os bytes do áudio). */
  const pedir = async (token: string, rota: string, corpo: unknown) => {
    const r = await fetch(`${base}${rota}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, tipo, corpo: tipo.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };
  /** Aluno que já usou o Tutor (aceitou, tem a conversa de questão e a fala de abertura do professor). O teste tira o aceite quando quiser. */
  async function alunoComConversa(pago = true) {
    const aluno = await novoAluno();
    await aceitarTermos(dev.db, aluno);
    // plano pago: nenhum aviso de plano pode aparecer no lugar do aceite (o teste de precedência usa quem não paga)
    if (pago) await sql(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`, [aluno]);
    const conversa = await rpc(aluno, "app_tutor_start", "questao", null, null);
    const fala = (await sql<{ id: string }>(`select id from public.tutor_messages where session_id = $1 and role = 'tutor' order by id limit 1`, [conversa.id]))[0].id;
    return { aluno, token: await dev.createSession(aluno), sid: conversa.id as string, fala: Number(fala) };
  }
  /** Tudo o que o aluno gasta ou muda no Tutor: IA, voz, ligações, falas, respostas e dicas. */
  const uso = async (aluno: string, sid: string) => ({
    ia: await contar(`select coalesce(sum(requests), 0) n from public.ai_usage where user_id = $1`, [aluno]),
    voz: await contar(`select coalesce(sum(voice_chars), 0) n from public.ai_usage where user_id = $1`, [aluno]),
    ligacoes: await contar(`select count(*) n from public.tutor_voice_calls where user_id = $1`, [aluno]),
    falas: await contar(`select count(*) n from public.tutor_messages where session_id = $1`, [sid]),
    respostas: await contar(`select count(*) n from public.tutor_answers where session_id = $1`, [sid]),
    dicas: Number((await sql(`select hint_level n from public.tutor_sessions where id = $1`, [sid]))[0].n),
  });
  const zerar = () => {
    openai.length = 0;
    speech.calls.length = 0;
  };

  it("rotas do Tutor respondem 403 tutor_consent para aluno sem aceite", async () => {
    zerar();
    const { aluno, token, sid, fala } = await alunoComConversa();
    await perderAceiteTutor(aluno);
    const antes = await uso(aluno, sid);
    const pedidos: [string, Record<string, unknown>][] = [
      ["/turn", { session_id: sid, action: "message", text: "oi" }],
      ["/turn", { session_id: sid, action: "hint" }],
      ["/voice/start", { session_id: sid }], // Realtime
      ["/voice/start", { session_id: sid, sdp: SDP }], // GPT-Live
      ["/speech", { kind: "message", session_id: sid, message_id: fala }],
      ["/speech", { kind: "question", session_id: sid }],
      ["/speech", { kind: "phrase", phrase: "unmarked", personality_id: "acolhedor" }],
      // a leitura traz o aviso mesmo quando não acha a fala: o aceite é conferido antes de procurar
      ["/speech", { kind: "message", session_id: SEM_CONVERSA, message_id: 1 }],
    ];
    for (const [rota, corpo] of pedidos) {
      const r = await pedir(token, rota, corpo);
      expect({ status: r.status, corpo: r.corpo }, `${rota} ${JSON.stringify(corpo)}`).toEqual({ status: 403, corpo: RECUSA });
    }
    // recusou antes de gastar: nenhuma IA, nenhuma voz, nenhuma ligação, nenhuma fala nova, nenhuma dica; a OpenAI e o serviço de voz nem foram chamados
    expect(await uso(aluno, sid)).toEqual(antes);
    expect(openai).toEqual([]);
    expect(speech.calls).toEqual([]);
    // conversa que não existe continua sendo "não encontrada": não há o que recusar
    expect(await pedir(token, "/turn", { session_id: SEM_CONVERSA, action: "message", text: "oi" })).toMatchObject({ status: 404, corpo: { error: "Conversa não encontrada." } });
  });

  it("depois do aceite as mesmas rotas voltam a funcionar", async () => {
    zerar();
    const { aluno, token, sid, fala } = await alunoComConversa();
    await perderAceiteTutor(aluno);
    expect((await pedir(token, "/turn", { session_id: sid, action: "message", text: "oi" })).status).toBe(403);

    await rpc(aluno, "app_accept_terms", "tutor_ia", "2.0", "tutor");
    // a voz do professor fala com alunos: vozes aprovadas e "só equipe" desligado
    await aprovarVozes(sql);
    await sql(`update public.tutor_config set tts_team_only = false`);

    const turno = await pedir(token, "/turn", { session_id: sid, action: "message", text: "oi" });
    expect(turno).toMatchObject({ status: 200, corpo: { message: { role: "tutor", content: "Por onde você começaria?" } } });
    expect((await pedir(token, "/turn", { session_id: sid, action: "hint" })).status).toBe(200);
    for (const corpo of [{ kind: "message", session_id: sid, message_id: fala }, { kind: "question", session_id: sid }, { kind: "phrase", phrase: "unmarked", personality_id: "acolhedor" }]) {
      const r = await pedir(token, "/speech", corpo);
      expect({ status: r.status, tipo: r.tipo, riff: (r.corpo as Buffer).subarray(0, 4).toString("latin1") }, JSON.stringify(corpo)).toEqual({ status: 200, tipo: "audio/wav", riff: "RIFF" });
    }
    expect(speech.calls.length).toBe(3);
    const voz = await pedir(token, "/voice/start", { session_id: sid });
    expect(voz).toMatchObject({ status: 200, corpo: { provider: "realtime", client_secret: "ek_temporario_teste", model: "gpt-realtime-2.1" } });
    expect((await pedir(token, "/voice/end", { voice_call_id: voz.corpo.voice_call_id })).status).toBe(200);
  });

  it("o aceite vem antes dos avisos de plano: o aluno vê o cartão do aceite, não a mensagem de teste terminado ou de plano pago", async () => {
    zerar();
    const { aluno, token, sid, fala } = await alunoComConversa(false);
    await sql(`update public.subscriptions set tutor_trial_started_at = now() - interval '8 days' where user_id = $1`, [aluno]); // teste grátis terminado
    await perderAceiteTutor(aluno);
    const pedidos: [string, Record<string, unknown>][] = [
      ["/turn", { session_id: sid, action: "message", text: "oi" }],
      ["/voice/start", { session_id: sid }],
      ["/speech", { kind: "message", session_id: sid, message_id: fala }],
    ];
    for (const [rota, corpo] of pedidos) {
      const r = await pedir(token, rota, corpo);
      expect({ status: r.status, corpo: r.corpo }, rota).toEqual({ status: 403, corpo: RECUSA });
    }
    // com o aceite valem as regras de plano de antes, sem o código (já não é pendência de aceite)
    await rpc(aluno, "app_accept_terms", "tutor_ia", "2.0", "tutor");
    for (const [rota, corpo, aviso] of [
      ["/turn", pedidos[0][1], /teste grátis do Tutor terminou/],
      ["/voice/start", pedidos[1][1], /teste grátis do Tutor terminou/],
      ["/speech", pedidos[2][1], /planos pagos/],
    ] as const) {
      const r = await pedir(token, rota, corpo);
      expect(r.status, rota).toBe(403);
      expect(r.corpo, rota).toEqual({ error: expect.stringMatching(aviso) });
    }
    expect(openai).toEqual([]);
    expect(speech.calls).toEqual([]);
  });

  it("ligação do GPT-Live aberta antes de o aceite acabar: delegar recusa com 403 tutor_consent (fala, dica e letra dita) e volta com o aceite", async () => {
    zerar();
    const { aluno, token, sid } = await alunoComConversa();
    const aberta = await pedir(token, "/voice/start", { session_id: sid, sdp: SDP });
    expect(aberta).toMatchObject({ status: 200, corpo: { provider: "live", sdp: "v=0 resposta-live" } });
    const ligacao = aberta.corpo.voice_call_id;
    const delegar = (fala: string) => pedir(token, "/voice/delegate", { voice_call_id: ligacao, transcript: [{ role: "student", text: fala }] });

    await perderAceiteTutor(aluno);
    const antes = await uso(aluno, sid);
    for (const fala of ["oi, tudo bem?", "me dá uma dica", "acho que é a letra B"]) {
      const r = await delegar(fala);
      expect({ status: r.status, corpo: r.corpo }, fala).toEqual({ status: 403, corpo: RECUSA });
    }
    // nem a letra dita virou resposta, nem a dica foi contada, nem entrou fala nova
    expect(await uso(aluno, sid)).toEqual(antes);

    await rpc(aluno, "app_accept_terms", "tutor_ia", "2.0", "tutor");
    const volta = await delegar("oi, tudo bem?");
    expect(volta).toMatchObject({ status: 200, corpo: { intent: "message", say: [expect.stringMatching(/começaria/)] } });
  });
});
