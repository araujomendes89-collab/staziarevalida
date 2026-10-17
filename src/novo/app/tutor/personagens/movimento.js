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
    // falando sem emoção: a pose de falar (a boca simples abre e fecha com a frase, sem tremer)
    return { listening: "ouvindo", interrupted: "ouvindo", thinking: "pensando", reconnecting: "pensando", ended: "acenando", speaking: "falando" }[estado] ?? "base";
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

// ---- voz → boca e corpo (17/10/2026: a boca fica sincronizada com as sílabas e o corpo para de tremer) ----
// Antes: um só envelope (ataque 45 ms, queda 150 ms) movia a boca E o corpo; o nível saturava (a boca ficava quase sempre aberta,
// só variando a transparência) e chegava ~85 ms atrasado; o corpo pulava a cada sílaba (batida de 4,8 Hz) e isso lia como tremor.
// Agora são dois seguidores: um rápido para a boca (fecha entre as sílabas) e um lento para o corpo (só a frase, sem sílaba).
/**
 * Boca em 3 aberturas (0 fechada, 0,5 meia, 1 aberta). Limiares com histerese sobre o envelope rápido RELATIVO ao pico recente da
 * voz (cada voz e cada volume abrem a boca por inteiro na sílaba forte e a fecham no vale entre as sílabas).
 * Ajustado nas vozes gravadas do Stazi e da Stazia: ~8 trocas de abertura por segundo de conversa (~3 sílabas fechando por segundo).
 */
export const BOCA_LIMIAR_ABRE = 0.45; // fechada → meia
export const BOCA_LIMIAR_FECHA = 0.3; // meia → fechada
export const BOCA_LIMIAR_ABERTA = 0.8; // meia → aberta
export const BOCA_LIMIAR_MEIA = 0.66; // aberta → meia
export const BOCA_SEGURA_MS = 55; // cada abertura dura pelo menos isso (sem piscar de boca)
export const BOCA_ATAQUE_MS = 15;
export const BOCA_QUEDA_MS = 30;
const PICO_PISO = 0.35; // abaixo disto não é fala (ruído baixo não abre a boca)
const PICO_QUEDA_MS = 1200; // o pico recente esquece devagar (frase a frase)
export const BOCA_TRANSICAO_MS = 30; // a boca desliza até a abertura nova (sem degrau)
export const CORPO_ATAQUE_MS = 140;
export const CORPO_QUEDA_MS = 420;

/**
 * Seguidor da voz, função pura do histórico: `amostras` = [{ t, v }] do mais velho ao mais novo (v = nível da voz de 0 a 1).
 * Devolve { env, rapido, nivel, boca }:
 * - `env` (0..1): envelope LENTO (ataque ~140 ms, queda ~420 ms) que move o corpo e a aura: acompanha a frase, não a sílaba;
 * - `rapido`: envelope da boca (ataque ~15 ms, queda ~30 ms): sobe na sílaba e cai entre as sílabas (comparado ao pico recente);
 * - `nivel` (0, 0,5 ou 1): abertura escolhida com histerese e permanência mínima, subindo ou descendo um degrau de cada vez;
 * - `boca` (0..1): a abertura que aparece, deslizando até `nivel` (~30 ms), sem salto.
 * `ataqueMs`/`quedaMs` mudam só o envelope lento (o microfone usa um pouco mais lento).
 */
export function seguidorVoz(amostras, { ataqueMs = CORPO_ATAQUE_MS, quedaMs = CORPO_QUEDA_MS } = {}) {
  let env = 0;
  let rapido = 0;
  let pico = PICO_PISO;
  let degrau = 0; // 0, 1, 2
  let desdeTroca = 1e9;
  let boca = 0;
  let antes = amostras?.[0]?.t ?? 0;
  for (const { t, v: bruto } of amostras ?? []) {
    const v = clamp(bruto || 0);
    const dt = Math.max(1, Math.min(80, t - antes));
    antes = t;
    env += (v - env) * (1 - Math.exp(-dt / (v > env ? ataqueMs : quedaMs)));
    rapido += (v - rapido) * (1 - Math.exp(-dt / (v > rapido ? BOCA_ATAQUE_MS : BOCA_QUEDA_MS)));
    pico = Math.max(rapido, pico + (PICO_PISO - pico) * (1 - Math.exp(-dt / PICO_QUEDA_MS)));
    const u = rapido / Math.max(pico, PICO_PISO);
    desdeTroca += dt;
    let quer = degrau;
    if (degrau === 0 && u > BOCA_LIMIAR_ABRE) quer = 1;
    else if (degrau === 1 && u > BOCA_LIMIAR_ABERTA) quer = 2;
    else if (degrau === 1 && u < BOCA_LIMIAR_FECHA) quer = 0;
    else if (degrau === 2 && u < BOCA_LIMIAR_MEIA) quer = 1;
    // subir de meia para aberta pode ser logo (a sílaba forte não espera); o resto respeita a permanência mínima
    const segura = degrau === 1 && quer === 2 ? BOCA_SEGURA_MS * 0.6 : BOCA_SEGURA_MS;
    if (quer !== degrau && desdeTroca >= segura) {
      degrau = quer;
      desdeTroca = 0;
    }
    boca += (degrau / 2 - boca) * (1 - Math.exp(-dt / BOCA_TRANSICAO_MS));
  }
  return { env, rapido, nivel: degrau / 2, boca: boca < 0.01 ? 0 : boca };
}

