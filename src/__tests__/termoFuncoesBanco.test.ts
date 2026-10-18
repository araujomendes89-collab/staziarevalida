// @vitest-environment node
/**
 * Funções que o Contrato 3.0 promete (ramo termo-funcoes):
 *   013800 — fila de e-mails de serviço (email_saida: nova tentativa, sem duplicar; SEM cópia do contrato por e-mail, decisão do dono
 *            de 18/10) e escolha opcional de marketing (onboarding e Minha Conta);
 *   013810 — conta inativa (aviso 30 dias antes, apagar conta gratuita / zerar Coins) e expurgo dos aceites 5 anos depois do fim do
 *            contrato, tudo DESLIGADO por chave (modo ensaio).
 * Ensaio no PGlite: banco com todas as migrações de antes, as duas novas aplicadas duas vezes, desfeitas e aplicadas de novo.
 * Nada aqui toca o banco real.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const NOVAS = ["20261003013800_termo_copia_email_marketing.sql", "20261003013810_contas_inativas_expurgo.sql"];
const ler = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const SQL = NOVAS.map((f) => ler(`supabase/migrations/${f}`));
const DESFAZER = NOVAS.map((f) => ler(`supabase/desfazer/${f.replace(/\.sql$/, ".desfazer.sql")}`));

let db: PGlite;
let seq = 0;

async function call<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid === "service" ? "service_role" : uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid && uid !== "service" ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
    return r.rows[0].result;
  });
}
const servico = <T = any>(fn: string, args: Record<string, unknown> = {}) => call<T>("service", fn, args);
async function recusa(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e: any) {
    return e.message;
  }
  throw new Error("Era para recusar, mas passou.");
}
async function signUp(meta: Record<string, unknown> = {}, role?: string) {
  const id = `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`;
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `pessoa${seq}@teste.dev`, { name: `Pessoa ${seq} Silva`, ...meta }]);
  if (role) await db.query(`update public.user_roles set role = $2 where user_id = $1`, [id, role]);
  return id;
}
const aceitar = (uid: string) =>
  call(uid, "app_accept_terms_declared", { p_document: "termo_uso", p_version: "3.0", p_adult: true, p_physician: null, p_origin: "tela_aceite", p_user_agent: "UA/teste" });
const fila = async (uid: string) => (await db.query<any>(`select * from public.email_saida where user_id = $1 order by id`, [uid])).rows;
const linhas = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows;
const chaves = (patch: string) => db.exec(`update public.app_rotinas_conta_config set ${patch}`);
/** esvazia a fila (o que sobrou de outros testes não atrapalha a contagem do lote) */
const limparFila = () => db.exec(`update public.email_saida set status = 'cancelado' where status in ('pendente', 'enviando')`);
/** deixa a conta "parada" desde `quando` (sem aceite: o último acesso vem só de conta_acesso e da criação) */
async function parada(uid: string, quando: string) {
  await db.query(`update auth.users set created_at = now() - $2::interval where id = $1`, [uid, quando]);
  await db.query(`update public.conta_acesso set visto_em = now() - $2::interval where user_id = $1`, [uid, quando]);
}

let antes: string; // conta que já existia quando a 013810 entrou

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ler("supabase/tests/bootstrap.sql"));
  // migrações escritas depois que a 013800/013810 já estavam em produção (produção ia até a 013900) vêm depois delas, como em
  // produção (ex.: 013940 comunicados por e-mail usa a fila email_saida)
  const posteriores = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f.slice(0, 14) > "20261003013900").sort();
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && !NOVAS.includes(f) && !posteriores.includes(f)).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  antes = await signUp();
  for (const s of SQL) await db.exec(s);
  for (const s of SQL) await db.exec(s); // pode ser colada duas vezes
  for (const f of posteriores) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
}, 300_000);

/** põe um e-mail de serviço (aviso de conta inativa) na fila, como a rotina da 013810 faz */
let nFila = 0;
async function naFila(uid: string) {
  await db.query(`insert into public.email_saida (kind, user_id, chave, payload) values ('aviso_inatividade', $1, $2, $3)`, [
    uid,
    `teste:${uid}:${++nFila}`,
    { acao: "apagar_conta", ultimo_acesso: new Date(Date.now() - 335 * 86_400_000).toISOString() },
  ]);
}

