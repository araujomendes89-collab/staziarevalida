// @vitest-environment node
/**
 * Fontes vinculadas da questão (migração …9900, pedido do dono de 12/10/2026), no banco de teste local (PGlite com TODAS as
 * migrações em ordem e a carga de sempre: as 1.200 questões oficiais reais). Sem rede e sem chave nenhuma.
 * Dados REAIS (regra do dono): questões oficiais da carga, fontes do catálogo conferido e, como "citação", um trecho literal do
 * enunciado da própria questão (helpers/fontesVinculadasReais.ts). Só a infraestrutura é simulada.
 *  - o aluno e o visitante não leem as tabelas direto; a equipe lê; ninguém grava direto (só pelas funções e pelo SQL do dono);
 *  - a função do aluno devolve SÓ vínculos confirmados, só depois de responder; a versão da época da prova vem marcada como
 *    histórica e separada da referência atual; "não confirmada" = aviso sem referência atual; sem conferência = nada;
 *  - o visitante é barrado; anulada e recolhida não mostram nada;
 *  - a equipe confirma e tira (com Registro); o aluno não chega às funções da equipe;
 *  - o gabarito oficial nunca muda;
 *  - o SQL do gerador (scripts/fontes-vinculadas) grava, colado de novo não muda nada, e fonte fora do banco não entra.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";
import {
  ATLS_COMPLEMENTAR, CAB_RASTREAMENTO, CP57_COLO, PCDT_IC, Q_IC, Q_RASTREAMENTO, SBC_IC_2018, SBC_IC_2026, SECAO_ENUNCIADO,
  TRECHO_IC_1, TRECHO_IC_2, TRECHO_RASTREAMENTO, type FonteReal,
} from "./helpers/fontesVinculadasReais";
// @ts-ignore script em JavaScript puro (roda com node, sem compilar)
import { chaveUrl, gerarSql, limpaNotaAtualizacao, normUrl, parseFontes } from "../../scripts/fontes-vinculadas/gerar-sql.mjs";

vi.setConfig({ testTimeout: 180_000 });

// questões oficiais reais de insuficiência cardíaca (as mesmas de comentarios-agentes/questoes-1200.json)
const Q_IC_APS = "revalida_2026_1_q084";
const Q_IC_IDOSA = "revalida_2026_1_q086";
const Q_IC_2025 = "revalida_2025_2_q001";
// link real do catálogo (lc-tabagismo) que NÃO está na biblioteca do banco de teste
const URL_FORA_DO_BANCO = "https://linhasdecuidado.saude.gov.br/portal/tabagismo/";

let env: StaziaEnv;
let Q: string[] = []; // outras questões oficiais válidas da carga (testes de estrutura)
let QCODE: Record<string, string> = {};
let VIG: string, SBC26: string, OLD: string, CAB: string, CP: string, COMP: string;
let gabaritoAntes: unknown;

const addSource = async (f: FonteReal, extra: { superseded_by?: string } = {}) =>
  (
    await env.sql<{ id: string }>(
      `insert into public.ch_sources (title, organ, kind, status, version, published_on, url, audience, superseded_by, editorial_approved)
       values ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10) returning id`,
      // diretriz de sociedade: aprovação editorial da biblioteca simulada (infraestrutura)
      [f.title, f.organ, f.kind, f.status, f.version, f.published_on, f.url, f.audience, extra.superseded_by ?? null, f.kind === "society_guideline"]
    )
  )[0].id;

/** Trecho literal do enunciado real (a primeira frase, até 300 caracteres, espaços juntados como o banco faz). */
const trechoDe = async (id: string) => {
  const [{ statement }] = await env.sql<{ statement: string }>(`select statement from public.questions where id = $1`, [id]);
  const s = statement.replace(/\s+/g, " ").trim();
  const fim = s.indexOf(". ");
  let t = fim > 0 ? s.slice(0, fim + 1) : s;
  if (t.length > 300) t = t.slice(0, t.lastIndexOf(" ", 300));
  return t;
};

type LinkIn = { q: string; source: string; role?: string; temporal?: string; status?: string; quote?: string | null; section?: string | null; label?: string | null; page?: number | null; act?: string | null; passage?: string | null; note?: string | null };
const addLink = async (o: LinkIn) =>
  (
    await env.sql<{ id: string }>(
      `insert into public.question_source_links (question_id, source_id, role, temporal, page, page_label, section, quote, act, status, origin, passage_id, update_note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'importacao', $11, $12) returning id`,
      [o.q, o.source, o.role ?? "conduta", o.temporal ?? "vigente", o.page ?? null, o.label ?? null, o.section === undefined ? SECAO_ENUNCIADO : o.section,
        o.quote === undefined ? await trechoDe(o.q) : o.quote, o.act ?? null, o.status ?? "confirmada", o.passage ?? null, o.note ?? null]
    )
  )[0].id;
const setCheck = (q: string, status: string, note: string | null = null) =>
  env.sql(`insert into public.question_source_checks (question_id, status, note, origin) values ($1, $2, $3, 'importacao')
           on conflict (question_id) do update set status = excluded.status, note = excluded.note`, [q, status, note]);
