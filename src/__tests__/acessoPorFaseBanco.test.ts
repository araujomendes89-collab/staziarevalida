// @vitest-environment node
/**
 * 2ª fase pela chave "prática" dos planos novos (migração 20261003014220_treino_dupla_acesso_por_fase.sql, 19/10/2026).
 * Num Postgres em memória (PGlite) com TODAS as migrações, SEM o espelho dos planos antigos dos outros testes do Treino.
 *
 * Cada perfil, com a chave treino_dupla DESLIGADA e LIGADA:
 *   visitante, teste grátis da 1ª fase, PRO pago, PRO vencido, PRÁTICA pago (dado pela equipe), ELITE pago, PRÁTICA vencido,
 *   teste grátis da 2ª fase, revisor médico, editor e administrador.
 * Regra: equipe sempre; chave desligada = só a equipe (o revisor segue no Treino em Dupla, regra de 17/10); chave ligada =
 * PRÁTICA/ELITE pagos têm tudo; teste da 2ª fase e 2ª fase vencida ficam na amostra (1 estação sozinho por dia, sem Dupla);
 * PRO e teste da 1ª fase ficam trancados, com a mensagem de compra e PRÁTICA/ELITE "em breve".
 * Também: só o PRO à venda até a 2ª fase abrir (pedido de PRÁTICA/ELITE recusado), colar duas vezes, desfazer e a conferência.
 * Nenhuma IA, rede ou chave.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, STATION, U, addStation, darPratica, openDuplaDb, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const ROOT = path.resolve(__dirname, "../..");
const MIGRACAO = path.join(MIGRATIONS_DIR, "20261003014220_treino_dupla_acesso_por_fase.sql");
const DESFAZER = path.join(ROOT, "supabase/desfazer/20261003014220_treino_dupla_acesso_por_fase.desfazer.sql");
const CONFERIR = path.join(ROOT, "supabase/conferir/acesso-por-fase.sql");
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();

const EDITOR = "00000000-0000-4000-8000-0000000000e2";
const REVISOR = "00000000-0000-4000-8000-0000000000f2";

// quem é quem (contas de teste)
const P = {
  teste1: U.ana, // teste grátis da 1ª fase, no prazo
  proPago: U.bruno,
  proVencido: U.carla,
  praticaPago: U.diego, // PRÁTICA dado pela equipe (Administração > Usuários), teste já acabado
  elitePago: U.eva,
  praticaVencido: U.fabio,
  teste2: U.gil, // teste grátis da 2ª fase
} as const;

type Esperado = { permitido: boolean; fase2: "liberado" | "amostra" | "trancado"; dupla: "liberado" | "amostra" | "trancado"; telas: boolean };
// chave LIGADA
const LIGADA: Record<string, Esperado> = {
  [P.teste1]: { permitido: false, fase2: "trancado", dupla: "trancado", telas: false },
  [P.proPago]: { permitido: false, fase2: "trancado", dupla: "trancado", telas: false },
  [P.proVencido]: { permitido: false, fase2: "trancado", dupla: "trancado", telas: false },
  [P.praticaPago]: { permitido: true, fase2: "liberado", dupla: "liberado", telas: true },
  [P.elitePago]: { permitido: true, fase2: "liberado", dupla: "liberado", telas: true },
  [P.praticaVencido]: { permitido: false, fase2: "amostra", dupla: "trancado", telas: true },
  [P.teste2]: { permitido: false, fase2: "amostra", dupla: "trancado", telas: true },
  [REVISOR]: { permitido: true, fase2: "liberado", dupla: "liberado", telas: true },
  [EDITOR]: { permitido: true, fase2: "liberado", dupla: "liberado", telas: true },
  [U.admin]: { permitido: true, fase2: "liberado", dupla: "liberado", telas: true },
};
const NOME: Record<string, string> = {
  [P.teste1]: "teste grátis da 1ª fase",
  [P.proPago]: "PRO pago",
  [P.proVencido]: "PRO vencido",
  [P.praticaPago]: "PRÁTICA pago",
  [P.elitePago]: "ELITE pago",
  [P.praticaVencido]: "PRÁTICA vencido",
  [P.teste2]: "teste grátis da 2ª fase",
  [REVISOR]: "revisor médico",
  [EDITOR]: "editor (equipe)",
  [U.admin]: "administrador (equipe)",
};
const EQUIPE = new Set<string>([EDITOR, U.admin]);

describe("2ª fase pela chave 'prática' (014220)", () => {
  let d: DuplaDb;

  const acesso = (uid: string) => d.rpc(uid, "app_dupla_access");
  const telasAbrem = async (uid: string) => d.rpc(uid, "app_fase2_overview").then(() => true, () => false);
  const ligar = (aberto: boolean) => setDupla(d.db, { aberto, planos: ["pro", "elite"] });

  beforeAll(async () => {
    d = await openDuplaDb({ espelhoPlanosAntigos: false });
    for (const [id, email] of [[EDITOR, "editor2@teste.dev"], [REVISOR, "revisor2@teste.dev"]]) {
      await d.db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name: "Equipe" }]);
    }
    await d.sql(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
    await d.sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [REVISOR]);
    await addStation(d.db);
    await addStation(d.db, { ...STATION, id: "teste-dupla-e02", name: "Segunda estação de teste" });
    await addStation(d.db, { ...STATION, id: "teste-dupla-e03", name: "Estação só dos planos pagos" }, { is_pro_only: true });

    await setPlan(d.db, P.teste1, "trial", "trialing", daqui(7));
    await setPlan(d.db, P.proPago, "pro", "active");
    await setPlan(d.db, P.proVencido, "pro", "expired");
    await d.sql(`update public.subscriptions set current_period_end = now() - interval '10 days' where user_id = $1`, [P.proVencido]);
    await setPlan(d.db, P.elitePago, "elite", "active");
    // PRÁTICA pago: o teste do cadastro acabou e a equipe deu o PRÁTICA (como em Administração > Usuários)
    await setPlan(d.db, P.praticaPago, "trial", "canceled", daqui(-3));
    await d.rpc(U.admin, "app_admin_direitos_dar_plano", { p_busca: "diego@teste.dev", p_plano: "pratica", p_ate: daqui(30), p_motivo: "teste do acesso por fase" });
    // PRÁTICA vencido: o plano por fase acabou ontem
    await setPlan(d.db, P.praticaVencido, "trial", "canceled", daqui(-3));
    await darPratica(d.db, P.praticaVencido, { dias: -1 });
    // teste da 2ª fase: escolhido quando a 2ª fase estava aberta aos alunos (depois ela fecha de novo: o acesso não depende disso)
    await setPlan(d.db, P.teste2, "trial", "trialing", daqui(7));
    await d.sql(`update public.direitos_config set fase2_aberta_alunos = true`);
    await d.sql(`select public.direitos_escolher_teste($1, 'pratica')`, [P.teste2]);
    await d.sql(`update public.direitos_config set fase2_aberta_alunos = false`);
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });

  it("o banco montado é o esperado: fase 'prática' de cada um pela regra central dos planos", async () => {
    const pratica = async (uid: string) => (await d.sql(`select public.direitos_do_aluno($1) #>> '{fases,pratica,situacao}' s`, [uid]))[0].s;
    expect(await pratica(P.teste1)).toBe("sem_acesso");
    expect(await pratica(P.proPago)).toBe("sem_acesso");
    expect(await pratica(P.proVencido)).toBe("sem_acesso");
    expect(await pratica(P.praticaPago)).toBe("paga");
    expect(await pratica(P.elitePago)).toBe("paga");
    expect(await pratica(P.praticaVencido)).toBe("vencida");
    expect(await pratica(P.teste2)).toBe("teste");
  });

  it("chave DESLIGADA: só a equipe entra; o revisor médico segue no Treino em Dupla (regra de 17/10), mas não nas telas da 2ª fase", async () => {
    await ligar(false);
    for (const uid of Object.keys(LIGADA)) {
      const a = await acesso(uid);
      const equipe = EQUIPE.has(uid);
      expect(a.aberto, NOME[uid]).toBe(false);
      expect(a.equipe, NOME[uid]).toBe(equipe);
      expect(a.permitido, NOME[uid]).toBe(equipe || uid === REVISOR);
      expect(a.fase2.acesso, NOME[uid]).toBe(equipe ? "liberado" : "trancado");
      expect(a.dupla.acesso, NOME[uid]).toBe(equipe ? "liberado" : "trancado");
      if (!equipe) expect(a.fase2.motivo, NOME[uid]).toBe("fase2_fechada");
      expect(await telasAbrem(uid), NOME[uid]).toBe(equipe);
    }
  });

  it("chave LIGADA: PRÁTICA/ELITE pagos entram em tudo; teste da 2ª fase e 2ª fase vencida na amostra sem Dupla; PRO e teste da 1ª fase trancados", async () => {
    await ligar(true);
    for (const [uid, e] of Object.entries(LIGADA)) {
      const a = await acesso(uid);
      expect(a.aberto, NOME[uid]).toBe(true);
      expect(a.permitido, NOME[uid]).toBe(e.permitido);
      expect(a.fase2.acesso, NOME[uid]).toBe(e.fase2);
      expect(a.dupla.acesso, NOME[uid]).toBe(e.dupla);
      expect(await telasAbrem(uid), NOME[uid]).toBe(e.telas);
      // as funções do Treino em Dupla obedecem ao mesmo "permitido"
      const dupla = await d.rpc(uid, "app_dupla_stations").then(() => true, () => false);
      expect(dupla, NOME[uid]).toBe(e.permitido);
    }
    await ligar(false);
  });

  it("Banco de estações para quem treina sozinho (app_fase2_banco, decisão do dono 19/10): mesma lista da Dupla, porteiro da 2ª fase", async () => {
    await ligar(true);
    const lista = await d.rpc(P.elitePago, "app_fase2_banco");
    expect(lista.length).toBeGreaterThanOrEqual(3);
    expect(lista).toEqual(await d.rpc(P.elitePago, "app_dupla_stations"));
    // amostra: lê o Banco sem ter a Dupla
    for (const uid of [P.teste2, P.praticaVencido]) {
      expect((await d.rpc(uid, "app_fase2_banco")).map((x: any) => x.id), NOME[uid]).toEqual(lista.map((x: any) => x.id));
      await expect(d.rpc(uid, "app_dupla_stations"), NOME[uid]).rejects.toThrow(/Sem acesso ao Treinamento em Dupla/);
    }
    for (const uid of [P.teste1, P.proPago, P.proVencido]) {
      await expect(d.rpc(uid, "app_fase2_banco"), NOME[uid]).rejects.toThrow(/2ª fase ainda não está aberta para o seu perfil/);
    }
    await expect(d.rpc(null, "app_fase2_banco")).rejects.toThrow();
    // chave desligada: só a equipe
    await ligar(false);
    await expect(d.rpc(P.elitePago, "app_fase2_banco")).rejects.toThrow(/ainda não está aberta/);
    expect(Array.isArray(await d.rpc(U.admin, "app_fase2_banco"))).toBe(true);
  });

  it("visitante: nada abre", async () => {
    await ligar(true);
    for (const fn of ["app_dupla_access", "app_dupla_stations", "app_fase2_overview", "app_fase2_stations"]) {
      await expect(d.rpc(null, fn), fn).rejects.toThrow();
    }
    expect((await d.sql(`select public.dupla_allowed(null) ok`))[0].ok).toBe(false);
    expect((await d.sql(`select public.fase2_acesso(null, 'estacoes') a`))[0].a).toMatchObject({ acesso: "trancado", motivo: "sem_login" });
    await ligar(false);
  });

  it("mensagem de compra: PRO vê 'não está no seu acesso' e PRÁTICA/ELITE em breve (só o PRO está à venda)", async () => {
    await ligar(true);
    const a = await acesso(P.proPago);
    expect(a.planos).toEqual(["pratica", "elite"]);
    expect(a.dupla).toMatchObject({ motivo: "fase_nao_incluida", mensagem: "Faz parte da 2ª fase (prova prática), que não está no seu acesso." });
    expect(a.dupla.ofertas).toEqual([
      { tipo: "assinar", plano: "pratica", nome: "PRÁTICA", a_venda: false, em_breve: true },
      { tipo: "assinar", plano: "elite", nome: "ELITE", a_venda: false, em_breve: true },
    ]);
    // amostra: o Treino em Dupla não faz parte; as estações sim, 1 por dia
    const v = await acesso(P.praticaVencido);
    expect(v.dupla).toMatchObject({ acesso: "trancado", motivo: "fora_da_amostra", mensagem: "Treino em Dupla não faz parte da amostra da 2ª fase. Assine para liberar." });
    expect(v.fase2).toMatchObject({ acesso: "amostra", motivo: "amostra_vencida", amostra: { modo: "por_dia", limite: 1, unidade: "estação por dia" } });
    expect((await acesso(P.teste2)).fase2).toMatchObject({ acesso: "amostra", motivo: "amostra_do_teste" });
    // quando a 2ª fase abrir e o dono marcar PRÁTICA à venda, a oferta muda sozinha
    await d.sql(`update public.direitos_config set fase2_aberta_alunos = true`);
    await d.sql(`update public.direitos_planos set a_venda = true where codigo = 'pratica'`);
    expect((await acesso(P.proPago)).dupla.ofertas[0]).toMatchObject({ plano: "pratica", a_venda: true, em_breve: false });
    await d.sql(`update public.direitos_planos set a_venda = false where codigo = 'pratica'`);
    await d.sql(`update public.direitos_config set fase2_aberta_alunos = false`);
    // liberado não leva oferta
    expect((await acesso(P.elitePago)).dupla).toMatchObject({ acesso: "liberado", ofertas: [] });
    await ligar(false);
  });

  it("amostra no treino sozinho: 1 estação por dia; retomar a mesma não conta; outra recusa com a dica 'amostra:estacoes'", async () => {
    await ligar(true);
    const p = await d.rpc(P.teste2, "app_fase2_start", { p_station_id: STATION.id });
    expect(p).toBeTruthy();
    // retomar a mesma estação (mesma tentativa aberta): sem tentativa nova
    await d.rpc(P.teste2, "app_fase2_start", { p_station_id: STATION.id });
    expect(await d.sql(`select count(*)::int n from public.station_attempts where user_id = $1`, [P.teste2])).toEqual([{ n: 1 }]);
    const erro: any = await d.rpc(P.teste2, "app_fase2_start", { p_station_id: "teste-dupla-e02" }).catch((e) => e);
    expect(String(erro?.message)).toMatch(/Você já usou a amostra de hoje \(1 estação por dia\)/);
    expect(erro?.hint).toBe("amostra:estacoes");
    // a recusa desfaz tudo: a tentativa de antes continua aberta (não foi abandonada)
    expect(await d.sql(`select station_id, status from public.station_attempts where user_id = $1`, [P.teste2])).toEqual([{ station_id: STATION.id, status: "reading" }]);
    // amanhã tem mais: a tentativa de ontem não conta
    await d.sql(`update public.station_attempts set started_at = now() - interval '1 day' where user_id = $1`, [P.teste2]);
    await expect(d.rpc(P.teste2, "app_fase2_start", { p_station_id: "teste-dupla-e02" })).resolves.toBeTruthy();
    await ligar(false);
  });

  it("amostra não abre estação 'só dos planos pagos'; 2ª fase paga não tem limite do dia", async () => {
    await ligar(true);
    // app_fase2_start já recusa antes pela regra antiga das estações "só Pro" (has_pro; pendência documentada no relatório);
    // o gatilho da 014220 recusa também, caso essa conferência mude
    await expect(d.rpc(P.praticaVencido, "app_fase2_start", { p_station_id: "teste-dupla-e03" })).rejects.toThrow(/plano Pro|não faz parte da amostra/);
    // como faria uma função do app (dona do banco, com o login do aluno): o gatilho recusa
    const direto: any = await d.db
      .transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: P.praticaVencido, role: "authenticated" })]);
        await tx.query(`insert into public.station_attempts (user_id, station_id) values ($1, 'teste-dupla-e03')`, [P.praticaVencido]);
      })
      .catch((e) => e);
    expect(String(direto?.message)).toMatch(/não faz parte da amostra da 2ª fase/);
    expect(direto?.hint).toBe("cadeado:estacoes");
    for (const id of [STATION.id, "teste-dupla-e02", STATION.id, "teste-dupla-e03"]) {
      await expect(d.rpc(P.elitePago, "app_fase2_start", { p_station_id: id }), id).resolves.toBeTruthy();
    }
    // PRO: nem chega a começar (a 2ª fase não está no plano)
    await expect(d.rpc(P.proPago, "app_fase2_start", { p_station_id: STATION.id })).rejects.toThrow(/2ª fase ainda não está aberta para o seu perfil/);
    await ligar(false);
  });

  it("a equipe e o servidor gravando tentativas não passam pela amostra", async () => {
    await ligar(false);
    for (const id of [STATION.id, "teste-dupla-e02", "teste-dupla-e03"]) {
      await expect(d.rpc(U.admin, "app_fase2_start", { p_station_id: id }), id).resolves.toBeTruthy();
    }
    // gravação direta (dono do banco, sem login de aluno): o gatilho não age
    await d.sql(`insert into public.station_attempts (user_id, station_id, status) values ($1, $2, 'abandoned')`, [P.proPago, STATION.id]);
    await d.sql(`delete from public.station_attempts where user_id = $1`, [P.proPago]);
  });

  it("só o PRO à venda até a 2ª fase abrir: pedido de PRÁTICA/ELITE recusado, mesmo marcado 'à venda'; renovação passa", async () => {
    const pedido = (uid: string, codigo: string, motivo = "compra") =>
      d.sql(
        // gravado já "expirado" só para não esbarrar na regra de um pedido aberto por pessoa (o gatilho olha só a compra)
        `insert into public.billing_pedidos (user_id, tipo, codigo, ciclo, metodo, motivo, nome, valor_centavos, idem_chave, expira_em, status)
         values ($1, 'plano', $2, 'mensal', 'pix', $3, 'Plano de teste', 1000, $4, now() + interval '1 hour', 'expirado') returning id`,
        [uid, codigo, motivo, `idem-${codigo}-${motivo}-${Math.random().toString(36).slice(2, 10)}`]
      );
    await expect(pedido(P.teste1, "pro")).resolves.toHaveLength(1);
    await expect(pedido(P.teste1, "elite")).rejects.toThrow(/fora_de_venda: Este plano ainda não está à venda/);
    await expect(pedido(P.teste1, "pratica")).rejects.toThrow(/fora_de_venda/);
    await expect(pedido(P.teste1, "elite", "renovacao")).resolves.toHaveLength(1);
    // pelo caminho de verdade (função do servidor), com vendas ligadas e ELITE marcado "à venda" por engano
    await d.sql(`delete from public.billing_pedidos`);
    await d.sql(`update public.billing_config set vendas_ligadas = true`);
    await d.sql(`update public.direitos_planos set a_venda = true where codigo = 'elite'`);
    const abrir = () =>
      d.sql(`select public.ch_worker_billing_pedido_abrir($1, 'plano', 'elite', 'mensal', 'pix', 'compra', $2, null) p`, [P.teste1, `idem-elite-${Date.now()}`]);
    await expect(abrir()).rejects.toThrow(/fora_de_venda/);
    expect(await d.sql(`select 1 from public.billing_pedidos`)).toHaveLength(0);
    // com a 2ª fase aberta aos alunos, o mesmo pedido passa
    await d.sql(`update public.direitos_config set fase2_aberta_alunos = true`);
    await expect(abrir()).resolves.toHaveLength(1);
    await d.sql(`delete from public.billing_pedidos`);
    await d.sql(`update public.direitos_config set fase2_aberta_alunos = false`);
    await d.sql(`update public.direitos_planos set a_venda = false where codigo = 'elite'`);
    await d.sql(`update public.billing_config set vendas_ligadas = false`);
  });

  it("funções internas fora da API; app_dupla_access só para quem entra", async () => {
    const pode = async (fn: string, papel: string) =>
      (await d.sql(`select has_function_privilege($1, $2, 'execute') ok`, [papel, fn]))[0].ok;
    for (const fn of ["public.fase2_acesso(uuid,text)", "public.dupla_allowed(uuid)", "public.fase2_allowed()", "public.fase2_amostra_station_attempts()", "public.fase2_venda_pedidos()"]) {
      expect(await pode(fn, "authenticated"), fn).toBe(false);
      expect(await pode(fn, "anon"), fn).toBe(false);
    }
    expect(await pode("public.app_dupla_access()", "authenticated")).toBe(true);
    expect(await pode("public.app_dupla_access()", "anon")).toBe(false);
  });

  it("conferência (supabase/conferir/acesso-por-fase.sql): tudo ok com a chave desligada", async () => {
    await ligar(false);
    const linhas = (await d.db.query<{ item: string; ok: boolean }>(fs.readFileSync(CONFERIR, "utf8"))).rows;
    expect(linhas.length).toBeGreaterThanOrEqual(10);
    expect(linhas.filter((l) => !l.ok).map((l) => l.item)).toEqual([]);
  });

  it("colar duas vezes não muda nada; desfazer volta à regra antiga (PRO entra com a chave ligada) e colar de novo corrige", async () => {
    const defs = async () =>
      d.sql(`select p.oid::regprocedure::text id, pg_get_functiondef(p.oid) def from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname in ('fase2_acesso', 'dupla_allowed', 'app_dupla_access', 'fase2_allowed', 'fase2_assert', 'fase2_amostra_station_attempts', 'fase2_venda_pedidos', 'app_fase2_banco') order by 1`);
    const antes = await defs();
    await d.db.exec(fs.readFileSync(MIGRACAO, "utf8"));
    expect(await defs()).toEqual(antes);

    await ligar(true);
    await d.db.exec(fs.readFileSync(DESFAZER, "utf8"));
    await d.db.exec(fs.readFileSync(DESFAZER, "utf8")); // duas vezes
    expect((await acesso(P.proPago)).permitido).toBe(true); // a regra antiga: é exatamente o problema que a 014220 corrige
    expect((await acesso(P.proPago)).fase2).toBeUndefined();
    expect(await d.sql(`select tgname from pg_trigger where tgname in ('fase2_amostra_station_attempts', 'fase2_venda_pedidos')`)).toEqual([]);
    expect(await d.sql(`select 1 from pg_proc where proname in ('fase2_acesso', 'app_fase2_banco')`)).toEqual([]);

    await d.db.exec(fs.readFileSync(MIGRACAO, "utf8"));
    expect((await acesso(P.proPago)).permitido).toBe(false);
    expect(await defs()).toEqual(antes);
    await ligar(false);
  });
});
