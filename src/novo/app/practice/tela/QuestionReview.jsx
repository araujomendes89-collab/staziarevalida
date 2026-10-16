// Questão já respondida, na lista de revisão (resultado do treino/simulado e caderno de erros): o mesmo cartão do modelo,
// com a correção embaixo e o painel de contexto empilhado. Quem chama passa a questão com o que o banco devolveu.
import React from "react";
import { CorrectionBody, CorrectionSide, answerState, useCorrectionData } from "../Correction.jsx";
import { Alternatives, QuestionSheet } from "./QuestionSheet.jsx";
import "./tela-questao.css";

export function QuestionReview({ question, selected, correction, go = null, tutorContext = "question", showDifficulty = false, children = null }) {
  const data = useCorrectionData(question, correction);
  return (
    <div className="tq tq-review">
      <QuestionSheet
        compact
        revealed
        question={question}
        topic={correction.topic}
        alternatives={
          <Alternatives options={question.options} formatacao={question.formatacao ?? correction?.formatacao} chosen={selected} revealed stateOf={(id) => answerState(id, selected, correction)} />
        }
        answer={<CorrectionBody selected={selected} correction={correction} question={question} data={data} />}
      />
      <div className="tq-side">
        <CorrectionSide selected={selected} correction={correction} question={question} data={data} tutorContext={tutorContext} go={go} showDifficulty={showDifficulty} />
      </div>
      {children}
    </div>
  );
}
