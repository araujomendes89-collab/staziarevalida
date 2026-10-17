// Versões vigentes e textos legais vindos do BANCO (migração …13740_termo_v3): app_legal_current (versões, título, código e o resumo
// "o que mudou") e app_legal_text (texto de uma versão publicada). Os dois abrem também sem login (cadastro e páginas públicas).
//
// Reserva: banco SEM a 013740 (as funções não existem) → o site usa os textos que ele mesmo traz (Termo 2.0 e a Política de 07/10,
// versions.js e documentos.js), exatamente como antes. Assim o site novo pode ir ao ar antes do SQL, e o SQL é quem liga o 3.0.
// Qualquer outro erro (sem rede etc.) NÃO cai na reserva: a tela mostra o erro e "Tentar de novo" (nunca mostra um texto que pode
// não ser o vigente).
import React from "react";
import { getBackend } from "../../data";
import { TERMO_VERSAO } from "./versions.js";

/** A função não existe no banco (migração 013740 ainda não aplicada). */
export function semFuncaoNoBanco(err) {
  return /could not find the function|does not exist|PGRST202|schema cache/i.test(String(err?.message ?? err ?? ""));
}

/** Versões quando o banco ainda não tem a 013740: só o Termo (e a Política que vai junto), tirados do próprio site. */
export const VIGENTES_DO_SITE = Object.freeze({
  fonte: "site",
  termo_uso: { version: TERMO_VERSAO, changes: [] },
  politica_privacidade: null,
  regulamento: null,
});

let vigentesPromise = null;
const textos = new Map();

/** Esquece o que foi lido (testes e "Tentar de novo"). */
export function esquecerTextosLegais() {
  vigentesPromise = null;
  textos.clear();
}

/**
 * Versões vigentes: { fonte: "banco" | "site", termo_uso: { version, title, sha256, changes, acceptance_group, collects_ip },
 * politica_privacidade, regulamento }. Lida uma vez por abertura do site.
 */
export function carregarVigentes(backendArg) {
  vigentesPromise ??= (async () => {
    const backend = backendArg ?? (await getBackend());
    try {
      const v = await backend.rpc("app_legal_current");
      if (!v?.termo_uso?.version) return VIGENTES_DO_SITE;
      return { fonte: "banco", termo_uso: v.termo_uso, politica_privacidade: v.politica_privacidade ?? null, regulamento: v.regulamento ?? null, tutor_ia: v.tutor_ia ?? null };
    } catch (err) {
      if (semFuncaoNoBanco(err)) return VIGENTES_DO_SITE;
      throw err;
    }
  })();
  vigentesPromise.catch(() => {
    vigentesPromise = null; // erro de rede: a próxima chamada tenta de novo
  });
  return vigentesPromise;
}

/** Texto de uma versão publicada no banco: { document, version, title, body, sha256 } ou null (sem a 013740 ou versão sem texto). */
export function carregarTexto(document, version, backendArg) {
  const chave = `${document}@${version ?? "vigente"}`;
  if (!textos.has(chave)) {
    const p = (async () => {
      const backend = backendArg ?? (await getBackend());
      try {
        return (await backend.rpc("app_legal_text", version ? { p_document: document, p_version: version } : { p_document: document })) ?? null;
      } catch (err) {
        if (semFuncaoNoBanco(err)) return null;
        throw err;
      }
    })();
    p.catch(() => textos.delete(chave));
    textos.set(chave, p);
  }
  return textos.get(chave);
}

/** Hook: { status: "carregando" | "pronto" | "erro", vigentes, tentarDeNovo }. */
export function useVigentes() {
  const [estado, setEstado] = React.useState({ status: "carregando", vigentes: null });
  const [tentativa, setTentativa] = React.useState(0);
  React.useEffect(() => {
    let vivo = true;
    carregarVigentes()
      .then((vigentes) => vivo && setEstado({ status: "pronto", vigentes }))
      .catch(() => vivo && setEstado({ status: "erro", vigentes: null }));
    return () => {
      vivo = false;
    };
  }, [tentativa]);
  const tentarDeNovo = React.useCallback(() => {
    setEstado({ status: "carregando", vigentes: null });
    setTentativa((t) => t + 1);
  }, []);
  return { ...estado, tentarDeNovo };
}

/** Hook: texto de uma versão (version nula = vigente) → { status, texto, tentarDeNovo }. `ativo` falso: não busca. */
export function useTextoLegal(document, version, ativo = true) {
  const [estado, setEstado] = React.useState({ status: "carregando", texto: null });
  const [tentativa, setTentativa] = React.useState(0);
  React.useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    setEstado({ status: "carregando", texto: null });
    carregarTexto(document, version)
      .then((texto) => vivo && setEstado({ status: "pronto", texto }))
      .catch(() => vivo && setEstado({ status: "erro", texto: null }));
    return () => {
      vivo = false;
    };
  }, [document, version, ativo, tentativa]);
  const tentarDeNovo = React.useCallback(() => setTentativa((t) => t + 1), []);
  return { ...estado, tentarDeNovo };
}
