// Texto da caixa única do aceite (ACEITE_TEXTO, documentos.js) com os links nos títulos: "Termos de Uso" e "Política de Privacidade"
// abrem o documento por cima da tela (o que a pessoa digitou continua). Usado no cadastro e na tela de aceite.
// `novo`: Contrato 3.0 em diante ("Li e aceito os Termos de Uso e o Contrato de Assinatura, declaro ter acesso à Política…").
import React from "react";

export function AceiteFrase({ onDoc, linkClassName, novo = false }) {
  if (novo) {
    // Contrato 3.0 em diante: ACEITE_TEXTO_V3 (documentos.js)
    return (
      <span>
        Li e aceito os{" "}
        <button type="button" className={linkClassName} onClick={() => onDoc("termos")}>Termos de Uso e o Contrato de Assinatura</button>
        , declaro ter acesso à{" "}
        <button type="button" className={linkClassName} onClick={() => onDoc("privacidade")}>Política de Privacidade</button>
        {" "}e declaro ter 18 anos ou mais.
      </span>
    );
  }
  return (
    <span>
      Li e aceito os{" "}
      <button type="button" className={linkClassName} onClick={() => onDoc("termos")}>Termos de Uso</button>
      {" "}e a{" "}
      <button type="button" className={linkClassName} onClick={() => onDoc("privacidade")}>Política de Privacidade</button>
      {" "}e declaro ter 18 anos ou mais.
    </span>
  );
}
