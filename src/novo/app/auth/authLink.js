// O que o endereço da página conta sobre o link do e-mail (recuperar senha). O Supabase troca o link por uma sessão e apaga os
// dados do endereço logo em seguida; por isso o app lê o endereço UMA vez, assim que carrega, antes de tudo (initialAuthLink).
//   kind "recovery": link de recuperação válido (a pessoa precisa criar a nova senha)
//   kind "signup":   link de confirmação do cadastro válido (a pessoa entra direto no app)
//   kind "expired":  link vencido ou já usado (a pessoa precisa pedir outro); `signup: true` quando era o de confirmar o cadastro
//                    (marca ?confirmacao=1 no endereço de volta, ver confirmRedirect em data/backend.ts)
//   kind null:       abertura comum

const EXPIRED_CODES = new Set(["otp_expired", "flow_state_expired", "flow_state_not_found"]);

function paramsOf(location) {
  const hash = String(location?.hash ?? "").replace(/^#/, "");
  const search = String(location?.search ?? "").replace(/^\?/, "");
  return [new URLSearchParams(hash), new URLSearchParams(search)];
}

/** Lê o endereço (window.location ou algo parecido) e diz de que tipo de abertura se trata. */
export function readAuthLink(location) {
  const [hash, search] = paramsOf(location);
  const get = (name) => hash.get(name) ?? search.get(name);
  const code = get("error_code");
  const description = `${get("error_description") ?? ""}`;
  const failed = Boolean(get("error") || code);
  const signupLink = search.get("confirmacao") === "1";
  if (failed && (EXPIRED_CODES.has(code) || /expired|invalid|already|used/i.test(description))) return signupLink ? { kind: "expired", signup: true } : { kind: "expired" };
  if (get("type") === "recovery") return { kind: "recovery" };
  if (get("type") === "signup" || (signupLink && get("access_token"))) return { kind: "signup" };
  return { kind: null };
}

/** Tira do endereço o que sobrou do link (para um recarregamento não repetir o aviso). */
export function clearAuthLinkFromUrl() {
  try {
    if (typeof window === "undefined" || !window.history?.replaceState) return;
    const { pathname, search, hash } = window.location;
    const keep = new URLSearchParams(search.replace(/^\?/, ""));
    for (const name of ["error", "error_code", "error_description", "type", "code", "access_token", "refresh_token", "confirmacao"]) keep.delete(name);
    const rest = keep.toString();
    const cleanHash = /(^#|&)(access_token|error|error_code|type)=/.test(hash) ? "" : hash;
    window.history.replaceState(window.history.state, "", pathname + (rest ? `?${rest}` : "") + cleanHash);
  } catch {
    /* sem acesso ao histórico: o aviso só pode voltar se a pessoa recarregar */
  }
}

/** Lido uma vez, quando o app carrega. */
export const initialAuthLink = typeof window === "undefined" ? { kind: null } : readAuthLink(window.location);
