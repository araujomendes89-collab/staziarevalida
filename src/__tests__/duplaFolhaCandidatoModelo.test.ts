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
import { blocosDoRelato, escapeHtml, folhaHtml, minutosDe, paragrafos, tarefasDe, textosEsperados, type FolhaFonte } from "../shared/dupla/folhaCandidato";
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
    expect(html).toContain("INSTRUÇÕES PARA O(A) PARTICIPANTE");
    expect(html).toContain("CENÁRIO DE ATUAÇÃO");
    expect(html).toContain("Nos próximos 10 minutos, deverão ser realizadas as seguintes tarefas:");
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
