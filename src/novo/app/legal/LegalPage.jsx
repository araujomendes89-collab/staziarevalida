// Páginas públicas /termos e /privacidade (abrem com ou sem login, também carregando ou com erro).
import React, { useEffect } from "react";
import "../auth/login.css";
import "./legal.css";
import { LegalText, Inline } from "./LegalText.jsx";
import { PRIVACIDADE } from "./privacidade.js";
import { TERMO_VERSAO } from "./versions.js";
import termoFonte from "./termo-uso-v1.0.md?raw";

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

function Privacidade() {
  return (
    <>
      <header className="lgl-head">
        <h1>POLÍTICA DE PRIVACIDADE</h1>
        <p className="lgl-sub">STAZIAMED REVALIDA</p>
        <p className="lgl-meta">Última atualização: {PRIVACIDADE.atualizada}</p>
        <p className="lgl-meta">Vigente a partir de {PRIVACIDADE.vigente}</p>
      </header>
      <div data-testid="legal-texto" className="lgl-text">
        {PRIVACIDADE.blocos.map((b) =>
          b.tipo === "controlador" ? (
            <div key="controlador" className="lgl-controlador">
              <h2>{b.titulo}</h2>
              {b.linhas.map((l) => <p key={l}><Inline text={l} /></p>)}
              <p><Inline text={b.texto} /></p>
            </div>
          ) : (
            <Secao key={b.id} bloco={b} />
          ),
        )}
      </div>
      <footer className="lgl-foot">
        {PRIVACIDADE.assinatura.map((l) => <p key={l}>{l}</p>)}
        <p>{PRIVACIDADE.rodape}</p>
      </footer>
    </>
  );
}

export function LegalPage({ doc }) {
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [doc]);
  return (
    <div className="lg-root lgl-root">
      <div className="lgl-shell">
        <div className="lgl-top">
          <img className="lgl-logo" src="/novo-assets/logo-staziamed-revalida-v2-escuro.png" alt="StaziaMed Revalida" width="200" height="61" />
          <a className="lgl-back" href="/novo">Voltar para o app</a>
        </div>
        <main className="lgl-paper">
          {doc === "termos" ? (
            <>
              <p className="lgl-meta">Versão {TERMO_VERSAO}</p>
              <div data-testid="legal-texto"><LegalText source={termoFonte} /></div>
            </>
          ) : (
            <Privacidade />
          )}
        </main>
      </div>
    </div>
  );
}