describe("013800 — sem cópia do contrato por e-mail (decisão do dono, 18/10: o contrato fica só em Minha Conta → Documentos)", () => {
  it("aceite pela tela e cadastro com a 3.0 NÃO põem nada na fila", async () => {
    const id = await signUp();
    await aceitar(id);
    const cad = await signUp({ terms_version: "3.0", declares_adult: "true" });
    expect(await linhas(`select 1 from public.legal_acceptances where user_id = any ($1::uuid[]) and version = '3.0'`, [[id, cad]])).toHaveLength(2);
    expect(await fila(id)).toEqual([]);
    expect(await fila(cad)).toEqual([]);
  });

  it("não existe gatilho nem função da cópia; a fila não aceita o tipo contrato_copia nem tem a coluna do aceite", async () => {
    expect(await linhas(`select 1 from pg_trigger where tgname = 'legal_copia_na_fila'`)).toEqual([]);
    expect((await linhas(`select to_regprocedure('public.legal_copia_na_fila()') as f`))[0].f).toBeNull();
    expect(await linhas(`select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_saida' and column_name = 'acceptance_id'`)).toEqual([]);
    const id = await signUp();
    await expect(db.query(`insert into public.email_saida (kind, user_id, chave) values ('contrato_copia', $1, 'contrato:x')`, [id])).rejects.toThrow(/check/);
  });

  it("banco com a versão antiga (com a cópia): colar de novo tira o gatilho e cancela as cópias que esperavam", async () => {
    await db.exec(`create function public.legal_copia_na_fila() returns trigger language plpgsql as $$ begin return null; end $$;
      create trigger legal_copia_na_fila after insert on public.legal_acceptances for each row execute function public.legal_copia_na_fila();
      alter table public.email_saida drop constraint email_saida_kind_check;`);
    const id = await signUp();
    await db.query(`insert into public.email_saida (kind, user_id, chave) values ('contrato_copia', $1, 'contrato:antigo')`, [id]);
    await db.exec(SQL[0]);
    expect(await linhas(`select 1 from pg_trigger where tgname = 'legal_copia_na_fila'`)).toEqual([]);
    expect((await fila(id))[0]).toMatchObject({ status: "cancelado", erro: expect.stringContaining("retirada") });
    await db.exec(`delete from public.email_saida where kind = 'contrato_copia';
      alter table public.email_saida add constraint email_saida_kind_check check (kind in ('aviso_inatividade'));`);
  });
});

