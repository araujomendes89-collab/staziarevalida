// Tocador da voz no navegador: os pedaços PCM da voz ao vivo (Gemini) e o mp3 da voz do professor (Nexus). Toca pelo mesmo
// contexto de áudio e por um MediaStream que a esfera mede (o nível do som anima a esfera); para tudo na hora quando o aluno
// interrompe.
// 17/10/2026: a voz ao vivo pode vir afinada (o Stazi sobe +3 semitons, efeito de desenho; pitchShift.js). Com 0 semitons (a Stazia)
// o caminho é exatamente o de antes. O mp3 do professor (playEncoded) nunca é afinado.
import { AfinadorStream, normalizarSemitons, seguirSemitonsDaVoz, semitonsDaVoz } from "./pitchShift.js";

// Folga para agendar o primeiro pedaço de uma fala (como sempre foi).
const FOLGA_S = 0.03;
// Relógio de reserva da voz afinada: se nem o fim da geração nem o turno completo chegarem, solta o fim guardado no afinador só
// depois de a fila de som acabar e passar este tempo sem pedaço novo (fala acabou de verdade). Nunca no meio da fala.
const ESPERA_RESERVA_MS = 100;

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
    this.next = 0;
    this.sources = new Set();
    this.waiting = new Set(); // promessas de playEncoded que o stop() resolve com false
    this.onIdle = onIdle;
    this.semitons = 0;
    this.afinador = null;
    this.esvaziar = null; // relógio que solta o fim guardado no afinador quando a fila de som vai acabar
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
    this._track(src);
  }
  /** Um áudio inteiro já codificado (mp3 da voz do professor). Resolve true quando termina e false quando o stop() corta. */
  async playEncoded(arrayBuffer) {
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
      src.onended = () => {
        this.sources.delete(src);
        done(true);
        if (!this.sources.size) this.onIdle?.();
      };
      src.start(0);
    });
  }
  stop() {
    // interrupção: o que o afinador guardava é descartado junto (nada da fala cortada sai depois)
    this._pararRelogio();
    this.afinador?.reiniciar();
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
