// Prévia sem login e sem banco. Modos (pela URL):
//  (nada)                               → painel: escolher personagem, motor, estado, emoção, intensidade, áudio simulado, movimento reduzido
//  ?captura=demo&personagem=stazia&motor=2d     → roteiro de 19,5 s em 9:16, tempo controlado por window.__setTime(ms)
//  ?captura=fixa&personagem=stazi&motor=3d&estado=speaking&emocao=angry&intensidade=0.9  → uma cena fixa (capturas por estado)
//  ?captura=lado&personagem=stazia&estado=...&emocao=...  → 2D e 3D lado a lado, mesma cena e mesmo tempo
import React from "react";
import { createRoot } from "react-dom/client";
import { PersonagemTutor } from "../../src/novo/app/tutor/personagens/PersonagemTutor.jsx";
import { PERSONAGENS } from "../../src/novo/app/tutor/personagens/personagens.js";
import { EscolhaPersonagem } from "../../src/novo/app/tutor/personagens/EscolhaPersonagem.jsx";
import { roteiro, cenaFixa, DURACAO_MS, vozSimulada } from "./roteiro.js";
import "../../src/novo/app/tutor/voice/voiceMode.css";
import "../../src/novo/app/tutor/nexus/nexus.css";
import { StaziaVoiceMode } from "../../src/novo/app/tutor/voice/StaziaVoiceMode.jsx";
import { NexusLobby } from "../../src/novo/app/tutor/nexus/NexusLobby.jsx";

const q = new URLSearchParams(location.search);
const FUNDO = "radial-gradient(90% 60% at 50% 38%, rgba(70, 90, 220, 0.28) 0%, transparent 60%), radial-gradient(120% 80% at 50% 30%, #16205a 0%, #0b1033 55%, #05071a 100%)";
const ESTADOS = ["idle", "ready", "listening", "thinking", "speaking", "interrupted", "paused", "reconnecting", "ended", "error"];
const ESTADO_PT = { idle: "parado", ready: "pronto", listening: "ouvindo", thinking: "pensando", speaking: "falando", interrupted: "interrompido", paused: "pausado", reconnecting: "reconectando", ended: "encerrado", error: "erro" };
const EMOCOES = ["neutral", "happy", "proud", "impressed", "curious", "skeptical", "firm", "annoyed", "angry", "relieved"];
const EMOCAO_PT = { neutral: "neutra", happy: "contente", proud: "orgulho", impressed: "impressionada", curious: "curiosa", skeptical: "cética", firm: "firme", annoyed: "irritada", angry: "com raiva", relieved: "aliviada" };
const genero = (txt, id) => txt.replace(/@/g, PERSONAGENS[id]?.genero ?? "o");

function useTempoControlado() {
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    window.__setTime = (ms) => new Promise((ok) => { setT(ms); requestAnimationFrame(() => requestAnimationFrame(ok)); });
    window.__pronto = true;
  }, []);
  return t;
}

// Telas de verdade do app com dados de mentira (sem servidor): a conversa por voz e a entrada do Nexus.
const PROFS = [
  { id: "acolhedor", name: "Tranquilo", emoji: "😌", tagline: "Descontraído, faz você pensar antes de explicar." },
  { id: "durona", name: "Durona", emoji: "🔥", tagline: "Firme e exigente, cobra raciocínio." },
  { id: "direto", name: "Direto", emoji: "🎯", tagline: "Fala solto e sem rodeios." },
];
const ENT = { enabled: true, mode: "paid", is_paid: true, can_use: true, can_text: true, can_voice: true, text: { used: 2, limit: 40, remaining: 38 }, voice: { enabled: true, remaining_s: 2700 }, questions: { limit: null, used: 0 }, trial: { state: "none", days: 7 } };
const FALAS = { neutral: "Vamos lá: me diz o que você já sabe sobre pré-eclâmpsia.", happy: "Isso! Hipertensão depois de vinte semanas, com lesão de órgão.", angry: "De novo? Sulfato de magnésio é para prevenir convulsão, não para baixar pressão!", firm: "Foco. Qual é o critério de gravidade?", relieved: "Agora sim. Acertou." };
function TelaVoz() {
  const t = useTempoControlado();
  const id = q.get("personagem") || "stazia";
  const cena = cenaFixa(q.get("estado") || "speaking", q.get("emocao") || "neutral", Number(q.get("intensidade") || 0.7))(t);
  const rt = { state: cena.estado, muted: false, streams: { input: null, output: null }, captions: { tutor: cena.estado === "speaking" ? FALAS[cena.emocao] ?? FALAS.neutral : "", student: cena.estado === "listening" ? "Me explica pré-eclâmpsia" : "" }, provider: "live", setVolume() {}, start() {}, sendText() {}, toggleMute() {}, interrupt() {} };
  return <StaziaVoiceMode rt={rt} persona={PROFS[1]} avatar={{ emotion: cena.emocao, intensity: cena.intensidade }} personagem={id} motor={q.get("motor") || "2d"} entitlement={{ mode: "paid", voice: { remaining_s: 2700 } }} jeitoLabel="Voz do professor" onClose={() => {}} />;
}
function TelaEntrada() {
  useTempoControlado();
  return (
    <div className="nx"><NexusLobby status={{ personalities: PROFS, preferences: { personality_id: "durona" }, daily_limit: 40, used_today: 2, entitlement: ENT }} nexus={{ voice_enabled: true, minutes_today: 45, professors: [{ id: "durona", eleven: true, sample: true }] }} onStart={() => {}} onHistory={() => {}} onListen={() => {}} /></div>
  );
}

