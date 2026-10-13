// @vitest-environment node
/**
 * 100 Grandes Temas (migração 9960) com as QUESTÕES REAIS das provas oficiais no banco de teste (PGlite): só a infraestrutura é
 * simulada. Confere os 100 temas, a contagem verdadeira por tema, as anuladas fora, o treino por tema e a segurança.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

const DIR = path.join(process.cwd(), "scripts/grandes-temas");
const temasFile = JSON.parse(fs.readFileSync(path.join(DIR, "temas.json"), "utf8"));
const lig = JSON.parse(fs.readFileSync(path.join(DIR, "ligacao-questoes.json"), "utf8"));
const MIGRACAO = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261003009960_grandes_temas_100.sql"), "utf8");

let env: StaziaEnv;
let dbQuestions: Map<string, { exam_id: string; status: string }>;
let rpcData: any;

beforeAll(async () => {
  env = await openStaziaEnv();
  const rows = await env.sql<{ id: string; exam_id: string; status: string }>(`select id, exam_id, status from public.questions where origin = 'official'`);
  dbQuestions = new Map(rows.map((r) => [r.id, r]));
  rpcData = await env.rpc(USERS.PRO, "app_grandes_temas");
});
afterAll(async () => {
  await env?.close();
});

const ligadas = () => lig.questoes.filter((x: any) => x.tema_id && x.status !== "annulled");

describe("100 Grandes Temas: dados", () => {
  it("tem os 100 temas GR-001..GR-100, nas 7 áreas, com a distribuição do mapa (26/16/18/18/8/8/6)", () => {
    expect(rpcData.themes).toHaveLength(100);
    expect(rpcData.themes.map((t: any) => t.id)).toEqual(Array.from({ length: 100 }, (_, i) => `GR-${String(i + 1).padStart(3, "0")}`));
    const porArea: Record<string, number> = {};
    for (const t of rpcData.themes) porArea[t.area] = (porArea[t.area] ?? 0) + 1;
    expect(porArea).toEqual({ cm: 26, cir: 16, go: 18, ped: 18, mfc: 8, sc: 8, sm: 6 });
    expect(rpcData.areas.map((a: any) => a.id)).toEqual(["cm", "cir", "go", "ped", "mfc", "sc", "sm"]);
  });

  it("situação do conteúdo: só o GR-001 tem aula pronta (aguardando revisão médica); os outros 99 são roteiro em validação", () => {
    const prontos = rpcData.themes.filter((t: any) => t.status === "aula_pronta_aguardando_revisao").map((t: any) => t.id);
    expect(prontos).toEqual(["GR-001"]);
    expect(rpcData.themes.filter((t: any) => t.status === "roteiro_em_validacao")).toHaveLength(99);
    expect(rpcData.themes[0].title).toBe("Tuberculose pulmonar");
    expect(rpcData.themes[53].title).toBe("Restrição de crescimento fetal e avaliação do bem-estar");
  });

  it("o banco tem os mesmos 100 temas do arquivo versionado", async () => {
    const rows = await env.sql<{ id: string; ordem: number; titulo: string; area: string }>(`select id, ordem, titulo, area from public.grande_temas order by ordem`);
    expect(rows.map((r) => [r.id, r.ordem, r.titulo, r.area])).toEqual(temasFile.temas.map((t: any) => [t.id, t.ordem, t.titulo, t.area]));
  });
});

describe("100 Grandes Temas: contagem verdadeira com as questões reais", () => {
  it("toda questão ligada existe no banco (a única exceção possível é a prova 2026/2, que a carga das provas traz à parte)", () => {
    const faltando = ligadas().filter((x: any) => !dbQuestions.has(x.question_id));
    expect(faltando.every((x: any) => x.prova === "revalida_2026_2")).toBe(true);
  });

  it("as questões anuladas do banco e do arquivo são as mesmas e nenhuma anulada entra na ligação", async () => {
    for (const x of lig.questoes) {
      const q = dbQuestions.get(x.question_id);
      if (!q) continue;
      expect(q.status === "annulled", x.question_id).toBe(x.status === "annulled");
    }
    const anuladasNaLigacao = await env.sql(`select 1 from public.grande_tema_questoes g join public.questions q on q.id = g.question_id where q.status = 'annulled'`);
    expect(anuladasNaLigacao).toHaveLength(0);
  });

  it("o total de cada tema bate com a contagem independente (arquivo de ligação x banco)", () => {
    for (const t of rpcData.themes) {
      const esperado = ligadas().filter((x: any) => x.tema_id === t.id && dbQuestions.has(x.question_id));
      expect(t.total, t.id).toBe(esperado.length);
      const porProva: Record<string, number> = {};
      for (const x of esperado) {
        const ex = dbQuestions.get(x.question_id)!.exam_id;
        porProva[ex] = (porProva[ex] ?? 0) + 1;
      }
      expect(t.by_exam, t.id).toEqual(porProva);
    }
  });

  it("vinculadas + sem tema = todas as oficiais não anuladas; a soma dos temas = vinculadas (uma questão, um tema)", () => {
    const validas = [...dbQuestions.values()].filter((q) => q.status !== "annulled").length;
    expect(rpcData.official_total).toBe(validas);
    expect(rpcData.annulled).toBe([...dbQuestions.values()].filter((q) => q.status === "annulled").length);
    expect(rpcData.linked + rpcData.unlinked).toBe(rpcData.official_total);
    expect(rpcData.themes.reduce((a: number, t: any) => a + t.total, 0)).toBe(rpcData.linked);
    expect(rpcData.areas.reduce((a: number, x: any) => a + x.questions, 0)).toBe(rpcData.linked);
    expect(rpcData.linked).toBeGreaterThan(500);
  });

  it("temas sem questão são exatamente os que o arquivo de ligação aponta, e GR-001 (tuberculose) tem questões reais", () => {
    const zeros = rpcData.themes.filter((t: any) => t.total === 0).map((t: any) => t.id);
    expect(zeros).toEqual(lig.resumo.temas_com_zero);
    expect(rpcData.themes[0].total).toBeGreaterThanOrEqual(10);
  });

  it("a tela não recebe previsão nem estimativa, só contagens e o método", () => {
    expect(rpcData.method).toMatch(/não um ranking oficial do Inep nem uma previsão/);
    expect(JSON.stringify(rpcData)).not.toMatch(/estimad|recorr/i);
  });
});

describe("100 Grandes Temas: treino por tema e segurança", () => {
  it("practice_pool com grande_tema devolve só as questões ligadas ao tema", async () => {
    const ids = (await env.sqlAs(USERS.PRO, `select question_id from public.practice_pool('{"grande_tema":"GR-001"}'::jsonb)`)).map((r: any) => r.question_id);
    const permitidas = lig.questoes.filter((x: any) => x.tema_id === "GR-001" && x.status !== "annulled").map((x: any) => x.question_id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(permitidas).toContain(id);
  });

  it("'Treinar este tema' abre uma sessão só com questões do tema; tema sem questão recusa com aviso", async () => {
    const s = await env.rpc(USERS.PRO, "app_start_session", { p_kind: "questoes", p_filters: { grande_tema: "GR-003" }, p_count: 20 });
    expect(s.count).toBeGreaterThan(0);
    const [{ question_ids }] = await env.sql<{ question_ids: string[] }>(`select question_ids from public.practice_sessions where id = $1`, [s.session_id]);
    const permitidas = lig.questoes.filter((x: any) => x.tema_id === "GR-003").map((x: any) => x.question_id);
    for (const id of question_ids) expect(permitidas).toContain(id);
    await expect(env.rpc(USERS.PRO, "app_start_session", { p_kind: "questoes", p_filters: { grande_tema: "GR-042" }, p_count: 20 })).rejects.toThrow(/Nenhuma questão/);
  });

  it("exige login; aluno só lê as tabelas dos temas", async () => {
    await expect(env.sql(`select public.app_grandes_temas()`)).rejects.toThrow();
    await expect(env.sqlAs(USERS.TESTE, `insert into public.grande_tema_questoes (tema_id, question_id, no_taxonomia) values ('GR-001', 'x', 'y')`)).rejects.toThrow();
    await expect(env.sqlAs(USERS.TESTE, `update public.grande_temas set titulo = 'x'`)).rejects.toThrow();
    const lido = await env.sqlAs(USERS.TESTE, `select count(*)::int as n from public.grande_temas`);
    expect(lido[0].n).toBe(100);
  });

  it("colar a migração de novo não duplica nada", async () => {
    const antes = (await env.sql(`select count(*)::int as n from public.grande_tema_questoes`))[0].n;
    await env.dev.db.exec(MIGRACAO);
    const depois = (await env.sql(`select count(*)::int as n from public.grande_tema_questoes`))[0].n;
    expect(depois).toBe(antes);
    expect(antes).toBe(ligadas().length);
    expect((await env.rpc(USERS.PRO, "app_grandes_temas")).linked).toBe(rpcData.linked);
  });

  it("os arquivos do pacote de colagem (1-Grandes-temas.sql e 0-CONFERIR.sql) rodam e respondem OK", async () => {
    const dir = path.join(process.env.HOME ?? "", "Downloads/publicacao-staziamed-2026-10-13-grandes-temas");
    if (!fs.existsSync(dir)) return; // o pacote só existe na máquina de quem o gerou
    const conferir = fs.readFileSync(path.join(dir, "0-CONFERIR.sql"), "utf8");
    const colar = fs.readFileSync(path.join(dir, "1-Grandes-temas.sql"), "utf8");
    const resposta = async (sql: string) => {
      const r: any[] = await env.dev.db.exec(sql);
      return r[r.length - 1].rows[0].resultado as string;
    };
    expect(await resposta(conferir)).toMatch(/^OK: 100 Grandes Temas no banco: 100 temas; \d+ questões oficiais já ligadas/);
    expect(await resposta(colar)).toMatch(/^OK: Grandes Temas colada: 100 temas;/);
    expect(await resposta(conferir)).toMatch(/^OK:/);
  });
});
