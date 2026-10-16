// @vitest-environment node
/**
 * Carga das explicações no banco (migração 20261003009920), num Postgres real em memória (PGlite) com TODAS as migrações e com as
 * questões e explicações REAIS dos agentes (fixtures/carga-explicacoes; os itens vêm do próprio gerador). Prova: idempotência;
 * gabarito, situação e enunciado intactos; correção do Auditor aplicada; divergente fora; anulada com explicações de estudo e
 * sem "Correta."; nota "O que mudou desde a prova" só depois de aprovada por pessoa (e sem repetir a das Fontes vinculadas);
 * aprovar a prova inteira só com o papel certo; regra B; aluno e visitante sem acesso novo; histórico com o texto antigo.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
// @ts-ignore módulo .mjs sem tipos
import * as G from "../../scripts/carga-explicacoes/gerar-sql.mjs";
import { ADMIN, ANA, BIA, EDITOR, REV_CIR, REV_PED, ROOT, startDb, type Db } from "./helpers/questoesLeva3";

const FIX = path.join(__dirname, "fixtures/carga-explicacoes");
const real = (prova: string, arq: string) => JSON.parse(fs.readFileSync(path.join(FIX, "revisao", prova, arq), "utf8"));
const DECISOES = JSON.parse(fs.readFileSync(path.join(FIX, "decisoes-divergencias.json"), "utf8"));
const EXAMS = [
  ["revalida-2020", "REVALIDA", 2020, null, "Revalida INEP 2020"], ["revalida-2021", "REVALIDA", 2021, null, "Revalida INEP 2021"],
  ["revalida-2022-2", "REVALIDA", 2022, 2, "Revalida INEP 2022/2"], ["revalida-2023-1", "REVALIDA", 2023, 1, "Revalida INEP 2023/1"],
  ["enamed-2025", "ENAMED", 2025, null, "ENAMED 2025"],
];
const PROVAS = ["revalida_2020_1", "revalida_2021_1", "revalida_2022_2", "revalida_2023_1", "enamed_2025"];

let t: Db;
let itens: any[];
let porProva: Record<string, any[]>;
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return String(e?.message ?? e);
  }
  return null;
};
const row = async (id: string) => (await t.sql<any>(`select * from public.questions where id = $1`, [id]))[0];
const apply = async (lista: any[], label = "Carga das explicações (Professor e Auditor) · teste") =>
  (await t.sql<any>(`select public.question_explanations_apply($1::jsonb, $2) as r`, [JSON.stringify(lista), label]))[0].r;
const answer = (uid: string, id: string, opt = "A") => t.sql(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, $2, $3)`, [uid, id, opt]);
const correction = (uid: string, id: string) => t.rpc<any>(uid, "practice_correction_view", { p_question_id: id, p_selected: "A" });
const seenOf = async (id: string) => {
  const r = await row(id);
  return { ...Object.fromEntries(r.options.map((o: any) => [`explanation_${o.id}`, o.explanation])), expected_conduct: r.expected_conduct ?? "", inep_intent: r.inep_intent ?? "" };
};
const approve = async (uid: string, id: string) =>
  t.rpc<any>(uid, "app_admin_question_comment_decide", { p_question_id: id, p_decision: "approve", p_note: "Conferi as quatro explicações e a conduta.", p_seen_texts: await seenOf(id) });
/** Item montado do texto REAL do Professor (para as questões que o Auditor ainda não conferiu: anulada e nota). */
const itemDoProfessor = (q: any, p: any) => {
  const anulada = q.status === "annulled";
  const x: any = {
    id: q.id, situacao: anulada ? "annulled" : "valid", gabarito: anulada ? null : q.correct_option,
    explicacoes: Object.fromEntries(["A", "B", "C", "D"].map((l) => [l, G.limpa(p.explicacao[l])])),
    conduta: G.limpa(p.conduta_esperada), avalia: G.limpa(p.o_que_a_questao_avalia), tema: G.limpa(p.tema), subtema: G.limpa(p.subtema),
    nota: G.limpa(p.nota_atualizacao) || null, texto_lido: G.impressaoLida(q),
    carga: { veredito: null, observacao: "teste: o Auditor ainda não conferiu esta questão" },
  };
  x.impressao = G.impressaoTextos(x);
  return x;
};
const Q_ANULADA = real("revalida_2023_1", "corrigidas-todas.json")[0];
const P_ANULADA = real("revalida_2023_1", "prof-anuladas.json")[0];
const Q_NOTA = real("revalida_2021_1", "corrigidas-todas.json")[0];
const P_NOTA = real("revalida_2021_1", "prof-01.json")[0];

