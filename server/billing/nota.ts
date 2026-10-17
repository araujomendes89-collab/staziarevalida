/**
 * Texto da nota fiscal (NFS-e) de cada pagamento. Decisão do dono (17/10): curso preparatório (CNAE 8599-6/05, preparação para o
 * Revalida, como no objeto social), Simples Nacional Anexo III; ISS dentro do DAS, sem retenção.
 */
const PLANOS: Record<string, string> = { pro: "PRO", pratica: "PRÁTICA", elite: "ELITE" };

export function descricaoDaNota(o: { tipo: "plano" | "extra"; codigo: string; ciclo: string; nome?: string | null }): string {
  if (o.tipo === "plano") {
    const plano = PLANOS[o.codigo] ?? o.codigo.toUpperCase();
    return `Assinatura de plataforma de preparação para o Revalida – plano ${plano} (${o.ciclo === "trimestral" ? "trimestral" : "mensal"})`;
  }
  const nome = (o.nome ?? "").replace(/\s*\(.*\)\s*$/, "").trim() || `pacote ${o.codigo}`;
  return `Pacote extra de IA (${nome}) – plataforma de preparação para o Revalida`;
}

/** Observação padrão da nota (o contador pode trocar por ASAAS_NFSE_OBS). */
export const OBSERVACAO_PADRAO =
  "Documento emitido por ME/EPP optante pelo Simples Nacional (Anexo III). ISS recolhido no DAS; não há retenção.";
