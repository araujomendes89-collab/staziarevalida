/**
 * Acesso a dados do app novo. As telas só conhecem esta interface; por trás há:
 *  - Supabase (produção), quando VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY existem;
 *  - banco local no navegador (só em desenvolvimento), com o mesmo esquema e a mesma carga.
 *
 * Toda leitura e escrita de dados passa por funções do banco (`rpc`), definidas em
 * supabase/migrations/*_app_api.sql — as regras ficam num lugar só e valem nos dois modos.
 */

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface Backend {
  readonly mode: "supabase" | "local";
  getUser(): Promise<AuthUser | null>;
  /** Avisa quando alguém entra ou sai. Devolve a função para cancelar. */
  onAuthChange(callback: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  /** `needsEmailConfirmation`: a conta foi criada, mas o login depende de confirmar o e-mail. */
  signUp(name: string, email: string, password: string): Promise<{ needsEmailConfirmation: boolean }>;
  signInWithGoogle(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  /** Troca a senha de quem está logado. */
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Chama uma função `app_*` do banco. */
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
  /**
   * Token da sessão para as rotas do servidor (/api/content-hub): envio de PDF, arquivos.
   * Só existe quando há servidor; no banco local do navegador não há.
   */
  readonly accessToken?: () => Promise<string | null>;
  /**
   * Só no banco local: criar o primeiro administrador (conta master) pela tela de entrada,
   * enquanto não existir nenhum. No Supabase o primeiro admin é definido no painel
   * (ver supabase/README.md), nunca pelo navegador.
   */
  readonly masterSetup?: {
    needed(): Promise<boolean>;
    create(name: string, email: string, password: string): Promise<void>;
  };
}

export type BackendErrorCode =
  | "invalid_credentials"
  | "email_taken"
  | "weak_password"
  | "invalid_email"
  | "google_unavailable"
  | "network"
  | "unknown";

export class BackendError extends Error {
  constructor(
    public readonly code: BackendErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BackendError";
  }
}

export const PASSWORD_MIN_LENGTH = 8;

const RPC_NAME = /^app_[a-z0-9_]+$/;
const ARG_NAME = /^p_[a-z0-9_]+$/;

/** Só funções `app_*` com argumentos `p_*` podem ser chamadas pelo app. */
export function assertRpcCall(fn: string, args: Record<string, unknown>): void {
  if (!RPC_NAME.test(fn)) throw new Error(`Função não permitida: ${fn}`);
  for (const key of Object.keys(args)) {
    if (!ARG_NAME.test(key)) throw new Error(`Argumento inválido em ${fn}: ${key}`);
  }
}
