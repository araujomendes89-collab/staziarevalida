// @vitest-environment node
/**
 * Inéditas misturadas nos simulados comuns (migração …012200; pedido do dono, 16/10/2026: "podem entrar também").
 * Rápido, Geral, Por área e Por tema (nenhuma prova escolhida) levam Questões Inéditas, no máximo o percentual do administrador
 * (app_settings.simulado_ineditas_pct, padrão 10). Só as liberadas pelo plano do aluno; sem liberadas, 100% oficial e sem erro.
 * TRI, prova escolhida e Trilha continuam 100% oficiais. Banco PGlite com todas as migrações e as 1.200 oficiais.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { insertStaziaQuestion, openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 180_000 });

const AREAS = ["CLINICA_MEDICA", "CIRURGIA_GERAL", "GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "MEDICINA_FAMILIA_COMUNIDADE"] as const;
const SEM_PROVA = { area: "", exam_id: "", search: "", status: "all" };

let env: StaziaEnv;
let topicoOficial: string; // o tema oficial mais comum (10 das inéditas usam o mesmo tema e a mesma área)
let areaOficial: string;
let examOficial: string;

type Q = { id: string; origin: string; area: string; topic: string };

const sessao = async (uid: string, filters: object, count: number, fn = "app_start_session") => {
  const args = fn === "app_start_simulado_tri" ? { p_filters: filters, p_count: count } : { p_kind: "simulado", p_filters: filters, p_count: count, p_time_limit_seconds: 3600 };
  const s = await env.rpc<{ session_id: string; count: number }>(uid, fn, args);
  const [{ question_ids }] = await env.sql<{ question_ids: string[] }>(`select question_ids from public.practice_sessions where id = $1`, [s.session_id]);
  const rows = await env.sql<Q>(`select id, origin, area::text as area, topic from public.questions where id = any($1)`, [question_ids]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return { id: s.session_id, count: s.count, ids: question_ids, qs: question_ids.map((id) => byId.get(id)!) };
};
const nIneditas = (qs: Q[]) => qs.filter((q) => q.origin === "staziamed").length;
const setPct = (pct: number | string) => env.rpc<any>(USERS.ADMIN, "app_admin_save_settings", { p_settings: { simulado_ineditas_pct: pct } });
const setLimit = (limits: Record<string, number | null>) => env.rpc<any>(USERS.ADMIN, "app_admin_save_ineditas_limits", { p_limits: limits });
const liberadas = async (uid: string) => (await env.sqlAs<{ id: string }>(uid, `select public.ineditas_released_ids() as id`)).map((r) => r.id);

beforeAll(async () => {
  env = await openStaziaEnv();
  // tema e prova oficiais mais comuns ENTRE AS QUE O SORTEIO ENXERGA (há temas de cadastro sem questão sorteável)
  const [t] = await env.sqlAs<{ topic: string; area: string }>(
    USERS.PRO,
    `select topic, area::text as area from public.practice_pool('{}'::jsonb) where topic is not null group by topic, area order by count(*) desc limit 1`
  );
  topicoOficial = t.topic;
  areaOficial = t.area;
  [{ exam_id: examOficial }] = await env.sqlAs<{ exam_id: string }>(USERS.PRO, `select exam_id from public.practice_pool('{}'::jsonb) group by exam_id order by count(*) desc limit 1`);
  // 30 inéditas: 10 no tema e na área oficiais mais comuns, 20 espalhadas; mais 1 recolhida (fora do sorteio)
  for (let i = 0; i < 10; i++) await insertStaziaQuestion(env, { area: areaOficial, topic: topicoOficial, correct: "A" });
  for (let i = 0; i < 20; i++) await insertStaziaQuestion(env, { area: AREAS[i % AREAS.length], topic: `Tema inédito ${i % 4}`, correct: "A" });
  await insertStaziaQuestion(env, { area: areaOficial, topic: topicoOficial, correct: "B", retired: true });
}, 600_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

describe("percentual do administrador", () => {
  it("nasce em 10 (padrão do dono); o aluno lê o número só pela função e nunca a tabela de configurações", async () => {
    expect((await env.rpc<any>(USERS.ADMIN, "app_admin_settings")).simulado_ineditas_pct).toBe(10);
    const [{ v }] = await env.sqlAs<{ v: number }>(USERS.PRO, `select public.simulado_ineditas_pct() as v`);
    expect(v).toBe(10);
    expect(await env.sqlAs(USERS.PRO, `select * from public.app_settings`).then((r) => r.length, () => 0)).toBe(0);
    await expect(env.rpc(USERS.PRO, "app_admin_save_settings", { p_settings: { simulado_ineditas_pct: 50 } })).rejects.toThrow();
  });

  it("só o administrador muda; vale de 0 a 50; fica no histórico de ações; o simulado seguinte já usa o número novo", async () => {
    try {
      for (const ruim of [51, 100, -1, "dez", 2.5]) await expect(setPct(ruim as any), String(ruim)).rejects.toThrow(/de 0 a 50 por cento/);
      await setPct(20);
      expect((await env.sql(`select value from public.app_settings where key = 'simulado_ineditas_pct'`))[0].value).toBe(20);
      const [log] = await env.sql<{ details: any }>(`select details from public.admin_audit_log where action = 'settings.save' order by id desc limit 1`);
      expect(log.details.simulado_ineditas_pct).toBe(20);
      expect(nIneditas((await sessao(USERS.PRO, SEM_PROVA, 100)).qs)).toBe(20);
      await setPct(0);
      expect(nIneditas((await sessao(USERS.PRO, SEM_PROVA, 100)).qs)).toBe(0);
      await setPct(50); // só há 30 publicadas: sai o que existe, dentro de 50% do simulado
      const cheio = await sessao(USERS.PRO, SEM_PROVA, 100);
      expect(cheio.count).toBe(100);
      expect(nIneditas(cheio.qs)).toBe(30);
    } finally {
      await setPct(10);
    }
  });
});

describe("simulados comuns misturam inéditas (no máximo 10%)", () => {
  it("Rápido (30), de 50 e Geral (100) do plano Pro: 3, 5 e 10 inéditas, o resto oficial, sem repetir questão e sem a recolhida", async () => {
    for (const [pedido, esperado] of [[30, 3], [50, 5], [100, 10]] as const) {
      const s = await sessao(USERS.PRO, SEM_PROVA, pedido);
      expect(s.count).toBe(pedido);
      expect(s.qs.length).toBe(pedido);
      expect(nIneditas(s.qs), `simulado de ${pedido}`).toBe(esperado);
      expect(new Set(s.ids).size).toBe(pedido);
      expect(s.qs.filter((q) => q.origin !== "staziamed").every((q) => q.origin === "official")).toBe(true);
      expect(s.qs.filter((q) => q.origin === "staziamed").every((q) => !q.id.includes("0031"))).toBe(true);
    }
    const [{ retiradas }] = await env.sql<{ retiradas: number }>(`select count(*)::int as retiradas from public.questions where origin = 'staziamed' and retired_at is not null`);
    expect(retiradas).toBe(1);
  });

  it("a sessão guarda quantas inéditas entraram; o resto da configuração (prova, cronômetro) fica como sempre", async () => {
    const s = await sessao(USERS.PRO, SEM_PROVA, 30);
    const [{ config, time_limit_seconds, kind }] = await env.sql<any>(`select config, time_limit_seconds, kind from public.practice_sessions where id = $1`, [s.id]);
    expect(config.ineditas_mix).toEqual({ pct: 10, count: 3 });
    expect(config.filters.exam_id).toBe("");
    expect([kind, time_limit_seconds]).toEqual(["simulado", 3600]);
  });

  it("Por área e Por tema respeitam o filtro também nas inéditas", async () => {
    const porArea = await sessao(USERS.PRO, { ...SEM_PROVA, area: areaOficial }, 50);
    expect(porArea.count).toBe(50);
    expect(nIneditas(porArea.qs)).toBe(5);
    expect(porArea.qs.every((q) => q.area === areaOficial)).toBe(true);

    const porTema = await sessao(USERS.PRO, { ...SEM_PROVA, topic: topicoOficial }, 30);
    const n = nIneditas(porTema.qs);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(Math.floor(porTema.qs.length * 0.1));
    expect(porTema.qs.every((q) => q.topic === topicoOficial)).toBe(true);
  });

  it("as inéditas caem em posições sorteadas no meio das oficiais (não ficam sempre no fim nem no começo)", async () => {
    const posicoes = new Set<number>();
    for (let i = 0; i < 8; i++) {
      const s = await sessao(USERS.PRO, SEM_PROVA, 100);
      s.qs.forEach((q, pos) => q.origin === "staziamed" && posicoes.add(pos));
    }
    expect(posicoes.size).toBeGreaterThan(20);
    expect(Math.min(...posicoes)).toBeLessThan(50);
    expect(Math.max(...posicoes)).toBeGreaterThan(50);
  });
});

describe("só as inéditas liberadas pelo plano; sem liberadas, 100% oficial e sem erro", () => {
  it("teste grátis (20 liberadas): as inéditas do simulado são sempre das liberadas dele", async () => {
    const dele = new Set(await liberadas(USERS.TESTE));
    expect(dele.size).toBe(20);
    for (let i = 0; i < 4; i++) {
      const s = await sessao(USERS.TESTE, SEM_PROVA, 100);
      expect(s.count).toBe(100);
      const ined = s.qs.filter((q) => q.origin === "staziamed");
      expect(ined.length).toBe(10);
      expect(ined.every((q) => dele.has(q.id))).toBe(true);
    }
  });

  it("limite pequeno: sai só o que o plano libera (5 de 10 possíveis); limite 0: 100% oficial, sem erro", async () => {
    try {
      await setLimit({ trial: 5 });
      const dele = new Set(await liberadas(USERS.TESTE));
      const cinco = await sessao(USERS.TESTE, SEM_PROVA, 100);
      expect(nIneditas(cinco.qs)).toBe(5);
      expect(cinco.qs.filter((q) => q.origin === "staziamed").every((q) => dele.has(q.id))).toBe(true);

      await setLimit({ trial: 0 });
      const zero = await sessao(USERS.TESTE, SEM_PROVA, 30);
      expect(zero.count).toBe(30);
      expect(nIneditas(zero.qs)).toBe(0);
    } finally {
      await setLimit({ trial: 20 });
    }
  });

  it("equipe e plano com todas sorteiam entre todas as publicadas; sem acesso (teste vencido) continua sem simulado, com o aviso de sempre", async () => {
    expect(nIneditas((await sessao(USERS.ADMIN, SEM_PROVA, 100)).qs)).toBe(10);
    for (const uid of [USERS.TESTE_VENCIDO, USERS.PRO_VENCIDO, USERS.SEM_PLANO]) {
      await expect(env.rpc(uid, "app_start_session", { p_kind: "simulado", p_filters: SEM_PROVA, p_count: 30 }), uid).rejects.toThrow(/Os simulados completos/);
    }
  });
});

describe("o que continua 100% oficial", () => {
  it("simulado TRI (e a marca do TRI não vaza para o simulado seguinte)", async () => {
    const tri = await sessao(USERS.PRO, SEM_PROVA, 100, "app_start_simulado_tri");
    expect(tri.count).toBe(100);
    expect(nIneditas(tri.qs)).toBe(0);
    const [{ config }] = await env.sql<any>(`select config from public.practice_sessions where id = $1`, [tri.id]);
    expect(config.scoring).toBe("irt");
    expect(config.ineditas_mix).toBeUndefined();
    expect(nIneditas((await sessao(USERS.PRO, SEM_PROVA, 100)).qs)).toBe(10);
  });

  it("prova oficial escolhida e simulado de área aberto pela Trilha", async () => {
    const prova = await sessao(USERS.PRO, { ...SEM_PROVA, exam_id: examOficial }, 30);
    expect(nIneditas(prova.qs)).toBe(0);
    expect(prova.qs.every((q) => q.origin === "official")).toBe(true);
    const trilha = await env.rpc<{ session_id: string; count: number }>(USERS.PRO, "app_start_trail_node", { p_area: "PEDIATRIA", p_topic: null });
    const [{ question_ids }] = await env.sql<{ question_ids: string[] }>(`select question_ids from public.practice_sessions where id = $1`, [trilha.session_id]);
    expect((await env.sql(`select 1 from public.questions where id = any($1) and origin <> 'official'`, [question_ids])).length).toBe(0);
  });

  it("escolhendo a prova 'Questões Inéditas', o simulado é 100% inédito (como na 012000)", async () => {
    const s = await sessao(USERS.PRO, { ...SEM_PROVA, exam_id: "staziamed" }, 20);
    expect(s.count).toBe(20);
    expect(nIneditas(s.qs)).toBe(20);
  });
});

describe("antes de responder, nada de gabarito; depois, o resultado mostra as inéditas à parte", () => {
  it("simulado misto: nada de gabarito, explicação, fontes ou códigos GR na sessão aberta; as inéditas continuam com origin 'staziamed' (rótulo 'Questão Inédita')", async () => {
    const s = await sessao(USERS.PRO, SEM_PROVA, 30);
    const aberta = await env.rpc<any>(USERS.PRO, "app_get_session", { p_session_id: s.id });
    expect(aberta.questions.length).toBe(30);
    expect(aberta.questions.filter((q: any) => q.origin === "staziamed").length).toBe(3);
    for (const q of aberta.questions) {
      expect(q.correction).toBeNull();
      for (const o of q.options) expect(Object.keys(o).sort()).toEqual(["id", "text"]);
    }
    const json = JSON.stringify(aberta);
    for (const proibido of ["explanation", "correct_option", "official_sources", "expected_conduct", "source_quotes"]) expect(json, proibido).not.toContain(proibido);
    expect(/GR-\d/.test(json)).toBe(false);

    for (const q of aberta.questions) await env.rpc(USERS.PRO, "app_answer_question", { p_session_id: s.id, p_question_id: q.id, p_option: "A", p_active_ms: 1000 });
    const fim = await env.rpc<any>(USERS.PRO, "app_finish_session", { p_session_id: s.id });
    expect(fim.result.total).toBe(30);
    expect(fim.result.ineditas).toEqual({ total: 3, answered: 3, correct: 3 });
    for (const q of fim.questions.filter((x: any) => x.origin === "staziamed")) {
      expect(q.correction.sources).toEqual([]);
      expect(q.correction.official_sources).toBeNull();
    }
  });

  it("simulado só de oficiais: o quadro das inéditas vem zerado", async () => {
    const s = await sessao(USERS.PRO, { ...SEM_PROVA, exam_id: examOficial }, 30);
    for (const id of s.ids.slice(0, 5)) await env.rpc(USERS.PRO, "app_answer_question", { p_session_id: s.id, p_question_id: id, p_option: "A", p_active_ms: 1000 });
    const fim = await env.rpc<any>(USERS.PRO, "app_finish_session", { p_session_id: s.id });
    expect(fim.result.ineditas).toEqual({ total: 0, answered: 0, correct: 0 });
  });

  it("a calibração do TRI segue só com oficiais mesmo depois de simulados mistos finalizados", async () => {
    const [{ n }] = await env.sql<{ n: number }>(
      `select count(*)::int as n from public.irt_calibration_matrix() m join public.questions q on q.id = m.question_id where q.origin <> 'official'`
    );
    expect(n).toBe(0);
    const [{ ok }] = await env.sql<{ ok: number }>(`select count(*)::int as ok from public.irt_calibration_matrix()`);
    expect(ok).toBeGreaterThan(0);
  });
});

describe("Finalizar não cai quando o plano deixa de liberar uma inédita no meio do simulado", () => {
  it("baixou o limite com o simulado aberto: termina, as oficiais ficam gravadas e a inédita fora do plano não conta", async () => {
    const s = await sessao(USERS.TESTE, SEM_PROVA, 30);
    const ineditas = s.qs.filter((q) => q.origin === "staziamed").map((q) => q.id);
    expect(ineditas.length).toBe(3);
    for (const id of s.ids) await env.rpc(USERS.TESTE, "app_answer_question", { p_session_id: s.id, p_question_id: id, p_option: "A", p_active_ms: 1000 });
    try {
      await setLimit({ trial: 0 });
      const fim = await env.rpc<any>(USERS.TESTE, "app_finish_session", { p_session_id: s.id });
      expect(fim.finished_at).toBeTruthy();
      expect(fim.result.total).toBe(30);
      expect(fim.result.answered).toBe(27);
      expect(fim.result.ineditas).toMatchObject({ total: 3, answered: 0 });
      const gravadas = await env.sql<{ question_id: string }>(`select question_id from public.question_attempts where session_id = $1`, [s.id]);
      expect(gravadas.length).toBe(27);
      expect(gravadas.some((g) => ineditas.includes(g.question_id))).toBe(false);
    } finally {
      await setLimit({ trial: 20 });
    }
  });
});

describe("migração", () => {
  it("colar de novo é seguro; o roteiro de conferência responde OK; o desfazer tira a mistura e a migração a devolve", async () => {
    const lê = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
    const migracao = lê("supabase/migrations/20261003012200_simulado_ineditas_misturadas.sql");
    const desfazer = lê("supabase/desfazer/20261003012200_simulado_ineditas_misturadas.desfazer.sql");
    const conferir = lê("supabase/conferir/simulado-ineditas-misturadas.sql");
    try {
      await setPct(15);
      await env.dev.db.exec(migracao);
      await env.dev.db.exec(migracao);
      expect((await env.sql(`select value from public.app_settings where key = 'simulado_ineditas_pct'`))[0].value).toBe(15); // colar de novo não desfaz o que o administrador mudou
      await setPct(10);
      expect((await env.sql<{ resultado: string }>(conferir))[0].resultado).toMatch(/^OK:/);

      await env.dev.db.exec(desfazer);
      expect(nIneditas((await sessao(USERS.PRO, SEM_PROVA, 100)).qs)).toBe(0);
      expect((await env.sql(`select 1 from public.app_settings where key = 'simulado_ineditas_pct'`)).length).toBe(0);
      const falta = (await env.sql<{ resultado: string }>(conferir))[0].resultado;
      expect(falta).toMatch(/^FALTA:/);
      expect(falta).toContain("sem a mistura");

      await env.dev.db.exec(migracao);
      expect(nIneditas((await sessao(USERS.PRO, SEM_PROVA, 100)).qs)).toBe(10);
      expect((await env.sql<{ resultado: string }>(conferir))[0].resultado).toMatch(/^OK:/);
    } finally {
      await env.dev.db.exec(migracao);
    }
  });
});
