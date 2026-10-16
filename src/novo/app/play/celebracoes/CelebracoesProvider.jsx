// Comemorações do Stazi no app (sistema de celebrações do Motion Studio, src/motion-studio/celebracoes).
// Um só ponto de entrada para as telas: elas entregam o que o banco devolveu (bloco `play`, simulado, aula, liga) e este
// provedor decide QUANDO mostrar, seguindo as regras da Stazia Arena (skill stazia-gamification-engine, telas-e-celebracoes):
//   - não interrompe questão em andamento: durante um treino/simulado (segurar) só passa a faixa pequena do acerto/erro;
//     o resto espera o fim da atividade e aparece junto (o mais importante inteiro, os outros pequenos);
//   - a mesma medalha, nível, dia de sequência ou semana de liga nunca volta como se fosse nova (chave guardada);
//   - promoção de liga só depois do fechamento confirmado pelo banco (histórico de temporadas FECHADAS);
//   - comemorações importantes ficam no histórico (Conta → Comemorações e sons);
//   - preferências do aluno: sons, voz da Durona (padrão: ligada), animações reduzidas; o movimento reduzido do sistema vale sempre.
// A parte pesada (catálogo, cenários, Stazi, sons) só é baixada na primeira comemoração (React.lazy).
import React from "react";
import { useSession } from "../../session.jsx";
import { IMEDIATOS, completarComResumo, eventosDaLiga, eventosDaResposta, juntarLote, precisaResumo } from "./eventos.js";
import { atualizarRotulos, esquecerTudo, gravarPreferencias, lerHistorico, lerPreferencias, lerVistos, ligaConsultadaHaPouco, marcarLigaConsultada, marcarVistos, registrarHistorico } from "./memoria.js";

const Motor = React.lazy(() => import("./CelebracoesMotor.jsx"));

/** Espera antes de consultar o fechamento da liga ao abrir o app (deixa a tela inicial carregar primeiro). */
export const ATRASO_LIGA_MS = 4000;
/** "Próxima entrada adequada" para o resultado da liga: início e telas da Arena (nunca no meio de uma aula ou questão). */
export const ROTAS_LIGA = /^\/?(home2?|classificacao|missoes|conquistas|trilha)?\/?$/;
/** Prazo para ler o resumo (nome do nível, maior sequência); passou disso, a comemoração sai sem esses textos. */
const PRAZO_RESUMO_MS = 2500;

export const diaLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function comPrazo(promessa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("prazo")), ms);
    Promise.resolve(promessa).then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e))
    );
  });
}

/** Se o pacote das comemorações não carregar (sem internet, por exemplo), o app segue normal, só sem a comemoração. */
class Protecao extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erro: false };
  }
  static getDerivedStateFromError() {
    return { erro: true };
  }
  componentDidCatch() {}
  render() {
    return this.state.erro ? null : this.props.children;
  }
}

const Ctx = React.createContext(null);
const NADA = () => [];
const API_VAZIA = Object.freeze({
  ativo: false,
  enviar: NADA,
  enviarResposta: NADA,
  segurar: () => () => {},
  verificarLiga: async () => [],
  preferencias: lerPreferencias(),
  mudarPreferencias: () => {},
  recarregarPreferencias: () => {},
  historico: [],
  reiniciar: () => {},
});

/** Comemorações do app. Fora do provedor (testes antigos, telas isoladas) devolve uma versão que não faz nada. */
export function useCelebracoesApp() {
  return React.useContext(Ctx) ?? API_VAZIA;
}

/**
 * Segura as comemorações enquanto a atividade está aberta (treino/simulado em andamento) e solta tudo no fim.
 * `tipo` "simulado": nem a faixa pequena aparece (o simulado não mostra correção questão a questão).
 */
export function useSegurarCelebracoes(id, tipo = "atividade", ativo = true) {
  const { segurar } = useCelebracoesApp();
  React.useEffect(() => (ativo && id ? segurar(id, tipo) : undefined), [segurar, id, tipo, ativo]);
}

