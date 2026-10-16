// Arte 3D das 41 medalhas e 7 ligas do pacote "Novas telas" (Medalhas.html e Conquistas*, assets/ do pacote, 15/10/2026).
// LIGADA no app desde 16/10/2026 (o dono confirmou que a arte é dele): o app carrega artes.js sob demanda (import dinâmico,
// só quando Conquistas ou Medalhas abrem), então os SVGs entram no build como arquivos à parte. VITE_MEDALHAS_ARTE_PACOTE=0 desliga.
// A prévia scripts/previa-novas-telas-onda2 continua registrando o mapa direto (registrarArtesDoPacote).
// Nome do arquivo = slug do banco (tabela public.achievements / public.leagues da migração 20261003003800_stazia_play.sql).
// As 4 secretas do pacote são medalhas genéricas com fechadura (sem a arte "real"), separadas só pela raridade.

const AREAS = ["cirurgia_geral", "ginecologia_obstetricia", "medicina_familia_comunidade", "clinica_medica", "pediatria"];
const NIVEIS = ["interno", "residente", "especialista", "mestre"];

/** As 37 medalhas não secretas com arte própria no pacote (slug do banco). */
export const MEDALHAS_COM_ARTE = new Set([
  "primeiros_passos", "aquecendo_motores", "maquina_de_questoes", "insano",
  "mira_boa", "atirador_de_elite", "quase_banca",
  "streak_3", "streak_7", "streak_15", "streak_30", "streak_60", "streak_100", "streak_365",
  ...NIVEIS.flatMap((n) => AREAS.map((a) => `${a}_${n}`)),
  "virada_de_jogo", "aprendeu_mesmo", "top_10_semanal",
]);

/** As 4 secretas do banco, na ordem do pacote (Corujão e 5 da manhã são raras; Sobrevivente e Imparável, épicas). */
const SECRETAS = { corujao: "secreta-rara-1", cinco_da_manha: "secreta-rara-2", sobrevivente: "secreta-epica-1", imparavel: "secreta-epica-2" };

/** As 7 ligas do banco (public.leagues), mesmos nomes no pacote. */
export const LIGAS_COM_ARTE = ["bronze", "prata", "ouro", "platina", "diamante", "elite", "revalida_master"];

/** Nome do arquivo de arte de uma medalha (item de app_gamification_achievements) ou null (medalha nova sem arte). */
export function arteDaMedalha(item) {
  if (!item?.slug) return null;
  if (item.secret) return SECRETAS[item.slug] ?? (item.rarity === "epica" || item.rarity === "lendaria" ? "secreta-epica-1" : "secreta-rara-1");
  return MEDALHAS_COM_ARTE.has(item.slug) ? item.slug : null;
}

/** Nome do arquivo de arte de uma liga (slug do banco) ou null. */
export function arteDaLiga(slug) {
  return LIGAS_COM_ARTE.includes(slug) ? `liga-${slug}` : null;
}

let registradas = {};
/** A prévia registra aqui o mapa de artes.js (nome -> URL). */
export function registrarArtesDoPacote(mapa) {
  registradas = mapa || {};
}

/** Endereços das artes (nome -> URL). Vazio com a flag desligada (VITE_MEDALHAS_ARTE_PACOTE=0). */
export async function carregarArtesDoPacote() {
  if (String(import.meta.env.VITE_MEDALHAS_ARTE_PACOTE ?? "") === "0") return {};
  if (Object.keys(registradas).length) return registradas;
  const m = await import("./artes.js");
  return m.default || {};
}
