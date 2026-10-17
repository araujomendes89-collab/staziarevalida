// Backend de mentira da prévia da tela Criar conta: nada sai do navegador. Comportamento para exercitar os estados:
//  - signUp: e-mail com "existe" -> "Já existe uma conta com este e-mail." (email_taken);
//            e-mail com "lento"  -> fica "CRIANDO CONTA…" por 10 minutos (para fotografar o enviando);
//            outro               -> conta criada, falta confirmar o e-mail (como o Supabase com "Confirm email" ligado).
//  - signInWithGoogle: não sai da página.
import { BackendError } from "../../src/novo/data/backend";

export * from "../../src/novo/data/backend";

const pausa = (ms = 400) => new Promise((r) => setTimeout(r, ms));

export function getBackend(): Promise<any> {
  const backend: any = {
    kind: "previa",
    async getUser() {
      return null;
    },
    onAuthChange() {
      return () => {};
    },
    async signOut() {},
    async signUp(_name: string, email: string) {
      if (/lento/.test(email)) await pausa(600_000);
      await pausa();
      if (/existe/.test(email)) throw new BackendError("email_taken", "User already registered");
      return { needsEmailConfirmation: true };
    },
    async signIn() {
      await pausa();
      throw new BackendError("invalid_credentials", "Invalid login credentials");
    },
    async signInWithGoogle() {},
    async resendConfirmation() {
      await pausa();
    },
    async resetPassword() {
      await pausa();
    },
    async rpc(fn: string) {
      if (fn === "app_support_contact") return { email: "suporte@staziamed.com.br" };
      return {};
    },
    masterSetup: { async needed() { return false; } },
  };
  return Promise.resolve(backend);
}
