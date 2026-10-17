// Bancada da sincronia: ?voz=/@fs/caminho.wav&semitons=3&personagem=stazi&ate=12
// Toca a voz em pedaços de ~150 ms (como o Gemini Live manda), pelo AudioPlayer do app, com o personagem medindo o outputStream.
// A cada quadro grava: relógio, instante que está saindo no alto-falante (getOutputTimestamp), abertura/opacidade/escala da boca,
// transformação do corpo e pose. window.__resultado = { quadros, pedacos } no fim.
import React from "react";
import { createRoot } from "react-dom/client";
import { PersonagemTutor2D } from "../../src/novo/app/tutor/personagens/PersonagemTutor2D.jsx";
// ?versao=antes: a cópia do código de antes da correção, se existir na pasta antes/ (não vai para o repositório). Para recriar:
//   for f in movimento.js usePersonagemAnimacao.js PersonagemTutor2D.jsx; do git show 0b543e7c:src/novo/app/tutor/personagens/$f > scripts/sincronia-boca/antes/$f; done
//   e troque os imports relativos para ../../../src/novo/app/tutor/... (exceto ./movimento.js e ./usePersonagemAnimacao.js)
const mods = import.meta.glob("./antes/PersonagemTutor2D.jsx", { eager: true });
import { AudioPlayer } from "../../src/novo/app/tutor/voice/audioPlayer.js";
import { getAudioContext, unlockAudio } from "../../src/novo/app/tutor/voice/audioUnlock.js";

const q = new URLSearchParams(location.search);
const PEDACO = 3600; // amostras a 24 kHz (150 ms)
const Personagem = q.get("versao") === "antes" && mods["./antes/PersonagemTutor2D.jsx"] ? mods["./antes/PersonagemTutor2D.jsx"].PersonagemTutor2D : PersonagemTutor2D;

function toB64(int16) {
  const u8 = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function App() {
  const [stream, setStream] = React.useState(null);
  React.useEffect(() => {
    let vivo = true;
    (async () => {
      const ctx = unlockAudio() ?? getAudioContext();
      const buf = await (await fetch(q.get("voz"))).arrayBuffer();
      const dv = new DataView(buf);
      let off = 12;
      while (off < dv.byteLength && String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3)) !== "data") off += 8 + dv.getUint32(off + 4, true);
      const pcm = new Int16Array(buf.slice(off + 8, off + 8 + dv.getUint32(off + 4, true)));
      const ate = Math.min(pcm.length, Math.round(Number(q.get("ate") || 12) * 24000));
      const player = new AudioPlayer(ctx, 1, null, { semitons: Number(q.get("semitons") || 0) });
      const pedacos = [];
      const ag = player._agendar.bind(player);
      player._agendar = (data, rate, extra) => {
        const antes = player.next;
        ag(data, rate, extra);
        if (data.length) pedacos.push({ at: player.next - data.length / rate, rate, data: Array.from(data, (v) => Math.round(v * 32767)) });
        return antes;
      };
      window.__player = player;
      setStream(player.stream);
      const quadros = [];
      const t0 = performance.now();
      const loop = () => {
        if (!vivo) return;
        const el = document.querySelector(".tp");
        const boca = document.querySelector(".tp__pose--atual .tp__boca") ?? document.querySelector('.tp__pose--atual img.tp__extra[src*="boca"]');
        const olhos = document.querySelector('.tp__pose--atual img.tp__extra[src*="olhos"]');
        const corpo = document.querySelector(".tp__corpo");
        const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : { contextTime: ctx.currentTime, performanceTime: performance.now() };
        const pt = performance.now();
        quadros.push({
          pt, ctxT: ctx.currentTime, outCtx: ts.contextTime, outPt: ts.performanceTime, lat: ctx.outputLatency ?? null, base: ctx.baseLatency ?? null,
          pose: el?.dataset.pose, bocaOp: boca ? Number(boca.style.opacity || 0) : null, bocaTr: boca?.style.transform || "", corpo: corpo?.style.transform || "",
          bocaVal: el?.dataset.boca != null ? Number(el.dataset.boca) : null,
          olhosOp: olhos ? Number(olhos.style.opacity || 0) : 0,
          u: el ? Math.min(el.clientHeight / 820, el.clientWidth / 600) : null,
        });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      await new Promise((r) => setTimeout(r, 600)); // o personagem monta e o medidor liga
      // pedaços chegam um pouco mais rápido que a fala (como o Gemini), com pequena variação
      let i = 0;
      const inicio = performance.now();
      for (let k = 0; k < ate; k += PEDACO) {
        player.play(toB64(pcm.subarray(k, Math.min(ate, k + PEDACO))), 24000);
        i++;
        const alvo = inicio + i * 150 * 0.8 + (i % 3) * 15;
        await new Promise((r) => setTimeout(r, Math.max(0, alvo - performance.now())));
      }
      player.flush();
      const fim = (player.next - ctx.currentTime) * 1000 + 800;
      await new Promise((r) => setTimeout(r, fim));
      vivo = false;
      window.__resultado = { quadros, pedacos, t0, sampleRate: ctx.sampleRate };
    })().catch((e) => { window.__erro = String(e?.stack || e); });
    return () => { vivo = false; };
  }, []);
  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <Personagem personagem={q.get("personagem") || "stazi"} conversationState="speaking" emotion={q.get("emocao") || "neutral"} emotionIntensity={Number(q.get("intensidade") || 0.3)} outputStream={stream} decorativo />
    </div>
  );
}
createRoot(document.getElementById("raiz")).render(<App />);
