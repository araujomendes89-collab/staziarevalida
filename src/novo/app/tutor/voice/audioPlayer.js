// Tocador da voz no navegador: os pedaços PCM da voz ao vivo (Gemini) e o mp3 da voz do professor (Nexus). Toca pelo mesmo
// contexto de áudio e por um MediaStream que a esfera mede (o nível do som anima a esfera); para tudo na hora quando o aluno
// interrompe.
// 17/10/2026: a voz ao vivo pode vir afinada (o Stazi sobe +3 semitons, efeito de desenho; pitchShift.js). Com 0 semitons (a Stazia)
// o caminho é exatamente o de antes. O mp3 do professor (playEncoded) nunca é afinado.
// 17/10/2026: frase de espera FALADA (tocarVinheta): gravação curta na voz do personagem, JÁ afinada no arquivo; sai pelo mesmo ganho
// e pela mesma trilha da boca, nunca pelo afinador, e a fala ao vivo ou a interrupção cortam na hora.
import { AfinadorStream, normalizarSemitons, seguirSemitonsDaVoz, semitonsDaVoz } from "./pitchShift.js";

// Folga para agendar o primeiro pedaço de uma fala (como sempre foi).
const FOLGA_S = 0.03;
// Relógio de reserva da voz afinada: se nem o fim da geração nem o turno completo chegarem, solta o fim guardado no afinador só
// depois de a fila de som acabar e passar este tempo sem pedaço novo (fala acabou de verdade). Nunca no meio da fala.
const ESPERA_RESERVA_MS = 100;

// Nível da voz para a boca do personagem (17/10/2026): em vez de medir o som depois de tocado (analisador, com atraso e janela
// curta), o tocador anota o volume de cada 10 ms no instante exato em que vai sair no alto-falante. Quem anima pergunta "qual o
// nível do som que está saindo agora?" pelo MediaStream de sempre (nivelDoFluxo(stream)), sem prop nova.
const BLOCO_S = 0.01;
const GANHO_NIVEL = 1 / 0.32; // RMS da fala do Gemini: mediana ~0,2 e 90% abaixo de ~0,35 → 0..1
const NIVEL_POR_FLUXO = new WeakMap();

/** Função (msDoRelogio = performance.now(), adiantoS = 0) → nível 0..1 do som que sai do alto-falante naquele instante; ou null. */
export function nivelDoFluxo(stream) {
  return stream ? NIVEL_POR_FLUXO.get(stream) ?? null : null;
}

/** RMS por blocos de 10 ms (Float32Array). */
export function rmsPorBloco(data, rate) {
  const n = Math.max(1, Math.round(rate * BLOCO_S));
  const out = new Float32Array(Math.ceil(data.length / n));
  for (let b = 0; b < out.length; b++) {
    let s = 0;
    const fim = Math.min(data.length, (b + 1) * n);
    for (let i = b * n; i < fim; i++) s += data[i] * data[i];
    out[b] = Math.sqrt(s / Math.max(1, fim - b * n));
  }
  return out;
}

/** base64 de PCM 16 bits → Float32. */
export function base64ToFloat32(b64) {
  const bin = atob(b64);
  const n = bin.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v / 0x8000;
  }
  return out;
}

