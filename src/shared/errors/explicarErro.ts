/**
 * Tradutor de erros em português simples (correção TD01), usado pelas telas (messageOf, em src/novo/app/admin/common.jsx)
 * e pelos servidores (rotas /api), para o dono e a equipe nunca verem texto técnico, mas sempre saberem o MOTIVO e o que fazer.
 *
 * Regras:
 *   1. Frase pronta em português (as do banco, como "Informe o tema." ou "Acesso restrito à equipe.") passa inteira.
 *   2. Erro técnico (banco, servidor, rede, IA, login) vira uma frase que diz o motivo e o que fazer.
 *   3. O que não for reconhecido vira o texto padrão (ou o que a tela pedir). Nunca sai texto técnico cru.
 *   4. Segredo (chave, token, endereço com chave) nunca sai: as frases traduzidas são fixas e não repetem nada do erro.
 *
 * Arquivo puro (sem React e sem servidor), para valer igual nos dois lados.
 */

export const DEFAULT_ERROR_MESSAGE = "Não foi possível concluir. Tente de novo.";

const MAX_READABLE = 240;

/** Sinais de texto técnico: se aparecer qualquer um, a frase não é repassada. */
const TECHNICAL =
  /permission denied|violates|row-level|schema cache|pgrst|sqlstate|duplicate key|constraint|null value|syntax error|invalid input|failed to fetch|fetch failed|typeerror|referenceerror|syntaxerror|rangeerror|undefined|\bnull\b|\bnan\b|econn|etimedout|enotfound|eai_again|\bjwt\b|stack|bearer|\bsk-[a-z0-9_-]{6,}|\beyj[a-z0-9_-]{8,}|api[_ -]?key|apikey|unexpected token|\bat \S+ \(|supabase\.co|googleapis|\bselect\b[^.]*\bfrom\b|relation "|column "|\bfunction\b|\brpc\b|stderr|exception|errno|[{}]|\[object|public\.[a-z_]+|\bapp_[a-z0-9_]{3,}|\bch_[a-z0-9_]{3,}|[a-z_]+\(\)|traceback|\.(ts|js|tsx|jsx):\d+/i;

/** Palavras que denunciam mensagem em inglês (mensagens de bibliotecas, do banco e dos fornecedores de IA). */
const ENGLISH_WORDS =
  /\b(the|is|are|was|were|not|failed|failure|error|invalid|unable|cannot|could|couldn't|request|response|missing|found|must|should|with|from|already|exceeded|denied|unauthorized|forbidden|timeout|timed|expired|bad|gateway|server|internal|too|large|please|provided|required|unexpected|returned|rows?|table|value|key|token|quota|limit|overloaded|failed)\b/gi;

/** Palavras comuns do português (para não confundir uma frase nossa com inglês). */
const PORTUGUESE_WORDS =
  /\b(não|nao|de|da|do|dos|das|que|para|você|voce|uma|um|os|as|em|por|com|este|esta|esse|essa|ainda|já|seu|sua|ou|se|na|no|nos|nas|foi|ser|tem|há|mais|pelo|pela|entre|sem|ao|aos)\b/gi;

const SECRET = /\bsk-[a-z0-9_-]{6,}|\beyj[a-z0-9_-]{8,}|bearer\s+\S+|api[_ -]?key|apikey|x-api-key|secret|password=|senha=/i;

const count = (re: RegExp, text: string) => (text.match(re) ?? []).length;

/** A mensagem é uma frase pronta em português, sem nada técnico? */
export function isReadableMessage(message: unknown): boolean {
  const text = typeof message === "string" ? message.trim() : "";
  if (text.length < 4 || text.length > MAX_READABLE) return false;
  if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9]/.test(text)) return false;
  if (!/\s/.test(text)) return false; // uma palavra só ("Timeout") não explica nada
  if (/^erro\s+\d{3}\b/i.test(text)) return false; // "Erro 500." é só o número do problema
  if (SECRET.test(text) || TECHNICAL.test(text)) return false;
  const english = count(ENGLISH_WORDS, text);
  if (english > 0 && english >= count(PORTUGUESE_WORDS, text)) return false;
  return true;
}

interface Parts {
  message: string;
  code: string;
  status: number | null;
  name: string;
}

/** Tira de qualquer erro (Error, erro do banco, resposta com status, texto solto) só o que serve para reconhecer o motivo. */
function partsOf(error: unknown): Parts {
  if (error == null) return { message: "", code: "", status: null, name: "" };
  if (typeof error === "string") return { message: error.trim(), code: "", status: statusFromText(error), name: "" };
  const o = error as Record<string, unknown>;
  const message = typeof o.message === "string" ? o.message.trim() : typeof o.error === "string" ? o.error.trim() : "";
  const details = typeof o.details === "string" ? o.details : "";
  // Dica em CAIXA_ALTA_COM_SUBLINHADO (ex.: INSUFFICIENT_CREDITS) é código para as telas decidirem o que fazer, não texto para a pessoa.
  const hint = typeof o.hint === "string" && !/^[A-Z][A-Z0-9_]+$/.test(o.hint.trim()) ? o.hint : "";
  const rawCode = typeof o.code === "string" || typeof o.code === "number" ? String(o.code) : "";
  const rawStatus = Number(o.status ?? o.statusCode);
  const status = Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus < 600 ? rawStatus : statusFromText(message);
  return { message: [message, details, hint].filter(Boolean).join(" ").trim(), code: rawCode, status, name: typeof o.name === "string" ? o.name : "" };
}

function statusFromText(text: string): number | null {
  const m = /^\s*erro\s+(\d{3})\b/i.exec(text) ?? /status code (\d{3})/i.exec(text) ?? /\bhttp(?: error)? (\d{3})\b/i.exec(text) ?? /^\s*(\d{3})\s*[:-]/.exec(text);
  return m ? Number(m[1]) : null;
}

const SESSION = "Sua sessão venceu. Entre de novo na sua conta.";
const PERMISSION = "Você não tem permissão para fazer isso. Se acha que deveria ter, peça a um administrador.";
const TOO_MANY = "O serviço está com muitos pedidos ou atingiu o limite agora. Espere um pouco e tente de novo.";
const TIMEOUT = "A operação demorou demais para responder. Tente de novo em instantes; se repetir, tente com menos itens de uma vez.";
const NETWORK = "Sem conexão com o servidor. Confira sua internet e tente de novo.";
const NOT_FOUND = "Não encontramos o item pedido. Ele pode ter sido apagado; atualize a tela.";
const SQL_MISSING = "Esta função ainda não foi atualizada no servidor: falta aplicar uma atualização do banco. Avise a equipe técnica.";
const KEY = "A chave de acesso do serviço de IA não está configurada ou não vale mais. Avise a equipe técnica.";
const SERVER_DOWN = "O servidor está fora do ar ou ocupado agora. Tente de novo em instantes.";
const SERVER_ERROR = "O servidor teve um problema para concluir. Tente de novo; se repetir, avise a equipe técnica.";

type Rule = { when: (t: string, p: Parts) => boolean; say: string };

/** Em ordem: a primeira que combinar vale. */
const RULES: Rule[] = [
  { when: (t) => /unexpected token|unexpected end of json|is not valid json|json\.parse|in json at position|unterminated string/.test(t), say: "O servidor devolveu uma resposta inesperada. Tente de novo; se repetir, avise a equipe técnica." },
  { when: (t) => /invalid login credentials|invalid credentials/.test(t), say: "E-mail ou senha incorretos." },
  { when: (t) => /email not confirmed/.test(t), say: "Confirme seu e-mail antes de entrar: procure a mensagem de confirmação na sua caixa de entrada." },
  { when: (t) => /user already registered|already been registered/.test(t), say: "Já existe uma conta com este e-mail." },
  { when: (t) => /password should be|weak password|password is too/.test(t), say: "A senha é fraca demais. Use uma senha mais longa, com letras e números." },
  { when: (t) => /bucket not found/.test(t), say: "O local de armazenamento dos arquivos não foi encontrado. Avise a equipe técnica." },
  { when: (t) => /object not found|the resource was not found|no such object/.test(t), say: "O arquivo não foi encontrado no armazenamento. Ele pode ter sido apagado." },
  { when: (t, p) => ["PGRST202", "PGRST205", "42883", "42P01", "42703"].includes(p.code) || /could not find the function|schema cache|no function matches|does not exist/.test(t), say: SQL_MISSING },
  { when: (t, p) => p.code === "42501" || /permission denied|row-level security|not authorized|insufficient[_ ]privilege|must be owner/.test(t), say: PERMISSION },
  { when: (t, p) => ["PGRST301", "PGRST302"].includes(p.code) || /\bjwt\b|token (has )?expired|expired token|invalid token|refresh token|auth session missing|not authenticated|session (has )?expired/.test(t), say: SESSION },
  { when: (t) => /api[_ -]?key|x-api-key|invalid_api_key|authentication_error|unauthenticated|incorrect api key|credentials? (not|invalid|missing)/.test(t), say: KEY },
  { when: (t) => /model[_ ]not[_ ]found|not_found_error|model .* (not found|does not exist|is not available)/.test(t), say: "O modelo de IA escolhido não está disponível. Escolha outro na Central de IAs." },
  { when: (t) => /safety|content[_ ]filter|prohibited_content|blocked by|recitation/.test(t), say: "A IA recusou responder a este conteúdo. Ajuste o texto e tente de novo." },
  { when: (t, p) => p.status === 429 || /\b429\b|resource_exhausted|quota|rate[ _-]?limit|too many requests|overloaded|over_capacity/.test(t), say: TOO_MANY },
  { when: (t, p) => p.status === 413 || /payload too large|entity too large|request too large|file too large|body too large/.test(t), say: "O arquivo ou o texto é grande demais para enviar. Reduza o tamanho e tente de novo." },
  { when: (t, p) => p.code === "57014" || p.name === "TimeoutError" || p.name === "AbortError" || p.status === 408 || p.status === 504 || /timeout|timed out|deadline exceeded|aborted|esockettimedout|canceling statement/.test(t), say: TIMEOUT },
  { when: (t) => /failed to fetch|fetch failed|networkerror|network request failed|network error|load failed|econnrefused|econnreset|etimedout|enotfound|eai_again|socket hang up|err_internet|offline/.test(t), say: NETWORK },
  { when: (t, p) => p.code === "23503" || /foreign key/.test(t), say: "Este item está ligado a outros registros. Confira o que depende dele antes de alterar ou apagar." },
  { when: (t, p) => p.code === "23502" || /not-null|null value in column/.test(t), say: "Falta preencher um campo obrigatório. Confira os campos e tente de novo." },
  { when: (t, p) => p.code === "23514" || /check constraint/.test(t), say: "Algum valor preenchido não é aceito. Confira os campos e tente de novo." },
  { when: (t, p) => p.code === "23505" || /duplicate key|unique constraint|already exists/.test(t), say: "Já existe um registro igual a este. Confira se ele não está repetido." },
  { when: (t, p) => p.code === "22P02" || p.code === "22007" || /invalid input (syntax|value)|invalid (date|uuid)/.test(t), say: "Algum valor está em formato inválido. Confira os campos e tente de novo." },
  { when: (t, p) => p.code === "22001" || /value too long/.test(t), say: "Algum texto ficou grande demais. Reduza o tamanho e tente de novo." },
  { when: (t, p) => p.code === "22003" || /out of range/.test(t), say: "Algum número está fora do limite aceito. Confira os campos e tente de novo." },
  { when: (t, p) => ["40001", "40P01"].includes(p.code) || /deadlock|could not serialize/.test(t), say: "Outra alteração aconteceu ao mesmo tempo. Tente de novo." },
  { when: (t, p) => p.code === "PGRST116" || /multiple \(or no\) rows|no rows returned|0 rows/.test(t), say: NOT_FOUND },
];

const BY_STATUS: Record<number, string> = {
  400: "O pedido não foi aceito. Confira os campos e tente de novo.",
  401: SESSION,
  403: PERMISSION,
  404: "Não encontramos o que você pediu. Pode ter sido apagado; atualize a tela.",
  409: "Esta alteração entrou em conflito com outra. Atualize a tela e tente de novo.",
  422: "Os dados enviados não puderam ser usados. Confira os campos e tente de novo.",
  500: SERVER_ERROR,
  502: SERVER_DOWN,
  503: SERVER_DOWN,
};

/**
 * Texto para mostrar a quem usa o sistema. `fallback` só aparece quando nada é reconhecido.
 * Nunca lança erro e nunca repete texto técnico do erro.
 */
export function explainError(error: unknown, fallback: string = DEFAULT_ERROR_MESSAGE): string {
  try {
    const parts = partsOf(error);
    // erro do servidor com frase pronta (httpError, raise exception): vale a frase inteira
    if (isReadableMessage(parts.message) && !/^erro\s+\d{3}/i.test(parts.message)) return parts.message;
    const text = parts.message.toLowerCase();
    for (const rule of RULES) if (rule.when(text, parts)) return rule.say;
    if (parts.status && BY_STATUS[parts.status]) return BY_STATUS[parts.status];
    if (parts.status && parts.status >= 500) return SERVER_ERROR;
    return fallback;
  } catch {
    return fallback;
  }
}
