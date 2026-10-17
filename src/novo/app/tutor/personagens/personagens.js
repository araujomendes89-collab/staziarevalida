// Os dois personagens do Tutor por voz (pedido do dono, 17/10/2026): o aluno escolhe UM antes de começar e só ele fica na tela.
// - Stazi: lontra menino de moletom azul-marinho com o S da logo (mascote oficial; reaproveita os sprites do Motion Studio).
// - Stazia: lontra menina de moletom rosa e laço rosa, também com o S (personagem nova; poses geradas a partir da arte do dono).
// A escolha fica guardada no aparelho (localStorage). O perfil do Tutor (tutor_preferences) ainda não tem campo para isso; quando
// tiver, basta ler/gravar aqui.

export const PERSONAGENS = {
  stazi: { id: "stazi", nome: "Stazi", papel: "seu professor", genero: "o", descricao: "Lontra de moletom azul" },
  stazia: { id: "stazia", nome: "Stazia", papel: "sua professora", genero: "a", descricao: "Lontra de moletom rosa e laço" },
};
export const PERSONAGEM_IDS = ["stazi", "stazia"];
export const CHAVE_PERSONAGEM = "smn-tutor-personagem";

export const personagemValido = (id) => (PERSONAGEM_IDS.includes(id) ? id : null);

/** Sem escolha salva, o padrão acompanha o professor: a Durona começa com a Stazia, os outros com o Stazi. */
export const personagemPadrao = (personalityId) => (personalityId === "durona" ? "stazia" : "stazi");

export function lerPersonagem(personalityId = null) {
  try {
    const salvo = personagemValido(window.localStorage.getItem(CHAVE_PERSONAGEM));
    if (salvo) return salvo;
  } catch {
    // navegação privada: vale o padrão
  }
  return personagemPadrao(personalityId);
}

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
