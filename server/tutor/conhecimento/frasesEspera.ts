/**
 * FRASES DE ESPERA do Tutor (decisão do dono de 17/10/2026) — APROVADAS pelo dono e GRAVADAS (VINHETAS).
 * Cópia para aprovação: /Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro/FRASES-DE-ESPERA.md
 *
 * Quando a busca no material aprovado passa de ~600 ms, o professor "segura" o aluno com uma frase curta, no jeito de cada uma das
 * 4 personalidades. Regras das frases: português do Brasil falado, curtas, sem citar tecnologia (nada de IA, sistema, banco, servidor,
 * busca automática, modelo), sem prometer conteúdo (não diz "já te trago a dose"), sem palavrão e sem grito (servem para qualquer aluno,
 * inclusive o ansioso). Rodízio sem repetir na mesma conversa (RodizioDeEspera): só repete depois de usar as 8.
 *
 * Onde aparecem:
 *   - voz ao vivo (ponte do Gemini e caminho pelo navegador): passou de ATRASO_ESPERA_MS com a busca rodando, a tela mostra a frase
 *     (legenda, papel "status"). O modelo do Gemini Live não fala enquanto a ferramenta roda (medido em 17/10: ferramenta "não
 *     bloqueante" não tem efeito no Vertex e pedir a frase ao modelo atrasa a resposta de 2 s para 4 a 6 s; cerebro/gemini-live.md),
 *     então o áudio da frase é uma gravação curta na voz do personagem (VINHETAS), tocada pelo tocador da voz
 *     (src/novo/app/tutor/voice/falaDeEspera.js: nunca por cima do professor nem do aluno; a resposta ou a fala do aluno cortam);
 *   - texto (Mini Tutor): o indicador "Stazia está conferindo a fonte…" (textoConferindo) quando a resposta passa de ATRASO_ESPERA_MS.
 *
 * Sem dependências: o aplicativo (navegador) importa este arquivo.
 */

export type PersonaEspera = "durao" | "acolhedor" | "durona" | "tranquila";

/** A frase só aparece se a busca ainda estiver rodando depois deste tempo. */
export const ATRASO_ESPERA_MS = 600;

export const FRASES_ESPERA: Readonly<Record<PersonaEspera, readonly string[]>> = {
  // Stazi, Durão: preceptor escrachado e exigente; seco, rápido, orgulho de não chutar
  durao: [
    "Segura aí que eu vou checar a fonte, não vou chutar número.",
    "Peraí, deixa eu abrir o material antes de falar qualquer coisa.",
    "Um segundo. Resposta no chute aqui não sai.",
    "Aguenta aí, tô conferindo direitinho.",
    "Deixa eu olhar isso com cuidado, que prova não perdoa achismo.",
    "Pera, vou conferir na fonte. De cabeça é que a gente erra.",
    "Calma que eu tô checando. Melhor certo do que rápido.",
    "Dá um segundinho, tô indo atrás do que está escrito.",
  ],
  // Stazi, Tranquilo: descontraído, de boa, charme de preguiça (dele, nunca do aluno)
  acolhedor: [
    "Deixa eu dar uma olhada no material, rapidinho.",
    "Pera, vou conferir isso com calma.",
    "Dá uma preguicinha, mas eu confiro na fonte antes.",
    "Segura um pouquinho que eu tô olhando aqui.",
    "Vou dar uma conferida e já a gente segue.",
    "Um instante, tô procurando no material com calma.",
    "Deixa eu ver direitinho aqui, que de cabeça não vale.",
    "Calma aí, vou confirmar isso antes de falar.",
  ],
  // Stazia, Durona: preceptora sem filtro, impaciente e sarcástica (aqui, sem palavrão e sem grito)
  durona: [
    "Segura aí, vou conferir na fonte. Chute não é comigo.",
    "Peraí que eu vou abrir a diretriz antes de te responder.",
    "Um instante. Isso eu confiro antes de falar.",
    "Calma, tô checando. Responder de cabeça é pedir pra errar.",
    "Pera aí, deixa eu olhar o que está escrito de verdade.",
    "Só um segundo, tô conferindo aqui no material.",
    "Deixa eu checar direito, que achismo eu deixo pros outros.",
    "Rapidinho: vou confirmar isso na fonte.",
  ],
  // Stazia, Tranquila: calma, acolhedora, sem pressa
  tranquila: [
    "Deixa eu conferir isso com calma na diretriz…",
    "Só um instante, tô olhando no material com cuidado.",
    "Vou confirmar na fonte antes, tá bom?",
    "Calma, deixa eu checar direitinho aqui.",
    "Um momentinho, tô conferindo com atenção.",
    "Deixa eu ver o que a fonte diz, sem pressa.",
    "Um minutinho, já te conto o que a fonte diz.",
    "Vou dar uma olhada cuidadosa aqui antes, tá?",
  ],
};

