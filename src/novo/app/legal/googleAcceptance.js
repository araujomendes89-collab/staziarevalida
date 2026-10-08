// Aceite do Termo dado na tela de cadastro antes de seguir para o Google. O Google sai da página e volta logada; ao voltar, o app lê
// este registro (takeGoogleAcceptance) para gravar o aceite com origem "google". Vale 30 minutos e é lido uma única vez.
const KEY = "smn-aceite-google";
const MAX_AGE_MS = 30 * 60 * 1000;

/** @param {string} version */
export function rememberGoogleAcceptance(version) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version, at: Date.now() }));
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
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const { version, at } = JSON.parse(raw);
    const age = Date.now() - Number(at);
    return version === current && Number.isFinite(age) && age >= 0 && age < MAX_AGE_MS;
  } catch {
    return false;
  }
}
