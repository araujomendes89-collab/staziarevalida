// Motor "ElevenLabs Agents" da prévia (SDK oficial @elevenlabs/react 1.18.0, WebRTC). Só funciona depois que o dono criar
// a chave e o agente: o servidor de teste pega o token de conversa e o navegador nunca vê a chave.
import { useEffect, useImperativeHandle, forwardRef } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { eventoEleven } from "./estados.js";

const Interno = forwardRef(function Interno({ emitir, metrica }, ref) {
  const conv = useConversation({
    onStatusChange: ({ status }) => { const e = eventoEleven("status", status); if (e) emitir(e); },
    onModeChange: ({ mode }) => { const e = eventoEleven("modo", mode); if (e) emitir(e); },
    onVadScore: ({ vadScore }) => { const e = eventoEleven("vad", vadScore); if (e) emitir(e); },
    onInterruption: () => emitir(eventoEleven("interrupcao")),
    onMessage: (m) => {
      if (m?.source === "user") { emitir({ tipo: "transcricao", quem: "aluno", texto: m.message }); emitir(eventoEleven("transcricao_aluno")); }
      else if (m?.message) emitir({ tipo: "transcricao", quem: "tutor", texto: m.message });
    },
    onError: (msg) => emitir(eventoEleven("erro", msg)),
    onDisconnect: () => emitir({ tipo: "encerrado" }),
    onConnect: ({ conversationId }) => emitir({ tipo: "log", texto: `ElevenLabs conectada (${conversationId})` }),
  });
  useImperativeHandle(ref, () => ({
    async iniciar() {
      const r = await fetch("/api/voz/eleven/token", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.falta ? `Falta: ${j.falta.join("; ")}` : j.erro || `erro ${r.status}`);
      await navigator.mediaDevices.getUserMedia({ audio: true });
      conv.startSession({ conversationToken: j.conversationToken, connectionType: "webrtc" });
    },
    interromper() { conv.sendUserActivity(); emitir({ tipo: "interrompido" }); },
    silenciar(v) { conv.setMuted(v); emitir({ tipo: "mudo", valor: v }); },
    volume(v) { conv.setVolume({ volume: v }); },
    encerrar() { conv.endSession(); },
  }), [conv, emitir]);
  useEffect(() => () => { try { conv.endSession(); } catch { /* nada */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  void metrica;
  return null;
});

const MotorEleven = forwardRef(function MotorEleven(props, ref) {
  return (
    <ConversationProvider>
      <Interno ref={ref} {...props} />
    </ConversationProvider>
  );
});
export default MotorEleven;
