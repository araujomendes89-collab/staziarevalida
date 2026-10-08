// Regras do WhatsApp do cadastro, da tela de aceite e da Minha conta (spec 2026-10-07-termo-aceite-cadastro-design.md, seção 5).
// País + número digitado viram o formato internacional que o banco aceita em profiles.phone: "+" e de 8 a 15 dígitos, o primeiro
// de 1 a 9. Sem dependências: vale na tela, nos testes e em qualquer ambiente.

/** @typedef {{ code: string, label: string }} Country */

/** Valor do seletor que abre o campo para a pessoa digitar o código do país. */
const OTHER = "outro";
const BRAZIL = "55";
/** O mesmo check de profiles.phone (migração 20261003005300_termo_aceite.sql). */
const E164 = /^\+[1-9][0-9]{7,14}$/;

/**
 * Países do seletor, na ordem do spec; o seletor começa no primeiro (Brasil). Em "Outro" a pessoa digita o código ao lado (ex.:
 * "+44" ou "44"), e esse texto é o `code` que as funções abaixo recebem. "outro" sozinho (ou vazio) é código ainda não informado.
 * @type {Country[]}
 */
export const COUNTRIES = [
  { code: "+55", label: "Brasil +55" },
  { code: "+54", label: "Argentina +54" },
  { code: "+591", label: "Bolívia +591" },
  { code: "+56", label: "Chile +56" },
  { code: "+57", label: "Colômbia +57" },
  { code: "+53", label: "Cuba +53" },
  { code: "+593", label: "Equador +593" },
  { code: "+34", label: "Espanha +34" },
  { code: "+1", label: "Estados Unidos +1" },
  { code: "+595", label: "Paraguai +595" },
  { code: "+51", label: "Peru +51" },
  { code: "+351", label: "Portugal +351" },
  { code: "+598", label: "Uruguai +598" },
  { code: "+58", label: "Venezuela +58" },
  { code: OTHER, label: "Outro" },
];

/** @param {unknown} text */
const onlyDigits = (text) => String(text ?? "").replace(/\D/g, "");

/**
 * Texto com letras (ex.: "ramal 12", "outro") não é número: os dígitos de uma palavra não fazem parte dele.
 * @param {unknown} text
 */
const hasLetters = (text) => /\p{L}/u.test(String(text ?? ""));

/**
 * "+" antes de qualquer dígito ou letra, mesmo depois de espaços, parênteses ou marcas invisíveis de quem copia o número
 * ("+55 41…", "(+55) 41…").
 * @param {string} text
 */
const startsWithPlus = (text) => /^[^\p{L}\p{N}+]*\+/u.test(text);

/**
 * Código do país só em dígitos ("+55" vira "55"). Vazio quando não é um código: "outro", letras, zero na frente ou mais de 3 dígitos.
 * @param {unknown} code
 */
function countryDigits(code) {
  const digits = onlyDigits(code);
  return !hasLetters(code) && /^[1-9][0-9]{0,2}$/.test(digits) ? digits : "";
}

/**
 * Número no formato internacional (ex.: "+5541999998888") ou null quando não vale.
 * Aceita espaços, parênteses e traços (a pontuação e os espaços invisíveis de um número copiado também são só separadores); letras
 * não valem. Brasil: DDD (2 dígitos) + 8 ou 9 dígitos, com o zero antes do DDD retirado (só no Brasil).
 * Outros países: de 6 a 13 dígitos depois do código, e o total (código + número) cabe no banco (de 8 a 15 dígitos).
 * "+código" digitado no número é retirado quando é o do país escolhido; de outro país, o número não vale.
 * @param {string} code código do país escolhido ("+55") ou o digitado em "Outro" ("+44", "44")
 * @param {string} number número como a pessoa digitou
 * @returns {string | null}
 */
export function normalizePhone(code, number) {
  const country = countryDigits(code);
  const typed = String(number ?? "");
  if (!country || hasLetters(typed)) return null;
  let national = onlyDigits(typed);
  if (startsWithPlus(typed)) {
    if (!national.startsWith(country)) return null;
    national = national.slice(country.length);
  }
  if (country === BRAZIL) {
    if (national.startsWith("0")) national = national.slice(1);
    if (!/^[1-9][0-9]{9,10}$/.test(national)) return null;
  } else if (national.length < 6 || national.length > 13) {
    return null;
  }
  const e164 = `+${country}${national}`;
  return E164.test(e164) ? e164 : null;
}

/**
 * Mensagem de erro do campo WhatsApp, ou null quando vale.
 * Vazio: "Informe seu WhatsApp."; Brasil inválido: "Informe o WhatsApp com DDD."; os demais (inclusive "Outro" com código
 * inválido): "Informe o WhatsApp com código do país."
 * @param {string} code
 * @param {string} number
 * @returns {string | null}
 */
export function phoneError(code, number) {
  if (!onlyDigits(number)) return "Informe seu WhatsApp.";
  if (normalizePhone(code, number)) return null;
  return countryDigits(code) === BRAZIL ? "Informe o WhatsApp com DDD." : "Informe o WhatsApp com código do país.";
}

// Segundos dígitos que fazem o código do país ter 2 dígitos, por primeiro dígito (plano E.164 da UIT). Fora disso o código tem
// 3 dígitos; +1 e +7 têm 1. Só serve para os países que não estão na lista (os da lista são achados pelo código).
/** @type {Record<string, string>} */
const TWO_DIGIT_CODES = { 2: "07", 3: "0123469", 4: "013456789", 5: "12345678", 6: "0123456", 8: "1246", 9: "0123458" };

/** @param {string} digits número internacional sem o "+" */
function callingCodeLength(digits) {
  if (digits[0] === "1" || digits[0] === "7") return 1;
  return TWO_DIGIT_CODES[digits[0]]?.includes(digits[1]) ? 2 : 3;
}

/**
 * Separa o número guardado (formato internacional) em país e número, para mostrar na tela. País da lista: o código da lista.
 * Outro país: o código certo para o campo de "Outro". Sem número guardado (ou texto que não é número): Brasil e número vazio.
 * @param {string | null} e164
 * @returns {{ code: string, number: string }}
 */
export function splitPhone(e164) {
  if (typeof e164 !== "string" || !E164.test(e164)) return { code: COUNTRIES[0].code, number: "" };
  const digits = e164.slice(1);
  // os códigos da lista não são prefixo uns dos outros: o primeiro que bate é o certo
  const listed = COUNTRIES.find((c) => c.code !== OTHER && digits.startsWith(c.code.slice(1)));
  const length = listed ? listed.code.length - 1 : callingCodeLength(digits);
  return { code: `+${digits.slice(0, length)}`, number: digits.slice(length) };
}
