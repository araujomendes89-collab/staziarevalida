// @vitest-environment node
/**
 * Planos · ETAPA 2 no banco: supabase/migrations/20261003013680_carteira_creditos.sql (carteira de créditos e minutos).
 * Confere: com a chave DESLIGADA nada muda (a regra antiga do Tutor decide exatamente como antes, tutor_entitlement responde igual
 * para todos e o corpo da regra antiga ficou byte a byte); a carteira só registra (custo real → créditos, "teria barrado");
 * a dica conta o teto por dia no banco; com a chave LIGADA a carteira manda (franquia dia/mês, extra mais antigo primeiro, extra
 * vencido não vale, reserva → confirmação pelo custo real → devolução, idempotência por request_id, 20 pedidos com 1 crédito,
 * avisos únicos 80/90/100%, teto global, voz que passa da franquia sai do extra de voz); cortesia só administrador e com registro;
 * aluno não muda o próprio saldo; visitante barrado; cálculo da devolução com os exemplos do dono; colar de novo e desfazer.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const NOME = "20261003013680_carteira_creditos.sql";
const MIGRACAO = fs.readFileSync(path.join(MIGRATIONS, NOME), "utf8");
const DESFAZER_ARQ = path.join(ROOT, "supabase/desfazer/20261003013680_carteira_creditos.desfazer.sql");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const REVISOR = id(3);
const TESTE = id(4);
const VENCIDO = id(5);
const PRO = id(6);
const ELITE = id(7);
const SEM_PLANO = id(10);
const PRO2 = id(20); // concorrência
const PRO3 = id(21); // extras
const PRO4 = id(22); // voz
const PRO5 = id(23); // avisos
const PENDENTE = id(24); // Pro com pagamento pendente que venceu há 1 hora
const RENOVA = id(25); // Pro que renova daqui a 2 dias
const TODOS = [ADMIN, REVISOR, TESTE, VENCIDO, PRO, ELITE, SEM_PLANO, PRO2, PRO3, PRO4, PRO5, PENDENTE, RENOVA];

let db: PGlite;

async function como<T = any>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async (sql: string, params: unknown[] = []) => (await q<{ r: any }>(sql, params))[0].r;
const sub = (uid: string, plan: string, status: string, trialEnd: string | null, periodEnd: string | null = null) =>
  db.query(`update public.subscriptions set plan = $2, status = $3, trial_ends_at = ${trialEnd ?? "null"}, current_period_end = ${periodEnd ?? "null"} where user_id = $1`, [uid, plan, status]);
const ligar = (on: boolean) => db.query(`update public.direitos_config set cadeados_ligados = $1`, [on]);
const reservar = (u: string, recurso: string, rid: string, limite: number | null = null, sessao: string | null = null) =>
  one(`select public.ch_worker_carteira_reservar($1, $2, $3, $4, $5) r`, [u, recurso, rid, sessao, limite]);
const confirmar = (u: string, rid: string, usd: number | null) => one(`select public.ch_worker_carteira_confirmar($1, $2, $3) r`, [u, rid, usd]);
const devolver = (u: string, rid: string) => one(`select public.ch_worker_carteira_devolver($1, $2) r`, [u, rid]);
const cart = async (u: string) => (await one(`select public.direitos_do_aluno($1) r`, [u])).creditos;
const sessao = async (u: string) =>
  one(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity) values ($1, 'livre', 't', (select id from public.tutor_personalities order by id limit 1), 3) returning id r`, [u]);
const zerarCarteira = async () => {
  await db.exec(`delete from public.carteira_movimentos; delete from public.carteira_extras; delete from public.carteira_avisos;`);
};

const ANTIGAS_MUDADAS = new Set(["tutor_entitlement", "direitos_do_aluno", "direitos_regra_atual"]);
let defAntes: Record<string, string> = {};
let entAntes: Record<string, any> = {};
let defTutorAntes = "";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f < NOME).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const uid of TODOS) await db.query(`insert into auth.users (id, email, raw_user_meta_data, created_at) values ($1, $2, '{}', now() - interval '20 days')`, [uid, `c${parseInt(uid.slice(-4))}@teste.dev`]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'clinica_medica')`, [REVISOR]);
  await sub(TESTE, "trial", "trialing", "now() + interval '3 days'");
  await sub(VENCIDO, "trial", "trialing", "now() - interval '1 day'");
  for (const u of [PRO, PRO2, PRO3, PRO4, PRO5]) await sub(u, "pro", "active", null, "now() + interval '20 days'");
  await sub(ELITE, "elite", "active", null, "now() + interval '20 days'");
  await sub(PENDENTE, "pro", "past_due", null, "now() - interval '1 hour'");
  await sub(RENOVA, "pro", "active", null, "now() + interval '2 days'");
  await db.query(`delete from public.subscriptions where user_id = $1`, [SEM_PLANO]);
  await db.exec(`update public.tutor_config set requires_pro = true, enabled = true, voice_enabled = true`);

  const defs = await q<{ nome: string; def: string }>(
    `select p.proname nome, pg_get_functiondef(p.oid) def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'`
  );
  defAntes = Object.fromEntries(defs.map((d) => [d.nome + ":" + d.def.split("\n")[0], d.def]));
  defTutorAntes = defs.find((d) => d.nome === "tutor_entitlement")!.def;
  for (const u of TODOS) entAntes[u] = await one(`select public.tutor_entitlement($1) r`, [u]);

  await db.exec(MIGRACAO);
}, 300_000);

describe("chave DESLIGADA: nada muda", () => {
  it("nenhuma função antiga mudou, exceto tutor_entitlement (agora porteiro) e as da 013640 deste ramo", async () => {
    const defs = await q<{ nome: string; def: string }>(
      `select p.proname nome, pg_get_functiondef(p.oid) def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'`
    );
    const depois = Object.fromEntries(defs.map((d) => [d.nome + ":" + d.def.split("\n")[0], d.def]));
    for (const [k, v] of Object.entries(defAntes)) {
      const nome = k.split(":")[0];
      if (ANTIGAS_MUDADAS.has(nome)) continue;
      expect(depois[k], k).toBe(v);
    }
  });
  it("a regra antiga do Tutor ficou guardada byte a byte (só o nome mudou)", async () => {
    const def = await one(`select pg_get_functiondef('public.tutor_entitlement_regra_antiga(uuid)'::regprocedure) r`);
    expect(def).toBe(defTutorAntes.replace("public.tutor_entitlement(", "public.tutor_entitlement_regra_antiga("));
  });
  it("tutor_entitlement responde exatamente igual para todos", async () => {
    for (const u of TODOS) expect(await one(`select public.tutor_entitlement($1) r`, [u]), u).toEqual(entAntes[u]);
  });
  it("Tutor por texto: a reserva antiga decide (mesma resposta e mesmo limite); a carteira só anota o custo real", async () => {
    await zerarCarteira();
    await db.exec(`update public.tutor_config set daily_message_limit = 2`);
    const s = await sessao(PRO);
    const a = await reservar(PRO, "tutor_texto", "req-sombra-1", null, s);
    expect(a.ok).toBe(true);
    expect(a.modo).toBe("sombra");
    expect(typeof a.reservation).toBe("number"); // a reserva antiga (ai_usage_ledger)
    expect((await q(`select interactions from public.ai_usage_ledger where id = $1`, [a.reservation]))[0].interactions).toBe(1);
    // US$ 0,021 × 5,08 = R$ 0,10668 → 1,0668 créditos → 1,1 (para cima)
    expect((await confirmar(PRO, "req-sombra-1", 0.021)).creditos).toBe(1.1);
    await reservar(PRO, "tutor_texto", "req-sombra-2", null, s);
    const c = await reservar(PRO, "tutor_texto", "req-sombra-3", null, s);
    expect(c.ok).toBe(false); // o limite ANTIGO (2 por dia) barrou, como hoje
    expect(c.reason).toBe("text_limit");
    expect(c.modo).toBe("sombra");
    // devolver a 2ª devolve também a reserva antiga
    await devolver(PRO, "req-sombra-2");
    const rel = await q(`select count(*)::int n from public.ai_usage_ledger where user_id = $1 and interactions = -1`, [PRO]);
    expect(rel[0].n).toBe(1);
    const mov = await q(`select request_id, modo, situacao, creditos from public.carteira_movimentos where user_id = $1 order by id`, [PRO]);
    expect(mov.map((m: any) => `${m.request_id}:${m.modo}:${m.situacao}`)).toEqual(["req-sombra-1:sombra:confirmado", "req-sombra-2:sombra:devolvido"]);
    await db.exec(`update public.tutor_config set daily_message_limit = 40`);
  });
  it("modo sombra anota 'teria barrado' sem barrar (sem créditos na regra nova)", async () => {
    await zerarCarteira();
    await db.exec(`update public.direitos_planos set creditos_dia = 1 where codigo = 'pro'`);
    const s = await sessao(PRO);
    await reservar(PRO, "tutor_texto", "req-tb-1", null, s);
    await confirmar(PRO, "req-tb-1", 0.05); // 2,6 créditos > 1 do dia
    const b = await reservar(PRO, "tutor_texto", "req-tb-2", null, s);
    expect(b.ok).toBe(true); // a regra antiga deixa
    expect((await q(`select teria_bloqueado, motivo_bloqueio from public.carteira_movimentos where request_id = 'req-tb-2'`))[0]).toEqual({ teria_bloqueado: true, motivo_bloqueio: "sem_creditos" });
    await devolver(PRO, "req-tb-2");
    await db.exec(`update public.direitos_planos set creditos_dia = 8 where codigo = 'pro'`);
  });
  it("dica: o teto por dia de hoje passa a ser contado no banco (devolvida não conta)", async () => {
    await zerarCarteira();
    expect((await reservar(PRO, "dica_questao", "dica-0001", 2)).ok).toBe(true);
    expect((await reservar(PRO, "dica_questao", "dica-0002", 2)).ok).toBe(true);
    await devolver(PRO, "dica-0002");
    expect((await reservar(PRO, "dica_questao", "dica-0003", 2)).ok).toBe(true);
    const r = await reservar(PRO, "dica_questao", "dica-0004", 2);
    expect(r).toMatchObject({ ok: false, reason: "hint_limit" });
  });
  it("extras e cortesias não valem com a chave desligada", async () => {
    await zerarCarteira();
    await db.query(`insert into public.carteira_extras (user_id, origem, creditos, valido_ate) values ($1, 'cortesia', 50, now() + interval '30 days')`, [PRO]);
    const r = await reservar(PRO, "dica_questao", "dica-x001", 15);
    expect(r.ok).toBe(true);
    await confirmar(PRO, "dica-x001", 0.01);
    expect((await q(`select creditos_usados from public.carteira_extras where user_id = $1`, [PRO]))[0].creditos_usados).toBe("0.0");
  });
});

describe("chave LIGADA: a carteira manda", () => {
  it("tutor_entitlement passa a contar créditos; equipe e revisor seguem com a regra antiga", async () => {
    await zerarCarteira();
    await ligar(true);
    const e = await one(`select public.tutor_entitlement($1) r`, [PRO]);
    expect(e.regra).toBe("carteira");
    expect(e.mode).toBe("paid");
    expect(e.text).toMatchObject({ unit: "creditos", limit: 8, month_limit: 180 });
    expect(e.can_text).toBe(true);
    expect(e.voice.remaining_s).toBe(600); // PRO: 10 min por mês
    const t = await one(`select public.tutor_entitlement($1) r`, [TESTE]);
    expect(t.mode).toBe("trial");
    expect(t.text.limit).toBe(5);
    const v = await one(`select public.tutor_entitlement($1) r`, [VENCIDO]);
    expect(v.mode).toBe("trial"); // vencido = amostra
    expect(v.can_text).toBe(true);
    for (const u of [ADMIN, REVISOR]) expect(await one(`select public.tutor_entitlement($1) r`, [u])).toEqual(entAntes[u]);
    // conta sem assinatura nenhuma: sem Tutor (texto E voz), mesmo com cortesia
    await db.query(`insert into public.carteira_extras (user_id, origem, creditos, voz_segundos, valido_ate) values ($1, 'cortesia', 50, 600, now() + interval '30 days')`, [SEM_PLANO]);
    const sp = await one(`select public.tutor_entitlement($1) r`, [SEM_PLANO]);
    expect(sp.mode).toBe("blocked");
    expect(sp.can_text).toBe(false);
    expect(sp.can_voice).toBe(false);
  });
  it("reservar → confirmar pelo custo real → franquia do dia; devolve o que a reserva pegou a mais", async () => {
    await zerarCarteira();
    const antigas = (await q(`select count(*)::int n from public.ai_usage_ledger where user_id = $1 and interactions = 1`, [PRO]))[0].n;
    const r = await reservar(PRO, "tutor_texto", "lig-0001");
    expect(r).toMatchObject({ ok: true, modo: "ligado", creditos_reservados: 3 });
    expect((await cart(PRO)).usado_dia).toBe(3);
    const c = await confirmar(PRO, "lig-0001", 0.021);
    expect(c.creditos).toBe(1.1);
    expect((await cart(PRO)).usado_dia).toBe(1.1);
    expect((await cart(PRO)).disponivel_franquia).toBe(6.9);
    // a reserva antiga do Tutor não é usada com a chave ligada
    expect((await q(`select count(*)::int n from public.ai_usage_ledger where user_id = $1 and interactions = 1`, [PRO]))[0].n).toBe(antigas);
  });
  it("custo desconhecido (provedor sem preço): cobra a reserva, nunca zero; e conta no teto do dia", async () => {
    await zerarCarteira();
    await reservar(PRO, "tutor_texto", "semcusto-01");
    expect((await confirmar(PRO, "semcusto-01", null)).creditos).toBe(3);
    expect(Number(await one(`select public.carteira_gasto_hoje_usd() r`))).toBeCloseTo((3 * 10) / 100 / 5.08, 4);
  });
  it("IA falhou: devolver devolve tudo; devolver de novo não dá crédito a mais; confirmar depois não cobra", async () => {
    await zerarCarteira();
    await reservar(PRO, "tutor_texto", "lig-0002");
    expect((await devolver(PRO, "lig-0002")).situacao).toBe("devolvido");
    expect((await devolver(PRO, "lig-0002")).repetido).toBe(true);
    expect((await confirmar(PRO, "lig-0002", 0.5)).ok).toBe(false);
    expect((await cart(PRO)).usado_dia).toBe(0);
  });
  it("idempotência: o mesmo request_id não reserva nem confirma duas vezes", async () => {
    await zerarCarteira();
    const a = await reservar(PRO, "tutor_texto", "lig-0003");
    const b = await reservar(PRO, "tutor_texto", "lig-0003");
    expect(a.ok && b.ok).toBe(true);
    expect(b.repetido).toBe(true);
    await confirmar(PRO, "lig-0003", 0.021);
    expect((await confirmar(PRO, "lig-0003", 0.9)).repetido).toBe(true);
    expect((await cart(PRO)).usado_dia).toBe(1.1);
    expect((await q(`select count(*)::int n from public.carteira_movimentos where user_id = $1`, [PRO]))[0].n).toBe(1);
  });
  it("20 pedidos ao mesmo tempo com 1 crédito sobrando: só 1 passa", async () => {
    await zerarCarteira();
    await db.exec(`update public.direitos_planos set creditos_dia = 1 where codigo = 'pro'`);
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => reservar(PRO2, "tutor_texto", `conc-${String(i).padStart(4, "0")}`)));
    expect(rs.filter((r) => r.ok).length).toBe(1);
    expect(rs.filter((r) => !r.ok).every((r) => r.reason === "sem_creditos" && /acabaram/.test(r.mensagem))).toBe(true);
    expect((await cart(PRO2)).usado_dia).toBe(1);
    await db.exec(`update public.direitos_planos set creditos_dia = 8 where codigo = 'pro'`);
  });
  it("franquia primeiro, depois o EXTRA MAIS ANTIGO; extra vencido ou cancelado não vale; custo além do saldo vira excedente", async () => {
    await zerarCarteira();
    await db.exec(`update public.direitos_planos set creditos_dia = 2 where codigo = 'pro'`);
    await db.query(`insert into public.carteira_extras (user_id, origem, creditos, valido_de, valido_ate, criado_em) values
      ($1, 'cortesia', 100, now() - interval '40 days', now() - interval '10 days', now() - interval '40 days'),
      ($1, 'compra', 3, now() - interval '5 days', now() + interval '25 days', now() - interval '5 days'),
      ($1, 'compra', 10, now() - interval '1 day', now() + interval '29 days', now() - interval '1 day')`, [PRO3]);
    await db.query(`insert into public.carteira_extras (user_id, origem, creditos, valido_ate, cancelado_em) values ($1, 'cortesia', 500, now() + interval '9 days', now())`, [PRO3]);
    expect((await cart(PRO3)).disponivel).toBe(15); // 2 da franquia + 3 + 10 (vencido e cancelado fora)
    await reservar(PRO3, "tutor_texto", "ext-0001"); // reserva 3: 2 da franquia + 1 do extra mais antigo
    await confirmar(PRO3, "ext-0001", 0.021 * 4); // 4,3 créditos reais
    const ex = await q(`select creditos, creditos_usados from public.carteira_extras where user_id = $1 and valido_ate > now() and cancelado_em is null order by criado_em`, [PRO3]);
    expect(ex.map((e: any) => e.creditos_usados)).toEqual(["2.3", "0.0"]);
    await reservar(PRO3, "tutor_texto", "ext-0002");
    await confirmar(PRO3, "ext-0002", 1); // 50,8 créditos: o saldo (0,7 + 10) cobre só 10,7
    const m = await q(`select creditos, excedente from public.carteira_movimentos where request_id = 'ext-0002'`);
    expect(m[0]).toEqual({ creditos: "10.7", excedente: "40.1" });
    expect((await cart(PRO3)).disponivel).toBe(0);
    expect((await reservar(PRO3, "tutor_texto", "ext-0003")).reason).toBe("sem_creditos");
    await db.exec(`update public.direitos_planos set creditos_dia = 8 where codigo = 'pro'`);
  });
  it("limite do MÊS também vale", async () => {
    await zerarCarteira();
    await db.exec(`update public.direitos_planos set creditos_mes = 10 where codigo = 'pro'`);
    await db.query(`insert into public.carteira_movimentos (user_id, request_id, recurso, modo, situacao, dia, creditos, creditos_franquia)
                    values ($1, 'antigo-0001', 'tutor_texto', 'ligado', 'confirmado', (now() at time zone 'America/Sao_Paulo')::date - 0, 10, 10)`, [PRO]);
    const r = await reservar(PRO, "tutor_texto", "mes-0001");
    expect(r.reason).toBe("sem_creditos");
    expect(r.mensagem).toMatch(/deste mês/);
    await db.exec(`update public.direitos_planos set creditos_mes = 180 where codigo = 'pro'`);
  });
  it("avisos de 80/90/100% saem uma vez só por período", async () => {
    await zerarCarteira();
    await db.exec(`update public.direitos_planos set creditos_dia = 10 where codigo = 'pro'`);
    for (const [rid, usd] of [["aviso-0001", 0.16], ["aviso-0002", 0.02], ["aviso-0003", 0.02], ["aviso-0004", 0.02]] as const) {
      await reservar(PRO5, "tutor_texto", rid);
      await confirmar(PRO5, rid, usd);
    }
    const av = await q(`select tipo, nivel from public.carteira_avisos where user_id = $1 order by tipo, nivel`, [PRO5]);
    expect(av.filter((a: any) => a.tipo === "creditos_dia").map((a: any) => a.nivel)).toEqual([80, 90, 100]);
    const meus = await como(PRO5, `select public.app_minha_carteira() r`);
    expect(meus[0].r.avisos.length).toBe(3);
    await como(PRO5, `select public.app_carteira_avisos_vistos($1::bigint[]) r`, [meus[0].r.avisos.map((a: any) => a.id)]);
    expect((await como(PRO5, `select public.app_minha_carteira() r`))[0].r.avisos.length).toBe(0);
    await db.exec(`update public.direitos_planos set creditos_dia = 8 where codigo = 'pro'`);
  });
  it("teto global do dia barra todos os alunos (a equipe não)", async () => {
    await zerarCarteira();
    await db.exec(`update public.direitos_config set teto_custo_dia_usd = 0.05`);
    await reservar(PRO, "tutor_texto", "teto-0001");
    await confirmar(PRO, "teto-0001", 0.06);
    const r = await reservar(ELITE, "tutor_texto", "teto-0002");
    expect(r).toMatchObject({ ok: false, reason: "teto_global" });
    expect((await reservar(ADMIN, "tutor_texto", "teto-0003")).ok).toBe(true);
    await db.exec(`update public.direitos_config set teto_custo_dia_usd = 20`);
  });
  it("recurso trancado pela fase é recusado (PRO não usa a correção de estação; 2ª fase fechada)", async () => {
    await zerarCarteira();
    const r = await reservar(PRO, "correcao_estacao_ia", "est-0001");
    expect(r).toMatchObject({ ok: false, reason: "trancado" });
  });
  it("voz: o que passa da franquia do mês sai do extra de voz (e o saldo de voz conta franquia + extra)", async () => {
    await zerarCarteira();
    await db.query(`insert into public.carteira_extras (user_id, origem, creditos, voz_segundos, valido_ate) values ($1, 'compra', 0, 600, now() + interval '30 days')`, [PRO4]);
    expect((await one(`select public.tutor_entitlement($1) r`, [PRO4])).voice.remaining_s).toBe(1200);
    const s = await sessao(PRO4);
    const call = await one(`insert into public.tutor_voice_calls (user_id, session_id, lease_until, provider) values ($1, $2, now() + interval '60 seconds', 'gemini') returning id r`, [PRO4, s]);
    await db.query(`update public.tutor_voice_calls set status = 'ended', ended_at = now(), consumed_seconds = 700 where id = $1`, [call]);
    expect((await q(`select voz_usados_s from public.carteira_extras where user_id = $1`, [PRO4]))[0].voz_usados_s).toBe(100);
    expect((await one(`select public.tutor_entitlement($1) r`, [PRO4])).voice.remaining_s).toBe(500);
    // fechar de novo (outra atualização) não gasta de novo
    await db.query(`update public.tutor_voice_calls set termination_reason = 'student' where id = $1`, [call]);
    expect((await q(`select voz_usados_s from public.carteira_extras where user_id = $1`, [PRO4]))[0].voz_usados_s).toBe(100);
    const av = await q(`select nivel from public.carteira_avisos where user_id = $1 and tipo = 'voz' order by nivel`, [PRO4]);
    expect(av.map((a: any) => a.nivel)).toEqual([80, 90, 100]);
  });
  it("SEM tolerância na regra nova: pagamento não confirmado no dia da renovação = amostra na hora (a regra antiga segue com 3 dias)", async () => {
    const d = await one(`select public.direitos_do_aluno($1) r`, [PENDENTE]);
    expect(d.perfil).toBe("vencido");
    expect(d.fases.teoria.motivo).toBe("pagamento_nao_confirmado");
    expect((await one(`select public.tutor_entitlement($1) r`, [PENDENTE])).mode).toBe("trial"); // amostra
    expect((await one(`select public.tutor_entitlement_regra_antiga($1) r`, [PENDENTE])).mode).toBe("paid"); // regra antiga intacta
  });
  it("avisos de renovação 7, 3 e 1 dia antes: uma vez só", async () => {
    expect(await one(`select public.ch_worker_avisos_renovacao() r`)).toBeGreaterThanOrEqual(2);
    expect(await one(`select public.ch_worker_avisos_renovacao() r`)).toBe(0);
    const av = await q(`select nivel from public.carteira_avisos where user_id = $1 and tipo = 'renovacao' order by nivel`, [RENOVA]);
    expect(av.map((a: any) => a.nivel)).toEqual([3, 7]);
  });
  it("saldo do Início (app_my_entitlements().saldo) lê a carteira", async () => {
    await zerarCarteira();
    await reservar(PRO, "tutor_texto", "ini-0001");
    await confirmar(PRO, "ini-0001", 0.021);
    const [r] = await como(PRO, `select public.app_my_entitlements() r`);
    expect(r.r.saldo).toMatchObject({ fonte: "creditos", creditos_hoje: 6.9, creditos_limite_hoje: 8, voz_limite_s: 600, voz_periodo: "mes" });
    await ligar(false);
    const [s] = await como(PRO, `select public.app_my_entitlements() r`);
    expect(s.r.saldo.fonte).toBe("tutor_atual");
  });
});

describe("segurança", () => {
  it("aluno não grava na carteira nem chama funções do servidor ou da equipe; visitante barrado", async () => {
    await expect(como(PRO, `insert into public.carteira_extras (user_id, origem, creditos, valido_ate) values ($1, 'cortesia', 999, now() + interval '1 day')`, [PRO])).rejects.toThrow();
    await expect(como(PRO, `update public.carteira_movimentos set creditos = 0 where user_id = $1`, [PRO])).rejects.toThrow();
    await expect(como(PRO, `update public.carteira_extras set creditos_usados = 0`)).rejects.toThrow();
    await expect(como(PRO, `delete from public.carteira_avisos`)).rejects.toThrow();
    await expect(como(PRO, `update public.direitos_planos set creditos_dia = 999`)).rejects.toThrow();
    for (const sql of [
      `select public.ch_worker_carteira_reservar('${PRO}', 'tutor_texto', 'hack-0001')`,
      `select public.ch_worker_carteira_confirmar('${PRO}', 'hack-0001', 0)`,
      `select public.ch_worker_carteira_devolver('${PRO}', 'hack-0001')`,
      `select public.carteira_alocar('${PRO}', 1, 1)`,
      `select public.tutor_entitlement('${PRO}')`,
      `select public.tutor_entitlement_regra_antiga('${PRO}')`,
      `select public.carteira_calcular_devolucao_plano('mensal', 100, now(), now())`,
    ]) await expect(como(PRO, sql), sql).rejects.toThrow();
    await expect(como(PRO, `select public.app_admin_carteira()`)).rejects.toThrow();
    await expect(como(PRO, `select public.app_admin_carteira_cortesia($1, 100, 0, 30, 'eu mesmo')`, [`c6@teste.dev`])).rejects.toThrow();
    await expect(como(null, `select public.app_minha_carteira()`)).rejects.toThrow();
    await expect(como(null, `select * from public.carteira_movimentos`)).rejects.toThrow();
    // o aluno não lê o custo em dólar nem o motivo/autor da cortesia
    await expect(como(PRO, `select custo_usd from public.carteira_movimentos`)).rejects.toThrow();
    await expect(como(PRO, `select motivo, dado_por from public.carteira_extras`)).rejects.toThrow();
    expect((await como(PRO, `select recurso, creditos from public.carteira_movimentos limit 1`)).length).toBeGreaterThanOrEqual(0);
    // o aluno só lê o que é dele
    const outros = await como(PRO, `select count(*)::int n from public.carteira_movimentos where user_id <> $1`, [PRO]);
    expect(outros[0].n).toBe(0);
  });
  it("cortesia: só administrador, com motivo, validade e registro de ações; cancelar também registra", async () => {
    await zerarCarteira();
    const [r] = await como(ADMIN, `select public.app_admin_carteira_cortesia($1, 25, 5, 30, 'Compensação de falha') r`, [`c6@teste.dev`]);
    expect(r.r.extras[0]).toMatchObject({ origem: "cortesia", creditos: 25, voz_minutos: 5 });
    await expect(como(ADMIN, `select public.app_admin_carteira_cortesia($1, 25, 5, 30, '')`, [`c6@teste.dev`])).rejects.toThrow(/motivo/);
    const log = await q(`select action, target from public.admin_audit_log where action like 'carteira.%' order by id`);
    expect(log.at(-1)).toEqual({ action: "carteira.cortesia", target: PRO });
    await como(ADMIN, `select public.app_admin_carteira_cortesia_cancelar($1, 'dado por engano')`, [r.r.extras[0].id]);
    expect((await q(`select action from public.admin_audit_log order by id desc limit 1`))[0].action).toBe("carteira.cortesia_cancelada");
    const [painel] = await como(ADMIN, `select public.app_admin_carteira() r`);
    expect(painel.r).toHaveProperty("resumo.hoje");
    expect(painel.r.cortesias_recentes.length).toBe(1);
    expect(painel.r.planos_a_venda.map((p: any) => `${p.codigo}:${p.vale_agora}`)).toEqual(["pro:true", "pratica:false", "elite:false"]);
  });
  it("ofertas: até a 2ª fase abrir, só o PRO está à venda; PRÁTICA e ELITE aparecem 'em breve'", async () => {
    const d = await one(`select public.direitos_do_aluno($1) r`, [SEM_PLANO]);
    const ofertas = d.recursos.questoes.ofertas.filter((o: any) => o.tipo === "assinar");
    expect(ofertas.map((o: any) => `${o.plano}:${o.a_venda}:${o.em_breve}`)).toEqual(["pro:true:false", "elite:false:true"]);
    const est = d.recursos.estacoes.ofertas; // 2ª fase fechada: sem ofertas
    expect(est).toEqual([]);
  });
});

describe("devolução (só cálculo; regra final do dono, 17/10 noite)", () => {
  const plano = (ciclo: string, preco: number, dias: number, ant = 0) =>
    one(`select public.carteira_calcular_devolucao_plano($1, $2, now() - make_interval(days => $3), now(), $4) r`, [ciclo, preco, dias, ant]);
  it("PRO trimestral R$ 269,70: no 2º mês = R$ 80,91; no 1º mês (depois de 7 dias) = R$ 161,82", async () => {
    expect((await plano("trimestral", 26970, 40)).valor_centavos).toBe(8091);
    expect((await plano("trimestral", 26970, 10)).valor_centavos).toBe(16182);
    expect((await plano("trimestral", 26970, 70)).valor_centavos).toBe(0); // 3º mês: nada a devolver
  });
  it("em até 7 dias: tudo de volta; mensal depois de 7 dias: nada", async () => {
    expect(await plano("mensal", 9990, 3)).toMatchObject({ regra: "integral_7_dias", valor_centavos: 9990, automatica: true });
    expect((await plano("mensal", 9990, 8)).valor_centavos).toBe(0);
  });
  it("IA Boost R$ 24,90 com 50 de 100 créditos usados (depois de 7 dias) = R$ 11,21; em 7 dias = tudo", async () => {
    const e = await one(`select public.carteira_calcular_devolucao_extra(2490, 100, 50, now() - interval '10 days', now()) r`);
    expect(e.valor_centavos).toBe(1121);
    const i = await one(`select public.carteira_calcular_devolucao_extra(2490, 100, 100, now() - interval '2 days', now()) r`);
    expect(i.valor_centavos).toBe(2490);
  });
  it("abuso (devoluções em 7 dias repetidas): a devolução automática para", async () => {
    expect(await plano("mensal", 9990, 2, 2)).toMatchObject({ regra: "integral_7_dias", abuso: true, automatica: false });
  });
});

describe("modo sombra não derruba a mensagem do Tutor (revisão do Pacote 1, M3)", () => {
  it("se o cálculo da regra nova falhar, a reserva segue pela regra de hoje e o movimento fica marcado; com a chave ligada, o erro sobe", async () => {
    await zerarCarteira();
    await ligar(false);
    const original = await one(`select pg_get_functiondef('public.direitos_do_aluno(uuid)'::regprocedure) r`);
    await db.exec(`create or replace function public.direitos_do_aluno(p_user uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $f$ begin raise exception 'quebrada de propósito'; end $f$;`);
    try {
      const s = await sessao(PRO);
      const r = await reservar(PRO, "tutor_texto", "m3-sombra-01", null, s);
      expect(r).toMatchObject({ ok: true, modo: "sombra" });
      expect(typeof r.reservation).toBe("number"); // a reserva antiga do Tutor decidiu, como hoje
      const mov = await q(`select modo, situacao, motivo_bloqueio, teria_bloqueado from public.carteira_movimentos where request_id = 'm3-sombra-01'`);
      expect(mov).toEqual([{ modo: "sombra", situacao: "reservado", motivo_bloqueio: "erro_sombra", teria_bloqueado: false }]);
      await devolver(PRO, "m3-sombra-01");
      await ligar(true);
      await expect(reservar(PRO, "tutor_texto", "m3-ligado-01")).rejects.toThrow(/quebrada de propósito/);
    } finally {
      await db.exec(original);
      await ligar(false);
    }
  });
});


describe("colar de novo e desfazer", () => {
  it("colar de novo não estraga nada (não renomeia o porteiro, não apaga o que o dono editou)", async () => {
    await db.exec(`update public.direitos_config set cotacao_dolar = 5.4`);
    await db.exec(MIGRACAO);
    expect((await q(`select cotacao_dolar from public.direitos_config`))[0].cotacao_dolar).toBe("5.4000");
    const def = await one(`select pg_get_functiondef('public.tutor_entitlement_regra_antiga(uuid)'::regprocedure) r`);
    expect(def).toBe(defTutorAntes.replace("public.tutor_entitlement(", "public.tutor_entitlement_regra_antiga("));
    await ligar(false);
    for (const u of TODOS) expect(await one(`select public.tutor_entitlement($1) r`, [u]), u).toEqual(await one(`select public.tutor_entitlement_regra_antiga($1) r`, [u]));
  });
  it("o SQL de conferência responde OK", async () => {
    const r = await q(fs.readFileSync(path.join(ROOT, "supabase/conferir/carteira-creditos.sql"), "utf8"));
    expect(r[0].resultado).toMatch(/^OK: carteira no banco, em modo sombra/);
  });
  it("desfazer volta a regra antiga do Tutor com o nome de sempre", async () => {
    const antes: Record<string, any> = {};
    for (const u of TODOS) antes[u] = await one(`select public.tutor_entitlement_regra_antiga($1) r`, [u]);
    await db.exec(fs.readFileSync(DESFAZER_ARQ, "utf8"));
    const def = await one(`select pg_get_functiondef('public.tutor_entitlement(uuid)'::regprocedure) r`);
    expect(def).toBe(defTutorAntes);
    expect((await q(`select to_regclass('public.carteira_movimentos') t`))[0].t).toBeNull();
    for (const u of TODOS) expect(await one(`select public.tutor_entitlement($1) r`, [u]), u).toEqual(antes[u]);
    // a regra da etapa 1 continua funcionando
    expect((await one(`select public.direitos_do_aluno($1) r`, [PRO])).perfil).toBe("pro");
  });
});
