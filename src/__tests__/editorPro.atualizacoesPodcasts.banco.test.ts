// @vitest-environment node
/**
 * Editor profissional nas Atualizações (013130) e nos Podcasts (013140), no banco (PGlite).
 * Montado na ORDEM DE PRODUÇÃO: todas as migrações (inclusive a 013200, que já está no ar) e só depois a 013130 e a 013140.
 * Provas do brief: (1) só formatação não derruba; (2) conteúdo derruba; (3) o aluno não recebe formatação de campo que ainda não
 * pode ver; (4) atualização antiga sem formatação → respostas idênticas às de antes. Podcasts: salvar o roteiro sem mudar as falas
 * mantém aprovação e áudio; mudando, derruba. E: colar a 013200 de novo depois não muda nada; conferir dá OK; desfazer volta o banco;
 * colar duas vezes não muda nada; a ordem numérica (a dos outros testes) dá o mesmo banco.
 */
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN, ALUNO, EDITOR, REVISOR, asUserFor, criarUsuarios, rpcFor, sqlFor, type AsUser, type Rpc, type Sql } from "./helpers/publicacaoCentral";
import { ricoDoCampo } from "../shared/atualizacoes/formatacao";

const ROOT = path.resolve(__dirname, "../..");
const MIG = path.join(ROOT, "supabase/migrations");
const SQL = "/Volumes/StaziaMed/.tmp-aulas/editor-pro/sql";
const ler = (p: string) => fs.readFileSync(p, "utf8");
const M130 = "20261003013130_editor_pro_atualizacoes.sql";
const M140 = "20261003013140_editor_pro_podcasts.sql";
const M200 = "20261003013200_atualizacoes_treino_sem_gabarito.sql";
const todas = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql") && !f.startsWith("._")).sort();

async function montar(pular: string[]) {
  const db = new PGlite();
  await db.exec(ler(path.join(ROOT, "supabase/tests/bootstrap.sql")));
  for (const f of todas) if (!pular.includes(f)) await db.exec(ler(path.join(MIG, f)));
  return db;
}

async function retrato(db: PGlite) {
  const q = async (s: string) => (await db.query<Record<string, string>>(s)).rows.map((r) => Object.values(r).join(" | "));
  return {
    funcoes: await q(`select p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid)), coalesce(array_to_string(p.proacl, ','), '')
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' order by 1`),
    colunas: await q(`select table_name, column_name, data_type, coalesce(column_default, '') from information_schema.columns
                        where table_schema = 'public' and table_name in ('guideline_updates', 'podcasts') order by 1, 2`),
    gatilhos: await q(`select c.relname, t.tgname, md5(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                        join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal order by 1, 2`),
    regras: await q(`select conrelid::regclass::text, conname, md5(pg_get_constraintdef(oid)) from pg_constraint
                      where connamespace = 'public'::regnamespace order by 1, 2`),
    privilegios: await q(`select table_name, column_name, grantee, privilege_type from information_schema.column_privileges
                           where table_schema = 'public' and table_name = 'guideline_updates' and grantee in ('anon', 'authenticated') order by 1, 2, 3, 4`),
  };
}

const negrito = (t: string) => ({ f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t, marks: [{ type: "bold" }] }] }] } });
const comLink = (t: string) => ({ f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t, marks: [{ type: "link", attrs: { href: "https://www.gov.br/saude" } }] }] }] } });

const QUESTAO = {
  statement: "Mulher de 34 anos com DNA-HPV positivo para o tipo 16 e citologia sem atipias. Qual é a conduta?",
  options: [
    { id: "A", text: "Repetir o teste em 12 meses.", justification: "JUSTIFICATIVA-A-SECRETA" },
    { id: "B", text: "Colposcopia imediata.", justification: "JUSTIFICATIVA-B-SECRETA" },
    { id: "C", text: "Repetir a citologia em 6 meses.", justification: "JUSTIFICATIVA-C-SECRETA" },
    { id: "D", text: "Imiquimode e reavaliar.", justification: "JUSTIFICATIVA-D-SECRETA" },
  ],
  answer: "B",
  commentary: "COMENTARIO-SECRETO: HPV 16 ou 18 impõe colposcopia.",
};
const SLUGS = ["fmt-a", "fmt-b", "fmt-c", "fmt-antiga", "fmt-rascunho"];
const ROTEIRO = { lines: [{ speaker: "ANA", text: "Bom dia, hoje é bronquiolite.", style: "calma", sources: ["t1"] }, { speaker: "BRUNO", text: "Vamos ao que mudou.", style: "", sources: [] }], missing: [] };

