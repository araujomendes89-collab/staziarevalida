// Sessão simulada da prévia do saldo: ?situacao=sombra (padrão) | creditos | equipe | esgotado.
import React from "react";

const params = new URLSearchParams(window.location.search);
const SALDOS = {
  sombra: { fonte: "tutor_atual", ilimitado: false, tutor_ligado: true, mensagens_hoje: 38, mensagens_limite_hoje: 40, voz_ligada: true, voz_restante_s: 600, voz_periodo: "dia" },
  creditos: { fonte: "creditos", ilimitado: false, creditos_hoje: 6, creditos_limite_hoje: 8, creditos_mes: 172, creditos_limite_mes: 180, voz_restante_s: 540, voz_limite_s: 600, voz_periodo: "mes" },
  equipe: { fonte: "equipe", ilimitado: true },
  esgotado: { fonte: "tutor_atual", ilimitado: false, tutor_ligado: true, mensagens_hoje: 0, mensagens_limite_hoje: 40, voz_ligada: true, voz_restante_s: 0, voz_periodo: "teste_total" },
};
const backend = {
  async rpc(fn) {
    if (fn === "app_my_entitlements") return { saldo: SALDOS[params.get("situacao")] ?? SALDOS.sombra };
    throw new Error(`prévia: ${fn} não simulada`);
  },
};
const valor = { backend, boot: { role: "student" }, user: { id: "previa" } };
const Ctx = React.createContext(valor);
export function SessionProvider({ children }) {
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
export const useSession = () => React.useContext(Ctx);
export const useOptionalSession = () => React.useContext(Ctx);
