/**
 * Escolhe o fornecedor de pagamento pelas variáveis de ambiente. Nenhuma chave = nenhum fornecedor = pagamento DESLIGADO
 * (rotas 503, telas escondidas). BILLING_PROVIDER=asaas (único adaptador neste ramo). Para trocar pela Stripe basta um
 * adaptador novo que cumpra PaymentProvider (provider.ts) e uma linha aqui: o núcleo, o banco e as telas não mudam.
 */
import { createAsaasProvider } from "./asaasAdapter";
import type { PaymentProvider } from "./provider";

export function createProviderFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): PaymentProvider | null {
  const want = (env.BILLING_PROVIDER ?? "asaas").trim().toLowerCase();
  if (want === "asaas") return createAsaasProvider(env, fetchImpl);
  return null;
}