let db: PGlite;
let sql: Sql;
let rpc: Rpc;
let asUser: AsUser;
let antes: Awaited<ReturnType<typeof retrato>>;
let depois: Awaited<ReturnType<typeof retrato>>;
const respostasAntes: Record<string, unknown> = {};
let PODCAST = "";

const semData = (x: any) => JSON.parse(JSON.stringify(x, (k, v) => (k === "updated_at" ? undefined : v)));
const item = async (slug: string) => (await rpc<any>(ADMIN, "app_admin_guideline_updates")).items.find((u: any) => u.slug === slug);
const linha = async (slug: string) => (await sql(`select * from public.guideline_updates where slug = $1`, [slug]))[0];
// o que a tela manda: o item como veio da lista da equipe (mesmo texto) e, se for o caso, a formatação
const salvar = async (slug: string, extra: Record<string, unknown> = {}) => rpc<any>(ADMIN, "app_admin_save_guideline_update", { p_update: { ...(await item(slug)), ...extra } });

async function fotografar() {
  const r: Record<string, unknown> = {};
  for (const s of SLUGS) {
    r[`aluno:${s}`] = await rpc(ALUNO, "app_guideline_update", { p_slug: s });
    r[`equipe:${s}`] = await rpc(ADMIN, "app_guideline_update", { p_slug: s });
  }
  r.lista = await rpc(ALUNO, "app_guideline_updates");
  r.admin = await rpc(ADMIN, "app_admin_guideline_updates");
  r.correcao = await rpc(ALUNO, "app_guideline_practice_check", { p_slug: "fmt-antiga", p_index: 0, p_selected: "A" });
  return r;
}

