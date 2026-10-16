// Sessão e banco SIMULADOS da prévia: guarda as reações só na memória do navegador. Nenhum dado real, nenhuma chamada ao servidor.
const DADOS_DE_TESTE = {
  explosiva_enabled: false,
  rules: [
    { personality: "durona", level: "padrao", reaction: "sighs", allowed: true, max_per_reply: 1, max_per_10: 3 },
    { personality: "durona", level: "n4", reaction: "laughs", allowed: true, max_per_reply: 1, max_per_10: 3 },
    { personality: "durona", level: "n4", reaction: "shouts", allowed: true, max_per_reply: 1, max_per_10: 2 },
    { personality: "tranquilo", level: "padrao", reaction: "slow", allowed: true, max_per_reply: 1, max_per_10: 4 },
  ],
  updated_at: "2026-10-16T09:00:00Z",
};
let stored = structuredClone(DADOS_DE_TESTE);
export const saves = [];

const backend = {
  async rpc(fn, args) {
    await new Promise((r) => setTimeout(r, 250));
    if (fn === "app_admin_tutor_voice_reactions") return structuredClone(stored);
    if (fn === "app_admin_tutor_save_voice_reactions") {
      if (!args?.p_reason || args.p_reason.trim().length < 10) throw new Error("Informe o motivo da mudança (pelo menos 10 caracteres).");
      stored = { explosiva_enabled: args.p_explosiva_enabled ?? stored.explosiva_enabled, rules: args.p_rules, updated_at: new Date().toISOString() };
      saves.push(structuredClone(args));
      window.dispatchEvent(new CustomEvent("previa-salvou", { detail: args }));
      return structuredClone(stored);
    }
    throw new Error(`Função não simulada na prévia: ${fn}`);
  },
  accessToken: async () => "previa",
};
const session = { backend, boot: { role: "admin", profile: { name: "Dono (prévia)" } }, user: { id: "previa" } };
export const useSession = () => session;
export const SessionProvider = ({ children }) => children;
