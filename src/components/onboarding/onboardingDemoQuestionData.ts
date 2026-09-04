/**
 * Static Local Fixture for Onboarding Demo Question Experience
 * Stricly isolated from real question database and persistent schemas.
 */

export interface DemoQuestionOption {
  id: "A" | "B" | "C" | "D";
  text: string;
}

export interface DemoQuestionFixture {
  id: string;
  badgeLabel: string;
  disclaimer: string;
  clinicalCase: string;
  question: string;
  options: DemoQuestionOption[];
  correctOptionId: "A" | "B" | "C" | "D";
  explanation: string;
  keyPointTitle: string;
  keyPointText: string;
  productValueNote: string;
}

export const ONBOARDING_DEMO_QUESTION: DemoQuestionFixture = {
  id: "demo_question_onboarding_01",
  badgeLabel: "Questão demonstrativa",
  disclaimer: "Sua resposta aqui não conta para o seu desempenho.",
  clinicalCase:
    "Um homem de 24 anos procura atendimento com dor abdominal iniciada há cerca de 12 horas. A dor começou em região periumbilical e posteriormente migrou para a fossa ilíaca direita. Apresenta náuseas, inapetência e dor à palpação da região, com maior intensidade no ponto de McBurney.",
  question: "Qual é o diagnóstico mais provável?",
  options: [
    { id: "A", text: "Gastroenterite aguda" },
    { id: "B", text: "Apendicite aguda" },
    { id: "C", text: "Colecistite aguda" },
    { id: "D", text: "Pancreatite aguda" },
  ],
  correctOptionId: "B",
  explanation:
    "A migração da dor da região periumbilical para a fossa ilíaca direita, associada a náuseas, inapetência e dor no ponto de McBurney, é uma apresentação clássica de apendicite aguda.",
  keyPointTitle: "Ponto-chave",
  keyPointText:
    "Dor que migra para a fossa ilíaca direita é um achado clássico na apresentação da apendicite aguda.",
  productValueNote:
    "Na StaziaMed, cada questão ajuda você a entender o raciocínio e identificar o conteúdo que precisa revisar.",
};
