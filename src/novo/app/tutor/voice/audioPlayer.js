// Tocador da voz no navegador: os pedaços PCM da voz ao vivo (Gemini) e o mp3 da voz do professor (Nexus). Toca pelo mesmo
// contexto de áudio e por um MediaStream que a esfera mede (o nível do som anima a esfera); para tudo na hora quando o aluno
// interrompe.

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
  constructor(ctx, volume = 1, onIdle = null) {
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
    const data = base64ToFloat32(b64);
    if (!data.length) return;
    // o pedaço vem na taxa dele; o contexto toca na taxa dele (o navegador converte)
    const buf = this.ctx.createBuffer(1, data.length, rate);
    buf.getChannelData(0).set(data);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    const at = Math.max(this.ctx.currentTime + 0.03, this.next);
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
    try {
      this.gain.disconnect();
    } catch {
      // já desligado
    }
  }
}
