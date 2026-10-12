// Medir se o aluno assistiu a aula ATÉ O FIM (A08, decisão do dono de 11/10/2026): só então a conclusão da aula dá XP.
// "Até o fim" = o player avisou o fim do vídeo (evento "ended") E o aluno assistiu a aula COMPLETA. O tempo assistido é a soma dos
// TRECHOS CONTÍNUOS que o player leu (de uma leitura para a próxima, andando: no máximo JUMP_SECONDS para a frente); o que foi
// pulado (arrastar a barra para a frente) ou repetido (voltar) não conta como visto, e trechos vistos duas vezes contam uma vez
// só. O fim vale quando o tempo assistido cobre a aula inteira (a duração informada pelo player, ou o ponto mais longe a que ele
// chegou) com uma folga técnica de COVERAGE_SLACK_SECONDS (a primeira leitura do player nunca é no instante zero e a última
// antes do fim fica um pouco antes dele; não é regra de negócio). Começar perto do fim ou pular quase tudo não vale.
// A medição vem do navegador: quem mexe nele consegue enganá-la, e o XP de aula é pequeno (limite documentado no relatório).

/** Maior avanço entre duas leituras seguidas que ainda conta como reprodução contínua (o player lê ~4 vezes por segundo). */
export const JUMP_SECONDS = 3;
/** Folga técnica da cobertura da aula: começo (primeira leitura) e fim (última leitura antes do aviso de fim). */
export const COVERAGE_SLACK_SECONDS = 3;

const YOUTUBE_ORIGINS = new Set(["https://www.youtube-nocookie.com", "https://www.youtube.com"]);
const VIMEO_ORIGIN = "https://player.vimeo.com";

/**
 * Acompanha os pontos lidos do player. `time(s, duração?)` registra o ponto atual; `end()` diz se o fim vale.
 * `watched`: segundos realmente assistidos (união dos trechos contínuos); `length`: tamanho da aula usado como referência.
 */
export function createWatchTracker() {
  let last = null;
  let max = 0;
  let duration = 0;
  let ended = false;
  let ranges = []; // trechos já vistos, ordenados e sem sobreposição: [[ini, fim], ...]
  const add = (a, b) => {
    if (!(b > a)) return;
    let lo = a;
    let hi = b;
    const next = [];
    for (const [x, y] of ranges) {
      if (y < lo || x > hi) next.push([x, y]); // separado
      else (lo = Math.min(lo, x)), (hi = Math.max(hi, y)); // encosta ou sobrepõe: junta
    }
    next.push([lo, hi]);
    ranges = next.sort((p, q) => p[0] - q[0]);
  };
  const watched = () => ranges.reduce((sum, [x, y]) => sum + (y - x), 0);
  const length = () => Math.max(duration, max);
  return {
    time(seconds, total) {
      const t = Number(seconds);
      if (!Number.isFinite(t) || t < 0) return;
      const d = Number(total);
      if (Number.isFinite(d) && d > 0) duration = d;
      if (last !== null && t >= last && t - last <= JUMP_SECONDS) add(last, t); // andou: trecho contínuo
      last = t;
      if (t > max) max = t;
    },
    /** Verdadeiro se o fim vale (e a partir daí fica valendo): a aula inteira foi assistida, com a folga técnica. */
    end() {
      if (last === null) return false;
      if (ended) return true;
      if (length() <= 0 || watched() < length() - COVERAGE_SLACK_SECONDS) return false;
      ended = true;
      return true;
    },
    /** Segundos realmente assistidos (inteiro). */
    get watched() {
      return Math.floor(watched());
    },
    /** Tamanho da aula usado como referência (inteiro). */
    get length() {
      return Math.ceil(length());
    },
    /** Ponto mais longe a que o player chegou. */
    get max() {
      return Math.floor(max);
    },
    get ended() {
      return ended;
    },
  };
}

