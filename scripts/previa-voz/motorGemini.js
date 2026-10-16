// Motor da prévia: usa o MESMO cliente do app (src/novo/app/tutor/voice/geminiPonte.js) contra a MESMA ponte do Cloud Run
// (server/vozPonte), rodando aqui no Mac. O servidor de teste faz o papel do app: sela o bilhete e executa as ferramentas.
// Métricas da prévia: um medidor de energia do microfone (só para medir o fim da fala e mostrar "você está falando").
import { openGeminiPonte } from "../../src/novo/app/tutor/voice/geminiPonte.js";
import { getAudioContext, unlockAudio } from "../../src/novo/app/tutor/voice/audioUnlock.js";

const LIMIAR = 0.02; // energia (RMS) acima disto = fala
const MS_INICIO = 120;
const MS_FIM = 600;

export function criarMotorGemini({ emitir, metrica }) {
  let gem = null, stream = null, medidor = null, vc = null;
  let falando = false, acima = 0, abaixo = 0, tutorFalando = false;
  let tFimFala = null, esperando = false, tFalaPorCima = null;

  function medir() {
    const ctx = getAudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    const passo = () => {
      if (!medidor) return;
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += v * v;
      const rms = Math.sqrt(s / buf.length);
      const agora = performance.now();
      if (rms > LIMIAR) {
        abaixo = 0;
        if (!acima) acima = agora;
        if (!falando && agora - acima >= MS_INICIO) {
          falando = true;
          if (tutorFalando) tFalaPorCima = agora - MS_INICIO;
          else emitir({ tipo: "fala_aluno_inicio" });
        }
      } else {
        acima = 0;
        if (!abaixo) abaixo = agora;
        if (falando && agora - abaixo >= MS_FIM) {
          falando = false;
          if (!tutorFalando) { tFimFala = abaixo; esperando = true; emitir({ tipo: "fala_aluno_fim" }); }
        }
      }
      medidor = requestAnimationFrame(passo);
    };
    medidor = requestAnimationFrame(passo);
  }

  async function ferramentas(chamadas) {
    emitir({ tipo: "log", texto: `ferramentas: ${chamadas.map((c) => c.name).join(", ")}` });
    const respostas = [];
    for (const c of chamadas) {
      const r = await fetch("/api/voz/ferramenta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vc, name: c.name, args: c.args ?? {} }) });
      const j = await r.json().catch(() => ({ output: { erro: "falhou" } }));
      if (c.name === "submit_answer") emitir({ tipo: "log", texto: `resposta registrada: ${j.output?.registrada ?? "?"} (${j.output?.acertou ? "acertou" : "errou"})` });
      respostas.push({ id: c.id, name: c.name, response: { output: j.output } });
    }
    gem?.respondTools(respostas);
  }

  async function iniciar({ voz, nivel, gritos, palavroes, vad }) {
    unlockAudio(); // gesto do usuário (clique)
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const r = await fetch("/api/voz/sessao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voz, nivel, gritos, palavroes, vad }) });
    if (!r.ok) throw new Error(`o servidor de teste recusou a sessão (${r.status})`);
    const s = await r.json();
    vc = s.vc;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    gem = await openGeminiPonte({
      ponte: { url: `${proto}//${location.host}${s.ponte}`, bilhete: s.bilhete },
      stream,
      handlers: {
        onReady: () => {
          emitir({ tipo: "pronto" });
          // como o app: a professora abre a conversa
          gem?.sendText("O aluno acabou de abrir a conversa por voz. Abra do seu jeito, numa frase curta, e apresente a questão.");
        },
        onAudio: () => {
          if (!tutorFalando) { tutorFalando = true; emitir({ tipo: "audio_tutor" }); }
          if (esperando && tFimFala != null) { metrica({ tipo: "primeiro_audio", ms: Math.round(performance.now() - tFimFala) }); esperando = false; }
        },
        onIdle: () => { if (tutorFalando) { tutorFalando = false; emitir({ tipo: "tutor_terminou" }); } },
        onInterrupted: () => {
          if (tFalaPorCima != null) { metrica({ tipo: "interrupcao", ms: Math.round(performance.now() - tFalaPorCima) }); tFalaPorCima = null; }
          tutorFalando = false;
          emitir({ tipo: "interrompido" });
        },
        onTranscript: (quem, texto) => {
          emitir({ tipo: "transcricao", quem: quem === "student" ? "aluno" : "tutor", texto });
          if (quem === "student" && !tutorFalando) emitir({ tipo: "fala_aluno_inicio" });
        },
        onToolCalls: (calls) => void ferramentas(calls),
        onUsage: (u) => metrica({ tipo: "uso", ...u }),
        onReconnect: () => { emitir({ tipo: "reconectando" }); emitir({ tipo: "pronto" }); },
        onError: (e) => emitir({ tipo: "log", texto: `aviso: ${e?.message ?? e}` }),
        onClose: ({ reason }) => { emitir({ tipo: "encerrado", motivo: reason }); limpar(); },
      },
    });
    medir();
  }

  function limpar() {
    if (medidor) cancelAnimationFrame(medidor);
    medidor = null;
    try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* nada */ }
  }

  return {
    iniciar,
    interromper() { gem?.interrupt(); tutorFalando = false; emitir({ tipo: "interrompido" }); },
    silenciar(v) { gem?.mute(v); emitir({ tipo: "mudo", valor: v }); },
    volume(v) { gem?.setVolume(v); },
    encerrar() { gem?.close(); emitir({ tipo: "encerrado", motivo: "você encerrou" }); limpar(); },
  };
}
