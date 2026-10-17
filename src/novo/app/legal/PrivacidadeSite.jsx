// Política de Privacidade dos Termos 1.0 e 2.0, guardada no próprio site em forma de blocos (privacidade.js e privacidade-v2.js).
// Da versão 3.0 em diante a Política vem do banco (DocumentoLegal.jsx).
import React from "react";
import { Inline } from "./LegalText.jsx";
import { TERMO_VERSAO } from "./versions.js";
import { documentosDa } from "./documentos.js";

function Secao({ bloco }) {
  return (
    <section id={bloco.id}>
      <h2>{bloco.num}. {bloco.titulo}</h2>
      {bloco.itens.map((item, i) => {
        if (item.tipo === "ul") return <ul key={i}>{item.itens.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ul>;
        if (item.tipo === "sub") return <h3 key={i}>{item.texto}</h3>;
        if (item.tipo === "caixa") {
          return (
            <p key={i} className="lgl-caixa">
              {item.linhas[0]} <br />
              <strong>{item.linhas[1]}</strong>
            </p>
          );
        }
        return <p key={i} className={item.forte ? "lgl-forte" : undefined}><Inline text={item.texto} /></p>;
      })}
    </section>
  );
}

/** versao: a do Termo que a Política acompanha (padrão: a de versions.js). */
export function Privacidade({ versao = TERMO_VERSAO } = {}) {
  const PRIVACIDADE = documentosDa(versao).privacidade;
  return (
    <>
      <header className="lgl-head">
        <h1>POLÍTICA DE PRIVACIDADE</h1>
        <p className="lgl-sub">STAZIAMED REVALIDA</p>
        <p className="lgl-meta">Última atualização: {PRIVACIDADE.atualizada}</p>
      </header>
      <div data-testid="legal-texto" className="lgl-text">
        {PRIVACIDADE.blocos.map((b) =>
          b.tipo === "controlador" ? (
            <div key="controlador" className="lgl-controlador">
              <h2>{b.titulo}</h2>
              {b.linhas.map((l) => <p key={l}><Inline text={l} /></p>)}
            </div>
          ) : (
            <Secao key={b.id} bloco={b} />
          ),
        )}
      </div>
      <footer className="lgl-foot">
        <p>{PRIVACIDADE.rodape}</p>
      </footer>
    </>
  );
}
