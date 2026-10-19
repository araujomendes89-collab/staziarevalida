// @vitest-environment node
/**
 * Stazia Match · M2a · o crédito dos DOIS alunos sai no início confirmado da estação (migração 014050, app_dupla_start),
 * conferido num Postgres em memória (PGlite) com as regras reais (todas as migrações, em ordem).
 *
 * Regras que estes testes seguram (Review Focus do plano):
 *  - cota ligada: 1 crédito de CADA um, na mesma transação (ou os dois pagam, ou ninguém paga e a sala não muda);
 *  - falta de saldo de qualquer um: a MESMA mensagem neutra, sem saldo, sem limite e sem dizer quem falhou;
 *  - repetir o início nunca debita de novo; rodada extra ("Treinar outra estação") COBRA por padrão (decisão do dono de 17/10); só um
 *    creditos.match.cobra_rodada_extra = false explícito deixa de cobrar;
 *  - equipe não paga (linha 'unlimited', sem lançamento); cota desligada = comportamento de antes;
 *  - sair, falta de sinal, convite recusado ou vencido não devolvem nada sozinhos.
 *
 * Isolamento: o livro é só-acrescenta (não se apaga). Por isso cada teste cria as PRÓPRIAS contas ("conta()") e confere
 * tudo por conta e por sala; nenhum teste depende do que outro deixou no livro.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { MIGRATIONS_DIR, STATION, addStation, makeRoom, openDuplaDb, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const MIGRACAO = "20261003014050_treino_dupla_creditos_inicio.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8");
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();

const NEUTRA = "Não foi possível iniciar agora. Confirmem a cota de hoje e tentem de novo.";
const FASE = "Esta ação não vale nesta fase da sala.";
const SO_AVALIADOR = "Só o avaliador pode fazer isso.";
const NAO_PRONTOS = "Os dois precisam estar prontos.";
const SEM_SALA = "Sala não encontrada.";
const ABERTO = { aberto: true, planos: ["trial", "pro", "elite"] };

describe("Stazia Match · crédito no início da estação (app_dupla_start)", () => {
  let d: DuplaDb;

  // ------------------------------------------------------------------ apoios
  /** Liga (ou desliga) a cota. `match` troca os limites (padrão trial 2, pro 3, elite 5); `undefined` tira o número do plano. */
  const cota = async (ativa: boolean, match: Record<string, unknown> = {}) => {
    const valor = { ativa, match: { trial: 2, pro: 3, elite: 5, cobra_rodada_extra: false, ...match }, ia: {} };
    await d.sql(`update public.app_settings set value = $1::jsonb where key = 'creditos'`, [JSON.stringify(valor)]);
  };

  type Perfil = "trial" | "pro" | "elite" | "admin" | "editor" | "revisor";
  /** Conta nova só deste teste (o gatilho do cadastro cria perfil, papel e assinatura de teste). */
  const conta = async (perfil: Perfil = "pro"): Promise<string> => {
    const id = randomUUID();
    await d.sql(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)`, [id, `${id}@teste.dev`]);
    if (perfil === "pro" || perfil === "elite") await setPlan(d.db, id, perfil, "active");
    else if (perfil === "trial") await setPlan(d.db, id, "trial", "trialing", daqui(7));
    else if (perfil === "admin") await d.sql(`update public.user_roles set role = 'admin' where user_id = $1`, [id]);
    else if (perfil === "editor") await d.sql(`update public.user_roles set role = 'editor' where user_id = $1`, [id]);
    else await d.sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [id]);
    return id;
  };

  /** Sala em "setup" com os dois conectados, confirmados e prontos: `cand` é o candidato e `aval` o avaliador (quem inicia). */
  const sala = (cand: string, aval: string, o: { round?: number; phase?: "setup" | "roles" | "connecting" | "running" | "review" | "result" | "closed"; ready?: string[] } = {}) =>
    makeRoom(d.db, {
      members: [cand, aval], phase: o.phase ?? "setup", candidate: cand, evaluator: aval, round: o.round,
      extra: { ready_ids: o.ready ?? [cand, aval], confirmed_ids: [cand, aval], connected_ids: [cand, aval] },
    });

  const iniciar = (uid: string, id: string) => d.rpc<any>(uid, "app_dupla_start", { p_room_id: id });
  const estadoSala = (uid: string, id: string) => d.rpc<any>(uid, "app_dupla_room", { p_room_id: id });

  const gasta = (uid: string) =>
    d.sql(`select public.credit_consume($1::uuid, 'match', 1, 'teste', $2::uuid, $3) as r`, [uid, randomUUID(), `gasto-${randomUUID()}`]);
  const concede = (uid: string, n: number, bucket: "bonus" | "purchased") =>
    d.sql(`select public.credit_grant($1::uuid, 'match', $2::int, 'teste', $3, $4) as r`, [uid, n, `conc-${randomUUID()}`, bucket]);
  const disponivel = async (uid: string): Promise<number | null> =>
    (await d.sql(`select (public.credit_state($1::uuid, 'match') ->> 'disponivel')::int as n`, [uid]))[0].n;

  /** Lançamentos do livro desta sala. */
  const livro = (id: string) =>
    d.sql<any>(
      `select user_id, kind, bucket, amount, ref_type, ref_id, idem_key, day::text as day, id::int as id
         from public.credit_ledger where ref_id = $1 order by id`, [id]);
  const cobrancas = (id: string) =>
    d.sql<any>(
      `select user_id, round, bucket, usage_date::text as usage_date, ledger_id::int as ledger_id
         from public.study_room_charges where room_id = $1 order by round, user_id`, [id]);
  const linhaSala = async (id: string) =>
    (await d.sql<any>(`select phase, round, charged_at, started_at, closed_reason from public.checklist_rooms where id = $1`, [id]))[0];
  /** Tudo o que o livro tem em nome das contas (qualquer sala) e o uso do dia somado. */
  const lancamentos = async (...uids: string[]) =>
    (await d.sql<{ n: number }>(`select count(*)::int as n from public.credit_ledger where user_id = any ($1::uuid[])`, [uids]))[0].n;
  const uso = async (uid: string) =>
    (await d.sql<{ n: number }>(`select coalesce(sum(used), 0)::int as n from public.credit_daily where user_id = $1 and pool = 'match'`, [uid]))[0].n;

  const erroDe = async (p: Promise<unknown>): Promise<any> => {
    try {
      await p;
    } catch (e) {
      return e;
    }
    throw new Error("Era esperado um erro, mas a chamada deu certo.");
  };
  /** A mensagem neutra: erro de máquina 54000 + INSUFFICIENT_CREDITS, sem número, sem detalhe e sem nome. */
  const ehNeutraProxima = (e: any) => {
    expect(e.message).toBe("Não foi possível abrir outra estação agora. Confirmem a cota de hoje e tentem de novo.");
    expect(e.hint).toBe("INSUFFICIENT_CREDITS");
  };
  const ehNeutra = (e: any) => {
    expect(e.message).toBe(NEUTRA);
    expect(e.code).toBe("54000");
    expect(e.hint).toBe("INSUFFICIENT_CREDITS");
    expect(e.detail ?? null).toBeNull();
    expect(e.message).not.toMatch(/\d/);
  };

  /** Nada foi cobrado desta sala nem destas contas, e a sala segue em "setup". */
  const nadaPago = async (id: string, uids: string[], antes: number[]) => {
    expect(await livro(id)).toEqual([]);
    expect(await cobrancas(id)).toEqual([]);
    expect(await lancamentos(...uids)).toBe(antes.reduce((a, b) => a + b, 0));
    const s = await linhaSala(id);
    expect(s.phase).toBe("setup");
    expect(s.charged_at).toBeNull();
    expect(s.started_at).toBeNull();
  };

  beforeAll(async () => {
    d = await openDuplaDb();
    await setDupla(d.db, ABERTO);
    await addStation(d.db);
  }, 120_000);
  beforeEach(async () => {
    await cota(false);
  });
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ cota ligada
  it("cota ligada: iniciar debita 1 de CADA um, em dois lançamentos, e a sala vira 'running' com charged_at", async () => {
    await cota(true);
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await sala(cand, aval);

    const r = await iniciar(aval, id);
    expect(r.phase).toBe("running");
    expect(r.round).toBe(1);

    const l = await livro(id);
    expect(l).toHaveLength(2);
    expect(l.map((x: any) => x.user_id).sort()).toEqual([cand, aval].sort());
    for (const x of l) {
      expect(x).toMatchObject({ kind: "consume", bucket: "daily", amount: 1, ref_type: "room", ref_id: id, idem_key: `sala:${id}:${x.user_id}` });
    }

    const c = await cobrancas(id);
    expect(c).toHaveLength(2);
    expect(c.map((x: any) => x.user_id).sort()).toEqual([cand, aval].sort());
    for (const x of c) {
      expect(x.round).toBe(1);
      expect(x.bucket).toBe("daily");
      expect(x.ledger_id).not.toBeNull();
      // a cobrança aponta para o lançamento do MESMO aluno
      expect(l.find((y: any) => y.id === x.ledger_id)?.user_id).toBe(x.user_id);
    }

    const s = await linhaSala(id);
    expect(s.phase).toBe("running");
    expect(s.charged_at).not.toBeNull();
    expect(s.started_at).not.toBeNull();
    // uso do dia e sobra: 1 de 3 gasto em cada conta
    expect(await uso(cand)).toBe(1);
    expect(await uso(aval)).toBe(1);
    expect(await disponivel(cand)).toBe(2);
    expect(await disponivel(aval)).toBe(2);
  });

  // ------------------------------------------------------------------ falta de saldo
  it("avaliador sem crédito (já gastou): ninguém paga, a sala continua em 'setup', mensagem neutra; com bônus, inicia", async () => {
    await cota(true, { trial: 1 });
    const cand = await conta("pro");
    const aval = await conta("trial");
    await gasta(aval);
    const antes = [await lancamentos(cand), await lancamentos(aval)];
    const id = await sala(cand, aval);

    ehNeutra(await erroDe(iniciar(aval, id)));
    await nadaPago(id, [cand, aval], antes);
    expect(await uso(cand)).toBe(0); // o candidato, que tinha crédito, NÃO pagou
    expect(await uso(aval)).toBe(1);
    // a sala continua utilizável para os dois (sem mudar a revisão por causa da cobrança)
    expect((await estadoSala(cand, id)).phase).toBe("setup");

    // quem estava sem crédito ganha um bônus: a MESMA sala inicia, e o bônus paga o avaliador
    await concede(aval, 1, "bonus");
    const r = await iniciar(aval, id);
    expect(r.phase).toBe("running");
    const c = await cobrancas(id);
    expect(c.find((x: any) => x.user_id === aval)?.bucket).toBe("bonus");
    expect(c.find((x: any) => x.user_id === cand)?.bucket).toBe("daily");
    expect(await livro(id)).toHaveLength(2);
  });

  it("candidato sem crédito (plano sem número = zero): ninguém paga e a mensagem é IGUAL à de quando falta ao avaliador", async () => {
    await cota(true, { elite: undefined }); // elite sem número: com a cota ligada o limite é zero (falha fechada)
    const cand = await conta("elite");
    const aval = await conta("pro");
    expect(await disponivel(cand)).toBe(0);
    const antes = [await lancamentos(cand), await lancamentos(aval)];
    const id = await sala(cand, aval);

    const eCandidato = await erroDe(iniciar(aval, id));
    ehNeutra(eCandidato);
    await nadaPago(id, [cand, aval], antes);
    expect(await uso(aval)).toBe(0); // o avaliador, que tinha crédito, NÃO pagou

    // o mesmo cenário com a falta do lado do AVALIADOR (trocando os papéis das mesmas contas): texto idêntico
    const id2 = await sala(aval, cand); // agora o aluno sem número é quem inicia
    const eAvaliador = await erroDe(iniciar(cand, id2));
    ehNeutra(eAvaliador);
    expect(eAvaliador.message).toBe(eCandidato.message);
    expect(eAvaliador.hint).toBe(eCandidato.hint);
    expect(eAvaliador.code).toBe(eCandidato.code);
    await nadaPago(id2, [cand, aval], antes);

    // a sala não conta o saldo nem o motivo a ninguém: nenhuma das duas leituras traz esses campos
    for (const [uid, sid] of [[cand, id2], [aval, id2]] as const) {
      const texto = JSON.stringify(await estadoSala(uid, sid));
      expect(texto).not.toMatch(/bucket|idem_key|limit|saldo|credit|ledger|disponivel|usados|bonus|purchased|comprados|cota/i);
    }

    // comprados também pagam: com 1 crédito comprado o candidato (limite zero) passa a poder iniciar
    await concede(cand, 1, "purchased");
    expect((await iniciar(cand, id2)).phase).toBe("running");
    expect((await cobrancas(id2)).find((x: any) => x.user_id === cand)?.bucket).toBe("purchased");
  });

  it("os dois sem crédito: mesma mensagem neutra e nada no livro", async () => {
    await cota(true, { trial: 0, pro: 0 });
    const cand = await conta("trial");
    const aval = await conta("pro");
    const id = await sala(cand, aval);
    ehNeutra(await erroDe(iniciar(aval, id)));
    await nadaPago(id, [cand, aval], [0, 0]);
  });

  // ------------------------------------------------------------------ repetir
  it("repetir o início (clique duplo, outra aba): recusado pela fase e NÃO debita de novo", async () => {
    await cota(true);
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await sala(cand, aval);
    await iniciar(aval, id);
    const rev = (await d.sql<any>(`select rev from public.checklist_rooms where id = $1`, [id]))[0].rev;

    await expect(iniciar(aval, id)).rejects.toThrow(FASE);
    await expect(iniciar(cand, id)).rejects.toThrow(FASE);
    expect(await livro(id)).toHaveLength(2);
    expect(await cobrancas(id)).toHaveLength(2);
    expect(await uso(cand)).toBe(1);
    expect(await uso(aval)).toBe(1);
    expect((await d.sql<any>(`select rev from public.checklist_rooms where id = $1`, [id]))[0].rev).toBe(rev);
  });

  it("dois inícios ao mesmo tempo: um só vale, um débito por aluno (não dois)", async () => {
    await cota(true);
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await sala(cand, aval);
    // O PGlite tem uma conexão só e SERIALIZA as transações: a segunda roda depois da primeira e já encontra a sala em
    // 'running'. Num Postgres de verdade, a trava da linha da sala (for update) e a chave única do livro dão o mesmo resultado.
    const r = await Promise.allSettled([iniciar(aval, id), iniciar(aval, id)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const recusada = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(recusada.reason.message).toBe(FASE);
    expect(await livro(id)).toHaveLength(2);
    expect(await cobrancas(id)).toHaveLength(2);
    expect(await uso(cand)).toBe(1);
    expect(await uso(aval)).toBe(1);
  });

  it("segunda defesa: se a sala voltasse a 'setup', a chave por aluno impede o segundo débito", async () => {
    await cota(true);
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await sala(cand, aval);
    await iniciar(aval, id);
    const charged = (await linhaSala(id)).charged_at;

    await d.sql(`update public.checklist_rooms set phase = 'setup' where id = $1`, [id]); // adulteração, só para provar a trava
    const r = await iniciar(aval, id);
    expect(r.phase).toBe("running");
    expect(await livro(id)).toHaveLength(2); // nenhuma linha nova
    expect(await cobrancas(id)).toHaveLength(2);
    expect(await uso(cand)).toBe(1);
    expect(await uso(aval)).toBe(1);
    expect((await linhaSala(id)).charged_at).not.toBeNull();
    expect(charged).not.toBeNull();
  });

  // ------------------------------------------------------------------ pré-condições
  it("sem os dois prontos: nada consome", async () => {
    await cota(true);
    const cand = await conta("pro");
    const aval = await conta("pro");
    for (const ready of [[], [cand], [aval]]) {
      const id = await sala(cand, aval, { ready });
      await expect(iniciar(aval, id)).rejects.toThrow(NAO_PRONTOS);
      await nadaPago(id, [cand, aval], [0, 0]);
    }
  });

  it("quem não é o avaliador, quem não é da sala e o visitante: nada consome", async () => {
    await cota(true);
    const cand = await conta("pro");
    const aval = await conta("pro");
    const fora = await conta("pro");
    const id = await sala(cand, aval);
    await expect(iniciar(cand, id)).rejects.toThrow(SO_AVALIADOR);
    await expect(iniciar(fora, id)).rejects.toThrow(SEM_SALA);
    await expect(d.rpc(null, "app_dupla_start", { p_room_id: id })).rejects.toThrow(/permission denied/);
    await nadaPago(id, [cand, aval, fora], [0, 0, 0]);
  });

  it("fora da fase 'setup' (papéis, conexão, andamento, avaliação, resultado, fechada): nada consome", async () => {
    await cota(true);
    const cand = await conta("pro");
    const aval = await conta("pro");
    for (const phase of ["roles", "connecting", "running", "review", "result", "closed"] as const) {
      const id = await sala(cand, aval, { phase });
      await expect(iniciar(aval, id), phase).rejects.toThrow(FASE);
      expect(await livro(id), phase).toEqual([]);
      expect(await cobrancas(id), phase).toEqual([]);
      expect((await linhaSala(id)).charged_at, phase).toBeNull();
    }
    expect(await lancamentos(cand, aval)).toBe(0);
    expect(await uso(cand)).toBe(0);
    expect(await uso(aval)).toBe(0);
  });

  // ------------------------------------------------------------------ rodada extra
  /** Rodada 1 iniciada, resultado, "Treinar outra estação" (rodada 2) e a sala pronta em 'setup' de novo. */
  const ateRodada2 = async (cand: string, aval: string) => {
    const id = await sala(cand, aval);
    await iniciar(aval, id);
    await d.sql(`update public.checklist_rooms set phase = 'result' where id = $1`, [id]);
    const s = await d.rpc<any>(cand, "app_dupla_next_station", { p_room_id: id });
    expect(s).toMatchObject({ phase: "roles", round: 2 });
    await d.sql(
      `update public.checklist_rooms
          set phase = 'setup', candidate_id = $2, evaluator_id = $3, station_id = $4,
              ready_ids = $5::uuid[], confirmed_ids = $5::uuid[], connected_ids = $5::uuid[]
        where id = $1`,
      [id, cand, aval, STATION.id, [cand, aval]]
    );
    return id;
  };

  it("rodada 2 com cobra_rodada_extra = false DESLIGADO à mão na Administração: NÃO debita e não cria linha nova", async () => {
    await cota(true);
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await ateRodada2(cand, aval);
    const charged = (await linhaSala(id)).charged_at;
    expect(await livro(id)).toHaveLength(2);

    const r = await iniciar(aval, id);
    expect(r).toMatchObject({ phase: "running", round: 2 });
    expect(await livro(id)).toHaveLength(2);
    const c = await cobrancas(id);
    expect(c).toHaveLength(2);
    expect(c.every((x: any) => x.round === 1)).toBe(true);
    expect(await uso(cand)).toBe(1);
    expect(await uso(aval)).toBe(1);
    expect((await linhaSala(id)).charged_at).toEqual(charged); // a cobrança da rodada 1 continua sendo a única
  });

  it("rodada 2 com cobra_rodada_extra = true: debita uma vez por rodada, chave :r2:, linha com round 2 e a da rodada 1 permanece", async () => {
    await cota(true, { cobra_rodada_extra: true });
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await ateRodada2(cand, aval);
    const r1 = await cobrancas(id);
    expect(r1).toHaveLength(2);

    await iniciar(aval, id);
    const l = await livro(id);
    expect(l).toHaveLength(4);
    expect(l.map((x: any) => x.idem_key).sort()).toEqual(
      [`sala:${id}:${cand}`, `sala:${id}:${aval}`, `sala:${id}:r2:${cand}`, `sala:${id}:r2:${aval}`].sort()
    );
    const c = await cobrancas(id);
    expect(c.map((x: any) => `${x.round}:${x.user_id}`).sort()).toEqual([`1:${cand}`, `1:${aval}`, `2:${cand}`, `2:${aval}`].sort());
    // a linha da rodada 1 é a mesma de antes (mesmo lançamento)
    for (const x of r1) expect(c.find((y: any) => y.round === 1 && y.user_id === x.user_id)?.ledger_id).toBe(x.ledger_id);
    expect(new Set(c.map((x: any) => x.ledger_id)).size).toBe(4);
    expect(await uso(cand)).toBe(2);
    expect(await uso(aval)).toBe(2);

    // clique duplo na rodada 2: recusado pela fase e sem débito novo
    await expect(iniciar(aval, id)).rejects.toThrow(FASE);
    expect(await livro(id)).toHaveLength(4);
  });

  // Decisão do dono (17/10): cada estação nova na mesma sala é uma sessão nova e cobra 1 crédito de cada um, como o primeiro início.
  it("PADRÃO (chave ausente): duas estações seguidas na mesma sala cobram 2 de cada um; recarregar ou repetir o início não cobra de novo", async () => {
    await cota(true, { pro: 3, cobra_rodada_extra: undefined }); // sem a chave: vale o padrão, que cobra
    expect(await d.sql(`select value -> 'match' ? 'cobra_rodada_extra' as tem from public.app_settings where key = 'creditos'`)).toEqual([{ tem: false }]);
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await ateRodada2(cand, aval);
    expect(await livro(id)).toHaveLength(2); // rodada 1: 1 de cada
    await iniciar(aval, id);
    expect(await livro(id)).toHaveLength(4); // rodada 2: mais 1 de cada
    expect(await uso(cand)).toBe(2);
    expect(await uso(aval)).toBe(2);
    expect((await cobrancas(id)).map((x: any) => `${x.round}:${x.user_id}`).sort()).toEqual([`1:${cand}`, `1:${aval}`, `2:${cand}`, `2:${aval}`].sort());
    // recarregar a página (ler a sala) e repetir o início: nada novo
    await estadoSala(cand, id);
    await estadoSala(aval, id);
    await expect(iniciar(aval, id)).rejects.toThrow(FASE);
    expect(await livro(id)).toHaveLength(4);
    expect(await uso(cand)).toBe(2);
  });

  it("sem crédito para a segunda estação: 'Treinar outra estação' não abre (pré-checagem dos dois), mensagem neutra, sala segue no resultado", async () => {
    await cota(true, { pro: 1, cobra_rodada_extra: undefined });
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await sala(cand, aval);
    await iniciar(aval, id); // o único crédito do dia de cada um
    await d.sql(`update public.checklist_rooms set phase = 'result' where id = $1`, [id]);
    for (const quem of [cand, aval]) {
      const e = await erroDe(d.rpc(quem, "app_dupla_next_station", { p_room_id: id }));
      expect(e.message).toBe("Não foi possível abrir outra estação agora. Confirmem a cota de hoje e tentem de novo.");
      expect(e.code).toBe("54000");
      expect(e.hint).toBe("INSUFFICIENT_CREDITS");
      expect(e.message).not.toMatch(/\d|cr[eé]dito|saldo/i);
    }
    expect(await linhaSala(id)).toMatchObject({ phase: "result", round: 1 });
    // só UM sem crédito também recusa os dois, igual: cand ganha bônus, aval não
    await concede(cand, 1, "bonus");
    ehNeutraProxima(await erroDe(d.rpc(cand, "app_dupla_next_station", { p_room_id: id })));
    // com bônus nos dois, abre
    await concede(aval, 1, "bonus");
    expect(await d.rpc<any>(cand, "app_dupla_next_station", { p_room_id: id })).toMatchObject({ phase: "roles", round: 2 });
  });

  it("sem crédito na hora de INICIAR a segunda estação (gastou no meio): a sala não começa, mensagem neutra, nada novo no livro", async () => {
    await cota(true, { pro: 2, cobra_rodada_extra: undefined });
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await ateRodada2(cand, aval); // rodada 1 paga; a pré-checagem passou (sobra 1 de cada)
    await gasta(cand); // o crédito que sobrava de um deles é usado por fora (outra frente)
    ehNeutra(await erroDe(iniciar(aval, id)));
    expect(await livro(id)).toHaveLength(2);
    expect((await cobrancas(id)).every((x: any) => x.round === 1)).toBe(true);
    expect(await linhaSala(id)).toMatchObject({ phase: "setup", round: 2 });
    // com bônus no candidato, a rodada 2 passa e leva a sua chave
    await concede(cand, 1, "bonus");
    await iniciar(aval, id);
    const c = (await cobrancas(id)).filter((x: any) => x.round === 2);
    expect(c.map((x: any) => x.bucket).sort()).toEqual(["bonus", "daily"]);
  });

  it("rodada 2 desligada à mão (cobra_rodada_extra = false): 'Treinar outra estação' abre mesmo sem crédito e não cobra", async () => {
    await cota(true, { pro: 1, cobra_rodada_extra: false });
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await sala(cand, aval);
    await iniciar(aval, id);
    await d.sql(`update public.checklist_rooms set phase = 'result' where id = $1`, [id]);
    expect(await d.rpc<any>(cand, "app_dupla_next_station", { p_room_id: id })).toMatchObject({ phase: "roles", round: 2 });
  });

  it("'Treinar outra estação' com a cota desligada ou entre pessoas da equipe: abre como antes", async () => {
    await cota(false, { pro: 0 });
    const a = await conta("pro");
    const b = await conta("pro");
    const id = await sala(a, b);
    await d.sql(`update public.checklist_rooms set phase = 'result' where id = $1`, [id]);
    expect(await d.rpc<any>(a, "app_dupla_next_station", { p_room_id: id })).toMatchObject({ round: 2 });
    await cota(true, { pro: 0 });
    const e1 = await conta("editor");
    const e2 = await conta("admin");
    const id2 = await sala(e1, e2);
    await d.sql(`update public.checklist_rooms set phase = 'result' where id = $1`, [id2]);
    expect(await d.rpc<any>(e1, "app_dupla_next_station", { p_room_id: id2 })).toMatchObject({ round: 2 });
  });

  // ------------------------------------------------------------------ cota desligada
  it("cota desligada: inicia como antes, sem lançamento, sem study_room_charges e charged_at nulo", async () => {
    await cota(false, { trial: 0, pro: 0 }); // até com limites zerados: desligada é desligada
    const cand = await conta("trial");
    const aval = await conta("pro");
    const id = await sala(cand, aval);
    const r = await iniciar(aval, id);
    expect(r.phase).toBe("running");
    expect(await livro(id)).toEqual([]);
    expect(await cobrancas(id)).toEqual([]);
    expect((await linhaSala(id)).charged_at).toBeNull();
    expect(await lancamentos(cand, aval)).toBe(0);
    expect(await uso(cand)).toBe(0);
  });

  // ------------------------------------------------------------------ equipe
  it.each(["admin", "editor", "revisor"] as const)("equipe (%s) + aluno: o aluno paga; a equipe tem linha 'unlimited' sem lançamento", async (perfil) => {
    await cota(true);
    const equipe = await conta(perfil);
    const aluno = await conta("pro");
    // a equipe avalia e o aluno é candidato; depois o contrário (cada um dos dois lados da sala)
    for (const [cand, aval] of [[aluno, equipe], [equipe, aluno]] as const) {
      const id = await sala(cand, aval);
      await iniciar(aval, id);
      const l = await livro(id);
      expect(l).toHaveLength(1);
      expect(l[0]).toMatchObject({ user_id: aluno, kind: "consume", idem_key: `sala:${id}:${aluno}` });
      const c = await cobrancas(id);
      expect(c).toHaveLength(2);
      expect(c.find((x: any) => x.user_id === aluno)).toMatchObject({ bucket: "daily", round: 1 });
      expect(c.find((x: any) => x.user_id === aluno).ledger_id).toBe(l[0].id);
      expect(c.find((x: any) => x.user_id === equipe)).toMatchObject({ bucket: "unlimited", ledger_id: null, round: 1 });
      expect((await linhaSala(id)).charged_at).not.toBeNull();
      await d.sql(`update public.checklist_rooms set phase = 'closed' where id = $1`, [id]); // libera a pessoa para a próxima sala
    }
    expect(await lancamentos(equipe)).toBe(0);
    expect(await uso(equipe)).toBe(0);
    expect(await uso(aluno)).toBe(2);
  });

  it("os dois da equipe: ninguém paga, charged_at fica nulo e as duas linhas são 'unlimited'", async () => {
    await cota(true, { trial: 0, pro: 0 }); // limites zerados não barram a equipe
    const a = await conta("admin");
    const b = await conta("editor");
    const id = await sala(a, b);
    expect((await iniciar(b, id)).phase).toBe("running");
    expect(await livro(id)).toEqual([]);
    const c = await cobrancas(id);
    expect(c).toHaveLength(2);
    expect(c.every((x: any) => x.bucket === "unlimited" && x.ledger_id === null)).toBe(true);
    expect((await linhaSala(id)).charged_at).toBeNull();
    expect(await lancamentos(a, b)).toBe(0);
  });

  // ------------------------------------------------------------------ nada de cobrança antes do início
  it("convite recusado, convite vencido e sala fechada antes do início: nenhum lançamento", async () => {
    await cota(true);
    const a = await conta("pro");
    const b = await conta("pro");
    const convidar = async (de: string, para: string, phase: "roles" | "setup") => {
      const id = await sala(de, para, { phase });
      await d.sql(`insert into public.study_invites (from_user, to_user, room_id) values ($1, $2, $3)`, [de, para, id]);
      return id;
    };

    // recusado
    const recusada = await convidar(a, b, "roles");
    const [{ id: inv }] = await d.sql<{ id: string }>(`select id from public.study_invites where room_id = $1`, [recusada]);
    expect(await d.rpc(b, "app_dupla_answer_invite", { p_invite_id: inv, p_accept: false })).toEqual({ room_id: null });
    expect((await linhaSala(recusada)).closed_reason).toBe("convite_recusado");
    await expect(iniciar(b, recusada)).rejects.toThrow(FASE);

    // vencido: a resposta tardia é recusada; a sala fecha na próxima leitura
    const vencida = await convidar(a, b, "roles");
    await d.sql(`update public.study_invites set expires_at = now() - interval '1 second' where room_id = $1`, [vencida]);
    const [{ id: inv2 }] = await d.sql<{ id: string }>(`select id from public.study_invites where room_id = $1`, [vencida]);
    await expect(d.rpc(b, "app_dupla_answer_invite", { p_invite_id: inv2, p_accept: true })).rejects.toThrow("Convite expirado (60 s).");
    expect((await estadoSala(a, vencida)).closed_reason).toBe("convite_expirado");
    await expect(iniciar(b, vencida)).rejects.toThrow(FASE);

    // saiu antes de iniciar
    const saiu = await sala(a, b);
    await d.rpc(a, "app_dupla_leave", { p_room_id: saiu });
    expect((await linhaSala(saiu)).phase).toBe("closed");
    await expect(iniciar(b, saiu)).rejects.toThrow(FASE);

    for (const id of [recusada, vencida, saiu]) {
      expect(await livro(id)).toEqual([]);
      expect(await cobrancas(id)).toEqual([]);
    }
    expect(await lancamentos(a, b)).toBe(0);
    expect(await uso(a)).toBe(0);
    expect(await uso(b)).toBe(0);
  });

  // ------------------------------------------------------------------ nada de estorno automático
  it("saiu depois de iniciar (app_dupla_leave): o débito PERMANECE, sem estorno automático", async () => {
    await cota(true);
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await sala(cand, aval);
    await iniciar(aval, id);
    const antes = await livro(id);

    const s = await d.rpc<any>(cand, "app_dupla_leave", { p_room_id: id });
    expect(s).toMatchObject({ phase: "closed", closed_reason: "saiu" });
    expect(await livro(id)).toEqual(antes);
    expect(await d.sql(`select 1 from public.credit_ledger where kind = 'refund' and ref_id = $1`, [id])).toEqual([]);
    expect(await cobrancas(id)).toHaveLength(2);
    expect(await uso(cand)).toBe(1);
    expect(await uso(aval)).toBe(1);
    expect((await linhaSala(id)).charged_at).not.toBeNull();
  });

  it("fechamento por falta de sinal depois de iniciar: o débito PERMANECE", async () => {
    await cota(true);
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await sala(cand, aval);
    await iniciar(aval, id);
    const antes = await livro(id);

    // Sala parada há 20 minutos e ninguém com sinal. O carimbo do updated_at (gatilho) é desligado só para envelhecer a linha.
    await d.sql(`alter table public.checklist_rooms disable trigger checklist_rooms_stamp`);
    try {
      await d.sql(`update public.checklist_rooms set updated_at = now() - interval '20 minutes' where id = $1`, [id]);
    } finally {
      await d.sql(`alter table public.checklist_rooms enable trigger checklist_rooms_stamp`);
    }
    const s = await estadoSala(cand, id); // a leitura fecha o que venceu
    expect(s).toMatchObject({ phase: "closed", closed_reason: "sem_sinal" });
    expect(await livro(id)).toEqual(antes);
    expect(await d.sql(`select 1 from public.credit_ledger where kind = 'refund' and ref_id = $1`, [id])).toEqual([]);
    expect(await cobrancas(id)).toHaveLength(2);
    expect(await uso(cand)).toBe(1);
    expect(await uso(aval)).toBe(1);
  });

  // ------------------------------------------------------------------ dia de São Paulo
  it("o dia do débito é o de São Paulo do instante do início (usage_date e day do livro)", async () => {
    await cota(true);
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await sala(cand, aval);
    await iniciar(aval, id);
    const [m] = await d.sql<any>(
      `select (select count(*)::int from public.study_room_charges c where c.room_id = $1) as n_c,
              (select bool_and(c.usage_date = (c.created_at at time zone 'America/Sao_Paulo')::date) from public.study_room_charges c where c.room_id = $1) as cobranca_ok,
              (select bool_and(l.day = (l.created_at at time zone 'America/Sao_Paulo')::date) from public.credit_ledger l where l.ref_id = $1) as livro_ok,
              (select bool_and(l.day = c.usage_date) from public.credit_ledger l join public.study_room_charges c on c.ledger_id = l.id where c.room_id = $1) as igual_ok,
              (select bool_and(dd.day = (r.started_at at time zone 'America/Sao_Paulo')::date)
                 from public.credit_daily dd, public.checklist_rooms r where r.id = $1 and dd.user_id = any (r.member_ids)) as uso_ok`,
      [id]
    );
    expect(m).toEqual({ n_c: 2, cobranca_ok: true, livro_ok: true, igual_ok: true, uso_ok: true });
  });

  it("virada do dia: 23:59:59 e 00:00:01 (UTC-3) caem em dias diferentes; o par usa o dia de São Paulo, não o de Greenwich", async () => {
    await cota(true, { pro: 1 });
    const a = await conta("pro");
    const b = await conta("pro");
    const ref = randomUUID();
    // Meia-noite de São Paulo daqui a 2 dias (dentro do plano pago de 30 dias das contas de teste).
    const [{ meia_noite }] = await d.sql<{ meia_noite: string }>(
      `select to_char(((date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '2 days') at time zone 'America/Sao_Paulo') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as meia_noite`
    );
    const pt = (seg: number) => new Date(new Date(meia_noite).getTime() + seg * 1000).toISOString();
    const par = async (prefixo: string, agora: string) =>
      d.sql(`select public.credit_consume_pair('match', $1::uuid, $2::uuid, 'room', $3::uuid, $4, $5::timestamptz) as r`, [a, b, ref, prefixo, agora]);
    const dias = (uid: string) => d.sql<any>(`select day::text as day from public.credit_ledger where user_id = $1 and kind = 'consume' order by id`, [uid]);
    const [{ dia_antes, dia_depois }] = await d.sql<any>(
      `select ((($1::timestamptz) - interval '1 second') at time zone 'America/Sao_Paulo')::date::text as dia_antes,
              ((($1::timestamptz) + interval '1 second') at time zone 'America/Sao_Paulo')::date::text as dia_depois`,
      [meia_noite]
    );
    expect(dia_antes).not.toBe(dia_depois);
    // 23:59:59 de Brasília já é o dia seguinte em UTC: é a diferença que a prova precisa
    expect(new Date(pt(-1)).toISOString().slice(0, 10)).not.toBe(dia_antes);

    await par("virada-1", pt(-1)); // 23:59:59 do dia D
    expect(await dias(a)).toEqual([{ day: dia_antes }]);
    expect(await dias(b)).toEqual([{ day: dia_antes }]);
    // ainda no dia D, o limite de 1 já foi usado: a segunda tentativa é recusada, sem lançamento
    await expect(par("virada-2", pt(-1))).rejects.toMatchObject({ code: "54000", hint: "INSUFFICIENT_CREDITS" });
    expect(await lancamentos(a, b)).toBe(2);
    // 00:00:01 do dia D+1: cota nova, lançamento no dia seguinte
    await par("virada-3", pt(1));
    expect(await dias(a)).toEqual([{ day: dia_antes }, { day: dia_depois }]);
    expect(await dias(b)).toEqual([{ day: dia_antes }, { day: dia_depois }]);
    const uso2 = await d.sql<any>(`select day::text as day, used from public.credit_daily where user_id = $1 order by day`, [a]);
    expect(uso2).toEqual([{ day: dia_antes, used: 1 }, { day: dia_depois, used: 1 }]);
  });

  // ------------------------------------------------------------------ o que a resposta mostra
  it("a resposta de app_dupla_start e de app_dupla_room não traz saldo, limite, idem_key, bucket nem o motivo do outro", async () => {
    await cota(true);
    const cand = await conta("pro");
    const aval = await conta("trial");
    const id = await sala(cand, aval);
    const proibido = /bucket|idem_key|limit|saldo|credit|ledger|disponivel|usados|bonus|purchased|comprados|cota|charge|unlimited|daily/i;

    const r = await iniciar(aval, id);
    expect(JSON.stringify(r)).not.toMatch(proibido);
    for (const uid of [cand, aval]) expect(JSON.stringify(await estadoSala(uid, id))).not.toMatch(proibido);
    // a leitura de quem NÃO iniciou tem o mesmo formato de chaves da de quem iniciou
    expect(Object.keys(await estadoSala(cand, id)).sort()).toEqual(Object.keys(await estadoSala(aval, id)).sort());

    // a falta de saldo: só a mensagem neutra (nem o aviso do banco leva número ou nome)
    const sem = await conta("elite");
    await cota(true, { elite: undefined });
    const cand2 = await conta("pro");
    const id2 = await sala(cand2, sem);
    const e = await erroDe(iniciar(sem, id2));
    ehNeutra(e);
    expect(JSON.stringify({ m: e.message, d: e.detail ?? null, h: e.hint, c: e.code })).not.toMatch(/saldo|limite|elite|pro\b|trial/i);
  });

  // ------------------------------------------------------------------ permissões e colagem dupla
  it("permissões e definição: fechada para visitante, aberta a quem entra, security definer com search_path vazio e não é stable", async () => {
    const acesso = async (papel: string) =>
      (await d.sql<{ ok: boolean }>(`select has_function_privilege($1, 'public.app_dupla_start(uuid)'::regprocedure, 'execute') as ok`, [papel]))[0].ok;
    expect(await acesso("anon")).toBe(false);
    expect(await acesso("authenticated")).toBe(true);
    const [f] = await d.sql<any>(`select prosecdef, proconfig, provolatile from pg_proc where proname = 'app_dupla_start' and pronamespace = 'public'::regnamespace`);
    expect(f).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'], provolatile: "v" });
  });

  it("colar a 014050 duas vezes dá o mesmo banco (funções, permissões, índices e políticas)", async () => {
    const retrato = async () => ({
      funcoes: await d.sql(
        `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1`
      ),
      indices: await d.sql(`select indexname, indexdef from pg_indexes where schemaname = 'public' order by 1`),
      politicas: await d.sql(`select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`),
      gatilhos: await d.sql(`select tgname, pg_get_triggerdef(oid) as def from pg_trigger where tgrelid = 'public.checklist_rooms'::regclass and not tgisinternal order by 1`),
    });
    const antes = await retrato();
    await d.db.exec(SQL);
    expect(await retrato()).toEqual(antes);
    // a cota continua como estava e a função continua funcionando depois de colada de novo
    await cota(true);
    const cand = await conta("pro");
    const aval = await conta("pro");
    const id = await sala(cand, aval);
    expect((await iniciar(aval, id)).phase).toBe("running");
    expect(await livro(id)).toHaveLength(2);
  });
});
