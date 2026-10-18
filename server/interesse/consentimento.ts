/**
 * Lista de interesse da 2ª fase (013960): o texto EXATO da caixa de consentimento do formulário do site e a versão dele. O banco guarda
 * o texto da versão aceita (public.lista_interesse_consentimento): os dois têm de ser iguais (teste listaInteresseBanco). Mudou o texto?
 * Versão nova aqui, no banco (migração nova) e no formulário do site, juntos.
 */
export const CONSENTIMENTO_VERSAO = "2a_fase-v1";
export const CONSENTIMENTO_TEXTO =
  "Quero receber avisos da 2ª fase do StaziaMed pelo WhatsApp (e por e-mail, se informei). Posso sair a qualquer momento.";

/** Link de convite do grupo do WhatsApp aceito na Administração (o mesmo do banco): sem nada depois do código. */
export const GRUPO_LINK_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}$/;

/** Países do seletor do formulário (código do país). "outro" = a pessoa digita com + e o código. */
export const PAISES: Record<string, string> = { "55": "Brasil", "595": "Paraguai", "591": "Bolívia", "54": "Argentina" };

/**
 * Junta o país escolhido e o número digitado num texto que o banco normaliza (public.lista_interesse_whatsapp decide; aqui só monta):
 *   - número começando com + ou 00: vale como está (a pessoa já pôs o código do país);
 *   - país do seletor: "+<código>" + os dígitos (sem o zero do interurbano); no Brasil, se a pessoa já digitou 55 na frente, não repete.
 *   - sem país (formulário antigo) ou "outro" sem +: vai como está (o banco trata como número do Brasil ou recusa).
 */
export function montarWhatsapp(pais: unknown, numero: unknown): string {
  const n = typeof numero === "string" ? numero.trim().slice(0, 40) : "";
  if (!n || /^(\+|00)/.test(n)) return n;
  const p = typeof pais === "string" ? pais.trim() : "";
  if (!PAISES[p]) return n;
  const d = n.replace(/\D/g, "").replace(/^0+/, "");
  if (p === "55" && /^55\d{10,11}$/.test(d)) return `+${d}`;
  return `+${p}${d}`;
}

/** "Mozilla/5.0 (iPhone; …) … Safari/…" → "Safari · iPhone". Só o tipo de navegador e de aparelho, nunca a versão completa. */
export function resumirNavegador(ua: unknown): string | null {
  if (typeof ua !== "string" || !ua.trim()) return null;
  const s = ua.slice(0, 400);
  const nav = /Edg\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /SamsungBrowser/.test(s) ? "Samsung Internet" : /Firefox\//.test(s) ? "Firefox"
    : /CriOS|Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : /bot|crawl|spider|curl|wget|python|http/i.test(s) ? "robô ou programa" : "outro";
  const so = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows"
    : /Mac OS X|Macintosh/.test(s) ? "Mac" : /Linux/.test(s) ? "Linux" : "outro";
  return `${nav} · ${so}`;
}
