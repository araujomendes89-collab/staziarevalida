// Escolhas da casca nova que o dono decide vendo pronto (Novas telas, 15/10/2026). Trocar aqui muda o app todo.
// O endereço pode pedir a outra opção só para comparar (?inicio=simples, ?mais=pagina), sem guardar nada.
//   INICIO_CELULAR: "completo" = Início do celular do pacote HomeMobileCompact (feito na onda 2: anel, plano, faixa de números, "Para você");
//                   "simples"  = Início do celular do pacote MobileMenu ("Mobile · Início": Próximo passo, Score, Meta de hoje, Trilha).
//   MAIS_CELULAR:   "folha"    = botão "Mais" do celular abre a folha que sobe de baixo (pacote MobileMais);
//                   "pagina"   = abre a página "Mais" inteira (pacote HomeMais, feita na onda 2).
export const INICIO_CELULAR = "completo";
export const MAIS_CELULAR = "folha";

function pick(param, allowed, fallback) {
  try {
    const v = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get(param);
    if (allowed.includes(v)) return v;
  } catch (e) {
    /* sem endereço: usa o padrão */
  }
  return fallback;
}
export const inicioCelular = () => pick("inicio", ["completo", "simples"], INICIO_CELULAR);
export const maisCelular = () => pick("mais", ["folha", "pagina"], MAIS_CELULAR);
