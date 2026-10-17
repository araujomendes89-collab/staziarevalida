/**
 * Banco de estações · pedido do dono de 17/10, migração 013410: grau de dificuldade (Fácil, Médio, Difícil) definido pela
 * revisão médica, sobre o banco local (PGlite, migrações reais).
 *  - grava só o revisor médico da área ou o administrador, com a nota do que foi conferido (10+ caracteres); editor, revisor
 *    de outra área, aluno e visitante não gravam;
 *  - mudar o grau não derruba a aprovação médica da estação nem apaga o registro da revisão;
 *  - app_dupla_stations() devolve só o grau (sem quem definiu nem a nota); sem grau, null;
 *  - a tabela fica fechada; colar a migração duas vezes dá o mesmo banco.
 * Estação e notas daqui são EXEMPLO DE TESTE: nenhuma estação real é classificada.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addStation, MIGRATIONS_DIR, openDuplaDb, setDupla, setPlan, STATION, U, type DuplaDb } from "./helpers/duplaDb";

const MIGRACAO = "20261003013410_treino_dupla_dificuldade_estacoes.sql";
const EDITORA = U.eva; // equipe (editor), não é revisora médica
const REV_CM = U.gil; // revisor médico de Clínica Médica (papel de aluno)
const REV_PED = U.fabio; // revisor médico de Pediatria (papel de aluno)
const NOTA = "Conferido roteiro e checklist (exemplo de teste).";
const ESTACAO = { ...STATION, id: "teste-dificuldade-e01", name: "Estação de teste da dificuldade" };

describe("Migração 013410: grau de dificuldade da estação", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    await setPlan(d.db, U.ana, "pro", "active");
    await d.sql(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITORA]);
    await d.sql(`update public.profiles set name = 'Revisor de Teste' where id = $1`, [REV_CM]);
    await d.sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CLINICA_MEDICA'), ($2, 'PEDIATRIA')`, [REV_CM, REV_PED]);
    await addStation(d.db, ESTACAO);
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });
  beforeEach(async () => {
    await d.sql(`delete from public.checklist_station_difficulty`);
  });

  const definir = (uid: string | null, level: string | null, criteria: string[] = [], note: string | null = NOTA) =>
    d.rpc<any[]>(uid, "app_admin_set_station_difficulty", { p_station_id: ESTACAO.id, p_level: level, p_criteria: criteria, p_note: note });
  const doAluno = async () => (await d.rpc<any[]>(U.ana, "app_dupla_stations")).find((s) => s.id === ESTACAO.id);
  const naAba = async (uid: string = U.admin) => (await d.rpc<any[]>(uid, "app_admin_stations")).find((s) => s.id === ESTACAO.id);

  it("sem grau gravado, o aluno recebe difficulty null; o revisor da área define e o aluno recebe só o grau", async () => {
    const antes = await doAluno();
    expect(antes).toHaveProperty("difficulty", null);
    const lista = await definir(REV_CM, "medio", ["tarefas", "raciocinio", "tarefas"], `  ${NOTA}  `);
    const linha = lista.find((s) => s.id === ESTACAO.id);
    expect(linha).toMatchObject({ difficulty: "medio", difficulty_criteria: ["raciocinio", "tarefas"], difficulty_note: NOTA, difficulty_by: "Revisor de Teste" });
    expect(linha.difficulty_at).not.toBeNull();
    const aluno = await doAluno();
    expect(aluno.difficulty).toBe("medio");
    expect(JSON.stringify(aluno)).not.toMatch(/Conferido|Revisor de Teste|raciocinio/);
    // trocar e tirar
    expect((await definir(U.admin, "dificil", ["tarefas", "raciocinio", "procedimento", "tempo"])).find((s) => s.id === ESTACAO.id).difficulty).toBe("dificil");
    expect((await doAluno()).difficulty).toBe("dificil");
    expect((await definir(U.admin, null)).find((s) => s.id === ESTACAO.id)).toMatchObject({ difficulty: null, difficulty_criteria: [], difficulty_by: null });
    expect((await doAluno()).difficulty).toBeNull();
    const log = await d.sql<any>(`select details from public.admin_audit_log where target = $1 and action = 'station.difficulty' order by id`, [ESTACAO.id]);
    expect(log.map((x: any) => [x.details.from, x.details.to])).toEqual([[null, "medio"], ["medio", "dificil"], ["dificil", null]]);
    expect(log[0].details).toMatchObject({ note: NOTA, criteria: ["raciocinio", "tarefas"], area: "Clínica Médica" });
  });

  it("quem grava: revisor da área ou administrador; editor, revisor de outra área, aluno e visitante não", async () => {
    await expect(definir(EDITORA, "facil")).rejects.toThrow(
      "O grau de dificuldade desta estação é definido por um revisor médico cadastrado em Clínica Médica ou por um administrador."
    );
    await expect(definir(REV_PED, "facil")).rejects.toThrow(/revisor médico cadastrado em Clínica Médica/);
    await expect(definir(U.ana, "facil")).rejects.toThrow("Acesso restrito à equipe e aos revisores médicos.");
    await expect(definir(null, "facil")).rejects.toThrow(/permission denied/);
    expect((await naAba(EDITORA)).difficulty).toBeNull();
    expect((await definir(U.admin, "facil")).find((s) => s.id === ESTACAO.id).difficulty).toBe("facil");
  });

  it("nota de 10+ caracteres, grau e itens da rubrica válidos", async () => {
    await expect(definir(REV_CM, "facil", [], "")).rejects.toThrow("Registre o que foi conferido para definir o grau (pelo menos 10 caracteres).");
    await expect(definir(REV_CM, "facil", [], null)).rejects.toThrow(/pelo menos 10 caracteres/);
    await expect(definir(REV_CM, "facil", [], "  curta   ")).rejects.toThrow(/pelo menos 10 caracteres/);
    await expect(definir(REV_CM, null, [], "curta")).rejects.toThrow(/pelo menos 10 caracteres/); // tirar também pede nota
    await expect(definir(REV_CM, "facil", [], "x".repeat(2001))).rejects.toThrow("A nota tem no máximo 2.000 caracteres.");
    await expect(definir(REV_CM, "extremo")).rejects.toThrow("Grau de dificuldade inválido.");
    await expect(definir(REV_CM, "medio", ["tarefas", "outro"])).rejects.toThrow("Item da rubrica desconhecido.");
    await expect(d.rpc(U.admin, "app_admin_set_station_difficulty", { p_station_id: "nao-existe", p_level: "facil", p_note: NOTA })).rejects.toThrow("Estação não encontrada.");
    expect((await naAba()).difficulty).toBeNull();
  });

  it("mudar só o grau NÃO derruba a aprovação médica nem o registro da revisão", async () => {
    await d.sql(
      `insert into public.checklist_station_reviews (station_id, review_note, reviewed_by, reviewed_at) values ($1, 'Conferência de teste.', $2, now())
       on conflict (station_id) do nothing`,
      [ESTACAO.id, REV_CM]
    );
    await definir(REV_CM, "medio");
    await definir(U.admin, "dificil");
    await definir(U.admin, null);
    const [s] = await d.sql<any>(`select medical_review from public.checklist_stations where id = $1`, [ESTACAO.id]);
    expect(s.medical_review).toBe("approved");
    expect(await naAba()).toMatchObject({ medical_review: "approved", review_note: "Conferência de teste.", reviewer: "Revisor de Teste" });
    expect((await doAluno()).id).toBe(ESTACAO.id); // continua no banco do aluno
  });

  it("a tabela é fechada (até para a equipe por fora da função); campos da recalibração prontos e vazios", async () => {
    await definir(REV_CM, "facil");
    for (const uid of [U.ana, EDITORA, U.admin]) {
      await expect(d.asUser(uid, `select * from public.checklist_station_difficulty`)).rejects.toThrow(/permission denied/);
    }
    await expect(d.asUser(U.ana, `insert into public.checklist_station_difficulty (station_id, level, note) values ('${ESTACAO.id}', 'facil', 'xxxxxxxxxxxx')`)).rejects.toThrow(/permission denied/);
    const [linha] = await d.sql<any>(`select * from public.checklist_station_difficulty where station_id = $1`, [ESTACAO.id]);
    expect(linha).toMatchObject({ level: "facil", calibrated_level: null, calibrated_at: null, calibrated_n: null });
  });

  it("colar a 013410 de novo dá o mesmo banco; funções com search_path vazio e fechadas ao visitante", async () => {
    await definir(REV_CM, "medio", ["tarefas"]);
    const defs = () =>
      d.sql<{ id: string; def: string; acl: string | null }>(
        `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`
      );
    const antes = await defs();
    await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8"));
    expect(await defs()).toEqual(antes);
    expect((await naAba()).difficulty).toBe("medio"); // o dado continua
    const acl = Object.fromEntries(antes.map((f) => [f.id, f.acl]));
    expect(acl["app_admin_set_station_difficulty(text,text,text[],text)"]).toBe(acl["app_admin_stations()"]);
    expect(acl["app_admin_stations()"]).not.toMatch(/(^|[{,])anon=/);
    expect(acl["app_dupla_stations()"]).not.toMatch(/(^|[{,])anon=/);
    const f = await d.sql(`select proname, prosecdef, proconfig from pg_proc where proname = any ($1) order by 1`, [
      ["app_admin_set_station_difficulty", "app_admin_stations", "app_dupla_stations"],
    ]);
    expect(f).toHaveLength(3);
    for (const x of f) expect(x, x.proname).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'] });
  });
});
