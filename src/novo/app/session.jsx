// Sessão do app novo: quem está logado e os dados de abertura (app_bootstrap).
import React from "react";
import { getBackend } from "../data";
import { clearAuthLinkFromUrl, initialAuthLink } from "./auth/authLink.js";

const SessionContext = React.createContext(null);

// "Lembrar de mim" desmarcado: a sessão vale só enquanto o navegador estiver aberto.
const SESSION_ONLY_KEY = "smn-session-only";
const ALIVE_KEY = "smn-alive";

export function rememberChoice(remember) {
  try {
    if (remember) {
      localStorage.removeItem(SESSION_ONLY_KEY);
    } else {
      localStorage.setItem(SESSION_ONLY_KEY, "1");
      sessionStorage.setItem(ALIVE_KEY, "1");
    }
  } catch {
    /* armazenamento indisponível: mantém o padrão do backend */
  }
}

function sessionExpiredOnBrowserClose() {
  try {
    return localStorage.getItem(SESSION_ONLY_KEY) === "1" && sessionStorage.getItem(ALIVE_KEY) !== "1";
  } catch {
    return false;
  }
}

export function SessionProvider({ children }) {
  // status: loading | signed-out | ready | error
  // recovery: a pessoa abriu o link de recuperar senha e ainda não criou a nova senha (a tela "Criar nova senha" vem antes do app)
  const recoveryRef = React.useRef(initialAuthLink.kind === "recovery");
  // dupla: o que o Treinamento em Dupla diz sobre o acesso ({ aberto, permitido, planos, equipe }), ou null se não foi possível ler
  const [state, setState] = React.useState({ status: "loading", backend: null, user: null, boot: null, dupla: null, error: null, recovery: recoveryRef.current });

  React.useEffect(() => {
    let alive = true;
    let stop = () => {};

    (async () => {
      try {
        const backend = await getBackend();
        const load = async (user, event) => {
          if (!alive) return;
          if (event === "PASSWORD_RECOVERY") recoveryRef.current = true;
          if (!user) {
            recoveryRef.current = false;
            setState({ status: "signed-out", backend, user: null, boot: null, dupla: null, error: null, recovery: false });
            return;
          }
          try {
            // Os dados de abertura vêm primeiro; o nivelamento e o acesso ao Treinamento em Dupla são lidos junto e, se falharem (ou não
            // responderem), viram null: o módulo fica fechado, mas o app abre do mesmo jeito.
            const [boot, nivelamento, dupla] = await Promise.all([
              backend.rpc("app_bootstrap"),
              Promise.resolve()
                .then(() => backend.rpc("app_nivelamento_estado"))
                .catch(() => null),
              Promise.resolve()
                .then(() => backend.rpc("app_dupla_access"))
                .catch(() => null),
            ]);
            boot.nivelamento = nivelamento;
            if (alive) setState({ status: "ready", backend, user, boot, dupla: dupla ?? null, error: null, recovery: recoveryRef.current });
          } catch (error) {
            if (alive) setState({ status: "error", backend, user, boot: null, dupla: null, error, recovery: recoveryRef.current });
          }
        };

        // abrir o link de recuperar senha não pode derrubar a sessão que o link acabou de criar
        if (initialAuthLink.kind !== "recovery" && sessionExpiredOnBrowserClose()) await backend.signOut();
        stop = backend.onAuthChange(load);
        await load(await backend.getUser());
      } catch (error) {
        if (alive) setState((s) => ({ ...s, status: "error", error }));
      }
    })();

    return () => {
      alive = false;
      stop();
    };
  }, []);

  const value = React.useMemo(() => {
    const { backend } = state;
    return {
      ...state,
      /** Recarrega os dados de abertura (ex.: depois de responder questões). */
      async refresh() {
        if (!backend || !state.user) return;
        const [boot, nivelamento] = await Promise.all([
          backend.rpc("app_bootstrap"),
          backend.rpc("app_nivelamento_estado").catch(() => null)
        ]);
        boot.nivelamento = nivelamento;
        setState((s) => ({ ...s, boot }));
      },
      async updateProfile(patch) {
        const boot = await backend.rpc("app_update_profile", { p_patch: patch });
        setState((s) => ({ ...s, boot: { ...boot, nivelamento: boot.nivelamento ?? s.boot?.nivelamento } }));
      },
      /**
       * Registra o aceite de um documento (document: "termo_uso" ou "tutor_ia"; origin: "google", "tela_aceite" ou "tutor") e
       * troca os dados de abertura pelos atualizados. `phone` (formato internacional) só vai quando a tela pediu o WhatsApp.
       * Se o servidor recusar (ex.: versão desatualizada), o erro sobe para a tela e os dados de abertura não mudam.
       * `declarations` ({ adult, physician }) só vai quando a versão vigente pede (Termo 2.0, boot.legal.declarations_required):
       * aí a chamada é app_accept_terms_declared, que grava as declarações junto do aceite.
       */
      async acceptTerms({ document, version, origin, phone, declarations }) {
        const args = {
          p_document: document,
          p_version: version,
          p_origin: origin,
          p_phone: phone ?? null,
          p_user_agent: navigator.userAgent.slice(0, 300),
        };
        const boot = declarations
          ? await backend.rpc("app_accept_terms_declared", { ...args, p_adult: declarations.adult === true, p_physician: declarations.physician === true })
          : await backend.rpc("app_accept_terms", args);
        setState((s) => ({ ...s, boot: { ...boot, nivelamento: boot.nivelamento ?? s.boot?.nivelamento } }));
      },
      async signOut() {
        await backend.signOut();
      },
      /** A nova senha foi criada (ou a pessoa desistiu): a tela "Criar nova senha" sai e o app abre. */
      finishRecovery() {
        recoveryRef.current = false;
        clearAuthLinkFromUrl();
        setState((s) => ({ ...s, recovery: false }));
      },
    };
  }, [state]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession precisa estar dentro de <SessionProvider>.");
  return ctx;
}

/** Igual a useSession, mas devolve null fora do <SessionProvider> (a casca nova e as prévias usam para buscar dados só quando há sessão). */
export function useOptionalSession() {
  return React.useContext(SessionContext);
}
