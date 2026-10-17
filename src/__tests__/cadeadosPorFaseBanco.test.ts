// @vitest-environment node
/**
 * Planos · ETAPA 3 no banco: supabase/migrations/20261003013690_cadeados_por_fase.sql (cadeados por fase, só com a chave ligada).
 * Confere: chave DESLIGADA = exatamente o comportamento de antes (cada ação de cada pessoa dá o mesmo resultado antes e depois
 * da migração; o corpo de simulado_gate ficou byte a byte); chave LIGADA = a matriz por fase
 * (teste, vencido, PRO, PRÁTICA dado pela equipe, ELITE, sem plano, equipe, revisor) × recurso (treino, resposta, simulado curto,
 * flashcards, leitura de questões, Tutor numa questão, estações/checklists, simulados práticos, sala da
 * dupla); 2ª fase fechada também no banco; trancar não apaga o progresso dos flashcards; ativação do teste pelo servidor com o
 * alerta de IP (nunca bloqueia; só hash; 90 dias); escolha "as duas"; aluno não muda o próprio plano; visitante barrado;
 * plano dado pela equipe com registro; colar de novo; conferência; desfazer.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const NOME = "20261003013690_cadeados_por_fase.sql";
const MIGRACAO = fs.readFileSync(path.join(MIGRATIONS, NOME), "utf8");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const EDITOR = id(2);
const REVISOR = id(3);
const TESTE = id(4);
const VENCIDO = id(5);
const PRO = id(6);
const ELITE = id(7);
const PRATICA = id(8);
const SEM_PLANO = id(9);
const IP1 = id(11), IP2 = id(12), IP3 = id(13), IP4 = id(14), DUAS = id(15);
const TODOS = [ADMIN, EDITOR, REVISOR, TESTE, VENCIDO, PRO, ELITE, PRATICA, SEM_PLANO];
const EXTRAS = [IP1, IP2, IP3, IP4, DUAS];

let db: PGlite;
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async (sql: string, params: unknown[] = []) => (await q<{ r: any }>(sql, params))[0].r;

async function como<T = any>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
/** Faz a ação como a pessoa e DESFAZ tudo no fim: devolve "ok: <resultado>" ou "erro: <mensagem>". */
async function tenta(uid: string, sql: string, params: unknown[] = []): Promise<string> {
  let saida = "";
  try {
    await db.transaction(async (tx) => {
      await tx.exec(`set local role authenticated`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
      try {
        const r = await tx.query<any>(sql, params);
        saida = "ok: " + JSON.stringify(r.rows[0] ?? null);
      } catch (e) {
        saida = "erro: " + (e as Error).message;
      }
      await tx.rollback();
    });
  } catch {
    /* rollback */
  }
  return saida;
}
const sub = (uid: string, plan: string, status: string, trialEnd: string | null, periodEnd: string | null = null) =>
  db.query(`update public.subscriptions set plan = $2, status = $3, trial_ends_at = ${trialEnd ?? "null"}, current_period_end = ${periodEnd ?? "null"} where user_id = $1`, [uid, plan, status]);
const ligar = (on: boolean) => db.query(`update public.direitos_config set cadeados_ligados = $1`, [on]);
const fase2 = (on: boolean) => db.query(`update public.direitos_config set fase2_aberta_alunos = $1`, [on]);
const PROX = JSON.stringify({ due: new Date(Date.now() + 86400000).toISOString(), state: 2, stability: 1, difficulty: 5, reps: 1, lapses: 0, scheduled_days: 1, elapsed_days: 0 });
const CARD = "11111111-1111-4111-8111-111111111111";

/** As ações que importam, cada uma feita e desfeita (o resultado é o que a pessoa veria). */
const ACOES: Record<string, [string, unknown[]?]> = {
  treino: [`select (public.app_start_session('questoes', '{}'::jsonb, 3)) ->> 'count' as n`],
  simulado: [`select (public.app_start_session('simulado', '{}'::jsonb, 3, 600)) ->> 'count' as n`],
  ler_questoes: [`select count(*)::int n from public.questions`],
  ver_questao: [`select public.practice_question_view('q-1') ->> 'id' as id`],
  flashcards: [`select jsonb_array_length(coalesce(public.app_flashcards() -> 'cards', '[]'::jsonb)) as n`],
  revisar: [`select public.app_review_flashcard('${CARD}', 3, $1::jsonb) ->> 'due' is not null as ok`, [PROX]],
  gate: [`select public.simulado_gate() as g`],
  estacoes: [`select count(*)::int n from public.checklist_stations`],
  conteudo: [`select count(*)::int n from public.checklist_station_contents`],
  eventos: [`select count(*)::int n from public.checklist_events`],
};
async function retrato(uids: string[]) {
  const out: Record<string, Record<string, string>> = {};
  for (const u of uids) {
    out[u] = {};
    for (const [k, [sql, p]] of Object.entries(ACOES)) out[u][k] = (await tenta(u, sql, p ?? [])).replace(/"due":"[^"]+"/, '"due":"…"');
  }
  return out;
}
let antes: Awaited<ReturnType<typeof retrato>>;
let defsAntes: Record<string, string> = {};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f < NOME).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const uid of [...TODOS, ...EXTRAS]) await db.query(`insert into auth.users (id, email, raw_user_meta_data, created_at) values ($1, $2, '{}', now() - interval '2 days')`, [uid, `k${parseInt(uid.slice(-4))}@teste.dev`]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'clinica_medica')`, [REVISOR]);
  for (const u of [TESTE, IP1, IP2, IP3, IP4, DUAS]) await sub(u, "trial", "trialing", "now() + interval '5 days'");
  await sub(VENCIDO, "trial", "trialing", "now() - interval '1 day'");
  await sub(PRO, "pro", "active", null, "now() + interval '20 days'");
  await sub(ELITE, "elite", "active", null, "now() + interval '20 days'");
  await sub(PRATICA, "trial", "trialing", "now() - interval '3 days'"); // vira PRÁTICA dado pela equipe (depois)
  await db.query(`delete from public.subscriptions where user_id = $1`, [SEM_PLANO]);

  await db.exec(`insert into public.exams (id, kind, year, semester, title, question_count) values ('revalida-2024-1', 'REVALIDA', 2024, 1, 'Revalida INEP 2024/1', 12)`);
  const options = JSON.stringify(["A", "B", "C", "D"].map((i) => ({ id: i, text: `alternativa ${i}`, explanation: i === "B" ? "Porque sim." : "" })));
  for (let n = 1; n <= 6; n++) {
    await db.query(
      `insert into public.questions (id, code, exam_id, number, area, topic, subtopic, statement, options, correct_option, status, needs_image, expected_conduct, inep_intent)
       values ($1, $2, 'revalida-2024-1', $3, 'CLINICA_MEDICA', 'Tema', 'sub', $4, $5, 'B', 'valid', false, 'Conduta.', 'Banca.')`,
      [`q-${n}`, `T-${n}`, n, `Caso ${n}.`, options]
    );
  }
  await db.query(`insert into public.flashcards (id, area, topic, front, back, published, review_status) values ($1, 'PEDIATRIA', 'tema', 'frente', 'verso', true, 'approved')`, [CARD]);
  await db.exec(`insert into public.checklist_stations (id, name, topic, area, medical_review) values ('est-1', 'Estação 1', 'Tema', 'Clínica Médica', 'approved')`);
  await db.exec(`update public.tutor_config set requires_pro = true, enabled = true`);

  const defs = await q<{ n: string; d: string }>(`select p.oid::regprocedure::text n, pg_get_functiondef(p.oid) d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'`);
  defsAntes = Object.fromEntries(defs.map((x) => [x.n, x.d]));
  antes = await retrato([ADMIN, EDITOR, REVISOR, TESTE, VENCIDO, PRO, ELITE, PRATICA, SEM_PLANO]);
  await db.exec(MIGRACAO);
}, 300_000);

