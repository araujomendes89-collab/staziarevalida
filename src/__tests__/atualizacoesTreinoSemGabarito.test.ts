// @vitest-environment node
/**
 * Correção de segurança 013200: a questão de treino de uma Atualização não entrega gabarito, justificativas nem comentário antes de
 * o aluno responder. O detalhe leva só enunciado e alternativas; a correção vem de app_guideline_practice_check, com a letra marcada.
 */
import fs from "fs";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN, ALUNO, EDITOR, REVISOR, abrirBanco, type AsUser, type Rpc, type Sql } from "./helpers/publicacaoCentral";

const ROOT = path.resolve(__dirname, "../..");
const MIG = path.join(ROOT, "supabase/migrations/20261003013200_atualizacoes_treino_sem_gabarito.sql");

const QUESTAO = {
  difficulty: "MEDIO",
  statement: "Mulher de 34 anos com DNA-HPV positivo para o tipo 16 e citologia sem atipias. Qual é a conduta?",
  options: [
    { id: "A", text: "Repetir o teste em 12 meses.", justification: "JUSTIFICATIVA-A-SECRETA", old_protocol_trap: false },
    { id: "B", text: "Colposcopia imediata.", justification: "JUSTIFICATIVA-B-SECRETA", old_protocol_trap: false },
    { id: "C", text: "Repetir a citologia em 6 meses.", justification: "JUSTIFICATIVA-C-SECRETA", old_protocol_trap: true },
    { id: "D", text: "Imiquimode e reavaliar.", justification: "JUSTIFICATIVA-D-SECRETA", old_protocol_trap: false },
  ],
  answer: "B",
  commentary: "COMENTARIO-SECRETO: HPV 16 ou 18 impõe colposcopia.",
};
const SEGREDOS = /SECRETA|COMENTARIO-SECRETO|"answer"|justification|commentary|old_protocol_trap|difficulty|MEDIO/;

let db: Awaited<ReturnType<typeof abrirBanco>>["db"];
let sql: Sql;
let rpc: Rpc;
let asUser: AsUser;

