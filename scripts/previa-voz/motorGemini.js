// Motor "Gemini Live pelo Vertex" da prévia: microfone → nosso servidor (ponte) → Gemini Live; voz da professora volta como PCM.
// O navegador só recebe um token temporário do nosso servidor (vale 30 s, uma vez). Nenhuma credencial do Google aqui.
const LIMIAR_FALA = 0.02; // energia (RMS) acima disto = fala
const MS_INICIO = 120; // fala sustentada para contar como início
const MS_FIM = 600; // silêncio para contar como fim da fala

export function criarMotorGemini({ emitir, metrica }) {
  let ws = null, ctxMic = null, ctxSom = null, stream = null, no = null, ganho = null;
  let mudo = false, descartarAte = false, fimTurno = false;
  const fontes = new Set();
  let proximoT = 0;
  let falando = false, acimaDesde = 0, abaixoDesde = 0;
  let tFimFala = null, tFalaDuranteTutor = null, esperandoPrimeiroAudio = false;
  let tutorFalando = false;

  function pararSom() {
    for (const f of fontes) { try { f.stop(); } catch { /* já parou */ } }
    fontes.clear();
    proximoT = ctxSom ? ctxSom.currentTime : 0;
  }

  function verSeTerminou() {
    if (fimTurno && fontes.size === 0 && tutorFalando) { tutorFalando = false; fimTurno = false; emitir({ tipo: "tutor_terminou" }); }
  }

  function tocar(buf) {
    if (descartarAte) return;
    const pcm = new Int16Array(buf);
    const ab = ctxSom.createBuffer(1, pcm.length, 24000);
    const ch = ab.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = ctxSom.createBufferSource();
    src.buffer = ab;
    src.connect(ganho);
    const t = Math.max(ctxSom.currentTime + 0.02, proximoT);
    src.start(t);
    proximoT = t + ab.duration;
    fontes.add(src);
    src.onended = () => { fontes.delete(src); verSeTerminou(); };
    if (!tutorFalando) { tutorFalando = true; emitir({ tipo: "audio_tutor" }); }
    if (esperandoPrimeiroAudio && tFimFala != null) {
      metrica({ tipo: "primeiro_audio", ms: Math.round(performance.now() - tFimFala) });
      esperandoPrimeiroAudio = false;
    }
  }

  function vad(rms) {
    const agora = performance.now();
    if (rms > LIMIAR_FALA) {
      abaixoDesde = 0;
      if (!acimaDesde) acimaDesde = agora;
      if (!falando && agora - acimaDesde >= MS_INICIO) {
        falando = true;
        if (tutorFalando) tFalaDuranteTutor = agora - MS_INICIO; // só métrica (o eco pode enganar; quem decide é o servidor)
        else emitir({ tipo: "fala_aluno_inicio" });
      }
    } else {
      acimaDesde = 0;
      if (!abaixoDesde) abaixoDesde = agora;
      if (falando && agora - abaixoDesde >= MS_FIM) {
        falando = false;
        if (!tutorFalando) { tFimFala = abaixoDesde; esperandoPrimeiroAudio = true; emitir({ tipo: "fala_aluno_fim" }); }
      }
    }
  }

  async function iniciar({ voz, nivel, vad: cfgVad }) {
    descartarAte = false;
    const r = await fetch("/api/voz/sessao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voz, nivel, vad: cfgVad }) });
    if (!r.ok) throw new Error(`o servidor de teste recusou a sessão (${r.status})`);
    const { ws: caminho } = await r.json();
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    ctxMic = new AudioContext();
    await ctxMic.audioWorklet.addModule(new URL("./captura-worklet.js", import.meta.url));
    const fonte = ctxMic.createMediaStreamSource(stream);
    no = new AudioWorkletNode(ctxMic, "captura-16k");
    fonte.connect(no);
    ctxSom = new AudioContext({ sampleRate: 24000 });
    ganho = ctxSom.createGain();
    ganho.connect(ctxSom.destination);
    proximoT = ctxSom.currentTime;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}${caminho}`);
    ws.binaryType = "arraybuffer";
    no.port.onmessage = (e) => {
      vad(e.data.rms);
      if (!mudo && ws?.readyState === 1) ws.send(e.data.pcm);
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== "string") return tocar(e.data);
      const m = JSON.parse(e.data);
      if (m.tipo === "pronto") emitir({ tipo: "pronto", info: m });
      else if (m.tipo === "transcricao") { emitir({ tipo: "transcricao", quem: m.quem, texto: m.texto }); if (m.quem === "aluno" && !tutorFalando) emitir({ tipo: "fala_aluno_inicio" }); }
      else if (m.tipo === "interrompido") {
        pararSom();
        if (tFalaDuranteTutor != null) { metrica({ tipo: "interrupcao", ms: Math.round(performance.now() - tFalaDuranteTutor) }); tFalaDuranteTutor = null; }
        tutorFalando = false; fimTurno = false; descartarAte = false;
        emitir({ tipo: "interrompido" });
      } else if (m.tipo === "turno_completo") { fimTurno = true; descartarAte = false; verSeTerminou(); }
      else if (m.tipo === "uso") metrica({ tipo: "uso", ...m });
      else if (m.tipo === "ferramenta") emitir({ tipo: "log", texto: `ferramenta ${m.nome}${m.letra ? ` (${m.letra})` : ""}` });
      else if (m.tipo === "reconectando") emitir({ tipo: "reconectando" });
      else if (m.tipo === "aviso_fim") emitir({ tipo: "log", texto: `o Google avisou fim da conexão em ${m.segundos ?? "?"} s` });
      else if (m.tipo === "erro") emitir({ tipo: "erro", mensagem: m.mensagem });
      else if (m.tipo === "encerrado") emitir({ tipo: "encerrado", motivo: m.motivo });
    };
    ws.onclose = () => { emitir({ tipo: "encerrado" }); limpar(); };
    ws.onerror = () => emitir({ tipo: "erro", mensagem: "a conexão com o servidor de teste caiu" });
  }

  function limpar() {
    pararSom();
    try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* nada */ }
    try { ctxMic?.close(); } catch { /* nada */ }
    try { ctxSom?.close(); } catch { /* nada */ }
    stream = ctxMic = ctxSom = no = null;
  }

  return {
    iniciar,
    interromper() {
      // corta o som na hora e pede ao servidor para cortar a geração; descarta o resto deste turno
      pararSom();
      descartarAte = true;
      tutorFalando = false;
      if (ws?.readyState === 1) ws.send(JSON.stringify({ tipo: "interromper" }));
      emitir({ tipo: "interrompido" });
    },
    silenciar(v) { mudo = v; if (ws?.readyState === 1) ws.send(JSON.stringify({ tipo: "mudo", valor: v })); emitir({ tipo: "mudo", valor: v }); },
    volume(v) { if (ganho) ganho.gain.value = v; },
    encerrar() { if (ws?.readyState === 1) ws.send(JSON.stringify({ tipo: "fim" })); try { ws?.close(); } catch { /* nada */ } limpar(); },
  };
}