describe("chave DESLIGADA: tudo exatamente como antes", () => {
  it("cada ação de cada pessoa dá o mesmo resultado antes e depois da migração", async () => {
    const depois = await retrato([ADMIN, EDITOR, REVISOR, TESTE, VENCIDO, PRO, ELITE, PRATICA, SEM_PLANO]);
    expect(depois).toEqual(antes);
    expect(antes[VENCIDO].simulado).toMatch(/^erro: Seu teste grátis terminou/); // a trava antiga continua
    expect(antes[TESTE].treino).toBe('ok: {"n":"3"}');
  });
  it("nenhuma função antiga mudou; simulado_gate ficou byte a byte com o nome _regra_antiga", async () => {
    const defs = await q<{ n: string; d: string }>(`select p.oid::regprocedure::text n, pg_get_functiondef(p.oid) d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'`);
    const depois = Object.fromEntries(defs.map((x) => [x.n, x.d]));
    const porteiros = new Set(["simulado_gate()", "direitos_teste_alerta(uuid)"]);
    for (const [k, v] of Object.entries(defsAntes)) if (!porteiros.has(k)) expect(depois[k], k).toBe(v);
    expect(depois["simulado_gate_regra_antiga()"]).toBe(defsAntes["simulado_gate()"].replace("public.simulado_gate(", "public.simulado_gate_regra_antiga("));
    expect(depois["practice_question_view(text)"]).toBe(defsAntes["practice_question_view(text)"]); // de propósito: sem porteiro
  });
  it("a versão antiga não fica aberta ao navegador (só pelo porteiro)", async () => {
    await expect(como(PRATICA, `select public.simulado_gate_regra_antiga()`)).rejects.toThrow();
  });
});