function asObject(data) {
  if (data && typeof data === "object") return data;
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const timeMessage = (seconds, duration) => (Number.isFinite(Number(duration)) && Number(duration) > 0 ? { kind: "time", seconds, duration: Number(duration) } : { kind: "time", seconds });

/**
 * Mensagem de um player incorporado (YouTube ou Vimeo) → { kind: "time", seconds, duration? } | { kind: "ended" } | { kind: "ready" } | null.
 * Só aceita mensagens da origem do player.
 */
export function parsePlayerMessage(origin, data) {
  const m = asObject(data);
  if (!m) return null;
  if (origin === VIMEO_ORIGIN) {
    if (m.event === "ready") return { kind: "ready" };
    if (m.event === "ended" || m.event === "finish") return { kind: "ended" };
    if ((m.event === "timeupdate" || m.event === "playProgress") && Number.isFinite(Number(m.data?.seconds))) return timeMessage(Number(m.data.seconds), m.data.duration);
    return null;
  }
  if (YOUTUBE_ORIGINS.has(origin)) {
    if (m.event === "onReady") return { kind: "ready" };
    if (m.event === "onStateChange" && Number(m.info) === 0) return { kind: "ended" };
    if ((m.event === "infoDelivery" || m.event === "initialDelivery") && m.info && typeof m.info === "object") {
      if (Number(m.info.playerState) === 0) return { kind: "ended" };
      if (Number.isFinite(Number(m.info.currentTime))) return timeMessage(Number(m.info.currentTime), m.info.duration);
    }
    return null;
  }
  return null;
}

/** Pedidos que o navegador manda ao player incorporado para ele começar a avisar o tempo e o fim. */
export function subscribeToPlayer(kind, frameWindow) {
  if (!frameWindow?.postMessage) return;
  try {
    if (kind === "vimeo") {
      for (const value of ["timeupdate", "ended"]) frameWindow.postMessage(JSON.stringify({ method: "addEventListener", value }), VIMEO_ORIGIN);
    } else if (kind === "youtube") {
      frameWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
      frameWindow.postMessage(JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"], id: 1, channel: "widget" }), "*");
    }
  } catch {
    // sem acesso ao player: a tela mostra que não dá para medir
  }
}

/** Endereço do player com a API de mensagens ligada (o YouTube só avisa com enablejsapi=1). */
export function withPlayerApi(kind, src, origin) {
  if (kind !== "youtube") return src;
  const url = new URL(src);
  url.searchParams.set("enablejsapi", "1");
  if (origin) url.searchParams.set("origin", origin);
  return url.toString();
}

/** Quais aulas permitem medir o fim: vídeo do YouTube, do Vimeo ou arquivo MP4/WebM tocado na página. */
export const canMeasureEnd = (embed) => Boolean(embed) && ["youtube", "vimeo", "file"].includes(embed.kind);

export const XP_RULE = "Para ganhar o XP, assista a aula até o fim.";
/** Espera pelo primeiro aviso do player incorporado; sem nenhum, a tela diz que não dá para medir neste aparelho. */
export const MEASURE_TIMEOUT_MS = 15000;

/** Regra de antes do A08 (o banco antigo paga o XP ao concluir): é o que a tela diz quando o SQL novo ainda não chegou ao banco. */
export const OLD_XP_RULE = "Concluir a aula vale XP na Stazia Arena (uma vez por aula).";

/**
 * Texto que explica ao aluno como ganhar o XP da aula (A08), ou null quando não há o que dizer.
 * `embed`: videoEmbed() da aula; `measure`: "waiting" | "ok" | "unavailable"; `done`: aula concluída; `ended`: já assistiu até o fim;
 * `supported`: false quando o banco ainda não tem as funções novas (janela "site novo + SQL antigo"): a tela se comporta como antes.
 */
export function xpNote({ embed, measure, done, ended, supported = true }) {
  if (!supported) return done ? null : OLD_XP_RULE;
  if (done && ended) return null;
  if (!embed) return `${XP_RULE} Esta aula ainda não tem vídeo na página: concluir marca a aula como feita, mas não dá XP.`;
  if (!canMeasureEnd(embed)) return `${XP_RULE} O vídeo desta aula abre em outra aba e não dá para medir se você assistiu até o fim: concluir marca a aula como feita, mas não dá XP.`;
  if (measure === "unavailable" && !ended) return `${XP_RULE} Não conseguimos medir se você assistiu até o fim neste aparelho: concluir marca a aula como feita, mas não dá XP.`;
  if (ended) return "Você assistiu até o fim. Marque a aula como concluída para ganhar o XP.";
  if (done) return "Aula concluída. Falta assistir até o fim para ganhar o XP.";
  return XP_RULE;
}

/** O erro é "a função não existe no banco" (SQL novo ainda não colado)? Vale para o Supabase (PGRST202) e para o banco local. */
export function isMissingFunction(error) {
  const text = `${error?.code ?? ""} ${error?.message ?? error ?? ""}`;
  return /PGRST202|42883|could not find the function|does not exist|schema cache/i.test(text);
}

// Fim já validado pelo navegador mas ainda não confirmado pelo banco (falha de rede, ou o SQL novo ainda não chegou): fica guardado
// neste aparelho e é reenviado na próxima vez que o aluno abrir as aulas. Chave por aluno; some quando o banco confirma.
const PENDING_KEY = "stazia.lessonEnds.v1";
const PENDING_MAX = 30;
const PENDING_TTL_MS = 30 * 24 * 3600 * 1000;
const readPending = () => {
  try {
    const all = JSON.parse(window.localStorage.getItem(PENDING_KEY) || "{}");
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
};
const writePending = (all) => {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(all));
  } catch {
    // sem armazenamento: o reenvio fica só nesta visita
  }
};
export function savePendingEnd(userId, lessonId, { seconds, duration }) {
  if (!userId || !lessonId) return;
  const all = readPending();
  all[`${userId}:${lessonId}`] = { userId, lessonId, seconds, duration, at: Date.now() };
  const keys = Object.keys(all).sort((x, y) => all[y].at - all[x].at).slice(0, PENDING_MAX);
  writePending(Object.fromEntries(keys.map((k) => [k, all[k]])));
}
export function clearPendingEnd(userId, lessonId) {
  const all = readPending();
  if (all[`${userId}:${lessonId}`]) {
    delete all[`${userId}:${lessonId}`];
    writePending(all);
  }
}
export function pendingEnds(userId) {
  const now = Date.now();
  return Object.values(readPending()).filter((e) => e && e.userId === userId && now - e.at < PENDING_TTL_MS);
}

/**
 * Reenvia os fins guardados deste aluno. `onConfirmed(lessonId, resposta)` é chamado para o que o banco aceitou. Nunca lança erro:
 * se o SQL novo ainda não chegou ou a rede falhou, o fim continua guardado para a próxima vez; aula que não existe mais é descartada.
 */
export async function flushPendingEnds(backend, userId, onConfirmed) {
  for (const e of pendingEnds(userId)) {
    try {
      const r = await backend.rpc("app_lesson_watch", { p_id: e.lessonId, p_seconds: e.seconds, p_ended: true, p_duration: e.duration || null });
      if (r?.watched_to_end_at) {
        clearPendingEnd(userId, e.lessonId);
        onConfirmed?.(e.lessonId, r);
      }
    } catch (error) {
      if (!isMissingFunction(error) && /não encontrad|not found/i.test(String(error?.message ?? error))) clearPendingEnd(userId, e.lessonId);
    }
  }
}
