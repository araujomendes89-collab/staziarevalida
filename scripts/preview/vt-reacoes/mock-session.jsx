// Sessão e banco SIMULADOS da prévia: guarda as reações só na memória do navegador. Nenhum dado real, nenhuma chamada ao servidor.
const DADOS_DE_TESTE = {
  explosiva_enabled: true,
  rules: [
    { personality: "durona", level: "padrao", reaction: "sighs", allowed: true, max_per_reply: 1, max_per_10: 3 },
    { personality: "durona", level: "n4", reaction: "laughs", allowed: true, max_per_reply: 1, max_per_10: 3 },
    { personality: "durona", level: "n4", reaction: "shouts", allowed: true, max_per_reply: 1, max_per_10: 2 },
    { personality: "tranquilo", level: "padrao", reaction: "slow", allowed: true, max_per_reply: 1, max_per_10: 4 },
  ],
  updated_at: "2026-10-16T09:00:00Z",
};
let stored = structuredClone(DADOS_DE_TESTE);
// aluno: sem escolha gravada = padrão do dono (N3, gritos e palavrões ligados); a declaração do Termo muda pela barra da prévia
export const aluno = { adult_declared: new URLSearchParams(location.search).get("termo") !== "nao", choice: null };
const PADRAO = { level: "n3", shouts: true, profanity: true, is_default: true };
const alunoView = () => ({ available: stored.explosiva_enabled, adult_declared: aluno.adult_declared, choice: aluno.choice ?? PADRAO });
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
    if (fn === "app_tutor_explosiva_preferences") return structuredClone(alunoView());
    if (fn === "app_tutor_save_explosiva_preferences") {
      if (!args.p_level) aluno.choice = null;
      else {
        if (!stored.explosiva_enabled) throw new Error("A Durona Explosiva está desligada no momento.");
        if (["n3", "n4"].includes(args.p_level) && !aluno.adult_declared) throw new Error("Os níveis 3 e 4 ficam liberados depois do aceite do Termo com a declaração de maioridade e de médico.");
        aluno.choice = { level: args.p_level, shouts: args.p_shouts ?? true, profanity: args.p_profanity ?? true, is_default: false };
      }
      window.dispatchEvent(new CustomEvent("previa-salvou", { detail: { aluno: args } }));
      return structuredClone(alunoView());
    }
    throw new Error(`Função não simulada na prévia: ${fn}`);
  },
  accessToken: async () => "previa",
};
const session = { backend, boot: { role: "admin", profile: { name: "Dono (prévia)" } }, user: { id: "previa" } };
export const useSession = () => session;
export const SessionProvider = ({ children }) => children;
