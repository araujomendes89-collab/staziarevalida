// AudioWorklet do microfone: reduz para 16 kHz, mede a energia e entrega pedaços de 40 ms (640 amostras, PCM 16 bits).
class Captura extends AudioWorkletProcessor {
  constructor() {
    super();
    this.razao = sampleRate / 16000;
    this.pos = 0;
    this.saida = new Int16Array(640);
    this.n = 0;
    this.soma = 0;
  }
  process(entradas) {
    const canal = entradas[0]?.[0];
    if (!canal) return true;
    // reamostragem simples por média dos vizinhos (suficiente para fala)
    while (this.pos < canal.length) {
      const i = Math.floor(this.pos);
      const v = Math.max(-1, Math.min(1, canal[i]));
      this.saida[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      this.soma += v * v;
      if (this.n === this.saida.length) {
        const rms = Math.sqrt(this.soma / this.n);
        this.port.postMessage({ pcm: this.saida.buffer, rms }, [this.saida.buffer]);
        this.saida = new Int16Array(640);
        this.n = 0;
        this.soma = 0;
      }
      this.pos += this.razao;
    }
    this.pos -= canal.length;
    return true;
  }
}
registerProcessor("captura-16k", Captura);
