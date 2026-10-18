// @vitest-environment node
/**
 * Treino em Dupla · folha do candidato: o modelo (src/shared/dupla/folhaCandidato.ts) e a geração da imagem
 * (server/dupla/folha.ts) com o Chromium do Playwright, de ponta a ponta sobre o banco em memória (PGlite com as migrações e
 * as 10 estações de TESTE do INEP 2020) e um depósito numa pasta temporária. Sem o Chromium instalado, a parte da imagem pula.
 * Com FOLHA_SAIDA=<pasta>, a imagem da estação de teste 1 é copiada para lá (comparação com o modelo aprovado).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blocosDoRelato, cenarioEObservacao, cenarioInep, escapeHtml, FOLHA_MODELO, folhaHtml, notaInep, minutosDe, paragrafos, tarefasDe, textosEsperados, type FolhaFonte } from "../shared/dupla/folhaCandidato";
import { openDuplaDb, type DuplaDb } from "./helpers/duplaDb";
import { buildDuplaTestStatements } from "../../server/dupla/testStations";
import { localStorageDir, type ContentDb } from "../../server/contentHub/infra";
import { createRenderer, type Renderer } from "../../server/contentHub/render";
import { gerarFolha, gerarFolhasPendentes } from "../../server/dupla/folha";
import estacoes from "../../server/dupla/data/teste-inep2020.json";

const E01 = (estacoes as any[]).find((s) => s.id === "teste-inep2020-e01");

describe("modelo da folha (só formata, não muda o texto)", () => {
  it("escapa HTML, separa parágrafos e tarefas (sem o número; Observação sem marcador)", () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
    expect(paragrafos("um\r\n\r\ndois\n  \ntrês")).toEqual(["um", "dois", "três"]);
    expect(tarefasDe("1. ler o impresso 1;\n2) receber o paciente;\nObservação: não precisa examinar.")).toEqual([
      { tipo: "tarefa", texto: "ler o impresso 1;" },
      { tipo: "tarefa", texto: "receber o paciente;" },
      { tipo: "nota", texto: "Observação: não precisa examinar." },
    ]);
    expect(minutosDe(600000)).toBe("10");
    expect(minutosDe(450000)).toBe("7,5");
  });

  it("relato: 'ATENÇÃO:' no meio do parágrafo vira título; linhas seguidas viram marcadores; uma linha só fica parágrafo", () => {
    const blocos = blocosDoRelato(E01.pressings[0].content);
    expect(blocos.map((b) => b.tipo)).toEqual(["paragrafo", "titulo", "paragrafo"]);
    expect(blocos[1]).toEqual({ tipo: "titulo", texto: "ATENÇÃO:" });
    // nenhum caractere do texto se perde (só o espaço entre "alterações." e "ATENÇÃO:")
    const juntado = blocos.map((b) => (b.tipo === "lista" ? b.itens.join(" ") : b.texto)).join(" ");
    expect(juntado).toBe(E01.pressings[0].content);
    expect(blocosDoRelato("• Homem, 30 anos.\n• Febre.\n\nATENÇÃO:\nDemonstre a técnica.")).toEqual([
      { tipo: "lista", itens: ["Homem, 30 anos.", "Febre."] },
      { tipo: "titulo", texto: "ATENÇÃO:" },
      { tipo: "paragrafo", texto: "Demonstre a técnica." },
    ]);
    expect(blocosDoRelato("Homem, 30 anos.\nFebre há 10 dias.")).toEqual([{ tipo: "lista", itens: ["Homem, 30 anos.", "Febre há 10 dias."] }]);
    // "PA: 120x80" não é título (só avisos conhecidos ou rótulo sozinho na linha)
    expect(blocosDoRelato("PULSO: 80 bpm\nPA: 120x80 mmHg")).toEqual([{ tipo: "lista", itens: ["PULSO: 80 bpm", "PA: 120x80 mmHg"] }]);
  });

  it("HTML: cabeçalho, títulos do modelo, sem nome nem tema; texto da estação escapado", () => {
    const fonte: FolhaFonte = {
      numero: 1, area: "Clínica Médica", duracao_ms: 600000, cenario: "Cenário <script>x</script>", tarefas: "1. receber o paciente;",
      impressos: [{ nome: "Relato do caso clínico", texto: "Homem, 30 anos." }], bloqueio: null,
    };
    const html = folhaHtml(fonte, { logoSrc: "/novo-assets/logo.png" });
    expect(html).toContain("ESTAÇÃO 1</div>");
    expect(html).toContain("AVALIAÇÃO DE HABILIDADES CLÍNICAS");
    expect(html).toContain("Área: Clínica Médica");
    expect(html).toContain("INSTRUÇÕES AO PARTICIPANTE");
    expect(html).toContain("CENÁRIO DE ATENDIMENTO");
    expect(html).toContain("Nos 10 minutos de duração da estação, você deverá executar as seguintes tarefas:");
    expect(html).toContain("RELATO DO CASO CLÍNICO");
    expect(html).toContain("Cenário &lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toMatch(/INEP|Ministério/i);
    // sem relato e sem número: só as instruções, "ESTAÇÃO" sem número
    const sem = folhaHtml({ ...fonte, numero: null, impressos: [] }, { logoSrc: "x" });
    expect(sem).toContain("ESTAÇÃO</div>");
    expect(sem).not.toContain("RELATO");
    expect(textosEsperados(fonte)).toEqual(["Cenário <script>x</script>", "receber o paciente;", "Homem, 30 anos."]);
  });
});

describe("geração da imagem (Chromium) e gravação, sobre o banco em memória", () => {
  let d: DuplaDb;
  let renderer: Renderer | null = null;
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "folha-candidato-"));
  const storage = localStorageDir(tmp);
  let db: ContentDb;

  beforeAll(async () => {
    d = await openDuplaDb();
    for (const sql of buildDuplaTestStatements()) await d.db.exec(sql);
    db = {
      mode: "dev",
      async service<T>(fn: string, args: Record<string, unknown> = {}) {
        const keys = Object.keys(args);
        const r = await d.db.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
        return r.rows[0]?.result as T;
      },
      async asUser() {
        throw new Error("não usado");
      },
      async authenticate() {
        return null;
      },
    };
    renderer = await createRenderer();
  }, 120_000);
  afterAll(async () => {
    await renderer?.close().catch(() => undefined);
    await d?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("estação de teste 1: PNG de ~1604 px, todo o texto da estação conferido, gravado e apontado na estação", async (ctx) => {
    if (!renderer) return ctx.skip();
    const r = await gerarFolha({ db, storage, renderer }, "teste-inep2020-e01", null);
    expect(r.width).toBe(1604);
    expect(r.height).toBeGreaterThan(1600);
    expect(r.path).toBe(`dupla/folhas/${r.sha256}.png`);
    const png = await storage.get(r.path);
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(r.situacao).toMatchObject({ estado: "pronta", com_relato: true });
    const [{ content }] = await d.sql(`select content from public.checklist_station_contents where station_id = 'teste-inep2020-e01'`);
    expect(content.pressing_assets.candidate_sheet).toEqual({ folha: r.sha256 });
    if (process.env.FOLHA_SAIDA) {
      fs.mkdirSync(process.env.FOLHA_SAIDA, { recursive: true });
      fs.writeFileSync(path.join(process.env.FOLHA_SAIDA, "folha-gerada-estacao-01.png"), png);
    }
  }, 120_000);

  it("comando: --simular lista e não gera; com 'todas' gera as aprovadas que faltam (estação sem relato: só as instruções)", async (ctx) => {
    if (!renderer) return ctx.skip();
    const lista = await gerarFolhasPendentes({ db, storage, renderer }, { todas: true, simular: true, max: 3 });
    expect(lista.estacoes).toHaveLength(3);
    expect(lista.estacoes).not.toContain("teste-inep2020-e01"); // já tem folha valendo
    expect(lista.geradas).toEqual([]);
    const feito = await gerarFolhasPendentes({ db, storage, renderer }, { todas: true, max: 1 });
    expect(feito.geradas).toHaveLength(1);
    expect(feito.falhas).toEqual([]);
    const sit = (await d.sql(`select public.dupla_folha_situacao($1) as s`, [feito.geradas[0]]))[0].s;
    expect(sit).toMatchObject({ estado: "pronta", com_relato: false });
    if (process.env.FOLHA_SAIDA) {
      const p = (await d.sql(`select storage_path from public.dupla_station_sheets where station_id = $1`, [feito.geradas[0]]))[0].storage_path;
      fs.writeFileSync(path.join(process.env.FOLHA_SAIDA, `folha-gerada-${feito.geradas[0]}.png`), await storage.get(p));
    }
  }, 120_000);
});

describe("títulos do INEP (padrão desde a folha-1.2; opção B aprovada em 17/10; modelo antigo só para comparação)", () => {
  const fonte: FolhaFonte = {
    numero: 1, area: "Clínica Médica", duracao_ms: 600000,
    cenario: "Nível de atenção: primária.\nA unidade possui:\n• consultório;\n\nDESCRIÇÃO DO CASO\nVocê é um médico atendendo um paciente de 36 anos.",
    tarefas: "1. realizar anamnese;\n2. solicitar exame físico;\nObservação: ATENÇÃO! CASO JULGUE NECESSÁRIO, VERBALIZE! O PACIENTE NÃO DEVERÁ SER TOCADO.",
    impressos: [], bloqueio: null,
  };
  const opc = { logoSrc: "data:image/png;base64,AA==" };

  it("a versão do modelo é a folha-1.2", () => {
    expect(FOLHA_MODELO).toBe("folha-1.2");
  });

  it("padrão: títulos e blocos do caderno, tarefas dentro da descrição, ATENÇÃO em destaque, mesmo texto", () => {
    const h = folhaHtml(fonte, opc);
    expect(h).toContain("INSTRUÇÕES AO PARTICIPANTE");
    expect(h).toContain("CENÁRIO DE ATENDIMENTO");
    expect(h).toContain("DESCRIÇÃO DO CASO");
    expect(h).toContain("Nos 10 minutos de duração da estação, você deverá executar as seguintes tarefas:");
    expect(h).toContain('<span class="atencao-rotulo">ATENÇÃO!</span> CASO JULGUE NECESSÁRIO, VERBALIZE!<br>O PACIENTE NÃO DEVERÁ SER TOCADO.');
    expect(h).not.toMatch(/CENÁRIO DE ATUAÇÃO|Observação:|INSTRUÇÕES PARA O\(A\)/);
    expect(folhaHtml(fonte, { ...opc, titulosInep: true })).toBe(h);
    // a descrição vem depois do bloco do cenário e as tarefas ficam no bloco da descrição
    expect(h.indexOf("CENÁRIO DE ATENDIMENTO")).toBeLessThan(h.indexOf("DESCRIÇÃO DO CASO"));
    expect(h.indexOf("DESCRIÇÃO DO CASO")).toBeLessThan(h.indexOf("realizar anamnese"));
    expect(h.indexOf("realizar anamnese")).toBeLessThan(h.indexOf("ATENÇÃO!"));
    // o texto esperado pela conferência continua todo na página (sem o "Observação:" na frente da nota)
    expect(textosEsperados(fonte)).toContain("ATENÇÃO! CASO JULGUE NECESSÁRIO, VERBALIZE! O PACIENTE NÃO DEVERÁ SER TOCADO.");
    expect(textosEsperados(fonte)).toEqual(textosEsperados(fonte, { titulosInep: true }));
  });

  it("titulosInep: false volta ao modelo antigo (só para comparação)", () => {
    const h = folhaHtml(fonte, { ...opc, titulosInep: false });
    expect(h).toContain("INSTRUÇÕES PARA O(A) PARTICIPANTE");
    expect(h).toContain("CENÁRIO DE ATUAÇÃO");
    expect(h).toContain("Nos próximos 10 minutos, deverão ser realizadas as seguintes tarefas:");
    expect(h).toContain("Observação: ATENÇÃO!");
    expect(h).not.toMatch(/class="caixa"|INSTRUÇÕES AO PARTICIPANTE/);
    expect(textosEsperados(fonte, { titulosInep: false })).toContain("Observação: ATENÇÃO! CASO JULGUE NECESSÁRIO, VERBALIZE! O PACIENTE NÃO DEVERÁ SER TOCADO.");
  });

  it("bloco OBSERVAÇÃO do caderno: depois das tarefas, com título próprio, diferente do ATENÇÃO", () => {
    const comCampo: FolhaFonte = {
      ...fonte, cenario: "Você atende uma paciente.",
      observacao_caderno: { titulo: "OBSERVAÇÃO", linhas: ["O hospital possui a seguinte estrutura:", "• setor de radiologia;", "• laboratório de análises clínicas."] },
    };
    const h = folhaHtml(comCampo, opc);
    expect(h).toContain('<h3 class="caixa-titulo">OBSERVAÇÃO</h3>');
    expect(h).toContain('<p class="obs-p">O hospital possui a seguinte estrutura:</p>');
    expect(h).toContain('<ul class="marcadores obs"><li>setor de radiologia;</li><li>laboratório de análises clínicas.</li></ul>');
    // depois das tarefas e antes do aviso ATENÇÃO (que continua sem prefixo)
    expect(h.indexOf("solicitar exame físico")).toBeLessThan(h.indexOf('caixa-titulo">OBSERVAÇÃO'));
    expect(h.indexOf('caixa-titulo">OBSERVAÇÃO')).toBeLessThan(h.indexOf('<span class="atencao-rotulo">'));
    expect(textosEsperados(comCampo)).toEqual(expect.arrayContaining(["OBSERVAÇÃO", "O hospital possui a seguinte estrutura:", "setor de radiologia;"]));
    // modelo antigo: também depois das tarefas, com o título
    const antigo = folhaHtml(comCampo, { ...opc, titulosInep: false });
    expect(antigo.indexOf("solicitar exame físico")).toBeLessThan(antigo.indexOf(">OBSERVAÇÃO<"));
    // sem o campo, o bloco "OBSERVAÇÃO" no fim do cenário (como o banco guarda) sai do cenário e vai para depois das tarefas
    const noCenario: FolhaFonte = { ...fonte, cenario: "Você atende uma paciente.\n\nOBSERVAÇÃO\nO hospital possui:\n• radiologia;\n• laboratório." };
    expect(cenarioEObservacao(noCenario)).toEqual({
      cenario: ["Você atende uma paciente."],
      observacao: { titulo: "OBSERVAÇÃO", linhas: ["O hospital possui:", "• radiologia;", "• laboratório."] },
    });
    const h2 = folhaHtml(noCenario, opc);
    expect(h2.indexOf("realizar anamnese")).toBeLessThan(h2.indexOf('caixa-titulo">OBSERVAÇÃO'));
    // sem bloco, nada muda
    expect(cenarioEObservacao(fonte).observacao).toBeNull();
    expect(folhaHtml(fonte, opc)).not.toContain('<p class="obs-p">');
  });

  it("ajudantes: divide o cenário no título; sem o título tudo fica no cenário de atendimento; nota sem Observação", () => {
    expect(cenarioInep(["A", "DESCRIÇÃO DO CASO\nB", "C"])).toEqual({ atendimento: ["A"], descricao: ["B", "C"], temDescricao: true });
    expect(cenarioInep(["A", "B"])).toEqual({ atendimento: ["A", "B"], descricao: [], temDescricao: false });
    expect(notaInep("Observação: ATENÇÃO! Faça isso! Não faça aquilo.")).toEqual(["ATENÇÃO! Faça isso!", "Não faça aquilo."]);
    expect(notaInep("Observação: Sem aviso.")).toEqual(["Sem aviso."]);
  });
});
