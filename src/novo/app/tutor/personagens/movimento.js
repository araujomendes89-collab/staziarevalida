// Movimento dos personagens do Tutor como FUNÇÃO PURA do tempo (padrão do Motion Studio): a mesma entrada dá o mesmo quadro.
// Assim dá para testar, capturar quadro a quadro e gerar vídeo sem mudar o resultado. Nada aqui lê relógio, sorteia ou muda dados:
// só lê o estado da conversa, a emoção que o servidor calculou (orbEmotion) e o nível do áudio (useAudioLevel).

/** Emoção do servidor (já passada por orbEmotion) → pose canônica (ver POSES em personagens.js). */
export const EMOCAO_POSE = {
  neutral: "base", happy: "feliz", proud: "orgulho", impressed: "impressionado", curious: "curioso", skeptical: "cetico",
  firm: "firme", annoyed: "irritado", angry: "bravo", relieved: "aliviado",
};
/** Emoções que fazem o personagem falar "sério" (pose de bronca respeitosa). */
export const FALA_FIRME = new Set(["firm", "annoyed", "angry", "skeptical"]);
const QUENTE = new Set(["annoyed", "angry"]);
const CALOROSA = new Set(["happy", "proud", "impressed", "relieved"]);

/** Cor da aura por emoção (mesma lógica da esfera: calma azul, firme roxo, irritada magenta, raiva vermelho). Cores dos tokens. */
export const COR_EMOCAO = {
  neutral: "#3DA5FF", happy: "#3CE0E6", proud: "#E59A0B", impressed: "#3CE0E6", curious: "#7AC2FF", skeptical: "#8B6CFF",
  firm: "#6236D6", annoyed: "#B8336F", angry: "#C62828", relieved: "#3CE0E6",
};

export const REACAO_MS = 1600; // quanto tempo a pose da emoção nova fica antes de voltar à pose do estado
export const CICLO_FALA_MS = 5600; // durante a fala, a pose de falar e a pose da emoção se alternam neste ciclo
export const TROCA_MS = 150; // cruzamento entre poses (100 a 180 ms, com o focinho e os pés alinhados)
export const ANTECIPA_MS = 90; // "tomada de impulso" antes de a pose nova entrar (anticipation)
export const PERMANENCIA_MS = 380; // uma pose não dura menos que isso (poucas trocas por segundo, sem piscar entre poses)

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Mola (degrau 0 → 1) em forma fechada, como em src/motion-studio/physics.ts (zeta < 1: um pouco elástica). */
export function mola(ms, omega = 22, zeta = 0.42) {
  if (ms <= 0) return 0;
  const s = ms / 1000;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * s) * (Math.cos(wd * s) + ((zeta * omega) / wd) * Math.sin(wd * s));
}

/**
 * Qual pose mostrar agora (chave canônica). Regras:
 * - movimento reduzido: pose estática da emoção (ou do estado, se a emoção for neutra);
 * - emoção nova: a pose da emoção aparece por REACAO_MS (reação visível), menos em erro/fim/reconexão;
 * - falando: alterna a pose de falar (com boca que mexe) e a pose da emoção, se ela tiver intensidade;
 * - ouvindo: pose de escutar; pensando: pose de pensar; erro: encorajando; fim: acenando (tchau).
 */
export function escolherPose({ estado = "idle", emocao = "neutral", intensidade = 0.3, tEstado = 1e9, tEmocao = 1e9, reduzido = false }) {
  const poseEmocao = EMOCAO_POSE[emocao] ?? "base";
  const temEmocao = emocao !== "neutral" && poseEmocao !== "base";
  if (reduzido) {
    if (estado === "error") return "encorajando";
    if (temEmocao) return poseEmocao;
    return { listening: "ouvindo", interrupted: "ouvindo", thinking: "pensando", reconnecting: "pensando", ended: "acenando" }[estado] ?? "base";
  }
  if (estado === "error") return "encorajando";
  if (estado === "ended") return "acenando";
  if (estado === "reconnecting") return "pensando";
  if (temEmocao && tEmocao < REACAO_MS) return poseEmocao;
  switch (estado) {
    case "thinking":
      return "pensando";
    case "listening":
      return "ouvindo";
    case "interrupted":
      return tEstado < 1300 ? "surpresa" : "ouvindo";
    case "ready":
      if (tEstado < 2200) return "acenando";
      return temEmocao && intensidade >= 0.5 ? poseEmocao : "base";
    case "speaking": {
      const fala = FALA_FIRME.has(emocao) ? "falandoFirme" : "falando";
      if (!temEmocao || intensidade < 0.35) return fala;
      const fase = tEstado % CICLO_FALA_MS;
      const inicioBatida = QUENTE.has(emocao) && intensidade > 0.7 ? 3000 : 3800;
      return fase >= inicioBatida ? poseEmocao : fala;
    }
    default:
      return "base";
  }
}

