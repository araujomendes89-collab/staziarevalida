/**
 * Dados REAIS para os testes das Fontes vinculadas (regra do dono de 12/10/2026: nada de conteúdo inventado, nem nos testes).
 *  - Fontes: copiadas do catálogo de fontes conferido (fontes-catalogo/catalogo-v2.json, 12/10/2026): título, instituição, ano,
 *    link, versão e ato exatamente como estão lá (o id do catálogo vai no comentário; a versão é o texto "versao" do catálogo,
 *    como a importação do catálogo grava na biblioteca). Só a "infraestrutura" é simulada: a situação na
 *    biblioteca (vigente, substituída, complementar, consulta pública) segue o catálogo; a marca "complementar" do ATLS é
 *    simulada só para testar a recusa (o catálogo não tem apostila).
 *  - Questões e trechos: questões oficiais reais (comentarios-agentes/questoes-1200.json, as mesmas da carga do banco de teste).
 *    A "citação" de cada vínculo de teste é um trecho LITERAL do enunciado da própria questão (não é texto do documento): por
 *    isso o local no documento é sempre "Enunciado da questão", e nenhum número de página é inventado.
 */
export const SECAO_ENUNCIADO = "Enunciado da questão";

/** ENAMED 2025, questão 1 (insuficiência cardíaca com fração de ejeção reduzida). */
export const Q_IC = { id: "enamed_2025_q001", code: "ENAMED-2025-Q001" };
export const TRECHO_IC_1 = "Ecocardiograma transtorácico evidencia hipertrofia ventricular esquerda concêntrica, associada com fração de ejeção de 38% (por Simpson).";
export const TRECHO_IC_2 = "Exames laboratoriais normais, salvo pela elevação sérica de peptídeo natriurético tipo B (BNP).";
/** ENAMED 2025, questão 12 (rastreamento na UBS): o enunciado real tem um apóstrofo ("kg/m'"), bom para testar o texto no SQL. */
export const Q_RASTREAMENTO = { id: "enamed_2025_q012", code: "ENAMED-2025-Q012" };
export const TRECHO_RASTREAMENTO = "Exame físico: pressão arterial de 120 x 80 mmHg, índice de massa corporal de 23 kg/m', sem outras alterações.";

export interface FonteReal {
  catalogo: string;
  title: string;
  organ: string;
  version: string;
  url: string;
  act: string | null;
  /** data do ato que aprovou a versão, quando o catálogo informa o dia; senão nulo */
  published_on: string | null;
  kind: "final" | "public_consultation" | "society_guideline";
  status: "current" | "superseded";
  audience: "oficial" | "complementar";
}

