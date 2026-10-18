// Chamadas da Administração → Lista de interesse (/api/interesse/admin) com o token da sessão. O servidor confere que é administrador
// e cada função do banco confere de novo (migração 013960). O aluno nunca chega aqui.
const BASE = "/api/interesse/admin";

async function headers(backend, extra = {}) {
  const token = backend?.accessToken ? await backend.accessToken() : null;
  if (!token) throw new Error("A lista de interesse precisa do servidor: entre de novo na sua conta.");
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function pedir(backend, caminho, { method = "GET", body } = {}) {
  const res = await fetch(BASE + caminho, {
    method,
    headers: await headers(backend, body === undefined ? {} : { "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}.`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      // sem corpo
    }
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return res;
}

export const interesseApi = {
  resumo: async (backend) => (await pedir(backend, "/resumo?dias=14")).json(),
  lista: async (backend, { busca = "", filtro = "", pagina = 0 } = {}) =>
    (await pedir(backend, `/lista?${new URLSearchParams({ busca, filtro, pagina: String(pagina) })}`)).json(),
  csv: async (backend, filtro = "") => (await pedir(backend, `/csv?${new URLSearchParams({ filtro })}`)).blob(),
  salvarGrupo: async (backend, link) => (await pedir(backend, "/grupo", { method: "POST", body: { link } })).json(),
  tirar: async (backend, id) => (await pedir(backend, "/tirar", { method: "POST", body: { id } })).json(),
  previaAviso: async (backend) => (await pedir(backend, "/aviso/previa")).json(),
  avisar: async (backend, esperado) => (await pedir(backend, "/aviso", { method: "POST", body: { esperado } })).json(),
};

/** O mesmo formato aceito pelo servidor e pelo banco (sem "?s=…" depois do código). */
export const GRUPO_LINK_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}$/;

/** "+5511987654321" → "+55 (11) 98765-4321"; outros países ficam como estão. */
export function whatsappBonito(w) {
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(w ?? "");
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : w ?? "";
}

/** Conversa no WhatsApp com o número (wa.me só aceita os dígitos). */
export const linkConversa = (w) => `https://wa.me/${String(w ?? "").replace(/\D/g, "")}`;
