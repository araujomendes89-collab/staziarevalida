/**
 * PRONÚNCIA DOS NOMES NA VOZ (decisão do dono, 18/10/2026): "Stazia" se fala "Estázia" (Stazia, StaziaMed, Stazia Arena, Stazia
 * Coins), "Stazi" se fala "Estázi" e "ENAMED" se fala "Enamédi".
 *
 * Vale SÓ para o texto que vai para o serviço de voz (Gemini TTS: leitura das respostas, audições do painel, frases de espera
 * gravadas). O texto da tela, da legenda e do chat continua escrito como sempre. A voz ao vivo fala sozinha pelo modelo: lá a mesma
 * regra vai como instrução curta (TUTOR_REALTIME_LANGUAGE em prompts.ts).
 *
 * Regras: palavra inteira, sem diferenciar maiúsculas; e-mail, link e endereço de site ficam como estão (stazia.com.br,
 * suporte@stazia.com.br, https://…); nome dentro de outra palavra não muda (Anastazia, Stazias), exceto o composto StaziaMed ("Estázia Médi").
 */

/** Muda quando a tabela mudar: entra na versão da voz (nova audição e nova aprovação). */
export const PRONUNCIA_VERSAO = "nomes-2026-10-18";

/** Palavra (minúsculas) → como o serviço de voz deve ler. A ordem não importa: cada palavra é comparada inteira. */
export const PRONUNCIAS: Readonly<Record<string, string>> = {
  staziamed: "Estázia Médi",
  stazia: "Estázia",
  stazi: "Estázi",
  enamed: "Enamédi",
};

/** Pedaço sem espaço que é e-mail, link ou endereço de site: não mexe. */
const ENDERECO = /@|:\/\/|^www\.|[\p{L}\d-]\.(com|br|net|org|app|io|dev|med|edu|gov)(\b|$)/iu;
/** Letras (com acento), números e o que cola dentro de uma palavra. */
const PALAVRA = /[\p{L}\p{N}_]+/gu;

/** O texto como o serviço de voz deve ler: os nomes trocados pela pronúncia aprovada; o resto, igual. */
export function textoParaVoz(texto: string): string {
  return texto.replace(/\S+/g, (pedaco) => {
    if (ENDERECO.test(pedaco)) return pedaco;
    return pedaco.replace(PALAVRA, (palavra) => PRONUNCIAS[palavra.toLowerCase()] ?? palavra);
  });
}
