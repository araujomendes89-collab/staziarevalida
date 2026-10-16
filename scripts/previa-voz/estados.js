// Máquina de estados da conversa por voz (Voice Tutor, Fase 2). Só muda com EVENTO REAL: mensagem do servidor/provedor,
// medida do microfone (energia), fim real da fila de áudio ou clique do aluno. Nenhum temporizador inventa estado.
export const ESTADOS = ["idle", "connecting", "listening", "user_speaking", "processing", "tutor_speaking", "interrupted", "reconnecting", "muted", "error", "ended"];

export const NOMES = {
  idle: "Parado",
  connecting: "Conectando",
  listening: "Ouvindo",
  user_speaking: "Você está falando",
  processing: "Pensando",
  tutor_speaking: "Professora falando",
  interrupted: "Interrompida",
  reconnecting: "Reconectando",
  muted: "Microfone desligado",
  error: "Erro",
  ended: "Encerrada",
};

export const inicial = { fase: "idle", mudo: false, erro: null };

const ATIVAS = new Set(["listening", "user_speaking", "processing", "tutor_speaking", "interrupted"]);

/** Próximo estado. `ev.tipo` é um dos eventos abaixo; eventos que não fazem sentido na fase atual são ignorados. */
export function proximo(s, ev) {
  const f = s.fase;
  switch (ev.tipo) {
    case "iniciar":
      return f === "idle" || f === "ended" || f === "error" ? { ...inicial, fase: "connecting" } : s;
    case "pronto": // servidor/provedor confirmou a sessão (também depois de reconectar)
      return f === "connecting" || f === "reconnecting" ? { ...s, fase: "listening" } : s;
    case "fala_aluno_inicio": // microfone acima do limiar ou transcrição do aluno chegando
      if (s.mudo) return s;
      return f === "listening" || f === "processing" || f === "interrupted" ? { ...s, fase: "user_speaking" } : s;
    case "fala_aluno_fim": // microfone voltou ao silêncio
      return f === "user_speaking" ? { ...s, fase: "processing" } : s;
    case "audio_tutor": // chegou áudio da professora
      return ATIVAS.has(f) ? { ...s, fase: "tutor_speaking" } : s;
    case "interrompido": // servidor avisou que a fala foi cortada, ou o aluno apertou "Interromper"
      return f === "tutor_speaking" || f === "processing" ? { ...s, fase: "interrupted" } : s;
    case "tutor_terminou": // fila de áudio realmente acabou de tocar depois do fim do turno
      return f === "tutor_speaking" ? { ...s, fase: "listening" } : s;
    case "reconectando":
      return ATIVAS.has(f) || f === "connecting" ? { ...s, fase: "reconnecting" } : s;
    case "mudo":
      return { ...s, mudo: Boolean(ev.valor) };
    case "erro":
      return f === "ended" ? s : { ...s, fase: "error", erro: ev.mensagem ?? "erro" };
    case "encerrado":
      return f === "error" ? s : { ...s, fase: "ended" };
    default:
      return s;
  }
}

/** Estado mostrado: "muted" quando o microfone está desligado e a professora não está falando. */
export function estadoVisivel(s) {
  if (s.mudo && (s.fase === "listening" || s.fase === "user_speaking" || s.fase === "processing")) return "muted";
  return s.fase;
}

/** Mapeia eventos da ElevenLabs (SDK React) para os eventos da máquina. */
export function eventoEleven(nome, dado) {
  if (nome === "status") return dado === "connecting" ? null : dado === "connected" ? { tipo: "pronto" } : dado === "disconnected" ? { tipo: "encerrado" } : null;
  if (nome === "modo") return dado === "speaking" ? { tipo: "audio_tutor" } : dado === "listening" ? { tipo: "tutor_terminou" } : null;
  if (nome === "vad") return dado >= 0.6 ? { tipo: "fala_aluno_inicio" } : null;
  if (nome === "interrupcao") return { tipo: "interrompido" };
  if (nome === "transcricao_aluno") return { tipo: "fala_aluno_fim" };
  if (nome === "erro") return { tipo: "erro", mensagem: String(dado ?? "erro") };
  return null;
}
