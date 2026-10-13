// @vitest-environment node
/**
 * Carga das explicações — o gerador (scripts/carga-explicacoes/gerar-sql.mjs), com as saídas REAIS dos agentes Professor e Auditor
 * (fixtures/carga-explicacoes, ver o LEIA-ME de lá). O banco é testado em cargaExplicacoesBanco.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
// @ts-ignore módulo .mjs sem tipos
import * as G from "../../scripts/carga-explicacoes/gerar-sql.mjs";

const FIX = path.join(__dirname, "fixtures/carga-explicacoes");
const real = (prova: string, arq: string) => JSON.parse(fs.readFileSync(path.join(FIX, "revisao", prova, arq), "utf8"));
const DECISOES = JSON.parse(fs.readFileSync(path.join(FIX, "decisoes-divergencias.json"), "utf8"));
let dir: string;

/** Cópia da pasta de revisão com o Auditor gravado DEPOIS do Professor (como no fluxo dos agentes). */
function copia() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "carga-expl-"));
  fs.cpSync(path.join(FIX, "revisao"), d, { recursive: true });
  const antes = new Date("2026-10-12T17:00:00Z");
  const depois = new Date("2026-10-12T18:00:00Z");
  for (const prova of fs.readdirSync(d)) {
    for (const f of fs.readdirSync(path.join(d, prova))) fs.utimesSync(path.join(d, prova, f), antes, f.startsWith("aud-") ? depois : antes);
  }
  return d;
}
const tudo = (decisoes: any = {}) => G.gerarTudo({ pasta: dir, decisoes, geradoEm: "13/10/2026 teste" });
const linha = (r: any, id: string) => r.resultados.flatMap((x: any) => x.linhas).find((l: any) => l.id === id);
const item = (r: any, id: string) => r.resultados.flatMap((x: any) => x.itens).find((i: any) => i.id === id);