/**
 * Gravações das frases na voz do personagem (endereço por frase, mesma ordem de FRASES_ESPERA), gravadas em 17/10/2026 depois da
 * aprovação do dono: Gemini TTS (gemini-3.8-flash-tts), Stazi = "Zubenelgenubi" JÁ afinado +3 semitons (o mesmo afinador da voz ao
 * vivo; o app toca sem afinar de novo), Stazia = "Kore". mp3 mono 24 kHz em public/novo-assets/tutor/espera (manifesto.json traz
 * texto, duração e volume de cada uma); `?v=` muda quando o arquivo muda (o navegador não fica com a gravação velha). 18/10: o ruído
 * de ~170 ms que o Gemini TTS deixa no fim de todo arquivo (o "chiado") foi tirado (scripts/voz-teste/limpar-chiado-espera.ts).
 * Mudou o texto de uma frase? Grave de novo (scripts/voz-teste/gravar-frases-espera.ts): o teste confere texto x manifesto.
 * Sem gravação, a frase aparece só escrita.
 */
const gravadas = (prefixo: string, versoes: readonly string[]) => versoes.map((v, i) => `/novo-assets/tutor/espera/${prefixo}-${i + 1}.mp3?v=${v}`);
export const VINHETAS: Readonly<Partial<Record<PersonaEspera, readonly string[]>>> = {
  durao: gravadas("stazi-durao", ["fdf2e221", "69c7d651", "583b46e6", "b22b7c61", "d2560cec", "87581f60", "1b3b0197", "b9c18f80"]),
  acolhedor: gravadas("stazi-tranquilo", ["2dc97de8", "ff42fad9", "92cb44c4", "154b41b1", "e47975ee", "af3a53de", "3f3eb9a5", "5b6db6cd"]),
  durona: gravadas("stazia-durona", ["a6533cfc", "2fe6f6f7", "3c6f97e0", "34326dcd", "4aa356a8", "5c39e3d7", "2982f8b2", "da5deeb3"]),
  tranquila: gravadas("stazia-tranquila", ["71896d10", "a61d2722", "b5969794", "33f83b2e", "0fc07c10", "987a1876", "5213945f", "25cb3850"]),
};

/** A personalidade (id do banco) para as frases. "direto" virou Tranquilo (migração 013590); desconhecida: Tranquila. */
export function personaDeEspera(id: string | null | undefined): PersonaEspera {
  const x = String(id ?? "").trim().toLowerCase();
  if (x === "durao" || x === "durona" || x === "tranquila" || x === "acolhedor") return x;
  if (x === "direto" || x === "tranquilo") return "acolhedor";
  if (x.startsWith("durona")) return "durona"; // variantes da Durona (Explosiva etc.)
  return "tranquila";
}

/** Nome do personagem da personalidade (Stazi: Durão e Tranquilo; Stazia: Durona e Tranquila). */
export const nomeDaPersona = (p: PersonaEspera): "Stazi" | "Stazia" => (p === "durao" || p === "acolhedor" ? "Stazi" : "Stazia");

/** Indicador do texto: "Stazia está conferindo a fonte…". */
export const textoConferindo = (nome: string | null | undefined) => `${String(nome ?? "").trim() || "O Tutor"} está conferindo a fonte…`;

/**
 * Rodízio sem repetir dentro da mesma conversa: sorteia entre as frases ainda não usadas desta personalidade; usou as 8, recomeça sem
 * repetir a última. `sortear` (0 a 1) pode ser trocado nos testes.
 */
export class RodizioDeEspera {
  private usadas = new Map<PersonaEspera, number[]>();
  private ultima = new Map<PersonaEspera, number>();
  constructor(private sortear: () => number = Math.random) {}

  proxima(persona: PersonaEspera): { frase: string; indice: number; vinheta: string | null } {
    const frases = FRASES_ESPERA[persona];
    let usadas = this.usadas.get(persona) ?? [];
    if (usadas.length >= frases.length) usadas = [];
    const ultima = this.ultima.get(persona);
    let livres = frases.map((_, i) => i).filter((i) => !usadas.includes(i));
    if (livres.length > 1 && ultima != null) livres = livres.filter((i) => i !== ultima);
    const indice = livres[Math.min(livres.length - 1, Math.floor(Math.max(0, this.sortear()) * livres.length))];
    this.usadas.set(persona, [...usadas, indice]);
    this.ultima.set(persona, indice);
    return { frase: frases[indice], indice, vinheta: VINHETAS[persona]?.[indice] ?? null };
  }
}

/**
 * Roda `trabalho` e, se passar de `ms` sem terminar, chama `aoDemorar` (uma vez). `aoTerminar` sempre roda no fim (para apagar a frase).
 * Nunca muda o resultado nem o erro do trabalho.
 */
export async function comEspera<T>(trabalho: Promise<T>, aoDemorar: () => void, aoTerminar: () => void = () => {}, ms = ATRASO_ESPERA_MS): Promise<T> {
  const t = setTimeout(() => {
    try {
      aoDemorar();
    } catch {
      // a frase nunca derruba a busca
    }
  }, ms);
  try {
    return await trabalho;
  } finally {
    clearTimeout(t);
    try {
      aoTerminar();
    } catch {
      // idem
    }
  }
}
