// Treino em Dupla · cota de matches do aluno (textos, leitura do estado e leitura dos erros do banco).
// O servidor é a única fonte do número: a tela nunca desconta nem soma por conta própria, só relê `app_credit_state('match')`
// quando algo muda (depois de formar match, de uma resposta "quota", ao voltar o foco da janela).
// Com a cota desligada (`ativa:false`, o padrão) ou para a equipe (`ilimitado:true`) nada de cota aparece em tela alguma.
import React from "react";

// ---------------------------------------------------------------- textos (aprovação do dono pendente)
export const CREDIT_LABEL = "Cota diária disponível";
export const RENEWS_MIDNIGHT = "Renova à meia-noite";
export const QUOTA_TITLE = "Sua cota de matches acabou";
export const QUOTA_TEXT = "Você pode adquirir mais matches para encontrar novos parceiros. Suas conversas continuam disponíveis.";
export const QUOTA_NOTE = "Os pacotes ainda não estão à venda.";
export const QUOTA_CLOSE = "Fechar";
export const PAIR_UNAVAILABLE_TEXT = "Não foi possível formar a dupla agora.";
export const OWN_QUOTA_EMPTY = "Sua cota de hoje acabou.";
/** Ainda sem tela: reservado para o aviso de quem já está em outra sala. */
export const ALREADY_IN_ROOM = "Você já está em uma sala.";
/** Vem do servidor (`app_dupla_start`); aparece como aviso na sala. Guardado aqui só para os testes e a aprovação. */
export const START_REFUSED_TEXT = "Não foi possível iniciar agora. Confirmem a cota de hoje e tentem de novo.";

// ---------------------------------------------------------------- erros
const HINT_QUOTA = "INSUFFICIENT_CREDITS";
const HINT_PAIR = "PAIR_UNAVAILABLE";

/**
 * Que tipo de recusa de cota o erro é: 'quota' (sem crédito), 'pair' (a dupla não pôde ser formada) ou null.
 * Decide pelo `hint` do banco; no banco local/dev, que não manda a dica, pela mensagem.
 */
export function creditKind(error) {
  const hint = String(error?.hint ?? "").toUpperCase();
  if (hint === HINT_QUOTA) return "quota";
  if (hint === HINT_PAIR) return "pair";
  const message = String(error?.message ?? "");
  if (/cota de matches acabou/i.test(message)) return "quota";
  if (/formar a dupla agora/i.test(message)) return "pair";
  return null;
}

// ---------------------------------------------------------------- hora da renovação
const BRASILIA_HOUR = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "Renova à meia-noite" ou "Renova às 05h" (05h30 se houver minutos), na hora de Brasília. Vazio se o instante não for válido. */
export function renewLabel(iso) {
  const ms = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return "";
  const parts = Object.fromEntries(BRASILIA_HOUR.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const hh = parts.hour === "24" ? "00" : parts.hour;
  if (hh === "00" && parts.minute === "00") return RENEWS_MIDNIGHT;
  return `Renova às ${hh}h${parts.minute === "00" ? "" : parts.minute}`;
}

// ---------------------------------------------------------------- leitura do estado
function normalize(raw) {
  if (!raw || typeof raw !== "object" || raw.ativa !== true || raw.ilimitado === true) return null;
  const n = Number(raw.disponivel);
  if (!Number.isFinite(n)) return null;
  return { disponivel: n, renovaEm: typeof raw.renova_em === "string" ? raw.renova_em : null };
}

/**
 * Lê `app_credit_state('match')` ao montar (e quando `deps` mudam), expõe `reload()` e relê ao voltar o foco da janela.
 * `credit` é null quando a cota está desligada, é ilimitada (equipe), ainda não chegou ou deu erro: nesses casos nada aparece.
 * Nunca altera o número sozinho. Uma leitura antiga que chega depois de uma nova é descartada.
 * @returns {{ credit: null | { disponivel: number, renovaEm: string | null }, reload: () => Promise<void> }}
 */
export function useCreditState(backend, deps = []) {
  const [credit, setCredit] = React.useState(null);
  const seq = React.useRef(0);
  const alive = React.useRef(true);

  const reload = React.useCallback(async () => {
    const mine = ++seq.current;
    try {
      const raw = await backend.rpc("app_credit_state", { p_pool: "match" });
      if (alive.current && mine === seq.current) setCredit(normalize(raw));
    } catch {
      // Sem leitura, a cota simplesmente não aparece (ou fica como estava); a tela segue normal.
    }
  }, [backend]);

  React.useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps]);

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "hidden") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reload]);

  return { credit, reload };
}
