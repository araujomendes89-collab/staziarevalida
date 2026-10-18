// @vitest-environment node
/**
 * Adaptador do Asaas contra RESPOSTAS REAIS do sandbox (gravadas em 17/10/2026, dados fictícios; fixtures/asaas-sandbox).
 * Sem rede: um fetch falso devolve a resposta gravada de cada chamada. Confere: liga/desliga pelas chaves, token do aviso em
 * tempo constante, tradução das situações (Pix pago, cartão pago, devolvido, devolução aguardando autorização), criação de Pix
 * com QR Code, assinatura no cartão sem o cartão (página do Asaas), cartão recusado e que a chave nunca vaza nas mensagens.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { asaasInvoiceStatus, asaasProvider, asaasStatus, createAsaasProvider, toProviderCharge, toProviderInvoice, webhookTokenMatches } from "../../server/billing/asaasAdapter";
import { BillingSignatureError, ProviderError } from "../../server/billing/provider";
import { descricaoDaNota } from "../../server/billing/nota";

const FIX = path.join(__dirname, "fixtures/asaas-sandbox");
const fx = (name: string) => JSON.parse(fs.readFileSync(path.join(FIX, `${name}.json`), "utf8"));
const KEY = "$aact_hmlg_000000000000000000000000000000000000chave_falsa";
const TOKEN = "token_do_aviso_de_teste_com_mais_de_32_caracteres_ok";

type Call = { url: string; method: string; body: any; headers: Record<string, string> };
function fakeFetch(routes: [RegExp, string, any, number?][]) {
  const calls: Call[] = [];
  const f: typeof fetch = async (url, init) => {
    const u = String(url);
    const method = String(init?.method ?? "GET");
    calls.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: (init?.headers ?? {}) as Record<string, string> });
    const hit = routes.find(([re, m]) => m === method && re.test(u));
    if (!hit) return new Response("", { status: 404 });
    return new Response(JSON.stringify(hit[2]), { status: hit[3] ?? 200, headers: { "Content-Type": "application/json" } });
  };
  return { f, calls };
}

describe("ligar e desligar pelas chaves", () => {
  it("sem chave, sem token válido ou chave de produção sem ordem = desligado", () => {
    expect(createAsaasProvider({})).toBeNull();
    expect(createAsaasProvider({ ASAAS_API_KEY: KEY })).toBeNull(); // sem token do aviso
    expect(createAsaasProvider({ ASAAS_API_KEY: KEY, ASAAS_WEBHOOK_TOKEN: "curto" })).toBeNull();
    expect(createAsaasProvider({ ASAAS_API_KEY: "$aact_prod_xyz", ASAAS_WEBHOOK_TOKEN: TOKEN })).toBeNull();
    expect(createAsaasProvider({ ASAAS_API_KEY: "qualquer", ASAAS_WEBHOOK_TOKEN: TOKEN })).toBeNull();
    expect(createAsaasProvider({ ASAAS_API_KEY: KEY, ASAAS_WEBHOOK_TOKEN: TOKEN })?.mode).toBe("test");
    expect(createAsaasProvider({ ASAAS_API_KEY: "$aact_prod_xyz", ASAAS_WEBHOOK_TOKEN: TOKEN, ASAAS_ALLOW_LIVE: "1" })?.mode).toBe("live");
  });

  it("só Pix e cartão (sem boleto)", () => {
    const p = createAsaasProvider({ ASAAS_API_KEY: KEY, ASAAS_WEBHOOK_TOKEN: TOKEN })!;
    expect(p.capabilities.methods).toEqual({ card: true, pix: true, debit: true });
  });
});

describe("aviso (webhook)", () => {
  const p = asaasProvider({ apiKey: KEY, webhookToken: TOKEN });
  const body = (o: unknown) => Buffer.from(JSON.stringify(o));
  const pago = { id: "evt_1", event: "PAYMENT_RECEIVED", payment: fx("32-pix-boost-simular-pagamento").resposta };

  it("token conferido em tempo constante; errado, ausente ou repetido em lista não passa", () => {
    expect(webhookTokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(webhookTokenMatches(TOKEN, TOKEN + "x")).toBe(false);
    expect(webhookTokenMatches(TOKEN, undefined)).toBe(false);
    expect(webhookTokenMatches("curto", "curto")).toBe(false);
    expect(() => p.parseNotice(body(pago), {})).toThrow(BillingSignatureError);
    expect(() => p.parseNotice(body(pago), { "asaas-access-token": "errado" })).toThrow(BillingSignatureError);
    expect(() => p.parseNotice(body(pago), { "asaas-access-token": [TOKEN] })).not.toThrow();
  });

  it("traduz o aviso SEM decidir nada (o núcleo relê a cobrança)", () => {
    const n = p.parseNotice(body(pago), { "asaas-access-token": TOKEN });
    expect(n).toEqual({ kind: "charge", eventId: "evt_1", event: "PAYMENT_RECEIVED", chargeId: "pay_a83tjrw20pc5c5xf", subscriptionId: null });
    const fim = p.parseNotice(body({ id: "evt_2", event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_kcjrcccayp7mfz68" } }), { "asaas-access-token": TOKEN });
    expect(fim).toEqual({ kind: "subscription_ended", eventId: "evt_2", event: "SUBSCRIPTION_DELETED", subscriptionId: "sub_kcjrcccayp7mfz68" });
    expect(p.parseNotice(body({ id: "evt_3", event: "INVOICE_CREATED" }), { "asaas-access-token": TOKEN }).kind).toBe("ignored");
    const recusa = p.parseNotice(body({ id: "evt_4", event: "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", payment: { id: "pay_x", subscription: "sub_y" } }), { "asaas-access-token": TOKEN });
    expect(recusa).toMatchObject({ kind: "charge", chargeId: "pay_x", subscriptionId: "sub_y", failed: true, failReason: "card_refused" });
    const risco = p.parseNotice(body({ id: "evt_5", event: "PAYMENT_REPROVED_BY_RISK_ANALYSIS", payment: { id: "pay_x" } }), { "asaas-access-token": TOKEN });
    expect(risco).toMatchObject({ kind: "charge", chargeId: "pay_x", failed: true, failReason: "risk_rejected" });
    expect(() => p.parseNotice(Buffer.from("{nao é json"), { "asaas-access-token": TOKEN })).toThrow(BillingSignatureError);
  });
});

describe("situações reais do sandbox", () => {
  it("Pix criado pendente, Pix pago, cartão confirmado", () => {
    expect(toProviderCharge(fx("30-pix-boost-criar").resposta)).toMatchObject({ status: "pending", method: "pix", amountCents: 2490, externalReference: "staziamed-teste:boost-1" });
    const pix = toProviderCharge(fx("32-pix-boost-simular-pagamento").resposta);
    expect(pix).toMatchObject({ status: "paid", method: "pix", amountCents: 2490, dueDate: "2026-10-18", installments: false });
    expect(pix.paidAt?.toISOString()).toBe("2026-10-17T15:00:00.000Z");
    const cartao = toProviderCharge(fx("44-assinatura-sem-cartao-paga").resposta);
    expect(cartao).toMatchObject({ status: "paid", method: "card", amountCents: 9990, subscriptionId: "sub_bnow4hhr2o0ikjui" });
  });

  it("devolução: cartão devolvido na hora; Pix aguardando autorização no painel continua pago", () => {
    expect(asaasStatus(fx("84-estorno-total-cartao-pro").resposta)).toBe("refunded");
    expect(toProviderCharge(fx("84-estorno-total-cartao-pro").resposta).refundedCents).toBe(9990);
    expect(asaasStatus(fx("80-estorno-total-pix-boost").resposta)).toBe("paid");
    expect(asaasStatus(fx("83-estorno-parcial-pix").resposta)).toBe("paid");
    // devolução parcial concluída
    const parcial = { ...fx("83-estorno-parcial-pix").resposta, refunds: [{ status: "DONE", value: 80.91 }] };
    expect(asaasStatus(parcial)).toBe("partially_refunded");
    expect(toProviderCharge(parcial).refundedCents).toBe(8091);
  });

  it("débito: não há tipo próprio na criação; pago na página volta como DEBIT_CARD e é reconhecido", () => {
    expect(fx("177-tipo-debit-card")).toMatchObject({ status: 400, resposta: { errors: [{ code: "invalid_billingType" }] } });
    expect(toProviderCharge(fx("179-pago-no-debito").resposta)).toMatchObject({ status: "paid", method: "debit", amountCents: 9990 });
    expect(createAsaasProvider({ ASAAS_API_KEY: KEY, ASAAS_WEBHOOK_TOKEN: TOKEN })!.capabilities.methods.debit).toBe(true);
  });

  it("assinatura trimestral é à vista (o Asaas ignora parcelas na assinatura)", () => {
    const c = fx("54-assinatura-trimestral-parcelada-cobrancas").resposta.data[0];
    expect(toProviderCharge(c)).toMatchObject({ amountCents: 26970, installments: false, status: "paid" });
  });
});

describe("chamadas à API", () => {
  it("Pix: cria a cobrança sem multa nem juros, à vista, e traz o QR Code", async () => {
    const { f, calls } = fakeFetch([
      [/\/payments$/, "POST", fx("30-pix-boost-criar").resposta],
      [/\/payments\/pay_a83tjrw20pc5c5xf\/pixQrCode$/, "GET", { success: true, encodedImage: "iVBOR", payload: "000201abc", expirationDate: "2027-10-18 23:59:59" }],
    ]);
    const p = asaasProvider({ apiKey: KEY, webhookToken: TOKEN, fetchImpl: f });
    const r = await p.createCharge({ customerId: "cus_1", method: "pix", amountCents: 2490, description: "StaziaMed IA Boost", reference: "smp:abc", dueDate: "2026-10-17", returnUrl: "https://app/x" });
    expect(r).toEqual({ chargeId: "pay_a83tjrw20pc5c5xf", url: "https://sandbox.asaas.com/i/a83tjrw20pc5c5xf", pix: { payload: "000201abc", image: "iVBOR", expiresAt: "2027-10-18 23:59:59" } });
    const body = calls[0].body;
    expect(body).toMatchObject({ billingType: "PIX", value: 24.9, fine: { value: 0 }, interest: { value: 0 }, externalReference: "smp:abc" });
    expect(body.installmentCount).toBeUndefined();
    expect(body.callback).toBeUndefined(); // só com ASAAS_RETURN_URL=1 (precisa do site cadastrado no Asaas)
    expect(calls[0].headers.access_token).toBe(KEY);
    expect(calls[0].url.startsWith("https://api-sandbox.asaas.com/v3/")).toBe(true);
  });

  it("cartão: assinatura sem o cartão; o aluno paga a 1ª cobrança na página do Asaas", async () => {
    const { f, calls } = fakeFetch([
      [/\/subscriptions$/, "POST", fx("42-assinatura-pro-sem-cartao").resposta],
      [/\/subscriptions\/sub_bnow4hhr2o0ikjui\/payments$/, "GET", fx("43-assinatura-sem-cartao-cobranca").resposta],
    ]);
    const p = asaasProvider({ apiKey: KEY, webhookToken: TOKEN, fetchImpl: f });
    const r = await p.createCardSubscription({ customerId: "cus_1", amountCents: 26970, cycle: "quarterly", description: "StaziaMed PRO trimestral", reference: "smp:x", firstDueDate: "2026-10-17", returnUrl: "https://app/x" });
    expect(r).toMatchObject({ subscriptionId: "sub_bnow4hhr2o0ikjui", chargeId: "pay_vkh91eri93ms55u1", url: "https://sandbox.asaas.com/i/vkh91eri93ms55u1" });
    expect(calls[0].body).toMatchObject({ billingType: "CREDIT_CARD", cycle: "QUARTERLY", value: 269.7, nextDueDate: "2026-10-17" });
    expect(calls[0].body.creditCard).toBeUndefined(); // o cartão nunca passa pelo nosso servidor
  });

  it("cartão recusado e erros: mensagem do Asaas, nunca a chave", async () => {
    const recusado = fx("70-cartao-recusado-avulso");
    const { f } = fakeFetch([[/\/payments$/, "POST", { errors: [{ code: "invalid_action", description: `${recusado.resposta.errors[0].description} ${KEY}` }] }, 400]]);
    const p = asaasProvider({ apiKey: KEY, webhookToken: TOKEN, fetchImpl: f });
    const e = await p.createCharge({ customerId: "c", method: "card", amountCents: 9990, description: "x", reference: "smp:y", dueDate: "2026-10-17", returnUrl: "https://a" }).catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.code).toBe("invalid_action");
    expect(e.message).toContain("Transação não autorizada");
    expect(e.message).not.toContain(KEY);
    const down = asaasProvider({ apiKey: KEY, webhookToken: TOKEN, fetchImpl: async () => { throw new Error(`falhou com ${KEY}`); } });
    const e2 = await down.getCharge("pay_1").catch((x) => x);
    expect(String(e2.message)).not.toContain(KEY);
  });

  it("cobrança de outra conta (404) = null; devolução total e parcial", async () => {
    const { f, calls } = fakeFetch([
      [/\/payments\/pay_jdm7q88423fwlj55\/refund$/, "POST", fx("84-estorno-total-cartao-pro").resposta],
      [/\/payments\/pay_0z4t2997qg6rqgre\/refund$/, "POST", fx("83-estorno-parcial-pix").resposta],
    ]);
    const p = asaasProvider({ apiKey: KEY, webhookToken: TOKEN, fetchImpl: f });
    expect(await p.getCharge("pay_desconhecida")).toBeNull();
    expect(await p.getCharge("../../x")).toBeNull();
    expect(await p.refund("pay_jdm7q88423fwlj55")).toEqual({ status: "done" });
    expect(await p.refund("pay_0z4t2997qg6rqgre", 8091)).toEqual({ status: "pending" }); // Pix: aguarda autorização no painel
    expect(calls.find((c) => c.url.includes("pay_0z4t"))?.body).toEqual({ value: 80.91 });
  });

  it("renovação recusada vira Pix na MESMA cobrança (resposta real do sandbox)", async () => {
    const { f, calls } = fakeFetch([
      [/\/payments\/pay_yx5q0ebtqlvlecgg$/, "PUT", fx("162-trocar-para-pix").resposta],
      [/\/payments\/pay_yx5q0ebtqlvlecgg\/pixQrCode$/, "GET", { payload: "000201x", encodedImage: "img", expirationDate: null }],
    ]);
    const p = asaasProvider({ apiKey: KEY, webhookToken: TOKEN, fetchImpl: f });
    const r = await p.payChargeByPix("pay_yx5q0ebtqlvlecgg", "2026-10-17");
    expect(r).toMatchObject({ chargeId: "pay_yx5q0ebtqlvlecgg", pix: { payload: "000201x" } });
    expect(calls[0].body).toEqual({ billingType: "PIX", dueDate: "2026-10-17" });
    expect(fx("164-pix-pago-cobranca-trocada").resposta).toMatchObject({ status: "RECEIVED", billingType: "PIX", subscription: "sub_1jlkaaoo4uy3hlh2" });
    expect(fx("165-assinatura-depois").resposta).toMatchObject({ status: "ACTIVE", billingType: "CREDIT_CARD", nextDueDate: "2026-11-17" });
  });

  it("nota fiscal: pede a NFS-e uma vez por pagamento, com o código nacional e o NBS (Curitiba = Portal Nacional)", async () => {
    const env = { ASAAS_API_KEY: KEY, ASAAS_WEBHOOK_TOKEN: TOKEN, ASAAS_NFSE_SERVICE_CODE: "080201", ASAAS_NFSE_SERVICE_NAME: "Instrução, treinamento, orientação pedagógica e educacional", ASAAS_NFSE_NBS: "122051900", ASAAS_NFSE_ISS: "2.01" };
    const { f, calls } = fakeFetch([
      [/\/invoices\?payment=pay_ja$/, "GET", { data: [{ id: "inv_1" }] }],
      [/\/invoices\?payment=pay_novo$/, "GET", { data: [] }],
      [/\/invoices$/, "POST", { id: "inv_2", status: "SCHEDULED" }],
    ]);
    const p = createAsaasProvider(env, f)!;
    const pago = { ...toProviderCharge(fx("32-pix-boost-simular-pagamento").resposta) };
    await p.afterPaid!({ ...pago, id: "pay_ja" }, "StaziaMed");
    await p.afterPaid!({ ...pago, id: "pay_novo" }, "Acesso à plataforma StaziaMed Revalida - plano PRO trimestral");
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ payment: "pay_novo", municipalServiceCode: "080201", value: 24.9, effectiveDate: "2026-10-17", taxes: { iss: 2.01, nbsCode: "122051900", pis: 0, cofins: 0, retainIss: false } });
    expect(posts[0].body.observations).toContain("Simples Nacional (Anexo III)");
    expect(posts[0].body.municipalServiceId).toBeUndefined();
    // sem configuração: nenhuma nota pedida por aqui
    const { f: f2, calls: c2 } = fakeFetch([]);
    await createAsaasProvider({ ASAAS_API_KEY: KEY, ASAAS_WEBHOOK_TOKEN: TOKEN }, f2)!.afterPaid!(pago, "x");
    expect(c2).toHaveLength(0);
  });

  it("texto da nota (decisão do dono: curso preparatório para o Revalida)", () => {
    expect(descricaoDaNota({ tipo: "plano", codigo: "pro", ciclo: "trimestral" })).toBe("Assinatura de plataforma de preparação para o Revalida – plano PRO (trimestral)");
    expect(descricaoDaNota({ tipo: "plano", codigo: "pro", ciclo: "mensal" })).toBe("Assinatura de plataforma de preparação para o Revalida – plano PRO (mensal)");
    expect(descricaoDaNota({ tipo: "extra", codigo: "boost", ciclo: "avulso", nome: "IA Boost" })).toBe("Pacote extra de IA (IA Boost) – plataforma de preparação para o Revalida");
  });

  it("nota: com a nota ligada pede endereço; devolução total cancela a nota (só as válidas)", async () => {
    const env = { ASAAS_API_KEY: KEY, ASAAS_WEBHOOK_TOKEN: TOKEN, ASAAS_NFSE_SERVICE_CODE: "08.02.01", ASAAS_NFSE_SERVICE_NAME: "Instrução", ASAAS_NFSE_NBS: "1.2205.19.00" };
    const { f, calls } = fakeFetch([
      [/\/invoices\?payment=pay_dev$/, "GET", { data: [{ id: "inv_000000590510", status: "AUTHORIZED" }, { id: "inv_000000000002", status: "CANCELED" }] }],
      [/\/invoices\/inv_000000590510\/cancel$/, "POST", fx("191-nota-cancelar").resposta],
      [/\/customers\?externalReference=/, "GET", { data: [] }],
      [/\/customers$/, "POST", { id: "cus_n" }],
    ]);
    const p = createAsaasProvider(env, f)!;
    expect(p.capabilities.requiresAddress).toBe(true);
    expect(createAsaasProvider({ ASAAS_API_KEY: KEY, ASAAS_WEBHOOK_TOKEN: TOKEN })!.capabilities.requiresAddress).toBe(false);
    const dev = { ...toProviderCharge(fx("84-estorno-total-cartao-pro").resposta), id: "pay_dev" };
    await p.afterRefunded!(dev);
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["https://api-sandbox.asaas.com/v3/invoices/inv_000000590510/cancel"]);
    await p.ensureCustomer({ userId: "u9", email: "a@b.dev", name: "Aluno", document: "36638544691", postalCode: "80010000", addressNumber: "100" });
    expect(calls.at(-1)!.body).toMatchObject({ postalCode: "80010000", addressNumber: "100", notificationDisabled: true });
    // respostas reais: nota agendada com código "08.02.01" e NBS com pontos, emitida no sandbox
    expect(fx("187-nota-depois-do-cep").resposta).toMatchObject({ status: "SCHEDULED", municipalServiceCode: "08.02.01" });
    expect(fx("189-nota-depois").resposta).toMatchObject({ status: "AUTHORIZED" });
  });

  it("cancelar cobrança só se ainda não paga", async () => {
    const { f, calls } = fakeFetch([
      [/\/payments\/pay_pago$/, "GET", { ...fx("32-pix-boost-simular-pagamento").resposta, id: "pay_pago" }],
      [/\/payments\/pay_aberto$/, "GET", { ...fx("30-pix-boost-criar").resposta, id: "pay_aberto" }],
      [/\/payments\/pay_aberto$/, "DELETE", { deleted: true }],
    ]);
    const p = asaasProvider({ apiKey: KEY, webhookToken: TOKEN, fetchImpl: f });
    await p.cancelCharge("pay_pago");
    await p.cancelCharge("pay_aberto");
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["https://api-sandbox.asaas.com/v3/payments/pay_aberto"]);
  });

  it("cliente novo com os avisos do Asaas desligados (os avisos são nossos)", async () => {
    const { f, calls } = fakeFetch([
      [/\/customers\?externalReference=/, "GET", { data: [] }],
      [/\/customers$/, "POST", { id: "cus_novo" }],
    ]);
    const p = asaasProvider({ apiKey: KEY, webhookToken: TOKEN, fetchImpl: f });
    expect(await p.ensureCustomer({ userId: "u1", email: "a@b.dev", name: "Aluno Teste", document: "36638544691" })).toBe("cus_novo");
    expect(calls[1].body).toMatchObject({ notificationDisabled: true, externalReference: "u1", cpfCnpj: "36638544691" });
  });
});

describe("nota fiscal: aviso INVOICE_* e leitura da nota (013850)", () => {
  const nota = fx("189-nota-depois").resposta;
  const NFSE = { serviceCode: "08.02.01", serviceName: "Instrução", iss: 2.01 };

  it("o aviso da nota vira 'invoice' (o núcleo relê a nota); sem id da nota continua ignorado", () => {
    const p = asaasProvider({ apiKey: KEY, webhookToken: TOKEN });
    const n = p.parseNotice(Buffer.from(JSON.stringify({ id: "evt_9", event: "INVOICE_AUTHORIZED", invoice: nota })), { "asaas-access-token": TOKEN });
    expect(n).toEqual({ kind: "invoice", eventId: "evt_9", event: "INVOICE_AUTHORIZED", invoiceId: "inv_000000590510" });
    expect(p.parseNotice(Buffer.from(JSON.stringify({ id: "evt_10", event: "INVOICE_CANCELED" })), { "asaas-access-token": TOKEN }).kind).toBe("ignored");
  });

  it("traduz a nota real do sandbox: autorizada, com o PDF, o número e a cobrança", () => {
    expect(toProviderInvoice(nota)).toEqual({ id: "inv_000000590510", status: "autorizada", chargeId: "pay_b8agr0lj3ghifywt", pdfUrl: nota.pdfUrl, numero: "590510" });
    expect(["SCHEDULED", "SYNCHRONIZED", "AUTHORIZED", "PROCESSING_CANCELLATION", "CANCELED", "CANCELLATION_DENIED", "ERROR"].map(asaasInvoiceStatus))
      .toEqual(["agendada", "agendada", "autorizada", "cancelando", "cancelada", "autorizada", "erro"]);
    expect(toProviderInvoice({ ...nota, pdfUrl: "http://inseguro/x.pdf" }).pdfUrl).toBeNull();
  });

  it("lê a nota e as notas de uma cobrança pela API; nota de outra conta (404) = null", async () => {
    const { f, calls } = fakeFetch([
      [/\/invoices\/inv_000000590510$/, "GET", nota],
      [/\/invoices\?payment=pay_b8agr0lj3ghifywt/, "GET", { data: [nota] }],
    ]);
    const p = asaasProvider({ apiKey: KEY, webhookToken: TOKEN, nfse: NFSE, fetchImpl: f });
    expect(p.capabilities.invoices).toBe(true);
    expect((await p.getInvoice!("inv_000000590510"))?.status).toBe("autorizada");
    expect(await p.getInvoice!("inv_de_outra_conta")).toBeNull();
    expect((await p.listInvoices!("pay_b8agr0lj3ghifywt")).map((i) => i.id)).toEqual(["inv_000000590510"]);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(asaasProvider({ apiKey: KEY, webhookToken: TOKEN }).capabilities.invoices).toBe(false);
  });

  it("os avisos do cliente no Asaas (sandbox) não têm evento de nota fiscal: por isso o e-mail da nota é nosso", () => {
    const eventos = fx("21-notificacoes-padrao-cliente").resposta.data.map((x: { event: string }) => x.event);
    expect(eventos.length).toBeGreaterThan(0);
    expect(eventos.some((e: string) => /INVOICE|NOTA|FISCAL/i.test(e))).toBe(false);
  });
});
