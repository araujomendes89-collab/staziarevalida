// Rótulos do Stazia Tutor.
// Quatro modos públicos: Questões, Meus erros, Me teste (o professor pergunta) e Perguntar ao Tutor.
// Os ids são os do banco (questao, erros, perguntas, livre); "aula" e "revisao" só aparecem em conversas antigas.
export const MODES = [
  { id: "questao", label: "Questões", icon: "file-question", hint: "Resolver questões com o professor." },
  { id: "erros", label: "Meus erros", icon: "rotate-ccw", hint: "Revisar onde você mais erra." },
  { id: "perguntas", label: "Me teste", icon: "message-circle-question", hint: "O professor pergunta e você responde." },
  { id: "livre", label: "Perguntar ao Tutor", icon: "message-square", hint: "Tire dúvidas ou peça uma explicação." },
];
const LEGACY = { aula: "Aula", revisao: "Revisão rápida" };
export const modeLabel = (id) => MODES.find((m) => m.id === id)?.label ?? LEGACY[id] ?? id;

// Grandes áreas (iguais ao banco)
export const AREA_OPTIONS = [
  { value: "", label: "Todas as áreas" },
  { value: "CLINICA_MEDICA", label: "Clínica médica" },
  { value: "CIRURGIA_GERAL", label: "Cirurgia geral" },
  { value: "GINECOLOGIA_OBSTETRICIA", label: "Ginecologia e obstetrícia" },
  { value: "PEDIATRIA", label: "Pediatria" },
  { value: "MEDICINA_FAMILIA_COMUNIDADE", label: "Medicina de família e comunidade" },
];

// De onde veio o conteúdo da resposta (calculado no servidor pelas citações conferidas, não pelo que a IA declara).
export const GROUNDING = {
  source: ["Com fonte oficial conferida", "success"],
  analysis: ["Com análise revisada por médico", "success"],
  question: ["Baseado na questão oficial", "info"],
  general: ["Raciocínio geral, sem fonte conferida", "neutral"],
  insufficient: ["Sem confirmação na base", "warning"],
};

export const LEVEL = {
  DOMINADO: ["Dominado", "success"],
  BOM: ["Bom", "success"],
  INTERMEDIARIO: ["Intermediário", "info"],
  FRACO: ["Fraco", "warning"],
  CRITICO: ["Crítico", "danger"],
  SEM_DADOS: ["Sem dados", "neutral"],
};

// Tipos de erro da avaliação silenciosa (o aluno vê o nome, não o código)
export const ERROR_CLASS = {
  knowledge_gap: "Lacuna de conhecimento", interpretation_error: "Leitura do caso", command_word_error: "Comando da questão", distractor_trap: "Alternativa-armadilha",
  outdated_guideline: "Conduta desatualizada", calculation_error: "Cálculo", priority_of_management: "Prioridade da conduta", diagnostic_reasoning: "Raciocínio diagnóstico",
  therapeutic_reasoning: "Raciocínio terapêutico", memory_failure: "Memória", attention_error: "Atenção", changed_correct_answer: "Trocou a certa", unknown: "Não classificado",
};

export const CONFIDENCE = ["Chute", "Muito baixa", "Baixa", "Média", "Alta", "Certeza"];
