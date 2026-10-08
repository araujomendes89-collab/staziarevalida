/**
 * Somente preencher APÓS audição real e aprovação explícita do responsável.
 * O fingerprint vem do painel interno e vincula voz, modelo, parâmetros e revisão da direção.
 * Não é uma chave secreta. Trocar qualquer parte da configuração invalida a aprovação.
 */
export const ELEVENLABS_APPROVALS: Partial<Record<string, {
  fingerprint: string;
  approvedBy: string;
  approvedAt: string;
}>> = {};
