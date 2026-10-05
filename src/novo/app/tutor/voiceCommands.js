// Comandos de voz do Stazia Tutor: o que o aluno pode FAZER falando, sem digitar nem clicar.
// Tudo aqui é regra no navegador (sem IA e sem custo): marcar alternativa, confirmar, pedir ajuda, próxima, repetir, parar.
// O que não é comando segue para o professor como fala normal.

const fold = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,!?;:…"“”'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Como o reconhecimento de fala escreve o nome das letras: "bê", "cê", "dê", e às vezes "se", "de".
const LETTER = { a: "A", b: "B", be: "B", c: "C", ce: "C", se: "C", d: "D", de: "D" };
// A letra só vale depois de uma palavra que mostre que o aluno está respondendo: "se", "de" e "a" sozinhos são palavras comuns.
const ANSWER =
  /(?:^|\s)(?:alternativa|letra|opcao|resposta|marco|marca|marcar|marcaria|respondo|vou de|vou na|fico com|escolho|e a letra|e a alternativa)\s+(?:e\s+)?(?:a\s+|o\s+)?(?:letra\s+|alternativa\s+)?(a|be|b|ce|se|c|de|d)(?=\s|$)/;
const CONFIRM = /^(?:confirmo|confirma|confirmar|confirmado|pode responder|responder|responde|isso mesmo|pode marcar|e essa|essa mesmo|sim confirmo|sim)$/;
const CANCEL = /^(?:nao|cancela|cancelar|desmarca|desmarcar|espera nao|nao e essa|trocar|quero trocar)$/;
const NEXT = /^(?:proxima|proxima questao|outra|outra questao|manda a proxima|manda outra|seguinte|pode mandar a proxima|vamos pra proxima|bora pra proxima)$/;
const REPEAT = /^(?:repete|repete a questao|repete o enunciado|le de novo|le a questao|le a questao de novo|le o enunciado|de novo|pode repetir|repetir)$/;
const PAUSE = /^(?:espera|espera ai|pera|pera ai|para|para ai|um momento|calma|so um minuto|silencio)$/;
const HINT = /(?:^|\s)(?:dica|ajuda|ajudinha|me ajuda|uma luz|empurrao)(?=\s|$)/;

/**
 * Lê o que o aluno falou.
 *   ctx.questionOpen   há questão aberta (dá para marcar e pedir ajuda)
 *   ctx.picked         alternativa já marcada por voz, esperando o "confirmo"
 *   ctx.canNext        dá para pedir a próxima questão
 */
export function parseVoiceCommand(text, ctx = {}) {
  const f = fold(text);
  if (!f) return { type: "none" };
  if (PAUSE.test(f)) return { type: "pause" };
  if (ctx.questionOpen) {
    const m = f.match(ANSWER);
    // frase curta: "acho que é a letra cê". Frase longa com a letra no meio é conversa ("por que a alternativa B não serve?")
    if (m && f.split(" ").length <= 8 && !/\b(por que|porque|qual|como|explica|nao serve|nao e|errad|cert[ao] ou)\b/.test(f)) return { type: "answer", option: LETTER[m[1]] };
    if (ctx.picked && CONFIRM.test(f)) return { type: "confirm" };
    if (ctx.picked && CANCEL.test(f)) return { type: "cancel" };
    if (REPEAT.test(f)) return { type: "repeat" };
    if (HINT.test(f) && f.split(" ").length <= 6) return { type: "hint" };
  }
  if (ctx.canNext && NEXT.test(f)) return { type: "next" };
  return { type: "message", text: String(text).trim() };
}

/** O enunciado e as alternativas como texto para ouvir. */
export function questionSpeech(question, parts) {
  const options = question.options.map((o) => `Alternativa ${o.id}: ${o.text}`).join(" ");
  return [parts.stem, parts.ask, options].filter(Boolean).join(" ");
}

/** Por que o microfone não funcionou, em palavras do aluno. */
export function micErrorMessage(code) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "O navegador bloqueou o microfone. Clique no cadeado ao lado do endereço da página, permita o microfone e tente de novo.";
    case "audio-capture":
      return "Não encontrei um microfone neste aparelho.";
    case "network":
      return "O reconhecimento de fala precisa de internet e não respondeu. Tente de novo.";
    case "unsupported":
      return "Este navegador não reconhece fala. Use o Chrome, o Edge ou o Safari para conversar por voz.";
    default:
      return code ? "Não consegui ouvir agora. Tente de novo." : null;
  }
}
