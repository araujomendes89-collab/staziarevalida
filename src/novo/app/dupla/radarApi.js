// Treino em Dupla · radar de quem está online: rótulos, busca na lista e a estação do último convite. Sem rede e sem React: as
// regras (quem aparece, ordem, "Perto de você") são do banco (`app_dupla_radar`); aqui só ficam os textos e a busca na tela.
import { areaByCode } from "./labels.js";

/** Abas do radar, na ordem da tela. O valor vai em `p_aba`. */
export const ABAS = [
  { value: "online", label: "Online" },
  { value: "atores", label: "Ator/avaliador" },
  { value: "perto", label: "Perto de você" },
];

/** Situação de cada pessoa na lista. */
export const STATE_LABEL = { livre: "Livre", em_sala: "Em sala", sozinho: "Treinando sozinho" };

/** Na aba "Perto de você": quão perto a pessoa está, pelo que ela mesma informou no perfil. */
export const NEAR_LABEL = { cidade: "Mesma cidade", estado: "Mesmo estado" };

/** Sem acento, minúsculas e espaços únicos (para a busca). */
export function plain(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca por nome, @ (com ou sem o @), instituição ou área ("clinica", "pediatria", "go"…), sem acento nem diferença de maiúscula.
 * Busca vazia devolve a lista inteira.
 * @param {Array<{ public_name?: string, school?: string | null, areas?: string[] }>} people
 * @param {string} query
 */
export function filterPeople(people, query) {
  const needle = plain(query).replace(/^@+/, "");
  if (!needle) return people;
  return people.filter((p) => {
    const areas = (p.areas ?? []).map((code) => {
      const a = areaByCode(code);
      return a ? `${a.card} ${a.chip} ${a.label} ${code}` : code;
    });
    return plain([p.public_name, p.handle, p.school, ...areas].join(" ")).includes(needle);
  });
}

const KEY = "dupla:ultimo-convite";

/** Guarda neste aparelho a estação do convite que a pessoa acabou de mandar (para a tela da sala fechada oferecê-la sozinha). */
export function rememberInvitedStation(roomId, stationId) {
  try {
    if (roomId && stationId) sessionStorage.setItem(KEY, JSON.stringify({ roomId, stationId }));
  } catch {
    /* sem armazenamento: a sala fechada só não oferece o atalho */
  }
}

/** A estação do convite mandado para esta sala, se este aparelho a guardou. */
export function invitedStationOf(roomId) {
  try {
    const raw = sessionStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && v.roomId === roomId && typeof v.stationId === "string" ? v.stationId : null;
  } catch {
    return null;
  }
}

/** Manda o convite direto. → { room_id, partner, expires_at }. O erro do servidor sobe como está (mensagem em português). */
export async function invitePerson(backend, userId, stationId) {
  const res = await backend.rpc("app_dupla_invite", { p_to: userId, p_station_id: stationId ?? null });
  if (res?.room_id) rememberInvitedStation(res.room_id, stationId ?? null);
  return res;
}

// ------------------------------------------------------------------ convite por link do @
/** Caminho do convite de um @ no app novo (sem o domínio): /novo/convite/<@>, com a estação escolhida se houver. */
export function invitePath(handle, stationId) {
  const h = encodeURIComponent(String(handle ?? "").replace(/^@+/, ""));
  return `/novo/convite/${h}` + (stationId ? `?estacao=${encodeURIComponent(stationId)}` : "");
}

/** Link completo para compartilhar (o domínio é o do próprio aparelho: app.staziamed.com.br em produção). */
export function inviteLink(handle, stationId, origin = typeof window !== "undefined" ? window.location.origin : "") {
  return origin + invitePath(handle, stationId);
}

/**
 * Copia um texto com segurança: a API de área de transferência pode faltar ou ser recusada (página sem https, permissão negada,
 * navegador antigo). Tenta a API moderna e depois o jeito antigo (campo oculto). Devolve true se copiou; false deixa a tela mostrar o
 * link para a pessoa copiar à mão. Nunca lança erro.
 */
export async function copyText(text) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* cai no jeito antigo */
  }
  try {
    if (typeof document === "undefined") return false;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.setAttribute("aria-hidden", "true");
    area.style.position = "fixed";
    area.style.opacity = "0";
    area.style.top = "0";
    document.body.appendChild(area);
    try {
      area.select();
      area.setSelectionRange(0, text.length);
      return Boolean(typeof document.execCommand === "function" && document.execCommand("copy"));
    } finally {
      document.body.removeChild(area);
    }
  } catch {
    return false;
  }
}

/** Guarda o convite aberto sem conta para a pessoa voltar a ele depois do cadastro ou do login. */
const PENDING_KEY = "dupla:convite-pendente";
export function rememberPendingInvite(pathWithQuery) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ path: pathWithQuery, at: Date.now() }));
  } catch {
    /* sem armazenamento */
  }
}
/** O convite pendente (se tem menos de 2 dias) e já o esquece. Só devolve caminhos /convite/…. */
export function takePendingInvite() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v.path !== "string" || Date.now() - v.at > 2 * 86400000) return null;
    return /^\/convite\/[A-Za-z0-9._%-]+(\?estacao=[A-Za-z0-9._%-]+)?$/.test(v.path) ? v.path : null;
  } catch {
    return null;
  }
}
