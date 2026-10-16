// Preços oficiais usados nas contas (US$ por 1 milhão de tokens), página https://ai.google.dev/gemini-api/docs/pricing
// ("Last updated 2026-10-15", consultada 16/10/2026). O Vertex pode cobrar diferente por região: a conta é estimativa até a fatura do Google confirmar.
export const PRECOS = {
  "gemini-3.8-live": { textoEntrada: 0.75, audioEntrada: 3.0, textoSaida: 4.5, audioSaida: 12.0 },
  "gemini-3.8-flash": { textoEntrada: 0.75, audioEntrada: 0.75, textoSaida: 3.75 }, // até 31/12/2026 (depois 1,50 / 7,50); pensamento conta como saída; ai.google.dev/gemini-api/docs/pricing de 15/10/2026
  "gemini-3.8-flash-tts": { textoEntrada: 0.5, audioSaida: 9.0 }, // até 31/12/2026; depois 1,00 / 18,00
  "gemini-3.8-flash-lite-tts": { textoEntrada: 0.5, audioSaida: 6.0 }, // até 31/12/2026; depois 1,00 / 12,00
  "gemini-3.1-flash-tts-preview": { textoEntrada: 1.0, audioSaida: 20.0 },
  "gemini-2.5-flash-preview-tts": { textoEntrada: 0.5, audioSaida: 10.0 },
};
export const ELEVEN = { agenteMin: 0.08, burstMin: 0.16, silencioFracao: 0.05, ttsV3Por1kChars: 0.08, ttsV3ConvPor1kChars: 0.04 };

/** Soma os tokens por modalidade de um usageMetadata do Gemini (Live ou generateContent). */
export function tokensPorModalidade(u) {
  const out = { textoEntrada: 0, audioEntrada: 0, textoSaida: 0, audioSaida: 0, total: u?.totalTokenCount ?? 0 };
  for (const d of u?.promptTokensDetails ?? []) {
    if (d.modality === "AUDIO") out.audioEntrada += d.tokenCount ?? 0; else out.textoEntrada += d.tokenCount ?? 0;
  }
  for (const d of [...(u?.responseTokensDetails ?? []), ...(u?.candidatesTokensDetails ?? [])]) {
    if (d.modality === "AUDIO") out.audioSaida += d.tokenCount ?? 0; else out.textoSaida += d.tokenCount ?? 0;
  }
  // sem detalhe por modalidade: joga tudo como texto (pior caso para entrada, melhor para saída) e avisa
  if (!u?.promptTokensDetails && u?.promptTokenCount) out.textoEntrada += u.promptTokenCount;
  if (!u?.responseTokensDetails && !u?.candidatesTokensDetails) out.textoSaida += (u?.responseTokenCount ?? u?.candidatesTokenCount ?? 0);
  out.pensamento = u?.thoughtsTokenCount ?? 0;
  out.emCache = u?.cachedContentTokenCount ?? 0; // o Vertex não deu desconto de cache no Live nesta medição se vier 0
  return out;
}

export function custoUsd(modelo, t) {
  const p = PRECOS[modelo];
  if (!p) return null;
  return ((t.textoEntrada * (p.textoEntrada ?? 0)) + (t.audioEntrada * (p.audioEntrada ?? 0)) + ((t.textoSaida + (t.pensamento ?? 0)) * (p.textoSaida ?? 0)) + (t.audioSaida * (p.audioSaida ?? 0))) / 1e6;
}
