// Sessão do app novo: quem está logado e os dados de abertura (app_bootstrap).
import React from "react";
import { getBackend } from "../data";

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
  const [state, setState] = React.useState({ status: "loading", backend: null, user: null, boot: null, error: null });

  React.useEffect(() => {
    let alive = true;
    let stop = () => {};

    (async () => {
      try {
        const backend = await getBackend();
        const load = async (user) => {
          if (!alive) return;
          if (!user) {
            setState({ status: "signed-out", backend, user: null, boot: null, error: null });
            return;
          }
          try {
            const boot = await backend.rpc("app_bootstrap");
            if (alive) setState({ status: "ready", backend, user, boot, error: null });
          } catch (error) {
            if (alive) setState({ status: "error", backend, user, boot: null, error });
          }
        };

        if (sessionExpiredOnBrowserClose()) await backend.signOut();
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
        const boot = await backend.rpc("app_bootstrap");
        setState((s) => ({ ...s, boot }));
      },
      async updateProfile(patch) {
        const boot = await backend.rpc("app_update_profile", { p_patch: patch });
        setState((s) => ({ ...s, boot }));
      },
      /**
       * Registra o aceite de um documento (document: "termo_uso" ou "tutor_ia"; origin: "google", "tela_aceite" ou "tutor") e
       * troca os dados de abertura pelos atualizados. `phone` (formato internacional) só vai quando a tela pediu o WhatsApp.
       * Se o servidor recusar (ex.: versão desatualizada), o erro sobe para a tela e os dados de abertura não mudam.
       */
      async acceptTerms({ document, version, origin, phone }) {
        const boot = await backend.rpc("app_accept_terms", {
          p_document: document,
          p_version: version,
          p_origin: origin,
          p_phone: phone ?? null,
          p_user_agent: navigator.userAgent.slice(0, 300),
        });
        setState((s) => ({ ...s, boot }));
      },
      async signOut() {
        await backend.signOut();
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
