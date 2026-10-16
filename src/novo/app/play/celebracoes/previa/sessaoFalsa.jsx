// PRÉVIA (só no servidor da prévia, porta 31994): substitui src/novo/app/session.jsx. Sem login e sem banco: o "banco" abaixo
// responde só o que as comemorações pedem (preferências da Arena, resumo do aluno, liga da semana), como o banco de verdade.
import React from "react";

const LIGAS = [
  { slug: "bronze", name: "Bronze", position: 1 },
  { slug: "prata", name: "Prata", position: 2 },
  { slug: "ouro", name: "Ouro", position: 3 },
  { slug: "platina", name: "Platina", position: 4 },
  { slug: "diamante", name: "Diamante", position: 5 },
  { slug: "elite", name: "Elite", position: 6 },
  { slug: "revalida_master", name: "Revalida Master", position: 7 },
];
export const LIGAS_PREVIA = LIGAS;

const estado = {
  showStreak: true,
  liga: null,
  resumo: { level: { slug: "explorador", name: "Explorador", description: "Você está explorando as grandes áreas." }, streak: { current: 7, longest: 21 } },
};
/** Próximo fechamento de liga que o "banco" devolve (temporada já fechada). */
export function definirLiga(h) {
  estado.liga = h;
}
export function definirMaiorSequencia(n) {
  estado.resumo = { ...estado.resumo, streak: { ...estado.resumo.streak, longest: n } };
}
export function definirMostrarSequencia(v) {
  estado.showStreak = v;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const backend = {
  async rpc(fn) {
    await espera(150);
    if (fn === "app_gamification_preferences") return { show_streak: estado.showStreak };
    if (fn === "app_gamification_summary") return estado.resumo;
    if (fn === "app_league_current") return { enabled: true, joined: true, leagues: LIGAS, history: estado.liga ? [estado.liga] : [] };
    throw new Error(`Prévia: a função ${fn} não existe aqui.`);
  },
};
const sessao = {
  status: "ready",
  backend,
  user: { id: "aluno-previa" },
  boot: { profile: { name: "Aluno de prévia" }, play: { enabled: true, flags: { leaderboard: true, leagues: true, coins: true, trail: true } } },
  refresh: async () => {},
};

export function useSession() {
  return sessao;
}
export function SessionProvider({ children }) {
  return <>{children}</>;
}
export function rememberChoice() {}
