/**
 * Backend de desenvolvimento: fala com o banco local do servidor (/api/dev-db), que é o mesmo
 * usado pelo painel e pelo processamento da Central de Conteúdo. A sessão é um token guardado
 * neste navegador. Nunca é usado em produção (ver ./index.ts).
 */
import { BackendError, type AuthUser, type Backend, type BackendErrorCode, assertRpcCall } from "./backend";

const TOKEN_KEY = "smn-dev-token";

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const writeToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sem armazenamento: a sessão dura só esta aba */
  }
};

export function createDevServerBackend(base = "/api/dev-db"): Backend {
  let token = readToken();
  let current: AuthUser | null = null;
  let checked = false;
  const listeners = new Set<(user: AuthUser | null) => void>();
  const setSession = (user: AuthUser | null, newToken: string | null) => {
    current = user;
    token = newToken;
    checked = true;
    writeToken(newToken);
    listeners.forEach((cb) => cb(user));
  };

  async function call<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
    let res: globalThis.Response;
    try {
      res = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new BackendError("network", "Servidor de desenvolvimento indisponível.");
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new BackendError((json?.error?.code as BackendErrorCode) ?? "unknown", json?.error?.message ?? `Erro ${res.status}`);
    return json as T;
  }

  return {
    mode: "local",
    async getUser() {
      if (!checked) {
        checked = true;
        current = token ? (await call<{ user: AuthUser | null }>("/auth/me")).user : null;
        if (!current) writeToken((token = null));
      }
      return current;
    },
    onAuthChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async signIn(email, password) {
      const r = await call<{ user: AuthUser; token: string }>("/auth/signin", { email, password });
      setSession(r.user, r.token);
    },
    async signUp(name, email, password) {
      const r = await call<{ user: AuthUser; token: string }>("/auth/signup", { name, email, password });
      setSession(r.user, r.token);
      return { needsEmailConfirmation: false };
    },
    masterSetup: {
      async needed() {
        return (await call<{ needed: boolean }>("/auth/master-needed")).needed;
      },
      async create(name, email, password) {
        const r = await call<{ user: AuthUser; token: string }>("/auth/master", { name, email, password });
        setSession(r.user, r.token);
      },
    },
    async signInWithGoogle() {
      throw new BackendError("google_unavailable", "O login com Google só funciona com o Supabase configurado.");
    },
    async resetPassword() {
      // Sem envio de e-mail no ambiente de desenvolvimento.
    },
    async updatePassword(password) {
      await call("/auth/password", { password });
    },
    async signOut() {
      if (token) await call("/auth/signout", {}).catch(() => {});
      setSession(null, null);
    },
    async rpc<T>(fn: string, args: Record<string, unknown> = {}) {
      assertRpcCall(fn, args);
      return (await call<{ data: T }>("/rpc", { fn, args })).data;
    },
  };
}

/** Token da sessão de desenvolvimento, para chamadas fora do rpc (ex.: envio de arquivo). */
export const devSessionToken = () => readToken();
