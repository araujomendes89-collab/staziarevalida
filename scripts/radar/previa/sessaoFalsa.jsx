// Sessão falsa da prévia: papel e banco de mentira. Nada sai do navegador.
import React from "react";
import { cenario } from "./dados.js";

const params = new URLSearchParams(location.search);
const papel = { aluno: "student", editor: "editor", admin: "admin" }[params.get("papel") ?? "admin"] ?? "admin";
const dados = cenario(params.get("cenario") ?? "cheio");
const mem = { eventos: dados };

const aguarda = (e) => e.gravidade === "grave" && ["pendente", "vista", "em_revisao"].includes(e.status) && !e.decisao_dono;
const backend = {
  async rpc(nome, args = {}) {
    await new Promise((r) => setTimeout(r, 250));
    if (papel === "student") return nome === "app_admin_radar_avisos" ? { graves_pendentes: 0, vencidas: 0, itens: [] } : [];
    if (nome === "app_admin_radar_fila_detalhada") return structuredClone(mem.eventos);
    if (nome === "app_admin_radar_avisos") {
      if (papel !== "admin") return { graves_pendentes: 0, vencidas: 0, itens: [] };
      const l = mem.eventos.filter(aguarda);
      return { graves_pendentes: l.length, vencidas: l.filter((e) => Date.parse(e.prazo_revisao_ate) < Date.now()).length, itens: l.slice(0, 5).map((e) => ({ evento: e.evento, fonte: e.fonte.nome, motivo: e.motivo, prazo_revisao_ate: e.prazo_revisao_ate })) };
    }
    if (nome === "app_admin_radar_parecer") { const e = mem.eventos.find((x) => x.evento === args.p_evento); e.parecer = args.p_texto; e.parecer_em = new Date().toISOString(); return null; }
    if (nome === "app_admin_radar_acao") {
      const e = mem.eventos.find((x) => x.evento === args.p_evento);
      e.status = args.p_acao === "sem_impacto" ? "descartada" : args.p_acao === "concluida" ? "resolvida" : "em_revisao";
      e.decisao_dono = args.p_acao; e.nota = args.p_nota; e.decidido_em = new Date().toISOString(); e.aguarda_dono = false;
      return null;
    }
    throw new Error("Esta prévia só simula o Radar.");
  },
};
const valor = { status: "ready", backend, user: { id: "a" }, boot: { role: papel, profile: { name: "Dra. Ana Souza", phase: 1, theme: "light" }, reviewer_areas: [] }, error: null };
export const useSession = () => valor;
export const SessionProvider = ({ children }) => children;
export const rememberChoice = () => {};
