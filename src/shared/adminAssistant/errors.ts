/**
 * Assistente de IA nas abas: o que a tela mostra quando algo dá errado (Q13). Servidor e tela usam as mesmas frases.
 * Regra: texto técnico (do provedor de IA, do banco, da rede, do leitor de PDF), muitas vezes em inglês, nunca vai para a tela;
 * o detalhe fica no registro do servidor ou no console do navegador. Só aparece o que o servidor escreve de propósito, em português,
 * para a tela (IA desligada, teto de gasto, "você revisa outra área", material curto demais...).
 */

export const ASSIST_ERRORS = {
  /** Falha por dentro: IA fora do ar ou com resposta quebrada, banco, rede, erro imprevisto. */
  failed: "O assistente não conseguiu responder agora. Tente de novo em instantes.",
  /** Link do material que não abriu (rede, tempo esgotado, página que não é texto nem PDF). */
  link: "Não foi possível ler o link. Confira se ele abre sem senha e tente de novo, ou cole o texto.",
  /** PDF do material que o navegador não conseguiu abrir (arquivo quebrado, com senha ou que não é PDF). */
  pdf: "Não foi possível ler este PDF. Confira se ele abre normalmente e não tem senha, ou cole o texto.",
  /** Não foi possível ler a situação das IAs do assistente. */
  status: "Não foi possível ler a situação do assistente.",
} as const;

/**
 * Códigos HTTP cujo texto o servidor escreve de propósito, em português, para a tela: 400 (pedido), 401 (sem conta), 403 (sem
 * permissão), 404 (item), 413 (tamanho), 422 (material), 429 (teto de gasto) e 503 (IA indisponível). 500, 502 e os demais trazem
 * detalhe técnico: a tela mostra só `ASSIST_ERRORS.failed`.
 */
export const SCREEN_STATUS: readonly number[] = [400, 401, 403, 404, 413, 422, 429, 503];

/** Texto de erro genérico que o cliente monta sozinho quando a resposta não traz mensagem do servidor ("Erro 502."). */
export const isBareStatusText = (text: string) => /^Erro \d{3}\.$/.test(text.trim());
