// @vitest-environment node
/**
 * Treino em Dupla · decisão (b) do dono de 17/10, opção 2: quando o relato do caso vai para a folha do candidato, as tarefas
 * "ler o impresso 1 (relato do caso…)" e "conforme orientação do impresso 1" passam a citar o relato. Só na hora de mostrar
 * (folha em imagem, folha em texto, painel do avaliador): o texto oficial guardado não muda. Estação de TESTE da leucemia
 * (INEP 2020, e01), no banco em memória (PGlite com as migrações reais).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { relatoNaFolha, tarefasAjustadas } from "../shared/dupla/tarefasRelato";
import { FOLHA_MODELO, folhaHtml, tarefasDaFolha, textosEsperados, type FolhaFonte } from "../shared/dupla/folhaCandidato";
import { makeRoom, openDuplaDb, setDupla, setPlan, U, type DuplaDb } from "./helpers/duplaDb";
import { buildDuplaTestStatements } from "../../server/dupla/testStations";
import estacoes from "../../server/dupla/data/teste-inep2020.json";

const E01 = (estacoes as any[]).find((s) => s.id === "teste-inep2020-e01");
const OFICIAL = E01.doctor_tasks as string;
const AJUSTADO =
  "1. ler o relato do caso clínico (na sua folha, acima);\n2. receber o paciente;\n3. realizar exame físico específico, conforme orientação do relato do caso;\n4. responder aos questionamentos do paciente simulado.";

describe("regra do texto das tarefas", () => {
  it("estação da leucemia (e01): as duas citações do impresso 1 passam a citar o relato; o resto fica igual", () => {
    expect(OFICIAL).toContain("ler o impresso 1 (relato do caso clínico presente sobre a mesa do consultório)");
    expect(tarefasAjustadas(OFICIAL, true)).toBe(AJUSTADO);
    // sem o relato na folha: igual ao oficial
    expect(tarefasAjustadas(OFICIAL, false)).toBe(OFICIAL);
  });

  it("variações de escrita; nunca mexe em 'impresso 10' nem em impresso 1 que não é relato", () => {
    expect(tarefasAjustadas("1. Ler o Impresso nº 1 (Relato de caso);", true)).toBe("1. Ler o relato do caso clínico (na sua folha, acima);");
    expect(tarefasAjustadas("Leia o impresso 01 (relato do caso clínico).", true)).toBe("Leia o relato do caso clínico (na sua folha, acima).");
    expect(tarefasAjustadas("conforme orientação contida no impresso 1;", true)).toBe("conforme orientação contida no relato do caso;");
    expect(tarefasAjustadas("ler o impresso 10 (relato do caso);", true)).toBe("ler o impresso 10 (relato do caso);");
    expect(tarefasAjustadas("conforme orientação do impresso 12;", true)).toBe("conforme orientação do impresso 12;");
    expect(tarefasAjustadas("interpretar o impresso 1 (hemograma);", true)).toBe("interpretar o impresso 1 (hemograma);");
    expect(tarefasAjustadas(null, true)).toBe("");
  });

  it("relato na folha: na sala, só um impresso INICIAL com nome de relato; no gerador, os impressos que vão para a folha", () => {
    expect(relatoNaFolha([{ name: "Relato do caso", initially_visible: true }])).toBe(true);
    expect(relatoNaFolha([{ name: "Relato do caso", initially_visible: false }])).toBe(false);
    expect(relatoNaFolha([{ name: "Instruções ao participante", initially_visible: true }])).toBe(false);
    expect(relatoNaFolha([{ name: "Hemograma", initially_visible: true }])).toBe(false);
    expect(relatoNaFolha(undefined)).toBe(false);
    expect(relatoNaFolha([{ nome: "Relato do caso clínico", texto: "x" }], true)).toBe(true);
    expect(relatoNaFolha([], true)).toBe(false);
  });

  it("folha (modelo folha-1.2): com o relato, as tarefas saem ajustadas e a conferência espera o texto ajustado", () => {
    expect(FOLHA_MODELO).toBe("folha-1.2");
    const fonte: FolhaFonte = {
      numero: 1, area: "Clínica Médica", duracao_ms: 600000, cenario: "Cenário.", tarefas: OFICIAL,
      impressos: [{ nome: "Relato do caso clínico", texto: "Homem, 30 anos." }], bloqueio: null,
    };
    const html = folhaHtml(fonte, { logoSrc: "x" });
    expect(html).toContain("ler o relato do caso clínico (na sua folha, acima);");
    expect(html).toContain("conforme orientação do relato do caso;");
    expect(html).not.toContain("impresso 1");
    expect(textosEsperados(fonte)).toContain("ler o relato do caso clínico (na sua folha, acima);");
    // sem relato na folha (só as instruções): as tarefas saem como estão
    const sem = { ...fonte, impressos: [] };
    expect(tarefasDaFolha(sem)).toBe(OFICIAL);
    expect(folhaHtml(sem, { logoSrc: "x" })).toContain("ler o impresso 1 (relato do caso clínico presente sobre a mesa do consultório);");
  });
});

describe("estação de teste e01 no banco: o texto oficial guardado não muda", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
    for (const sql of buildDuplaTestStatements()) await d.db.exec(sql);
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    for (const u of [U.ana, U.bruno]) await setPlan(d.db, u, "pro", "active");
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });

  it("fonte da folha e conteúdo da sala trazem o oficial; a regra mostra o ajustado", async () => {
    const { fonte } = (await d.sql(`select public.ch_worker_dupla_folha_fonte('teste-inep2020-e01') as r`))[0].r;
    expect(fonte.tarefas).toBe(OFICIAL);
    expect(fonte.impressos.map((i: any) => i.nome)).toEqual(["Relato do caso clínico"]);
    expect(tarefasDaFolha(fonte)).toBe(AJUSTADO);

    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "running", candidate: U.ana, evaluator: U.bruno, station: "teste-inep2020-e01" });
    for (const uid of [U.ana, U.bruno]) {
      const c = await d.rpc(uid, "app_dupla_room_content", { p_room_id: sala });
      expect(c.station.doctor_tasks).toBe(OFICIAL);
      expect(relatoNaFolha(c.pressings)).toBe(true);
      expect(tarefasAjustadas(c.station.doctor_tasks, relatoNaFolha(c.pressings))).toBe(AJUSTADO);
      // os demais impressos seguem numerados a partir de 1 (o esfregaço é o "Impresso 1" na tela)
      expect(c.pressing_count).toBe(1);
    }
    const [{ tarefas }] = await d.sql(`select content ->> 'doctor_tasks' as tarefas from public.checklist_station_contents where station_id = 'teste-inep2020-e01'`);
    expect(tarefas).toBe(OFICIAL);
  });
});
