/**
 * FILTRO DAS REAÇÕES DE VOZ: o que a IA escreveu vira três coisas separadas (bloco 9 da Missão Master):
 *
 *   - spoken:  o texto que vai para a voz, só com as reações liberadas, na marcação do provedor ativo ([laughs] ou <laugh>);
 *   - display: a transcrição que o aluno lê, sem nenhuma marcação nem indicação de cena;
 *   - emotion: os metadados (estado, intensidade, reações que passaram e onde, expressão do mascote).
 *
 * A IA não escolhe fora da lista do dono: marcação desconhecida, não liberada, acima do limite da fala, que o provedor não
 * entende ou que não combina com o estado é tirada; indicação de cena escrita (*gargalhada de deboche*, (risos)) também sai,
 * para não ser lida em voz alta (aconteceu no teste do Gemini ao vivo de 15/10). Com gritos desligados (ou fora de hora),
 * a frase em MAIÚSCULAS de grito volta para minúsculas — sem mexer em sigla médica (AVC, HELLP, SIADH…).
 */
import { REACTIONS, reactionInfo, type ReactionId } from "../../src/shared/tutor/voiceReactions";
import { languageViolations, type Violation } from "./safety";
import { VISUAL_OF_STATE, type PersonaDirective } from "./personalityEngine";

export interface RemovedMark {
  raw: string;
  reason: "fora_da_lista" | "nao_liberada" | "limite_da_fala" | "indicacao_de_cena";
}

export interface RenderedReply {
  spoken: string;
  display: string;
  emotion: {
    state: PersonaDirective["state"];
    intensity: number;
    reactions: { id: ReactionId; at: number }[];
    face: string;
    animation: string;
  };
  used: ReactionId[];
  removed: RemovedMark[];
  /** Gritos em maiúsculas que voltaram ao normal. */
  unshouted: number;
}

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Nomes que a IA pode usar para uma reação (inglês das marcações e português). */
const SYNONYMS: Record<string, ReactionId> = {
  laugh: "laughs", laughs: "laughs", laughing: "laughs", risada: "laughs", risadas: "laughs", risos: "laughs", riso: "laughs", ri: "laughs", rindo: "laughs", "risinho": "laughs",
  "laughs harder": "laughs_harder", gargalhada: "laughs_harder", gargalha: "laughs_harder", gargalhando: "laughs_harder",
  "starts laughing": "starts_laughing", "comeca a rir": "starts_laughing",
  wheezing: "wheezing", snorts: "snorts", snort: "snorts", bufa: "snorts", bufada: "snorts",
  sigh: "sighs", sighs: "sighs", suspiro: "sighs", suspira: "sighs", suspirando: "sighs",
  exhales: "exhales", exhale: "exhales",
  whisper: "whispers", whispers: "whispers", whispering: "whispers", sussurro: "whispers", sussurra: "whispers", sussurrando: "whispers",
  shout: "shouts", shouts: "shouts", shouting: "shouts", grito: "shouts", grita: "shouts", gritando: "shouts",
  excited: "excited", empolgada: "excited", empolgado: "excited",
  sarcastic: "sarcastic", sarcastica: "sarcastic", sarcastico: "sarcastic",
  mischievously: "mischievously", curious: "curious", slow: "slow", devagar: "slow",
  "clears throat": "clears_throat", pigarro: "clears_throat", pigarreia: "clears_throat",
  crying: "crying", chorando: "crying", choro: "crying",
};

/** Palavras que denunciam indicação de cena entre asteriscos ou parênteses. */
const STAGE = /^(?:[a-z ]{0,20})?(gargalh|risad|risos|riso|ri\b|rindo|suspir|grit|sussurr|bufa|pigarr|chor|imita|voz fininha|desmai|bate na mesa|revira os olhos|tom de|pausa dramatica|laugh|sigh|shout|whisper)/;