beforeAll(async () => {
  ({ db, sql, rpc, asUser } = await abrirBanco());
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'GINECOLOGIA_OBSTETRICIA') on conflict do nothing`, [REVISOR]);
  for (const [slug, pub] of [["treino-publicada", true], ["treino-rascunho", false]] as const) {
    await sql(
      `insert into public.guideline_updates (slug, area, topic, before_text, current_conduct, practice_questions, review_status, source_url, source_checked_at, reviewed_by, reviewed_at, published)
       values ($1, 'GINECOLOGIA_OBSTETRICIA', 'Rastreamento do colo', 'Antes.', 'Agora.', $2::jsonb, 'approved', 'https://www.gov.br/saude/x.pdf', now(), $3, now(), $4)`,
      [slug, JSON.stringify([QUESTAO, { ...QUESTAO, statement: "Segunda questão de treino, com mais de vinte caracteres.", answer: "C" }]), ADMIN, pub],
    );
  }
}, 300_000);

describe("Antes de responder: nada do gabarito chega ao aluno", () => {
  it("o detalhe leva só o enunciado e as alternativas (letra e texto), na mesma ordem", async () => {
    const d = await rpc(ALUNO, "app_guideline_update", { p_slug: "treino-publicada" });
    expect(d.practice_questions).toEqual([
      { statement: QUESTAO.statement, options: QUESTAO.options.map(({ id, text }) => ({ id, text })) },
      { statement: "Segunda questão de treino, com mais de vinte caracteres.", options: QUESTAO.options.map(({ id, text }) => ({ id, text })) },
    ]);
    expect(JSON.stringify(d)).not.toMatch(SEGREDOS);
  });

  it("nem equipe nem revisor recebem o gabarito pela tela do aluno (a tela é a mesma para todos)", async () => {
    for (const uid of [ADMIN, EDITOR, REVISOR]) {
      expect(JSON.stringify(await rpc(uid, "app_guideline_update", { p_slug: "treino-publicada" }))).not.toMatch(SEGREDOS);
    }
  });

  it("a lista também não leva questões de treino", async () => {
    expect(JSON.stringify(await rpc(ALUNO, "app_guideline_updates"))).not.toMatch(SEGREDOS);
  });

  it("leitura direta da tabela (API REST): a coluna das questões de treino é recusada; as outras continuam", async () => {
    await expect(asUser(ALUNO, `select practice_questions from public.guideline_updates`)).rejects.toThrow(/permission denied/);
    await expect(asUser(ALUNO, `select * from public.guideline_updates`)).rejects.toThrow(/permission denied/);
    expect((await asUser(ALUNO, `select slug from public.guideline_updates`)).map((r: any) => r.slug)).toEqual(["treino-publicada"]);
  });

  it("o painel da equipe continua com a questão inteira (para editar e conferir)", async () => {
    const item = (await rpc(ADMIN, "app_admin_guideline_updates")).items.find((u: any) => u.slug === "treino-publicada");
    expect(item.practice_questions[0]).toMatchObject({ answer: "B", commentary: QUESTAO.commentary });
    expect(item.practice_questions[0].options[2]).toMatchObject({ justification: "JUSTIFICATIVA-C-SECRETA", old_protocol_trap: true });
  });
});

describe("Depois de responder: a correção daquela questão", () => {
  it("errou: gabarito, justificativa de cada alternativa e comentário; sem a marca da pegadinha", async () => {
    const r = await rpc(ALUNO, "app_guideline_practice_check", { p_slug: "treino-publicada", p_index: 0, p_selected: "a" });
    expect(r).toEqual({
      index: 0, selected: "A", answer: "B", correct: false, commentary: QUESTAO.commentary,
      options: QUESTAO.options.map(({ id, justification }) => ({ id, justification })),
    });
  });

  it("acertou a segunda questão: só a correção dela", async () => {
    const r = await rpc(ALUNO, "app_guideline_practice_check", { p_slug: "treino-publicada", p_index: 1, p_selected: "C" });
    expect(r).toMatchObject({ index: 1, answer: "C", correct: true });
  });

  it("sem resposta válida, sem questão ou fora do ar: recusa, sem entregar nada", async () => {
    for (const sel of [null, "", "E", "B; drop"]) {
      await expect(rpc(ALUNO, "app_guideline_practice_check", { p_slug: "treino-publicada", p_index: 0, p_selected: sel })).rejects.toThrow(/Marque uma das alternativas/);
    }
    for (const i of [-1, 2, null]) {
      await expect(rpc(ALUNO, "app_guideline_practice_check", { p_slug: "treino-publicada", p_index: i, p_selected: "A" })).rejects.toThrow(/não encontrada/);
    }
    await expect(rpc(ALUNO, "app_guideline_practice_check", { p_slug: "treino-rascunho", p_index: 0, p_selected: "A" })).rejects.toThrow(/não encontrada/);
    await expect(rpc(ALUNO, "app_guideline_practice_check", { p_slug: "nao-existe", p_index: 0, p_selected: "A" })).rejects.toThrow(/não encontrada/);
    // o revisor (e a equipe) conferem também a que ainda não está no ar
    expect(await rpc(REVISOR, "app_guideline_practice_check", { p_slug: "treino-rascunho", p_index: 0, p_selected: "B" })).toMatchObject({ correct: true });
  });

  it("sem login ninguém chama o detalhe nem a correção", async () => {
    await expect(rpc(null, "app_guideline_practice_check", { p_slug: "treino-publicada", p_index: 0, p_selected: "A" })).rejects.toThrow(/permission denied/);
    await expect(rpc(null, "app_guideline_update", { p_slug: "treino-publicada" })).rejects.toThrow(/permission denied/);
    // função interna: ninguém de fora chama
    await expect(asUser(ALUNO, `select public.guideline_practice_sem_gabarito('[]'::jsonb)`)).rejects.toThrow(/permission denied/);
  });
});

describe("Publicação", () => {
  it("pode ser colada duas vezes e a checagem das fontes complementares continua ok", async () => {
    await db.exec(fs.readFileSync(MIG, "utf8"));
    expect(JSON.stringify(await rpc(ALUNO, "app_guideline_update", { p_slug: "treino-publicada" }))).not.toMatch(SEGREDOS);
    expect(await rpc(ADMIN, "app_ch_complementar_check")).toEqual({ ok: true, faltando: [] });
  });
});
