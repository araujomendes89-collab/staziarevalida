// @vitest-environment node
/**
 * Planos · ETAPA 1 (decisões do dono de 2026-10-17) no banco: supabase/migrations/20261003013640_direitos_por_fase.sql.
 * "Direitos do aluno" POR FASE (teoria = 1ª fase; prática = 2ª fase), em MODO SOMBRA: a regra nova só informa.
 * Confere: conversão dos alunos atuais, cada combinação (teste teoria, teste prática, as duas, PRO, PRÁTICA, ELITE, vencido,
 * sem plano, equipe, revisor), só um teste por conta (e por telefone), aluno não muda o próprio plano/fase, visitante barrado,
 * NENHUMA regra antiga muda (funções antigas comparadas antes/depois, com a chave desligada e ligada), saldo vigente do Início,
 * painel da Administração com registro, diagnóstico de um aluno, colar de novo (idempotente) e desfazer.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const NOME = "20261003013640_direitos_por_fase.sql";
const MIGRACAO = fs.readFileSync(path.join(MIGRATIONS, NOME), "utf8");
const DESFAZER = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013640_direitos_por_fase.desfazer.sql"), "utf8");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const EDITOR = id(2);
const REVISOR = id(3);
const TESTE = id(4); // teste grátis dentro do prazo
const VENCIDO = id(5); // teste grátis que acabou
const PRO = id(6);
const ELITE = id(7);
const PRO_CANCELADO = id(8);
const SEM_TESTE = id(9); // cadastro sem teste (PL06): trial · expirado · sem data
const SEM_PLANO = id(10); // sem linha de assinatura
const DUAS = id(11); // vai escolher "as duas"
const SO_PRATICA = id(12); // vai escolher só a 2ª fase
const TEL_A = id(13); // teste com um WhatsApp
const TEL_B = id(14); // outra conta, mesmo WhatsApp, teste depois
const PENDENTE = id(15); // Pro com pagamento pendente (vence há 1 dia: ainda vale pelos 3 dias)
const PRATICA = id(16); // PRÁTICA (dada direto nas tabelas novas: o modelo antigo não tem esse plano)
const TODOS = [ADMIN, EDITOR, REVISOR, TESTE, VENCIDO, PRO, ELITE, PRO_CANCELADO, SEM_TESTE, SEM_PLANO, DUAS, SO_PRATICA, TEL_A, TEL_B, PENDENTE, PRATICA];

let db: PGlite;

async function como<T = any>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  const rows = await como<{ r: T }>(
    uid,
    `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`,
    keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]))
  );
  return rows[0].r;
}
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const direitos = async (uid: string) => (await q<{ d: any }>(`select public.direitos_do_aluno($1) d`, [uid]))[0].d;
const sub = (uid: string, plan: string, status: string, trialEnd: string | null, periodEnd: string | null = null) =>
  db.query(`update public.subscriptions set plan = $2, status = $3, trial_ends_at = ${trialEnd ?? "null"}, current_period_end = ${periodEnd ?? "null"} where user_id = $1`, [uid, plan, status]);
const abrirFase2 = (aberta: boolean) => db.query(`update public.direitos_config set fase2_aberta_alunos = $1`, [aberta]);

/** Retrato das regras ANTIGAS: definição de cada função antiga, gatilhos e políticas antigas, e o que cada função antiga responde. */
async function retratoAntigo(novas: Set<string>) {
  const funcoes = await q<{ nome: string; def: string }>(
    `select p.oid::regprocedure::text nome, pg_get_functiondef(p.oid) def from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1`
  );
  const gatilhos = await q(`select tgrelid::regclass::text t, tgname, pg_get_triggerdef(oid) d from pg_trigger where not tgisinternal and tgname <> 'direitos_por_fase_sincronia' order by 1, 2`);
  const politicas = await q(`select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies where tablename not in ('aluno_fases', 'aluno_testes') order by 2, 3`);
  const respostas: Record<string, any> = {};
  for (const uid of TODOS) {
    const [r] = await q(
      `select public.user_plan_lock($1) lock, public.tutor_entitlement($1) - 'trial' tutor, public.user_without_paid_access($1) sem_pago,
              public.user_has_full_access($1) completo,
              (select public.subscription_is_paid(s.plan, s.status, s.current_period_end) from public.subscriptions s where s.user_id = $1) pago`,
      [uid]
    );
    const [eu] = await como(uid, `select public.app_my_access() acesso, public.simulado_gate() gate, public.has_pro() pro`);
    respostas[uid] = { ...r, ...eu };
  }
  return {
    funcoes: Object.fromEntries(funcoes.filter((f) => !novas.has(f.nome.split("(")[0])).map((f) => [f.nome, f.def])),
    gatilhos,
    politicas,
    respostas,
    assinaturas: await q(`select * from public.subscriptions order by user_id`),
  };
}
const NOVAS = new Set(
  [
    "direitos_sincronizar_assinatura", "direitos_assinatura_gatilho", "direitos_teste_repetido", "direitos_cadeados_ligados", "direitos_do_aluno",
    "user_has_access", "app_my_entitlements", "app_escolher_teste", "direitos_regra_atual", "app_admin_direitos", "app_admin_direitos_salvar",
    "app_admin_direitos_aluno",
  ].map((n) => `public.${n}`).concat(["direitos_sincronizar_assinatura", "direitos_assinatura_gatilho", "direitos_teste_repetido", "direitos_cadeados_ligados", "direitos_do_aluno", "user_has_access", "app_my_entitlements", "app_escolher_teste", "direitos_regra_atual", "app_admin_direitos", "app_admin_direitos_salvar", "app_admin_direitos_aluno"])
);

