/**
 * Voice Tutor — Fase 2 (protótipo, SÓ TESTE). Monta as instruções da Durona com as MESMAS camadas do Tutor atual
 * (server/tutor/prompts.ts, personality.ts, emotion.ts) e uma questão de TESTE (server/vozTeste/questaoTeste.ts).
 *
 * Nada aqui lê banco, aluno ou chave: a personalidade é uma cópia dos dados da Durona das migrações
 * (20261003003500_tutor_v2.sql e 20261003004900_tutor_sem_filtro_voz_gemini.sql).
 */
import { BASE_TUTOR_PROMPT, FALA_SEM_FILTRO, MEDICAL_GROUNDING_RULES, TUTOR_MODES, TUTOR_REALTIME, TUTOR_REALTIME_LANGUAGE } from "../tutor/prompts";
import { effectiveParams, personalityLayer, type Personality, type ProfanityLevel } from "../tutor/personality";
import { engineFor, languageIntensity, normalize, profanityForIntensity, stateLayer, type DuronaLevel } from "../tutor/emotion";
import { blocoBase, QUESTAO_ANAFILAXIA, type QuestaoTeste } from "./questaoTeste";

/** Níveis do painel + "sem_palavrao" (só para o teste: a Durona com bronca, mas sem nenhum palavrão). */
export type NivelTeste = DuronaLevel | "sem_palavrao";
export const NIVEIS_TESTE: readonly NivelTeste[] = ["sem_palavrao", "moderada", "forte", "sem_filtro"] as const;
export const nivelValido = (v: unknown): NivelTeste => (NIVEIS_TESTE.includes(v as NivelTeste) ? (v as NivelTeste) : "forte");

/** Durona como está no banco (cópia fixa para o teste). */
export const DURONA: Personality = {
  id: "durona",
  name: "Durona",
  params: { humor: 85, sarcasm: 80, friendliness: 35, strictness: 85, profanity: 60, patience: 30, verbosity: 35, socratic_level: 60, motivation: 55, clinical_pressure: 70 },
  style_notes:
    'Você é uma professora brasileira escrachada e sem filtro, do tipo que todo residente já teve: exigente, impaciente, sarcástica, engraçada e muito expressiva. Fala como gente, não como livro: reage na hora, ri, bufa, resmunga, debocha, solta palavrão quando dá vontade (de raiva ou de alegria) e GRITA quando o aluno vacila feio ou quando acerta uma difícil. Não pede desculpa pelo jeito e não amacia: se a resposta foi péssima, diz que foi péssima. A bronca cresce com os erros e, quanto maior a raiva, maior a COBRANÇA: você para tudo e exige o raciocínio. Quando o aluno acerta logo depois de errar, você mostra alívio, com um palavrão sobre a situação ("Ufa, porra, até que enfim!"); num acerto sem erro antes, reconhece do seu jeito, meio a contragosto ("Tá. Essa foi bonita, vai."). O alvo é sempre a resposta, a desatenção, o chute ou a preguiça; nunca a dignidade da pessoa.',
  examples: [
    "Ah, não. NÃO. Lê esse enunciado de novo, pelo amor de Deus.",
    "Sério isso? Você tinha o diagnóstico na mão e jogou fora na conduta.",
    "Chutou, né? Tô vendo daqui. Me fala o raciocínio.",
    "Hum... olha só quem resolveu estudar hoje. Boa.",
    "Cinco seguidas?! Quem é você e o que fez com meu aluno?",
    "Calma. Respira. Agora me diz o que te fez marcar essa.",
  ],
  examples_strong: [
    "PORRA, de novo?! Você caiu EXATAMENTE no mesmo ponto!",
    "Caralho, é a terceira vez nessa pegadinha. TERCEIRA!",
    "Puta merda, você sabe isso. Para de responder correndo!",
    "ISSO, PORRA! Agora sim! Viu como você sabe?",
    "Não, não, não. Chega. Esquece as alternativas e me explica esse raciocínio de merda.",
  ],
};

const SUAVE: [RegExp, string][] = [[/porra/gi, "pô"], [/caralho/gi, "caramba"], [/merda/gi, "droga"], [/puta que pariu/gi, "nossa senhora"]];
export const suavizar = (t: string) => SUAVE.reduce((a, [re, w]) => a.replace(re, w), t);

/** Persona + estado inicial da sessão no nível pedido. Devolve também o teto de palavrão (a conferência por frase usa). */
export function camadaDurona(nivel: NivelTeste): { texto: string; palavrao: ProfanityLevel } {
  const engine = nivel === "sem_palavrao" ? engineFor("durona", { language_max: 1, language_base: 1 }, null) : engineFor("durona", null, nivel);
  const estado = normalize({}, engine);
  const palavrao = profanityForIntensity(languageIntensity(estado, engine));
  const eff = effectiveParams(DURONA.params, 3);
  // sem palavrão: o texto de estilo do banco cita "porra" como exemplo; aqui ele vira a versão leve (mesma emoção)
  const p = palavrao === "off" ? { ...DURONA, style_notes: suavizar(DURONA.style_notes).replace("solta palavrão quando dá vontade", "solta interjeição forte quando dá vontade").replace(", com um palavrão sobre a situação", "") } : DURONA;
  const texto = [personalityLayer(p, eff, palavrao, 3, null, null), stateLayer("durona", estado, engine, palavrao)].join("\n\n");
  return { texto, palavrao };
}

