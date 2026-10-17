// Os dois personagens do Tutor por voz (pedido do dono, 17/10/2026): o aluno escolhe UM antes de começar e só ele fica na tela.
// - Stazi: lontra menino de moletom azul-marinho com o S da logo (mascote oficial; reaproveita os sprites do Motion Studio).
// - Stazia: lontra menina de moletom rosa e laço rosa, também com o S (personagem nova; poses geradas a partir da arte do dono).
// Cada personagem tem 1 voz e 2 personalidades (decisão de 17/10/2026): Stazi = Durão e Tranquilo; Stazia = Durona e Tranquila.
// O aluno escolhe PRIMEIRO o personagem, depois uma das 2 personalidades dele; a voz vem do personagem. A escolha do personagem
// fica no PERFIL do aluno (tutor_preferences.character, decisão do dono de 17/10/2026; vale em qualquer aparelho), como a
// personalidade. O aparelho (localStorage) guarda uma cópia para a tela abrir sem piscar e, POR CONTA, o toque que o perfil ainda
// não confirmou (a gravação falhou): só esse toque é reenviado, e só pela mesma conta.

export const PERSONAGENS = {
  // `voz`: a voz ao vivo do personagem (decisão do dono, 17/10/2026). gemini = voz do Gemini Live; openai = reserva; semitons = quanto
  // o navegador afina a voz (o Stazi sobe +3, efeito de desenho; a Stazia fica como está). O servidor usa as mesmas vozes (tutor_personalities.voice).
  stazi: { id: "stazi", nome: "Stazi", papel: "seu professor", genero: "o", descricao: "Lontra de moletom azul", voz: { gemini: "Zubenelgenubi", openai: "cedar", semitons: 3 } },
  stazia: { id: "stazia", nome: "Stazia", papel: "sua professora", genero: "a", descricao: "Lontra de moletom rosa e laço", voz: { gemini: "Kore", openai: "marin", semitons: 0 } },
};
export const PERSONAGEM_IDS = ["stazi", "stazia"];

/**
 * As quatro personalidades e a que personagem cada uma pertence (espelho da coluna tutor_personalities.character, que vence
 * quando o servidor manda). `artigo` concorda com o nome: "o Durão", "a Durona", "o Tranquilo", "a Tranquila". `duro` marca as
 * duas que têm o "Jeito" (nível, gritos e palavrões) e o aviso de 18+.
 */
export const PERSONALIDADES = {
  durao: { id: "durao", personagem: "stazi", artigo: "o", duro: true },
  acolhedor: { id: "acolhedor", personagem: "stazi", artigo: "o", duro: false },
  durona: { id: "durona", personagem: "stazia", artigo: "a", duro: true },
  tranquila: { id: "tranquila", personagem: "stazia", artigo: "a", duro: false },
};
export const CHAVE_PERSONAGEM = "smn-tutor-personagem";
/**
 * O toque no personagem que o perfil ainda não confirmou, separado por conta: `smn-tutor-personagem-pendente:<id da conta>`. Só a
 * entrada do Tutor grava aqui (no toque) e apaga (quando o perfil confirma). A cópia do aparelho (CHAVE_PERSONAGEM, que também é a
 * chave da versão antiga) nunca conta como pendente: assim a escolha velha de um aparelho não passa por cima do perfil, e a escolha
 * de um aluno não vai para o perfil de outro que entrar no mesmo navegador.
 */
export const CHAVE_PENDENTE = "smn-tutor-personagem-pendente";
const chavePendente = (conta) => (conta ? `${CHAVE_PENDENTE}:${conta}` : null);
/** Chave de uma versão de teste (nunca publicada) que marcava o pendente sem saber a conta: é apagada quando aparece. */
const CHAVE_ANTIGA_PERFIL = "smn-tutor-personagem-perfil";

export const personagemValido = (id) => (PERSONAGEM_IDS.includes(id) ? id : null);

/**
 * A que personagem a personalidade pertence: o campo `character` do servidor quando vier (objeto da lista ou texto), senão a tabela
 * acima. Personalidade desconhecida ou aposentada (o Direto) = null.
 */
export function personagemDe(personalidade) {
  const id = typeof personalidade === "string" ? personalidade : personalidade?.id;
  const doServidor = typeof personalidade === "object" && personalidade ? personagemValido(personalidade.character) : null;
  return doServidor ?? PERSONALIDADES[id]?.personagem ?? null;
}

/** "o" ou "a": o gênero da personalidade, para "Começar com o Durão", "a Tranquila". */
export function artigoDe(personalidade) {
  const id = typeof personalidade === "string" ? personalidade : personalidade?.id;
  return PERSONALIDADES[id]?.artigo ?? (personagemDe(personalidade) === "stazia" ? "a" : "o");
}

/**
 * Sem escolha salva, o personagem padrão é o do professor que o aluno já usava (cada personalidade pertence a um personagem) ou,
 * sem professor, o Stazi. Depois que o aluno escolhe, o personagem manda: trocar de personalidade nunca troca de personagem.
 */
export const personagemPadrao = (personalityId) => personagemDe(personalityId) ?? "stazi";

export function lerPersonagem(personalityId = null) {
  try {
    const salvo = personagemValido(window.localStorage.getItem(CHAVE_PERSONAGEM));
    if (salvo) return salvo;
  } catch {
    // navegação privada: vale o padrão
  }
  return personagemPadrao(personalityId);
}

