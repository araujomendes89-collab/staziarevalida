/** Direção de fala compartilhada por voz ao vivo e TTS; não altera personalidade nem conteúdo. */
export const TUTOR_SPOKEN_LANGUAGE = `IDIOMA E SOTAQUE (vale para toda fala, do começo ao fim)
IDIOMA
- Fale em português brasileiro (pt-BR). Só mude de idioma se o aluno pedir explicitamente.
- Nomes, siglas, palavras estrangeiras isoladas e o sotaque do aluno não mudam o idioma da resposta.

PRONÚNCIA E PROSÓDIA
- Use português brasileiro neutro, com pronúncia de falante nativo e sem imitar sotaque regional. Mantenha essa pronúncia da primeira à última palavra, inclusive nas interjeições e nas falas curtas.
- Articule vogais, sons nasais e sílabas tônicas naturalmente em português. Não transfira a pronúncia do inglês, do espanhol ou do português de Portugal para palavras brasileiras.
- Ritmo de conversa, velocidade moderada e pausas breves entre ideias. Não alongue vogais nem exagere consoantes para tentar parecer brasileiro.
- Use construções orais brasileiras e "você". "Tá" e "pra" podem aparecer quando couberem; não force gírias nem repita bordões.
- A personalidade pode mudar humor, firmeza e energia, mas não muda o idioma nem o sotaque. Bronca e comemoração continuam com dicção clara.
- Não transforme a fala em locução publicitária, narração ou atendimento de call center.
- Esta direção de pronúncia prevalece sobre descrições antigas de sotaque regional; preserve as regras de conteúdo, segurança e personalidade.`;

export const TUTOR_SPOKEN_REMINDER = "LEMBRETE FINAL: português brasileiro neutro, pronúncia nativa estável e conversa natural, sem imitar sotaques regionais; mantenha a personalidade escolhida.";

/** Atualiza só a direção de voz recebida do servidor, preservando fatos, ferramentas e personalidade. */
export function refreshVoiceLanguage(instructions: unknown): string | null {
  if (typeof instructions !== "string" || !instructions.trim()) return null;
  if (instructions.startsWith(TUTOR_SPOKEN_LANGUAGE) && instructions.endsWith(TUTOR_SPOKEN_REMINDER)) return instructions;
  // A versão anterior tem este cabeçalho e uma fronteira explícita antes do guia médico.
  const medicalStart = instructions.indexOf("\n\nPRONÚNCIA DE TERMOS MÉDICOS\n");
  const content = instructions.startsWith("IDIOMA E SOTAQUE") && medicalStart >= 0
    ? instructions.slice(medicalStart).trimStart()
    : instructions;
  const previousReminder = "LEMBRETE FINAL: português do Brasil com sotaque de brasileiro nativo (nada de sotaque americano), fala solta de gente de verdade, no jeito do seu professor, em toda fala.";
  const body = content.endsWith(previousReminder) ? content.slice(0, -previousReminder.length).trimEnd() : content;
  return `${TUTOR_SPOKEN_LANGUAGE}\n\n${body}\n\n${TUTOR_SPOKEN_REMINDER}`;
}
