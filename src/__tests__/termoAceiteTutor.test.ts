// @vitest-environment node
/**
 * Aceite dos Tutores de IA (§34 do Termo) no banco (supabase/migrations/…5400_tutor_aceite.sql): sem o aceite da versão vigente o
 * aluno não começa, não abre, não responde e não pede a próxima; a lista de conversas vem vazia; o status pede o aceite; e o servidor
 * recebe `consent_pending` no contexto da conversa e na leitura de voz. Administrador, editor e revisor médico usam sem aceitar.
 * Spec: docs/superpowers/specs/2026-10-07-termo-aceite-cadastro-design.md (seção 8).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { aceitarTermos } from "./helpers/aceites";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-aceite-"));
let dev: DevDatabase;
let db: ContentDb;
let seq = 0;
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const PENDENTE = "Aceite do Tutor pendente.";
const SEM_LOGIN = "Entre na sua conta.";
const SEM_ACEITE_CODE = "42501";

const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
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
const perderAceiteTutor = (uid: string) => sql(`delete from public.legal_acceptances where user_id = $1 and document = 'tutor_ia'`, [uid]);

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
      consent_required: true, consent_version: "1.0",
    });
    expect(antes.entitlement).toMatchObject({ mode: "trial", can_use: true });
    expect(antes.personalities.length).toBeGreaterThan(0);
    await aceitarTermos(dev.db, aluno);
    const depois = await status(aluno);
    expect(depois).toMatchObject({ consent_required: false, consent_version: "1.0" });
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

    expect(await status(aluno)).toMatchObject({ consent_required: true, consent_version: "1.0" });
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
    await rpc(aluno, "app_accept_terms", "tutor_ia", "1.0", "tutor");
    expect((await sessoes(aluno)).length).toBe(3);
    expect((await rpc(aluno, "app_tutor_session", aberta.id)).id).toBe(aberta.id);
    expect(await rpc(aluno, "app_tutor_answer", aberta.id, certa[aberta.question.id], 4)).toMatchObject({ is_correct: true });
    expect((await rpc(aluno, "app_tutor_next_question", respondida.id)).question_state).toBe("open");
    expect((await rpc(aluno, "app_tutor_start", "livre", null, null)).status).toBe("active");

    // aluna que nunca aceitou nada: também sem conversa nova
    const nova = await novoAluno();
    expect(await status(nova)).toMatchObject({ consent_required: true, consent_version: "1.0" });
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
    await rpc(aluna, "app_accept_terms", "tutor_ia", "1.0", "tutor");
    await expect(rpc(aluna, "app_tutor_start", "livre", null, null)).rejects.toThrow(/teste grátis do Tutor terminou/);
    await expect(rpc(aluna, "app_tutor_start", "modo-que-nao-existe", null, null)).rejects.toThrow(/teste grátis do Tutor terminou/);
  });

  it("depois do app_accept_terms('tutor_ia','1.0','tutor') o Tutor abre", async () => {
    const aluna = await novoAluno();
    expect(await recusa(rpc(aluna, "app_tutor_start", "livre", null, null))).toEqual(pendente);
    // aceitar só o Termo (tela de aceite) não libera o Tutor: são dois aceites
    await rpc(aluna, "app_accept_terms", "termo_uso", "1.0", "tela_aceite", "+5541999998888");
    expect(await status(aluna)).toMatchObject({ consent_required: true });
    expect(await recusa(rpc(aluna, "app_tutor_start", "livre", null, null))).toEqual(pendente);
    // aceitar uma versão velha também não
    expect((await recusa(rpc(aluna, "app_accept_terms", "tutor_ia", "0.9", "tutor"))).message).toBe("Versão desatualizada do termo.");
    expect(await status(aluna)).toMatchObject({ consent_required: true });

    const boot = await rpc(aluna, "app_accept_terms", "tutor_ia", "1.0", "tutor");
    expect(boot.legal.tutor_ia).toMatchObject({ current: "1.0", accepted: "1.0" });
    expect(await status(aluna)).toMatchObject({ consent_required: false, consent_version: "1.0" });
    const prova = (await sql(`select origin, version from public.legal_acceptances where user_id = $1 and document = 'tutor_ia'`, [aluna]))[0];
    expect(prova).toEqual({ origin: "tutor", version: "1.0" });

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
    await rpc(outro, "app_accept_terms", "tutor_ia", "1.0", "tutor");
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
      expect(await status(uid)).toMatchObject({ consent_required: false, consent_version: "1.0" });
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
    await rpc(pessoa, "app_accept_terms", "tutor_ia", "1.0", "tutor");
    expect((await sessoes(pessoa)).map((s: any) => s.id)).toEqual([conversa.id]);
  });
});

describe("Aceite dos Tutores — versão nova", () => {
  it("versão nova do aceite dos Tutores: quem aceitou a antiga volta a ver o cartão; desfazer a troca não prende ninguém", async () => {
    const aluna = await novoAluno();
    await aceitarTermos(dev.db, aluna);
    const conversa = await rpc(aluna, "app_tutor_start", "livre", null, null);
    const so11 = await novoAluno(); // vai aceitar só a 1.1
    try {
      await sql(`update public.legal_versions set version = '1.1' where document = 'tutor_ia'`);
      expect(await status(aluna)).toMatchObject({ consent_required: true, consent_version: "1.1" });
      expect(await sessoes(aluna)).toEqual([]);
      expect(await recusa(rpc(aluna, "app_tutor_session", conversa.id))).toEqual(pendente);
      expect(await recusa(rpc(aluna, "app_tutor_start", "livre", null, null))).toEqual(pendente);
      expect((await recusa(rpc(aluna, "app_accept_terms", "tutor_ia", "1.0", "tutor"))).message).toBe("Versão desatualizada do termo.");
      expect(await recusa(rpc(aluna, "app_tutor_start", "livre", null, null))).toEqual(pendente);
      // o Termo não mudou: só o cartão do Tutor volta
      expect((await rpc(aluna, "app_bootstrap")).legal).toMatchObject({ termo_uso: { current: "1.0", accepted: "1.0" }, tutor_ia: { current: "1.1", accepted: "1.0" } });
      await rpc(aluna, "app_accept_terms", "tutor_ia", "1.1", "tutor");
      expect(await status(aluna)).toMatchObject({ consent_required: false, consent_version: "1.1" });
      expect((await sessoes(aluna)).map((s: any) => s.id)).toEqual([conversa.id]);
      expect((await rpc(aluna, "app_tutor_start", "livre", null, null)).status).toBe("active");

      await rpc(so11, "app_accept_terms", "tutor_ia", "1.1", "tutor");
      expect(await status(so11)).toMatchObject({ consent_required: false });

      // a troca é desfeita (1.1 voltou a 1.0): quem aceitou as duas continua liberada; quem só tem a 1.1 precisa da 1.0
      await sql(`update public.legal_versions set version = '1.0' where document = 'tutor_ia'`);
      expect(await status(aluna)).toMatchObject({ consent_required: false, consent_version: "1.0" });
      expect((await rpc(aluna, "app_tutor_start", "livre", null, null)).status).toBe("active");
      expect(await status(so11)).toMatchObject({ consent_required: true, consent_version: "1.0" });
      await rpc(so11, "app_accept_terms", "tutor_ia", "1.0", "tutor");
      expect(await status(so11)).toMatchObject({ consent_required: false });
    } finally {
      await sql(`update public.legal_versions set version = '1.0' where document = 'tutor_ia'`);
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
    await rpc(aluno, "app_accept_terms", "tutor_ia", "1.0", "tutor");
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
