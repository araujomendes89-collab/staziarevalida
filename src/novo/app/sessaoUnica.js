// Sessão única (decisão do dono, 17/10/2026): UMA sessão ativa por vez em cada conta. O banco decide quem vale
// (supabase/migrations/…13670_sessao_unica.sql: app_session_claim e app_session_check); aqui ficam as peças do navegador:
//   - qual é a "sessão" deste navegador: no Supabase, o session_id do login (o mesmo em todas as abas do navegador, então
//     abas não se derrubam); no banco local, um identificador guardado no localStorage (também comum às abas);
//   - o aparelho resumido que vai para o banco ("Chrome · Windows"), sem IP e sem nada além disso;
//   - o aviso "Sua conta foi aberta em outro aparelho", guardado no localStorage para que TODAS as abas deste navegador o
//     mostrem depois da saída (a saída é só local: o outro aparelho continua entrando normalmente).

const SESSAO_LOCAL_KEY = "smn-sessao-app";
const AVISO_KEY = "smn-sessao-derrubada";

/** Evento que as rotas de IA disparam quando o servidor recusa por sessão derrubada (o app confere na hora). */
export const EVENTO_SESSAO_DERRUBADA = "smn:sessao-derrubada";
/** Código de erro do servidor (rotas /api/tutor) para sessão que não é mais a vigente. */
export const CODIGO_SESSAO_DERRUBADA = "sessao_derrubada";
/** Cabeçalho com a sessão deste navegador para o servidor (só usado quando o token não traz session_id: banco local). */
export const CABECALHO_SESSAO = "X-Stazia-Sessao";
/** Conferência periódica, enquanto a aba está visível. */
export const INTERVALO_CONFERENCIA_MS = 60_000;
/** Voltar à aba ou ao foco confere de novo, no máximo uma vez a cada 10 s. */
export const INTERVALO_MINIMO_MS = 10_000;

const ID_VALIDO = /^[A-Za-z0-9_-]{8,128}$/;
/** O aviso some sozinho depois de 3 dias (quem volta bem depois vê só o login). */
const AVISO_VALIDADE_MS = 3 * 24 * 60 * 60 * 1000;

let sessaoAtual = null; // último identificador usado (para o cabeçalho das rotas de IA)
let avisoMemoria = null; // quando o localStorage não existe

function novoId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* segue para o plano B */
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Identificador guardado neste navegador para a conta (banco local ou token sem session_id). Comum a todas as abas. */
function idLocal(userId) {
  try {
    const salvo = JSON.parse(localStorage.getItem(SESSAO_LOCAL_KEY) ?? "null");
    if (salvo && salvo.u === userId && ID_VALIDO.test(salvo.id ?? "")) return salvo.id;
    const id = novoId();
    localStorage.setItem(SESSAO_LOCAL_KEY, JSON.stringify({ u: userId, id }));
    return id;
  } catch {
    sessaoAtual ??= novoId();
    return sessaoAtual;
  }
}

/** A sessão deste navegador: a do login do Supabase quando existe; senão a guardada no navegador. */
export async function idDaSessao(backend, user) {
  let id = null;
  try {
    id = backend?.sessionId ? await backend.sessionId() : null;
  } catch {
    id = null;
  }
  if (!id && user?.id) id = idLocal(user.id);
  sessaoAtual = id;
  return id;
}

/** Saiu (pelo botão ou derrubado): a próxima entrada neste navegador ganha uma sessão nova. */
export function esquecerSessaoLocal() {
  sessaoAtual = null;
  try {
    localStorage.removeItem(SESSAO_LOCAL_KEY);
  } catch {
    /* sem armazenamento */
  }
}

/** Cabeçalho para as rotas do servidor (vazio quando ainda não há sessão). */
export function cabecalhoSessao() {
  return sessaoAtual ? { [CABECALHO_SESSAO]: sessaoAtual } : {};
}

/** "Chrome · Windows", "Safari · iPhone"… Só navegador e sistema, até 60 caracteres. */
export function resumoAparelho(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  const s = String(ua || "");
  const sistema = /iPhone/i.test(s)
    ? "iPhone"
    : /iPad/i.test(s)
      ? "iPad"
      : /Android/i.test(s)
        ? "Android"
        : /Windows/i.test(s)
          ? "Windows"
          : /Mac OS X|Macintosh/i.test(s)
            ? "Mac"
            : /CrOS/i.test(s)
              ? "Chromebook"
              : /Linux/i.test(s)
                ? "Linux"
                : "";
  const navegador = /Edg(e|A|iOS)?\//i.test(s)
    ? "Edge"
    : /OPR\/|Opera/i.test(s)
      ? "Opera"
      : /SamsungBrowser/i.test(s)
        ? "Samsung Internet"
        : /Firefox|FxiOS/i.test(s)
          ? "Firefox"
          : /Chrome|CriOS/i.test(s)
            ? "Chrome"
            : /Safari/i.test(s)
              ? "Safari"
              : "";
  const partes = [navegador, sistema].filter(Boolean);
  return (partes.length ? partes.join(" · ") : "Outro aparelho").slice(0, 60);
}

/** Guarda o aviso para todas as abas deste navegador. info: { aparelho?, desde? } */
export function guardarAvisoDerrubada(info = {}) {
  const aviso = { aparelho: typeof info.aparelho === "string" ? info.aparelho.slice(0, 60) : null, desde: info.desde ?? null, em: Date.now() };
  avisoMemoria = aviso;
  try {
    localStorage.setItem(AVISO_KEY, JSON.stringify(aviso));
  } catch {
    /* fica só na memória desta aba */
  }
  return aviso;
}

export function lerAvisoDerrubada() {
  try {
    const salvo = JSON.parse(localStorage.getItem(AVISO_KEY) ?? "null");
    if (salvo && typeof salvo === "object") return Date.now() - Number(salvo.em ?? 0) < AVISO_VALIDADE_MS ? salvo : null;
  } catch {
    /* sem armazenamento */
  }
  return avisoMemoria;
}

export function limparAvisoDerrubada() {
  avisoMemoria = null;
  try {
    localStorage.removeItem(AVISO_KEY);
  } catch {
    /* sem armazenamento */
  }
}

/** "hoje às 14:32", "ontem às 09:05" ou "15/10 às 22:10", no fuso deste aparelho. */
export function quandoEntrou(desde, agora = new Date()) {
  const d = desde ? new Date(desde) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d);
  const dia = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (dia(d) === dia(agora)) return `hoje às ${hora}`;
  if (dia(d) === dia(ontem)) return `ontem às ${hora}`;
  return `${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d)} às ${hora}`;
}