describe("plano dado pela equipe (Administração > Usuários)", () => {
  it("só o administrador dá; fica registrado; com a 2ª fase fechada, avisa", async () => {
    await expect(como(PRATICA, `select public.app_admin_direitos_dar_plano($1, 'elite', now() + interval '30 days', 'eu mesmo')`, [`k8@teste.dev`])).rejects.toThrow();
    const [r] = await como(ADMIN, `select public.app_admin_direitos_dar_plano($1, 'pratica', now() + interval '30 days', 'Conta de teste da 2ª fase') r`, [`k8@teste.dev`]);
    expect(r.r.aviso).toMatch(/2ª fase ainda está fechada/);
    expect(r.r.regra_nova.perfil).toBe("pratica");
    expect((await q(`select action, target from public.admin_audit_log order by id desc limit 1`))[0]).toEqual({ action: "direitos.fase_dada", target: PRATICA });
    // a assinatura antiga mudando não mexe no plano dado pela equipe
    await sub(PRATICA, "trial", "expired", null);
    expect((await one(`select public.direitos_do_aluno($1) r`, [PRATICA])).perfil).toBe("pratica");
  });
  it("aluno não muda o próprio plano, fase, teste nem saldo", async () => {
    await expect(como(TESTE, `insert into public.aluno_fases (user_id, fase, situacao, plano, fim, origem) values ($1, 'teoria', 'paga', 'elite', now() + interval '1 year', 'equipe')`, [TESTE])).rejects.toThrow();
    await expect(como(TESTE, `update public.aluno_testes set escolha = 'as_duas', fases = '{teoria,pratica}' where user_id = $1`, [TESTE])).rejects.toThrow();
    await expect(como(TESTE, `update public.direitos_config set cadeados_ligados = false`)).rejects.toThrow();
    await expect(como(TESTE, `select public.app_escolher_teste('as_duas')`)).rejects.toThrow(); // agora só pelo servidor
    await expect(como(TESTE, `select public.ch_worker_teste_ativar($1, 'teoria', null)`, [TESTE])).rejects.toThrow();
    await expect(como(TESTE, `select public.cadeado_conferir($1, 'questoes')`, [TESTE])).rejects.toThrow();
    await expect(como(null, `select public.app_cadeado('questoes')`)).rejects.toThrow();
  });
});

