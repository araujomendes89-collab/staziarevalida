// Janela por cima do cadastro, da tela de aceite e das telas de acesso com o Contrato/Termo, a Política ou o Regulamento; o formulário
// por baixo continua como estava. O texto é o vigente (do banco desde a migração …13740; num banco sem ela, o do próprio site).
import React from "react";
import { createPortal } from "react-dom";
import "../auth/login.css";
import "./legal.css";
import { DocumentoLegal } from "./DocumentoLegal.jsx";
import { temNoSite } from "./documentos.js";

const TITULO = { termos: "Termos de Uso e Contrato", privacidade: "Política de Privacidade", regulamento: "Regulamento de Coins, XP, Ligas e Benefícios" };
const DOC = { termos: "termo_uso", privacidade: "politica_privacidade", regulamento: "regulamento" };

/**
 * @param {{ doc: "termos" | "privacidade" | "regulamento", onClose: () => void, versao?: string }} props
 *   versao: a do Contrato/Termo que a tela está mostrando (padrão: a vigente). Com o Termo 1.0/2.0, a Política é a que vai com ele.
 */
export function DocumentModal({ doc, onClose, versao }) {
  const closeRef = React.useRef(null);
  React.useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const chave = DOC[doc] ?? "termo_uso";
  // a versão só vale para o Contrato/Termo e para a Política antiga que vai junto com ele; o resto é sempre o vigente
  const versaoDoc = chave === "termo_uso" ? versao : chave === "politica_privacidade" && versao && temNoSite(versao) ? versao : undefined;
  // Fora do cartão do cadastro: o backdrop-filter dele faria o "fixed" valer só dentro do cartão. lg-root traz as cores e fontes.
  return createPortal(
    <div className="lg-root lgm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lgm-box" role="dialog" aria-modal="true" aria-label={TITULO[doc] ?? TITULO.termos}>
        <div className="lgm-bar">
          <strong>{TITULO[doc] ?? TITULO.termos}</strong>
          <button ref={closeRef} type="button" className="lg-btn lg-btn-ghost lg-btn-small" onClick={onClose}>Fechar</button>
        </div>
        <div className="lgm-body lgl-paper">
          <DocumentoLegal doc={chave} versao={versaoDoc} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
