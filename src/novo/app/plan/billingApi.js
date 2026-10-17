// Chamadas ao servidor de cobrança (/api/cobranca, migração 013700) com o token da sessão. Sem chave do fornecedor no servidor,
// /overview responde { enabled: false } e as telas de compra NÃO aparecem (nada muda para o aluno).
const BASE = "/api/cobranca";

async function call(backend, path, body) {
  const token = backend?.accessToken ? await backend.accessToken() : null;
  if (!token) throw Object.assign(new Error("Entre de novo na sua conta."), { status: 401 });
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // sem corpo
  }
  if (!res.ok) throw Object.assign(new Error(data?.error ?? "Não foi possível concluir agora. Tente de novo."), { status: res.status, code: data?.code });
  return data;
}

/** Situação da cobrança. Qualquer falha (rede, 503, sem token) = desligada, em silêncio, para nunca quebrar a tela. */
export async function getBillingOverview(backend) {
  try {
    const data = await call(backend, "/overview");
    return data && typeof data === "object" ? data : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

/** Uma chave nova por intenção de compra: o mesmo clique repetido não abre dois pagamentos. */
export function newIdem() {
  const rnd = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `c-${rnd}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}

export const startCheckout = (backend, body) => call(backend, "/checkout", body);
export const getOrder = (backend, id) => call(backend, `/orders/${encodeURIComponent(id)}`);
export const cancelOrder = (backend, id) => call(backend, `/orders/${encodeURIComponent(id)}/cancel`, {});
export const cancelRenewal = (backend) => call(backend, "/cancel-renewal", {});
/** Renovação do cartão que falhou: a mesma cobrança vira Pix (volta na hora ao pagar). */
export const payRenewalByPix = (backend) => call(backend, "/renewal/pix", {});
/** Trocar a forma de pagamento da renovação (013760): "pix" (cancela a assinatura do cartão) ou "cartao" (abre a página segura). */
export const changePaymentMethod = (backend, metodo, idem) => call(backend, "/payment-method", { metodo, idem });
export const requestRefund = (backend, cobrancaId) => call(backend, "/refunds", { cobranca_id: cobrancaId });

/** Centavos em reais (ex.: 9990 -> "R$ 99,90"). */
export const brl = (cents) => (cents == null ? "" : `R$ ${(cents / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`);

/** Data no formato do Brasil (ex.: 17/11/2026). */
export const dateBR = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

/** Administração (013850, só administrador): devolver um pagamento com motivo e a escolha do acesso ("manter" ou "encerrar"). */
export const adminRefund = (backend, body) => call(backend, "/admin/devolver", body);