/** Quem aparece numa conversa: o personagem da personalidade dela (a voz é dele); sem isso (conversa antiga), a escolha guardada. */
export const personagemDaConversa = (personalityId) => personagemDe(personalityId) ?? lerPersonagem(personalityId);

export function temPersonagemSalvo() {
  try {
    return Boolean(personagemValido(window.localStorage.getItem(CHAVE_PERSONAGEM)));
  } catch {
    return false;
  }
}

export function gravarPersonagem(id) {
  if (!personagemValido(id)) return;
  try {
    window.localStorage.setItem(CHAVE_PERSONAGEM, id);
  } catch {
    // navegação privada: vale só nesta tela
  }
}

function lerChave(chave) {
  try {
    return personagemValido(window.localStorage.getItem(chave));
  } catch {
    return null; // navegação privada ou armazenamento bloqueado
  }
}

/** O toque desta conta que o perfil ainda não confirmou (a gravação falhou ou não voltou). Sem conta ou sem toque pendente, null. */
export function personagemPendente(conta) {
  const chave = chavePendente(conta);
  return chave ? lerChave(chave) : null;
}

/** O aluno tocou num personagem: fica pendente para esta conta até o perfil confirmar. Sem conta, nada fica pendente. */
export function marcarPendente(conta, id) {
  const chave = chavePendente(conta);
  if (!chave || !personagemValido(id)) return;
  try {
    window.localStorage.setItem(chave, id);
  } catch {
    // navegação privada: sem nova tentativa depois
  }
}

/** O perfil confirmou o personagem: vira a cópia do aparelho e deixa de ser pendente para esta conta. */
export function marcarNoPerfil(conta, id) {
  if (!personagemValido(id)) return;
  try {
    window.localStorage.setItem(CHAVE_PERSONAGEM, id);
    const chave = chavePendente(conta);
    if (chave) window.localStorage.removeItem(chave);
    window.localStorage.removeItem(CHAVE_ANTIGA_PERFIL);
  } catch {
    // navegação privada: vale o perfil, sem cópia
  }
}

/**
 * Com que personagem a entrada do Tutor abre. Regra: perfil > aparelho > (quem chama completa com o personagem da personalidade
 * preferida e, por fim, o Stazi). A única exceção é o toque DESTA conta que o perfil ainda não confirmou: ele é o mais novo, então
 * vale ele, e a tela tenta gravar de novo. A cópia do aparelho (ou a chave da versão antiga) nunca passa por cima do perfil.
 * Sem nada escolhido, null.
 */
export function personagemInicial(conta, doPerfil) {
  return personagemPendente(conta) ?? personagemValido(doPerfil) ?? lerChave(CHAVE_PERSONAGEM);
}

/**
 * Pose "canônica" → arquivo de cada personagem. Os dois têm o MESMO conjunto de poses, geradas da arte oficial de cada um (o Stazi
 * não usa as poses antigas de outros figurinos: o salto de roupa e de luz entre elas parecia pouco natural).
 */
export const POSES = {
  stazia: {
    base: "base", acenando: "acenando", ouvindo: "ouvindo", pensando: "pensando", falando: "falando", falandoFirme: "falando-brava",
    feliz: "feliz", orgulho: "orgulhosa", impressionado: "impressionada", curioso: "curiosa", cetico: "cetica", firme: "firme",
    irritado: "irritada", bravo: "brava", aliviado: "aliviada", comemorando: "comemorando", encorajando: "encorajando",
    surpresa: "surpresa", polegar: "polegar",
  },
  stazi: {
    base: "base", acenando: "acenando", ouvindo: "ouvindo", pensando: "pensando", falando: "falando", falandoFirme: "falando-bravo",
    feliz: "feliz", orgulho: "orgulhoso", impressionado: "impressionado", curioso: "curioso", cetico: "cetico", firme: "firme",
    irritado: "irritado", bravo: "bravo", aliviado: "aliviado", comemorando: "comemorando", encorajando: "encorajando",
    surpresa: "surpreso", polegar: "polegar",
  },
};

const ESTADO_TEXTO = {
  idle: "esperando", connecting: "chegando", ready: "pront@ para conversar", listening: "ouvindo", thinking: "pensando",
  speaking: "falando", interrupted: "ouvindo você", paused: "em pausa", reconnecting: "reconectando", ended: "se despedindo",
  error: "com um problema na ligação",
};
const EMOCAO_TEXTO = {
  happy: "content@", proud: "orgulhos@", impressed: "impressionad@", curious: "curios@", skeptical: "desconfiad@", firm: "com firmeza",
  annoyed: "irritad@", angry: "brav@", relieved: "aliviad@",
};

/** Texto para leitor de tela, em português: "Stazia, sua professora, ouvindo" / "Stazi, seu professor, falando, bravo". */
export function rotuloPersonagem(id, estado = "idle", emocao = "neutral") {
  const p = PERSONAGENS[personagemValido(id) ?? "stazi"];
  const g = (s) => s.replace(/@/g, p.genero);
  const partes = [p.nome, p.papel, g(ESTADO_TEXTO[estado] ?? "esperando")];
  if (EMOCAO_TEXTO[emocao] && estado !== "error" && estado !== "ended") partes.push(g(EMOCAO_TEXTO[emocao]));
  return partes.join(", ");
}
