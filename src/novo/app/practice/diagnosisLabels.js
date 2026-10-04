// Tipos de erro da análise Stazia (vocabulário fixo, igual ao do banco) em português para o aluno.
export const ERROR_TYPE = {
  DIAGNOSTIC_ERROR: "Erro de diagnóstico",
  WRONG_TREATMENT: "Tratamento inadequado",
  WRONG_DRUG: "Medicamento errado",
  WRONG_DOSE: "Dose errada",
  WRONG_TIMING: "Momento errado",
  WRONG_SEQUENCE: "Sequência de condutas errada",
  WRONG_TEST: "Exame inadequado",
  WRONG_POPULATION: "População errada",
  WRONG_GESTATIONAL_AGE: "Idade gestacional errada",
  WRONG_AGE_GROUP: "Faixa etária errada",
  WRONG_SEVERITY: "Gravidade mal avaliada",
  OVERTREATMENT: "Tratamento excessivo",
  UNDERTREATMENT: "Tratamento insuficiente",
  CONTRAINDICATION: "Contraindicação ignorada",
  OUTDATED_RECOMMENDATION: "Recomendação antiga",
  PARTIALLY_CORRECT: "Parcialmente correta",
  TRUE_BUT_NOT_BEST: "Verdadeira, mas não a melhor",
  CORRECT_CONCEPT_WRONG_CONTEXT: "Conceito certo no contexto errado",
  UNNECESSARY_INTERVENTION: "Intervenção desnecessária",
  DELAYED_INTERVENTION: "Intervenção atrasada",
};
export const KIND_LABEL = { CORRECT: "Correta", WRONG: "Errada", TRUE_BUT_NOT_BEST: "Verdadeira, mas não é a melhor" };
