// Servidor, ponte de voz e microfone SIMULADOS da prévia (nada sai do navegador). Tudo o que acontece fica em window.__voz, para o
// teste no Playwright conferir: quantos quadros de áudio a ponte recebeu, interrupções, pedidos ao servidor, microfone pedido etc.
import { banco } from "./sessaoFalsa.jsx";

const params = new URLSearchParams(location.search);
export const cenario = params.get("cenario") || "aovivo";
// modo reserva desde o começo (a voz ao vivo indisponível para a conta): "eleven" e "reserva-medidor-mudo"
const soReserva = cenario === "eleven" || cenario === "reserva-medidor-mudo";
// código de antes (jeito "reserva" para a voz ao vivo): &jeitoAntigo=1
if (params.get("jeitoAntigo")) window.__jeitoAoVivo = "reserva";
const CALL = "33333333-3333-4333-8333-333333333333";
const log = { pedidos: [], textos: [], quadros: 0, quadrosComVoz: 0, falasAluno: 0, interrupcoes: 0, microfone: [], gravacoes: 0, ponteAberta: 0, mudo: false };
window.__voz = log;

const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const RESPOSTA = "[Exemplo] Pré-eclâmpsia é hipertensão depois de vinte semanas com sinal de lesão de órgão. Qual sinal de gravidade você lembra?";
const DESPEDIDA = "[Exemplo] Boa! Hoje você firmou os critérios de gravidade. Amanhã a gente treina a dose do sulfato.";

/** WAV curto (seno com envelope), para a "voz do professor" da cascata tocar de verdade no navegador. */
function wav(seconds = 1.6, rate = 24000) {
  const n = Math.floor(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 180 * i) / rate) * 9000 * Math.min(1, i / 2000, (n - i) / 2000), true);
  return new Blob([buf], { type: "audio/wav" });
}

// ------------------------------------------------------------------ servidor
const realFetch = window.fetch.bind(window);
window.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.includes("/api/tutor/")) return realFetch(url, init);
  const path = u.slice(u.indexOf("/api/tutor/") + 10).split("?")[0];
  let body = null;
  try {
    body = init.body && typeof init.body === "string" ? JSON.parse(init.body) : null;
  } catch {
    body = null;
  }
  log.pedidos.push({ path, body });
  await new Promise((r) => setTimeout(r, 80));
  switch (path) {
    case "/status":
      return json({ ready: true, live_voice: false, voice_hint: "gemini", realtime_voice: true });
    case "/nexus":
      return json({
        voice_enabled: true, stt: true, reserve: !soReserva, reserve_minutes: cenario === "sem-minutos" ? 0 : 8, minutes_today: 5,
        live: !soReserva && cenario !== "sem-minutos", live_minutes: cenario === "sem-minutos" ? 0 : 8,
        professors: ["durao", "acolhedor", "durona", "tranquila"].map((id) => ({ id, eleven: true, sample: false, reason: null })),
      });
    case "/voice/open": {
      // o servidor escolhe o jeito: voz ao vivo primeiro; sem ela (skip), a voz do professor; sem as duas, por escrito
      const skip = body?.skip ?? null;
      const live = !soReserva && cenario !== "sem-minutos" && !skip;
      const jeito = live ? (window.__jeitoAoVivo ?? "aovivo") : skip === "voice" ? "escrito" : "eleven";
      return json({ jeito, voice_call_id: jeito === "aovivo" || jeito === "reserva" ? null : CALL, mic: true, reason: null, minutes_today: 5, reserve_minutes: 8, live_minutes: 8 });
    }
    case "/voice/start":
      // depois que a ponte falhou neste aparelho, o servidor não tem outra voz ao vivo (nada de chamar a OpenAI de verdade aqui)
      if (body?.avoid?.includes?.("gemini")) return json({ error: "A conversa por voz não está disponível agora.", code: "voice_unavailable" }, 503);
      if (cenario === "sem-minutos") return json({ error: "Seus minutos de voz deste mês acabaram.", code: "voice_quota" }, 429);
      return json({ provider: "gemini", voice_call_id: "44444444-4444-4444-8444-444444444444", gemini_ponte: { url: "wss://ponte-falsa.exemplo/voz", bilhete: "bilhete-da-previa" }, entitlement: { voice: { remaining_s: 8 * 60 } } });
    case "/voice/renew":
      return json({ stop: false, remaining_s: 7 * 60, lease_seconds: 120 });
    case "/voice/end":
    case "/voice/metrics":
    case "/voice/usage":
      return json({ ok: true });
    case "/voice/transcript":
      banco.mensagens.push({ id: 100 + banco.mensagens.length, role: body.role === "tutor" ? "tutor" : "student", content: body.text });
      return json({ ok: true });
    case "/opening":
    case "/opening/prepare":
      return json({ opening: null });
    case "/voice/transcribe":
      log.gravacoes++;
      return json({ text: "[Exemplo] me explica pré-eclâmpsia" });
    case "/voice/say": {
      const despedida = /encerr/i.test(body?.text ?? "");
      const content = despedida ? DESPEDIDA : RESPOSTA;
      banco.mensagens.push({ id: 200 + banco.mensagens.length, role: "tutor", content });
      return json({ intent: "message", message: { id: 200 + banco.mensagens.length, content, voice_avatar: { emotion: despedida ? "happy" : "neutral", intensity: 50 } }, phrase: null, marked: null, question_state: "none" });
    }
    case "/speech":
      return Promise.resolve(new Response(wav(), { status: 200, headers: { "Content-Type": "audio/wav" } }));
    default:
      return json({ error: `rota não simulada: ${path}` }, 404);
  }
};

