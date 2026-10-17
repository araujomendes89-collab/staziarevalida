// Voz ao vivo dentro do mini tutor: a mesma ligação do Tutor (useRealtimeVoice: Gemini pela ponte, reserva da OpenAI), na mesma
// conversa do texto. Gasta os minutos de voz do dia (o servidor confere e reserva o tempo). Só existe enquanto o aluno está na voz.
import React from "react";
import { Icon } from "../../../ds";
import { useRealtimeVoice, realtimeErrorMessage } from "../useRealtimeVoice.js";
import { definirSemitonsDaVoz } from "../voice/pitchShift.js";
import { orbEmotion } from "../voice/StaziaVoiceOrb.jsx";
import { PERSONAGENS } from "../personagens/personagens.js";
import { PersonagemTutor } from "../personagens/PersonagemTutor.jsx";
import { TEXTOS } from "./config.js";

const ESTADO = {
  idle: "Preparando a voz…", connecting: "Conectando…", ready: "Pode falar", listening: "Ouvindo você", thinking: "Pensando…",
  speaking: "Falando", interrupted: "Ouvindo você", paused: "Pausado", reconnecting: "Reconectando…", ended: "Voz encerrada", error: "A voz parou",
};
const minutos = (s) => Math.max(0, Math.floor((s ?? 0) / 60));

/**
 * <MiniVoz backend sessionId personagem servidor={{live, hint}} minutosHoje onTranscricao onEstado onSair reduzido />
 * onEstado(estado, streams, avatar): o mini tutor anima o personagem da cabeça junto.
 */
export function MiniVoz({ backend, sessionId, personagem, servidor, minutosHoje = null, onTranscricao, onSair, reduzido = false }) {
  const [avatar, setAvatar] = React.useState(null);
  const [aviso, setAviso] = React.useState(null);
  const live = useRealtimeVoice({
    backend, sessionId, live: Boolean(servidor?.live), hint: servidor?.hint ?? null,
    onTranscript: (role, texto) => onTranscricao?.(role === "student" || role === "user" ? "aluno" : "tutor", texto), onWarning: setAviso, onAvatar: setAvatar,
  });
  const liveRef = React.useRef(live);
  liveRef.current = live;

  React.useEffect(() => {
    // a voz do personagem: Stazi afinado (+3), Stazia como está (manifest)
    definirSemitonsDaVoz(PERSONAGENS[personagem]?.voz?.semitons ?? 0);
    void liveRef.current.start();
    return () => void Promise.resolve(liveRef.current.stop?.()).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sair = async () => {
    await Promise.resolve(live.stop?.()).catch(() => {});
    onSair?.();
  };
  const emo = orbEmotion(avatar);
  const acabou = live.error?.kind === "quota" || live.error?.status === 429;
  const restam = live.remaining != null ? minutos(live.remaining) : minutosHoje;
  const erro = live.error ? (acabou ? TEXTOS.vozAcabou : realtimeErrorMessage(live.error)) : null;

  return (
    <div className="mt-voz" aria-label="Conversa por voz">
      <div className="mt-voz__palco">
        <PersonagemTutor
          personagem={personagem} conversationState={live.state} emotion={emo.emotion} emotionIntensity={emo.intensity}
          inputStream={live.streams?.input ?? null} outputStream={live.streams?.output ?? null} reduzido={reduzido}
        />
      </div>
      <p className="mt-voz__estado" role="status" aria-live="polite">{ESTADO[live.state] ?? live.state}</p>
      {live.captions?.tutor ? <p className="mt-voz__legenda">{live.captions.tutor}</p> : null}
      {erro && <p className="mt-aviso mt-aviso--erro" role="alert">{erro}</p>}
      {!erro && aviso && <p className="mt-aviso">{aviso}</p>}
      <div className="mt-voz__acoes">
        {restam != null && <span className="mt-voz__min">{restam} min de voz hoje</span>}
        <button type="button" className="mt-icone" onClick={() => live.toggleMute?.()} aria-pressed={live.muted ? "true" : "false"} aria-label={live.muted ? "Ligar o microfone" : "Silenciar o microfone"} disabled={!live.active}>
          <Icon name={live.muted ? "mic-off" : "mic"} size={18} />
        </button>
        <button type="button" className="mt-botao mt-botao--perigo" onClick={sair}>
          <Icon name="phone-off" size={16} />
          Voltar a escrever
        </button>
      </div>
    </div>
  );
}
