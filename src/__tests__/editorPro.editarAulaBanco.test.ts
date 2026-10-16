// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { abrirBanco, ADMIN, ALUNO, EDITOR, type Rpc, type Sql } from "./helpers/publicacaoCentral";
import { resumoSoFormatacao } from "../shared/docRico/modulos/editarAula";

let db: PGlite;
let sql: Sql;
let rpc: Rpc;
let aulaId: string;

const envelopeValido = {
  f: "sdoc",
  v: 1,
  doc: {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 4 },
        content: [{ type: "text", text: "Resumo" }],
      },
    ],
  },
};
const summaryValido = "### Resumo";

beforeAll(async () => {
  ({ db, sql, rpc } = await abrirBanco());
}, 300_000);

describe("Editor Profissional - Banco de Dados (M13 - summary_rico)", () => {
  it("1. aula antiga sem rico: chave summary_rico ausente para o aluno, no lesson_view e no catálogo app_lessons", async () => {
    const aulaCriada = await rpc(EDITOR, "app_admin_save_lesson", {
      p_lesson: {
        area: "PEDIATRIA",
        topic: "Bronquiolite",
        title: "Bronquiolite viral aguda na infância",
        summary: "Texto clássico do resumo da aula sem rico.",
        key_points: ["Ponto de atenção na conduta"],
        published: true,
        review_note: "Conferido o texto da aula com a equipe médica.",
      },
    });
    aulaId = aulaCriada.id;

    // Aluno pelo app_lesson
    const rAluno = await rpc(ALUNO, "app_lesson", { p_id: aulaId });
    expect("summary_rico" in rAluno).toBe(false);
    expect(rAluno.summary).toBe("Texto clássico do resumo da aula sem rico.");

    // SQL direto com lesson_view
    const [row] = await sql("select public.lesson_view(l) as v from public.lessons l where id = $1", [aulaId]);
    expect("summary_rico" in row.v).toBe(false);

    // Catálogo geral app_lessons
    const catalogo = await rpc(ALUNO, "app_lessons");
    const itemCatalogo = catalogo.lessons.find((l: any) => l.id === aulaId);
    expect(itemCatalogo).toBeDefined();
    expect("summary_rico" in itemCatalogo).toBe(false);
  });

  it("2. salvar com rico: grava com sucesso; equipe (app_admin_lessons) e aluno (app_lesson) recebem summary_rico", async () => {
    await rpc(EDITOR, "app_admin_save_lesson", {
      p_lesson: {
        id: aulaId,
        area: "PEDIATRIA",
        topic: "Bronquiolite",
        title: "Bronquiolite viral aguda na infância",
        summary: summaryValido,
        summary_rico: envelopeValido,
        key_points: ["Ponto de atenção na conduta"],
        published: true,
        review_note: "Conferido o resumo formatado com a equipe médica.",
      },
    });

    // Equipe médica via app_admin_lessons
    const admin = await rpc(EDITOR, "app_admin_lessons");
    const itemAdmin = admin.lessons.find((l: any) => l.id === aulaId);
    expect(itemAdmin).toBeDefined();
    expect(itemAdmin.summary_rico).toEqual(envelopeValido);

    // Aluno via app_lesson
    const rAluno = await rpc(ALUNO, "app_lesson", { p_id: aulaId });
    expect(rAluno.summary_rico).toEqual(envelopeValido);
    expect(rAluno.summary).toBe(summaryValido);
  });

  it("3. mudança no rico que conta como conteúdo (atributo fora da lista de formatação) em aula publicada: sem review_note falha; com review_note passa", async () => {
    const envelopeAlterado = {
      f: "sdoc",
      v: 1,
      doc: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 4, id: "sub-1" },
            content: [{ type: "text", text: "Resumo" }],
          },
        ],
      },
    };

    // Tentativa sem nota de conferência (ou menor que 10 caracteres)
    await expect(
      rpc(EDITOR, "app_admin_save_lesson", {
        p_lesson: {
          id: aulaId,
          area: "PEDIATRIA",
          topic: "Bronquiolite",
          title: "Bronquiolite viral aguda na infância",
          summary: summaryValido,
          summary_rico: envelopeAlterado,
          key_points: ["Ponto de atenção na conduta"],
          published: true,
          review_note: "",
        },
      })
    ).rejects.toThrow(/registre o que foi conferido/);

    // Com review_note preenchido de forma adequada (>= 10 caracteres)
    const atualizado = await rpc(EDITOR, "app_admin_save_lesson", {
      p_lesson: {
        id: aulaId,
        area: "PEDIATRIA",
        topic: "Bronquiolite",
        title: "Bronquiolite viral aguda na infância",
        summary: summaryValido,
        summary_rico: envelopeAlterado,
        key_points: ["Ponto de atenção na conduta"],
        published: true,
        review_note: "Conferida a nova formatação do resumo da aula.",
      },
    });
    expect(atualizado.summary_rico).toEqual(envelopeAlterado);
  });

  it("4. mudar o summary sem mandar summary_rico anula o rico velho; update direto no SQL ou summary vazio também anulam", async () => {
    // Garante rico ativo no registro
    await sql("update public.lessons set summary = $2, summary_rico = $3::jsonb where id = $1", [
      aulaId,
      summaryValido,
      JSON.stringify(envelopeValido),
    ]);
    const [comRico] = await sql("select summary_rico from public.lessons where id = $1", [aulaId]);
    expect(comRico.summary_rico).not.toBeNull();

    // 4a. Salva via RPC com novo summary e omitindo a chave summary_rico
    await rpc(EDITOR, "app_admin_save_lesson", {
      p_lesson: {
        id: aulaId,
        area: "PEDIATRIA",
        topic: "Bronquiolite",
        title: "Bronquiolite viral aguda na infância",
        summary: "Texto novo de resumo sem chave de rico",
        key_points: ["Ponto de atenção na conduta"],
        published: true,
        review_note: "Conferido novo texto de resumo sem rico.",
      },
    });
    const [posSave] = await sql("select summary, summary_rico from public.lessons where id = $1", [aulaId]);
    expect(posSave.summary).toBe("Texto novo de resumo sem chave de rico");
    expect(posSave.summary_rico).toBeNull();

    // 4b. Restaura rico e altera summary diretamente pelo SQL ('outro')
    await sql("update public.lessons set summary = $2, summary_rico = $3::jsonb where id = $1", [
      aulaId,
      summaryValido,
      JSON.stringify(envelopeValido),
    ]);
    await sql("update public.lessons set summary = 'outro' where id = $1", [aulaId]);
    const [posUpdateSql] = await sql("select summary, summary_rico from public.lessons where id = $1", [aulaId]);
    expect(posUpdateSql.summary).toBe("outro");
    expect(posUpdateSql.summary_rico).toBeNull();

    // 4c. Restaura rico e altera summary para NULL diretamente pelo SQL
    await sql("update public.lessons set summary = $2, summary_rico = $3::jsonb where id = $1", [
      aulaId,
      summaryValido,
      JSON.stringify(envelopeValido),
    ]);
    await sql("update public.lessons set summary = null where id = $1", [aulaId]);
    const [posNullSql] = await sql("select summary, summary_rico from public.lessons where id = $1", [aulaId]);
    expect(posNullSql.summary).toBeNull();
    expect(posNullSql.summary_rico).toBeNull();

    // 4d. Restaura rico e altera summary para '' diretamente pelo SQL
    await sql("update public.lessons set summary = $2, summary_rico = $3::jsonb where id = $1", [
      aulaId,
      summaryValido,
      JSON.stringify(envelopeValido),
    ]);
    await sql("update public.lessons set summary = '' where id = $1", [aulaId]);
    const [posVazioSql] = await sql("select summary, summary_rico from public.lessons where id = $1", [aulaId]);
    expect(posVazioSql.summary).toBe("");
    expect(posVazioSql.summary_rico).toBeNull();
  });

  it("5. forma inválida: summary_rico { f: 'x' } causa erro de validação; string e array gravam como null", async () => {
    // Restaura summary válido
    await sql("update public.lessons set summary = $2 where id = $1", [aulaId, summaryValido]);

    // summary_rico { f: "x" } viola constraint lessons_summary_rico_forma
    await expect(
      rpc(EDITOR, "app_admin_save_lesson", {
        p_lesson: {
          id: aulaId,
          area: "PEDIATRIA",
          topic: "Bronquiolite",
          title: "Bronquiolite viral aguda na infância",
          summary: summaryValido,
          summary_rico: { f: "x" },
          key_points: ["Ponto de atenção na conduta"],
          published: true,
          review_note: "Tentativa com formato rico corrompido.",
        },
      })
    ).rejects.toThrow(/Dados da aula inválidos/);

    // summary_rico como string -> v_rico permanece nulo e salva null sem erro
    const rString = await rpc(EDITOR, "app_admin_save_lesson", {
      p_lesson: {
        id: aulaId,
        area: "PEDIATRIA",
        topic: "Bronquiolite",
        title: "Bronquiolite viral aguda na infância",
        summary: summaryValido,
        summary_rico: "não é um objeto envelope",
        key_points: ["Ponto de atenção na conduta"],
        published: true,
        review_note: "Salvar com string no summary_rico.",
      },
    });
    expect("summary_rico" in rString).toBe(false);
    const [rowString] = await sql("select summary_rico from public.lessons where id = $1", [aulaId]);
    expect(rowString.summary_rico).toBeNull();

    // summary_rico como array -> v_rico permanece nulo e salva null sem erro
    const rArray = await rpc(EDITOR, "app_admin_save_lesson", {
      p_lesson: {
        id: aulaId,
        area: "PEDIATRIA",
        topic: "Bronquiolite",
        title: "Bronquiolite viral aguda na infância",
        summary: summaryValido,
        summary_rico: [envelopeValido],
        key_points: ["Ponto de atenção na conduta"],
        published: true,
        review_note: "Salvar com array no summary_rico.",
      },
    });
    expect("summary_rico" in rArray).toBe(false);
    const [rowArray] = await sql("select summary_rico from public.lessons where id = $1", [aulaId]);
    expect(rowArray.summary_rico).toBeNull();
  });

  it("6. aula da Central: alteração de summary_rico é bloqueada pela trava da Central de Conteúdo", async () => {
    // Garante unidade da Central para satisfazer lessons_central_check ((origin = 'central') = (ch_unit_id is not null))
    const [node] = await sql("select id from public.ch_taxonomy_nodes limit 1");
    const [unit] = await sql(
      "insert into public.ch_units (theme_node_id, title) values ($1, 'Unidade Central de Teste') returning id",
      [node.id]
    );

    // Permite inserção com origin central usando app.ch_distribute = 'on'
    await sql("select set_config('app.ch_distribute', 'on', false)");
    const [centralLesson] = await sql(
      `insert into public.lessons (area, topic, title, origin, ch_unit_id, summary)
       values ('PEDIATRIA', 'Tema Central', 'Aula da Central de Teste', 'central', $1, 'Resumo da Central')
       returning id`,
      [unit.id]
    );
    await sql("select set_config('app.ch_distribute', '', false)");

    // Tentativa de atualizar summary_rico fora da distribuição falha pelo gatilho lessons_summary_rico_guard
    await expect(
      sql("update public.lessons set summary_rico = $2::jsonb where id = $1", [
        centralLesson.id,
        JSON.stringify(envelopeValido),
      ])
    ).rejects.toThrow(/Central de Conteúdo/);
  });

  it("6b. fonte complementar: a equipe não grava rico que cita a apostila; texto antigo que cita some do aluno junto com o rico", async () => {
    const TITULO = "Sangue nos Olhos — Pediatria M13";
    const fonte = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level) values ($1, 'Editora Sangue nos Olhos Ltda', 'final', 'https://apostilas.sno-exemplo.invalid/m13.pdf', '2026', 'A') returning id`, [TITULO]))[0].id;
    await rpc(ADMIN, "app_ch_set_source_audience", { p_source_id: fonte, p_audience: "complementar", p_reason: "Apostila" });
    const ricoCita = { f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: `Segundo o ${TITULO}` }] }] } };
    // equipe salvando pelo app: barrada (mesma guarda do texto)
    await expect(rpc(EDITOR, "app_admin_save_lesson", { p_lesson: {
      area: "PEDIATRIA", topic: "Bronquiolite", title: "Aula M13 com apostila", summary: "### Resumo limpo", summary_rico: ricoCita, key_points: ["Ponto"], published: false,
    } })).rejects.toThrow(/fonte complementar/);
    // dado antigo gravado por dentro (sem login, só aviso): o aluno não recebe nem o texto nem o rico; a equipe recebe os dois
    const id = (await sql(`insert into public.lessons (area, topic, title, summary, summary_rico, key_points, published) values ('PEDIATRIA', 'Bronquiolite', 'Aula M13 antiga', $1, $2::jsonb, '{}', true) returning id`,
      [`### Segundo o ${TITULO}`, JSON.stringify(ricoCita)]))[0].id;
    const aluno = await rpc(ALUNO, "app_lesson", { p_id: id });
    expect(aluno.summary ?? null).toBeNull();
    expect("summary_rico" in aluno).toBe(false);
    expect(JSON.stringify(aluno)).not.toContain("Sangue nos Olhos");
    const equipe = (await rpc(EDITOR, "app_admin_lessons")).lessons.find((l: any) => l.id === id);
    expect(equipe.summary_rico).toEqual(ricoCita);
  });

  describe("só formatação × conteúdo do resumo (banco e tela dão a mesma resposta; regra da 013080)", () => {
    const L = "Febre e [guia](https://www.gov.br/saude) hoje";
    const txt = (t: string, marks?: any[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
    const link = { type: "link", attrs: { href: "https://www.gov.br/saude" } };
    const env = (content: any[]) => ({ f: "sdoc", v: 1, doc: { type: "doc", content } });
    const par = (inline: any[], attrs?: any) => env([{ type: "paragraph", ...(attrs ? { attrs } : {}), content: inline }]);
    const negrito = par([txt("Febre", [{ type: "bold" }]), txt(" e "), txt("guia", [link]), txt(" hoje")]);
    const corEAlinhado = par([txt("Febre", [{ type: "bold" }, { type: "textStyle", attrs: { color: "#ff0000" } }]), txt(" e "), txt("guia", [link]), txt(" hoje")], { textAlign: "center" });
    const titulo4 = (marks?: any[]) => env([{ type: "heading", attrs: { level: 4 }, content: [txt("Febre e ", marks), txt("guia", [link]), txt(" hoje")] }]);
    type R = { summary: string; summary_rico: any };
    const casos: [string, R, R, boolean][] = [
      ["nada mudou", { summary: L, summary_rico: null }, { summary: L, summary_rico: null }, true],
      ["negrito no rico, mesmo texto e mesmo link", { summary: L, summary_rico: null }, { summary: L, summary_rico: negrito }, true],
      ["cor e alinhamento a mais", { summary: L, summary_rico: negrito }, { summary: L, summary_rico: corEAlinhado }, true],
      ["tirou toda a formatação", { summary: L, summary_rico: corEAlinhado }, { summary: L, summary_rico: null }, true],
      ["título nível 4 que já existia ganhou cor", { summary: L, summary_rico: titulo4() }, { summary: L, summary_rico: titulo4([{ type: "textStyle", attrs: { color: "#0000ff" } }]) }, true],
      ["texto mudou", { summary: L, summary_rico: null }, { summary: "Febre alta e [guia](https://www.gov.br/saude) hoje", summary_rico: null }, false],
      ["texto mudou junto com a formatação", { summary: L, summary_rico: negrito }, { summary: "Febre alta", summary_rico: par([txt("Febre alta", [{ type: "bold" }])]) }, false],
      ["virou título (nível é conteúdo)", { summary: L, summary_rico: null }, { summary: L, summary_rico: titulo4() }, false],
      ["destino do link mudou só no rico", { summary: L, summary_rico: null }, { summary: L, summary_rico: par([txt("Febre e "), txt("guia", [{ type: "link", attrs: { href: "https://outro.gov.br" } }]), txt(" hoje")]) }, false],
      // decisão do dono 16/10 ~16h50 (editor-word b831a235): tachado, sobrescrito e subscrito são só formatação
      ["tachado (só formatação)", { summary: L, summary_rico: null }, { summary: L, summary_rico: par([txt("Febre e "), txt("guia", [link, { type: "strike" }]), txt(" hoje")]) }, true],
      ["sobrescrito (só formatação)", { summary: L, summary_rico: null }, { summary: L, summary_rico: par([txt("Febre", [{ type: "superscript" }]), txt(" e "), txt("guia", [link]), txt(" hoje")]) }, true],
    ];
    const base = (r: R, extra: Record<string, unknown> = {}) => ({ area: "PEDIATRIA", topic: "Febre", title: "Aula M13 formatação", key_points: ["Ponto"], published: true, ...r, ...extra });
    for (const [nome, antes, depois, esperado] of casos) {
      it(`${esperado ? "só formatação" : "conteúdo"}: ${nome}`, async () => {
        expect(resumoSoFormatacao(antes, depois)).toBe(esperado); // a tela
        const criada = await rpc(EDITOR, "app_admin_save_lesson", { p_lesson: base(antes, { review_note: "Conferido o texto antes da formatação." }) });
        const [rev0] = await sql("select reviewed_by, reviewed_at, review_note from public.lesson_reviews where lesson_id = $1", [criada.id]);
        const salvar = rpc(EDITOR, "app_admin_save_lesson", { p_lesson: base(depois, { id: criada.id }) }); // sem "O que você conferiu"
        if (!esperado) {
          await expect(salvar).rejects.toThrow(/registre o que foi conferido/);
          return;
        }
        const salva = await salvar;
        expect(salva.summary_rico ?? null).toEqual(depois.summary_rico);
        const [rev1] = await sql("select reviewed_by, reviewed_at, review_note from public.lesson_reviews where lesson_id = $1", [criada.id]);
        expect(rev1).toEqual(rev0); // a conferência registrada não muda
        const logs = await sql("select actor_id, details from public.admin_audit_log where action = 'lesson.format' and target = $1", [criada.id]);
        expect(logs).toHaveLength(JSON.stringify(antes.summary_rico) === JSON.stringify(depois.summary_rico) ? 0 : 1);
        if (logs.length) expect(logs[0].actor_id).toBe(EDITOR);
      });
    }
  });

  it("7. desfazer e refazer: conferir OK -> desfazer -> conferir FALTA -> refazer duas vezes -> conferir OK", async () => {
    const conferirSql = fs.readFileSync(
      path.join(__dirname, "../../supabase/conferir/editor-pro-resumo-rico.sql"),
      "utf8"
    );
    const desfazerSql = fs.readFileSync(
      path.join(__dirname, "../../supabase/desfazer/20261003013040_editor_pro_resumo_rico.desfazer.sql"),
      "utf8"
    );
    const migracaoSql = fs.readFileSync(
      path.join(__dirname, "../../supabase/migrations/20261003013040_editor_pro_resumo_rico.sql"),
      "utf8"
    );

    // 1. Verificação inicial: conferir começa com "OK:"
    const [conf1] = await sql(conferirSql);
    expect(conf1.resultado).toMatch(/^OK:/);

    // Define texto e garante publicação da aula antes de desfazer a migração
    await sql("update public.lessons set summary = $2, published = true where id = $1", [
      aulaId,
      "Resumo que permanece intacto no aluno",
    ]);

    // 2. Executa o script de desfazer
    await db.exec(desfazerSql);

    // 3. Após desfazer, conferir deve acusar ausência dos objetos com "FALTA:"
    const [conf2] = await sql(conferirSql);
    expect(conf2.resultado).toMatch(/^FALTA:/);

    // 4. A coluna summary_rico foi removida da tabela lessons
    const colunas = await sql(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'lessons' and column_name = 'summary_rico'"
    );
    expect(colunas).toHaveLength(0);

    // 5. app_lesson continua funcionando normalmente para o aluno com summary idêntico
    const rAlunoAposDesfazer = await rpc(ALUNO, "app_lesson", { p_id: aulaId });
    expect(rAlunoAposDesfazer.summary).toBe("Resumo que permanece intacto no aluno");
    expect("summary_rico" in rAlunoAposDesfazer).toBe(false);

    // 6. Rodar o desfazer novamente é idempotente e não lança erro
    await expect(db.exec(desfazerSql)).resolves.not.toThrow();

    // 7. Rodar a migração 013040 duas vezes consecutivas sem erro
    await expect(db.exec(migracaoSql)).resolves.not.toThrow();
    await expect(db.exec(migracaoSql)).resolves.not.toThrow();

    // 8. Após reaplicar a migração, o conferir volta a acusar "OK:"
    const [conf3] = await sql(conferirSql);
    expect(conf3.resultado).toMatch(/^OK:/);
  });
});