describe("chave LIGADA: a matriz por fase", () => {
  beforeAll(async () => {
    await ligar(true);
    // números pequenos para o teste: 2 respostas por dia, simulado curto de até 3 questões
    await db.exec(`update public.direitos_recursos set amostra_limite = 2 where codigo = 'questoes'`);
    await db.exec(`update public.direitos_config set amostra_simulado_max_questoes = 3`);
    // o PRÁTICA tinha progresso nos flashcards ANTES de ficar trancado
    await db.query(`insert into public.flashcard_states (user_id, card_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review)
                    values ($1, $2, now() + interval '3 days', 4.2, 5, 1, 3, 0, 3, 0, 2, now() - interval '1 day')`, [PRATICA, CARD]);
  });

  it("PRÁTICA: teoria trancada em todas as portas, com a frase do cadeado", async () => {
    const r = await retrato([PRATICA]);
    // treino e simulado: a busca de questões (que roda como a pessoa) já não enxerga nenhuma questão; a sessão nem chega a nascer
    expect(r[PRATICA].treino).toMatch(/^erro: (Faz parte da 1ª fase|Nenhuma questão encontrada)/);
    expect(r[PRATICA].simulado).toMatch(/^erro: (Faz parte da 1ª fase|Nenhuma questão encontrada)/);
    // e criar a sessão direto (por fora do app) também é barrado, com a frase do cadeado
    await expect(db.query(`insert into public.practice_sessions (user_id, kind, question_ids) values ($1, 'questoes', '{q-1}')`, [PRATICA])).rejects.toThrow(/Faz parte da 1ª fase/);
    expect(r[PRATICA].ler_questoes).toBe('ok: {"n":0}');
    // pendência documentada: abrir uma questão avulsa pelo código (só enunciado e alternativas) não é trancado no banco
    expect(r[PRATICA].ver_questao).toBe('ok: {"id":"q-1"}');
    expect(r[PRATICA].flashcards).toBe('ok: {"n":0}');
    expect(r[PRATICA].revisar).toMatch(/^erro:/);
    await expect(db.query(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity, question_id) values ($1, 'questao', 't', (select id from public.tutor_personalities order by id limit 1), 3, 'q-1')`, [PRATICA])).rejects.toThrow(/1ª fase/);
    // nivelamento: as questões do diagnóstico também não chegam
    const diag = await one(`insert into public.nivelamento_diagnosticos (user_id) values ($1) returning id r`, [PRATICA]);
    await expect(db.query(`insert into public.nivelamento_itens (diagnostico_id, ordem, bloco, question_id, area, grupo) values ($1, 1, 1, 'q-1', 'CLINICA_MEDICA', 'g')`, [diag])).rejects.toThrow(/1ª fase/);
    // o servidor gravando uma resposta (sem pessoa logada) também é barrado: o gatilho olha o aluno da linha
    await expect(db.query(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, 'q-1', 'B')`, [PRATICA])).rejects.toThrow(/1ª fase/);
  });
  it("trancar não apaga nem reinicia o progresso dos flashcards", async () => {
    const st = await q(`select reps, stability, state from public.flashcard_states where user_id = $1`, [PRATICA]);
    expect(st).toEqual([{ reps: 3, stability: 4.2, state: 2 }]);
  });
  it("teste grátis: amostra de questões por dia, 1 simulado curto por dia", async () => {
    const s = await como(TESTE, `select public.app_start_session('questoes', '{}'::jsonb, 3) r`);
    const sid = s[0].r.session_id;
    const ids: string[] = (await q(`select question_ids from public.practice_sessions where id = $1`, [sid]))[0].question_ids;
    await como(TESTE, `select public.app_answer_question($1, $2, 'B')`, [sid, ids[0]]);
    await como(TESTE, `select public.app_answer_question($1, $2, 'A')`, [sid, ids[1]]);
    await expect(como(TESTE, `select public.app_answer_question($1, $2, 'B')`, [sid, ids[2]])).rejects.toThrow(/amostra de hoje \(2 questões por dia\)/);
    await expect(como(TESTE, `select public.app_start_session('questoes', '{}'::jsonb, 3)`)).rejects.toThrow(/amostra de hoje/);
    await expect(como(TESTE, `select public.app_start_session('simulado', '{}'::jsonb, 4, 600)`)).rejects.toThrow(/simulado é curto: até 3 questões/);
    expect((await como(TESTE, `select public.app_start_session('simulado', '{}'::jsonb, 3, 600) r`))[0].r.count).toBe(3);
    await expect(como(TESTE, `select public.app_start_session('simulado', '{}'::jsonb, 3, 600)`)).rejects.toThrow(/amostra de hoje \(1 simulado curto por dia\)/);
  });
  it("vencido = amostra (a trava antiga do teste vencido sai com a chave ligada)", async () => {
    const r = await retrato([VENCIDO]);
    expect(r[VENCIDO].gate).toBe('ok: {"g":null}');
    expect(r[VENCIDO].simulado).toBe('ok: {"n":"3"}');
    expect(r[VENCIDO].treino).toBe('ok: {"n":"3"}');
  });
  it("flashcards na amostra: 10 por dia", async () => {
    expect((await one(`select public.direitos_do_aluno($1) r`, [TESTE])).recursos.flashcards.amostra).toMatchObject({ modo: "por_dia", limite: 10 });
    for (let i = 0; i < 10; i++) await db.query(`insert into public.flashcard_reviews (user_id, card_id, rating) values ($1, $2, 3)`, [TESTE, CARD]);
    await expect(db.query(`insert into public.flashcard_reviews (user_id, card_id, rating) values ($1, $2, 3)`, [TESTE, CARD])).rejects.toThrow(/10 cartões por dia/);
  });
  it("PRO e ELITE: teoria completa; 2ª fase fechada também no banco (só administrador e editor)", async () => {
    for (const u of [PRO, ELITE]) {
      const r = await retrato([u]);
      expect(r[u].treino).toBe('ok: {"n":"3"}');
      expect(r[u].simulado).toBe('ok: {"n":"3"}');
      expect(r[u].ler_questoes).toBe('ok: {"n":6}');
      expect(r[u].estacoes).toBe('ok: {"n":0}'); // a estação existe, mas a 2ª fase está fechada
    }
    // equipe e revisor
    const eq = await retrato([ADMIN, EDITOR, REVISOR]);
    expect(eq[ADMIN].ler_questoes).toBe('ok: {"n":6}');
    expect(eq[REVISOR].ler_questoes).toBe('ok: {"n":6}');
    expect(eq[ADMIN].estacoes).toBe('ok: {"n":1}');
    expect(eq[EDITOR].estacoes).toBe('ok: {"n":1}');
    expect(eq[REVISOR].estacoes).toBe('ok: {"n":0}');
    expect(await one(`select public.user_has_access($1, 'estacoes') r`, [REVISOR])).toBe("trancado"); // revisor: tudo menos a 2ª fase fechada
    expect(await one(`select public.user_has_access($1, 'estacoes') r`, [EDITOR])).toBe("liberado");
    // abrindo a 2ª fase: ELITE e PRÁTICA entram na prática; PRO segue trancado
    await fase2(true);
    expect(await one(`select public.user_has_access($1, 'estacoes') r`, [ELITE])).toBe("liberado");
    expect(await one(`select public.user_has_access($1, 'estacoes') r`, [PRATICA])).toBe("liberado");
    expect(await one(`select public.user_has_access($1, 'estacoes') r`, [PRO])).toBe("trancado");
    expect((await retrato([ELITE]))[ELITE].estacoes).toBe('ok: {"n":1}');
    expect((await retrato([PRO]))[PRO].estacoes).toBe('ok: {"n":0}');
    const [pode] = await como(PRO, `select public.cadeado_pode_ler('treino_dupla') r`);
    expect(pode.r).toBe(false);
    const [elite] = await como(ELITE, `select public.cadeado_pode_ler('treino_dupla') r`);
    expect(elite.r).toBe(true);
    await fase2(false);
  });
  it("conta sem assinatura nenhuma: sem acesso à teoria", async () => {
    const r = await retrato([SEM_PLANO]);
    expect(r[SEM_PLANO].treino).toMatch(/^erro:/);
  });
});

