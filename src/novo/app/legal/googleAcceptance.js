// Aceite do Termo dado na tela de cadastro antes de seguir para o Google. O Google sai da página e volta logada; ao voltar, o app lê
// este registro (takeGoogleAcceptance) para gravar o aceite com origem "google". Vale 30 minutos e é lido uma única vez.
const KEY = "smn-aceite-google";
const MAX_AGE_MS = 30 * 60 * 1000;

/**
 * @param {string} version
 * @param {{ adult?: boolean, physician?: boolean }} [declarations] marcadas no cadastro (Termo 2.0 em diante)
 */
export function rememberGoogleAcceptance(version, declarations) {
  try {
    const extra = declarations ? { adult: declarations.adult === true, physician: declarations.physician === true } : {};
    localStorage.setItem(KEY, JSON.stringify({ version, at: Date.now(), ...extra }));
  } catch {
    /* navegação privada pode recusar; sem registro o aceite é pedido na tela de aceite */
  }
}

/**
 * true só se existir, tiver menos de 30 minutos e for da versão `current`. Sempre apaga o registro.
 * @param {string} current
 * @returns {boolean}
 */
export function takeGoogleAcceptance(current) {
  return takeGoogleAcceptanceFull(current) !== null;
}

/**
 * Como takeGoogleAcceptance, devolvendo também as declarações marcadas no cadastro: null quando não vale.
 * @param {string} current
 * @returns {{ adult: boolean, physician: boolean } | null}
 */
export function takeGoogleAcceptanceFull(current) {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const { version, at, adult, physician } = JSON.parse(raw);
    const age = Date.now() - Number(at);
    if (version !== current || !Number.isFinite(age) || age < 0 || age >= MAX_AGE_MS) return null;
    return { adult: adult === true, physician: physician === true };
  } catch {
    return null;
  }
}
