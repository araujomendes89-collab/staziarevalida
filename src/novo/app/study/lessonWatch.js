// Medir se o aluno assistiu a aula ATÉ O FIM (A08, decisão do dono de 11/10/2026): só então a conclusão da aula dá XP.
// "Até o fim" = o player avisou o fim do vídeo (evento "ended"), sem tolerância nenhuma: o evento de fim já inclui os créditos finais.
// Para o aviso de fim não valer quando o aluno arrasta a barra direto para o último instante, o fim só vale se a reprodução chegou
// a ele andando (o último ponto lido não foi um salto para a frente de mais de JUMP_SECONDS; é só a folga técnica entre duas leituras
// do player, que leem cerca de 4 vezes por segundo; não é regra de negócio).
// A medição vem do navegador: quem mexe nele consegue enganá-la, e o XP de aula é pequeno (limite documentado no relatório).

export const JUMP_SECONDS = 3;

const YOUTUBE_ORIGINS = new Set(["https://www.youtube-nocookie.com", "https://www.youtube.com"]);
const VIMEO_ORIGIN = "https://player.vimeo.com";

/** Acompanha os pontos lidos do player. `time(s)` registra o ponto atual; `end()` diz se o fim vale. */
export function createWatchTracker() {
  let last = null;
  let jumped = false;
  let max = 0;
  let ended = false;
  return {
    time(seconds) {
      const t = Number(seconds);
      if (!Number.isFinite(t) || t < 0) return;
      jumped = last !== null && t - last > JUMP_SECONDS;
      last = t;
      if (t > max) max = t;
    },
    /** Verdadeiro se o fim vale (e a partir daí fica valendo). Sem nenhum ponto lido, ou depois de um salto, não vale. */
    end() {
      if (last === null || jumped) return false;
      ended = true;
      return true;
    },
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

/**
 * Mensagem de um player incorporado (YouTube ou Vimeo) → { kind: "time", seconds } | { kind: "ended" } | { kind: "ready" } | null.
 * Só aceita mensagens da origem do player.
 */
export function parsePlayerMessage(origin, data) {
  const m = asObject(data);
  if (!m) return null;
  if (origin === VIMEO_ORIGIN) {
    if (m.event === "ready") return { kind: "ready" };
    if (m.event === "ended" || m.event === "finish") return { kind: "ended" };
    if ((m.event === "timeupdate" || m.event === "playProgress") && Number.isFinite(Number(m.data?.seconds))) return { kind: "time", seconds: Number(m.data.seconds) };
    return null;
  }
  if (YOUTUBE_ORIGINS.has(origin)) {
    if (m.event === "onReady") return { kind: "ready" };
    if (m.event === "onStateChange" && Number(m.info) === 0) return { kind: "ended" };
    if ((m.event === "infoDelivery" || m.event === "initialDelivery") && m.info && typeof m.info === "object") {
      if (Number(m.info.playerState) === 0) return { kind: "ended" };
      if (Number.isFinite(Number(m.info.currentTime))) return { kind: "time", seconds: Number(m.info.currentTime) };
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

/**
 * Texto que explica ao aluno como ganhar o XP da aula (A08), ou null quando não há o que dizer.
 * `embed`: videoEmbed() da aula; `measure`: "waiting" | "ok" | "unavailable"; `done`: aula concluída; `ended`: já assistiu até o fim.
 */
export function xpNote({ embed, measure, done, ended }) {
  if (done && ended) return null;
  if (!embed) return `${XP_RULE} Esta aula ainda não tem vídeo na página: concluir marca a aula como feita, mas não dá XP.`;
  if (!canMeasureEnd(embed)) return `${XP_RULE} O vídeo desta aula abre em outra aba e não dá para medir se você assistiu até o fim: concluir marca a aula como feita, mas não dá XP.`;
  if (measure === "unavailable" && !ended) return `${XP_RULE} Não conseguimos medir se você assistiu até o fim neste aparelho: concluir marca a aula como feita, mas não dá XP.`;
  if (ended) return "Você assistiu até o fim. Marque a aula como concluída para ganhar o XP.";
  if (done) return "Aula concluída. Falta assistir até o fim para ganhar o XP.";
  return XP_RULE;
}
