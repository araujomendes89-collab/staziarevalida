import React from "react";
import { createRoot } from "react-dom/client";
import { SessionProvider, useSession } from "../novo/app/session.jsx";
import { AuthFlow } from "../novo/app/AuthScreens.jsx";
import { TutorScreen } from "../novo/app/tutor/TutorScreen.jsx";
import { unlockAudio } from "../novo/app/tutor/voice/audioUnlock.js";
import { OfficialVoicesPanel } from "../novo/app/admin/OfficialVoicesPanel.jsx";
import "../novo/ds/styles.css";
import "./nexus-lab.css";

function NexusLab() {
  const session = useSession();
  const [soundMessage, setSoundMessage] = React.useState("");
  const [serverReady, setServerReady] = React.useState(false);
  const [serverError, setServerError] = React.useState("");

  React.useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    const controller = new AbortController();
    fetch("/api/nexus-lab/health", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("Servidor de teste indisponível.");
        const data = await r.json();
        if (data.mode !== "connected") throw new Error("Inicie o laboratório com npm run dev:nexus.");
        setServerReady(true);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setServerError("Inicie o laboratório com npm run dev:nexus para conectar a voz do sistema.");
      });
    return () => controller.abort();
  }, []);

  const testSpeaker = async () => {
    const ctx = unlockAudio();
    try {
      if (!ctx) throw new Error("Este navegador não oferece saída de áudio.");
      await ctx.resume();
      if (ctx.state !== "running") throw new Error("O navegador bloqueou o som. Permita áudio para esta página.");
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.03);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.45);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.5);
      setSoundMessage("Sinal enviado. Se não ouviu, confira o volume e a saída de som do computador.");
    } catch (e) {
      setSoundMessage(e.message);
    }
  };

  const go = (route) => window.location.assign(`https://staziamed-revalida.vercel.app/novo/${route}`);

  return (
    <main className="nexus-test">
      <header className="nexus-test__header">
        <div>
          <span className="nexus-test__label">STAZIAMED · TESTE LOCAL CONECTADO</span>
          <h1>Nexus</h1>
          <p>A mesma conversa por voz do sistema, com a esfera atual.</p>
        </div>
        <div className="nexus-test__actions">
          <button type="button" onClick={testSpeaker}>Testar saída de som</button>
          {session.status === "ready" && <button type="button" onClick={() => session.signOut()}>Sair da conta</button>}
        </div>
      </header>
      {soundMessage && <p className="nexus-test__notice" role="status">{soundMessage}</p>}
      <p className="nexus-test__notice">
        Entre com sua conta StaziaMed e escolha “Conversar com o Tutor”. Este teste usa os provedores, o histórico e a cota da sua conta.
      </p>
      {serverReady && session.status === "ready" && session.boot?.role === "admin" && <OfficialVoicesPanel endpoint="/api/nexus-lab/voices" />}
      <p className="nexus-test__notice">A audição ElevenLabs é separada e exclusiva para administradores. A conversa abaixo ainda usa a voz atual de produção; não é um teste integrado da ElevenLabs com o microfone.</p>
      {serverError ? <p role="alert" className="nexus-test__notice">{serverError}</p>
        : !serverReady || session.status === "loading" ? <p role="status">Conectando ao sistema…</p>
        : session.status === "error" ? <p role="alert">{session.error?.message || "Não foi possível carregar a conta."}</p>
        : session.status === "signed-out" ? <AuthFlow />
        : <TutorScreen go={go} />}
      <p className="nexus-test__footnote">As personalidades disponíveis são as já ativadas no sistema. O Questionador ainda depende da publicação da migração.</p>
    </main>
  );
}

createRoot(document.getElementById("nexus-lab-root")).render(<SessionProvider><NexusLab /></SessionProvider>);