beforeAll(async () => {
  db = await montar([M130, M140]);
  sql = sqlFor(db);
  rpc = rpcFor(db);
  asUser = asUserFor(db);
  await criarUsuarios(sql);
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'GINECOLOGIA_OBSTETRICIA') on conflict do nothing`, [REVISOR]);
  for (const s of SLUGS) {
    await sql(
      `insert into public.guideline_updates (slug, area, topic, years, before_text, current_conduct, exam_impact, trap, timeline, flashcards, practice_questions,
         review_status, source_url, source_checked_at, reviewed_by, reviewed_at, published)
       values ($1, 'GINECOLOGIA_OBSTETRICIA', 'Rastreamento do colo ' || $1, '{2024,2025}', 'Citologia a cada 3 anos.', 'DNA-HPV a cada 5 anos.', 'Cai como caso clínico.',
         'Citologia anual.', $2::jsonb, $3::jsonb, $4::jsonb, 'approved', 'https://www.gov.br/saude/x.pdf', now(), $5, now(), $6)`,
      [s, JSON.stringify([{ year: 2024, text: "Antes." }, { year: 2025, text: "Mudou." }]), JSON.stringify([{ front: "Qual é o teste?", back: "DNA-HPV." }]),
        JSON.stringify([QUESTAO]), ADMIN, s !== "fmt-rascunho"],
    );
  }
  const [{ id }] = await sql(
    `insert into public.podcasts (title, topic, status, script, approved_by, approved_at, approval_note, audio_path, audio_bytes, audio_seconds)
     values ('Bronquiolite em 8 minutos', 'Bronquiolite', 'audio_ready', $1::jsonb, $2, now(), 'Conferi tudo nas fontes.', 'podcasts/x/audio-a.mp3', 1000, 480) returning id`,
    [JSON.stringify(ROTEIRO), ADMIN],
  );
  PODCAST = id;
  // ANTES da 013130: respostas de hoje e um salvar sem mudança (para comparar depois)
  respostasAntes.salvar = semData(await salvar("fmt-antiga"));
  Object.assign(respostasAntes, await fotografar());
  antes = await retrato(db);
  // ordem de produção: a 013200 já está no ar; a 013130 e a 013140 entram depois
  await db.exec(ler(path.join(MIG, M130)));
  await db.exec(ler(path.join(MIG, M140)));
  depois = await retrato(db);
}, 600_000);

afterAll(async () => {
  await db?.close();
});

describe("(4) atualização antiga sem formatação: tudo idêntico ao de antes", () => {
  it("detalhe (aluno e equipe), lista, painel da equipe e correção dão a mesma resposta", async () => {
    const agora = await fotografar();
    for (const k of Object.keys(agora)) expect(agora[k], k).toEqual(respostasAntes[k]);
  });

  it("salvar sem mudar nada: mesma resposta, continua conferida e no ar", async () => {
    expect(semData(await salvar("fmt-antiga"))).toEqual(respostasAntes.salvar);
    expect(await linha("fmt-antiga")).toMatchObject({ review_status: "approved", published: true, formatacao: null });
  });

  it("sem formatação, as funções novas do aluno respondem null", async () => {
    expect(await rpc(ALUNO, "app_guideline_update_formatacao", { p_slug: "fmt-antiga" })).toBeNull();
    expect(await rpc(ALUNO, "app_guideline_practice_formatacao", { p_slug: "fmt-antiga", p_index: 0, p_selected: "A" })).toBeNull();
  });
});

const FORMATACAO = {
  before_text: negrito("Citologia a cada 3 anos."),
  "timeline.1": negrito("Mudou."),
  "flashcard.0.verso": negrito("DNA-HPV."),
  "questao.0.enunciado": negrito(QUESTAO.statement),
  "questao.0.alt.B": negrito("Colposcopia imediata."),
  "questao.0.justificativa.A": negrito("JUSTIFICATIVA-A-SECRETA"),
  "questao.0.comentario": negrito(QUESTAO.commentary),
};

describe("(1) só formatação não derruba a conferência nem tira do ar", () => {
  it("negrito em vários campos: grava, continua conferida e publicada; o registro diz que foi só formatação", async () => {
    const antesDe = await linha("fmt-a");
    const r = await salvar("fmt-a", { formatacao: FORMATACAO });
    expect(r.review_status).toBe("approved");
    expect(r.formatacao).toEqual(FORMATACAO);
    const depoisDe = await linha("fmt-a");
    expect(depoisDe).toMatchObject({ review_status: "approved", published: true, formatacao: FORMATACAO });
    expect(depoisDe.reviewed_by).toBe(antesDe.reviewed_by);
    expect(depoisDe.reviewed_at).toEqual(antesDe.reviewed_at);
    const [log] = await sql(`select details from public.ch_audit where action = 'guideline_update.save' and target = $1 order by id desc limit 1`, [depoisDe.id]);
    expect(log.details).toMatchObject({ review_reset: false, unpublished: false, so_formatacao: true });
    // a equipe vê a formatação inteira na lista
    expect((await item("fmt-a")).formatacao).toEqual(FORMATACAO);
  });

  it("sem a chave no pedido, a formatação gravada fica; null apaga (e continua sem derrubar)", async () => {
    await salvar("fmt-a", { formatacao: undefined });
    expect((await linha("fmt-a")).formatacao).toEqual(FORMATACAO);
    const it2 = await item("fmt-a");
    delete it2.formatacao;
    await rpc(ADMIN, "app_admin_save_guideline_update", { p_update: it2 });
    expect((await linha("fmt-a")).formatacao).toEqual(FORMATACAO);
    await salvar("fmt-c", { formatacao: { trap: negrito("Citologia anual.") } });
    await salvar("fmt-c", { formatacao: null });
    expect(await linha("fmt-c")).toMatchObject({ formatacao: null, review_status: "approved", published: true });
  });

  it("forma inválida ou mais de 64 campos: recusa com mensagem em português", async () => {
    await expect(salvar("fmt-c", { formatacao: { trap: { f: "html", v: 1, doc: {} } } })).rejects.toThrow(/Formatação inválida/);
    const muitos = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`campo${i}`, negrito("x")]));
    await expect(salvar("fmt-c", { formatacao: muitos })).rejects.toThrow(/até 64 campos/);
  });
});

describe("(2) conteúdo derruba como hoje", () => {
  it("mudar o texto (mesmo com formatação junto): volta a pendente e sai do ar", async () => {
    await salvar("fmt-b", { current_conduct: "DNA-HPV a cada 5 anos, dos 25 aos 64.", formatacao: { current_conduct: negrito("DNA-HPV a cada 5 anos, dos 25 aos 64.") } });
    expect(await linha("fmt-b")).toMatchObject({ review_status: "pending", published: false, reviewed_by: null });
  });

  it("formatação que traz conteúdo (link) com o mesmo texto: também derruba", async () => {
    await salvar("fmt-c", { formatacao: { before_text: comLink("Citologia a cada 3 anos.") } });
    expect(await linha("fmt-c")).toMatchObject({ review_status: "pending", published: false });
  });
});

describe("(3) o aluno recebe só a formatação dos campos que ele já pode ver", () => {
  const SEGREDOS = /SECRETA|COMENTARIO-SECRETO|justificativa|comentario/;

  it("detalhe: sem justificativas nem comentário; o mesmo para equipe e revisor nesta função", async () => {
    for (const uid of [ALUNO, ADMIN, EDITOR, REVISOR]) {
      const f = await rpc<any>(uid, "app_guideline_update_formatacao", { p_slug: "fmt-a" });
      expect(Object.keys(f).sort()).toEqual(["before_text", "flashcard.0.verso", "questao.0.alt.B", "questao.0.enunciado", "timeline.1"]);
      expect(JSON.stringify(f)).not.toMatch(SEGREDOS);
    }
  });

  it("as funções da 013200 continuam sem formatação e sem gabarito (não foram mexidas)", async () => {
    const d = await rpc<any>(ALUNO, "app_guideline_update", { p_slug: "fmt-a" });
    expect("formatacao" in d).toBe(false);
    expect(JSON.stringify(d)).not.toMatch(/SECRETA|COMENTARIO-SECRETO|"answer"/);
    const c = await rpc<any>(ALUNO, "app_guideline_practice_check", { p_slug: "fmt-a", p_index: 0, p_selected: "A" });
    expect("formatacao" in c).toBe(false);
  });

  it("correção: só com uma resposta válida, e só as justificativas e o comentário daquela questão", async () => {
    expect(await rpc(ALUNO, "app_guideline_practice_formatacao", { p_slug: "fmt-a", p_index: 0, p_selected: "c" })).toEqual({
      "questao.0.justificativa.A": FORMATACAO["questao.0.justificativa.A"],
      "questao.0.comentario": FORMATACAO["questao.0.comentario"],
    });
    for (const sel of [null, "", "E"]) {
      await expect(rpc(ALUNO, "app_guideline_practice_formatacao", { p_slug: "fmt-a", p_index: 0, p_selected: sel })).rejects.toThrow(/Marque uma das alternativas/);
    }
    for (const i of [-1, 1, null]) {
      await expect(rpc(ALUNO, "app_guideline_practice_formatacao", { p_slug: "fmt-a", p_index: i, p_selected: "A" })).rejects.toThrow(/não encontrada/);
    }
  });

  it("fora do ar, sem login ou lendo a tabela direto: nada", async () => {
    await sql(`update public.guideline_updates set formatacao = $1::jsonb where slug = 'fmt-rascunho'`, [JSON.stringify({ trap: negrito("Citologia anual.") })]);
    expect(await rpc(ALUNO, "app_guideline_update_formatacao", { p_slug: "fmt-rascunho" })).toBeNull();
    await expect(rpc(ALUNO, "app_guideline_practice_formatacao", { p_slug: "fmt-rascunho", p_index: 0, p_selected: "A" })).rejects.toThrow(/não encontrada/);
    expect(await rpc(REVISOR, "app_guideline_update_formatacao", { p_slug: "fmt-rascunho" })).toEqual({ trap: negrito("Citologia anual.") });
    await expect(rpc(null, "app_guideline_update_formatacao", { p_slug: "fmt-a" })).rejects.toThrow(/permission denied/);
    await expect(rpc(null, "app_guideline_practice_formatacao", { p_slug: "fmt-a", p_index: 0, p_selected: "A" })).rejects.toThrow(/permission denied/);
    await expect(asUser(ALUNO, `select formatacao from public.guideline_updates`)).rejects.toThrow(/permission denied/);
    await expect(asUser(ALUNO, `select public.guideline_formatacao_textos(u) from public.guideline_updates u`)).rejects.toThrow(/permission denied/);
  });

  it("índice trocado (rico de outro texto): a tela descarta sozinha (projeção não bate)", async () => {
    const f = await rpc<any>(ALUNO, "app_guideline_update_formatacao", { p_slug: "fmt-a" });
    expect(ricoDoCampo(f, "timeline.1", "Mudou.")).not.toBeNull();
    expect(ricoDoCampo({ "timeline.0": f["timeline.1"] }, "timeline.0", "Antes.")).toBeNull();
  });

  it("a guarda de fonte complementar também olha a coluna nova; a checagem geral continua ok", async () => {
    const [{ c }] = await sql(`select count(*)::int as c from pg_trigger where tgname = 'guideline_updates_guard_complementar_rico'`);
    expect(c).toBe(1);
    expect(await rpc(ADMIN, "app_ch_complementar_check")).toEqual({ ok: true, faltando: [] });
  });
});

describe("Podcasts (013140): salvar o roteiro", () => {
  const ep = async () => (await sql(`select status, approved_at, approval_note, audio_path, script from public.podcasts where id = $1`, [PODCAST]))[0];
  const liberados = async () => (await sql(`select count(*)::int as n from public.podcast_files_released where storage_path = 'podcasts/x/audio-a.mp3'`))[0].n;

  it("sem mudar as falas (só espaço nas pontas): aprovação, áudio e status ficam", async () => {
    const antesDe = await ep();
    const lines = ROTEIRO.lines.map((l) => ({ ...l, text: `  ${l.text} ` }));
    await rpc(ADMIN, "app_admin_podcast_save_script", { p_id: PODCAST, p_script: { lines, missing: [] } });
    expect(await ep()).toEqual(antesDe);
    expect(await liberados()).toBe(0);
  });

  it("mudando uma fala: tira a aprovação e o áudio, como antes", async () => {
    const lines = ROTEIRO.lines.map((l, i) => (i === 1 ? { ...l, text: "Vamos ao que mudou em 2025." } : l));
    await rpc(ADMIN, "app_admin_podcast_save_script", { p_id: PODCAST, p_script: { lines, missing: [] } });
    expect(await ep()).toMatchObject({ status: "script_ready", approved_at: null, approval_note: null, audio_path: null });
    expect((await ep()).script.lines[1].text).toBe("Vamos ao que mudou em 2025.");
    expect(await liberados()).toBe(1);
  });
});

describe("Publicação: ordem, conferir, desfazer e colar de novo", () => {
  it("colar a 013200 de novo depois (ordem de produção) não muda nada", async () => {
    const antesDe = await fotografar();
    await db.exec(ler(path.join(MIG, M200)));
    expect(await retrato(db)).toEqual(depois);
    expect(await fotografar()).toEqual(antesDe);
    expect(Object.keys(await rpc<any>(ALUNO, "app_guideline_update_formatacao", { p_slug: "fmt-a" }))).not.toContain("questao.0.comentario");
  });

  it("conferir: tudo ok", async () => {
    const r130 = (await db.query<{ item: string; ok: boolean }>(ler(`${SQL}/013130-conferir.sql`))).rows;
    expect(r130.length).toBeGreaterThan(10);
    for (const r of r130) expect(r.ok, r.item).toBe(true);
    const [r140] = (await db.query<Record<string, boolean>>(ler(`${SQL}/013140-conferir.sql`))).rows;
    expect(Object.values(r140).every(Boolean)).toBe(true);
  });

  it("desfazer volta o banco de antes; colar duas vezes dá o mesmo banco de depois", async () => {
    await db.exec(ler(`${SQL}/013140-desfazer.sql`));
    await db.exec(ler(`${SQL}/013130-desfazer.sql`));
    expect(await retrato(db)).toEqual(antes);
    for (let i = 0; i < 2; i++) {
      await db.exec(ler(path.join(MIG, M130)));
      await db.exec(ler(path.join(MIG, M140)));
    }
    expect(await retrato(db)).toEqual(depois);
  });

  it("a ordem numérica (a dos outros testes) dá o mesmo banco que a de produção", async () => {
    await db.close();
    db = await montar([]);
    expect(await retrato(db)).toEqual(depois);
  }, 600_000);
});
