// Números reais dos selos da casca (menu, trilho do tablet, barra de baixo e "Mais"), como no pacote "Novas telas":
//   Plano de Hoje "0/2"  -> app_today (feitas/total)
//   Missões "0/3"         -> app_gamification_summary.missions (só com a Stazia Arena ligada: boot.play.enabled)
//   Caderno de Erros "5"  -> app_home.wrong_pending (questões erradas "para revisar" no caderno de erros, my_error_notebook)
//   Stazia Score e nível  -> app_gamification_summary (só com a Arena ligada)
// Nada de exemplo: o que o banco não devolver fica sem selo. As respostas valem 60 s (trocar de tela não pergunta de novo ao banco).
import React from "react";
import * as sessionModule from "../session.jsx";

// Sessão quando houver (fora do <SessionProvider>, ou em testes que simulam session.jsx sem useOptionalSession, não há selos nem perguntas ao banco).
const noSession = () => null;
let useSessionIfAny = noSession;
try {
  if (typeof sessionModule.useOptionalSession === "function") useSessionIfAny = sessionModule.useOptionalSession;
} catch (e) {
  /* módulo simulado sem useOptionalSession */
}

const TTL = 60000;
const caches = new WeakMap(); // backend -> { at, key, data } (um por sessão)

/** Converte as respostas do banco nos números dos selos (sem resposta: null). */
export function countsFrom({ today, summary, home } = {}) {
  const sumOn = summary && summary.enabled !== false;
  return {
    planDone: today?.total ? Number(today.done) || 0 : null,
    planTotal: today?.total ? Number(today.total) : null,
    missionsDone: sumOn && summary.missions?.total ? Number(summary.missions.done) || 0 : null,
    missionsTotal: sumOn && summary.missions?.total ? Number(summary.missions.total) : null,
    wrongPending: home && Number.isFinite(Number(home.wrong_pending)) ? Number(home.wrong_pending) : null,
    score: sumOn && Number.isFinite(Number(summary.score)) ? Number(summary.score) : null,
    level: sumOn ? (summary.level?.name ?? null) : null,
    scoreName: sumOn ? (summary.names?.score ?? null) : null,
  };
}

/** Esquece as respostas guardadas (ex.: depois de responder questões). */
export function forgetShellCounts(backend) {
  if (backend) caches.delete(backend);
}

export function useShellCounts(route) {
  const session = useSessionIfAny();
  const backend = session?.backend;
  const play = session?.boot?.play?.enabled !== false;
  const key = `${play ? 1 : 0}`;
  const [data, setData] = React.useState(() => {
    const c = backend && caches.get(backend);
    return c && c.key === key ? c.data : countsFrom();
  });
  React.useEffect(() => {
    if (!backend || typeof backend.rpc !== "function") return undefined;
    const cache = caches.get(backend);
    if (cache && cache.key === key && Date.now() - cache.at < TTL) {
      setData(cache.data);
      return undefined;
    }
    let alive = true;
    const ask = (fn) => Promise.resolve().then(() => backend.rpc(fn));
    Promise.allSettled([ask("app_today"), play ? ask("app_gamification_summary") : Promise.resolve(null), ask("app_home")]).then(([t, s, h]) => {
      const value = (r) => (r.status === "fulfilled" ? r.value : null);
      const next = countsFrom({ today: value(t), summary: value(s), home: value(h) });
      caches.set(backend, { at: Date.now(), key, data: next });
      if (alive) setData(next);
    });
    return () => {
      alive = false;
    };
  }, [backend, key, play, route]);
  return data;
}