/** catálogo: ms-pcdt-ic-fer-2024 (vigente) */
export const PCDT_IC: FonteReal = {
  catalogo: "ms-pcdt-ic-fer-2024",
  title: "Protocolo Clínico e Diretrizes Terapêuticas da Insuficiência Cardíaca com Fração de Ejeção Reduzida",
  organ: "Ministério da Saúde (SAES e SECTICS)",
  version: "Portaria Conjunta SAES/SECTICS nº 10, de 13/09/2024; anexo alterado em 11/11/2024",
  url: "https://www.gov.br/saude/pt-br/assuntos/pcdt/i/insuficiencia-cardiaca-com-fracao-de-ejecao-reduzida",
  act: "Portaria Conjunta SAES/SECTICS nº 10, de 13/09/2024 (anexo alterado em 11/11/2024)",
  published_on: "2024-09-13",
  kind: "final",
  status: "current",
  audience: "oficial",
};
/** catálogo: sbc-ic-2026 (vigente) */
export const SBC_IC_2026: FonteReal = {
  catalogo: "sbc-ic-2026",
  title: "Diretriz Brasileira de Insuficiência Cardíaca - 2026",
  organ: "Sociedade Brasileira de Cardiologia (SBC), Departamento de Insuficiência Cardíaca (DEIC), publicado nos Arquivos Brasileiros de Cardiologia",
  version: "Arq Bras Cardiol 2026; v.123, n.10, e20260830; DOI 10.36660/abc.20260830; out/2026; 1º autor Marcus Vinicius Simões",
  url: "https://abccardiol.org/article/diretriz-brasileira-de-insuficiencia-cardiaca-2026/",
  act: null,
  published_on: null,
  kind: "society_guideline",
  status: "current",
  audience: "oficial",
};
/** catálogo: sbc-ic-2018 (revogado; substituído pela diretriz de 2026) */
export const SBC_IC_2018: FonteReal = {
  catalogo: "sbc-ic-2018",
  title: "Diretriz Brasileira de Insuficiência Cardíaca Crônica e Aguda",
  organ: "Sociedade Brasileira de Cardiologia (SBC), publicado nos Arquivos Brasileiros de Cardiologia e Departamento de Insuficiência Cardíaca (DEIC)",
  version: "Arq Bras Cardiol 2018; v.111, n.3, p.436-539",
  url: "https://abccardiol.org/wp-content/uploads/articles_xml/0066-782X-abc-111-03-0436/0066-782X-abc-111-03-0436.x44344.pdf",
  act: null,
  published_on: null,
  kind: "society_guideline",
  status: "superseded",
  audience: "oficial",
};
/** catálogo: cab-29-rastreamento-2010 (vigente) */
export const CAB_RASTREAMENTO: FonteReal = {
  catalogo: "cab-29-rastreamento-2010",
  title: "Rastreamento (Cadernos de Atenção Primária, nº 29)",
  organ: "Ministério da Saúde (Secretaria de Atenção à Saúde, Departamento de Atenção Básica)",
  version: "1ª edição, 2010; Série A. Normas e Manuais Técnicos; ISBN 978-85-334-1729-8; 97 páginas",
  url: "https://bvsms.saude.gov.br/bvs/publicacoes/caderno_atencao_primaria_29_rastreamento.pdf",
  act: null,
  published_on: null,
  kind: "final",
  status: "current",
  audience: "oficial",
};
/** catálogo: conitec-colo-utero-parte2-cp57-2026 (relatório preliminar em consulta pública: não vale como referência atual) */
export const CP57_COLO: FonteReal = {
  catalogo: "conitec-colo-utero-parte2-cp57-2026",
  title: "Diretrizes Brasileiras para o Rastreamento do Câncer do Colo do Útero, Parte II: como avaliar, tratar e seguir mulheres identificadas no rastreamento (relatório preliminar, Consulta Pública nº 57)",
  organ: "Conitec / Ministério da Saúde",
  version: "Relatório de Recomendação, Brasília, julho de 2026; versão preliminar sujeita a mudança após a consulta pública; 175 páginas",
  url: "https://www.gov.br/conitec/pt-br/midias/consultas/relatorios/2026/relatorio-preliminar-pcdt-rastreamento-do-cancer-do-colo-do-utero-parte-ii-cp-57.pdf/@@display-file/file",
  act: null,
  published_on: null,
  kind: "public_consultation",
  status: "current",
  audience: "oficial",
};
/** catálogo: atls-acs (título, instituição e link reais; a marca "complementar" é SIMULADA só para testar a recusa) */
export const ATLS_COMPLEMENTAR: FonteReal = {
  catalogo: "atls-acs",
  title: "Advanced Trauma Life Support (ATLS) - programa/curso ATLS 11",
  organ: "American College of Surgeons (ACS)",
  version: "ATLS 11 (a página diz 'Updated in 2025'; não usa a expressão '11ª edição')",
  url: "https://www.facs.org/quality-programs/trauma/education/advanced-trauma-life-support/",
  act: null,
  published_on: null,
  kind: "final",
  status: "current",
  audience: "complementar",
};
/** catálogo: ms-manual-gestacao-alto-risco-2022 e ms-dmg: duas entradas reais com o MESMO link e o mesmo ano */
export const GESTACAO_A: FonteReal = {
  catalogo: "ms-manual-gestacao-alto-risco-2022",
  title: "Manual de Gestação de Alto Risco",
  organ: "Ministério da Saúde (Secretaria de Atenção Primária à Saúde)",
  version: "1ª edição, 2022, versão eletrônica (694 páginas no PDF)",
  url: "https://bvsms.saude.gov.br/bvs/publicacoes/manual_gestacao_alto_risco.pdf",
  act: null,
  published_on: null,
  kind: "final",
  status: "current",
  audience: "oficial",
};
export const GESTACAO_B: FonteReal = {
  ...GESTACAO_A,
  catalogo: "ms-dmg",
  version: "1ª edição, versão eletrônica, 2022; 692 páginas; capítulo 10 'Diabetes mellitus gestacional' nas pp. 139-147 do manual",
  title: "Manual de Gestação de Alto Risco (inclui capítulo 10: Diabetes mellitus gestacional)",
  organ: "Ministério da Saúde, Secretaria de Atenção Primária à Saúde, Departamento de Ações Programáticas",
};
/** catálogo: ms-pcdt-asma-2026 (vigente; a versão real tem aspas duplas, boa para testar o CSV) */
export const PCDT_ASMA_2026: FonteReal = {
  catalogo: "ms-pcdt-asma-2026",
  title: "Protocolo Clínico e Diretrizes Terapêuticas – Asma",
  organ: "Ministério da Saúde (SAES e SCTIE)",
  version: 'Portaria Conjunta SAES/SCTIE nº 43, de 24 de março de 2026; revoga a Portaria Conjunta SAES/SECTICS/MS nº 32, de 20/12/2023; baseada no Relatório de Recomendação Conitec nº 1078/2025; página gov.br/saude: "atualizado em 02/04/2026"',
  url: "https://www.gov.br/saude/pt-br/assuntos/pcdt/a/asma",
  act: "Portaria Conjunta SAES/SCTIE nº 43, de 24/03/2026 (revoga a Portaria Conjunta SAES/SECTICS/MS nº 32/2023)",
  published_on: "2026-03-24",
  kind: "final",
  status: "current",
  audience: "oficial",
};
/** catálogo: pcdt-tabagismo (vigente; o link do catálogo termina em /@@download/file) */
export const PCDT_TABAGISMO: FonteReal = {
  catalogo: "pcdt-tabagismo",
  title: "Protocolo Clínico e Diretrizes Terapêuticas do Tabagismo",
  organ: "Ministério da Saúde (SAES/SCTIE e Conitec)",
  version: "Portaria Conjunta SAES/SCTIE nº 10, de 16 de abril de 2020 (67 páginas); página do Ministério com data de 21/01/2025",
  url: "https://www.gov.br/saude/pt-br/assuntos/pcdt/t/tabagismo/@@download/file",
  act: "Portaria Conjunta SAES/SCTIE nº 10, de 16/04/2020",
  published_on: "2020-04-16",
  kind: "final",
  status: "current",
  audience: "oficial",
};
