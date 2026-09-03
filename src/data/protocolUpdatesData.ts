import { ProtocolUpdate } from "../types";

export const PROTOCOL_UPDATES_2025_2026: ProtocolUpdate[] = [
  // =========================================================================
  // 1. GINECOLOGIA E OBSTETRÍCIA
  // =========================================================================
  {
    id: "prot-go-hpv-dna-2025",
    tema: "Rastreamento do Câncer de Colo do Útero por Teste Molecular DNA-HPV no SUS",
    area: "GINECOLOGIA_OBSTETRICIA",
    subtema: "Oncologia Ginecológica & Rastreamento na APS",
    tag_ano: "ATUALIZADO_2025_E_2026",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "03/2025 (Revisão 01/2026)",
    instituicao: "Ministério da Saúde / CONITEC / INCA",
    nome_documento: "PCDT para Prevenção e Rastreamento do Câncer do Colo do Útero — Testagem Molecular DNA-HPV",
    url_oficial: "https://www.gov.br/conitec/pt-br/assuntos/avaliacao-de-tecnologias-em-saude/pcdt-rastreamento-hpv-dna",
    
    recomendacao_pre_2025: "Rastreamento exclusivamente por citopatologia convencional (Papanicolaou) dos 25 aos 64 anos, realizado anualmente e, após dois resultados normais consecutivos, a cada 3 anos.",
    atualizacao_2025: "Incorporação e início da transição nacional para o Teste Molecular de DNA-HPV de alto risco oncogênico (genotipagem 16 e 18 + pool oncogênico) no SUS como método de escolha de 5 em 5 anos para mulheres de 25 a 64 anos.",
    atualizacao_2026: "Publicação das diretrizes de triagem reflexa com citologia em base líquida e conduta direta para colposcopia em genótipos 16/18 positivos mesmo com citologia negativa, além de ampliação da cobertura na Atenção Primária.",
    conduta_vigente: "✅ Mulheres de 25 a 64 anos realizam Teste de DNA-HPV a cada 5 anos. Se DNA-HPV negativo: repetir em 5 anos. Se HPV 16 ou 18 positivo: colposcopia imediata. Se outros genótipos de alto risco positivos: citologia reflexa (se citologia ASC-US ou pior ➔ colposcopia; se negativa ➔ repetir DNA-HPV em 12 meses).",
    
    impacto_clinico: "Aumenta a sensibilidade para detecção de lesões precursoras de alto grau (NIC 2/NIC 3) e prolonga com segurança o intervalo de rastreio de 3 para 5 anos nos casos negativos.",
    impacto_revalida: "O INEP cobrará o intervalo de 5 anos para teste de DNA-HPV negativo e a indicação direta de colposcopia para genótipos 16 e 18 positivos, contrastando com o antigo fluxo trienal de Papanicolaou.",
    pegadinha: "Candidatos desatualizados escolherão repetir o exame em 1 ou 3 anos ou indicar colposcopia apenas se a citologia for alterada, esquecendo que HPV 16/18 positivo vai direto para colposcopia.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS",
    
    affected_exam_questions: [
      {
        questionId: "q-rev-2022-2-go-14",
        examCode: "REV-2022.2-GO-14",
        questionNumber: 14,
        year: 2022,
        gabarito_original: "Alternativa B (Papanicolaou a cada 3 anos após dois normais anuais)",
        o_que_mudou_2025: "O Ministério da Saúde aprovou a transição para DNA-HPV com periodicidade de 5 anos.",
        o_que_mudou_2026: "Protocolo de triagem molecular consolidado com colposcopia mandatória para genótipos 16/18.",
        conduta_vigente: "Teste molecular DNA-HPV a cada 5 anos; se negativo, próximo teste aos 5 anos.",
        aviso_desatualizacao: "Atenção: esta questão utilizou a diretriz de citologia trienal vigente em 2022. A conduta atual incorpora o DNA-HPV a cada 5 anos."
      }
    ],
    flashcards: [
      {
        id: "fc-hpv-01",
        type: "O_QUE_MUDOU",
        front: "Qual é o intervalo de rastreamento do câncer de colo uterino no SUS quando utilizado o teste molecular de DNA-HPV negativo?",
        back: "Intervalo de 5 anos (para mulheres de 25 a 64 anos).",
        tag: "Ginecologia"
      },
      {
        id: "fc-hpv-02",
        type: "PEGADINHA",
        front: "Mulher de 32 anos realiza teste de DNA-HPV com resultado positivo para genótipo 16 e citologia reflexa negativa. Qual a conduta?",
        back: "Encaminhar diretamente para Colposcopia (HPV 16 ou 18 positivo indica colposcopia imediata, independente da citologia).",
        tag: "Ginecologia"
      }
    ],
    ineditas: [
      {
        id: "ined-go-hpv-01",
        difficulty: "MEDIO",
        statement: "Mulher de 34 anos, assintomática, comparece à Unidade Básica de Saúde para exame de rotina. Realizou teste molecular de DNA-HPV pelo SUS, que evidenciou presença de HPV tipo 16. A citologia reflexa em meio líquido não revelou atipias celulares. Considerando as diretrizes vigentes do Ministério da Saúde / INCA, qual é a conduta correta?",
        options: [
          { id: "A", text: "Repetir o teste de DNA-HPV em 12 meses.", justification: "Incorreto. Essa conduta é para pool de alto risco não 16/18 com citologia negativa." },
          { id: "B", text: "Encaminhar a paciente para colposcopia imediata.", justification: "Correto. Pelo protocolo do MS/INCA, a presença de HPV 16 ou 18 confere altíssimo risco oncogênico e impõe colposcopia direta.", isOldProtocolTrap: false },
          { id: "C", text: "Repetir a citologia oncótica convencional em 6 meses.", justification: "Incorreto. Rastreio citológico isolado não deve atrasar a colposcopia no HPV 16.", isOldProtocolTrap: true },
          { id: "D", text: "Prescrever imunoterapia tópica com imiquimode e reavaliar em 1 ano.", justification: "Incorreto. Não há indicação de tratamento tópico em colo sem confirmação histológica de NIC." }
        ],
        correctAnswer: "B",
        commentary: "No rastreamento com DNA-HPV, a identificação dos genótipos 16 e 18 impõe colposcopia diagnóstica imediata, independentemente do resultado citológico reflexo.",
        protocolo: "PCDT Rastreamento Câncer do Colo Uterino — CONITEC/MS",
        fonte_oficial: "Ministério da Saúde",
        ano_atualizacao: "2025"
      }
    ]
  },

  {
    id: "prot-go-preeclampsia-2025",
    tema: "Prevenção da Pré-Eclâmpsia com AAS e Cálcio em Gestantes de Alto Risco",
    area: "GINECOLOGIA_OBSTETRICIA",
    subtema: "Obstetrícia de Alto Risco / Síndromes Hipertensivas",
    tag_ano: "ATUALIZACAO_2025",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "05/2025",
    instituicao: "FEBRASGO / Ministério da Saúde",
    nome_documento: "Diretrizes de Manejo e Profilaxia da Pré-Eclâmpsia na Gestação",
    url_oficial: "https://www.febrasgo.org.br/preeclampsia-profilaxia-2025",
    
    recomendacao_pre_2025: "Prescrição de ácido acetilsalicílico (AAS) na dose de 100 mg/dia iniciada entre 12 e 16 semanas para gestantes de alto risco, e suplementação de cálcio 1g/dia apenas em áreas de baixa ingesta.",
    atualizacao_2025: "Padronização da dose de AAS em 150 mg/dia (em tomada noturna única), iniciada entre a 12ª e a 16ª semana (podendo ser iniciada até a 20ª semana) até a 36ª semana, associada a Carbonato de Cálcio 1,5 g a 2,0 g/dia para todas as gestantes com baixa ingesta de cálcio dietético.",
    conduta_vigente: "✅ Gestantes com alto risco para pré-eclâmpsia (história prévia de PE, hipertensão crônica, DM prévio, DRC, doença autoimune como LES/SAF): AAS 150 mg à noite (12 a 36 semanas) + Carbonato de Cálcio elementar 1,5 g a 2,0 g/dia fracionado (a partir de 12 semanas até o parto).",
    
    impacto_clinico: "A dose de 150 mg de AAS à noite é superior à dose de 100 mg na inibição da síntese de tromboxano A2 placentário e na redução de pré-eclâmpsia precoce e restrição de crescimento fetal.",
    impacto_revalida: "O INEP frequentemente cobra a dose exata e o horário (noturno) de administração do AAS (150 mg à noite) e o rastreamento dos fatores de risco maiores e moderados.",
    pegadinha: "Assinalar AAS 100 mg pela manhã ou iniciar após 20 semanas; esquecer de prescrever cálcio 1,5g/dia conjuntamente.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS",
    
    affected_exam_questions: [
      {
        questionId: "q-rev-2021-go-45",
        examCode: "REV-2021-GO-45",
        questionNumber: 45,
        year: 2021,
        gabarito_original: "Alternativa C (AAS 100 mg)",
        o_que_mudou_2025: "Dose profilática padronizada para 150 mg à noite associada a Carbonato de Cálcio 1,5g a 2g.",
        conduta_vigente: "AAS 150 mg/dia à noite + Carbonato de Cálcio 1,5g/dia fracionado.",
        aviso_desatualizacao: "Atenção: à época da prova de 2021, a dose de 100 mg era aceita. Atualmente, a FEBRASGO e o MS preconizam 150 mg/dia."
      }
    ],
    flashcards: [
      {
        id: "fc-pe-01",
        type: "O_QUE_MUDOU",
        front: "Qual é a dose e o período de uso do AAS para profilaxia de pré-eclâmpsia em gestantes de alto risco segundo as diretrizes atuais?",
        back: "AAS 150 mg/dia em tomada noturna, iniciado entre 12 e 16 semanas (máximo até 20 sem) e mantido até 36 semanas.",
        tag: "Obstetrícia"
      }
    ]
  },

  {
    id: "prot-go-vsr-vacina-2025",
    tema: "Vacina Bivalente Materna contra o Vírus Sincicial Respiratório (VSR)",
    area: "GINECOLOGIA_OBSTETRICIA",
    subtema: "Vacinação da Gestante & Imunização Neonatal",
    tag_ano: "ATUALIZADO_2025_E_2026",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "11/2025 (Edição PNI 2026)",
    instituicao: "Ministério da Saúde / PNI / ANVISA / FEBRASGO",
    nome_documento: "Nota Técnica PNI/MS — Imunização Materna contra o VSR para Prevenção da Bronquiolite",
    url_oficial: "https://www.gov.br/saude/pni-vacina-vsr-gestantes",
    
    recomendacao_pre_2025: "Não existia vacina materna aprovada para prevenção de infecção por VSR no recém-nascido; a proteção era restrita ao palivizumabe em prematuros extremos selecionados.",
    atualizacao_2025: "Aprovação e recomendação da vacina bivalente contra VSR (proteína F recombinante pré-fusão) para administração em dose única em gestantes entre a 32ª e a 36ª semana de idade gestacional.",
    atualizacao_2026: "Inclusão nas estratégias sazonais do SUS para proteção passiva do lactente nos primeiros 6 meses de vida contra doença do trato respiratório inferior associada ao VSR.",
    conduta_vigente: "✅ Administrar 1 dose da vacina contra VSR para gestantes entre 32 e 36 semanas de gestação (idealmente 32 a 36 semanas), em conjunto com o calendário habitual da gestante (dTpa a partir da 20ª semana, Hepatite B, Influenza e Covid-19).",
    
    impacto_clinico: "Reduz em mais de 80% o risco de hospitalização por bronquiolite grave e necessidade de UTI neonatal por VSR nos primeiros 90 a 180 dias de vida da criança.",
    impacto_revalida: "O INEP poderá questionar a idade gestacional exata para aplicação (32 a 36 semanas) e a via de proteção (imunização passiva via transferência transplacentária de anticorpos IgG).",
    pegadinha: "Confundir a indicação com palivizumabe ou nirsevimabe (que são aplicados na criança) ou indicar a vacina em primeiro trimestre.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS",
    flashcards: [
      {
        id: "fc-vsr-mat-01",
        type: "DATA_PROTOCOLO",
        front: "Em qual faixa de idade gestacional a vacina materna contra o VSR deve ser aplicada?",
        back: "Entre a 32ª e a 36ª semana de gestação (dose única IM).",
        tag: "Obstetrícia / Imunização"
      }
    ]
  },

  {
    id: "prot-go-hpp-tranexamico-2025",
    tema: "Manejo da Hemorragia Pós-Parto (HPP) e Protocolo Zero Morte Materna",
    area: "GINECOLOGIA_OBSTETRICIA",
    subtema: "Urgências Obstétricas",
    tag_ano: "ATUALIZACAO_2025",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "04/2025",
    instituicao: "Ministério da Saúde / OPAS / FEBRASGO",
    nome_documento: "Estratégia Zero Morte Materna por Hemorragia — Guia de Manejo Clínico da HPP",
    url_oficial: "https://www.gov.br/saude/zero-morte-materna-hpp",
    
    recomendacao_pre_2025: "Definição de HPP baseada em perda volumétrica estimada (> 500 mL no parto vaginal e > 1.000 mL na cesariana). Uso tardio de ácido tranexâmico apenas após falha de ocitocina e misoprostol.",
    atualizacao_2025: "Definição precoce de HPP por perda sanguínea cumulativa ≥ 1.000 mL ou qualquer perda acompanhada de sinais de choque (Índice de Choque = FC / PAS ≥ 0,9). Uso obrigatório de Ácido Tranexâmico 1g IV em 10 minutos NA PRIMEIRA HORA do sangramento (com repetição de 1g se sangramento persistir após 30 min), em paralelo à ocitocina e massagem uterina bimanual.",
    conduta_vigente: "✅ 1) Medida profilática: Ocitocina 10 UI IM no desprendimento do ombro anterior. 2) Se HPP confirmada (ou Índice de Choque ≥ 0,9): Ocitocina IV em infusão + Ácido Tranexâmico 1g IV em 10 min (dentro dos primeiros 60 min) + Massagem bimanual (Hamilton) + Sondagem vesical de alívio. Se atonia refratária: Balão de Tamponamento Intrauterino (Bakri) antes da abordagem cirúrgica.",
    
    impacto_clinico: "O uso do ácido tranexâmico na 1ª hora reduz a mortalidade por sangramento materno em cerca de 30% sem aumentar eventos tromboembólicos.",
    impacto_revalida: "O INEP cobra o cálculo do Índice de Choque (FC/PAS ≥ 0,9 indicando transfusão precoce/gravidade) e a sequência de condutas na atonia uterina (ocitocina + ácido tranexâmico ➔ balão intrauterino ➔ laparotomia/B-Lynch/histerectomia).",
    pegadinha: "Esperar o resultado laboratorial de hematócrito para iniciar o ácido tranexâmico ou prescrever ergotamina em gestante hipertensa.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  // =========================================================================
  // 2. PEDIATRIA
  // =========================================================================
  {
    id: "prot-ped-vip-vop-2025",
    tema: "Extinção da VOP (Gotinha) e Transição para Esquema 100% Injetável VIP no PNI",
    area: "PEDIATRIA",
    subtema: "Imunizações na Infância",
    tag_ano: "ATUALIZADO_2025_E_2026",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "01/2025 (Consolidado 2026)",
    instituicao: "Ministério da Saúde / Secretaria de Vigilância em Saúde e Ambiente (SVSA) / PNI",
    nome_documento: "Informe Técnico PNI/MS — Substituição da Vacina Oral Poliomielite (VOPb) pela Vacina Inativada Poliomielite (VIP)",
    url_oficial: "https://www.gov.br/saude/pni-esquema-vip-exclusivo",
    
    recomendacao_pre_2025: "Esquema básico com 3 doses de VIP aos 2, 4 e 6 meses, seguido de 2 doses de reforço com a vacina oral atenuada (VOPb - gotinha) aos 15 meses e aos 4 anos de idade.",
    atualizacao_2025: "Extinção completa da VOP no Brasil. Os reforços dos 15 meses e 4 anos passaram a ser realizados exclusivamente com a Vacina Inativada Poliomielite (VIP injetável).",
    atualizacao_2026: "Padronização do esquema vacinal 100% VIP de 4 doses: 2 meses (1ª dose), 4 meses (2ª dose), 6 meses (3ª dose) e reforço único aos 15 meses de idade com VIP (eliminação definitiva do reforço dos 4 anos no SUS).",
    conduta_vigente: "✅ Esquema contra Poliomielite no SUS: 1ª dose: 2 meses (VIP injetável); 2ª dose: 4 meses (VIP injetável); 3ª dose: 6 meses (VIP injetável); Reforço: 15 meses (VIP injetável). A vacina VOP (gotinha) NÃO É MAIS UTILIZADA no Brasil.",
    
    impacto_clinico: "Elimina o risco de poliomielite vacinal associada ao vírus atenuado derivado e alinha o Brasil às metas da OMS de erradicação global da poliomielite.",
    impacto_revalida: "Questão clássica de calendário vacinal: o INEP cobrará a aplicação de VIP aos 15 meses e a ausência da VOP aos 4 anos.",
    pegadinha: "Assinalar VOP aos 15 meses ou marcar que a criança de 4 anos ainda precisa tomar a gotinha de reforço.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS",
    
    affected_exam_questions: [
      {
        questionId: "q-rev-2022-1-ped-19",
        examCode: "REV-2022.1-PED-19",
        questionNumber: 19,
        year: 2022,
        gabarito_original: "Alternativa B (VOP oral aos 15 meses e aos 4 anos)",
        o_que_mudou_2025: "A VOP foi descontinuada e substituída por VIP.",
        o_que_mudou_2026: "Consolidação de 4 doses de VIP (2, 4, 6 e 15 meses).",
        conduta_vigente: "VIP injetável aos 2, 4, 6 e reforço aos 15 meses. Nenhuma dose de VOP.",
        aviso_desatualizacao: "Atenção: esta questão utilizou o calendário antigo com VOP. Atualmente o PNI utiliza 100% VIP injetável."
      }
    ],
    flashcards: [
      {
        id: "fc-polio-01",
        type: "O_QUE_MUDOU",
        front: "Qual é o esquema vacinal oficial contra Poliomielite no Brasil atualmente?",
        back: "4 doses de VIP injetável: aos 2, 4, 6 meses e reforço aos 15 meses. A VOP foi extinta.",
        tag: "Pediatria / Vacinas"
      }
    ]
  },

  {
    id: "prot-ped-nirsevimabe-2025",
    tema: "Profilaxia do VSR com Nirsevimabe em Recém-Nascidos de Alto Risco",
    area: "PEDIATRIA",
    subtema: "Infectopediatria & Neonatologia",
    tag_ano: "ATUALIZADO_2025_E_2026",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "08/2025 (PCDT MS 2026)",
    instituicao: "Ministério da Saúde / CONITEC / Sociedade Brasileira de Pediatria (SBP)",
    nome_documento: "PCDT para Prevenção da Infecção Grave pelo Vírus Sincicial Respiratório em Lactentes",
    url_oficial: "https://www.gov.br/conitec/pcdt-nirsevimabe-lactentes",
    
    recomendacao_pre_2025: "Uso de Palivizumabe em 5 doses mensais consecutivas intramusculares durante a estação de circulação do VSR para prematuros < 29 semanas e cardiopatas/pneumopatas graves < 2 anos.",
    atualizacao_2025: "Incorporação do Nirsevimabe (anticorpo monoclonal de meia-vida estendida) no SUS para prematuros < 35 semanas e crianças com cardiopatia congênita com repercussão hemodinâmica ou doença pulmonar crônica da prematuridade.",
    atualizacao_2026: "Esquema em dose única intramuscular antes ou no início do período sazonal de circulação do VSR, substituindo progressivamente as 5 aplicações do palivizumabe.",
    conduta_vigente: "✅ Nirsevimabe em DOSE ÚNICA IM (50 mg para < 5 kg e 100 mg para ≥ 5 kg) no primeiro ano de vida para recém-nascidos prematuros (< 35 semanas) e lactentes de alto risco (cardiopatas e pneumopatas crônicos).",
    
    impacto_clinico: "Substitui 5 injeções dolorosas mensais por 1 única dose protetora para toda a temporada de circulação do VSR com eficácia superior a 80%.",
    impacto_revalida: "O INEP cobrará a posologia em dose única e a indicação nos grupos de risco neonatal.",
    pegadinha: "Prescrever 5 doses de nirsevimabe (como se fosse palivizumabe) ou não reconhecer a dose única.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  {
    id: "prot-ped-bronquiolite-2025",
    tema: "Diretrizes de Manejo da Bronquiolite Viral Aguda (BVA) na Emergência e APS",
    area: "PEDIATRIA",
    subtema: "Pneumopediatria / Emergências Pediátricas",
    tag_ano: "ATUALIZACAO_2025",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "06/2025",
    instituicao: "Sociedade Brasileira de Pediatria (SBP) / Ministério da Saúde",
    nome_documento: "Documento Científico SBP: Atualização no Manejo da Bronquiolite Viral Aguda",
    url_oficial: "https://www.sbp.com.br/diretrizes-bronquiolite-2025",
    
    recomendacao_pre_2025: "Muitos serviços ainda realizavam teste terapêutico com broncodilatador inalatório (salbutamol) ou prescreviam nebulização com solução salina hipertônica 3% e corticoides orais.",
    atualizacao_2025: "Contraindicação estrita do uso de rotina de beta-2 agonistas (salbutamol/fenoterol), corticoides sistêmicos ou inalatórios, solução salina hipertônica e antibióticos em lactentes com primeiro episódio de BVA típica.",
    conduta_vigente: "✅ O tratamento da BVA é estritamente de suporte: 1) Oxigenoterapia se SpO2 < 90-92% (alvo ≥ 92%); 2) Desobstrução de vias aéreas superiores com soro fisiológico 0,9%; 3) Hidratação e suporte nutricional adequado; 4) Suporte ventilatório não invasivo (CNAF - Cânula Nasal de Alto Fluxo / CPAP) se desconforto moderado a grave. NÃO usar salbutamol, corticoide nem antibiótico.",
    
    impacto_clinico: "Evita eventos adversos farmacológicos (taquicardia, hipocalemia, efeitos colaterais de corticoides) e custos desnecessários em um quadro viral autoimune autolimitado.",
    impacto_revalida: "O INEP coloca casos de lactentes com coriza, febre baixa e sibilância bilateral e tenta induzir o candidato a prescrever nebulização com salbutamol ou prednisolona. A resposta correta é lavagem nasal e oxigênio se necessário.",
    pegadinha: "Assinalar nebulização com salbutamol ou corticoide sistêmico como 'teste terapêutico'.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  {
    id: "prot-ped-hpv-dose-unica-2025",
    tema: "Vacina HPV Papilomavírus Humano em Dose Única no Calendário do SUS",
    area: "PEDIATRIA",
    subtema: "Saúde do Adolescente & Imunizações",
    tag_ano: "ATUALIZACAO_2025",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "04/2025",
    instituicao: "Ministério da Saúde / PNI / OPAS",
    nome_documento: "Nota Técnica PNI/MS — Adoção do Esquema de Dose Única da Vacina HPV Quadrivalente",
    url_oficial: "https://www.gov.br/saude/pni-hpv-dose-unica",
    
    recomendacao_pre_2025: "Esquema de 2 doses (0 e 6 meses) para meninas e meninos de 9 a 14 anos de idade.",
    atualizacao_2025: "Adoção do esquema de DOSE ÚNICA da vacina HPV quadrivalente para a faixa etária de 9 a 14 anos (9 a 14 anos, 11 meses e 29 dias) para ambos os sexos no SUS.",
    conduta_vigente: "✅ População geral de 9 a 14 anos: 1 dose única da vacina HPV quadrivalente. Exceção (Imunossuprimidos, pessoas com HIV/aids, transplantados, vítimas de violência sexual e pacientes oncológicos de 9 a 45 anos): manter esquema de 3 doses (0, 2 e 6 meses).",
    
    impacto_clinico: "Evidências robustas comprovam imunogenicidade e proteção contra infecção persistente e lesões pré-cancerosas com 1 única dose em adolescentes hígidos, ampliando drasticamente a cobertura vacinal.",
    impacto_revalida: "O INEP explorará a diferença entre a população geral hígida de 9 a 14 anos (1 dose única) versus imunocomprometidos e vítimas de violência (3 doses: 0, 2 e 6 meses).",
    pegadinha: "Recomendar 2 doses para adolescente hígido de 12 anos ou aplicar dose única em paciente portador de HIV.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  // =========================================================================
  // 3. CLÍNICA MÉDICA
  // =========================================================================
  {
    id: "prot-cm-has-sbc-2026",
    tema: "Diretrizes Brasileiras de Hipertensão Arterial 2026 — Terapia Combinada Precoce",
    area: "CLINICA_MEDICA",
    subtema: "Cardiologia & Atenção Primária",
    tag_ano: "ATUALIZACAO_2026",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "04/2026",
    instituicao: "Sociedade Brasileira de Cardiologia (SBC) / SBH / SBN",
    nome_documento: "Diretrizes Brasileiras de Hipertensão Arterial Sistêmica — SBC/SBH/SBN 2026",
    url_oficial: "https://abccardiol.org/diretriz-has-sbc-2026",
    
    recomendacao_pre_2025: "Monoterapia inicial em hipertensão estágio 1 de baixo ou moderado risco cardiovascular, reservando combinação dupla apenas para estágio 2/3 ou alto risco.",
    atualizacao_2025: "Indicação de combinação fixa de dois fármacos em dose baixa para estágio 1 com múltiplos fatores de risco e meta < 130x80 mmHg em alto risco.",
    atualizacao_2026: "Consolidação da terapia combinada inicial (dupla terapia em dose fixa única) como primeira escolha para a MAIORIA dos hipertensos (exceto idosos muito frágeis ou hipertensos estágio 1 de muito baixo risco), com meta pressórica < 130/80 mmHg para todos os pacientes de risco cardiovascular moderado ou alto.",
    conduta_vigente: "✅ Tratamento farmacológico inicial de escolha: Combinação de 2 fármacos de classes diferentes em comprimido único (IECA ou BRA + Bloqueador de Canal de Cálcio OU Diurético Tiazídico). Monoterapia é restrita a hipertensos estágio 1 de baixo risco ou idosos frágeis. Alvo pressórico: < 130/80 mmHg para risco moderado/alto e < 140/90 mmHg para baixo risco.",
    
    impacto_clinico: "Atingimento da meta pressórica em menor tempo, melhor adesão terapêutica devido ao comprimido único e redução de desfechos cardiovasculares maiores (IAM e AVC).",
    impacto_revalida: "O INEP apresentará um paciente estágio 1 com fator de risco (ex: tabagista ou dislipidêmico) e exigirá a combinação de dois anti-hipertensivos em vez de monoterapia.",
    pegadinha: "Assinalar monoterapia com Enalapril ou Losartana isolados para paciente estágio 1 com risco cardiovascular associado.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  {
    id: "prot-cm-dm2-sbd-2026",
    tema: "Diretrizes da Sociedade Brasileira de Diabetes (SBD 2026) — Benefício Cardiorrenal dos iSGLT2 e análogos GLP-1",
    area: "CLINICA_MEDICA",
    subtema: "Endocrinologia & Nefrologia",
    tag_ano: "ATUALIZADO_2025_E_2026",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "02/2026",
    instituicao: "Sociedade Brasileira de Diabetes (SBD) / CONITEC",
    nome_documento: "Diretrizes da Sociedade Brasileira de Diabetes — Edição Oficial 2026",
    url_oficial: "https://diretriz.diabetes.org.br/edicao-2026",
    
    recomendacao_pre_2025: "Metformina como primeiro degrau obrigatório e isolado em todos os pacientes com DM2, escalonando novas drogas apenas se a meta de HbA1c não fosse atingida após 3 meses.",
    atualizacao_2025: "Inclusão formal dos inibidores de SGLT2 (Dapagliflozina/Empagliflozina) no SUS para pacientes com DM2 e Insuficiência Cardíaca ou Doença Renal Crônica.",
    atualizacao_2026: "Indicação de iSGLT2 ou análogos do receptor de GLP-1 na PRIMEIRA LINHA de tratamento (junto ou até antes da metformina), INDEPENDENTE do valor da HbA1c basal, em qualquer paciente com DM2 que apresente: Doença Cardiovascular Estabelecida (DAC, AVC, DAP), Insuficiência Cardíaca (qualquer fração de ejeção) ou Doença Renal Crônica (RFG 20 a 60 mL/min/1,73m² ou albuminúria > 30 mg/g).",
    conduta_vigente: "✅ No paciente com DM2 e IC, DRC ou alto risco cardiovascular: Prescrever iSGLT2 (ex: Dapagliflozina 10 mg/dia) de imediato como cardioproteção e nefroproteção, independente do nível de HbA1c e paralelamente à Metformina e controle de estilo de vida.",
    
    impacto_clinico: "Redução drástica de internações por descompensação de insuficiência cardíaca, retardo da progressão para diálise e queda na mortalidade cardiovascular global.",
    impacto_revalida: "O INEP apresentará caso de paciente com DM2 e albuminúria ou IC compensada com HbA1c quase na meta (ex: 7,1%) e cobrará a introdução de iSGLT2 com foco em proteção de órgãos-alvo.",
    pegadinha: "Assinalar que não é necessário adicionar medicação porque a glicemia está quase controlada, ignorando o benefício de órgão-alvo do iSGLT2.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  {
    id: "prot-cm-asma-gina-2026",
    tema: "Manejo da Asma — Proibição de SABA Isolado e Terapia SMART (GINA / SBPT)",
    area: "CLINICA_MEDICA",
    subtema: "Pneumologia & Atenção Primária",
    tag_ano: "ATUALIZACAO_2026",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "05/2026",
    instituicao: "Global Initiative for Asthma (GINA) / SBPT",
    nome_documento: "Relatório Global para Manejo e Prevenção da Asma (GINA 2026) — Adaptação Brasileira",
    url_oficial: "https://ginasthma.org/reports-2026",
    
    recomendacao_pre_2025: "Uso de broncodilatador de curta duração isolado (SABA, ex: salbutamol) como medicação de alívio no degrau 1 (asma intermitente).",
    atualizacao_2025: "Reforço contra o uso de SABA isolado em adolescentes e adultos devido ao risco de dessensibilização de receptores beta e aumento de exacerbações graves.",
    atualizacao_2026: "Consolidação da Estratégia Preferencial (Trilha 1 GINA): Corticoide Inalatório em dose baixa associado a Formoterol (CI + Formoterol) como droga de escolha tanto para ALÍVIO de sintomas quanto para MANUTENÇÃO (estratégia SMART) a partir do degrau 1 em todos os pacientes ≥ 12 anos.",
    conduta_vigente: "✅ Na asma leve (degraus 1 e 2): Corticoide Inalatório + Formoterol sob demanda para alívio dos sintomas. Na asma moderada a grave (degraus 3 a 5): Corticoide Inalatório + Formoterol diário de manutenção e como alívio nas crises (SMART). O uso de Salbutamol isolado em monoterapia é formalmente contraindicado.",
    
    impacto_clinico: "Reduz em 60-70% as internações e idas a prontos-socorros por crise asmática ao tratar a inflamação de base em toda e qualquer crise sintomática.",
    impacto_revalida: "O INEP apresentará paciente com sintomas eventuais de asma e opções com 'Salbutamol de resgate' versus 'Budesonida + Formoterol de resgate'. A alternativa correta é a associação com corticoide inalatório.",
    pegadinha: "Prescrever salbutamol inalatório isolado para o alívio das crises leves.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  {
    id: "prot-cm-ic-quadrupla-2025",
    tema: "Terapia Farmacológica Quádrupla Padrão-Ouro na Insuficiência Cardíaca com FE Reduzida (ICFEr)",
    area: "CLINICA_MEDICA",
    subtema: "Cardiologia & Terapia Intensiva",
    tag_ano: "ATUALIZACAO_2025",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "03/2025",
    instituicao: "Sociedade Brasileira de Cardiologia (SBC) / DEIC",
    nome_documento: "Diretriz Brasileira de Insuficiência Cardíaca com Fração de Ejeção Reduzida",
    url_oficial: "https://abccardiol.org/diretriz-icfer-sbc-2025",
    
    recomendacao_pre_2025: "Tríplice terapia clássica com IECA/BRA + Betabloqueador + Antagonista de Receptor Mineralocorticoide (Espironolactona), introduzindo iSGLT2 apenas em etapas posteriores.",
    atualizacao_2025: "Indicação formal dos 4 pilares farmacológicos simultâneos ou de rápida titulação na internação ou ambulatorial em todos os pacientes com FEVE ≤ 40%: 1) Sacubitril/Valsartana (ARNI) ou IECA/BRA; 2) Betabloqueador (Carvedilol, Succinato de Metoprolol ou Bisoprolol); 3) Espironolactona; 4) Inibidor de SGLT2 (Dapagliflozina ou Empagliflozina 10mg).",
    conduta_vigente: "✅ Quádrupla terapia instituída precocemente para todo paciente com ICFEr sintomático ou assintomático com FEVE ≤ 40%, pois cada pilar atua em uma via fisiopatológica distinta reduzindo mortalidade.",
    
    impacto_clinico: "A quádrupla terapia reduz em mais de 60% a mortalidade cardiovascular em 2 anos comparada ao tratamento convencional antigo.",
    impacto_revalida: "O INEP frequentemente questiona qual fármaco com impacto comprovado na sobrevida está faltando no esquema de um paciente que usa apenas IECA + Betabloqueador (resposta: Espironolactona e/ou Dapagliflozina).",
    pegadinha: "Confundir diuréticos de alça (Furosemida) como redutor de mortalidade (furosemida melhora sintomas e congestão, mas não reduz sobrevida isoladamente).",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  // =========================================================================
  // 4. INFECTOLOGIA
  // =========================================================================
  {
    id: "prot-inf-hiv-dtg-3tc-2025",
    tema: "PCDT Manejo da Infecção pelo HIV no Adulto — Terapia Dupla DTG + 3TC de Primeira Linha",
    area: "CLINICA_MEDICA",
    subtema: "Infectologia & IST",
    tag_ano: "ATUALIZADO_2025_E_2026",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "02/2025 (Revisão 2026)",
    instituicao: "Ministério da Saúde / DATHI / SVSA",
    nome_documento: "Protocolo Clínico e Diretrizes Terapêuticas para Manejo da Infecção pelo HIV em Adultos — PCDT HIV",
    url_oficial: "https://www.gov.br/aids/pcdt-hiv-adultos",
    
    recomendacao_pre_2025: "Terapia antirretroviral de 1ª linha universalmente composta por 3 fármacos: Tenofovir (TDF) + Lamivudina (3TC) + Dolutegravir (DTG 50mg) em comprimido único diário.",
    atualizacao_2025: "Aprovação do esquema de terapia dupla DTG 50mg + 3TC 300mg como opção preferencial de primeira linha para pessoas vivendo com HIV virgens de tratamento com carga viral < 500.000 cópias/mL e sem coinfecção por Hepatite B.",
    atualizacao_2026: "Disponibilização do comprimido em coformulação única em dose fixa combinada (Dolutegravir + Lamivudina) no SUS e extensão para simplificação terapêutica em pacientes com supressão viral sustentada.",
    conduta_vigente: "✅ Esquema inicial para PVHIV virgens de tratamento sem coinfecção com Hepatite B e CV < 500.000 cópias/mL: DTG + 3TC (terapia dupla). Se coinfecção com Hepatite B, TB ativa em uso de rifampicina ou CV > 500.000 cópias/mL: manter esquema triplo TDF + 3TC + DTG.",
    
    impacto_clinico: "Menor toxicidade óssea e renal a longo prazo por eliminar a exposição ao tenofovir nos pacientes elegíveis, mantendo excelente barreira genética.",
    impacto_revalida: "O INEP cobrará os critérios de elegibilidade para o esquema duplo (ausência de HBsAg positivo e CV < 500.000) e o manejo da coinfecção com Tuberculose (necessidade de dobrar a dose de Dolutegravir para 50mg de 12/12h devido à indução enzimática pela Rifampicina).",
    pegadinha: "Prescrever esquema duplo para paciente coinfectado com Hepatite B crônica (onde o Tenofovir é obrigatório para tratar o HBV).",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  {
    id: "prot-inf-dengue-6ed-2025",
    tema: "Manejo Clínico da Dengue — Guia do Ministério da Saúde 6ª Edição",
    area: "CLINICA_MEDICA",
    subtema: "Infectologia & Urgências na Atenção Primária / UPA",
    tag_ano: "ATUALIZACAO_2025",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "01/2025",
    instituicao: "Ministério da Saúde / SVSA",
    nome_documento: "Dengue: Diagnóstico e Manejo Clínico (Adulto e Criança) — 6ª Edição",
    url_oficial: "https://www.gov.br/saude/dengue-guia-6ed",
    
    recomendacao_pre_2025: "Esquemas com volumes e tempos variáveis de expansão volêmica no Grupo C e uso de salina 0,9% em bolus despadronizados.",
    atualizacao_2025: "Padronização estrita dos 4 grupos de estadiamento da Dengue: Grupo A (sem sinais de alarme e sem comorbidades), Grupo B (sem alarme mas com risco social/comorbidades/lactentes/gestantes/idosos), Grupo C (com pelo menos 1 sinal de alarme) e Grupo D (dengue grave / choque / sangramento grave / disfunção orgânica).",
    conduta_vigente: "✅ Conduta por grupo: Grupo A: Hidratação oral ambulatorial (60 mL/kg/dia, 1/3 soro de reidratação oral e 2/3 líquidos caseiros). Grupo B: Hemograma obrigatório e hidratação oral supervisionada na unidade até resultado. Grupo C (Alarme presente: dor abdominal intensa, vômitos persistentes, hipotensão postural, lipotímia, hepatomegalia > 2cm, hemoconcentração, sangramento de mucosa, letargia): HIDRATAÇÃO VENOSA IMEDIATA com 20 mL/kg em 2 HORAS (soro fisiológico ou ringer lactato) e reavaliação. Grupo D (Choque: PA convergente, TEC > 2s, pulso filiforme): HIDRATAÇÃO VENOSA RÁPIDA com 20 mL/kg em 20 MINUTOS.",
    
    impacto_clinico: "A hidratação parenteral imediata no Grupo C antes de qualquer exame confirmatório previne a progressão para choque hemorrágico e colapso circulatório.",
    impacto_revalida: "O INEP cobra a identificação precisa dos sinais de alarme (Grupo C) e a prescrição exata de 20 mL/kg em 2 horas em leito de observação por no mínimo 48 horas.",
    pegadinha: "Aguardar sorologia ou teste de antígeno NS1 para iniciar a hidratação parenteral em paciente com sinais de alarme; ou enviar paciente com vômitos incoercíveis para hidratação em casa.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  {
    id: "prot-inf-tuberculose-3hp-2025",
    tema: "Tratamento da Infecção Latente da Tuberculose (ILTB) com Esquema Curto 3HP",
    area: "CLINICA_MEDICA",
    subtema: "Pneumologia & Infectologia",
    tag_ano: "ATUALIZADO_2025_E_2026",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "03/2025",
    instituicao: "Ministério da Saúde / CONITEC / Programa Nacional de Controle da Tuberculose",
    nome_documento: "PCDT para Controle da Tuberculose e Infecção Latente pelo Mycobacterium tuberculosis",
    url_oficial: "https://www.gov.br/saude/pcdt-tuberculose-iltb",
    
    recomendacao_pre_2025: "Monoterapia com Isoniazida diária por 6 a 9 meses (270 doses) com alta taxa de abandono do tratamento preventivo.",
    atualizacao_2025: "Adoção do esquema ultracurto 3HP (Rifapentina associada à Isoniazida) administrado em apenas 1 dose por semana durante 12 semanas (total de 12 doses semanais) como tratamento preferencial de primeira linha para ILTB no SUS para maiores de 2 anos.",
    conduta_vigente: "✅ Na indicação de tratamento de ILTB (contatos domiciliares de TB bacilífera com PPD/IGRA positivo, pessoas vivendo com HIV com CD4 < 350 ou PPD ≥ 5mm, pacientes antes de iniciar imunobiológicos anti-TNF): Prescrever Esquema 3HP (Isoniazida + Rifapentina uma vez por semana por 12 semanas supervisionadas).",
    
    impacto_clinico: "Aumenta a taxa de adesão e conclusão do tratamento de 50% para mais de 85%, com perfil de segurança e menor hepatotoxicidade que a isoniazida isolada por 9 meses.",
    impacto_revalida: "O INEP cobrará o esquema semanal de 12 doses (3HP) e o manejo dos contatos de TB bacilífera pulmonar.",
    pegadinha: "Assinalar 9 meses de isoniazida diária quando o esquema de 12 semanas com rifapentina + isoniazida estiver disponível.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  // =========================================================================
  // 5. CIRURGIA GERAL E EMERGÊNCIA
  // =========================================================================
  {
    id: "prot-cir-trauma-atls-2025",
    tema: "Ressuscitação Hemostática no Choque Hemorrágico do Trauma (ATLS / SBAIT)",
    area: "CIRURGIA_GERAL",
    subtema: "Trauma & Cirurgia de Emergência",
    tag_ano: "ATUALIZADO_2025_E_2026",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "05/2025",
    instituicao: "Colégio Americano de Cirurgiões (ATLS) / SBAIT / CBC",
    nome_documento: "Diretrizes Brasileiras de Atendimento ao Politraumatizado e Controle de Danos — SBAIT/CBC",
    url_oficial: "https://sbait.org.br/diretrizes-trauma-2025",
    
    recomendacao_pre_2025: "Infusão agressiva inicial de 2 litros de cristaloide isotônico aquecido antes da administração de hemoderivados.",
    atualizacao_2025: "Restrição rigorosa de cristaloides: infusão inicial de no máximo 1.000 mL de cristaloide balanceado. Ativação precoce de Protocolo de Transfusão Maciça com proporção balanceada 1:1:1 (1 Concentrado de Hemácias : 1 Plasma Fresco Congelado : 1 Concentrado de Plaquetas) e uso precoce de Ácido Tranexâmico 1g IV em 10 min na PRIMEIRA HORA do trauma.",
    conduta_vigente: "✅ No paciente politraumatizado chocado: 1) Hipotensão permissiva (alvo de PAS 80-90 mmHg ou PAM 50-60 mmHg até o controle cirúrgico da hemostasia, exceto no TCE grave onde a meta de PAS é ≥ 100-110 mmHg); 2) Ácido Tranexâmico 1g IV em 10 min na 1ª hora + 1g em 8h; 3) Protocolo de transfusão maciça 1:1:1 precoce; 4) Cirurgia de controle de danos se tríade da morte (acidose, hipotermia e coagulopatia).",
    
    impacto_clinico: "Evita a coagulopatia dilucional induzida por cristaloides e reduz a mortalidade por sangramento exanguinante no trauma grave.",
    impacto_revalida: "O INEP cobra a restrição de cristaloides (máximo 1L), o uso do Ácido Tranexâmico na 1ª hora (estudo CRASH-2) e a proporção balanceada de hemoderivados 1:1:1.",
    pegadinha: "Prescrever 2 a 3 litros de soro fisiológico rápido para paciente com sangramento pélvico ou abdominal ativo em vez de iniciar sangue total ou proporção balanceada 1:1:1.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  {
    id: "prot-cir-sepse-ilas-2026",
    tema: "Pacote de 1 Hora da Sepse e Choque Séptico — Diretrizes ILAS / AMIB 2026",
    area: "CIRURGIA_GERAL",
    subtema: "Terapia Intensiva & Medicina de Emergência",
    tag_ano: "ATUALIZACAO_2026",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "06/2026",
    instituicao: "Instituto Latino-Americano de Sepse (ILAS) / AMIB",
    nome_documento: "Diretrizes Brasileiras para o Manejo da Sepse e Choque Séptico — Edição 2026",
    url_oficial: "https://ilas.org.br/diretrizes-sepse-2026",
    
    recomendacao_pre_2025: "Pacotes fragmentados de 3 horas e 6 horas; espera pelo término da infusão completa de 30 mL/kg de cristaloides para iniciar vasopressor.",
    atualizacao_2025: "Foco no Pacote de 1 Hora e uso periférico precoce de noradrenalina em cateter venoso bem posicionado enquanto se providencia o acesso central.",
    atualizacao_2026: "Consolidação dos 5 passos essenciais executados na PRIMEIRA HORA de admissão com suspeita de sepse/choque: 1) Dosar lactato sérico (redosar em 2-4h se inicial > 2 mmol/L); 2) Coletar 2 pares de hemoculturas antes do antibiótico; 3) Iniciar antimicrobiano de amplo espectro na primeira hora; 4) Iniciar ressuscitação volêmica com cristaloides balanceados 30 mL/kg para hipotensão ou lactato ≥ 4 mmol/L; 5) Iniciar Noradrenalina precoce (meta de PAM ≥ 65 mmHg) se hipotensão refratária durante a reposição volêmica.",
    conduta_vigente: "✅ Na suspeita de Sepse com disfunção orgânica (SOFA ≥ 2): Executar integralmente o Pacote de 1 Hora (Lactato + Culturas + Antibiótico na 1ª hora + 30 mL/kg cristaloide + Noradrenalina se PAM < 65 mmHg).",
    
    impacto_clinico: "Cada hora de atraso no início do antibiótico adequado na sepse com choque aumenta a mortalidade em cerca de 4 a 8%.",
    impacto_revalida: "O INEP cobra a sequência cronológica imediata: coleta de culturas antes de administrar o antibiótico de amplo espectro na 1ª hora.",
    pegadinha: "Esperar a internação em UTI para colher hemoculturas ou iniciar noradrenalina somente após 4 a 6 horas de soro.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  // =========================================================================
  // 6. SAÚDE MENTAL
  // =========================================================================
  {
    id: "prot-sm-internacao-involuntaria-2025",
    tema: "Legislação e Prazos Obrigatórios da Internação Psiquiátrica Involuntária no Brasil",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    subtema: "Saúde Mental & RAPS / Bioética e Legislação Médica",
    tag_ano: "ATUALIZADO_2025_E_2026",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "02/2025",
    instituicao: "Ministério da Saúde / Conselho Federal de Medicina (CFM) / Ministério Público",
    nome_documento: "Manual de Normas e Procedimentos Ético-Legais da Internação Psiquiátrica Involuntária (Lei 10.216 / Lei 13.840)",
    url_oficial: "https://www.gov.br/saude/saude-mental-legislacao-internacao",
    
    recomendacao_pre_2025: "Dúvidas frequentes entre prazos municipais heterogêneos e leis antigas quanto ao prazo e ao órgão fiscalizador da internação involuntária.",
    atualizacao_2025: "Uniformização e rigor fiscalizatório: Toda internação involuntária (realizada sem o consentimento do paciente a pedido de terceiros/familiares) deve ser autorizada por médico registrado no CRM e NOTIFICADA OBRIGATORIAMENTE ao Ministério Público Estadual no prazo máximo e improrrogável de 72 HORAS, bem como a sua alta/desinternação.",
    conduta_vigente: "✅ 1) A internação involuntária exige laudo médico circunstanciado registrado no CRM; 2) Deve ser comunicada ao Ministério Público Estadual (MPE) em até 72 horas após o ato; 3) A alta médica também deve ser comunicada ao MPE em até 72 horas; 4) Não depende de autorização judicial prévia, mas está sujeita à fiscalização do MP.",
    
    impacto_clinico: "Garante proteção aos direitos humanos do paciente psiquiátrico, evita internações asilares abusivas e resguarda a responsabilidade técnica do médico assistente.",
    impacto_revalida: "O INEP cobra exatamente o prazo legal (72 horas) e o destinatário obrigatório da comunicação (Ministério Público Estadual, e NÃO o juiz de direito ou conselho tutelar para adultos).",
    pegadinha: "Assinalar 15 dias, 24 horas ou comunicação ao Ministério Público Federal / Juizado Cível como regra geral.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  },

  // =========================================================================
  // 7. SAÚDE COLETIVA & MEDICINA DE FAMÍLIA E COMUNIDADE (MFC)
  // =========================================================================
  {
    id: "prot-sc-notificacao-compulsoria-2026",
    tema: "Lista Nacional de Notificação Compulsória de Doenças, Agravos e Eventos de Saúde Pública 2026",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    subtema: "Vigilância Epidemiológica & Saúde Pública",
    tag_ano: "ATUALIZACAO_2026",
    nivel_prioridade: "PRIORIDADE_1_MUITO_ALTA",
    data_publicacao: "01/2026",
    instituicao: "Ministério da Saúde / Secretaria de Vigilância em Saúde e Ambiente (SVSA)",
    nome_documento: "Portaria de Consolidação da Lista Nacional de Notificação Compulsória do SUS — Atualização 2026",
    url_oficial: "https://www.gov.br/saude/lista-nacional-notificacao-compulsoria-2026",
    
    recomendacao_pre_2025: "Lista desatualizada sem inclusão de febre oropouche, síndromes neurológicas pós-arbovirose e novos fluxos de notificação imediata em 24h.",
    atualizacao_2025: "Inclusão de casos confirmados e óbitos suspeitos por Febre Oropouche e Mpox na lista nacional.",
    atualizacao_2026: "Padronização da periodicidade da notificação: 1) IMEDIATA (até 24 horas) para o Ministério da Saúde/Secretarias em agravos graves/epidemias (ex: Botulismo, Cólera, Febre Amarela, Dengue com óbito, Raiva humana, Peste, Varíola dos macacos/Mpox grave, Violência sexual e suicídio tentado); 2) SEMANAL para agravos endêmicos (ex: Tuberculose, Hanseníase, Sífilis adquirida/gestante/congênita, HIV em gestante, Hepatites virais, Acidente de trabalho sem óbito).",
    conduta_vigente: "✅ A notificação compulsória é obrigatória a todos os médicos e profissionais de saúde diante da simples SUSPEITA clínica (não necessita de confirmação laboratorial prévia). A notificação de violência sexual e tentativa de suicídio é IMEDIATA (em até 24 horas).",
    
    impacto_clinico: "Permite a deflagração rápida de bloqueios vacinais, vigilância entomológica e investigações epidemiológicas de surtos pelo SUS.",
    impacto_revalida: "O INEP cobra se a notificação deve aguardar o resultado de exames (NÃO! Notifica-se na suspeita) e a distinção entre notificação imediata (24h) versus semanal.",
    pegadinha: "Assinalar que deve aguardar o isolamento da bactéria ou confirmação sorológica antes de preencher a ficha do SINAN.",
    ultima_verificacao: "2026-08-30",
    status: "VALIDADO_OFICIAL_SUS"
  }
];