let antes: Awaited<ReturnType<typeof retratoAntigo>>;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f < NOME).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const uid of TODOS) await db.query(`insert into auth.users (id, email, raw_user_meta_data, created_at) values ($1, $2, '{}', now() - interval '20 days')`, [uid, `u${parseInt(uid.slice(-4))}@teste.dev`]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'clinica_medica')`, [REVISOR]);
  await sub(TESTE, "trial", "trialing", "now() + interval '3 days'");
  await sub(DUAS, "trial", "trialing", "now() + interval '4 days'");
  await sub(SO_PRATICA, "trial", "trialing", "now() + interval '4 days'");
  await sub(TEL_A, "trial", "trialing", "now() + interval '2 days'");
  await sub(TEL_B, "trial", "trialing", "now() + interval '5 days'");
  await db.query(`update auth.users set created_at = now() - interval '1 day' where id = $1`, [TEL_B]);
  await db.query(`update public.profiles set phone = '+5541999990000' where id in ($1, $2)`, [TEL_A, TEL_B]);
  await sub(VENCIDO, "trial", "trialing", "now() - interval '1 day'");
  await sub(PRO, "pro", "active", null, "now() + interval '20 days'");
  await sub(ELITE, "elite", "active", null, "now() + interval '20 days'");
  await sub(PRO_CANCELADO, "pro", "canceled", null, "now() - interval '2 days'");
  await sub(PENDENTE, "pro", "past_due", null, "now() - interval '1 day'");
  await sub(SEM_TESTE, "trial", "expired", null);
  await sub(PRATICA, "trial", "trialing", "now() - interval '10 days'");
  await db.query(`delete from public.subscriptions where user_id = $1`, [SEM_PLANO]);
  await db.exec(`update public.tutor_config set requires_pro = true, enabled = true`);

  antes = await retratoAntigo(NOVAS);
  await db.exec(MIGRACAO);
}, 300_000);

describe("conversão dos alunos atuais (nada antigo muda)", () => {
  it("teste → teste da teoria; Pro → teoria paga; Elite → as duas; cancelado/sem teste → teoria cancelada; sem assinatura → nada", async () => {
    const fases = await q<any>(`select user_id, fase, situacao, plano, origem, fim from public.aluno_fases order by user_id, fase`);
    const de = (u: string) => fases.filter((f) => f.user_id === u).map((f) => `${f.fase}:${f.situacao}:${f.plano ?? "-"}`);
    expect(de(TESTE)).toEqual(["teoria:teste:-"]);
    expect(de(VENCIDO)).toEqual(["teoria:teste:-"]); // gravada como teste; "vencida" é calculada (fim no passado)
    expect(de(PRO)).toEqual(["teoria:paga:pro"]);
    expect(de(ELITE)).toEqual(["pratica:paga:elite", "teoria:paga:elite"]);
    expect(de(PRO_CANCELADO)).toEqual(["teoria:cancelada:pro"]);
    expect(de(PENDENTE)).toEqual(["teoria:pagamento_pendente:pro"]);
    expect(de(SEM_TESTE)).toEqual(["teoria:cancelada:-"]);
    expect(de(SEM_PLANO)).toEqual([]);
    expect(fases.every((f) => f.origem === "assinatura")).toBe(true);
    const [t] = await q(`select s.trial_ends_at = f.fim igual from public.subscriptions s join public.aluno_fases f on f.user_id = s.user_id and f.fase = 'teoria' where s.user_id = $1`, [TESTE]);
    expect(t.igual).toBe(true);
  });

  it("o teste do cadastro fica registrado (um por conta); Pro e Elite ficam com o teste marcado como já usado", async () => {
    const testes = await q<any>(`select user_id, origem, escolha from public.aluno_testes order by user_id`);
    const origem = Object.fromEntries(testes.map((t) => [t.user_id, t.origem]));
    expect(origem[TESTE]).toBe("cadastro");
    expect(origem[VENCIDO]).toBe("cadastro");
    expect(origem[PRO]).toBe("conversao");
    expect(origem[ELITE]).toBe("conversao");
    expect(origem[SEM_TESTE]).toBeUndefined();
    expect(origem[SEM_PLANO]).toBeUndefined();
    expect(testes.every((t) => t.escolha === "teoria")).toBe(true);
  });

  it("assinaturas ficaram idênticas", async () => {
    expect(await q(`select * from public.subscriptions order by user_id`)).toEqual(antes.assinaturas);
  });
});

describe("MODO SOMBRA: nenhuma regra antiga muda", () => {
  it("nenhuma função antiga foi recriada ou alterada; gatilhos e regras de acesso antigos iguais; as respostas antigas iguais", async () => {
    const depois = await retratoAntigo(NOVAS);
    expect(Object.keys(depois.funcoes).sort()).toEqual(Object.keys(antes.funcoes).sort());
    for (const [nome, def] of Object.entries(antes.funcoes)) expect(depois.funcoes[nome], nome).toBe(def);
    expect(depois.gatilhos).toEqual(antes.gatilhos);
    expect(depois.politicas).toEqual(antes.politicas);
    expect(depois.respostas).toEqual(antes.respostas);
  });

  it("a chave nasce desligada e, mesmo LIGADA, as funções antigas respondem igual (só as próximas etapas vão obedecer a ela)", async () => {
    expect((await q(`select cadeados_ligados, fase2_aberta_alunos from public.direitos_config`))[0]).toEqual({ cadeados_ligados: false, fase2_aberta_alunos: false });
    expect((await direitos(TESTE)).modo).toBe("sombra");
    await db.query(`update public.direitos_config set cadeados_ligados = true, fase2_aberta_alunos = true`);
    const ligado = await retratoAntigo(NOVAS);
    expect(ligado.respostas).toEqual(antes.respostas);
    expect((await direitos(TESTE)).modo).toBe("ligado");
    await db.query(`update public.direitos_config set cadeados_ligados = false, fase2_aberta_alunos = false`);
  });
});

describe("a regra nova, combinação por combinação", () => {
  it("teste da teoria: amostra por dia (20 questões, 1 simulado, flashcards do dia, 3 Temas, 5 créditos, 2 min de voz no total)", async () => {
    const d = await direitos(TESTE);
    expect(d.perfil).toBe("teste");
    expect(d.fases.teoria.situacao).toBe("teste");
    expect(d.recursos.questoes).toMatchObject({ acesso: "amostra", amostra: { modo: "por_dia", limite: 20 } });
    expect(d.recursos.simulados_teoricos).toMatchObject({ acesso: "amostra", amostra: { limite: 1 } });
    expect(d.recursos.flashcards).toMatchObject({ acesso: "amostra", amostra: { modo: "do_dia" } });
    expect(d.recursos.aulas_temas).toMatchObject({ acesso: "amostra", amostra: { limite: 3 } });
    expect(d.recursos.tutor_texto).toMatchObject({ acesso: "amostra", amostra: { modo: "creditos", limite: 5 } });
    expect(d.recursos.grupo_teorico).toMatchObject({ acesso: "trancado", motivo: "fora_da_amostra" });
    expect(d.recursos.estacoes).toMatchObject({ acesso: "trancado", motivo: "fase2_fechada", ofertas: [] });
    expect(d.creditos).toMatchObject({ franquia_dia: 5, franquia_mes: null, usados_hoje: 0, saldo_hoje: 5 });
    expect(d.voz).toMatchObject({ periodo: "teste_total", limite_s: 120 });
    // só um teste: quem está em teste não recebe convite para outro teste, só para assinar
    expect(d.recursos.grupo_teorico.ofertas.map((o: any) => o.tipo)).not.toContain("testar");
    expect(d.recursos.grupo_teorico.ofertas.map((o: any) => o.plano)).toEqual(["pro", "elite"]);
    expect(JSON.stringify(d)).not.toMatch(/preco|9990|19990/); // nunca mostra preço
  });

  it("PRO: teoria liberada; prática trancada (2ª fase fechada; aberta: convite para PRÁTICA ou ELITE, sem teste); 8/dia até 180/mês, 10 min", async () => {
    let d = await direitos(PRO);
    expect(d.perfil).toBe("pro");
    for (const r of ["questoes", "simulados_teoricos", "flashcards", "aulas_temas", "mapas", "tutor_texto", "dica_questao"]) expect(d.recursos[r].acesso, r).toBe("liberado");
    expect(d.recursos.estacoes.motivo).toBe("fase2_fechada");
    expect(d.creditos).toMatchObject({ franquia_dia: 8, franquia_mes: 180 });
    expect(d.voz).toMatchObject({ periodo: "mes", limite_s: 600 });
    await abrirFase2(true);
    d = await direitos(PRO);
    for (const r of ["estacoes", "checklists", "simulados_praticos", "treino_dupla", "grupo_pratico"]) {
      expect(d.recursos[r], r).toMatchObject({ acesso: "trancado", motivo: "fase_nao_incluida" });
      expect(d.recursos[r].ofertas).toEqual([{ tipo: "assinar", plano: "pratica", nome: "PRÁTICA" }, { tipo: "assinar", plano: "elite", nome: "ELITE" }]);
    }
    await abrirFase2(false);
  });

  it("ELITE: sem cadeado (com a 2ª fase aberta); 20/dia até 450/mês, 40 min", async () => {
    await abrirFase2(true);
    const d = await direitos(ELITE);
    expect(d.perfil).toBe("elite");
    expect(Object.values(d.recursos).every((r: any) => r.acesso === "liberado")).toBe(true);
    expect(d.creditos).toMatchObject({ franquia_dia: 20, franquia_mes: 450 });
    expect(d.voz.limite_s).toBe(2400);
    await abrirFase2(false);
  });

  it("PRÁTICA: tranca só questões teóricas, simulados Revalida/ENAMED, flashcards e grupo teórico; mantém Aulas, Temas, Mapas, Podcasts e Atualizações", async () => {
    await abrirFase2(true);
    await db.query(`insert into public.aluno_fases (user_id, fase, situacao, plano, fim, origem) values ($1, 'pratica', 'paga', 'pratica', now() + interval '30 days', 'equipe')`, [PRATICA]);
    const d = await direitos(PRATICA);
    expect(d.perfil).toBe("pratica");
    for (const r of ["questoes", "simulados_teoricos", "flashcards", "grupo_teorico"]) {
      expect(d.recursos[r], r).toMatchObject({ acesso: "trancado" }); // o teste antigo dele acabou: fora do plano, não amostra
      expect(d.recursos[r].ofertas.map((o: any) => o.plano)).toEqual(["pro", "elite"]);
    }
    expect(d.fases.teoria).toMatchObject({ situacao: "sem_acesso", motivo: "fora_do_plano" });
    for (const r of ["aulas_temas", "mapas", "podcasts", "atualizacoes", "estacoes", "checklists", "treino_dupla", "tutor_texto"]) expect(d.recursos[r].acesso, r).toBe("liberado");
    expect(d.creditos).toMatchObject({ franquia_dia: 12, franquia_mes: 270 });
    expect(d.voz.limite_s).toBe(1200);
    await abrirFase2(false);
    expect((await direitos(PRATICA)).recursos.estacoes.motivo).toBe("fase2_fechada");
  });

  it("vencido (teste ou plano): volta para a amostra do dia, com convite para assinar (sem novo teste)", async () => {
    for (const u of [VENCIDO, PRO_CANCELADO, SEM_TESTE]) {
      const d = await direitos(u);
      expect(d.perfil, u).toBe("vencido");
      expect(d.recursos.questoes).toMatchObject({ acesso: "amostra", motivo: "amostra_vencida", amostra: { limite: 20 } });
      expect(d.creditos.franquia_dia).toBe(5);
    }
    expect((await direitos(VENCIDO)).fases.teoria.motivo).toBe("teste_acabou");
    expect((await direitos(PRO_CANCELADO)).fases.teoria.motivo).toBe("plano_cancelado");
    expect((await direitos(SEM_TESTE)).fases.teoria.motivo).toBe("sem_teste");
    expect((await direitos(VENCIDO)).recursos.questoes.ofertas.map((o: any) => o.tipo)).toEqual(["assinar", "assinar"]);
  });

  it("pagamento pendente segue pago pelos 3 dias, igual à regra antiga", async () => {
    expect((await direitos(PENDENTE)).perfil).toBe("pro");
  });

  it("sem assinatura: tudo trancado com convite para testar e assinar; equipe e revisor: tudo liberado (revisor sem 2ª fase enquanto fechada)", async () => {
    const d = await direitos(SEM_PLANO);
    expect(d.perfil).toBe("sem_acesso");
    expect(d.recursos.questoes).toMatchObject({ acesso: "trancado", motivo: "fase_nao_incluida" });
    expect(d.recursos.questoes.ofertas[0]).toEqual({ tipo: "testar", fase: "teoria" });
    for (const u of [ADMIN, EDITOR]) {
      const e = await direitos(u);
      expect(e.perfil).toBe("equipe");
      expect(Object.values(e.recursos).every((r: any) => r.acesso === "liberado")).toBe(true);
      expect(e.saldo).toEqual({ fonte: "equipe", ilimitado: true });
    }
    const rev = await direitos(REVISOR);
    expect(rev.recursos.questoes.acesso).toBe("liberado");
    expect(rev.recursos.estacoes.motivo).toBe("fase2_fechada");
  });

  it("user_has_access responde um recurso; recurso desconhecido = nulo", async () => {
    expect((await q(`select public.user_has_access($1, 'questoes') a`, [PRO]))[0].a).toBe("liberado");
    expect((await q(`select public.user_has_access($1, 'questoes') a`, [TESTE]))[0].a).toBe("amostra");
    expect((await q(`select public.user_has_access($1, 'nao_existe') a`, [TESTE]))[0].a).toBeNull();
  });
});

describe("saldo para o Início", () => {
  it("modo sombra: mostra a cota que vale HOJE (mensagens do Tutor e voz de tutor_entitlement)", async () => {
    const d = await rpc(TESTE, "app_my_entitlements");
    const [e] = await q(`select public.tutor_entitlement($1) e`, [TESTE]);
    expect(d.saldo).toMatchObject({ fonte: "tutor_atual", ilimitado: false, mensagens_hoje: e.e.text.remaining, mensagens_limite_hoje: e.e.text.limit, voz_restante_s: e.e.voice.remaining_s });
  });
  it("chave ligada: mostra créditos e voz da regra nova", async () => {
    await db.query(`update public.direitos_config set cadeados_ligados = true`);
    const d = await rpc(PRO, "app_my_entitlements");
    expect(d.saldo).toMatchObject({ fonte: "creditos", creditos_hoje: 8, creditos_limite_hoje: 8, creditos_mes: 180, voz_restante_s: 600, voz_periodo: "mes" });
    await db.query(`update public.direitos_config set cadeados_ligados = false`);
  });
  it("créditos usados: sem cotação, 1 por mensagem do Tutor; com cotação, pelo custo (1 crédito = R$ 0,10)", async () => {
    await q(`insert into public.ai_usage_ledger (user_id, feature, interactions, estimated_cost_usd) values ($1, 'tutor_text', 1, 0.05), ($1, 'tutor_text', 1, 0.05)`, [PRO]);
    expect((await direitos(PRO)).creditos).toMatchObject({ base: "mensagens", usados_hoje: 2, saldo_hoje: 6 });
    await db.query(`update public.direitos_config set cotacao_dolar = 5`);
    // US$ 0,10 × 5 = R$ 0,50 = 5 créditos
    expect((await direitos(PRO)).creditos).toMatchObject({ base: "custo", usados_hoje: 5, usados_mes: 5, saldo_hoje: 3 });
    await db.query(`update public.direitos_config set cotacao_dolar = null`);
  });
});

describe("só um teste por conta (e por telefone)", () => {
  it("2ª fase fechada: escolher prática ou as duas é recusado; a 1ª fase pode", async () => {
    await expect(rpc(DUAS, "app_escolher_teste", { p_escolha: "as_duas" })).rejects.toThrow("A 2ª fase ainda não está aberta aos alunos. Por enquanto, escolha a 1ª fase.");
    await expect(rpc(SO_PRATICA, "app_escolher_teste", { p_escolha: "pratica" })).rejects.toThrow("A 2ª fase ainda não está aberta");
    const d = await rpc(TESTE, "app_escolher_teste", { p_escolha: "teoria" });
    expect(d.teste).toMatchObject({ escolha: "teoria", pode_escolher: false });
  });

  it("escolher de novo é recusado (um teste por conta)", async () => {
    await expect(rpc(TESTE, "app_escolher_teste", { p_escolha: "teoria" })).rejects.toThrow("Você já escolheu o seu teste grátis. Só existe um teste por conta");
  });

  it("2ª fase aberta: 'as duas' recebe os dois testes juntos, com a mesma data", async () => {
    await abrirFase2(true);
    const d = await rpc(DUAS, "app_escolher_teste", { p_escolha: "as_duas" });
    expect(d.perfil).toBe("teste");
    expect(d.fases.pratica).toMatchObject({ situacao: "teste", origem: "escolha_teste" });
    expect(d.fases.pratica.fim).toBe(d.fases.teoria.fim);
    expect(d.recursos.estacoes.acesso).toBe("amostra");
    expect(d.recursos.questoes.acesso).toBe("amostra");
  });

  it("só a 2ª fase: a 1ª fase sai do teste (trancada com convite)", async () => {
    const d = await rpc(SO_PRATICA, "app_escolher_teste", { p_escolha: "pratica" });
    expect(d.fases.teoria).toMatchObject({ situacao: "sem_acesso", motivo: "fora_da_escolha_do_teste" });
    expect(d.recursos.questoes).toMatchObject({ acesso: "trancado" });
    expect(d.recursos.estacoes.acesso).toBe("amostra");
    expect(d.recursos.aulas_temas.acesso).toBe("amostra");
    await abrirFase2(false);
  });

  it("teste vencido, plano pago, sem teste e equipe não escolhem teste", async () => {
    await expect(rpc(VENCIDO, "app_escolher_teste", { p_escolha: "teoria" })).rejects.toThrow("Seu teste grátis já terminou. Só existe um teste por conta.");
    await expect(rpc(PRO, "app_escolher_teste", { p_escolha: "teoria" })).rejects.toThrow("Seu teste grátis já terminou");
    await expect(rpc(SEM_PLANO, "app_escolher_teste", { p_escolha: "teoria" })).rejects.toThrow("Sua conta não tem teste grátis");
    await expect(rpc(ADMIN, "app_escolher_teste", { p_escolha: "teoria" })).rejects.toThrow("A equipe já tem acesso completo");
    await expect(rpc(TEL_A, "app_escolher_teste", { p_escolha: "qualquer" })).rejects.toThrow("Escolha 1ª fase, 2ª fase ou as duas.");
  });

  it("mesmo WhatsApp em outra conta: o teste da segunda conta não vale e ela não escolhe teste", async () => {
    expect((await direitos(TEL_A)).teste.repetido_telefone).toBe(false);
    const b = await direitos(TEL_B);
    expect(b.teste.repetido_telefone).toBe(true);
    expect(b.fases.teoria).toMatchObject({ situacao: "vencida", motivo: "teste_repetido_telefone" });
    await expect(rpc(TEL_B, "app_escolher_teste", { p_escolha: "teoria" })).rejects.toThrow("Este WhatsApp já foi usado no teste grátis de outra conta.");
  });
});

describe("o gatilho mantém as fases em dia (sem nunca atrapalhar a assinatura)", () => {
  it("Administração > Usuários (função antiga) muda o plano: Pro → Elite → Pro", async () => {
    const fim = new Date(Date.now() + 15 * 86_400_000).toISOString();
    await rpc(ADMIN, "app_admin_set_subscription", { p_user_id: PRO_CANCELADO, p_plan: "elite", p_status: "active", p_current_period_end: fim });
    expect((await direitos(PRO_CANCELADO)).perfil).toBe("elite");
    await rpc(ADMIN, "app_admin_set_subscription", { p_user_id: PRO_CANCELADO, p_plan: "pro", p_status: "active", p_current_period_end: fim });
    const fases = await q(`select fase from public.aluno_fases where user_id = $1 order by fase`, [PRO_CANCELADO]);
    expect(fases.map((f: any) => f.fase)).toEqual(["teoria"]);
  });

  it("cadastro novo ganha o teste da teoria; apagar a conta apaga as fases", async () => {
    const novo = id(99);
    await db.query(`insert into auth.users (id, email) values ($1, 'novo@teste.dev')`, [novo]);
    expect((await direitos(novo)).fases.teoria.situacao).toBe("teste");
    expect((await q(`select origem from public.aluno_testes where user_id = $1`, [novo]))[0].origem).toBe("cadastro");
    await db.query(`delete from auth.users where id = $1`, [novo]);
    expect(await q(`select 1 from public.aluno_fases where user_id = $1`, [novo])).toEqual([]);
  });

  it("se a sincronia falhar, a assinatura grava do mesmo jeito", async () => {
    await db.exec(`alter table public.aluno_fases rename to aluno_fases_x`);
    try {
      await db.query(`update public.subscriptions set trial_ends_at = now() + interval '6 days' where user_id = $1`, [TEL_A]);
    } finally {
      await db.exec(`alter table public.aluno_fases_x rename to aluno_fases`);
    }
    const [s] = await q(`select trial_ends_at > now() + interval '5 days' ok from public.subscriptions where user_id = $1`, [TEL_A]);
    expect(s.ok).toBe(true);
  });
});

describe("segurança: aluno não muda o próprio plano/fase; visitante barrado", () => {
  it("aluno não grava nas tabelas novas nem lê a configuração; só lê as próprias fases", async () => {
    for (const sql of [
      `insert into public.aluno_fases (user_id, fase, situacao, plano, fim, origem) values ('${TESTE}', 'pratica', 'paga', 'elite', now() + interval '1 year', 'assinatura')`,
      `update public.aluno_fases set situacao = 'paga', fim = now() + interval '1 year' where user_id = '${TESTE}'`,
      `delete from public.aluno_fases where user_id = '${TESTE}'`,
      `update public.aluno_testes set escolhido_em = null, escolha = 'as_duas' where user_id = '${TESTE}'`,
      `delete from public.aluno_testes where user_id = '${TESTE}'`,
      `update public.direitos_config set cadeados_ligados = true`,
      `select * from public.direitos_config`,
      `select * from public.direitos_planos`,
      `update public.direitos_planos set creditos_dia = 9999`,
      `update public.direitos_recursos set amostra_modo = 'livre'`,
    ]) {
      await expect(como(TESTE, sql), sql).rejects.toThrow(/permission denied/);
    }
    const minhas = await como(TESTE, `select user_id from public.aluno_fases`);
    expect(minhas.every((r: any) => r.user_id === TESTE) && minhas.length > 0).toBe(true);
    expect(await como(TESTE, `select user_id from public.aluno_testes where user_id <> $1`, [TESTE])).toEqual([]);
  });

  it("aluno não chama as funções internas nem as da Administração", async () => {
    for (const sql of [
      `select public.direitos_do_aluno('${PRO}')`,
      `select public.user_has_access('${PRO}', 'questoes')`,
      `select public.direitos_sincronizar_assinatura('${TESTE}')`,
      `select public.direitos_regra_atual('${TESTE}')`,
      `select public.direitos_teste_repetido('${TESTE}')`,
      `select public.direitos_cadeados_ligados()`,
    ]) {
      await expect(como(TESTE, sql), sql).rejects.toThrow(/permission denied/);
    }
    for (const [fn, args] of [["app_admin_direitos", {}], ["app_admin_direitos_salvar", { p_dados: { config: { cadeados_ligados: true } } }], ["app_admin_direitos_aluno", { p_busca: "u6@teste.dev" }]] as const) {
      await expect(rpc(TESTE, fn, args)).rejects.toThrow("Acesso restrito a administradores.");
      await expect(rpc(EDITOR, fn, args)).rejects.toThrow("Acesso restrito a administradores.");
    }
  });

  it("mudar a fase ou a prova no próprio perfil não libera nada", async () => {
    const antesD = await direitos(PRO);
    await como(PRO, `update public.profiles set phase = 2, exam_type = 'ENAMED' where id = $1`, [PRO]);
    const depoisD = await direitos(PRO);
    expect(depoisD.recursos).toEqual(antesD.recursos);
    expect(depoisD.perfil).toBe("pro");
  });

  it("visitante (anon) não chama nada e não lê nada", async () => {
    for (const fn of ["app_my_entitlements()", "app_escolher_teste('teoria')", "app_admin_direitos()", "app_admin_direitos_aluno('x')", "app_admin_direitos_salvar('{}'::jsonb)"]) {
      await expect(como(null, `select public.${fn}`), fn).rejects.toThrow(/permission denied/);
    }
    for (const t of ["aluno_fases", "aluno_testes", "direitos_config", "direitos_planos", "direitos_recursos"]) {
      await expect(como(null, `select * from public.${t}`), t).rejects.toThrow(/permission denied/);
    }
  });
});

describe("Administração (só administrador, com registro)", () => {
  it("mostra a configuração, os 3 planos com preços mensal/trimestral e franquias, a matriz e o resumo", async () => {
    const a = await rpc(ADMIN, "app_admin_direitos");
    expect(a.config).toMatchObject({ cadeados_ligados: false, fase2_aberta_alunos: false, amostra_creditos_dia: 5, amostra_voz_minutos_total: 2, credito_valor_centavos: 10, cotacao_dolar: null, teste_dias: 7 });
    expect(a.planos.map((p: any) => [p.codigo, p.preco_mensal_centavos, p.preco_trimestral_centavos, p.creditos_dia, p.creditos_mes, p.voz_minutos_mes])).toEqual([
      ["pro", 9990, 26970, 8, 180, 10],
      ["pratica", 16990, 45870, 12, 270, 20],
      ["elite", 19990, 53970, 20, 450, 40],
    ]);
    expect(a.recursos.length).toBe(18);
    expect(a.resumo.alunos).toBeGreaterThan(5);
    expect(a.resumo.perderiam_algo).toBeGreaterThan(0);
    // os planos antigos (aba Planos) seguem fora de venda
    expect((await q(`select count(*)::int n from public.plans where active and code <> 'trial'`))[0].n).toBe(0);
  });

  it("salva preços, franquias, amostra e a chave; grava no registro; recusa número errado", async () => {
    const a = await rpc(ADMIN, "app_admin_direitos_salvar", {
      p_dados: {
        config: { cadeados_ligados: true, amostra_creditos_dia: 6, cotacao_dolar: "5.40" },
        planos: [{ codigo: "pro", nome: "PRO", descricao: "1ª fase", preco_mensal_centavos: 10990, preco_trimestral_centavos: 29970, creditos_dia: 9, creditos_mes: 200, voz_minutos_mes: 12 }],
        recursos: [{ codigo: "mapas", amostra_modo: "por_dia", amostra_limite: 2 }],
      },
    });
    expect(a.config).toMatchObject({ cadeados_ligados: true, amostra_creditos_dia: 6, cotacao_dolar: 5.4 });
    expect(a.planos[0]).toMatchObject({ preco_mensal_centavos: 10990, creditos_dia: 9 });
    expect(a.recursos.find((r: any) => r.codigo === "mapas")).toMatchObject({ amostra_modo: "por_dia", amostra_limite: 2, decidido: true });
    const log = await q(`select action, target from public.admin_audit_log where action like 'direitos.%' order by id`);
    expect(log).toEqual([{ action: "direitos.save", target: null }, { action: "direitos.modo", target: "ligado" }]);
    await expect(rpc(ADMIN, "app_admin_direitos_salvar", { p_dados: { planos: [{ codigo: "pro", nome: "PRO", preco_mensal_centavos: 1, preco_trimestral_centavos: 1, creditos_dia: 300, creditos_mes: 10, voz_minutos_mes: 1 }] } }))
      .rejects.toThrow("No plano PRO, os créditos por dia não podem passar dos créditos por mês.");
    await expect(rpc(ADMIN, "app_admin_direitos_salvar", { p_dados: { planos: [{ codigo: "pro", nome: "PRO", preco_mensal_centavos: "99,90", preco_trimestral_centavos: 1, creditos_dia: 1, creditos_mes: 10, voz_minutos_mes: 1 }] } }))
      .rejects.toThrow("Preço inválido no plano PRO");
    await expect(rpc(ADMIN, "app_admin_direitos_salvar", { p_dados: { recursos: [{ codigo: "tutor_texto", amostra_modo: "por_dia", amostra_limite: 3 }] } }))
      .rejects.toThrow("Essa amostra não combina com o recurso.");
    await expect(rpc(ADMIN, "app_admin_direitos_salvar", { p_dados: { planos: [{ codigo: "basico", nome: "x" }] } })).rejects.toThrow("Plano inválido.");
    await expect(rpc(ADMIN, "app_admin_direitos_salvar", { p_dados: { config: { cotacao_dolar: "900" } } })).rejects.toThrow("Cotação do dólar");
    // volta ao modo sombra (fica no registro)
    await rpc(ADMIN, "app_admin_direitos_salvar", { p_dados: { config: { cadeados_ligados: false } } });
    expect((await q(`select target from public.admin_audit_log where action = 'direitos.modo' order by id desc limit 1`))[0].target).toBe("sombra");
  });

  it("diagnóstico de um aluno: regra de hoje × regra nova, com as diferenças", async () => {
    const d = await rpc(ADMIN, "app_admin_direitos_aluno", { p_busca: "U4@teste.dev" });
    expect(d.aluno).toMatchObject({ id: TESTE, email: "u4@teste.dev", papel: "student", assinatura: { plano: "trial", situacao: "trialing" } });
    expect(d.regra_atual.simulados_teoricos).toBe("liberado");
    expect(d.regra_nova.recursos.simulados_teoricos.acesso).toBe("amostra");
    expect(d.diferencas).toContainEqual({ recurso: "simulados_teoricos", nome: "Simulados Revalida e ENAMED", hoje: "liberado", regra_nova: "amostra" });
    expect(d.diferencas.find((x: any) => x.recurso === "grupo_teorico")).toBeUndefined(); // não existe hoje: fora da comparação
    const porId = await rpc(ADMIN, "app_admin_direitos_aluno", { p_busca: PRO });
    expect(porId.aluno.email).toBe("u6@teste.dev");
    await expect(rpc(ADMIN, "app_admin_direitos_aluno", { p_busca: "ninguem@teste.dev" })).rejects.toThrow("Nenhum usuário com esse e-mail.");
  });
});

describe("colar de novo e desfazer", () => {
  it("colar a migração de novo não dá erro e não desfaz o que o dono editou nem a escolha dos alunos", async () => {
    const contar = async () => (await q(`select (select count(*) from public.aluno_fases)::int f, (select count(*) from public.aluno_testes)::int t`))[0];
    const antesN = await contar();
    await db.exec(MIGRACAO);
    expect(await contar()).toEqual(antesN);
    expect((await q(`select preco_mensal_centavos p from public.direitos_planos where codigo = 'pro'`))[0].p).toBe(10990);
    expect((await q(`select amostra_creditos_dia a from public.direitos_config`))[0].a).toBe(6);
    expect((await q(`select escolha from public.aluno_testes where user_id = $1`, [DUAS]))[0].escolha).toBe("as_duas");
    expect((await q(`select origem from public.aluno_fases where user_id = $1 and fase = 'pratica'`, [DUAS]))[0].origem).toBe("escolha_teste");
  });

  it("desfazer apaga só o que é novo; as regras antigas ficam iguais ao começo; reaplicar converte de novo", async () => {
    await db.exec(DESFAZER);
    await db.exec(DESFAZER); // de novo, sem erro
    for (const t of ["aluno_fases", "aluno_testes", "direitos_config", "direitos_planos", "direitos_recursos"]) {
      expect((await q(`select to_regclass('public.${t}') r`))[0].r, t).toBeNull();
    }
    expect(await q(`select proname from pg_proc where pronamespace = 'public'::regnamespace and (proname like 'direitos%' or proname in ('user_has_access', 'app_my_entitlements', 'app_escolher_teste') or proname like 'app_admin_direitos%')`)).toEqual([]);
    const fns = await q<{ nome: string; def: string }>(`select p.oid::regprocedure::text nome, pg_get_functiondef(p.oid) def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'`);
    const agora = Object.fromEntries(fns.map((f) => [f.nome, f.def]));
    for (const [nome, def] of Object.entries(antes.funcoes)) expect(agora[nome], nome).toBe(def);
    await db.exec(MIGRACAO);
    expect((await direitos(PRO)).perfil).toBe("pro");
    expect((await direitos(TESTE)).perfil).toBe("teste");
  });
});
