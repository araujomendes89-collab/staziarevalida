// Janela por cima do cadastro com o Termo ou a Política; o formulário por baixo continua como estava.
import React from "react";
import "./legal.css";
import { LegalText } from "./LegalText.jsx";
import { Privacidade } from "./LegalPage.jsx";
import { TERMO_VERSAO } from "./versions.js";
import termoFonte from "./termo-uso-v1.0.md?raw";

const TITULO = { termos: "Termos de Aceite e Uso", privacidade: "Política de Privacidade" };

/** @param {{ doc: "termos" | "privacidade", onClose: () => void }} props */
export function DocumentModal({ doc, onClose }) {
  const closeRef = React.useRef(null);
  React.useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="lgm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lgm-box" role="dialog" aria-modal="true" aria-label={TITULO[doc]}>
        <div className="lgm-bar">
          <strong>{TITULO[doc]}</strong>
          <button ref={closeRef} type="button" className="lg-btn lg-btn-ghost lg-btn-small" onClick={onClose}>Fechar</button>
        </div>
        <div className="lgm-body lgl-paper">
          {doc === "termos" ? (
            <>
              <p className="lgl-meta">Versão {TERMO_VERSAO}</p>
              <div data-testid="legal-texto"><LegalText source={termoFonte} /></div>
            </>
          ) : (
            <Privacidade />
          )}
        </div>
      </div>
    </div>
  );
}
