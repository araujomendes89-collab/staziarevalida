/**
 * CÉREBRO DO TUTOR — limpeza do texto antes de virar trecho do índice:
 *  - tira o cabeçalho da aula ("Material StaziaMed · revisado por médico da área em …");
 *  - tira as frases que citam material complementar (apostila): a mesma regra do resto do app (redactSupportMaterial);
 *  - tira as linhas com cara de COMANDO ("ignore as instruções", "você é…", "system:") — defesa barata contra instrução escondida
 *    no texto de uma fonte. O trecho vai ao modelo num bloco rotulado como dado, mas o que não está lá não engana ninguém;
 *  - junta espaços.
 * Nada é inventado nem reescrito: só se retira.
 */
import { redactSupportMaterial } from "../../contentHub/complementarGuard";

const CABECALHO_AULA = /^\s*material\s+staziamed\b[^\n]*revisad[oa][^\n]*$/gim;
const CARA_DE_COMANDO = [
  /\b(ignore|ignorem|desconsidere|esque[cç]a)\b[^.\n]{0,40}\b(instru[cç][oõ]es|regras|comandos|orienta[cç][oõ]es|prompt)\b/i,
  /\bignore (all|any|previous|the above)\b/i,
  /^\s*(system|assistant|user|sistema|assistente)\s*:/i,
  /\bvoc[eê] (agora )?[eé] (um|uma|o|a) (assistente|ia|modelo|chatbot|tutor|professor)/i,
  /\b(jailbreak|prompt injection|modo desenvolvedor|developer mode)\b/i,
  /\b(revele|mostre|diga) (o|a|as|os) (prompt|instru[cç][oõ]es|gabarito|chave)/i,
];

export interface Limpo {
  texto: string;
  /** quantas linhas/frases com cara de comando saíram */
  comandos: number;
}

export function limparTexto(texto: string | null | undefined, termosApostila: readonly string[] = []): Limpo {
  let comandos = 0;
  const linhas = String(texto ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(CABECALHO_AULA, "")
    .split("\n")
    .map((l) => {
      // frase por frase dentro da linha: só a frase com cara de comando sai
      const frases = l.split(/(?<=[.!?…])\s+/);
      const ficam = frases.filter((f) => {
        const ruim = CARA_DE_COMANDO.some((re) => re.test(f));
        if (ruim) comandos++;
        return !ruim;
      });
      return ficam.join(" ");
    })
    .map((l) => redactSupportMaterial(l, termosApostila))
    .map((l) => l.replace(/[ \t ]+/g, " ").trim());
  const out = linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { texto: out, comandos };
}