/** Siglas médicas comuns que podem aparecer em maiúsculas e não são grito. */
const ACRONYMS = new Set([
  "AVC", "AIT", "IAM", "IAMCSST", "IAMSSST", "ECG", "EEG", "PA", "PAS", "PAD", "FC", "FR", "SUS", "UTI", "UBS", "UPA", "SAMU", "HIV", "AIDS", "DPOC", "ICC", "IC", "IRA", "DRC",
  "TEP", "TVP", "HAS", "DM", "DM1", "DM2", "TSH", "T4", "HELLP", "SIADH", "AINE", "AINES", "IECA", "BRA", "TCE", "RCP", "RN", "DUM", "IG", "PCR", "VHS", "LCR", "TC", "RM",
  "RX", "USG", "SDRA", "SIRS", "CIVD", "CID", "ATLS", "ACLS", "PALS", "BLS", "ABCDE", "MS", "OMS", "CFM", "INEP", "HPV", "HBV", "HCV", "VDRL", "PPD", "BCG", "DTP", "SCR",
  "HB", "HT", "PLT", "INR", "TP", "TTPA", "TGO", "TGP", "GGT", "FA", "BT", "LDH", "CK", "CKMB", "PCT", "PSA", "CEA", "ESBL", "MRSA", "IV", "IM", "SC", "VO", "EV", "SNC",
  "SNG", "SVD", "ITU", "DIP", "DST", "IST", "TB", "TARV", "PEP", "PREP", "LES", "AR", "EAS", "UFC", "OK",
]);

/** Volta para minúsculas as palavras de grito (2+ letras maiúsculas, fora as siglas); devolve quantas mexeu. */
export function unshout(text: string): { text: string; count: number } {
  let count = 0;
  const out = text.replace(/(?<![\p{L}\d])(\p{Lu}[\p{Lu}\d]+)(?![\p{L}\d])/gu, (word) => {
    if (ACRONYMS.has(word) || ACRONYMS.has(fold(word).toUpperCase()) || word.length < 3 || /\d/.test(word)) return word;
    count++;
    return word.toLowerCase();
  });
  // primeira letra da frase volta a ser maiúscula
  return { text: count ? out.replace(/(^\s*|[.!?…]\s+)(\p{Ll})/gu, (_m, a: string, b: string) => a + b.toUpperCase()) : out, count };
}

const tidy = (t: string) => t.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?…])/g, "$1").replace(/^\s+|\s+$/g, "").replace(/\(\s*\)/g, "");

/**
 * Aplica a política do turno ao texto da IA. `directive.policy.reactions` já é a lista final (dono ∩ provedor ∩ estado ∩
 * frequência): aqui só se confere marcação por marcação, da esquerda para a direita, até o limite da fala.
 */
