// Chamada ao Gemini (Vertex, chave expressa) do Radar. A chave vem do ambiente/.env e NUNCA é impressa nem gravada.
// A IA só lê o diff e explica em português simples; a resposta é sugestão para o revisor (precisa_revisao_medica = true sempre).
import { sanitizarAnaliseIA } from "./lib.mjs";

export const MODELO_PADRAO = "gemini-3.8-flash";
/** Pior caso de uma análise (para o contador decidir ANTES de chamar): ~2.500 entrada + 1.500 saída. */
export const TOKENS_PIOR_CASO = { entrada: 2500, saida: 1500 };

export function montarPrompt({ titulo, instituicao = "", referencia, origem, comparadoCom = null, itens = [], observacaoItem = "" }) {
  const top = itens.slice(0, 12).map((i, n) =>
    `#${n + 1} [${i.kind}${i.critical ? ", CRITICO" : ""}] antigo(p.${i.pagina_antiga ?? "-"}): ${(i.trecho?.antes ?? i.texto_antigo ?? "(não existia)").slice(0, 350)}\n   novo(p.${i.pagina_nova ?? "-"}): ${(i.trecho?.depois ?? i.texto_novo ?? "(removido)").slice(0, 350)}`).join("\n");
  return `Você ajuda a equipe médica do StaziaMed (preparatório Revalida) a triar mudanças em fontes oficiais. Você NÃO decide conduta clínica e NÃO altera gabarito: apenas descreve a diferença para um revisor médico.
Documento: ${titulo} (${instituicao}). Classificação do radar: ${referencia}. Origem do sinal: ${origem}${comparadoCom ? `, comparado com ${comparadoCom}` : ""}.
${observacaoItem ? observacaoItem + "\n" : ""}${top ? `Diferenças encontradas por comparação automática de texto (trecho antigo x novo, com página):\n${top}\n` : "Não há texto comparável: só os metadados do documento (título, data, endereço).\n"}Responda SOMENTE em JSON, em português simples, com as chaves: "o_que_mudou" (até 4 frases, citando as páginas quando houver), "recomendacao_alterada" (qual recomendação ou número mudou, ou "nenhuma recomendação clara"), "impacto_clinico_provavel" (o que isso pode mudar na prática ou em questões de prova; diga "incerto" se não der para saber), "certeza" ("alta", "media" ou "baixa"), "observacao" (ressalvas: pode ser só diferença de diagramação ou de extração de PDF). Não invente nada que não esteja nos trechos.`;
}

/** Devolve { analise, tokensEntrada, tokensSaida }. Lança erro sem a chave no texto. */
export async function perguntarGemini({ chave, modelo = MODELO_PADRAO, prompt, fetchImpl = globalThis.fetch, esperasMs = [4000, 10000] }) {
  const pedido = () => fetchImpl(`https://aiplatform.googleapis.com/v1beta1/publishers/google/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": chave, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 3000, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } } }),
  });
  let r = await pedido();
  // limite de pedidos (429) ou instabilidade (500/503): espera e tenta de novo; a chave nunca aparece na mensagem de erro
  for (const espera of esperasMs) {
    if (![429, 500, 503].includes(r.status)) break;
    await new Promise((ok) => setTimeout(ok, espera));
    r = await pedido();
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  return {
    analise: sanitizarAnaliseIA(JSON.parse(txt)),
    tokensEntrada: j.usageMetadata?.promptTokenCount ?? 0,
    tokensSaida: (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}

/**
 * Analisa uma mudança respeitando o teto: sem orçamento, NÃO chama a IA e devolve { pulada: "teto_mensal" } (a mudança continua registrada).
 */
export async function analisarComTeto({ contador, chave, modelo = MODELO_PADRAO, prompt, fetchImpl, esperasMs }) {
  if (!chave) return { pulada: "sem_chave" };
  const pior = (await import("./lib.mjs")).custoEstimadoUsd(modelo, TOKENS_PIOR_CASO.entrada, TOKENS_PIOR_CASO.saida) ?? 0.02;
  if (!(await contador.podeChamar(pior))) return { pulada: "teto_mensal" };
  let r = await perguntarGemini({ chave, modelo, prompt, fetchImpl, esperasMs });
  let custo = await contador.registrar({ modelo, tokensEntrada: r.tokensEntrada, tokensSaida: r.tokensSaida });
  if (!r.analise.o_que_mudou && (await contador.podeChamar(pior))) { // resposta vazia: tenta uma vez mais, ainda dentro do teto
    const r2 = await perguntarGemini({ chave, modelo, prompt, fetchImpl, esperasMs });
    custo += await contador.registrar({ modelo, tokensEntrada: r2.tokensEntrada, tokensSaida: r2.tokensSaida });
    r = { analise: r2.analise, tokensEntrada: r.tokensEntrada + r2.tokensEntrada, tokensSaida: r.tokensSaida + r2.tokensSaida };
  }
  return { analise: r.analise, tokensEntrada: r.tokensEntrada, tokensSaida: r.tokensSaida, custo_usd: custo };
}