describe("013800 — fila de e-mails de serviço (usada pelo aviso de conta inativa)", () => {
  // os e-mails postos aqui à mão não podem contar nos testes da rotina de conta inativa (013810)
  afterAll(() => db.exec(`delete from public.email_saida where chave like 'teste:%'`));

  it("o servidor pega o lote (sem texto de contrato); pegar de novo não devolve o mesmo e-mail", async () => {
    await limparFila();
    const id = await signUp();
    await naFila(id);
    const lote = await servico("ch_worker_email_pegar", { p_limite: 10 });
    expect(lote).toHaveLength(1);
    const [item] = lote;
    expect(item).toMatchObject({ kind: "aviso_inatividade", email: expect.stringMatching(/@teste\.dev$/), nome: expect.stringMatching(/^Pessoa/), tentativas: 1 });
    expect(item).not.toHaveProperty("contrato");
    expect(item.payload.prazo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await servico("ch_worker_email_pegar", { p_limite: 10 })).toEqual([]);
    expect(await servico("ch_worker_email_marcar", { p_id: item.id, p_resultado: "enviado" })).toBe("enviado");
    expect((await fila(id))[0]).toMatchObject({ status: "enviado", erro: null });
    expect((await fila(id))[0].enviado_em).not.toBeNull();
    // marcar de novo não muda nada
    expect(await servico("ch_worker_email_marcar", { p_id: item.id, p_resultado: "tentar_de_novo" })).toBeNull();
  });

  it("falha antes da entrega volta para a fila com espera; na 5ª tentativa, falhou", async () => {
    await limparFila();
    const id = await signUp();
    await naFila(id);
    for (let i = 1; i <= 5; i++) {
      await db.query(`update public.email_saida set proxima_em = now() - interval '1 second' where user_id = $1`, [id]);
      const [item] = await servico("ch_worker_email_pegar");
      expect(item.tentativas).toBe(i);
      const st = await servico("ch_worker_email_marcar", { p_id: item.id, p_resultado: "tentar_de_novo", p_erro: "Servidor de e-mail recusou a senha (código 535)." });
      expect(st).toBe(i < 5 ? "pendente" : "falhou");
      if (i < 5) {
        // ainda esperando: não sai antes da hora
        expect(await servico("ch_worker_email_pegar")).toEqual([]);
        const [e] = await fila(id);
        expect(new Date(e.proxima_em).getTime()).toBeGreaterThan(Date.now() + 60_000);
      }
    }
    expect((await fila(id))[0]).toMatchObject({ status: "falhou", tentativas: 5, erro: expect.stringContaining("535") });
  });

  it("envio que parou no meio vira incerto (não repete); resultado inválido é recusado", async () => {
    await limparFila();
    const id = await signUp();
    await naFila(id);
    const [item] = await servico("ch_worker_email_pegar");
    await db.query(`update public.email_saida set pego_em = now() - interval '16 minutes' where id = $1`, [item.id]);
    expect(await servico("ch_worker_email_pegar")).toEqual([]);
    expect((await fila(id))[0].status).toBe("incerto");
    expect(await recusa(servico("ch_worker_email_marcar", { p_id: item.id, p_resultado: "qualquer" }))).toMatch(/Resultado inválido/);
  });

  it("e-mail da conta não confirmado: espera; depois de 30 dias, cancela", async () => {
    await limparFila();
    await db.exec(`alter table auth.users add column if not exists email_confirmed_at timestamptz default now()`);
    try {
      const id = await signUp();
      await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [id]);
      await naFila(id);
      expect(await servico("ch_worker_email_pegar")).toEqual([]);
      await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [id]);
      expect(await servico("ch_worker_email_pegar")).toHaveLength(1);
      const outro = await signUp();
      await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [outro]);
      await naFila(outro);
      await db.query(`update public.email_saida set created_at = now() - interval '29 days' where user_id = $1`, [outro]);
      expect(await servico("ch_worker_email_pegar")).toEqual([]);
      expect((await fila(outro))[0].status).toBe("pendente");
      await db.query(`update public.email_saida set created_at = now() - interval '31 days' where user_id = $1`, [outro]);
      expect(await servico("ch_worker_email_pegar")).toEqual([]);
      expect((await fila(outro))[0]).toMatchObject({ status: "cancelado", erro: expect.stringContaining("não confirmado") });
    } finally {
      await db.exec(`alter table auth.users drop column if exists email_confirmed_at`);
    }
  });

  it("aluno e visitante não chegam à fila nem às funções do servidor", async () => {
    const id = await signUp();
    expect(await recusa(call(id, "ch_worker_email_pegar"))).toMatch(/permission denied/);
    expect(await recusa(call(null, "ch_worker_email_marcar", { p_id: 1, p_resultado: "enviado" }))).toMatch(/permission denied/);
    await expect(
      db.transaction(async (tx) => {
        await tx.exec(`set local role authenticated`);
        await tx.query(`select * from public.email_saida`);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("conta apagada: o e-mail pendente sai da fila", async () => {
    const id = await signUp();
    await naFila(id);
    await db.query(`delete from auth.users where id = $1`, [id]);
    expect(await fila(id)).toEqual([]);
  });
});

describe("013800 — escolha opcional de marketing (no onboarding e em Minha Conta; fora do cadastro)", () => {
  it("o cadastro não grava marketing, nem com o metadado antigo; sem escolha a pessoa não recebe", async () => {
    const id = await signUp({ marketing_opt_in: "true" });
    const outro = await signUp();
    for (const u of [id, outro]) {
      expect(await call(u, "app_marketing_get")).toEqual({ opt_in: false, updated_at: null, origin: null });
      expect(await linhas(`select 1 from public.marketing_consent_log where user_id = $1`, [u])).toEqual([]);
    }
    expect(await linhas(`select 1 from pg_trigger where tgname = 'on_auth_user_marketing'`)).toEqual([]);
  });

  it("onboarding, \"Sim, quero receber\": grava com data, origem e o texto mostrado", async () => {
    const id = await signUp();
    expect(await call(id, "app_marketing_set", { p_opt_in: true, p_origin: "onboarding" })).toMatchObject({ opt_in: true, origin: "onboarding" });
    const log = await linhas(`select opt_in, origin, texto, at from public.marketing_consent_log where user_id = $1`, [id]);
    expect(log).toEqual([{ opt_in: true, origin: "onboarding", texto: expect.stringMatching(/^Quer receber novidades e ofertas/), at: expect.any(Date) }]);
  });

  it("o texto guardado no histórico é o mesmo que a pergunta do onboarding mostra", () => {
    const c = ler("src/novo/app/account/MarketingPergunta.jsx");
    const v = (nome: string) => c.match(new RegExp(`export const ${nome} =\\s*"([^"]+)"`))![1];
    const guardado = `${v("MARKETING_PERGUNTA")} ${v("MARKETING_EXPLICACAO")} Resposta: ${v("MARKETING_SIM")}.`;
    expect(SQL[0]).toContain(`'${guardado}'`);
    expect(guardado.length).toBeLessThanOrEqual(300);
  });

  it("Minha Conta liga e desliga; repetir a mesma escolha não enche o histórico", async () => {
    const id = await signUp();
    expect(await call(id, "app_marketing_set", { p_opt_in: false })).toMatchObject({ opt_in: false });
    expect(await linhas(`select 1 from public.marketing_consent_log where user_id = $1`, [id])).toHaveLength(0);
    expect(await call(id, "app_marketing_set", { p_opt_in: true })).toMatchObject({ opt_in: true, origin: "minha_conta" });
    await call(id, "app_marketing_set", { p_opt_in: true });
    expect(await call(id, "app_marketing_set", { p_opt_in: false })).toMatchObject({ opt_in: false, origin: "minha_conta" });
    const log = await linhas(`select opt_in from public.marketing_consent_log where user_id = $1 order by id`, [id]);
    expect(log.map((l) => l.opt_in)).toEqual([true, false]);
  });

  it("visitante não chama; origens do cadastro não existem mais; o aluno não grava direto na tabela", async () => {
    const id = await signUp();
    expect(await recusa(call(null, "app_marketing_set", { p_opt_in: true, p_origin: "onboarding" }))).toMatch(/permission denied/);
    for (const o of ["cadastro", "cadastro_google", "link_email"]) {
      expect(await recusa(call(id, "app_marketing_set", { p_opt_in: true, p_origin: o }))).toMatch(/Escolha inválida/);
    }
    expect(await recusa(call(id, "app_marketing_set", { p_opt_in: null }))).toMatch(/Escolha inválida/);
    await expect(
      db.transaction(async (tx) => {
        await tx.exec(`set local role authenticated`);
        await tx.query(`insert into public.marketing_consents (user_id, opt_in, origin) values ($1, true, 'onboarding')`, [id]);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("conta apagada: escolha e histórico vão junto", async () => {
    const id = await signUp();
    await call(id, "app_marketing_set", { p_opt_in: true, p_origin: "onboarding" });
    await db.query(`delete from auth.users where id = $1`, [id]);
    expect(await linhas(`select 1 from public.marketing_consent_log where user_id = $1`, [id])).toEqual([]);
  });
});

describe("013810 — último acesso", () => {
  it("quem já existia conta como visto agora; app_marcar_acesso grava no máximo uma vez por hora", async () => {
    const [a] = await linhas(`select visto_em from public.conta_acesso where user_id = $1`, [antes]);
    expect(Date.now() - new Date(a.visto_em).getTime()).toBeLessThan(10 * 60_000);
    const id = await signUp();
    await call(id, "app_marcar_acesso");
    await db.query(`update public.conta_acesso set visto_em = now() - interval '30 minutes' where user_id = $1`, [id]);
    await call(id, "app_marcar_acesso");
    const [b] = await linhas(`select extract(epoch from now() - visto_em) as s from public.conta_acesso where user_id = $1`, [id]);
    expect(Number(b.s)).toBeGreaterThan(25 * 60);
    await db.query(`update public.conta_acesso set visto_em = now() - interval '2 hours' where user_id = $1`, [id]);
    await call(id, "app_marcar_acesso");
    const [c] = await linhas(`select extract(epoch from now() - visto_em) as s from public.conta_acesso where user_id = $1`, [id]);
    expect(Number(c.s)).toBeLessThan(60);
    expect(await recusa(call(null, "app_marcar_acesso"))).toMatch(/permission denied/);
  });
});

describe("013810 — conta inativa", () => {
  let gratis: string;
  let pago: string;
  let equipe: string;

  beforeAll(async () => {
    await limparFila();
    gratis = await signUp();
    pago = await signUp();
    equipe = await signUp({}, "admin");
    await db.query(`update public.subscriptions set plan = 'pro', status = 'canceled' where user_id = $1`, [pago]);
    await db.query(`insert into public.user_gamification_stats (user_id, coins) values ($1, 50) on conflict (user_id) do update set coins = 50`, [pago]);
    await db.query(`insert into public.coin_transactions (user_id, amount, type, source_type) values ($1, 50, 'earn', 'teste')`, [pago]);
    for (const u of [gratis, pago, equipe]) await parada(u, "11 months 10 days");
  });

  it("chaves desligadas (padrão): só relatório do que faria; nada muda", async () => {
    const r = await servico("ch_worker_contas_inativas");
    expect(r).toMatchObject({ modo: "ensaio", avisar_ligado: false, agir_ligado: false, avisos_criados: 0, feitos: 0 });
    const contas = r.contas.map((c: any) => c.conta);
    expect(contas).toEqual(expect.arrayContaining([gratis, pago]));
    expect(contas).not.toContain(equipe); // equipe nunca
    expect(r.contas.find((c: any) => c.conta === gratis).acao).toBe("apagar_conta");
    expect(r.contas.find((c: any) => c.conta === pago).acao).toBe("zerar_coins"); // já teve plano pago: não apaga
    expect(await linhas(`select 1 from public.conta_inativa`)).toEqual([]);
    expect(await linhas(`select 1 from public.email_saida where kind = 'aviso_inatividade'`)).toEqual([]);
    const [log] = await linhas(`select rotina, modo from public.app_rotinas_conta_log order by id desc limit 1`);
    expect(log).toEqual({ rotina: "contas_inativas", modo: "ensaio" });
  });

  it("conta parada há menos de 11 meses não entra", async () => {
    const recente = await signUp();
    await parada(recente, "10 months");
    const r = await servico("ch_worker_contas_inativas");
    expect(r.contas.map((c: any) => c.conta)).not.toContain(recente);
  });

  it("com o aviso ligado: um aviso por conta (rodar de novo não duplica), com o prazo calculado no envio", async () => {
    await chaves("inativas_avisar = true");
    const r = await servico("ch_worker_contas_inativas");
    expect(r.modo).toBe("ligada");
    expect(r.avisos_criados).toBeGreaterThanOrEqual(2);
    await servico("ch_worker_contas_inativas");
    const avisos = await linhas(`select account_id, acao, situacao from public.conta_inativa where account_id in ($1, $2) order by account_id`, [gratis, pago]);
    expect(avisos).toHaveLength(2);
    const lote = await servico("ch_worker_email_pegar", { p_limite: 100 });
    const meu = lote.find((x: any) => x.kind === "aviso_inatividade" && x.email === "pessoa" + parseInt(gratis.slice(-12), 16) + "@teste.dev");
    expect(meu.payload.acao).toBe("apagar_conta");
    const prazo = new Date(`${meu.payload.prazo}T12:00:00Z`).getTime();
    expect(prazo).toBeGreaterThan(Date.now() + 30 * 86_400_000);
    for (const x of lote) await servico("ch_worker_email_marcar", { p_id: x.id, p_resultado: x.kind === "aviso_inatividade" ? "enviado" : "cancelado" });
  });

  it("prazo vencido com a chave de agir desligada: só diz o que faria", async () => {
    await db.exec(`update public.email_saida set payload = payload || '{"prazo": "2026-01-01"}' where kind = 'aviso_inatividade'`);
    const r = await servico("ch_worker_contas_inativas");
    expect(r.prazo_vencido).toBeGreaterThanOrEqual(2);
    expect(r.feitos).toBe(0);
    expect(await linhas(`select 1 from auth.users where id = $1`, [gratis])).toHaveLength(1);
    expect((await linhas(`select coins from public.user_gamification_stats where user_id = $1`, [pago]))[0].coins).toBe(50);
  });

  it("com a chave de agir: conta gratuita é apagada (o aceite fica sem a pessoa); quem já pagou só perde os Coins", async () => {
    // o aceite da conta gratuita (para ver que a prova fica): gravado com data antiga, sem mudar o último acesso
    await db.exec(`alter table public.legal_acceptances disable trigger legal_acceptances_imutavel`);
    await aceitar(gratis);
    await db.query(`update public.legal_acceptances set accepted_at = now() - interval '12 months' where user_id = $1`, [gratis]);
    await db.exec(`alter table public.legal_acceptances enable trigger legal_acceptances_imutavel`);
    await chaves("inativas_agir = true");
    const r = await servico("ch_worker_contas_inativas");
    expect(r.feitos).toBeGreaterThanOrEqual(2);
    expect(r.falhas).toBe(0);
    expect(await linhas(`select 1 from auth.users where id = $1`, [gratis])).toEqual([]);
    expect(await linhas(`select user_id, account_id from public.legal_acceptances where account_id = $1`, [gratis])).toEqual([{ user_id: null, account_id: gratis }]);
    expect(await linhas(`select 1 from public.legal_contrato_fim where account_id = $1`, [gratis])).toHaveLength(1);
    const [aviso] = await linhas(`select situacao, aviso_enviado_em, prazo from public.conta_inativa where account_id = $1`, [gratis]);
    expect(aviso.situacao).toBe("feito");
    expect(aviso.aviso_enviado_em).not.toBeNull();
    // pago: conta fica, Coins zerados pelo livro-razão
    expect(await linhas(`select 1 from auth.users where id = $1`, [pago])).toHaveLength(1);
    expect((await linhas(`select coins from public.user_gamification_stats where user_id = $1`, [pago]))[0].coins).toBe(0);
    const [{ soma }] = await linhas(`select sum(amount)::int as soma from public.coin_transactions where user_id = $1`, [pago]);
    expect(soma).toBe(0);
    expect(await linhas(`select type, source_type from public.coin_transactions where user_id = $1 and amount < 0`, [pago])).toEqual([{ type: "adjust", source_type: "inatividade" }]);
    // feito neste período: não avisa de novo
    const r2 = await servico("ch_worker_contas_inativas");
    expect(r2.contas.map((c: any) => c.conta)).not.toContain(pago);
    await chaves("inativas_avisar = false, inativas_agir = false");
  });

  it("quem volta a acessar antes do prazo: o aviso é fechado e o e-mail pendente cancelado", async () => {
    await chaves("inativas_avisar = true");
    const volta = await signUp();
    await parada(volta, "11 months 5 days");
    await servico("ch_worker_contas_inativas");
    expect((await linhas(`select situacao from public.conta_inativa where account_id = $1`, [volta]))[0].situacao).toBe("avisando");
    await call(volta, "app_marcar_acesso");
    const r = await servico("ch_worker_contas_inativas");
    expect(r.voltaram).toBeGreaterThanOrEqual(1);
    expect((await linhas(`select situacao, detalhe from public.conta_inativa where account_id = $1`, [volta]))[0]).toEqual({ situacao: "cancelado", detalhe: "A pessoa voltou a acessar." });
    expect((await fila(volta)).at(-1).status).toBe("cancelado");
    await chaves("inativas_avisar = false");
  });

  it("o dia do prazo ainda vale: a ação só acontece a partir do dia seguinte (horário de Brasília)", async () => {
    await chaves("inativas_avisar = true, inativas_agir = true");
    try {
      const dia = await signUp();
      await parada(dia, "13 months");
      await servico("ch_worker_contas_inativas");
      const [e] = (await fila(dia)).filter((x) => x.kind === "aviso_inatividade");
      await db.query(`update public.email_saida set status = 'enviado', enviado_em = now() - interval '40 days',
                        payload = payload || jsonb_build_object('prazo', to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'))
                      where id = $1`, [e.id]);
      await servico("ch_worker_contas_inativas");
      expect(await linhas(`select 1 from auth.users where id = $1`, [dia])).toHaveLength(1);
      await db.query(`update public.email_saida set payload = payload || jsonb_build_object('prazo', to_char((now() at time zone 'America/Sao_Paulo')::date - 1, 'YYYY-MM-DD')) where id = $1`, [e.id]);
      await servico("ch_worker_contas_inativas");
      expect(await linhas(`select 1 from auth.users where id = $1`, [dia])).toEqual([]);
    } finally {
      await chaves("inativas_avisar = false, inativas_agir = false");
    }
  });

  it("aviso que não foi entregue: nada é feito; tenta outro aviso; depois de 3, desiste", async () => {
    await chaves("inativas_avisar = true, inativas_agir = true");
    const sem = await signUp();
    await parada(sem, "13 months");
    for (let i = 0; i < 4; i++) {
      await servico("ch_worker_contas_inativas");
      await db.query(`update public.email_saida set status = 'falhou' where user_id = $1 and kind = 'aviso_inatividade' and status = 'pendente'`, [sem]);
    }
    await servico("ch_worker_contas_inativas");
    const avisos = await linhas(`select situacao from public.conta_inativa where account_id = $1`, [sem]);
    expect(avisos.map((a) => a.situacao)).toEqual(["cancelado", "cancelado", "cancelado"]);
    expect(await linhas(`select 1 from auth.users where id = $1`, [sem])).toHaveLength(1);
    await chaves("inativas_avisar = false, inativas_agir = false");
  });

  it("desligar o aviso cancela os que ainda não saíram; o relatório guardado não leva a lista de contas", async () => {
    await chaves("inativas_avisar = true");
    const p = await signUp();
    await parada(p, "11 months 15 days");
    await servico("ch_worker_contas_inativas");
    expect((await fila(p)).at(-1)).toMatchObject({ kind: "aviso_inatividade", status: "pendente" });
    await chaves("inativas_avisar = false");
    const r = await servico("ch_worker_contas_inativas");
    expect(r.contas.length).toBeGreaterThan(0); // a resposta traz a lista (para o dono ver)
    expect((await fila(p)).at(-1)).toMatchObject({ status: "cancelado", erro: "Aviso de conta inativa desligado." });
    const [log] = await linhas(`select resultado from public.app_rotinas_conta_log where rotina = 'contas_inativas' order by id desc limit 1`);
    expect(log.resultado).not.toHaveProperty("contas");
    expect(log.resultado).toHaveProperty("para_avisar");
  });

  it("quem virou equipe entre o aviso e o prazo não perde os Coins", async () => {
    await chaves("inativas_avisar = true, inativas_agir = true");
    try {
      const vira = await signUp();
      await db.query(`update public.subscriptions set plan = 'pro', status = 'canceled' where user_id = $1`, [vira]);
      await db.query(`insert into public.user_gamification_stats (user_id, coins) values ($1, 30) on conflict (user_id) do update set coins = 30`, [vira]);
      await parada(vira, "12 months");
      await servico("ch_worker_contas_inativas");
      await db.query(`update public.email_saida set status = 'enviado', enviado_em = now(), payload = payload || '{"prazo": "2026-01-01"}' where user_id = $1 and kind = 'aviso_inatividade'`, [vira]);
      await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [vira]);
      await servico("ch_worker_contas_inativas");
      expect((await linhas(`select coins from public.user_gamification_stats where user_id = $1`, [vira]))[0].coins).toBe(30);
      expect((await linhas(`select situacao, detalhe from public.conta_inativa where account_id = $1`, [vira]))[0]).toEqual({ situacao: "cancelado", detalhe: "Deixou de ser aluno; os Coins não foram zerados." });
    } finally {
      await chaves("inativas_avisar = false, inativas_agir = false");
    }
  });

  it("aluno e visitante não rodam a rotina nem leem as chaves", async () => {
    const id = await signUp();
    expect(await recusa(call(id, "ch_worker_contas_inativas"))).toMatch(/permission denied/);
    expect(await recusa(call(id, "ch_worker_expurgo_aceites"))).toMatch(/permission denied/);
    await expect(
      db.transaction(async (tx) => {
        await tx.exec(`set local role authenticated`);
        await tx.query(`update public.app_rotinas_conta_config set expurgo_ativo = true`);
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("013810 — expurgo dos aceites 5 anos depois do fim do contrato", () => {
  let velho: string;
  let novo: string;
  let vivo: string;

  beforeAll(async () => {
    velho = await signUp();
    novo = await signUp();
    vivo = await signUp();
    for (const u of [velho, novo, vivo]) await aceitar(u);
    await db.query(`delete from auth.users where id = any ($1::uuid[])`, [[velho, novo]]);
    // contrato do "velho" terminou há 5 anos e 1 dia
    await db.query(`update public.legal_contrato_fim set terminou_em = now() - interval '5 years 1 day' where account_id = $1`, [velho]);
  });

  it("apagar a conta registra o fim do contrato", async () => {
    expect(await linhas(`select account_id from public.legal_contrato_fim where account_id = any ($1::uuid[]) order by account_id`, [[velho, novo]])).toHaveLength(2);
  });

  it("chave desligada (padrão): só conta o que apagaria; nada é apagado", async () => {
    const r = await servico("ch_worker_expurgo_aceites");
    expect(r).toMatchObject({ modo: "ensaio", aceites_vencidos: 1, contas: 1, aceites_apagados: 0 });
    expect(await linhas(`select 1 from public.legal_acceptances where account_id = $1`, [velho])).toHaveLength(1);
  });

  it("chave ligada: apaga só os aceites vencidos; a trava continua valendo para todo o resto", async () => {
    await chaves("expurgo_ativo = true");
    try {
      const r = await servico("ch_worker_expurgo_aceites");
      expect(r).toMatchObject({ modo: "ligada", aceites_apagados: 1 });
      expect(await linhas(`select 1 from public.legal_acceptances where account_id = $1`, [velho])).toEqual([]);
      expect(await linhas(`select 1 from public.legal_contrato_fim where account_id = $1`, [velho])).toEqual([]);
      expect(await linhas(`select 1 from public.legal_acceptances where account_id = $1`, [novo])).toHaveLength(1); // menos de 5 anos
      expect(await linhas(`select 1 from public.legal_acceptances where account_id = $1`, [vivo])).toHaveLength(1); // conta existe
      // a chave do expurgo não fica ligada depois da rotina
      await expect(db.query(`delete from public.legal_acceptances where account_id = $1`, [novo])).rejects.toThrow(/não pode ser apagada/);
      // conta que existe nunca é expurgada, mesmo com data antiga de fim
      await db.query(`insert into public.legal_contrato_fim (account_id, terminou_em) values ($1, now() - interval '10 years') on conflict (account_id) do update set terminou_em = excluded.terminou_em`, [vivo]);
      expect((await servico("ch_worker_expurgo_aceites")).aceites_apagados).toBe(0);
      expect(await linhas(`select 1 from public.legal_acceptances where account_id = $1`, [vivo])).toHaveLength(1);
    } finally {
      await chaves("expurgo_ativo = false");
    }
  });

  it("aceite antigo sem identificador da conta conta os 5 anos a partir da migração", async () => {
    await db.exec(`alter table public.legal_acceptances disable trigger legal_acceptances_imutavel`);
    await db.exec(`alter table public.legal_acceptances disable trigger legal_acceptances_carimbo`);
    await db.exec(`insert into public.legal_acceptances (user_id, account_id, document, version, origin, email_hash) values (null, null, 'termo_uso', '1.0', 'cadastro', 'x')`);
    await db.exec(`alter table public.legal_acceptances enable trigger legal_acceptances_carimbo`);
    await db.exec(`alter table public.legal_acceptances enable trigger legal_acceptances_imutavel`);
    expect((await servico("ch_worker_expurgo_aceites")).aceites_vencidos).toBe(0);
    await db.exec(`update public.app_rotinas_conta_config set criado_em = now() - interval '5 years 1 day'`);
    expect((await servico("ch_worker_expurgo_aceites")).aceites_vencidos).toBe(1);
    await db.exec(`update public.app_rotinas_conta_config set criado_em = now()`);
  });
});

describe("desfazer e aplicar de novo", () => {
  it("desfazer tira tudo sem tocar nos aceites; aplicar de novo volta a funcionar", async () => {
    const [{ n }] = await linhas(`select count(*)::int as n from public.legal_acceptances`);
    await db.exec(DESFAZER[1]);
    await db.exec(DESFAZER[1]); // pode ser colado duas vezes
    await db.exec(DESFAZER[0]);
    await db.exec(DESFAZER[0]);
    for (const t of ["email_saida", "marketing_consents", "marketing_consent_log", "conta_acesso", "conta_inativa", "legal_contrato_fim", "app_rotinas_conta_config"]) {
      expect((await linhas(`select to_regclass($1) as r`, [`public.${t}`]))[0].r).toBeNull();
    }
    expect((await linhas(`select count(*)::int as n from public.legal_acceptances`))[0].n).toBe(n);
    // as provas não são apagadas: ficam guardadas com outro nome
    const [{ log }] = await linhas(`select count(*)::int as log from public.marketing_consent_log_desfeito`);
    expect(log).toBeGreaterThan(0);
    expect((await linhas(`select count(*)::int as c from public.conta_inativa_desfeito`))[0].c).toBeGreaterThan(0);
    expect((await linhas(`select count(*)::int as c from public.legal_contrato_fim_desfeito`))[0].c).toBeGreaterThan(0);
    // aceite e cadastro seguem funcionando sem as funções novas
    const id = await signUp({ terms_version: "3.0", declares_adult: "true" });
    expect(await linhas(`select 1 from public.legal_acceptances where user_id = $1`, [id])).toHaveLength(1);
    for (const s of SQL) await db.exec(s);
    const outro = await signUp();
    await aceitar(outro);
    await call(outro, "app_marketing_set", { p_opt_in: true, p_origin: "onboarding" });
    expect(await fila(outro)).toEqual([]); // o aceite não manda cópia por e-mail
    await naFila(outro);
    expect(await fila(outro)).toHaveLength(1);
    expect(await call(outro, "app_marketing_get")).toMatchObject({ opt_in: true });
    expect((await servico("ch_worker_contas_inativas")).modo).toBe("ensaio");
    // a migração voltou com os índices dela (o aviso aberto continua único por conta)
    expect(await linhas(`select 1 from pg_indexes where tablename = 'conta_inativa' and indexname = 'conta_inativa_aberta_idx'`)).toHaveLength(1);
    // desfazer de novo, com a cópia guardada já existindo, junta as linhas
    await db.exec(DESFAZER[1]);
    await db.exec(DESFAZER[0]);
    for (const s of SQL) await db.exec(s);
  });
});
