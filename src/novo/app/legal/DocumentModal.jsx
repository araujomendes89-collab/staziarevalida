// Janela por cima do cadastro com o Termo ou a Política; o formulário por baixo continua como estava.
import React from "react";
import { createPortal } from "react-dom";
import "../auth/login.css";
import "./legal.css";
import { LegalText } from "./LegalText.jsx";
import { Privacidade } from "./LegalPage.jsx";
import { TERMO_VERSAO } from "./versions.js";
import { documentosDa } from "./documentos.js";

const TITULO = { termos: "Termos de Aceite e Uso", privacidade: "Política de Privacidade" };

/** @param {{ doc: "termos" | "privacidade", onClose: () => void, versao?: string }} props versao: a do Termo mostrado (padrão: versions.js) */
export function DocumentModal({ doc, onClose, versao = TERMO_VERSAO }) {
  const closeRef = React.useRef(null);
  React.useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Fora do cartão do cadastro: o backdrop-filter dele faria o "fixed" valer só dentro do cartão. lg-root traz as cores e fontes.
  return createPortal(
    <div className="lg-root lgm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lgm-box" role="dialog" aria-modal="true" aria-label={TITULO[doc]}>
        <div className="lgm-bar">
          <strong>{TITULO[doc]}</strong>
          <button ref={closeRef} type="button" className="lg-btn lg-btn-ghost lg-btn-small" onClick={onClose}>Fechar</button>
        </div>
        <div className="lgm-body lgl-paper">
          {doc === "termos" ? (
            <>
              <p className="lgl-meta">Versão {versao}</p>
              <div data-testid="legal-texto"><LegalText source={documentosDa(versao).termo} /></div>
            </>
          ) : (
            <Privacidade versao={versao} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
