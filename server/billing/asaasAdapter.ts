/**
 * Adaptador do Asaas (API REST v3, sem pacote novo: só fetch e crypto). Tudo o que é específico do Asaas fica AQUI; o núcleo
 * (core.ts) só vê a interface neutra de provider.ts. Respostas reais do sandbox gravadas em
 * src/__tests__/fixtures/asaas-sandbox/ (17/10/2026) servem de base aos testes.
 *
 * Chaves só em variáveis de ambiente: ASAAS_API_KEY (vazia = pagamento desligado) e ASAAS_WEBHOOK_TOKEN.
 * Chave de sandbox começa com "$aact_hmlg_"; a de produção ("$aact_prod_") só vale com ASAAS_ALLOW_LIVE=1 (ordem do dono).
 *
 * O que o sandbox mostrou (e o adaptador respeita):
 *   - assinatura no cartão ignora parcelas: o trimestral é uma assinatura QUARTERLY à vista (o dono decidiu sem parcelamento);
 *   - assinatura no cartão criada SEM o cartão: a 1ª cobrança tem página (invoiceUrl) onde o aluno digita o cartão; depois de
 *     paga, o Asaas guarda o cartão e cobra sozinho nos próximos vencimentos;
 *   - assinatura por Pix gera a cobrança logo na criação (não 7 dias antes): por isso o Pix é sempre avulso, gerado por nós;
 *   - "callback" (endereço de volta) só funciona com um site cadastrado em Minha Conta > Informações: ligar com
 *     ASAAS_RETURN_URL=1 depois que o dono cadastrar app.staziamed.com.br;
 *   - QR Code do Pix continua pagável depois do vencimento (pagamento atrasado volta o acesso);
 *   - cobrança da assinatura do cartão que não foi paga pode virar Pix (PUT billingType=PIX): a assinatura continua no cartão;
 *   - débito: não existe tipo próprio na criação; a página da cobrança de cartão oferece "Cartão de Débito" e o pagamento
 *     volta como billingType DEBIT_CARD (só à vista, o cartão não fica guardado);
 *   - devolução de Pix fica "AWAITING_CRITICAL_ACTION_AUTHORIZATION" até alguém autorizar no painel (ou o dono liberar);
 *     devolução parcial de cartão só a partir do dia seguinte ao pagamento.
 */
import crypto from "crypto";
import { OBSERVACAO_PADRAO } from "./nota";
import {
  BillingSignatureError,
  ProviderError,
  type ChargeCreated,
  type ChargeInput,
  type ChargeStatus,
  type CustomerInput,
  type InvoiceStatus,
  type PaymentProvider,
  type ProviderCharge,
  type ProviderInvoice,
  type ProviderNotice,
  type SubscriptionInput,
} from "./provider";

const SANDBOX_API = "https://api-sandbox.asaas.com/v3";
const LIVE_API = "https://api.asaas.com/v3";

type Obj = Record<string, any>;

/**
 * Nota fiscal (NFS-e) emitida pelo Asaas a cada pagamento confirmado. Curitiba emite pelo Portal/Emissor Nacional (Simples desde
 * 1º/11/2025): lá o Asaas NÃO lista serviços (GET /fiscalInfo/services), então vale o CÓDIGO (código de tributação nacional, ex.:
 * "080201") em ASAAS_NFSE_SERVICE_CODE; ASAAS_NFSE_SERVICE_ID só para prefeitura que lista serviços. O NBS vai em taxes.nbsCode.
 */
export interface AsaasNfseConfig {
  serviceId?: string;
  serviceCode?: string;
  serviceName?: string;
  nbsCode?: string;
  /** Observação impressa na nota (padrão: OBSERVACAO_PADRAO). */
  observations?: string;
  iss?: number;
  retainIss?: boolean;
}

export interface AsaasOptions {
  apiKey: string;
  webhookToken?: string;
  returnUrls?: boolean;
  nfse?: AsaasNfseConfig;
  fetchImpl?: typeof fetch;
}

/** Token do aviso: 32 a 255 caracteres, sem espaços (exigência do Asaas). */
export function isValidWebhookToken(token: string | undefined): token is string {
  return !!token && token.length >= 32 && token.length <= 255 && !/\s/.test(token);
}

/** Compara o token em tempo constante (hash dos dois lados: tamanhos diferentes não vazam pelo tempo). */
export function webhookTokenMatches(expected: string | undefined, received: unknown): boolean {
  if (!isValidWebhookToken(expected) || typeof received !== "string" || !received) return false;
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(received).digest();
  return crypto.timingSafeEqual(a, b);
}

