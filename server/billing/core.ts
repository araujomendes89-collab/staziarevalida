/**
 * Núcleo da cobrança (sem fornecedor). Decide se a pessoa pode comprar, abre o pedido (um aberto por vez, idempotente), cria a
 * cobrança pelo adaptador e processa os avisos. Grava no banco SÓ por funções do servidor (ch_worker_billing_*, migração 013700).
 *
 * Conferência antes de liberar (regra do dono): o aviso só diz "olhe a cobrança X". O núcleo RELÊ a cobrança na API do
 * fornecedor com a NOSSA chave (cobrança de outra conta não existe para nós = ignorada), acha o pedido dela, confere o valor
 * (o banco recusa valor diferente do pedido) e só então libera o plano ou o extra.
 */
import type { ContentDb, Identity } from "../contentHub/infra";
import { brtDate, cleanDocument, endOfBrtDay, periodEndFor } from "./period";
import { ProviderError, type PaymentProvider, type ProviderCharge, type ProviderNotice } from "./provider";

export class BillingError extends Error {
  constructor(message: string, public status = 400, public code?: string) {
    super(message);
  }
}

export interface BillingDeps {
  db: ContentDb;
  provider: PaymentProvider | null;
  /** Endereço do site (APP_BASE_URL), para onde o pagamento volta. Nunca vem do pedido do navegador. */
  baseUrl: string | null;
  log?: (m: string) => void;
  now?: () => Date;
}

export interface CheckoutBody {
  tipo?: unknown;
  codigo?: unknown;
  ciclo?: unknown;
  metodo?: unknown;
  documento?: unknown;
  nome?: unknown;
  aceite?: unknown;
  idem?: unknown;
}

export interface RequestInfo {
  ip?: string | null;
  userAgent?: string | null;
}

type Pedido = {
  id: string;
  user_id: string;
  tipo: "plano" | "extra";
  codigo: string;
  ciclo: "mensal" | "trimestral" | "avulso";
  metodo: "pix" | "cartao";
  motivo: "compra" | "renovacao";
  nome: string;
  valor_centavos: number;
  status: string;
  url: string | null;
  pix: unknown;
  vencimento: string | null;
  expira_em: string;
  provider_payment_id: string | null;
  provider_subscription_id: string | null;
  repetido?: boolean;
  reaproveitado?: boolean;
};

type Contrato = { user_id: string; plano: string; ciclo: "mensal" | "trimestral"; metodo: "pix" | "cartao"; provider_subscription_id: string | null };

interface Ctx {
  email: string;
  full_access: boolean;
  terms_ok: boolean;
  vendas_ligadas: boolean;
  clientes: Record<string, string>;
  contrato: { plano: string; ciclo: string; metodo: string; renova: boolean; periodo_fim: string } | null;
}

/** Erros do banco no formato "etiqueta: frase" viram resposta 409 com código (a tela mostra a frase). */
function dbError(e: unknown): BillingError | null {
  const m = /([a-z_]{4,40}): (.{3,300})$/.exec(String((e as Error)?.message ?? ""));
  if (!m) return null;
  const known: Record<string, number> = { renovacao_pendente: 409, pedido_vencido: 409, sem_renovacao: 409, ja_no_cartao: 409, renovacao_paga: 409, vendas_desligadas: 503, pedido_aberto: 409, fora_de_venda: 409, ja_assinante: 409, sem_devolucao: 409, devolucao_em_andamento: 409 };
  return m[1] in known ? new BillingError(m[2], known[m[1]], m[1]) : null;
}

const METODO = { pix: "pix", cartao: "card" } as const;
const SAFE_IDEM = /^[A-Za-z0-9_-]{8,100}$/;

