// Mapa das ilustrações dos 100 Grandes Temas: cada tema aponta para um MOTIVO (o órgão ou o símbolo desenhado em vidro).
// Etapa 1 (15/10/2026): 11 motivos desenhados (os 8 pedidos + intestino, recém-nascido e território, dos exemplos do dono). Os outros já têm nome e lugar no mapa; enquanto não forem desenhados, o cartão
// usa o motivo genérico da área (uma célula em vidro na cor do tema). Etapa 2 (depois da aprovação do dono): desenhar o resto.
// Nada daqui aparece como texto ao aluno: o código do tema só serve para achar o desenho.

/** Os motivos (36). `desenhado`: já existe o desenho em vidro (motivos.jsx); senão, cai no genérico da área. */
export const MOTIVOS = {
  pulmao: { nome: "Pulmões (traqueia, brônquios e lobos)", desenhado: true },
  coracao: { nome: "Coração e grandes vasos", desenhado: true },
  cerebro: { nome: "Cérebro, cerebelo e tronco", desenhado: true },
  rim: { nome: "Rim com pelve, ureter e vasos", desenhado: true },
  utero: { nome: "Útero, trompas e ovários", desenhado: true },
  feto: { nome: "Feto na bolsa, cordão e placenta", desenhado: true },
  osso: { nome: "Osso e articulação (joelho)", desenhado: true },
  microrganismo: { nome: "Vírus e bactéria", desenhado: true },
  vaso: { nome: "Artéria e veia (pressão, trombo, isquemia)", desenhado: false },
  sangue: { nome: "Hemácias e células do sangue", desenhado: false },
  pancreas: { nome: "Pâncreas e ilhotas", desenhado: false },
  figado: { nome: "Fígado, vesícula e vias biliares", desenhado: false },
  tireoide: { nome: "Tireoide", desenhado: false },
  estomago: { nome: "Esôfago e estômago", desenhado: false },
  intestino: { nome: "Intestino delgado, cólon e apêndice", desenhado: true },
  abdome: { nome: "Parede abdominal", desenhado: false },
  bexiga: { nome: "Bexiga e vias urinárias", desenhado: false },
  mama: { nome: "Mama e glândula mamária", desenhado: false },
  placenta: { nome: "Placenta e cordão", desenhado: false },
  chama: { nome: "Chama e raio (queimadura e lesão elétrica)", desenhado: false },
  bisturi: { nome: "Bisturi e sutura", desenhado: false },
  "recem-nascido": { nome: "Recém-nascido (com ambu)", desenhado: true },
  crianca: { nome: "Criança e curva de crescimento", desenhado: false },
  termometro: { nome: "Termômetro", desenhado: false },
  vacina: { nome: "Seringa e frasco de vacina", desenhado: false },
  casa: { nome: "Agente de saúde no território", desenhado: true },
  pessoas: { nome: "Pessoas e família", desenhado: false },
  idoso: { nome: "Pessoa idosa", desenhado: false },
  maos: { nome: "Mãos que cuidam", desenhado: false },
  rede: { nome: "Rede de serviços de saúde", desenhado: false },
  prancheta: { nome: "Prancheta e ficha de notificação", desenhado: false },
  grafico: { nome: "Gráfico e lupa (indicadores e testes)", desenhado: false },
  balanca: { nome: "Balança (ética)", desenhado: false },
  mente: { nome: "Cabeça e mente", desenhado: false },
  copo: { nome: "Copo e substâncias", desenhado: false },
  pilula: { nome: "Pílula e métodos contraceptivos", desenhado: false },
};

