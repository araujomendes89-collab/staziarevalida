import React from 'react';
// Contêiner de rolagem própria (cada coluna da sala do avaliador). Usa a barra nativa do navegador (estilizada no CSS).
// Precisa de altura definida pelo pai (ex.: calc(100vh - cabeçalho - rodapé)) para rolar sozinho.
export function ScrollPane({children,className,label}){
  return <div className={`osce-scroll${className?` ${className}`:''}`} role="region" aria-label={label} tabIndex={0}>{children}</div>;
}