describe("teste grátis ativado pelo servidor (alerta de IP, nunca bloqueia)", () => {
  const H = "a".repeat(64);
  it("mais de 3 testes do mesmo IP em 7 dias: o seguinte pede verificação a mais, mas o teste vale", async () => {
    for (const u of [IP1, IP2, IP3]) {
      const r = await one(`select public.ch_worker_teste_ativar($1, 'teoria', $2) r`, [u, H]);
      expect(r.direitos.teste.verificacao).toBeNull();
    }
    const r4 = await one(`select public.ch_worker_teste_ativar($1, 'teoria', $2) r`, [IP4, H]);
    expect(r4.direitos.teste.verificacao).toMatchObject({ pedida: true, motivo: "muitos_testes_mesmo_ip" });
    expect(r4.direitos.perfil).toBe("teste"); // nunca bloqueia
    // ativar de novo não conta de novo nem duplica
    await one(`select public.ch_worker_teste_ativar($1, null, $2) r`, [IP4, H]);
    expect((await q(`select count(*)::int n from public.teste_ips where user_id = $1`, [IP4]))[0].n).toBe(1);
    // só o hash fica guardado
    expect((await q(`select ip_hash from public.teste_ips limit 1`))[0].ip_hash).toMatch(/^[0-9a-f]{64}$/);
    await expect(one(`select public.ch_worker_teste_ativar($1, null, '1.2.3.4') r`, [DUAS])).rejects.toThrow(/IP inválido/);
    // a equipe vê e marca como verificado
    const [lista] = await como(ADMIN, `select public.app_admin_testes_alerta() r`);
    expect(lista.r.map((x: any) => x.email)).toEqual(["k14@teste.dev"]);
    await como(ADMIN, `select public.app_admin_teste_verificado('k14@teste.dev')`);
    expect((await one(`select public.direitos_do_aluno($1) r`, [IP4])).teste.verificacao).toMatchObject({ feita: true });
  });
  it("hashes de IP com mais de 90 dias são apagados", async () => {
    await db.query(`insert into public.teste_ips (user_id, ip_hash, criado_em) values ($1, $2, now() - interval '91 days')`, [IP1, "b".repeat(64)]);
    expect(await one(`select public.ch_worker_teste_ips_limpar() r`)).toBe(1);
  });
  it("'as duas' só com a 2ª fase aberta; e então recebe os dois testes", async () => {
    await expect(one(`select public.ch_worker_teste_ativar($1, 'as_duas', null) r`, [DUAS])).rejects.toThrow(/2ª fase ainda não está aberta/);
    await fase2(true);
    const r = await one(`select public.ch_worker_teste_ativar($1, 'as_duas', null) r`, [DUAS]);
    expect(r.direitos.fases.teoria.situacao).toBe("teste");
    expect(r.direitos.fases.pratica.situacao).toBe("teste");
    await expect(one(`select public.ch_worker_teste_ativar($1, 'teoria', null) r`, [DUAS])).rejects.toThrow(/já escolheu/);
    await fase2(false);
  });
});

