// Início do aluno · "Créditos de hoje": o modelo da tela e a leitura do estado.
// Fonte única: app_credit_state('match') e app_credit_state('ia') (013500/013540), que só devolvem o saldo do PRÓPRIO aluno.
// O número vem sempre do servidor; a tela nunca desconta nem soma por conta própria. Ela se relê quando a janela volta ao foco e
// quando passa o instante `renova_em` (meia-noite de Brasília), sem o aluno recarregar a página.
import React from "react";

// ---------------------------------------------------------------- textos (aprovação do dono pendente)
export const TITULO = "Créditos de hoje";
export const ROTULO_DUPLA = "Estações em dupla";
export const ROTULO_IA = "Avaliação por IA";
export const DETALHE_AMBOS = "Servem para as estações em dupla e para a avaliação por IA do treino sozinho.";
export const DETALHE_DUPLA = "Servem para as estações em dupla.";
export const DETALHE_IA = "Servem para a avaliação por IA do treino sozinho.";
export const ACABARAM = "Seus créditos de hoje acabaram.";
export const VOLTAM_AMANHA = "Voltam amanhã.";
export const VER_PLANOS = "Ver planos";

const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
const inteiro = (v) => (Number.isFinite(num(v)) ? Math.max(0, Math.trunc(num(v))) : 0);

/** Uma linha do bloco, ou null quando a moeda não deve aparecer (cota desligada, equipe, estado ilegível ou plano sem número). */
export function linhaCreditos(raw, rotulo) {
  if (!raw || typeof raw !== "object" || raw.ativa !== true || raw.ilimitado === true) return null;
  if (!Number.isFinite(num(raw.disponivel))) return null;
  const total = inteiro(raw.disponivel);
  const bonus = inteiro(raw.bonus);
  const comprados = inteiro(raw.comprados);
  const resto = Math.max(0, total - bonus - comprados); // o que ainda sobra da cota do dia (já com semana e mês, no caso da IA)
  const usados = inteiro(raw.usados_hoje);
  const limiteDia = Number.isFinite(num(raw.limite_dia)) ? inteiro(raw.limite_dia) : usados + resto;
  // Plano sem número (limite zero) e sem bônus nem comprados: não mostra (nada de "0 de 0").
  if (limiteDia <= 0 && bonus + comprados <= 0) return null;
  const janelaEsgotada =
    (Number.isFinite(num(raw.limite_semana)) && inteiro(raw.usados_semana) >= inteiro(raw.limite_semana)) ||
    (Number.isFinite(num(raw.limite_mes)) && inteiro(raw.usados_mes) >= inteiro(raw.limite_mes));
  return {
    rotulo, resto, limite: limiteDia, bonus, comprados, total, janelaEsgotada,
    renovaEm: typeof raw.renova_em === "string" ? raw.renova_em : null,
  };
}

/** O bloco inteiro: null (não aparece) ou { linhas, detalhe, esgotado, voltaAmanha }. */
export function modeloCreditosHoje(match, ia) {
  const linhas = [linhaCreditos(match, ROTULO_DUPLA), linhaCreditos(ia, ROTULO_IA)].filter(Boolean);
  if (linhas.length === 0) return null;
  const temDupla = linhas.some((l) => l.rotulo === ROTULO_DUPLA);
  const temIa = linhas.some((l) => l.rotulo === ROTULO_IA);
  return {
    linhas,
    detalhe: temDupla && temIa ? DETALHE_AMBOS : temDupla ? DETALHE_DUPLA : DETALHE_IA,
    esgotado: linhas.every((l) => l.total <= 0),
    voltaAmanha: !linhas.some((l) => l.janelaEsgotada),
  };
}

const CHECA_A_CADA_MS = 30_000;

/**
 * Lê as duas moedas ao montar, relê ao voltar o foco e, sem recarregar a página, quando passa o instante da renovação
 * (confere a cada 30 s e ao voltar o foco). Erro de leitura = o bloco não aparece. Leitura antiga que chega depois da nova é descartada.
 * @returns {{ estado: null | { match: any, ia: any }, reload: () => Promise<void> }}
 */
export function useCreditosHoje(backend) {
  const [estado, setEstado] = React.useState(null);
  const seq = React.useRef(0);
  const vivo = React.useRef(true);
  const renovaMs = React.useRef(null);

  const reload = React.useCallback(async () => {
    const meu = ++seq.current;
    try {
      const [match, ia] = await Promise.all([
        (async () => backend.rpc("app_credit_state", { p_pool: "match" }))().catch(() => null),
        (async () => backend.rpc("app_credit_state", { p_pool: "ia" }))().catch(() => null),
      ]);
      if (!vivo.current || meu !== seq.current) return;
      const instantes = [match, ia].map((r) => Date.parse(r?.renova_em)).filter((t) => Number.isFinite(t));
      renovaMs.current = instantes.length ? Math.min(...instantes) : null;
      setEstado({ match, ia });
    } catch {
      // sem leitura o bloco simplesmente não aparece
    }
  }, [backend]);

  React.useEffect(() => {
    vivo.current = true;
    void reload();
    const timer = setInterval(() => {
      if (renovaMs.current !== null && Date.now() >= renovaMs.current) {
        renovaMs.current = null; // uma leitura por virada; a nova resposta traz a próxima renovação
        void reload();
      }
    }, CHECA_A_CADA_MS);
    const aoVoltar = () => {
      if (document.visibilityState !== "hidden") void reload();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      vivo.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [reload]);

  return { estado, reload };
}
