import { GrandeTema } from "../../types/grandesTemas";

export const PREVENTIVA_THEMES: GrandeTema[] = [
  {
    id: "prev-01",
    title: "Princípios e Diretrizes do SUS",
    slug: "principios-e-diretrizes-do-sus",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 1,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 35 questões em provas do Revalida INEP",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 42,
    priority: "Crítica",
    summary: "Artigo 196 a 200 da Constituição Federal de 1988 e Leis Orgânicas da Saúde (Lei nº 8.080/1990 e Lei nº 8.142/1990): Princípios Doutrinários / Éticos (Universalidade, Integralidade e Equidade) vs Princípios Organizacionais / Operacionais (Descentralização com comando único, Regionalização, Hierarquização e Participação Social / Controle Social com Conselhos e Conferências de Saúde - paridade 50% usuários).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `SISTEMA ÚNICO DE SAÚDE (LEGISLAÇÃO ESTRUTURANTE)
├── Princípios Doutrinários (Ideológicos / Filosóficos)
│   ├── Universalidade: Saúde como direito de todos e dever do Estado, sem qualquer discriminação ou cobrança
│   ├── Integralidade: Atenção ao indivíduo em todas as suas dimensões (prevenção, cura e reabilitação em todos os níveis de complexidade)
│   └── Equidade: Tratar desigualmente os desiguais, priorizando investimentos e cuidados onde há maior vulnerabilidade social
├── Princípios Organizacionais / Operacionais (Como o sistema funciona)
│   ├── Descentralização: Redistribuição de poder e responsabilidades para os municípios (Comando Único em cada esfera de governo)
│   ├── Regionalização e Hierarquização: Rede organizada por níveis de complexidade crescente (Atenção Primária como porta de entrada)
│   └── Participação Social (Controle Social - Lei 8.142/1990)
│       ├── Conselhos de Saúde: Caráter PERMANENTE e DELIBERATIVO, fiscalizam gastos e formulação de estratégias (Mensal)
│       └── Conferências de Saúde: A cada 4 ANOS, convocadas pelo Executivo, avaliam a situação de saúde e propõem diretrizes
└── Composição Paritária (Resolução CNS 453): 50% Usuários, 25% Trabalhadores de Saúde, 25% Prestadores e Gestores`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 35,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2023.1", "Revalida 2022.2", "Revalida 2021"],
      patientProfiles: ["Situação em que um município decide priorizar recursos em bairros periféricos de alta vulnerabilidade."],
      frequentTriggers: ["Aplicação prática do princípio da EQUIDADE diferenciando-o da igualdade formal."],
      mostTestedDiagnosis: "Identificação do princípio doutrinário da Equidade no SUS.",
      mostTestedConduct: "Reconhecer que investir proporcionalmente mais em populações mais vulneráveis concretiza a equidade.",
      recurringDistractors: ["Confundir o caráter deliberativo dos Conselhos de Saúde com o caráter consultivo ou esquecer a paridade de 50% dos usuários."],
      cognitiveMatrixPattern: "A banca exige domínio absoluto da Lei 8.080/90, Lei 8.142/90 e da composição dos Conselhos de Saúde.",
    },
    sources: [
      {
        institution: "Constituição da República Federativa do Brasil / Ministério da Saúde",
        document: "Artigos 196 a 200 da CF/88 e Leis Federais nº 8.080/1990 e 8.142/1990",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-02",
    title: "Atenção Primária à Saúde",
    slug: "atencao-primaria-a-saude-atributos-starfield",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 2,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 30 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 36,
    priority: "Crítica",
    summary: "Atributos Essenciais e Derivados da Atenção Primária à Saúde de Barbara Starfield: Essenciais (Acesso / Primeiro Contato, Longitudinalidade / vínculo ao longo do tempo, Integralidade / abrangência de serviços, e Coordenação do Cuidado / integração na RAS) vs Derivados (Orientação Familiar / Genograma e Ecomapa, Orientação Comunitária / diagnóstico de saúde local, e Competência Cultural). Método Clínico Centrado na Pessoa (MCCP).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `ATRIBUTOS DA ATENÇÃO PRIMÁRIA À SAÚDE (BARBARA STARFIELD)
├── ATRIBUTOS ESSENCIAIS (Obrigatórios na APS de qualidade)
│   ├── 1. Acesso de Primeiro Contato: Acessibilidade geográfica, temporal e cultural da UBS como porta de entrada preferencial
│   ├── 2. Longitudinalidade: Acompanhamento contínuo do paciente ao longo do tempo pela mesma equipe (Vínculo e confiança)
│   ├── 3. Integralidade (Abrangência): Capacidade da equipe de responder à grande maioria das necessidades de saúde biopsicossociais
│   └── 4. Coordenação do Cuidado: A APS como centro de comunicação e navegadora do paciente através de todos os pontos da Rede (RAS)
└── ATRIBUTOS DERIVADOS (Qualificadores da atenção)
    ├── Orientação Familiar: Conhecimento da dinâmica familiar e contexto domiciliar (Genograma / APGAR Familiar)
    ├── Orientação Comunitária: Conhecimento epidemiológico do território e das necessidades da comunidade local
    └── Competência Cultural: Adaptação da comunicação e cuidado às crenças, valores e cultura da população atendida`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 30,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.2"],
      patientProfiles: ["Médico de família que atende o mesmo paciente há 8 anos, conhecendo seu histórico pessoal e familiar."],
      frequentTriggers: ["Identificação do atributo da LONGITUDINALIDADE como produtor de vínculo duradouro."],
      mostTestedDiagnosis: "Reconhecimento dos Atributos de Barbara Starfield em casos da ESF.",
      mostTestedConduct: "Exercer a coordenação do cuidado acompanhando o paciente mesmo quando em tratamento especializado na rede.",
      recurringDistractors: ["Confundir longitudinalidade com continuidade de cuidados pontual ou integralidade com encaminhamento indiscriminado."],
      cognitiveMatrixPattern: "A banca testa a aplicação teórica dos atributos de Starfield em situações práticas do cotidiano da ESF.",
    },
    sources: [
      {
        institution: "Ministério da Saúde / Sociedade Brasileira de Medicina de Família e Comunidade (SBMFC)",
        document: "Tratado de Medicina de Família e Comunidade - Atributos da Atenção Primária",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-03",
    title: "Estratégia Saúde da Família",
    slug: "estrategia-saude-da-familia-pnab",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 3,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 28 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 32,
    priority: "Crítica",
    summary: "Política Nacional de Atenção Básica (PNAB - Portaria nº 2.436/2017): Composição da Equipe de Saúde da Família (eSF: Médico, Enfermeiro, Técnico de Enfermagem e Agentes Comunitários de Saúde), população adscrita recomendada (2.000 a 3.500 pessoas por equipe), carga horária (40h semanais para todos os membros), atribuições específicas do Agente Comunitário de Saúde (ACS: visita domiciliar, cadastramento, territorialização) e Equipe de Saúde Bucal (eSB). Ferramentas de abordagem familiar: Genograma (mínimo de 3 gerações) e Ecomapa.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `ESTRATÉGIA SAÚDE DA FAMÍLIA (PNAB 2017)
├── Composição da Equipe de Saúde da Família (eSF)
│   ├── Médico de Família ou Generalista (40h semanais)
│   ├── Enfermeiro (40h semanais)
│   ├── Técnico ou Auxiliar de Enfermagem (40h semanais)
│   └── Agentes Comunitários de Saúde (ACS - 40h semanais, cobrindo 100% da população em áreas vulneráveis)
├── Parâmetros de População Adscrita: 2.000 a 3.500 pessoas por eSF (Máximo de 750 pessoas por ACS)
├── Ferramentas de Abordagem Familiar e Comunitária
│   ├── Genograma (Familiograma): Representação gráfica da estrutura biológica e psicológica de pelo menos 3 GERAÇÕES
│   ├── Ecomapa: Representação das relações da família com os sistemas sociais externos (Igreja, trabalho, escola, UBS)
│   └── APGAR Familiar: Avaliação da funcionalidade e satisfação familiar (Adaptação, Parceria, Crescimento, Afeto, Resolução)
└── Territorialização e Adscrição: Delimitação da área de abrangência e reconhecimento dos microambientes de risco sanitário`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 28,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.1", "Revalida 2021"],
      patientProfiles: ["Equipe da ESF planejando o cuidado de uma família disfuncional utilizando ferramentas gráficas."],
      frequentTriggers: ["Leitura e interpretação correta dos símbolos do Genograma (quadrado = homem, círculo = mulher, X = falecido, etc.)."],
      mostTestedDiagnosis: "Interpretação do Genograma e definição do plano terapêutico singular.",
      mostTestedConduct: "Realizar visita domiciliar com o ACS e construir genograma de 3 gerações para compreender o contexto.",
      recurringDistractors: ["Afirmar que o genograma avalia apenas os aspectos genéticos ou desconsiderar as 3 gerações mínimas."],
      cognitiveMatrixPattern: "A banca exige leitura de símbolos do genograma e respeito à PNAB vigente.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "Portaria nº 2.436/2017 - Política Nacional de Atenção Básica (PNAB)",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-04",
    title: "Epidemiologia",
    slug: "epidemiologia-delineamentos-estudos",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 4,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 29 questões nas provas oficiais",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 35,
    priority: "Crítica",
    summary: "Delineamento de Estudos Epidemiológicos: Estudos Observacionais vs Experimentais; Estudos Ecológicos (Unidade agregada / populacional - perigo da Falácia Ecológica); Transversais / Seccionais (Instantâneo / Prevalência - sem causalidade temporal); Caso-Controle (Parte do desfecho/doença em direção ao passado/exposição - Ótimo para doenças raras, calcula Odds Ratio); Coorte (Parte da exposição em direção ao futuro/desfecho - Calcula Risco Relativo e Incidência); Ensaio Clínico Randomizado (Padrão-ouro de intervenção, mascaramento simples/duplo-cego, Efeito Hawthorne, Efeito Placebo). Erros sistemáticos / Vieses (Seleção, Aferição, Confundimento).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `DELINEAMENTO DOS ESTUDOS EPIDEMIOLÓGICOS
├── Unidade de Análise: Agregada (Populações) vs Individual (Indivíduos)
├── ESTUDOS AGREGADOS (POPULACIONAIS)
│   ├── Estudo Ecológico: Compara taxas de exposição e doença entre países/cidades (Risco de Falácia Ecológica)
│   └── Ensaio Comunitário: Intervenção aplicada em comunidades inteiras (ex: fluoretação da água)
└── ESTUDOS INDIVIDUAIS
    ├── Transversal (Corte Transversal / Seccional): Mede exposição e desfecho no mesmo momento (Calcula PREVALÊNCIA)
    ├── Caso-Controle: Indivíduos com a doença (Casos) vs sem a doença (Controles) olhando para trás (Calcula ODDS RATIO / OR - Doenças raras)
    ├── Coorte (Longitudinal): Expostos vs Não Expostos seguidos no tempo (Calcula INCIDÊNCIA, RISCO RELATIVO / RR e Risco Atribuível)
    └── Ensaio Clínico Randomizado: Intervenção com alocação aleatória e grupo controle (Calcula Redução do Risco Relativo e NNT)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 29,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.1", "Revalida 2022.2", "Revalida 2020"],
      patientProfiles: ["Pesquisador seleciona pacientes com câncer de bexiga e indivíduos saudáveis para avaliar histórico de tabagismo pregresso."],
      frequentTriggers: ["Identificação do desenho Caso-Controle e cálculo da medida de associação Odds Ratio (OR)."],
      mostTestedDiagnosis: "Classificação do delineamento epidemiológico como Estudo de Caso-Controle.",
      mostTestedConduct: "Calcular o Odds Ratio (OR = ad / bc) e interpretar se fator de risco (OR > 1) ou fator de proteção (OR < 1).",
      recurringDistractors: ["Calcular Risco Relativo (RR) diretamente em um estudo de Caso-Controle (não calcula incidência real)."],
      cognitiveMatrixPattern: "A banca exige que o candidato saiba qual medida de associação corresponde a cada tipo de desenho epidemiológico.",
    },
    sources: [
      {
        institution: "Ministério da Saúde / Associação Brasileira de Saúde Coletiva (ABRASCO)",
        document: "Epidemiologia & Saúde - Princípios e Métodos em Pesquisa Epidemiológica",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-05",
    title: "Medidas de Frequência e Associação",
    slug: "medidas-frequencia-associacao-incidencia-prevalencia",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 5,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 26 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 30,
    priority: "Crítica",
    summary: "Medidas de Frequência: Incidência (casos novos em determinado período / população sob risco - dinâmica) vs Prevalência (casos existentes / população total - estática; Prevalência = Incidência x Duração da doença). Medidas de Associação na Tabela 2x2: Risco Relativo (RR = Incidência nos expostos / Incidência nos não expostos), Odds Ratio (OR = (a*d)/(b*c)), Risco Atribuível / Redução Absoluta do Risco (RAR = Ie - Ine) e Número Necessário para Tratar (NNT = 1 / RAR).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `MEDIDAS EPIDEMIOLÓGICAS E TABELA 2X2
├── Medidas de Frequência
│   ├── Prevalência = (Total de Casos Existentes / População Total) no momento T (Aumenta com novos casos e maior sobrevida)
│   └── Incidência = (Casos Novos / População sob Risco) ao longo do tempo (Mede velocidade de surgimento da doença)
├── Tabela de Contingência 2x2 (Doentes [a, c] vs Não Doentes [b, d] / Expostos [a, b] vs Não Expostos [c, d])
├── Medidas de Associação
│   ├── Risco Relativo (RR) = [a / (a + b)] / [c / (c + d)] (Estudos de Coorte e Ensaio Clínico)
│   ├── Odds Ratio (OR) = (a x d) / (b x c) (Estudos de Caso-Controle)
│   └── Risco Atribuível / Redução Absoluta de Risco (RAR) = | I_expostos - I_não_expostos |
└── Impacto Clínico
    └── Número Necessário para Tratar (NNT) = 1 / RAR (Quanto menor o NNT, mais eficaz a intervenção)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 26,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.2", "Revalida 2022.1"],
      patientProfiles: ["Ensaio clínico comparando nova droga com placebo mostrando incidência do desfecho de 5% no grupo intervenção e 10% no grupo controle."],
      frequentTriggers: ["Cálculo da RAR (10% - 5% = 5% ou 0,05) e do NNT (1 / 0,05 = 20)."],
      mostTestedDiagnosis: "Cálculo de impacto clínico pelo NNT.",
      mostTestedConduct: "Interpretar que é necessário tratar 20 pacientes com o novo medicamento para evitar 1 desfecho desfavorável.",
      recurringDistractors: ["Confundir Redução do Risco Relativo (RRR = 50%) com a Redução Absoluta do Risco (RAR = 5%)."],
      cognitiveMatrixPattern: "A banca testa rigorosamente a capacidade de calcular e interpretar o NNT e a tabela de contingência.",
    },
    sources: [
      {
        institution: "ABRASCO",
        document: "Fundamentos de Bioestatística e Epidemiologia Clínica",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-06",
    title: "Testes Diagnósticos e Rastreamento",
    slug: "testes-diagnosticos-sensibilidade-especificidade-vpp-vpn",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 6,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 31 questões no banco Revalida INEP",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 37,
    priority: "Crítica",
    summary: "Propriedades intrínsecas do teste (NÃO mudam com a prevalência): Sensibilidade (Capacidade de detectar os verdadeiramente doentes - VP / (VP + FN) - Ideal para testes de Rastreio e para afastar diagnósticos) e Especificidade (Capacidade de detectar os verdadeiramente sãos - VN / (VN + FP) - Ideal para testes Confirmatórios). Propriedades extrínsecas (DEPENDEM da prevalência): Valor Preditivo Positivo (VPP - Aumenta quando a prevalência sobe) e Valor Preditivo Negativo (VPN - Diminui quando a prevalência sobe). Curva ROC (Acurácia = Área sob a curva / AUC).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `PROPRIEDADES DOS TESTES DIAGNÓSTICOS
├── PROPRIEDADES INTRÍNSECAS (Fixas - Não dependem da prevalência)
│   ├── Sensibilidade = VP / (VP + FN) (Taxa de Positivos nos Doentes → Teste altamente sensível tem poucos falsos-negativos)
│   └── Especificidade = VN / (VN + FP) (Taxa de Negativos nos Sadios → Teste altamente específico tem poucos falsos-positivos)
├── PROPRIEDADES EXTRÍNSECAS (Variáveis - Dependem diretamente da PREVALÊNCIA da doença)
│   ├── Valor Preditivo Positivo (VPP) = VP / (VP + FP) (Probabilidade pós-teste de ser doente tendo teste positivo)
│   │   └── Se a Prevalência AUMENTA → O VPP AUMENTA
│   └── Valor Preditivo Negativo (VPN) = VN / (VN + FN) (Probabilidade pós-teste de ser sadio tendo teste negativo)
│       └── Se a Prevalência AUMENTA → O VPN DIMINUI
└── Curva ROC (Receiver Operating Characteristic)
    └── Gráfico: Sensibilidade (eixo Y) vs (1 - Especificidade) (eixo X) → O ponto mais próximo do canto superior esquerdo é o ponto de corte ideal`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 31,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2023.1", "Revalida 2022.2", "Revalida 2021"],
      patientProfiles: ["Aplicação de um mesmo teste diagnóstico em uma população de alta prevalência (ambulatório terciário) vs baixa prevalência (comunidade geral)."],
      frequentTriggers: ["Efeito da alteração da prevalência sobre o Valor Preditivo Positivo (VPP) e Negativo (VPN)."],
      mostTestedDiagnosis: "Comportamento dos valores preditivos em diferentes cenários de prevalência.",
      mostTestedConduct: "Reconhecer que a Sensibilidade e Especificidade permanecem inalteradas, enquanto o VPP aumenta na população de alta prevalência.",
      recurringDistractors: ["Afirmar que a Sensibilidade ou Especificidade de um teste aumentam quando a prevalência da doença sobe."],
      cognitiveMatrixPattern: "A banca do INEP cobra a distinção entre características intrínsecas (fixas) e extrínsecas (dependentes da prevalência).",
    },
    sources: [
      {
        institution: "Ministério da Saúde / ABRASCO",
        document: "Avaliação de Tecnologias em Saúde e Validação de Testes Diagnósticos",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-07",
    title: "Vigilância Epidemiológica",
    slug: "vigilancia-epidemiologica-investigacao-surtos",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 7,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 23 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 27,
    priority: "Crítica",
    summary: "Conceitos fundamentais de Vigilância Epidemiológica: Endemia (frequência habitual esperada), Epidemia / Surto (ocorrência de casos acima do Limite Superior do Diagrama de Controle / Canal Endêmico), Pandemia (disseminação em múltiplos continentes), Tipos de Curva Epidêmica (Fonte Comum Pontual vs Propagada pessoa a pessoa). Os 10 passos da Investigação de Surto da OMS/SVS.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `VIGILÂNCIA EPIDEMIOLÓGICA E INVESTIGAÇÃO DE SURTO
├── Definições Epidemiológicas
│   ├── Endemia: Ocorrência de uma doença dentro do número esperado de casos para aquela população e época (Faixa endêmica)
│   ├── Epidemia: Número de casos que ultrapassa o Limite Superior do Diagrama de Controle (Acima do percentil 95 / média + 2DP)
│   ├── Surto: Epidemia circunscrita a um espaço delimitado ou relação entre casos (ex: creche, quartel, bairro)
│   └── Pandemia: Epidemia com disseminação em ampla escala geográfica, atingindo múltiplos países e continentes
└── Passos da Investigação de Surto
    ├── 1. Confirmar o diagnóstico clínico e laboratorial
    ├── 2. Confirmar a existência real de um surto (comparar com dados históricos do SINAN)
    ├── 3. Estabelecer a Definição de Caso (Confirmado, Provável, Suspeito)
    ├── 4. Caracterizar a epidemia em relação a Tempo, Espaço e Pessoa (Curva Epidêmica)
    └── 5. Implementar medidas de controle e bloqueio imediatas`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 23,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.2", "Revalida 2022.1"],
      patientProfiles: ["Aumento súbito de casos de diarreia em uma escola após consumo de merenda com maionese."],
      frequentTriggers: ["Identificação de curva epidêmica de fonte comum pontual e medidas imediatas de bloqueio."],
      mostTestedDiagnosis: "Surto epidêmico de transmissão por fonte comum pontual (veículo alimentar).",
      mostTestedConduct: "Notificação imediata, coleta de amostras clínicas/bromatológicas e início de medidas de contenção.",
      recurringDistractors: ["Aguardar conclusão de todo o relatório final da investigação para iniciar as medidas de controle."],
      cognitiveMatrixPattern: "A banca exige rapidez na tomada de medidas de controle profiláticas concomitantes à investigação epidemiológica.",
    },
    sources: [
      {
        institution: "Secretaria de Vigilância em Saúde e Ambiente (SVSA) / Ministério da Saúde",
        document: "Guia de Vigilância em Saúde - 6ª Edição",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-08",
    title: "Doenças de Notificação Compulsória",
    slug: "doencas-de-notificacao-compulsoria-lista-nacional",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 8,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 33 questões analisadas",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 39,
    priority: "Crítica",
    summary: "Portaria de Consolidação GM/MS nº 4 e atualizações da Lista Nacional de Notificação Compulsória de Doenças, Agravos e Eventos de Saúde Pública. Diferenciação obrigatória entre: NOTIFICAÇÃO IMEDIATA (até 24 horas às esferas Municipal, Estadual e Federal: Raiva, Botulismo, Cólera, Febre Amarela, Peste, Varíola, Hantavirose, Sarampo, Rubéola, Meningite Meningocócica, Morte Materna e Infantil, Violência Sexual, Acidente por Animal Peçonhento) vs NOTIFICAÇÃO SEMANAL (SINAN: Tuberculose, Hanseníase, Sífilis, Dengue/Zika/Chikungunya sem óbito, Leishmaniose, Doença de Chagas Crônica). A notificação é compulsória na SUSPEITA, não dependendo de confirmação laboratorial.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Notificação apenas após o resultado confirmatório de exames laboratoriais.",
      currentConduct: "A Notificação Compulsória é OBRIGATÓRIA diante da mera SUSPEITA CLÍNICA de doença da lista nacional, devendo ser realizada por qualquer profissional de saúde ou responsável pelo serviço (público ou privado), independentemente de confirmação laboratorial prévia.",
      previousDoc: "Portarias Antigas de Notificação",
      currentDoc: "Lista Nacional de Notificação Compulsória de Doenças, Agravos e Eventos de Saúde Pública - Ministério da Saúde 2024/2026",
      year: "2026",
      revalidaImpact: "Tabela de periodicidade (imediata em 24h vs semanal) cai repetidamente em todas as edições do Revalida.",
    },
    visualTreeMap: `LISTA NACIONAL DE NOTIFICAÇÃO COMPULSÓRIA (MS 2024/2026)
├── REGRA DE OURO: NOTIFICA-SE A SUSPEITA (Não aguardar resultado laboratorial para notificar)
├── NOTIFICAÇÃO COMPULSÓRIA IMEDIATA (EM ATÉ 24 HORAS)
│   ├── Doenças de Alto Potencial Epidêmico / Erradicadas: Botulismo, Cólera, Febre Amarela, Peste, Raiva humana, Sarampo, Rubéola, Varíola
│   ├── Eventos Respiratórios Graves: Síndrome Respiratória Aguda Grave (SRAG), Influenza aviária humana
│   ├── Meningites bacterianas e Doença Meningocócica
│   ├── Acidentes por Animais Peçonhentos e Acidentes de Trabalho com Morte / em Menores
│   ├── Violência Sexual e Tentativa de Suicídio (Notificação imediata ao setor de saúde)
│   └── Óbito Materno e Óbito Infantil
└── NOTIFICAÇÃO COMPULSÓRIA SEMANAL (SINAN)
    ├── Doenças Crônicas Transmissíveis: Tuberculose, Hanseníase, Doença de Chagas Crônica, Esquistossomose
    ├── Infecções Sexualmente Transmissíveis: Sífilis (Congênita, em Gestante e Adquirida), HIV/AIDS, Hepatites Virais
    └── Arboviroses sem sinais de alarme/choque: Dengue, Chikungunya, Zika`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 33,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2023.1", "Revalida 2022.1"],
      patientProfiles: ["Médico na UPA atende paciente com suspeita clínica de febre amarela ou sarampo com exantema e tosse."],
      frequentTriggers: ["Conduta de notificação imediata em até 24h para a vigilância epidemiológica na suspeita."],
      mostTestedDiagnosis: "Suspeita de agravo de notificação compulsória imediata.",
      mostTestedConduct: "Preencher a ficha de notificação compulsória do SINAN e comunicar à vigilância em até 24 horas sem aguardar sorologia.",
      recurringDistractors: ["Aguardar o retorno da sorologia positiva para preencher a ficha de notificação."],
      cognitiveMatrixPattern: "A banca pune severamente quem espera a confirmação laboratorial para notificar agravos imediatos.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "Portaria de Consolidação GM/MS nº 4 - Lista Nacional de Notificação Compulsória",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-09",
    title: "Vigilância Sanitária",
    slug: "vigilancia-sanitaria-anvisa-atribuicoes",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 9,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 14 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–30 min",
    moduleCount: 16,
    relatedQuestionsCount: 17,
    priority: "Alta",
    summary: "Conceito legal da Vigilância Sanitária (Lei nº 8.080/1990 Art. 6º): Conjunto de ações capazes de eliminar, diminuir ou prevenir riscos à saúde e de intervir nos problemas sanitários decorrentes do meio ambiente, da produção e circulação de bens e da prestação de serviços de interesse da saúde. Competências da ANVISA e atuação nos três níveis de gestão.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `VIGILÂNCIA SANITÁRIA (ANVISA E SUS)
├── Definição Legal (Lei 8.080/1990): Ações de controle de bens de consumo, prestação de serviços e ambiente relacionados à saúde
├── Campos de Atuação
│   ├── Bens e Produtos: Medicamentos, alimentos, cosméticos, saneantes, hemoderivados, equipamentos médicos e imunobiológicos
│   ├── Serviços de Saúde: Hospitais, clínicas médicas, laboratórios, consultórios odontológicos, farmácias e ILPIs
│   └── Meio Ambiente e Saúde do Trabalhador: Controle de resíduos de serviços de saúde (RSS) e processos produtivos
└── Poder de Polícia Sanitária: Fiscalização, interdição cautelar, apreensão de produtos adulterados e aplicação de multas administrativas`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 14,
      observedInExams: ["Revalida 2024.1", "Revalida 2022.2"],
      patientProfiles: ["Surto de infecção por micobactéria não tuberculosa após cirurgias videolaparoscópicas em clínica privada."],
      frequentTriggers: ["Intervenção e fiscalização do serviço de esterilização pela Vigilância Sanitária local."],
      mostTestedDiagnosis: "Atuação da Vigilância Sanitária sobre serviços de saúde de interesse público.",
      mostTestedConduct: "Notificação à VISA municipal/estadual, interdição temporária do centro cirúrgico e fiscalização dos saneantes.",
      recurringDistractors: ["Atribuir à Polícia Civil a fiscalização inicial de boas práticas em esterilização hospitalar."],
      cognitiveMatrixPattern: "A banca exige conhecimento do papel regulatório e fiscalizatório da Vigilância Sanitária no SUS.",
    },
    sources: [
      {
        institution: "ANVISA / Ministério da Saúde",
        document: "Sistema Nacional de Vigilância Sanitária (SNVS) - Legislação e Práticas",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-10",
    title: "Vigilância em Saúde",
    slug: "vigilancia-em-saude-integrada-pnvs",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 10,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 16 questões",
    isHistoricalData: true,
    estimatedMinutes: "25–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 19,
    priority: "Alta",
    summary: "Política Nacional de Vigilância em Saúde (PNVS - Resolução CNS nº 588/2018): Integração dos 4 componentes da Vigilância: 1. Vigilância Epidemiológica, 2. Vigilância Sanitária, 3. Vigilância em Saúde Ambiental (VIGIAGUA, VIGISOLO, VIGIAR, VIGIDESASTRES) e 4. Vigilância em Saúde do Trabalhador (VISAT). Ações de análise de situação de saúde (ASIS) e territorialização.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `POLÍTICA NACIONAL DE VIGILÂNCIA EM SAÚDE (PNVS)
├── Os 4 Pilares Integrados da Vigilância em Saúde
│   ├── 1. Vigilância Epidemiológica: Reconhecimento, detecção e prevenção de doenças transmissíveis e não transmissíveis
│   ├── 2. Vigilância Sanitária (VISA): Controle da qualidade de bens, serviços e ambientes de interesse à saúde
│   ├── 3. Vigilância em Saúde Ambiental (VISAM): Monitoramento dos fatores ambientais de risco (Água/VIGIAGUA, Ar/VIGIAR, Solo e Desastres)
│   └── 4. Vigilância em Saúde do Trabalhador (VISAT): Promoção e proteção da saúde dos trabalhadores frente aos processos de trabalho
└── Análise de Situação de Saúde (ASIS): Diagnóstico populacional contínuo para planejamento de políticas públicas baseadas em evidências`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 16,
      observedInExams: ["Revalida 2023.2", "Revalida 2021"],
      patientProfiles: ["Comunidade ribeirinha exposta a contaminação da água por agrotóxicos apresentando sintomas neurológicos."],
      frequentTriggers: ["Articulação integrada entre Vigilância Epidemiológica e Vigilância em Saúde Ambiental (VIGIAGUA)."],
      mostTestedDiagnosis: "Ação de Vigilância em Saúde Ambiental e Epidemiológica integrada.",
      mostTestedConduct: "Coleta de amostras de água para análise físico-química e cadastramento dos indivíduos expostos.",
      recurringDistractors: ["Tratar os casos individualmente sem acionar o programa VIGIAGUA da vigilância ambiental."],
      cognitiveMatrixPattern: "A banca valoriza a visão holística e intersetorial da PNVS.",
    },
    sources: [
      {
        institution: "Conselho Nacional de Saúde (CNS) / Ministério da Saúde",
        document: "Resolução CNS nº 588/2018 - Política Nacional de Vigilância em Saúde",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-11",
    title: "Imunização e Programa Nacional de Imunizações",
    slug: "pni-politicas-publicas-coberturas-vacinais",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 11,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 28 questões",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 33,
    priority: "Crítica",
    summary: "História e Impacto do PNI: Imunidade de Rebanho / Coletiva (Cálculo do limiar de imunidade crítica: q = 1 - 1/R0), Metas de cobertura vacinal no Brasil (95% para a maioria dos imunobiológicos; 90% para BCG e Rotavírus), Cadeia de Frio (armazenamento de vacinas entre +2ºC e +8ºC, com temperatura ideal de +5ºC), CRIE (Centros de Referência para Imunobiológicos Especiais para imunodeprimidos, prematuros e cardiopatas), Hesitação Vacinal e estratégias de busca ativa.",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Campanhas pontuais de vacinação indiscriminada.",
      currentConduct: "Estratégia de Microplanejamento para Atividades de Vacinação de Alta Qualidade (AVAQ) do Ministério da Saúde: busca ativa territorializada de não vacinados através do cruzamento de dados da ESF com o e-SUS APS e vacinação extramuros.",
      previousDoc: "Manuais Tradicionais de Vacinação",
      currentDoc: "Guia de Microplanejamento para Atividades de Vacinação de Alta Qualidade - MS / OPAS 2024/2026",
      year: "2026",
      revalidaImpact: "Conceito de microplanejamento e metas de cobertura do SUS altamente cobrados.",
    },
    visualTreeMap: `PROGRAMA NACIONAL DE IMUNIZAÇÕES (PNI E SAÚDE COLETIVA)
├── Metas de Cobertura Vacinal: >= 95% para a maioria das vacinas (>= 90% para BCG e Rotavírus Humano)
├── Imunidade Coletiva (De Rebanho): Proteção indireta dos não vacinados pelo corte da cadeia de transmissão (Limiar q = 1 - 1/R0)
├── Rede e Cadeia de Frio
│   ├── Temperatura Padrão de Conservação: +2ºC a +8ºC (Temperatura ideal no termômetro de máxima e mínima: +5ºC)
│   └── Se Queda de Energia / Falha na Geladeira: Fechar refrigerador, monitorar termômetro e NÃO descartar antes de notificar a Central
└── Centros de Referência para Imunobiológicos Especiais (CRIE)
    ├── Indicações: Pacientes com HIV/Imunodeficiências, Asplenia anatômica/funcional, Neoplasias, Transplantados
    └── Vacinas Especiais: Pneumocócica 13/23-valente, Meningocócica conjugada ACWY, Varicela e Hepatite A ampliada`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 28,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.2", "Revalida 2022.1"],
      patientProfiles: ["Unidade de Saúde com queda de cobertura vacinal da tríplice viral para 78% em território vulnerável."],
      frequentTriggers: ["Estratégia de busca ativa com microplanejamento e cálculo do risco de reintrodução do sarampo."],
      mostTestedDiagnosis: "Queda de cobertura vacinal gerando perda da imunidade de rebanho.",
      mostTestedConduct: "Implementar busca ativa nominal pelos ACS, vacinação em horários estendidos e ações extramuros.",
      recurringDistractors: ["Realizar apenas campanhas em dias fixos sem busca ativa territorializada."],
      cognitiveMatrixPattern: "A banca exige que o médico na APS saiba gerenciar as metas de cobertura do território.",
    },
    sources: [
      {
        institution: "Ministério da Saúde / OPAS",
        document: "Manual de Microplanejamento para Imunização no SUS",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-12",
    title: "Saúde do Trabalhador",
    slug: "saude-do-trabalhador-doencas-ocupacionais-cat",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 12,
    recurrence: "alta",
    recurrenceBadgeLabel: "🔴 Alta recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 21 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–35 min",
    moduleCount: 16,
    relatedQuestionsCount: 25,
    priority: "Alta",
    summary: "Classificação das Doenças Relacionadas ao Trabalho de Schilling (Schilling I: Trabalho como causa necessária - Silicose, Saturnismo; Schilling II: Trabalho como fator de risco contributivo - HAS, Coronariopatia; Schilling III: Trabalho como agravador de doença preexistente - Asma, Dermatite de contato). Comunicação de Acidente de Trabalho (CAT: emitida em até 1 dia útil após o acidente ou imediatamente em caso de óbito pelo empregador, médico ou sindicato). Acidentes com material biológico e PAIR (Perda Auditiva Induzida por Ruído: neurossensorial, bilateral, irreversível com entalhe acústico em 4.000-6.000 Hz).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `SAÚDE DO TRABALHADOR (RENAST / VISAT)
├── Classificação de Schilling das Doenças Ocupacionais
│   ├── Grupo I: O trabalho é CAUSA NECESSÁRIA (Ex: Silicose, Asbestose, Intoxicação por Chumbo/Saturnismo)
│   ├── Grupo II: O trabalho é FATOR CONTRIBUTIVO / DE RISCO (Ex: Doença Coronariana, Hipertensão, DORT/LER)
│   └── Grupo III: O trabalho é AGRAVADOR de condição preexistente (Ex: Asma brônquica ocupacional, Dermatite de contato)
├── Comunicação de Acidente de Trabalho (CAT)
│   ├── Prazo Legal de Emissão: Até o PRIMEIRO DIA ÚTIL seguinte ao acidente (ou IMEDIATA se houver óbito)
│   └── Quem pode emitir: Empregador (obrigação legal); se omitir: o próprio trabalhador, dependentes, médico ou sindicato
└── Perda Auditiva Induzida por Ruído (PAIR)
    └── Audiometria: Perda Auditiva Neurossensorial, Bilateral, Simétrica, Irreversível com 'Entalhe Acústico' clássico nas frequências de 3.000, 4.000 ou 6.000 Hz`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 21,
      observedInExams: ["Revalida 2024.1", "Revalida 2023.1", "Revalida 2022.2"],
      patientProfiles: ["Trabalhador da construção civil com tosse crônica e Rx de tórax com padrão em casca de ovo (silicose)."],
      frequentTriggers: ["Classificação de Schilling I e emissão imediata da Comunicação de Acidente de Trabalho (CAT)."],
      mostTestedDiagnosis: "Pneumoconiose ocupacional (Silicose) - Schilling I.",
      mostTestedConduct: "Afastamento do trabalhador da exposição à sílica, emissão da CAT e notificação no SINAN (VISAT).",
      recurringDistractors: ["Aguardar autorização do empregador para que o médico assistente emita a CAT."],
      cognitiveMatrixPattern: "A banca apoia a autonomia do médico para emissão da CAT e notificação compulsória de acidentes de trabalho.",
    },
    sources: [
      {
        institution: "Ministério da Saúde",
        document: "Manual de Doenças Relacionadas ao Trabalho - Diretrizes de Atenção e Vigilância",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-13",
    title: "Saúde Materno-Infantil",
    slug: "saude-materno-infantil-indicadores-mortalidade",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 13,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 27 questões",
    isHistoricalData: true,
    estimatedMinutes: "30–40 min",
    moduleCount: 16,
    relatedQuestionsCount: 31,
    priority: "Crítica",
    summary: "Indicadores de Saúde Materno-Infantil: Taxa de Mortalidade Infantil (TMI = Óbitos em < 1 ano / Nascidos Vivos x 1.000) dividida em Neonatal Precoce (0 a 6 dias - principal componente no Brasil associado ao parto/prematuridade), Neonatal Tardia (7 a 27 dias) e Pós-Neonatal / Tardia (28 a 364 dias - associada a saneamento e infecções diarreicas/respiratórias). Razão de Mortalidade Materna (RMM = Óbitos maternos por causas obstétricas / Nascidos Vivos x 100.000 - Principais causas no Brasil: 1. Hipertensão, 2. Hemorragia pós-parto, 3. Infecção puerperal).",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `INDICADORES DE MORTALIDADE MATERNO-INFANTIL
├── TAXA DE MORTALIDADE INFANTIL (TMI) = (Óbitos < 1 ano / Nascidos Vivos) x 1.000
│   ├── Componente Neonatal (0 a 27 dias) → Responsável por ~70% das mortes infantis no Brasil
│   │   ├── Neonatal Precoce (0 a 6 dias de vida) → Principal fração (Causa: Assistência ao pré-natal e ao parto, prematuridade e asfixia)
│   │   └── Neonatal Tardia (7 a 27 dias de vida)
│   └── Componente Pós-Neonatal / Infantil Tardio (28 a 364 dias)
│       └── Causas: Condições socioeconômicas, saneamento básico, desnutrição e infecções respiratórias/diarreicas
└── RAZÃO DE MORTALIDADE MATERNA (RMM) = (Óbitos Maternos / Nascidos Vivos) x 100.000
    ├── Óbitos Obstétricos Diretos (~80% no Brasil): 1. Síndromes Hipertensivas, 2. Hemorragia Pós-Parto, 3. Infecções Puerperais, 4. Aborto inseguro
    └── Óbitos Obstétricos Indiretos: Doenças maternas preexistentes agravadas pela gestação (Cardiopatias, lúpus, infecções virais)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 27,
      observedInExams: ["Revalida 2024.2", "Revalida 2023.2", "Revalida 2022.1", "Revalida 2020"],
      patientProfiles: ["Análise de dados municipais onde o componente neonatal precoce é responsável por 60% dos óbitos infantis."],
      frequentTriggers: ["Indicação de intervenções prioritárias na melhoria da assistência pré-natal e atendimento hospitalar ao parto."],
      mostTestedDiagnosis: "Interpretação epidemiológica dos componentes da mortalidade infantil.",
      mostTestedConduct: "Investir na qualificação do pré-natal de alto risco e rede de maternidades para reduzir a mortalidade neonatal precoce.",
      recurringDistractors: ["Propor saneamento básico para tentar reduzir especificamente a mortalidade neonatal precoce (saneamento atua na pós-neonatal)."],
      cognitiveMatrixPattern: "A banca exige correlação exata entre o componente temporal da morte infantil e a intervenção sanitária correspondente.",
    },
    sources: [
      {
        institution: "Ministério da Saúde / Rede Interagencial de Informação para a Saúde (RIPSA)",
        document: "Indicadores Básicos de Saúde no Brasil: Conceitos e Aplicações - RIPSA",
        year: "2024",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-14",
    title: "Ética Médica e Bioética",
    slug: "etica-medica-bioetica-sigilo-autonomia",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 14,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 30 questões",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 36,
    priority: "Crítica",
    summary: "Código de Ética Médica (Resolução CFM nº 2.217/2018) e Princípios da Bioética Principialista de Beauchamp e Childress (Autonomia, Beneficência, Não Maleficência e Justiça). Regras estritas de Sigilo Médico e suas 3 únicas exceções legais (Motivo Justo, Dever Legal como notificação compulsória, e Consentimento por escrito do paciente). Atendimento a adolescentes e sigilo frente aos pais (adolescente com discernimento tem direito a sigilo sobre vida sexual e contracepção, salvo risco de morte/dano grave). Diretivas Antecipadas de Vontade (DAV / Testamento Vital) e Ortotanásia vs Distanásia.",
    lastUpdated: "2026",
    hasProtocolUpdate: false,
    visualTreeMap: `CÓDIGO DE ÉTICA MÉDICA E BIOÉTICA (CFM 2.217/2018)
├── Princípios da Bioética: Autonomia (Consentimento Livre e Esclarecido), Beneficência, Não Maleficência e Justiça
├── REGRAS DE SIGILO PROFISSIONAL E EXCEÇÕES (Artigo 73 do CEM)
│   ├── O sigilo é a REGRA GERAL e permanece mesmo após a morte do paciente ou fato de conhecimento público
│   └── ÚNICAS 3 EXCEÇÕES LEGAIS:
│       ├── 1. DEVER LEGAL (Ex: Doenças de notificação compulsória, suspeita de violência contra criança/idoso)
│       ├── 2. MOTIVO JUSTO (Ex: Legítima defesa do médico, perigo iminente de dano a terceiros como ameaça de homicídio)
│       └── 3. CONSENTIMENTO POR ESCRITO do paciente ou de seu representante legal
├── Atendimento ao Adolescente (Resolução CFM 2.217 e ECA)
│   └── Adolescente com capacidade de discernimento tem DIREITO AO SIGILO de sua consulta e prescrição de anticoncepcionais, NÃO sendo obrigatório contar aos pais
└── Fim de Vida e Diretivas Antecipadas de Vontade (DAV - Resolução CFM 1.995/2012)
    ├── Ortotanásia (Morte natural com cuidados paliativos e alívio do sofrimento) → ÉTICA E RECOMENDADA
    └── Distanásia (Obstinação terapêutica fútil e prolongamento do sofrimento) → VEDADA AO MÉDICO`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 30,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2023.1", "Revalida 2022.2", "Revalida 2021"],
      patientProfiles: ["Adolescente de 16 anos solicita anticoncepcional na UBS e pede para o médico não contar à sua mãe."],
      frequentTriggers: ["Garantia do sigilo médico ao adolescente capaz de discernimento e prescrição do método contraceptivo."],
      mostTestedDiagnosis: "Preservação da confidencialidade e autonomia do adolescente no SUS.",
      mostTestedConduct: "Atender a paciente em sigilo, orientar sobre prevenção de ISTs, prescrever o contraceptivo e não quebrar o sigilo com os pais.",
      recurringDistractors: ["Exigir presença dos pais ou ligar para a mãe comunicando a prescrição de contraceptivo."],
      cognitiveMatrixPattern: "A banca cobra com muita firmeza o respeito à confidencialidade e às Diretivas Antecipadas de Vontade.",
    },
    sources: [
      {
        institution: "Conselho Federal de Medicina (CFM)",
        document: "Código de Ética Médica - Resolução CFM nº 2.217/2018",
        year: "2024",
        sourceType: "sociedade_especialidade",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
  {
    id: "prev-15",
    title: "Declaração de Óbito e Mortalidade",
    slug: "declaracao-de-obito-preenchimento-fluxos-legais",
    areaId: "medicina-preventiva",
    areaName: "Medicina Preventiva e Saúde Coletiva",
    order: 15,
    recurrence: "altissima",
    recurrenceBadgeLabel: "🔥 Altíssima recorrência",
    historicalFrequencyText: "DADO HISTÓRICO: 32 questões no banco Revalida INEP",
    isHistoricalData: true,
    estimatedMinutes: "35–45 min",
    moduleCount: 16,
    relatedQuestionsCount: 38,
    priority: "Crítica",
    summary: "Manual de Preenchimento da Declaração de Óbito (DO) do Ministério da Saúde e CFM: O médico que atesta é o responsável legal e ético. Fluxo em Morte Natural: Com assistência médica (Médico assistente atesta); Sem assistência médica (Serviço de Verificação de Óbitos - SVO; onde não houver SVO: médico do SUS da localidade). Fluxo em Morte Não Natural / Violenta (Homicídio, Suicídio, Acidente, Trauma, Morte Suspeita): OBRIGATORIAMENTE emitido pelo Instituto Médico Legal (IML) / Perito Legista, MESMO que a morte ocorra dentro do hospital após meses de internação. Preenchimento da Parte I (Causa Terminal na linha A até Causa Básica na última linha) e Parte II (Causas Contribuintes).",
    lastUpdated: "2026",
    hasProtocolUpdate: true,
    protocolUpdate: {
      previousConduct: "Dúvidas sobre o fluxo quando o paciente internado após trauma de trânsito falece semanas depois no hospital.",
      currentConduct: "CFM e Ministério da Saúde: Qualquer óbito decorrente de causa externa (violência, acidente de trânsito, queda de idoso, agressão, queimadura, suicídio), INDEPENDENTEMENTE do tempo transcorrido entre o evento e a morte, é de competência EXCLUSIVA do IML (Instituto Médico Legal), sendo VEDADO ao médico assistente do hospital atestar como causa natural.",
      previousDoc: "Resoluções Antigas CFM",
      currentDoc: "Manual de Instruções para Preenchimento da Declaração de Óbito - Ministério da Saúde / CFM 2024/2026",
      year: "2026",
      revalidaImpact: "Questão clássica de quase todas as edições do Revalida sobre a distinção entre SVO e IML.",
    },
    visualTreeMap: `DECLARAÇÃO DE ÓBITO (FLUXOGRAMA OFICIAL DO CFM E MS)
├── 1. MORTE POR CAUSA NÃO NATURAL / EXTERNA (Acidente, Homicídio, Suicídio, Queda, Morte Suspeita)
│   └── Competência EXCLUSIVA do INSTITUTO MÉDICO LEGAL (IML) / Perito Legista (NUNCA O MÉDICO ASSISTENTE OU SVO)
├── 2. MORTE POR CAUSA NATURAL
│   ├── Com Assistência Médica: Médico que vinha prestando assistência (ou médico de plantão em internação)
│   └── Sem Assistência Médica / Causa Desconhecida
│       ├── Município com SVO → Encaminhar ao Serviço de Verificação de Óbitos (SVO)
│       └── Município SEM SVO → Médico do serviço público de saúde mais próximo (Médico da UBS / ESF)
└── 3. ESTRUTURA DO PREENCHIMENTO DA PARTE I DA DO
    ├── Linha A (Causa Terminal / Imediata): A doença ou complicação que causou diretamente a morte (Ex: Choque Séptico)
    ├── Linha B (Causa Intermediária): Decorrente de (Ex: Pneumonia aspirativa)
    ├── Linha C / D (CAUSA BÁSICA): A doença ou lesão que iniciou a cadeia de eventos (Ex: Acidente Vascular Cerebral Isquêmico)
    └── PARTE II (Causas Contribuintes): Condições mórbidas que contribuíram, mas não entraram na cadeia causal direta (Ex: DM2, HAS)`,
    inepInsights: {
      isHistoricalData: true,
      totalQuestionsInDb: 32,
      observedInExams: ["Revalida 2024.2", "Revalida 2024.1", "Revalida 2023.2", "Revalida 2023.1", "Revalida 2022.2", "Revalida 2021"],
      patientProfiles: ["Idoso de 78 anos sofre queda da própria altura com fratura de fêmur, é operado e falece no 12º DPO por TEP."],
      frequentTriggers: ["Identificação de morte por causa externa/acidental exigindo encaminhamento ao IML."],
      mostTestedDiagnosis: "Definição do responsável pela emissão da Declaração de Óbito em causa externa.",
      mostTestedConduct: "Não atestar o óbito hospitalar; encaminhar o corpo para o Instituto Médico Legal (IML) para necropsia forense e emissão da DO pelo perito.",
      recurringDistractors: ["Atestar o óbito na UTI como morte natural por tromboembolismo pulmonar sem referenciar a fratura traumática."],
      cognitiveMatrixPattern: "A banca pune com rigor infrações éticas no preenchimento indevido de DO em causas violentas ou acidentais.",
    },
    sources: [
      {
        institution: "Ministério da Saúde / Conselho Federal de Medicina (CFM)",
        document: "Manual de Instruções para Preenchimento da Declaração de Óbito - 4ª Edição",
        year: "2024/2026",
        sourceType: "oficial_sus",
      },
    ],
    modules: [],
    finalTestQuestions: [],
  },
];