beforeAll(async () => {
  t = await startDb();
  for (const e of EXAMS) await t.sql(`insert into public.exams (id, kind, year, semester, title) values ($1, $2, $3, $4, $5)`, e);
  // as questões como estão no banco hoje: o texto real (revisão de fidelidade), com as explicações antigas
  for (const prova of PROVAS) {
    for (const q of real(prova, "corrigidas-todas.json")) {
      await t.sql(`insert into public.questions (id, code, exam_id, number, area, specialty, topic, subtopic, statement, options, correct_option, status, key_finding, expected_conduct, inep_intent, sources)
                   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [q.id, q.code, q.exam_id, q.number, q.area, q.specialty, q.topic, q.subtopic || null, q.statement, JSON.stringify(q.options), q.correct_option, q.status, q.key_finding, q.expected_conduct, q.inep_intent, JSON.stringify(q.sources ?? [])]);
    }
  }
  // os itens saem do gerador, com a pasta real (Auditor gravado depois do Professor) e a decisão real do dono
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "carga-banco-"));
  fs.cpSync(path.join(FIX, "revisao"), dir, { recursive: true });
  for (const prova of fs.readdirSync(dir)) for (const f of fs.readdirSync(path.join(dir, prova))) {
    const quando = new Date(f.startsWith("aud-") ? "2026-10-12T18:00:00Z" : "2026-10-12T17:00:00Z");
    fs.utimesSync(path.join(dir, prova, f), quando, quando);
  }
  const r = G.gerarTudo({ pasta: dir, decisoes: DECISOES, geradoEm: "teste" });
  fs.rmSync(dir, { recursive: true, force: true });
  porProva = Object.fromEntries(r.resultados.map((x: any) => [x.slug, x.itens]));
  itens = r.resultados.flatMap((x: any) => x.itens);
}, 180_000);

describe("a carga", () => {
  it("grava as explicações reais em revisão, sem mudar gabarito, situação, enunciado nem o texto das alternativas", async () => {
    const antes = await t.sql<any>(`select id, correct_option, status, statement, (select jsonb_agg(o ->> 'text' order by o ->> 'id') from jsonb_array_elements(options) o) as textos from public.questions order by id`);
    const r = await apply(itens);
    expect(r.puladas).toEqual([]);
    expect(r.gravadas).toBe(itens.length);
    expect(r.resumo).toMatch(/^OK: /);
    const depois = await t.sql<any>(`select id, correct_option, status, statement, (select jsonb_agg(o ->> 'text' order by o ->> 'id') from jsonb_array_elements(options) o) as textos from public.questions order by id`);
    expect(depois).toEqual(antes);
    for (const i of itens) {
      const q = await row(i.id);
      expect(Object.fromEntries(q.options.map((o: any) => [o.id, o.explanation]))).toEqual(i.explicacoes);
      expect([q.expected_conduct, q.inep_intent, q.topic, q.subtopic]).toEqual([i.conduta, i.avalia, i.tema, i.subtema]);
      expect(q.comment_review.campos).toEqual(["expected_conduct", "explanation_A", "explanation_B", "explanation_C", "explanation_D", "inep_intent"]);
      expect(q.comment_review.carga.veredito).toBe(i.carga.veredito);
      // a mesma impressão digital do gerador (o CONFERIR e a regra B dependem disso)
      expect((await t.sql<any>(`select public.question_explanations_fingerprint(options, expected_conduct, inep_intent, topic, subtopic) h from public.questions where id = $1`, [i.id]))[0].h).toBe(i.impressao);
      expect(q.comment_review.carga.texto_diferente).toBe(false);
    }
  });

  it("a correção do Auditor está no banco (e não o texto original do Professor)", async () => {
    const aud = real("enamed_2025", "aud-01.json")[0];
    const q = await row("enamed_2025_q041");
    expect(q.options.find((o: any) => o.id === "D").explanation).toBe(G.limpa(aud.correcoes.explicacao.D));
  });

  it("divergente: só entrou porque o dono decidiu (A), e com a reescrita do Auditor; sem decisão não entraria", async () => {
    expect(itens.map((i) => i.id)).toContain("revalida_2020_1_q008");
    const q = await row("revalida_2020_1_q008");
    expect(q.comment_review.carga.decisao_dono).toBe("A");
    expect(JSON.stringify(q.options)).not.toMatch(/divergência fica sinalizada/);
    const semDecisao = G.classificarProva(G.lerProva(path.join(FIX, "revisao"), "revalida_2020_1"), {});
    expect(semDecisao.itens.map((i: any) => i.id)).not.toContain("revalida_2020_1_q008");
  });

  it("o aluno não vê o texto novo até o revisor aprovar; depois de aprovar vê, e colar de novo não desfaz a aprovação", async () => {
    await answer(ANA, "revalida_2022_2_q093", "C");
    let c = await correction(ANA, "revalida_2022_2_q093");
    expect(c.in_review).toBe(true);
    expect(c.explanation).toBeNull();
    expect(c.option_notes).toEqual([]);
    expect(c.expected_conduct).toBeNull();
    await approve(REV_PED, "revalida_2022_2_q093"); // revisora de Pediatria aprova a questão de Pediatria
    c = await correction(ANA, "revalida_2022_2_q093");
    const i = itens.find((x) => x.id === "revalida_2022_2_q093");
    expect(c.explanation).toBe(i.explicacoes.C);
    expect(c.option_notes.map((n: any) => n.id)).toEqual(["A", "B", "D"]);
    expect(c.in_review).toBe(false);
    const log = (await t.sql<any>(`select count(*)::int n from public.question_change_log`))[0].n;
    const r = await apply(itens);
    expect(r).toMatchObject({ gravadas: 0, iguais: itens.length, puladas: [] });
    expect((await row("revalida_2022_2_q093")).comment_review).toBeNull();
    expect((await t.sql<any>(`select count(*)::int n from public.question_change_log`))[0].n).toBe(log);
  });

  it("o histórico guarda o texto antigo (explicações, conduta, tema e subtema) com o motivo da carga", async () => {
    const q = real("revalida_2022_2", "corrigidas-todas.json").find((x: any) => x.id === "revalida_2022_2_q052");
    const [h] = await t.sql<any>(`select reason, changes from public.question_change_log where question_id = $1 order by id limit 1`, ["revalida_2022_2_q052"]);
    expect(h.reason).toBe("Carga das explicações (Professor e Auditor) · teste");
    expect(h.changes.topic.de).toBe(q.topic);
    expect(h.changes.expected_conduct.de).toBe(q.expected_conduct);
    expect(h.changes.options.de.find((o: any) => o.id === "B").explanation).toBe(q.options.find((o: any) => o.id === "B").explanation);
    expect(Object.keys(h.changes)).not.toContain("correct_option");
    expect(Object.keys(h.changes)).not.toContain("status");
  });

  it("questão inexistente, gabarito diferente ou letra trocada: pulada e listada, nada gravado", async () => {
    const i = itens.find((x) => x.id === "revalida_2022_2_q052");
    const r = await apply([
      { ...i, id: "revalida_2026_2_q001" },
      { ...i, gabarito: "C" },
      { ...i, explicacoes: { ...i.explicacoes, A: i.explicacoes.B } },
    ]);
    expect(r.gravadas).toBe(0);
    expect(r.puladas.map((p: any) => p.motivo)).toEqual([
      "a questão não existe no banco (cole antes a carga das provas)",
      "gabarito no banco: B; as explicações foram escritas para o gabarito C (o gabarito nunca muda por aqui)",
      'a explicação da A não começa como deve ("Correta." só na letra do gabarito, "Incorreta." nas outras)',
    ]);
    expect(r.resumo).toMatch(/^ATENÇÃO: /);
  });
});

describe("regra B (opcional)", () => {
  it("libera só a questão da lista com texto da carga, sem devolução e sem decisão anterior; registra no Registro de ações", async () => {
    const b = itens.filter((i) => i.carga.regra_b);
    expect(b.map((i) => i.id)).toEqual(["revalida_2022_2_q052"]);
    // a q025 (GO) foi devolvida pelo administrador: mesmo se estivesse na lista, continua em revisão
    await t.rpc(ADMIN, "app_admin_question_comment_decide", { p_question_id: "revalida_2022_2_q025", p_decision: "return", p_note: "Rever a explicação da alternativa B." });
    const lista = [...b, itens.find((i) => i.id === "revalida_2022_2_q025"), itens.find((i) => i.id === "revalida_2022_2_q093")].map((i: any) => ({ id: i.id, impressao: i.impressao }));
    const r = (await t.sql<any>(`select public.question_explanations_release($1::jsonb, 'Regra B · teste') r`, [JSON.stringify(lista)]))[0].r;
    expect(r.liberadas).toBe(1);
    expect(r.ja_sem_revisao).toBe(1); // a q093 já tinha sido aprovada pela revisora
    expect(r.puladas).toEqual([{ id: "revalida_2022_2_q025", motivo: "devolvida pelo revisor médico: continua em revisão" }]);
    expect((await row("revalida_2022_2_q052")).comment_review).toBeNull();
    await answer(BIA, "revalida_2022_2_q052", "B");
    expect((await correction(BIA, "revalida_2022_2_q052")).explanation).toBe(b[0].explicacoes.B);
    const [log] = await t.sql<any>(`select action, details from public.admin_audit_log where action = 'question.explanations_released'`);
    expect(log.details.ids).toEqual(["revalida_2022_2_q052"]);
  });
});

describe("aprovar a prova inteira", () => {
  const exam = (uid: string | null) => t.rpc<any>(uid, "app_admin_comment_review_exam", { p_exam_id: "revalida-2020" });
  const aprovar = (uid: string | null, seen: string, note = "Li as explicações das questões desta prova.") =>
    t.rpc<any>(uid, "app_admin_comment_review_approve_exam", { p_exam_id: "revalida-2020", p_note: note, p_seen: seen });

  it("aluno e visitante não chegam nem ao resumo; o editor (sem ser revisor) não aprova nada", async () => {
    expect(await failure(exam(ANA))).toMatch(/Acesso restrito/);
    expect(await failure(exam(null))).toMatch(/permission denied|Acesso restrito/);
    const s = await exam(EDITOR);
    expect(s).toMatchObject({ pendentes: 2, aprovaveis: 0 });
    expect(await failure(aprovar(EDITOR, s.impressao))).toMatch(/Nada para aprovar/);
  });

  it("revisor médico aprova só as da área dele; impressão velha é recusada; o administrador aprova o resto com registro", async () => {
    const ped = await exam(REV_PED); // revisora de Pediatria só enxerga a q100 (Pediatria)
    expect(ped).toMatchObject({ pendentes: 1, aprovaveis: 1 });
    const cir = await exam(REV_CIR);
    expect(cir).toMatchObject({ pendentes: 1, aprovaveis: 1 }); // q008 (Cirurgia)
    expect(await failure(aprovar(REV_PED, "impressao-velha"))).toMatch(/mudou desde que você a abriu/);
    expect(await failure(aprovar(REV_PED, ped.impressao, "curta"))).toMatch(/pelo menos 10/);
    const r = await aprovar(REV_PED, ped.impressao);
    expect(r.aprovadas).toBe(1);
    expect((await row("revalida_2020_1_q100")).comment_review).toBeNull();
    expect((await row("revalida_2020_1_q008")).comment_review).not.toBeNull();
    const adm = await exam(ADMIN);
    expect(adm).toMatchObject({ pendentes: 1, aprovaveis: 1 });
    await aprovar(ADMIN, adm.impressao);
    const logs = await t.sql<any>(`select actor_id, details from public.admin_audit_log where action = 'question.comment_approved_exam' order by id`);
    expect(logs.map((l: any) => [l.actor_id, l.details.ids])).toEqual([[REV_PED, ["revalida_2020_1_q100"]], [ADMIN, ["revalida_2020_1_q008"]]]);
    const dec = await t.sql<any>(`select decided_by, note from public.question_comment_reviews where question_id = 'revalida_2020_1_q008'`);
    expect(dec[0]).toMatchObject({ decided_by: ADMIN, note: "Aprovação da prova inteira: Li as explicações das questões desta prova." });
  });

  it("a lista das provas para escolher mostra o que espera decisão", async () => {
    const l = await t.rpc<any>(ADMIN, "app_admin_comment_review_exams");
    expect(l.find((e: any) => e.id === "revalida-2022-2")).toMatchObject({ pendentes: 1, devolvidas: 1 });
    expect(await failure(t.rpc(ANA, "app_admin_comment_review_exams"))).toMatch(/Acesso restrito/);
  });
});

describe("anulada: explicações de estudo, aviso e fora de acertos e erros", () => {
  const ID = Q_ANULADA.id;
  it("com o texto real do Professor: em revisão, nada; aprovado, as quatro letras com Defensável/Incorreta e nunca 'Correta.'", async () => {
    // hoje o banco tem, na anulada, o texto antigo ("Questão oficialmente anulada…"): o aluno não vê explicação nenhuma
    await answer(ANA, ID, "B");
    expect((await correction(ANA, ID)).annulled_notes).toEqual([]);
    const r = await apply([itemDoProfessor(Q_ANULADA, P_ANULADA)]);
    expect(r.puladas).toEqual([]);
    let c = await correction(ANA, ID);
    expect(c.annulled_notes).toEqual([]);
    expect(c.in_review).toBe(true);
    await approve(ADMIN, ID);
    c = await correction(ANA, ID);
    expect(c).toMatchObject({ annulled: true, is_correct: null, explanation: null, option_notes: [] });
    expect(c.annulled_notes.map((n: any) => n.id)).toEqual(["A", "B", "C", "D"]);
    expect(c.annulled_notes.every((n: any) => /^(Defensável|Incorreta)\./.test(n.text))).toBe(true);
    expect(JSON.stringify(c.annulled_notes)).not.toMatch(/"Correta\./);
    expect(c.annulled_notes.find((n: any) => n.id === "B").text).toBe(G.limpa(P_ANULADA.explicacao.B));
    // fora de acertos e erros
    const [s] = await t.sql<any>(`insert into public.practice_sessions (user_id, kind, question_ids, finished_at) values ($1, 'questoes', $2, now()) returning id`, [ANA, [ID]]);
    const res = await t.rpc<any>(ANA, "practice_result", { p_session_id: s.id });
    expect(res).toMatchObject({ answered: 0, correct: 0, annulled: 1 });
  });

  it("anulada com uma letra 'Correta.' (texto antigo para a letra guardada): nada de explicação de estudo; a carga recusa", async () => {
    const opts = (await row(ID)).options.map((o: any) => (o.id === "A" ? { ...o, explanation: "Correta. Texto antigo escrito para a letra guardada." } : o));
    await t.sql(`update public.questions set options = $2 where id = $1`, [ID, JSON.stringify(opts)]);
    expect((await correction(ANA, ID)).annulled_notes).toEqual([]);
    const ruim = itemDoProfessor(Q_ANULADA, P_ANULADA);
    ruim.explicacoes.A = "Correta. " + ruim.explicacoes.A.replace(/^\S+\s/, "");
    expect((await apply([ruim])).puladas[0].motivo).toMatch(/Defensável/);
  });
});

describe("nota 'O que mudou desde a prova'", () => {
  const ID = Q_NOTA.id;
  it("entra em revisão; o aluno só vê depois de aprovada por pessoa (revisor da área ou administrador)", async () => {
    await apply([itemDoProfessor(Q_NOTA, P_NOTA)]);
    const [n] = await t.sql<any>(`select * from public.question_update_notes where question_id = $1`, [ID]);
    expect(n).toMatchObject({ status: "em_revisao", origin: "professor" });
    expect(n.note).toBe(G.limpa(P_NOTA.nota_atualizacao).replace(/^O que mudou desde a prova:\s*/, "").replace(/^./, (c: string) => c.toUpperCase()));
    await answer(ANA, ID, "C");
    await approve(ADMIN, ID); // o comentário aprovado não aprova a nota
    expect((await correction(ANA, ID)).update_note).toBeNull();
    // a importação (SQL sem pessoa) nunca aprova
    expect(await failure(t.sql(`update public.question_update_notes set status = 'aprovada' where question_id = $1`, [ID]))).toMatch(/aprovada por uma pessoa/);
    // revisor de outra área e editor não decidem; aluno nem lê
    const decide = (uid: string, decision = "approve") => t.rpc<any>(uid, "app_admin_question_update_note_decide", { p_question_id: ID, p_decision: decision, p_note: "Conferi a mudança na fonte vigente.", p_seen_text: n.note });
    expect(await failure(decide(REV_PED))).toMatch(/Acesso restrito|revisor médico cadastrado/);
    expect(await failure(decide(EDITOR))).toMatch(/revisor médico cadastrado/);
    expect(await failure(t.rpc(ANA, "app_admin_question_update_note", { p_question_id: ID }))).toMatch(/Acesso restrito/);
    expect(await failure(t.rpc(ADMIN, "app_admin_question_update_note_decide", { p_question_id: ID, p_decision: "approve", p_note: "Conferi a mudança.", p_seen_text: "outro texto" }))).toMatch(/mudou enquanto/);
    const v = await decide(ADMIN);
    expect(v).toMatchObject({ status: "aprovada", student_sees: true });
    expect((await correction(ANA, ID)).update_note).toBe(n.note);
  });

  it("texto mudado pela equipe volta para a revisão e sai do aluno; a carga não passa por cima da nota da equipe; histórico guarda", async () => {
    const atual = (await t.sql<any>(`select note from public.question_update_notes where question_id = $1`, [ID]))[0].note;
    await t.rpc(EDITOR, "app_admin_question_update_note_save", { p_question_id: ID, p_note: atual + " Confira na referência atual." });
    expect((await correction(ANA, ID)).update_note).toBeNull();
    const r = await apply([itemDoProfessor(Q_NOTA, P_NOTA)]);
    expect(r.notas.da_equipe_mantidas).toBe(1);
    const hist = await t.sql<any>(`select changes from public.question_change_log where question_id = $1 and changes ? 'update_note' order by id`, [ID]);
    expect(hist.map((h: any) => [h.changes.update_note.de, h.changes.update_note.para])).toEqual([[null, atual], [atual, atual + " Confira na referência atual."]]);
    expect(await failure(t.rpc(ANA, "app_admin_question_update_note_save", { p_question_id: ID, p_note: "Texto do aluno qualquer." }))).toMatch(/Acesso restrito/);
  });

  it("sem repetir: com as Fontes vinculadas (ramo fontes-vinculadas, c2ad687) e a nota do vínculo aprovada, esta não aparece", async () => {
    // rodada 2: a 9900 já está nas migrações deste ramo (o banco de teste já a tem); colar de novo prova que não estraga nada
    const local = path.join(ROOT, "supabase/migrations/20261003009900_fontes_vinculadas.sql");
    let sql: string;
    if (fs.existsSync(local)) sql = fs.readFileSync(local, "utf8");
    else {
      try {
        sql = execFileSync("git", ["-C", ROOT, "show", "c2ad687:supabase/migrations/20261003009900_fontes_vinculadas.sql"], { encoding: "utf8" });
      } catch {
        return; // ramo ausente nesta cópia: o resto da regra está provado acima
      }
    }
    await t.db.exec(sql);
    const nota = (await t.sql<any>(`select note from public.question_update_notes where question_id = $1`, [ID]))[0].note;
    await t.rpc(ADMIN, "app_admin_question_update_note_decide", { p_question_id: ID, p_decision: "approve", p_note: "Conferi a mudança na fonte vigente.", p_seen_text: nota });
    expect((await correction(ANA, ID)).update_note).toBe(nota);
    // fonte real do catálogo (cab-29-rastreamento-2010) e trecho LITERAL do enunciado (sem página inventada), como nos testes daquele ramo
    const [{ id: src }] = await t.sql<any>(`insert into public.ch_sources (title, organ, kind, status, version, url, audience) values ($1, $2, 'final', 'current', $3, $4, 'oficial') returning id`,
      ["Rastreamento (Cadernos de Atenção Primária, nº 29)", "Ministério da Saúde (Secretaria de Atenção à Saúde, Departamento de Atenção Básica)",
        "1ª edição, 2010; Série A. Normas e Manuais Técnicos; ISBN 978-85-334-1729-8; 97 páginas", "https://bvsms.saude.gov.br/bvs/publicacoes/caderno_atencao_primaria_29_rastreamento.pdf"]);
    const quote = Q_NOTA.statement.slice(0, 120);
    const [{ id: link }] = await t.sql<any>(`insert into public.question_source_links (question_id, source_id, role, temporal, section, quote, status, origin, update_note) values ($1, $2, 'conduta', 'vigente', 'Enunciado da questão', $3, 'em_revisao', 'importacao', $4) returning id`,
      [ID, src, quote, nota]);
    expect((await correction(ANA, ID)).update_note).toBe(nota); // vínculo ainda não confirmado: vale a desta carga
    await t.rpc(ADMIN, "app_admin_question_source_link_confirm", { p_link_id: link });
    expect((await correction(ANA, ID)).update_note).toBeNull(); // o quadro "Fontes vinculadas" já mostra
    expect((await t.rpc<any>(ADMIN, "app_admin_question_update_note", { p_question_id: ID })).hidden_reason).toMatch(/Fontes vinculadas/);
  });

  it("a fila do revisor mostra a nota esperando decisão, e apagar a questão com nota não dá erro", async () => {
    await t.rpc(EDITOR, "app_admin_question_update_note_save", { p_question_id: ID, p_note: "Nota nova da equipe para conferir." });
    const fila = await t.rpc<any>(ADMIN, "app_admin_comment_review_queue", { p_filters: { exam_id: "revalida-2021" } });
    expect(fila.items.find((i: any) => i.id === ID)).toMatchObject({ note_pending: true, campos: [] });
    await t.sql(`delete from public.question_attempts where question_id = $1`, [ID]); // (questão respondida não se apaga; aqui só a nota importa)
    await t.sql(`delete from public.questions where id = $1`, [ID]);
    expect(await t.sql(`select * from public.question_update_notes where question_id = $1`, [ID])).toEqual([]);
  });
});

describe("aluno e visitante sem acesso novo", () => {
  it("não leem a tabela da nota, não chamam a carga nem a regra B, nem as funções da equipe", async () => {
    for (const uid of [ANA, null]) {
      expect(await failure(t.asUser(uid, `select * from public.question_update_notes`))).toMatch(/permission denied/);
      expect(await failure(t.asUser(uid, `select public.question_explanations_apply('[]'::jsonb, 'x')`))).toMatch(/permission denied/);
      expect(await failure(t.asUser(uid, `select public.question_explanations_release('[]'::jsonb, 'x')`))).toMatch(/permission denied/);
      expect(await failure(t.asUser(uid, `select public.question_update_note_visible('x')`))).toMatch(/permission denied/);
    }
    for (const fn of ["app_admin_comment_review_exams()", "app_admin_comment_review_exam(text)", "app_admin_comment_review_approve_exam(text,text,text)",
      "app_admin_question_update_note(text)", "app_admin_question_update_note_save(text,text)", "app_admin_question_update_note_decide(text,text,text,text)"]) {
      const [p] = await t.sql<any>(`select has_function_privilege('anon', $1::regprocedure, 'execute') a, has_function_privilege('authenticated', $1::regprocedure, 'execute') u`, [`public.${fn}`]);
      expect(p, fn).toEqual({ a: false, u: true });
    }
    // mesmo a equipe logada não roda a carga pelo app (só o editor SQL do dono)
    expect(await failure(t.asUser(ADMIN, `select public.question_explanations_apply('[]'::jsonb, 'x')`))).toMatch(/permission denied/);
    // a correção de questão não respondida continua fechada
    expect(await correction(BIA, "enamed_2025_q041")).toBeNull();
  });

  it("a conferência da revisão de comentários continua valendo e a estrutura pode ser colada de novo sem mudar nada", async () => {
    expect(await t.rpc<any>(ADMIN, "app_question_comment_check")).toEqual({ ok: true, faltando: [] });
    const fns = async () => JSON.stringify(await t.sql(`select p.oid::regprocedure::text s, md5(pg_get_functiondef(p.oid)) h, p.proacl::text acl from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`));
    const antes = await fns();
    const dados = JSON.stringify(await t.sql(`select * from public.questions order by id`));
    const f = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003009920_carga_explicacoes.sql"), "utf8");
    await t.db.exec(f);
    await t.db.exec(f);
    // a 9990 (portão de atualidade) redefine app_admin_comment_review_approve_exam e a 010500 (tela de questão no modelo) redefine a correção do
    // aluno, as duas por cima da 9920: colar a 9920 de novo pede colar a 9990 e a 010500 depois (e a 013120, editor profissional nas
    // questões, que redefine a correção do aluno por cima da 010500); a 9990 também devolve ao app o draft_approval_blockers, que
    // a 010900 fecha de novo
    for (const depois of ["20261003009990_portao_atualidade.sql", "20261003010500_tela_questao_modelo.sql", "20261003010900_fecha_draft_approval_blockers.sql", "20261003013120_editor_pro_questoes.sql"]) await t.db.exec(fs.readFileSync(path.join(ROOT, "supabase/migrations", depois), "utf8"));
    expect(await fns()).toBe(antes);
    expect(JSON.stringify(await t.sql(`select * from public.questions order by id`))).toBe(dados);
  });
});
