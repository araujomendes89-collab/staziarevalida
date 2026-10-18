// Backend de mentira da prévia da tela Criar conta: nada sai do navegador. Comportamento para exercitar os estados:
//  - signUp: e-mail com "existe" -> "Já existe uma conta com este e-mail." (email_taken);
//            e-mail com "lento"  -> fica "CRIANDO CONTA…" por 10 minutos (para fotografar o enviando);
//            outro               -> conta criada, falta confirmar o e-mail (como o Supabase com "Confirm email" ligado).
//  - signInWithGoogle: não sai da página.
//  - textos legais: como o banco de produção desde 17/10/2026 (Contrato 3.0, Política 3.0, Regulamento 1.0, migração …13740), com os
//    textos de src/novo/app/legal/textos; "?banco=site" no endereço simula banco sem a 013740 (caixa e textos antigos, do site).
//  - app_my_legal_documents: um aceite do 3.0 (para a prévia de Minha Conta → Documentos, "?tela=documentos").
import { BackendError } from "../../src/novo/data/backend";
import contratoV3 from "../../src/novo/app/legal/textos/contrato-v3.0.md?raw";
import politicaV3 from "../../src/novo/app/legal/textos/politica-privacidade-v3.0.md?raw";
import regulamentoV1 from "../../src/novo/app/legal/textos/regulamento-v1.0.md?raw";
import mudancasV3 from "../../src/novo/app/legal/textos/mudancas-v3.0.json";

export * from "../../src/novo/data/backend";

const pausa = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const semBancoV3 = new URLSearchParams(location.search).get("banco") === "site";

const TEXTOS: Record<string, { version: string; title: string; body: string; sha256: string }> = {
  termo_uso: { version: "3.0", title: "Contrato de Assinatura e Termos de Uso", body: contratoV3, sha256: "0a9b58cff598fa27225043e476139521cb1b47a2355b937c02797006c39a1230" },
  politica_privacidade: { version: "3.0", title: "Política de Privacidade", body: politicaV3, sha256: "479660a6b4c18ca560d5c857c59d3262d0e0a0b405cf353acd3904c94504f873" },
  regulamento: { version: "1.0", title: "Regulamento de Coins, XP, Ligas e Benefícios", body: regulamentoV1, sha256: "b4494a46be46d1aa25ec613a731605bbdfa5ceea1b055f6958830552798d5e6b" },
};
const semFuncao = () => new BackendError("unknown", "Could not find the function in the schema cache (PGRST202)");

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
    async rpc(fn: string, args: any = {}) {
      if (fn === "app_support_contact") return { email: "suporte@staziamed.com.br" };
      if (fn === "app_legal_current" || fn === "app_legal_text" || fn === "app_my_legal_documents") {
        if (semBancoV3) throw semFuncao();
        await pausa(150);
      }
      if (fn === "app_legal_current") {
        const v = (d: string) => ({ version: TEXTOS[d].version, title: TEXTOS[d].title, sha256: TEXTOS[d].sha256 });
        return { termo_uso: { ...v("termo_uso"), changes: mudancasV3, collects_ip: true }, politica_privacidade: v("politica_privacidade"), regulamento: v("regulamento") };
      }
      if (fn === "app_legal_text") {
        const t = TEXTOS[args.p_document];
        if (!t || (args.p_version && args.p_version !== t.version)) return null;
        return { document: args.p_document, ...t };
      }
      if (fn === "app_my_legal_documents") {
        return [{
          document: "termo_uso", version: "3.0", accepted_at: "2026-10-17T22:15:00Z", origin: "cadastro", text_sha256: TEXTOS.termo_uso.sha256,
          companions: { politica_privacidade: { version: "3.0", sha256: TEXTOS.politica_privacidade.sha256 }, regulamento: { version: "1.0", sha256: TEXTOS.regulamento.sha256 } },
        }];
      }
      return {};
    },
    masterSetup: { async needed() { return false; } },
  };
  return Promise.resolve(backend);
}
