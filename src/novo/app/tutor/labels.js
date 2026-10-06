// Rótulos do Stazia Tutor.
export const MODES = [
  { id: "questao", label: "Questões", icon: "file-question", hint: "Questões reais do banco, com dicas e correção" },
  { id: "erros", label: "Revisão de erros", icon: "rotate-ccw", hint: "O que você errou e o que está na hora de rever" },
  { id: "perguntas", label: "Perguntas", icon: "message-circle-question", hint: "O professor conduz por perguntas", topic: true },
  { id: "aula", label: "Aula", icon: "book-open", hint: "Explicação de um tema", topic: true },
  { id: "revisao", label: "Revisão rápida", icon: "zap", hint: "Alta densidade, em poucas linhas", topic: true },
  { id: "livre", label: "Conversa livre", icon: "message-square", hint: "Pergunte o que quiser" },
];
export const modeLabel = (id) => MODES.find((m) => m.id === id)?.label ?? id;

export const INTENSITY = ["leve", "moderada", "forte", "muito forte", "extrema"];
export const EXPLANATION = [
  { value: "short", label: "Curta" },
  { value: "normal", label: "Normal" },
  { value: "detailed", label: "Detalhada" },
  { value: "nerd", label: "Professor Nerd" },
];
export const STRICTNESS = [
  { value: "low", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
  { value: "insane", label: "Insana" },
];
export const HUMOR = [
  { value: "", label: "O do professor" },
  { value: "15", label: "Pouco" },
  { value: "50", label: "Médio" },
  { value: "85", label: "Muito" },
];
export const PROFANITY = [
  { value: "off", label: "Sem palavrão" },
  { value: "mild", label: "Leves (putz, que saco)" },
  { value: "moderate", label: "Liberados (inclusive com você)" },
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

export const ERROR_CLASS = {
  CONCEITUAL: "Conceito", INTERPRETACAO: "Interpretação", DIAGNOSTICO: "Diagnóstico", CONDUTA: "Conduta", PRIORIDADE: "Prioridade", FARMACOLOGIA: "Farmacologia",
  DIRETRIZ: "Diretriz", CALCULO: "Cálculo", DISTRACAO: "Distração", PROVA: "Leitura de prova", EXCESSO_INVESTIGACAO: "Excesso de investigação", OMISSAO: "Omissão",
};

export const CONFIDENCE = ["Chute", "Muito baixa", "Baixa", "Média", "Alta", "Certeza"];