// ------------------------------------------------------------------ ponte de voz (Gemini Live pelo Cloud Run), com VAD do "servidor"
const pcmRms = (b64) => {
  const bin = atob(b64);
  let sum = 0;
  const n = bin.length >> 1;
  for (let i = 0; i < n; i++) {
    let s = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (s & 0x8000) s -= 0x10000;
    sum += (s / 32768) ** 2;
  }
  return n ? Math.sqrt(sum / n) : 0;
};
const tomPcm = (ms, fase) => {
  const n = Math.floor((24000 * ms) / 1000);
  const bytes = new Uint8Array(n * 2);
  const v = new DataView(bytes.buffer);
  for (let i = 0; i < n; i++) v.setInt16(i * 2, Math.sin((2 * Math.PI * 200 * (i + fase)) / 24000) * 7000, true);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

class PonteFalsa {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.tutorFalando = false;
    this.alunoFalando = false;
    this.ultimaVoz = 0;
    log.ponte = this;
    setTimeout(() => {
      if (cenario === "ponte-fora") {
        this.readyState = 3;
        this.onerror?.({});
        return;
      }
      this.readyState = 1;
      log.ponteAberta++;
      this.onopen?.();
    }, 60);
  }
  emit(o) {
    if (o.t !== "audio") (log.eventos ??= []).push(`${Math.round(performance.now())} ${o.t} ${o.quem ?? ""} ${o.texto ?? ""}`.trim());
    if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(o) });
  }
  send(raw) {
    const m = JSON.parse(raw);
    if (m.t === "abrir") setTimeout(() => this.emit({ t: "pronto" }), 120);
    else if (m.t === "audio") this.ouvir(m.d);
    else if (m.t === "texto") {
      log.textos.push(m.texto);
      this.responder(/encerr/i.test(m.texto) ? DESPEDIDA : /abrir a conversa/i.test(m.texto) ? "[Exemplo] Oi! Bora estudar o quê hoje?" : RESPOSTA);
    } else if (m.t === "mudo") log.mudo = Boolean(m.v);
    else if (m.t === "interromper") this.pararTutor();
    else if (m.t === "fim") this.close(1000);
  }
  ouvir(b64) {
    log.quadros++;
    const voz = pcmRms(b64) > 0.02;
    const agora = Date.now();
    if (voz) {
      log.quadrosComVoz++;
      this.ultimaVoz = agora;
      if (!this.alunoFalando) {
        this.alunoFalando = true;
        log.falasAluno++;
      }
      // como o Gemini Live: voz do aluno enquanto o professor gera ou fala = interrupção (o professor para na hora)
      if (this.tutorFalando) {
        this.pararTutor();
        log.interrupcoes++;
        this.emit({ t: "interrompido" });
      }
    } else if (this.alunoFalando && agora - this.ultimaVoz > 600) {
      this.alunoFalando = false;
      this.emit({ t: "transcricao", quem: "aluno", texto: "[Exemplo] Me explica pré-eclâmpsia.", fim: true });
      setTimeout(() => this.responder(RESPOSTA), 300);
    }
  }
  responder(texto) {
    this.pararTutor();
    this.tutorFalando = true;
    const palavras = texto.split(" ");
    let i = 0;
    this.timer = setInterval(() => {
      if (i >= 26) {
        this.pararTutor();
        this.emit({ t: "geracao_completa" });
        this.emit({ t: "transcricao", quem: "professor", texto: "", fim: true });
        this.emit({ t: "turno_completo" });
        return;
      }
      this.emit({ t: "audio", d: tomPcm(100, i * 2400) });
      const pedaco = palavras.slice(Math.floor((i * palavras.length) / 26), Math.floor(((i + 1) * palavras.length) / 26)).join(" ");
      if (pedaco) this.emit({ t: "transcricao", quem: "professor", texto: `${pedaco} `, fim: false });
      i++;
    }, 100);
  }
  pararTutor() {
    clearInterval(this.timer);
    this.tutorFalando = false;
  }
  close(code = 1000) {
    if (this.readyState === 3) return;
    this.pararTutor();
    this.readyState = 3;
    this.onclose?.({ code, reason: "fim" });
  }
}
const RealWS = window.WebSocket;
function WebSocketDaPrevia(url, protocols) {
  if (String(url).startsWith("wss://ponte-falsa")) return new PonteFalsa(url);
  return new RealWS(url, protocols);
}
Object.assign(WebSocketDaPrevia, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
window.WebSocket = WebSocketDaPrevia;

// ------------------------------------------------------------------ microfone falso: ruído de fundo fraco e "fala" sob comando
const mic = { ctx: null, gain: null };
window.__falar = (ms = 1500) => {
  if (!mic.gain) return false;
  const t = mic.ctx.currentTime;
  mic.gain.gain.setTargetAtTime(0.35, t, 0.01);
  setTimeout(() => mic.gain && mic.gain.gain.setTargetAtTime(0, mic.ctx.currentTime, 0.02), ms);
  return true;
};
const md = {
  async getUserMedia(c) {
    log.microfone.push(JSON.parse(JSON.stringify(c ?? {})));
    if (cenario === "mic-negado") throw new DOMException("Permissão negada", "NotAllowedError");
    if (!mic.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      mic.ctx = new AC();
      const dest = mic.ctx.createMediaStreamDestination();
      const voz = mic.ctx.createOscillator();
      voz.type = "sawtooth";
      voz.frequency.value = 160;
      const lfo = mic.ctx.createOscillator();
      lfo.frequency.value = 5;
      const lfoG = mic.ctx.createGain();
      lfoG.gain.value = 40;
      lfo.connect(lfoG).connect(voz.frequency);
      mic.gain = mic.ctx.createGain();
      mic.gain.gain.value = 0;
      voz.connect(mic.gain).connect(dest);
      if (cenario !== "medidor-mudo") {
        const fundo = mic.ctx.createOscillator();
        fundo.frequency.value = 60;
        const fg = mic.ctx.createGain();
        fg.gain.value = 0.004;
        fundo.connect(fg).connect(dest);
        fundo.start();
      }
      voz.start();
      lfo.start();
      mic.dest = dest;
    }
    mic.ctx.resume?.();
    return mic.dest.stream.clone ? mic.dest.stream.clone() : mic.dest.stream;
  },
  enumerateDevices: async () => [{ kind: "audioinput", deviceId: "falso", label: "Microfone falso" }],
  addEventListener() {},
  removeEventListener() {},
};
try {
  Object.defineProperty(navigator, "mediaDevices", { value: md, configurable: true });
} catch {
  navigator.mediaDevices.getUserMedia = md.getUserMedia;
}

// "medidor-mudo": o medidor do navegador devolve só silêncio (como o Safari às vezes faz), mas o áudio de verdade passa
if (cenario.includes("medidor-mudo") && typeof AnalyserNode !== "undefined") {
  const orig = { f: AnalyserNode.prototype.getFloatTimeDomainData, b: AnalyserNode.prototype.getByteTimeDomainData };
  AnalyserNode.prototype.getFloatTimeDomainData = function (a) {
    a.fill(0);
  };
  AnalyserNode.prototype.getByteTimeDomainData = function (a) {
    a.fill(128);
  };
  window.__consertarMedidor = () => {
    AnalyserNode.prototype.getFloatTimeDomainData = orig.f;
    AnalyserNode.prototype.getByteTimeDomainData = orig.b;
  };
}
