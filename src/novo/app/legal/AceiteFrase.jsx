// Texto da caixa única do aceite (ACEITE_TEXTO, documentos.js) com os links nos títulos: "Termos de Uso" e "Política de Privacidade"
// abrem o documento por cima da tela (o que a pessoa digitou continua). Usado no cadastro e na tela de aceite.
import React from "react";

export function AceiteFrase({ onDoc, linkClassName }) {
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
