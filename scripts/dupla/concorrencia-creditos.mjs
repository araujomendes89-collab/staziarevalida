#!/usr/bin/env node
/**
 * Stazia Match, Etapa M5b: roteiro de CONCORRÊNCIA REAL do livro de créditos e das garantias de integridade (014020 a 014050).
 * Roda fora da suíte padrão. O PGlite (usado nos testes) tem UMA conexão só e serializa as chamadas: ele prova o resultado final,
 * não a corrida. Este roteiro dispara as chamadas por conexões diferentes de um Postgres de verdade.
 *
 * REGRAS (dinheiro e crédito)
 *  - NUNCA contra produção nem contra o Supabase do projeto: o roteiro recusa endereços *.supabase.co / *.supabase.com e só aceita
 *    banco LOCAL ou de TESTE descartável (ele cria e apaga as próprias contas de teste; mesmo assim use um banco vazio).
 *  - O pacote "pg" NÃO está instalado neste projeto e não foi instalado por regra (nenhuma dependência sem ordem do dono). Sem
 *    ele o roteiro avisa e para. A lógica dos cenários é conferida mesmo assim, em série, no PGlite, pelo teste
 *    src/__tests__/duplaCreditosConcorrenciaRoteiro.test.ts.
 *  - A URL do banco vem SÓ da variável de ambiente (nunca impressa).
 *
 * USO (depois de o dono escolher o Postgres e autorizar o pacote "pg"):
 *   STAZIA_CONCORRENCIA_DB_URL=postgres://usuario:senha@127.0.0.1:5432/banco_de_teste \
 *     node scripts/dupla/concorrencia-creditos.mjs --montar      # cria o ambiente mínimo e aplica TODAS as migrações (banco vazio)
 *   ... node scripts/dupla/concorrencia-creditos.mjs             # banco que já tem as migrações aplicadas
 * A saída vai para o terminal; guarde em .superpowers/ (fora do git) e anote no relatório o que passou e o que falhou.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../..");

// Contas de teste (uuids fixos, prefixo ffffffff para nunca bater com conta real).
const uid = (n) => `ffffffff-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const CONTAS = { x: uid(1), p: uid(2), q: uid(3), a: uid(4), b: uid(5), c: uid(6), av: uid(7), ca: uid(8), d: uid(9), e: uid(10) };
// Estação de TESTE do roteiro (aprovada, sem Pro): o início do fluxo simples (014150) exige a estação escolhida.
export const ESTACAO = "teste-concorrencia-e01";

/** Prepara o ambiente: contas Pro, chave do módulo aberta, cota ligada (3 por dia no Pro), perfis online. Tudo de TESTE. */
export async function montar(h) {
  await limpar(h);
  for (const [nome, id] of Object.entries(CONTAS)) {
    await h.admin(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)`, [id, `conc-${nome}@teste.invalid`]);
    await h.admin(
      `update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`,
      [id]
    );
  }
  await h.admin(
    `insert into public.app_settings (key, value) values ('treino_dupla', '{"aberto": true, "planos": ["trial", "pro", "elite"]}'::jsonb)
       on conflict (key) do update set value = excluded.value`
  );
  await h.admin(
    `insert into public.app_settings (key, value) values ('creditos', '{"ativa": true, "match": {"pro": 3, "cobra_rodada_extra": false}, "ia": {}}'::jsonb)
       on conflict (key) do update set value = excluded.value`
  );
  await h.admin(
    `insert into public.checklist_stations (id, name, topic, area, medical_review) values ($1, 'Estação de teste do roteiro', 'Teste', 'Clínica Médica', 'approved')
       on conflict (id) do nothing`,
    [ESTACAO]
  );
  for (const nome of ["a", "b", "c", "d", "e", "av", "ca"]) {
    await h.admin(
      `insert into public.study_profiles (user_id, public_name, role_pref, status, last_seen_at) values ($1, $2, 'any', 'livre', now())`,
      [CONTAS[nome], `Conta de teste ${nome}`]
    );
  }
}

/** Apaga o que o roteiro criou (a exclusão das contas leva junto o extrato, por "on delete cascade"). */
export async function limpar(h) {
  const ids = Object.values(CONTAS);
  await h.admin(`delete from public.checklist_rooms where member_ids && $1::uuid[]`, [ids]);
  await h.admin(`delete from public.study_matches where user_a = any ($1::uuid[]) or user_b = any ($1::uuid[])`, [ids]);
  await h.admin(`delete from public.study_swipes where from_user = any ($1::uuid[]) or to_user = any ($1::uuid[])`, [ids]);
  await h.admin(`delete from auth.users where id = any ($1::uuid[])`, [ids]);
  await h.admin(`delete from public.checklist_stations where id = $1`, [ESTACAO]);
}

const consumo = (conta, chave) =>
  h_sql("select public.credit_consume($1::uuid, 'match', 1, 'room', gen_random_uuid(), $2) as r", [conta, chave]);
const h_sql = (sql, params) => ({ sql, params });

const contar = async (h, sql, params) => Number((await h.admin(sql, params))[0].n);
const rodada = () => Math.random().toString(36).slice(2, 10);
const semDeadlock = (resultados) => !resultados.some((r) => r.status === "rejected" && /deadlock/i.test(String(r.reason?.message ?? r.reason)));

/** Os cenários do plano (M5b). Cada um usa h.confere(condição, texto). */
export const CENARIOS = [
  {
    nome: "20 chamadas simultâneas a credit_consume com 3 créditos: exatamente 3 lançamentos e saldo nunca negativo",
    async executa(h) {
      const run = rodada();
      const res = await h.paralelo(20, (i) => {
        const q = consumo(CONTAS.x, `conc1-${run}-${i}`);
        return h.admin(q.sql, q.params);
      });
      h.confere(res.filter((r) => r.status === "fulfilled").length === 3, "3 chamadas passam");
      h.confere(res.filter((r) => r.status === "rejected" && /sem_credito/.test(String(r.reason?.message))).length === 17, "17 recusadas por falta de crédito");
      h.confere((await contar(h, `select count(*) n from public.credit_ledger where user_id = $1 and idem_key like $2`, [CONTAS.x, `conc1-${run}-%`])) === 3, "3 lançamentos no livro");
      const [d] = await h.admin(`select used from public.credit_daily where user_id = $1 and pool = 'match' and day = (now() at time zone 'America/Sao_Paulo')::date`, [CONTAS.x]);
      h.confere(d && Number(d.used) === 3, "uso do dia = 3");
    },
  },
  {
    nome: "mesma idem_key em 20 conexões: um lançamento só",
    async executa(h) {
      const chave = `conc2-${rodada()}`;
      const res = await h.paralelo(20, () => {
        const q = consumo(CONTAS.e, chave);
        return h.admin(q.sql, q.params);
      });
      h.confere(res.every((r) => r.status === "fulfilled"), "todas respondem (já feito devolve o mesmo)");
      h.confere((await contar(h, `select count(*) n from public.credit_ledger where idem_key = $1`, [chave])) === 1, "um lançamento");
    },
  },
  {
    nome: "credit_consume_pair cruzado (A,B) e (B,A) ao mesmo tempo: sem deadlock e os dois lados batem",
    async executa(h) {
      const run = rodada();
      const res = await h.paralelo(10, (i) => {
        const [a, b] = i % 2 === 0 ? [CONTAS.p, CONTAS.q] : [CONTAS.q, CONTAS.p];
        return h.admin(`select public.credit_consume_pair('match', $1::uuid, $2::uuid, 'room', gen_random_uuid(), $3) as r`, [a, b, `conc3-${run}-${i}`]);
      });
      h.confere(semDeadlock(res), "nenhum deadlock");
      const p = await contar(h, `select count(*) n from public.credit_ledger where user_id = $1 and idem_key like $2`, [CONTAS.p, `conc3-${run}-%`]);
      const q = await contar(h, `select count(*) n from public.credit_ledger where user_id = $1 and idem_key like $2`, [CONTAS.q, `conc3-${run}-%`]);
      h.confere(p === 3 && q === 3, `cada um pagou 3 vezes (limite do dia): p=${p} q=${q}`);
    },
  },
  {
    nome: "par em que um dos dois não tem saldo: ninguém é cobrado",
    async executa(h) {
      const run = rodada();
      // P e Q já gastaram os 3 do dia no cenário anterior; a conta C tem saldo. O par (C, P) não pode cobrar C.
      const antes = await contar(h, `select count(*) n from public.credit_ledger where user_id = $1 and kind = 'consume'`, [CONTAS.c]);
      const res = await h.paralelo(5, (i) =>
        h.admin(`select public.credit_consume_pair('match', $1::uuid, $2::uuid, 'room', gen_random_uuid(), $3) as r`, [CONTAS.c, CONTAS.p, `conc4-${run}-${i}`])
      );
      h.confere(res.every((r) => r.status === "rejected"), "todos recusados");
      const depois = await contar(h, `select count(*) n from public.credit_ledger where user_id = $1 and kind = 'consume'`, [CONTAS.c]);
      h.confere(depois === antes, "a conta com saldo não foi cobrada");
    },
  },
  {
    nome: "dois app_dupla_start ao mesmo tempo na mesma sala: um débito por aluno",
    async executa(h) {
      const [sala] = await h.admin(
        `insert into public.checklist_rooms (member_ids, phase, round, candidate_id, evaluator_id, ready_ids, confirmed_ids, connected_ids, station_id)
           values (array[$1::uuid, $2::uuid], 'setup', 1, $1, $2, array[$1::uuid, $2::uuid], array[$1::uuid, $2::uuid], array[$1::uuid, $2::uuid], $3) returning id`,
        [CONTAS.ca, CONTAS.av, ESTACAO]
      );
      const res = await h.paralelo(2, () => h.comoAluno(CONTAS.av, `select public.app_dupla_start($1::uuid) as r`, [sala.id]));
      h.confere(res.filter((r) => r.status === "fulfilled").length === 1, "só uma chamada inicia");
      h.confere((await contar(h, `select count(*) n from public.credit_ledger where ref_id = $1 and kind = 'consume'`, [sala.id])) === 2, "dois lançamentos (um por aluno)");
      h.confere((await contar(h, `select count(*) n from public.study_room_charges where room_id = $1`, [sala.id])) === 2, "duas cobranças da sala");
      await h.admin(`update public.checklist_rooms set phase = 'closed' where id = $1`, [sala.id]);
    },
  },
  {
    nome: "A escolhe B e C ao mesmo tempo (os dois já tinham escolhido A): no máximo uma sala aberta para A",
    async executa(h) {
      await h.admin(`delete from public.study_swipes where from_user = any ($1::uuid[]) or to_user = any ($1::uuid[])`, [[CONTAS.a, CONTAS.b, CONTAS.c]]);
      await h.admin(`insert into public.study_swipes (from_user, to_user, direction) values ($1, $3, 'right'), ($2, $3, 'right')`, [CONTAS.b, CONTAS.c, CONTAS.a]);
      const res = await h.paralelo(2, (i) =>
        h.comoAluno(CONTAS.a, `select public.app_dupla_swipe($1::uuid, 'right', null) as r`, [i === 0 ? CONTAS.b : CONTAS.c])
      );
      h.confere(semDeadlock(res), "nenhum deadlock");
      h.confere((await contar(h, `select count(*) n from public.study_room_claims where user_id = $1`, [CONTAS.a])) === 1, "uma reserva para A");
      h.confere(
        (await contar(h, `select count(*) n from public.checklist_rooms where phase <> 'closed' and $1::uuid = any (member_ids)`, [CONTAS.a])) === 1,
        "uma sala aberta para A"
      );
      await h.admin(`update public.checklist_rooms set phase = 'closed' where $1::uuid = any (member_ids)`, [CONTAS.a]);
    },
  },
  {
    nome: "curtidas A->B e B->A ao mesmo tempo: uma conexão e uma sala",
    async executa(h) {
      await h.admin(`delete from public.study_swipes where from_user = any ($1::uuid[]) or to_user = any ($1::uuid[])`, [[CONTAS.d, CONTAS.e]]);
      await h.admin(`delete from public.study_matches where user_a = any ($1::uuid[]) or user_b = any ($1::uuid[])`, [[CONTAS.d, CONTAS.e]]);
      const res = await h.paralelo(2, (i) =>
        h.comoAluno(i === 0 ? CONTAS.d : CONTAS.e, `select public.app_dupla_swipe($1::uuid, 'right', null) as r`, [i === 0 ? CONTAS.e : CONTAS.d])
      );
      h.confere(semDeadlock(res), "nenhum deadlock");
      h.confere(
        (await contar(h, `select count(*) n from public.study_matches where least(user_a, user_b) = least($1::uuid, $2::uuid) and greatest(user_a, user_b) = greatest($1::uuid, $2::uuid)`, [CONTAS.d, CONTAS.e])) === 1,
        "uma conexão"
      );
      h.confere((await contar(h, `select count(*) n from public.checklist_rooms where phase <> 'closed' and $1::uuid = any (member_ids)`, [CONTAS.d])) === 1, "uma sala aberta");
      await h.admin(`update public.checklist_rooms set phase = 'closed' where $1::uuid = any (member_ids)`, [CONTAS.d]);
    },
  },
];

/** Executa todos os cenários com o "harness" h. Devolve { passou, falhas }. */
export async function rodarCenarios(h) {
  const falhas = [];
  for (const c of CENARIOS) {
    const antes = h.falhas.length;
    try {
      await c.executa(h);
    } catch (e) {
      h.falhas.push(`erro inesperado: ${e?.message ?? e}`);
    }
    const novas = h.falhas.slice(antes);
    h.log(`${novas.length === 0 ? "PASSOU" : "FALHOU"}  ${c.nome}`);
    for (const f of novas) {
      h.log(`          - ${f}`);
      falhas.push(`${c.nome}: ${f}`);
    }
  }
  return { passou: falhas.length === 0, falhas };
}

// --------------------------------------------------------------------------- execução com Postgres real (pacote "pg")
function enderecoPermitido(url) {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return !/supabase\.(co|com)$/i.test(host) && !/pooler\./i.test(host);
}

async function principal() {
  const url = process.env.STAZIA_CONCORRENCIA_DB_URL;
  if (!url) {
    console.error("Defina STAZIA_CONCORRENCIA_DB_URL com um Postgres LOCAL ou de TESTE (nunca produção). Nada foi feito.");
    process.exit(2);
  }
  if (!enderecoPermitido(url)) {
    console.error("Endereço recusado: parece o Supabase (produção ou projeto real). Use um Postgres local ou descartável. Nada foi feito.");
    process.exit(2);
  }
  let pg;
  try {
    pg = (await import("pg")).default;
  } catch {
    console.error('O pacote "pg" não está instalado e não foi instalado por regra (precisa de ordem do dono). O roteiro foi conferido em série no PGlite.');
    process.exit(3);
  }
  const pool = new pg.Pool({ connectionString: url, max: 30 });
  const claims = (u) => JSON.stringify({ sub: u, role: "authenticated" });
  const h = {
    falhas: [],
    log: (s) => console.log(s),
    confere(cond, texto) {
      if (!cond) this.falhas.push(texto);
    },
    async admin(sql, params = []) {
      return (await pool.query(sql, params)).rows;
    },
    async comoAluno(u, sql, params = []) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("set local role authenticated");
        await c.query("select set_config('request.jwt.claims', $1, true)", [claims(u)]);
        const r = await c.query(sql, params);
        await c.query("commit");
        return r.rows;
      } catch (e) {
        await c.query("rollback").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    paralelo: (n, fn) => Promise.allSettled(Array.from({ length: n }, (_, i) => fn(i))),
  };
  try {
    if (process.argv.includes("--montar")) {
      const ddir = path.join(RAIZ, "supabase/migrations");
      await h.admin(fs.readFileSync(path.join(RAIZ, "supabase/tests/bootstrap.sql"), "utf8"));
      for (const f of fs.readdirSync(ddir).filter((x) => x.endsWith(".sql")).sort()) await h.admin(fs.readFileSync(path.join(ddir, f), "utf8"));
    }
    await montar(h);
    const r = await rodarCenarios(h);
    console.log(r.passou ? "TUDO CERTO." : `${r.falhas.length} FALHA(S).`);
    process.exitCode = r.passou ? 0 : 1;
  } finally {
    await limpar(h).catch(() => {});
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(e?.message ?? e);
    process.exit(1);
  });
}
