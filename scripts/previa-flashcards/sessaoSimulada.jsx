// Substitui src/novo/app/session.jsx só na prévia (ver vite.config.mjs): um "banco" em memória com as funções app_* que a tela de
// Flashcards usa. Tudo é DADO SIMULADO de demonstração (textos de exemplo), sem login e sem rede.
import React from "react";

const CARTOES = Array.from({ length: 6 }, (_, k) => ({
  id: `fc-${k + 1}`,
  area: "CLINICA_MEDICA",
  topic: `Tema de exemplo ${k + 1}`,
  front: `[Prévia] Pergunta de exemplo do cartão ${k + 1}.`,
  back: `[Prévia] Resposta de exemplo do cartão ${k + 1}.`,
  schedule: null,
  mine: false,
}));

export const chamadas = [];
const backend = {
  accessToken: async () => "previa",
  async rpc(fn, args = {}) {
    chamadas.push(fn);
    await new Promise((r) => setTimeout(r, 150)); // ida e volta ao banco simulada
    switch (fn) {
      case "app_flashcards":
        return { counts: { new: CARTOES.length, learning: 0, consolidated: 0, total: CARTOES.length, next_due: null }, queue: CARTOES };
      case "app_flashcards_ilustrados":
        return Object.fromEntries(args.p_ids.map((id, k) => [id, { tema: "GR-001", n: k + 1 }]));
      case "app_review_flashcard":
        return { ok: true };
      case "app_bootstrap":
        return {};
      default:
        throw new Error(`função simulada não existe: ${fn}`);
    }
  },
};

const value = { backend, refresh: async () => {}, boot: { profile: { name: "Aluno de prévia" } }, user: { id: "previa" } };
export function useSession() {
  return value;
}
export function SessionProvider({ children }) {
  return <>{children}</>;
}
export function rememberChoice() {}
