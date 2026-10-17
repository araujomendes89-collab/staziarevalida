// Páginas públicas /novo/termos, /novo/privacidade e /novo/regulamento (abrem com ou sem login, também carregando ou com erro).
// Mostram a versão VIGENTE de cada texto: do banco (cópia do sistema, desde a migração …13740) ou, num banco sem ela, a do próprio site.
import React, { useEffect } from "react";
import "../auth/login.css";
import "./legal.css";
import { DocumentoLegal } from "./DocumentoLegal.jsx";

export { Privacidade } from "./PrivacidadeSite.jsx";

/** Endereço público e chave de cada documento. */
export const PAGINAS_LEGAIS = [
  { pagina: "termos", doc: "termo_uso", href: "/novo/termos", nome: "Termos de Uso e Contrato" },
  { pagina: "privacidade", doc: "politica_privacidade", href: "/novo/privacidade", nome: "Política de Privacidade" },
  { pagina: "regulamento", doc: "regulamento", href: "/novo/regulamento", nome: "Regulamento de Coins e Ligas" },
];

export function LegalPage({ doc }) {
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [doc]);
  const atual = PAGINAS_LEGAIS.find((p) => p.pagina === doc) ?? PAGINAS_LEGAIS[0];
  return (
    <div className="lg-root lgl-root">
      <div className="lgl-shell">
        <div className="lgl-top">
          <img className="lgl-logo" src="/brand/horizontal-escuro-480w.png" alt="StaziaMed Revalida" width="200" height="62" />
          <a className="lgl-back" href="/novo">Voltar para o app</a>
        </div>
        <nav className="lgl-nav" aria-label="Documentos legais">
          {PAGINAS_LEGAIS.map((p) => (
            <a key={p.pagina} href={p.href} aria-current={p.pagina === atual.pagina ? "page" : undefined}>
              {p.nome}
            </a>
          ))}
        </nav>
        <main className="lgl-paper">
          <DocumentoLegal doc={atual.doc} />
        </main>
      </div>
    </div>
  );
}