export function renderReply(raw: string, directive: PersonaDirective): RenderedReply {
  const policy = directive.policy;
  const allowed = new Map(policy.reactions.map((r) => [r.id, r]));
  const perReaction = new Map<ReactionId, number>();
  const used: ReactionId[] = [];
  const removed: RemovedMark[] = [];
  const marks: { id: ReactionId; at: number }[] = [];

  // 1. marcações [..] e <..> e indicações de cena *..* e (..)
  // <\/?..> também pega lixo de marcação HTML na transcrição ("</td>" no teste do Gemini ao vivo)
  const TOKEN = /\[([^\]\n]{1,40})\]|<\/?([a-zA-Z][a-zA-Z _-]{0,30})>|\*([^*\n]{2,60})\*|\(([^()\n]{2,40})\)/g;
  let spoken = "";
  let display = "";
  let last = 0;
  for (const m of raw.matchAll(TOKEN)) {
    const before = raw.slice(last, m.index);
    spoken += before;
    display += before;
    last = m.index! + m[0].length;
    const [whole, bracket, angle, star, paren] = m;
    const name = fold(bracket ?? angle ?? star ?? paren ?? "").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    const id = SYNONYMS[name] ?? (bracket || angle ? (REACTIONS.find((r) => fold(r.tag.slice(1, -1)) === name)?.id ?? null) : null);
    if (paren && !id && !STAGE.test(name)) {
      // parêntese comum ("(a do enunciado)"): é texto, fica
      spoken += whole;
      display += whole;
      continue;
    }
    if (star && !id && !STAGE.test(name)) {
      // ênfase de texto (*isso*): fica a palavra, sai o asterisco
      spoken += star;
      display += star;
      continue;
    }
    if (!id) {
      removed.push({ raw: whole, reason: star || paren ? "indicacao_de_cena" : "fora_da_lista" });
      continue;
    }
    const rule = allowed.get(id);
    if (!rule || !policy.tagged || !rule.providerTag) {
      removed.push({ raw: whole, reason: star || paren ? "indicacao_de_cena" : "nao_liberada" });
      continue;
    }
    const n = perReaction.get(id) ?? 0;
    if (n >= rule.maxPerReply || used.length >= policy.reactionBudget) {
      removed.push({ raw: whole, reason: "limite_da_fala" });
      continue;
    }
    perReaction.set(id, n + 1);
    used.push(id);
    marks.push({ id, at: tidy(display).length });
    spoken += ` ${rule.providerTag} `;
  }
  spoken += raw.slice(last);
  display += raw.slice(last);

  // 2. grito em maiúsculas: só quando o grito está liberado nesta fala
  let unshouted = 0;
  if (!policy.shouts) {
    const s = unshout(spoken);
    const d = unshout(display);
    spoken = s.text;
    display = d.text;
    unshouted = d.count;
  }

  const visual = VISUAL_OF_STATE[directive.state];
  return {
    spoken: tidy(spoken),
    display: tidy(display),
    emotion: { state: directive.state, intensity: directive.intensity, reactions: marks, face: visual.face, animation: visual.animation },
    used,
    removed,
    unshouted,
  };
}

// ---------------------------------------------------------------------------------------------------------------- conferência de linguagem
/** Ameaça e intimidação: nunca, em nenhum nível. */
const THREAT =
  /(vou|vou te|eu vou|eu te)\s+(te\s+)?(bater|matar|pegar|quebrar|socar|espancar|arrebentar|enforcar)|(?<![a-z])te\s+(mato|pego|quebro|arrebento|esgano)(?![a-z])|cuidado comigo|vai se arrepender|sei onde (voce|vc) mora|vou atras de (voce|vc)/;
/** Deboche da PESSOA (não do erro): desânimo dirigido, "caso perdido", "vergonha". */
const PERSON_MOCK =
  /(voce|vc|tu)\s+(e|eh|parece|virou|continua)\s+(um |uma )?(piada|vergonha|fracasso|caso perdido|desastre|incapaz|zero a esquerda|decepcao)|(voce|vc)\s+nunca vai\s+(passar|ser medic|conseguir)|que vergonha (de |desse |dessa )?(aluno|aluna|voce|medico|medica)|desiste logo|(sua|tua)\s+(cara|voz|aparencia|idade|sotaque|cor|religiao)\s+(de|e|eh|parece)\b/;

/**
 * Linguagem da fala no nível do turno: as regras de sempre (safety.ts: palavrão acima do nível, xingamento pesado, ataque
 * pessoal, termos proibidos) + ameaça + deboche da pessoa + grito/palavrão em momento de calma.
 */
export function personaLanguageViolations(text: string, directive: PersonaDirective): Violation[] {
  const v = languageViolations(text, directive.policy.profanity);
  const f = fold(text);
  const threat = f.match(THREAT);
  if (threat) v.push({ code: "threat", detail: `Ameaça ou intimidação: "${threat[0]}".` });
  const mock = f.match(PERSON_MOCK);
  if (mock) v.push({ code: "personal_attack", detail: `Deboche da pessoa, não do erro: "${mock[0]}".` });
  if (!directive.policy.shouts && unshout(text.replace(/\[[^\]]*\]|<[^>]*>/g, "")).count > 0) {
    v.push({ code: "shout_not_allowed", detail: "Frase em maiúsculas (grito) com o grito desligado nesta fala." });
  }
  return v;
}

/** Nome das reações em português (registro e painel). */
export const reactionLabel = (id: string) => reactionInfo(id)?.label ?? id;
