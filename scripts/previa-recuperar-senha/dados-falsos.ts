// Backend de mentira da prévia: nada sai do navegador. Comportamento para exercitar os estados:
//  - resetPassword: sempre responde (como o real, que não revela se o e-mail existe);
//  - updatePassword: se a senha contiver "vencido", falha com link_expired; senão grava e pronto.
import { BackendError } from "../../src/novo/data/backend";

export * from "../../src/novo/data/backend";

const usuario = { id: "u-previa", email: "ana@exemplo.com", name: "Ana (prévia)" };

export function getBackend(): Promise<any> {
  const backend: any = {
    kind: "previa",
    async getUser() {
      return new URLSearchParams(location.search).get("tela") === "nova" ? usuario : null;
    },
    onAuthChange() {
      return () => {};
    },
    async signOut() {},
    async resetPassword(email: string) {
      await new Promise((r) => setTimeout(r, 500));
      if (/falha/.test(email)) throw new Error("falha de envio (a tela não pode revelar isso)");
    },
    async updatePassword(password: string) {
      await new Promise((r) => setTimeout(r, 500));
      if (/vencido/.test(password)) throw new BackendError("link_expired", "link vencido");
    },
    async rpc(fn: string) {
      if (fn === "app_support_contact") return { email: "suporte@staziamed.com.br" };
      return {};
    },
    masterSetup: { async needed() { return false; } },
  };
  return Promise.resolve(backend);
}