export function createBilling(deps: BillingDeps) {
  const { db, provider } = deps;
  const now = () => (deps.now ? deps.now() : new Date());
  const log = (m: string) => deps.log?.(m.slice(0, 300));
  const svc = <T>(fn: string, args: Record<string, unknown>) => db.service<T>(fn, args);

  const need = (): PaymentProvider => {
    if (!provider) throw new BillingError("O pagamento ainda não está disponível.", 503);
    return provider;
  };

  /**
   * Pedidos vencidos (de um aluno, ou de todos na tarefa): confere no fornecedor (pode ter sido pago no último minuto), cancela a
   * cobrança e a assinatura que sobraram, confere DE NOVO e só então encerra. Nunca encerrar só no banco: a cobrança continuaria
   * pagável no fornecedor (cobrança em dobro; revisão 17/10). Erro aqui deixa o pedido aberto para a próxima tentativa.
   */
  async function encerrarVencidos(userId: string | null) {
    const p = need();
    const out = { expirados: 0, erros: 0 };
    for (const v of await svc<{ id: string; provider: string | null; payment_id: string | null; subscription_id: string | null }[]>("ch_worker_billing_pedidos_vencidos", { p_user: userId })) {
      try {
        if (v.provider === p.name) {
          const c = v.payment_id ? await p.getCharge(v.payment_id) : null;
          if (c?.status === "paid") {
            // pago no último minuto: vale o pagamento (erro aqui deixa o pedido aberto e vai para o registro: caso da equipe)
            await processCharge(c.id, v.subscription_id);
          } else {
            if (c) await p.cancelCharge(c.id);
            // a assinatura é cancelada mesmo se a cobrança não existir mais no fornecedor
            if (v.subscription_id) await p.cancelSubscription(v.subscription_id);
            const depois = c ? await p.getCharge(c.id) : null;
            if (depois?.status === "paid") await processCharge(depois.id, v.subscription_id);
          }
        }
        await svc("ch_worker_billing_pedido_encerrar", { p_pedido: v.id, p_status: "expirado", p_erro: "Tempo para pagar acabou", p_user: null });
        out.expirados++;
      } catch (e) {
        out.erros++;
        log(`[billing] pedido vencido ${v.id}: ${(e as Error).message}`);
      }
    }
    return out;
  }

  /** Abre um pedido; se houver um pedido vencido na frente, limpa (no fornecedor) e tenta uma vez de novo. */
  async function abrirPedido(fn: string, args: Record<string, unknown> & { p_user: string }): Promise<Pedido> {
    for (let tentativa = 0; ; tentativa++) {
      try {
        return await svc<Pedido>(fn, args);
      } catch (e) {
        const err = dbError(e);
        if (err?.code === "pedido_vencido" && tentativa === 0) {
          const r = await encerrarVencidos(args.p_user);
          if (r.erros) throw new BillingError("Não foi possível cancelar um pagamento anterior agora. Tente de novo em instantes.", 502);
          continue;
        }
        throw err ?? e;
      }
    }
  }

  /** Grava a cobrança no pedido; se outro clique chegou antes, cancela no fornecedor a que sobrou e usa a gravada. */
  async function anexar(pedido: Pedido, created: { chargeId: string; subscriptionId?: string | null; url: string; pix?: unknown }, extra: { customer: string | null; vencimento: string }) {
    const p = need();
    const ok = await svc<boolean>("ch_worker_billing_pedido_anexar", {
      p_pedido: pedido.id, p_provider: p.name, p_customer: extra.customer, p_payment: created.chargeId, p_subscription: created.subscriptionId ?? null,
      p_url: created.url || null, p_pix: created.pix ?? null, p_vencimento: extra.vencimento,
    });
    if (ok !== false) return { ...pedido, url: created.url || null, pix: (created.pix ?? null) as unknown, vencimento: extra.vencimento, provider_payment_id: created.chargeId };
    if (created.subscriptionId) await p.cancelSubscription(created.subscriptionId).catch((e) => log(`[billing] assinatura que sobrou não cancelada: ${(e as Error).message}`));
    else if (created.chargeId !== pedido.provider_payment_id) await p.cancelCharge(created.chargeId).catch((e) => log(`[billing] cobrança que sobrou não cancelada: ${(e as Error).message}`));
    const atual = await svc<Pedido | null>("ch_worker_billing_pedido", { p_pedido: pedido.id, p_user: null });
    if (atual?.url && atual.status === "aberto") return atual;
    throw new BillingError("Este pagamento já foi aberto em outra janela. Atualize a página.", 409, "pedido_em_andamento");
  }

  async function overview(user: Identity) {
    if (!provider) return { enabled: false };
    const [resumo, ctx, doc] = await Promise.all([
      db.asUser<Record<string, unknown>>(user, "app_billing_resumo", {}),
      svc<Ctx | null>("ch_worker_billing_contexto", { p_user: user.id }),
      // documento do Contrato de Assinatura vigente (013760); sem a migração, o link aponta para os Termos
      svc<{ versao: string | null; url: string } | null>("ch_worker_billing_contrato_doc", {}).catch(() => null),
    ]);
    return {
      enabled: true,
      provider: provider.name,
      mode: provider.mode,
      methods: provider.capabilities.methods,
      // CPF só é pedido quando ainda não há cliente no fornecedor (primeira compra)
      precisa_documento: !ctx?.clientes?.[provider.name],
      contrato_doc: { versao: doc?.versao ?? null, url: doc?.url ?? "/novo/termos" },
      ...(resumo ?? {}),
    };
  }

  /** Compra: abre o pedido (preço do banco), cria a cobrança no fornecedor e devolve a página (cartão) ou o QR Code (Pix). */
  async function checkout(user: Identity, body: CheckoutBody, info: RequestInfo = {}) {
    const p = need();
    if (!deps.baseUrl) throw new BillingError("O pagamento ainda não está disponível.", 503);
    const tipo = body.tipo === "extra" ? "extra" : body.tipo === "plano" ? "plano" : null;
    const codigo = typeof body.codigo === "string" && /^[a-z][a-z0-9_]{1,30}$/.test(body.codigo) ? body.codigo : null;
    const ciclo = tipo === "extra" ? "avulso" : body.ciclo === "trimestral" ? "trimestral" : body.ciclo === "mensal" ? "mensal" : null;
    const metodo = body.metodo === "pix" || body.metodo === "cartao" ? body.metodo : null;
    if (!tipo || !codigo || !ciclo) throw new BillingError("Escolha o que comprar.");
    if (!metodo || !p.capabilities.methods[METODO[metodo]]) throw new BillingError("Forma de pagamento inválida. Use Pix ou cartão de crédito.");
    if (body.aceite !== true) throw new BillingError("Para contratar, marque que leu e aceita o Contrato de Assinatura e os Termos.", 422, "aceite_obrigatorio");
    const idem = typeof body.idem === "string" && SAFE_IDEM.test(body.idem) ? body.idem : null;
    if (!idem) throw new BillingError("Pedido inválido. Atualize a página e tente de novo.");

    const ctx = await svc<Ctx | null>("ch_worker_billing_contexto", { p_user: user.id });
    if (!ctx) throw new BillingError("Conta não encontrada.", 404);
    if (ctx.full_access) throw new BillingError("Sua conta já tem acesso completo; não há o que comprar.", 403);
    if (!ctx.terms_ok) throw new BillingError("Aceite o Termo de uso antes de pagar.", 403);
    if (!ctx.vendas_ligadas) throw new BillingError("As vendas ainda não estão abertas.", 503, "vendas_desligadas");
    // aceite na contratação (clickwrap): sem a versão do Contrato de Assinatura vigente no banco, ninguém contrata
    const doc = await svc<{ versao: string | null } | null>("ch_worker_billing_contrato_doc", {}).catch(() => null);
    if (!doc?.versao) throw new BillingError("A contratação ainda não está aberta: falta publicar o contrato vigente.", 503, "contrato_pendente");

    // CPF/CNPJ só agora (na hora de pagar) e só se ainda não houver cliente no fornecedor. Vai para o fornecedor; não é gravado aqui.
    let customerId = ctx.clientes?.[p.name] ?? null;
    let customerInput: { document: string; name: string } | null = null;
    if (!customerId) {
      const document = cleanDocument(body.documento);
      if (!body.documento) throw new BillingError("Informe seu CPF para continuar.", 422, "documento_obrigatorio");
      if (!document) throw new BillingError("CPF ou CNPJ inválido. Confira os números.", 422, "documento_invalido");
      const name = typeof body.nome === "string" ? body.nome.trim().replace(/\s+/g, " ") : "";
      if (name.length < 3 || name.length > 120) throw new BillingError("Informe seu nome completo, como no documento.", 422, "nome_obrigatorio");
      customerInput = { document, name };
    }

    const pedido = await abrirPedido("ch_worker_billing_pedido_abrir", {
      p_user: user.id, p_tipo: tipo, p_codigo: codigo, p_ciclo: ciclo, p_metodo: metodo, p_motivo: "compra", p_idem: idem,
      p_aceite: { aceito: true, ip: info.ip ?? null, user_agent: (info.userAgent ?? "").slice(0, 300) || null },
      p_renova_ate: null,
    });
    // clique repetido / pedido igual já aberto: devolve o mesmo pagamento (nada novo no fornecedor)
    if (pedido.url) return publicOrder(pedido);
    if (pedido.status !== "aberto") throw new BillingError("Este pedido já foi encerrado. Atualize a página.", 409, "pedido_encerrado");
    // o mesmo clique chegou duas vezes e o primeiro ainda está criando a cobrança: o segundo não cria outra (revisão 17/10)
    if (pedido.repetido || pedido.reaproveitado) throw new BillingError("Seu pagamento está sendo aberto. Aguarde um instante e atualize a página.", 409, "pedido_em_andamento");
    // o aceite também vira prova em legal_acceptances quando o documento do contrato existir no banco (nunca impede a compra)
    if (!pedido.repetido && !pedido.reaproveitado) {
      await svc("ch_worker_billing_aceite_registrar", { p_user: user.id, p_user_agent: (info.userAgent ?? "").slice(0, 300) || null }).catch(() => undefined);
    }

    try {
      if (!customerId) {
        customerId = await p.ensureCustomer({ userId: user.id, email: ctx.email, ...customerInput! });
        await svc("ch_worker_billing_cliente_salvar", { p_user: user.id, p_provider: p.name, p_customer: customerId });
      }
      const returnUrl = `${deps.baseUrl}/novo/planos?pedido=${pedido.id}`;
      const reference = `smp:${pedido.id}`;
      const today = brtDate(now());
      const created =
        tipo === "plano" && metodo === "cartao"
          ? await p.createCardSubscription({ customerId, amountCents: pedido.valor_centavos, cycle: ciclo === "trimestral" ? "quarterly" : "monthly", description: `StaziaMed ${pedido.nome}`, reference, firstDueDate: today, returnUrl })
          : await p.createCharge({ customerId, method: METODO[metodo], amountCents: pedido.valor_centavos, description: `StaziaMed ${pedido.nome}`, reference, dueDate: today, returnUrl });
      const subscriptionId = "subscriptionId" in created ? (created as { subscriptionId: string }).subscriptionId : null;
      return publicOrder(await anexar(pedido, { ...created, subscriptionId }, { customer: customerId, vencimento: today }));
    } catch (e) {
      if (e instanceof BillingError) throw e;
      log(`[billing] checkout falhou: ${(e as Error).message}`);
      await svc("ch_worker_billing_pedido_encerrar", { p_pedido: pedido.id, p_status: "falhou", p_erro: (e as Error).message, p_user: null }).catch(() => undefined);
      if (e instanceof ProviderError && e.code === "invalid_cpfCnpj") throw new BillingError("CPF ou CNPJ recusado pela instituição de pagamento. Confira os números.", 422, "documento_invalido");
      throw new BillingError("Não foi possível abrir o pagamento agora. Tente de novo.", 502);
    }
  }

  /** O Pix que é a PRÓPRIA cobrança da renovação do cartão que falhou (payRenewalByPix): cancelar apagaria a cobrança da assinatura. */
  // O Pix da RENOVAÇÃO (o de 7 dias antes, ou a cobrança do cartão recusado que virou Pix) não se cancela como pagamento avulso:
  // cancelar o segundo apagaria a cobrança da assinatura, e o primeiro não voltaria (a chave da renovação é a mesma). Para não renovar,
  // o caminho é "Cancelar assinatura", que vale também depois do vencimento (revisão 17/10).
  const pixDaCobrancaDoCartao = (p: Pedido) => p.motivo === "renovacao" && p.metodo === "pix";

  function publicOrder(p: Pedido) {
    return { id: p.id, status: p.status, nome: p.nome, tipo: p.tipo, metodo: p.metodo, motivo: p.motivo, valor_centavos: p.valor_centavos, url: p.url, pix: p.pix ?? null, expira_em: p.expira_em, cancelavel: !pixDaCobrancaDoCartao(p) };
  }

  /** Situação do pedido para a tela que espera o pagamento. Se o fornecedor já diz "pago", confere e processa na hora. */
  async function orderStatus(user: Identity, id: string) {
    const p = need();
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new BillingError("Pedido inválido.", 400);
    const pedido = await svc<Pedido | null>("ch_worker_billing_pedido", { p_pedido: id, p_user: user.id });
    if (!pedido) throw new BillingError("Pedido não encontrado.", 404);
    if (pedido.status === "aberto" && pedido.provider_payment_id) {
      await processCharge(pedido.provider_payment_id, null).catch((e) => log(`[billing] conferência do pedido falhou: ${(e as Error).message}`));
      const again = await svc<Pedido | null>("ch_worker_billing_pedido", { p_pedido: id, p_user: user.id });
      return publicOrder(again ?? pedido);
    }
    void p;
    return publicOrder(pedido);
  }

  async function cancelOrder(user: Identity, id: string) {
    const p = need();
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new BillingError("Pedido inválido.", 400);
    const antes = await svc<Pedido | null>("ch_worker_billing_pedido", { p_pedido: id, p_user: user.id });
    // o Pix da RENOVAÇÃO (o de 7 dias antes, ou a renovação do cartão que virou Pix) não se cancela por aqui: cancelar apagaria a
    // própria cobrança da renovação no fornecedor. Para não renovar, o caminho é "Cancelar assinatura" (revisão 17/10).
    if (antes && pixDaCobrancaDoCartao(antes)) {
      throw new BillingError("Este é o Pix da sua renovação: ele fica disponível até ser pago. Para não renovar, use Cancelar assinatura em Minha conta.", 409, "renovacao_nao_cancela");
    }
    const pedido = await svc<Pedido | null>("ch_worker_billing_pedido_encerrar", { p_pedido: id, p_status: "cancelado", p_erro: "Cancelado pelo aluno", p_user: user.id });
    if (!pedido) throw new BillingError("Não há pagamento em aberto com este número.", 404);
    if (pedido.provider_payment_id) await p.cancelCharge(pedido.provider_payment_id).catch((e) => log(`[billing] cancelar cobrança falhou: ${(e as Error).message}`));
    if (pedido.provider_subscription_id) await p.cancelSubscription(pedido.provider_subscription_id).catch((e) => log(`[billing] cancelar assinatura falhou: ${(e as Error).message}`));
    return { ok: true };
  }

  /** Cancelar a renovação: o acesso segue até o fim do período já pago. */
  async function cancelRenewal(user: Identity) {
    const p = need();
    const r = await svc<{ provider: string; subscription_id: string | null; periodo_fim: string; pix_abertos: { provider: string; payment_id: string | null }[] } | null>(
      "ch_worker_billing_cancelar_renovacao", { p_user: user.id });
    if (!r) throw new BillingError("Você não tem renovação para cancelar.", 404);
    if (r.subscription_id && r.provider === p.name) {
      try {
        await p.cancelSubscription(r.subscription_id);
        await svc("ch_worker_billing_assinatura_fim", { p_provider: p.name, p_subscription: r.subscription_id });
      } catch (e) {
        log(`[billing] cancelar renovação no fornecedor falhou: ${(e as Error).message}`);
        throw new BillingError("Não foi possível cancelar agora. Tente de novo.", 502);
      }
    }
    for (const x of r.pix_abertos ?? []) if (x.payment_id && x.provider === p.name) await p.cancelCharge(x.payment_id).catch(() => undefined);
    return { ok: true, acesso_ate: r.periodo_fim };
  }

  /** Renovação do cartão que falhou: a MESMA cobrança vira Pix (sem cobrança em dobro) e o aluno volta na hora ao pagar. */
  async function payRenewalByPix(user: Identity) {
    const p = need();
    const r = await svc<{ provider: string; payment_id: string; valor_centavos: number; plano: string; ciclo: "mensal" | "trimestral"; periodo_fim: string; pedido_pix: string | null } | null>(
      "ch_worker_billing_renovacao_pendente", { p_user: user.id });
    if (!r || r.provider !== p.name) throw new BillingError("Não há renovação pendente para pagar.", 404);
    if (r.pedido_pix) {
      const aberto = await svc<Pedido | null>("ch_worker_billing_pedido", { p_pedido: r.pedido_pix, p_user: user.id });
      if (aberto) return publicOrder(aberto);
    }
    // confere antes: pode ter sido paga agora há pouco (o fornecedor reprocessou o cartão)
    const now0 = await p.getCharge(r.payment_id);
    if (!now0 || now0.status === "paid") {
      if (now0) await processCharge(r.payment_id, now0.subscriptionId);
      throw new BillingError("Esta renovação já foi paga. Atualize a página.", 409, "ja_pago");
    }
    const due = brtDate(now());
    const pedido = await abrirPedido("ch_worker_billing_pedido_abrir", {
      p_user: user.id, p_tipo: "plano", p_codigo: r.plano, p_ciclo: r.ciclo, p_metodo: "pix", p_motivo: "renovacao",
      p_idem: `pix-falha:${r.payment_id}`.slice(0, 100), p_aceite: null, p_renova_ate: r.periodo_fim,
    });
    if (pedido.url) return publicOrder(pedido);
    try {
      const created = await p.payChargeByPix(r.payment_id, due);
      // a mesma cobrança virou Pix: se outro clique já anexou, nada sobra para cancelar (é a mesma cobrança)
      return publicOrder(await anexar({ ...pedido, provider_payment_id: created.chargeId }, { ...created, subscriptionId: null }, { customer: now0.customerId, vencimento: due }));
    } catch (e) {
      log(`[billing] renovação por Pix falhou: ${(e as Error).message}`);
      await svc("ch_worker_billing_pedido_encerrar", { p_pedido: pedido.id, p_status: "falhou", p_erro: (e as Error).message, p_user: null }).catch(() => undefined);
      throw new BillingError("Não foi possível gerar o Pix agora. Tente de novo.", 502);
    }
  }

  /**
   * Trocar a forma de pagamento da renovação (Minha conta > Assinatura, 013760). Sem multa, sem cobrança a mais:
   *   - cartão -> Pix: cancela a assinatura no fornecedor e o contrato passa a Pix (o Pix sai 7 dias antes do vencimento);
   *   - Pix -> cartão: abre a assinatura no cartão com a 1ª cobrança no vencimento atual; o aluno digita o cartão SÓ na página
   *     segura do fornecedor e paga ali essa renovação (antes do vencimento: não perde dias). Um Pix de renovação já gerado é
   *     cancelado antes, depois de conferir que não foi pago (se foi, vale o pagamento e a troca segue para o período seguinte).
   */
  async function changeMethod(user: Identity, body: { metodo?: unknown; idem?: unknown }) {
    const p = need();
    const metodo = body?.metodo === "pix" || body?.metodo === "cartao" ? body.metodo : null;
    if (!metodo || !p.capabilities.methods[METODO[metodo]]) throw new BillingError("Escolha Pix ou cartão de crédito.");
    type Situ = { plano: string; ciclo: "mensal" | "trimestral"; metodo: "pix" | "cartao"; valor_centavos: number; renova: boolean; provider: string;
      subscription_id: string | null; periodo_fim: string; vigente: boolean; pendente: boolean; customer_id: string | null;
      pix_aberto: { id: string; provider: string | null; payment_id: string | null } | null; troca_aberta: Pedido | null };
    const ler = () => svc<Situ | null>("ch_worker_billing_troca_situacao", { p_user: user.id });
    let s = await ler();
    if (!s || !s.renova || !s.vigente) throw new BillingError("Você não tem uma assinatura que renova para trocar a forma de pagamento.", 409, "sem_renovacao");
    if (s.pendente) throw new BillingError("A renovação no cartão não passou: pague essa cobrança por Pix em Meu plano para voltar na hora.", 409, "renovacao_pendente");
    if (s.provider !== p.name) throw new BillingError("Esta assinatura foi feita por outro meio. Fale com o suporte.", 409);

    if (metodo === "pix") {
      if (s.metodo === "pix") return { ok: true, metodo: "pix", periodo_fim: s.periodo_fim };
      // 1) o banco primeiro: o contrato passa a Pix e larga a assinatura (assim o aviso "assinatura apagada" do fornecedor não
      //    desliga a renovação, e um "cancelar renovação" ao mesmo tempo continua valendo); 2) cancela no fornecedor; 3) se falhar, desfaz
      let r: { metodo: string; periodo_fim: string };
      try {
        r = await svc<{ metodo: string; periodo_fim: string }>("ch_worker_billing_para_pix", { p_user: user.id, p_sub: s.subscription_id });
      } catch (e) {
        throw dbError(e) ?? e;
      }
      if (s.subscription_id) {
        try {
          await p.cancelSubscription(s.subscription_id);
        } catch (e) {
          log(`[billing] troca para Pix: cancelar assinatura falhou: ${(e as Error).message}`);
          await svc("ch_worker_billing_para_pix_desfazer", { p_user: user.id, p_sub: s.subscription_id }).catch(() => undefined);
          throw new BillingError("Não foi possível trocar agora. Tente de novo.", 502);
        }
      }
      return { ok: true, metodo: "pix", periodo_fim: r.periodo_fim };
    }

    // Pix -> cartão
    if (s.metodo === "cartao") throw new BillingError("Sua assinatura já renova no cartão de crédito.", 409, "ja_no_cartao");
    if (s.troca_aberta?.url) return publicOrder(s.troca_aberta);
    const idem = typeof body?.idem === "string" && SAFE_IDEM.test(body.idem) ? body.idem : null;
    if (!idem) throw new BillingError("Pedido inválido. Atualize a página e tente de novo.");
    if (!s.customer_id) throw new BillingError("Não encontramos o seu cadastro na instituição de pagamento. Fale com o suporte.", 409);
    if (s.pix_aberto) {
      // o Pix da renovação já gerado: se foi pago, vale o pagamento (e o novo vencimento); se não, é cancelado antes da troca
      if (s.pix_aberto.payment_id && s.pix_aberto.provider === p.name) {
        const c0 = await p.getCharge(s.pix_aberto.payment_id);
        if (c0 && c0.status !== "paid") await p.cancelCharge(s.pix_aberto.payment_id);
        const c1 = c0 ? await p.getCharge(s.pix_aberto.payment_id) : null;
        if (c1?.status === "paid") {
          await processCharge(c1.id, null);
          throw new BillingError("O Pix desta renovação já foi pago. A troca para cartão vale a partir do próximo vencimento: tente de novo daqui a pouco.", 409, "renovacao_paga");
        }
      }
      await svc("ch_worker_billing_pedido_encerrar", { p_pedido: s.pix_aberto.id, p_status: "cancelado", p_erro: "Troca para cartão", p_user: user.id });
      s = (await ler())!;
    }
    const pedido = await abrirPedido("ch_worker_billing_troca_cartao_abrir", { p_user: user.id, p_idem: idem });
    if (pedido.url) return publicOrder(pedido);
    if (pedido.repetido) throw new BillingError("A troca está sendo aberta. Aguarde um instante e atualize a página.", 409, "pedido_em_andamento");
    try {
      const first = brtDate(new Date(s.periodo_fim));
      const today = brtDate(now());
      const created = await p.createCardSubscription({
        customerId: s.customer_id, amountCents: pedido.valor_centavos, cycle: s.ciclo === "trimestral" ? "quarterly" : "monthly",
        description: `StaziaMed ${pedido.nome}`, reference: `smp:${pedido.id}`, firstDueDate: first < today ? today : first,
        returnUrl: `${deps.baseUrl ?? ""}/novo/perfil?pedido=${pedido.id}`,
      });
      return publicOrder(await anexar(pedido, created, { customer: s.customer_id, vencimento: first < today ? today : first }));
    } catch (e) {
      if (e instanceof BillingError) throw e;
      log(`[billing] troca para cartão falhou: ${(e as Error).message}`);
      await svc("ch_worker_billing_pedido_encerrar", { p_pedido: pedido.id, p_status: "falhou", p_erro: (e as Error).message, p_user: null }).catch(() => undefined);
      throw new BillingError("Não foi possível abrir a página do cartão agora. Tente de novo.", 502);
    }
  }

  /** Devolução pedida pelo aluno (regra do dono; o cálculo é do banco). Abuso/sem regra automática = vai para a equipe. */
  async function refund(user: Identity, cobrancaId: unknown) {
    const p = need();
    const id = Number(cobrancaId);
    if (!Number.isInteger(id) || id <= 0) throw new BillingError("Compra inválida.");
    let r: { id: number; status: string; valor_centavos: number; total: boolean; provider: string; payment_id: string; metodo: string; acesso_ate: string | null };
    try {
      r = await svc("ch_worker_billing_devolucao_pedir", { p_user: user.id, p_cobranca: id });
    } catch (e) {
      throw dbError(e) ?? e;
    }
    if (r.status === "equipe") return { ok: true, status: "equipe", valor_centavos: r.valor_centavos, mensagem: "Seu pedido de devolução foi registrado e será analisado pela equipe em até 5 dias úteis." };
    if (r.provider !== p.name) throw new BillingError("Esta compra foi feita por outro meio. Fale com o suporte.", 409);
    try {
      const done = await p.refund(r.payment_id, r.total ? undefined : r.valor_centavos);
      // o acesso só muda quando o fornecedor confirmar (aviso de devolução, conferido)
      if (done.status === "done") await processCharge(r.payment_id, null).catch((e) => log(`[billing] pós-devolução: ${(e as Error).message}`));
      if (r.total) {
        const ctx = await svc<Ctx | null>("ch_worker_billing_contexto", { p_user: user.id });
        // devolução integral do plano: a renovação também acaba
        if (ctx?.contrato?.renova) await cancelRenewal(user).catch(() => undefined);
      }
      return { ok: true, status: done.status === "done" ? "feito" : "solicitado", valor_centavos: r.valor_centavos };
    } catch (e) {
      log(`[billing] devolução falhou: ${(e as Error).message}`);
      await svc("ch_worker_billing_devolucao_falhou", { p_reembolso: r.id, p_erro: (e as Error).message }).catch(() => undefined);
      return { ok: true, status: "equipe", valor_centavos: r.valor_centavos, mensagem: "Seu pedido de devolução foi registrado; a equipe conclui em até 5 dias úteis." };
    }
  }

  /** Aviso do fornecedor (já conferido no adaptador). Repetido = nada. Erro = lança (o fornecedor tenta de novo). */
  async function handleNotice(n: ProviderNotice) {
    const p = need();
    if (n.kind === "ignored") return { handled: false };
    const first = await svc<boolean>("ch_worker_billing_evento", { p_provider: p.name, p_event_id: n.eventId, p_type: n.event, p_payload: { kind: n.kind } });
    if (!first) return { handled: false, duplicate: true };
    let userId: string | null = null;
    if (n.kind === "charge") userId = await processCharge(n.chargeId, n.subscriptionId, Boolean(n.failed));
    else {
      const r = await svc<{ user_id: string | null }>("ch_worker_billing_assinatura_fim", { p_provider: p.name, p_subscription: n.subscriptionId });
      userId = r?.user_id ?? null;
    }
    await svc("ch_worker_billing_evento_feito", { p_provider: p.name, p_event_id: n.eventId, p_user: userId });
    return { handled: true };
  }

  /** Relê a cobrança na API e aplica o que ela diz. Devolve o aluno (ou null se a cobrança não é nossa). */
  async function processCharge(chargeId: string, hintSubscription: string | null, attemptFailed = false): Promise<string | null> {
    const p = need();
    const charge = await p.getCharge(chargeId);
    if (!charge) return null; // não existe na NOSSA conta: aviso de outra conta ou forjado
    const found = await svc<{ pedido: Pedido | null; contrato: Contrato | null }>("ch_worker_billing_achar", {
      p_provider: p.name, p_payment: charge.id, p_subscription: charge.subscriptionId ?? hintSubscription, p_ref: charge.externalReference,
    });
    const pedido = found?.pedido ?? null;
    const contrato = found?.contrato ?? null;
    if (!pedido && !contrato) return null; // cobrança feita à mão no painel: não é do app
    const userId = pedido?.user_id ?? contrato!.user_id;
    const tipo = pedido?.tipo ?? "plano";
    const codigo = pedido?.codigo ?? contrato!.plano;
    const ciclo = pedido?.ciclo ?? contrato!.ciclo;
    const metodo = charge.method === "pix" ? "pix" : charge.method === "card" ? "cartao" : null;
    if (!metodo || charge.installments) {
      log(`[billing] cobrança ${charge.id} com forma não aceita (${charge.method}${charge.installments ? ", parcelada" : ""}): não liberada`);
      return userId;
    }
    if (charge.status === "paid") {
      const paidAt = charge.paidAt ?? now();
      const periodEnd = tipo === "plano" ? periodEndFor({ method: charge.method as "pix" | "card", dueDate: charge.dueDate, paidAt, cycle: ciclo as "mensal" | "trimestral" }) : null;
      const r = await svc<{ repetido?: boolean }>("ch_worker_billing_pago", {
        p_provider: p.name, p_payment: charge.id, p_pedido: pedido?.id ?? null, p_user: userId, p_subscription: charge.subscriptionId,
        p_customer: charge.customerId, p_tipo: tipo, p_codigo: codigo, p_ciclo: ciclo, p_metodo: metodo, p_valor: charge.amountCents,
        p_pago_em: paidAt.toISOString(), p_periodo_fim: periodEnd ? periodEnd.toISOString() : null,
      });
      if (charge.receiptUrl) {
        await svc("ch_worker_billing_recibo_salvar", { p_provider: p.name, p_payment: charge.id, p_url: charge.receiptUrl }).catch((e) => log(`[billing] recibo não salvo (${charge.id}): ${(e as Error).message}`));
      }
      if (!r?.repetido && p.afterPaid) {
        await p.afterPaid(charge, tipo === "plano" ? `Acesso à plataforma StaziaMed Revalida - plano ${codigo.toUpperCase()} ${ciclo}` : `StaziaMed Revalida - pacote extra de IA (${codigo})`)
          .catch((e) => log(`[billing] nota fiscal não pedida (${charge.id}): ${(e as Error).message}`));
      }
    } else if (charge.status === "failed" || charge.status === "overdue" || (attemptFailed && charge.status === "pending")) {
      // sem tolerância (dono, 17/10): a renovação que falhou pausa o acesso NO MESMO DIA, mesmo que o fornecedor ainda vá tentar
      // o cartão de novo; se ele conseguir depois, o aviso de pagamento libera de novo a partir da confirmação
      await svc("ch_worker_billing_falhou", {
        p_provider: p.name, p_payment: charge.id, p_pedido: pedido?.id ?? null, p_user: userId, p_subscription: charge.subscriptionId,
        p_tipo: tipo, p_codigo: codigo, p_ciclo: ciclo, p_metodo: metodo, p_valor: charge.amountCents,
        p_motivo: charge.status === "overdue" ? "Venceu sem pagamento" : "Cartão recusado",
        p_venc_fim: tipo === "plano" && charge.dueDate ? endOfBrtDay(charge.dueDate).toISOString() : null,
      });
    } else if (charge.status === "refunded" || charge.status === "partially_refunded") {
      await svc("ch_worker_billing_devolvido", { p_provider: p.name, p_payment: charge.id, p_devolvido: charge.refundedCents || charge.amountCents });
    } else if (charge.status === "canceled" && pedido?.status === "aberto") {
      await svc("ch_worker_billing_pedido_encerrar", { p_pedido: pedido.id, p_status: "cancelado", p_erro: "Cobrança removida no fornecedor", p_user: null });
    }
    return userId;
  }

  /** Tarefa diária (e de hora em hora fora da Vercel): pedidos vencidos, Pix de renovação 7 dias antes, extras pendentes. */
  async function runScheduled() {
    const p = need();
    const v = await encerrarVencidos(null);
    const out = { expirados: v.expirados, renovacoes: 0, entregues: 0, erros: v.erros };
    for (const r of await svc<{ user_id: string; plano: string; ciclo: "mensal" | "trimestral"; periodo_fim: string; provider: string; customer_id: string }[]>("ch_worker_billing_renovacoes_pix", {})) {
      if (r.provider !== p.name) continue;
      try {
        const due = brtDate(new Date(r.periodo_fim));
        const pedido = await svc<Pedido>("ch_worker_billing_pedido_abrir", {
          p_user: r.user_id, p_tipo: "plano", p_codigo: r.plano, p_ciclo: r.ciclo, p_metodo: "pix", p_motivo: "renovacao",
          // chave do servidor com ":" (o navegador não consegue usar esse caractere: ninguém bloqueia o Pix de outra renovação)
          p_idem: `renovacao:${r.user_id}:${due}`, p_aceite: null, p_renova_ate: r.periodo_fim,
        });
        if (pedido.url || pedido.status !== "aberto") continue;
        const created = await p.createCharge({ customerId: r.customer_id, method: "pix", amountCents: pedido.valor_centavos, description: `StaziaMed ${pedido.nome}`, reference: `smp:${pedido.id}`, dueDate: due, returnUrl: `${deps.baseUrl ?? ""}/novo/planos?pedido=${pedido.id}` });
        await anexar(pedido, { ...created, subscriptionId: null }, { customer: r.customer_id, vencimento: due });
        out.renovacoes++;
      } catch (e) {
        out.erros++;
        log(`[billing] renovação Pix de ${r.user_id.slice(0, 8)}: ${(e as Error).message}`);
      }
    }
    out.entregues = await svc<number>("ch_worker_billing_entregar_pendentes", {});
    return out;
  }

  return { overview, checkout, orderStatus, cancelOrder, cancelRenewal, payRenewalByPix, changeMethod, refund, handleNotice, processCharge, runScheduled };
}

export type Billing = ReturnType<typeof createBilling>;
export type { ProviderCharge };