// Reação: de "estado:emocao" para "estado:emocao" aos 300 ms (?captura=reacao&de=speaking:neutral&para=speaking:angry&int=0.9)
function Reacao() {
  const t = useTempoControlado();
  const id = q.get("personagem") || "stazia";
  const [e0, m0] = (q.get("de") || "speaking:neutral").split(":");
  const [e1, m1] = (q.get("para") || "speaking:happy").split(":");
  const TROCA = 300;
  const depois = t >= TROCA;
  const estado = depois ? e1 : e0;
  const emocao = depois ? m1 : m0;
  const desde = depois
    ? { estado: e0 === e1 ? -1e9 : TROCA, emocao: m0 === m1 ? -1e9 : TROCA, estadoAnterior: e0, emocaoAnterior: m0 }
    : { estado: -1e9, emocao: -1e9 };
  const f = cenaFixa(estado, emocao, Number(q.get("int") || 0.8))(t);
  return (
    <div style={{ width: "100vw", height: "100vh", background: FUNDO, position: "relative" }}>
      <PersonagemTutor personagem={id} motor={q.get("motor") || "2d"} conversationState={estado} emotion={emocao} emotionIntensity={f.intensidade} time={t} niveis={f.niveis} desde={desde} decorativo />
    </div>
  );
}

