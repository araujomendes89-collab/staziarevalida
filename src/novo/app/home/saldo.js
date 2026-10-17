// Início do aluno · o SALDO de IA ao lado da sequência ("0 dias"): o modelo do chip e a leitura do estado.
// Fonte única: app_my_entitlements().saldo (migração …013640), que só devolve o saldo do PRÓPRIO aluno.
//   * modo sombra (cadeados desligados): mostra o que vale DE VERDADE hoje, pela regra antiga do Tutor (mensagens do dia e segundos
//     de voz de tutor_entitlement). Assim o chip nunca mostra um número que ainda não se aplica;
//   * cadeados ligados: mostra os créditos de IA (1 crédito = R$ 0,10 de custo de IA) e os minutos de voz da regra nova;
//   * equipe ou revisor: "IA ilimitada";
//   * Tutor desligado, resposta ilegível ou função ainda não publicada: o chip não aparece.
// A tela nunca desconta nem soma: o número vem sempre do servidor. Ela se relê ao voltar o foco (ideia aproveitada do bloco
// "Créditos de hoje" do ramo stazia-match, que um dia deve passar a ler este mesmo saldo, para existir UM saldo só).
import React from "react";
import * as sessionModule from "../session.jsx";

const noSession = () => null;
let useSessionIfAny = noSession;
try {
  if (typeof sessionModule.useOptionalSession === "function") useSessionIfAny = sessionModule.useOptionalSession;
} catch (e) {
  /* módulo simulado sem useOptionalSession */
}

const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
const inteiro = (v) => (Number.isFinite(num(v)) ? Math.max(0, Math.trunc(num(v))) : null);
const minutos = (s) => (s == null ? null : Math.floor(s / 60));

/**
 * O chip: null (não aparece) ou { ilimitado, ia, iaRotulo, voz, aria, detalhe, esgotado }.
 * ia = número restante (mensagens hoje no modo sombra; créditos hoje com a chave ligada); voz = minutos restantes (ou null).
 */
export function modeloSaldo(saldo) {
  if (!saldo || typeof saldo !== "object") return null;
  if (saldo.ilimitado === true) {
    return { ilimitado: true, ia: null, voz: null, aria: "IA ilimitada para a equipe. Abrir planos.", detalhe: "A equipe e os revisores não gastam créditos." };
  }
  if (saldo.fonte === "tutor_atual") {
    if (saldo.tutor_ligado !== true) return null;
    const ia = inteiro(saldo.mensagens_hoje);
    if (ia == null) return null;
    const voz = saldo.voz_ligada === true ? minutos(inteiro(saldo.voz_restante_s)) : null;
    const quando = saldo.voz_periodo === "teste_total" ? "no teste" : "hoje";
    const partes = [`${ia} ${ia === 1 ? "mensagem" : "mensagens"} do Tutor hoje`];
    if (voz != null) partes.push(`${voz} min de voz ao vivo ${quando}`);
    return {
      ilimitado: false, ia, iaRotulo: ia === 1 ? "mensagem" : "mensagens", voz,
      aria: `Seu saldo: ${partes.join(" e ")}. Abrir planos.`,
      detalhe: partes.join(" · "),
      esgotado: ia === 0 && (voz == null || voz === 0),
    };
  }
  if (saldo.fonte === "creditos") {
    const ia = inteiro(saldo.creditos_hoje);
    if (ia == null) return null;
    const voz = minutos(inteiro(saldo.voz_restante_s));
    const quando = saldo.voz_periodo === "mes" ? "no mês" : saldo.voz_periodo === "teste_total" ? "no teste" : "";
    const partes = [`${ia} ${ia === 1 ? "crédito" : "créditos"} de IA hoje`];
    if (saldo.creditos_mes != null && inteiro(saldo.creditos_mes) != null) partes.push(`${inteiro(saldo.creditos_mes)} no mês`);
    if (voz != null && (inteiro(saldo.voz_limite_s) ?? 0) > 0) partes.push(`${voz} min de voz ao vivo ${quando}`.trim());
    return {
      ilimitado: false, ia, iaRotulo: ia === 1 ? "crédito" : "créditos", voz: (inteiro(saldo.voz_limite_s) ?? 0) > 0 ? voz : null,
      aria: `Seu saldo: ${partes.join(", ")}. Abrir planos.`,
      detalhe: partes.join(" · "),
      esgotado: ia === 0,
    };
  }
  return null;
}

/** Lê o saldo ao montar e ao voltar o foco. Sem sessão, sem função ou com erro: null (o chip não aparece). */
export function useSaldo() {
  const session = useSessionIfAny();
  const backend = session?.backend;
  const [saldo, setSaldo] = React.useState(null);
  const seq = React.useRef(0);
  const reload = React.useCallback(async () => {
    if (!backend || typeof backend.rpc !== "function") return;
    const meu = ++seq.current;
    try {
      const r = await backend.rpc("app_my_entitlements");
      if (meu === seq.current) setSaldo(r?.saldo ?? null);
    } catch {
      if (meu === seq.current) setSaldo(null);
    }
  }, [backend]);
  React.useEffect(() => {
    void reload();
    const aoVoltar = () => {
      if (document.visibilityState !== "hidden") void reload();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      seq.current += 1;
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [reload]);
  return saldo;
}