export function CelebracoesProvider({ children, rota = "/", ligaAoAbrir = true }) {
  const { backend, boot, user } = useSession();
  const uid = user?.id ?? null;
  const ligado = boot?.play?.enabled === true;
  const ligasLigadas = ligado && boot?.play?.flags?.leagues !== false;
  const [preferencias, setPreferencias] = React.useState(lerPreferencias);
  const [historico, setHistorico] = React.useState(() => lerHistorico(uid));
  const [lotes, setLotes] = React.useState([]);
  const [motorLigado, setMotorLigado] = React.useState(false);
  const [geracao, setGeracao] = React.useState(0);
  const [contexto, setContexto] = React.useState("normal");
  const segurando = React.useRef(new Map());
  const pendentes = React.useRef([]);
  const seq = React.useRef(0);
  const vivo = React.useRef({ backend, uid, ligado });
  vivo.current = { backend, uid, ligado };

  React.useEffect(() => setHistorico(lerHistorico(uid)), [uid]);

  const entregar = React.useCallback((eventos) => {
    if (!eventos?.length || !vivo.current.ligado) return;
    setHistorico(atualizarRotulos(vivo.current.uid, eventos)); // ex.: "Novo nível" vira "Novo nível: Explorador"
    setMotorLigado(true);
    setLotes((l) => [...l, { seq: ++seq.current, eventos }]);
  }, []);

  /** Nome do nível e maior sequência vêm do resumo do banco (lido depois da resposta; nunca recalculado aqui). */
  const preparar = React.useCallback(async (lote) => {
    if (!precisaResumo(lote) || !vivo.current.backend?.rpc) return lote;
    const resumo = await comPrazo(vivo.current.backend.rpc("app_gamification_summary"), PRAZO_RESUMO_MS).catch(() => null);
    return completarComResumo(lote, resumo);
  }, []);

  const soltar = React.useCallback(() => {
    const lote = juntarLote(pendentes.current.splice(0));
    if (lote.length) void preparar(lote).then(entregar);
  }, [entregar, preparar]);

  const enviar = React.useCallback(
    (entrada) => {
      if (!vivo.current.ligado) return [];
      const lista = (Array.isArray(entrada) ? entrada : [entrada]).filter((e) => e && e.id);
      const vistos = lerVistos(vivo.current.uid);
      const aceitos = [];
      for (const e of lista) {
        if (e.chave && (vistos.has(e.chave) || aceitos.some((a) => a.chave === e.chave))) continue; // já comemorado: não repete
        aceitos.push(e);
      }
      if (!aceitos.length) return [];
      marcarVistos(vivo.current.uid, aceitos.map((e) => e.chave));
      // o importante entra no histórico já ao chegar (mesmo que a sessão feche antes do fim ou o limite do dia o encolha)
      if (aceitos.some((e) => e.importante)) setHistorico(registrarHistorico(vivo.current.uid, aceitos));
      const emSimulado = [...segurando.current.values()].includes("simulado");
      const agora = emSimulado ? [] : aceitos.filter((e) => IMEDIATOS.has(e.id));
      const depois = aceitos.filter((e) => !IMEDIATOS.has(e.id));
      if (agora.length) entregar(agora);
      if (depois.length) {
        if (segurando.current.size > 0) pendentes.current.push(...depois);
        else void preparar(juntarLote(depois)).then(entregar);
      }
      return aceitos;
    },
    [entregar, preparar]
  );

  const enviarResposta = React.useCallback((play, opcoes = {}) => enviar(eventosDaResposta(play, { ...opcoes, hoje: diaLocal() })), [enviar]);

  const segurar = React.useCallback(
    (id, tipo = "atividade") => {
      const recalcular = () => setContexto([...segurando.current.values()].includes("simulado") ? "simulado" : "normal");
      segurando.current.set(id, tipo);
      recalcular();
      return () => {
        segurando.current.delete(id);
        recalcular();
        if (segurando.current.size === 0) soltar();
      };
    },
    [soltar]
  );

  /** Fechamento semanal da liga: no máximo uma consulta a cada 3 horas por aparelho; só temporadas já fechadas pelo banco. */
  const verificarLiga = React.useCallback(
    async ({ forcar = false } = {}) => {
      const { backend: b, uid: u, ligado: on } = vivo.current;
      if (!on || !b?.rpc || !u) return [];
      if (!forcar && ligaConsultadaHaPouco(u)) return [];
      marcarLigaConsultada(u);
      try {
        return enviar(eventosDaLiga(await b.rpc("app_league_current"), { hoje: diaLocal() }));
      } catch {
        return [];
      }
    },
    [enviar]
  );
  const naEntrada = ROTAS_LIGA.test(rota ?? "");
  React.useEffect(() => {
    if (!ligaAoAbrir || !ligasLigadas || !uid || !naEntrada) return undefined;
    const t = setTimeout(() => void verificarLiga(), ATRASO_LIGA_MS);
    return () => clearTimeout(t);
  }, [ligaAoAbrir, ligasLigadas, uid, naEntrada, verificarLiga]);

  const mudarPreferencias = React.useCallback((patch) => {
    setPreferencias((p) => {
      const n = { ...p, ...patch };
      gravarPreferencias(n);
      return n;
    });
  }, []);
  const recarregarPreferencias = React.useCallback(() => setPreferencias(lerPreferencias()), []);
  const consumir = React.useCallback((ate) => setLotes((l) => l.filter((x) => x.seq > ate)), []);
  /** Prévia e testes: esquece limites do dia e o que já foi comemorado (o histórico pode ficar). */
  const reiniciar = React.useCallback(({ manterHistorico = false } = {}) => {
    esquecerTudo(vivo.current.uid, { manterHistorico });
    pendentes.current = [];
    setLotes([]);
    if (!manterHistorico) setHistorico([]);
    setGeracao((g) => g + 1);
  }, []);

  const api = React.useMemo(
    () => ({ ativo: ligado, enviar, enviarResposta, segurar, verificarLiga, preferencias, mudarPreferencias, recarregarPreferencias, historico, reiniciar }),
    [ligado, enviar, enviarResposta, segurar, verificarLiga, preferencias, mudarPreferencias, recarregarPreferencias, historico, reiniciar]
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {motorLigado && ligado && (
        <Protecao>
          <React.Suspense fallback={null}>
            <Motor key={geracao} lotes={lotes} onConsumir={consumir} contexto={contexto} preferencias={preferencias} uid={uid} />
          </React.Suspense>
        </Protecao>
      )}
    </Ctx.Provider>
  );
}
