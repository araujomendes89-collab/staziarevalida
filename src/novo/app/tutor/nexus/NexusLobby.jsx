// Entrada do Nexus (prévia aprovada pelo dono em 2026-10-08): a esfera, "Escolha seu professor" com os três cartões, o modo
// ("Perguntar ao Tutor" já marcado), "Começar com …", a linha de voz do dia e o aviso da Política. Nada começa sem o toque.
// Com `request` (aberta por outra tela), o modo vem travado e só se escolhe o professor.
import React from "react";
import { StaziaVoiceOrb } from "../voice/StaziaVoiceOrb.jsx";
import { modeLabel } from "../labels.js";
import { TutorQuota } from "../TutorScreen.jsx";

/** Aviso antes do primeiro uso da voz (Política de 07/10, §3), sempre à vista na entrada. */
export const NEXUS_POLICY_NOTICE =
  "Interações com recursos de IA e voz podem ser processadas para responder, sintetizar áudio e adaptar a experiência. Fornecedores de IA recebem somente o necessário para executar a solicitação.";

/** Modos na ordem da entrada (ids do banco). */
export const NEXUS_MODES = ["livre", "questao", "erros", "perguntas"];

/** "a Durona", "o Tranquilo", "o Direto". */
export const withArticle = (p) => `${p?.id === "durona" ? "a" : "o"} ${p?.name ?? "professor"}`;

export function voiceLine(nexus, personalityId) {
  const prof = nexus?.professors?.find((p) => p.id === personalityId);
  if (nexus?.voice_enabled && prof?.eleven) return { text: `Voz hoje: ${nexus.minutes_today} min`, label: "Voz do professor" };
  if (nexus?.voice_enabled && nexus.reserve) return { text: `Voz reserva hoje: ${nexus.reserve_minutes} min`, label: "Voz reserva" };
  return { text: "Professor por escrito hoje", label: "Por escrito" };
}

export function NexusLobby({ status, nexus, request = null, busy = false, error = null, onStart, onHistory, onListen, onClose = null }) {
  const professors = status.personalities ?? [];
  const [choice, setChoice] = React.useState(() => (professors.some((p) => p.id === status.preferences?.personality_id) ? status.preferences.personality_id : professors[0]?.id));
  const [mode, setMode] = React.useState("livre");
  const chosen = professors.find((p) => p.id === choice);
  const line = voiceLine(nexus, choice);

  return (
    <div className="nx-lobby">
      <div className="nx-top">
        <div className="nx-top__title">
          <span className="nx-top__eyebrow">Seu professor particular para o Revalida</span>
          <span className="nx-top__name">Stazia Tutor</span>
        </div>
        <div className="nx-top__actions">
          <button type="button" className="nx-pill" onClick={onHistory}>Histórico</button>
          {onClose && <button type="button" className="nx-pill" onClick={onClose} aria-label="Fechar o Tutor">Fechar</button>}
        </div>
      </div>

      <div className="nx-lobby__body">
        <div className="nx-lobby__orb" aria-hidden="true">
          <StaziaVoiceOrb conversationState="idle" emotion="neutral" emotionIntensity={0.3} />
        </div>
        <div className="nx-lobby__head">
          <span className="nx-overline">Antes de começar</span>
          <h2 className="nx-lobby__title">Escolha seu professor</h2>
        </div>

        <div className="nx-cards">
          {professors.map((p) => {
            const on = p.id === choice;
            const sample = nexus?.professors?.find((x) => x.id === p.id)?.sample;
            return (
              <div key={p.id} className={`nx-card${on ? " nx-card--on" : ""}`}>
                <button type="button" className="nx-card__pick" aria-pressed={on} onClick={() => setChoice(p.id)}>
                  <span className="nx-card__emoji" aria-hidden="true">{p.emoji}</span>
                  <span className="nx-card__text">
                    <span className="nx-card__name">{p.name}</span>{" "}
                    <span className="nx-card__line">{p.tagline}</span>
                  </span>
                </button>
                {sample && (
                  <button type="button" className="nx-listen" aria-label={`Ouvir a voz ${p.id === "durona" ? "da" : "do"} ${p.name}`} onClick={() => onListen(p.id)}>
                    Ouvir
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {request ? (
          <p className="nx-locked"><span className="nx-overline">Modo</span> {modeLabel(request.mode)}{request.context?.label ?? request.topic ? ` · ${request.context?.label ?? request.topic}` : ""}</p>
        ) : (
          <div className="nx-modes" role="group" aria-label="Modo">
            <span className="nx-overline" aria-hidden="true">Modo</span>
            {NEXUS_MODES.map((id) => (
              <button key={id} type="button" className={`nx-chip${id === mode ? " nx-chip--on" : ""}`} aria-pressed={id === mode} onClick={() => setMode(id)}>
                {modeLabel(id)}
              </button>
            ))}
          </div>
        )}

        {error}

        <button type="button" className="nx-start" disabled={busy || !chosen} onClick={() => onStart(choice, request?.mode ?? mode)}>
          {busy ? "Abrindo…" : `Começar com ${withArticle(chosen)}`}
        </button>

        <div className="nx-lobby__foot">
          <p className="nx-voice-line">
            <span className="nx-voice-line__min">{line.text}</span>
            <span className="nx-voice-line__jeito">{line.label}</span>
          </p>
          <TutorQuota status={status} compact />
          <p className="nx-policy">{NEXUS_POLICY_NOTICE}</p>
        </div>
      </div>
    </div>
  );
}
