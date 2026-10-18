/**
 * Camada de pagamento do StaziaMed, NEUTRA quanto ao fornecedor. O núcleo (core.ts) só conhece estes tipos; cada fornecedor
 * (Asaas hoje; Stripe ou outro amanhã) é um adaptador que sabe criar cobranças, conferir o aviso e LER a cobrança na API dele.
 *
 * Regras do dono (17/10/2026) que valem para qualquer fornecedor:
 *   - só Pix ou cartão de crédito, sempre À VISTA (sem boleto, sem parcelamento);
 *   - cartão: renovação automática no fornecedor (mensal ou trimestral), cobrada no dia do vencimento;
 *   - Pix: uma cobrança por período; a renovação é gerada pelo NOSSO servidor 7 dias antes do vencimento;
 *   - quem libera o acesso é o aviso conferido + a cobrança relida na API do fornecedor (nunca a tela, nunca só o aviso).
 */
/** debit = cartão de débito: sempre à vista, NUNCA renova sozinho (não guarda o cartão; decisão do dono 17/10). */
export type PayMethod = "pix" | "card" | "debit";
export type Cycle = "monthly" | "quarterly";

/** Situação de uma cobrança, traduzida do fornecedor. */
export type ChargeStatus = "pending" | "paid" | "failed" | "overdue" | "refunded" | "partially_refunded" | "canceled";

/** Cobrança lida na API do fornecedor (a fonte da verdade antes de liberar qualquer coisa). */
export interface ProviderCharge {
  id: string;
  status: ChargeStatus;
  method: PayMethod | "other";
  amountCents: number;
  /** Total já devolvido (centavos). */
  refundedCents: number;
  customerId: string | null;
  subscriptionId: string | null;
  /** Referência que NÓS gravamos na cobrança ("smp:<pedido>"); as renovações automáticas do cartão podem vir sem. */
  externalReference: string | null;
  /** Dia do vencimento (AAAA-MM-DD, horário de Brasília). */
  dueDate: string | null;
  paidAt: Date | null;
  /** Parcelada? (nunca deveria: o dono decidiu só à vista). */
  installments: boolean;
  /** Página do comprovante/fatura no fornecedor (https), para o histórico do aluno. Opcional. */
  receiptUrl?: string | null;
}

/** Aviso do fornecedor já conferido (token/assinatura). Não traz decisão: o núcleo relê a cobrança antes de agir. */
export type ProviderNotice =
  /** failed = o fornecedor avisou que a TENTATIVA falhou (ex.: cartão recusado) mesmo que a cobrança continue "pendente" para nova tentativa. */
  | { kind: "charge"; eventId: string; event: string; chargeId: string; subscriptionId: string | null; failed?: boolean }
  | { kind: "subscription_ended"; eventId: string; event: string; subscriptionId: string }
  /** Nota fiscal mudou (emitida, cancelada, erro). O núcleo relê a nota na API antes de guardar ou mandar e-mail. */
  | { kind: "invoice"; eventId: string; event: string; invoiceId: string }
  | { kind: "ignored"; eventId: string; event: string };

/** Situação da nota fiscal, traduzida do fornecedor. */
export type InvoiceStatus = "agendada" | "autorizada" | "cancelando" | "cancelada" | "erro";

/** Nota fiscal lida na API do fornecedor. */
export interface ProviderInvoice {
  id: string;
  status: InvoiceStatus;
  /** Cobrança da nota (null = nota avulsa, não é de um pagamento do app). */
  chargeId: string | null;
  /** PDF da nota (https). */
  pdfUrl: string | null;
  numero: string | null;
}

export interface CustomerInput {
  userId: string;
  email: string;
  name: string;
  /** CPF ou CNPJ só com dígitos (pedido na hora de pagar; vai para o fornecedor, NÃO fica no nosso banco). */
  document: string;
  /** CEP (8 dígitos) e número: exigidos pela nota fiscal (o fornecedor completa rua, bairro e cidade pelo CEP). Também não ficam aqui. */
  postalCode?: string;
  addressNumber?: string;
}

