// Central de Notificações do aluno (migração 013830): o estado da lista e do número de não lidas, para o sino do cabeçalho e para o
// pop-up de cobrança (que avisa quando marca um aviso como visto). Só para aluno (ativo = false para equipe e revisores: nada é
// pedido ao banco e o sino não aparece).
//
// Atualização: ao abrir o app, ao voltar para a aba (no máximo uma vez a cada 20 s) e ao abrir o painel. Sem conexão em tempo real e
// sem consulta repetida no relógio.
import React from "react";
import { useSession } from "../session.jsx";

const Ctx = React.createContext(null);
const INTERVALO_MINIMO_MS = 20_000;
const ERRO = "Não foi possível carregar as notificações agora.";

export function NotificacoesProvider({ ativo, children }) {
  const { backend } = useSession();
  const [estado, setEstado] = React.useState({ itens: [], naoLidas: 0, carregando: Boolean(ativo), carregado: false, erro: null });
  const pedido = React.useRef(0);
  const ultima = React.useRef(0);

  const recarregar = React.useCallback(async () => {
    if (!ativo || !backend) return;
    const n = ++pedido.current;
    ultima.current = Date.now();
    setEstado((s) => ({ ...s, carregando: true, erro: null }));
    try {
      const r = await backend.rpc("app_minhas_notificacoes", { p_limite: 50 });
      if (n !== pedido.current) return;
      setEstado({ itens: Array.isArray(r?.itens) ? r.itens : [], naoLidas: Number(r?.nao_lidas) || 0, carregando: false, carregado: true, erro: null });
    } catch {
      if (n !== pedido.current) return;
      setEstado((s) => ({ ...s, carregando: false, erro: ERRO }));
    }
  }, [ativo, backend]);

  React.useEffect(() => {
    recarregar();
  }, [recarregar]);

  React.useEffect(() => {
    if (!ativo) return undefined;
    const voltou = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - ultima.current < INTERVALO_MINIMO_MS) return;
      recarregar();
    };
    document.addEventListener("visibilitychange", voltou);
    return () => document.removeEventListener("visibilitychange", voltou);
  }, [ativo, recarregar]);

  /** Marca como lidas (ids) ou todas (sem ids). Já some da contagem na hora; se o banco recusar, a lista é pedida de novo. */
  const marcarLidas = React.useCallback(
    async (ids) => {
      if (!ativo || !backend) return;
      const alvo = ids ? new Set(ids) : null;
      setEstado((s) => {
        const itens = s.itens.map((i) => (!i.lida && (!alvo || alvo.has(i.id)) ? { ...i, lida: true } : i));
        const mudou = s.itens.filter((i) => !i.lida && (!alvo || alvo.has(i.id))).length;
        return { ...s, itens, naoLidas: alvo ? Math.max(0, s.naoLidas - mudou) : 0 };
      });
      try {
        await backend.rpc("app_notificacoes_lidas", { p_ids: ids ? [...ids] : null });
      } catch {
        recarregar();
      }
    },
    [ativo, backend, recarregar]
  );

  const valor = React.useMemo(() => (ativo ? { ...estado, recarregar, marcarLidas } : null), [ativo, estado, recarregar, marcarLidas]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** null fora do provedor ou para quem não é aluno. */
export function useNotificacoes() {
  return React.useContext(Ctx);
}

/** Para testes e prévias: entrega um estado pronto, sem banco. */
export function NotificacoesFixas({ valor, children }) {
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
