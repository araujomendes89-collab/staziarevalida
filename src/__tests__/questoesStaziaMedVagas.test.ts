// @vitest-environment node
/**
 * Questões StaziaMed — vagas do pedido e criação do pedido (Tarefa 5, migração 9800): modo Tema e Temas mais cobrados com peso
 * pelas provas recentes, subárea e competência do DNA, letras-alvo equilibradas, pedido só da equipe, aviso sem acervo oficial,
 * uma tarefa da fila por vaga e a lista de pedidos com a situação de cada vaga.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addOfficialSource, insertStaziaQuestion, openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 600_000 });

let env: StaziaEnv;
const AREAS = ["CLINICA_MEDICA", "CIRURGIA", "GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "MFC"];
const slotsOf = async (mode: string, area: string | null, topic: string | null, count: number) =>
  (await env.sql<{ s: any[] }>(`select public.staziamed_plan_slots($1, $2, $3, $4) as s`, [mode, area, topic, count]))[0].s;
const weightsOf = async (area: string | null) =>
  env.sql<{ area: string; topic: string; weight: string; total: number }>(`select area, topic, weight::text, total from public.staziamed_topic_weights($1)`, [area]);

beforeAll(async () => {
  env = await openStaziaEnv();
}, 600_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

describe("Áreas e peso dos temas", () => {
  it("a conversão entre o código editorial e a área do banco vai e volta (CIRURGIA e MFC inclusive)", async () => {
    const rows = await env.sql<{ e: string; m: string | null; back: string | null }>(
      `select e, public.staziamed_med_area(e)::text as m, public.staziamed_editorial_area(public.staziamed_med_area(e)) as back
       from unnest(array['CLINICA_MEDICA','CIRURGIA','GINECOLOGIA_OBSTETRICIA','PEDIATRIA','MFC','OUTRA']) e`
    );
    expect(Object.fromEntries(rows.map((r) => [r.e, [r.m, r.back]]))).toEqual({
      CLINICA_MEDICA: ["CLINICA_MEDICA", "CLINICA_MEDICA"],
      CIRURGIA: ["CIRURGIA_GERAL", "CIRURGIA"],
      GINECOLOGIA_OBSTETRICIA: ["GINECOLOGIA_OBSTETRICIA", "GINECOLOGIA_OBSTETRICIA"],
      PEDIATRIA: ["PEDIATRIA", "PEDIATRIA"],
      MFC: ["MEDICINA_FAMILIA_COMUNIDADE", "MFC"],
      OUTRA: [null, null],
    });
  });

  it("peso do tema = soma de 0,5^((ref − período)/6) das questões oficiais não anuladas (recalculado aqui para um tema)", async () => {
    const [top] = await weightsOf("PEDIATRIA");
    const q = await env.sql<{ year: number; kind: string; semester: number | null }>(
      `select e.year, e.kind, e.semester from public.questions q join public.exams e on e.id = q.exam_id
       where q.origin = 'official' and q.status <> 'annulled' and q.topic = $1 and q.area = 'PEDIATRIA'`, [top.topic]);
    const period = (e: { year: number; kind: string; semester: number | null }) => e.year * 2 + (e.kind === "ENAMED" ? 2 : e.semester ?? 2);
    const all = await env.sql<{ year: number; kind: string; semester: number | null }>(`select e.year, e.kind, e.semester from public.exams e where e.kind in ('REVALIDA','ENAMED') and exists (select 1 from public.questions x where x.exam_id = e.id and x.origin = 'official' and x.status <> 'annulled')`);
    const ref = Math.max(...all.map(period));
    const expected = q.reduce((s, e) => s + Math.pow(0.5, (ref - period(e)) / 6), 0);
    expect(Number(top.weight)).toBeCloseTo(expected, 4);
    expect(top.total).toBe(q.length);
    // vem em ordem de peso (maior primeiro)
    const ws = (await weightsOf("PEDIATRIA")).map((r) => Number(r.weight));
    expect(ws).toEqual([...ws].sort((a, b) => b - a));
  });
});

describe("Vagas", () => {
  it("modo Tema: todas as vagas no tema, com a subárea e a competência mais frequentes no DNA", async () => {
    const [topic] = await env.sql<{ area: string; topic: string }>(
      `select public.staziamed_editorial_area(q.area) as area, q.topic from public.question_dna d join public.questions q on q.id = d.question_id
       where d.subarea is not null and d.competency is not null group by 1, 2 order by count(*) desc, 2 limit 1`);
    const slots = await slotsOf("tema", topic.area, topic.topic, 5);
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5]);
    for (const s of slots) expect(s).toMatchObject({ area: topic.area, topic: topic.topic, state: "na_fila", reason: null, draft_id: null, cost_usd: 0 });
    const [best] = await env.sql<{ subarea: string; competency: string }>(
      `select d.subarea, d.competency from public.question_dna d join public.questions q on q.id = d.question_id
       where q.topic = $1 and q.area = public.staziamed_med_area($2) and d.subarea is not null and d.competency is not null
       group by 1, 2 order by count(*) desc, 1, 2 limit 1`, [topic.topic, topic.area]);
    expect(slots[0]).toMatchObject({ subarea: best.subarea, competency: best.competency });
  });

  it("Temas mais cobrados numa área: o tema mais pesado na vaga 1, 1 vaga por tema na rodada 1, nunca 3 vagas no mesmo tema", async () => {
    const ws = await weightsOf("CIRURGIA");
    const slots = await slotsOf("mais_cobrados", "CIRURGIA", null, 20);
    expect(slots).toHaveLength(20);
    expect(slots[0].topic).toBe(ws[0].topic);
    expect(slots.slice(0, 5).map((s) => s.topic)).toEqual(ws.slice(0, 5).map((w) => w.topic));
    expect(new Set(slots.slice(0, 20).map((s) => s.topic)).size).toBe(20); // 20 temas distintos na rodada 1
    const count = new Map<string, number>();
    for (const s of slots) count.set(s.topic, (count.get(s.topic) ?? 0) + 1);
    expect(Math.max(...count.values())).toBeLessThanOrEqual(2);
    // com mais vagas que temas × 2, só devolve as que cabem
    const many = await slotsOf("mais_cobrados", "MFC", null, 20);
    expect(many.length).toBeLessThanOrEqual(20);
    for (const s of many) expect(s.area).toBe("MFC");
  });

  it("Temas mais cobrados sem área: vagas por área na proporção das provas (maior resto), soma = pedido", async () => {
    const counts = await env.sql<{ area: string; n: number }>(
      `select public.staziamed_editorial_area(area) as area, count(*)::int as n from public.questions where origin = 'official' and status <> 'annulled' group by 1`);
    const total = counts.reduce((s, c) => s + c.n, 0);
    for (const n of [7, 20]) {
      const quota = counts.map((c) => ({ area: c.area, exact: (n * c.n) / total }));
      const base = new Map(quota.map((q) => [q.area, Math.floor(q.exact)]));
      let lacking = n - [...base.values()].reduce((s, v) => s + v, 0);
      for (const q of [...quota].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || a.area.localeCompare(b.area))) {
        if (lacking-- > 0) base.set(q.area, base.get(q.area)! + 1);
      }
      const slots = await slotsOf("mais_cobrados", null, null, n);
      const got = new Map<string, number>();
      for (const s of slots) got.set(s.area, (got.get(s.area) ?? 0) + 1);
      expect(slots).toHaveLength(n);
      for (const a of AREAS) expect(got.get(a) ?? 0, `${n} vagas, área ${a}`).toBe(base.get(a) ?? 0);
    }
  });

  it("letras: 20 vagas = 5 de cada; 3 vagas com publicadas A,A,C vão para B, C e D (recolhidas não contam)", async () => {
    const twenty = await slotsOf("mais_cobrados", null, null, 20);
    const per = new Map<string, number>();
    for (const s of twenty) per.set(s.target, (per.get(s.target) ?? 0) + 1);
    expect(Object.fromEntries(per)).toEqual({ A: 5, B: 5, C: 5, D: 5 });
    const fresh = await openStaziaEnv();
    try {
      for (const correct of ["A", "A", "C"] as const) await insertStaziaQuestion(fresh, { correct });
      await insertStaziaQuestion(fresh, { correct: "B", retired: true });
      const three = (await fresh.sql<{ s: any[] }>(`select public.staziamed_plan_slots('mais_cobrados', null, null, 3) as s`))[0].s;
      expect(three.map((s) => s.target)).toEqual(["B", "C", "D"]);
      // 1 vaga: a letra menos usada (B, empate com D resolvido pela ordem alfabética)
      expect((await fresh.sql<{ s: any[] }>(`select public.staziamed_plan_slots('mais_cobrados', null, null, 1) as s`))[0].s.map((s) => s.target)).toEqual(["B"]);
    } finally {
      await fresh.close();
    }
  });
});

describe("Pedido", () => {
  let tema: { area: string; topic: string };
  beforeAll(async () => {
    tema = (await env.sql<{ area: string; topic: string }>(`select area, topic from public.staziamed_topic_weights('PEDIATRIA') limit 1`))[0];
  });
  const create = (uid: string, mode = "tema", area: string | null = null, topic: string | null = null, count = 3) =>
    env.rpc(uid, "app_staziamed_request_create", { p_mode: mode, p_area: area, p_topic: topic, p_count: count, p_estimate: { custo_usd: 0.5 } });

  it("criar pedido: administrador e editor sim; revisor só de área e alunos não; sem acervo, o aviso e nada é gravado", async () => {
    expect((await env.sql(`select public.staziamed_acervo() as n`))[0].n).toBe(0);
    const before = async () => ({
      r: (await env.sql(`select count(*)::int as n from public.staziamed_requests`))[0].n,
      j: (await env.sql(`select count(*)::int as n from public.ch_jobs where step = 'question_generate'`))[0].n,
    });
    const b = await before();
    await expect(create(USERS.EDITOR, "tema", tema.area, tema.topic)).rejects.toThrow("Cadastre fontes oficiais na Central de Conteúdo");
    expect(await before()).toEqual(b);
    // fonte de apostila (nível E), fonte vencida e fonte sem trecho não contam como acervo
    await addOfficialSource(env, { text: "Texto de apostila.", level: "E" });
    await addOfficialSource(env, { text: "Texto vencido.", validUntil: "2020-01-01" });
    await env.sql(`insert into public.ch_sources (title, organ, kind, status, version, published_on, authority_level) values ('Sem trecho', 'MS', 'final', 'current', '1', '2026-01-01', 'A')`);
    expect((await env.sql(`select public.staziamed_acervo() as n`))[0].n).toBe(0);
    await addOfficialSource(env, { text: "Amoxicilina por dez dias na otite média aguda do lactente." });
    expect((await env.sql(`select public.staziamed_acervo() as n`))[0].n).toBe(1);
    expect((await env.sql(`select public.ch_worker_staziamed_acervo() as n`))[0].n).toBe(1);

    for (const uid of [USERS.REVISOR_PED, USERS.PRO, USERS.TESTE, USERS.TESTE_VENCIDO]) {
      await expect(create(uid, "tema", tema.area, tema.topic), uid).rejects.toThrow("Gerar questões StaziaMed é da equipe (administrador ou editor).");
    }
    expect(await before()).toEqual(b);
    const r = await create(USERS.ADMIN, "tema", tema.area, tema.topic, 4);
    expect(r).toMatchObject({ mode: "tema", area: tema.area, topic: tema.topic, count: 4, state: "na_fila", estimate: { custo_usd: 0.5 } });
    expect(r.slots).toHaveLength(4);
  });

  it("recusas: quantidade, modo, área, tema fora da lista", async () => {
    await expect(create(USERS.EDITOR, "tema", tema.area, tema.topic, 0)).rejects.toThrow("Escolha de 1 a 20 questões.");
    await expect(create(USERS.EDITOR, "tema", tema.area, tema.topic, 21)).rejects.toThrow("Escolha de 1 a 20 questões.");
    await expect(create(USERS.EDITOR, "outro", null, null, 2)).rejects.toThrow("Modo inválido.");
    await expect(create(USERS.EDITOR, "tema", "QUALQUER", "x", 2)).rejects.toThrow("Área inválida.");
    await expect(create(USERS.EDITOR, "tema", tema.area, "Tema que não existe", 2)).rejects.toThrow("Escolha um tema da lista de temas das provas oficiais.");
    await expect(create(USERS.EDITOR, "tema", tema.area, null, 2)).rejects.toThrow("Escolha um tema da lista de temas das provas oficiais.");
  });

  it("o pedido vira uma tarefa por vaga, sem documento, e repetir em seguida dá 'Este pedido já está na fila.'", async () => {
    const r = await create(USERS.EDITOR, "mais_cobrados", "CLINICA_MEDICA", null, 3);
    const jobs = await env.sql<any>(`select step, document_id, scope_key, idempotency_key, max_attempts, status from public.ch_jobs where scope_key like $1 order by scope_key`, [`staziamed:${r.id}:%`]);
    expect(jobs).toEqual([1, 2, 3].map((i) => ({ step: "question_generate", document_id: null, scope_key: `staziamed:${r.id}:${i}`, idempotency_key: `qgen:${r.id}:${i}`, max_attempts: 3, status: "queued" })));
    await expect(create(USERS.EDITOR, "mais_cobrados", "CLINICA_MEDICA", null, 3)).rejects.toThrow("Este pedido já está na fila.");
    // outra pessoa, ou outra quantidade, não é o mesmo pedido
    expect((await create(USERS.ADMIN, "mais_cobrados", "CLINICA_MEDICA", null, 3)).slots).toHaveLength(3);
    expect((await create(USERS.EDITOR, "mais_cobrados", "CLINICA_MEDICA", null, 2)).slots).toHaveLength(2);
    expect((await env.sql(`select count(*)::int as n from public.ch_audit where action = 'staziamed.request' and target = $1`, [r.id]))[0].n).toBe(1);
  });

  it("temas: a lista é da equipe e traz só temas das provas oficiais", async () => {
    const list = await env.rpc<{ area: string; topic: string; total: number }[]>(USERS.EDITOR, "app_staziamed_topics", { p_area: "MFC" });
    expect(list.length).toBeGreaterThan(5);
    expect(new Set(list.map((x) => x.area))).toEqual(new Set(["MFC"]));
    await insertStaziaQuestion(env, { area: "MEDICINA_FAMILIA_COMUNIDADE", topic: "Tema só das inéditas" });
    expect((await env.rpc<any[]>(USERS.EDITOR, "app_staziamed_topics", {})).some((x) => x.topic === "Tema só das inéditas")).toBe(false);
    await expect(env.rpc(USERS.TESTE, "app_staziamed_topics", {})).rejects.toThrow(/restrito/);
  });

  it("a lista de pedidos mostra cada vaga com a situação da tarefa e quem pediu", async () => {
    const r = await create(USERS.ADMIN, "tema", tema.area, tema.topic, 2);
    await env.sql(`update public.ch_jobs set status = 'failed', error = 'Falha de teste' where idempotency_key = $1`, [`qgen:${r.id}:2`]);
    const list = await env.rpc<any[]>(USERS.EDITOR, "app_staziamed_requests", { p_limit: 50 });
    const mine = list.find((x) => x.id === r.id);
    expect(mine.created_by_email).toBe("admin@staziamed.teste");
    expect(mine.summary).toEqual({ geradas: 0, puladas: 0, descartadas: 0 });
    expect(mine.slots.map((s: any) => [s.slot, s.job_status, s.job_error])).toEqual([[1, "queued", null], [2, "failed", "Falha de teste"]]);
    // a mais nova primeiro
    const dates = list.map((x) => x.created_at);
    expect(dates).toEqual([...dates].sort().reverse());
    await expect(env.rpc(USERS.PRO, "app_staziamed_requests", {})).rejects.toThrow(/restrito/);
  });
});