export interface ChargeInput {
  customerId: string;
  method: PayMethod;
  amountCents: number;
  description: string;
  /** "smp:<id do pedido>" */
  reference: string;
  /** Vencimento (AAAA-MM-DD, Brasília). */
  dueDate: string;
  returnUrl: string;
}

export interface SubscriptionInput {
  customerId: string;
  amountCents: number;
  cycle: Cycle;
  description: string;
  reference: string;
  /** Primeira cobrança (AAAA-MM-DD, Brasília): hoje, na compra. */
  firstDueDate: string;
  returnUrl: string;
}

export interface ChargeCreated {
  chargeId: string;
  /** Página do fornecedor para pagar (cartão é digitado SÓ lá; o nosso servidor nunca vê o cartão). */
  url: string;
  pix?: { payload: string; image: string; expiresAt: string | null } | null;
}

export interface ProviderCapabilities {
  methods: { card: boolean; pix: boolean; debit: boolean };
  /** Devolução de parte do valor. */
  partialRefund: boolean;
  /** Nota fiscal ligada: a primeira compra pede CEP e número (o endereço do tomador é obrigatório na NFS-e). */
  requiresAddress: boolean;
  /** O fornecedor emite nota fiscal e deixa ler a nota (getInvoice/listInvoices). */
  invoices?: boolean;
}

export interface PaymentProvider {
  readonly name: string;
  readonly mode: "test" | "live";
  readonly capabilities: ProviderCapabilities;
  /** Cria (ou acha) o cliente no fornecedor. */
  ensureCustomer(input: CustomerInput): Promise<string>;
  /** Cobrança avulsa à vista (extra, ou Pix de um período do plano). */
  createCharge(input: ChargeInput): Promise<ChargeCreated>;
  /** Assinatura no cartão (renovação automática). Devolve a assinatura e a primeira cobrança (paga na página do fornecedor). */
  createCardSubscription(input: SubscriptionInput): Promise<ChargeCreated & { subscriptionId: string }>;
  /** Transforma uma cobrança ainda não paga (ex.: renovação do cartão recusada) em Pix, a MESMA cobrança: sem cobrança em dobro. */
  payChargeByPix(chargeId: string, dueDate: string): Promise<ChargeCreated>;
  /** Lê a cobrança na API (conferência antes de liberar). null = não existe nesta conta. */
  getCharge(chargeId: string): Promise<ProviderCharge | null>;
  /** Cancela uma cobrança ainda não paga (pedido expirado ou cancelado). Já paga/inexistente: não faz nada. */
  cancelCharge(chargeId: string): Promise<void>;
  /** Devolve tudo (sem valor) ou parte (centavos). */
  refund(chargeId: string, amountCents?: number): Promise<{ status: "done" | "pending" }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  /** Confere o aviso (token/assinatura em tempo constante, conta) e o traduz. Inválido: lança BillingSignatureError. */
  parseNotice(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ProviderNotice;
  /** Depois de gravar um pagamento (ex.: nota fiscal). Erro aqui só é registrado; nunca desfaz o pagamento. */
  afterPaid?(charge: ProviderCharge, description: string): Promise<void>;
  /** Depois de uma devolução TOTAL confirmada (ex.: cancelar a nota fiscal daquele pagamento). Erro aqui só é registrado. */
  afterRefunded?(charge: ProviderCharge): Promise<void>;
  /** Lê uma nota fiscal (conferência antes de guardar o link e mandar o e-mail). null = não existe nesta conta. */
  getInvoice?(invoiceId: string): Promise<ProviderInvoice | null>;
  /** Notas de uma cobrança (a tarefa de hora em hora pergunta quando o aviso da nota não chegou). */
  listInvoices?(chargeId: string): Promise<ProviderInvoice[]>;
}

export class BillingSignatureError extends Error {
  constructor(message = "Aviso de pagamento não autenticado.") {
    super(message);
    this.name = "BillingSignatureError";
  }
}

/** Erro do fornecedor, com o código dele (nunca com a chave). */
export class ProviderError extends Error {
  constructor(message: string, public status = 502, public code?: string) {
    super(message);
    this.name = "ProviderError";
  }
}