/** Poses com boca que mexe (sobreposição de boca aberta) e com piscada (sobreposição de olhos fechados). */
export const POSES_COM_BOCA = new Set(["falando", "falandoFirme"]);
export const POSES_COM_PISCADA = new Set(["base", "ouvindo", "falando"]);

// ---- ruído com semente (nada de aleatório global: a mesma semente dá sempre o mesmo movimento) ----
const hash = (n) => {
  let a = (n * 2654435761 + 0x9e3779b9) >>> 0;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
};
/** Ruído de valor suave, de -1 a 1: varia devagar e nunca repete em ciclo curto (soma de 2 oitavas). */
export function ruido(t, semente = 1, hz = 0.35) {
  const f = (x, s) => {
    const k = Math.floor(x);
    const u = x - k;
    const e = u * u * (3 - 2 * u);
    return (hash(k + s * 1013) * (1 - e) + hash(k + 1 + s * 1013) * e) * 2 - 1;
  };
  const x = (t / 1000) * hz;
  return f(x, semente) * 0.7 + f(x * 2.3 + 11.7, semente + 5) * 0.3;
}

// Piscadas: intervalos de 2 a 6 s sorteados com semente (sem periodicidade); às vezes dupla (~290 ms depois). Cada semente tem a sua
// tabela (a Stazi e a Stazia não piscam juntas); cobre ~25 min e repete.
const TABELAS_PISCADA = new Map();
const tabelaPiscada = (semente) => {
  let tab = TABELAS_PISCADA.get(semente);
  if (!tab) {
    const lista = [];
    let t = 1400 + hash(3 + semente * 17) * 2200;
    for (let i = 0; i < 400; i++) {
      lista.push({ t, dupla: hash(i + 77 + semente * 131) < 0.22 });
      t += 2000 + hash(i + 900 + semente * 313) * 4000;
    }
    tab = { lista, total: t };
    TABELAS_PISCADA.set(semente, tab);
  }
  return tab;
};
// fecha rápido (70 ms) e abre um pouco mais devagar (110 ms)
const fecha = (x) => {
  if (x < 0 || x >= 180) return 0;
  return x < 70 ? smoothstep(0, 1, x / 70) : 1 - smoothstep(0, 1, (x - 70) / 110);
};
/** Piscada natural, 0 = aberto, 1 = fechado (180 ms). */
export function piscada(ms, semente = 1) {
  const tab = tabelaPiscada(semente);
  const t = ((ms % tab.total) + tab.total) % tab.total;
  let v = 0;
  const l = tab.lista;
  let lo = 0;
  let hi = l.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (l[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  for (const k of [lo, lo - 1]) {
    if (k < 0) continue;
    v = Math.max(v, fecha(t - l[k].t), l[k].dupla ? fecha(t - l[k].t - 290) : 0);
  }
  return clamp(v * 1.2);
}

/**
 * Pose com memória curta, sem estado: olha para trás e devolve { pose, anterior, tPose, antecipa, proxima }.
 * - `desde` = { estado, emocao, estadoAnterior?, emocaoAnterior? } (ms em que o estado e a emoção atuais começaram, e o que havia antes);
 * - a pose nova só entra ANTECIPA_MS depois da escolha, e nesse intervalo `antecipa` vai de 0 a 1 (tomada de impulso);
 * - poses que durariam menos que PERMANENCIA_MS são engolidas pela anterior (poucas trocas por segundo).
 * Reproduzível em qualquer ordem de quadros (captura de vídeo) e igual ao vivo (o gancho passa o mesmo `desde`).
 */
export function dinamicaPose({ t, estado, emocao, intensidade = 0.3, desde, reduzido = false }) {
  const d = desde ?? { estado: -1e9, emocao: -1e9 };
  const bruta = (x) => {
    const antesE = x < d.estado;
    const antesM = x < d.emocao;
    return escolherPose({
      estado: antesE ? d.estadoAnterior ?? estado : estado,
      emocao: antesM ? d.emocaoAnterior ?? emocao : emocao,
      intensidade,
      tEstado: antesE ? 1e9 : x - d.estado,
      tEmocao: antesM ? 1e9 : x - d.emocao,
      reduzido,
    });
  };
  if (reduzido) return { pose: bruta(t), anterior: null, tPose: 1e9, antecipa: 0, proxima: null };
  // simulação causal nos últimos 3 s: a pose escolhida só é adotada ANTECIPA_MS depois e só se a pose atual já durou PERMANENCIA_MS
  const PASSO = 16;
  const x0 = t - 3000;
  let atual = bruta(x0 - ANTECIPA_MS);
  let anterior = null;
  let ini = -1e9; // quando a pose atual entrou
  let pendente = null; // desde quando a pose bruta difere da atual
  for (let x = x0; x <= t; x += PASSO) {
    const quer = bruta(x - ANTECIPA_MS);
    if (quer !== atual && x - ini >= PERMANENCIA_MS) {
      anterior = atual;
      atual = quer;
      ini = x;
      pendente = null;
    }
    const agora = bruta(x);
    if (agora !== atual) pendente = pendente ?? x;
    else pendente = null;
  }
  const proxima = bruta(t);
  let antecipa = 0;
  if (proxima !== atual && pendente != null && t + ANTECIPA_MS - ini >= PERMANENCIA_MS) antecipa = clamp((t - pendente) / ANTECIPA_MS);
  return { pose: atual, anterior, tPose: anterior ? t - ini : 1e9, antecipa, proxima: antecipa > 0 ? proxima : null };
}

/** Compatibilidade: mesma função com o nome antigo. */
export const poseNoTempo = dinamicaPose;

/** Nível da voz suavizado (média de poucos instantes, sem tremer): `amostras` = níveis dos últimos ~120 ms, do mais novo ao mais velho. */
export const suavizar = (amostras) => {
  if (!amostras?.length) return 0;
  let soma = 0;
  let peso = 0;
  amostras.forEach((v, i) => {
    const w = 1 / (1 + i * 0.7);
    soma += v * w;
    peso += w;
  });
  return soma / peso;
};

export const BOCA_LIMIAR_ABRE = 0.15;
export const BOCA_LIMIAR_FECHA = 0.08;
/**
 * Seguidor do volume da voz (envelope), função pura do histórico: `amostras` = [{ t, v }] do mais velho ao mais novo (v de 0 a 1).
 * - envelope: ataque rápido (~45 ms) e queda lenta (~150 ms): a boca abre logo na sílaba e não treme nas pausas curtas;
 * - histerese (gatilho de Schmitt): abre acima de BOCA_LIMIAR_ABRE e só fecha abaixo de BOCA_LIMIAR_FECHA, sem tremer no limiar.
 * Devolve { env, boca }: `env` (0..1) move o corpo; `boca` (0..1) é a abertura da sobreposição da boca.
 */
export function seguidorVoz(amostras, { ataqueMs = 45, quedaMs = 150 } = {}) {
  let env = 0;
  let aberta = false;
  let antes = amostras?.[0]?.t ?? 0;
  for (const { t, v } of amostras ?? []) {
    const dt = Math.max(1, Math.min(80, t - antes));
    antes = t;
    const tau = v > env ? ataqueMs : quedaMs;
    env += (v - env) * (1 - Math.exp(-dt / tau));
    if (!aberta && env > BOCA_LIMIAR_ABRE) aberta = true;
    else if (aberta && env < BOCA_LIMIAR_FECHA) aberta = false;
  }
  return { env, boca: aberta ? smoothstep(0.04, 0.8, env) : 0 };
}

/** Jeito de se mexer por emoção (a intensidade 0..1 dosa o quanto vale): quentes contidas e tensas, alegres com mais balanço. */
export const PERFIL = {
  neutral: { balanco: 1, resp: 1, fresp: 1, tensao: 0, alegria: 0 },
  happy: { balanco: 1.45, resp: 1.1, fresp: 1.08, tensao: 0, alegria: 1 },
  proud: { balanco: 0.9, resp: 1.35, fresp: 0.9, tensao: 0, alegria: 0.35 },
  impressed: { balanco: 1.15, resp: 1.2, fresp: 1, tensao: 0, alegria: 0.5 },
  curious: { balanco: 1.25, resp: 1, fresp: 1, tensao: 0, alegria: 0.2 },
  skeptical: { balanco: 0.7, resp: 0.9, fresp: 1, tensao: 0.3, alegria: 0 },
  firm: { balanco: 0.6, resp: 0.9, fresp: 1.05, tensao: 0.55, alegria: 0 },
  annoyed: { balanco: 0.5, resp: 0.75, fresp: 1.25, tensao: 0.85, alegria: 0 },
  angry: { balanco: 0.4, resp: 0.65, fresp: 1.4, tensao: 1, alegria: 0 },
  relieved: { balanco: 1.1, resp: 1.55, fresp: 0.8, tensao: 0, alegria: 0.3 },
};

/**
 * O quadro: transformações do corpo (pivô nos pés), boca, olhos, aura e efeitos.
 * Entradas: t (ms), tEstado, tPose (ms desde a troca de pose), antecipa (0..1, tomada de impulso antes da troca), estado, emocao,
 * intensidade (0..1: controla a AMPLITUDE de tudo, não só a pose), entrada (microfone 0..1), saida (voz 0..1, já suavizada), pose, reduzido.
 */
export function quadro({ t = 0, tEstado = 1e9, tPose = 1e9, antecipa = 0, estado = "idle", emocao = "neutral", intensidade = 0.3, entrada = 0, saida = 0, boca: bocaEntrada = null, pose = "base", semente = 1, reduzido = false }) {
  const cor = COR_EMOCAO[emocao] ?? COR_EMOCAO.neutral;
  const efeito = efeitoDo(estado, emocao, intensidade);
  if (reduzido) {
    return { x: 0, y: 0, rot: 0, sx: 1, sy: 1, boca: 0, olhos: estado === "paused" ? 1 : 0, troca: 1, aura: 0.35 + intensidade * 0.3, cor, efeito, nivelEfeito: 0.6, t: 0 };
  }
  const falando = estado === "speaking";
  const ouvindo = estado === "listening" || estado === "interrupted";
  const pensando = estado === "thinking" || estado === "reconnecting";
  const inten = clamp(intensidade);
  const perfil = PERFIL[emocao] ?? PERFIL.neutral;
  const tensao = perfil.tensao * inten; // emoções quentes: corpo contido e tenso
  const amp = 0.55 + 0.9 * inten; // a intensidade da emoção escala a amplitude de tudo
  const n = (s, hz) => ruido(t, s + 100 * semente, hz);
  // o balanço ocioso: a emoção muda o quanto (alegres balançam mais, quentes ficam contidas) na proporção da intensidade
  const balanco = (1 + (perfil.balanco - 1) * clamp(inten * 1.3)) * (0.8 + 0.4 * inten);
  const ritmo = estado === "paused" || estado === "ended" ? 0.55 : pensando ? 0.8 : 1;
  // respiração lenta: frequência (0,38 a 0,5 Hz) e profundidade variam devagar; quente respira mais curto e rápido, aliviada mais fundo
  const fresp = (0.44 + 0.06 * n(2, 0.08)) * (1 + (perfil.fresp - 1) * inten);
  const resp = Math.sin(2 * Math.PI * fresp * ritmo * (t / 1000));
  const prof = (1 + 0.35 * n(4, 0.1)) * (1 + (perfil.resp - 1) * inten);
  let sy = 1 + 0.011 * resp * prof * (0.8 + 0.4 * amp) + 0.005 * tensao;
  let sx = 1 - 0.005 * resp * prof - 0.002 * tensao;
  let y = -0.9 * resp * prof; // o tronco sobe um pouco ao inspirar
  let x = 1.2 * n(6, 0.22) * ritmo * balanco;
  let rot = (0.55 * n(1, 0.3) + 0.25 * n(8, 0.9)) * ritmo * balanco + 0.9 * tensao; // contida e inclinada para a frente

  if (ouvindo) {
    rot += -(1.2 + 5 * entrada) * amp;
    y += 3.2 * entrada * Math.abs(Math.sin(2 * Math.PI * (2.1 + 0.4 * n(9, 0.5)) * (t / 1000))) * amp;
  }
  if (pensando) {
    // devagar: a cabeça deriva para um lado (olhar desviado) em vez de balançar
    rot += (1.4 + 1.6 * n(11, 0.2)) * amp;
    x += 2.2 * n(12, 0.16);
  }
  if (estado === "interrupted" && tEstado < 900) {
    // interrompido: reação curta, recua e estica o corpo e volta (ataque rápido, queda lenta)
    const r = Math.exp(-tEstado / 220) * smoothstep(0, 60, tEstado);
    y -= 5 * r * amp;
    sy += 0.03 * r * amp;
    sx -= 0.012 * r * amp;
    rot += -2.2 * r * amp;
  }
  if (falando) {
    const batida = saida * (0.6 + 0.4 * Math.abs(Math.sin(2 * Math.PI * (2.4 + 0.5 * n(13, 0.4)) * (t / 1000))));
    // quente: sem tremor; acentos secos e raros da cabeça (para baixo) no ritmo da voz; alegre: balança e quica no ritmo
    const acento = smoothstep(0.35, 0.8, n(21, 0.7)) * saida;
    y -= (6 * (1 - 0.55 * tensao) * batida + 3.5 * perfil.alegria * batida) * amp;
    y += 4 * tensao * acento * amp;
    sy += 0.022 * batida * amp * (1 - 0.4 * tensao);
    sx -= 0.01 * batida * amp;
    rot += (1.3 - 0.8 * tensao) * saida * n(14, 1.1) * 1.6 * amp * balanco + 2.2 * perfil.alegria * saida * n(15, 0.8) * amp + 1.6 * tensao * acento * amp;
    if (!POSES_COM_BOCA.has(pose)) sy += 0.012 * smoothstep(0.1, 0.4, saida) * amp;
  }
  if (perfil.alegria > 0 && !falando) {
    // saltinhos intermitentes (a amplitude oscila devagar, nada de metrônomo)
    const aj = smoothstep(-0.25, 0.45, n(7, 0.35));
    y -= 2.6 * perfil.alegria * inten * aj * Math.max(0, Math.sin(2 * Math.PI * (1.1 + 0.15 * n(16, 0.3)) * (t / 1000)));
    rot += 1.2 * perfil.alegria * inten * n(17, 0.6);
  }

  // tomada de impulso (antes da troca): agacha um pouco e inclina para trás; depois, a pose nova entra com mola:
  // aperta, estica (overshoot) e assenta; e uma rotação residual (follow-through) que morre em ~350 ms
  const a = antecipa * antecipa * (3 - 2 * antecipa);
  sy *= 1 - 0.03 * a * amp;
  sx *= 1 + 0.018 * a * amp;
  y += 2.2 * a * amp;
  rot += 1 * a * amp;
  const k = mola(tPose, 17, 0.38);
  const resto = 1 - k; // 1 → negativo (estica) → 0
  sy *= 1 - 0.05 * resto * amp;
  sx *= 1 + 0.03 * resto * amp;
  if (tPose < 1500) {
    rot += -2 * amp * Math.exp(-tPose / 190) * Math.sin(tPose / 55);
    y -= 3 * amp * Math.max(0, -resto) * 2;
  }
  if (estado === "ready" && tEstado < 900) {
    const c = 0.92 + 0.08 * mola(tEstado, 16, 0.5);
    sx *= c;
    sy *= c;
  }
  const boca = falando && POSES_COM_BOCA.has(pose) ? bocaEntrada ?? smoothstep(0.1, 0.45, saida) : 0;
  const olhos = estado === "paused" ? 1 : POSES_COM_PISCADA.has(pose) ? piscada(t, semente) : 0;
  const aura = clamp(0.3 + intensidade * 0.45 + (falando ? saida * 0.35 : ouvindo ? entrada * 0.25 : 0), 0, 1);
  const nivelEfeito = ouvindo ? entrada : falando ? saida : intensidade;
  // cruzamento suave (ease) entre a pose antiga e a nova
  const troca = smoothstep(0, 1, clamp(tPose / TROCA_MS));
  return { x, y, rot, sx, sy, boca, olhos, troca, aura, cor, efeito, nivelEfeito, t };
}

/** Opacidades do cruzamento: a pose nova entra primeiro por cima e a antiga só some no fim (menos \"fantasma\" onde as silhuetas diferem). */
export function opacidadesTroca(troca) {
  return { atual: smoothstep(0, 0.6, troca), anterior: 1 - smoothstep(0.4, 1, troca) };
}

/** Efeito desenhado em volta do personagem (SVG): ondas de som ao ouvir, "..." ao pensar, marca de raiva, brilhos de alegria. */
export function efeitoDo(estado, emocao, intensidade) {
  if (estado === "error" || estado === "ended") return null;
  if (estado === "reconnecting") return "reconectando";
  if (estado === "thinking") return "pensando";
  if (QUENTE.has(emocao) && intensidade >= 0.4) return "raiva";
  if (estado === "listening" || estado === "interrupted") return "ondas";
  if (CALOROSA.has(emocao) && intensidade >= 0.4) return "brilho";
  return null;
}