describe("colar de novo, conferência e desfazer", () => {
  it("colar de novo não renomeia os porteiros por engano", async () => {
    await db.exec(MIGRACAO);
    const def = await one(`select pg_get_functiondef('public.simulado_gate_regra_antiga()'::regprocedure) r`);
    expect(def).toBe(defsAntes["simulado_gate()"].replace("public.simulado_gate(", "public.simulado_gate_regra_antiga("));
  });
  it("o SQL de conferência responde OK", async () => {
    const r = await q(fs.readFileSync(path.join(ROOT, "supabase/conferir/cadeados-por-fase.sql"), "utf8"));
    expect(r[0].resultado).toMatch(/^OK: cadeados por fase no banco/);
  });
  it("desfazer a 013680 antes da 013690 é recusado (a 013690 depende dela)", async () => {
    await expect(db.exec(fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013680_carteira_creditos.desfazer.sql"), "utf8"))).rejects.toThrow(/Desfaça antes a 013690/);
  });
  it("desfazer devolve as funções antigas com o nome de sempre e o comportamento de antes", async () => {
    await ligar(false);
    await db.exec(fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013690_cadeados_por_fase.desfazer.sql"), "utf8"));
    expect(await one(`select pg_get_functiondef('public.simulado_gate()'::regprocedure) r`)).toBe(defsAntes["simulado_gate()"]);
    const r = await retrato([TESTE, PRO]);
    expect(r[PRO].ler_questoes).toBe('ok: {"n":6}');
    expect((await q(`select count(*)::int n from pg_trigger where tgname like 'cadeado_%'`))[0].n).toBe(0);
  });
});
