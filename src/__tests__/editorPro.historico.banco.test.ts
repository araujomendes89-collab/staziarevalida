// @vitest-environment node
/**
 * Testes de banco da migração 20261003013060: Editor profissional — histórico, rascunho automático e trava de edição.
 * Executado sobre PGlite com todas as migrações aplicadas.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { abrirBanco, ADMIN, ALUNO, EDITOR, REVISOR, type Rpc, type Sql } from "./helpers/publicacaoCentral";
import { montarUnidade, preparaBanco } from "./helpers/centralUnidades";

let db: PGlite;
let sql: Sql;
let rpc: Rpc;

beforeAll(async () => {
  ({ db, sql, rpc } = await abrirBanco());
  await preparaBanco(sql);
}, 240_000);

describe("Migração 20261003013060: Editor profissional", () => {
  let montada: { unidade: string; versao: string; afirmacao: string; fonte: string };
  let versao: string;
  let hashAntes: string;

  it("1. rascunho: salvar não altera versão nem aprovações, ler devolve doc, admin não vê, aluno/anon barrados", async () => {
    montada = await montarUnidade(sql, rpc, { titulo: "Unidade Editor Pro Rascunho", semAprovar: false });
    versao = montada.versao;

    hashAntes = (await sql("select content_hash from public.ch_unit_versions where id = $1", [versao]))[0].content_hash;
    const aprAntes = (await sql("select count(*)::int as c from public.ch_approvals where unit_version_id = $1 and invalidated_at is null", [versao]))[0].c;
    expect(aprAntes).toBe(2);

    const docValido = { type: "doc", content: [{ type: "paragraph", text: "Rascunho de teste" }] };
    const resSalvar = await rpc(EDITOR, "app_ch_doc_rascunho_salvar", {
      p_version_id: versao,
      p_doc: docValido,
      p_config: { zoom: 100 },
      p_base_hash: hashAntes,
    });
    expect(resSalvar.em).toBeDefined();

    // content_hash e aprovações não mudam
    const hashDepois = (await sql("select content_hash from public.ch_unit_versions where id = $1", [versao]))[0].content_hash;
    expect(hashDepois).toBe(hashAntes);
    const aprDepois = (await sql("select count(*)::int as c from public.ch_approvals where unit_version_id = $1 and invalidated_at is null", [versao]))[0].c;
    expect(aprDepois).toBe(aprAntes);

    // ler devolve o doc
    const draftEditor = await rpc(EDITOR, "app_ch_doc_rascunho_ler", { p_version_id: versao });
    expect(draftEditor).toMatchObject({
      doc: docValido,
      config: { zoom: 100 },
      base_hash: hashAntes,
      hash_atual: hashAntes,
    });
    expect(draftEditor.em).toBeDefined();

    // ADMIN não vê o rascunho do EDITOR (ler devolve null)
    const draftAdmin = await rpc(ADMIN, "app_ch_doc_rascunho_ler", { p_version_id: versao });
    expect(draftAdmin).toBeNull();

    // ALUNO recebe erro 42501 em todas as app_ch_doc_*; anon recebe erro
    const funcoesEquipe: [string, Record<string, unknown>][] = [
      ["app_ch_doc_rascunho_salvar", { p_version_id: versao, p_doc: docValido, p_config: {}, p_base_hash: hashAntes }],
      ["app_ch_doc_rascunho_ler", { p_version_id: versao }],
      ["app_ch_doc_rascunho_apagar", { p_version_id: versao }],
      ["app_ch_doc_trava", { p_version_id: versao, p_base_hash: hashAntes, p_assumir: false }],
      ["app_ch_doc_trava_soltar", { p_version_id: versao }],
      ["app_ch_doc_historico", { p_version_id: versao }],
      ["app_ch_doc_historico_abrir", { p_version_id: versao, p_de_versao_id: versao }],
      ["app_ch_doc_restaurar", { p_version_id: versao, p_de_versao_id: versao }],
    ];
    for (const [fn, args] of funcoesEquipe) {
      await expect(rpc(ALUNO, fn, args), `aluno chamando ${fn}`).rejects.toThrow(/42501|restrito|Acesso restrito/);
      await expect(rpc(null, fn, args), `anon chamando ${fn}`).rejects.toThrow();
    }
  });

  it("2. rascunho inválido ({type:'x'}) → erro 22023", async () => {
    await expect(rpc(EDITOR, "app_ch_doc_rascunho_salvar", {
      p_version_id: versao,
      p_doc: { type: "x" },
      p_config: {},
      p_base_hash: hashAntes,
    })).rejects.toThrow(/Rascunho inválido|22023/);
  });

  it("3. trava: concorrência, assumir e trava vencida", async () => {
    // EDITOR pega (minha true)
    const trava1 = await rpc(EDITOR, "app_ch_doc_trava", { p_version_id: versao, p_base_hash: hashAntes });
    expect(trava1.minha).toBe(true);

    // ADMIN tenta → minha false e quem = email do editor
    const trava2 = await rpc(ADMIN, "app_ch_doc_trava", { p_version_id: versao, p_base_hash: hashAntes });
    expect(trava2.minha).toBe(false);
    expect(trava2.quem).toBe("ed83@t.dev");

    // ADMIN tenta salvar com app_ch_save_unit_version texto diferente → erro com "está editando"
    const textoAdmin = {
      sections: [{ heading: "Admin Edit", paragraphs: [{ text: "Texto admin concorrente", clinical: true, claim_ids: [montada.afirmacao] }] }]
    };
    await expect(rpc(ADMIN, "app_ch_save_unit_version", {
      p_version_id: versao,
      p_content: textoAdmin,
    })).rejects.toThrow(/está editando/);

    // ADMIN com p_assumir → minha true e ch_audit tem 'unit.editor_assumido'
    const travaAssumida = await rpc(ADMIN, "app_ch_doc_trava", {
      p_version_id: versao,
      p_base_hash: hashAntes,
      p_assumir: true,
    });
    expect(travaAssumida.minha).toBe(true);

    const auditRows = await sql("select action, details from public.ch_audit where target = $1 and action = 'unit.editor_assumido'", [versao]);
    expect(auditRows.length).toBeGreaterThan(0);
    expect(auditRows[0].details.de).toBe("ed83@t.dev");

    // aí o EDITOR salvar → erro
    const textoEditor = {
      sections: [{ heading: "Editor Edit", paragraphs: [{ text: "Texto editor destituído", clinical: true, claim_ids: [montada.afirmacao] }] }]
    };
    await expect(rpc(EDITOR, "app_ch_save_unit_version", {
      p_version_id: versao,
      p_content: textoEditor,
    })).rejects.toThrow(/está editando/);

    // Trava vencida (atualize visto_em para now() - 5 min via sql) não bloqueia ninguém
    await sql("update public.ch_doc_locks set visto_em = now() - interval '5 minutes' where unit_version_id = $1", [versao]);
    const resSalvoVencida = await rpc(EDITOR, "app_ch_save_unit_version", {
      p_version_id: versao,
      p_content: textoEditor,
    });
    expect(resSalvoVencida.content_hash).toBeDefined();
  });

  it("4. base mudou: bloqueia se a versão foi alterada por outro caminho desde a trava", async () => {
    // EDITOR pega trava com base H1
    const h1 = (await sql("select content_hash from public.ch_unit_versions where id = $1", [versao]))[0].content_hash;
    const travaEd = await rpc(EDITOR, "app_ch_doc_trava", { p_version_id: versao, p_base_hash: h1 });
    expect(travaEd.minha).toBe(true);

    // outro caminho (sql direto como sistema, sem auth) muda o texto
    const textoSistema = {
      sections: [{ heading: "Sistema", paragraphs: [{ text: "Texto atualizado diretamente pelo sistema", clinical: true, claim_ids: [montada.afirmacao] }] }]
    };
    await sql(
      `update public.ch_unit_versions
       set content = $1::jsonb, content_hash = public.ch_hash($1::jsonb)
       where id = $2`,
      [JSON.stringify(textoSistema), versao]
    );

    // EDITOR salva → erro com "salva por outra pessoa"
    const textoEditor = {
      sections: [{ heading: "Editor", paragraphs: [{ text: "Texto novo do editor sobre base antiga", clinical: true, claim_ids: [montada.afirmacao] }] }]
    };
    await expect(rpc(EDITOR, "app_ch_save_unit_version", {
      p_version_id: versao,
      p_content: textoEditor,
    })).rejects.toThrow(/salva por outra pessoa/);
  });

  it("5. histórico: 2 salvamentos com texto diferente, salvar igual não cria linha, rascunho some, aprovações caem", async () => {
    const montada2 = await montarUnidade(sql, rpc, { titulo: "Unidade Histórico Teste 2", semAprovar: false });
    const v2 = montada2.versao;

    const aprAntes = (await sql("select count(*)::int as c from public.ch_approvals where unit_version_id = $1 and invalidated_at is null", [v2]))[0].c;
    expect(aprAntes).toBe(2);

    // Salva rascunho do EDITOR
    await rpc(EDITOR, "app_ch_doc_rascunho_salvar", {
      p_version_id: v2,
      p_doc: { type: "doc", content: [{ type: "paragraph", text: "Rascunho temporário" }] },
      p_config: {},
    });
    expect(await rpc(EDITOR, "app_ch_doc_rascunho_ler", { p_version_id: v2 })).not.toBeNull();

    // Pega trava
    await rpc(EDITOR, "app_ch_doc_trava", { p_version_id: v2 });

    // Salvar 1 (texto diferente 1)
    const t1 = { sections: [{ heading: "T1", paragraphs: [{ text: "Texto Salvo 1", clinical: true, claim_ids: [montada2.afirmacao] }] }] };
    await rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: v2, p_content: t1 });

    // O rascunho de quem salvou some
    expect(await rpc(EDITOR, "app_ch_doc_rascunho_ler", { p_version_id: v2 })).toBeNull();

    // Aprovações caem como hoje: nenhuma ch_approvals válida
    const aprDepois = (await sql("select count(*)::int as c from public.ch_approvals where unit_version_id = $1 and invalidated_at is null", [v2]))[0].c;
    expect(aprDepois).toBe(0);

    // Salvar texto igual não cria linha
    await rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: v2, p_content: t1 });

    // Salvar 2 (texto diferente 2)
    const t2 = { sections: [{ heading: "T2", paragraphs: [{ text: "Texto Salvo 2", clinical: true, claim_ids: [montada2.afirmacao] }] }] };
    await rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: v2, p_content: t2 });

    // app_ch_doc_historico.salvamentos tem 'anterior' + 2 'salvo' com quem = email
    const hist = await rpc(EDITOR, "app_ch_doc_historico", { p_version_id: v2 });
    // a montagem da unidade já salvou uma vez (o texto vazio inicial vira 'anterior')
    expect(hist.salvamentos).toHaveLength(4);
    expect(hist.salvamentos[0]).toMatchObject({ origem: "salvo", quem: "ed83@t.dev", igual_ao_atual: true });
    expect(hist.salvamentos[1]).toMatchObject({ origem: "salvo", quem: "ed83@t.dev", igual_ao_atual: false });
    expect(hist.salvamentos[2]).toMatchObject({ origem: "salvo", quem: "ed83@t.dev", igual_ao_atual: false });
    expect(hist.salvamentos[3]).toMatchObject({ origem: "anterior", quem: null, igual_ao_atual: false });
  });

  it("6. restaurar: volta o texto salvo antes, bloqueia outra unidade, _abrir devolve content, e restaura de versão 2", async () => {
    const montada3 = await montarUnidade(sql, rpc, { titulo: "Unidade Restaurar Teste 3", semAprovar: true });
    const v3 = montada3.versao;

    await rpc(EDITOR, "app_ch_doc_trava", { p_version_id: v3 });
    const hashOriginal = (await sql("select content_hash from public.ch_unit_versions where id = $1", [v3]))[0].content_hash;
    // o histórico guarda o hash do texto inteiro (com formatação)
    const completoOriginal = (await sql("select public.ch_hash(content) as h from public.ch_unit_versions where id = $1", [v3]))[0].h;

    // Salva alteração para criar 'anterior'
    const textoModificado = { sections: [{ heading: "Alt", paragraphs: [{ text: "Texto para restaurar depois", clinical: true, claim_ids: [montada3.afirmacao] }] }] };
    await rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: v3, p_content: textoModificado });

    const hist = await rpc(EDITOR, "app_ch_doc_historico", { p_version_id: v3 });
    // o texto da montagem (salvo antes da alteração) é o que vamos restaurar
    const itemAnterior = hist.salvamentos.find((s: any) => s.content_hash === completoOriginal);
    expect(itemAnterior).toBeDefined();

    // _abrir devolve o content
    const aberto = await rpc(EDITOR, "app_ch_doc_historico_abrir", { p_version_id: v3, p_historico_id: itemAnterior.id });
    expect(aberto.content).toBeDefined();
    expect(aberto.content_hash).toBe(completoOriginal);

    // restaurar de outra unidade → erro 'não é desta aula'
    const montadaOutra = await montarUnidade(sql, rpc, { titulo: "Unidade Outro Tema 3", semAprovar: true });
    await expect(rpc(EDITOR, "app_ch_doc_restaurar", {
      p_version_id: v3,
      p_de_versao_id: montadaOutra.versao,
    })).rejects.toThrow(/não é desta aula/);

    // restaurar a linha 'anterior' → content volta igual ao antigo, salvamento novo com origem 'restaurado'
    await rpc(EDITOR, "app_ch_doc_restaurar", {
      p_version_id: v3,
      p_historico_id: itemAnterior.id,
    });
    const verRestaurada = (await sql("select content_hash from public.ch_unit_versions where id = $1", [v3]))[0];
    expect(verRestaurada.content_hash).toBe(hashOriginal);

    const histApos = await rpc(EDITOR, "app_ch_doc_historico", { p_version_id: v3 });
    expect(histApos.salvamentos[0].origem).toBe("restaurado");
    expect(histApos.salvamentos[0].detalhe).toMatch(/^salvo em \d\d\/\d\d \d\d:\d\d/);

    // restaurar p_de_versao_id de outra versão da mesma unidade funciona
    const v2Content = { sections: [{ heading: "Versão 2", paragraphs: [{ text: "Conteúdo da versão 2", clinical: true, claim_ids: [montada3.afirmacao] }] }] };
    const v2Hash = (await sql("select public.ch_conteudo_hash($1::jsonb) as h", [JSON.stringify(v2Content)]))[0].h;
    const v2Rows = await sql(
      `insert into public.ch_unit_versions (unit_id, version, content, content_hash, status, created_by)
       values ($1, 2, $2::jsonb, $3, 'draft', $4) returning id`,
      [montada3.unidade, JSON.stringify(v2Content), v2Hash, EDITOR]
    );
    const v2Id = v2Rows[0].id;

    await rpc(EDITOR, "app_ch_doc_restaurar", {
      p_version_id: v3,
      p_de_versao_id: v2Id,
    });
    const verRestauradaV2 = (await sql("select content_hash from public.ch_unit_versions where id = $1", [v3]))[0];
    expect(verRestauradaV2.content_hash).toBe(v2Hash);

    const histAposV2 = await rpc(EDITOR, "app_ch_doc_historico", { p_version_id: v3 });
    expect(histAposV2.salvamentos[0].origem).toBe("restaurado");
    expect(histAposV2.salvamentos[0].detalhe).toBe("versão 2");
  });

  it("7. colar a migração de novo 2x → conferir 'OK:'; desfazer → conferir começa com 'FALTA:' e as aulas continuam salváveis; colar de novo → 'OK:'", async () => {
    const ROOT = path.resolve(__dirname, "../..");
    const migracao = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003013060_editor_pro_historico.sql"), "utf8");
    const desfazer = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013060_editor_pro_historico.desfazer.sql"), "utf8");
    const conferir = fs.readFileSync(path.join(ROOT, "supabase/conferir/editor-pro-historico.sql"), "utf8");

    // Colar de novo 2x
    await db.exec(migracao);
    await db.exec(migracao);
    let res = (await sql(conferir))[0].resultado;
    expect(res).toMatch(/^OK:/);

    // Desfazer
    await db.exec(desfazer);
    res = (await sql(conferir))[0].resultado;
    expect(res).toMatch(/^FALTA:/);

    // As aulas continuam salváveis (app_ch_save_unit_version funciona)
    const montada4 = await montarUnidade(sql, rpc, { titulo: "Unidade Salvar Sem Migração", semAprovar: true });
    const textoSalvoSemMigracao = {
      sections: [{ heading: "Normal", paragraphs: [{ text: "Salvando normalmente após desfazer", clinical: true, claim_ids: [montada4.afirmacao] }] }]
    };
    const resSalvarSemMigracao = await rpc(EDITOR, "app_ch_save_unit_version", {
      p_version_id: montada4.versao,
      p_content: textoSalvoSemMigracao,
    });
    expect(resSalvarSemMigracao.content_hash).toBeDefined();

    // Colar a migração de novo
    await db.exec(migracao);
    res = (await sql(conferir))[0].resultado;
    expect(res).toMatch(/^OK:/);
  });

  it("8. só formatação (013080): aprovações ficam, o histórico marca, a trava também vale; versão no ar aceita a trava", async () => {
    const m = await montarUnidade(sql, rpc, { titulo: "Unidade Formatacao Historico" });
    const v = m.versao;
    const atual = (await sql("select content, content_hash from public.ch_unit_versions where id = $1", [v]))[0];
    const aprovadas = async () => (await sql("select count(*)::int as c from public.ch_approvals where unit_version_id = $1 and invalidated_at is null", [v]))[0].c;
    expect(await aprovadas()).toBe(2);
    const soFormato = { ...atual.content, doc_config: { pagina: { tamanho: "A4" } } };

    // outra pessoa com a trava: nem a formatação passa por cima
    await rpc(ADMIN, "app_ch_doc_trava", { p_version_id: v, p_base_hash: atual.content_hash });
    await expect(rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: v, p_content: soFormato })).rejects.toThrow(/está editando/);
    await rpc(ADMIN, "app_ch_doc_trava_soltar", { p_version_id: v });

    // trava do editor: a mudança só de formatação muda o texto inteiro, mas não o hash de conteúdo
    const t = await rpc(EDITOR, "app_ch_doc_trava", { p_version_id: v, p_base_hash: atual.content_hash });
    expect(t).toMatchObject({ minha: true, mudou: false });
    const r = await rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: v, p_content: soFormato });
    expect(r.so_formatacao).toBe(true);
    expect(await aprovadas()).toBe(2);
    const hist = await rpc(EDITOR, "app_ch_doc_historico", { p_version_id: v });
    expect(hist.salvamentos[0]).toMatchObject({ origem: "salvo", so_formatacao: true, igual_ao_atual: true });
    // a trava acompanhou o salvamento: o próximo salvamento da mesma pessoa passa
    expect((await rpc(EDITOR, "app_ch_doc_trava", { p_version_id: v, p_base_hash: atual.content_hash })).mudou).toBe(false);

    // restaurar o texto anterior (só formatação de volta) também não derruba as aprovações
    const anterior = hist.salvamentos.find((x: any) => !x.igual_ao_atual);
    const rr = await rpc(EDITOR, "app_ch_doc_restaurar", { p_version_id: v, p_historico_id: anterior.id });
    expect(rr.so_formatacao).toBe(true);
    expect(await aprovadas()).toBe(2);
    await rpc(EDITOR, "app_ch_doc_trava_soltar", { p_version_id: v });

    // outra pessoa mudou só a formatação depois que a trava foi pega: o banco recusa salvar por cima
    await rpc(EDITOR, "app_ch_doc_trava", { p_version_id: v, p_base_hash: atual.content_hash });
    await sql("update public.ch_unit_versions set content = $1::jsonb where id = $2", [JSON.stringify({ ...atual.content, doc_config: { pagina: { tamanho: "A5" } } }), v]);
    expect((await rpc(EDITOR, "app_ch_doc_trava", { p_version_id: v, p_base_hash: atual.content_hash })).mudou).toBe(true);
    await expect(rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: v, p_content: soFormato })).rejects.toThrow(/salva por outra pessoa/);
  });
});
