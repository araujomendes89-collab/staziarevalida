/**
 * Mensagens de erro das rotas /api em português simples (RT07 e TD01). Nenhuma rota devolve o texto cru de um erro técnico
 * (banco, rede, IA): o detalhe vai para o registro do servidor e a tela recebe o MOTIVO e o que fazer.
 * Frase pronta em português (as do banco, como "Acesso restrito à equipe.") passa inteira.
 */
import { explainError } from "../../src/shared/errors/explicarErro";

/** Quando a conferência do login ou do acesso falha por causa do servidor ou do banco (não por falta de permissão). */
export const ACCESS_CHECK_FAILED = "Não foi possível conferir o seu acesso agora. Tente de novo em instantes.";

/** Texto seguro para devolver a quem chamou a rota. */
export const shown = (error: unknown): string => explainError(error);