/** Tema → motivo (os 100 temas da lista oficial de 13/10/2026). */
export const MAPA_TEMAS = {
  "GR-001": "pulmao", // Tuberculose pulmonar
  "GR-002": "pancreas", // Diabetes mellitus tipo 2
  "GR-003": "vaso", // Hipertensão arterial sistêmica
  "GR-004": "pulmao", // Pneumonia adquirida na comunidade
  "GR-005": "microrganismo", // HIV
  "GR-006": "figado", // Hepatites virais
  "GR-007": "microrganismo", // Dengue e arboviroses
  "GR-008": "microrganismo", // Sífilis adquirida
  "GR-009": "bexiga", // Infecção urinária e pielonefrite
  "GR-010": "microrganismo", // Sepse e choque séptico
  "GR-011": "coracao", // Síndrome coronariana aguda
  "GR-012": "coracao", // Insuficiência cardíaca
  "GR-013": "coracao", // Fibrilação atrial e taquiarritmias
  "GR-014": "cerebro", // AVC agudo
  "GR-015": "vaso", // Tromboembolismo venoso
  "GR-016": "pulmao", // Asma no adulto
  "GR-017": "pulmao", // DPOC
  "GR-018": "rim", // Lesão renal aguda
  "GR-019": "rim", // Doença renal crônica
  "GR-020": "rim", // Sódio e potássio
  "GR-021": "estomago", // Hemorragia digestiva alta
  "GR-022": "figado", // Cirrose
  "GR-023": "sangue", // Anemias comuns
  "GR-024": "tireoide", // Tireoide
  "GR-025": "cerebro", // Crise convulsiva e epilepsia
  "GR-026": "cerebro", // Meningite bacteriana no adulto
  "GR-027": "intestino", // Apendicite aguda
  "GR-028": "figado", // Colecistite e colangite
  "GR-029": "pancreas", // Pancreatite aguda
  "GR-030": "intestino", // Obstrução intestinal
  "GR-031": "intestino", // Perfuração visceral e peritonite
  "GR-032": "osso", // Politraumatizado
  "GR-033": "pulmao", // Trauma torácico
  "GR-034": "cerebro", // Traumatismo cranioencefálico
  "GR-035": "abdome", // Trauma abdominal
  "GR-036": "chama", // Queimaduras e lesão elétrica
  "GR-037": "bisturi", // Complicações pós-operatórias
  "GR-038": "bisturi", // Feridas, suturas e tétano
  "GR-039": "abdome", // Hérnias da parede abdominal
  "GR-040": "rim", // Cólica renal
  "GR-041": "intestino", // Pólipos e câncer colorretal
  "GR-042": "vaso", // Isquemia arterial aguda
  "GR-043": "feto", // Pré-natal
  "GR-044": "feto", // Infecções na gestação e congênitas
  "GR-045": "placenta", // Síndromes hipertensivas da gestação
  "GR-046": "pancreas", // Diabetes gestacional
  "GR-047": "utero", // Sangramento no primeiro trimestre
  "GR-048": "placenta", // Sangramento na segunda metade
  "GR-049": "feto", // Trabalho de parto e partograma
  "GR-050": "feto", // Distócias e emergências intraparto
  "GR-051": "placenta", // Hemorragia pós-parto
  "GR-052": "mama", // Puerpério, endometrite e mastite
  "GR-053": "feto", // Prematuridade e rotura de membranas
  "GR-054": "feto", // Restrição de crescimento fetal
  "GR-055": "pilula", // Contracepção
  "GR-056": "utero", // Câncer do colo do útero
  "GR-057": "mama", // Câncer de mama
  "GR-058": "utero", // Vulvovaginites e cervicites
  "GR-059": "utero", // Sangramento uterino anormal
  "GR-060": "utero", // DIP e dor pélvica
  "GR-061": "recem-nascido", // Reanimação neonatal
  "GR-062": "mama", // Aleitamento materno
  "GR-063": "crianca", // Crescimento e desenvolvimento
  "GR-064": "vacina", // Calendário vacinal
  "GR-065": "recem-nascido", // Icterícia neonatal
  "GR-066": "recem-nascido", // Sepse neonatal
  "GR-067": "intestino", // Diarreia aguda e desidratação
  "GR-068": "pulmao", // Pneumonia pediátrica
  "GR-069": "pulmao", // Bronquiolite
  "GR-070": "pulmao", // Asma pediátrica
  "GR-071": "termometro", // Febre sem sinais localizatórios
  "GR-072": "cerebro", // Meningite na criança
  "GR-073": "sangue", // Desnutrição e anemia ferropriva
  "GR-074": "microrganismo", // Exantemáticas e sarampo
  "GR-075": "bexiga", // ITU em pediatria
  "GR-076": "microrganismo", // Choque e sepse na criança
  "GR-077": "cerebro", // Convulsão febril
  "GR-078": "intestino", // Invaginação intestinal
  "GR-079": "casa", // ESF e territorialização
  "GR-080": "pessoas", // Método clínico centrado na pessoa
  "GR-081": "grafico", // Rastreamento e prevenção quaternária
  "GR-082": "vaso", // Hipertensão e diabetes na APS
  "GR-083": "pessoas", // Família e visita domiciliar
  "GR-084": "pilula", // Saúde sexual e reprodutiva
  "GR-085": "idoso", // Avaliação do idoso
  "GR-086": "maos", // Cuidados paliativos
  "GR-087": "rede", // Princípios e organização do SUS
  "GR-088": "rede", // PNAB e Redes de Atenção
  "GR-089": "prancheta", // Notificação compulsória e surtos
  "GR-090": "prancheta", // SINAN, SIM e SINASC
  "GR-091": "grafico", // Incidência, prevalência e indicadores
  "GR-092": "grafico", // Sensibilidade e especificidade
  "GR-093": "grafico", // Planejamento e avaliação
  "GR-094": "balanca", // Ética médica
  "GR-095": "mente", // Depressão e suicídio
  "GR-096": "mente", // Ansiedade e pânico
  "GR-097": "mente", // Psicoses
  "GR-098": "mente", // Bipolar
  "GR-099": "cerebro", // Delirium e comprometimento cognitivo
  "GR-100": "copo", // Álcool e outras drogas
};

/** Motivo do tema; null quando o tema não está no mapa. */
export const motivoDoTema = (id) => MAPA_TEMAS[id] ?? null;

/** Motivo que de fato será desenhado: o do mapa, se já desenhado; senão o genérico da área. */
export function motivoDesenhado(id) {
  const m = motivoDoTema(id);
  return m && MOTIVOS[m]?.desenhado ? m : "generico";
}

/** Motivos ainda sem desenho (lista da etapa 2). */
export const motivosQueFaltam = () => Object.keys(MOTIVOS).filter((k) => !MOTIVOS[k].desenhado);
