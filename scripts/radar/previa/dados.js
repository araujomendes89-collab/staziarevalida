// Dados SIMULADOS para a prévia (nada vem do banco). Mesmo formato de app_admin_radar_fila_detalhada.
const h = (n) => new Date(Date.now() + n * 3_600_000).toISOString();
const vazioBase = { origem: "adaptador_mudou", itens: [], itens_total: 0, analise: null, afetados: [], afetados_total: 0, afetados_pendentes: 0, nota: null, decidido_em: null, decisao_dono: null, parecer: null, parecer_em: null, resumo: {}, aguarda_dono: false };
const q = (n, pag) => ({ tipo: "questao", ref: `REV-2024-${String(n).padStart(3, "0")}`, nivel: pag ? "trecho" : "tema", paginas: pag ?? [], citacao: pag ? "Tabela de doses da página " + pag[0] : null, status: "pendente" });

export const GRAVES = [
  { ...vazioBase, evento: "g1", gravidade: "grave", aguarda_dono: true, status: "pendente", origem: "adaptador_mudou", motivo: "Conduta alterada: a dose inicial do anti-hipertensivo mudou", detectado_em: h(-30), prazo_revisao_ate: h(18),
    fonte: { doc_id: "conitec:pcdt-has", nome: "Diretriz Brasileira de Hipertensão Arterial, atualização 2026", orgao: "Ministério da Saúde / Conitec", url: "https://www.gov.br/conitec/", referencia: "vigente", esfera: "sus", norma_sus: true, vigencia_normativa: "Portaria SECTICS/MS nº 12, de 10/09/2026" },
    itens: [
      { kind: "NUMERIC", critical: true, pagina_antiga: 42, pagina_nova: 44, antes: "iniciar com 5 mg ao dia", depois: "iniciar com 10 mg ao dia" },
      { kind: "NEGATION", critical: true, pagina_antiga: 51, pagina_nova: 53, antes: "pode ser associada a diurético", depois: "não deve ser associada a diurético" },
    ], itens_total: 7,
    analise: { o_que_mudou: "A dose inicial do primeiro fármaco passou de 5 mg para 10 mg ao dia, e a associação com diurético deixou de ser recomendada.", recomendacao_alterada: "Dose inicial e associação medicamentosa.", impacto_clinico_provavel: "Questões sobre tratamento inicial da hipertensão podem ter o gabarito explicado com a dose antiga.", certeza: "alta" },
    afetados: [q(14, [42, 44]), q(87, [51, 53]), q(203, [42]), { tipo: "aula", ref: "GR-031", nivel: "tema", paginas: [], citacao: null, status: "pendente" }, { tipo: "atualizacao", ref: "A-118", nivel: "tema", paginas: [], citacao: null, status: "pendente" }, ...[301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314].map((n) => q(n))], afetados_total: 19, afetados_pendentes: 19,
    parecer: "Revisor 1: confirma a mudança de dose na p. 44.\nRevisor 2: confirma, e pede conferir a aula GR-031.", parecer_em: h(-6) },
  { ...vazioBase, evento: "g2", gravidade: "grave", aguarda_dono: true, status: "em_revisao", origem: "fonte_oficial_mudou", motivo: "Fonte revogada pelo Ministério da Saúde", detectado_em: h(-60), prazo_revisao_ate: h(-12),
    fonte: { doc_id: "pdf:protocolo-sifilis", nome: "Protocolo Clínico de Sífilis em Gestantes (versão de 2022)", orgao: "Ministério da Saúde", url: "https://www.gov.br/saude/", referencia: "revogada", esfera: "sus", norma_sus: true, vigencia_normativa: "Revogado pela Portaria GM/MS nº 3.210/2026" },
    itens: [], itens_total: 0, analise: null,
    afetados: [q(55, [9]), { tipo: "aula", ref: "GR-044", nivel: "tema", paginas: [], citacao: null, status: "pendente" }], afetados_total: 2, afetados_pendentes: 2 },
];
export const LEVES = [
  { ...vazioBase, evento: "l1", gravidade: "leve", status: "pendente", motivo: "Só a numeração dos quadros mudou", detectado_em: h(-20), prazo_revisao_ate: h(28),
    fonte: { doc_id: "febrasgo:fps", nome: "Febrasgo, Protocolo de rastreio do câncer de colo do útero", orgao: "Febrasgo", url: "https://www.febrasgo.org.br/", referencia: "evidencia_complementar", esfera: "sociedade", norma_sus: false },
    itens: [{ kind: "REWORDED", critical: false, pagina_antiga: 6, pagina_nova: 6, antes: "Quadro 3: periodicidade", depois: "Quadro 4: periodicidade" }], itens_total: 1,
    afetados: [{ tipo: "aula", ref: "GR-020", nivel: "tema", paginas: [], citacao: null, status: "pendente" }], afetados_total: 1, afetados_pendentes: 1 },
  { ...vazioBase, evento: "l2", gravidade: "leve", status: "descartada", decisao_dono: "sem_impacto", nota: "Só mudou o cabeçalho da página; conferido.", decidido_em: h(-3), motivo: "Redação do cabeçalho", detectado_em: h(-70), prazo_revisao_ate: h(-22),
    fonte: { doc_id: "pni:calendario", nome: "Calendário Nacional de Vacinação 2026", orgao: "PNI / Ministério da Saúde", url: "https://www.gov.br/saude/", referencia: "vigente", esfera: "sus", norma_sus: true }, afetados: [], afetados_total: 1, afetados_pendentes: 0 },
];
export function cenario(nome) {
  if (nome === "vazio") return [];
  if (nome === "sem-graves") return structuredClone(LEVES);
  return structuredClone([...GRAVES, ...LEVES]);
}