const reais = (cents: number) => Math.round(cents) / 100;
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const dayToDate = (d: unknown) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? new Date(`${d.slice(0, 10)}T12:00:00-03:00`) : null);
const ID = /^[A-Za-z0-9_-]{3,100}$/;

/** Situação do Asaas → situação neutra. */
export function asaasStatus(p: Obj): ChargeStatus {
  if (p.deleted) return "canceled";
  const refunded = refundedCents(p);
  switch (String(p.status)) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
      return refunded > 0 ? (refunded >= cents(p.value) ? "refunded" : "partially_refunded") : "paid";
    case "REFUNDED":
      return "refunded";
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      // contestação no cartão: trata como devolvido (corta o acesso); se o banco der ganho de causa, a equipe devolve à mão
      return "refunded";
    case "OVERDUE":
    case "DUNNING_REQUESTED":
    case "DUNNING_RECEIVED":
      return "overdue";
    case "AWAITING_RISK_ANALYSIS":
    case "PENDING":
      return "pending";
    default:
      return "pending";
  }
}

function refundedCents(p: Obj): number {
  const list = Array.isArray(p.refunds) ? p.refunds : [];
  return list.filter((r: Obj) => r?.status === "DONE").reduce((s: number, r: Obj) => s + cents(r.value), 0);
}

