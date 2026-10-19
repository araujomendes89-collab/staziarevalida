// Treino em Dupla · radar de quem está online: rótulos, busca na lista e a estação do último convite. Sem rede e sem React: as
// regras (quem aparece, ordem, "Perto de você") são do banco (`app_dupla_radar`); aqui só ficam os textos e a busca na tela.
import { areaByCode } from "./labels.js";

/** Abas do radar, na ordem da tela (fluxo simples, 19/10: a aba "Ator" saiu). O valor vai em `p_aba`. */
export const ABAS = [
  { value: "online", label: "Online" },
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