function Captura() {
  const t = useTempoControlado();
  const id = q.get("personagem") || "stazia";
  const motor = q.get("motor") || "2d";
  const modo = q.get("captura");
  const cena = modo === "demo" ? roteiro(t) : cenaFixa(q.get("estado") || "speaking", q.get("emocao") || "neutral", Number(q.get("intensidade") || 0.6))(t);
  const props = { personagem: id, conversationState: cena.estado, emotion: cena.emocao, emotionIntensity: cena.intensidade, time: t, niveis: cena.niveis, desde: cena.desde };
  if (modo === "lado") {
    return (
      <div style={{ width: "100vw", height: "100vh", background: FUNDO, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr auto" }}>
        <div style={{ position: "relative" }}><PersonagemTutor {...props} motor="2d" /></div>
        <div style={{ position: "relative" }}><PersonagemTutor {...props} motor="3d" /></div>
        <div style={{ textAlign: "center", padding: 8, fontSize: 14, opacity: 0.8 }}>A · 2D (sprites)</div>
        <div style={{ textAlign: "center", padding: 8, fontSize: 14, opacity: 0.8 }}>B · Three.js (2.5D)</div>
      </div>
    );
  }
  return (
    <div style={{ width: "100vw", height: "100vh", background: FUNDO, display: "flex", flexDirection: "column", alignItems: "center", boxSizing: "border-box", padding: "5vh 4vw 4vh" }}>
      <div style={{ fontSize: "3.2vh", fontWeight: 800, letterSpacing: "-0.02em" }}>{PERSONAGENS[id].nome} · Tutor por voz</div>
      <div style={{ fontSize: "1.8vh", opacity: 0.7, marginTop: 4 }}>{motor === "3d" ? "Caminho B · Three.js 2.5D" : "Caminho A · 2D por sprites"}</div>
      <div style={{ flex: 1, width: "100%", position: "relative", minHeight: 0 }}><PersonagemTutor {...props} motor={motor} /></div>
      {modo === "demo" && (
        <div style={{ minHeight: "7vh", fontSize: "2.4vh", fontWeight: 650, textAlign: "center", padding: "1vh 2vw", borderRadius: 16, background: "rgba(255,255,255,0.08)" }}>{genero(cena.legenda, id)}</div>
      )}
      {modo === "demo" && (
        <div style={{ width: "70%", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.12)", marginTop: "2vh", overflow: "hidden" }}>
          <div style={{ width: `${(t / DURACAO_MS) * 100}%`, height: "100%", background: "#3DA5FF" }} />
        </div>
      )}
    </div>
  );
}

const botao = (on) => ({ padding: "8px 12px", minHeight: 40, borderRadius: 999, border: "1px solid #33415f", background: on ? "#2f56a6" : "transparent", color: "inherit", cursor: "pointer", font: "inherit", fontSize: 14 });

function Painel() {
  const [id, setId] = React.useState(q.get("personagem") || "stazia");
  const [motor, setMotor] = React.useState(q.get("motor") || "2d");
  const [estado, setEstado] = React.useState(q.get("estado") || "speaking");
  const [emocao, setEmocao] = React.useState(q.get("emocao") || "neutral");
  const [intensidade, setIntensidade] = React.useState(Number(q.get("intensidade") || 0.6));
  const [demo, setDemo] = React.useState(false);
  const [som, setSom] = React.useState(true);
  const [reduzido, setReduzido] = React.useState(false);
  const inicio = React.useRef(performance.now());
  const [, force] = React.useState(0);
  React.useEffect(() => {
    if (!demo) return undefined;
    inicio.current = performance.now();
    let raf;
    const loop = () => { force((x) => x + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [demo]);
  const tDemo = demo ? (performance.now() - inicio.current) % DURACAO_MS : 0;
  const cena = demo ? roteiro(tDemo) : null;
  const niveis = React.useCallback((ms) => (som ? { input: estado === "listening" || estado === "interrupted" ? vozSimulada(ms + 1100) * 0.85 : 0, output: estado === "speaking" ? vozSimulada(ms + 300) : 0 } : { input: 0, output: 0 }), [som, estado]);
  const props = demo
    ? { conversationState: cena.estado, emotion: cena.emocao, emotionIntensity: cena.intensidade, niveis: cena.niveis }
    : { conversationState: estado, emotion: emocao, emotionIntensity: intensidade, niveis };
  return (
    <div style={{ minHeight: "100dvh", background: FUNDO, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "16px 16px 32px", boxSizing: "border-box" }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Personagens do Tutor · prévia</h1>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.7, textAlign: "center", maxWidth: 560 }}>Sem login, sem banco e sem som: o nível da voz e do microfone é simulado. Escolha o personagem, o caminho (2D ou Three.js), o estado e a emoção.</p>
      <EscolhaPersonagem valor={id} onEscolher={setId} />
      <div style={{ display: "flex", gap: 8 }}>
        <button style={botao(motor === "2d")} aria-pressed={motor === "2d"} onClick={() => setMotor("2d")}>A · 2D (sprites)</button>
        <button style={botao(motor === "3d")} aria-pressed={motor === "3d"} onClick={() => setMotor("3d")}>B · Three.js 2.5D</button>
      </div>
      <div className="svm__stage" style={{ width: "min(560px, 100%)", flex: "none" }}>
        <PersonagemTutor key={`${id}-${motor}-${reduzido}`} personagem={id} motor={motor} reduzido={reduzido || undefined} {...props} />
      </div>
      <div role="status" style={{ fontSize: 16, fontWeight: 600 }}>{demo ? genero(cena.legenda, id) : `${ESTADO_PT[estado]} · ${EMOCAO_PT[emocao]} · intensidade ${Math.round(intensidade * 100)}%`}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 720 }}>
        <button style={botao(demo)} aria-pressed={demo} onClick={() => setDemo((d) => !d)}>{demo ? "Parar demonstração" : "Rodar demonstração (19,5 s)"}</button>
        <button style={botao(som)} aria-pressed={som} onClick={() => setSom((s) => !s)}>Áudio simulado</button>
        <button style={botao(reduzido)} aria-pressed={reduzido} onClick={() => setReduzido((r) => !r)}>Movimento reduzido</button>
      </div>
      <fieldset disabled={demo} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10, alignItems: "center", maxWidth: 760 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }} role="group" aria-label="Estado">
          {ESTADOS.map((e) => <button key={e} style={botao(e === estado)} aria-pressed={e === estado} onClick={() => setEstado(e)}>{ESTADO_PT[e]}</button>)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }} role="group" aria-label="Emoção">
          {EMOCOES.map((e) => <button key={e} style={botao(e === emocao)} aria-pressed={e === emocao} onClick={() => setEmocao(e)}>{EMOCAO_PT[e]}</button>)}
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>Intensidade
          <input type="range" min="0" max="1" step="0.05" value={intensidade} onChange={(e) => setIntensidade(Number(e.target.value))} />
        </label>
      </fieldset>
    </div>
  );
}

const modo = q.get("captura");
createRoot(document.getElementById("root")).render(modo === "tela" ? <TelaVoz /> : modo === "entrada" ? <TelaEntrada /> : modo === "reacao" ? <Reacao /> : modo ? <Captura /> : <Painel />);
