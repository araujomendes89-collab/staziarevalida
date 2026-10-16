// Substitui src/novo/app/session.jsx só na prévia da expansão: as funções app_* vão para o BANCO DE TESTE (PGlite) do servidor
// da prévia (/__previa/rpc), como a pessoa escolhida na aba (equipe ou aluno). Sem Supabase e sem chaves.
import React from "react";

export const quem = { atual: "equipe" };

class ErroDoBanco extends Error {
  constructor(msg) {
    super(msg);
    this.kind = "unknown";
  }
}

const rpc = async (fn, args = {}) => {
  const r = await fetch("/__previa/rpc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quem: quem.atual, fn, args }) });
  const j = await r.json();
  if (!r.ok) throw new ErroDoBanco(j.error || "erro");
  return j.data;
};

const backend = { kind: "previa", rpc, accessToken: async () => null };
const ID = { equipe: "00000000-0000-4000-8000-0000000083ad", aluno: "00000000-0000-4000-8000-0000000083a1" };

export function valorDaSessao() {
  const aluno = quem.atual === "aluno";
  return {
    backend,
    boot: { role: aluno ? "student" : "admin", profile: { name: aluno ? "Aluna (prévia)" : "Equipe (prévia)" }, plan: "pro", access: { pro: true } },
    user: { id: ID[aluno ? "aluno" : "equipe"], email: aluno ? "al83@t.dev" : "adm83@t.dev" },
    refresh: async () => {},
    signOut: async () => {},
  };
}

export function useSession() {
  return valorDaSessao();
}
export function useOptionalSession() {
  return valorDaSessao();
}
export function SessionProvider({ children }) {
  return children;
}
export function rememberChoice() {}
