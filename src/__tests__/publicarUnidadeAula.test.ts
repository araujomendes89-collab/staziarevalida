// @vitest-environment node
/**
 * Grupo B, CC02 etapa 1 (migração 9861): Publicar leva a unidade ao aluno como aula em Estudar > Aulas.
 * Publicação desligada e modo sombra por padrão; só administrador; revisão médica da área sempre; nada interno vai ao aluno.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { abrirBanco, ADMIN, ALUNO, ALUNO2, EDITOR, REVISOR, type Rpc, type Sql } from "./helpers/publicacaoCentral";
import { aprovar, conteudoDaVersao, montarUnidade, preparaBanco, publicar, TEMA_GO, TEMA_PED } from "./helpers/centralUnidades";

let db: PGlite; let sql: Sql; let rpc: Rpc;
const MIGRACAO = path.resolve(__dirname, "../../supabase/migrations/20261003009861_publicar_unidade_aula_aluno.sql");
beforeAll(async () => { ({ db, sql, rpc } = await abrirBanco()); await preparaBanco(sql); }, 240_000);

const proibidos = (claimIds: string[] = []) => [/claim_ids|official_check|scope_note|review_flags|generated_by_model|unverified/i, /claude|gemini|gpt|openai|anthropic|vertex|qwen|ollama|mock/i, /rev83@t\.dev|ed83@t\.dev|adm83@t\.dev/i, ...claimIds.map((c) => new RegExp(c))];
const aulaDoAluno = async (id: string) => (await rpc(ALUNO, "app_lesson", { p_id: id })) as any;
const problemas = async (versao: string) => (await rpc(EDITOR, "app_ch_publish_problems", { p_version_id: versao })) as string[];
const aulaDaUnidade = async (unidade: string) => (await sql(`select * from public.lessons where ch_unit_id = $1`, [unidade]))[0];

describe("Publicação desligada e modo sombra por padrão; só administrador", () => {
  it("de fábrica a publicação está desligada e em modo sombra: Publicar é recusado e nada muda", async () => {
    const u = await montarUnidade(sql, rpc, { titulo: "Padrão de fábrica" });
    await sql(`update public.ch_flags set value = case key when 'publish_enabled' then false when 'shadow_mode' then true else value end`);
    await expect(rpc(ADMIN, "app_ch_publish", { p_version_id: u.versao, p_options: {} })).rejects.toThrow(/Modo sombra ligado/);
    await sql(`update public.ch_flags set value = case key when 'shadow_mode' then false else value end`);
    await expect(rpc(ADMIN, "app_ch_publish", { p_version_id: u.versao, p_options: {} })).rejects.toThrow(/Publicação desligada/);
    await preparaBanco(sql);
    expect((await sql(`select status from public.ch_unit_versions where id = $1`, [u.versao]))[0].status).toBe("approved");
    expect(await aulaDaUnidade(u.unidade)).toBeUndefined();
  });

  it("editor, revisor, aluno e visitante não publicam, não veem a prévia e não retiram", async () => {
    const u = await montarUnidade(sql, rpc, { titulo: "Quem pode publicar" });
    for (const quem of [EDITOR, REVISOR, ALUNO, null]) {
      await expect(rpc(quem, "app_ch_publish", { p_version_id: u.versao, p_options: {} })).rejects.toThrow();
      await expect(rpc(quem, "app_ch_publish_preview", { p_version_id: u.versao })).rejects.toThrow();
      await expect(rpc(quem, "app_ch_retire", { p_version_id: u.versao, p_reason: "teste de permissão" })).rejects.toThrow();
    }
    expect(await aulaDaUnidade(u.unidade)).toBeUndefined();
  });
});

describe("Prévia e publicação", () => {
  it("a prévia mostra a aula como o aluno vai ver e não grava nada", async () => {
    const u = await montarUnidade(sql, rpc, { titulo: "Prévia da pré-eclâmpsia", tema: TEMA_GO, resumo: ["Hipertensão mais proteinúria.", "Tratar com sulfato conforme protocolo."] });
    const antes = (await sql(`select (select count(*)::int from public.lessons) a, (select count(*)::int from public.ch_publications) b, (select status from public.ch_unit_versions where id = $1) s`, [u.versao]))[0];
    const prev = await rpc(ADMIN, "app_ch_publish_preview", { p_version_id: u.versao });
    expect(prev).toMatchObject({ status: "approved", title: "Prévia da pré-eclâmpsia", shadow_mode: false, publish_enabled: true, problems: [], key_points: 2 });
    expect(prev.lesson).toMatchObject({ action: "create", area: "GINECOLOGIA_OBSTETRICIA", area_label: "Gineco & Obstetrícia" });
    expect(prev.student_text).toMatch(/^Material StaziaMed · revisado por médico da área em \d\d\/\d\d\/\d{4} · não é material oficial do Inep/);
    expect(prev.student_text).toMatch(/Fontes oficiais desta aula\n• Ministério da Saúde · Manual Prévia da pré-eclâmpsia · versão 2022 · p\. 112/);
    expect(JSON.stringify(prev.student_text)).not.toMatch(proibidos(u.afirmacao ? [u.afirmacao] : [])[1]);
    const depois = (await sql(`select (select count(*)::int from public.lessons) a, (select count(*)::int from public.ch_publications) b, (select status from public.ch_unit_versions where id = $1) s`, [u.versao]))[0];
    expect(depois).toEqual(antes);
  });

  it("Publicar cria a aula do aluno, ligada à unidade, com texto, pontos-chave, selo e fontes oficiais; o aluno lê, sem nada interno", async () => {
    const u = await montarUnidade(sql, rpc, {
      titulo: "Síndromes hipertensivas na prática", tema: TEMA_GO,
      secoes: [{ heading: "Conceito", paragraphs: ["Pressão elevada na gestação.", "Com proteína na urina."] }, { heading: "Conduta", paragraphs: ["Internar para observação."] }],
      resumo: ["Pressão elevada na gestação.", "Internar para observação."],
    });
    const r = await publicar(rpc, u.versao);
    expect(r.distribution.lesson.action).toBe("create");
    const aula = await aulaDaUnidade(u.unidade);
    expect(aula).toMatchObject({ origin: "central", published: true, area: "GINECOLOGIA_OBSTETRICIA", title: "Síndromes hipertensivas na prática", topic: "Síndromes hipertensivas na gestação", ch_version_id: u.versao });
    expect(aula.key_points).toEqual(["Pressão elevada na gestação.", "Internar para observação."]);
    expect(aula.summary).toContain("Conceito\nPressão elevada na gestação.\n\nCom proteína na urina.\n\nConduta\nInternar para observação.");
    expect(aula.summary).toContain("revisado por médico da área em");
    // o aluno lê pela lista e pela aula
    const lista = await rpc(ALUNO, "app_lessons", { p_area: "GINECOLOGIA_OBSTETRICIA" });
    const vista = lista.lessons.find((l: any) => l.id === aula.id);
    expect(vista).toMatchObject({ title: "Síndromes hipertensivas na prática", published: true });
    expect(vista.key_points).toHaveLength(2);
    const texto = JSON.stringify(await aulaDoAluno(aula.id));
    for (const re of proibidos([u.afirmacao, u.fonte, u.versao])) expect(texto).not.toMatch(re);
    // registro da conferência na tela Aulas (quem conferiu e quando)
    const adm = (await rpc(ADMIN, "app_admin_lessons")).lessons.find((l: any) => l.id === aula.id);
    expect(adm.reviewer).toBeTruthy();
    // a publicação guarda o que foi feito; aluno não lê a tabela
    const [pub] = await sql(`select lesson_id, distribution from public.ch_publications where unit_version_id = $1 and retired_at is null`, [u.versao]);
    expect(pub.lesson_id).toBe(aula.id);
    expect(pub.distribution.lesson).toEqual({ id: aula.id, action: "create" });
  });

  it("a forma antiga (só o número da versão) também publica; a publicação sem revisão médica da área é recusada", async () => {
    const u = await montarUnidade(sql, rpc, { titulo: "Forma antiga de publicar" });
    await rpc(ADMIN, "app_ch_publish", { p_version_id: u.versao });
    expect((await aulaDaUnidade(u.unidade)).published).toBe(true);
    const semRevisao = await montarUnidade(sql, rpc, { titulo: "Sem revisão médica", semAprovar: true });
    await rpc(EDITOR, "app_ch_submit_for_review", { p_version_id: semRevisao.versao });
    await rpc(EDITOR, "app_ch_approve", { p_version_id: semRevisao.versao, p_kind: "editorial" });
    await expect(rpc(ADMIN, "app_ch_publish", { p_version_id: semRevisao.versao, p_options: {} })).rejects.toThrow(/aprovada|aprovação médica/);
    expect(await aulaDaUnidade(semRevisao.unidade)).toBeUndefined();
  });
});

describe("Travas novas no banco", () => {
  it("fonte que não é oficial (apostila nível E ou sem nível) não sustenta a publicação", async () => {
    const e = await montarUnidade(sql, rpc, { titulo: "Fonte nível E", autoridade: "E", semAprovar: true });
    const semNivel = await montarUnidade(sql, rpc, { titulo: "Fonte sem nível", autoridade: null, semAprovar: true });
    for (const u of [e, semNivel]) expect((await problemas(u.versao)).join(" | ")).toMatch(/Afirmação sem fonte oficial vigente \(nível A a D\): /);
    const oficial = await montarUnidade(sql, rpc, { titulo: "Fonte nível B", autoridade: "B", semAprovar: true });
    expect((await problemas(oficial.versao)).join(" | ")).not.toMatch(/fonte oficial vigente/);
  });

  it("fonte substituída ou vencida deixa de valer; área sem correspondente nas Aulas é barrada", async () => {
    const vencida = await montarUnidade(sql, rpc, { titulo: "Fonte vencida", semAprovar: true });
    await sql(`update public.ch_sources set valid_until = current_date - 1 where id = $1`, [vencida.fonte]);
    expect((await problemas(vencida.versao)).join(" | ")).toMatch(/sem fonte oficial vigente/);
    await sql(`insert into public.ch_taxonomy_nodes (version_id, parent_id, level, name) select n.version_id, n.id, 'theme', 'Tema de teste em saúde mental' from public.ch_taxonomy_nodes n where n.name = 'Urgências em saúde mental'`);
    const mental = await montarUnidade(sql, rpc, { titulo: "Saúde mental sem aula", tema: "Tema de teste em saúde mental", semAprovar: true });
    expect((await problemas(mental.versao)).join(" | ")).toMatch(/A área da unidade \(SAUDE_MENTAL\) não tem grande área correspondente nas Aulas do aluno\./);
  });

  it("e-mail ou perfil @ de terceiros no texto, nos pontos-chave ou nos cartões trava a publicação", async () => {
    const a = await montarUnidade(sql, rpc, { titulo: "Contato no texto", secoes: [{ heading: "Conceito", paragraphs: ["Fale com contato@curso-concorrente.com.br para o material."] }], semAprovar: true });
    expect((await problemas(a.versao)).join(" | ")).toMatch(/Contato de terceiros no que vai ao aluno: "contato@curso-concorrente\.com\.br" \(título e texto da aula\)/);
    const b = await montarUnidade(sql, rpc, { titulo: "Contato nos pontos", resumo: ["Siga @cursoconcorrente no Instagram."], semAprovar: true });
    expect((await problemas(b.versao)).join(" | ")).toMatch(/"@cursoconcorrente" \(pontos-chave\)/);
    const c = await montarUnidade(sql, rpc, { titulo: "Contato no cartão", cards: [{ front: "Quem?", back: "Escreva para falecom@outro.com" }], semAprovar: true });
    expect((await problemas(c.versao)).join(" | ")).toMatch(/\(flashcards\)/);
    const ok = await montarUnidade(sql, rpc, { titulo: "Sem contato", semAprovar: true });
    expect((await problemas(ok.versao)).join(" | ")).not.toMatch(/Contato de terceiros/);
  });

  it("nome do arquivo de origem, da editora ou do autor do material estudado trava a publicação", async () => {
    const u = await montarUnidade(sql, rpc, { titulo: "Origem no texto", secoes: [{ heading: "Conceito", paragraphs: ["Segundo a Apostila Medcurso Revalida 2024, a conduta é internar."] }], cards: [{ front: "Quem escreveu?", back: "Editora Concorrente Médica." }], semAprovar: true });
    const doc = await rpc(EDITOR, "app_ch_register_document", { p_doc: { name: "Apostila Medcurso Revalida 2024.pdf", sha256: "a".repeat(64), publisher: "Editora Concorrente Médica", author: "Fulano" } });
    await sql(`update public.ch_claims set document_id = $1 where id = $2`, [doc.id, u.afirmacao]);
    const p = (await problemas(u.versao)).filter((x) => /material de origem/.test(x));
    expect(p.join(" | ")).toMatch(/"Apostila Medcurso Revalida 2024"/);
    expect(p.join(" | ")).toMatch(/"Editora Concorrente Médica"/);
    expect(p.join(" | ")).not.toMatch(/Fulano/); // autor curto (menos de 5 letras) não é procurado
    // o nome das fontes OFICIAIS citadas no fim da aula não conta
    const limpa = await montarUnidade(sql, rpc, { titulo: "Origem limpa", semAprovar: true });
    const doc2 = await rpc(EDITOR, "app_ch_register_document", { p_doc: { name: "Manual Origem limpa.pdf", sha256: "b".repeat(64), publisher: "Editora do Estudo" } });
    await sql(`update public.ch_claims set document_id = $1 where id = $2`, [doc2.id, limpa.afirmacao]);
    expect((await problemas(limpa.versao)).join(" | ")).not.toMatch(/material de origem/);
  });

  it("mais de 30 pontos-chave ou título enorme travam, sem cortar o texto em silêncio", async () => {
    const muitos = await montarUnidade(sql, rpc, { titulo: "Muitos pontos", resumo: Array.from({ length: 31 }, (_, i) => `Ponto ${i + 1} da aula.`), semAprovar: true });
    expect((await problemas(muitos.versao)).join(" | ")).toMatch(/no máximo 30 pontos-chave/);
  });
});

describe("Aula da Central trancada na tela Aulas", () => {
  it("a equipe não muda texto, pontos-chave, área ou publicação nem apaga; muda título, vídeo e posição", async () => {
    const u = await montarUnidade(sql, rpc, { titulo: "Aula trancada" });
    await publicar(rpc, u.versao);
    const aula = await aulaDaUnidade(u.unidade);
    const adm = (await rpc(ADMIN, "app_admin_lessons")).lessons.find((l: any) => l.id === aula.id);
    const formulario = { id: adm.id, area: adm.area, topic: adm.topic, title: adm.title, summary: adm.summary, key_points: adm.key_points, published: adm.published, position: adm.position };
    const msg = /vem da Central de Conteúdo/;
    const nota = { review_note: "Conferido pela equipe de teste." }; // sem nota a tela Aulas pede a conferência antes de olhar a trava
    await expect(rpc(ADMIN, "app_admin_save_lesson", { p_lesson: { ...formulario, ...nota, summary: `${adm.summary} acrescentado` } })).rejects.toThrow(msg);
    await expect(rpc(ADMIN, "app_admin_save_lesson", { p_lesson: { ...formulario, ...nota, key_points: ["outro ponto"] } })).rejects.toThrow(msg);
    await expect(rpc(ADMIN, "app_admin_save_lesson", { p_lesson: { ...formulario, ...nota, published: false } })).rejects.toThrow(msg);
    await expect(rpc(ADMIN, "app_admin_save_lesson", { p_lesson: { ...formulario, ...nota, area: "PEDIATRIA" } })).rejects.toThrow(msg);
    await expect(rpc(ADMIN, "app_admin_delete_lesson", { p_id: aula.id })).rejects.toThrow(/não se apaga aqui: retire a unidade/);
    await expect(sql(`delete from public.lessons where id = $1`, [aula.id])).rejects.toThrow(/não se apaga aqui/);
    await expect(sql(`update public.lessons set summary = 'x' where id = $1`, [aula.id])).rejects.toThrow(msg);
    // a tela antiga mandando o formulário inteiro sem mudar nada é aceita
    await rpc(ADMIN, "app_admin_save_lesson", { p_lesson: { ...formulario, position: 7 } });
    expect((await aulaDaUnidade(u.unidade)).position).toBe(7);
    await rpc(ADMIN, "app_admin_save_lesson", { p_lesson: { ...formulario, title: "Aula trancada (título novo)", review_note: "Título conferido na Central." } });
    expect((await aulaDaUnidade(u.unidade)).title).toBe("Aula trancada (título novo)");
    // aula feita à mão não vira aula da Central, nem nasce como tal
    await expect(sql(`insert into public.lessons (area, topic, title, origin) values ('PEDIATRIA', 't', 't', 'central')`)).rejects.toThrow();
    const [manual] = await sql(`insert into public.lessons (area, topic, title) values ('PEDIATRIA', 'Tema manual', 'Aula manual') returning id`);
    await expect(sql(`update public.lessons set origin = 'central' where id = $1`, [manual.id])).rejects.toThrow();
    await rpc(ADMIN, "app_admin_delete_lesson", { p_id: manual.id });
  });
});

describe("Versão nova na mesma aula, aula parecida, retirar e voltar", () => {
  it("versão nova atualiza a MESMA aula (id, progresso e conclusão do aluno ficam) e a anterior sai de cena", async () => {
    const u = await montarUnidade(sql, rpc, { titulo: "Atualizada pela fonte", secoes: [{ heading: "Conceito", paragraphs: ["Texto da primeira versão."] }] });
    await publicar(rpc, u.versao);
    const antes = await aulaDaUnidade(u.unidade);
    await rpc(ALUNO, "app_lesson_progress", { p_id: antes.id, p_seconds: 120, p_completed: true });
    const [v2] = await sql(`insert into public.ch_unit_versions (unit_id, version, content, content_hash) values ($1, 2, '{"sections": []}', public.ch_hash('{"sections": []}'::jsonb)) returning id`, [u.unidade]);
    await conteudoDaVersao(rpc, sql, v2.id, u.afirmacao, { titulo: "Atualizada pela fonte", secoes: [{ heading: "Conceito", paragraphs: ["Texto da SEGUNDA versão, revisado."] }], resumo: ["Novo ponto-chave."] });
    await aprovar(rpc, v2.id);
    const prev = await rpc(ADMIN, "app_ch_publish_preview", { p_version_id: v2.id });
    expect(prev.lesson).toMatchObject({ action: "update", id: antes.id });
    await publicar(rpc, v2.id);
    const depois = await aulaDaUnidade(u.unidade);
    expect(depois.id).toBe(antes.id);
    expect(depois.ch_version_id).toBe(v2.id);
    expect(depois.summary).toContain("Texto da SEGUNDA versão, revisado.");
    expect(depois.summary).toMatch(/atualizado em \d\d\/\d\d\/\d{4}/);
    expect(depois.key_points).toEqual(["Novo ponto-chave."]);
    expect((await sql(`select count(*)::int n from public.lessons where ch_unit_id = $1`, [u.unidade]))[0].n).toBe(1);
    const prog = await aulaDoAluno(antes.id);
    expect(prog.progress.completed_at).toBeTruthy();
    expect((await sql(`select status from public.ch_unit_versions where id = $1`, [u.versao]))[0].status).toBe("retired");
  });

  it("Criar versão para corrigir: rascunho com o mesmo texto, só de versão no ar, sem duplicar; depois de aprovada e publicada atualiza a mesma aula", async () => {
    const u = await montarUnidade(sql, rpc, { titulo: "Corrigir depois de publicado", secoes: [{ heading: "Conceito", paragraphs: ["Texto com erro de digitação."] }] });
    await expect(rpc(EDITOR, "app_ch_new_version", { p_from_version_id: u.versao })).rejects.toThrow(/Só uma versão no ar ganha versão para corrigir/);
    await publicar(rpc, u.versao);
    await expect(rpc(ALUNO, "app_ch_new_version", { p_from_version_id: u.versao })).rejects.toThrow(/restrito à equipe/);
    const nova = await rpc(EDITOR, "app_ch_new_version", { p_from_version_id: u.versao });
    expect(await rpc(EDITOR, "app_ch_new_version", { p_from_version_id: u.versao })).toBe(nova);
    const [v2] = await sql(`select version, status, candidate_of, candidate_reason, content_hash from public.ch_unit_versions where id = $1`, [nova]);
    expect(v2).toMatchObject({ version: 2, status: "draft", candidate_of: u.versao, candidate_reason: "Correção da versão 1" });
    expect((await sql(`select count(*)::int n from public.ch_unit_claims where unit_version_id = $1`, [nova]))[0].n).toBe(1);
    expect((await sql(`select count(*)::int n from public.ch_materials where unit_version_id = $1`, [nova]))[0].n).toBe(3);
    // a versão no ar continua; a nova ainda não passa (sem aprovação nem arquivo final desta versão)
    expect((await sql(`select status from public.ch_unit_versions where id = $1`, [u.versao]))[0].status).toBe("published");
    expect((await problemas(nova)).join(" | ")).toMatch(/aprovação médica|arquivo final/);
    await conteudoDaVersao(rpc, sql, nova, u.afirmacao, { titulo: "Corrigir depois de publicado", secoes: [{ heading: "Conceito", paragraphs: ["Texto corrigido, sem erro de digitação."] }] });
    await aprovar(rpc, nova);
    const aula = await aulaDaUnidade(u.unidade);
    await publicar(rpc, nova);
    const depois = await aulaDaUnidade(u.unidade);
    expect(depois.id).toBe(aula.id);
    expect(depois.summary).toContain("Texto corrigido, sem erro de digitação.");
    expect(depois.summary).not.toContain("Texto com erro de digitação.");
    // versão retirada não gera versão para corrigir
    await expect(rpc(EDITOR, "app_ch_new_version", { p_from_version_id: u.versao })).rejects.toThrow(/Só uma versão no ar/);
  });

  it("aula parecida (mesma área e tema) exige 'Publicar mesmo assim'; sem a marca nada é gravado", async () => {
    await sql(`insert into public.lessons (area, topic, title, published) values ('PEDIATRIA', 'Bronquiolite viral aguda', 'Bronquiolite (aula antiga)', true)`);
    const u = await montarUnidade(sql, rpc, { titulo: "Bronquiolite nova", tema: TEMA_PED, semAprovar: true });
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA') on conflict do nothing`, [REVISOR]);
    await rpc(EDITOR, "app_ch_submit_for_review", { p_version_id: u.versao });
    await rpc(REVISOR, "app_ch_approve", { p_version_id: u.versao, p_kind: "medical" });
    await rpc(EDITOR, "app_ch_approve", { p_version_id: u.versao, p_kind: "editorial" });
    const prev = await rpc(ADMIN, "app_ch_publish_preview", { p_version_id: u.versao });
    expect(prev.similar).toEqual([expect.objectContaining({ title: "Bronquiolite (aula antiga)" })]);
    await expect(rpc(ADMIN, "app_ch_publish", { p_version_id: u.versao, p_options: {} })).rejects.toThrow(/Já existe aula parecida publicada: “Bronquiolite \(aula antiga\)”/);
    // falhou no meio: a versão continua aprovada, sem publicação e sem aula
    expect((await sql(`select status from public.ch_unit_versions where id = $1`, [u.versao]))[0].status).toBe("approved");
    expect((await sql(`select count(*)::int n from public.ch_publications where unit_version_id = $1`, [u.versao]))[0].n).toBe(0);
    expect(await aulaDaUnidade(u.unidade)).toBeUndefined();
    await rpc(ADMIN, "app_ch_publish", { p_version_id: u.versao, p_options: { confirm_similar: true } });
    expect((await aulaDaUnidade(u.unidade)).published).toBe(true);
  });

  it("Retirar tira a aula do aluno sem apagar o progresso; a administração continua vendo; publicar de novo devolve a mesma aula", async () => {
    const u = await montarUnidade(sql, rpc, { titulo: "Retirada e volta" });
    await publicar(rpc, u.versao);
    const aula = await aulaDaUnidade(u.unidade);
    await rpc(ALUNO2, "app_lesson_progress", { p_id: aula.id, p_seconds: 30, p_completed: true });
    await expect(rpc(ADMIN, "app_ch_retire", { p_version_id: u.versao, p_reason: " " })).rejects.toThrow(/motivo/);
    await rpc(ADMIN, "app_ch_retire", { p_version_id: u.versao, p_reason: "Erro de digitação encontrado." });
    expect((await aulaDaUnidade(u.unidade)).published).toBe(false);
    expect((await rpc(ALUNO, "app_lessons", {})).lessons.some((l: any) => l.id === aula.id)).toBe(false);
    expect(await rpc(ALUNO, "app_lesson", { p_id: aula.id })).toBeNull();
    expect((await rpc(ADMIN, "app_admin_lessons")).lessons.some((l: any) => l.id === aula.id)).toBe(true);
    expect((await sql(`select count(*)::int n from public.lesson_progress where lesson_id = $1 and completed_at is not null`, [aula.id]))[0].n).toBe(1);
    // nova versão publicada: a mesma aula volta, com o progresso do aluno
    const [v2] = await sql(`insert into public.ch_unit_versions (unit_id, version, content, content_hash) values ($1, 2, '{"sections": []}', public.ch_hash('{"sections": []}'::jsonb)) returning id`, [u.unidade]);
    await conteudoDaVersao(rpc, sql, v2.id, u.afirmacao, { titulo: "Retirada e volta", secoes: [{ heading: "Conceito", paragraphs: ["Texto corrigido."] }] });
    await aprovar(rpc, v2.id);
    await publicar(rpc, v2.id);
    const volta = await aulaDaUnidade(u.unidade);
    expect(volta).toMatchObject({ id: aula.id, published: true });
    expect((await rpc(ALUNO2, "app_lesson", { p_id: aula.id })).progress.completed_at).toBeTruthy();
  });
});

describe("Segurança e colagem", () => {
  it("o aluno continua sem ler o conteúdo das unidades nem as tabelas internas; funções internas fechadas", async () => {
    await expect(rpc(ALUNO, "app_ch_published_units")).rejects.toThrow(/restrito à equipe/);
    for (const fn of ["ch_distribute(uuid, jsonb)", "ch_undistribute(uuid)", "ch_student_lesson(uuid)", "ch_distribution_plan(uuid, jsonb)", "ch_publish_problems_student(uuid)", "ch_publish_problems(uuid)"])
      expect((await sql(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') a, has_function_privilege('anon', 'public.${fn}', 'execute') b`))[0]).toEqual({ a: false, b: false });
    for (const fn of ["app_ch_publish(uuid, jsonb)", "app_ch_publish(uuid)", "app_ch_publish_preview(uuid, jsonb)", "app_ch_retire(uuid, text)"])
      expect((await sql(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') a, has_function_privilege('anon', 'public.${fn}', 'execute') b`))[0]).toEqual({ a: true, b: false });
  });

  it("colar a migração mais duas vezes (com dados) não dá erro e a publicação segue funcionando", async () => {
    const antes = (await sql(`select count(*)::int n from public.lessons where origin = 'central'`))[0].n;
    expect(antes).toBeGreaterThan(0);
    await db.exec(fs.readFileSync(MIGRACAO, "utf8"));
    await db.exec(fs.readFileSync(MIGRACAO, "utf8"));
    expect((await sql(`select count(*)::int n from public.lessons where origin = 'central'`))[0].n).toBe(antes);
    const u = await montarUnidade(sql, rpc, { titulo: "Depois de colar de novo" });
    await publicar(rpc, u.versao);
    expect((await aulaDaUnidade(u.unidade)).published).toBe(true);
    expect((await sql(`select count(*)::int n from pg_trigger where tgname = 'lessons_central_guard_trg'`))[0].n).toBe(1);
  });
});