/**
 * Como desenhar a abertura da boca com o recorte de boca ABERTA (sem imagem nova): escala vertical presa na linha da boca (a meia
 * boca é a aberta com o queixo "achatado" para cima; o lábio de cima não mexe) e opacidade só para entrar/sair do fechado.
 */
export function aparenciaBoca(boca) {
  const b = clamp(boca);
  return { opacidade: smoothstep(0, 0.22, b), escala: 0.42 + 0.58 * b };
}

/**
 * Geometria da boca dentro do recorte (px lógicos), tirada do manifesto. Vale para qualquer recorte novo do manifesto.
 * - `corte`: altura do focinho dentro do recorte. O que fica acima (as sobrancelhas) não aparece: senão a testa pula a cada sílaba.
 * - `dobra`: a linha da boca (`boca.labio`, o ponto mais baixo do lábio de cima). Do focinho até a dobra o recorte fica PARADO, no
 *   lugar exato da boca aberta original (lábio de cima e cantos da boca); só o que está abaixo dela (abertura, lábio de baixo,
 *   queixo) estica com a abertura. Antes (17/10/2026) a dobra era o centro do focinho, ~31–41 px lógicos acima do lábio: na meia
 *   boca o lábio e os cantos subiam até ~6 px na tela de voz ("a boca sai do lugar"). Sem `labio` no manifesto: dobra no focinho.
 * - a elipse (centro no focinho) apaga a borda do recorte (gola, queixo) para a boca meio aberta não deixar emenda; as duas partes
 *   usam a mesma elipse, então a boca aberta é exatamente o recorte inteiro.
 */
export function geometriaBoca(sprite) {
  const b = sprite?.boca;
  if (!b) return null;
  const corte = clamp((sprite.ny ?? b.y) - b.y, 0, b.h * 0.9);
  const h = b.h - corte;
  const dobra = clamp(Number.isFinite(b.labio) ? b.labio - b.y : corte, corte, b.h * 0.95);
  return { corte, h, dobra, hCima: dobra - corte, hBaixo: b.h - dobra, cx: clamp((sprite.nx ?? b.x + b.w / 2) - b.x, 0, b.w), rx: 0.4 * b.w, ry: 0.8 * h };
}

/**
 * Onde fica, em px lógicos do recorte, a linha que estava em `y` na boca aberta original, com a abertura `escala` (aparenciaBoca):
 * acima da dobra nada mexe; abaixo, encolhe em direção à dobra. Serve aos testes e à bancada (a mesma conta que o CSS faz).
 */
export function posicaoNaBoca(g, y, escala) {
  return y <= g.dobra ? y : g.dobra + (y - g.dobra) * escala;
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
 * intensidade (0..1: controla a AMPLITUDE de tudo, não só a pose), entrada (microfone 0..1), saida (voz 0..1: o envelope LENTO do
 * seguidorVoz, move corpo e aura), boca (0..1: a abertura do seguidorVoz; sem ela, sai da saida), pose, reduzido.
 */
export function quadro({ t = 0, tEstado = 1e9, tPose = 1e9, antecipa = 0, estado = "idle", emocao = "neutral", intensidade = 0.3, entrada = 0, saida = 0, boca: bocaEntrada = null, pose = "base", semente = 1, reduzido = false }) {
  const cor = COR_EMOCAO[emocao] ?? COR_EMOCAO.neutral;
  const efeito = efeitoDo(estado, emocao, intensidade);
  if (reduzido) {
    // boca simples: abre (meia) enquanto a frase soa e fecha nas pausas, sem acompanhar sílaba e sem escala; o resto fica parado
    const bocaR = estado === "speaking" && POSES_COM_BOCA.has(pose) && bocaEntrada != null && saida > 0.25 ? 0.5 : 0;
    return { x: 0, y: 0, rot: 0, sx: 1, sy: 1, boca: bocaR, olhos: estado === "paused" ? 1 : 0, troca: 1, aura: 0.35 + intensidade * 0.3, cor, efeito, nivelEfeito: 0.6, t: 0 };
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
    // o corpo segue a FRASE (saida = envelope lento, ~140/420 ms), nunca a sílaba: nada de batida rápida (era 4,8 Hz, lia como
    // tremor). Um aceno lento da cabeça (ruído de 0,5 Hz) dá vida; quente: acentos secos e raros para baixo; alegre: balança mais.
    const fala = saida * (0.55 + 0.45 * n(13, 0.5));
    const acento = smoothstep(0.35, 0.8, n(21, 0.7)) * saida;
    y -= (3.2 * (1 - 0.55 * tensao) * fala + 2 * perfil.alegria * fala) * amp * (0.6 + 0.8 * inten); // aceno maior com a emoção forte
    y += 3 * tensao * acento * amp;
    sy += 0.012 * fala * amp * (1 - 0.4 * tensao);
    sx -= 0.005 * fala * amp;
    rot += (1.1 - 0.7 * tensao) * saida * n(14, 0.45) * 1.4 * amp * balanco + 1.8 * perfil.alegria * saida * n(15, 0.5) * amp + 1.4 * tensao * acento * amp;
    if (!POSES_COM_BOCA.has(pose)) sy += 0.01 * smoothstep(0.1, 0.4, saida) * amp;
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