export class AudioPlayer {
  /**
   * opcoes.semitons: afina a voz ao vivo (play) neste valor; opcoes.seguirTela: sem valor próprio, segue definirSemitonsDaVoz.
   */
  constructor(ctx, volume = 1, onIdle = null, opcoes = {}) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(ctx.destination);
    // a esfera lê o nível de áudio de um MediaStream (o mesmo caminho da voz ao vivo)
    this.dest = typeof ctx.createMediaStreamDestination === "function" ? ctx.createMediaStreamDestination() : null;
    if (this.dest) this.gain.connect(this.dest);
    this.trilha = []; // [{ ini (s do contexto), v: RMS por bloco de 10 ms }] do que já está agendado
    if (this.dest?.stream) NIVEL_POR_FLUXO.set(this.dest.stream, (ms, adiantoS = 0) => this.nivelEm(this.tempoOuvido(ms) + adiantoS));
    this.next = 0;
    this.sources = new Set();
    this.waiting = new Set(); // promessas de playEncoded que o stop() resolve com false
    this.onIdle = onIdle;
    this.semitons = 0;
    this.afinador = null;
    this.esvaziar = null; // relógio que solta o fim guardado no afinador quando a fila de som vai acabar
    this.vinheta = null; // frase de espera tocando: { src, g, trilha, resolve }
    this._vinhetaVez = null; // frase de espera sendo preparada (decodificando)
    if (opcoes.semitons != null) this.setSemitons(opcoes.semitons);
    else if (opcoes.seguirTela) {
      // sem valor próprio: segue o que a tela de voz pede (definirSemitonsDaVoz), inclusive se mudar com a ligação aberta
      this.largarTela = seguirSemitonsDaVoz((s) => this.setSemitons(s));
      this.setSemitons(semitonsDaVoz());
    }
  }
  /** Quanto afinar a voz ao vivo daqui em diante (0 = sem afinar, caminho original). O que estava guardado no afinador é descartado. */
  setSemitons(n) {
    const s = normalizarSemitons(n);
    if (s === this.semitons) return;
    this.semitons = s;
    this.afinador = null;
    this._pararRelogio();
  }
  _pararRelogio() {
    if (this.esvaziar) clearTimeout(this.esvaziar);
    this.esvaziar = null;
  }
  /** Instante do contexto (s) que está saindo no alto-falante no momento `ms` (performance.now), com a latência de saída. */
  tempoOuvido(ms = typeof performance !== "undefined" ? performance.now() : 0) {
    const c = this.ctx;
    const ts = typeof c.getOutputTimestamp === "function" ? c.getOutputTimestamp() : null;
    if (ts && ts.contextTime > 0 && ts.performanceTime > 0) return ts.contextTime + (ms - ts.performanceTime) / 1000;
    return c.currentTime - (c.outputLatency || c.baseLatency || 0);
  }
  /** Nível 0..1 do som agendado no instante `t` (s do contexto): RMS de ~30 ms em volta (3 blocos), 0 no silêncio. */
  nivelEm(t) {
    let soma = 0;
    for (const k of [-1, 0, 1]) {
      const x = t + k * BLOCO_S;
      for (let i = this.trilha.length - 1; i >= 0; i--) {
        const p = this.trilha[i];
        const b = Math.floor((x - p.ini) / BLOCO_S);
        if (b >= 0 && b < p.v.length) {
          soma += p.v[b] * p.v[b];
          break;
        }
      }
    }
    return Math.min(1, Math.sqrt(soma / 3) * GANHO_NIVEL);
  }
  _anotar(data, rate, ini) {
    const agora = this.ctx.currentTime;
    this.trilha = this.trilha.filter((p) => p.ini + p.v.length * BLOCO_S > agora - 1);
    this.trilha.push({ ini, v: rmsPorBloco(data, rate) });
  }
  get stream() {
    return this.dest?.stream ?? null;
  }
  get playing() {
    return this.sources.size > 0;
  }
  _track(src) {
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (!this.sources.size) this.onIdle?.();
    };
  }
  /** Pedaço de PCM 16 bits em base64 (a voz ao vivo), na sequência dos anteriores, sem buraco. */
  play(b64, rate = 24000) {
    this.pararVinheta(); // a resposta chegou: a frase de espera para na hora (nunca as duas juntas)
    if (this.ctx.state === "suspended") this.ctx.resume?.()?.catch?.(() => {});
    let data = base64ToFloat32(b64);
    if (this.semitons) {
      // afinada: o afinador devolve o pedaço já afinado (o finzinho, de ~10 a ~34 ms, fica guardado para emendar com o próximo).
      // Taxa nova no meio: o que o afinador antigo guardava sai antes.
      if (this.afinador && this.afinador.taxa !== rate) {
        this.flush();
        this.afinador = null;
      }
      if (!this.afinador) this.afinador = new AfinadorStream({ semitons: this.semitons, taxa: rate });
      const a = this.afinador;
      // Quando a fila está vazia (começo da fala, ou a rede atrasou), agenda com a folga de sempre MAIS o que o afinador ainda pode
      // vir a segurar (latenciaMax − retidas). Assim a fala afinada sai ~34 ms depois e, dali em diante, tem exatamente os mesmos
      // buracos da voz sem afinar (nenhum, se os pedaços chegam no ritmo da fala): o que fica retido vira atraso, não buraco.
      const extra = (a.latenciaMax - a.retidas) / rate;
      data = a.processar(data);
      // nada saiu ainda (pedaço miúdo no começo): marca onde a fala vai começar, para o próximo pedaço contar a folga certa
      if (data.length) this._agendar(data, rate, extra);
      else this.next = Math.max(this.ctx.currentTime + FOLGA_S + extra, this.next);
      this._armarRelogio();
      return;
    }
    this._agendar(data, rate);
  }
  /**
   * Fim da fala (geração ou turno completo; ou o relógio de reserva): solta o que o afinador guardou, logo depois do último
   * pedaço, e o afinador recomeça do zero. Sem afinação, não faz nada.
   */
  flush() {
    this._pararRelogio();
    const a = this.afinador;
    if (!a) return;
    const resto = a.finalizar();
    this._agendar(resto, a.taxa);
  }
  _armarRelogio() {
    this._pararRelogio();
    if (!this.afinador?.retidas) return;
    // reserva: só depois de a fila acabar E passar ESPERA_RESERVA_MS sem pedaço novo (cada pedaço novo recomeça o relógio). Se a
    // rede atrasar menos que isso, o afinador NÃO recomeça: o pedaço seguinte emenda pela folga do play().
    const ms = Math.max(0, this.next - this.ctx.currentTime) * 1000 + ESPERA_RESERVA_MS;
    this.esvaziar = setTimeout(() => {
      this.esvaziar = null;
      this.flush();
    }, ms);
  }
  /** `extra` (s): folga a mais quando a fila está vazia (só a voz afinada usa; 0 = caminho original). */
  _agendar(data, rate, extra = 0) {
    if (!data.length) return;
    // o pedaço vem na taxa dele; o contexto toca na taxa dele (o navegador converte)
    const buf = this.ctx.createBuffer(1, data.length, rate);
    buf.getChannelData(0).set(data);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    const at = Math.max(this.ctx.currentTime + FOLGA_S + extra, this.next);
    src.start(at);
    this.next = at + buf.duration;
    this._anotar(data, rate, at);
    this._track(src);
  }
  /** Um áudio inteiro já codificado (mp3 da voz do professor). Resolve true quando termina e false quando o stop() corta. */
  async playEncoded(arrayBuffer) {
    this.pararVinheta();
    if (this.ctx.state === "suspended") await this.ctx.resume?.()?.catch?.(() => {});
    const buf = await this.ctx.decodeAudioData(arrayBuffer.slice ? arrayBuffer.slice(0) : arrayBuffer);
    return new Promise((resolve) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.gain);
      const done = (finished) => {
        this.waiting.delete(done);
        resolve(finished);
      };
      this.waiting.add(done);
      this.sources.add(src);
      // a boca só acompanha quando o áudio decodificado traz as amostras (navegador real); sem elas o som toca do mesmo jeito
      if (typeof buf.getChannelData === "function") this._anotar(buf.getChannelData(0), buf.sampleRate, this.ctx.currentTime);
      src.onended = () => {
        this.sources.delete(src);
        done(true);
        if (!this.sources.size) this.onIdle?.();
      };
      src.start(0);
    });
  }
  /**
   * Frase de espera gravada (ArrayBuffer do mp3, ou AudioBuffer já decodificado). O arquivo JÁ vem afinado: aqui NUNCA passa pelo
   * afinador (semitons 0 para este áudio, qualquer que seja a afinação da voz ao vivo). Sai pelo mesmo ganho e MediaStream (a boca do
   * personagem mexe pela mesma trilha), mas não conta como fala do professor (`playing` e onIdle não mudam). Não toca por cima do
   * professor. Uma por vez. Resolve true se tocou até o fim; false se foi cortada (play, playEncoded, stop, pararVinheta) ou não tocou.
   */
  async tocarVinheta(audio) {
    this.pararVinheta();
    const vez = {};
    this._vinhetaVez = vez;
    let buf;
    try {
      if (this.ctx.state === "suspended") await this.ctx.resume?.()?.catch?.(() => {});
      buf = audio && typeof audio.getChannelData === "function" ? audio : await this.ctx.decodeAudioData(audio.slice ? audio.slice(0) : audio);
    } catch {
      buf = null;
    }
    if (this._vinhetaVez !== vez) return false; // cortada enquanto preparava
    this._vinhetaVez = null;
    if (!buf || this.sources.size) return false; // não decodificou, ou o professor está falando
    return new Promise((resolve) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain(); // ganho próprio: o corte sai com 20 ms de rampa, sem estalo
      g.gain.value = 1;
      src.connect(g);
      g.connect(this.gain);
      const at = this.ctx.currentTime + FOLGA_S;
      if (typeof buf.getChannelData === "function") this._anotar(buf.getChannelData(0), buf.sampleRate, at);
      const v = { src, g, trilha: this.trilha[this.trilha.length - 1], resolve };
      this.vinheta = v;
      src.onended = () => {
        if (this.vinheta !== v) return;
        this.vinheta = null;
        this._soltar(v);
        resolve(true);
      };
      src.start(at);
    });
  }
  get vinhetaTocando() {
    return Boolean(this.vinheta || this._vinhetaVez);
  }
  /** Corta a frase de espera agora (a boca fecha junto). Sem frase, não faz nada. */
  pararVinheta() {
    this._vinhetaVez = null;
    const v = this.vinheta;
    if (!v) return;
    this.vinheta = null;
    v.src.onended = null;
    const t = this.ctx.currentTime;
    try {
      v.g.gain.setValueAtTime?.(v.g.gain.value, t);
      v.g.gain.linearRampToValueAtTime?.(0, t + 0.02);
      v.src.stop(t + 0.02);
    } catch {
      try {
        v.src.stop();
      } catch {
        // já parou
      }
    }
    this.trilha = this.trilha.filter((p) => p !== v.trilha);
    v.resolve(false);
  }
  _soltar(v) {
    try {
      v.g.disconnect?.();
    } catch {
      // já desligado
    }
  }
  stop() {
    // interrupção: o que o afinador guardava é descartado junto (nada da fala cortada sai depois)
    this._pararRelogio();
    this.afinador?.reiniciar();
    this.pararVinheta();
    for (const s of this.sources) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        // já parou
      }
    }
    this.sources.clear();
    this.next = 0;
    this.trilha = []; // a boca fecha junto com a voz cortada
    for (const done of [...this.waiting]) done(false);
  }
  setVolume(v) {
    this.gain.gain.value = v;
  }
  /** O contexto é compartilhado (a esfera usa o mesmo): só desliga os nós desta voz. */
  close() {
    this.stop();
    this.largarTela?.();
    this.largarTela = null;
    try {
      this.gain.disconnect();
    } catch {
      // já desligado
    }
  }
}
