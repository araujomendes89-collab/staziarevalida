// @vitest-environment node
import { describe, expect, it } from "vitest";
// @ts-expect-error módulo .mjs sem tipos (script do Radar de Evidências)
import * as radar from "../../scripts/radar/lib.mjs";

const doc = (o: Record<string, unknown>) => ({ doc_id: "x", titulo: "Doc", instituicao: "Ministério da Saúde", ano: "2024", tipo: "vigente", categoria: "normativa", status_catalogo: "verificado", ...o });
const pag = (n: number, texto: string) => ({ pagina: n, texto });

describe("hash e texto", () => {
  it("sha256 conhecido e estável", () => {
    expect(radar.sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("normaliza acento, caixa e espaços; esqueleto ignora pontuação", () => {
    expect(radar.normalizar("  Tratamento  da TUBERCULOSE ")).toBe("tratamento da tuberculose");
    expect(radar.esqueleto("co-infecção, HIV.")).toBe(radar.esqueleto("coinfeccao HIV"));
  });
});

describe("classificação de pares de frases", () => {
  it("igual, editorial, numérico, negação, reescrita leve e substantiva", () => {
    const base = "Recomenda-se iniciar o tratamento com rifampicina 600 mg por dia durante seis meses";
    expect(radar.classificarPar(base, base).kind).toBe("UNCHANGED");
    expect(radar.classificarPar(base, base.toUpperCase() + ".").kind).toBe("EDITORIAL");
    const num = radar.classificarPar(base, base.replace("600 mg", "450 mg"));
    expect(num.kind).toBe("NUMERIC");
    expect(num.critical).toBe(true);
    const neg = radar.classificarPar(base, base.replace("Recomenda-se", "Não se recomenda"));
    expect(neg.kind).toBe("NEGATION");
    expect(neg.critical).toBe(true);
    expect(radar.classificarPar("O paciente deve ser orientado sobre efeitos adversos comuns do medicamento", "O paciente deve ser orientado sobre os efeitos adversos mais comuns do medicamento").kind).toBe("MINOR_WORDING");
  });
});

describe("HTML oficial", () => {
  it("decodifica entidades e tira script/estilo/tags", () => {
    expect(radar.textoDeHtml("<style>a{}</style><p>Publica&ccedil;&atilde;o &sect; 2&ordm; &#233; &Eacute;</p><script>x()</script>")).toBe("Publicação § 2º é É");
  });
  it("decodifica latin1 do governo (charset no cabeçalho ou no meta) sem virar caractere quebrado", () => {
    const bytes = Buffer.from("Sa\xfade \xe7\xe3o", "latin1");
    expect(radar.decodificarBytes(bytes, "text/html; charset=iso-8859-1")).toBe("Saúde ção");
    expect(radar.decodificarBytes(bytes, "text/html")).toBe("Saúde ção");
    expect(radar.decodificarBytes(Buffer.from("Saúde", "utf8"), "text/html; charset=utf-8")).toBe("Saúde");
  });
  it("renumeração de parágrafo no começo da frase não é mudança numérica", () => {
    expect(radar.classificarPar("6º A Rede Alyne organiza-se a partir dos seguintes componentes", "A Rede Alyne organiza-se a partir dos seguintes componentes").kind).not.toBe("NUMERIC");
  });
});

describe("comparação de versões por trecho e página", () => {
  const antigo = [
    pag(1, "A tuberculose pulmonar é diagnosticada por baciloscopia de escarro positiva. O esquema básico dura seis meses com rifampicina isoniazida pirazinamida etambutol. Pacientes devem ser acompanhados mensalmente na unidade de saúde."),
    pag(2, "O tratamento da infecção latente usa isoniazida por nove meses para adultos. A vigilância de contatos é obrigatória em todos os casos confirmados de tuberculose."),
  ];
  const novo = [
    pag(1, "A tuberculose pulmonar é diagnosticada por baciloscopia de escarro positiva. O esquema básico dura seis meses com rifampicina isoniazida pirazinamida etambutol. Pacientes devem ser acompanhados mensalmente na unidade de saúde."),
    pag(5, "O tratamento da infecção latente usa isoniazida por seis meses para adultos. A vigilância de contatos é obrigatória em todos os casos confirmados de tuberculose. Nova recomendação: rifapentina semanal pode ser indicada como alternativa terapêutica."),
  ];
  it("acha o número alterado com a página de cada lado e a frase nova", () => {
    const r = radar.compararVersoes(antigo, novo);
    const num = r.itens.find((i: any) => i.kind === "NUMERIC");
    expect(num).toBeTruthy();
    expect(num.pagina_antiga).toBe(2);
    expect(num.pagina_nova).toBe(5);
    expect(num.texto_antigo).toContain("nove meses");
    expect(num.texto_novo).toContain("seis meses");
    expect(r.itens.some((i: any) => i.kind === "ADDED" && /rifapentina/.test(i.texto_novo))).toBe(true);
    expect(r.resumo.iguais_exatas).toBeGreaterThanOrEqual(3);
  });
  it("mostra o menor trecho que mudou, não a frase inteira", () => {
    const t = radar.trechoQueMudou("Tratar por nove meses com isoniazida em adultos", "Tratar por seis meses com isoniazida em adultos");
    expect(t.antes).toContain("nove");
    expect(t.depois).toContain("seis");
    expect(t.depois).not.toContain("nove");
  });
  it("textos idênticos não geram mudança", () => {
    const r = radar.compararVersoes(antigo, antigo);
    expect(r.itens).toHaveLength(0);
    expect(r.resumo.mudou).toBe(false);
  });
  it("mudança só de quebra de linha e hifenização não conta", () => {
    const a = [pag(1, "O acompanhamento ambulatorial dos pacientes deve ocorrer mensalmente na unidade básica.")];
    const b = [pag(3, "O acompanhamento ambu-\nlatorial dos pacientes deve ocorrer\nmensalmente na unidade básica.")];
    expect(radar.compararVersoes(a, b).itens).toHaveLength(0);
  });
});

describe("classificação da referência", () => {
  it("vigente só com catálogo verificado, normativa e vigente", () => {
    const c = radar.classificarReferencia(doc({ doc_id: "pcdt-x", titulo: "PCDT Hanseníase" }));
    expect(c.status).toBe("vigente");
    expect(c.norma_sus).toBe(true);
  });
  it("revogada e histórica só servem como histórico", () => {
    expect(radar.classificarReferencia(doc({ status_catalogo: "revogado" })).status).toBe("revogada");
    const h = radar.classificarReferencia(doc({ tipo: "historica" }));
    expect(h.status).toBe("revogada");
    expect(h.uso_permitido).toBe("historico");
  });
  it("consulta pública e preliminar são proposta", () => {
    expect(radar.classificarReferencia(doc({ titulo: "PCDT de X (consulta pública nº 12)" })).status).toBe("proposta");
    expect(radar.classificarReferencia(doc({ versao: "versão preliminar 2026" })).status).toBe("proposta");
  });
  it("PCDT aprovado por portaria não vira proposta só por citar a consulta pública do histórico", () => {
    expect(radar.classificarReferencia(doc({ versao: "Portaria SECTICS/MS nº 49, de 23/07/2025; Conitec: consulta pública nº 11/2025" })).status).toBe("vigente");
    expect(radar.classificarReferencia(doc({ versao: "Relatório de Recomendação, julho de 2026; versão preliminar sujeita a mudança" })).status).toBe("proposta");
  });
  it("recomendação recente de sociedade ou OMS nunca vira norma do SUS", () => {
    const soc = radar.classificarReferencia(doc({ instituicao: "Federação Brasileira das Associações de Ginecologia e Obstetrícia (Febrasgo)", categoria: "complementar", ano: "2026" }));
    expect(soc.status).toBe("evidencia_complementar");
    expect(soc.norma_sus).toBe(false);
    const oms = radar.classificarReferencia(doc({ instituicao: "Organização Mundial da Saúde", categoria: "normativa" }));
    expect(oms.status).toBe("evidencia_complementar");
    expect(oms.norma_sus).toBe(false);
  });
  it("sem verificação do catálogo, status desconhecido", () => {
    expect(radar.classificarReferencia(doc({ status_catalogo: "versao_a_confirmar" })).status).toBe("desconhecido");
    expect(radar.classificarReferencia(doc({ status_catalogo: "nao_encontrado" })).status).toBe("desconhecido");
  });
  it("SAMU é fonte proibida, mesmo vigente e verificada", () => {
    const c = radar.classificarReferencia(doc({ doc_id: "ms-samu-protocolo-sav", titulo: "Protocolos de Suporte Avançado de Vida (Protocolo SAMU 192)" }));
    expect(c.status).toBe("proibida_samu");
    expect(c.uso_permitido).toBe("nenhum");
  });
  it("prova oficial é marcada com gabarito imutável", () => {
    expect(radar.classificarReferencia(doc({ categoria: "oficial_exame" })).gabarito_inep_imutavel).toBe(true);
    expect(radar.classificarReferencia(doc({ categoria: "normativa" })).gabarito_inep_imutavel).toBe(false);
  });
});

describe("famílias, duplicatas e decisão de mudança", () => {
  it("agrupa edições do mesmo título, mas volumes diferentes são documentos diferentes", () => {
    const f = radar.familiasDeVersoes([
      doc({ doc_id: "a19", titulo: "Manual de Recomendações para o Controle da Tuberculose no Brasil (2019)", ano: "2019" }),
      doc({ doc_id: "a11", titulo: "Manual de Recomendações para o Controle da Tuberculose no Brasil (2011)", ano: "2011" }),
      doc({ doc_id: "g1", titulo: "Guia de Vigilância em Saúde: volume 1 (6ª edição revisada)" }),
      doc({ doc_id: "g2", titulo: "Guia de Vigilância em Saúde: volume 2 (6ª edição revisada)" }),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].docs.map((d: any) => d.doc_id).sort()).toEqual(["a11", "a19"]);
  });
  it("duplicata exata por sha256", () => {
    expect(radar.duplicatasExatas([{ doc_id: "a", sha256: "h" }, { doc_id: "b", sha256: "h" }, { doc_id: "c", sha256: "z" }])).toEqual([{ sha256: "h", doc_ids: ["a", "b"] }]);
  });
  it("decidirMudanca separa mudança real de metadados e de falha", () => {
    expect(radar.decidirMudanca({ sha256: "a" }, { sha256: "a" }).mudou).toBe(false);
    expect(radar.decidirMudanca({ sha256: "a" }, { sha256: "b" }).mudou).toBe(true);
    expect(radar.decidirMudanca({ sha256: "a", texto_sha256: "t" }, { sha256: "b", texto_sha256: "t" })).toMatchObject({ mudou: false, motivo: "metadados_apenas" });
    expect(radar.decidirMudanca({}, { sha256: "b" }).motivo).toBe("sem_base");
    expect(radar.decidirMudanca({ sha256: "a" }, { erro: "HTTP 404" }).motivo).toBe("fora_do_ar");
  });
});

describe("mapa fonte → usos", () => {
  const dossies = { temas: [{ tema: "GR-001", titulo: "Tuberculose", fontes: [{ id: "tb-manual", papel: "principal" }] }, { tema: "GR-002", titulo: "Diabetes", fontes: [{ id: "tb-manual", papel: "complementar" }] }] };
  const ligacao = { questoes: [
    { question_id: "q1", tema_id: "GR-001", status: "valid" },
    { question_id: "q2", tema_id: "GR-001", status: "annulled" },
    { question_id: "q3", tema_id: null, status: "valid" },
    { question_id: "q4", tema_id: "GR-002", status: "valid" },
  ] };
  it("liga fonte a temas, aulas e questões válidas; anulada e sem tema ficam de fora", () => {
    const m = radar.montarMapaUsos(dossies, ligacao);
    const u = m.get("tb-manual");
    expect(u.questoes.sort()).toEqual(["q1", "q4"]);
    expect(u.aulas.sort()).toEqual(["GR-001", "GR-002"]);
    expect(m.get("inexistente")).toBeUndefined();
  });
  it("itens afetados são sempre 'revalidar' e podem se limitar ao papel principal", () => {
    const m = radar.montarMapaUsos(dossies, ligacao);
    const todos = radar.itensAfetados("tb-manual", m);
    expect(todos.itens.every((i: any) => i.acao === "revalidar")).toBe(true);
    expect(todos.itens.filter((i: any) => i.tipo === "aula")).toHaveLength(2);
    const so = radar.itensAfetados("tb-manual", m, { principalSomente: true });
    expect(so.itens.filter((i: any) => i.tipo === "aula").map((i: any) => i.ref)).toEqual(["GR-001"]);
    expect(radar.itensAfetados("zzz", m).itens).toEqual([]);
  });
});

describe("IA: custo e sanitização", () => {
  it("custo estimado", () => {
    expect(radar.custoEstimadoUsd("gemini-3.5-flash-lite", 1_000_000, 1_000_000)).toBe(2.8);
    expect(radar.custoEstimadoUsd("gemini-3.1-flash-lite", 1_000_000, 1_000_000)).toBe(1.75);
    expect(radar.custoEstimadoUsd("gemini-2.5-flash", 1, 1)).toBeNull(); // família 2.5 fora do ar desde 20/10/2026
    expect(radar.custoEstimadoUsd("modelo-desconhecido", 1, 1)).toBeNull();
  });
  it("a resposta da IA sempre exige revisão médica e é cortada", () => {
    const r = radar.sanitizarAnaliseIA({ o_que_mudou: "x".repeat(3000), certeza: "absoluta", precisa_revisao_medica: false });
    expect(r.o_que_mudou.length).toBe(900);
    expect(r.certeza).toBe("baixa");
    expect(r.precisa_revisao_medica).toBe(true);
  });
  it("aceita resposta embrulhada em lista e campos em lista", () => {
    const r = radar.sanitizarAnaliseIA([{ o_que_mudou: ["a", "b"], certeza: "alta" }]);
    expect(r.o_que_mudou).toBe("a b");
    expect(r.certeza).toBe("alta");
  });
});
