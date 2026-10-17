// Aviso de cadeado (planos etapa 4), sem React: o backend embrulhado avisa a tela quando o banco recusa por plano (dica
// "cadeado:<recurso>" / "amostra:<recurso>"). O erro segue igual para quem chamou. Usado pela sessão (session.jsx) e pelas telas.
import { lockHintOf } from "../../data/backend";

export const EVENTO_CADEADO = "staziamed:cadeado";
export const EVENTO_AMOSTRA = "staziamed:amostra-mudou";

/** Avisa a tela que o banco recusou por plano (não muda o erro). */
export function avisarCadeado(error) {
  const dica = lockHintOf(error);
  if (!dica || typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent(EVENTO_CADEADO, { detail: { ...dica, mensagem: String(error?.message ?? "") } }));
  return true;
}

/** O mesmo backend, mas cada rpc recusada por plano dispara o aviso. Os outros métodos ficam iguais. */
export function comAvisoDeCadeado(backend) {
  if (!backend || typeof backend.rpc !== "function" || backend.__comCadeado) return backend;
  const rpc = backend.rpc.bind(backend);
  const embrulhado = async (fn, args) => {
    try {
      const r = await rpc(fn, args);
      // uma resposta, flashcard revisado ou simulado aberto mudam o que sobra da amostra
      if (/^app_(answer|review_flashcard|start_|submit)/.test(fn) && typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_AMOSTRA));
      return r;
    } catch (e) {
      avisarCadeado(e);
      throw e;
    }
  };
  return new Proxy(backend, {
    get(target, key) {
      if (key === "rpc") return embrulhado;
      if (key === "__comCadeado") return true;
      const v = Reflect.get(target, key);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

