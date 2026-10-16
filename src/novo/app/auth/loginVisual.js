// Qual aparência a tela de login usa (Novas telas, 15/10/2026). A lógica é a mesma nas duas (useLoginForm.js).
//   "novo"  = login do pacote "Novas telas" (LoginWeb, LoginTablet, LoginMobile): fundo azul-marinho, cartão branco.
//   "atual" = "Acesso seguro REVALIDA" (fundo escuro verde-água/roxo), o que estava no ar até aqui. Guardado para voltar.
// Para voltar ao login de antes, troque a linha abaixo para "atual".
export const LOGIN_VISUAL = "novo";

/** Aparência escolhida; o endereço pode pedir a outra só para comparar (?login=atual ou ?login=novo), sem guardar nada. */
export function loginVisual(search = typeof window !== "undefined" ? window.location.search : "") {
  try {
    const q = new URLSearchParams(search).get("login");
    if (q === "novo" || q === "atual") return q;
  } catch (e) {
    /* endereço sem parâmetros: usa o padrão */
  }
  return LOGIN_VISUAL === "atual" ? "atual" : "novo";
}
