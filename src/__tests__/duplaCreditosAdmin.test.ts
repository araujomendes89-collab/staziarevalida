// @vitest-environment node
/**
 * Stazia Match · Etapa M4a: a migração 013530 (supabase/migrations/…013530_treino_dupla_creditos_admin.sql).
 * Administração dos créditos: configuração (validação, antes e depois no registro), concessão (sempre BÔNUS), estorno (mesmo
 * balde, uma vez só, consumo de dia passado e compensação), extrato (sem chave interna, com a leitura no registro), uso de hoje,
 * conciliação, quem pode chamar (só administrador) e colar duas vezes. Postgres em memória (PGlite) com todas as migrações.
 * O livro de créditos só acrescenta (não dá para apagar linhas): cada teste usa contas novas e confere por user_id.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { MIGRATIONS_DIR, U, makeRoom, openDuplaDb, setPlan, type DuplaDb } from "./helpers/duplaDb";

const MIGRACAO = "20261003013530_treino_dupla_creditos_admin.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8");
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const PADRAO = { ativa: false, match: { cobra_rodada_extra: false }, ia: {} };
const SO_ADMIN = /Acesso restrito a administradores\./;
const MOEDA = /Moeda inválida\./;
const NAO_ACHOU = /Aluno não encontrado\./;
const FUNCOES = [
  "app_admin_credit_config()",
  "app_admin_save_credit_config(jsonb)",
  "app_admin_credit_grant(uuid,text,integer,text,text)",
  "app_admin_credit_refund(bigint,text,boolean)",
  "app_admin_credit_statement(uuid,text,integer)",
  "app_admin_credit_today()",
  "app_admin_credit_reconcile(text)",
];

describe("Migração 013530 — administração dos créditos do Stazia Match", () => {
  let d: DuplaDb;
  const editor = U.fabio;
  const revisor = U.gil;

  // ------------------------------------------------------------------ apoios
  /** Conta de aluno nova (nome próprio), com plano pago (pro/elite) ou teste dentro do prazo. */
  const novo = async (plano: "pro" | "elite" | "trial" = "pro", nome = "Aluno de teste") => {
    const id = randomUUID();
    await d.db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${id}@teste.dev`, { name: nome }]);
    if (plano === "trial") await setPlan(d.db, id, "trial", "trialing", daqui(7));
    else await setPlan(d.db, id, plano, "active");
    return id;
  };
  /** Chave "creditos" direto no banco (dono), sem passar pela função do administrador. */
  const setCfg = (v: unknown) =>
    d.sql(
      `insert into public.app_settings (key, value) values ('creditos', $1::jsonb)
       on conflict (key) do update set value = excluded.value, updated_by = null`,
      [JSON.stringify(v)],
    );
  const getCfg = async () => (await d.sql<{ value: any }>(`select value from public.app_settings where key = 'creditos'`))[0]?.value;
  const salvar = (c: unknown) => d.rpc(U.admin, "app_admin_save_credit_config", { p_config: c });
  const config = () => d.rpc(U.admin, "app_admin_credit_config");
  /** Liga a cota com o limite diário do match (e, se vier, da IA). */
  const ligar = (match: Record<string, unknown>, ia: Record<string, unknown> = {}) => salvar({ ativa: true, match, ia });
  const estado = async (uid: string, pool = "match") =>
    (await d.sql<{ r: any }>(`select public.credit_state($1::uuid, $2) as r`, [uid, pool]))[0].r;
  /** Consumo pelo dono do banco; `now` opcional (para gerar consumo de outro dia). */
  const consumir = async (uid: string, n: number, idem: string, pool = "match", now?: string) =>
    (
      await d.sql<{ r: any }>(
        `select public.credit_consume($1::uuid, $2, $3::int, null, null, $4, coalesce($5::timestamptz, now())) as r`,
        [uid, pool, n, idem, now ?? null],
      )
    )[0].r;
  const ontem = () => new Date(Date.now() - 86_400_000).toISOString();
  const conceder = (uid: string, n = 5, motivo = "Cortesia", chave: string | null = null, pool = "match") =>
    d.rpc(U.admin, "app_admin_credit_grant", { p_user: uid, p_pool: pool, p_n: n, p_reason: motivo, p_key: chave });
  const estornar = (id: number | string, motivo = "Falha na sala", compensar = false) =>
    d.rpc(U.admin, "app_admin_credit_refund", { p_ledger_id: id, p_reason: motivo, p_compensar: compensar });
  const livro = (uid: string, pool = "match") =>
    d.sql<any>(`select * from public.credit_ledger where user_id = $1 and pool = $2 order by id`, [uid, pool]);
  const registro = (action: string, target?: string) =>
    d.sql<any>(
      `select id, actor_id, action, target, details from public.admin_audit_log where action = $1 and ($2::text is null or target = $2) order by id`,
      [action, target ?? null],
    );
  const nLog = async () => (await d.sql<{ n: number }>(`select count(*)::int as n from public.admin_audit_log`))[0].n;
  const nLivro = async () => (await d.sql<{ n: number }>(`select count(*)::int as n from public.credit_ledger`))[0].n;

  beforeAll(async () => {
    d = await openDuplaDb();
    await d.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [editor]);
    await d.db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [revisor]);
    await setPlan(d.db, U.ana, "pro", "active");
    await setPlan(d.db, U.bruno, "trial", "trialing", daqui(7));
  }, 120_000);
  beforeEach(async () => {
    await setCfg(PADRAO);
  });
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ quem pode chamar
  it("só o ADMINISTRADOR chama qualquer função da administração dos créditos; editor, revisor médico, aluno e visitante são barrados", async () => {
    const aluno = await novo("pro");
    const chamadas: Record<string, Record<string, unknown>> = {
      app_admin_credit_config: {},
      app_admin_save_credit_config: { p_config: { ativa: true, match: { pro: 3 } } },
      app_admin_credit_grant: { p_user: aluno, p_pool: "match", p_n: 1, p_reason: "Teste", p_key: "barrado" },
      app_admin_credit_refund: { p_ledger_id: 1, p_reason: "Teste", p_compensar: false },
      app_admin_credit_statement: { p_user: aluno, p_pool: "match", p_days: 30 },
      app_admin_credit_today: {},
      app_admin_credit_reconcile: { p_pool: "match" },
    };
    const logAntes = await nLog();
    const livroAntes = await nLivro();
    const cfgAntes = await getCfg();
    for (const [fn, args] of Object.entries(chamadas)) {
      for (const [quem, uid] of [["editor", editor], ["revisor médico", revisor], ["aluno pro", aluno], ["aluno em teste", U.bruno]] as const) {
        await expect(d.rpc(uid, fn, args), `${fn} como ${quem}`).rejects.toThrow(SO_ADMIN);
      }
      // Visitante: nem executar a função ele consegue.
      await expect(d.rpc(null, fn, args), `${fn} como visitante`).rejects.toThrow(/permission denied/);
    }
    // Nada mudou: nem registro, nem livro, nem configuração.
    expect(await nLog()).toBe(logAntes);
    expect(await nLivro()).toBe(livroAntes);
    expect(await getCfg()).toEqual(cfgAntes);
    // E o administrador chama todas (a primeira chamada de leitura, a de gravação e a de concessão).
    expect(await config()).toEqual(PADRAO);
  });

  // ------------------------------------------------------------------ configuração
  it("configuração: lê o padrão; salvar válido devolve o gravado, grava updated_by e deixa 'credito.config' com antes e depois", async () => {
    expect(await config()).toEqual(PADRAO);
    // Sem a linha na tabela, o padrão também vale.
    await d.sql(`delete from public.app_settings where key = 'creditos'`);
    expect(await config()).toEqual(PADRAO);

    const antes = await getCfg();
    expect(antes).toBeUndefined();
    const logAntes = (await registro("credito.config")).length;
    const novoCfg = { ativa: true, match: { trial: 1, pro: 3, elite: 6, cobra_rodada_extra: true }, ia: {} };
    const salvo = await salvar(novoCfg);
    expect(salvo).toEqual(novoCfg);
    expect(await config()).toEqual(novoCfg);
    expect(await getCfg()).toEqual(novoCfg);
    const [linha] = await d.sql<{ updated_by: string; updated_at: string }>(`select updated_by, updated_at from public.app_settings where key = 'creditos'`);
    expect(linha.updated_by).toBe(U.admin);

    const log1 = await registro("credito.config");
    expect(log1).toHaveLength(logAntes + 1);
    const ultimo = log1[log1.length - 1];
    expect(ultimo).toMatchObject({ actor_id: U.admin, target: "creditos" });
    // Sem a linha, o "antes" é o que a cota lia como padrão (apenas { ativa: false }).
    expect(ultimo.details.antes).toEqual({ ativa: false });
    expect(ultimo.details.depois).toEqual(novoCfg);

    // Segunda gravação: o "antes" é o primeiro "depois".
    const outro = { ativa: true, match: { pro: 4, cobra_rodada_extra: false }, ia: { pro: 5 } };
    expect(await salvar(outro)).toEqual(outro);
    const log2 = await registro("credito.config");
    expect(log2).toHaveLength(logAntes + 2);
    expect(log2[log2.length - 1].details).toEqual({ antes: novoCfg, depois: outro });
  });

  it("ligar 'ativa' sem nenhum plano do match preenchido é recusado; com um plano liga; desligada sem números é aceita", async () => {
    const MSG = /Preencha ao menos um plano antes de ligar a cota\./;
    const logAntes = (await registro("credito.config")).length;
    for (const c of [
      { ativa: true },
      { ativa: true, match: {} },
      { ativa: true, match: { cobra_rodada_extra: true } },
      { ativa: true, match: { pro: null } },
      { ativa: true, match: {}, ia: { pro: 5 } }, // só o match conta para ligar
    ]) {
      await expect(salvar(c), JSON.stringify(c)).rejects.toThrow(MSG);
    }
    expect(await getCfg()).toEqual(PADRAO);
    expect((await registro("credito.config")).length).toBe(logAntes);

    expect(await salvar({ ativa: true, match: { elite: 10 } })).toEqual({ ativa: true, match: { elite: 10, cobra_rodada_extra: false }, ia: {} });
    // Zero é um número: o plano está "preenchido" (zero crédito para o plano, de propósito).
    expect((await salvar({ ativa: true, match: { pro: 0 } })).match).toEqual({ pro: 0, cobra_rodada_extra: false });
    expect(await salvar({ ativa: false })).toEqual(PADRAO);
    expect(await salvar({ ativa: false, match: {} })).toEqual(PADRAO);
    expect(await config()).toEqual(PADRAO);
  });

  it("limites inválidos do match são recusados e nada é gravado; plano desconhecido é ignorado; 0 e 100000 valem", async () => {
    const LIMITE = /Créditos por dia \((trial|pro|elite)\): um número inteiro de 0 a 100000, ou vazio\./;
    const logAntes = (await registro("credito.config")).length;
    for (const plano of ["trial", "pro", "elite"]) {
      for (const errado of [-1, 1.5, "3", 100001, true, [3], { dia: 3 }]) {
        await expect(salvar({ ativa: false, match: { [plano]: errado } }), `${plano}=${JSON.stringify(errado)}`).rejects.toThrow(LIMITE);
      }
    }
    // Texto que nem é número: recusado também (pela validação ou pela conversão).
    await expect(salvar({ ativa: false, match: { pro: "abc" } })).rejects.toThrow();
    expect(await getCfg()).toEqual(PADRAO);
    expect((await registro("credito.config")).length).toBe(logAntes);

    // Planos fora de trial/pro/elite são ignorados, sem erro e sem gravar; chaves soltas na raiz também.
    expect(await salvar({ ativa: false, match: { pro: 5, ouro: 7, "": 1 }, extra: 1 })).toEqual({ ativa: false, match: { pro: 5, cobra_rodada_extra: false }, ia: {} });
    expect(await getCfg()).toEqual({ ativa: false, match: { pro: 5, cobra_rodada_extra: false }, ia: {} });
    // Limites nos extremos e nulo (apaga o número do plano).
    expect((await salvar({ ativa: false, match: { trial: 0, pro: 100000 } })).match).toEqual({ trial: 0, pro: 100000, cobra_rodada_extra: false });
    expect((await salvar({ ativa: false, match: { trial: null, pro: 2 } })).match).toEqual({ pro: 2, cobra_rodada_extra: false });
    // 3.0 é inteiro.
    expect((await salvar({ ativa: false, match: { pro: 3.0 } })).match.pro).toBe(3);
  });

  it("estrutura da configuração: 'ativa' obrigatório e booleano; raiz, match e ia precisam ser objetos", async () => {
    await expect(salvar(null)).rejects.toThrow(/Configuração de créditos inválida\./);
    await expect(salvar([])).rejects.toThrow(/Configuração de créditos inválida\./);
    await expect(salvar('"ligada"')).rejects.toThrow(/Configuração de créditos inválida\./);
    for (const c of [{}, { match: { pro: 3 } }, { ativa: "true" }, { ativa: 1 }, { ativa: null }]) {
      await expect(salvar(c), JSON.stringify(c)).rejects.toThrow(/diga se a cota está ligada/);
    }
    await expect(salvar({ ativa: false, match: [1] })).rejects.toThrow(/Configuração dos matches inválida\./);
    await expect(salvar({ ativa: false, match: "x" })).rejects.toThrow(/Configuração dos matches inválida\./);
    await expect(salvar({ ativa: false, ia: [1] })).rejects.toThrow(/Configuração de IA inválida\./);
    await expect(salvar({ ativa: false, ia: 5 })).rejects.toThrow(/Configuração de IA inválida\./);
    expect(await getCfg()).toEqual(PADRAO);
  });

  it("'ordem' e 'cobra_rodada_extra' do match: inválidos recusados, válidos gravados", async () => {
    const ORDEM = /Ordem do débito inválida: use os três tipos \(diária, bônus, comprados\) sem repetir\./;
    for (const errada of [
      ["daily", "daily", "bonus"], // repetição
      ["daily", "bonus"], // só 2
      ["daily", "bonus", "purchased", "daily"], // 4
      ["daily", "bonus", "ouro"], // balde desconhecido
      ["daily", "bonus", 3],
      "daily,bonus,purchased",
      [],
      {},
    ]) {
      await expect(salvar({ ativa: false, match: { ordem: errada } }), JSON.stringify(errada)).rejects.toThrow(ORDEM);
    }
    const valida = ["bonus", "daily", "purchased"];
    expect((await salvar({ ativa: false, match: { pro: 2, ordem: valida } })).match).toEqual({ pro: 2, cobra_rodada_extra: false, ordem: valida });
    expect((await config()).match.ordem).toEqual(valida);
    // 'ordem' nula não grava nada.
    expect((await salvar({ ativa: false, match: { ordem: null } })).match).toEqual({ cobra_rodada_extra: false });

    // cobra_rodada_extra: só booleano (ou nulo/ausente = não cobra).
    for (const errado of ["sim", "true", 1, 0, [], {}]) {
      await expect(salvar({ ativa: false, match: { cobra_rodada_extra: errado } }), JSON.stringify(errado)).rejects.toThrow(/é sim ou não/);
    }
    expect((await salvar({ ativa: false, match: { cobra_rodada_extra: true } })).match.cobra_rodada_extra).toBe(true);
    expect((await salvar({ ativa: false, match: { cobra_rodada_extra: null } })).match.cobra_rodada_extra).toBe(false);
    expect((await salvar({ ativa: false, match: {} })).match.cobra_rodada_extra).toBe(false);
  });

  it("configuração da IA: chave desconhecida, peso decimal e plano com objeto de chaves erradas são recusados; válida é gravada", async () => {
    const IA = /Configuração de IA inválida/;
    for (const errada of [
      { ouro: 5 }, // plano/chave desconhecida
      { pro: "5" },
      { pro: -1 },
      { pro: 1.5 },
      { pro: 100001 },
      { pro: true },
      { pro: [5] },
      { pro: { dia: 5, ano: 9 } }, // chave errada dentro do plano
      { pro: { foo: 1 } },
      { pro: { dia: "5" } },
      { pro: { dia: 1.5 } },
      { pro: { semana: -2 } },
      { pro: { mes: 100001 } },
      { pesos: 3 },
      { pesos: [1] },
      { pesos: { avaliacao_sozinho: 1.5 } },
      { pesos: { avaliacao_sozinho: "3" } },
      { pesos: { avaliacao_sozinho: -1 } },
      { pesos: { avaliacao_sozinho: null } },
    ]) {
      await expect(salvar({ ativa: false, ia: errada }), JSON.stringify(errada)).rejects.toThrow(IA);
    }
    expect(await getCfg()).toEqual(PADRAO);

    const valida = { pro: { dia: 5, semana: 20, mes: 60 }, pesos: { avaliacao_sozinho: 3 } };
    expect(await salvar({ ativa: false, ia: valida })).toEqual({ ativa: false, match: { cobra_rodada_extra: false }, ia: valida });
    expect((await config()).ia).toEqual(valida);
    // Outras formas válidas: plano com número, nulo e objeto parcial; pesos vazio.
    const variada = { trial: 2, pro: { dia: 4, semana: null }, elite: null, pesos: {} };
    // Plano nulo é descartado (como no match: vazio = sem número).
    const { elite: _nulo, ...semNulo } = variada;
    expect((await salvar({ ativa: false, ia: variada })).ia).toEqual(semNulo);
    // A IA não conta para ligar a cota do match.
    await expect(salvar({ ativa: true, ia: valida })).rejects.toThrow(/Preencha ao menos um plano/);
  });

  it("depois de ligar pelo administrador: aluno sem número fica com ZERO, com número tem o limite, equipe é ilimitada; a ordem do débito vale", async () => {
    const comNumero = await novo("pro");
    const semNumero = await novo("elite");
    const teste = await novo("trial");
    const sobra = await novo("pro");
    // Desligada: ninguém é limitado nem debitado.
    expect(await estado(comNumero)).toMatchObject({ ativa: false, limite_dia: null, disponivel: null });
    expect(await consumir(comNumero, 1, `desligada:${comNumero}`)).toMatchObject({ charged: false });
    expect(await livro(comNumero)).toEqual([]);

    await ligar({ pro: 3, trial: 1 });
    expect(await estado(comNumero)).toMatchObject({ ativa: true, ilimitado: false, limite_dia: 3, usados_hoje: 0, bonus: 0, comprados: 0, disponivel: 3 });
    expect(await estado(teste)).toMatchObject({ ativa: true, limite_dia: 1, disponivel: 1 });
    // Plano sem número (elite) = zero crédito com a cota ligada.
    expect(await estado(semNumero)).toMatchObject({ ativa: true, ilimitado: false, limite_dia: 0, disponivel: 0 });
    await expect(consumir(semNumero, 1, `zero:${semNumero}`)).rejects.toThrow(/sem_credito/);
    // Equipe: ilimitada e nada é lançado.
    for (const uid of [U.admin, editor, revisor]) {
      expect(await estado(uid), uid).toMatchObject({ ativa: true, ilimitado: true, limite_dia: null, disponivel: null });
    }
    expect(await consumir(editor, 1, `equipe:${editor}`)).toMatchObject({ charged: false, bucket: "unlimited" });
    expect(await livro(editor)).toEqual([]);

    // O limite é do plano vivo: gastar até o limite e o próximo é recusado.
    await consumir(comNumero, 3, `limite:${comNumero}`);
    expect(await estado(comNumero)).toMatchObject({ usados_hoje: 3, disponivel: 0 });
    await expect(consumir(comNumero, 1, `limite2:${comNumero}`)).rejects.toThrow(/sem_credito/);

    // Ordem do débito trocada pelo administrador: o bônus sai antes da diária.
    await conceder(sobra, 2, "Para a ordem");
    await salvar({ ativa: true, match: { pro: 3, ordem: ["bonus", "daily", "purchased"] }, ia: {} });
    const r = await consumir(sobra, 3, `ordem:${sobra}`);
    expect(r.buckets.map((b: any) => [b.bucket, b.n])).toEqual([["bonus", 2], ["daily", 1]]);
    expect(await estado(sobra)).toMatchObject({ usados_hoje: 1, bonus: 0, disponivel: 2 });
  });

  it("o aluno não grava a chave 'creditos' por nenhum caminho (nem lê, direto na tabela)", async () => {
    await ligar({ pro: 3 });
    const antes = await getCfg();
    const tentar = async (uid: string, sql: string, params: unknown[] = []) => {
      try {
        return (await d.asUser(uid, sql, params)).affectedRows;
      } catch (e) {
        expect(String(e), sql).toMatch(/row-level security|permission denied/);
        return 0;
      }
    };
    for (const uid of [U.ana, U.bruno, revisor]) {
      expect(await tentar(uid, `update public.app_settings set value = '{}'::jsonb where key = 'creditos'`), uid).toBe(0);
      expect(await tentar(uid, `update public.app_settings set value = '{"ativa": true, "match": {"pro": 99999}}'::jsonb`), uid).toBe(0);
      expect(await tentar(uid, `delete from public.app_settings where key = 'creditos'`), uid).toBe(0);
      expect(await tentar(uid, `insert into public.app_settings (key, value) values ('creditos', '{}'::jsonb) on conflict (key) do update set value = excluded.value`), uid).toBe(0);
      // Não lê a configuração direto (só a equipe lê).
      expect(await d.asUser(uid, `select value from public.app_settings where key = 'creditos'`), uid).toEqual([]);
    }
    expect(await getCfg()).toEqual(antes);
    // A equipe (editor) lê, mas também não grava.
    expect((await d.asUser(editor, `select value from public.app_settings where key = 'creditos'`)).map((r) => r.value)).toEqual([antes]);
    expect(await tentar(editor, `update public.app_settings set value = '{}'::jsonb where key = 'creditos'`)).toBe(0);
    expect(await getCfg()).toEqual(antes);
  });

  // ------------------------------------------------------------------ concessão
  it("conceder entra como BÔNUS (kind grant, bucket bonus), aparece no extrato e no registro 'credito.conceder'", async () => {
    const aluno = await novo("pro", "Aluna Cortesia");
    await ligar({ pro: 2 });
    const r = await conceder(aluno, 7, "  Compensação de instabilidade  ", "clique-1");
    expect(r).toMatchObject({ already: false, bucket: "bonus" });
    expect(typeof r.ledger_id).toBe("number");

    const [linha, ...resto] = await livro(aluno);
    expect(resto).toEqual([]);
    expect(linha).toMatchObject({
      id: r.ledger_id, kind: "grant", bucket: "bonus", amount: 7, pool: "match", reason: "Compensação de instabilidade",
      created_by: U.admin, idem_key: "admin-grant:clique-1",
    });
    expect(linha.day).toBeInstanceOf(Date);
    expect(await estado(aluno)).toMatchObject({ bonus: 7, comprados: 0, limite_dia: 2, disponivel: 9 });

    const ext = await d.rpc(U.admin, "app_admin_credit_statement", { p_user: aluno, p_pool: "match", p_days: 30 });
    expect(ext.ledger).toEqual([expect.objectContaining({ id: r.ledger_id, kind: "grant", bucket: "bonus", amount: 7, reason: "Compensação de instabilidade", estornado: false })]);
    // O motivo também aparece para o próprio aluno (decisão do cabeçalho), mas sem chave interna e sem o autor.
    const meu = await d.asUser(aluno, `select id, kind, bucket, amount, reason from public.credit_ledger`);
    expect(meu).toEqual([{ id: r.ledger_id, kind: "grant", bucket: "bonus", amount: 7, reason: "Compensação de instabilidade" }]);
    await expect(d.asUser(aluno, `select idem_key from public.credit_ledger`)).rejects.toThrow(/permission denied/);

    const log = await registro("credito.conceder", aluno);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor_id: U.admin, details: { pool: "match", n: 7, motivo: "Compensação de instabilidade", ledger_id: r.ledger_id } });

    // Moeda da IA também.
    const ia = await conceder(aluno, 3, "Bônus IA", null, "ia");
    expect(ia.bucket).toBe("bonus");
    expect((await livro(aluno, "ia"))[0]).toMatchObject({ kind: "grant", bucket: "bonus", amount: 3, pool: "ia" });
    // O motivo é cortado em 300 caracteres.
    const longo = await conceder(aluno, 1, "m".repeat(400));
    expect((await livro(aluno)).find((l: any) => l.id === longo.ledger_id).reason).toHaveLength(300);
  });

  it("conceder: motivo obrigatório; quantidade fora de 1..10000, moeda inválida e aluno inexistente são recusados sem gravar nada", async () => {
    const aluno = await novo("pro");
    const logAntes = (await registro("credito.conceder")).length;
    for (const motivo of ["", "   ", null]) {
      await expect(conceder(aluno, 5, motivo as any), String(motivo)).rejects.toThrow(/Diga o motivo da concessão\./);
    }
    for (const n of [0, -1, -100, 10001, 100000]) {
      await expect(conceder(aluno, n), String(n)).rejects.toThrow(/Quantidade inválida: de 1 a 10000\./);
    }
    for (const pool of ["xyz", "", "Match", "purchased"]) await expect(conceder(aluno, 5, "Teste", null, pool), pool).rejects.toThrow(MOEDA);
    await expect(d.rpc(U.admin, "app_admin_credit_grant", { p_user: aluno, p_pool: null, p_n: 5, p_reason: "x" })).rejects.toThrow(MOEDA);
    await expect(d.rpc(U.admin, "app_admin_credit_grant", { p_user: aluno, p_pool: "match", p_n: null, p_reason: "x" })).rejects.toThrow(/Quantidade inválida/);
    await expect(conceder(randomUUID(), 5)).rejects.toThrow(NAO_ACHOU);
    await expect(d.rpc(U.admin, "app_admin_credit_grant", { p_user: null, p_pool: "match", p_n: 5, p_reason: "x" })).rejects.toThrow(NAO_ACHOU);
    expect(await livro(aluno)).toEqual([]);
    expect((await registro("credito.conceder")).length).toBe(logAntes);
    // Nos limites: 1 e 10000 valem.
    expect((await conceder(aluno, 1)).already).toBe(false);
    expect((await conceder(aluno, 10000)).already).toBe(false);
    expect((await estado(aluno)).bonus).toBe(0); // cota desligada: o estado esconde o saldo
    expect((await d.sql<any>(`select bonus_balance from public.credit_wallets where user_id = $1 and pool = 'match'`, [aluno]))[0].bonus_balance).toBe(10001);
  });

  it("a MESMA chave não concede duas vezes (already: true, saldo sobe uma vez, um só registro); sem chave cada chamada é uma concessão nova", async () => {
    const aluno = await novo("pro");
    const outro = await novo("pro");
    await ligar({ pro: 1 });
    const a = await conceder(aluno, 5, "Cortesia", "duplo-clique");
    const b = await conceder(aluno, 5, "Cortesia", "duplo-clique");
    expect(a.already).toBe(false);
    expect(b).toMatchObject({ already: true, ledger_id: a.ledger_id, bucket: "bonus" });
    // Mesmo com outros valores/motivo, a chave manda: devolve o que já foi feito.
    const c = await conceder(aluno, 9, "Outro motivo", "  duplo-clique  ");
    expect(c).toMatchObject({ already: true, ledger_id: a.ledger_id });
    expect((await estado(aluno)).bonus).toBe(5);
    expect(await livro(aluno)).toHaveLength(1);
    expect(await registro("credito.conceder", aluno)).toHaveLength(1);
    // A chave de uma pessoa não vale para outra.
    await expect(conceder(outro, 5, "Cortesia", "duplo-clique")).rejects.toThrow(/Operação inválida\./);
    expect(await livro(outro)).toEqual([]);

    // Sem chave: duas chamadas, duas concessões.
    const x = await conceder(outro, 4, "Sem chave");
    const y = await conceder(outro, 4, "Sem chave");
    expect(x.ledger_id).not.toBe(y.ledger_id);
    expect([x.already, y.already]).toEqual([false, false]);
    expect((await estado(outro)).bonus).toBe(8);
    expect(await registro("credito.conceder", outro)).toHaveLength(2);
    // Chave vazia ou só espaços = sem chave.
    await conceder(outro, 1, "Vazia", "   ");
    await conceder(outro, 1, "Vazia", "   ");
    expect((await estado(outro)).bonus).toBe(10);
  });

  // ------------------------------------------------------------------ estorno
  it("estornar: motivo obrigatório; volta ao MESMO balde; segunda vez devolve already: true sem mexer no saldo; só consumo; fica no registro", async () => {
    const aluno = await novo("pro");
    await ligar({ pro: 2 });
    await conceder(aluno, 3, "Bônus");
    // 5 créditos: 2 da diária e 3 do bônus.
    const c = await consumir(aluno, 5, `estorno:${aluno}`);
    expect(c.buckets.map((b: any) => [b.bucket, b.n])).toEqual([["daily", 2], ["bonus", 3]]);
    expect(await estado(aluno)).toMatchObject({ usados_hoje: 2, bonus: 0, disponivel: 0 });
    const [diaria, bonus] = c.buckets.map((b: any) => b.ledger_id);

    const logAntes = (await registro("credito.estornar", aluno)).length;
    for (const motivo of ["", "   ", null]) await expect(estornar(diaria, motivo as any), String(motivo)).rejects.toThrow(/Diga o motivo do estorno\./);
    await expect(estornar(999999999, "Falha")).rejects.toThrow(/Lançamento não encontrado\./);
    expect((await estado(aluno)).usados_hoje).toBe(2);
    expect((await registro("credito.estornar", aluno)).length).toBe(logAntes);

    // Estorno do bônus: volta ao bônus (não à diária).
    const e1 = await estornar(bonus, "  Sala caiu  ");
    expect(e1).toMatchObject({ already: false, bucket: "bonus", same_day: true, compensacao: null });
    expect(await estado(aluno)).toMatchObject({ usados_hoje: 2, bonus: 3, disponivel: 3 });
    const [lanc] = (await livro(aluno)).filter((l: any) => l.id === e1.ledger_id);
    expect(lanc).toMatchObject({ kind: "refund", bucket: "bonus", amount: 3, reverses_id: bonus, reason: "Sala caiu", created_by: U.admin });

    // Segunda vez: já feito, nada muda (nem saldo, nem uso, nem livro, nem registro).
    const livroAntes = (await livro(aluno)).length;
    const e2 = await estornar(bonus, "Outra vez");
    expect(e2).toMatchObject({ already: true, ledger_id: e1.ledger_id, bucket: "bonus", compensacao: null });
    expect(await estado(aluno)).toMatchObject({ usados_hoje: 2, bonus: 3 });
    expect(await livro(aluno)).toHaveLength(livroAntes);

    // Estorno da diária: reduz o uso de hoje.
    const e3 = await estornar(diaria, "Falha técnica");
    expect(e3).toMatchObject({ already: false, bucket: "daily", same_day: true });
    expect(await estado(aluno)).toMatchObject({ usados_hoje: 0, bonus: 3, disponivel: 5 });
    expect((await estornar(diaria, "Falha técnica", true)).already).toBe(true);
    expect(await estado(aluno)).toMatchObject({ usados_hoje: 0, bonus: 3 });

    // Só consumo é estornável: concessão e estorno são recusados; o que não existe também.
    const g = await conceder(aluno, 1, "Outra concessão");
    await expect(estornar(g.ledger_id)).rejects.toThrow(/Só um consumo pode ser estornado\./);
    await expect(estornar(e1.ledger_id)).rejects.toThrow(/Só um consumo pode ser estornado\./);

    const log = await registro("credito.estornar", aluno);
    expect(log).toHaveLength(logAntes + 2);
    expect(log[0]).toMatchObject({ actor_id: U.admin, details: { pool: "match", consumo: bonus, n: 3, balde: "bonus", motivo: "Sala caiu", compensou: false } });
    expect(log[1].details).toMatchObject({ consumo: diaria, n: 2, balde: "daily", compensou: false });
    expect(String(log[1].details.dia)).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("estorno de consumo diário de DIA PASSADO: não reduz o uso de hoje; com compensar cria uma concessão de bônus separada; sem compensar, não", async () => {
    const semComp = await novo("pro");
    const comp = await novo("pro");
    await ligar({ pro: 2 });
    for (const uid of [semComp, comp]) {
      const c = await consumir(uid, 2, `passado:${uid}`, "match", ontem());
      expect(c.buckets).toEqual([expect.objectContaining({ bucket: "daily", n: 2 })]);
      // Hoje está intacto: a cota inteira.
      expect(await estado(uid)).toMatchObject({ usados_hoje: 0, disponivel: 2 });
    }
    const [consSem] = await livro(semComp);
    const [consComp] = await livro(comp);
    expect(String(consSem.day)).not.toBe(String((await d.sql<any>(`select public.credit_day(now()) as dia`))[0].dia));

    // Sem compensar.
    const e1 = await estornar(consSem.id, "Erro de ontem");
    expect(e1).toMatchObject({ already: false, bucket: "daily", same_day: false, compensacao: null });
    expect(await estado(semComp)).toMatchObject({ usados_hoje: 0, disponivel: 2 }); // não virou cota nova hoje
    const livroSem = await livro(semComp);
    expect(livroSem.map((l: any) => l.kind)).toEqual(["consume", "refund"]);
    expect(String(livroSem[1].day)).toBe(String(consSem.day)); // o estorno leva o dia do consumo
    expect(livroSem.some((l: any) => l.kind === "grant")).toBe(false);
    // O uso do dia de ontem foi reduzido (o resumo bate com o livro).
    expect((await d.sql<any>(`select used from public.credit_daily where user_id = $1 and pool = 'match' order by day`, [semComp])).map((r) => r.used)).toEqual([0]);
    expect((await registro("credito.estornar", semComp))[0].details.compensou).toBe(false);

    // Compensando: uma concessão de bônus separada, com a mesma quantidade e a chave compensa:<id>.
    const e2 = await estornar(consComp.id, "Erro de ontem", true);
    expect(e2).toMatchObject({ already: false, same_day: false });
    expect(e2.compensacao).toMatchObject({ already: false, bucket: "bonus" });
    const livroComp = await livro(comp);
    const grant = livroComp.find((l: any) => l.kind === "grant");
    expect(grant).toMatchObject({
      id: e2.compensacao.ledger_id, bucket: "bonus", amount: 2, pool: "match", idem_key: `compensa:${consComp.id}`, created_by: U.admin,
    });
    expect(grant.reason).toContain(`Compensação do estorno do lançamento ${consComp.id}`);
    expect(grant.reason).toContain("Erro de ontem");
    expect(livroComp.map((l: any) => l.kind)).toEqual(["consume", "refund", "grant"]);
    expect(await estado(comp)).toMatchObject({ usados_hoje: 0, bonus: 2, disponivel: 4 });
    expect((await registro("credito.estornar", comp))[0].details).toMatchObject({ compensou: true, balde: "daily", n: 2 });
    // Repetir não compensa de novo: devolve a MESMA concessão (idempotente pela chave compensa:<id>), sem lançar outra.
    const e3 = await estornar(consComp.id, "Erro de ontem", true);
    expect(e3).toMatchObject({ already: true });
    expect(e3.compensacao).toMatchObject({ already: true, ledger_id: e2.compensacao.ledger_id });
    expect((await livro(comp)).filter((l: any) => l.kind === "grant")).toHaveLength(1);
    expect((await estado(comp)).bonus).toBe(2);

    // Estorno simples primeiro e a compensação pedida depois (achado da revisão): concede uma vez, e só uma.
    const tarde = await novo("pro");
    const ct = await consumir(tarde, 1, `tarde:${tarde}`, "match", ontem());
    await estornar(ct.ledger_id, "Sem compensar", false);
    const et = await estornar(ct.ledger_id, "Agora compensar", true);
    expect(et).toMatchObject({ already: true });
    expect(et.compensacao).toMatchObject({ already: false, bucket: "bonus" });
    expect((await livro(tarde)).filter((l: any) => l.kind === "grant")).toHaveLength(1);

    // Mesmo dia + compensar: o uso de hoje já foi reduzido, então NÃO há compensação. E bônus de dia passado também não compensa.
    const hoje = await novo("pro");
    const ch = await consumir(hoje, 1, `hoje:${hoje}`);
    const eh = await estornar(ch.ledger_id, "Hoje mesmo", true);
    expect(eh).toMatchObject({ same_day: true, compensacao: null });
    expect((await livro(hoje)).some((l: any) => l.kind === "grant")).toBe(false);
  });

  // ------------------------------------------------------------------ extrato
  it("extrato: usuário (nome e e-mail), estado, lançamentos (com 'estornado') e cobranças; dias de 1 a 365; leitura vai para o registro; sem idem_key", async () => {
    const aluno = await novo("pro", "Marina Extrato");
    await ligar({ pro: 3 });
    const g = await conceder(aluno, 2, "Bônus do extrato", "chave-secreta-do-extrato");
    const c = await consumir(aluno, 4, `extrato:${aluno}`, "match"); // 3 diária + 1 bônus
    const [diaria, bonus] = c.buckets.map((b: any) => b.ledger_id);
    const e = await estornar(bonus, "Falha");
    const velho = await consumir(aluno, 1, `velho:${aluno}`, "match", ontem());
    // Uma cobrança de sala (match) deste aluno.
    const sala = await makeRoom(d.db, { members: [aluno, await novo("pro")], phase: "roles", station: null });
    await d.sql(
      `insert into public.study_room_charges (room_id, user_id, round, bucket, usage_date, ledger_id) values ($1, $2, 1, 'daily', public.credit_day(now()), $3)`,
      [sala, aluno, diaria],
    );

    const logAntes = (await registro("credito.extrato", aluno)).length;
    const ext = await d.rpc(U.admin, "app_admin_credit_statement", { p_user: aluno, p_pool: "match", p_days: 30 });
    expect(ext.user).toEqual({ id: aluno, name: "Marina Extrato", email: `${aluno}@teste.dev` });
    expect(ext).toMatchObject({ pool: "match", dias: 30 });
    expect(ext.state).toMatchObject({ ativa: true, limite_dia: 3, usados_hoje: 3, bonus: 2 });
    // Mais recentes primeiro; cada consumo diz se foi estornado.
    expect(ext.ledger.map((l: any) => [l.kind, l.bucket, l.amount, l.estornado])).toEqual([
      ["consume", "daily", 1, false], // o de ontem foi lançado depois
      ["refund", "bonus", 1, false],
      ["consume", "bonus", 1, true],
      ["consume", "daily", 3, false],
      ["grant", "bonus", 2, false],
    ]);
    expect(ext.ledger.map((l: any) => l.id)).toEqual([velho.ledger_id, e.ledger_id, bonus, diaria, g.ledger_id]);
    expect(ext.ledger.find((l: any) => l.id === e.ledger_id)).toMatchObject({ reverses_id: bonus, reason: "Falha", created_by: U.admin });
    expect(ext.cobrancas).toEqual([expect.objectContaining({ room_id: sala, round: 1, bucket: "daily", ledger_id: diaria })]);

    // Nada de chave interna, nem no texto bruto.
    const bruto = JSON.stringify(ext);
    expect(bruto).not.toContain("idem_key");
    expect(bruto).not.toContain("chave-secreta-do-extrato");
    expect(bruto).not.toContain("admin-grant");
    expect(bruto).not.toContain("refund:");

    // A leitura fica no registro, com o autor, a moeda e os dias.
    const log = await registro("credito.extrato", aluno);
    expect(log).toHaveLength(logAntes + 1);
    expect(log[log.length - 1]).toMatchObject({ actor_id: U.admin, details: { pool: "match", dias: 30 } });

    // Dias: 1 a 365 (limita); sem valor = 30.
    const dias = async (p: number | null) => (await d.rpc(U.admin, "app_admin_credit_statement", { p_user: aluno, p_pool: "match", p_days: p })).dias;
    expect(await dias(0)).toBe(1);
    expect(await dias(-7)).toBe(1);
    expect(await dias(1)).toBe(1);
    expect(await dias(365)).toBe(365);
    expect(await dias(400)).toBe(365);
    expect(await dias(100000)).toBe(365);
    expect(await dias(null)).toBe(30);
    expect((await d.rpc(U.admin, "app_admin_credit_statement", { p_user: aluno, p_pool: "match" })).dias).toBe(30);
    // Um dia só: o lançamento de ontem some; com dois dias, volta.
    const um = await d.rpc(U.admin, "app_admin_credit_statement", { p_user: aluno, p_pool: "match", p_days: 1 });
    expect(um.ledger.map((l: any) => l.id)).not.toContain(velho.ledger_id);
    expect(um.ledger).toHaveLength(4);
    const dois = await d.rpc(U.admin, "app_admin_credit_statement", { p_user: aluno, p_pool: "match", p_days: 2 });
    expect(dois.ledger.map((l: any) => l.id)).toContain(velho.ledger_id);
    expect(await d.sql(`select 1 from public.admin_audit_log where action = 'credito.extrato' and target = $1 and details ->> 'dias' = '365'`, [aluno])).not.toEqual([]);

    // Moeda inválida e aluno inexistente: recusados e sem registro.
    const logDepois = (await registro("credito.extrato")).length;
    for (const pool of ["xyz", null, ""]) {
      await expect(d.rpc(U.admin, "app_admin_credit_statement", { p_user: aluno, p_pool: pool, p_days: 30 }), String(pool)).rejects.toThrow(MOEDA);
    }
    await expect(d.rpc(U.admin, "app_admin_credit_statement", { p_user: randomUUID(), p_pool: "match", p_days: 30 })).rejects.toThrow(NAO_ACHOU);
    await expect(d.rpc(U.admin, "app_admin_credit_statement", { p_user: null, p_pool: "match", p_days: 30 })).rejects.toThrow(NAO_ACHOU);
    expect((await registro("credito.extrato")).length).toBe(logDepois);

    // Moeda da IA: só os lançamentos dela.
    const vazio = await d.rpc(U.admin, "app_admin_credit_statement", { p_user: aluno, p_pool: "ia", p_days: 30 });
    expect(vazio).toMatchObject({ pool: "ia", ledger: [] });
  });

  // ------------------------------------------------------------------ uso de hoje
  it("uso de hoje: soma créditos, alunos e salas de hoje por moeda (dia passado e cobrança de ontem não entram)", async () => {
    const hoje = () => d.rpc(U.admin, "app_admin_credit_today");
    const dia = (await d.sql<any>(`select public.credit_day(now())::text as dia`))[0].dia;
    // Cota desligada: o campo diz isso.
    const antes0 = await hoje();
    expect(antes0).toMatchObject({ day: dia, ativa: false });
    expect(Object.keys(antes0.match).sort()).toEqual(["alunos", "creditos", "salas"]);
    expect(Object.keys(antes0.ia).sort()).toEqual(["alunos", "creditos"]);

    const [a, b, c] = [await novo("pro"), await novo("pro"), await novo("pro")];
    await ligar({ pro: 5 }, { pro: { dia: 4 } });
    const antes = await hoje();
    expect(antes.ativa).toBe(true);

    const la = await consumir(a, 2, `hj-a1:${a}`);
    const lb = await consumir(b, 1, `hj-b1:${b}`);
    const la2 = await consumir(a, 1, `hj-a2:${a}`);
    await consumir(a, 1, `hj-a-ontem:${a}`, "match", ontem()); // dia passado: não conta
    await consumir(c, 3, `hj-c-ia:${c}`, "ia");
    // Salas: duas com cobrança de hoje (uma com dois alunos), uma só de ontem.
    const sala1 = await makeRoom(d.db, { members: [a, b], phase: "roles", station: null });
    const sala2 = await makeRoom(d.db, { members: [a, c], phase: "roles", station: null });
    const sala3 = await makeRoom(d.db, { members: [b, c], phase: "roles", station: null });
    const cobrar = (sala: string, uid: string, lid: number, usage = "public.credit_day(now())") =>
      d.sql(`insert into public.study_room_charges (room_id, user_id, round, bucket, usage_date, ledger_id) values ($1, $2, 1, 'daily', ${usage}, $3)`, [sala, uid, lid]);
    await cobrar(sala1, a, la.ledger_id);
    await cobrar(sala1, b, lb.ledger_id);
    await cobrar(sala2, a, la2.ledger_id);
    await cobrar(sala3, b, lb.ledger_id, "public.credit_day(now()) - 1");

    const depois = await hoje();
    expect(depois.day).toBe(dia);
    expect(depois.match.creditos - antes.match.creditos).toBe(4); // 2 + 1 + 1
    expect(depois.match.alunos - antes.match.alunos).toBe(2);
    expect(depois.match.salas - antes.match.salas).toBe(2);
    expect(depois.ia.creditos - antes.ia.creditos).toBe(3);
    expect(depois.ia.alunos - antes.ia.alunos).toBe(1);
    // Os números são inteiros (não texto).
    for (const v of [...Object.values(depois.match), ...Object.values(depois.ia)]) expect(typeof v).toBe("number");

    // Estornar reduz o uso de hoje; quem fica com zero deixa de contar como aluno.
    await estornar(lb.ledger_id, "Teste do hoje");
    const apos = await hoje();
    expect(apos.match.creditos - depois.match.creditos).toBe(-1);
    expect(apos.match.alunos - depois.match.alunos).toBe(-1);
  });

  // ------------------------------------------------------------------ conciliação
  it("conciliação: ok depois de consumos, estornos e concessões; adulterar à mão é detectado (e consertar volta ao normal); fica no registro", async () => {
    const [a, b] = [await novo("pro"), await novo("pro")];
    await ligar({ pro: 3 }, { pro: { dia: 2 } });
    // Sequência: concessão, consumos (diária + bônus), estornos (um de dia passado, com compensação), IA.
    await conceder(a, 4, "Reconciliar");
    const c1 = await consumir(a, 5, `rec-a:${a}`);
    await estornar(c1.buckets[1].ledger_id, "Falha");
    const velho = await consumir(b, 2, `rec-b:${b}`, "match", ontem());
    await estornar(velho.ledger_id, "Ontem", true);
    const i1 = await consumir(a, 2, `rec-ia:${a}`, "ia");
    await conceder(b, 3, "Bônus IA", null, "ia");
    await estornar(i1.ledger_id, "IA");

    const logAntes = (await registro("credito.conciliar")).length;
    const ok = await d.rpc(U.admin, "app_admin_credit_reconcile", { p_pool: "match" });
    expect(ok).toEqual({ pool: "match", ok: true, total: 0, problemas: [] });
    expect(await d.rpc(U.admin, "app_admin_credit_reconcile", { p_pool: "ia" })).toEqual({ pool: "ia", ok: true, total: 0, problemas: [] });
    const log = await registro("credito.conciliar");
    expect(log).toHaveLength(logAntes + 2);
    expect(log.slice(-2).map((l: any) => [l.target, l.actor_id, l.details])).toEqual([
      ["match", U.admin, { ok: true, total: 0 }],
      ["ia", U.admin, { ok: true, total: 0 }],
    ]);

    // 1) Uso do dia adulterado.
    const hojeDia = (await d.sql<any>(`select public.credit_day(now())::text as dia`))[0].dia;
    await d.sql(`update public.credit_daily set used = used + 1 where user_id = $1 and pool = 'match' and day = $2::date`, [a, hojeDia]);
    try {
      const r = await d.rpc(U.admin, "app_admin_credit_reconcile", { p_pool: "match" });
      expect(r.ok).toBe(false);
      expect(r.total).toBe(1);
      expect(r.problemas).toEqual([{ tipo: "uso_do_dia", user_id: a, day: hojeDia, no_resumo: 4, no_livro: 3 }]);
      // A moeda da IA não é afetada.
      expect((await d.rpc(U.admin, "app_admin_credit_reconcile", { p_pool: "ia" })).ok).toBe(true);
      const ultimo = (await registro("credito.conciliar", "match")).pop();
      expect(ultimo.details).toEqual({ ok: false, total: 1 });
    } finally {
      await d.sql(`update public.credit_daily set used = used - 1 where user_id = $1 and pool = 'match' and day = $2::date`, [a, hojeDia]);
    }
    expect((await d.rpc(U.admin, "app_admin_credit_reconcile", { p_pool: "match" })).ok).toBe(true);

    // 2) Saldo de bônus adulterado.
    await d.sql(`update public.credit_wallets set bonus_balance = bonus_balance + 1 where user_id = $1 and pool = 'match'`, [b]);
    try {
      const r = await d.rpc(U.admin, "app_admin_credit_reconcile", { p_pool: "match" });
      expect(r.ok).toBe(false);
      expect(r.problemas.map((p: any) => [p.tipo, p.user_id])).toEqual([["saldo_bonus", b]]);
      expect(r.problemas[0].no_resumo - r.problemas[0].no_livro).toBe(1);
    } finally {
      await d.sql(`update public.credit_wallets set bonus_balance = bonus_balance - 1 where user_id = $1 and pool = 'match'`, [b]);
    }

    // 3) Cobrança de sala sem o lançamento do próprio aluno.
    const sala = await makeRoom(d.db, { members: [a, b], phase: "roles", station: null });
    await d.sql(
      `insert into public.study_room_charges (room_id, user_id, round, bucket, usage_date, ledger_id) values ($1, $2, 1, 'daily', public.credit_day(now()), $3)`,
      [sala, b, c1.buckets[0].ledger_id], // lançamento do aluno A cobrado em nome do B
    );
    try {
      const r = await d.rpc(U.admin, "app_admin_credit_reconcile", { p_pool: "match" });
      expect(r.ok).toBe(false);
      expect(r.problemas).toEqual([{ tipo: "cobranca_sem_lancamento", room_id: sala, user_id: b, round: 1 }]);
      expect((await d.rpc(U.admin, "app_admin_credit_reconcile", { p_pool: "ia" })).ok).toBe(true);
    } finally {
      await d.sql(`delete from public.study_room_charges where room_id = $1`, [sala]);
    }
    expect((await d.rpc(U.admin, "app_admin_credit_reconcile", { p_pool: "match" })).ok).toBe(true);

    // Moeda inválida: recusada e sem registro.
    const logDepois = (await registro("credito.conciliar")).length;
    for (const pool of ["xyz", null, ""]) await expect(d.rpc(U.admin, "app_admin_credit_reconcile", { p_pool: pool }), String(pool)).rejects.toThrow(MOEDA);
    expect((await registro("credito.conciliar")).length).toBe(logDepois);
  });

  // ------------------------------------------------------------------ permissões
  it("permissões: fechadas para anon, abertas para authenticated; security definer com search_path vazio; as que gravam não são stable", async () => {
    const rows = await d.sql<any>(
      `select p.oid::regprocedure::text as id, p.prosecdef, p.provolatile, 'search_path=""' = any (p.proconfig) as sp,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as logado,
              p.proacl::text as acl
         from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'app_admin_credit%' or p.proname = 'app_admin_save_credit_config')
        order by 1`,
    );
    expect(rows.map((r: any) => r.id).sort()).toEqual([...FUNCOES].sort());
    for (const r of rows) {
      expect(r.anon, `${r.id} anon`).toBe(false);
      expect(r.logado, `${r.id} authenticated`).toBe(true);
      expect(r.prosecdef, `${r.id} security definer`).toBe(true);
      expect(r.sp, `${r.id} search_path`).toBe(true);
      expect(r.acl, `${r.id} acl`).not.toMatch(/(^|[{,])=X/); // nada para "public"
    }
    const vol = Object.fromEntries(rows.map((r: any) => [r.id, r.provolatile]));
    // Só leem: stable. As que gravam (configuração, concessão, estorno, extrato e conciliação deixam registro): não stable.
    expect(vol["app_admin_credit_config()"]).toBe("s");
    expect(vol["app_admin_credit_today()"]).toBe("s");
    for (const f of [
      "app_admin_save_credit_config(jsonb)", "app_admin_credit_grant(uuid,text,integer,text,text)", "app_admin_credit_refund(bigint,text,boolean)",
      "app_admin_credit_statement(uuid,text,integer)", "app_admin_credit_reconcile(text)",
    ]) expect(vol[f], f).not.toBe("s");

    // As internas credit_* continuam fechadas para o aluno e para o visitante.
    await expect(d.asUser(U.ana, `select public.credit_grant('${U.ana}'::uuid, 'match', 99, 'x', 'burla')`)).rejects.toThrow(/permission denied/);
    await expect(d.asUser(U.ana, `select public.credit_refund(1, 'x')`)).rejects.toThrow(/permission denied/);
  });

  // ------------------------------------------------------------------ colagem
  it("colar a migração duas vezes dá o mesmo banco: o retrato das funções (definição e permissões) não muda", async () => {
    const retrato = async () => ({
      funcoes: await d.sql(
        `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
           from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`,
      ),
      politicas: await d.sql(`select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' order by 1, 2`),
      regras: await d.sql(`select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as def from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
      gatilhos: await d.sql(`select tgname from pg_trigger where not tgisinternal order by 1`),
      config: await d.sql(`select key, value from public.app_settings order by key`),
      livro: await d.sql(`select count(*)::int as n, coalesce(sum(amount), 0)::int as soma from public.credit_ledger`),
    });
    const antes = await retrato();
    const logAntes = await nLog();
    await d.db.exec(SQL);
    expect(await retrato()).toEqual(antes);
    expect(await nLog()).toBe(logAntes); // colar não grava nada no registro
    // E a segunda colagem também.
    await d.db.exec(SQL);
    expect(await retrato()).toEqual(antes);
    // As 7 funções continuam lá, com as mesmas permissões.
    const acl = Object.fromEntries((antes.funcoes as any[]).map((f) => [f.id, f.acl]));
    for (const f of FUNCOES) expect(acl[f], f).toBeTruthy();
    // E ainda funcionam depois de coladas de novo.
    expect(await config()).toEqual(PADRAO);
  });
});
