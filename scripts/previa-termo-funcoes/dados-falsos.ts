// Backend de mentira da prévia (nada sai do navegador). ?tela=cadastro: ninguém logado. ?tela=conta: aluna "Ana Lima" logada,
// com o aceite do Contrato 3.0 e a escolha de marketing guardada só na memória da página.
import { BackendError } from "../../src/novo/data/backend";

export * from "../../src/novo/data/backend";

const pausa = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const conta = new URLSearchParams(location.search).get("tela") === "conta";
let marketing: { opt_in: boolean; updated_at: string | null; origin: string | null } = { opt_in: false, updated_at: null, origin: null };

const BOOT = {
  role: "student",
  profile: { name: "Ana Lima", phase: 1, exam_type: "REVALIDA", target_edition: "2026/2", daily_minutes: 60, exam_date: null, theme: "light", phone: null },
  subscription: { plan: "pro", status: "active", trial_ends_at: null, current_period_end: "2026-11-17T12:00:00Z" },
  reviewer_areas: [],
  legal: {
    termo_uso: { current: "3.0", accepted: "3.0", accepted_at: "2026-10-17T17:05:00Z", valid: true },
    tutor_ia: { current: "2.0", accepted: "2.0", accepted_at: "2026-10-17T17:06:00Z" },
    student: true, phone_missing: false, gate_required: false,
  },
};
const DOCS = [
  {
    document: "termo_uso", version: "3.0", accepted_at: "2026-10-17T17:05:00Z", origin: "cadastro", stored: true,
    title: "Contrato de Assinatura e Termos de Uso", text_sha256: "0a9b58cff598fa27225043e476139521cb1b47a2355b937c02797006c39a1230",
    companions: {
      politica_privacidade: { version: "3.0", sha256: "479660a6b4c18ca560d5c857c59d3262d0e0a0b405cf353acd3904c94504f873" },
      regulamento: { version: "1.0", sha256: "b4494a46be46d1aa25ec613a731605bbdfa5ceea1b055f6958830552798d5e6b" },
    },
  },
];

export function getBackend(): Promise<any> {
  const backend: any = {
    kind: "previa",
    async getUser() {
      return conta ? { id: "00000000-0000-4000-8000-000000000001", email: "ana.lima@exemplo.com" } : null;
    },
    onAuthChange() {
      return () => {};
    },
    async signOut() {},
    async signUp(_name: string, email: string) {
      await pausa();
      if (/existe/.test(email)) throw new BackendError("email_taken", "User already registered");
      return { needsEmailConfirmation: true };
    },
    async signIn() {
      throw new BackendError("invalid_credentials", "Invalid login credentials");
    },
    async signInWithGoogle() {},
    async resendConfirmation() {},
    async resetPassword() {},
    async rpc(fn: string, args: any = {}) {
      if (fn === "app_bootstrap") return structuredClone(BOOT);
      if (fn === "app_support_contact") return { email: "suporte@staziamed.com.br" };
      if (fn === "app_my_legal_documents") return DOCS;
      if (fn === "app_marketing_get") return marketing;
      if (fn === "app_marketing_set") {
        await pausa();
        return (marketing = { opt_in: args.p_opt_in === true, updated_at: new Date().toISOString(), origin: "minha_conta" });
      }
      if (fn === "app_legal_current") throw new Error("Could not find the function public.app_legal_current without parameters in the schema cache");
      return null;
    },
    masterSetup: { async needed() { return false; } },
  };
  return Promise.resolve(backend);
}
