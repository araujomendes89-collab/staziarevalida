// Atualidade da fonte achada pela busca (Fontes oficiais com IA): os textos em português dos estados que o SERVIDOR decide
// (server/contentHub/sources/currency.ts). A tela nunca decide "mais atual" sozinha: só mostra o estado que o servidor gravou.

/** estado → [texto, tom do selo]. Estado ausente (candidato antigo, de antes desta função): "Atualidade não avaliada". */
export const CURRENCY = {
  versao_mais_nova: ["Versão mais nova que a da biblioteca", "success"],
  mesma_versao: ["Mesma versão da biblioteca", "neutral"],
  versao_mais_antiga: ["Mais antiga que a da biblioteca", "danger"],
  outra_mais_nova: ["A IA achou outra mais nova para o mesmo tema", "warning"],
  data_nao_comprovada: ["Data não comprovada", "warning"],
  sem_comparacao: ["Documento novo na biblioteca", "info"],
};
export const CURRENCY_UNKNOWN = ["Atualidade não avaliada", "neutral"];

/** Estados em que aprovar traz uma versão mais antiga do que existe: a aprovação pede confirmação própria. */
export const OLDER_STATES = new Set(["versao_mais_antiga", "outra_mais_nova"]);
export const isOlder = (candidate) => OLDER_STATES.has(candidate?.currency);

export const currencyBadge = (state) => CURRENCY[state] ?? CURRENCY_UNKNOWN;

/** De onde veio a data comprovada. */
export const BASIS = { texto: "comprovada no texto do documento", pagina: "declarada pela própria página" };

/** O que o administrador lê antes de aprovar uma versão mais antiga (o servidor repete a regra e recusa sem a confirmação). */
export function olderWarning(candidate) {
  const library = candidate?.currency_info?.library ?? candidate?.replaces ?? null;
  if (candidate?.currency === "outra_mais_nova") {
    const newer = candidate?.currency_info?.newer?.date;
    return `A busca achou outra versão mais nova deste mesmo documento${newer ? ` (${newer.split("-").reverse().join("/")})` : ""}. Aprovar esta versão mais antiga não traz a mais nova. Aprovar mesmo assim?`;
  }
  return `Esta fonte é mais antiga que a fonte vigente${library?.title ? ` "${library.title}"` : ""}. Aprovar vai SUBSTITUIR a mais nova pela mais antiga. Aprovar mesmo assim?`;
}