beforeAll(() => {
  dir = copia();
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("classificação com os vereditos reais do Auditor", () => {
  it("'ok' sem pedido de revisão médica e confiança alta: entra e pode ir direto pela regra B", () => {
    const r = tudo();
    expect(linha(r, "revalida_2022_2_q052")).toMatchObject({ situacao: "entra", destino: "direto_b", veredito: "ok" });
    const i = item(r, "revalida_2022_2_q052");
    const p = real("revalida_2022_2", "prof-01.json").find((x: any) => x.id === "revalida_2022_2_q052");
    expect(i.explicacoes).toEqual(Object.fromEntries(["A", "B", "C", "D"].map((l) => [l, G.limpa(p.explicacao[l])])));
    expect(i.conduta).toBe(G.limpa(p.conduta_esperada));
    expect(i.carga.regra_b).toBe(true);
  });

  it("'ok' com pedido de revisão médica: entra, mas nunca direto", () => {
    expect(linha(tudo(), "revalida_2022_2_q025")).toMatchObject({ situacao: "entra", destino: "revisao" });
  });

  it("'corrigir': a reescrita do Auditor substitui só a letra corrigida e nunca vai direto", () => {
    const r = tudo();
    const aud = real("enamed_2025", "aud-01.json").find((x: any) => x.id === "enamed_2025_q041");
    const prof = real("enamed_2025", "prof-01.json").find((x: any) => x.id === "enamed_2025_q041");
    const i = item(r, "enamed_2025_q041");
    expect(i.explicacoes.D).toBe(G.limpa(aud.correcoes.explicacao.D));
    expect(i.explicacoes.D).not.toBe(G.limpa(prof.explicacao.D));
    expect(i.explicacoes.A).toBe(G.limpa(prof.explicacao.A));
    expect(i.carga.correcoes_aplicadas).toContain("explicacao.D");
    expect(linha(r, "enamed_2025_q041").destino).toBe("revisao");
    // as correções internas (pontos de atenção) só vão para o que a equipe vê, nunca para o texto do aluno
    expect(i.carga.pontos_de_atencao).toEqual(aud.correcoes.pontos_de_atencao.map(G.limpa));
    expect(JSON.stringify([i.explicacoes, i.conduta, i.avalia, i.tema, i.subtema])).not.toContain(G.limpa(aud.correcoes.pontos_de_atencao[0]));
  });

  it("'corrigir' com suspeita de gabarito: entra só para o revisor médico", () => {
    const r = tudo();
    expect(linha(r, "revalida_2020_1_q100")).toMatchObject({ situacao: "entra", destino: "revisao" });
    expect(item(r, "revalida_2020_1_q100").carga.suspeita_gabarito).toBeTruthy();
  });

  it("'divergente' sem decisão do dono: fora da carga e na lista de divergências, com o texto proposto e as opções", () => {
    const r = tudo();
    expect(linha(r, "revalida_2020_1_q008").situacao).toBe("divergente");
    expect(item(r, "revalida_2020_1_q008")).toBeUndefined();
    const d = r.resultados.flatMap((x: any) => x.divergencias).find((x: any) => x.id === "revalida_2020_1_q008");
    expect(d).toMatchObject({ prova: "revalida_2020_1", gabarito: "D", veredito_auditor: "divergente", tipo: ["gabarito"] });
    expect(d.motivos.join(" ")).toMatch(/fístula perianal/);
    expect(Object.keys(d.opcoes)).toEqual(["A", "B", "C", "D"]);
  });

  it("'divergente' com a decisão real do dono (A: manter o gabarito): entra, só para o revisor, com a reescrita do Auditor", () => {
    const r = tudo(DECISOES);
    const aud = real("revalida_2020_1", "aud-01.json").find((x: any) => x.id === "revalida_2020_1_q008");
    expect(linha(r, "revalida_2020_1_q008")).toMatchObject({ situacao: "entra", destino: "revisao" });
    const i = item(r, "revalida_2020_1_q008");
    expect(i.explicacoes.C).toBe(G.limpa(aud.correcoes.explicacao.C));
    expect(i.explicacoes.D).toMatch(/^Correta\./);
    expect(i.carga.decisao_dono).toBe("A");
  });

  it("o texto ORIGINAL do Professor nessa divergente tinha aviso interno: o gerador barra (nunca chega ao aluno)", () => {
    const prof = real("revalida_2020_1", "prof-01.json").find((x: any) => x.id === "revalida_2020_1_q008");
    const q = real("revalida_2020_1", "corrigidas-todas.json").find((x: any) => x.id === "revalida_2020_1_q008");
    const c = G.conferirTextos(q, prof, false);
    expect(c.fora.join(" ")).toMatch(/sinalizada|revisão médica/);
  });

  it("anulada sem Auditor e nota sem Auditor: ficam de fora ('falta Auditor'); o texto real da anulada não tem 'Correta.'", () => {
    const r = tudo();
    expect(linha(r, "revalida_2023_1_q007")).toMatchObject({ situacao: "falta_auditor", anulada: true });
    expect(linha(r, "revalida_2021_1_q064").situacao).toBe("falta_auditor");
    const p = real("revalida_2023_1", "prof-anuladas.json")[0];
    const q = real("revalida_2023_1", "corrigidas-todas.json")[0];
    expect(G.conferirTextos(q, p, true).fora).toEqual([]);
    expect(p.aviso_aluno).toBe(G.AVISO_ANULADA);
    expect(Object.values(p.explicacao).some((t: any) => /^Correta\./.test(t))).toBe(false);
  });

  it("Professor refez o lote depois da auditoria: a auditoria é antiga e a questão não entra", () => {
    const d = copia();
    try {
      const f = path.join(d, "revalida_2022_2", "prof-01.json");
      fs.utimesSync(f, new Date(), new Date("2026-10-12T19:00:00Z"));
      const r = G.gerarTudo({ pasta: d, decisoes: {}, geradoEm: "x" });
      expect(linha(r, "revalida_2022_2_q052").situacao).toBe("auditoria_antiga");
      expect(item(r, "revalida_2022_2_q052")).toBeUndefined();
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("gabarito e situação vêm da prova, nunca do Professor; os campos internos não entram no item", () => {
    const r = tudo(DECISOES);
    for (const i of r.resultados.flatMap((x: any) => x.itens)) {
      const q = r.resultados.flatMap((x: any) => x.linhas).find((l: any) => l.id === i.id);
      expect(q).toBeTruthy();
      for (const k of ["perfil", "pontos_de_atencao", "confianca", "motivo_provavel_anulacao", "divergencia_gabarito", "precisa_conferir_diretriz"]) expect(i).not.toHaveProperty(k);
      expect(i.explicacoes[i.gabarito]).toMatch(/^Correta\./);
    }
  });
});

describe("pacote e arquivos de apoio", () => {
  it("uma parte por prova com o que entrou, a regra B à parte, o CONFERIR, o LEIA-ME, as divergências e os perfis", () => {
    const saida = fs.mkdtempSync(path.join(os.tmpdir(), "carga-pacote-"));
    try {
      const r = tudo();
      const arquivos = G.escreverPacote(r, { saida });
      expect(arquivos).toEqual(["1-Estrutura-carga-das-explicacoes.sql", "2-Prova-01-revalida_2020_1.sql", "2-Prova-02-revalida_2022_2.sql",
        "2-Prova-03-enamed_2025.sql", "3-OPCIONAL-regra-B-liberar-direto.sql", "0-CONFERIR.sql", "LEIA-ME.txt"]);
      const parte = fs.readFileSync(path.join(saida, "2-Prova-02-revalida_2022_2.sql"), "utf8");
      expect(parte).toContain("question_explanations_apply($carga$[");
      expect(parte).not.toContain("pontos_de_atencao\":[]}"); // os pontos vão dentro de "carga" (equipe), nunca soltos
      const b = fs.readFileSync(path.join(saida, "3-OPCIONAL-regra-B-liberar-direto.sql"), "utf8");
      expect(b).toContain("revalida_2022_2_q052");
      expect(b).not.toContain("revalida_2022_2_q093");
      expect(fs.readFileSync(path.join(saida, "LEIA-ME.txt"), "utf8")).toContain("A) RECOMENDADA");
      const div = JSON.parse(fs.readFileSync(path.join(dir, "divergencias-para-o-dono.json"), "utf8"));
      expect(div.map((x: any) => x.id)).toEqual(["revalida_2020_1_q008"]);
      const perfis = JSON.parse(fs.readFileSync(path.join(dir, "perfis-para-similaridade.json"), "utf8"));
      expect(perfis.map((x: any) => x.id).sort()).toEqual(["revalida_2021_1_q064", "revalida_2023_1_q007"]); // o piloto não tinha perfil
      expect(perfis[0].perfil).toHaveProperty("competencia");
      const rel = fs.readFileSync(path.join(dir, "carga-explicacoes-relatorio.md"), "utf8");
      expect(rel).toContain("| Revalida 2022/2 | 3 | 3 | 0 | 3 | 3 | 2 | 1 | 0 | 0 | 0 | 0 | 3 | 1 | 0 | 0 |");
    } finally {
      fs.rmSync(saida, { recursive: true, force: true });
    }
  });
});
