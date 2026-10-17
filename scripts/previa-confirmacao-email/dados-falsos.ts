// Backend de mentira da prévia: nada sai do navegador. Comportamento para exercitar os estados:
//  - signUp: sempre "precisa confirmar o e-mail" (como o Supabase com "Confirm email" ligado);
//  - signIn: e-mail com "pendente" -> e-mail não confirmado; outro -> e-mail ou senha errados;
//  - resendConfirmation: e-mail com "espera" -> Supabase pede 42 segundos; outro -> enviado.
import { BackendError } from "../../src/novo/data/backend";

export * from "../../src/novo/data/backend";

const pausa = () => new Promise((r) => setTimeout(r, 400));

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
    async signUp() {
      await pausa();
      return { needsEmailConfirmation: true };
    },
    async signIn(email: string) {
      await pausa();
      if (/pendente/.test(email)) throw new BackendError("email_not_confirmed", "Email not confirmed");
      throw new BackendError("invalid_credentials", "Invalid login credentials");
    },
    async signInWithGoogle() {},
    async resendConfirmation(email: string) {
      await pausa();
      if (/espera/.test(email)) throw new BackendError("rate_limited", "For security purposes, you can only request this after 42 seconds.");
    },
    async rpc(fn: string) {
      if (fn === "app_support_contact") return { email: "suporte@staziamed.com.br" };
      return {};
    },
    masterSetup: { async needed() { return false; } },
  };
  return Promise.resolve(backend);
}