const answer = (uid: string, q: string) => env.sql(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, $2, 'A')`, [uid, q]);
const view = (uid: string, q: string) => env.rpc<any>(uid, "app_question_source_links", { p_question_id: q });
const asAnon = <T = any>(q: string, p: unknown[] = []) =>
  env.dev.db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    return (await tx.query<T>(q, p)).rows;
  });
/** Uma questão oficial REAL copiada como Questão StaziaMed (só a marca de origem é simulada). */
const comoStaziaMed = async (from: string) => {
  const [{ n }] = await env.sql<{ n: number }>(`select coalesce(max(number), 0) + 1 as n from public.questions where exam_id = 'staziamed'`);
  const id = `staziamed_q${String(n).padStart(4, "0")}`;
  await env.sql(
    `insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option, origin)
     select $1, 'STZ-' || lpad($2::text, 4, '0'), 'staziamed', $2::int, area, topic, statement, options, correct_option, 'staziamed' from public.questions where id = $3`,
    [id, n, from]
  );
  return id;
};
const todas = () => [Q_IC.id, Q_IC_APS, Q_IC_IDOSA, Q_IC_2025, Q_RASTREAMENTO.id, ...Q];
// gabarito e situação de TODAS as questões oficiais e o histórico do gabarito oficial (impressão digital)
const gabarito = async () =>
  (await env.sql(`select (select md5(string_agg(id || ':' || coalesce(correct_option::text, '-') || ':' || status, '|' order by id)) from public.questions where origin = 'official') as questoes,
                         (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.question_official_answers t) as registros`))[0];

beforeAll(async () => {
  env = await openStaziaEnv();
  const reais = [Q_IC.id, Q_IC_APS, Q_IC_IDOSA, Q_IC_2025, Q_RASTREAMENTO.id];
  const rows = await env.sql<{ id: string; code: string }>(
    `select id, code from public.questions where origin = 'official' and status = 'valid' and correct_option is not null and not (id = any($1::text[])) order by id limit 8`, [reais]
  );
  Q = rows.map((r) => r.id);
  QCODE = Object.fromEntries((await env.sql<{ id: string; code: string }>(`select id, code from public.questions where id = any($1::text[])`, [todas()])).map((r) => [r.id, r.code]));
  VIG = await addSource(PCDT_IC);
  SBC26 = await addSource(SBC_IC_2026);
  OLD = await addSource(SBC_IC_2018, { superseded_by: SBC26 });
  CAB = await addSource(CAB_RASTREAMENTO);
  CP = await addSource(CP57_COLO);
  COMP = await addSource(ATLS_COMPLEMENTAR);
  gabaritoAntes = await gabarito();
}, 900_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

describe("Dados reais da carga", () => {
  it("as questões reais existem, válidas, e os trechos usados como citação estão literalmente no enunciado", async () => {
    const rows = await env.sql<{ id: string; code: string; status: string; statement: string }>(
      `select id, code, status, regexp_replace(statement, '\\s+', ' ', 'g') as statement from public.questions where id = any($1::text[]) order by id`,
      [[Q_IC.id, Q_IC_APS, Q_IC_IDOSA, Q_IC_2025, Q_RASTREAMENTO.id]]
    );
    expect(rows.map((r) => [r.id, r.status])).toEqual([[Q_IC.id, "valid"], [Q_RASTREAMENTO.id, "valid"], [Q_IC_2025, "valid"], [Q_IC_APS, "valid"], [Q_IC_IDOSA, "valid"]]);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by[Q_IC.id].code).toBe(Q_IC.code);
    expect(by[Q_RASTREAMENTO.id].code).toBe(Q_RASTREAMENTO.code);
    expect(by[Q_IC.id].statement).toContain(TRECHO_IC_1);
    expect(by[Q_IC.id].statement).toContain(TRECHO_IC_2);
    expect(by[Q_RASTREAMENTO.id].statement).toContain(TRECHO_RASTREAMENTO);
    for (const id of [Q_IC_APS, Q_IC_IDOSA, Q_IC_2025, ...Q]) {
      const [{ s }] = await env.sql<{ s: string }>(`select regexp_replace(statement, '\\s+', ' ', 'g') as s from public.questions where id = $1`, [id]);
      expect(s, id).toContain(await trechoDe(id));
    }
  });
});

describe("Acesso às tabelas", () => {
  it("o aluno e o visitante não leem as tabelas direto; a equipe lê; ninguém grava direto", async () => {
    await addLink({ q: Q[0], source: CAB });
    await setCheck(Q[0], "confirmada");
    for (const t of ["question_source_links", "question_source_checks"]) {
      expect((await env.sqlAs(USERS.PRO, `select count(*)::int as n from public.${t}`))[0].n, t).toBe(0);
      expect((await env.sqlAs(USERS.TESTE, `select count(*)::int as n from public.${t}`))[0].n, t).toBe(0);
      await expect(asAnon(`select * from public.${t}`), t).rejects.toThrow(/permission denied/);
      expect((await env.sqlAs(USERS.EDITOR, `select count(*)::int as n from public.${t}`))[0].n, t).toBeGreaterThan(0);
      expect((await env.sqlAs(USERS.REVISOR_PED, `select count(*)::int as n from public.${t}`))[0].n, t).toBeGreaterThan(0);
    }
    // escrever direto: recusado até para a equipe (a escrita é pelas funções, com Registro)
    for (const uid of [USERS.PRO, USERS.EDITOR, USERS.ADMIN]) {
      await expect(env.sqlAs(uid, `insert into public.question_source_links (question_id, source_id, role, temporal, section, quote, status) values ($1, $2, 'conduta', 'historica', $3, $4, 'confirmada')`, [Q[0], OLD, SECAO_ENUNCIADO, await trechoDe(Q[0])]), uid).rejects.toThrow(/permission denied/);
      await expect(env.sqlAs(uid, `update public.question_source_links set section = null`), uid).rejects.toThrow(/permission denied/);
      await expect(env.sqlAs(uid, `delete from public.question_source_checks`), uid).rejects.toThrow(/permission denied/);
    }
    const [rls] = await env.sql(`select bool_and(relrowsecurity) as rls from pg_class where oid in ('public.question_source_links'::regclass, 'public.question_source_checks'::regclass)`);
    expect(rls.rls).toBe(true);
  });
});

describe("O que o aluno lê (app_question_source_links)", () => {
  it("só vínculos confirmados, só depois de responder; a versão da época da prova vem marcada como histórica", async () => {
    const q = Q_IC.id;
    await addLink({ q, source: VIG, role: "conduta", quote: TRECHO_IC_1, act: PCDT_IC.act });
    await addLink({ q, source: VIG, role: "diagnostico", quote: TRECHO_IC_2, status: "em_revisao" });
    await addLink({ q, source: OLD, role: "conduta", temporal: "historica", quote: TRECHO_IC_2 });
    await addLink({ q, source: OLD, role: "diagnostico", temporal: "historica", quote: TRECHO_IC_1, status: "nao_confirmada" });
    // referência atual numa versão substituída: não aparece como atual
    await addLink({ q, source: OLD, role: "exame", quote: TRECHO_IC_1 });
    // consulta pública não vale como referência atual
    await addLink({ q, source: CP, role: "tratamento", quote: TRECHO_IC_1 });
    await setCheck(q, "confirmada");

    expect(await view(USERS.PRO, q)).toBeNull(); // ainda não respondeu
    await answer(USERS.PRO, q);
    const r = await view(USERS.PRO, q);
    expect(r.status).toBe("confirmada");
    expect(r.checked_at).toBeTruthy();
    expect(r.current).toHaveLength(1);
    expect(r.current[0]).toMatchObject({
      title: PCDT_IC.title, organ: PCDT_IC.organ, year: 2024, version: PCDT_IC.version, url: PCDT_IC.url, act: PCDT_IC.act, update_note: null,
      page: null, page_label: null, section: SECAO_ENUNCIADO, quote: TRECHO_IC_1, temporal: "vigente", role: "conduta",
    });
    expect(r.current[0].validity_checked_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.current[0].verified_at).toBeTruthy();
    expect(r.historical).toHaveLength(1);
    expect(r.historical[0]).toMatchObject({ title: SBC_IC_2018.title, temporal: "historica", role: "conduta", version: SBC_IC_2018.version, year: null, quote: TRECHO_IC_2, validity_checked_on: null, update_note: null });
    // campos mínimos: nada interno (ids, situação, origem, quem conferiu, motivo)
    for (const item of [...r.current, ...r.historical]) {
      expect(Object.keys(item).sort()).toEqual(["act", "organ", "page", "page_label", "quote", "role", "section", "temporal", "title", "update_note", "url", "validity_checked_on", "verified_at", "version", "year"].sort());
    }
    expect(JSON.stringify(r)).not.toMatch(/em_revisao|nao_confirmada|importacao|source_id|"id"/);
    // a equipe vê sem responder
    expect((await view(USERS.EDITOR, q)).current).toHaveLength(1);
    // outro aluno que não respondeu: nada
    expect(await view(USERS.TESTE, q)).toBeNull();
  });

  it("conferida e NÃO confirmada: aviso (sem referência atual, mesmo havendo uma confirmada); o histórico continua", async () => {
    const q = Q_IC_APS;
    await addLink({ q, source: VIG });
    await addLink({ q, source: OLD, temporal: "historica" });
    await setCheck(q, "nao_confirmada", "Nota de teste da conferência.");
    await answer(USERS.PRO, q);
    const r = await view(USERS.PRO, q);
    expect(r.status).toBe("nao_confirmada");
    expect(r.current).toEqual([]);
    expect(r.historical).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain("Nota de teste"); // a nota é da equipe
    // só a conferência, sem vínculo nenhum: o aviso aparece
    const q2 = Q[1];
    await setCheck(q2, "nao_confirmada");
    await answer(USERS.PRO, q2);
    expect(await view(USERS.PRO, q2)).toMatchObject({ status: "nao_confirmada", current: [], historical: [] });
  });

  it("ainda não conferida e sem vínculo confirmado: nada (nulo)", async () => {
    const q = Q[2];
    await addLink({ q, source: CAB, status: "em_revisao" });
    await answer(USERS.PRO, q);
    expect(await view(USERS.PRO, q)).toBeNull();
    await answer(USERS.PRO, Q[3]);
    expect(await view(USERS.PRO, Q[3])).toBeNull();
  });

  it("visitante barrado; questão anulada e Questão StaziaMed recolhida não mostram nada", async () => {
    await expect(asAnon(`select public.app_question_source_links($1)`, [Q_IC.id])).rejects.toThrow(/permission denied/);
    const novas = ["app_question_source_links(text)", "app_admin_question_source_links(text)", "app_admin_question_source_link_confirm(uuid)", "app_admin_question_source_link_remove(uuid,text)", "question_source_link_hidden(uuid)", "question_source_vigente_problem(uuid)", "question_source_links_guard()"];
    for (const f of novas) expect((await env.sql(`select has_function_privilege('anon', 'public.${f}', 'execute') as x`))[0].x, f).toBe(false);
    for (const f of novas.slice(4)) expect((await env.sql(`select has_function_privilege('authenticated', 'public.${f}', 'execute') as x`))[0].x, f).toBe(false);

    const [anulada] = await env.sql<{ id: string }>(`select id from public.questions where origin = 'official' and status = 'annulled' order by id limit 1`);
    expect(anulada, "a carga real tem questão anulada").toBeTruthy();
    await addLink({ q: anulada.id, source: CAB });
    await setCheck(anulada.id, "confirmada");
    await answer(USERS.PRO, anulada.id);
    expect(await view(USERS.PRO, anulada.id)).toBeNull();
    expect(await view(USERS.EDITOR, anulada.id)).toBeNull();

    const stz = await comoStaziaMed(Q[4]);
    await addLink({ q: stz, source: CAB });
    await setCheck(stz, "confirmada");
    await answer(USERS.PRO, stz);
    expect((await view(USERS.PRO, stz)).current).toHaveLength(1);
    await env.sql(`update public.questions set retired_at = now() where id = $1`, [stz]);
    expect(await view(USERS.PRO, stz)).toBeNull();
  });
});

describe("Regras do banco em qualquer gravação", () => {
  it("só fonte oficial; StaziaMed sem versão da época da prova; confirmado precisa de citação e página ou seção; citação curta", async () => {
    const q = Q[5];
    await expect(addLink({ q, source: COMP })).rejects.toThrow(/Só fonte oficial pode ser vinculada/);
    const stz = await comoStaziaMed(Q_IC_IDOSA);
    await expect(addLink({ q: stz, source: OLD, temporal: "historica" })).rejects.toThrow(/Questão StaziaMed não tem "versão da época da prova"/);
    await expect(addLink({ q, source: CAB, quote: null })).rejects.toThrow(/question_source_links_confirmed_has_passage/);
    await expect(addLink({ q, source: CAB, section: null })).rejects.toThrow(/question_source_links_confirmed_has_passage/);
    const [{ s }] = await env.sql<{ s: string }>(`select regexp_replace(statement, '\\s+', ' ', 'g') as s from public.questions where id = $1`, [q]);
    expect(s.length).toBeGreaterThan(401);
    await expect(addLink({ q, source: CAB, quote: s.slice(0, 401) })).rejects.toThrow(/question_source_links_quote_check/);
    await expect(addLink({ q, source: CAB, role: "papel_que_nao_existe" })).rejects.toThrow(/question_source_links_role_check/);
    // trecho indexado de OUTRA fonte: recusado (o trecho guardado é o mesmo trecho literal do enunciado)
    const [{ id: passage }] = await env.sql<{ id: string }>(`insert into public.ch_source_passages (source_id, section, text) values ($1, $2, $3) returning id`, [OLD, SECAO_ENUNCIADO, await trechoDe(q)]);
    await expect(addLink({ q, source: CAB, passage })).rejects.toThrow(/O trecho escolhido não é deste documento/);
    // a nota "O que mudou desde a prova": só na referência atual, e só vai ao aluno aprovada por uma pessoa da equipe
    await expect(addLink({ q, source: OLD, temporal: "historica", status: "em_revisao", note: "Nota de teste." } as any)).rejects.toThrow(/question_source_links_update_note_current/);
    await expect(addLink({ q, source: CAB, note: "Nota de teste." } as any)).rejects.toThrow(/só vai ao aluno depois de aprovada pela equipe/);
    // em revisão pode ficar sem citação; quebras de linha do PDF viram espaço
    const literal = await trechoDe(q);
    const [a, ...b] = literal.split(" ");
    const id = await addLink({ q, source: CAB, status: "em_revisao", quote: `  ${a}\n  ${b.join(" ")}  ` });
    expect((await env.sql(`select quote from public.question_source_links where id = $1`, [id]))[0].quote).toBe(literal);
    await env.sql(`delete from public.question_source_links where id = $1`, [id]);
  });
});

describe("Equipe: Confirmar e Tirar (Administração › Questões), com Registro", () => {
  it("o aluno não chega às funções da equipe", async () => {
    await expect(env.rpc(USERS.PRO, "app_admin_question_source_links", { p_question_id: Q[0] })).rejects.toThrow("Acesso restrito à equipe.");
    const [{ id }] = await env.sql<{ id: string }>(`select id from public.question_source_links where question_id = $1 limit 1`, [Q[0]]);
    await expect(env.rpc(USERS.PRO, "app_admin_question_source_link_confirm", { p_link_id: id })).rejects.toThrow("Acesso restrito à equipe.");
    await expect(env.rpc(USERS.REVISOR_PED, "app_admin_question_source_link_remove", { p_link_id: id })).rejects.toThrow("Acesso restrito à equipe.");
  });

  it("confirmar grava quem e quando, cria a conferência e libera ao aluno; tirar a única referência atual volta a 'ainda não conferida'", async () => {
    const q = Q_IC_IDOSA;
    const trecho = await trechoDe(q);
    const atual = await addLink({ q, source: VIG, status: "em_revisao" });
    const velha = await addLink({ q, source: OLD, role: "exame", status: "em_revisao" }); // referência atual numa versão substituída
    const hist = await addLink({ q, source: OLD, temporal: "historica", status: "em_revisao" });
    await answer(USERS.PRO, q);
    expect(await view(USERS.PRO, q)).toBeNull();

    const lista = await env.rpc<any>(USERS.EDITOR, "app_admin_question_source_links", { p_question_id: q });
    expect(lista.check).toBeNull();
    expect(lista.links.map((l: any) => [l.temporal, l.role, l.status])).toEqual([["vigente", "exame", "em_revisao"], ["vigente", "conduta", "em_revisao"], ["historica", "conduta", "em_revisao"]]);
    expect(lista.links[0].source).toMatchObject({ title: SBC_IC_2018.title, version: SBC_IC_2018.version, status: "superseded" });

    await expect(env.rpc(USERS.EDITOR, "app_admin_question_source_link_confirm", { p_link_id: velha })).rejects.toThrow(/A fonte foi substituída por uma versão mais nova/);
    const depois = await env.rpc<any>(USERS.EDITOR, "app_admin_question_source_link_confirm", { p_link_id: atual });
    const confirmado = depois.links.find((l: any) => l.id === atual);
    expect(confirmado).toMatchObject({ status: "confirmada", verified_by: "editor@staziamed.teste", hidden: null });
    expect(depois.check).toMatchObject({ status: "confirmada", origin: "equipe", checked_by: "editor@staziamed.teste" });
    await env.rpc(USERS.ADMIN, "app_admin_question_source_link_confirm", { p_link_id: hist });
    const r = await view(USERS.PRO, q);
    expect(r.status).toBe("confirmada");
    expect(r.current.map((i: any) => [i.role, i.title])).toEqual([["conduta", PCDT_IC.title]]);
    expect(r.historical.map((i: any) => [i.temporal, i.title])).toEqual([["historica", SBC_IC_2018.title]]);

    const sem = await env.rpc<any>(USERS.EDITOR, "app_admin_question_source_link_remove", { p_link_id: atual, p_reason: "Motivo de teste." });
    expect(sem.links.find((l: any) => l.id === atual)).toBeUndefined();
    expect(sem.check).toBeNull(); // sem referência atual confirmada, volta a "ainda não conferida"
    const r2 = await view(USERS.PRO, q);
    expect(r2).toMatchObject({ status: null, current: [], historical: [expect.objectContaining({ temporal: "historica" })] });
    await expect(env.rpc(USERS.EDITOR, "app_admin_question_source_link_remove", { p_link_id: atual })).rejects.toThrow("Vínculo não encontrado.");

    const log = await env.sql(`select action, actor_id, target, details from public.admin_audit_log where action like 'question.source_link%' and target = $1 order by id`, [q]);
    expect(log.map((x: any) => [x.action, x.actor_id])).toEqual([
      ["question.source_link_confirmed", USERS.EDITOR],
      ["question.source_link_confirmed", USERS.ADMIN],
      ["question.source_link_removed", USERS.EDITOR],
    ]);
    expect(log[2].details).toMatchObject({ source: PCDT_IC.title, role: "conduta", temporal: "vigente", was: "confirmada", reason: "Motivo de teste.", quote: trecho.slice(0, 200) });
  });

  it("conferência 'não confirmada' + confirmar uma referência atual: a conferência passa a confirmada", async () => {
    const q = Q[6];
    await setCheck(q, "nao_confirmada", "Nota de teste da conferência.");
    const id = await addLink({ q, source: CAB, status: "nao_confirmada" });
    const lista = await env.rpc<any>(USERS.EDITOR, "app_admin_question_source_link_confirm", { p_link_id: id });
    expect(lista.check).toMatchObject({ status: "confirmada", note: null });
  });
});

// lista de fontes como o dono exporta do banco (README do gerador), o retrato das duas tabelas e "colar" um SQL no banco
const exportar = async () =>
  parseFontes(JSON.stringify(await env.sql(`select id, url, version, title, organ, status, audience, kind, editorial_approved from public.ch_sources where url is not null order by title, version`)));
const digital = async () =>
  (await env.sql(`select (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.question_source_links t) as l,
                         (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.question_source_checks t) as c`))[0];
const colar = async (sql: string) => {
  const res = await env.dev.db.exec(sql);
  return res[res.length - 1].rows[0] as any;
};

describe("SQL do gerador (scripts/fontes-vinculadas/gerar-sql.mjs)", () => {

  it("o link normalizado do script é o mesmo do banco (ch_url_norm)", async () => {
    const casos = [
      PCDT_IC.url, CP57_COLO.url, SBC_IC_2018.url,
      PCDT_IC.url.replace("https://www.gov.br", "HTTPS://WWW.GOV.BR:443") + "?utm_source=x#topo",
      " " + CAB_RASTREAMENTO.url + " ", CAB_RASTREAMENTO.url + "?&&a=1&utm_medium=y", "sem-esquema/x",
    ];
    for (const url of casos) expect(normUrl(url), url).toBe((await env.sql(`select public.ch_url_norm($1) as u`, [url]))[0].u);
  });

  it("grava os vínculos e as conferências; colar de novo não muda nada; fonte fora do banco não entra", async () => {
    const tIc = await trechoDe(Q_IC_2025);
    const tApoio = await trechoDe(Q[7]);
    const itens = [
      {
        question_code: QCODE[Q_IC_2025], conferencia: "confirmada", nota: "Nota de teste da conferência.", conferido_em: "2026-10-12",
        vinculos: [
          { url_fonte: PCDT_IC.url.replace("https://www.gov.br", "HTTPS://WWW.GOV.BR:443") + "?utm_source=x", versao: PCDT_IC.version, temporal: "vigente", papel: "conduta", secao: SECAO_ENUNCIADO, citacao: tIc, ato: PCDT_IC.act },
          { url_fonte: SBC_IC_2018.url, versao: SBC_IC_2018.version, temporal: "historica", papel: "conduta", secao: SECAO_ENUNCIADO, citacao: tIc },
        ],
      },
      {
        question_code: Q_RASTREAMENTO.code, conferencia: "confirmada",
        vinculos: [
          { url_fonte: CAB_RASTREAMENTO.url, versao: CAB_RASTREAMENTO.version, temporal: "vigente", papel: "prevencao", secao: SECAO_ENUNCIADO, citacao: TRECHO_RASTREAMENTO },
          { url_fonte: URL_FORA_DO_BANCO, temporal: "vigente", papel: "prevencao", secao: SECAO_ENUNCIADO, citacao: TRECHO_RASTREAMENTO },
        ],
      },
      { question_id: Q[7], conferencia: "nao_confirmada", nota: "Nota de teste da conferência.", vinculos: [] },
      // formato do agente Vinculador: "fraca" não entra; divergência entra em revisão, com a observação como motivo
      {
        question_id: Q[0], code: QCODE[Q[0]], conferencia: "confirmada", nota: null,
        vinculos: [
          { doc_id: CAB_RASTREAMENTO.catalogo, titulo: CAB_RASTREAMENTO.title, versao: CAB_RASTREAMENTO.version, url_fonte: CAB_RASTREAMENTO.url, temporal: "vigente", papel: "conceito", secao: SECAO_ENUNCIADO, citacao: tApoio, forca: "fraca", validado: true, divergencia: false, observacao: null },
          { doc_id: PCDT_IC.catalogo, titulo: PCDT_IC.title, versao: PCDT_IC.version, url_fonte: PCDT_IC.url, temporal: "vigente", papel: "outro", secao: SECAO_ENUNCIADO, citacao: tApoio, forca: "media", validado: true, divergencia: true, observacao: "Observação de teste." },
        ],
      },
    ];
    const { sql, relatorio } = gerarSql(itens, await exportar(), { arquivo: "teste.json", geradoEm: new Date("2026-10-12T12:00:00Z") });
    expect(relatorio.pulados.map((p: any) => [p.questao, p.motivo.slice(0, 32)])).toEqual([
      [Q_RASTREAMENTO.code, "fonte não encontrada no banco (c"],
      [Q[0], 'vínculo de força "fraca": não en'],
      [Q[0], 'conferência "confirmada" não gra'],
    ]);
    expect(relatorio.vinculos.map((v: any) => v.status)).toEqual(["confirmada", "confirmada", "confirmada", "em_revisao"]);
    expect(relatorio.avisos).toEqual([]); // link e versão iguais aos do banco
    expect(sql).not.toContain(URL_FORA_DO_BANCO);

    const antes = await digital();
    expect((await colar(sql!)).resultado).toBe("OK: Fontes vinculadas gravadas (4 vínculos, 3 conferências)");
    const uma = await digital();
    expect(uma).not.toEqual(antes);
    expect((await colar(sql!)).resultado).toMatch(/^OK: /);
    expect(await digital()).toEqual(uma); // colar de novo: nada muda

    const links = await env.sql(`select l.temporal, l.role, l.status, l.origin, l.section, l.quote, l.act, l.validity_checked_on::text as v from public.question_source_links l where l.question_id = $1 order by l.temporal desc`, [Q_IC_2025]);
    expect(links).toEqual([
      { temporal: "vigente", role: "conduta", status: "confirmada", origin: "importacao", section: SECAO_ENUNCIADO, quote: tIc, act: PCDT_IC.act, v: "2026-10-12" },
      { temporal: "historica", role: "conduta", status: "confirmada", origin: "importacao", section: SECAO_ENUNCIADO, quote: tIc, act: null, v: null },
    ]);
    expect((await env.sql(`select quote from public.question_source_links where question_id = $1`, [Q_RASTREAMENTO.id]))[0].quote).toBe(TRECHO_RASTREAMENTO); // o apóstrofo real entrou inteiro
    expect(await env.sql(`select status, reason from public.question_source_links where question_id = $1 and role = 'outro'`, [Q[0]])).toEqual([{ status: "em_revisao", reason: "Observação de teste." }]);
    const checks = await env.sql(`select question_id, status, origin from public.question_source_checks where question_id = any($1::text[]) order by question_id`, [[Q_IC_2025, Q_RASTREAMENTO.id, Q[7]]]);
    expect(Object.fromEntries(checks.map((c: any) => [c.question_id, `${c.status}/${c.origin}`]))).toEqual({
      [Q_IC_2025]: "confirmada/importacao", [Q_RASTREAMENTO.id]: "confirmada/importacao", [Q[7]]: "nao_confirmada/importacao",
    });
    await answer(USERS.PRO, Q_IC_2025);
    const r = await view(USERS.PRO, Q_IC_2025);
    expect(r.current[0]).toMatchObject({ title: PCDT_IC.title, act: PCDT_IC.act, validity_checked_on: "2026-10-12", quote: tIc });
    expect(r.historical[0]).toMatchObject({ title: SBC_IC_2018.title, temporal: "historica" });
    await answer(USERS.PRO, Q[7]);
    expect(await view(USERS.PRO, Q[7])).toMatchObject({ status: "nao_confirmada", current: [] });

    // questão que não existe: o SQL diz o que faltou
    const ruim = gerarSql([{ question_code: "REV-0000.0-Q000", conferencia: "confirmada", vinculos: [{ url_fonte: CAB_RASTREAMENTO.url, temporal: "vigente", papel: "prevencao", secao: SECAO_ENUNCIADO, citacao: TRECHO_RASTREAMENTO }] }], await exportar());
    expect((await colar(ruim.sql!)).resultado).toBe("FALTA: REV-0000.0-Q000: questão não encontrada");
  });

  it("modo --em-revisao: os vínculos entram em revisão e a conferência confirmada fica para a equipe", async () => {
    const q = Q_IC_IDOSA;
    const { sql } = gerarSql([{ question_id: q, conferencia: "confirmada", vinculos: [{ url_fonte: SBC_IC_2026.url, temporal: "vigente", papel: "tratamento", secao: SECAO_ENUNCIADO, citacao: await trechoDe(q) }] }], await exportar(), { emRevisao: true });
    expect((await colar(sql!)).resultado).toBe("OK: Fontes vinculadas gravadas (1 vínculo, 0 conferências)");
    expect(await env.sql(`select status from public.question_source_links where question_id = $1 and source_id = $2`, [q, SBC26])).toEqual([{ status: "em_revisao" }]);
    expect(await env.sql(`select 1 from public.question_source_checks where question_id = $1`, [q])).toEqual([]);
  });

});

describe("Vínculos REAIS do agente Vinculador (revalida_2025_2, cópia de 12/10/2026 em fixtures/fontes-vinculadas)", () => {
  const FX = path.join(__dirname, "fixtures/fontes-vinculadas");
  const reais: any[] = JSON.parse(fs.readFileSync(path.join(FX, "vinculos-revalida_2025_2.json"), "utf8"));
  const catalogo: any[] = JSON.parse(fs.readFileSync(path.join(FX, "catalogo-amostra.json"), "utf8"));
  const todosVinculos = reais.flatMap((it) => it.vinculos.map((v: any) => ({ q: it.question_id, ...v })));
  const fracos = todosVinculos.filter((v) => v.forca === "fraca");
  const emRevisao = todosVinculos.filter((v) => v.forca !== "fraca" && (v.divergencia === true || v.nota_atualizacao_proposta));
  const comNota = todosVinculos.find((v) => v.forca !== "fraca" && v.nota_atualizacao_proposta);
  let antesDaColagem: string[] = [];

  it("a biblioteca recebe as fontes do catálogo citadas; o SQL do arquivo real grava o que pode, sem a força fraca e com a divergência em revisão; colar de novo não muda nada", async () => {
    expect(reais.length).toBeGreaterThan(0);
    expect(fracos.length).toBeGreaterThan(0);
    expect(comNota, "o arquivo real tem uma nota do que mudou").toBeTruthy();
    // as questões do arquivo existem na carga real
    const ids = reais.map((it) => it.question_id);
    const achadas = await env.sql<{ id: string; code: string }>(`select id, code from public.questions where id = any($1::text[])`, [ids]);
    expect(achadas.length).toBe(ids.length);
    for (const it of reais) expect(achadas.find((a) => a.id === it.question_id)?.code, it.question_id).toBe(it.code);
    // fontes do catálogo (como a importação do catálogo grava: título, instituição, versão e link), só as que ainda não estão
    const ja = (await exportar()).map((f: any) => chaveUrl(f.url));
    for (const f of catalogo) {
      expect(f.status, f.id).toBe("verificado");
      if (!ja.includes(chaveUrl(f.url))) {
        await env.sql(`insert into public.ch_sources (title, organ, kind, status, version, url, audience) values ($1, $2, 'final', 'current', $3, $4, 'oficial')`, [f.titulo, f.instituicao, f.versao, f.url]);
      }
    }
    antesDaColagem = (await env.sql<{ id: string }>(`select id::text from public.question_source_links order by id`)).map((r) => r.id);

    const { sql, relatorio } = gerarSql(reais, await exportar(), { arquivo: "revalida_2025_2.json" });
    expect(relatorio.pulados.filter((p: any) => /força "fraca"/.test(p.motivo))).toHaveLength(fracos.length);
    expect(relatorio.pulados.every((p: any) => /força "fraca"|conferência "confirmada" não gravada/.test(p.motivo)), JSON.stringify(relatorio.pulados)).toBe(true);
    expect(relatorio.vinculos).toHaveLength(todosVinculos.length - fracos.length);
    expect(relatorio.vinculos.filter((v: any) => v.status === "em_revisao")).toHaveLength(emRevisao.length);
    expect(relatorio.conferencias.filter((c: any) => c.status === "nao_confirmada")).toHaveLength(reais.filter((it) => it.conferencia === "nao_confirmada").length);

    expect((await colar(sql!)).resultado).toMatch(/^OK: Fontes vinculadas gravadas/);
    const uma = await digital();
    expect((await colar(sql!)).resultado).toMatch(/^OK: /);
    expect(await digital()).toEqual(uma);

    // cada vínculo real entrou com a citação, a página e a situação certas
    const gravados = await env.sql<any>(`select question_id, status, page, quote, update_note, reason from public.question_source_links where not (id::text = any($1::text[]))`, [antesDaColagem]);
    expect(gravados).toHaveLength(todosVinculos.length - fracos.length);
    for (const v of todosVinculos.filter((x) => x.forca !== "fraca")) {
      const g = gravados.find((x: any) => x.question_id === v.q && x.quote === v.citacao.replace(/\s+/g, " ").trim());
      expect(g, `${v.q} p. ${v.pagina}`).toBeTruthy();
      expect(g.page).toBe(v.pagina);
      expect(g.status).toBe(v.divergencia === true || v.nota_atualizacao_proposta ? "em_revisao" : "confirmada");
      if (v.nota_atualizacao_proposta) expect(g.update_note).toBe(limpaNotaAtualizacao(v.nota_atualizacao_proposta));
    }
    for (const v of fracos) expect(gravados.find((x: any) => x.question_id === v.q && x.quote === v.citacao.replace(/\s+/g, " ").trim()), v.q).toBeUndefined();
    const checks = await env.sql<any>(`select question_id, status from public.question_source_checks where question_id = any($1::text[])`, [ids]);
    for (const it of reais.filter((x) => x.conferencia === "nao_confirmada")) expect(checks.find((c: any) => c.question_id === it.question_id)?.status, it.question_id).toBe("nao_confirmada");
  });

  it("o aluno vê os trechos reais; a nota do que mudou só aparece depois que a equipe confirma o vínculo com divergência", async () => {
    const q = comNota.q;
    await answer(USERS.PRO, q);
    const antes = await view(USERS.PRO, q);
    expect(antes?.current?.some((i: any) => i.update_note)).not.toBe(true);
    const lista = await env.rpc<any>(USERS.EDITOR, "app_admin_question_source_links", { p_question_id: q });
    const div = lista.links.find((l: any) => l.update_note);
    expect(div).toMatchObject({ status: "em_revisao", update_note: limpaNotaAtualizacao(comNota.nota_atualizacao_proposta), reason: comNota.observacao });
    await env.rpc(USERS.EDITOR, "app_admin_question_source_link_confirm", { p_link_id: div.id });
    const depois = await view(USERS.PRO, q);
    expect(depois.status).toBe("confirmada");
    const item = depois.current.find((i: any) => i.update_note);
    expect(item).toMatchObject({ quote: comNota.citacao, page: comNota.pagina, update_note: limpaNotaAtualizacao(comNota.nota_atualizacao_proposta), temporal: "vigente" });
    expect(item.update_note.startsWith("O que mudou desde a prova")).toBe(false); // o título do bloco não se repete
    // uma questão confirmada sem divergência: os trechos reais, com página
    const ok = reais.find((it) => it.conferencia === "confirmada" && it.vinculos.every((v: any) => v.forca !== "fraca" && !v.divergencia && !v.nota_atualizacao_proposta) && it.question_id !== Q_IC_2025);
    await answer(USERS.PRO, ok.question_id);
    const r = await view(USERS.PRO, ok.question_id);
    expect(r.current.map((i: any) => [i.quote, i.page]).sort()).toEqual(ok.vinculos.map((v: any) => [v.citacao.replace(/\s+/g, " ").trim(), v.pagina]).sort());
    // não confirmada: o aviso
    const nao = reais.find((it) => it.conferencia === "nao_confirmada");
    await answer(USERS.PRO, nao.question_id);
    expect(await view(USERS.PRO, nao.question_id)).toMatchObject({ status: "nao_confirmada", current: [] });
  });
});

describe("Gabarito oficial", () => {
  it("nada disso mexeu no gabarito oficial", async () => {
    expect(await gabarito()).toEqual(gabaritoAntes);
  });
});
