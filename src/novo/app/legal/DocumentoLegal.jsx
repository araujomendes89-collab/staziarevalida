// Um documento legal na tela: Contrato/Termo ("termo_uso"), Política de Privacidade ("politica_privacidade") ou Regulamento
// ("regulamento"). `versao` vazia = a vigente. Os textos 3.0 em diante vêm do banco (cópia do sistema, app_legal_text); o Termo 1.0/2.0
// e a Política que vai com eles vêm do próprio site (reserva para banco sem a migração …13740). Usado nas páginas públicas, na
// janela por cima do cadastro e da tela de aceite e em Minha Conta → Documentos.
import React from "react";
import { LegalText } from "./LegalText.jsx";
import { Privacidade } from "./PrivacidadeSite.jsx";
import { documentosDa, temNoSite } from "./documentos.js";
import { TERMO_VERSAO } from "./versions.js";
import { useTextoLegal, useVigentes } from "./vigente.js";

export const NOME_DOCUMENTO = {
  termo_uso: "Contrato de Assinatura e Termos de Uso",
  politica_privacidade: "Política de Privacidade",
  regulamento: "Regulamento de Coins, XP, Ligas e Benefícios",
};

/** Qual texto mostrar: { de: "site", versao } (texto do próprio site), { de: "banco", versao } ou { de: "nada" } (ainda não vale). */
export function origemDoTexto(doc, versao, vigentes) {
  if (versao) {
    if (doc === "termo_uso" && temNoSite(versao)) return { de: "site", versao };
    if (doc === "politica_privacidade" && temNoSite(versao) && !vigentes?.politica_privacidade) return { de: "site", versao };
    return { de: "banco", versao };
  }
  if (!vigentes) return { de: "esperando" };
  if (vigentes.fonte === "site") {
    if (doc === "regulamento") return { de: "nada" };
    return { de: "site", versao: vigentes.termo_uso?.version ?? TERMO_VERSAO };
  }
  const v = vigentes[doc]?.version;
  if (!v) return { de: "nada" };
  if (doc === "termo_uso" && temNoSite(v) && !vigentes.termo_uso?.sha256) return { de: "site", versao: v };
  return { de: "banco", versao: v };
}

function Aviso({ children, onTentar }) {
  return (
    <div className="lgd-aviso" role="status">
      <p>{children}</p>
      {onTentar && (
        <button type="button" className="lgd-tentar" onClick={onTentar}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/**
 * @param {{ doc: "termo_uso" | "politica_privacidade" | "regulamento", versao?: string, onTexto?: (t: {versao: string, body?: string, sha256?: string}) => void }} props
 */
export function DocumentoLegal({ doc, versao, onTexto }) {
  const vig = useVigentes();
  const origem = origemDoTexto(doc, versao, vig.vigentes ?? (versao ? {} : null));
  const banco = useTextoLegal(doc, origem.versao ?? null, origem.de === "banco");

  React.useEffect(() => {
    if (!onTexto) return;
    if (origem.de === "banco" && banco.status === "pronto" && banco.texto) onTexto({ versao: banco.texto.version, body: banco.texto.body, sha256: banco.texto.sha256 });
    if (origem.de === "site" && doc === "termo_uso") onTexto({ versao: origem.versao, body: documentosDa(origem.versao).termo });
  }, [onTexto, origem.de, origem.versao, banco.status, banco.texto, doc]);

  if (!versao && vig.status === "erro") return <Aviso onTentar={vig.tentarDeNovo}>Não foi possível carregar o texto. Confira a conexão.</Aviso>;
  if (origem.de === "esperando" || (origem.de === "banco" && banco.status === "carregando")) {
    return (
      <div className="lgd-carregando" role="status" aria-live="polite">
        Carregando o texto…
      </div>
    );
  }
  if (origem.de === "nada") {
    return <Aviso>O {NOME_DOCUMENTO[doc]} passa a valer junto com a versão 3.0 do Contrato de Assinatura.</Aviso>;
  }
  if (origem.de === "site") {
    if (doc === "politica_privacidade") return <Privacidade versao={origem.versao} />;
    return (
      <>
        <p className="lgl-meta">Versão {origem.versao}</p>
        <div data-testid="legal-texto">
          <LegalText source={documentosDa(origem.versao).termo} />
        </div>
      </>
    );
  }
  if (banco.status === "erro") return <Aviso onTentar={banco.tentarDeNovo}>Não foi possível carregar o texto. Confira a conexão.</Aviso>;
  if (!banco.texto) return <Aviso>Este texto não foi encontrado.</Aviso>;
  return (
    <div data-testid="legal-texto" data-versao={banco.texto.version}>
      <LegalText source={banco.texto.body} />
    </div>
  );
}
