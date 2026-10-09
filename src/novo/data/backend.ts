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

/** Dados do cadastro com e-mail além de nome, e-mail e senha (Termo de Aceite e Uso, spec seções 5 e 9). Todos opcionais. */
export interface SignUpExtra {
  /** WhatsApp no formato internacional (ex.: +5541999998888). */
  phone?: string;
  /** Versão do termo marcada na tela; o gatilho de criação da conta só grava o aceite se for a vigente. */
  termsVersion?: string;
  /** Navegador da pessoa, guardado junto do aceite (até 300 caracteres). */
  userAgent?: string;
}

export interface Backend {
  readonly mode: "supabase" | "local";
  getUser(): Promise<AuthUser | null>;
  /** Avisa quando alguém entra ou sai. Devolve a função para cancelar. */
  onAuthChange(callback: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  /**
   * `extra` vai nos metadados da conta (`phone`, `terms_version`, `user_agent`), que o gatilho de criação da conta lê.
   * `needsEmailConfirmation`: a conta foi criada, mas o login depende de confirmar o e-mail.
   */
  signUp(name: string, email: string, password: string, extra?: SignUpExtra): Promise<{ needsEmailConfirmation: boolean }>;
  signInWithGoogle(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  /** Troca a senha de quem está logado. */
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Chama uma função `app_*` do banco. */
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
  /**
   * Stazia Play em tempo real: avisa quando a linha de estatísticas do próprio aluno muda
   * (XP, posição, sequência). Só existe no Supabase (Realtime); devolve a função para cancelar.
   */
  readonly subscribeStats?: (userId: string, onChange: () => void) => () => void;
  /**
   * Envio direto de um arquivo ao depósito do Supabase com o token de envio assinado que o servidor gerou
   * (aulas: slides e áudios). Com onProgress (0 a 100) o envio é por XMLHttpRequest, para mostrar a porcentagem. Só existe no Supabase; no banco local o arquivo passa pelo servidor.
   */
  readonly uploadToSignedUrl?: (bucket: string, path: string, token: string, file: Blob, contentType: string, onProgress?: (pct: number) => void) => Promise<void>;
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

const USER_AGENT_MAX = 300;

/**
 * Metadados que o cadastro leva na conta (auth.users.raw_user_meta_data, lidos pelo gatilho handle_new_user), além do nome:
 * só o que veio preenchido, com o navegador cortado em 300 caracteres. Um lugar só para o Supabase, o servidor de
 * desenvolvimento e o banco local.
 */
export function signUpMetadata(extra: SignUpExtra = {}): Record<string, string> {
  const meta: Record<string, string> = {};
  if (extra.phone) meta.phone = extra.phone;
  if (extra.termsVersion) meta.terms_version = extra.termsVersion;
  if (extra.userAgent) meta.user_agent = extra.userAgent.slice(0, USER_AGENT_MAX);
  return meta;
}

const RPC_NAME = /^app_[a-z0-9_]+$/;
const ARG_NAME = /^p_[a-z0-9_]+$/;

/** Só funções `app_*` com argumentos `p_*` podem ser chamadas pelo app. */
export function assertRpcCall(fn: string, args: Record<string, unknown>): void {
  if (!RPC_NAME.test(fn)) throw new Error(`Função não permitida: ${fn}`);
  for (const key of Object.keys(args)) {
    if (!ARG_NAME.test(key)) throw new Error(`Argumento inválido em ${fn}: ${key}`);
  }
}