/** O TUTOR_REALTIME sem as linhas de ferramentas do Tutor atual (o protótipo tem as suas, mais simples). */
const VOZ_SEM_FERRAMENTAS = TUTOR_REALTIME.split("\n")
  .filter((l) => !/ferramenta|get_question_context|get_topic_context|submit_answer|evaluate_student_reasoning|wait_for_user|save_tutor_memory|schedule_review/.test(l))
  .join("\n");

const BASE_FALADA = BASE_TUTOR_PROMPT.replace(/ \(em <contexto_do_aluno>\)/, "")
  .replace(/\n- "evaluation"[^\n]*/, "")
  .replace(/\n- "suggested_replies"[^\n]*/, "")
  .replace(/\n- "jogo"[^\n]*/, "");

const REGRAS_FALADAS = MEDICAL_GROUNDING_RULES.replace(/ Quando usar, registre em "citations"[^.]*\./, "")
  .replace(/, marque grounding = INSUFFICIENT/, "")
  .replace(/\n- "grounding"[^\n]*/, "");

const COM_FERRAMENTAS = `FERRAMENTAS (a correção vem daqui, nunca da sua cabeça)
- O caso está em <base>, SEM gabarito. Você não precisa de ferramenta para apresentar o caso nem para ajudar a pensar.
- Assim que o aluno disser uma letra, chame submit_answer com a letra. Quem corrige é o sistema: use exatamente o gabarito, a explicação e a fonte que voltarem. Depois disso, get_question_context também traz a correção.
- Antes da resposta do aluno você NÃO sabe o gabarito: não diga qual é a certa, nem por eliminação, mesmo que ele implore.
- Nunca fale das ferramentas nem do sistema.`;

/** Reações de voz permitidas (o DONO escolhe; padrão: nenhuma). Só tags da ElevenLabs v3; o Gemini Live não usa tags. */
export function camadaReacoes(reacoes: string[]): string {
  const ok = reacoes.filter((r) => /^\[[a-z ]{2,30}\]$/.test(r));
  if (!ok.length) return "";
  return `REAÇÕES DE VOZ: você pode usar, raramente e só quando o momento pedir, estas marcações entre colchetes (e nenhuma outra): ${ok.join(" ")}. Elas não são lidas em voz alta: mudam o jeito da voz nas palavras seguintes.`;
}

export interface OpcoesInstrucoes {
  nivel: NivelTeste;
  /** "live": a voz é do próprio modelo (Gemini Live). "texto": um TTS lê o texto (Custom LLM / cascata). */
  canal: "live" | "texto";
  questao?: QuestaoTeste;
  /** Letra que o aluno já disse (o servidor detecta); null = questão aberta, sem gabarito no contexto. */
  respondida?: string | null;
  /** true (Gemini Live): o caso vai no prompt SEM gabarito; a correção só vem pela ferramenta submit_answer. */
  ferramentas?: boolean;
  reacoes?: string[];
}

/** Instruções completas da sessão (todas as camadas). O navegador nunca manda nem vê este texto. */
export function instrucoesDurona(o: OpcoesInstrucoes): string {
  const { texto: persona } = camadaDurona(o.nivel);
  const q = o.questao ?? QUESTAO_ANAFILAXIA;
  const reacoes = o.canal === "texto" ? camadaReacoes(o.reacoes ?? []) : "";
  const saidaTexto =
    o.canal === "texto"
      ? "SAÍDA: só o que você vai falar, em texto corrido para ser lido por uma voz. Sem lista, sem markdown, sem emoji, sem símbolo. Comece com uma frase curta (a voz começa a falar antes de você terminar)."
      : "";
  return [
    TUTOR_REALTIME_LANGUAGE,
    reacoes ? BASE_FALADA.replace(/\n- Nunca escreva marcações entre colchetes[^\n]*/, "") : BASE_FALADA,
    REGRAS_FALADAS,
    TUTOR_MODES.questao,
    VOZ_SEM_FERRAMENTAS,
    o.ferramentas ? COM_FERRAMENTAS : "",
    FALA_SEM_FILTRO,
    persona,
    reacoes,
    saidaTexto,
    // com ferramentas o caso vai sem gabarito (a correção só sai por submit_answer); sem ferramentas, o servidor decide
    blocoBase(q, o.ferramentas ? null : o.respondida ?? null),
    "Esta é uma sessão de TESTE do protótipo de voz. Se o aluno ainda não falou da questão, apresente o caso em uma ou duas frases do seu jeito e pergunte qual alternativa ele marca.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
