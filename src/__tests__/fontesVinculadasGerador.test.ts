// @vitest-environment node
/**
 * Gerador do SQL das Fontes vinculadas (scripts/fontes-vinculadas/gerar-sql.mjs), sem banco: leitura da lista de fontes
 * exportada (CSV e JSON), regras que fazem o script LISTAR e NÃO gerar um vínculo, o formato do agente Vinculador (força,
 * divergência, nota do que mudou), texto seguro no SQL e a linha de comando. O SQL rodando num banco (grava, colar de novo não
 * muda nada) está em fontesVinculadasBanco.test.ts.
 * Dados REAIS (regra do dono): fontes do catálogo conferido, trechos literais de enunciados reais e o arquivo real do Vinculador
 * (fixtures/fontes-vinculadas). Os ids de banco (uuid) são da infraestrutura simulada.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { describe, expect, it } from "vitest";
import {
  ATLS_COMPLEMENTAR, CP57_COLO, GESTACAO_A, GESTACAO_B, PCDT_ASMA_2026, PCDT_IC, PCDT_TABAGISMO, Q_IC, Q_RASTREAMENTO, SBC_IC_2018, SBC_IC_2026,
  SECAO_ENUNCIADO, TRECHO_IC_1, TRECHO_IC_2, TRECHO_RASTREAMENTO, type FonteReal,
} from "./helpers/fontesVinculadasReais";
// @ts-ignore script em JavaScript puro (roda com node, sem compilar)
import { acharFonte, chaveUrl, gerarSql, limpaNotaAtualizacao, normUrl, parseCsv, parseFontes, problemasDoVinculo, textoDoRelatorio } from "../../scripts/fontes-vinculadas/gerar-sql.mjs";

const ROOT = path.resolve(__dirname, "../..");
const FX = path.join(__dirname, "fixtures/fontes-vinculadas");
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// a biblioteca simulada: fontes reais do catálogo; situação como no catálogo (SBC 2018 revogada); a SBC 2026 sem a aprovação
// editorial da biblioteca e o ATLS marcado "complementar" são simulações para testar as recusas
const linha = (n: number, f: FonteReal, extra: Record<string, unknown> = {}) => ({
  id: ID(n), url: f.url, version: f.version, title: f.title, organ: f.organ, status: f.status, audience: f.audience, kind: f.kind,
  editorial_approved: f.kind === "society_guideline", ...extra,
});
const FONTES = [
  linha(1, PCDT_IC), linha(2, SBC_IC_2018), linha(3, ATLS_COMPLEMENTAR), linha(4, CP57_COLO), linha(5, SBC_IC_2026, { editorial_approved: false }),
  linha(6, GESTACAO_A), linha(7, GESTACAO_B), linha(8, PCDT_ASMA_2026),
  // o tabagismo na biblioteca sem o final /@@download/file que o catálogo traz
  linha(9, PCDT_TABAGISMO, { url: PCDT_TABAGISMO.url.replace("/@@download/file", "") }),
];
const V = (o: Record<string, unknown> = {}) => ({ url_fonte: PCDT_IC.url, versao: PCDT_IC.version, temporal: "vigente", papel: "tratamento", secao: SECAO_ENUNCIADO, citacao: TRECHO_IC_1, ...o });
/** CSV como o editor do Supabase baixa: campo com vírgula, aspas ou quebra de linha entre aspas, aspas dobradas. */
const csvDe = (rows: Record<string, unknown>[]) => {
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => (v == null ? "" : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
};

describe("Lista de fontes exportada do banco", () => {
  it("CSV (vírgulas, aspas e apóstrofos reais dentro dos campos) e JSON dão a mesma lista; linhas sem id ou sem link ficam de fora", () => {
    const csv = csvDe([...FONTES, { ...linha(10, PCDT_IC), id: "nao-e-uuid" }, { ...linha(11, PCDT_IC), url: null }]);
    expect(csv).toContain('""atualizado em 02/04/2026""'); // a versão real da asma tem aspas duplas
    const doCsv = parseFontes(csv);
    expect(doCsv).toHaveLength(FONTES.length);
    expect(doCsv).toEqual(parseFontes(JSON.stringify(FONTES)));
    expect(doCsv.find((f: any) => f.id === ID(8)).version).toBe(PCDT_ASMA_2026.version);
    expect(doCsv.find((f: any) => f.id === ID(4)).title).toBe(CP57_COLO.title);
    expect(doCsv.find((f: any) => f.id === ID(3)).version).toBe(ATLS_COMPLEMENTAR.version);
    expect(parseCsv('a,b\n"x\ny",z\n')).toEqual([{ a: "x\ny", b: "z" }]);
    expect(parseFontes("﻿" + JSON.stringify(FONTES.slice(0, 1)))[0].id).toBe(ID(1));
  });

  it("link normalizado como o do banco e a chave da importação do catálogo (sem /@@download/file e sem barra no fim)", () => {
    expect(normUrl(PCDT_IC.url.replace("https://www.gov.br", "HTTPS://WWW.GOV.BR:443") + "?utm_source=x&a=1#topo")).toBe(PCDT_IC.url + "?a=1");
    expect(normUrl(` ${ATLS_COMPLEMENTAR.url} `)).toBe(ATLS_COMPLEMENTAR.url);
    expect(normUrl("")).toBeNull();
    expect(chaveUrl(PCDT_TABAGISMO.url)).toBe("https://www.gov.br/saude/pt-br/assuntos/pcdt/t/tabagismo");
    expect(chaveUrl(ATLS_COMPLEMENTAR.url)).toBe(ATLS_COMPLEMENTAR.url.replace(/\/$/, ""));
    expect(chaveUrl(CP57_COLO.url)).toBe(CP57_COLO.url.replace("/@@display-file/file", ""));
  });
});

describe("Quando o script NÃO gera o vínculo (e diz por quê)", () => {
  it("fonte fora do banco, complementar; achar pelo link (a versão só desempata)", () => {
    expect(acharFonte(FONTES, V({ url_fonte: "https://linhasdecuidado.saude.gov.br/portal/tabagismo/" })).motivo).toMatch(/fonte não encontrada no banco/);
    expect(acharFonte(FONTES, V({ url_fonte: ATLS_COMPLEMENTAR.url, versao: ATLS_COMPLEMENTAR.version, temporal: "historica" })).motivo).toMatch(/fonte complementar/);
    // o mesmo link com outra grafia acha a fonte; o link do catálogo com /@@download/file acha a fonte gravada sem ele
    expect(acharFonte(FONTES, V({ url_fonte: PCDT_IC.url.replace("https://www.gov.br", "HTTPS://WWW.GOV.BR:443") + "?utm_source=x#p12" })).fonte.id).toBe(ID(1));
    expect(acharFonte(FONTES, V({ url_fonte: PCDT_TABAGISMO.url, versao: PCDT_TABAGISMO.version })).fonte.id).toBe(ID(9));
    // uma fonte só com aquele link: entra mesmo com outra versão no arquivo, com aviso
    const outra = acharFonte(FONTES, V({ versao: "2024" }));
    expect(outra.fonte.id).toBe(ID(1));
    expect(outra.aviso).toBe(`versão no arquivo "2024", no banco "${PCDT_IC.version}" (achada pelo link)`);
    // o mesmo link com duas fontes (entradas reais do catálogo): a versão desempata; sem versão ou com outra, não gera
    expect(acharFonte(FONTES, V({ url_fonte: GESTACAO_A.url, versao: GESTACAO_A.version })).fonte.id).toBe(ID(6));
    expect(acharFonte(FONTES, V({ url_fonte: GESTACAO_A.url, versao: GESTACAO_B.version })).fonte.id).toBe(ID(7));
    expect(acharFonte(FONTES, V({ url_fonte: GESTACAO_A.url, versao: undefined })).motivo).toBe("mais de uma fonte no banco com este link: informe a versão");
    expect(acharFonte(FONTES, V({ url_fonte: GESTACAO_A.url, versao: "2022" })).motivo).toMatch(/^o link tem mais de uma fonte no banco e nenhuma na versão "2022"/);
  });

  it("referência atual: não vale fonte substituída, consulta pública nem diretriz de sociedade sem aprovação; na versão da época da prova a substituída vale", () => {
    expect(acharFonte(FONTES, V({ url_fonte: SBC_IC_2018.url, versao: SBC_IC_2018.version })).motivo).toMatch(/substituída ou retirada/);
    expect(acharFonte(FONTES, V({ url_fonte: SBC_IC_2018.url, versao: SBC_IC_2018.version, temporal: "historica" })).fonte.id).toBe(ID(2));
    expect(acharFonte(FONTES, V({ url_fonte: CP57_COLO.url, versao: CP57_COLO.version })).motivo).toMatch(/consulta pública/);
    expect(acharFonte(FONTES, V({ url_fonte: SBC_IC_2026.url, versao: SBC_IC_2026.version })).motivo).toMatch(/sem aprovação editorial/);
  });

  it("formato do vínculo: link, referência, papel, citação curta, página ou seção, força, divergência e nota só na referência atual", () => {
    expect(problemasDoVinculo(V())).toEqual([]);
    expect(problemasDoVinculo(V({ secao: undefined, pagina: 12 }))).toEqual([]);
    expect(problemasDoVinculo(V({ url_fonte: "www.gov.br/saude" }))).toEqual(["url_fonte precisa ser um link http(s)"]);
    expect(problemasDoVinculo(V({ temporal: "antiga" }))[0]).toMatch(/temporal deve ser/);
    expect(problemasDoVinculo(V({ papel: "tudo" }))[0]).toMatch(/papel deve ser um de: diagnostico, conduta/);
    expect(problemasDoVinculo(V({ citacao: "   " }))).toEqual(["falta a citação (trecho literal do documento)"]);
    expect(problemasDoVinculo(V({ citacao: "x".repeat(401) }))[0]).toMatch(/máximo 400/);
    // quebras de linha do PDF viram um espaço antes de contar
    expect(problemasDoVinculo(V({ citacao: `${TRECHO_IC_1}\n\n   ${TRECHO_IC_2}` }))).toEqual([]);
    expect(problemasDoVinculo(V({ secao: "", rotulo_pagina: "" }))).toEqual(["falta a página (pagina ou rotulo_pagina) ou a seção do documento"]);
    expect(problemasDoVinculo(V({ pagina: 0 }))[0]).toMatch(/pagina deve ser um número inteiro/);
    expect(problemasDoVinculo(V({ rotulo_pagina: "x".repeat(41) }))[0]).toMatch(/rotulo_pagina/);
    expect(problemasDoVinculo(V({ forca: "altissima" }))).toEqual(['forca deve ser "forte", "media" ou "fraca"']);
    expect(problemasDoVinculo(V({ divergencia: "sim" }))).toEqual(["divergencia deve ser true ou false"]);
    expect(problemasDoVinculo(V({ temporal: "historica", nota_atualizacao_proposta: TRECHO_IC_2 }))).toEqual(["nota_atualizacao_proposta só vale na referência atual (vigente)"]);
  });

  it("regras do item: conferência confirmada precisa de referência atual confirmada; 'não confirmada' só com divergência; repetidos; questão sem chave", () => {
    const { relatorio } = gerarSql(
      [
        { question_code: Q_IC.code, conferencia: "confirmada", vinculos: [V({ temporal: "historica", url_fonte: SBC_IC_2018.url, versao: SBC_IC_2018.version })] },
        { question_code: Q_RASTREAMENTO.code, conferencia: "nao_confirmada", vinculos: [V({ citacao: TRECHO_RASTREAMENTO })] },
        { question_id: "revalida_2025_2_q001", conferencia: "confirmada", vinculos: [V(), V(), V({ citacao: TRECHO_IC_2 })] },
        { conferencia: "confirmada", vinculos: [V()] },
        { question_code: "REV-2025.2-Q002", conferencia: "talvez", vinculos: [] },
        { question_id: "revalida_2025_2_q001", conferencia: "confirmada", vinculos: [V()] },
        { question_code: "REV-2025.2-Q003", conferencia: "confirmada", conferido_em: "2026-02-30", vinculos: [V()] },
      ],
      FONTES
    );
    expect(relatorio.pulados.map((p: any) => `${p.questao}: ${p.motivo}`)).toEqual([
      `${Q_IC.code}: conferência "confirmada" não gravada: nenhuma referência atual confirmada neste item (a questão segue "ainda não conferida" até a equipe confirmar)`,
      `${Q_RASTREAMENTO.code}: conferência "nao_confirmada" não pode trazer referência atual confirmada (só a versão da época da prova, ou um vínculo com divergência para a equipe conferir)`,
      "revalida_2025_2_q001: vínculo repetido (mesma fonte, mesmo papel, mesma referência e mesma citação)",
      "item 4: falta question_code ou question_id",
      'REV-2025.2-Q002: conferencia deve ser "confirmada" ou "nao_confirmada"',
      "revalida_2025_2_q001: questão repetida no arquivo (junte os vínculos num item só)",
      "REV-2025.2-Q003: conferido_em deve ser uma data AAAA-MM-DD",
    ]);
    // a mesma fonte e o mesmo papel com OUTRA citação: são dois vínculos
    expect(relatorio.vinculos.map((v: any) => [v.chave, v.temporal, v.quote])).toEqual([
      [Q_IC.code, "historica", TRECHO_IC_1],
      ["revalida_2025_2_q001", "vigente", TRECHO_IC_1],
      ["revalida_2025_2_q001", "vigente", TRECHO_IC_2],
    ]);
    expect(relatorio.conferencias.map((c: any) => [c.chave, c.status])).toEqual([[Q_RASTREAMENTO.code, "nao_confirmada"], ["revalida_2025_2_q001", "confirmada"]]);
  });
});

describe("Formato do agente Vinculador (arquivos REAIS revalida_2025_2 e revalida_2025_1)", () => {
  const ler = (prova: string): any[] => JSON.parse(fs.readFileSync(path.join(FX, `vinculos-${prova}.json`), "utf8"));
  const reais = ler("revalida_2025_2");
  const catalogo: any[] = JSON.parse(fs.readFileSync(path.join(FX, "catalogo-amostra.json"), "utf8"));
  // a biblioteca simulada a partir do catálogo: documento revogado no catálogo = fonte substituída
  const biblioteca = catalogo.map((f, i) => ({ id: ID(100 + i), url: f.url, version: f.versao, title: f.titulo, organ: f.instituicao, status: f.status === "revogado" ? "superseded" : "current", audience: "oficial", kind: "final", editorial_approved: false }));
  const naBiblioteca = new Set(biblioteca.map((f) => chaveUrl(f.url)));
  const limpo = (t: string) => t.replace(/\s+/g, " ").trim();

  it.each(["revalida_2025_2", "revalida_2025_1"])("%s: força fraca e fonte fora da biblioteca não entram; divergência e nota entram em revisão; o resto entra confirmado", (prova) => {
    const itens = ler(prova);
    const todos = itens.flatMap((it) => it.vinculos.map((v: any) => ({ q: it.question_id, conferencia: it.conferencia, ...v })));
    const { relatorio, sql } = gerarSql(itens, biblioteca, { arquivo: `${prova}.json` });
    const fracos = todos.filter((v) => v.forca === "fraca");
    const semFonte = todos.filter((v) => v.forca !== "fraca" && !naBiblioteca.has(chaveUrl(v.url_fonte)));
    const entram = todos.filter((v) => v.forca !== "fraca" && naBiblioteca.has(chaveUrl(v.url_fonte)));
    const esperado = (v: any) => (v.divergencia === true || v.nota_atualizacao_proposta ? "em_revisao" : "confirmada");
    expect(fracos.length).toBeGreaterThan(0);
    for (const v of fracos) expect(relatorio.pulados).toContainEqual({ questao: v.q, url: v.url_fonte, motivo: 'vínculo de força "fraca": não entra' });
    for (const v of semFonte) expect(relatorio.pulados).toContainEqual({ questao: v.q, url: v.url_fonte, motivo: expect.stringMatching(/^fonte não encontrada no banco/) });
    expect(relatorio.pulados.every((p: any) => /força "fraca"|fonte não encontrada no banco|conferência "confirmada" não gravada/.test(p.motivo)), JSON.stringify(relatorio.pulados)).toBe(true);
    // cada vínculo real que entra: a citação, a página, o papel, a referência e a situação certa
    expect(relatorio.vinculos).toHaveLength(entram.length);
    for (const v of entram) {
      const g = relatorio.vinculos.find((x: any) => x.chave === v.q && x.quote === limpo(v.citacao) && x.role === v.papel);
      expect(g, `${v.q} p. ${v.pagina}`).toBeTruthy();
      expect([g.page, g.temporal, g.status], `${v.q} p. ${v.pagina}`).toEqual([v.pagina, v.temporal, esperado(v)]);
      expect(g.reason).toBe(esperado(v) === "em_revisao" ? limpo(v.observacao ?? "") || null : null);
      expect(g.updateNote).toBe(limpaNotaAtualizacao(v.nota_atualizacao_proposta ?? null));
      if (g.updateNote) expect(g.updateNote.startsWith("O que mudou desde a prova")).toBe(false);
    }
    expect(relatorio.vinculos.some((x: any) => x.status === "em_revisao" && x.updateNote)).toBe(true);
    // versão do arquivo diferente da biblioteca (no arquivo real: o manual de gestação de alto risco citado com a versão da outra
    // entrada do catálogo, ms-dmg): entra pelo link, com aviso no relatório
    expect(relatorio.avisos.length).toBeGreaterThan(0);
    for (const a of relatorio.avisos) expect(a.aviso).toMatch(/^versão no arquivo ".+", no banco ".+" \(achada pelo link\)$/);
    // conferências: as "não confirmadas" e as "confirmadas" que têm referência atual entrando confirmada
    const comAtualConfirmada = new Set(entram.filter((v) => v.temporal === "vigente" && esperado(v) === "confirmada").map((v) => v.q));
    const conferencias = itens.filter((it) => it.conferencia === "nao_confirmada" || comAtualConfirmada.has(it.question_id)).map((it) => it.question_id);
    expect(relatorio.conferencias.map((c: any) => c.chave).sort()).toEqual(conferencias.sort());
    expect(sql).toContain("'em_revisao'::text");
  });

  it("no arquivo real há versão da época da prova (documento revogado no catálogo): entra como histórica, de fonte substituída", () => {
    const { relatorio } = gerarSql(reais, biblioteca);
    const historicas = relatorio.vinculos.filter((x: any) => x.temporal === "historica");
    expect(historicas.length).toBeGreaterThan(0);
    for (const h of historicas) expect(biblioteca.find((f) => f.id === h.sourceId)?.status).toBe("superseded");
  });

  it("vínculo marcado validado: false não entra; 'não confirmada' aceita referência atual só com divergência (fica para a equipe)", () => {
    const base = reais.find((it) => it.vinculos.some((v: any) => v.forca === "forte"));
    const v0 = base.vinculos.find((v: any) => v.forca === "forte");
    const { relatorio } = gerarSql(
      [
        { ...base, vinculos: [{ ...v0, validado: false }] },
        { question_id: "revalida_2025_2_q002", code: "REV-2025.2-Q002", conferencia: "nao_confirmada", nota: "", vinculos: [{ ...v0, divergencia: true, observacao: "" }] },
      ],
      biblioteca
    );
    expect(relatorio.pulados.map((p: any) => p.motivo)).toEqual(["vínculo não validado: não entra", expect.stringMatching(/^conferência "confirmada" não gravada/)]);
    expect(relatorio.vinculos.map((v: any) => [v.chave, v.status, v.reason])).toEqual([["revalida_2025_2_q002", "em_revisao", null]]);
    expect(relatorio.conferencias.map((c: any) => [c.chave, c.status])).toEqual([["revalida_2025_2_q002", "nao_confirmada"]]);
  });
});

describe("O SQL gerado", () => {
  it("o apóstrofo real vira texto seguro; tipos explícitos; só grava nas duas tabelas novas; nunca mexe no gabarito", () => {
    const { sql, relatorio } = gerarSql(
      [
        {
          question_id: Q_RASTREAMENTO.id, conferencia: "confirmada", conferido_em: "2026-10-12",
          vinculos: [V({ citacao: TRECHO_RASTREAMENTO, ato: PCDT_ASMA_2026.act, url_fonte: PCDT_ASMA_2026.url, versao: PCDT_ASMA_2026.version, papel: "prevencao" })],
        },
        { question_code: Q_IC.code, conferencia: "nao_confirmada", vinculos: [V({ url_fonte: SBC_IC_2018.url, versao: SBC_IC_2018.version, temporal: "historica" })] },
      ],
      FONTES,
      { arquivo: "/tmp/x/vinculos.json", geradoEm: new Date("2026-10-12T12:00:00Z") }
    );
    expect(relatorio.pulados).toEqual([]);
    expect(sql).toContain("'Exame físico: pressão arterial de 120 x 80 mmHg, índice de massa corporal de 23 kg/m'', sem outras alterações.'::text");
    expect(sql).toContain(`'${ID(8)}'::uuid`);
    expect(sql).toContain(`'${ID(2)}'::uuid`);
    expect(sql).toContain(`'${Q_RASTREAMENTO.id}'::text, false`);
    expect(sql).toContain(`'${Q_IC.code}'::text, true`);
    expect(sql).toContain("'2026-10-12'::date");
    expect(sql).toContain("a partir de vinculos.json");
    expect(sql).toContain("on conflict (question_id, source_id, role, temporal, (md5(coalesce(quote, '')))) do update");
    expect(sql).toContain("on conflict (question_id) do update");
    const writes = [...sql!.matchAll(/^\s*(insert into|update|delete from)\s+(\S+)/gim)].map((m) => m[2]);
    expect(writes).toEqual(["public.question_source_links", "public.question_source_checks"]);
    expect(sql).not.toMatch(/correct_option|question_official_answers/);
    expect(sql!.trim().endsWith("as conferencias_no_banco;")).toBe(true);
  });

  it("modo em revisão: vínculos 'em_revisao' e sem conferência confirmada; nada a gravar = sem SQL", () => {
    const r = gerarSql([{ question_code: Q_IC.code, conferencia: "confirmada", vinculos: [V()] }], FONTES, { emRevisao: true });
    expect(r.sql).toContain("'em_revisao'::text");
    expect(r.relatorio.conferencias).toEqual([]);
    expect(r.sql).toContain("OK: Fontes vinculadas gravadas (1 vínculo, 0 conferências)");
    const vazio = gerarSql([{ question_code: Q_IC.code, conferencia: "confirmada", vinculos: [V({ url_fonte: "https://linhasdecuidado.saude.gov.br/portal/tabagismo/" })] }], FONTES);
    expect(vazio.sql).toBeNull();
    expect(textoDoRelatorio(vazio.relatorio, null)).toMatch(/NÃO gerados \(2\):[\s\S]*fonte não encontrada no banco[\s\S]*Nada para gravar/);
    expect(() => gerarSql({ nao: "lista" }, FONTES)).toThrow(/precisa ser uma lista JSON/);
  });

  it("pela linha de comando, com o arquivo real do Vinculador: grava o SQL e lista o que ficou de fora", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fontes-vinculadas-"));
    try {
      const entrada = path.join(dir, "revalida_2025_2.json");
      const fontes = path.join(dir, "fontes.csv");
      fs.copyFileSync(path.join(FX, "vinculos-revalida_2025_2.json"), entrada);
      const catalogo: any[] = JSON.parse(fs.readFileSync(path.join(FX, "catalogo-amostra.json"), "utf8"));
      fs.writeFileSync(fontes, csvDe(catalogo.map((f, i) => ({ id: ID(200 + i), url: f.url, version: f.versao, title: f.titulo, organ: f.instituicao, status: f.status === "revogado" ? "superseded" : "current", audience: "oficial", kind: "final" }))));
      const out = execFileSync(process.execPath, [path.join(ROOT, "scripts/fontes-vinculadas/gerar-sql.mjs"), entrada, "--fontes", fontes], { encoding: "utf8" });
      expect(out).toMatch(/vínculos gerados: \d+ \(\d+ referência atual, \d+ versão da época da prova; \d+ em revisão para a equipe\)/);
      expect(out).toMatch(/fonte não encontrada no banco/);
      expect(out).toContain('vínculo de força "fraca": não entra');
      expect(out).toContain(`SQL gravado em: ${path.join(dir, "revalida_2025_2-COLAR.sql")}`);
      expect(fs.readFileSync(path.join(dir, "revalida_2025_2-COLAR.sql"), "utf8")).toContain("insert into public.question_source_links");
      // sem a lista de fontes: explica e não grava nada
      expect(() => execFileSync(process.execPath, [path.join(ROOT, "scripts/fontes-vinculadas/gerar-sql.mjs"), entrada], { encoding: "utf8", stdio: "pipe" })).toThrow(/--fontes/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
