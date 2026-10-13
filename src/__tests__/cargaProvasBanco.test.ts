// @vitest-environment node
/**
 * Carga das provas corrigidas (12/10/2026), no banco: Postgres real em memória (PGlite) com TODAS as migrações e as questões REAIS
 * da produção (export de 12/10/2026 em scripts/carga-provas/dados/questoes-antes.json). Cola as partes do pacote como o dono cola
 * (parte 1 aviso, parte 2 texto fiel de cada prova, parte 3 prova 2026/2, parte 4 imagens) e confere:
 *   troca só quando o texto bate; segunda colagem não muda nada; histórico gravado com o texto antigo; gabarito, situação e
 *   comentários intactos; 2026/2 com gabarito PRELIMINARY e o aviso na correção; imagens só com arquivo no depósito; aluno e
 *   visitante sem acesso novo.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { ADMIN, ANA, ROOT, startDb, type Db } from "./helpers/questoesLeva3";
// @ts-ignore módulos .mjs do gerador
import { correcoesDaProva, manifestoImagens, provas, questoesAntes, lerJson } from "../../scripts/carga-provas/comum.mjs";
// @ts-ignore
import { sqlCorrecoes, MOTIVO_TEXTO } from "../../scripts/carga-provas/gerar-correcoes.mjs";
// @ts-ignore
import { sqlAviso, sql2026_2, sqlImagens, sqlConferir, dados2026_2, gerarTudo, MOTIVO_IMAGEM } from "../../scripts/carga-provas/gerar-pacote.mjs";

let t: Db;
const antes: Map<string, any> = questoesAntes();
const manifesto: any[] = manifestoImagens();
const textoDe = (q: any, campo: string) => (campo === "statement" ? q.statement : q.options.find((o: any) => o.id === campo)?.text);
const exec = (sql: string) => t.db.exec(sql);
const ultimo = (r: any) => (Array.isArray(r) ? r[r.length - 1] : r).rows;
let mexida: { id: string; campo: string; outros: string[] };
let partes2: string[];
let resultadoPrimeira: Record<string, any[]> = {};
const fotografia = async () => ({
  questoes: (await t.sql(`select md5(string_agg(q::text, '|' order by q.id)) h from public.questions q`))[0].h,
  historico: (await t.sql(`select count(*)::int n from public.question_change_log`))[0].n,
  registro: (await t.sql(`select count(*)::int n from public.admin_audit_log`))[0].n,
  gabaritos: (await t.sql(`select count(*)::int n from public.question_official_answers`))[0].n,
  arquivos: (await t.sql(`select md5(string_agg(f::text, '|' order by f.path)) h from public.question_figure_files f`))[0].h,
});
const permissoes = async () =>
  t.sql(`select (select md5(string_agg(p.oid::regprocedure::text || coalesce(p.proacl::text, ''), '|' order by 1)) from pg_proc p where p.pronamespace = 'public'::regnamespace) f,
                (select md5(string_agg(c.relname || coalesce(c.relacl::text, '') || c.relrowsecurity, '|' order by 1)) from pg_class c where c.relnamespace = 'public'::regnamespace) t,
                (select md5(string_agg(tablename || policyname || coalesce(qual, '') || coalesce(with_check, ''), '|' order by 1)) from pg_policies) p`);

beforeAll(async () => {
  t = await startDb();
  // as provas e as questões reais, como estão na produção
  const rows = [...antes.values()];
  for (const ex of new Set(rows.map((q) => q.exam_id))) {
    const [kind, year, sem] = ex.split("-");
    await t.sql(`insert into public.exams (id, kind, year, semester, title) values ($1, $2, $3, $4, $5) on conflict do nothing`, [ex, kind.toUpperCase(), Number(year), sem ? Number(sem) : null, ex]);
  }
  for (const q of rows) {
    await t.sql(
      `insert into public.questions (id, code, exam_id, number, area, specialty, topic, subtopic, statement, options, correct_option, status, key_finding, expected_conduct, inep_intent, needs_image, images, sources)
       values ($1,$2,$3,$4,$5::public.med_area,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [q.id, q.code, q.exam_id, q.number, q.area, q.specialty, q.topic, q.subtopic, q.statement, JSON.stringify(q.options), q.correct_option, q.status, q.key_finding, q.expected_conduct, q.inep_intent, q.needs_image, JSON.stringify(q.images), JSON.stringify(q.sources)]
    );
  }
  // alguém da equipe mexeu numa alternativa depois do export: a carga tem de pular só esse campo
  const item = correcoesDaProva("revalida_2022_1").itens.find((i: any) => i.campos.statement && Object.keys(i.campos).length > 2);
  const campo = Object.keys(item.campos).find((k) => k !== "statement")!;
  mexida = { id: item.id, campo, outros: Object.keys(item.campos).filter((k) => k !== campo) };
  await t.sql(`update public.questions set options = (select jsonb_agg(case when o->>'id' = $2 then jsonb_set(o, '{text}', to_jsonb((o->>'text') || ' (editada)')) else o end order by n) from jsonb_array_elements(options) with ordinality x(o, n)) where id = $1`, [mexida.id, campo]);
  await t.sql(`delete from public.question_change_log`);
}, 300_000);

describe("carga das provas corrigidas — no banco", () => {
  it("o pacote gravado em saida/ é o que o gerador produz agora", () => {
    const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "carga-"));
    const nomes = gerarTudo(tmp);
    for (const n of nomes) expect(fs.readFileSync(path.join(tmp, n), "utf8"), n).toBe(fs.readFileSync(path.join(ROOT, "scripts/carga-provas/saida", n), "utf8"));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("parte 1 e partes 2: só troca o campo cujo texto ainda é o do export; o campo mexido depois é pulado e listado", async () => {
    const perm0 = await permissoes();
    ultimo(await exec(sqlAviso()));
    partes2 = provas().map((p: any) => sqlCorrecoes(p));
    for (const [i, sql] of partes2.entries()) resultadoPrimeira[provas()[i].pasta] = ultimo(await exec(sql));
    const r2022 = resultadoPrimeira["revalida_2022_1"];
    expect(r2022[0].resultado).toMatch(/^ATENÇÃO: Revalida 2022\/1: 100 questões corrigidas agora/);
    expect(r2022.filter((x: any) => x.resultado.startsWith("PULADO"))).toHaveLength(1);
    for (const p of provas().filter((p: any) => p.pasta !== "revalida_2022_1")) expect(resultadoPrimeira[p.pasta][0].resultado, p.pasta).toMatch(/^OK: .* 0 pulados/);
    let corrigidos = 0;
    for (const p of provas()) {
      for (const it of correcoesDaProva(p.pasta).itens) {
        const [q] = await t.sql(`select statement, options from public.questions where id = $1`, [it.id]);
        for (const [campo, c] of Object.entries<any>(it.campos)) {
          const agora = textoDe(q, campo);
          if (it.id === mexida.id && campo === mexida.campo) expect(agora).toBe(c.antes + " (editada)");
          else {
            expect(agora, `${it.id} ${campo}`).toBe(c.depois);
            corrigidos++;
          }
        }
      }
    }
    expect(corrigidos).toBe(700); // 701 campos, menos o mexido
    // as partes de dados não mudam permissão, política nem função
    const perm1 = await permissoes();
    expect(perm1).toEqual(perm0);
  });

  it("histórico: uma linha por questão corrigida, com o texto antigo, o novo e o motivo; registro de ações", async () => {
    const h = await t.sql(`select question_id, reason, changes from public.question_change_log where reason = $1`, [MOTIVO_TEXTO]);
    expect(h).toHaveLength(362);
    const q = h.find((x: any) => x.question_id === "revalida_2023_2_q004");
    const it = correcoesDaProva("revalida_2023_2").itens.find((i: any) => i.id === "revalida_2023_2_q004");
    expect(q.changes.statement).toEqual({ de: it.campos.statement.antes, para: it.campos.statement.depois });
    expect(q.changes.statement.de).toContain("kg/m2");
    expect(q.changes.statement.para).toContain("kg/m²");
    expect((await t.sql(`select count(*)::int n from public.admin_audit_log where action = 'question.updated' and details->>'reason' = $1`, [MOTIVO_TEXTO]))[0].n).toBe(362);
  });

  it("parte 3: prova 2026/2 com as 100 questões, o gabarito oficial PRELIMINARY e a data do definitivo (decisões do dono: Q74 MFC, Q93 Cirurgia)", async () => {
    const r = ultimo(await exec(sql2026_2()));
    const { entram, fora } = dados2026_2();
    expect(entram).toHaveLength(100);
    expect(fora).toEqual([]);
    expect(r[0].resultado).toMatch(/^OK: Revalida 2026\/2: 100 questões no banco \(100 criadas agora\); gabarito atual: PRELIMINARY 100/);
    expect(r[0].detalhe).toBe("gabarito definitivo previsto (selo do aluno): 04/12/2026");
    expect((await t.sql(`select final_answer_expected_on::text d from public.exams where id = 'revalida-2026-2'`))[0].d).toBe("2026-12-04");
    expect((await t.sql(`select id, area from public.questions where id in ('revalida_2026_2_q074', 'revalida_2026_2_q093') order by id`)).map((x: any) => x.area)).toEqual(["MEDICINA_FAMILIA_COMUNIDADE", "CIRURGIA_GERAL"]);
    const real = lerJson("revalida_2026_2.json");
    const qs = await t.sql(`select q.id, q.statement, q.options, q.correct_option, q.status, q.needs_image, o.answer, o.answer_status, o.source from public.questions q
                            join public.question_official_answers o on o.question_id = q.id and o.is_current where q.exam_id = 'revalida-2026-2' order by q.number`);
    expect(qs).toHaveLength(100);
    for (const q of qs) {
      const x = real.find((y: any) => y.id === q.id);
      expect(q.statement).toBe(x.statement);
      expect(q.options.map((o: any) => o.text)).toEqual(x.options.map((o: any) => o.text));
      expect([q.correct_option, q.answer, q.answer_status, q.status]).toEqual([x.correct_option, x.correct_option, "PRELIMINARY", "valid"]);
      expect(q.source).toContain("Gabarito preliminar: questão do Revalida 2026/2, ainda sem gabarito definitivo do Inep");
      expect(q.needs_image).toBe(Boolean(x.figura || x.tabela));
    }
    const c = await t.sql(`select count(*)::int n from public.question_change_log where reason like 'Prova nova: Revalida 2026/2%' and changes ? 'criacao'`);
    expect(c[0].n).toBe(100);
  });

  it("parte 4: sem os arquivos no depósito, para e não muda nada; com eles, liga imagens, tira o trecho da tabela e liga a marca", async () => {
    await exec(`create schema if not exists storage; create table if not exists storage.objects (bucket_id text, name text, metadata jsonb);`);
    const todos = manifesto.flatMap((q) => q.imagens);
    for (const i of todos.slice(1)) await t.sql(`insert into storage.objects values ('question-figures', $1, $2)`, [i.path, { size: i.tamanho, mimetype: "image/png" }]);
    const antesFoto = await fotografia();
    await expect(exec(sqlImagens())).rejects.toThrow(/Faltam 1 de 79 imagens/);
    expect(await fotografia()).toEqual(antesFoto);
    await t.sql(`insert into storage.objects values ('question-figures', $1, $2)`, [todos[0].path, { size: todos[0].tamanho, mimetype: "image/png" }]);
    const r = ultimo(await exec(sqlImagens()));
    expect(r[0].resultado).toMatch(/^OK: 77 questões ligadas agora, 0 já estavam, 0 puladas \(de 77\); marcas "cita figura" ligadas: 10$/);
    for (const q of manifesto) {
      const [x] = await t.sql(`select images, statement, needs_image from public.questions where id = $1`, [q.id]);
      expect(x.images.map((i: any) => i.path)).toEqual(q.imagens.map((i: any) => i.path));
      expect(x.images.every((i: any) => Object.keys(i).sort().join() === "alt,path,sha256,source_page")).toBe(true);
      expect(x.needs_image).toBe(true);
      if (q.enunciado_depois) {
        expect(x.statement).toBe(q.enunciado_depois);
        expect(x.statement).not.toContain(q.imagens.find((i: any) => i.trecho).trecho);
      }
    }
    // 2023/2 Q22: tabela achatada sai, texto em volta fica
    const [q22] = await t.sql(`select statement from public.questions where id = 'revalida_2023_2_q022'`);
    expect(q22.statement).toContain("apresentaram o seguinte resultado: Ultrassonografia de abdome:");
    // 2024/2 Q46: a figura nova substitui a antiga (só o 1º ECG); a antiga fica no histórico
    const h46 = await t.sql(`select changes from public.question_change_log where question_id = 'revalida_2024_2_q046' and reason = $1`, [MOTIVO_IMAGEM]);
    expect(h46[0].changes.figura.de).toBe("Figura 1 da questão 46");
    // arquivos reservados à questão certa
    const f = await t.sql(`select count(*)::int n from public.question_figure_files where state = 'confirmed' and question_id is not null`);
    expect(f[0].n).toBe(79);
    for (const m of lerJson("marca-cita-figura.json").ligar) expect((await t.sql(`select needs_image from public.questions where id = $1`, [m.id]))[0].needs_image, m.id).toBe(true);
  });

  it("gabarito, situação, explicações, conduta, 'o que avalia', tema e fontes ficam como estavam", async () => {
    for (const q of antes.values()) {
      const [x] = await t.sql(`select correct_option, status, options, expected_conduct, inep_intent, topic, subtopic, key_finding, sources, comment_review, explanations_review from public.questions where id = $1`, [q.id]);
      expect([x.correct_option, x.status, x.expected_conduct, x.inep_intent, x.topic, x.subtopic, x.key_finding], q.id).toEqual([q.correct_option, q.status, q.expected_conduct, q.inep_intent, q.topic, q.subtopic, q.key_finding]);
      expect(x.options.map((o: any) => [o.id, o.explanation]), q.id).toEqual(q.options.map((o: any) => [o.id, o.explanation]));
      expect(x.sources).toEqual(q.sources);
      expect([x.comment_review, x.explanations_review]).toEqual([null, null]);
    }
    // as questões de controle não mudaram nada
    for (const id of lerJson("questoes-antes.json").controle) {
      const [x] = await t.sql(`select statement, options, images, needs_image from public.questions where id = $1`, [id]);
      const q = antes.get(id);
      expect([x.statement, x.options, x.images, x.needs_image]).toEqual([q.statement, q.options, q.images, q.needs_image]);
    }
  });

  it("colar tudo de novo não muda nada (nem histórico, nem registro, nem gabarito)", async () => {
    const f0 = await fotografia();
    await exec(sqlAviso());
    for (const sql of partes2) {
      const r = ultimo(await exec(sql));
      expect(r[0].resultado).toMatch(/ 0 questões corrigidas agora/);
      expect(r[0].resultado).toMatch(/ 0 pulados|^ATENÇÃO: Revalida 2022\/1: .* 1 pulados/);
    }
    expect(ultimo(await exec(sql2026_2()))[0].resultado).toMatch(/\(0 criadas agora\)/);
    expect(ultimo(await exec(sqlImagens()))[0].resultado).toMatch(/^OK: 0 questões ligadas agora, 77 já estavam/);
    expect(await fotografia()).toEqual(f0);
  });

  it("0-CONFERIR só lê e diz o estado: tudo fiel, só o campo mexido diferente, imagens ligadas e 2026/2", async () => {
    const f0 = await fotografia();
    const r = ultimo(await exec(sqlConferir()));
    expect(r[0].conferencia).toMatch(/^ATENÇÃO: há campo com texto diferente/);
    expect(r.find((x: any) => x.ordem === 12).resultado).toBe(`${mexida.id} ${mexida.campo}`);
    expect(r.find((x: any) => x.ordem === 10).resultado).toBe("700 / 0 / 1");
    expect(r.find((x: any) => x.ordem === 20).resultado).toBe("77 / 79");
    expect(r.find((x: any) => x.ordem === 30).resultado).toBe("100 / 100");
    expect(r.find((x: any) => x.ordem === 40).resultado).toBe("sim / 04/12/2026");
    expect(await fotografia()).toEqual(f0);
  });

  it("aluno: a correção de uma questão da 2026/2 traz o aviso do gabarito preliminar; a de outra prova, não; nada novo para ler", async () => {
    const s = await t.rpc(ANA, "app_start_session", { p_kind: "questoes", p_filters: { exam_id: "revalida-2026-2" }, p_count: 3 });
    const sess = await t.rpc(ANA, "app_get_session", { p_session_id: s.session_id });
    const q = sess.questions[0];
    expect(q.correction).toBeNull();
    expect(Object.keys(q)).not.toContain("correct_option");
    // rodada 2: a sessão sorteia as questões; responder sempre "A" às vezes acertava e o caderno de erros ficava vazio (teste
    // instável). Agora responde de propósito uma letra ERRADA (lida do banco só pelo teste), para cair no caderno.
    const errada = (await t.sql(`select correct_option from public.questions where id = $1`, [q.id]))[0].correct_option === "A" ? "B" : "A";
    const c = await t.rpc(ANA, "app_answer_question", { p_session_id: s.session_id, p_question_id: q.id, p_option: errada });
    expect(c.answer_preliminary).toBe(true);
    expect(c.preliminary).toEqual({ expected_on: "2026-12-04" });
    expect(q.preliminary).toEqual({ expected_on: "2026-12-04" }); // o selo aparece antes de responder, sem a letra
    // resultado da sessão e caderno de erros: a mesma marca (errou de propósito para cair no caderno)
    const s2 = await t.rpc(ANA, "app_start_session", { p_kind: "questoes", p_filters: { exam_id: "revalida-2023-2" }, p_count: 1 });
    const q2 = (await t.rpc(ANA, "app_get_session", { p_session_id: s2.session_id })).questions[0];
    const c2 = await t.rpc(ANA, "app_answer_question", { p_session_id: s2.session_id, p_question_id: q2.id, p_option: "A" });
    expect(c2.answer_preliminary).toBe(false);
    expect(c2.preliminary).toBeNull();
    const caderno = await t.rpc(ANA, "app_error_notebook");
    for (const it of caderno.items) expect(it.preliminary, it.question_id).toEqual(it.question_id.startsWith("revalida_2026_2_") ? { expected_on: "2026-12-04" } : null);
    const detalhe = await t.rpc(ANA, "app_error_detail", { p_question_id: caderno.items[0].question_id });
    if (detalhe) expect(Object.keys(detalhe)).toContain("preliminary");
    // a função interna do selo fica fechada ao aluno
    await expect(t.asUser(ANA, `select public.question_preliminary_info('revalida_2026_2_q001')`)).rejects.toThrow(/permission denied/);
    // quando a equipe registra o gabarito DEFINITIVO pela função oficial, o selo some
    const [g] = await t.sql(`select correct_option from public.questions where id = $1`, [q.id]);
    await t.rpc(ADMIN, "app_admin_set_official_answer", { p_question_id: q.id, p_answer: g.correct_option, p_status: "FINAL", p_source: "Gabarito definitivo do Inep (teste)", p_reason: "Definitivo publicado" });
    const depois = await t.rpc(ANA, "app_get_session", { p_session_id: s.session_id });
    const qd = depois.questions.find((x: any) => x.id === q.id);
    expect(qd.preliminary).toBeNull();
    expect(qd.correction.answer_preliminary).toBe(false);
    expect(depois.questions.filter((x: any) => x.id !== q.id).every((x: any) => x.preliminary?.expected_on === "2026-12-04")).toBe(true);
    // o aluno não lê gabarito oficial, histórico nem arquivos; o visitante não lê questões nem chama a correção
    for (const tabela of ["question_official_answers", "question_change_log"]) expect(await t.asUser(ANA, `select * from public.${tabela}`)).toEqual([]);
    await expect(t.asUser(ANA, `select * from public.question_figure_files`)).rejects.toThrow(/permission denied/);
    expect(await t.asUser(null, `select id from public.questions where exam_id = 'revalida-2026-2'`).catch(() => [])).toEqual([]);
    // o visitante consegue chamar a função (como antes desta carga), mas ela não devolve nada sem login
    expect((await t.asUser(null, `select public.practice_correction_view('revalida_2026_2_q001', 'A') r`))[0].r).toBeNull();
  });
});
