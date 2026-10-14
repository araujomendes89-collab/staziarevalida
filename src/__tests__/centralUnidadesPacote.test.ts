// @vitest-environment node
/** Leitura da ficha do revisor (para-o-revisor-medico.md da GR-001 v3) e geração do pacote do dono (sem banco, sem rede, sem IA). */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { lerFicha } from "../shared/aulas/fichaRevisor.js";
// @ts-expect-error módulo .mjs sem tipos
import { sqlAtualizarAula, sqlConferir, leiaMe } from "../../scripts/aulas/gerar-pacote-unidades.mjs";

const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8"));
const MD = `# GR-001 Teste (v3): o que conferir

A aprovação médica é do revisor, não nossa. **Esta aula não vai para os alunos antes desse sim.**

## Decisões que são suas

| # | Decisão | Como está agora | Onde |
|---|---|---|---|
| 1 | **Cultura: cenário ou "todos"?** O GVS diz as duas coisas (p. 101). | A aula ensina o cenário. | aula, F01 |
| 2 | **Data do 3HP.** Não há documento. | Sem ano. | seção 7 |

## Pontos para conferir no documento original

| # | O que conferir | Onde |
|---|---|---|
| 1 | **Tosse (TB02).** Fonte agora é o texto corrido. | GVS p. 125 |

## Questões de fixação (originais StaziaMed)

Confira se cada alternativa errada é errada sem discussão.

- **Q1:** a letra C tem comentário.

## Fora da aula, por falta de fonte validada ou de escopo

- TARV.
- Doses por peso.
`;

describe("Ficha do revisor", () => {
  it("separa decisões, pontos, notas das questões e o que ficou fora sem inventar nada", () => {
    const f = lerFicha(MD);
    expect(f.decisoes).toEqual([
      { n: 1, titulo: 'Cultura: cenário ou "todos"?', pergunta: "O GVS diz as duas coisas (p. 101).", como_esta: "A aula ensina o cenário.", onde: "aula, F01" },
      { n: 2, titulo: "Data do 3HP.", pergunta: "Não há documento.", como_esta: "Sem ano.", onde: "seção 7" },
    ]);
    expect(f.pontos).toEqual([{ n: 1, texto: "**Tosse (TB02).** Fonte agora é o texto corrido.", onde: "GVS p. 125" }]);
    expect(f.fixacao).toEqual(["**Q1:** a letra C tem comentário."]);
    expect(f.fixacao_instrucao).toBe("Confira se cada alternativa errada é errada sem discussão.");
    expect(f.fora).toEqual(["TARV.", "Doses por peso."]);
    expect(() => lerFicha("# sem decisões\n")).toThrow(/Decisões que são suas/);
  });
  it("a ficha da GR-001 v3 tem 6 decisões e 9 pontos (como no arquivo original)", () => {
    const f = fx("ficha-revisor-GR-001-v3.json");
    expect(f.decisoes.map((d: any) => d.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(f.pontos).toHaveLength(9);
    expect(f.decisoes[2].titulo).toBe("Data do 3HP.");
  });
});

describe("Pacote do dono", () => {
  const pacote = fx("aula-pronta-GR-001-v3.json");
  const sql = sqlAtualizarAula(pacote, [{ doc_id: pacote.fontes[0].ref, instituicao: "Ministério da Saúde" }], fx("ficha-revisor-GR-001-v3.json"), "adm@t.dev");
  it("o arquivo 2 entra como administrador, usa só funções oficiais e nunca aprova nem publica", () => {
    expect(sql).toMatch(/app_ch_register_source/);
    expect(sql).toMatch(/app_ch_import_lesson_package/);
    expect(sql).toMatch(/app_ch_review_sheet_import/);
    expect(sql).not.toMatch(/app_ch_approve|app_ch_publish|app_ch_unit_publish|insert into public\.ch_(approvals|publications)/);
    expect(sql).not.toMatch(/sk-[A-Za-z0-9]{10}|SERVICE_ROLE|api[_-]?key/i);
  });
  it("0-CONFERIR só lê, responde OK ou FALTA e confere as funções, tabelas fechadas e a regra de PDF só da equipe", () => {
    const c = sqlConferir("GR-001");
    expect(c).toMatch(/'OK: Central/);
    expect(c).toMatch(/'FALTA: '/);
    expect(c).toMatch(/ch_unit_materials_so_equipe/);
    // sem erro quando as tabelas de base ainda não existem: confere a existência antes de consultá-las
    expect(c.indexOf("'ch_audit'")).toBeLessThan(c.indexOf("from public.ch_audit a"));
    expect(c).toMatch(/a tabela de base/);
    expect(c).not.toMatch(/\b(insert into public|update public|delete from public|drop |alter )/i);
  });
  it("o LEIA-ME diz a ordem, a etapa futura do áudio/vídeo e que nada foi colado", () => {
    const t = leiaMe(pacote, [], fx("ficha-revisor-GR-001-v3.json"));
    expect(t).toMatch(/NADA DISTO FOI COLADO/);
    expect(t).toMatch(/rodada2, aula-gr001 \(9950\), vigilancia-e-portao/);
    expect(t).toMatch(/SEGUE O MODO GERAL do portão/);
    expect(t).toMatch(/DECISÕES TOMADAS PELO ASSISTENTE/);
    expect(t).toMatch(/NUNCA conferem nem aprovam/);
    expect(t).toMatch(/ETAPA FUTURA/);
    expect(t).toMatch(/administrador ou revisor médico|ADMINISTRADOR ou REVISOR MÉDICO/);
  });
});
