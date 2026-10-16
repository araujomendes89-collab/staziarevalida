// Bateria FIXA de 10 falas de aluno (pt-BR) para medir a voz ao vivo. Mesmo texto em todas as rodadas e em todos os caminhos.
// A fala 7 tem uma pausa de hesitação de propósito ("deixa eu pensar..."): mede se o detector corta o aluno no meio.
export const FALAS = [
  { id: "01", voz: "Puck", texto: "Professora, na anafilaxia eu daria corticoide primeiro. Tá certo?" },
  { id: "02", voz: "Aoede", texto: "Eu marcaria a letra B, adrenalina intramuscular na coxa." },
  { id: "03", voz: "Fenrir", texto: "Qual é a dose de adrenalina no adulto?" },
  { id: "04", voz: "Kore", texto: "Por que não pode ser a adrenalina subcutânea no braço?" },
  { id: "05", voz: "Charon", texto: "E se a paciente estiver usando betabloqueador, muda alguma coisa?" },
  { id: "06", voz: "Leda", texto: "Prometazina não resolve? Eu sempre vi darem antialérgico no pronto-socorro." },
  { id: "07", voz: "Puck", texto: "Calma, deixa eu pensar... acho que é a letra A, hidrocortisona." },
  { id: "08", voz: "Aoede", texto: "Quanto tempo eu espero para repetir a dose se ela não melhorar?" },
  { id: "09", voz: "Fenrir", texto: "Tá, e depois que estabilizar, ela precisa ficar em observação por quanto tempo?" },
  { id: "10", voz: "Kore", texto: "Me explica a diferença entre anafilaxia e angioedema hereditário." },
];
export const INTERRUPCAO = { id: "int", voz: "Puck", texto: "Espera, espera! E a dose?" };
// Sem instrução de estilo: com instrução antes do texto o Gemini TTS chegou a falar 10 a 14 s para frases de 4 s (lia a instrução).
export const ESTILO_ALUNO = "";
export const PASTA = "/Volumes/StaziaMed/.tmp-aulas/voice-tutor/linha-de-base";
