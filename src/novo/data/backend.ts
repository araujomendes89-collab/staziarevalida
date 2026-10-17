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
  /** Termo 2.0 em diante: marcou "tenho 18 anos ou mais" e "sou médico(a)". Vão como "true" nos metadados; só "sim" é enviado. */
  declaresAdult?: boolean;
  declaresPhysician?: boolean;
}

export interface Backend {
  readonly mode: "supabase" | "local";
  getUser(): Promise<AuthUser | null>;
  /**
   * Avisa quando alguém entra ou sai. Devolve a função para cancelar.
   * `event` (só no Supabase) diz o motivo; "PASSWORD_RECOVERY" = a pessoa abriu o link de recuperar senha e precisa criar a nova senha.
   */
  onAuthChange(callback: (user: AuthUser | null, event?: string) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  /**
   * `extra` vai nos metadados da conta (`phone`, `terms_version`, `user_agent`), que o gatilho de criação da conta lê.
   * `needsEmailConfirmation`: a conta foi criada, mas o login depende de confirmar o e-mail.
   * `userId`: o número da conta criada (o cadastro manda logo depois a app_legal_cadastro_ip, para o aceite guardar o IP).
   */
  signUp(name: string, email: string, password: string, extra?: SignUpExtra): Promise<{ needsEmailConfirmation: boolean; userId?: string }>;
  /**
   * Manda de novo o e-mail "Confirme seu e-mail" (cadastro com a confirmação ligada no Supabase). Só existe no Supabase;
   * no banco local a conta já nasce confirmada. Pedido repetido cedo demais: BackendError "rate_limited".
   */
  readonly resendConfirmation?: (email: string) => Promise<void>;
  signInWithGoogle(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  /** Troca a senha de quem está logado. */
  updatePassword(password: string): Promise<void>;
  /**
   * Sai da conta. `localOnly` (sessão única): sai só deste navegador, sem encerrar o login dos outros aparelhos
   * (no Supabase o padrão do signOut encerra todos).
   */
  signOut(opts?: { localOnly?: boolean }): Promise<void>;
  /**
   * Sessão única: o identificador do login deste navegador (no Supabase, o session_id do token, o mesmo em todas as abas).
   * Sem ele, o app usa um identificador guardado no navegador.
   */
  readonly sessionId?: () => Promise<string | null>;
  /**
   * Sessão única em tempo real: avisa quando a linha "sessão vigente" da própria conta muda (outro aparelho entrou).
   * Só existe no Supabase (Realtime); devolve a função para cancelar.
   */
  readonly subscribeSessao?: (userId: string, onChange: () => void) => () => void;
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
  | "same_password"
  | "link_expired"
  | "invalid_email"
  | "email_not_confirmed"
  | "rate_limited"
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
  if (extra.declaresAdult === true) meta.declares_adult = "true";
  if (extra.declaresPhysician === true) meta.declares_physician = "true";
  return meta;
}

/**
 * Marca que o link do e-mail é o de confirmar o cadastro (e não o de recuperar senha): vai no endereço de volta
 * (`/novo?confirmacao=1`). Com o link vencido o Supabase não diz de que tipo ele era; é esta marca que leva à tela certa.
 */
export const CONFIRM_LINK_PARAM = "confirmacao";

/** Endereço de volta do e-mail de confirmação: o mesmo do app, com a marca acima. */
export function confirmRedirect(redirectTo: string): string {
  try {
    const url = new URL(redirectTo);
    url.searchParams.set(CONFIRM_LINK_PARAM, "1");
    return url.toString();
  } catch {
    return redirectTo;
  }
}

/**
 * Sessão única: o identificador do login (claim session_id) dentro do token do Supabase, sem conferir a assinatura (quem confere
 * é o banco, que usa o claim do token e não o que o navegador manda). Nulo se não houver.
 */
export function sessionIdFromToken(token: string | null | undefined): string | null {
  if (typeof token !== "string") return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const payload = JSON.parse(atob(b64)) as { session_id?: unknown };
    return typeof payload?.session_id === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(payload.session_id) ? payload.session_id : null;
  } catch {
    return null;
  }
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
