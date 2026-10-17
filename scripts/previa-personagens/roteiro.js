// Roteiro da demonstração (15–20 s) como função PURA do tempo: o mesmo ms dá sempre o mesmo estado, emoção e nível de áudio.
// Usado pela prévia, pela captura quadro a quadro (motor próprio) e pela composição do Remotion (comparação).
export const DURACAO_MS = 19500;

export const CENAS = [
  { de: 0, ate: 1600, estado: "ready", emocao: "neutral", intensidade: 0.3, legenda: "Pront@ para conversar" },
  { de: 1600, ate: 4200, estado: "listening", emocao: "neutral", intensidade: 0.3, legenda: "Ouvindo o aluno (reage ao microfone)" },
  { de: 4200, ate: 5600, estado: "thinking", emocao: "neutral", intensidade: 0.3, legenda: "Pensando" },
  { de: 5600, ate: 8800, estado: "speaking", emocao: "happy", intensidade: 0.7, legenda: "Falando, contente (boca acompanha a voz)" },
  { de: 8800, ate: 11600, estado: "speaking", emocao: "firm", intensidade: 0.6, legenda: "Falando com firmeza" },
  { de: 11600, ate: 14600, estado: "speaking", emocao: "angry", intensidade: 0.9, legenda: "Com raiva, mas respeitos@" },
  { de: 14600, ate: 16200, estado: "listening", emocao: "skeptical", intensidade: 0.6, legenda: "Desconfiad@, ouvindo" },
  { de: 16200, ate: 18200, estado: "speaking", emocao: "relieved", intensidade: 0.7, legenda: "Aliviad@: você acertou!" },
  { de: 18200, ate: 19500, estado: "ended", emocao: "neutral", intensidade: 0.3, legenda: "Tchau" },
];

const onda = (ms, hz, f = 0) => Math.sin(2 * Math.PI * hz * (ms / 1000) + f);

/** Voz simulada: sílabas (~4,3 por segundo) dentro de frases, com pausas curtas. 0..1. */
export function vozSimulada(ms) {
  const silaba = Math.pow(Math.max(0, onda(ms, 4.3) * 0.5 + 0.5), 1.4);
  const frase = Math.max(0, onda(ms, 0.55, 0.6) * 0.6 + 0.55);
  const variacao = 0.75 + 0.25 * onda(ms, 1.7, 2);
  return Math.min(1, silaba * frase * variacao * 1.05);
}

export function cenaEm(ms) {
  const t = Math.max(0, Math.min(DURACAO_MS - 1, ms));
  return CENAS.find((c) => t >= c.de && t < c.ate) ?? CENAS[CENAS.length - 1];
}

/** Desde quando vale o estado e a emoção da cena (cenas seguidas com o mesmo estado contam juntas), e o que vinha antes. */
export function desdeEm(c) {
  const i = CENAS.indexOf(c);
  let e = i;
  while (e > 0 && CENAS[e - 1].estado === c.estado) e--;
  let m = i;
  while (m > 0 && CENAS[m - 1].emocao === c.emocao) m--;
  return {
    estado: CENAS[e].de,
    emocao: m === 0 ? -1e9 : CENAS[m].de,
    estadoAnterior: e > 0 ? CENAS[e - 1].estado : c.estado,
    emocaoAnterior: m > 0 ? CENAS[m - 1].emocao : c.emocao,
  };
}

/** { estado, emocao, intensidade, niveis: {input, output}, desde, legenda } no instante ms. */
export function roteiro(ms) {
  const c = cenaEm(ms);
  const local = ms - c.de;
  const fala = c.estado === "speaking" ? vozSimulada(local + 300) : 0;
  const mic = c.estado === "listening" ? vozSimulada(local * 0.9 + 1100) * 0.85 : 0;
  return { estado: c.estado, emocao: c.emocao, intensidade: c.intensidade, niveis: { input: mic, output: fala }, desde: desdeEm(c), legenda: c.legenda };
}

/** Uma cena fixa (estado + emoção) com o áudio simulado correspondente, para as capturas por estado/emoção. */
export function cenaFixa(estado, emocao, intensidade) {
  return (ms) => ({
    estado,
    emocao,
    intensidade,
    niveis: { input: estado === "listening" || estado === "interrupted" ? vozSimulada(ms + 1100) * 0.85 : 0, output: estado === "speaking" ? vozSimulada(ms + 300) : 0 },
    desde: { estado: 0, emocao: -1e9 },
    legenda: "",
  });
}
