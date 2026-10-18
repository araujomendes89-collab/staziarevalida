// Substitui src/novo/app/session.jsx só na prévia: o "backend" chama o banco de teste (PGlite) de servidor-banco.mjs.
import React from "react";

const params = new URLSearchParams(location.search);
const db = params.get("db") === "dados" ? "dados" : "vazio";
const backend = {
  async rpc(fn, args = {}) {
    const r = await fetch(`http://127.0.0.1:31984/rpc?db=${db}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fn, args }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Erro no banco de teste.");
    return j.data;
  },
};
const valor = { backend, boot: { role: "admin", profile: { name: "Equipe de Teste", phase: 2 } }, status: "signed-in" };
export const useSession = () => valor;
export const SessionProvider = ({ children }) => <>{children}</>;
