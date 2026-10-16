// O que as celebrações guardam NESTE aparelho (localStorage, sempre com try/catch: modo privado ou bloqueio de dados do site
// só fazem o app esquecer, nunca quebrar). Nada disso vai para o banco nem decide XP, nível ou posição.
//   - preferências do aluno: sons, voz da Durona, animações reduzidas;
//   - chaves já comemoradas (por conta): a mesma medalha/nível/semana da liga não volta como se fosse nova;
//   - histórico das comemorações importantes (por conta): fica acessível em Conta → Comemorações e sons.

/** Mudo das comemorações. É o MESMO mudo do botão de som dentro da comemoração (motor de som do Motion Studio). */
export const CHAVE_MUDO = "stazia-celebracoes-mudo";
const CHAVE_PREFS = "stazia-celebracoes-preferencias-v1";
const prefixoVistos = (uid) => `stazia-celebrados-v1:${uid || "anon"}`;
const prefixoHistorico = (uid) => `stazia-celebracoes-historico-v1:${uid || "anon"}`;
/** Estado do controle de cansaço (limites do dia, frases e figurinos recentes) do hook useCelebracoes, por conta. */
export const chaveEstado = (uid) => `stazia-celebracoes-v1:${uid || "anon"}`;
const chaveLiga = (uid) => `stazia-celebracoes-liga-v1:${uid || "anon"}`;

export const MAX_VISTOS = 400;
export const MAX_HISTORICO = 30;
export const PREFS_PADRAO = Object.freeze({ sons: true, voz: true, reduzidas: false });

function ler(chave) {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravar(chave, valor) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: vale só enquanto a página está aberta */
  }
}
function lerJson(chave, padrao) {
  try {
    const bruto = ler(chave);
    return bruto ? JSON.parse(bruto) : padrao;
  } catch {
    return padrao;
  }
}

/** Sons: ligados por padrão; o mudo é o do motor de som (o mesmo do botão dentro da comemoração). */
export function lerPreferencias() {
  const p = lerJson(CHAVE_PREFS, {});
  return { sons: ler(CHAVE_MUDO) !== "1", voz: p?.voz !== false, reduzidas: p?.reduzidas === true };
}
export function gravarPreferencias(prefs) {
  gravar(CHAVE_MUDO, prefs.sons ? "0" : "1");
  gravar(CHAVE_PREFS, JSON.stringify({ voz: prefs.voz !== false, reduzidas: prefs.reduzidas === true }));
}

export function lerVistos(uid) {
  const lista = lerJson(prefixoVistos(uid), []);
  return new Set(Array.isArray(lista) ? lista : []);
}
export function marcarVistos(uid, chaves) {
  const novas = chaves.filter(Boolean);
  if (!novas.length) return;
  const lista = [...lerVistos(uid), ...novas];
  gravar(prefixoVistos(uid), JSON.stringify(Array.from(new Set(lista)).slice(-MAX_VISTOS)));
}

export function lerHistorico(uid) {
  const lista = lerJson(prefixoHistorico(uid), []);
  return Array.isArray(lista) ? lista : [];
}
/** Acrescenta no topo (mais recente primeiro); guarda só os últimos MAX_HISTORICO. */
export function registrarHistorico(uid, itens, agora = Date.now()) {
  const novos = itens.filter((e) => e?.importante).map((e) => ({ chave: e.chave ?? null, id: e.id, rotulo: e.rotulo ?? e.id, complemento: e.complemento ?? null, quando: agora }));
  if (!novos.length) return lerHistorico(uid);
  const lista = [...novos.reverse(), ...lerHistorico(uid)].slice(0, MAX_HISTORICO);
  gravar(prefixoHistorico(uid), JSON.stringify(lista));
  return lista;
}

/** Última consulta do fechamento da liga (ms): no máximo uma a cada INTERVALO_LIGA_MS por aparelho e conta. */
export const INTERVALO_LIGA_MS = 3 * 60 * 60 * 1000;
export function ligaConsultadaHaPouco(uid, agora = Date.now()) {
  const t = Number(ler(chaveLiga(uid)));
  return Number.isFinite(t) && t > 0 && agora - t < INTERVALO_LIGA_MS;
}
export function marcarLigaConsultada(uid, agora = Date.now()) {
  gravar(chaveLiga(uid), String(agora));
}

/** Prévia e testes: esquece tudo desta conta neste aparelho (limites do dia, já comemorados, histórico, liga). */
export function esquecerTudo(uid, { manterHistorico = false } = {}) {
  try {
    if (typeof localStorage === "undefined") return;
    for (const k of [prefixoVistos(uid), manterHistorico ? null : prefixoHistorico(uid), chaveEstado(uid), chaveLiga(uid)]) if (k) localStorage.removeItem(k);
  } catch {
    /* nada a fazer */
  }
}
