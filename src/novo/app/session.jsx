// Sessão do app novo: quem está logado e os dados de abertura (app_bootstrap).
import React from "react";
import { getBackend } from "../data";
import { comAvisoDeCadeado } from "./plan/cadeadoEvento.js";
import { clearAuthLinkFromUrl, initialAuthLink } from "./auth/authLink.js";
import {
  EVENTO_SESSAO_DERRUBADA,
  INTERVALO_CONFERENCIA_MS,
  INTERVALO_MINIMO_MS,
  esquecerSessaoLocal,
  guardarAvisoDerrubada,
  idDaSessao,
  lerAvisoDerrubada,
  limparAvisoDerrubada,
  resumoAparelho,
} from "./sessaoUnica.js";

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

/**
 * Sessão única: pergunta ao banco se este navegador ainda é a sessão que vale (claim ao entrar/abrir, check nas conferências).
 * Devolve { vigente, regra, aparelho?, desde? } ou null quando não deu para conferir (sem rede, banco sem a migração): na
 * dúvida ninguém é derrubado.
 */
async function perguntarSessao(backend, user, fn) {
  try {
    const id = await idDaSessao(backend, user);
    if (!id) return null;
    return (await backend.rpc(fn, { p_session_id: id, p_device: resumoAparelho() })) ?? null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }) {
  // status: loading | signed-out | ready | error
  // recovery: a pessoa abriu o link de recuperar senha e ainda não criou a nova senha (a tela "Criar nova senha" vem antes do app)
  // derrubada (sessão única): a conta foi aberta em outro aparelho e este saiu; { aparelho?, desde? } para o aviso, ou null
  const recoveryRef = React.useRef(initialAuthLink.kind === "recovery");
  // dupla: o que o Treinamento em Dupla diz sobre o acesso ({ aberto, permitido, planos, equipe }), ou null se não foi possível ler
  const [state, setState] = React.useState({ status: "loading", backend: null, user: null, boot: null, dupla: null, error: null, recovery: recoveryRef.current, derrubada: null });
  // sessão única: tira este navegador da conta (só aqui) e deixa o aviso para todas as abas
  const derrubandoRef = React.useRef(false);
  const derrubar = React.useCallback(async (backend, info) => {
    if (derrubandoRef.current) return;
    derrubandoRef.current = true;
    const aviso = guardarAvisoDerrubada(info ?? {});
    esquecerSessaoLocal();
    try {
      await backend.signOut({ localOnly: true });
    } catch {
      /* mesmo sem resposta do servidor, a tela sai da conta */
    }
    recoveryRef.current = false;
    setState({ status: "signed-out", backend, user: null, boot: null, dupla: null, error: null, recovery: false, derrubada: aviso });
    derrubandoRef.current = false;
  }, []);

  React.useEffect(() => {
    let alive = true;
    let stop = () => {};

    (async () => {
      try {
        // recusa por plano (cadeado/amostra) avisa a tela com a mensagem de compra; o erro segue igual para quem chamou
        const backend = comAvisoDeCadeado(await getBackend());
        const load = async (user, event) => {
          if (!alive) return;
          if (event === "PASSWORD_RECOVERY") recoveryRef.current = true;
          if (!user) {
            recoveryRef.current = false;
            setState({ status: "signed-out", backend, user: null, boot: null, dupla: null, error: null, recovery: false, derrubada: lerAvisoDerrubada() });
            return;
          }
          try {
            // sessão única: entrar (ou abrir o app já com login) faz desta a sessão que vale; sessão já derrubada sai aqui mesmo
            const [boot, nivelamento, onboarding, sessao, dupla] = await Promise.all([
              backend.rpc("app_bootstrap"),
              backend.rpc("app_nivelamento_estado").catch(() => null),
              // onboarding (migração 013720): sem a função no banco, o app abre como antes
              backend.rpc("app_onboarding_estado").catch(() => null),
              perguntarSessao(backend, user, "app_session_claim"),
              // acesso ao Treinamento em Dupla / 2ª fase (013300): se falhar (ou a função não existir), vira null e a 2ª fase fica fechada
              Promise.resolve()
                .then(() => backend.rpc("app_dupla_access"))
                .catch(() => null),
            ]);
            if (!alive) return;
            if (sessao?.vigente === false) {
              await derrubar(backend, sessao);
              return;
            }
            limparAvisoDerrubada();
            // conta inativa (Política 3.0, seção 5): registra a abertura do app (o banco grava no máximo uma vez por hora; sem a
            // migração …13810 a chamada só falha e nada muda)
            Promise.resolve().then(() => backend.rpc("app_marcar_acesso")).catch(() => {});
            boot.nivelamento = nivelamento;
            boot.onboarding = onboarding;
            if (alive) setState({ status: "ready", backend, user, boot, dupla: dupla ?? null, error: null, recovery: recoveryRef.current, derrubada: null });
          } catch (error) {
            if (alive) setState({ status: "error", backend, user, boot: null, dupla: null, error, recovery: recoveryRef.current });
          }
        };

        // abrir o link de recuperar senha (ou o de confirmar o cadastro) não pode derrubar a sessão que o link acabou de criar
        const linkSession = initialAuthLink.kind === "recovery" || initialAuthLink.kind === "signup";
        // só este navegador esquece o login (sem encerrar o de outro aparelho)
        if (!linkSession && sessionExpiredOnBrowserClose()) {
          esquecerSessaoLocal();
          await backend.signOut({ localOnly: true });
        }
        stop = backend.onAuthChange(load);
        await load(await backend.getUser());
        // e-mail confirmado: o Supabase já leu o link; tira do endereço a marca ?confirmacao=1 que sobrou
        if (initialAuthLink.kind === "signup") clearAuthLinkFromUrl();
      } catch (error) {
        if (alive) setState((s) => ({ ...s, status: "error", error }));
      }
    })();

    return () => {
      alive = false;
      stop();
    };
  }, [derrubar]);

  // Sessão única: enquanto o app está aberto, confere se esta ainda é a sessão que vale — a cada 60 s com a aba visível, ao
  // voltar para a aba ou para a janela, no aviso do Realtime (outro aparelho entrou) e quando uma rota de IA recusar.
  const conferirRef = React.useRef(async () => true);
  const readyUserId = state.status === "ready" ? state.user?.id : null;
  React.useEffect(() => {
    const { backend, user } = state;
    if (!readyUserId || !backend || !user) {
      conferirRef.current = async () => true;
      return undefined;
    }
    let ativo = true;
    let emAndamento = null;
    let ultima = Date.now();
    const conferir = () => {
      if (emAndamento) return emAndamento;
      emAndamento = (async () => {
        ultima = Date.now();
        const sessao = await perguntarSessao(backend, user, "app_session_check");
        if (!ativo) return true;
        if (sessao?.vigente === false) {
          await derrubar(backend, sessao);
          return false;
        }
        return true;
      })().finally(() => {
        emAndamento = null;
      });
      return emAndamento;
    };
    conferirRef.current = conferir;
    const visivel = () => typeof document === "undefined" || document.visibilityState !== "hidden";
    const aoVoltar = () => {
      if (visivel() && Date.now() - ultima >= INTERVALO_MINIMO_MS) void conferir();
    };
    const timer = setInterval(() => {
      if (visivel()) void conferir();
    }, INTERVALO_CONFERENCIA_MS);
    const aoAvisoDoServidor = () => void conferir();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    window.addEventListener(EVENTO_SESSAO_DERRUBADA, aoAvisoDoServidor);
    const pararRealtime = backend.subscribeSessao ? backend.subscribeSessao(user.id, () => void conferir()) : () => {};
    return () => {
      ativo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
      window.removeEventListener(EVENTO_SESSAO_DERRUBADA, aoAvisoDoServidor);
      pararRealtime();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyUserId, state.backend, derrubar]);

  const value = React.useMemo(() => {
    const { backend } = state;
    return {
      ...state,
      /** Recarrega os dados de abertura (ex.: depois de responder questões). */
      async refresh() {
        if (!backend || !state.user) return;
        const [boot, nivelamento, onboarding] = await Promise.all([
          backend.rpc("app_bootstrap"),
          backend.rpc("app_nivelamento_estado").catch(() => null),
          backend.rpc("app_onboarding_estado").catch(() => null),
        ]);
        boot.nivelamento = nivelamento;
        boot.onboarding = onboarding;
        setState((s) => ({ ...s, boot }));
      },
      /** Troca o retrato do onboarding pelo que o banco acabou de devolver (app_onboarding_salvar / _tour / _dica_vista). */
      setOnboarding(onboarding) {
        if (onboarding) setState((s) => (s.boot ? { ...s, boot: { ...s.boot, onboarding } } : s));
      },
      async updateProfile(patch) {
        const boot = await backend.rpc("app_update_profile", { p_patch: patch });
        setState((s) => ({ ...s, boot: { ...boot, nivelamento: boot.nivelamento ?? s.boot?.nivelamento, onboarding: s.boot?.onboarding } }));
      },
      /**
       * Registra o aceite de um documento (document: "termo_uso" ou "tutor_ia"; origin: "google", "tela_aceite" ou "tutor") e
       * troca os dados de abertura pelos atualizados. `phone` (formato internacional) é opcional (as telas de aceite não pedem mais o
       * WhatsApp desde 17/10/2026). Se o servidor recusar (ex.: versão desatualizada), o erro sobe para a tela e os dados de abertura não mudam.
       * `declarations` só vai quando a versão vigente pede (Termo 2.0, boot.legal.declarations_required): aí a chamada é
       * app_accept_terms_declared, que grava a maioridade (adult) junto do aceite. Desde 17/10/2026 as telas mandam só { adult: true }
       * (a caixa única do aceite); physician vai false e o banco grava vazio (migração …13661_aceite_com_maioridade).
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
        setState((s) => ({ ...s, boot: { ...boot, nivelamento: boot.nivelamento ?? s.boot?.nivelamento, onboarding: s.boot?.onboarding } }));
      },
      async signOut() {
        esquecerSessaoLocal();
        await backend.signOut();
      },
      /**
       * Sessão única: confere agora se esta ainda é a sessão que vale (antes de uma ação importante). Devolve false quando a
       * conta foi aberta em outro aparelho — aí o app já saiu da conta e mostra o aviso.
       */
      confirmarSessao() {
        return conferirRef.current();
      },
      /** Aviso "Sua conta foi aberta em outro aparelho" → ENTRAR NOVAMENTE: some o aviso e abre o login. */
      entrarNovamente() {
        limparAvisoDerrubada();
        setState((s) => ({ ...s, derrubada: null }));
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