export function toProviderCharge(p: Obj): ProviderCharge {
  const method = p.billingType === "PIX" ? "pix" : p.billingType === "CREDIT_CARD" ? "card" : p.billingType === "DEBIT_CARD" ? "debit" : "other";
  const paid = p.clientPaymentDate || p.paymentDate || p.confirmedDate;
  return {
    id: String(p.id),
    status: asaasStatus(p),
    method,
    amountCents: cents(p.value),
    refundedCents: String(p.status) === "REFUNDED" ? cents(p.value) : refundedCents(p),
    customerId: p.customer ? String(p.customer) : null,
    subscriptionId: p.subscription ? String(p.subscription) : null,
    externalReference: p.externalReference ? String(p.externalReference) : null,
    dueDate: typeof p.dueDate === "string" ? p.dueDate.slice(0, 10) : null,
    paidAt: dayToDate(paid),
    installments: Boolean(p.installment),
    receiptUrl: [p.transactionReceiptUrl, p.invoiceUrl].find((u) => typeof u === "string" && /^https:\/\//.test(u) && u.length <= 500) ?? null,
  };
}

/** Situação da nota no Asaas → situação neutra. Cancelamento negado = a nota continua valendo (autorizada). */
export function asaasInvoiceStatus(status: unknown): InvoiceStatus {
  switch (String(status)) {
    case "AUTHORIZED":
    case "CANCELLATION_DENIED":
      return "autorizada";
    case "PROCESSING_CANCELLATION":
      return "cancelando";
    case "CANCELED":
      return "cancelada";
    case "ERROR":
      return "erro";
    default:
      return "agendada"; // SCHEDULED, SYNCHRONIZED
  }
}

export function toProviderInvoice(i: Obj): ProviderInvoice {
  const pdf = typeof i.pdfUrl === "string" && /^https:\/\//.test(i.pdfUrl) && i.pdfUrl.length <= 500 ? i.pdfUrl : null;
  return {
    id: String(i.id),
    status: asaasInvoiceStatus(i.status),
    chargeId: i.payment ? String(i.payment) : null,
    pdfUrl: pdf,
    numero: i.number != null && String(i.number).trim() ? String(i.number).trim().slice(0, 40) : null,
  };
}

/** Cria o adaptador; sem chave (ou chave de produção sem ASAAS_ALLOW_LIVE=1, ou formato estranho) devolve null = desligado. */
export function createAsaasProvider(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): PaymentProvider | null {
  const apiKey = (env.ASAAS_API_KEY ?? "").trim();
  if (!apiKey) return null;
  let mode: "test" | "live";
  if (apiKey.startsWith("$aact_hmlg_")) mode = "test";
  else if (apiKey.startsWith("$aact_prod_") && env.ASAAS_ALLOW_LIVE === "1") mode = "live";
  else return null;
  const webhookToken = (env.ASAAS_WEBHOOK_TOKEN ?? "").trim();
  // sem token de aviso válido não dá para confirmar pagamento nenhum: melhor desligado do que meio ligado
  if (!isValidWebhookToken(webhookToken)) return null;
  const serviceId = env.ASAAS_NFSE_SERVICE_ID?.trim() || undefined;
  const serviceCode = env.ASAAS_NFSE_SERVICE_CODE?.trim() || undefined;
  const serviceName = env.ASAAS_NFSE_SERVICE_NAME?.trim();
  const nbsCode = env.ASAAS_NFSE_NBS?.trim() || undefined;
  return asaasProvider(
    {
      apiKey,
      webhookToken,
      returnUrls: env.ASAAS_RETURN_URL === "1",
      nfse: (serviceId || serviceCode) && serviceName
        ? { serviceId, serviceCode, serviceName, nbsCode, observations: env.ASAAS_NFSE_OBS?.trim() || undefined, iss: Number(env.ASAAS_NFSE_ISS || 0), retainIss: env.ASAAS_NFSE_RETAIN_ISS === "1" }
        : undefined,
      fetchImpl,
    },
    mode
  );
}

export function asaasProvider(opts: AsaasOptions, mode: "test" | "live" = "test"): PaymentProvider {
  const f = opts.fetchImpl ?? fetch;
  const api = mode === "live" ? LIVE_API : SANDBOX_API;

  async function call<T = Obj>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: Obj, allow404 = false): Promise<T | null> {
    let res: Response;
    try {
      res = await f(`${api}${path}`, {
        method,
        headers: { access_token: opts.apiKey, "Content-Type": "application/json", "User-Agent": "StaziaMed-Revalida" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      // nunca repassa a mensagem crua (poderia conter cabeçalhos); só o tipo do erro
      throw new ProviderError(`Asaas fora do ar (${(e as Error)?.name ?? "erro"}).`, 502, "network");
    }
    if (res.status === 404 && allow404) return null;
    const json = (await res.json().catch(() => ({}))) as Obj;
    if (!res.ok) {
      const first = Array.isArray(json?.errors) ? json.errors[0] : null;
      const code = String(first?.code ?? `HTTP_${res.status}`).slice(0, 60);
      const desc = String(first?.description ?? "").replaceAll(opts.apiKey, "[chave]").slice(0, 200);
      throw new ProviderError(`Asaas ${res.status}: ${code}${desc ? ` - ${desc}` : ""}`, res.status >= 500 ? 502 : 400, code);
    }
    return json as T;
  }

  const noLateFees = { fine: { value: 0 }, interest: { value: 0 } };
  const callbackFor = (url: string) => (opts.returnUrls ? { callback: { successUrl: url, autoRedirect: true } } : {});

  async function pixOf(id: string) {
    const q = await call<Obj>("GET", `/payments/${id}/pixQrCode`);
    return q?.payload ? { payload: String(q.payload), image: String(q.encodedImage ?? ""), expiresAt: q.expirationDate ? String(q.expirationDate) : null } : null;
  }

  return {
    name: "asaas",
    mode,
    capabilities: { methods: { card: true, pix: true, debit: true }, partialRefund: true, requiresAddress: Boolean(opts.nfse), invoices: Boolean(opts.nfse) },

    async ensureCustomer(input: CustomerInput) {
      const found = await call<Obj>("GET", `/customers?externalReference=${encodeURIComponent(input.userId)}&limit=1`);
      const c = Array.isArray(found?.data) ? found!.data.find((x: Obj) => !x.deleted) : null;
      if (c?.id) {
        const novoEndereco = input.postalCode && (String(c.postalCode ?? "") !== input.postalCode || String(c.addressNumber ?? "") !== input.addressNumber);
        if (String(c.cpfCnpj ?? "") !== input.document || c.name !== input.name || novoEndereco) {
          await call("PUT", `/customers/${c.id}`, { name: input.name, cpfCnpj: input.document, ...(novoEndereco ? { postalCode: input.postalCode, addressNumber: input.addressNumber } : {}) });
        }
        return String(c.id);
      }
      const created = await call<Obj>("POST", "/customers", {
        name: input.name,
        cpfCnpj: input.document,
        email: input.email,
        externalReference: input.userId,
        // nota fiscal: o Asaas completa rua, bairro e cidade pelo CEP (testado no sandbox 17/10)
        ...(input.postalCode ? { postalCode: input.postalCode, addressNumber: input.addressNumber } : {}),
        // os avisos ao aluno são NOSSOS (e-mail + aviso no app 7/3/1 dia): os do Asaas ficam desligados para não duplicar
        notificationDisabled: true,
      });
      if (!created?.id) throw new ProviderError("Asaas não devolveu o cliente.");
      return String(created.id);
    },

    async createCharge(input: ChargeInput): Promise<ChargeCreated> {
      const p = await call<Obj>("POST", "/payments", {
        customer: input.customerId,
        // débito: a API não tem tipo "débito" (DEBIT_CARD é recusado na criação); a cobrança é de cartão e o aluno escolhe
        // "Cartão de Débito" na página do Asaas, que a paga como DEBIT_CARD (testado no sandbox 17/10)
        billingType: input.method === "pix" ? "PIX" : "CREDIT_CARD",
        value: reais(input.amountCents),
        dueDate: input.dueDate,
        description: input.description.slice(0, 500),
        externalReference: input.reference,
        ...noLateFees,
        ...callbackFor(input.returnUrl),
      });
      if (!p?.id || !p.invoiceUrl) throw new ProviderError("Asaas não devolveu a cobrança.");
      return { chargeId: String(p.id), url: String(p.invoiceUrl), pix: input.method === "pix" ? await pixOf(String(p.id)) : null };
    },

    async createCardSubscription(input: SubscriptionInput) {
      const s = await call<Obj>("POST", "/subscriptions", {
        customer: input.customerId,
        billingType: "CREDIT_CARD",
        value: reais(input.amountCents),
        nextDueDate: input.firstDueDate,
        cycle: input.cycle === "quarterly" ? "QUARTERLY" : "MONTHLY",
        description: input.description.slice(0, 500),
        externalReference: input.reference,
        ...noLateFees,
        ...callbackFor(input.returnUrl),
      });
      if (!s?.id) throw new ProviderError("Asaas não devolveu a assinatura.");
      const list = await call<Obj>("GET", `/subscriptions/${s.id}/payments`);
      const first = Array.isArray(list?.data) ? list!.data[0] : null;
      if (!first?.id || !first.invoiceUrl) {
        await call("DELETE", `/subscriptions/${s.id}`, undefined, true).catch(() => undefined);
        throw new ProviderError("Asaas não gerou a primeira cobrança da assinatura.");
      }
      return { subscriptionId: String(s.id), chargeId: String(first.id), url: String(first.invoiceUrl), pix: null };
    },

    async payChargeByPix(chargeId: string, dueDate: string) {
      // testado no sandbox (17/10): a cobrança da assinatura do cartão vira Pix, é paga, e a assinatura continua no cartão
      if (!ID.test(chargeId)) throw new ProviderError("Cobrança inválida.", 400);
      const p = await call<Obj>("PUT", `/payments/${encodeURIComponent(chargeId)}`, { billingType: "PIX", dueDate });
      if (!p?.id || p.billingType !== "PIX") throw new ProviderError("Asaas não trocou a cobrança para Pix.");
      return { chargeId: String(p.id), url: String(p.invoiceUrl ?? ""), pix: await pixOf(String(p.id)) };
    },

    async getCharge(chargeId: string) {
      if (!ID.test(chargeId)) return null;
      const p = await call<Obj>("GET", `/payments/${encodeURIComponent(chargeId)}`, undefined, true);
      return p?.id ? toProviderCharge(p) : null;
    },

    async cancelCharge(chargeId: string) {
      if (!ID.test(chargeId)) return;
      const p = await call<Obj>("GET", `/payments/${encodeURIComponent(chargeId)}`, undefined, true);
      if (!p?.id || p.deleted || !["PENDING", "OVERDUE"].includes(String(p.status))) return;
      await call("DELETE", `/payments/${encodeURIComponent(chargeId)}`, undefined, true);
    },

    async refund(chargeId: string, amountCents?: number) {
      if (!ID.test(chargeId)) throw new ProviderError("Cobrança inválida.", 400);
      const r = await call<Obj>("POST", `/payments/${encodeURIComponent(chargeId)}/refund`, amountCents ? { value: reais(amountCents) } : {});
      const last = Array.isArray(r?.refunds) ? r!.refunds[r!.refunds.length - 1] : null;
      return { status: r?.status === "REFUNDED" || last?.status === "DONE" ? "done" : "pending" };
    },

    async cancelSubscription(subscriptionId: string) {
      if (!ID.test(subscriptionId)) return;
      await call("DELETE", `/subscriptions/${encodeURIComponent(subscriptionId)}`, undefined, true);
    },

    parseNotice(rawBody: Buffer, headers): ProviderNotice {
      const h = headers["asaas-access-token"];
      if (!webhookTokenMatches(opts.webhookToken, Array.isArray(h) ? h[0] : h)) throw new BillingSignatureError();
      let body: Obj;
      try {
        body = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw new BillingSignatureError("Aviso ilegível.");
      }
      const event = String(body?.event ?? "").slice(0, 60);
      const chargeId = body?.payment?.id ? String(body.payment.id) : null;
      const eventId = String(body?.id ?? `${event}:${chargeId ?? body?.subscription?.id ?? "?"}:${body?.payment?.status ?? ""}`).slice(0, 200);
      if (event.startsWith("PAYMENT_") && chargeId) {
        const failReason = event === "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED" ? "card_refused" : event === "PAYMENT_REPROVED_BY_RISK_ANALYSIS" ? "risk_rejected" : null;
        return { kind: "charge", eventId, event, chargeId, subscriptionId: body.payment.subscription ? String(body.payment.subscription) : null, ...(failReason ? { failed: true, failReason } : {}) };
      }
      // nota fiscal (INVOICE_AUTHORIZED, INVOICE_CANCELED...): na conta principal chegam também as notas do StaziaTech; o núcleo
      // relê a nota e só guarda a de um pagamento do app
      if (event.startsWith("INVOICE_") && body?.invoice?.id) {
        return { kind: "invoice", eventId, event, invoiceId: String(body.invoice.id) };
      }
      if ((event === "SUBSCRIPTION_DELETED" || event === "SUBSCRIPTION_INACTIVATED") && body?.subscription?.id) {
        return { kind: "subscription_ended", eventId, event, subscriptionId: String(body.subscription.id) };
      }
      return { kind: "ignored", eventId, event };
    },

    async getInvoice(invoiceId: string) {
      if (!ID.test(invoiceId)) return null;
      const i = await call<Obj>("GET", `/invoices/${encodeURIComponent(invoiceId)}`, undefined, true);
      return i?.id ? toProviderInvoice(i) : null;
    },

    async listInvoices(chargeId: string) {
      if (!ID.test(chargeId)) return [];
      const list = await call<Obj>("GET", `/invoices?payment=${encodeURIComponent(chargeId)}`);
      return (Array.isArray(list?.data) ? list!.data : []).filter((i: Obj) => i?.id).map(toProviderInvoice);
    },

    async afterRefunded(charge) {
      // devolução total: a nota fiscal daquele pagamento é cancelada (testado no sandbox: AUTHORIZED → PROCESSING_CANCELLATION)
      if (!opts.nfse || charge.status !== "refunded") return;
      const list = await call<Obj>("GET", `/invoices?payment=${encodeURIComponent(charge.id)}`);
      for (const inv of Array.isArray(list?.data) ? list!.data : []) {
        if (["SCHEDULED", "SYNCHRONIZED", "AUTHORIZED"].includes(String(inv.status)) && ID.test(String(inv.id))) {
          await call("POST", `/invoices/${encodeURIComponent(String(inv.id))}/cancel`, {});
        }
      }
    },

    async afterPaid(charge, description) {
      // NFS-e: só com o serviço configurado (ASAAS_NFSE_SERVICE_CODE ou _ID, e _NAME); sem isso, nenhuma nota é pedida por aqui
      const nfse = opts.nfse;
      if (!(nfse?.serviceId || nfse?.serviceCode) || !nfse.serviceName) return;
      const existing = await call<Obj>("GET", `/invoices?payment=${encodeURIComponent(charge.id)}`);
      // já tem nota (agendada, autorizada, cancelada...): não pede outra. A que voltou com ERRO não conta: a tarefa de hora em hora
      // pede de novo (013860)
      if (Array.isArray(existing?.data) && existing!.data.some((i: Obj) => String(i?.status) !== "ERROR")) return;
      await call("POST", "/invoices", {
        payment: charge.id,
        serviceDescription: description.slice(0, 250),
        observations: (nfse.observations || OBSERVACAO_PADRAO).slice(0, 250),
        value: reais(charge.amountCents),
        deductions: 0,
        effectiveDate: charge.paidAt ? charge.paidAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        ...(nfse.serviceCode ? { municipalServiceCode: nfse.serviceCode } : { municipalServiceId: nfse.serviceId }),
        municipalServiceName: nfse.serviceName,
        // Simples Nacional: PIS, COFINS, CSLL, IR e INSS vão no DAS (zero na nota); ISS = alíquota da faixa, definida pelo contador
        taxes: { retainIss: Boolean(nfse.retainIss), iss: nfse.iss ?? 0, cofins: 0, csll: 0, inss: 0, ir: 0, pis: 0, ...(nfse.nbsCode ? { nbsCode: nfse.nbsCode } : {}) },
      });
    },
  };
}
